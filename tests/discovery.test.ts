import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryIndex, datedEvidence, emptyFilters, matchesDiscovery, selectRecordings, type DiscoveryFilters } from '../src/discovery';
import { trackContexts, trackCaption } from '../src/track-context';
import type { Track } from '../src/model';

const track = (id: string, extra: Partial<Track> = {}): Track => ({id,title:id,artist:null,features:[],aliases:[],version:null,group_key:id,tags:[],duration:180,artwork:null,audio_key:null,available:true,archive_order:1,...extra});
const tracks = [track('t239',{title:'BIRTHDAY BOY'}),track('t226',{title:'To Me'}),track('t115',{title:'Rosetta Stone'}),track('t013'),track('unknown',{title:'Unassigned'})];
const index = createDiscoveryIndex(tracks);
const select = (patch: Partial<DiscoveryFilters>, query = '') => selectRecordings(tracks,query,{...emptyFilters(),...patch},'archive',index).map(t=>t.id);

test('sound choices combine within their section and intersect with eras', () => {
  assert.deepEqual(select({sounds:['guitar-led','guitar']}),['t239','t226','t115']);
  assert.deepEqual(select({sounds:['guitar-led'],eras:['BEAUTIFUL THUGGER GIRLS']}),['t226']);
  assert.deepEqual(select({sounds:['guitar-led'],eras:['UY SCUTI']}),['t239']);
});
test('one normalized matcher resolves featured credits and punctuation on every source list', () => {
  for (const query of ['Mariah','mariah   the scientist','guitar like','GUITAR-LIKE']) assert.equal(matchesDiscovery(tracks[0],query,emptyFilters(),index),true);
  assert.deepEqual(select({artists:['Mariah the Scientist'],role:'featured'}),['t239']);
  assert.deepEqual(select({artists:['Mariah the Scientist'],role:'lead'}),[]);
  assert.deepEqual(select({artists:['Young Thug'],role:'lead'}),['t239','t226','t115','t013']);
});
test('filtering preserves scope order, separate versions, and duplicate queue occurrences', () => {
  const a=track('t239',{group_key:'same'}),b=track('t226',{group_key:'same'});
  const source=[b,a,b],idx=createDiscoveryIndex([a,b]);
  const result=selectRecordings(source,'',{...emptyFilters(),sounds:['guitar-led']},'archive',idx);
  assert.deepEqual(result.map(t=>t.id),['t226','t239','t226']);
  assert.deepEqual(source.map(t=>t.id),['t226','t239','t226']);
  const queue=source.map((t,position)=>({t,position})).filter(e=>matchesDiscovery(e.t,'Mariah',emptyFilters(),idx));
  assert.deepEqual(queue.map(e=>e.position),[1]);
});
test('artist sort uses the visible resolved credit without mutating saved sequence', () => {
  const source=[track('t239'),track('t200'),track('missing'),track('z',{artist:'Zayn'})];
  const result=selectRecordings(source,'',emptyFilters(),'artist',createDiscoveryIndex(source));
  assert.deepEqual(result.map(t=>t.id),['t200','t239','z','missing']);
  assert.equal(source[0].id,'t239');
});
test('file, preview, recording and release evidence never collapse into one year', () => {
  assert.equal(datedEvidence('t064')[0].kind,'file');
  assert.equal(datedEvidence('t226')[0].kind,'preview');
  assert.deepEqual(select({dateKind:'file',year:'2025'}),['t239']);
  assert.deepEqual(select({dateKind:'recorded',year:'2025'}),[]);
  assert.ok(select({dateKind:'recorded',year:'unknown'}).includes('t239'));
  assert.ok(datedEvidence('t115').some(x=>x.kind==='released'&&x.from===2025));
});
test('tentative matches stay qualified even when there is no era', () => {
  assert.equal(trackContexts.t239.possible,true);
  assert.equal(trackContexts.t064.possible,true);
  assert.match(trackCaption(track('t200')),/possible song match/);
  assert.doesNotMatch(trackCaption(track('t064')),/Recorded 2016/);
});
test('missing sound tags mean unassigned and never mean an instrument is absent', () => {
  assert.deepEqual(select({evidence:['unassigned']}),['unknown']);
  assert.deepEqual(select({sounds:['guitar'],evidence:['unassigned']}),[]);
  assert.ok(index.facts.get('t226')?.sounds.includes('guitar-led'));
  assert.ok(!index.facts.get('t226')?.sounds.includes('guitar'));
});
