import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import {
  roomPosition,
  terminalRoomError,
  type ListeningRoom,
} from "../src/room-model.ts";

const room: ListeningRoom = {
  id: "11111111-1111-4111-8111-111111111111",
  host_id: "host",
  queue: ["t001", "t001"],
  queue_index: 0,
  position: 10,
  playing: true,
  shuffle: false,
  repeat_mode: "off",
  anchor_at: "2026-10-26T00:00:00Z",
  expires_at: "2099-01-01T00:00:00Z",
  ended_at: null,
  revision: 1,
};
class FakeAudio extends EventTarget {
  currentTime = 0;
  duration = NaN;
  paused = true;
  ended = false;
  readyState = 0;
  error: object | null = null;
  preload = "";
  private source = "";
  get src() {
    return this.source;
  }
  set src(value: string) {
    this.source = value;
    this.error = null;
    this.duration = 60;
    this.readyState = 4;
    this.dispatchEvent(new Event("loadedmetadata"));
  }
  getAttribute() {
    return this.source || null;
  }
  removeAttribute() {
    this.source = "";
  }
  load() {
    if (!this.source) {
      this.duration = NaN;
      this.readyState = 0;
      this.error = null;
    }
  }
  async play() {
    if (this.error) throw new Error("Failed media");
    this.paused = false;
    this.dispatchEvent(new Event("playing"));
  }
  pause() {
    const wasPlaying = !this.paused;
    this.paused = true;
    if (wasPlaying) this.dispatchEvent(new Event("pause"));
  }
}
function clientModule(
  file: string,
  dependencies: Record<string, unknown>,
  additions: Record<string, unknown> = {},
) {
  const exports: Record<string, any> = {};
  const storage = new Map<string, string>();
  const source = readFileSync(
    new URL(`../src/${file}.ts`, import.meta.url),
    "utf8",
  ).replaceAll("import.meta.env.BASE_URL", '"/"');
  const compiled =
    stripTypeScriptTypes(source, { mode: "strip" })
      .replace(
        /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/g,
        'const {$1} = require("$2");',
      )
      .replace(/export (class|const) /g, "$1 ") +
    (file === "player"
      ? "\nexports.ArchivePlayer = ArchivePlayer;"
      : "\nexports.listening = listening;");
  runInNewContext(compiled, {
    exports,
    require: (name: string) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    Audio: FakeAudio,
    navigator: {},
    location: { origin: "https://example.test" },
    URL,
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    window: {
      dispatchEvent: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    document: {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    CustomEvent: class {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...additions,
  });
  return { exports, storage };
}
function playerFixture() {
  let requests = 0;
  const plays: string[] = [];
  const { exports } = clientModule("player", {
    "./data": {
      audioUrls: async () => {
        requests++;
        return { t001: `https://audio.test/t001?v=${requests}` };
      },
      recordPlay: async (id: string) => {
        plays.push(id);
      },
    },
    "./model": { shuffled: (ids: string[]) => [...ids] },
  });
  const player = new exports.ArchivePlayer();
  player.connect(
    [{ id: "t001", available: true, duration: 60, title: "Fixture" }],
    "host",
  );
  return { player, plays, requests: () => requests };
}
test("retrying failed room media discards its signed URL and reloads the same track", async () => {
  const { player, requests } = playerFixture();
  await player.applyRoom(room, () => 10);
  const previous = player.audio.src;
  player.audio.error = { code: 4 };
  player.state.error = "Media failed";
  await player.applyRoom(room, () => 12);
  assert.notEqual(player.audio.src, previous);
  assert.equal(requests(), 2);
  assert.equal(player.state.playing, true);
  assert.equal(player.audio.currentTime, 12);
});
test("the displayed player action sends explicit Play or Pause intent", async () => {
  const { player } = playerFixture();
  const actions: string[] = [];
  player.roomCommand = async (action: { type: string }) => {
    actions.push(action.type);
  };
  player.state.playing = false;
  await player.toggle();
  player.state.playing = true;
  await player.toggle();
  await player.play();
  assert.deepEqual(actions, ["play", "pause", "play"]);
});
test("consecutive duplicate queue entries each count as a separate listen", async () => {
  const { player, plays, requests } = playerFixture();
  await player.applyRoom(room, () => 10);
  player.audio.dispatchEvent(new Event("timeupdate"));
  await player.applyRoom(
    { ...room, queue_index: 1, position: 0, revision: 2 },
    () => 0,
  );
  player.audio.currentTime = 6;
  player.audio.dispatchEvent(new Event("timeupdate"));
  assert.deepEqual(plays, ["t001", "t001"]);
  assert.equal(
    requests(),
    1,
    "the source may be reused without reusing its history flag",
  );
});
test("recovering the same queue entry does not count its listen twice", async () => {
  const { player, plays } = playerFixture();
  await player.applyRoom(room, () => 10);
  player.audio.dispatchEvent(new Event("timeupdate"));
  player.audio.error = { code: 4 };
  player.state.error = "Media failed";
  await player.applyRoom(room, () => 12);
  player.audio.dispatchEvent(new Event("timeupdate"));
  assert.equal(plays.length, 1);
});
function roomFixture(response: object) {
  let resets = 0;
  const player = {
    tracks: new Map(),
    roomCommand: async () => {},
    reset: () => {
      resets++;
    },
    connect: () => {},
    applyRoom: async () => {},
    state: { error: "" },
  };
  const { exports, storage } = clientModule("rooms", {
    "./data": {
      localPreview: false,
      supabase: { rpc: async () => response, removeChannel: async () => {} },
    },
    "./model": { shuffled: (ids: string[]) => [...ids] },
    "./player": { player },
    "./room-model": { roomPosition, terminalRoomError },
  });
  const listening = exports.listening;
  listening.setUser("host");
  listening.state.snapshot = {
    room,
    members: [],
    server_now: new Date().toISOString(),
  };
  listening.channel = { state: "joined" };
  player.roomCommand = async () => {};
  storage.set("thug-archive-room-v1:host", room.id);
  return { listening, player, storage, resets: () => resets };
}
test("a revoked member can leave locally and release the player controls", async () => {
  const { listening, player, resets } = roomFixture({
    error: { code: "42501", message: "Join this listening room first." },
  });
  await listening.leave();
  assert.equal(listening.state.snapshot, null);
  assert.equal(player.roomCommand, null);
  assert.equal(resets(), 1);
  assert.equal(listening.savedRoom, "");
});
test("membership loss during refresh detaches the stale room", async () => {
  const { listening, player } = roomFixture({
    error: { code: "42501", message: "Join this listening room first." },
  });
  await listening.refresh();
  assert.equal(listening.state.snapshot, null);
  assert.equal(player.roomCommand, null);
});
test("network failure still permits local exit and retains the link for recovery", async () => {
  const { listening, player } = roomFixture({
    error: { message: "Network unavailable" },
  });
  await listening.leave();
  assert.equal(listening.state.snapshot, null);
  assert.equal(player.roomCommand, null);
  assert.equal(listening.savedRoom, room.id);
});
test("successful refresh restores connection status while the channel remains joined", async () => {
  const { listening } = roomFixture({
    data: { room, members: [], server_now: new Date().toISOString() },
    error: null,
  });
  listening.state.connected = false;
  await listening.refresh();
  assert.equal(listening.state.connected, true);
  assert.equal(listening.state.error, "");
});
