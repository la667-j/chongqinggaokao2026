# -*- coding: utf-8 -*-
"""从历史类 PDF + 一分一段表 生成与物理类同结构的 重庆20XX历史类.xlsx。
不修改任何应用代码，仅产出 source-data/历史/ 下的 xlsx。"""
import re, os, openpyxl, pdfplumber

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'source-data')
HDIR = os.path.join(DIR, '历史')
YEARS = [2023, 2024, 2025]

# 历史类官方特控线/本科线（取自物理类文件批次线的"历史类"行，权威）
LINES = {2023: (480, 407), 2024: (506, 428), 2025: (515, 438)}

ENROLL = re.compile(r'(中外合作|预科|民族班|地方专项|定藏|定向就业|国家专项|高校专项|对口)')

# ---------- 1) 从物理类构建 院校代号->层次 ----------
def build_tier_maps():
    code2tier, base2tier = {}, {}
    for y in YEARS:
        wb = openpyxl.load_workbook(os.path.join(DIR, f'重庆{y}物理类.xlsx'), read_only=True)
        ws = wb['全部专业明细']
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i == 0:
                continue
            code, name, tier = str(row[0]), row[1], row[6]
            if tier:
                code2tier.setdefault(code, tier)
                base2tier.setdefault(base_name(name), tier)
        wb.close()
    return code2tier, base2tier

def base_name(name):
    """去掉招生类型括号后缀，保留校区类(威海/深圳)等。"""
    if not name:
        return name
    out = name
    while True:
        m = re.search(r'[（(]([^（）()]*)[）)]\s*$', out)
        if m and ENROLL.search(m.group(1)):
            out = out[:m.start()].strip()
        else:
            break
    return out

# ---------- 2) 一分一段表 -> 分数:位次 ----------
def load_rank_table(y):
    wb = openpyxl.load_workbook(os.path.join(HDIR, f'重庆历史类一分一段表_{y}.xlsx'))
    ws = wb.active
    score2rank, ceil_score, ceil_rank = {}, None, None
    for row in ws.iter_rows(values_only=True):
        s = row[0]
        if s is None:
            continue
        s = str(s)
        m = re.match(r'^(\d+)', s)
        if not m or row[2] is None:
            continue
        sc, rk = int(m.group(1)), int(row[2])
        if '及以上' in s or '以上' in s:
            ceil_score, ceil_rank = sc, rk
        score2rank[sc] = rk
    wb.close()
    def rank_of(score):
        if ceil_score is not None and score >= ceil_score:
            return ceil_rank
        return score2rank.get(score)
    return rank_of

# ---------- 3) 解析 PDF（去水印 + 清洗） ----------
TRUNC = [('中外合', '中外合作'), ('中外', '中外合作'), ('预科', '预科班'),
         ('地方专', '地方专项'), ('民族', '民族班'), ('非西藏', '非西藏生定藏就业')]

def clean_school(name):
    if not name:
        return name
    n = name.replace('\n', '').strip()
    n = re.sub(r'\d+$', '', n)                      # 去尾部脚注数字
    if n.count('(') + n.count('（') > n.count(')') + n.count('）'):  # 括号未闭合=被截断
        idx = max(n.rfind('('), n.rfind('（'))
        frag = n[idx + 1:]
        for pre, full in TRUNC:
            if full.startswith(frag) and frag:
                n = n[:idx] + '(' + full + ')'
                break
        else:
            n = n[:idx].strip()                     # 无法补全则丢弃残缺后缀
    return n

def parse_pdf(y):
    f = os.path.join(HDIR, f'{y}年重庆市普通高校招生信息表本科批-历史-平行志愿.pdf')
    majors = []
    with pdfplumber.open(f) as pdf:
        for pg in pdf.pages:
            fp = pg.filter(lambda o: o.get('size', 0) < 30)   # 滤掉超大字水印
            for tb in fp.extract_tables():
                for r in tb:
                    if not r or not r[0]:
                        continue
                    code = str(r[0]).strip()
                    if not re.match(r'^\d{4}$', code):
                        continue
                    sname = clean_school(r[1])
                    mcode = (r[2] or '').replace('\n', '').strip()
                    mname = (r[3] or '').replace('\n', '').strip()
                    score = (r[4] or '').replace('\n', '').strip() if len(r) > 4 else ''
                    if not score.isdigit():
                        continue
                    majors.append([code, sname, mcode, mname, int(score)])
    return majors

