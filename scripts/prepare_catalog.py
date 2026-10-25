"""Prepare a private catalog from the original pack. Never publish raw source data."""
import json, re, pathlib, collections, unicodedata

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / '.local/source/data/tracks.json'

def clean_filename(name):
    # Repeated/incorrect extensions and export suffixes are formatting artifacts.
    name = re.sub(r'(?:\.(?:mp3|m4a|wav|mp4|flac)(?:-\d+)?)+$', '', name, flags=re.I)
    return re.sub(r'\s+', ' ', name.replace('_', ' ')).strip(' -')

def normalized(name):
    name = re.sub(r'-\d+$', '', name)
    name = ''.join(c for c in unicodedata.normalize('NFKD', name).lower() if not unicodedata.combining(c))
    name = re.sub(r'\b(?:unreleased|leak|official|v\d+|version\s*\d+)\b', '', name)
    return re.sub(r'[^a-z0-9]+', ' ', name).strip()

def prepare(source):
    estimates_file=ROOT/'.local/vibe-estimates.json'
    estimates={t['id']:t['tags'] for t in json.loads(estimates_file.read_text())} if estimates_file.exists() else {}
    tracks = []
    for raw in source['tracks']:
        original = clean_filename(raw['file'])
        title = raw.get('title') or original
        features = []
        feature_match = re.search(r'[\[(](?:feat\.?|ft\.?)\s+([^\])]+)', title, re.I)
        if feature_match:
            features = [x.strip() for x in re.split(r'\s*(?:&|,| and )\s*', feature_match[1]) if x.strip()]
            title = title[:feature_match.start()].strip()
        artist = raw.get('artist')
        # Only unambiguous explicit "artist - title" prefixes become primary credits.
        credited = re.match(r'^(Young Thug|Future|Lil Durk|Gunna|Lil Keed|EST Gee|Pooh Shiesty)\s+-\s+(.+)', title, re.I)
        if credited:
            artist = credited[1]; title = credited[2]
        # A with-artist collection can also use explicit x/feat credits in source names.
        if re.search(r'(?:\bx\s+|\bft\.?\s+|\bfeat\.?\s+)Gunna\b', original, re.I) and 'Gunna' not in features:
            features.append('Gunna')
        version_match = re.search(r'[\[(]((?:v\d+|[^\])]*\bEdit\b[^\])]*|Unreleased|LEAK[^\])]*)+)[\])]', title, re.I)
        version = version_match[1] if version_match else None
        display = (title[:version_match.start()] + title[version_match.end():]).strip() if version_match else title
        # Never infer a release status from the existing machine guesses.
        tags = []
        if re.search(r'\bedit\b|rough mix|new mix', original, re.I): tags.append('edit')
        if version: tags.append('version')
        key = normalized(display)
        # Explicit spelling variant from the source pack; preserve both displayed names.
        key = {'abrakadabra': 'abracadabra'}.get(key, key)
        # These two filename families explicitly identify the same title. Retain
        # every file/alias; do not merge ambiguous Homicide or Morning recordings.
        if key.startswith('16 space coup keed x thugger'): key='16 space coup'
        if key == 'young thug yes indeed audio': key='yes indeed'
        media = ROOT / f'.local/media/{raw["id"]}.json'
        metadata = json.loads(media.read_text()) if media.exists() else {}
        if metadata.get('needs_audio_review'): tags.append('audio-review')
        tags.extend(estimates.get(raw['id'],[]))
        tracks.append(dict(id=raw['id'], title=display or original, artist=artist, features=features,
            version=version, group_key=key, tags=tags, aliases=[original], duration=metadata.get('duration'),
            artwork=None, audio_key=f'{raw["id"]}.mp3' if metadata else None,
            available=bool(metadata.get('uploaded', False)), archive_order=raw['n']))
    counts = collections.Counter(t['group_key'] for t in tracks)
    for t in tracks:
        if counts[t['group_key']] > 1 and 'version' not in t['tags']: t['tags'].append('version')
    return tracks

if __name__ == '__main__':
    tracks = prepare(json.loads(SOURCE.read_text()))
    # Local preview may play prepared files without marking cloud copies as available.
    local = [{**t, 'available': (ROOT/f'.local/audio/{t["id"]}.mp3').exists()} for t in tracks]
    (ROOT/'.local/catalog.json').write_text(json.dumps(local, indent=2))
    (ROOT/'.local/cloud-catalog.json').write_text(json.dumps(tracks, indent=2))
    print(f'Prepared {len(tracks)} tracks; {len(set(t["id"] for t in tracks))} stable IDs; {sum(t["available"] for t in local)} local audio files.')
