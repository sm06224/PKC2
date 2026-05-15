#!/usr/bin/env python3
"""
vtest_struct.py — .docx の word/document.xml + styles.xml を構造的に検査。

input:  unzipped docx の word/ ディレクトリ
output: JSON で
  - heading[]: {level, style, text} 一覧
  - tables: {rows, hasHeaderShading}
  - images: {count, mediaFiles}
  - pageBreaks: count
  - hyperlinks: count(internal / external 区別はせず total)
  - var_residue: `{{vars.X}}` literal 残存数(展開漏れ検出)
"""
from __future__ import annotations
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}


def collect(wdir: str) -> dict:
    doc_path = os.path.join(wdir, 'document.xml')
    if not os.path.exists(doc_path):
        return {'error': f'missing {doc_path}'}
    tree = ET.parse(doc_path)
    root = tree.getroot()
    headings = []
    page_breaks = 0
    hyperlinks = 0
    var_residue = 0
    body_text = []
    for p in root.iter(f'{{{NS["w"]}}}p'):
        # pStyle
        pstyle_el = p.find('.//w:pStyle', NS)
        style = pstyle_el.get(f'{{{NS["w"]}}}val') if pstyle_el is not None else ''
        text = ''.join(t.text or '' for t in p.iter(f'{{{NS["w"]}}}t'))
        body_text.append(text)
        if style.startswith('Heading'):
            level = int(re.search(r'(\d+)', style).group(1)) if re.search(r'(\d+)', style) else 0
            headings.append({'level': level, 'style': style, 'text': text})
        # page break
        for br in p.iter(f'{{{NS["w"]}}}br'):
            if br.get(f'{{{NS["w"]}}}type') == 'page':
                page_breaks += 1
        # pageBreakBefore prop
        if p.find('.//w:pageBreakBefore', NS) is not None:
            page_breaks += 1
    for hl in root.iter(f'{{{NS["w"]}}}hyperlink'):
        hyperlinks += 1
    # tables
    tables = []
    for tbl in root.iter(f'{{{NS["w"]}}}tbl'):
        rows = len(list(tbl.iter(f'{{{NS["w"]}}}tr')))
        first_row = next(iter(tbl.iter(f'{{{NS["w"]}}}tr')), None)
        has_header_shading = False
        if first_row is not None:
            for tc in first_row.iter(f'{{{NS["w"]}}}tc'):
                shd = tc.find('.//w:shd', NS)
                if shd is not None and shd.get(f'{{{NS["w"]}}}fill', '').upper() not in ('AUTO', ''):
                    has_header_shading = True
                    break
        tables.append({'rows': rows, 'hasHeaderShading': has_header_shading})
    # images
    drawings = list(root.iter(f'{{{NS["w"]}}}drawing'))
    media_dir = os.path.join(wdir, 'media')
    media_files = sorted(os.listdir(media_dir)) if os.path.isdir(media_dir) else []
    # var residue
    joined = '\n'.join(body_text)
    var_residue = len(re.findall(r'\{\{[a-zA-Z0-9_.-]+\}\}', joined))
    # PKC ext residue
    pkc_residue = {
        'mark': len(re.findall(r'==[^=\n]+==', joined)),
        'em_dot': len(re.findall(r'\.\.[^.\n]+\.\.', joined)),
        'hidden_comment': len(re.findall(r'%%[^%\n]+%%', joined)),
        'ruby': len(re.findall(r'\[\[ruby:', joined)),
    }
    return {
        'headings': headings,
        'pageBreaks': page_breaks,
        'hyperlinks': hyperlinks,
        'tables': tables,
        'images': {'count': len(drawings), 'mediaFiles': media_files},
        'varResidue': var_residue,
        'pkcExtensionResidue': pkc_residue,
    }


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: vtest_struct.py <unpacked_dir/word>')
        sys.exit(1)
    print(json.dumps(collect(sys.argv[1]), indent=2, ensure_ascii=False))
