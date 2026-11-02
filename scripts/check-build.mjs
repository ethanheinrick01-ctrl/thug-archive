import { readdir, readFile } from "node:fs/promises";
const files = await readdir("dist", { recursive: true });
for (const name of files) {
  if (/\.(js|json|html|css)$/.test(name)) {
    const text = await readFile(`dist/${name}`, "utf8");
    for (const forbidden of [
      "R2_SECRET_ACCESS_KEY",
      "SUPABASE_SECRET_KEY",
      "service_role",
      "drive.google.com",
      "__local/catalog",
      "Local preview",
      "khalidyousef4800",
      "unreleased.world",
      "Preview friend",
      "thug-archive-friends-preview-v1",
    ]) {
      if (text.includes(forbidden))
        throw new Error(
          `Production bundle contains forbidden string: ${forbidden} in ${name}`,
        );
    }
  }
}
console.log(
  "Production bundle checked: no local preview, private source links, or server-secret references.",
);

// Updating must wait for the listener's explicit reload request.
const { runInNewContext } = await import('node:vm');
const assert = (await import('node:assert/strict')).default;
const handlers = new Map();
let activated = 0;
runInNewContext(await readFile('dist/sw.js', 'utf8'), {
  self: { addEventListener: (name, fn) => handlers.set(name, fn), skipWaiting: () => { activated++; } },
});
assert.equal(activated, 0);
handlers.get('message')({data: 'unrelated'});
assert.equal(activated, 0);
handlers.get('message')({data: 'SKIP_WAITING'});
assert.equal(activated, 1);
console.log('App updates wait for the listener to request a reload.');
