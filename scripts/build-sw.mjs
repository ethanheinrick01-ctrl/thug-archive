import { readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const assets = (await readdir("dist/assets")).map((x) => `assets/${x}`);
const hash = createHash("sha256")
  .update(
    (await Promise.all(assets.map((x) => readFile(`dist/${x}`))))
      .map((x) => x.toString())
      .join(""),
  )
  .digest("hex")
  .slice(0, 12);
await writeFile(
  "dist/sw.js",
  `// Only public app assets are cached. Private API responses and audio never enter this cache.
const CACHE = 'thug-archive-shell-${hash}';
const ASSETS = ['./', 'index.html', 'icon-192.png', 'icon-512.png', 'icon-maskable.png', 'apple-touch-icon.png', 'manifest.webmanifest', ${assets.map((x) => JSON.stringify(x)).join(",")}];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('thug-archive-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method!=='GET'||url.origin!==self.location.origin||event.request.headers.has('range')) return;
  const scope = new URL('./', self.location.href).pathname;
  const relative = url.pathname.slice(scope.length);
  if (event.request.mode==='navigate') {
    event.respondWith(fetch(event.request).catch(()=>caches.match(new URL('index.html',self.location.href)).then(response=>response||Response.error()))); return;
  }
  if (!ASSETS.includes(relative)) return;
  event.respondWith(caches.match(event.request).then(response=>response||fetch(event.request)));
});
`,
);
console.log(
  `App shell service worker generated (${hash}). Audio caching is disabled.`,
);
