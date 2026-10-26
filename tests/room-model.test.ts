import test from "node:test";
import assert from "node:assert/strict";
import {
  roomPosition,
  roomIdFromLink,
  type ListeningRoom,
} from "../src/room-model.ts";

const room: ListeningRoom = {
  id: "11111111-1111-4111-8111-111111111111",
  host_id: "host",
  queue: ["t001"],
  queue_index: 0,
  position: 25,
  playing: true,
  shuffle: false,
  repeat_mode: "off",
  anchor_at: "2026-10-26T00:00:00Z",
  expires_at: "2026-10-27T00:00:00Z",
  ended_at: null,
  revision: 3,
};
test("late joins advance from the server anchor while paused rooms stay put", () => {
  const now = Date.parse(room.anchor_at) + 1550;
  assert.equal(roomPosition(room, now, 180), 26.55);
  assert.equal(
    roomPosition({ ...room, playing: false }, now + 3600000, 180),
    25,
  );
});
test("clock skew never seeks before the anchor or past the end of a song", () => {
  assert.equal(roomPosition(room, Date.parse(room.anchor_at) - 200, 180), 25);
  assert.equal(
    roomPosition(room, Date.parse(room.anchor_at) + 3600000, 180),
    180,
  );
});
test("room links and plain codes resolve without accepting account invitation codes", () => {
  assert.equal(
    roomIdFromLink(`https://example.com/thug-archive/#room=${room.id}`),
    room.id,
  );
  assert.equal(roomIdFromLink(room.id), room.id);
  assert.equal(
    roomIdFromLink("https://example.com/#invite=an-account-invite"),
    null,
  );
  assert.equal(roomIdFromLink("not a room"), null);
});
