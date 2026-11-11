// Server-only: trial mode. Simulated lender decisions (through the normal booking rules), AI demo lender replies
// in the normal booking chat, and a private trial account for a real member.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { canAutoReply, cleanReply, UNAVAILABLE, historyLines, replyDecision, REPLY_FAILED, REPLY_STALE_MS, shareNote } from "./demo-chat";
import { fmtDateTime, money } from "./format";

type DB = SupabaseClient<Database>;
type Req = Database["public"]["Tables"]["requests"]["Row"];

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as DB;
}


export type SimAction = "accept" | "decline" | "pickup" | "return" | "meet";
export type SimResult = { ok: true; status: string; message: null } | { ok: false; status: "unavailable"; message: string };

/** Acts as the simulated owner of one demo booking. `sim_owner_act` runs the normal booking functions as that owner. */
export async function runSimAction(before: Req, presenter: string, action: SimAction): Promise<SimResult> {
  const db = await admin();
  const r = await db.rpc("sim_owner_act", { _req: before.id, _presenter: presenter, _action: action });
  const { prepareBackup } = await import("./plan.server");
  if (r.error && action === "accept" && /enough free/i.test(r.error.message)) {
    // Lost a race: another booking took the stock first. The normal decline runs and a replacement for only this amount is offered.
    const d = await db.rpc("sim_owner_act", { _req: before.id, _presenter: presenter, _action: "decline" });
    if (!d.error) await prepareBackup(before.want_id, `${before.owner_name || "An owner"}'s ${before.item_name.toLowerCase()} was booked by someone else for these times.`);
    return { ok: false, status: "unavailable", message: UNAVAILABLE };
  }
  if (r.error) throw new Error(r.error.message);
  const status = String((r.data as { status?: string } | null)?.status ?? "");
  if (action === "accept" && status === "expired") throw new Error("This request expired because the pickup time has passed. Nothing was booked.");
  if (action === "decline" && before.status === "requested") {
    const unit = before.unit === "item" ? before.item_name.toLowerCase() : `${before.unit} of ${before.item_name.toLowerCase()}`;
    await prepareBackup(before.want_id, `${before.owner_name || "An owner"} can't lend ${Number(before.quantity)} ${unit}.`);
  }
  return { ok: true, status, message: null };
}

/**
 * Trial setting "Simulate lender acceptance and replies": after the borrower approved sending, each simulated lender
 * says yes through the normal answer (stock, dates and permissions are checked again). Safe to repeat.
 */
export async function autoAcceptForWant(userId: string, wantId: string): Promise<{ accepted: string[]; unavailable: number }> {
  const db = await admin();
  const { data: me } = await db.from("profiles").select("is_demo, is_simulated, sim_auto, restricted").eq("id", userId).single();
  if (!me?.is_demo || me.is_simulated || !me.sim_auto || me.restricted) return { accepted: [], unavailable: 0 };
  const { data: reqs } = await db.from("requests").select("*").eq("want_id", wantId).eq("borrower_id", userId).eq("simulated", true).eq("status", "requested");
  const accepted: string[] = [];
  let unavailable = 0;
  for (const r of reqs ?? []) {
    try {
      const out = await runSimAction(r, userId, "accept");
      if (out.ok && out.status === "confirmed") accepted.push(r.id);
      else if (!out.ok) unavailable++;
    } catch (e) {
      console.error("[trial] auto accept failed", (e as Error).message);
    }
  }
  return { accepted, unavailable };
}

export type ReplyOutcome =
  | { ok: true; replyId: string | null }
  | { ok: false; pending: true }
  | { ok: false; off: true; message: string }
  | { ok: false; aiError: string; kind: string };

