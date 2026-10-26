import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeRoomMessages,
  roomMessageError,
  type RoomMessage,
} from "../src/room-chat-model.ts";

const message = (id: number, room = "one"): RoomMessage => ({
  id: String(id).padStart(4, "0"),
  room_id: room,
  user_id: "guest",
  display_name: "Guest",
  body: `Message ${id}`,
  created_at: new Date(Date.UTC(2026, 9, 25, 12, 0, id)).toISOString(),
});

test("overlapping history, realtime events and send responses render once in order", () => {
  const messages = mergeRoomMessages(
    "one",
    [message(2)],
    [message(3), message(1), message(2)],
  );
  assert.deepEqual(
    messages.map((item) => item.id),
    ["0001", "0002", "0003"],
  );
});
test("late events from another room are excluded and history remains bounded", () => {
  const messages = mergeRoomMessages(
    "one",
    [message(999, "other")],
    Array.from({ length: 150 }, (_, i) => message(i)),
  );
  assert.equal(messages.length, 100);
  assert.equal(messages[0].id, "0050");
  assert.equal(messages.at(-1)?.id, "0149");
});
test("plain message text is preserved, including markup and emoji", () => {
  const raw = { ...message(1), body: '<img src=x onerror="alert(1)"> 😂' };
  assert.equal(mergeRoomMessages("one", [], [raw])[0].body, raw.body);
});
test("send failures distinguish revoked membership, rate limits and network recovery", () => {
  assert.match(roomMessageError({ code: "42501" }), /Rejoin/);
  assert.equal(
    roomMessageError({ code: "P0001", message: "Give it a second." }),
    "Give it a second.",
  );
  assert.match(roomMessageError(new Error("offline")), /draft is still here/);
});
