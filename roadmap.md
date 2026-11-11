# Cheez Udhaar roadmap

## Phase 1–2 (done)
- [x] First build, demo data, AI matching, bookings, chat, returns, ratings, reports, area admin
- [x] Phase 2: anonymous owners, photo guess, must-have check, blocks, own addresses, agreed snapshot, map pin, email check, full retest

## Phase 3 (hub_prompt5112.txt = context2829.txt) — done
- [x] 1. Rename to Cheez Udhaar; preview checked; email status explained; identity status separate from email
- [x] 2. Phone/desktop: 4 tabs + profile button, notification bell, offline banner, drafts kept
- [x] 3. Find: optional dates/quantity/budget, listing page, request kept when returning
- [x] 4. Installable app: manifest, icons, Install app, iPhone steps, offline shell, update reload
- [x] 5. Location: progress, denial/timeout/unavailable, accuracy, confirm area; owner distance meaning
- [x] 6. Listing: several photos, cover, remove, resize, condition, accessories, category, per-day price, supply min/step, measured vs estimate, stock-vs-reserved, preview
- [x] 7. AI: person's language, ambiguous times, bounded tries, change after sending (with approval), plan explanation, user text as data
- [x] 8. Exceptions: separate "allow distance" step, photo not forwarded
- [x] 9. Bookings: expiry, cancel before pickup + replacement search, date changes with clash check
- [x] 10. Pickup/return: borrower reports, owner confirms, partial amounts, condition photos, payment reported only
- [x] 11. Chat: unread, send status, retry without duplicates, booking summary; block keeps return path
- [x] 12. Notifications centre (in-app; bounded polling)
- [x] 13. Ratings edit window; report kinds; under review; area + demo boundary
- [x] 14. Demo vs real separation; reset only demo; community impact
- [x] 15. Mystery Card placeholder (Not received); README setup + demo steps
- [x] 16. Tests, 360–430 px and desktop checks, chat.md handoff

## Phase 4 (prompt1619.txt) — release prep — done
- [x] 1. Availability wording: "N listed" without dates, server availability for chosen dates; requested/confirmed/collected/returned/due; "12 confirmed — 8 still needed"; refresh after changes
- [x] 2. Prices: per day / per booking / per amount; daily rule explained; quote breakdown before sending; saved on booking; per-owner subtotals
- [x] 3. Changes to agreed bookings need the other person's yes (comparison, atomic apply); pending requests invalidated on edit
- [x] 4. Find polish: example, enable rules, reasons, Choose area, photo Remove/Replace, progress, no duplicates; direct item request; "Why it fits"/"What still needs checking"; My Items Add + photo placeholder
- [x] 5. Handover/returns: claim awaits owner, partial confirm, impossible actions blocked, history kept
- [x] 6. Reminders/expiry in the background (scheduled job), repeat-safe; reconnect refetch
- [x] 7. Privacy audit: API/storage/permissions; strip photo location data; role self-assign blocked
- [x] 8. Demo guide, reset predictability, test accounts review
- [x] 9. Production checks, refresh routes, sign-out clearing, publish
- [x] 10. Release tests on published app
- [x] 11. README/chat.md/MVP description/handoff; GitHub status

