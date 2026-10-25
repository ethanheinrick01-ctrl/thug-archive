import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const user = JSON.parse(await readFile(".local/qa-accounts.json", "utf8"))[0];
const auth = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const signedIn = await auth.auth.signInWithPassword({
  email: `${user.username}@thug-archive.invalid`,
  password: user.password,
});
assert.ifError(signedIn.error);
user.access_token = signedIn.data.session.access_token;
const origin = "https://ethanheinrick01-ctrl.github.io";
const response = await fetch(
  `${process.env.VITE_SUPABASE_URL}/functions/v1/playback`,
  {
    method: "POST",
    headers: {
      apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${user.access_token}`,
      "Content-Type": "application/json",
      Origin: origin,
    },
    body: JSON.stringify({ track_ids: ["t054", "t055"] }),
  },
);
const body = await response.json();
assert.equal(response.status, 200, body.error || "Playback endpoint failed");
assert.ok(body.urls.t054, "No signed URL for available song");
const stream = await fetch(body.urls.t054, {
  headers: { Range: "bytes=0-1023", Origin: origin },
});
assert.equal(stream.status, 206, "R2 did not support seeking/range requests");
assert.equal((await stream.arrayBuffer()).byteLength, 1024);
assert.equal(
  stream.headers.get("access-control-allow-origin"),
  origin,
  "CORS origin mismatch",
);
const unsigned = new URL(body.urls.t054);
unsigned.search = "";
const denied = await fetch(unsigned);
await denied.body?.cancel();
assert.ok(
  [400, 401, 403].includes(denied.status),
  "Unsigned object was public",
);
const preflight = await fetch(body.urls.t054, {
  method: "OPTIONS",
  headers: {
    Origin: origin,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "range",
  },
});
assert.ok(preflight.ok, "Range preflight failed");
const result = {
  passed: true,
  authenticatedSignedPlayback: 200,
  rangeStatus: stream.status,
  rangeBytes: 1024,
  corsOrigin: origin,
  unsignedDenied: denied.status,
  preflightStatus: preflight.status,
};
await writeFile(
  ".local/qa-stream-result.json",
  JSON.stringify(result, null, 2),
);
console.log(result);
