# -*- coding: utf-8 -*-
"""解析《重庆高考专业详解手册》docx -> majors.js（专业名 -> 详解字典）。
不改任何应用代码，仅产出 majors.js。"""
import docx, json, re, os.path as _p

ROOT = _p.dirname(_p.abspath(__file__))
SRC = r'C:\Users\admin\Desktop\0\2\重庆高考专业详解手册_完整版.docx'

META_H1 = {'编制说明与数据来源', '目录'}  # 跳过的非门类 Heading1


def sname(p):
    try:
        return p.style.name
    except Exception:
        return ''


def parse_salary(text):
    """从就业字段抽取『行业』非私营/私营 工资对。"""
    out = []
    for ind, a, b in re.findall(r'『(.+?)』\s*([\d—\-]+)\s*/\s*([\d—\-]+)', text):
        def num(x):
            return int(x) if x.isdigit() else None
        out.append([ind, num(a), num(b)])
    return out


def parse_brief(text):
    """专业速览：学科门类：X｜专业类：Y｜基本学制：Z｜授予学位：W"""
    d = {}
    body = text.split('：', 1)[1] if '：' in text else text
    for part in re.split(r'[｜|]', body):
        if '：' in part:
            k, v = part.split('：', 1)
            d[k.strip()] = v.strip()
    return d


def main():
    doc = docx.Document(SRC)
    majors = {}
    cur_cat = None      # 当前学科门类
    cur = None          # 当前专业
    buf = []

    def flush():
        if not cur:
            return
        rec = {'ml': cur_cat}
        for line in buf:
            if line.startswith('专业速览'):
                b = parse_brief(line)
                rec['lc'] = b.get('专业类', '')
                rec['xz'] = b.get('基本学制', '')
                rec['xw'] = b.get('授予学位', '')
                if not rec.get('ml'):
                    rec['ml'] = b.get('学科门类', '')
                if b.get('学科门类'):
                    rec['ml'] = b.get('学科门类')
            elif line.startswith('专业内涵'):
                rec['nh'] = line.split('：', 1)[1].strip()
            elif line.startswith('培养目标'):
                rec['mb'] = line.split('：', 1)[1].strip()
            elif line.startswith('核心课程'):
                kc = line.split('：', 1)[1].strip()
                rec['kc'] = [x.strip() for x in re.split(r'[、，,/]', kc) if x.strip()]
            elif line.startswith('就业'):
                jy = line.split('：', 1)[1].strip()
                rec['jy'] = jy
                sal = parse_salary(line)
                if sal:
                    rec['sal'] = sal
        majors[cur] = rec

    for p in doc.paragraphs:
        st = sname(p); t = p.text.strip()
        if not t:
            continue
        if st == 'Heading 1':
            flush(); cur = None; buf = []
            name = re.sub(r'（.*?）', '', t).strip()
            cur_cat = None if (name in META_H1 or t.startswith('附表') or t.startswith('目录')) else name
        elif st == 'Heading 2':
            flush(); cur = t; buf = []
        else:
            if cur:
                buf.append(t)
    flush()

    js = 'window.MAJORS=' + json.dumps(majors, ensure_ascii=False, separators=(',', ':')) + ';'
    out = _p.join(ROOT, 'majors.js')
    open(out, 'w', encoding='utf-8').write(js)
    full = sum(1 for v in majors.values() if v.get('nh') and v.get('kc') and v.get('jy'))
    print('专业词条:', len(majors), '| 五字段完整:', full,
          '| 含薪酬:', sum(1 for v in majors.values() if v.get('sal')),
          '| 大小KB:', round(_p.getsize(out) / 1024, 1))


if __name__ == '__main__':
    main()
