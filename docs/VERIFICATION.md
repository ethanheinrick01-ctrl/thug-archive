# Release verification — October 25, 2026

Live app: https://ethanheinrick01-ctrl.github.io/thug-archive/

## Listening rooms follow-up

- Added private rooms (10 members, 24-hour expiry), member queue additions, host-only transport controls, room links, live state updates, drift correction, and personal queue restoration on exit. Audio continues to stream directly from R2.
- Added whole-row playback on noninteractive song-row space. Existing menu, favorite, playlist, and version actions remain separate.
- Real HTTP/SDK checks with disposable accounts verified anonymous denial, isolation before joining, rejection of guest playback controls and direct table writes, simultaneous queue additions without lost entries, real Realtime deliveries, and access removal after leaving.
- All 15 automated tests passed. Recovery regressions cover fresh URLs after failed media, explicit Play/Pause intent, consecutive duplicate history, history preservation during source recovery, revoked membership, local exit without a connection, and connection-status recovery.
- The database regression script passed under an authenticated fixture identity and rolled back its user and room. It verifies duplicate automatic-end requests, required expected anchors, repeat-one protection, and restarting an exhausted queue.
- Two authenticated, isolated headless WebKit sessions verified the complete create/join flow, room-link preservation through login, roster updates, actual R2 audio playback on both clients, queue additions, host pause/resume and seeking, drift correction, natural next-track advancement, and end propagation. The observed drift after correction was about 0.10 seconds in that test; this is not a speaker-sync or hardware guarantee.
- Browser layouts passed at 320, 375, 390, and 1280px. Tapping blank song-row space played exactly once; opening its menu did not also start playback.
- Two concurrent authenticated host end requests were verified to advance only once. All three disposable accounts and all their sessions, rooms, memberships, and the QA-only invitation were removed; the real accounts and invitation codes were untouched.
- No paid plan, external analysis API, additional audio copies, or new R2 credential was added. Real iPhone interruptions and lock-screen synchronization remain hardware checks.

## Navigation follow-up

- The top bar stays visible while scrolling, with a 44px Back control and iPhone safe-area spacing.
- Back restores the preceding app screen, including its search, sort, filter, and scroll position. Navigation history clears when the signed-in user changes.
- Browser preview verified the bar at scroll position 950px, return navigation and search/sort restoration, disabled Back on the initial home screen, and layouts at 320, 375, 390, and 1280px without horizontal overflow.
- Type checking, production build, bundle privacy checks, and all four existing model tests passed. Physical iPhone checks remain listed below.

## Saved sign-in follow-up

- Supabase session tokens now have an IndexedDB device backup alongside local storage. Existing saved sessions migrate automatically. Passwords are never stored by the app.
- Automatic token renewal remains enabled. Explicit Sign out removes both saved copies. After successful sign-in, the app also requests persistent browser storage when supported.
- Type checking passed. A WebKit browser test using intercepted, fictional authentication responses verified sign-in, recovery after removal of the local-storage session, and renewal of a simulated expired session. No real accounts or server settings were changed for this test.
- The reported physical iPhone restart failure has not been independently reproduced. The user will verify the Home Screen app after deployment; no claim of hardware verification is made.

## Verified

- GitHub Actions built and deployed frontend commit `323f31602cbb292e7571a5e55f8acb1358a662f7` successfully.
- Production build strips development preview authentication and private source routes.
- No audio, source packs, Drive identifiers, personal account records, or server credentials are in Git.
- Published HTML, JavaScript, stylesheet, icons, and manifest return HTTP 200 with the repository base path.
- The app shell loads offline under the correct service-worker scope. Streaming still needs a connection.
- Browser layout checked at 390 × 844 and desktop width; viewport override restored.
- Invite registration and username/password login work on the published app, including after direct public Auth signup was disabled.
- Two-user SQL and real HTTP checks deny access to private playlists, favorites, and history; shared playlists are read-only to other members.
- Uninvited accounts and anonymous callers cannot read the catalog. Invalid invitations are rejected.
- Playlist creation/addition checked in the browser preview; cloud rename/reorder and persistence checked through the actual UI and database.
- Favorites save on the published site and persist in the cloud database.
- Published playback reaches advancing time; seeking, automatic next-track playback, and repeat-one verified in a desktop browser.
- Authenticated playback returns signed URLs; R2 returns HTTP 206 and the requested 1,024 bytes for a range request, with correct CORS. Preflight returns 204. Unsigned access is rejected.
- Removing the temporary upload credential returns unauthorized on subsequent upload-key API access; playback still works using its separate read-only credential.
- All three disposable QA accounts and their playlists, likes, sessions, and listening history were removed. The two-use real invitation was preserved.

## Collection and hosting

- 245 original files preserved locally; 245 streaming objects uploaded and verified against size and checksum metadata.
- 240 sources were already MP3 despite some filenames containing `.m4a`; five WAV sources were converted once. MP3 audio was copied without another lossy encode.
- Streaming objects total 1,675,073,095 bytes, approximately 1.68 GB. R2 Standard storage is used, with public access disabled.
- Supabase project is separate from the business application and remains on the free organization plan.
- R2 activation has no base monthly charge; automatic overage billing was explained and approved. Free allowances are not an absolute spending cap.
- Local approximate audio analysis produced 103 Slower paced, 75 Upbeat, and 29 Harder tracks. Overlap is allowed. These are discovery suggestions rather than listening-reviewed mood labels.

## Room chat — October 25, 2026

- Database rollback regressions verified room isolation, anonymous/direct-write
  denial, trusted sender identity, length/blank validation, rate limits, idempotent
  retries, retention, and read/send revocation after leaving or ending a room.
- Two disposable accounts in isolated headless WebKit sessions verified actual
  Supabase Realtime delivery in both directions, recovery of messages missed while
  chat was closed, and safe rendering of markup as plain text.
- A server-accepted send with a deliberately dropped response preserved its draft;
  retrying returned the original message without duplication.
- Layouts at 320, 375, 390, and 1280 pixels passed without horizontal overflow.
  Nineteen automated tests, TypeScript, and the production bundle checks passed.

## Remaining practical checks

- Three source files emitted decoder warnings and are marked for listening review. Successful decoding is not an independent listening review.
- Real iPhone Safari and Home Screen tests remain: lock-screen listening, automatic queue advancement while locked, headset controls, interruptions, and network changes.
- Offline audio downloads, gapless playback, crossfade, and self-service password recovery are outside this release.
- The security advisor reports the deliberately closed invite table (RLS with no client policies) as informational. Compromised-password lookup is not enabled; no paid plan was added to resolve it.
