#!/usr/bin/env python3
"""
vtest_struct.py — .docx / .pptx の構造を XML から検査して JSON 出力。

docx:
  input:  unzipped docx の word/ ディレクトリ
  output: heading[], tables, images, pageBreaks, hyperlinks, varResidue,
          pkcExtensionResidue
pptx:
  input:  unzipped pptx の ppt/ ディレクトリ
  output: slides[]: {index, titles (placeholder text), bodyChunks, hasTable,
          imageRefs}, totalImages (media folder count), varResidue,
          pkcExtensionResidue, slideCount

dispatch: 引数 dir の basename(word vs ppt)で kind 自動判定。
"""
from __future__ import annotations
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
NS_PPT = {
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}


def collect_docx(wdir: str) -> dict:
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


def collect_pptx(pdir: str) -> dict:
    slides_dir = os.path.join(pdir, 'slides')
    media_dir = os.path.join(pdir, 'media')
    if not os.path.isdir(slides_dir):
        return {'error': f'missing {slides_dir}'}
    slide_files = sorted(
        [f for f in os.listdir(slides_dir) if re.match(r'slide\d+\.xml$', f)],
        key=lambda x: int(re.search(r'(\d+)', x).group(1)),
    )
    slides = []
    all_text: list[str] = []
    for sf in slide_files:
        sp = os.path.join(slides_dir, sf)
        tree = ET.parse(sp)
        root = tree.getroot()
        # placeholder texts: spTree > sp > nvSpPr > nvPr > ph type
        titles: list[str] = []
        body_chunks: list[str] = []
        for sp_el in root.iter(f'{{{NS_PPT["p"]}}}sp'):
            ph = sp_el.find('.//p:nvSpPr/p:nvPr/p:ph', NS_PPT)
            ph_type = ph.get('type') if ph is not None else None
            # collect all text inside this sp (a:t)
            texts = [t.text or '' for t in sp_el.iter(f'{{{NS_PPT["a"]}}}t')]
            joined_sp = '\n'.join(t for t in texts if t)
            if not joined_sp:
                continue
            if ph_type in ('title', 'ctrTitle'):
                titles.append(joined_sp)
            else:
                body_chunks.append(joined_sp)
        # table detect
        has_table = root.find('.//a:tbl', NS_PPT) is not None
        # image refs: <p:pic> count + blipFill
        pic_count = len(list(root.iter(f'{{{NS_PPT["p"]}}}pic')))
        slides.append({
            'index': int(re.search(r'(\d+)', sf).group(1)),
            'titles': titles,
            'bodyChunks': body_chunks,
            'hasTable': has_table,
            'pictureCount': pic_count,
        })
        all_text.append('\n'.join(titles + body_chunks))
    media_files = sorted(os.listdir(media_dir)) if os.path.isdir(media_dir) else []
    joined = '\n'.join(all_text)
    var_residue = len(re.findall(r'\{\{[a-zA-Z0-9_.-]+\}\}', joined))
    pkc_residue = {
        'mark': len(re.findall(r'==[^=\n]+==', joined)),
        'em_dot': len(re.findall(r'\.\.[^.\n]+\.\.', joined)),
        'hidden_comment': len(re.findall(r'%%[^%\n]+%%', joined)),
        'ruby': len(re.findall(r'\[\[ruby:', joined)),
    }
    return {
        'kind': 'pptx',
        'slideCount': len(slides),
        'slides': slides,
        'totalImages': len(media_files),
        'mediaFiles': media_files,
        'varResidue': var_residue,
        'pkcExtensionResidue': pkc_residue,
    }


def collect(directory: str) -> dict:
    base = os.path.basename(directory.rstrip('/'))
    if base == 'word':
        return collect_docx(directory)
    if base == 'ppt':
        return collect_pptx(directory)
    # fallback: 直下に document.xml or slides/ があれば判定
    if os.path.exists(os.path.join(directory, 'document.xml')):
        return collect_docx(directory)
    if os.path.isdir(os.path.join(directory, 'slides')):
        return collect_pptx(directory)
    return {'error': f'cannot detect format from {directory}'}


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print('usage: vtest_struct.py <unpacked_dir/word|ppt>')
        sys.exit(1)
    print(json.dumps(collect(sys.argv[1]), indent=2, ensure_ascii=False))
