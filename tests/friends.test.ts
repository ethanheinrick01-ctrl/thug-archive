import test from 'node:test';
import assert from 'node:assert/strict';
import { friendError, prepareFriendMessage } from '../src/friends-model';

test('uncertain message retries reuse an id only for the same peer, body and room',()=>{
  const first=prepareFriendMessage(null,'friend-a','  hello  ');
  assert.equal(first.body,'hello');
  assert.equal(prepareFriendMessage(first,'friend-a','hello'),first);
  assert.notEqual(prepareFriendMessage(first,'friend-b','hello').id,first.id);
  assert.notEqual(prepareFriendMessage(first,'friend-a','different').id,first.id);
  assert.notEqual(prepareFriendMessage(first,'friend-a','hello','room').id,first.id);
  assert.notEqual(prepareFriendMessage(first,'friend-a','hello',null,'t001').id,first.id);
});
test('song attachments can have no caption and retain the exact recording on retries',()=>{
  const first=prepareFriendMessage(null,'friend-a','',null,'t001');
  assert.equal(first.track,'t001');
  assert.equal(prepareFriendMessage(first,'friend-a','',null,'t001'),first);
  assert.notEqual(prepareFriendMessage(first,'friend-a','',null,'t002').id,first.id);
  assert.throws(()=>prepareFriendMessage(null,'friend-a','','room','t001'),/separately/);
});
test('private messages preserve text and enforce Unicode character limits',()=>{
  assert.equal(prepareFriendMessage(null,'a','<img onerror=attack> 😎').body,'<img onerror=attack> 😎');
  assert.equal(Array.from(prepareFriendMessage(null,'a','😎'.repeat(1000)).body).length,1000);
  assert.throws(()=>prepareFriendMessage(null,'a','😎'.repeat(1001)),/1,000/);
  assert.throws(()=>prepareFriendMessage(null,'a','   '),/Write/);
});
test('friendship permission loss and stale edits show actionable errors, network failures preserve drafts',()=>{
  assert.equal(friendError({code:'42501',message:'You must be friends to open this conversation.'}),'You must be friends to open this conversation.');
  assert.match(friendError({code:'P0001',message:'This friendship changed. Refresh and try again.'}),/Refresh/);
  assert.match(friendError(new Error('private database details')),/draft is still here/);
  assert.doesNotMatch(friendError(new Error('private database details')),/database/);
});