## Waiting on the owner
- [ ] Email domain for branded emails with a typed code (needs the owner's domain)
- [ ] Phone push notifications (needs a push service; in-app notifications work now)
- [ ] Install/offline/GPS check on a real phone (needs the app published)

## Mystery Card — Card 2: Shayari Mode (message5893.txt = input7449.txt = input4038.txt) — done
- [x] Shared server generator (key message → two-line rhyme → plain meaning; Urdu / Roman Urdu / English; Friendly / Funny) with server checks and one bounded correction
- [x] One shared preview component (rhyme beside meaning, stacked on phones, Urdu right-to-left)
- [x] Private chat: "Make it rhyme" next to Send; send rhyme or original; receiver view; no duplicates; offline outbox
- [x] Faraway (exception) request: anonymity check first, rhyme from the safe version, re-check output, owner view
- [x] Thank-you rhyme after a fully confirmed return / completed supply exchange, per owner; blocks/restrictions respected; separate from ratings
- [x] Remember language and tone; rate limit; previews private to their author
- [x] Tests (rules + live demo accounts), Mystery Card README status, chat.md

## Mystery Card verification pass (instruction2315.txt)
- [x] Shared anonymity cleaning for plain note and rhyme (+92/spaces/Urdu digits/emails/handles/house numbers; ask to edit when unsure; delete-only, same order)
- [x] Backend: closed searches can't send; preview can't be reused in another chat; name backstop on plain notes
- [x] Display: labelled columns, quieter meaning, "Show original message" button, clear states
- [x] "budget zero" no longer fails the number check
- [x] Shayari demo section + "Prepare Shayari demo"
- [x] Tests (71) and backend permission checks
- [x] Live rhyme checks for the faraway screen (Urdu) and Roman Urdu thank-you (2026-11-10)
- [ ] Publish (done by agent if available) and check on a real phone

## AI reliability (instruction4794.txt)
- [x] Identify blockers (runtime AI balance 0 → 402; builder credits separate)
- [x] Speaker/intent/negation/condition preservation (prompt + fixed checks + checker)
- [x] Cost: re-use before AI calls, facts in re-use key, input/output limits, no auto-resend
- [x] Failure UI (unavailable/busy/timeout/invalid/balance) + admin status card
- [x] Live retests A–D (2026-11-10, this project)
- [ ] Cheaper-model comparison (optional, not requested again)
- [ ] Physical-phone checks — needs a real phone

## Import into this project (lovable-36845aad-2026-11-10.zip, query5371.txt) — 2026-11-10
- [x] Copy all code unchanged, new Cloud backend, re-apply database steps 0000–0013, photos storage, email sign-in, hourly job
- [x] Checks: 86 tests, build, demo sign-in, Find list, live AI question
- [ ] Demo item photos (files not in the zip — need them, or skip)
- [ ] Real member data from the old app (only if any existed — needs an export, or skip)
- [x] Publish this copy (https://project-brain-trail.lovable.app)

## AI billing blocker + blocked live tests (request7618.txt) — 2026-11-10
- [x] 1. Workspace paying for AI = this project's own workspace (unified credits, funded)
- [x] 2. Move not needed (details recorded in chat.md)
- [x] 3. Live check: 200, openai/gpt-6-astra
- [x] 4. Live tests: DM, faraway, thank-you, Find chair + replacement — all PASS
- [x] 5. Tests 86/86, published

## AI demo results (input9218.txt; request7618.txt re-sent) — done
- [x] Database: simulated owners, AI-created listings, generation log, demo owner actions (0014)
- [x] Live AI creates 1–3 fictional owners/listings for the shortfall only (demo accounts only), checked by the server before saving
- [x] Labels: "AI demo result", "Fictional demo listing", "Simulated owner", "Sample photo unavailable"; one-time explanation
- [x] Reuse saved results; no duplicate generations; "Create another sample plan"; Try again after failure
- [x] Demo actions for simulated owners: accept, decline (replacement), confirm pickup, confirm return, share meeting time
- [x] Profile switch "Show AI demo results"; reset removes all AI-created demo records
- [x] Rule tests + real-screen tests (glue gun, partial stock, split, decline, partial return, Shayari, normal account, reset)
- [x] Demo guide, chat.md, publish
- [x] Second pass: exact spec wording, distance not a must-have, spec glue-gun example + final return + thank-you + rating + paid grams supply tested
- [x] AI failure and the two-borrower race were tested live in the final pass (B1, B2)

## Final MVP pass (instruction9187.txt) — 2026-11-10
- [x] A. Current state: live app has AI demo results (checked live files); source 7d93ea5
- [x] B1. Controlled AI failure (timeout / no balance / bad output / save cut off / offline) — demo-only `?demoFault=`, no orphans, retry reuses saved set
- [x] B2. Two demo borrowers race for one fictional item — only one wins; loser sees clear message + replacement
- [x] C. Full five-glue-gun run across every owner (live AI): 3+2 → decline → replacement 2 → pickups 5, partial return, owed shown, completed, 2 rhymes, 2 ratings
- [x] D. Normal member end-to-end: setup + manual area, drill listing + photo, edit, pause/resume, live AI request, yes, chat, meeting, pickup/return confirmed, both reviews; no demo items seen (signup email not sent: test accounts made directly)
- [x] E. Request edits: quantity, free→paid, distance (typed distance now sticks), dates, new must-have, reload during creation — reuse first, one creation per version; 250 g × Rs 80/100 g = Rs 200 (app + database)
- [x] F. Shayari: DM in Urdu (phone, meaning below, right-to-left), faraway note (private details hidden in source/rhyme/meaning/owner view/notifications; leftover "call me on [hidden]" clauses now dropped), thank-you (Roman Urdu + English, desktop side by side), no reuse across chats, no duplicate, no rating/booking change
- [x] G. Network/account recovery: offline send+reconnect (1 copy), lost reply+retry (1 copy), stalled send stops after 20 s with retry, draft survives reload, missed alerts appear after reconnect, chat closed while queued shows reason and is not resent, sign-out clears device data; repeat taps on pickup/return/cancel count once
- [x] H. Phone layout (320/360/390/1280 on 10 screens): fixed top bar and notifications header spilling on 320 px, larger "Sample photo unavailable", reasons under greyed-out pickup/return/rating/listing-hours buttons; install file, update reload and no private caching checked (real phone pending)
- [x] I. Demo reset + permissions: reset restores 7 demo people/10 items, removes fictional owners/listings/rhymes, keeps real members; a reset during AI creation now leaves nothing behind (fixed); demo area admin cannot see or decide real reports; no self-admin; members cannot reset or prepare the demo
- [x] J. MVP document (`docs/MVP.md`) + README; GitHub not connected (owner action)
- [x] K. Three-minute demo script + Q&A + phone checklist (README)
- [x] L. Published 11 Nov 2026; live check: page loads (200), install file standalone, demo sign-in → Find works at 320 px with no sideways scroll, AI demo switch/reset/Shayari demo present, new listing-hours and header fixes in live files
- [x] M. Final handoff given. Next action: connect GitHub (owner), run the real-phone checklist in README

- [x] Connect GitHub sync and confirm a commit arrives — connected by owner; GitHub latest commit matches local (11 Nov)

## Hackathon submission pass (query7663.txt) — 2026-11-11
- [x] 1. Repository verified on GitHub (all files, migrations, lockfile, docs); no secrets; links added
- [x] 2. docs/MVP.md finalized
- [x] 3. docs/SUBMISSION.md (form needs Google sign-in; general answers + placeholders)
- [x] 4. Live smoke test passed; no fixes needed; demo reset
- [x] 5. Judge demo instructions + 3-minute sequence
- [x] 6. Handoff
- [ ] Organizer accepts GitHub invitation — waiting on organizer
- [ ] Fill placeholders and submit the form once — submitting member only

- [ ] Hide the Lovable badge on the live site — blocked: needs a Pro plan, then the Hide badge setting

## Trial mode + AI demo lenders (request5940.txt) — 2026-11-11
- [x] Diagnose the empty 20-chair search (real account; demo items are demo-only; Bilal closes at 4 PM)
- [x] "Try with sample items" practice account, banner, "Trial data" / "AI demo lender" labels, Leave trial
- [x] Auto-accept setting (normal booking checks) + manual demo buttons when off
- [x] AI lender replies in the normal chat (own share, saved facts, one reply per message, Try again, rhymes)
- [x] Phone-width end-to-end test, tests, publish
- [ ] Real-phone check — needs a physical phone

## Trial item photos (hub_prompt3085.txt) — in progress
- [ ] Add licensed, relevant photos to existing and newly created trial listings; preserve real uploads
- [ ] Show “Trial data” + “Illustrative photo”, consistent lazy-loaded images and failure fallback everywhere
- [ ] Backfill existing trial listings, test browsing/search/details, publish

## Latest requests (prompt8236.txt, instruction3614.txt) — in progress
- [ ] Read and fold the new instructions into the current work
