"""Inspect actual audio, preserve originals, copy/remux before considering conversion."""
import pathlib, json, subprocess, hashlib, os, argparse
ROOT = pathlib.Path(__file__).resolve().parents[1]
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()
p = argparse.ArgumentParser(); p.add_argument('--limit', type=int); args=p.parse_args()
tracks=json.loads((ROOT/'.local/source/data/tracks.json').read_text())['tracks']
for d in ['audio','media']: (ROOT/'.local'/d).mkdir(parents=True,exist_ok=True)
processed=0; missing=[]
for track in tracks:
    source=ROOT/'.local/raw'/track['file']; target=ROOT/f'.local/audio/{track["id"]}.mp3'; receipt=ROOT/f'.local/media/{track["id"]}.json'
    if not source.exists(): missing.append(track['id']); continue
    if receipt.exists() and target.exists(): continue
    if args.limit and processed>=args.limit: break
    try:
        probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(source)]))
        stream=next(s for s in probe['streams'] if s['codec_type']=='audio')
        temp=target.with_suffix('.partial.mp3')
        # MP3 is copied without lossy recompression. Other formats are converted once.
        codec=stream['codec_name']; duration=float(probe['format'].get('duration',stream.get('duration',0)))
        command=['ffmpeg','-nostdin','-loglevel','error','-y','-i',str(source),'-map','0:a:0','-vn','-c:a','copy' if codec=='mp3' else 'libmp3lame']
        if codec!='mp3': command+=['-b:a','192k']
        subprocess.run(command+[str(temp)],check=True)
        subprocess.run(['ffmpeg','-nostdin','-loglevel','error','-i',str(temp),'-f','null','-'],check=True)
        os.replace(temp,target)
        receipt.write_text(json.dumps({'id':track['id'],'codec_original':codec,'duration':duration,'original_sha256':digest(source),'audio_sha256':digest(target),'bytes':target.stat().st_size,'uploaded':False},indent=2))
        print(track['id'],codec,'→ mp3',round(duration,1),'seconds',flush=True);processed+=1
    except (subprocess.CalledProcessError,StopIteration,ValueError) as e: print('FAILED',track['id'],type(e).__name__,flush=True)
print(f'Prepared {processed}; missing originals: {len(missing)}.')
