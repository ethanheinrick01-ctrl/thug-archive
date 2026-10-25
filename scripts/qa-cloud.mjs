// Disposable accounts and fixtures only; never uses a listener's real progress.
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const url = process.env.VITE_SUPABASE_URL,
  key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing public app configuration");
const invite = JSON.parse(
  await readFile(".local/invitations.json", "utf8"),
).find((i) => i.label === "temporary-qa").code;
const accounts = [];
for (let i = 0; i < 2; i++) {
  const username = "qa_" + randomBytes(5).toString("hex"),
    password = randomBytes(18).toString("base64url");
  const response = await fetch(`${url}/functions/v1/register`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password, invite_code: invite }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Registration failed");
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: `${username}@thug-archive.invalid`,
    password,
  });
  if (error) throw new Error(error.message);
  accounts.push({
    username,
    password,
    user_id: data.user.id,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  await writeFile(
    ".local/qa-accounts.json",
    JSON.stringify(accounts, null, 2),
    { mode: 0o600 },
  );
}
const clients = accounts.map((a) =>
  createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${a.access_token}` } },
    auth: { persistSession: false },
  }),
);
const [a, b] = clients;
const inserted = await a
  .from("playlists")
  .insert({
    owner_id: accounts[0].user_id,
    title: "Disposable QA playlist",
    track_ids: ["t054", "t055"],
  })
  .select()
  .single();
assert.ifError(inserted.error);
const id = inserted.data.id;
const privateRead = await b.from("playlists").select("id").eq("id", id);
assert.ifError(privateRead.error);
assert.equal(privateRead.data.length, 0);
const tamper = await b
  .from("playlists")
  .update({ title: "Tampered" })
  .eq("id", id)
  .select("id");
assert.ifError(tamper.error);
assert.equal(tamper.data.length, 0);
assert.ifError(
  (await a.from("playlists").update({ shared: true }).eq("id", id)).error,
);
const sharedRead = await b.from("playlists").select("id").eq("id", id);
assert.ifError(sharedRead.error);
assert.equal(sharedRead.data.length, 1);
const anonymous = createClient(url, key, { auth: { persistSession: false } });
const anon = await anonymous.from("tracks").select("id");
assert.ok(anon.error || anon.data.length === 0);
const invalid = await fetch(`${url}/functions/v1/register`, {
  method: "POST",
  headers: { apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({
    username: "qa_invalid",
    password: randomBytes(15).toString("hex"),
    invite_code: "not-a-valid-invitation-code",
  }),
});
assert.equal(invalid.status, 403);
console.log(
  "PASS: invite signup, username/password login, real HTTP account isolation, read-only sharing, anonymous denial, invalid-invite rejection.",
);
await writeFile(
  ".local/qa-cloud-result.json",
  JSON.stringify(
    {
      passed: true,
      tests: [
        "invite registration",
        "password login",
        "private playlist isolation",
        "shared read",
        "cross-account edit denied",
        "anonymous catalog denied",
        "invalid invite denied",
      ],
      test_user_ids: accounts.map((a) => a.user_id),
    },
    null,
    2,
  ),
);
