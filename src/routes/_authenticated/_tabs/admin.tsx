import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, Empty, PageTitle, Pill } from "@/components/app/bits";
import { aiDiagnostics, reportPhoto } from "@/lib/app.functions";
import { rolesQuery } from "@/lib/queries";
import { fmtShort } from "@/lib/format";

type Report = Database["public"]["Tables"]["reports"]["Row"];

const KIND_WORDS: Record<string, string> = {
  late: "Late return",
  damage: "Damage",
  missing: "Missing items",
  conduct: "Inappropriate behaviour",
  other: "Other",
};
const STATUS_WORDS: Record<string, string> = {
  open: "Reported",
  replied: "Other side replied",
  under_review: "Under review",
  decided: "Resolved",
  appealed: "Appealed",
  closed: "Closed",
};

export const Route = createFileRoute("/_authenticated/_tabs/admin")({
  head: () => ({
    meta: [
      { title: "Area cases — Cheez Udhaar" },
      { name: "description", content: "Reported problems in your area for the area admin to review." },
      { property: "og:title", content: "Area cases — Cheez Udhaar" },
      { property: "og:description", content: "Reported problems in your area for the area admin to review." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(rolesQuery(context.userId)),
  component: Admin,
});

function Admin() {
  const { userId } = Route.useRouteContext();
  const { data: roles } = useSuspenseQuery(rolesQuery(userId));
  const areas = roles.filter((r) => r.role === "area_admin").map((r) => r.area);
  const reports = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reports").select("*").in("area", areas).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).flatMap((r) => [r.reporter_id, r.against_id])));
      const { data: names } = await supabase.rpc("party_names", { _ids: ids });
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        if (r.decision_action && r.decision_action !== "none") counts.set(r.against_id, (counts.get(r.against_id) ?? 0) + 1);
      }
      return { list: data ?? [], names: new Map((names ?? []).map((n) => [n.id, n.first_name])), confirmed: counts };
    },
    enabled: areas.length > 0,
    refetchInterval: 10000,
  });

  if (areas.length === 0) return <Empty>Only area admins can see this page.</Empty>;

  return (
    <div className="space-y-4">
      <PageTitle sub={`Cases in ${areas.join(", ")}. Decide only after reading both sides.`}>Area cases</PageTitle>
      <AiHealth />
      {reports.data?.list.length === 0 && <Empty>No cases right now.</Empty>}
      {reports.data?.list.map((r) => (
        <CaseCard key={r.id} r={r} names={reports.data.names} confirmedAgainst={reports.data.confirmed.get(r.against_id) ?? 0} />
      ))}
    </div>
  );
}

