import test from 'node:test';
import assert from 'node:assert/strict';
import { playlistDragOrder } from '../src/playlist-editor-model';

test('dragging uses the entire saved playlist order and preserves unavailable songs and versions', () => {
  const ids = ['first-version', 'unavailable', 'second-version', 'last'];
  const rows = ids.map((id, index) => ({ id, center: 50 + index * 80 }));
  assert.deepEqual(playlistDragOrder(ids, 'first-version', 400, rows), ['unavailable', 'second-version', 'last', 'first-version']);
  assert.deepEqual(playlistDragOrder(ids, 'last', 0, rows), ['last', 'first-version', 'unavailable', 'second-version']);
  assert.deepEqual(ids, ['first-version', 'unavailable', 'second-version', 'last']);
});

test('incomplete geometry and a missing dragged song cannot silently reorder a playlist', () => {
  const ids = ['a', 'b', 'c'];
  assert.strictEqual(playlistDragOrder(ids, 'a', 300, [{ id: 'b', center: 100 }]), ids);
  assert.strictEqual(playlistDragOrder(ids, 'missing', 300, ids.map((id, center) => ({ id, center }))), ids);
  assert.strictEqual(playlistDragOrder(ids, 'a', NaN, ids.map((id, center) => ({ id, center }))), ids);
});
