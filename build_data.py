# -*- coding: utf-8 -*-
"""Build data.js for the Chongqing physics-track college application app."""
import openpyxl, json, os

import os.path as _p
_DIR = _p.join(_p.dirname(_p.abspath(__file__)), 'source-data')
FILES = {
    2023: _p.join(_DIR, '重庆2023物理类.xlsx'),
    2024: _p.join(_DIR, '重庆2024物理类.xlsx'),
    2025: _p.join(_DIR, '重庆2025物理类.xlsx'),
}
YEARS = sorted(FILES)

# province centers from geojson
geo = json.load(open('geo_meta.json', encoding='utf-8'))
PROV = {k: {'n': v['name'], 'c': v['center']}
        for k, v in geo.items() if len(k) == 2 and v['center']}

schools = {}   # code -> dict
lines = {}

def norm_tier(t):
    if not t:
        return '普通院校'
    return str(t)

for yr in YEARS:
    wb = openpyxl.load_workbook(FILES[yr], read_only=True)
    # batch lines
    ws = wb['批次线']
    for row in ws.iter_rows(values_only=True):
        if row and row[0] == '物理类':
            lines[str(yr)] = {'tk': row[1], 'tkr': row[2], 'bk': row[3], 'bkr': row[4]}
            break
    # school ranking -> overall rank + admitted-count
    rankmap = {}
    ws = wb['院校排名']
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        code = str(row[1])
        rankmap[code] = {'r': row[0], 'nc': row[7]}
    # all-major detail -> per school majors
    ws = wb['全部专业明细']
    permajor = {}  # code -> list[ [name, score, rank] ]
    meta = {}      # code -> (name, tier)
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue
        code = str(row[0]); name = row[1]; mname = row[3]
        score = row[4]; rank = row[5]; tier = row[6]
        if code is None or score is None or rank is None:
            continue
        permajor.setdefault(code, []).append([str(mname), int(score), int(rank)])
        meta[code] = (name, norm_tier(tier))
    for code, majors in permajor.items():
        majors.sort(key=lambda x: -x[1])
        name, tier = meta[code]
        scores = [m[1] for m in majors]; ranks = [m[2] for m in majors]
        ystat = {
            'mx': max(scores), 'mxr': min(ranks),
            'mn': min(scores), 'mnr': max(ranks),
            'nc': len(majors),
        }
        if code in rankmap:
            ystat['r'] = rankmap[code]['r']
        s = schools.setdefault(code, {'c': code, 'p': code[:2], 'y': {}, 'm': {}})
        s['n'] = name; s['t'] = tier
        s['y'][str(yr)] = ystat
        s['m'][str(yr)] = majors
    wb.close()

# keep only schools whose province is mapped (all of them should be)
school_list = [s for s in schools.values() if s['p'] in PROV]
school_list.sort(key=lambda s: min((v['mnr'] for v in s['y'].values()), default=10**9))

out = {'years': YEARS, 'lines': lines, 'prov': PROV, 'schools': school_list}
js = 'window.GK=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';'
open('data.js', 'w', encoding='utf-8').write(js)
print('schools:', len(school_list), 'size(KB):', round(os.path.getsize('data.js')/1024, 1))
