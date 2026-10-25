# Release verification — October 25, 2026

Live app: https://ethanheinrick01-ctrl.github.io/thug-archive/

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

## Remaining practical checks

- Three source files emitted decoder warnings and are marked for listening review. Successful decoding is not an independent listening review.
- Real iPhone Safari and Home Screen tests remain: lock-screen listening, automatic queue advancement while locked, headset controls, interruptions, and network changes.
- Offline audio downloads, gapless playback, crossfade, and self-service password recovery are outside this release.
- The security advisor reports the deliberately closed invite table (RLS with no client policies) as informational. Compromised-password lookup is not enabled; no paid plan was added to resolve it.
