# Cheez Udhaar — MVP document (TECHSoc Hackathon 2026)

- **Published app:** https://project-brain-trail.lovable.app
- **GitHub repository:** https://github.com/zohazin/project-brain-trail (branch `main`; not publicly visible, so reviewers need collaborator access)
- **Submission answers:** [`docs/SUBMISSION.md`](SUBMISSION.md)
- **Status date:** 11 November 2026 (Asia/Karachi)

*No official example MVP document was provided, so this uses a plain practical structure.*

## 1. Community problem and intended users

When a family in Multan needs 20 chairs for one evening, a drill for an hour or glue for one school project, they buy something they will use once, rent at a high price, or phone around. The same things sit unused in nearby homes, but nobody knows who has them, and asking strangers raises worries about privacy, unclear amounts, late returns and "who agreed to what".

**Intended users:** neighbours in one community (starting with **Multan**) who want to borrow or lend everyday things. One account can both borrow and lend. People write in **English or Roman Urdu**; rhymes can also be made in Urdu script. An **area admin** handles problem reports for their own area.

## 2. Borrower and lender workflow

**Borrower**
1. **Find** — types a need in their own words, e.g. `Sunday ko 20 kursiyan chahiye, 1 baje le jaunga, shaam 6 baje wapas` (a photo can be added).
2. **One useful question** — if something critical is missing (return time, full-size or mini glue gun, drill-bit size), the AI asks one question.
3. **Plan** — sees exact pickup and return dates (Karachi time), one combined plan across owners (e.g. Owner A 12 + Owner B 8), pickup areas, distances and the exact total. Owners appear as "Owner A/B" until they say yes; listings that don't fit say why (e.g. "needs them back by 4 PM").
4. **Send** — one tap sends all requests; the agreed details and price are saved at that moment.
5. **Replacement** — if an owner says no, the app offers a replacement for only the missing amount, which the borrower approves before anything is sent.
6. **Booking** — chat, a meeting time and place, an optional exact address and photo (each person decides for themselves), pickup and return reports, partial returns ("11 of 12 returned — 1 still due"), change requests, ratings, and Report a problem.

**Lender**
1. **My Items → Add** — photos, description, amount, condition, accessories, available days and hours, how far a borrower can be, whether faraway requests are allowed, and a price (free, per booking, per day, or per amount for things that are used up, e.g. Rs 15 per 5 ml).
2. **Activity** — sees an anonymous request with the exact amount, dates and total; answers **Yes, lend it** or **No, sorry** (or no and block).
3. **Handover** — confirms pickup and return amounts. Stock changes only when the owner confirms.

## 3. What the AI actually does at runtime

All AI calls run on the server through Lovable AI (model `openai/gpt-6-astra`, `src/lib/ai.server.ts`). The AI:

- reads a free-text request (English or Roman Urdu, optional photo) into item, amount, dates, budget, distance and must-have features, and asks one follow-up question when something critical is missing;
- writes a private summary of each listing and each request, and judges whether a listing is the **right kind of item** and whether a must-have feature is missing, using the listing's own description and specs;
- cleans faraway-request notes of names, phone numbers and addresses (it may only hide or delete words, and fixed rules check again afterwards);
- writes Shayari (two rhyming lines plus a plain meaning), and a second reading checks the meaning was kept;
- for **demo accounts only**, writes fictional listings when the demo neighbours don't have enough.

The AI **never** decides stock, availability, times, distance, price or who gets an item. If the AI is unavailable, the person sees a clear message and **Try again**; no reply is ever invented.

## 4. Matching, quantities, availability and booking rules

