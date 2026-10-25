"""Capture decoded duration and warnings, separately from listening review."""
import pathlib,json,subprocess,concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]
def audit(path):
    r=subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-nostats','-progress','pipe:1','-i',str(path),'-map','0:a:0','-f','null','-'],capture_output=True,text=True)
    receipt=ROOT/'.local/media'/f'{path.stem}.json';meta=json.loads(receipt.read_text())
    times=[int(line.split('=',1)[1])/1000000 for line in r.stdout.splitlines() if line.startswith('out_time_us=')]
    if times: meta['duration']=max(times)
    meta['decode_warnings']=r.stderr.strip()[-2000:]
    meta['decode_exit_code']=r.returncode
    meta['needs_audio_review']=bool(r.stderr.strip()) or r.returncode!=0
    receipt.write_text(json.dumps(meta,indent=2))
    return {'id':path.stem,'duration':meta['duration'],'warning':meta['decode_warnings'],'exit':r.returncode}
files=sorted((ROOT/'.local/audio').glob('*.mp3'))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: results=list(pool.map(audit,files))
(ROOT/'.local/media-audit.json').write_text(json.dumps(results,indent=2))
flagged=[r for r in results if r['warning'] or r['exit']]
print(f'Audited {len(results)} files; {len(flagged)} need listening review.')
for r in flagged: print(r['id'],r['warning'][:180])
