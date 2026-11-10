"""wx_fetch.py - run by .github/workflows/wx.yml on GitHub, not on the iPad.

Reads data/stations.txt, asks aviationweather.gov (NOAA Aviation Weather Center, public, no key) for the
current METAR and TAF of each airport and the international SIGMETs, and writes them next to the app as
data/wx.json and data/sigmet.json. The app fetches those from its own address, so there is no CORS problem
and no third-party proxy.

Nothing is interpreted here: the raw report and its time are stored as they come.
"""
import json, os, re, sys, urllib.request, urllib.parse, datetime

API = 'https://aviationweather.gov/api/data/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'flight-prep-app (personal flight preparation; github actions)'}


def stations():
    p = os.path.join(ROOT, 'data', 'stations.txt')
    out = []
    for line in open(p, encoding='utf-8'):
        line = line.split('#')[0]
        for t in line.split():
            if re.fullmatch(r'[A-Z]{4}', t) and t not in out: out.append(t)
    return out


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


def chunk(l, n):
    for i in range(0, len(l), n): yield l[i:i + n]


def main():
    ids = stations()
    metar, taf = {}, {}
    for part in chunk(ids, 60):
        q = urllib.parse.urlencode({'ids': ','.join(part), 'format': 'json'})
        try:
            for r in get(API + 'metar?' + q):
                ic = r.get('icaoId')
                if ic and r.get('rawOb'): metar[ic] = {'raw': r['rawOb'], 'time': (r.get('reportTime') or '')[11:16].replace(':', '') + 'Z'}
        except Exception as e:
            print('metar', part[0], 'failed:', e, file=sys.stderr)
        try:
            for r in get(API + 'taf?' + q):
                ic = r.get('icaoId')
                if ic and r.get('rawTAF'): taf[ic] = {'raw': r['rawTAF'], 'time': (r.get('issueTime') or '')[11:16].replace(':', '') + 'Z'}
        except Exception as e:
            print('taf', part[0], 'failed:', e, file=sys.stderr)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%MZ')
    out = {'built': now, 'src': 'aviationweather.gov (NOAA AWC)', 'stations': len(ids), 'metar': metar, 'taf': taf}
    os.makedirs(os.path.join(ROOT, 'data'), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, 'data', 'wx.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('wx.json: %d METAR, %d TAF of %d stations' % (len(metar), len(taf), len(ids)))
    try:
        sig = get(API + 'isigmet?format=json')
        keep = [{'fir': s.get('firId', ''), 'name': s.get('firName', ''), 'haz': s.get('hazard', ''), 'from': s.get('validTimeFrom', ''),
                 'to': s.get('validTimeTo', ''), 'txt': (s.get('rawSigmet') or '')[:900]} for s in sig]
        json.dump({'built': now, 'src': 'aviationweather.gov isigmet', 'sigmets': keep},
                  open(os.path.join(ROOT, 'data', 'sigmet.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print('sigmet.json:', len(keep))
    except Exception as e:
        print('sigmet failed:', e, file=sys.stderr)


if __name__ == '__main__':
    main()