# ---------- 4) 组装并写出 xlsx ----------
def canonical_name(rows_for_code):
    from collections import Counter
    bases = Counter(base_name(r[1]) for r in rows_for_code if r[1])
    return bases.most_common(1)[0][0] if bases else ''

def build_year(y, code2tier, base2tier):
    rank_of = load_rank_table(y)
    majors = parse_pdf(y)
    tk, bk = LINES[y]
    tk_rank, bk_rank = rank_of(tk), rank_of(bk)

    detail = []          # 院校代号,院校名称,专业代号,专业名称,投档最低分,位次,层次
    miss_rank = 0
    for code, sname, mcode, mname, score in majors:
        rk = rank_of(score)
        if rk is None:
            miss_rank += 1
        tier = code2tier.get(code) or base2tier.get(base_name(sname))
        detail.append([code, sname, mcode, mname, score, rk, tier])
    detail.sort(key=lambda x: (-x[4], (x[5] or 10**9)))

    # 院校排名（专业最高分≥特控线）
    from collections import defaultdict
    by_code = defaultdict(list)
    for d in detail:
        by_code[d[0]].append(d)
    ranking = []
    for code, ds in by_code.items():
        scores = [d[4] for d in ds]
        ranks = [d[5] for d in ds if d[5] is not None]
        mx, mn = max(scores), min(scores)
        if mx < tk:
            continue
        cname = canonical_name(ds)
        tier = code2tier.get(code) or base2tier.get(base_name(cname))
        allabove = '是' if mn >= tk else '否'
        ranking.append([code, cname, mx, min(ranks) if ranks else None,
                        mn, max(ranks) if ranks else None, len(ds), allabove, tier])
    ranking.sort(key=lambda x: (-x[2], x[3] or 10**9))
    ranking = [[i + 1] + r for i, r in enumerate(ranking)]

    # 写 xlsx（4 sheet，列名与物理类一致）
    wb = openpyxl.Workbook()
    ws = wb.active; ws.title = '说明'
    ws['A1'] = f'{y}年 重庆 历史类 本科批 各院校专业录取分 + 位次 + 层次'
    ws['A2'] = '数据来源：①录取分=重庆市教育考试院《普通高校招生信息表-本科批-历史-平行志愿》PDF；②位次=《重庆历史类一分一段表》累计人数；③层次=沿用物理类（教育部985/211名单+第二轮双一流名单2022,147所）。'
    ws['A3'] = f'口径：历史类本科批 特控线={tk}(位次{tk_rank})、本科线={bk}(位次{bk_rank})、专科线=180。位次由投档分匹配一分一段表累计人数得出。'
    ws['A4'] = f'含 {len(by_code)} 所院校、{len(detail)} 个专业；院校排名=专业最高分≥{tk} 者。'

    ws = wb.create_sheet('批次线')
    ws.append([f'{y}重庆录取最低控制分数线（官方）'])
    ws.append([None])
    ws.append(['科类', '特控线', '对应位次', '本科线', '对应位次', '专科线'])
    ws.append(['历史类', tk, tk_rank, bk, bk_rank, 180])

    ws = wb.create_sheet('院校排名')
    ws.append(['排名', '院校代号', '院校名称', '专业最高分', '最高分位次',
               '专业最低分(投档线)', '最低分位次', '录取专业数', f'全部专业≥{tk}', '层次'])
    for r in ranking:
        ws.append(r)

    ws = wb.create_sheet('全部专业明细')
    ws.append(['院校代号', '院校名称', '专业代号', '专业名称', '投档最低分', '位次', '层次'])
    for d in detail:
        ws.append(d)

    out = os.path.join(HDIR, f'重庆{y}历史类.xlsx')
    wb.save(out)
    tiered = sum(1 for d in detail if d[6])
    print(f'{y}: 院校 {len(by_code)} · 专业 {len(detail)} · 上榜(≥{tk}) {len(ranking)} · '
          f'有层次 {tiered} · 位次缺失 {miss_rank} · 特控线{tk}位次{tk_rank} 本科线{bk}位次{bk_rank} -> {os.path.basename(out)}')

def main():
    code2tier, base2tier = build_tier_maps()
    print(f'物理类层次映射: 代号 {len(code2tier)} · 基名 {len(base2tier)}')
    for y in YEARS:
        build_year(y, code2tier, base2tier)

if __name__ == '__main__':
    main()
