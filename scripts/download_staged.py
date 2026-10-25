"""Download authenticated connector-returned files; URLs stay in ignored local staging."""
import pathlib,json,urllib.request,concurrent.futures,sys,unicodedata,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
raw=ROOT/'.local/raw';raw.mkdir(exist_ok=True)
originals=json.loads((ROOT/'.local/source/data/tracks.json').read_text())['tracks']
names={unicodedata.normalize('NFC',t['file']):t['file'] for t in originals}
def get(f):
    filename=names.get(unicodedata.normalize('NFC',f['file']))
    if not filename or pathlib.Path(filename).name!=filename: raise ValueError('File is not in the manifest')
    target=raw/filename
    if target.exists() and target.stat().st_size>0: return target.stat().st_size
    temp=target.with_suffix(target.suffix+'.partial')
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(f['url'],temp)
            if temp.stat().st_size!=int(f['bytes']): raise ValueError('Downloaded size mismatch')
            temp.replace(target);return target.stat().st_size
        except Exception:
            if attempt==2: raise
            time.sleep(attempt+1)
files=json.loads(pathlib.Path(sys.argv[1]).read_text())
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    total=sum(pool.map(get,files))
print(f'Downloaded/verified {len(files)} originals ({total:,} bytes).')