- **Matching:** the database (`match_items`) finds candidates and checks real free stock at the requested times, the owner's days and hours, both people's distance limits (straight line) and the budget. The AI only filters "right kind of item / must-have missing".
- **Quantities:** a plan can combine several owners; each line is checked against stock already promised to other bookings for overlapping times. Amounts can be decimals for things that are used up (ml, grams).
- **Price:** computed by the database (`price_for`) and shown before sending; a request whose total differs is refused.
- **Booking changes:** every yes, no, cancel, pickup, return, rating, report and admin decision is one locked database step that checks who is calling. Two people racing for the last item → exactly one wins; the other gets a clear message and a replacement.
- **Changing an agreed booking** (dates or amount) needs the other person's yes; old vs new is shown first.
- **Handover:** the borrower reports, only the owner confirms; impossible numbers (more than agreed, more back than collected) are refused and every step is kept in a history.
- **Privacy:** owners show as "Owner A/B" and borrowers stay unnamed until a yes; photos are private and shown only through links that expire after one hour; exact addresses are shared only by choice, per booking.
- **Background:** an hourly job sends reminders and expires requests whose pickup time has passed, even when the app is closed.

## 5. Fictional demo inventory and simulated owner actions

- Seven **fictional demo accounts** (Ali, Bilal, Sara, Usman, Hina, Farah, Zainab) and 10 seeded demo items exist for testing. Demo and real members never see each other.
- When a demo search needs more than the demo neighbours have, AI creates **fictional owners and listings only for the shortfall**. Each one is labelled on screen: **"AI demo results — fictional"**, **"Demo item"**, **"Simulated owner"**, distances marked **"(simulated)"**, and **"Sample photo unavailable"** (no fake photos).
- **Simulated owner actions:** the presenter taps **Simulate owner accepting / declining**, **Confirm pickup as owner**, **Confirm return as owner** and **Owner shares a meeting time**. These run the same database rules as a real owner, acting as that fictional owner. Nothing happens automatically.
- Profile → **AI demo results** switch turns this off. **Reset demo data** removes every fictional owner, listing and demo booking and never touches real members.

## 6. Card 2 — Shayari Mode

"Make it rhyme" turns a message into **exactly two rhyming lines** plus a **plain meaning** shown underneath. The person chooses **Urdu, Roman Urdu or English** and **Friendly or Funny**.

- **Message preserved:** items, numbers, times, prices and who is asking must stay the same (checked by rules plus a second AI reading, with one correction). The original message is kept and can be shown with **Show original message**; **Send original** is always offered.
- **Review first:** nothing is sent until the person checks it and taps **Send**. A reviewed rhyme is sent once, only in the chat it was made for, and never changes a booking or a rating.

| Where | How it works |
|---|---|
| Booking chat | "Make it rhyme" appears beside Send once a message is typed |
| Faraway (exception) request | Names, phone numbers and addresses are removed first; the rhyme is made from the safe version; the owner sees "Anonymous borrower" |
| Thank-you card | Only after the final return is confirmed by the owner |
| Shared parts | One generator (`makeShayari`) and one display (`ShayariView`) |

## 7. Architecture

- **App:** TanStack Start (React 19, TypeScript, Tailwind CSS v4), an installable web app, hosted on Lovable's edge hosting.
- **Backend:** Lovable Cloud — Postgres database with row-level security, email sign-in, private photo storage, hourly background job.
- **Rules in the database:** booking changes are locked database functions; the app can only read bookings.
- **Server code:** `src/lib/app.functions.ts`, `src/lib/shayari.functions.ts`; plans in `src/lib/plan.server.ts`; demo generation in `src/lib/demo-gen.server.ts`; AI in `src/lib/ai.server.ts`.
- **Database history:** `drizzle/migrations/0000–0014` (applied in order).

## 8. Setup and deployment

```sh
bun install        # or: npm i   (lockfile: bun.lock)
bun run dev        # http://localhost:8080
bun run test       # 119 automatic checks
```

Public browser settings go in `.env` (see `.env.example`; only public keys). Server secrets (the AI key, the database service key) are managed by Lovable Cloud and are never stored in the repository. A new backend needs the migrations in `drizzle/migrations` applied in order and a private storage bucket named `photos`. Publishing is done from Lovable (Publish); the live app is https://project-brain-trail.lovable.app.

## 9. How to demonstrate

No personal account is needed. All demo accounts use the public demo password **`CheezDemo2026`**; they are fictional, see only each other, and cannot reach real members' data. Sign-in page → **Sign in** → e.g. `ali.demo@cheezudhaar.test`. The sign-in page and Profile also have an in-app **Demo guide**.

