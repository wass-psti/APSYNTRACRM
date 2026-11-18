#!/usr/bin/env python3
"""Build a PRIVATE, deterministic, non-executable TalkBox migration manifest.

The original workbook and resulting manifest contain private source content.
The manifest is intentionally blocked for database execution until independent
subitem provenance, account mapping and a history-preserving RPC are verified.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SRC = Path(__file__).with_name('talkbox-source-audit.py')
spec = importlib.util.spec_from_file_location('talkbox_source_audit', SRC)
auditor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)


def manifest(workbook, expected_count=87, expected_sha256=None):
    report = auditor.audit(workbook, expected_count)
    if expected_sha256 is not None and report['source_sha256'] != expected_sha256:
        raise ValueError('Pinned source workbook SHA-256 mismatch')
    if report['errors'] or report['subitem_identity_evidence'] != 'NOT_ESTABLISHED':
        raise ValueError('Source preflight failed or provenance contract changed')
    with ZipFile(workbook) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(x.itertext()) for x in
                       ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', auditor.NS)]
        issues = [r for index, r in auditor.rows(z, 'xl/worksheets/sheet1.xml', strings)
                  if index > 5 and r.get('G', '').strip()]
        posts = [r for index, r in auditor.rows(z, 'xl/worksheets/sheet2.xml', strings)
                 if index > 2 and r.get('A', '').strip()]
        tracking = ([r for index, r in auditor.rows(z, 'xl/worksheets/sheet3.xml', strings)
                     if index > 3 and r]
                    if 'xl/worksheets/sheet3.xml' in z.namelist() else [])
    issue_items = [{
        'monday_item_id': r['G'].strip(), 'name': r.get('A', ''),
        'status': r.get('C', ''), 'source_assignees': r.get('D', ''),
        'source_target_date': r.get('E', ''), 'source_time_tracking': r.get('F', '')
    } for r in issues]
    post_items = [{
        'monday_post_id': r['J'].strip(), 'monday_issue_id': r['A'].strip(),
        'parent_monday_post_id': r.get('K', '').strip() or None,
        'content_type': r.get('C', ''), 'secondary_content_type': r.get('D', ''),
        'source_author': r.get('E', ''), 'source_created_at': r.get('F', ''),
        'content': r.get('G', ''), 'likes_count': r.get('H', ''),
        'asset_ids': r.get('I', '')
    } for r in posts]
    # Source-parent-first order, independent of the Excel export's row order.
    by_id = {p['monday_post_id']: p for p in post_items}
    ordered, visited = [], set()
    def visit(post_id):
        if post_id in visited:
            return
        post = by_id[post_id]
        if post['parent_monday_post_id']:
            visit(post['parent_monday_post_id'])
        visited.add(post_id)
        ordered.append(post)
    for post_id in sorted(by_id, key=int):
        visit(post_id)
    return {
        'manifest_version': 1,
        'source_board_id': '18370784140',
        'reported_source_subitem_board_id': '18371220520',
        'source_subitem_provenance': 'NOT_ESTABLISHED',
        'historical_author_mapping': 'NOT_ESTABLISHED',
        'destination_history_preserving_rpc': 'NOT_IMPLEMENTED',
        'production_writes_authorized': False,
        'ready_for_migration': False,
        'workbook_sha256': report['source_sha256'],
        'issues': sorted(issue_items, key=lambda x: int(x['monday_item_id'])),
        'posts_parent_first': ordered,
        'time_tracking_rows_raw': tracking
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('workbook', type=Path)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--expected-count', type=int, default=87)
    p.add_argument('--expected-sha256', required=True,
                   help='Pinned 64-character SHA-256 of authenticated source export')
    args = p.parse_args()
    out = args.output.expanduser().resolve()
    # Never accidentally commit a source-history manifest to the repository.
    if out.is_relative_to(ROOT):
        p.error('Private manifest output must be outside repository')
    if len(args.expected_sha256) != 64 or any(c not in '0123456789abcdef' for c in args.expected_sha256):
        p.error('--expected-sha256 must be lowercase hexadecimal')
    data = manifest(args.workbook, args.expected_count, args.expected_sha256)
    encoded = (json.dumps(data, ensure_ascii=False, sort_keys=True,
                          separators=(',', ':'))+'\n').encode('utf8')
    out.parent.mkdir(parents=True, exist_ok=True)
    # O_EXCL prevents a retry from silently overwriting an existing source plan.
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, 'wb') as file:
            file.write(encoded)
    except BaseException:
        out.unlink(missing_ok=True)
        raise
    print(json.dumps({
        'manifest_sha256': hashlib.sha256(encoded).hexdigest(),
        'issues': len(data['issues']), 'posts': len(data['posts_parent_first']),
        'source_tracking_rows': len(data['time_tracking_rows_raw']),
        'reply_posts': sum(bool(x['parent_monday_post_id']) for x in data['posts_parent_first']),
        'posts_with_asset_references': sum(bool(x['asset_ids']) for x in data['posts_parent_first']),
        'private_output_mode': oct(out.stat().st_mode & 0o777),
        'ready_for_migration': False, 'production_writes_authorized': False
    }, sort_keys=True))


if __name__ == '__main__':
    main()
