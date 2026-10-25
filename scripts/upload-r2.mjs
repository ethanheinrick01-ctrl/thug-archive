import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
const e = process.env;
for (const name of [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
])
  if (!e[name]) throw new Error(`Missing ${name}`);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${e.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: e.R2_ACCESS_KEY_ID,
    secretAccessKey: e.R2_SECRET_ACCESS_KEY,
  },
});
const files = (await readdir(".local/audio")).filter((f) =>
  /^t\d{3}\.mp3$/.test(f),
);
const receipts = await Promise.all(
  files.map(async (f) =>
    JSON.parse(await readFile(`.local/media/${f.slice(0, 4)}.json`, "utf8")),
  ),
);
// Check bucket size plus pending uploads against a manually verified ACCOUNT allowance.
let token,
  existingBytes = 0;
const keys = new Map();
do {
  const result = await s3.send(
    new ListObjectsV2Command({ Bucket: e.R2_BUCKET, ContinuationToken: token }),
  );
  for (const o of result.Contents || []) {
    existingBytes += o.Size || 0;
    keys.set(o.Key, o.Size);
  }
  token = result.NextContinuationToken;
} while (token);
const added = receipts
  .filter((r) => !keys.has(`${r.id}.mp3`))
  .reduce((sum, r) => sum + r.bytes, 0);
const budget = Number(e.R2_AVAILABLE_FREE_BYTES || 0);
if (!budget || existingBytes + added > budget)
  throw new Error(
    "Upload stopped: exceeds verified free storage budget. Check the account allowance first.",
  );
for (const receipt of receipts) {
  const key = `${receipt.id}.mp3`;
  if (keys.has(key)) {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: e.R2_BUCKET, Key: key }),
    );
    if (head.Metadata?.sha256 !== receipt.audio_sha256)
      throw new Error(
        `Existing object differs: ${key}. Original not overwritten.`,
      );
  } else
    await s3.send(
      new PutObjectCommand({
        Bucket: e.R2_BUCKET,
        Key: key,
        Body: createReadStream(`.local/audio/${key}`),
        ContentLength: (await stat(`.local/audio/${key}`)).size,
        ContentType: "audio/mpeg",
        CacheControl: "private,max-age=3600",
        Metadata: { sha256: receipt.audio_sha256 },
        StorageClass: "STANDARD",
      }),
    );
  const head = await s3.send(
    new HeadObjectCommand({ Bucket: e.R2_BUCKET, Key: key }),
  );
  if (
    head.ContentLength !== receipt.bytes ||
    head.Metadata?.sha256 !== receipt.audio_sha256
  )
    throw new Error(`Upload verification failed: ${key}`);
  receipt.uploaded = true;
  await writeFile(
    `.local/media/${receipt.id}.json`,
    JSON.stringify(receipt, null, 2),
  );
  console.log(`${receipt.id}: uploaded and verified`);
}
console.log(
  `Verified ${receipts.length} objects. ${existingBytes + added} bytes accounted for in this bucket.`,
);