function CaseCard({ r, names, confirmedAgainst }: { r: Report; names: Map<string, string>; confirmedAgainst: number }) {
  const qc = useQueryClient();
  const photoFn = useServerFn(reportPhoto);
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  const reporter = names.get(r.reporter_id) ?? "Reporter";
  const against = names.get(r.against_id) ?? "Other person";

  async function decide(action: "none" | "reminder" | "warning" | "restriction") {
    if (!decision.trim()) { toast.error("Please write the reason for your decision."); return; }
    if (action === "restriction" && !window.confirm(`Pause ${against}'s account? Only do this for serious damage or repeated confirmed problems.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc("decide_report", { _id: r.id, _decision: decision.trim(), _action: action });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Decision saved.");
    setDecision("");
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
  }

  async function decideAppeal(lift: boolean) {
    if (!decision.trim()) { toast.error("Please write the reason for your decision."); return; }
    setBusy(true);
    const { error } = await supabase.rpc("decide_appeal", { _id: r.id, _decision: decision.trim(), _lift: lift });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Appeal decided.");
    setDecision("");
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
  }

  return (
    <Card tone={["open", "replied", "under_review", "appealed"].includes(r.status) ? "attention" : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="attention">{KIND_WORDS[r.kind] ?? "Other"}</Pill>
        <Pill>{STATUS_WORDS[r.status] ?? r.status}</Pill>
        <span className="text-sm text-muted-foreground">{fmtShort(r.created_at)}</span>
      </div>
      <p className="mt-2">
        <strong>{reporter}</strong> reported <strong>{against}</strong>:
      </p>
      <p className="mt-1">{r.description}</p>
      {r.photo_path && (
        <Button
          variant="link"
          className="h-auto p-0"
          onClick={async () => {
            const u = await photoFn({ data: { reportId: r.id } });
            if (u.url) window.open(u.url, "_blank", "noopener");
          }}
        >
          See photo
        </Button>
      )}
      <p className="mt-2 rounded-xl bg-card p-3">
        <strong>{against}'s reply:</strong> {r.reply ?? "No reply yet."}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Earlier confirmed problems for {against}: {confirmedAgainst}. A complaint alone is never a reason to pause someone. Use a reminder
        for small lateness; pause only for serious or repeated confirmed problems. A paused person can still return items.
      </p>
      {r.decision && <p className="mt-2"><strong>Decision:</strong> {r.decision} ({r.decision_action})</p>}
      {r.appeal && <p className="mt-1"><strong>Appeal:</strong> {r.appeal}</p>}
      {r.appeal_decision && <p className="mt-1"><strong>Appeal decision:</strong> {r.appeal_decision}</p>}

      {(r.status === "open" || r.status === "replied") && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={busy}
          onClick={async () => {
            const { error } = await supabase.rpc("start_review", { _id: r.id });
            if (error) {
              toast.error(error.message);
              return;
            }
            toast.success("Marked as under review. Both people can see that.");
            qc.invalidateQueries({ queryKey: ["admin-reports"] });
          }}
        >
          Start review
        </Button>
      )}
      {["open", "replied", "under_review", "appealed"].includes(r.status) && (
        <div className="mt-3 space-y-2">
          <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Write your decision and reason" maxLength={1500} className="bg-card" />
          {r.status === "appealed" ? (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy} onClick={() => decideAppeal(false)}>
                Keep decision
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => decideAppeal(true)}>
                Change it and lift any pause
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy} onClick={() => decide("none")}>
                No action
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => decide("reminder")}>
                Send a reminder
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => decide("warning")}>
                Give a warning
              </Button>
              <Button variant="destructive" disabled={busy} onClick={() => decide("restriction")}>
                Pause account
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const KIND_TEXT: Record<string, string> = {
  ok: "Working",
  balance: "Out of AI balance (payment required)",
  busy: "Rate limit reached",
  timeout: "Timed out",
  invalid: "Unusable answer",
  unavailable: "Unavailable",
};

/** Owner/developer view: technical details members never see. Codes only, never message text. */
function AiHealth() {
  const diag = useServerFn(aiDiagnostics);
  const [probe, setProbe] = useState(false);
  const q = useQuery({ queryKey: ["ai-diag", probe], queryFn: () => diag({ data: { probe } }) });
  const d = q.data;
  const balance = d?.probe?.kind === "balance" || (!d?.probe && d?.events[0]?.kind === "balance");
  return (
    <Card>
      <h2 className="text-lg font-bold">Writing helper status</h2>
      {q.isPending ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : q.isError ? (
        <p className="text-sm">Couldn't read the status.</p>
      ) : d ? (
        <div className="space-y-2 text-sm">
          <p>
            Model: <span className="font-mono">{d.model}</span> · Connection key: {d.configured ? "set" : "missing"}
          </p>
          {d.probe && (
            <p className="font-semibold">
              Live check: {KIND_TEXT[d.probe.ok ? "ok" : (d.probe.kind ?? "unavailable")]}
              {d.probe.code ? ` (${d.probe.code}${d.probe.http ? `, HTTP ${d.probe.http}` : ""})` : ""}
            </p>
          )}
          {d.probeWait > 0 && <p>Live check was run less than a minute ago. Try again in {d.probeWait}s.</p>}
          {balance && (
            <p className="rounded-xl bg-attention-soft p-3 text-attention-foreground">
              The workspace's AI balance is empty. The workspace owner needs to add AI credits (Settings → Plans &amp; credits). Members only see "The writing helper is unavailable".
            </p>
          )}
          {d.events.length > 0 ? (
            <ul className="space-y-1">
              {d.events.map((e) => (
                <li key={e.created_at + e.feature} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-foreground">{fmtShort(e.created_at)}</span>
                  <span>{e.feature}</span>
                  <span className="font-semibold">{KIND_TEXT[e.kind] ?? e.kind}</span>
                  {e.code && <span className="font-mono">{e.code}{e.http_status ? ` ${e.http_status}` : ""}</span>}
                  {e.retry_after ? <span>wait {e.retry_after}s</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No problems recorded.</p>
          )}
          <Button type="button" variant="outline" size="sm" disabled={q.isFetching} onClick={() => (probe ? void q.refetch() : setProbe(true))}>
            Run live check
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
