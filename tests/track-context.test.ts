import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackCaption, trackArtists, trackContexts} from '../src/track-context';
import type {Track} from '../src/model';
const track = (id: string, extra = {}) => ({id, title:id, artist:null, features:[], version:null, group_key:id, tags:[], aliases:[], duration:null, artwork:null, audio_key:null, available:true, archive_order:1, ...extra}) as Track;
test('credits retain featured artists alongside versions and dated context', () => {
  const text = trackCaption(track('t239', {version: 'Archive mix'}));
  for (const part of ['Mariah the Scientist', 'Archive mix', 'File dated 2025', 'UY SCUTI', 'community', 'Guitar-led']) assert.ok(text.includes(part));
  assert.ok(!text.includes('Released'));
});
test('similar titles never inherit a different recording context', () => {
  assert.equal(trackContexts.t130, undefined);
  assert.equal(trackCaption(track('t130')), 'Credits unconfirmed');
  assert.deepEqual(trackArtists(track('t282', {artist:'Lil Uzi Vert', features:['Drake']})), ['Lil Uzi Vert','Drake']);
});
