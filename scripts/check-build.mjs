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
