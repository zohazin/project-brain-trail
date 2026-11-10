// Demo data tools. Everything here touches only records where every person is a fictional demo account.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_ITEMS, DEMO_PASSWORD, karachiAt } from "./demo";

type Admin = SupabaseClient<Database>;

/** Removes demo-to-demo requests, chats, rhymes, notifications and test listings, and restores demo stock. */
export async function wipeDemo(admin: Admin): Promise<number> {
  const { data: demo } = await admin.from("profiles").select("id").eq("is_demo", true);
  const ids = (demo ?? []).map((p) => p.id);
  if (ids.length === 0) return 0;
  const check = <T extends { error: { message: string } | null }>(r: T, what: string) => {
    if (r.error) throw new Error(`Could not reset ${what}: ${r.error.message}`);
    return r;
  };
  const { data: demoReqs } = await admin.from("requests").select("id").in("borrower_id", ids).in("owner_id", ids);
  const reqIds = (demoReqs ?? []).map((r) => r.id);
  check(await admin.from("blocks").delete().in("blocker_id", ids).in("blocked_id", ids), "blocks");
  check(await admin.from("notifications").delete().in("user_id", ids), "notifications");
  check(await admin.from("shayari_previews").delete().in("user_id", ids), "rhymes");
  check(await admin.from("shayari_attempts").delete().in("user_id", ids), "rhyme limits");
  check(await admin.from("reports").delete().in("reporter_id", ids).in("against_id", ids), "reports");
  if (reqIds.length) check(await admin.from("requests").delete().in("id", reqIds), "bookings");
  // Demo searches that never reached a real member.
  const { data: wantsWithReal } = await admin.from("requests").select("want_id").in("borrower_id", ids);
  const keep = new Set((wantsWithReal ?? []).map((w) => w.want_id));
  const { data: demoWants } = await admin.from("wants").select("id").in("borrower_id", ids);
  const wantIds = (demoWants ?? []).map((w) => w.id).filter((id) => !keep.has(id));
  if (wantIds.length) check(await admin.from("wants").delete().in("id", wantIds), "searches");
  // Listings demo accounts added while testing (the seeded demo items stay).
  const { data: extra } = await admin.from("items").select("id").in("owner_id", ids).eq("is_demo", false);
  for (const it of extra ?? []) {
    const { count } = await admin.from("requests").select("id", { count: "exact", head: true }).eq("item_id", it.id);
    if (!count) check(await admin.from("items").delete().eq("id", it.id), "listings");
  }
  check(await admin.from("items").update({ quantity: 200, status: "active" }).eq("id", "e0000000-0000-4000-8000-000000000005"), "glue");
  check(await admin.from("items").update({ quantity: 4000, status: "active" }).eq("id", "e0000000-0000-4000-8000-000000000009"), "paint");
  check(await admin.from("items").update({ status: "active" }).in("owner_id", ids).eq("is_demo", true), "demo items");
  check(await admin.from("profiles").update({ restricted: false, shayari_language: "roman_urdu", shayari_tone: "friendly" }).in("id", ids), "demo accounts");
  return reqIds.length;
}

/** Signs in one demo account (public demo password) so the setup goes through the normal guarded actions. */
async function asDemo(email: string): Promise<{ sb: Admin; id: string }> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new Error("The backend is not connected.");
  const sb = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
  if (error || !data.user) throw new Error(`Could not open the demo account ${email}.`);
  return { sb, id: data.user.id };
}

function ok<T extends { error: { message: string } | null }>(r: T, what: string): T {
  if (r.error) throw new Error(`Demo setup (${what}): ${r.error.message}`);
  return r;
}

export type ShayariDemo = { chatRequestId: string; thanksRequestId: string; exceptionWantId: string };

