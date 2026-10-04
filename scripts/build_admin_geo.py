#!/usr/bin/env python3
"""
Build Thailand's administrative geography for the app (Python 3 standard library only).

Sources:
  - Names, codes and centre points (province, district, sub-district) in Thai and English:
    OCHA COD-AB for Thailand on HDX, from the Royal Thai Survey Department. CC BY-IGO.
    https://data.humdata.org/dataset/cod-ab-tha  (the .xlsx resource)
  - Province and district polygons: geoBoundaries gbOpen THA ADM1 / ADM2 (simplified). CC BY 4.0.
    https://www.geoboundaries.org

Writes:
  src/data/provinces.ts                     77 provinces: code, slug, names, region, centre, bounds
  public/geo/provinces.geojson              province outlines
  public/geo/p/<code>/districts.geojson     district outlines with Thai and English names
  public/geo/p/<code>/tambons.json          sub-district centre points: [pcode, th, en, district pcode, lng, lat]

Usage: python3 scripts/build_admin_geo.py [path/to/tha_admin_boundaries.xlsx]
"""
import json
import os
import re
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from xlsx_read import read  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'jaidee-geo')
COD_XLSX = ('https://data.humdata.org/dataset/d24bdc45-eb4c-4e3d-8b16-44db02667c27/resource/'
            'a925b917-01ae-48c4-9279-7efe680a6b11/download/tha_admin_boundaries.xlsx')
GB = 'https://github.com/wmgeolab/geoBoundaries/raw/main/releaseData/gbOpen/THA/{0}/geoBoundaries-THA-{0}_simplified.geojson'

# Six-region grouping used by the Thai Meteorological Department (and most Thai flood sites).
REGIONS = {
    'north': [50, 51, 52, 53, 54, 55, 56, 57, 58],
    'central': [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 26, 60, 61, 62, 64, 65, 66, 67, 72, 73, 74, 75],
    'east': [20, 21, 22, 23, 24, 25, 27],
    'northeast': list(range(30, 50)),
    'west': [63, 70, 71, 76, 77],
    'south': [80, 81, 82, 83, 84, 85, 86, 90, 91, 92, 93, 94, 95, 96],
}
REGION_OF = {str(c): r for r, codes in REGIONS.items() for c in codes}


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print('downloading', url)
        urllib.request.urlretrieve(url, path)
    return path


