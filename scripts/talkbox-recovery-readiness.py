#!/usr/bin/env python3
"""Read-only, byte-verified source reconciliation; never authorizes CRM writes."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys

HERE=Path(__file__).resolve().parent

def load_module(name, filename):
    spec=importlib.util.spec_from_file_location(name,HERE/filename)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

provider=load_module('tb_provider','talkbox-provider-evidence.py')
recovery=load_module('tb_recover','talkbox-provider-byte-recovery.py')
SHA=re.compile(r'[a-f0-9]{64}\Z')


def assess_source(provider_evidence, original_manifest, original_inventory, assets_dir):
    parent_ids,asset_ids=provider.source_ids(original_manifest,original_inventory)
    if provider_evidence.get('source_board_id')!=provider.BOARD or provider_evidence.get('workbook_sha256')!=provider.SOURCE_HASH:
        raise ValueError('Provider receipt/source mismatch')
    if provider_evidence.get('provider_metadata_reconciled') is not True:
        raise ValueError('Provider metadata not reconciled')
    if not provider_evidence.get('provider_readback_at_utc'):
        raise ValueError('Provider readback timestamp unavailable')
    lineage=provider_evidence.get('parent_lineage') or {}
    if (lineage.get('verified_source_parent_count')!=len(parent_ids) or
        set(str(x) for x in lineage.get('source_parent_ids',[]))!=parent_ids or
        len(lineage.get('source_parent_ids',[]))!=len(parent_ids)):
        raise ValueError('Incomplete or incorrect authoritative parent enumeration')
    children=lineage.get('source_subitems')
    if not isinstance(children,list) or lineage.get('source_subitem_count')!=len(children):
        raise ValueError('Incomplete source subitem evidence')
    children_by_id=set()
    for child in children:
        cid=str(child.get('source_subitem_id',''))
        parent=str(child.get('source_parent_id',''))
        bid=str(child.get('subitem_board_id',''))
        if not provider.ID_PATTERN.fullmatch(cid) or cid in children_by_id or parent not in parent_ids or not provider.ID_PATTERN.fullmatch(bid):
            raise ValueError('Invalid source child identity or parent')
        children_by_id.add(cid)
    media=provider_evidence.get('media') or {}
    listing=media.get('assets')
    if not isinstance(listing,list) or media.get('metadata_count')!=len(asset_ids):
        raise ValueError('Incomplete provider media metadata')
    by_id={}
    for item in listing:
        aid=str(item.get('source_asset_id',''))
        if aid in by_id or aid not in asset_ids or type(item.get('file_size')) is not int or item['file_size']<=0:
            raise ValueError('Duplicated/unexpected provider media')
        by_id[aid]=item
    if by_id.keys()!=asset_ids:
        raise ValueError('Provider media IDs missing')
    if assets_dir.resolve().is_relative_to(provider.REPOSITORY):
        raise ValueError('Private binary directory inside repository')
    recorded=[]
    for aid in sorted(asset_ids,key=int):
        item=by_id[aid]
        path=assets_dir/('asset-'+aid+'.bin')
        receipt_path=assets_dir/('asset-'+aid+'.json')
        receipt=recovery.verify_existing(path,receipt_path,item['file_size'])
        if receipt is None or receipt.get('source_asset_id')!=aid or receipt.get('original_filename')!=item.get('original_filename'):
            raise ValueError('Missing original media bytes/receipt or provider metadata mismatch')
        recorded.append({'source_asset_id':aid,'size':receipt['byte_count'],'sha256':receipt['sha256']})
    return {'status':'SOURCE_RECOVERY_BYTES_RECONCILED',
            'source_board_id':provider.BOARD,'source_issue_ids_verified':len(parent_ids),
            'source_subitems_verified':len(children),
            'source_media_objects_verified':len(recorded),
            'source_media_receipt_sha256':hashlib.sha256(json.dumps(recorded,sort_keys=True,separators=(',',':')).encode()).hexdigest(),
            'source_provider_readback_at_utc':provider_evidence['provider_readback_at_utc'],
            'ready_for_production':False,'production_writes_authorized':False,
            'source_reconciliation_only':True}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True,type=Path)
    p.add_argument('--inventory',required=True,type=Path)
    p.add_argument('--provider-evidence',required=True,type=Path)
    p.add_argument('--asset-directory',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    args=p.parse_args()
    try:
        if hashlib.sha256(args.manifest.read_bytes()).hexdigest()!=provider.MANIFEST_HASH or hashlib.sha256(args.inventory.read_bytes()).hexdigest()!=provider.INVENTORY_HASH:
            raise ValueError('Private source hash mismatch')
        report=assess_source(json.loads(args.provider_evidence.read_text()),
                             json.loads(args.manifest.read_text()),
                             json.loads(args.inventory.read_text()),
                             args.asset_directory)
        provider.save_private(args.output,report)
        print(json.dumps({'status':report['status'],
                          'original_media_bytes_verified':report['source_media_objects_verified'],
                          'production_writes_authorized':False,'ready_for_production':False}))
        return 0
    except (OSError,ValueError,KeyError,TypeError):
        print(json.dumps({'status':'BLOCKED_SOURCE_RECOVERY_RECONCILIATION',
                          'production_writes_authorized':False,'ready_for_production':False}))
        return 2

if __name__=='__main__':sys.exit(main())