/**
 * Three ready-made starting points, built with the same guarded actions people use:
 * 1) Ali ↔ Usman: projector booking confirmed → open chat and "Make it rhyme".
 * 2) Ali ↔ Sara: 12 chairs collected, 11 back → Ali returns the last one, Sara confirms, then "Say thanks".
 * 3) Ali: a camping-tent search 6 km away → Farah lends only within 3 km but accepts exceptions.
 * The rhymes themselves are not prepared: the judge types fresh messages and the AI writes live.
 */
export async function buildShayariDemo(admin: Admin): Promise<ShayariDemo> {
  await wipeDemo(admin);
  const ali = await asDemo("ali.demo@cheezudhaar.test");
  const usman = await asDemo("usman.demo@cheezudhaar.test");
  const sara = await asDemo("sara.demo@cheezudhaar.test");
  const { data: me } = ok(await ali.sb.from("profiles").select("lat, lng, area_name").eq("id", ali.id).single(), "profile");
  const base = { borrower_id: ali.id, lat: me!.lat, lng: me!.lng, area_name: me!.area_name, status: "ready", conversation: [] };

  async function booking(item: string, name: string, qty: number, text: string, pickup: string, back: string) {
    const w = ok(
      await ali.sb
        .from("wants")
        .insert({ ...base, original_text: text, item_name: name, kind: "return", quantity: qty, unit: "item", pickup_at: pickup, return_at: back, search_km: 5 })
        .select("id")
        .single(),
      "search",
    ).data!;
    ok(await ali.sb.rpc("send_requests", { _want: w.id, _allocs: [{ item_id: item, quantity: qty, is_exception: false, note: null }] }), "send");
    const { data: r } = ok(await ali.sb.from("requests").select("id").eq("want_id", w.id).single(), "request");
    return r!.id;
  }

  // 1) Chat: projector, tomorrow 5 PM to the day after 10 AM.
  const chatRequestId = await booking(DEMO_ITEMS.usmanProjector, "Projector", 1, "Kal shaam 5 baje projector chahiye.", karachiAt(1, 17), karachiAt(2, 10));
  ok(await usman.sb.rpc("respond_request", { _req: chatRequestId, _accept: true }), "owner yes");

  // 2) Thanks: 12 chairs, collected and 11 returned (both sides confirmed). The last chair is left for the demo.
  const thanksRequestId = await booking(DEMO_ITEMS.saraChairs, "Folding chairs", 12, "Kal 1 se 6 baje 12 chairs chahiye.", karachiAt(1, 13), karachiAt(1, 18));
  ok(await sara.sb.rpc("respond_request", { _req: thanksRequestId, _accept: true }), "owner yes");
  ok(await ali.sb.rpc("report_handover", { _req: thanksRequestId, _picked: 12, _returned: 0 }), "collected");
  ok(await sara.sb.rpc("confirm_handover", { _req: thanksRequestId, _picked: 12, _returned: null as unknown as number, _close_pickup: false }), "confirm collected");
  ok(await ali.sb.rpc("report_handover", { _req: thanksRequestId, _picked: 12, _returned: 11 }), "returned 11");
  ok(await sara.sb.rpc("confirm_handover", { _req: thanksRequestId, _picked: 12, _returned: 11, _close_pickup: false }), "confirm 11");

  // 3) Faraway: a tent 6 km away, in two days. Nothing is sent: the judge writes the note on the request screen.
  const ex = ok(
    await ali.sb
      .from("wants")
      .insert({
        ...base,
        original_text: "Camping tent chahiye, 2 din ke liye.",
        item_name: "Camping tent",
        kind: "return",
        quantity: 1,
        unit: "item",
        pickup_at: karachiAt(2, 10),
        return_at: karachiAt(3, 10),
        search_km: 10,
      })
      .select("id")
      .single(),
    "faraway search",
  ).data!;

  // Local only: a global sign-out would also sign the demo person out of their own browser.
  await Promise.all([ali.sb.auth.signOut({ scope: "local" }), usman.sb.auth.signOut({ scope: "local" }), sara.sb.auth.signOut({ scope: "local" })]);
  return { chatRequestId, thanksRequestId, exceptionWantId: ex.id };
}