def rings(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [ring for poly in polys for ring in poly[:1]]  # outer rings only


def inside(pt, geom):
    x, y = pt
    hit = False
    for ring in rings(geom):
        for i in range(len(ring) - 1):
            (x1, y1), (x2, y2) = ring[i][:2], ring[i + 1][:2]
            if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
                hit = not hit
    return hit


def bbox(geom):
    xs = [p[0] for r in rings(geom) for p in r]
    ys = [p[1] for r in rings(geom) for p in r]
    return [min(xs), min(ys), max(xs), max(ys)]


def rounded(geom, nd=4):
    def r(c):
        return [round(c[0], nd), round(c[1], nd)] if isinstance(c[0], (int, float)) else [r(x) for x in c]
    return {'type': geom['type'], 'coordinates': r(geom['coordinates'])}


def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def main():
    xlsx = sys.argv[1] if len(sys.argv) > 1 else fetch(COD_XLSX, 'tha_admin_boundaries.xlsx')
    sheets = {1: read(xlsx, 2), 2: read(xlsx, 3)}
    points = read(xlsx, 6)
    gb1 = json.load(open(fetch(GB.format('ADM1'), 'adm1.geojson')))['features']
    gb2 = json.load(open(fetch(GB.format('ADM2'), 'adm2.geojson')))['features']

    # Provinces: COD names joined to geoBoundaries outlines by ISO code (TH-50 ↔ TH50).
    outline = {f['properties']['shapeISO'].replace('-', ''): f['geometry'] for f in gb1}
    provinces = []
    features = []
    for row in sorted(sheets[1], key=lambda r: r['adm1_pcode']):
        pcode = row['adm1_pcode']
        code = pcode[2:]
        geom = outline[pcode]
        en = row['adm1_name']
        p = {
            'code': code,
            'slug': slug(en),
            'th': row['adm1_name1'],
            'en': en,
            'region': REGION_OF[code],
            'center': [round(float(row['center_lon']), 4), round(float(row['center_lat']), 4)],
            'bbox': [round(v, 3) for v in bbox(geom)],
        }
        provinces.append(p)
        features.append({'type': 'Feature', 'properties': p,
                         'geometry': rounded(geom, 3)})
    assert len(provinces) == 77, len(provinces)

    os.makedirs(os.path.join(ROOT, 'public/geo/p'), exist_ok=True)
    json.dump({'type': 'FeatureCollection', 'features': features},
              open(os.path.join(ROOT, 'public/geo/provinces.geojson'), 'w'), ensure_ascii=False, separators=(',', ':'))

    # Districts: each geoBoundaries outline takes the COD district whose centre point falls inside it.
    cod2 = sheets[2]
    boxes = [(f, bbox(f['geometry'])) for f in gb2]
    by_province = {p['code']: [] for p in provinces}
    unmatched = 0
    for row in cod2:
        pt = (float(row['center_lon']), float(row['center_lat']))
        match = next((f for f, b in boxes if b[0] <= pt[0] <= b[2] and b[1] <= pt[1] <= b[3] and inside(pt, f['geometry'])), None)
        if not match:
            unmatched += 1
            continue
        code = row['adm1_pcode'][2:]
        by_province[code].append({'type': 'Feature',
                                  'properties': {'pcode': row['adm2_pcode'], 'th': row['adm2_name1'], 'en': row['adm2_name']},
                                  'geometry': rounded(match['geometry'])})
    print('districts without an outline:', unmatched)

    tambons = {p['code']: [] for p in provinces}
    for pt in points:
        if pt['admin_level'] != '3':
            continue
        tambons[pt['adm1_pcode'][2:]].append([pt['adm3_pcode'], pt['adm3_name1'], pt['adm3_name'], pt['adm2_pcode'],
                                              round(float(pt['x_coord']), 5), round(float(pt['y_coord']), 5)])

    for p in provinces:
        d = os.path.join(ROOT, 'public/geo/p', p['code'])
        os.makedirs(d, exist_ok=True)
        json.dump({'type': 'FeatureCollection', 'features': by_province[p['code']]},
                  open(os.path.join(d, 'districts.geojson'), 'w'), ensure_ascii=False, separators=(',', ':'))
        json.dump(sorted(tambons[p['code']], key=lambda t: t[1]),
                  open(os.path.join(d, 'tambons.json'), 'w'), ensure_ascii=False, separators=(',', ':'))

    lines = ',\n'.join('  ' + json.dumps(p, ensure_ascii=False) for p in provinces)
    open(os.path.join(ROOT, 'src/data/provinces.ts'), 'w').write(f"""// Generated by scripts/build_admin_geo.py. Do not edit by hand.
// Names, codes and centres: OCHA COD-AB Thailand (Royal Thai Survey Department), CC BY-IGO.
// Bounds: geoBoundaries gbOpen THA ADM1, CC BY 4.0.

export type Region = 'north' | 'central' | 'east' | 'northeast' | 'west' | 'south'

export interface Province {{
  /** Two-digit province code, as Thaiwater and RID use it ("50" = Chiang Mai). */
  code: string
  slug: string
  th: string
  en: string
  region: Region
  center: [number, number]
  bbox: [number, number, number, number]
}}

export const PROVINCES: Province[] = [
{lines},
]
""")
    print('provinces', len(provinces), 'districts', sum(len(v) for v in by_province.values()),
          'tambons', sum(len(v) for v in tambons.values()))


if __name__ == '__main__':
    main()
