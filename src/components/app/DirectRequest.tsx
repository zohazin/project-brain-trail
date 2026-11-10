import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Check, Feather, Loader2 } from "lucide-react";
import { ShayariPanel } from "@/components/app/Shayari";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/app/bits";
import { QuoteBox } from "@/components/app/Quote";
import { cleanNote, quoteListing, requestListing, type DirectQuote } from "@/lib/app.functions";
import { errMessage } from "@/lib/queries";
import { fmtQty, localInputToIso } from "@/lib/format";
import { ensureOnline, useDraft } from "@/hooks/use-app";

type Item = {
  id: string;
  name: string;
  kind: string;
  unit: string;
  listed: number;
  outside: boolean;
  minAmount: number | null;
  stepAmount: number | null;
};

type Form = { qty: string; pickup: string; back: string; note: string };

/** Ask for one listing directly: dates and amount first, then the server's exact availability and price. */
export function DirectRequest({ item }: { item: Item }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const quoteFn = useServerFn(quoteListing);
  const sendFn = useServerFn(requestListing);
  const [f, setF, clearF] = useDraft<Form>(`cu-direct:${item.id}`, { qty: item.kind === "use_up" ? "" : "1", pickup: "", back: "", note: "" });
  const [quote, setQuote] = useState<DirectQuote | null>(null);
  const [busy, setBusy] = useState<"quote" | "send" | null>(null);
  const working = useRef(false);
  const [rhyme, setRhyme] = useState(false);
  const cleanFn = useServerFn(cleanNote);
  // The note as the owner will see it (names, numbers and addresses hidden). The person approves this exact text.
  const [safe, setSafe] = useState<{ note: string; removed: boolean } | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);

  async function previewNote() {
    if (cleaning || !ensureOnline()) return;
    setCleaning(true);
    setReview(null);
    try {
      const r = await cleanFn({ data: { text: f.note } });
      if (r.ok) setSafe({ note: r.note, removed: r.removed });
      else setReview("review" in r ? r.review : r.aiError);
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setCleaning(false);
    }
  }

  const qty = Number(f.qty);
  const pickupAt = localInputToIso(f.pickup);
  const returnAt = item.kind === "return" ? localInputToIso(f.back) : null;
  const missing = !(qty > 0)
    ? item.kind === "use_up"
      ? `How much do you need (${item.unit})?`
      : "How many do you need?"
    : !pickupAt
      ? "When will you pick it up?"
      : item.kind === "return" && !returnAt
        ? "When will you bring it back?"
        : null;

  function update(p: Partial<Form>) {
    setF({ ...f, ...p });
    setQuote(null); // details changed: check again
  }

  async function check(e: FormEvent) {
    e.preventDefault();
    if (missing || working.current) return;
    if (!ensureOnline()) return;
    working.current = true;
    setBusy("quote");
    try {
      setQuote(await quoteFn({ data: { itemId: item.id, quantity: qty, pickupAt: pickupAt!, returnAt } }));
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  async function send(override?: { note: string; previewId?: string | undefined }) {
    if (!quote || quote.problem || working.current) return;
    if (!ensureOnline()) return;
    working.current = true;
    setBusy("send");
    try {
      const r = await sendFn({
        data: {
          itemId: item.id,
          quantity: qty,
          pickupAt: pickupAt!,
          returnAt,
          expectedTotal: quote.total,
          note: override?.note ?? f.note,
          shayariPreview: override?.previewId ?? null,
        },
      });
      toast.success("Request sent. Nothing is booked until the owner says yes.");
      clearF();
      await qc.invalidateQueries({ queryKey: ["activity"] });
      await qc.invalidateQueries({ queryKey: ["nearby"] });
      navigate({ to: "/need/$wantId", params: { wantId: r.wantId } });
    } catch (err) {
      toast.error(errMessage(err));
      setQuote(null);
    } finally {
      working.current = false;
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-xl font-bold">Ask for this item</h2>
      <p className="text-sm text-muted-foreground">
        {fmtQty(item.listed, item.unit)} listed. Choose your dates and we check what is free for exactly that time.
      </p>
      <form onSubmit={check} className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-semibold">{item.kind === "use_up" ? `How much (${item.unit})?` : "How many do you need?"}</span>
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={item.stepAmount ?? (item.kind === "use_up" ? "any" : 1)}
            value={f.qty}
            onChange={(e) => update({ qty: e.target.value })}
            className="h-12 text-base"
          />
          {item.kind === "use_up" && (item.minAmount || item.stepAmount) && (
            <span className="block text-xs text-muted-foreground">
              {item.minAmount ? `Smallest amount ${fmtQty(item.minAmount, item.unit)}. ` : ""}
              {item.stepAmount ? `Steps of ${fmtQty(item.stepAmount, item.unit)}.` : ""}
            </span>
          )}
        </label>
        <label className="space-y-1">
          <span className="font-semibold">When will you pick it up?</span>
          <Input type="datetime-local" value={f.pickup} onChange={(e) => update({ pickup: e.target.value })} className="h-12 text-base" />
        </label>
        {item.kind === "return" && (
          <label className="space-y-1">
            <span className="font-semibold">When will you bring it back?</span>
            <Input type="datetime-local" value={f.back} onChange={(e) => update({ back: e.target.value })} className="h-12 text-base" />
          </label>
        )}
        {item.outside && (
          <label className="space-y-1 sm:col-span-2">
            <span className="font-semibold">You are farther than this owner usually lends. Why do you need it? (optional)</span>
            <Textarea id={`direct-note-${item.id}`} value={f.note} onChange={(e) => {
                setF({ ...f, note: e.target.value });
                setSafe(null);
                setReview(null);
              }} maxLength={600} className="bg-card" />
            <span className="block text-xs text-muted-foreground">Names, phone numbers, emails and house addresses are hidden. You see the exact note before it is sent.</span>
          </label>
        )}
        <div className="space-y-1 sm:col-span-2">
          <Button type="submit" variant="outline" size="lg" className="w-full" disabled={Boolean(missing) || busy !== null}>
            {busy === "quote" ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {busy === "quote" ? "Checking…" : "Check price and availability"}
          </Button>
          {missing && <p className="text-center text-sm text-muted-foreground">{missing}</p>}
        </div>
      </form>

      {quote && (
        <div className="space-y-3">
          {quote.problem ? (
            <p className="rounded-xl bg-attention-soft p-3 font-semibold text-attention-foreground">{quote.problem}</p>
          ) : (
            <>
              <p className="font-semibold">
                {fmtQty(Math.max(0, quote.free_qty ?? 0), quote.unit)} free for these dates · {fmtQty(quote.listed_qty, quote.unit)} listed
              </p>
              <QuoteBox
                rows={[
                  {
                    itemName: quote.item_name,
                    kind: quote.kind,
                    unit: quote.unit,
                    quantity: quote.quantity,
                    priceRs: quote.unit_rate,
                    pricePer: quote.price_per,
                    period: quote.period,
                    days: quote.days,
                    cost: quote.total,
                  },
                ]}
                pickupAt={quote.pickup_at}
                returnAt={quote.return_at}
              />
              {item.outside && f.note.trim() && !rhyme && (
                <Button variant="outline" size="lg" className="w-full" onClick={() => setRhyme(true)}>
                  <Feather /> Make it rhyme
                </Button>
              )}
              {item.outside && rhyme && f.note.trim() && (
                <ShayariPanel
                  context="exception"
                  source={f.note}
                  target={{ itemId: item.id, quantity: qty, pickupAt, returnAt }}
                  sending={busy === "send"}
                  sendLabel="Send request"
                  onClose={() => setRhyme(false)}
                  onEditSource={() => document.getElementById(`direct-note-${item.id}`)?.focus()}
                  onSendOriginal={(safe) => void send({ note: safe })}
                  onSendRhyme={(p) => void send({ note: p.original, previewId: p.id })}
                />
              )}
              {!(item.outside && rhyme && f.note.trim()) && item.outside && f.note.trim() && !safe && (
                <>
                  {review && <p className="rounded-xl bg-attention-soft p-3 font-semibold text-attention-foreground">{review}</p>}
                  <Button size="lg" variant="outline" className="w-full" disabled={cleaning || busy !== null} onClick={() => void previewNote()}>
                    {cleaning ? <Loader2 className="animate-spin" aria-hidden /> : null} {cleaning ? "Checking…" : "Preview note as the owner sees it"}
                  </Button>
                </>
              )}
              {!(item.outside && rhyme && f.note.trim()) && item.outside && f.note.trim() && safe && (
                <div className="space-y-2 rounded-xl bg-muted p-3">
                  {safe.removed && <p className="text-sm font-semibold text-attention-foreground">We took out names, phone numbers or addresses.</p>}
                  <p className="text-sm font-semibold">The owner will see only this note:</p>
                  <blockquote dir="auto" className="rounded-lg bg-card p-3 italic">“{safe.note}”</blockquote>
                </div>
              )}
              {!(item.outside && rhyme && f.note.trim()) && !(item.outside && f.note.trim() && !safe) && (
                <Button size="lg" className="w-full" disabled={busy !== null} onClick={() => void send(safe && item.outside && f.note.trim() ? { note: safe.note } : undefined)}>
                  {busy === "send" ? <Loader2 className="animate-spin" aria-hidden /> : <Check />} {busy === "send" ? "Sending…" : "Send request"}
                </Button>
              )}
              <p className="text-center text-sm text-muted-foreground">The owner stays anonymous and sees only “Someone nearby” until they say yes.</p>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
