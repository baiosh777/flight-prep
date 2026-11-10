"""notam_fetch.py - run by .github/workflows/wx.yml on GitHub, not on the iPad.

NOTAMs for the airports in data/stations.txt from the FAA NOTAM API (api.faa.gov), which carries the
international NOTAMs exchanged through ICAO. It needs a free key: register at https://api.faa.gov,
create an application for "NOTAM API", then put the two values in the repository under
Settings -> Secrets and variables -> Actions as FAA_CLIENT_ID and FAA_CLIENT_SECRET.

Without the key this script simply exits and the app keeps using the OFP NOTAMs.
The FAA database is a cross-check, not a replacement: company NOTAMs (CO...), Lido chart NOTAMs
(CC/CA...) and some AIP supplements are not in it.
"""
import json, os, re, sys, time, urllib.request, urllib.parse, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CID, CSEC = os.environ.get('FAA_CLIENT_ID'), os.environ.get('FAA_CLIENT_SECRET')
URL = 'https://external-api.faa.gov/notamapi/v1/notams'


def stations():
    out = []
    for line in open(os.path.join(ROOT, 'data', 'stations.txt'), encoding='utf-8'):
        line = line.split('#')[0]
        for t in line.split():
            if re.fullmatch(r'[A-Z]{4}', t) and t not in out: out.append(t)
    return out


def fetch(icao):
    q = urllib.parse.urlencode({'icaoLocation': icao, 'pageSize': 50, 'pageNum': 1})
    req = urllib.request.Request(URL + '?' + q, headers={'client_id': CID, 'client_secret': CSEC, 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


def main():
    if not CID or not CSEC:
        print('no FAA key in the repository secrets - NOTAM file not written')
        return
    out, n = {}, 0
    for ic in stations():
        try:
            d = fetch(ic)
        except Exception as e:
            print(ic, 'failed:', e, file=sys.stderr); time.sleep(1); continue
        items = []
        for it in (d.get('items') or []):
            c = ((it.get('properties') or {}).get('coreNOTAMData') or {}).get('notam') or {}
            if not c: continue
            items.append({'id': c.get('number', ''), 'cat': c.get('classification', ''), 'from': c.get('effectiveStart', ''),
                          'to': c.get('effectiveEnd', ''), 'text': (c.get('text') or '').replace('\n', ' ')[:900]})
        if items: out[ic] = items; n += len(items)
        time.sleep(0.4)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%MZ')
    json.dump({'built': now, 'src': 'FAA NOTAM API (api.faa.gov)', 'notams': out},
              open(os.path.join(ROOT, 'data', 'notam.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('notam.json: %d NOTAMs at %d airports' % (n, len(out)))


if __name__ == '__main__':
    main()
