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
- [ ] Live rhyme checks for the faraway screen and remaining languages (needs AI balance topped up)
- [ ] Publish (done by agent if available) and check on a real phone

## AI reliability (instruction4794.txt)
- [x] Identify blockers (runtime AI balance 0 → 402; builder credits separate)
- [x] Speaker/intent/negation/condition preservation (prompt + fixed checks + checker)
- [x] Cost: re-use before AI calls, facts in re-use key, input/output limits, no auto-resend
- [x] Failure UI (unavailable/busy/timeout/invalid/balance) + admin status card
- [ ] Live retests A–D and model comparison — blocked: workspace AI balance is 0
- [ ] Physical-phone checks — needs a real phone
