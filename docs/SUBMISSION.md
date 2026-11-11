# Cheez Udhaar — submission answer pack (TECHSoc Hackathon 2026)

**The submission form could not be read:** https://forms.gle/Wz1n43ZNJq3XoP2Y7 asks for a Google sign-in, so its exact questions are unknown. These are general answers; copy each into the matching field. **Do not invent personal details** — fill the `[placeholders]` yourself. Only **one** team member submits, **once**.

Deadline: the organizers said "tomorrow at 9:00 AM sharp"; the exact date was not confirmed here — check the original announcement.

## Team details (fill in)

- Team ID: `[Team ID]`
- Team name: `[Team name]`
- Members (name — roll number): `[Name 1 — Roll no.]`, `[Name 2 — Roll no.]`, `[Name 3 — Roll no.]`
- Contact email / phone: `[Contact email]` / `[Contact phone]`
- Institution / department: `[Institution]`
- Mystery card received: **Card 2 — Shayari Mode**

## Links

- **Live app:** https://project-brain-trail.lovable.app
- **GitHub:** https://github.com/zohazin/project-brain-trail (not publicly visible; organizer invited as collaborator)
- **MVP document:** https://github.com/zohazin/project-brain-trail/blob/main/docs/MVP.md
- **This answer pack:** https://github.com/zohazin/project-brain-trail/blob/main/docs/SUBMISSION.md

## Project name

Cheez Udhaar

## One-sentence pitch

Cheez Udhaar lets neighbours in Multan borrow and lend everyday things by simply describing what they need in English or Roman Urdu, with AI understanding the request and the database guaranteeing honest stock, times and prices.

## Problem statement

Families often need things for a few hours — 20 chairs for an event, a projector, a drill, glue for a school project — and end up buying something they will use once, renting at a high price, or phoning around. The same things sit unused in nearby homes, but there is no easy, private and trustworthy way to find them, agree on amounts and dates, and make sure they come back.

## Proposed solution

A mobile-first web app for one community. A borrower types a need in their own words; the app asks one useful question if something important is missing, then shows one plan that combines several neighbours, with exact dates, distances and the total price. Owners stay anonymous until they say yes. If someone says no, a replacement for only the missing amount is offered. Each booking has a private chat, meeting time and place, pickup and return confirmed by the owner (including partial returns), change requests that need the other side's yes, ratings, and problem reports reviewed by an area admin.

## Main features

- Natural-language requests in English or Roman Urdu (with optional photo); one follow-up question when needed.
- Exact pickup/return dates in Karachi time shown before sending.
- Multi-owner plans (e.g. 12 + 8 chairs), "why it fits / why not" for each listing.
- Prices: free, per booking, per day, or per amount used (e.g. Rs 15 per 5 ml).
- Anonymous requests; names revealed only after an owner says yes.
- Automatic replacement search after a decline, approved by the borrower.
- Booking page: chat, meeting suggestions, optional exact address and photo per person, pickup/return tracking with "1 still due".
- Changes to an agreed booking need the other person's yes.
- Ratings, problem reports, area-admin decisions and appeals.
- Hourly reminders and request expiry; in-app notifications.
- Installable on phones; typed text survives a lost connection.

## AI contribution

The AI (Lovable AI, server-side only) turns loose requests into item, amount, dates, budget and must-have features; asks the one question that matters; checks whether a listing is the right kind of item and has the must-have features; removes names, phone numbers and addresses from faraway-request notes; writes the Shayari rhymes and checks their meaning; and, for demo accounts only, creates clearly labelled fictional listings when the demo stock is short. The AI never decides stock, availability, distance, price or who gets an item — the database does — and the app never shows an invented AI reply.

## Mystery card: Card 2 — Shayari Mode

"Make it rhyme" turns a message into exactly two rhyming lines with the plain meaning shown below, in Urdu, Roman Urdu or English (Friendly or Funny). The original message's facts — items, numbers, times, prices and who is asking — are kept and checked; the original can always be shown or sent instead, and nothing is sent until the person reviews it. It works in three places: the booking chat, faraway requests (private details removed first, owner sees "Anonymous borrower") and a thank-you card that appears only after the final return is confirmed.

## Technology stack

TanStack Start (React 19, TypeScript), Tailwind CSS v4, installable web app (PWA); Lovable Cloud (Postgres with row-level security, email sign-in, private photo storage, hourly background job); Lovable AI (model `openai/gpt-6-astra`); Vitest for automatic checks.

## Public benefit

Things already owned in a neighbourhood get used instead of bought again, which saves money and reduces waste. Families get what they need nearby, lenders can share freely or earn a little, and privacy is protected: no names before a yes, private photos, addresses shared only by choice, and problems handled by a human area admin.

## Demo instructions

No personal account is needed. Open https://project-brain-trail.lovable.app → **Sign in** → `ali.demo@cheezudhaar.test`, password `CheezDemo2026` (public demo password; demo accounts are fictional and only see each other).

1. Find: `Budhwar shaam 5 baje 5 glue guns chahiye, Jumeraat shaam 5 baje wapas, budget zero` → Find items.
2. Answer the one question (e.g. `Full-size, sticks bhi chahiye`).
3. See the plan with exact dates and the **AI demo results — fictional / Demo item / Simulated owner** labels → Send.
4. **Simulate owner accepting** / **Simulate owner declining** → approve the replacement.
5. Booking: I collected these items → Confirm pickup as owner → return fewer → Confirm return as owner ("still due") → return the rest.
6. Say thanks → Make it rhyme → choose language → Send.

The owner taps in steps 4–5 are simulated by the presenter and run the same rules as a real owner. Profile → Reset demo data restores the demo. Full steps: README "Three-minute presentation" and the in-app Demo guide.

## Known limitations

- No in-app payments (payment is only reported); no phone lock-screen notifications; sign-up email has a link, not a typed code.
- One community (Multan); identity uses a labelled test number, not a real check.
- Not yet tested on a physical phone: installing, GPS, keyboard behaviour, Urdu font rendering; sign-up/reset email delivery not tested in this copy.
- Demo owners and some demo listings are fictional and clearly labelled.

## Checklist for the submitting member

- [ ] Open the form while signed in to Google and compare its questions with the sections above.
- [ ] Fill in Team ID, team name, member names, roll numbers and contact details.
- [ ] Paste the live app, GitHub and MVP-document links.
- [ ] Confirm the organizer accepted the GitHub collaborator invitation (repository → Settings → Collaborators).
- [ ] Open the live app once and sign in as Ali to be sure it loads.
- [ ] Submit **once**, before the deadline, from **one** account only.
