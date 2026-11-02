import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackCaption, trackArtists, trackContexts} from '../src/track-context';
import {soundFamilies, soundNeighbors} from '../src/sound-families';
import type {Track} from '../src/model';
const track = (id: string, extra = {}) => ({id, title:id, artist:null, features:[], version:null, group_key:id, tags:[], aliases:[], duration:null, artwork:null, audio_key:null, available:true, archive_order:1, ...extra}) as Track;
test('credits retain featured artists alongside versions and dated context', () => {
  const text = trackCaption(track('t239', {version: 'Archive mix'}));
  for (const part of ['Mariah the Scientist', 'Archive mix', 'File dated 2025', 'UY SCUTI', 'community', 'Guitar-led']) assert.ok(text.includes(part));
  assert.ok(!text.includes('Released'));
});
test('similar titles never inherit a different recording context', () => {
  assert.equal(trackContexts.t130.era, 'Hy!£UN35 [V4]');
  assert.ok(!trackCaption(track('t130')).includes('Punk'));
  assert.match(trackCaption(track('t130')), /possible tracker match/);
  assert.deepEqual(trackArtists(track('t282', {artist:'Lil Uzi Vert', features:['Drake']})), ['Lil Uzi Vert','Drake']);
});

test('separate songs sharing a title do not inherit the released album metadata', () => {
  assert.equal(trackContexts.t193.era, 'Punk [V2]');
  assert.equal(trackContexts.t193.release, undefined);
  assert.match(trackCaption(track('t205')), /Expensive Pain/);
  assert.match(trackCaption(track('t115')), /File dated 2018/);
  assert.match(trackCaption(track('t115')), /Song release: 2025/);
});

test('sound suggestions identify their uncertainty and preserve distinct neighboring songs', () => {
  assert.ok(soundFamilies.guitar.includes('t239'));
  assert.match(trackCaption(track('t239')), /Audio estimate: guitar-like/);
  assert.ok(soundNeighbors.t239.includes('t115'));
  for (const [id, related] of Object.entries(soundNeighbors)) {
    assert.ok(!related.includes(id));
    assert.equal(new Set(related).size, related.length);
  }
  assert.deepEqual(trackArtists(track('t209')), ['Young Thug', 'Carnage', 'Meek Mill']);
});
