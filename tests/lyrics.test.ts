import test from 'node:test';
import assert from 'node:assert/strict';
import {activeLyric, parseLyrics} from '../src/lyrics-model.ts';
const lines=[{start:1,end:2,text:'First'},{start:3,end:4,text:'Second'}];
test('lyrics follow seeks and clear highlighting in gaps or after the song',()=>{
 assert.equal(activeLyric(lines,1.5),0);
 assert.equal(activeLyric(lines,3.5),1);
 assert.equal(activeLyric(lines,1),0);
 assert.equal(activeLyric(lines,2.5),-1);
 assert.equal(activeLyric(lines,4),-1);
});
test('invalid lyric records are excluded and valid lines sorted',()=>{
 assert.deepEqual(parseLyrics([lines[1],{start:-1,end:2,text:'bad'},lines[0],{start:2,end:1,text:'bad'}]),lines);
 assert.deepEqual(parseLyrics(null),[]);
});
