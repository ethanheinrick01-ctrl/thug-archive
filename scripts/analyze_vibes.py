"""Rough discovery buckets, not authoritative mood labels or musical BPM annotations.

Analyze a 60-second excerpt after the intro using onset autocorrelation, transient
strength, spectral brightness, and bass balance. No external API or upload is used.
Inspired by spectral-flux onset/tempo estimation; half-time ambiguity is explicit.
"""
import pathlib,json,subprocess,concurrent.futures
import numpy as np
from scipy import signal
ROOT=pathlib.Path(__file__).resolve().parents[1]

def analyze(path):
    meta=json.loads((ROOT/'.local/media'/f'{path.stem}.json').read_text())
    start=min(25,meta['duration']*.15)
    raw=subprocess.check_output(['ffmpeg','-nostdin','-loglevel','fatal','-ss',str(start),'-i',str(path),'-t','60','-ac','1','-ar','11025','-f','f32le','-'])
    y=np.frombuffer(raw,dtype='<f4').astype(np.float64)
    if len(y)<11025*5: return {'id':path.stem,'tempo':None,'pulse':None,'energy':0,'bass':0}
    y=y/(np.sqrt(np.mean(y*y))+1e-9)
    frequencies,times,spectrum=signal.stft(y,fs=11025,nperseg=1024,noverlap=768,boundary=None)
    power=np.abs(spectrum)
    log=np.log1p(10*power)
    flux=np.maximum(np.diff(log,axis=1),0).mean(axis=0)
    flux=signal.detrend(flux,type='constant')
    autocorr=signal.correlate(flux,flux,mode='full',method='fft')[len(flux)-1:]
    frame_rate=11025/256
    low=int(frame_rate*60/180);high=min(len(autocorr)-1,int(frame_rate*60/65))
    peaks,_=signal.find_peaks(autocorr[low:high+1])
    candidates=peaks+low
    if len(candidates):
        # Modest prior toward a plausible beat; half-time conversion is for discovery.
        bpms=60*frame_rate/candidates
        score=autocorr[candidates]*np.exp(-.5*(np.log2(bpms/110)/1.2)**2)
        lag=candidates[int(np.argmax(score))];tempo=60*frame_rate/lag
        confidence=float(autocorr[lag]/(autocorr[0]+1e-9))
    else: tempo=90.;confidence=0.
    pulse=tempo/2 if tempo>115 else tempo
    attacks=float(np.percentile(np.maximum(flux,0),90))
    total=power.sum(axis=0)+1e-9
    brightness=float(np.median((power*frequencies[:,None]).sum(axis=0)/total))
    bass=float(np.median(power[frequencies<220].sum(axis=0)/total))
    return {'id':path.stem,'tempo':round(float(tempo),1),'pulse':round(float(pulse),1),'confidence':round(confidence,3),'attacks':attacks,'brightness':brightness,'bass':bass}

files=sorted((ROOT/'.local/audio').glob('*.mp3'))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: rows=list(pool.map(analyze,files))
def ranks(key):
    values=np.array([r.get(key,0) for r in rows]);return {r['id']:float(np.mean(values<=r.get(key,0))) for r in rows}
attack,bright,bass=ranks('attacks'),ranks('brightness'),ranks('bass')
for r in rows:
    r['energy']=round(.65*attack[r['id']]+.35*bright[r['id']],3)
    tags=[]
    if r.get('pulse') and r['confidence']>=.06:
        if r['pulse']<=82 and r['energy']<.72: tags.append('pace-slower')
        if r['pulse']>=85 and r['energy']>=.35: tags.append('pace-upbeat')
    if r['energy']>=.66 and bass[r['id']]>=.35: tags.append('pace-harder')
    r['tags']=tags
(ROOT/'.local/vibe-estimates.json').write_text(json.dumps(rows,indent=2))
print('Analyzed',len(rows),'tracks locally. Approximate groups:')
for tag in ['pace-slower','pace-upbeat','pace-harder']:print(tag,sum(tag in r['tags'] for r in rows))
