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

test('playlist links preserve the playlist and strip unrelated tokens', async () => {
  const {linkedPlaylist,playlistLink}=await import('../src/song-links');
  const id='12345678-1234-1234-1234-123456789abc';
  assert.equal(linkedPlaylist('#playlist='+id),id);
  assert.equal(linkedPlaylist('#playlist=bad'),null);
  assert.equal(playlistLink(id,'https://example.com/archive/?token=secret#invite=private'),'https://example.com/archive/#playlist='+id);
  assert.throws(()=>playlistLink('bad','https://example.com'));
});
