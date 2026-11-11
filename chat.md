# Project Memory (chat.md)

Central reference for project context. Read this first in every session; update it whenever new info, files, or instructions arrive.

## Current status — this project (updated 2026-11-10)
- **This Lovable project is a fresh copy of Cheez Udhaar**, created from the exported zip `lovable-36845aad-2026-11-10.zip` (uploaded with `query5371.txt`, which said "just import this whole code 100% full").
- Everything below this section is the history carried over from the original project (published at https://everready-project-guide.lovable.app). This copy has **its own new Lovable Cloud backend** and is **not published yet**.
- Imported and checked (2026-11-10):
  - All app code, pages, icons, tests and settings from the zip (file-by-file identical; the zip's private `.env` was not used — this project has its own).
  - Database rebuilt by re-running all 14 original database steps (0000–0013), each checked identical to the original.
  - Private `photos` storage, email/password sign-in, hourly background job for reminders/expiry, AI (Lovable AI) all set up.
  - Demo accounts and 10 demo items exist (password `CheezDemo2026`).
  - 86/86 automatic tests pass; build OK.
  - Browser check: home page, sign-in as Ali (demo), Find screen lists nearby demo items; a real Roman Urdu search got an AI follow-up question ("Budget kitna hai?") — so AI works here. Test search deleted afterwards.
- Not carried over (not in the zip):
  - Demo item photos (old project used Wikimedia Commons photos stored in its storage) — demo items show a placeholder picture.
  - Any real members, their records and uploaded photos from the old project (old chat.md says test accounts were removed; a data export would be needed if real members existed).
  - Old project's published address, email sender name and settings — this copy needs its own publish; sign-up emails will use this project's name.
- Reported error `src/pages/NotFound.tsx(13,21) TS2741 'children' missing`: **that file/folder does not exist** in the zip or this project (TanStack Start has no `src/pages`); build/type check is clean. Nothing to fix (same as earlier NotFound/App.tsx/main.tsx reports).
- Not tested in this copy: email delivery, real phone install/GPS. (Shayari live tests and the Find chair walkthrough were done 2026-11-10 — see "AI billing check" below.)
- **Published 2026-11-10: https://project-brain-trail.lovable.app** (returned 200 with the Cheez Udhaar title).

## Trial mode + AI demo lenders (request5940.txt, 2026-11-11)
- Request: a real member's 20-chair search found nothing (correct: real members never see demo items). Build a trial experience so anyone can try a full booking, with AI demo lenders that say yes and reply in the normal Inbox chat (also Shayari). Publishing allowed. Reported `src/App.tsx` / GitHub lines: App.tsx does not exist here; GitHub was already connected earlier.
- Why the search was empty: the member (Zohazin) is a real account; demo chairs (Sara 12, Hina 8, Usman 8, Bilal 20) are demo-only. Bilal can't fit 5 PM because his lending hours end at 4 PM (rule kept).
- Built:
  - "Try with sample items" on an empty search and in Profile (real members only). Opens a **separate practice account** (fictional items + AI lenders); real listings/bookings are never used or changed. "Leave trial" (banner and Profile) restores the member's own account.
  - Banner on every page: "Trial mode — fictional items and AI lenders." Listings/matches show "Trial data"; lenders show "AI demo lender — simulated person".
  - Profile switch "Simulate lender acceptance and replies" (on by default). On: AI demo lenders say yes through the normal booking checks a moment after sending, and reply in chat. Off: demo buttons as before.
  - AI lender chat replies: same language as the borrower, only from the saved listing/booking, knows its own share (e.g. 8 of 20, other 12 with another lender), points to "Change amount or dates" for changes, never claims pickup/return. One reply per message; failure shows "The demo lender couldn't reply. Your message is saved. Try again."
  - Demo neighbours answer as AI lenders only for practice accounts; the presenter accounts (Ali etc.) keep the old two-device demo with real-demo owners.
- Verified (phone width 390 px, test member Kashif → trial): 20 chairs Wed 5 PM–Thu 5 PM free → Sara 12 + Usman 8; both said yes automatically; chat in Roman Urdu answered correctly (8 only, other 12 elsewhere; time change → use the change button; "not written in listing" when unsure); a rhyme got a reply; blocked reply showed the failure line and Try again worked; reload made no duplicate replies; Leave trial returned to Kashif with only his real booking. 132 automatic tests pass.
- Not tested: real phone, email delivery. Global "Reset demo data" (presenter accounts) also clears practice-account bookings.

## Remove Lovable badge request (task4920.txt, 2026-11-11)
- Request: remove every Lovable badge/branding and add CSS hiding `#lovable-badge`. Reported `src/pages/NotFound.tsx(7,11)` error: file does not exist here; not applicable.
- Checked: the app's own pages, footer, titles and share tags contain **no** Lovable name or link (author = "Cheez Udhaar"). The only branding on the live site is the "Edit with Lovable" badge that hosting adds on publish.
- Workspace is on the **Free plan**; hiding the badge is a paid-plan setting (Pro or higher). The CSS cover-up was **not added** (it would get around a paid setting). Badge currently shown.
- User-only: upgrade to Pro, then Project settings → General → "Hide 'Lovable' Badge" (or ask the AI to switch it off); then republish.
- Behind-the-scenes build tools and error reporting keep the Lovable name in code only; nothing visible, removing them would break the app.

## Hackathon submission pass (query7663.txt, 2026-11-11)
- Task: finalize Cheez Udhaar for **TECHSoc Hackathon 2026**. Reported `src/App.tsx(14,22)` error: file does not exist here; not applicable (the spec says it is a feature task). User authorised publishing tested fixes.
- **GitHub: connected and synced** — https://github.com/zohazin/project-brain-trail (private, branch `main`). Checked through a GitHub data connection (chat-only, not linked to the app): latest commit on GitHub = latest local commit; all tracked files present (source, server code, 15 migration files, `bun.lock`, README, docs/MVP.md, docs/SUBMISSION.md, `.env.example`). Tracked `.env` holds only public browser keys; no secrets found in tracked files; a throwaway test email was removed from chat.md.
- Collaborator invitation to `techsochackathon-creator` (write access, sent 11 Nov 00:45 UTC): **pending** (not accepted yet, not expired). Only zohazin has access now.
- Submission form https://forms.gle/Wz1n43ZNJq3XoP2Y7 needs Google sign-in → questions unreadable; general answer pack made in `docs/SUBMISSION.md` with placeholders for Team ID, names, roll numbers, contacts. **Do not submit for the user**; one member submits once. Deadline "tomorrow 9:00 AM" — date unverified.
- `docs/MVP.md` rewritten (links, workflow, AI role, rules, fictional demo, Card 2, setup, 3-minute demo, tests split into "run today" vs "earlier", limitations). README: Links section, judge access note (demo password public on purpose, demo accounts restricted).
- Live smoke test of the published app (11 Nov, fresh browser): loads 200; Ali demo sign-in; fresh 5 glue-gun request → one AI question → 2 fictional owners, Free, Wed 11 Nov 5 PM → Thu 12 Nov 5 PM; fictional labels visible; simulated yes → "All 5 confirmed"; chat Make it rhyme (Urdu/Roman Urdu/English, Friendly/Funny) made a two-line Roman Urdu rhyme + meaning (not sent); booking refresh OK; sign-out cleared device data and the booking needs sign-in again. No page errors. **No release-blocking bugs → no app code changed, no republish needed.** Demo reset afterwards (7 demo people, 0 fictional items; only the normal-member drill booking remains).
- 119/119 automatic tests.
- User-only: organizer must accept the invitation; fill placeholders and submit the form once; real-phone checklist.

## Final MVP readiness pass (instruction9187.txt, 2026-11-10/11)
- Reported errors `src/lib/utils.ts(2,6)` / `src/App.tsx` / `src/pages/NotFound.tsx`: those lines don't exist here (utils.ts only has `cn`); not applicable. The attached spec (sections A–M) was the real task; user **authorised publishing** without asking again.
- Fixes this pass: demo-only AI fault switch `?demoFault=timeout|balance|invalid|save` (real members refused); retries reuse saved results and clean up stale runs; race loser for the last fictional item gets a clear message + replacement; typed distance ("10 km ke andar") now sticks; "free ho to behtar" = preference, not free-only; faraway notes drop leftover "call me on [hidden]" / "[hidden] mein hai" bits; chat sends stop after 20 s with "try again" (no endless Sending…), closed chats explain why and aren't resent; small-phone (320 px) top bar/notifications fixed; reasons shown under greyed-out pickup/return/rating/listing-hours buttons; a demo reset during AI creation leaves nothing behind.
- Tested (passed): AI failure screens (simulated), real retry/reuse, two-borrower race, full 5-glue-gun run with decline/replacement/partial return/thank-you/ratings, normal-member listing→booking→ratings, search edits, Shayari DM (Urdu, phone)/faraway (privacy)/thank-you, no rhyme reuse or duplicates, offline/lost-reply/stalled/draft/missed-alert/closed-chat/sign-out, repeat taps on pickup/return/cancel, layouts 320/360/390/1280, reset + permissions (incl. demo admin vs real reports, member reset blocked). 119/119 automatic tests.
- Submission files: `docs/MVP.md` (no official example was available), README (setup, demo, three-minute script, Q&A, physical-phone checklist).
- Test members kept (normal accounts, not demo): final-check-lender / final-check-borrower @cheezudhaar.test with one finished drill booking.
- **Republished 11 Nov 2026** at https://project-brain-trail.lovable.app: checked live (loads, demo sign-in, Find at 320 px, new fixes present).
- (Old: GitHub not connected → **now connected**, see "Hackathon submission pass".) Email delivery untested; physical-phone install/GPS/fonts pending.

## AI demo results (input9218.txt; request7618.txt re-sent 3×) — built 2026-11-10
- Request: demo accounts get fictional owners/listings created **live by AI** when the demo neighbours don't have enough, fully usable in matching, booking, chat, handover and Shayari; never shown to real members. (The attached "errors" `src/pages/NotFound.tsx` / `src/App.tsx` don't exist in this app — not applicable; the spec itself said it is a feature request.)
- Built:
  - Database step **0014_ai_demo_results** (new, old steps untouched): simulated-owner flag + "Show AI demo results" setting on people; AI-created flag/log on listings; requests marked when the owner is simulated; generation log with a unique key per search version (no duplicate AI calls); server-only `sim_owner_act` that runs the normal answer/handover functions **as the simulated owner** (same locks and checks).
  - Server: `src/lib/demo-gen.ts` (checks: 1–3 listings, total ≥ missing, inside search and owner distance, availability covers pickup/return, budget/free, must-haves written in the listing, no contact details, no real demo names) + `src/lib/demo-gen.server.ts` (reuse, retry, "another plan", reset) + one AI call `proposeDemoListings` (one bounded correction if checks fail).
  - Only the **shortfall** is generated; demo stock that fits is used first; replacement after a "no" covers only the missing amount within the remaining budget.
  - Screens: labels "AI demo result", "Fictional demo listing", "Simulated owner", "Sample photo unavailable"; one-time explanation; "Creating sample matches for your demo…"; "Create another sample plan"; Try again only after a failure; demo buttons (accept, decline, confirm pickup, confirm return, owner shares a meeting time); Profile switch "Show AI demo results"; Demo guide + README section.
  - Request helper now asks the one tool detail that matters (e.g. "Mini glue guns chahiye ya full-size, aur saath glue sticks bhi chahiye?").
- Tested on real screens (2026-11-10, live AI): 5 glue guns → AI made 3 + 2 (Rs 550 ≤ 600) → sent → simulated yes (real name "Ahmed" shown) / simulated no → replacement 2 (Rs 300 = remaining budget) → approved → yes → "All 5 confirmed"; collected 3 → owner confirmed; returned 2 → "2 of 3 returned — 1 still due"; meeting time shared; Roman Urdu rhyme sent in chat. 30 chairs → 8 demo chairs + 22 fictional (the answer made "plastic" a must-have); "Create another sample plan" replaced them (old ones removed). Reload reuses saved results (no new AI call). Switch off → no sample listings (phone width 390). Real member check: sees 0 fictional listings, can't call demo owner actions or set the flags. Reset → 0 fictional listings/owners/logs, 7 people and 10 demo items back. 103/103 automatic tests.
- Not tested: an AI failure on this feature (can't be forced safely; same failure messages and Try again as other AI features), install/GPS on a real phone.
- **Second pass (input9218.txt re-sent, 2026-11-10/11):** wording changed to the spec exactly — setting "AI demo results"; one-time text "If a match is missing, AI can create sample items so you can try the full app."; plan label "AI demo results — fictional"; each listing "Demo item"; distances "(simulated)"; failure "Couldn't create sample matches. Your request is saved." with Try again + "Browse demo items on Find". Distance wording ("within 5 km") is no longer treated as an item must-have (rule test added; 104/104 tests).
- Second-pass live tests (real AI): spec example "Budhwar shaam 5 baje 5 glue guns … Jumeraat shaam 5 baje wapas, budget zero, 5 km" → asked "Chhoti glue guns chahiye ya bari?" → Wed 11 Nov 5 PM → Thu 12 Nov 5 PM → **Owner A 3 + Owner B 2, both Free, total Free** → sent → B yes ("Ayesha"), A no → replacement Owner C 3 free → approved → yes ("Hamza") → "All 5 confirmed" → collected 2, returned 1 ("1 of 2 returned — 1 still due"), returned 2 → "Everything is back" → Roman Urdu thank-you rhyme sent → 5-star rating saved. Phone width: "250 gram waterproof wood glue, budget 200" → asked purpose → 250 g at Rs 80 per 100 g = **Rs 200** (paid, consumable, must-have waterproof). Reload reused saved results (log: one AI generation per search version). Demo reset afterwards → 7 people, 10 demo items, 0 fictional records.
- Not live-tested: two demo borrowers racing for the last item (same database locks as before), forced AI failure.

## AI billing check + blocked live tests (request7618.txt, 2026-11-10)
- Reported `src/App.tsx(14,10) 'filterValue'` error: **file does not exist** (no src/App.tsx in TanStack Start); build OK. Not applicable.
- Workspace paying for this project's AI: **this project's own workspace** (Free plan, unified credits — one balance for building, Cloud and AI). AI-spendable at start: 23.90 credits (5 daily + 20 bonus credits, bonus expires 10 Nov 2027); after all tests: 21.96. The earlier 402 belonged to the **original project's** workspace, not this one. The purchase on the user's other account is **not visible here** and was not needed.
- **No workspace move done** — not needed, because this workspace already funds AI. Recorded anyway: project ID 6e59eae0-8bfb-41e2-8a74-800d6989a0b5; backend = this project's own Lovable Cloud; server secrets (names only): LOVABLE_API_KEY (managed), LOVABLE_CRON_SECRET; no other connectors; email = default Lovable sender, link-based confirm (no custom email domain).
- Small authenticated runtime check (admin Zainab → Admin → "Run live check"): **Working**, HTTP 200, provider OpenAI via Lovable AI, model openai/gpt-6-astra. All 28+ AI calls during the tests returned 200; no 402.
- Live tests (separate demo accounts, normal screens, desktop 1280 px):
  - DM: Ali typed "Kal shaam 5 baje projector le sakta hoon?" → Urdu rhyme; meaning kept Ali asking permission ("کیا میں کل شام 5 بجے پروجیکٹر لے سکتا ہوں؟"); Usman saw the same rhyme; original saved with it. PASS
  - Faraway: real Find search for a camping tent → none within 5 km → 10 km → exception card; note with name, phone, house address → shown as [hidden]; fresh Urdu rhyme; sent; Farah sees "Anonymous borrower", rhyme + meaning, "Allow the distance" first; no name/phone/address leaked. PASS (request left waiting for Farah.)
  - Thank-you: Ali returned the last chair, Sara confirmed "All 12 folding chairs are back" → Roman Urdu thank-you rhyme → Sara sees the Thank-you card. PASS
  - Find: fresh "20 folding chairs, Sunday 1 baje" → AI asked "Wapas kab karenge?" → answered 6 PM → plan Owner A 12 + Owner B 8 (free), 4 PM owner "not a fit" → sent 2 → Sara yes, Usman no → "Owner C" (Hina) 8 offered → approved → Hina yes → "All 20 confirmed". No duplicate requests. PASS
- No code changes were needed. 86/86 automatic tests pass; build OK.

## Purpose / Overview
- App name: **Cheez Udhaar** — mobile-first app to borrow and lend things nearby. Starts with one community in **Multan**. One account can both borrow and lend.
- Source: uploaded spec `prompt_pp5685.txt` (2026-11-09). User confirmed "Yes, start now" and "check and do all".

## Spec summary (from prompt_pp5685.txt)
1. **Home & navigation**: after sign-up open Find screen ("What do you need?" text box + Add photo; nearby items with photo, name, qty, approx distance, Free / Rs price). Tabs: Find, My Items, Activity, Inbox (bottom bar on phone, sidebar on desktop). My Items: photos + Add/Edit/Pause. Activity: requests, pickups, returns with next action. Colors: warm white bg, dark teal buttons, charcoal text, amber for attention. Large tap targets; status in words.
2. **Account & location**: email sign-up + password + email confirmation code, resend, password reset. Clearly labelled test CNIC (00000-0000000-0). Private profile photo. "We use your area to find things near you." + "Use my location" / "Choose my area". "How far can you go to pick something up?" 1/3/5/10 km/other; default, changeable per search.
3. **Borrowing & lending**: ask only missing details; lender wizard incl. "How far away can a borrower be?" and "Can people outside this area send you a request?". Kinds: "Bring it back" and "Use it up" (Rs 15 per 5 ml → Rs 30 for 10 ml; deduct at handover; no return).
4. **AI (server-side, real)**: original description + private AI summary for wants and items; re-summarize on change; match via summaries then verify in DB. Roman Urdu. Exact date shown before sending. Wider search, exceptions with one anonymous note (preview), multi-owner split, Requested vs Confirmed, auto-backup for missing amount after decline, ask before new owner.
5. **Meeting & privacy**: private chat per pair; free times + place → suggestion or "choose another time"; owner home pickup + chooses when to share address; photo choice Share/Choose another/Skip.
6. **Returns, ratings, help**: per-owner tracking (19/20), mutual + item ratings shown on listings, Report a problem with private photo, reply, area admin decision + appeals, reminders, restrictions only after human review.
7. **Acceptance test**: demo accounts/items (see below). Never fake AI replies; show setup message when AI/email missing.
- Constraints: no AI-generated images; no technical words in UI; short everyday English.

## Already Built (2026-11-09)
- Lovable Cloud enabled (database, auth with email/password, private `photos` storage bucket).
- Pages: `/` landing, `/auth` (sign up, code entry, resend, sign in, forgot password), `/reset-password`, `/welcome` onboarding (name → test CNIC → photo → area → distance), tabs: `/find`, `/need/:id` (AI conversation + plan), `/my-items` (+ new/edit wizard), `/activity`, `/inbox`, `/inbox/:id` (booking: pickups/returns, meeting, address, photo choice, chat, rating, report), `/profile`, `/admin` (area cases).
- AI (server only, Lovable AI): understands English/Roman Urdu requests, asks one question at a time, summarizes items, filters matches, anonymizes exception notes, reads photos.
- Demo accounts (password `CheezDemo2026`): Ali (borrower), Bilal (20 chairs, back by 4 PM), Sara (12), Usman (8), Hina (8 backup + glue Rs 15/5 ml), Farah (tent, paint, 6 km away, allows exception), Zainab (area admin, Multan). Reset button on Profile for demo accounts.
- Tests: `src/test/pricing.test.ts` (glue pricing rule).

## Verified (2026-11-09, real browser, separate accounts, real AI)
- Roman Urdu request → AI asked "When will you bring them back?" → exact dates shown → plan Sara 12 + Usman 8, Bilal shown as not fitting (back by 4 PM).
- Double tap on send created only 2 requests.
- Sara accepted 12, Usman declined 8 → app automatically found Hina 8 → Ali approved → Hina accepted.
- Recorded 20 picked up, 19 returned → "19 of 20 chairs back. Hina is still owed 1 chair."
- Exception path (tent 6 km away): AI removed name and phone number from the note preview.
- Lender wizard created glue item with AI summary.

## Phase 2 (2026-11-09) — from task5287.txt / instruction1054.txt (identical files)
Goal: make the app reliable for new users and different items. Both uploads carry an error line for `src/pages/NotFound.tsx` (`navItems`); **that file and folder do not exist in this project** and the type check shows no errors, so there was nothing to fix (same as the earlier App.tsx note).

### Real setup (checked)
- Backend: Lovable Cloud (Postgres database, email/password sign-in, private `photos` storage). AI: Lovable AI, model `openai/gpt-6-astra`, called only from the server.
- Records persist: data created in one browser was read from other signed-in browsers and after reloads.
- Preview "couldn't start": not reproducible now — fresh load and reload return 200 with no browser errors. Only harmless "aborted request" lines in the server log.
- Email (tested with a real throwaway inbox): sign-up email arrives from no-reply@auth.lovable-app.email with sender name "Project Memory Hub" (the project's name), subject "Confirm your signup", **link only, no typed code**. Resend works (60 s wait). Link confirms; sign-in works after. Reset email is also a link. Screen now says "tap the link". To get a typed code: set up an email domain (Cloud → Emails), then customise auth emails so the Confirm signup email shows the code.

### Built in phase 2
- Find: "What do you need?", Add photo, "Near [area]" + Change, "Search within [km]" (this search only), Find items; desktop My items photo panel; item cards show photo, name, distance, available qty, Free/price, reviews.
- Owners anonymous ("Owner A/B/C") until they say yes; borrowers unnamed until yes; matching no longer returns owner names; nearby list respects both the borrower's distance and the owner's limit.
- Photo-only or unclear photo → AI guess + "Is that right? If not, tell me what it is." Must-have features saved per request (e.g. HDMI input) and checked against each listing's own description/specs; AI asks one critical-detail question when it matters.
- Pickup area shown per owner in plans; full total before approval; "Search a wider area" with chosen distance; "Save X km as my usual distance" (default unchanged otherwise).
- Exception note preview tells the borrower when contact details were removed.
- Blocks: "Say no and block" / "Block [name]"; Unblock list in Profile. No repeat pending request for the same item; a refused exception isn't offered again for 30 days.
- Each person shares their own exact address per booking; booking shows "What was agreed" (snapshot kept if the owner edits the listing).
- Location: asked only after a tap; refusal message; choose area or drop a pin on a map (OpenStreetMap).
- AI errors show a "Try again" button. Demo items now have real, freely licensed photos (Wikimedia Commons). New demo item: Usman's projector, VGA only (no HDMI).
- Test: `src/test/privacy-labels.test.ts`.

### Phase 2 test results (real accounts, real AI)
- 20 chairs: plan Owner A 12 + Owner B 8, 4 PM owner "not a fit", no names shown; double tap → 2 requests; Sara yes, Usman no → Owner C (Hina) found for 8 → approved → yes; 20 out, 19 back → "Hina is still owed 1 chair." PASS
- Photo-only projector request → AI guessed projector, asked to confirm; must have HDMI → Bilal's offered (Rs 500), Usman's "doesn't fit: no HDMI input". PASS
- New account (signed up via real inbox): location refused → message → map pin → 3 km → Find; later manual area Model Town saved. PASS
- Tent: none within 5 km → Search a wider area → 10 km → exception; note with name + phone → corrected preview; Farah saw no name/phone; usual distance stayed 5 km. PASS
- Drill (1 left): Ali and Usman both requested; Sara accepted both at the same moment → one confirmed, other "no longer enough"; retries made no duplicates. PASS
- Glue 10 ml at Rs 15/5 ml → Rs 30; handover 200 → 190 ml; retry didn't deduct again. PASS
- Ali shared a photo, Sara skipped → Sara sees Ali's, Ali doesn't see Sara's; Hina sees neither. PASS
- Unrelated Bilal: no access to their requests, chat, addresses, photo choices, meeting times, photos, names; can't post in their chat. PASS
- Meeting overlap suggestion / "choose another time"; report → reply → Multan admin decision → appeal → closed; non-admin can't decide. PASS
- Demo data reset afterwards. Test account (throwaway inbox, "Nadia Test") remains from the email test.

### Still open / needs the owner
- Typed code in emails: needs an email domain (owner's choice/plan).
- Sender name shows "Project Memory Hub": rename the project to fix.
- Not tested: real phone GPS success path; live updates are polling (about 5 s).

## Phase 3 (2026-11-09) — from hub_prompt5112.txt / context2829.txt (identical files)
Goal: easier to use, installable on phones, reliable through a full borrowing transaction. Both uploads carry an error line for `src/main.tsx(7,18)`; **that file does not exist in this project** (TanStack Start has no main.tsx) and the code check shows no errors — nothing to fix.

### Built in phase 3
- Project renamed to **Cheez Udhaar** (sign-up emails now come from "Cheez Udhaar <no-reply@auth.lovable-app.email>", checked with a real inbox). Email still has a link, not a typed code (needs an email domain).
- Profile shows **Email: Confirmed** and **Identity: Test number only — not checked** as separate statuses (new `identity_status`).
- Phone: 4 labelled bottom tabs, Profile button + notification bell in the header, safe-area padding, visible keyboard focus, skip link, offline banner. Desktop: sidebar + My items photo panel (each opens the edit screen).
- Find: full-sentence box, Add photo, area, search distance (straight-line note), optional dates/amount/budget (folded away), Find items; request, photo and details are kept on the device (survive opening a listing, going back, reload, failed send). Nearby cards open a **listing page** (area + rough distance, photos, condition, accessories; no owner name) with "Ask for this on Find".
- Installable app: manifest, icons (drawn from the logo, not AI), maskable icon, theme colour, start URL /find, standalone; "Install app" card (shown once) + Profile section; iPhone Safari steps. Offline helper (vite-plugin-pwa) only on the published app; pages network-first, only app files/icons saved, no private data; "new version ready → Reload" prompt.
- Location: progress, denial / timeout / unavailable messages, accuracy shown, "Is that right?" confirm step, area list and map pin always offered. Listing form explains the owner's distance (straight line from the borrower's area to the pickup area).
- Listing form: up to 6 photos, cover, remove, auto-resize, type/size checks, category, condition, accessories, per-booking or per-day price, supply minimum/steps, measured vs estimate, preview, draft kept on failure; can't lower stock below accepted bookings (clear message).
- AI: replies in the person's language, confirms ambiguous times, at most 2 tries per call, user text treated as data; "Actually 20 ki jagah 15" after sending shows exactly which requests change and asks first; plans explain why they fit or what is short.
- Exceptions: owner first "Allow the distance", then answers the booking; note preview says the photo isn't shared.
- Bookings: requests expire after the pickup time; either side can cancel before pickup (owner cancel → replacement search); date-change proposals with clash check; borrower "I collected / I returned", owner confirms (only owner changes numbers); partial amounts; condition photos; payment status is only what people report.
- Chat: unread counts, Sending / Sent / "Not sent — tap to retry", no duplicates on retry, booking summary link; blocking closes chat but keeps the return path.
- Notifications centre (requests, answers, replacements, exceptions, dates, reminders, overdue, confirmations, reports). Polling 15–20 s, paused when hidden, refetch on reconnect. No phone push.
- Ratings: one per person per booking, editable 7 days, counts shown. Reports: missing items, damage, late, behaviour, other; Reported / Under review / Resolved / Appealed / Closed; admin limited to own area and own world (demo vs real).
- Demo vs real: demo accounts only see demo data; demo admin can't open real cases; reset (clear confirmation) touches only demo-to-demo rows. Community impact box on Profile (finished bookings only; no money-saved figure).
- Mystery Card: placeholder `src/features/mystery-card/README.md` (old: status **Not received** → new: **Card 2 — Shayari Mode, built**, see README "Mystery Card"). README has setup + two-device demo steps; `.env.example` added.
- Tests: `src/test/phase3-rules.test.ts` (per-day price, decimal amounts, 20→15/10/25 change, stock peak, offline guard) — 24 tests pass.

### Phase 3 test results (2026-11-09/10)
Desktop browser (1280 px) and phone emulation (360/390 px) on the local preview; no physical phone. Rule tests used separate signed-in accounts against the live database.
- New member signed up (real inbox), confirmed via link, signed in again on a fresh browser, onboarded, listed a desk lamp with 2 photos at Rs 20/day. PASS
- Second new member: photo-only search → AI unsure ("might be a lamp") → corrected in Roman Urdu → plan "Owner A has 2 free near Gulgasht Colony", Rs 40 → sent → owner got notification, accepted on phone, chatted. PASS
- Location refused / manual area: covered in phase 2; GPS success not testable here.
- Last drill, two borrowers: one booking, other "You no longer have enough free". Retry after saved acceptance: no duplicate. PASS
- 20 chairs: Owner A 12 + Owner B 8, double send made no copies, names hidden, decline notified; change 20→10 lowered the accepted booking. PASS
- Owner edited listing after agreement: agreed details unchanged. PASS
- Owner cancelled before pickup: borrower notified once; retry safe. PASS
- Date change clashing with another booking refused; free date applied after owner accepted. PASS
- Partial return 7 of 8 ("1 still due"); borrower can't confirm for the owner. PASS
- Glue 10 ml = Rs 30; wrong price refused; stock 200→190 once. Payment only reported. PASS
- Unrelated account: no booking, messages, date changes, notifications, photo links; can't post or confirm. PASS
- Blocked during an active loan: chat refused, return still recorded and completed. PASS
- Exception: distance allowed separately, then booked; phone number hidden. PASS
- Expired request can't be accepted. Admin can't open another area's case; Multan case → Under review. PASS
- Demo vs real: Ali can't see/reach the real lamp; demo admin can't see real case. Demo reset left real requests, listings, messages, reports, notifications and photos untouched. PASS
- Connection drop: offline banner, message "Not sent — tap to retry" then sent once; meeting save blocked with "Your text is kept". PASS
- 360 px: Find, My Items, Activity, Inbox, Notifications, Profile — no sideways overflow.
- Production build: offline helper written to the published folder with 77 app files + icons, no API/photo caching. Install + offline on a real phone: **not tested** (needs publishing; doesn't run in the editor preview).

### Still open / needs the owner
- Typed email code: needs an email domain (Cloud → Emails) and custom auth email.
- Phone push notifications: not built (in-app notifications only).
- Physical-phone install/offline/GPS tests after publishing.
- (Phase 4: the three throwaway test accounts were removed — see Phase 4.)

## Phase 4 (2026-11-10) — from prompt1619.txt (release preparation)
`src/App.tsx(14,4)` diagnostic: file does not exist here; not applicable.

### Built in phase 4
- Availability wording: "N listed" without dates; server-checked availability for chosen dates; "12 confirmed — 8 still needed".
- Prices per day / per booking / per amount; Quote box with breakdown before sending; quote saved on each booking.
- Booking changes (dates or quantity) need the other person's yes, with old vs new comparison; stale accepts refused.
- Find polish, direct request from a listing, "Why it fits" / "What still needs checking", My Items Add + photo placeholder.
- Handover: impossible numbers refused, history kept on each booking.
- Background job every hour for reminders and expiry (repeat-safe).
- Privacy: members can't change protected profile fields or give themselves roles; photo location data stripped on upload.
- Chat: unsent messages kept on the device and sent once after reconnecting (also after a reload).
- Offline reload no longer sends a signed-in person to the sign-up page; it shows "You're offline" and reopens the page by itself when the connection returns (fixes made after the first publish; republished).
- Demo guide in the app (Profile and sign-in page). README: published URL, MVP description, updated demo steps.

### Phase 4 test results
- 37 automatic tests pass; 40/40 live database rule checks (booking change needs approval, stale accept refused, handover limits, glue stock once, paid quote, unrelated-account and privilege denials).
- Two last-drill acceptances at once: one confirmed, other refused "You no longer have enough free". Exception with phone/email in note: owner sees "[hidden]", no names, must allow distance first.
- Full chair walkthrough with live AI on preview AND on the published app (4 separate accounts): exact Sunday dates, Bilal excluded (back by 4 PM), names hidden, Sara yes / Usman no, replacement Owner C, "All 20 confirmed", 20→18 change accepted by Hina, chat, pickup, 11 of 12 returned → 1 still due, final return, both ratings. No page errors.
- Published app: private pages need sign-in; refresh works on every tab and a booking; 360 px no sideways scroll; offline helper registered; sign-out clears drafts, next account sees none; offline messages saved once.
- Demo reset kept real-member records (checked before the test accounts were removed).
- Test accounts "Nadia Test", "Rabia Real", "Kamran Real" (throwaway inboxes, only interacted with each other) removed. 3 of their private photos remain in storage, unreachable (no listing points to them).
- Not tested: install/GPS/offline on a physical phone; GitHub (no repository connection confirmed — connect via Lovable's GitHub settings).

## Requested Changes
- Build Cheez Udhaar per spec — done for first build (see Already Built).

## Errors / Bugs to Fix
- 2026-11-09: `src/App.tsx(7,19): error TS2554` — **src/App.tsx does not exist** in this project (this framework has no App.tsx); the project's type check passes with no errors. Nothing to fix. User said "check and do all": checked, no such error in this project.

## Task Status
- Completed: phases 1–4 in roadmap.md.
- Import into this project: done (see Current status). Pending: demo item photos (need the photo files), real-member data (only if the old app had real members — needs an export). This copy is published.
- Pending / needs user: email domain for a typed code; push notifications; physical-phone checks after publishing.

## Next Steps
- User: set up an email domain (More → Emails) if they want branded emails with the code inside.
- Optional polish: live updates instead of 5–6 s refresh, push notifications.

## Must NOT Change / Remove / Implement
- Never rewrite the whole project for small changes.
- Never remove existing functionality without explicit permission.
- No AI-generated images in the app (per spec).
- No technical words in the UI; never present simulated AI replies as live.
- Don't ban/restrict users just because complaints were filed (human admin decision only).

## Working Rules (from user)
1. Read all relevant provided files before any task; filenames vary — judge by content.
2. Latest applicable instructions are the source of truth; ask when info is missing/unclear/contradictory.
3. Don't record assumptions as facts.
4. Make only necessary changes; verify where possible; report remaining problems honestly.
5. After each task, summarize: what changed, errors fixed, files modified, what remains, whether chat.md was updated.
6. Preserve history when requirements change (note old -> new).

## Reference Files
| File | Purpose |
|------|---------|
| prompt_pp5685.txt | Full Cheez Udhaar feature spec (summarized above) |
| task5287.txt / instruction1054.txt | Phase 2 spec (identical): reliability, privacy, photo/spec matching, tests |
| hub_prompt5112.txt / context2829.txt | Phase 3 spec (identical): installable app, full booking lifecycle, notifications, demo/real separation, handoff |
| prompt1619.txt | Phase 4 spec: release prep, prices/quotes, booking changes, handover, background reminders, privacy audit, publish, release tests |
| message5893.txt / input7449.txt / input4038.txt / prompt_pp4388.txt | Mystery Card (identical): Card 2 — Shayari Mode in chat, faraway requests and thank-you notes |
| instruction4794.txt | AI reliability: credit blockers, speaker/intent preservation, rhyme cost/quality, AI failure UI, retest pending live flows, publish |
| instruction2315.txt | Mystery Card verification pass: test all three flows, anonymity accuracy, poetry quality, display polish, edits/concurrency, Shayari demo, regression, publish, handoff |
| README.md | Setup, two-device demo path, Mystery Card status |
| roadmap.md | Task list |
| AGENTS.md | Technical rules |
| lovable-36845aad-2026-11-10.zip | Full export of the original Cheez Udhaar project; imported into this project 2026-11-10 |
| query5371.txt | Instruction: import the whole zip 100% (plus a NotFound.tsx error line that doesn't apply) |
| query7663.txt | Hackathon submission pass: verify GitHub, finalize MVP doc, SUBMISSION.md answers, live smoke test, judge demo, handoff |
| task4920.txt | Remove Lovable badge/branding (blocked: Free plan) |
| docs/SUBMISSION.md | Ready-to-copy submission form answers + checklist |
| request5940.txt | Trial mode for real members + AI demo lenders in Inbox chat (20-chair case), test and publish |
| request7618.txt | Fix AI 402 billing blocker (check workspace, move only if needed), live check, four live Shayari/Find tests, publish, hand off |

## Change History
- 2026-11-09: chat.md created; no project files received yet.
- 2026-11-09: Received prompt_pp5685.txt (Cheez Udhaar spec); recorded summary; App.tsx error not reproducible (file absent).
- 2026-11-09: Built first version of Cheez Udhaar and ran the full acceptance test.
- 2026-11-09: Phase 2 (task5287.txt = instruction1054.txt): privacy, photo/spec matching, blocks, map pin, email check, full retest. NotFound.tsx error not applicable (file absent).
- 2026-11-09: Phase 3 (hub_prompt5112.txt = context2829.txt): rename, installable app, notifications, full booking lifecycle, demo/real separation, tests. main.tsx error not applicable (file absent). Sender name changed from "Project Memory Hub" to "Cheez Udhaar" (old → new).
- 2026-11-10: Phase 4 (prompt1619.txt): release prep built, published to https://everready-project-guide.lovable.app, release tests run on the published app. Test accounts removed. App.tsx error not applicable.
- 2026-11-10: Mystery Card Card 2 — Shayari Mode built: "Make it rhyme" in booking chat, faraway requests (anonymised first) and thank-you cards after full return; Urdu/Roman Urdu/English, Friendly/Funny; tested with demo accounts (Ali/Usman/Sara/Farah/Hina). Fixed: rhyme on faraway listings couldn't read the listing. App.tsx error not applicable (file absent). Remaining: publish update, real-phone check.
- 2026-11-10 (later): Reported `src/lib/utils.ts(4,16) React.theme` error not present — file has no `React.theme`; typecheck clean. Fixed leftover: faraway-note cleaner could add words ("Meherbani hogi"); now only deletes (`onlySourceWords` in `src/lib/shayari.ts`, used by `anonymizeNote`). Live check: name/phone/address → [hidden], no added words. 52/52 tests pass.
- 2026-11-10 (evening): instruction2315.txt (Mystery Card verification pass). Reported `src/pages/Index.tsx` error not applicable (no `src/pages` folder). Built: shared anonymity cleaning `safeNote` for plain faraway notes and rhymes (+92/spaces/brackets/Urdu digits, emails, @handles, links, house numbers; asks to edit when unsure; delete-only in the person's order); backend refuses closed searches, re-use of a rhyme in another chat, and hides the sender's first name in plain notes; "budget zero" no longer fails; display polish (labelled columns, quieter meaning, "Show original message" button, "Couldn't make a rhyme"/"Ready to send"); one-tap "Prepare Shayari demo" + "Shayari demo" guide. Tested: 71 automated checks, 18 backend permission/privacy checks, browser chat/return/thank-you flows at desktop and 390 px. Blocked: AI balance ran out (402) mid-testing, so live rhymes on the faraway screen and the Find → plan regression are untested. Remaining: top up AI balance and re-run those; real-phone check.
- 2026-11-10 (night): instruction4794.txt (AI reliability). Reported `src/App.tsx(20,8)` error not applicable (no src/App.tsx). Runtime AI: Lovable AI Gateway, model openai/gpt-6-astra (all features). Blocker: workspace AI balance 0 (Free plan; live probe → payment_required 402); builder had 4.70 daily credits. Built: speaker/act/negation/condition rules in writer + checker, fixed checks (`intentProblems`, `rhymeProblems`), rhyme re-use checked before any AI call and keyed on booking facts, 600-letter rhyme limit, output-token limits, no automatic resend on timeout/server error, failure kinds with Retry-After countdown, simple member wording, admin "Writing helper status" card (`ai_events`). Tested: 86 automated checks, typecheck, screen check of failure state (390 px) and admin card. Blocked (needs AI balance): live speaker-preservation rhymes, live faraway rhyme, live thank-you rhyme, Find → plan regression, cheaper-model evaluation.
- 2026-11-10 (late): request7618.txt — AI billing checked (this workspace funds AI; no move needed), live check 200, four live tests PASS, published to https://project-brain-trail.lovable.app. App.tsx error not applicable.
- 2026-11-10 (import): New project created from lovable-36845aad-2026-11-10.zip per query5371.txt. All code copied unchanged; new Lovable Cloud backend; 14 database steps re-applied identically; photos storage, email sign-in, hourly job, AI working; 86/86 tests; demo sign-in + Find + live AI question checked. Not carried: demo photos, any real member data. NotFound.tsx error not applicable (file absent). Earlier minimal chat.md from this project (working rules only) merged into this file.

## GitHub sync request (2026-11-11)
- User asked to connect GitHub and confirm sync. Reported error `src/App.tsx(17,16) TS2554`: file does not exist here; not applicable.
- (Old status, now resolved — see "Hackathon submission pass".) The AI cannot connect Git sync. Waiting on the owner to connect (Project settings → Git → Connect; creates a NEW private repo; only the synced branch, usually `main`, syncs both ways).
- How to confirm: after connecting, the repo's latest commit should match the latest Lovable commit; next AI edit should appear in GitHub within moments. Optionally the AI can read the repo via a GitHub data connection to compare commits.
- 2026-11-11: request5940.txt — trial mode and AI demo lenders built, tested end-to-end and published (see section above).

## Project source download (2026-11-11)
- User asked for a download of this project. Reported `src/pages/Index.tsx(7,24) TS2304 'theme'`: **not applicable** — this TanStack Start project has no `src/pages` folder or `src/pages/Index.tsx`; no app code was changed for that report.
- Prepared `cheez-udhaar-source-2026-11-11.zip`: 200 source files covering the app, 17 database steps (0000–0016), tests, docs, public icons and `.env.example`.
- Excluded private `.env`, Git/local workspace metadata, installed dependencies and generated build output. The archive passed its integrity and forbidden-entry checks.
- The ZIP contains source only: backend records, private uploaded photos and server secrets are not exported. Use the README and `.env.example` when setting up another copy.
- Files changed for this request: `chat.md`, `roadmap.md`; no application code changed.
