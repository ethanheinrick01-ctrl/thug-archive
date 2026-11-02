import test from 'node:test';
import assert from 'node:assert/strict';
import { trackDisplay } from '../src/track-display';

const track = (title: string, extra: Partial<Parameters<typeof trackDisplay>[0]> = {}) => ({title,artist:null,features:[],aliases:[title],version:null,...extra});

test('presentation removes export numbering and explicit production credits without changing source values', () => {
  const source = track('01 NIGHT ROAD Prod. PRODUCER', {aliases:['01_NIGHT_ROAD_Prod._PRODUCER.mp3.mp3']});
  const before = structuredClone(source);
  assert.equal(trackDisplay(source).title, 'NIGHT ROAD');
  assert.deepEqual(source, before);
  assert.equal(trackDisplay(track('10 Years')).title, '10 Years');
  assert.equal(trackDisplay(track('21 Questions')).title, '21 Questions');
  assert.equal(trackDisplay(track('Production Line')).title, 'Production Line');
  assert.equal(trackDisplay(track('Night Road Prod. Producer v3')).title, 'Night Road (v3)');
  assert.equal(trackDisplay(track('Night Road Prod. Producer v3', {version:'v3'})).title, 'Night Road');
});

test('only named performer prefixes supply a display artist; missing leads stay missing', () => {
  assert.deepEqual(trackDisplay(track('Lil Durk - Night Road')), {title:'Night Road',artist:'Lil Durk',features:[]});
  assert.deepEqual(trackDisplay(track('Lil Durk Night Road')), {title:'Night Road',artist:'Lil Durk',features:[]});
  assert.deepEqual(trackDisplay(track('Future feat. Young Thug - Night Road')), {title:'Night Road',artist:'Future',features:['Young Thug']});
  assert.equal(trackDisplay(track('Night Road')).artist, null);
  assert.equal(trackDisplay(track('Future Plans')).title, 'Future Plans');
  assert.equal(trackDisplay(track('Young Thug & Guest - Night Road')).title, 'Young Thug & Guest - Night Road');
  assert.equal(trackDisplay(track('Lil Durk - Night Road', {artist:'Young Thug'})).title, 'Lil Durk - Night Road');
});

test('complete feature filenames are shown once and the recording version stays separate', () => {
  const source = track('Night Road (v2) [feat. Lil Keed]', {version:'v2'});
  assert.deepEqual(trackDisplay(source), {title:'Night Road',artist:null,features:['Lil Keed']});
  assert.equal(source.version, 'v2');
  assert.equal(trackDisplay(track('Night Road [feat.')).title, 'Night Road');
  assert.equal(trackDisplay(track('Night Road (Live)')).title, 'Night Road (Live)');
});

test('unfinished feature tails are withheld, never guessed from a likely name', () => {
  assert.deepEqual(trackDisplay(track('Night Road', {features:['Known Guest','Q'],aliases:['Night Road (feat. Known Guest & Q.mp3']})).features, ['Known Guest']);
  assert.deepEqual(trackDisplay(track('Night Road', {features:['Wiz Khalif'],aliases:['Night Road (feat. Wiz Khalif.mp3']})).features, []);
  assert.deepEqual(trackDisplay(track('Night Road', {features:['Q'],aliases:['Night Road (feat. Q).mp3']})).features, ['Q']);
  assert.deepEqual(trackDisplay(track('Night Road', {features:['Future'],aliases:['Night Road [feat. Future &']})).features, ['Future']);
});

test('a fragment expands only from one complete feature name in this recording’s aliases', () => {
  assert.deepEqual(trackDisplay(track('Night Road', {features:['Wiz Khalif'],aliases:['Night Road (feat. Wiz Khalif','Night Road (feat. Wiz Khalifa).mp3']})).features, ['Wiz Khalifa']);
  assert.deepEqual(trackDisplay(track('Night Road', {features:['Q'],aliases:['Night Road (feat. Quavo & Queen Naija).mp3']})).features, ['Q','Quavo','Queen Naija']);
});

test('glued producer credits and format labels stay out of the title without removing versions', () => {
  assert.equal(trackDisplay(track('BAD WOLFPROD BY JAVALE MCGEE OBI NWADIJE EFOSA BELOVED BLUE RONDO 787287394')).title, 'BAD WOLF');
  assert.equal(trackDisplay(track('Jeep [ALAC]', {version:'v2'})).title, 'Jeep');
  assert.equal(trackDisplay(track("I'm Back [Official Audio]")).title, "I'm Back");
  assert.equal(trackDisplay(track('Uncle M [Official Lyric Video]')).title, 'Uncle M');
  assert.equal(trackDisplay(track('Official Business (Live)')).title, 'Official Business (Live)');
});
