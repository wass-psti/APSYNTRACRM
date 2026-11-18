#!/usr/bin/env python3
"""Read-only identity audit of the original monday TalkBox Excel export.

Does not print titles, discussion content, identities or source item identifiers.
No authentication or database access; never imports or mutates records.
"""
import argparse
import collections
import hashlib
import json
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from zipfile import ZipFile, BadZipFile

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
ID = re.compile(r'[1-9][0-9]{0,19}\Z')
MAX_SIZE = 8 * 1024 * 1024


def rows(archive, sheet, shared):
    root = ET.fromstring(archive.read(sheet))
    for row in root.findall('.//m:sheetData/m:row', NS):
        cells = {}
        for cell in row.findall('m:c', NS):
            col = re.match(r'[A-Z]+', cell.attrib['r']).group(0)
            value = cell.find('m:v', NS)
            inline = cell.find('m:is', NS)
            content = value.text if value is not None else ''.join(inline.itertext()) if inline is not None else ''
            if cell.get('t') == 's' and content is not None:
                content = shared[int(content)]
            cells[col] = content or ''
        yield int(row.attrib['r']), cells


def audit(path, expected_count=None):
    path = Path(path)
    if path.stat().st_size > MAX_SIZE:
        raise ValueError('Source workbook exceeds 8 MB audit limit')
    with ZipFile(path) as z:
        if z.testzip() is not None:
            raise ValueError('Damaged workbook ZIP entry')
        allowed = {'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'}
        if not allowed.issubset(z.namelist()):
            raise ValueError('TalkBox issue and update worksheets are required')
        if sum(z.getinfo(n).file_size for n in allowed) > 24 * 1024 * 1024:
            raise ValueError('Workbook worksheets exceed audit bounds')
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(s.itertext()) for s in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)]
        issue_rows = list(rows(z, 'xl/worksheets/sheet1.xml', shared))
        update_rows = list(rows(z, 'xl/worksheets/sheet2.xml', shared))
    if not any(n == 5 and c.get('G') == 'Item ID (auto generated)' for n, c in issue_rows):
        raise ValueError('Expected monday issue ID column missing')
    if not any(n == 2 and c.get('A') == 'Item ID' and c.get('J') == 'Post ID' for n, c in update_rows):
        raise ValueError('Expected monday update identity columns missing')
    issues = [r for i, r in issue_rows if i > 5 and str(r.get('G', '')).strip()]
    posts = [r for i, r in update_rows if i > 2 and str(r.get('A', '')).strip()]
    issue_ids = [str(r['G']).strip() for r in issues]
    post_ids = [str(r.get('J', '')).strip() for r in posts]
    parent_ids = [str(r['A']).strip() for r in posts]
    errors = []
    if any(not ID.fullmatch(i) for i in issue_ids): errors.append('invalid_issue_id')
    if len(set(issue_ids)) != len(issue_ids): errors.append('duplicate_issue_id')
    if any(not ID.fullmatch(i) for i in post_ids): errors.append('invalid_post_id')
    if len(set(post_ids)) != len(post_ids): errors.append('duplicate_post_id')
    if any(not ID.fullmatch(i) for i in parent_ids): errors.append('invalid_post_parent_id')
    if set(parent_ids) - set(issue_ids): errors.append('orphan_post_parent_id')
    if expected_count is not None and len(issue_ids) != expected_count:
        errors.append('source_count_mismatch')
    statuses = dict(collections.Counter(str(r.get('C', '')) for r in issues))
    result = {
        'source_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'issues': len(issue_ids), 'unique_issues': len(set(issue_ids)),
        'updates': len(post_ids), 'unique_posts': len(set(post_ids)),
        'updates_with_known_parent': sum(p in set(issue_ids) for p in parent_ids),
        'issues_with_updates': len(set(parent_ids)),
        'status_counts': statuses,
        'subitem_identity_evidence': 'NOT_ESTABLISHED',
        'migration_authorized': False,
        'errors': errors,
    }
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('workbook', type=Path)
    parser.add_argument('--expected-count', type=int)
    args = parser.parse_args()
    try:
        result = audit(args.workbook, args.expected_count)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 2 if result['errors'] else 0
    except (OSError, ValueError, KeyError, BadZipFile, ET.ParseError) as err:
        print(json.dumps({'status': 'BLOCKED', 'reason': type(err).__name__, 'migration_authorized': False}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
