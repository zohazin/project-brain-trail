<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Read `chat.md` at the project root before every task and update it after; it is the user's central project memory (status, tasks, restrictions, reference files).

## Project rules (Cheez Udhaar)

- Booking state changes (send/answer/cancel requests, pickups, returns, ratings, reports, admin decisions) go only through `SECURITY DEFINER` RPCs that check `auth.uid()` and lock rows; clients get SELECT only on `requests`. Why: prevents double-booking and duplicate taps.
- Matching: SQL `match_items` (server-only, no owner names) finds candidates and checks real quantity, times, distance and price; the AI judges only "right kind of item" from private summaries and "must-have feature missing" from the listing's own description/specs; plans are built in `src/lib/plan.server.ts`. Why: the database, not the AI, is the source of truth.
- Photos live in the private `photos` bucket under `<userId>/...`; other people's photos are shown only via server-signed links after a party/permission check. Why: profile and report photos are private.
- Times are stored in UTC and shown in Asia/Karachi via `src/lib/format.ts`. Why: one community in Pakistan.
- Demo accounts/items are seeded by migration with `is_demo = true`; `resetDemo` restores them. Why: repeatable acceptance test.
- Owners appear as "Owner A/B…" and borrowers as unnamed until an owner says yes; `respond_request` writes real first names on confirm. RPCs/data returned to the other person must never carry names before that. Why: anonymous requests.
- Each person controls only their own exact address per booking (`party_addresses`) and their own photo choice; blocks live in `blocks` and are written only via `block_from_request`. Why: per-person privacy control.
- Requests snapshot listing details in `requests.agreed` at send time. Why: owner edits must not change agreed bookings.
- Demo and real members never mix: every listing/matching/sending RPC compares `is_demo`, and area-admin access goes through `can_admin_area()`. Why: public demo credentials must not reach real records; `resetDemo` deletes only rows where every person is a demo account.
- Pickup/return is two-sided: the borrower reports (`report_handover`), only the owner confirms (`confirm_handover`), which is the only place stock/loan numbers change. Why: one source of truth and once-only stock changes.
- Notifications are written only by database triggers/RPCs through `notify()` with a unique dedupe key; clients only read and mark read. Reminders/expiry run via hourly pg_cron `cheez-due-events` → `process_due_events()`. Why: reminders arrive with the app closed; dedupe keys make reruns harmless.
- Any change to an agreed booking (dates or quantity) goes through `propose_booking_change` → `date_changes` and is applied only when the other person accepts; every accept passes the request's `terms_version` and is refused if the terms moved. Why: no one-sided edits and no stale accepts.
- Every handover claim/confirm appends to `requests.handover_log` and impossible numbers (more than agreed, more back than collected) are refused in SQL. Why: disputes have a history and stock can't go wrong.
- Members may update only listed profile columns (column grant); roles, demo flags, restrictions and identity status are not writable by members, and listing demo/owner flags are held by a trigger. Why: no self-promotion to admin or crossing the demo boundary.
- Photos are re-encoded in the browser (`src/lib/upload.ts`) before upload. Why: strips location and camera data.
- The `_authenticated` guard falls back to the device session only when offline. Why: offline reloads must not drop people onto the sign-up page; the server still checks every request.
- Prices are computed by SQL `price_for()` and mirrored by `costFor()` in `src/lib/format.ts`; `send_requests` rejects a request whose `expected_total` differs. Why: the person always agrees to the exact total.
- Quantity changes after sending are previewed by `src/lib/change.ts` and applied by SQL `change_want_quantity()` using the same order. Why: what the person approves is what happens.
- Offline/install: `vite-plugin-pwa` (generateSW, written to `dist/client`), registered only by `src/lib/pwa.ts` with preview/iframe/dev guards; pages NetworkFirst, only hashed assets and icons precached, no API or photo caching. Why: never serve stale or private data.
- Typed text that must survive failures (Find request, answers, chat, reports, listing drafts) uses `useDraft` (device storage); unsent chat messages sit in a per-booking outbox (`cu-outbox:<id>`) and retry on reconnect, deduped by `client_id`; critical actions call `ensureOnline()` first; sign-out clears all `cu-` keys. Why: nothing is lost, duplicated or leaked to the next account.
- Schema history lives in `drizzle/migrations` and was re-applied in order (0000–0013) when this project was created from the exported zip; new schema changes go in new migrations, never edits to old ones. Why: the database must match the imported history exactly.
