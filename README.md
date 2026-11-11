# Cheez Udhaar

Borrow and lend useful things with neighbours. Starts with one community in **Multan**. One account can both borrow and lend. Requests and messages can be written in English or Roman Urdu.

Built with Lovable: TanStack Start (React, TypeScript, Tailwind CSS), Lovable Cloud (database, email sign-in, private photo storage) and Lovable AI (server-side only).

## Setup

```sh
npm i
npm run dev        # http://localhost:8080
npm test           # automatic checks for pricing, quantity changes, stock limits, privacy labels, offline guard
```

Configuration lives in `.env` (see `.env.example`). Only public browser keys are in it. Server secrets (the AI key and the database service key) are managed by Lovable Cloud and are never stored in the repository.

- Database changes: `drizzle/migrations/*.sql` (applied in order). Business rules that change bookings run inside the database (see `AGENTS.md`).
- Server functions: `src/lib/app.functions.ts`; AI calls: `src/lib/ai.server.ts`; matching plans: `src/lib/plan.server.ts`.

## Demo (two devices)

Judges need no personal account: sign in with any demo account below. Demo accounts are fictional and only ever see each other (real members never see them, and demo accounts cannot reach real members' data). Password for all: `CheezDemo2026` — public on purpose, for demo accounts only.

| Account | Email | Role |
|---|---|---|
| Ali | ali.demo@cheezudhaar.test | borrower |
| Bilal | bilal.demo@cheezudhaar.test | owner: 20 chairs (back by 4 PM), HDMI projector |
| Sara | sara.demo@cheezudhaar.test | owner: 12 chairs, drill |
| Usman | usman.demo@cheezudhaar.test | owner: 8 chairs, VGA-only projector |
| Hina | hina.demo@cheezudhaar.test | owner: 8 chairs, glue (Rs 15 per 5 ml) |
| Farah | farah.demo@cheezudhaar.test | owner: tent 6 km away (allows exceptions) |
| Zainab | admin.demo@cheezudhaar.test | Multan area admin |

1. Phone A: sign in as **Ali**. On Find type: `Sunday ko 20 kursiyan chahiye, 1 baje le jaunga, shaam 6 baje wapas` → Find items.
2. Ali sees the exact dates, then a plan with **Owner A 12 + Owner B 8** (Bilal is left out: he needs them back by 4 PM). Tap **Send 2 requests**.
3. Phone B: sign in as **Sara** → Activity → **Yes, lend it**. Sign out, sign in as **Usman** → **No, sorry**.
4. Phone A: the request page shows “12 confirmed — 8 still needed” and a replacement (Owner C, Hina's 8) → **Send request to Owner C**. Phone B: sign in as **Hina** → Yes.
5. Optional: Ali types `Actually 20 ki jagah 18 chahiye` → sees old vs new → **Yes, make this change**. Hina opens the booking → **Accept the change** (nothing changes until she says yes).
6. On Sara's booking (Inbox): chat, Ali taps **I collected these items**, Sara taps **Confirm**. Ali returns 11 → Sara confirms → “11 of 12 returned — 1 still due”. Ali returns the last one → Sara confirms → both rate.
7. Profile → **Reset demo data** puts everything back (real members' data is never touched). The same steps are in the app: Profile → **Demo guide**.

### AI demo results (one device, any item)

When the demo neighbours don't have enough, demo accounts get **fictional** owners and listings created live by AI for the missing amount only (labelled "AI demo results — fictional", "Demo item", "Simulated owner", "Sample photo unavailable"). Real members never see them.

1. Ali → Find: `Budhwar shaam 5 baje 5 glue guns chahiye, Jumeraat shaam 5 baje wapas, budget zero` → answer the detail question (full-size or mini, sticks).
2. AI creates e.g. Owner A 3 + Owner B 2, free, within, distance and times (checked by the server and the database). Saved results are reused on reload; **Create another sample plan** replaces them before sending.
3. Send → **Simulate owner accepting** / **Simulate owner declining** (a no brings a replacement for only the missing amount, approved by Ali).
4. Booking: **I collected these items** → **Confirm pickup as owner**; return fewer → **Confirm return as owner** ("1 still due"); **Owner shares a meeting time**; chat and Make it rhyme work as usual.
5. Profile → **AI demo results** switch turns it off. **Reset demo data** removes every fictional owner, listing and booking.

Submission documents: [`docs/MVP.md`](docs/MVP.md) (MVP document) and [`docs/SUBMISSION.md`](docs/SUBMISSION.md) (form answers).

## Links

- **Live app:** https://lasting-project-notes.lovable.app
- **GitHub:** https://github.com/zohazin/project-brain-trail (branch `main`; Lovable keeps it in sync automatically)
- **MVP document:** [`docs/MVP.md`](docs/MVP.md) · **Submission answers:** [`docs/SUBMISSION.md`](docs/SUBMISSION.md)

## Published app

https://lasting-project-notes.lovable.app — installable from the browser (Install app on Profile; iPhone: Share → Add to Home Screen). Reminders and request expiry run every hour in the background.

## What this MVP does

Neighbours in Multan ask for things in English or Roman Urdu. The AI reads the request (dates, amount, must-have features) and checks which listings are the right kind of item; the database checks real stock, times, distance and price. The person sees one plan with exact totals, owners stay anonymous until they say yes, and a replacement is found if someone says no. Bookings cover chat, meeting place, pickup and return confirmed by both sides, partial returns, change requests that need the other person's yes, ratings and reports to an area admin.

Not included yet: payments inside the app (payment is only reported), phone push notifications, branded emails with a typed code.

## Mystery Card

Card: **Card 2 — Shayari Mode.** Status: **Built; all three places tested end to end with live AI on 10–11 Nov 2026** (chat in Urdu on a phone-size screen, faraway note in Roman Urdu, thank-you in Roman Urdu and English).

| Required point | Status | Where |
|---|---|---|
| 1. Booking chat: "Make it rhyme" beside Send, Urdu / Roman Urdu / English, Friendly / Funny, review before sending | Done and tested (sent, received, reload, one copy on double tap) | `inbox.$requestId.tsx` Chat, `Shayari.tsx` |
| 2. Faraway (exception) request: anonymity cleaning first, rhyme from the safe version, owner sees "Anonymous borrower" | Done and tested live (phone number, address and name removed from source, rhyme, meaning, owner view and notifications) | `need.$wantId.tsx` ExceptionCard, `DirectRequest.tsx`, `safe-note.server.ts` |
| 3. Thank-you card only after the final return is confirmed | Done and tested (hidden at 11/12, shown at 12/12, ratings unchanged) | `inbox.$requestId.tsx` SayThanks |
| 4. One shared generator and one shared display | Done | `shayari.functions.ts` `makeShayari`, `Shayari.tsx` `ShayariView` |

"Make it rhyme" turns a message into exactly two rhyming lines plus a plain meaning. Nothing is sent until the person reviews it and taps **Send** (or **Send original**).

**Demo:** sign in as Ali → Profile → **Prepare Shayari demo** (resets demo data, then sets up a projector chat with Usman, a 12-chair booking with Sara with 1 chair still out, and a camping-tent search 6 km from Farah). Rhymes are never prepared: type any new message. The steps are in the in-app Demo guide → "Shayari demo".

Rules kept: anonymity cleaning only hides or deletes (never adds or reorders words); phone numbers in any format (+92, spaces, dots, brackets, Urdu digits), emails, @handles, links and house numbers are hidden, and unclear numbers make the sender edit; the rhyme may use new poetic words but must keep items, numbers, times, prices and intent (checked by rules plus a second AI reader, with one correction); old results are dropped when text, language or tone changes; each reviewed rhyme is sent once; previews are visible only to their author; blocked chats, paused accounts and closed searches can't send.

## Three-minute presentation

Before: Profile → **Reset demo data** on Ali. Phone A = Ali, Phone B = owner accounts (or one device, using the simulate buttons).

1. **Problem (20 s).** "A family in Multan needs glue guns for one evening. Buying is wasteful; neighbours have them but nobody knows who."
2. **Fresh request (20 s).** Ali → Find: `Budhwar shaam 5 baje 5 glue guns chahiye, Jumeraat shaam 5 baje wapas, budget zero`.
3. **One useful question (15 s).** The AI asks once (full-size or mini / glue sticks). Answer it.
4. **Plan + labels (25 s).** Exact Karachi dates, Owner A 3 + Owner B 2, free, within 5 km. Point at **AI demo results — fictional**, **Demo item**, **Sample photo unavailable**. Send.
5. **Decline + replacement (25 s).** **Simulate owner accepting** on A, **Simulate owner declining** on B → a replacement for only the 2 missing → approve → accept.
6. **Pickup + partial return (30 s).** Booking: **I collected these items** → **Confirm pickup as owner**. Return 2 of 3 → owner confirms → "still owed 1". Stock changes only when the owner confirms.
7. **Shayari (30 s).** In the chat type a real message → **Make it rhyme** → switch Urdu / Roman Urdu / English → show the plain meaning → Send. (Or Profile → **Prepare Shayari demo** for the faraway-note and thank-you examples.)
8. **Benefit + limits (15 s).** Idle things get used, neighbours stay anonymous until yes. Not yet: in-app payment, phone push alerts, real-phone install checks.

### Likely questions

- **Why AI here?** People describe needs loosely and in Roman Urdu. The AI turns that into item, amount, dates and must-haves, asks the one question that matters, and checks "is this the right kind of item".
- **What does the database decide?** Everything that counts: free stock at those times, owner hours, distance, price (`price_for`), and every booking change. The AI never books anything.
- **How is double-booking prevented?** Every yes runs in one locked database step that re-checks free stock; two people racing for the last item → exactly one wins, the other gets a clear message and a replacement (tested).
- **How are identities protected?** Owners show as "Owner A/B" and borrowers as unnamed until a yes; faraway notes are cleaned of names, numbers and addresses; photos are private and shared only via links that expire after an hour; exact addresses are shared only by choice, per booking.
- **What is simulated?** Only for demo accounts: fictional owners and listings created by AI, and their yes/no/confirm taps (presenter buttons running the normal rules). Real members never see them.
- **How would a community start with real inventory?** Members sign up, pick their area, and list what they own with photos, hours, distance and price; an area admin handles reports. Demo data stays separate and can be switched off.

## Physical-phone checklist (not yet done on a real phone)

1. Open https://lasting-project-notes.lovable.app on Android Chrome → Profile → **Install app**; on iPhone Safari → Share → **Add to Home Screen**. Open from the home screen: no browser bar.
2. Sign in, turn on airplane mode, reopen the app: the offline note shows and typed text is kept; turn it off: the message sends once.
3. During sign-up or when adding a listing → **Use my location**: allow GPS, check the area chosen is right.
4. Make a rhyme in **Urdu**: letters are joined, right-to-left, nothing cut off; the keyboard doesn't cover the Send button.
5. After the next publish, reopen the installed app: an **update / Reload** note appears and drafts survive.
