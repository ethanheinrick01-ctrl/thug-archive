# Thug Archive

A private, phone-first music library. Search the archive, explore alternate versions,
make playlists, save favorites, and keep a listening queue. Install from Safari using
**Share → Add to Home Screen**.

The source repository contains application code only. Audio, original source packets,
Drive identifiers, user data, and server credentials stay outside Git.

## Architecture

- **Preact + TypeScript + Vite** frontend on GitHub Pages.
- **Supabase Auth** for username/password login, with invite-code registration and server-managed archive membership.
- **Supabase Postgres** for the private catalog, playlists, favorites, and history.
- **Private Cloudflare R2 Standard** bucket for audio.
- **Playback Edge Function** validates the user's identity and membership, then returns
  signed R2 URLs. Audio bytes stream directly from R2 to the browser.
- One persistent native audio element, Media Session metadata/controls, and an app-shell
  service worker. Audio and authenticated API responses are never cached by that worker.

## Development

```sh
npm ci
cp .env.example .env
npm run dev
npm test
npm run build
```

Set the two public `VITE_SUPABASE_*` values in `.env` for real login. Never put server
keys or R2 credentials in variables prefixed `VITE_`.

Development preview: prepare the private source catalog with `npm run catalog`, then
open `http://127.0.0.1:8893/?preview=1`. Preview data uses separate local storage and
exists only on the local development server. A production build removes this route
and preview authentication entirely. The repository does not include the source catalog.

## Features

- Invite-code registration and access enforced by database membership, even if somebody knows the API URL.
- Personal playlists: create, rename, describe, reorder, delete, add/remove songs.
- Share a playlist read-only with other invited archive members.
- Favorites, recent listening, search including original filename aliases, version groups.
- Play next, append to queue, remove upcoming songs, save a queue as a playlist.
- Shuffle and repeat modes, seek controls, phone mini-player and full player.
- Responsive layouts and keyboard/focus support, native modal dialogs, reduced motion.
- Remembered login and device queue; cloud playlists survive a device change.
- Private listening rooms with a shared queue, host playback controls, live synchronization, and recovery after interruptions.
- Tap the open space in a song row to play it; menus, favorites, and version buttons keep their own actions.

## Listen together

1. Sign in and tap **Together** at the top, then **Start a room**.
2. Copy the room link and share it with another archive member. They sign in and tap **Join & listen**.
3. Add songs using **⋯ → Add to shared queue**. The host controls Play, Pause, seeking, skipping, and queue removal.
4. Tap **Sync now** after an interruption. The host can **End room for everyone**; guests can leave individually.

Rooms support up to 10 people and expire after 24 hours. Each phone streams directly
from R2. Keep the app open for the closest synchronization; exact speaker alignment
and iPhone lock-screen behavior are not guaranteed. The personal queue is preserved
while listening in a room and restored paused when leaving.

The server validates archive membership, room membership, and host authority for
every room action. Room data is protected by RLS. Automatic song changes carry an
expected playback anchor, checked under a row lock so two host devices cannot skip
two songs for the same ending. Live updates use Supabase Realtime; periodic reads
recover missed updates without writing playback heartbeats.

`npm test` includes client recovery regressions. A database-owner regression script
in `tests/listening-room-recovery.sql` tests playback guards inside a rolled-back
transaction with a synthetic fixture user.

## Media import

Preserve originals under ignored `.local/raw/`. The scripts validate actual codecs,
copy MP3 audio without another lossy encode, and convert other formats to MP3. Every
prepared file receives a checksum and technical validation receipt.

```sh
npm run media
npm run catalog
npm run upload
npm run catalog
```

`upload-r2.mjs` refuses uploads beyond a verified free-storage budget, uses Standard
storage only, and verifies object size/checksum metadata. Existing differing objects
are never silently replaced. The import operator must first verify account-wide usage;
the script can only inventory this app's bucket. It is not an account-wide billing cap.

R2 has usage allowances and automatic overage billing, not a guaranteed zero-dollar
hard stop. No paid Supabase plan, analytics, AI API, or paid design service is required.
See [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

## Deployment and access

Configure GitHub Pages to deploy from Actions. Set repository variables
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Push to `main` to publish.
Account creation uses the `register` Edge Function and an invitation hash stored in
`archive_invites`. Invitations have an expiry and a limited number of uses, reserved
atomically. Usernames become synthetic `.invalid` email identifiers inside Supabase
Auth; no real email address or confirmation email is needed. The app never treats these
identifiers as verified contact information. Direct public Auth signup is disabled in the dashboard. The registration function uses
the server admin API only after reserving a valid invite; bypassing it grants no membership. The server admin key is
never sent to a browser. Password resets are owner-assisted in this version.

For the playback function, configure server secrets `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `ALLOWED_ORIGINS`.
Use a bucket-scoped **read-only** key for playback. This deployment stores the four
configuration values encrypted in Supabase Vault; `read_playback_config()` is callable
only by `service_role` and uses invoker permissions. Environment secrets are supported
as an alternative. No secret is embedded in a deployment source file. The function performs its own
`auth.getUser()` verification and RLS-backed membership lookup; the gateway's legacy
JWT switch is off to support modern Supabase signing keys. This is not anonymous playback.

R2 CORS: allow the app origin, methods `GET` and `HEAD`, request header `Range`, and
expose `Content-Length`, `Content-Range`, `Accept-Ranges`, and `ETag`.
Leave public bucket access and r2.dev access disabled. Signed URLs expire after one hour.

## Room chat

In listening rooms, **Add to shared queue** places the requested song immediately
after the current song for both the host and guests. Each newer request becomes
next; the existing archive queue follows it. Adding songs preserves current playback.

Listening rooms include live text chat under **Together → Room chat**. Only active
room members can read or send messages; ending or leaving a room removes access.
The latest 100 messages appear when chat opens. Messages are plain text, limited to
1,000 characters, with server rate limits and retry IDs to prevent duplicate sends.
Storage is capped at 200 messages per room; messages older than seven days are
pruned on the next send. Chat uses the existing Supabase project and free plan.

## Verification limits

Desktop browser tests cannot establish iPhone background playback reliability.
Before handoff, test in Safari and as an installed Home Screen app on a real iPhone:
lock-screen listening, automatic track advancement, next/previous controls, headphones,
seeking, interruptions, and network changes. Offline audio downloads, gapless playback,
and crossfade are not part of this version.

The MIT license applies to application code only. Music and any third-party artwork
are not licensed or distributed by this repository.

## Approximate listening groups

Slower paced, Upbeat, and Harder tracks are rough discovery buckets estimated locally
from short audio excerpts using onset autocorrelation, transient strength, spectral
brightness, and bass balance. Songs may appear in more than one bucket. These are not
listening-reviewed mood labels or authoritative BPM measurements. No melodic, lyrical,
era, or emotional label is inferred from filenames. The analysis uses NumPy/SciPy and
FFmpeg, with no paid API. `scripts/analyze_vibes.py` writes only ignored local receipts.
