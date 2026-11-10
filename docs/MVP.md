# Cheez Udhaar — MVP submission

*No official example MVP document was available in the project, so this uses a plain practical structure.*

**Published app:** https://project-brain-trail.lovable.app
**GitHub:** not connected yet (the code is saved in Lovable's own code storage; connecting GitHub needs the project owner — see "Known limitations").
**Status date:** 11 November 2026 (Asia/Karachi)

## 1. Purpose

Cheez Udhaar ("borrow a thing") lets neighbours in one community — starting with **Multan** — borrow and lend everyday things: folding chairs for a family event, a projector, a drill, a tent, glue by the gram. One account can borrow and lend. People write in **English or Roman Urdu**; rhymes can also be made in Urdu script.

## 2. The community problem

When a family needs 20 chairs or a drill for one afternoon, they either buy something they will use once, rent at a high price, or phone around. Things that already sit unused in nearby homes are hard to find, and asking strangers raises worries about privacy, unclear amounts, late returns and "who said yes to what".

## 3. Benefits

**Borrowers:** one message describes the need; the app finds enough items across several neighbours, shows exact dates, distance and the total price, and replaces an owner who says no. Their name and photo stay hidden until an owner says yes.

**Lenders:** earn from (or freely share) idle things, set their own hours, distance and price, see exactly what was agreed, and confirm pickups and returns themselves; stock only changes when the owner confirms.

## 4. Main workflow

1. **Find** — the borrower types a need, e.g. `Sunday ko 20 kursiyan chahiye, 1 baje le jaunga, shaam 6 baje wapas`.
2. **One useful question** — if a must-have detail is unclear (full-size or mini glue gun? drill bit size?), the AI asks once.
3. **Plan** — the app combines owners (e.g. 12 + 8), shows exact Karachi-time dates, distance and the total. Owners appear as "Owner A/B".
4. **Send** — one tap sends all requests; the agreed details are saved at that moment.
5. **Owner answers** — yes reveals first names and opens chat; no brings a replacement for only the missing amount, which the borrower approves.
6. **Meet, pick up, return** — each side shares a time and place; the borrower reports pickup/return, the owner confirms; partial returns show "1 still due".
7. **Rate / report** — both rate; problems go to an area admin.

## 5. What the runtime AI actually does

All AI calls run on the server (`src/lib/ai.server.ts`) through Lovable AI. The AI:

- reads a free-text request into item, amount, dates, budget, distance and must-have features, and asks one follow-up question when something critical is missing;
- judges whether a listing is the **right kind of item** and whether a must-have feature is missing, using the listing's own description;
- cleans faraway-request notes of names and addresses (delete-only, then fixed rules check again);
- writes Shayari (two rhyming lines + plain meaning) and checks that the meaning was kept;
- for **demo accounts only**, writes fictional listings when the demo neighbours don't have enough.

The AI **never** decides stock, availability, times, distance, price or who gets an item — the database does (`match_items`, `price_for`, `send_requests`, `respond_request`). If the AI is unavailable the person sees a clear message and a retry, and no reply is ever invented.

## 6. How fictional demo inventory is identified

Seven fictional demo accounts (Ali, Bilal, Sara, Usman, Hina, Farah, Zainab) and 10 seeded items exist for testing. When a demo search needs more than they have, AI creates fictional owners and listings **only for the shortfall**. Every one is labelled on screen: **"AI demo results — fictional"**, **"Demo item"**, **"Simulated owner"**, **"Sample photo unavailable"** (no fake photos). Their owners' answers are given by the presenter with **Simulate owner accepting / declining** buttons, which run the same booking rules as a real owner. Demo and real members never see each other; **Reset demo data** removes all of it and never touches real members.

## 7. Card 2 — Shayari Mode

| Requirement | Where it works |
|---|---|
| 1. "Make it rhyme" in the booking chat: Urdu / Roman Urdu / English, Friendly / Funny, review before sending | Booking chat |
| 2. Faraway (exception) request: private details removed first, rhyme made from the safe version, owner sees "Anonymous borrower" | Request page / direct request |
| 3. Thank-you rhyme only after everything is confirmed back; ratings stay separate | Finished booking |
| 4. One shared generator and one shared display | `makeShayari`, `Shayari.tsx` |

A reviewed rhyme is sent once, only to the chat it was made for, and never changes a booking.

## 8. Architecture

- **App:** TanStack Start (React 19, TypeScript, Tailwind CSS v4), installable web app (PWA), runs on Lovable's edge hosting.
- **Backend:** Lovable Cloud — Postgres database with row-level security, email sign-in, private photo storage, hourly background job for reminders and expiry.
- **Rules in the database:** every booking change (send, answer, cancel, pickup, return, change requests, ratings, reports, admin decisions) is a locked database function that checks who is calling. Clients can only read bookings.
- **Server functions:** `src/lib/app.functions.ts`, `src/lib/shayari.functions.ts`; plans in `src/lib/plan.server.ts`; demo generation in `src/lib/demo-gen.server.ts`.
- **Database history:** `drizzle/migrations/0000–0014`.

## 9. Setup and deployment

```sh
npm i
npm run dev   # http://localhost:8080
npm test      # automatic checks
```

Public browser settings are in `.env` (example: `.env.example`). Server secrets (AI key, database service key) are managed by Lovable Cloud and are not in the repository. Database changes are the numbered files in `drizzle/migrations`, applied in order. Publishing is done from Lovable (Publish).

## 10. Verification results (10–11 Nov 2026)

**Automatic checks:** 119 passed (pricing, quantity changes, stock limits, privacy cleaning, distance wording, demo generation rules).

**Live AI (real calls):** Roman Urdu requests and follow-up questions; fictional listings for 5 glue guns (3 + 2, free, within 5 km); faraway-note cleaning; Shayari in Urdu (chat, phone size, right-to-left), Roman Urdu (faraway note) and Roman Urdu + English (thank-you).

**Browser tests on the running app (passed):**
- Full 5-glue-gun demo: exact dates, 3 + 2 plan, one decline, approved replacement of 2, pickup of 5, partial return ("Ahmed is still owed 1"), final return, thank-you rhymes, ratings.
- Normal members (not demo): add a listing with photo, edit, pause/resume; borrower request with an AI bit-size question; accept, chat, meeting, pickup, return, both ratings. Normal members saw no demo data.
- Editing a search (amount, budget, dates, distance, new must-have) reuses fitting results and creates only what's missing.
- Two borrowers racing for the last fictional item: exactly one booked; the other got a clear message and a replacement.
- Network: offline send + reconnect, a lost server reply, a stalled send (stops after 20 s with retry), drafts after reload, alerts missed while offline, a chat closed while a message waited — each gave one copy or a clear reason. Sign-out clears saved typing.
- Phone layout at 320, 360, 390 px and desktop on 10 screens.

**Simulated, not real:** fictional owners' yes/no/confirm taps (presenter buttons); AI timeout / no-balance / bad-answer / interrupted-save were forced with a demo-only test switch, not real provider outages.

**Backend permission checks (passed):** no access to other people's messages or photos; members cannot make themselves admin, change demo flags, create fictional inventory, use presenter actions or reset the demo; the demo area admin cannot see or decide real members' reports; reset during AI creation leaves nothing behind.

**Untested:** email delivery of sign-up/reset emails (test members were created directly); install, GPS and fonts on a physical phone.

## 11. Known limitations

- No in-app payments (payment is only reported), no phone lock-screen notifications, no branded email domain.
- One community (Multan); identity check uses a test number in this MVP.
- Physical-phone install/GPS/font checks are pending.
- GitHub is not connected; the project owner must connect it in Lovable (Connectors → GitHub). Lovable then syncs the code automatically.