Three-minute sequence (one device, using the simulate buttons):
1. Ali → Find: `Budhwar shaam 5 baje 5 glue guns chahiye, Jumeraat shaam 5 baje wapas, budget zero` → **Find items**.
2. The AI asks one question (e.g. "Mini glue guns chahiye ya full-size, aur glue sticks bhi saath chahiye?") → answer `Full-size, sticks bhi chahiye`.
3. Plan: exact dates, Owner A + Owner B (e.g. 3 + 2), Free. Point at **AI demo results — fictional**, **Demo item**, **(simulated)** distances, **Sample photo unavailable**. → **Send 2 requests**.
4. **Simulate owner accepting** on one, **Simulate owner declining** on the other → a replacement for only the missing amount → approve → accept. *(Owner taps are simulated by the presenter.)*
5. Open a booking → **I collected these items** → **Confirm pickup as owner** (simulated). Return fewer → **Confirm return as owner** → "… still due". Return the rest → confirmed.
6. After the final return: **Say thanks** → **Make it rhyme** → pick Urdu / Roman Urdu / English → show the plain meaning → **Send**.

Before or after: Profile → **Reset demo data**. For the faraway-note example: Profile → **Prepare Shayari demo** (this also resets the demo).

## 10. Verified testing

**Run on 11 Nov 2026 (this final pass):**
- 119 of 119 automatic checks passed (pricing, quantity changes, stock limits, privacy cleaning, distance wording, demo generation rules).
- Live smoke test of the published app in a fresh browser (desktop size): page loaded (200); demo sign-in as Ali; a fresh glue-gun request → AI asked one question → a valid plan of 2 fictional owners, Free, with Wed 11 Nov 5:00 PM pickup and Thu 12 Nov 5:00 PM return; labels "AI demo results — fictional", "Demo item", "Simulated owner", "(simulated)" visible; sent and simulated yes → "All 5 confirmed"; booking chat showed Make it rhyme with Urdu / Roman Urdu / English and Friendly / Funny and produced a two-line Roman Urdu rhyme with plain meaning (not sent); refreshing the booking page kept it open; sign-out left no saved private data and reopening the booking sent the visitor to sign-in. No page errors. The demo was reset afterwards.

**Reported from earlier passes (10–11 Nov 2026, not repeated now):**
- Full 5-glue-gun run with decline, replacement, pickup, partial return, final return, thank-you rhymes and ratings; 20-chair split with a decline and replacement.
- Normal (non-demo) members: listing with photo, edit, pause, request with an AI question, yes, chat, meeting, pickup, return, both ratings; normal members saw no demo data.
- Two borrowers racing for the last item: exactly one booked.
- Shayari in the chat (Urdu, phone-size screen), faraway note (private details hidden in the source, rhyme, meaning, owner view and notifications) and thank-you card (Roman Urdu and English).
- Network: offline send and reconnect, lost reply, stalled send stops after 20 s with retry, drafts survive reload, sign-out clears saved typing.
- Phone-size layouts in a desktop browser at 320, 360 and 390 px.
- Permissions: no access to other people's messages or photos; members cannot make themselves admin, change demo flags, create fictional inventory, use presenter buttons or reset the demo; the demo admin cannot see real members' reports.

**Simulated, not real:** fictional owners and their taps (presenter buttons); AI timeout / no-balance / bad-answer / interrupted-save were forced with a demo-only test switch.

**Untested:** delivery of sign-up and password-reset emails in this copy; installing the app, GPS, keyboard behaviour and Urdu font rendering on a physical phone.

## 11. Known limitations

- No in-app payments (payment is only reported), no phone lock-screen notifications, no branded email domain (sign-up email has a link, not a typed code).
- One community (Multan); identity uses a clearly labelled test number, not a real check.
- Live updates refresh every few seconds rather than instantly.
- Distances are straight-line estimates.
- Physical-phone checks are pending (see README "Physical-phone checklist").
