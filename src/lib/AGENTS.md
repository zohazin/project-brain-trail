# Lib rules (AI, Shayari, demo fixtures)

- All AI calls live in `src/lib/ai.server.ts` (model from `textModel()`, overridable by server env `AI_TEXT_MODEL`); failures become `AiUnavailableError(kind, retryAfter)` → `{ ok: false, aiError, retryAfter }`, logged code-only to server-only `ai_events` for the admin status card; timeouts/server errors are never resent automatically. Why: no guessed replies, no double-billed or looping retries.
- Shayari: one generator `makeShayari`, one UI `Shayari.tsx`; reviewed rhymes are author-only `shayari_previews`, sent once by id via `send_rich_message`/`send_requests`. Why: what was reviewed is what is sent; poems never touch booking state.
- Faraway notes are cleaned only by `safeNote` (`src/lib/safe-note.server.ts`: fixed rules, delete-only AI, final check); SQL `scrub_contact`/`hide_word` are the backstop. Why: one anonymity path for plain notes and rhymes.
- Demo fixtures (`buildShayariDemo`) run real RPCs signed in as demo accounts, after `wipeDemo`. Why: setup obeys the same rules and boundaries.
- Demo generations save listings only while their run is still `running`, and roll back if the final update finds it gone. Why: a reset during the AI call must not bring fictional data back.