/** At most one AI reply per saved borrower message. The borrower's message is already saved before this runs. */
export async function lenderReply(userId: string, requestId: string, clientId: string, retry: boolean): Promise<ReplyOutcome> {
  const db = await admin();
  const [{ data: msg }, { data: r }, { data: me }] = await Promise.all([
    db.from("messages").select("*").eq("request_id", requestId).eq("sender_id", userId).eq("client_id", clientId).maybeSingle(),
    db.from("requests").select("*").eq("id", requestId).maybeSingle(),
    db.from("profiles").select("is_demo, is_simulated, sim_auto, restricted").eq("id", userId).single(),
  ]);
  if (!r || r.borrower_id !== userId) throw new Error("Not found");
  if (!msg) return { ok: false, off: true, message: "That message isn't saved yet." };
  if (!r.simulated || !me?.is_demo || me.is_simulated) return { ok: false, off: true, message: "Only simulated demo lenders reply automatically." };
  if (!me.sim_auto) return { ok: false, off: true, message: "Simulated lender replies are switched off in your profile." };
  if (me.restricted) return { ok: false, off: true, message: "Your account is paused after a review." };
  if (!["confirmed", "completed"].includes(r.status)) return { ok: false, off: true, message: "The chat opens after the lender says yes." };
  const { data: blocked } = await db.rpc("is_blocked", { _a: r.owner_id, _b: r.borrower_id });
  if (blocked) return { ok: false, off: true, message: "Chat is closed." };
  if (!retry && !canAutoReply(msg, userId, Date.now())) return { ok: false, off: true, message: "Older messages don't get an automatic reply." };

  // Claim this message: the primary key on message_id makes a second tap or tab wait instead of paying twice.
  const { data: row } = await db.from("demo_replies").select("*").eq("message_id", msg.id).maybeSingle();
  const step = replyDecision(row, retry, Date.now(), REPLY_STALE_MS);
  if (step === "reuse") return { ok: true, replyId: row?.reply_id ?? null };
  if (step === "pending") return { ok: false, pending: true };
  if (step === "show_failure") return { ok: false, aiError: row?.error || REPLY_FAILED, kind: "failed" };
  if (step === "create") {
    const ins = await db.from("demo_replies").insert({ message_id: msg.id, request_id: r.id, borrower_id: userId });
    if (ins.error) {
      if (ins.error.code === "23505") return { ok: false, pending: true };
      throw new Error(ins.error.message);
    }
  } else {
    const claim = await db
      .from("demo_replies")
      .update({ status: "running", error: null, attempts: Number(row?.attempts ?? 1) + 1, updated_at: new Date().toISOString() })
      .eq("message_id", msg.id)
      .eq("updated_at", row!.updated_at)
      .select("message_id");
    if (!claim.data?.length) return { ok: false, pending: true };
  }
  const fail = async (text: string) => {
    await db.from("demo_replies").update({ status: "failed", error: text, updated_at: new Date().toISOString() }).eq("message_id", msg.id);
  };

  try {
    const [{ data: item }, { data: owner }, { data: want }, { data: siblings }, { data: history }, { data: meet }] = await Promise.all([
      db.from("items").select("name, description, specs, accessories, condition, area_name, kind, unit, price_rs, price_per, price_period").eq("id", r.item_id).maybeSingle(),
      db.from("profiles").select("display_name").eq("id", r.owner_id).maybeSingle(),
      db.from("wants").select("quantity, item_name").eq("id", r.want_id).maybeSingle(),
      db.from("requests").select("id, quantity, status").eq("want_id", r.want_id).neq("id", r.id),
      db.from("messages").select("sender_id, body, kind, shayari, created_at").eq("request_id", r.id).lte("created_at", msg.created_at).order("created_at", { ascending: false }).limit(20),
      db.from("meeting_prefs").select("user_id, free_from, free_to, place").eq("request_id", r.id),
    ]);
    const agreed = (r.agreed ?? {}) as Record<string, unknown>;
    const pick = (k: string, fallback: unknown) => String(agreed[k] ?? fallback ?? "").trim();
    const lenderName = (owner?.display_name || r.owner_name || "Neighbour").split(/\s+/)[0]!;
    const listing = [
      `Item: ${pick("name", item?.name ?? r.item_name)}`,
      `Description: ${pick("description", item?.description) || "not written"}`,
      `Specs: ${pick("specs", item?.specs) || "not written"}`,
      `Included accessories: ${pick("accessories", item?.accessories) || "none listed"}`,
      `Condition: ${pick("condition", item?.condition) || "not written"}`,
      `Pickup area (broad, simulated): ${item?.area_name ?? "not written"}`,
    ].join("\n");
    const ownerMeet = (meet ?? []).find((m) => m.user_id === r.owner_id);
    const borrowerMeet = (meet ?? []).find((m) => m.user_id === r.borrower_id);
    const unit = r.unit === "item" ? r.item_name.toLowerCase() : `${r.unit} of ${r.item_name.toLowerCase()}`;
    const booking = [
      `Status: ${r.status === "completed" ? "finished (everything returned)" : "agreed (you said yes)"}`,
      `Amount you lend: ${Number(r.quantity)} ${unit}`,
      `Pickup: ${fmtDateTime(r.pickup_at)} (Pakistan time)`,
      r.kind === "return" ? `Return: ${fmtDateTime(r.return_at)} (Pakistan time)` : "Used up: nothing comes back",
      `Total price: ${money(Number(r.total_rs))}`,
      `Collected so far (confirmed): ${Number(r.picked_up_qty)}; returned so far (confirmed): ${Number(r.returned_qty)}`,
      ownerMeet ? `Your free time to meet: ${fmtDateTime(ownerMeet.free_from)} to ${fmtDateTime(ownerMeet.free_to)} at "${ownerMeet.place ?? "a public place"}"` : "You haven't shared a meeting time yet",
      borrowerMeet ? `Borrower's free time: ${fmtDateTime(borrowerMeet.free_from)} to ${fmtDateTime(borrowerMeet.free_to)}${borrowerMeet.place ? ` at "${borrowerMeet.place}"` : ""}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const share = shareNote({
      mine: Number(r.quantity),
      unit: r.unit,
      item: r.item_name,
      wanted: want?.quantity == null ? null : Number(want.quantity),
      others: (siblings ?? []).map((s) => ({ quantity: Number(s.quantity), status: s.status })),
    });
    const all = (history ?? []).slice().reverse();
    const latest = historyLines([msg], r.borrower_id, r.owner_id, 1)[0] ?? msg.body;
    const earlier = all.filter((m) => !(m.sender_id === msg.sender_id && m.created_at === msg.created_at && m.body === msg.body));
    const { demoLenderChat } = await import("./ai.server");
    const out = await demoLenderChat({ lenderName, listing, booking, share, history: historyLines(earlier, r.borrower_id, r.owner_id), latest });
    const body = cleanReply(out.reply);
    if (!body) throw new Error("empty reply");
    // The lender's message uses the borrower's message id as its own id key, so it can be saved only once.
    let replyId: string | null = null;
    const put = await db.from("messages").insert({ request_id: r.id, sender_id: r.owner_id, body, client_id: msg.id }).select("id").single();
    if (put.error && put.error.code !== "23505") throw new Error(put.error.message);
    if (put.data) replyId = put.data.id;
    else {
      const { data: existing } = await db.from("messages").select("id").eq("request_id", r.id).eq("sender_id", r.owner_id).eq("client_id", msg.id).maybeSingle();
      replyId = existing?.id ?? null;
    }
    await db.from("demo_replies").update({ status: "ready", reply_id: replyId, wants_change: Boolean(out.asks_change), error: null, updated_at: new Date().toISOString() }).eq("message_id", msg.id);
    return { ok: true, replyId };
  } catch (e) {
    const { AiUnavailableError } = await import("./ai.server");
    if (e instanceof AiUnavailableError) {
      await fail(`${REPLY_FAILED} (${e.message})`);
      return { ok: false, aiError: `${REPLY_FAILED} (${e.message})`, kind: e.kind };
    }
    console.error("[trial] lender reply failed", (e as Error).message);
    await fail(REPLY_FAILED);
    return { ok: false, aiError: REPLY_FAILED, kind: "unavailable" };
  }
}

const SAMPLE_HOME = { area_name: "Gulgasht Colony", lat: 30.21, lng: 71.475 };

/**
 * A real member's private trial account: a separate demo-world person (fictional items and AI lenders only),
 * so trial bookings never touch the member's real listings or bookings. A fresh one-time password each time.
 */
export async function startTrialAccount(userId: string): Promise<{ email: string; password: string }> {
  const db = await admin();
  const { data: me } = await db.from("profiles").select("is_demo, is_simulated, trial_of").eq("id", userId).single();
  if (!me) throw new Error("Not found");
  if (me.is_demo || me.is_simulated || me.trial_of) throw new Error("You're already in trial mode.");
  const password = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
  const { data: existing } = await db.from("profiles").select("id").eq("trial_of", userId).maybeSingle();
  let id = existing?.id ?? null;
  let email: string;
  if (id) {
    const u = await db.auth.admin.updateUserById(id, { password });
    if (u.error || !u.data.user?.email) throw new Error("Couldn't open your trial. Please try again.");
    email = u.data.user.email;
  } else {
    email = `trial-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}@trial.cheezudhaar.test`;
    const u = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "Trial borrower", trial_account: true } });
    if (u.error || !u.data.user) throw new Error("Couldn't open your trial. Please try again.");
    id = u.data.user.id;
  }
  const p = await db
    .from("profiles")
    .update({
      display_name: "Trial borrower",
      is_demo: true,
      is_simulated: false,
      trial_of: userId,
      ai_demo_results: true,
      sim_auto: true,
      onboarded: true,
      city: "Multan",
      ...SAMPLE_HOME,
      travel_km: 5,
      identity_status: "test_number",
      test_cnic: "00000-0000000-0",
    })
    .eq("id", id);
  if (p.error) throw new Error("Couldn't open your trial. Please try again.");
  return { email, password };
}
