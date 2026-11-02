import {test} from 'node:test';
import assert from 'node:assert/strict';
import {trackCaption,trackArtists,trackCreditLabel} from '../src/track-context';
import {soundNeighbors} from '../src/similar-tracks';
import type {Track} from '../src/model';
const track=(extra:Partial<Track>={})=>({id:'t001',title:'Song',artist:null,features:[],version:null,group_key:'song',tags:[],aliases:[],duration:180,artwork:null,audio_key:null,available:true,archive_order:1,...extra}) as Track;
test('performer display keeps catalog names and versions without inferred research credits',()=>{
 assert.equal(trackCaption(track({artist:'YOUNG THUG',features:['Gunna'],version:'Alternate take'})),'Young Thug · Gunna · Alternate take');
 assert.deepEqual(trackArtists(track({artist:'Young Thug',features:['YOUNG THUG','Gunna']})),['Young Thug','Gunna']);
 assert.equal(trackCreditLabel(track({features:['Gunna']})),'feat. Gunna');
 assert.equal(trackCreditLabel(track()),'');
 assert.equal(trackCaption(track({tags:['pace-harder','audio-review']})),'');
});
test('song suggestions never return themselves or duplicate neighbors',()=>{
 for(const [id,related] of Object.entries(soundNeighbors)){
  assert.ok(!related.includes(id));assert.equal(new Set(related).size,related.length);
 }
});
