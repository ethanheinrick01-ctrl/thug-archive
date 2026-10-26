// Walk every MPEG Layer III frame. Reject disguised files, truncated frames, and
// oversized tags; remove metadata before publishing. This is structural validation,
// not a malware scanner or a claim that every recording sounds correct.
export function inspectMp3(b: Uint8Array) {
 if(b.length<1024 || b.length>30*1024*1024) throw new Error('Choose an MP3 between 1 KB and 30 MB.');
 let start=0;
 if(String.fromCharCode(...b.slice(0,3))==='ID3') {
  if(![2,3,4].includes(b[3]) || b.slice(6,10).some(x=>x>127)) throw new Error('Invalid MP3 metadata.');
  const size=b[6]*2097152+b[7]*16384+b[8]*128+b[9];
  start=10+size+((b[3]===4 && (b[5]&16))?10:0);
  if(start>2*1024*1024 || start>=b.length) throw new Error('MP3 artwork or metadata is too large. Export an MP3 with smaller artwork.');
 }
 let p=start,frames=0,duration=0;
 while(p+4<=b.length) {
  if(b.length-p===128 && String.fromCharCode(...b.slice(p,p+3))==='TAG') break;
  const a=b[p+1],c=b[p+2];
  if(b[p]!==255 || (a&224)!==224 || ((a>>1)&3)!==1 || ((a>>3)&3)===1) throw new Error('This file is not a complete MP3. Export it as MP3 and try again.');
  const v=(a>>3)&3,bi=c>>4,si=(c>>2)&3;
  if(bi===0||bi===15||si===3) throw new Error('Unsupported MP3 encoding. Export a standard MP3 and try again.');
  const rate=[44100,48000,32000][si]/(v===3?1:v===2?2:4);
  const kbps=(v===3?[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160])[bi];
  const length=Math.floor((v===3?144:72)*kbps*1000/rate)+((c>>1)&1);
  if(p+length>b.length) throw new Error('The MP3 is cut off. Upload the complete file.');
  p+=length;frames++;duration+=(v===3?1152:576)/rate;
 }
 if(p!==b.length && !(b.length-p===128 && String.fromCharCode(...b.slice(p,p+3))==='TAG')) throw new Error('Unexpected data after MP3 audio. Export a clean MP3 and try again.');
 if(frames<10 || duration<1 || duration>1800) throw new Error('Choose a song between 1 second and 30 minutes.');
 return {duration,audio:b.slice(start,p)};
}
export async function digest(bytes: Uint8Array) {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource))).map(x=>x.toString(16).padStart(2,'0')).join('');
}
