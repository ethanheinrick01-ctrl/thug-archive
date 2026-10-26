import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMp3 } from '../supabase/functions/uploads/mp3.ts';
function audio(){const bytes=new Uint8Array(417*100);for(let p=0;p<bytes.length;p+=417)bytes.set([255,251,144,0],p);return bytes;}
test('MP3 frame inspection accepts complete audio and strips ID3 metadata',()=>{
 const raw=audio(),tagged=new Uint8Array(raw.length+20+128);tagged.set([73,68,51,3,0,0,0,0,0,10]);tagged.set(raw,20);tagged.set([84,65,71],20+raw.length);
 const result=inspectMp3(tagged);assert.deepEqual(result.audio,raw);assert.ok(result.duration>2&&result.duration<3);
});
test('renamed executables, corrupt tags, truncation and appended payloads are rejected',()=>{
 assert.throws(()=>inspectMp3(new Uint8Array(2000).fill(77)));
 const truncated=audio().slice(0,-1);assert.throws(()=>inspectMp3(truncated));
 const trailing=new Uint8Array(audio().length+100);trailing.set(audio());trailing.fill(1,audio().length);assert.throws(()=>inspectMp3(trailing));
 const bad=audio();bad.set([73,68,51,3,0,0,255,127,127,127]);assert.throws(()=>inspectMp3(bad));
});
test('empty and oversized uploads fail before reservation',()=>{
 assert.throws(()=>inspectMp3(new Uint8Array(0)));assert.throws(()=>inspectMp3(new Uint8Array(31457281)));
});
