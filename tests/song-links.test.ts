import test from 'node:test';
import assert from 'node:assert/strict';
import {linkedSong, songLink} from '../src/song-links';
test('song links preserve exact recordings and never carry account invitations or query tokens',()=>{
  const link=songLink('t239','https://example.com/archive/?token=private#invite=secret');
  assert.equal(link,'https://example.com/archive/#song=t239');
  assert.equal(linkedSong(new URL(link).hash),'t239');
  assert.equal(linkedSong('#invite=secret&song=t001'),'t001');
  for(const invalid of ['#song=../secret','#song=t9999','#room=t001','#song=<script>']) assert.equal(linkedSong(invalid),null);
  assert.throws(()=>songLink('../secret','https://example.com'));
});
