What this repo does: Thug Archive is a private music library with personal playlists, likes, listening history and shared listening rooms. This review assumes the current 297-recording catalog, individual users on several devices, and rooms of up to ten members. It was performed manually in Codex, with local tests and the in-app browser. No external model reviewer or paid review API was used.

**Implemented behavior**

The archive now has one filter system across Browse, Search, Liked songs, playlists, collections, recent additions, history and the queue. Choices within a section match any selected value; sections combine to narrow results. The scope, selected filters, sort and result count remain visible. Canceling a filter draft preserves the applied selections. Clear search and filters keeps the chosen collection. Back restores the prior discovery state.

| Distinction | What the UI offers | Evidence limit |
| --- | --- | --- |
| Artists | All appearances, lead/co-artist, featured artist; artist collections | Tentative credits stay labeled |
| Sound | Guitar-led listening picks, guitar-like, keyboard-like, synth-like, hard drums | Model estimates remain separate from listening picks |
| Era | Searchable community album/project attributions and unknown | Does not establish official album placement |
| Date | Recording, source-file, preview/public-play, song-release; ranges and unknown | File dates and release references do not authenticate a recording date or mix |
| Recording | Separate versions and edits; availability | Same titles do not establish the same song |
| Evidence | Listening picks, audio estimates, community leads, tentative matches, release references, unassigned context | Missing tags do not mean an instrument is absent |
| Personal groups | Save the visible result sequence as a playlist | A saved snapshot, not an automatically changing collection |

The home page has four clear entry points: guitar exploration, Beautiful Thugger Girls era leads, combining filters, and liked songs. Sound neighbors remain available from song details, with their limitations stated. There are three existing guitar listening picks, 20 guitar-model candidates, and 21 recordings in their union. There are 15 BTG community-era leads. This change does not invent additional classifications or claim new full-song listening work.

**Must-fix findings repaired**

1. **New likes could follow a device's incorrect clock.** Like creation now uses the existing database default timestamp. Repeated like requests do not rewrite an existing timestamp. Unlike then re-like creates a new event. Old unknown timestamps are not fabricated.
2. **Older reads could replace newer library state.** Request versions and account checks discard late successes and failures. A write invalidates preceding reads; its post-write refresh supplies the next library state.
3. **Two devices could silently overwrite a playlist.** Updates now require the version that the editor loaded. A conflict leaves the newer contents intact and tells the user to refresh and retry.
4. **A shared queue could change before a positional action arrived.** Remove and jump carry the displayed room revision. The migration rejects stale commands under the existing room lock; the client refreshes the queue and reports the conflict. Host and membership checks remain in place.
5. **Same-title uploads could be grouped as versions without evidence.** Newly published recordings use their stable recording ID as their initial group key. Existing catalog groups remain intact.
6. **Old pending submissions could disappear behind 100 recent completed uploads.** Needs-attention filtering now happens on the server before pagination. Every page remains reachable, and late requests cannot replace the selected page.
7. **Displayed recordings and playback lists disagreed.** All recordings remain visible, and row Play, main Play and Shuffle use the same filtered sequence of available recordings. Queue searches retain occurrence indices, including duplicates.
8. **Metadata lost distinctions between evidence types.** The curated merge no longer clears tentative-match flags. The incorrect recording-year label for t064 is now a source-file date. Uncertainty also appears in player, queue and release-reference labels.

**UI and accessibility changes**

The large era/artist pill clouds are replaced by a searchable filter sheet. Selected filters have removal controls and a clear reset. The sheet has a fixed action area and a scrollable body on short screens. Native dialogs preserve keyboard dismissal and focus return. The existing charcoal, olive and lime identity remains; important text is larger, controls have at least 44px targets, and focused icon controls expose tooltips. Reduced motion disables row movement and transitions.

Phone song rows use their space for titles, credits, versions, duration and short context instead of repeated artwork. The mobile mini-player no longer has a Lyrics button. Lyrics remain in the expanded song card. The idle, entirely disabled player is hidden until a recording is selected.

**Verification receipt**

- 48 automated tests passed, including shared metadata matching, mixed filters, typed dates, separate recordings, duplicate queue occurrences, newest-first likes, stale reads, account isolation, stale playlist writes, upload pagination and queue persistence.
- TypeScript passed. Production build and private-data exclusion checks passed. No new dependency was added.
- The database fixture for server-timed/idempotent likes and playlist version guards passed. All synthetic records rolled back.
- In-app browser checks covered 375×812, 375×667, 638×1033 and 1280×900. No horizontal overflow was observed in the checked views.
- Browser-confirmed examples: liking At The Gates after Birthday Boy placed it first; guitar plus BTG era returned To Me; guitar plus source-file year 2018 returned two recordings; saving the guitar listening picks created a three-recording playlist; queue search for 2025 found Birthday Boy; removing one duplicate kept the other.
- Escape canceled a draft and returned focus to Filters. Back restored the preceding filter selections. An unmatched query displayed an actionable empty state and disabled playback actions.
- A local developer-tools sample measured about 11ms of script work and 30ms of total main-thread task work for a search returning 21 recordings. This is a local sample, not a mobile performance certification. Repeated playback ticks no longer rewrite unchanged queue storage.
- The final browser error/warning check was empty. Lyrics navigation was verified; the isolated preview does not connect to private production lyrics.

**Manual skill coverage**

Engineering Entry Review set the scope. Code Review and Quality supplied correctness, security, design, readability and performance passes. Doubt Driven Development challenged the behavior against races, duplicates, empty results and metadata uncertainty. Constraint Driven Development produced the explicit acceptance contract. Browser Testing and Performance Optimization used the actual in-app browser and developer tools. Security and Hardening checked changed trust boundaries, existing database grants, the production bundle and dependency advisories. Loupe was performed as manual self-review. Ponytail Audit prioritized concrete failures and reuse of the existing stack. VectorLab setup, list patterns, viewports, typography, colour, icon buttons, empty states, transitions, reduced motion and visual restraint were applied to the same changes.

The obsolete automatic reviewer instructions were removed from the Engineering code-review and doubt-driven-development skills, and Entry Review now explicitly enforces manual execution. Loupe was already corrected and its external launcher absent. The global manual-review instruction was verified. These are self-review passes, not independent reviews.

**Remaining limits and release state**

The user approved publication. Database migration 20261102064505_discovery_correctness was applied successfully. The queue, upload-review and room-recovery database fixtures then passed and rolled back their synthetic records. The frontend release is this commit on main; the GitHub Pages Actions run is the deployment receipt.

The browser backend does not support dispatching synthetic touch events. Swipe recognition and queue insertion have automated coverage and the Play next action was verified in the browser; actual iPhone swiping, lock-screen playback and multi-device room acceptance still need physical-device verification.

The npm audit reports one low-severity Windows esbuild development-server advisory, with no moderate/high/critical advisories. This app does not run that server; no forced dependency update was performed. [Advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).

Existing Supabase advisories include disabled leaked-password protection and informational database index notices. Invitation-table RLS intentionally has no direct-client policy; access remains through controlled registration. No authentication policy, paid plan or new service was enabled. [Password-protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [index guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

Verdict: the discovery implementation, client correctness checks and database regressions pass. The matching frontend is approved for publication.

Not checked: physical iPhone behavior, a live multi-device room session, new full-song classifications, or an independent reviewer.
