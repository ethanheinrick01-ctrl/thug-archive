# Discovery acceptance contract

Authority: the user's accepted discovery plan, AGENTS.md, and docs/DESIGN.md.

- Review manually in this conversation. No reviewer subprocesses, subagents, model APIs, or paid dependencies.
- Keep every recording ID, source audio, saved like, playlist and history entry. Never merge recordings by title. Personal collections remain ordinary playlists.
- New like events use database time; repeated set-liked requests are idempotent. Existing unknown dates remain unknown.
- Stale library reads cannot replace newer results; account isolation remains mandatory. Stale playlist edits and positional room commands must fail visibly.
- All song lists use the same normalized resolved metadata. OR within a filter dimension, AND across dimensions. Filters preserve the source order unless a sort is selected.
- Main Play, Shuffle and row playback use the same result sequence. Filtering does not change an existing queue. Queue actions retain occurrence indices and a shared-room revision.
- Historical date kind, source and match uncertainty remain distinct from listening judgments and short-excerpt audio estimates. No inferred recording year or invented album intent.
- Keep the existing Preact/Lucide stack and persistent audio element. Public production bundles exclude preview behavior and private source material.
- Use readable rows, 44px controls, native dialogs, visible focus, actionable empty states and reduced motion. Verify 375px, 638px, 1280px and a short phone viewport in the in-app browser.
- Physical iPhone behavior and deployed SQL results require their own evidence. Local tests and viewport checks do not establish them.
