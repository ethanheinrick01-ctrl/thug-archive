import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupTracks,
  matches,
  moveItem,
  shuffled,
  type Track,
} from "../src/model.ts";
const track = (id: string, title: string, key: string): Track => ({
  id,
  title,
  group_key: key,
  artist: null,
  features: [],
  aliases: [],
  tags: [],
  version: null,
  duration: null,
  artwork: null,
  audio_key: null,
  available: false,
  archive_order: 1,
});
test("versions remain separate recordings while sharing one group", () => {
  const tracks = [
    track("t001", "Die For You", "die for you"),
    track("t002", "Die For You", "die for you"),
    track("t003", "Atari", "atari"),
  ];
  const groups = groupTracks(tracks);
  assert.deepEqual(
    groups.map((g) => g.map((t) => t.id)),
    [["t001", "t002"], ["t003"]],
  );
});
test("search finds punctuation/diacritic variants and original aliases", () => {
  const t = {
    ...track("t001", "Diseasë", "disease"),
    aliases: ["original_file-name.m4a.mp3"],
    features: ["Gunna"],
  };
  assert.ok(matches(t, "disease"));
  assert.ok(matches(t, "original file"));
  assert.ok(matches(t, "Gunna"));
  assert.equal(matches(t, "Future"), false);
});
test("playlist reorder preserves every ID and rejects invalid positions", () => {
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 2), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b"], -1, 1), ["a", "b"]);
});
test("shuffle preserves the multiset including intentional repeated queue entries", () => {
  const a = ["a", "a", "b", "c"];
  const result = shuffled(a, () => 0);
  assert.deepEqual([...result].sort(), [...a].sort());
  assert.notDeepEqual(result, a);
});
