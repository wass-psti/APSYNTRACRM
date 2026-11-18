#!/usr/bin/env python3
"""Recover original monday asset bytes privately, with source-ID/size/hash receipts.

Requires an approved MONDAY_API_TOKEN. Only performs provider reads and local
private writes; no CRM mutation, upload, or database migration.
"""
import argparse
import hashlib
import importlib.util
import ipaddress
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPSHandler, HTTPRedirectHandler

SOURCE = Path(__file__).with_name('talkbox-provider-evidence.py')
SPEC = importlib.util.spec_from_file_location('tb_provider', SOURCE)
provider = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(provider)
TRUSTED_DOMAINS = ('monday.com','mondayusercontent.com','amazonaws.com','cloudfront.net')
ASSET_ID = re.compile(r'[1-9][0-9]{0,19}\Z')
LIMIT = 500 * 1024 * 1024


def validate_url(url):
    if not isinstance(url,str):
        raise ValueError('Asset download URL absent')
    parts=urlsplit(url)
    hostname=(parts.hostname or '').rstrip('.').lower()
    if parts.scheme!='https' or not hostname or parts.username or parts.password or parts.port not in (None,443):
        raise ValueError('Untrusted provider asset URL')
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        pass
    else:
        raise ValueError('Direct-IP asset URL rejected')
    if not any(hostname == suffix or hostname.endswith('.'+suffix) for suffix in TRUSTED_DOMAINS):
        raise ValueError('Unexpected provider asset hostname')
    return url


class ValidatedRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req,fp,code,msg,headers,newurl)


def verify_existing(path, receipt_path, expected_size):
    if not path.exists() and not receipt_path.exists():
        return None
    if not path.is_file() or not receipt_path.is_file() or path.is_symlink() or receipt_path.is_symlink():
        raise ValueError('Incomplete or unsafe pre-existing asset receipt')
    receipt=json.loads(receipt_path.read_text())
    if (receipt.get('byte_count')!=expected_size or
        receipt.get('source_file_size')!=expected_size or
        receipt.get('bytes_verified') is not True or
        receipt.get('status') != 'VERIFIED_LOCAL_BYTES' or
        not re.fullmatch(r'[a-f0-9]{64}',str(receipt.get('sha256','')))):
        raise ValueError('Pre-existing receipt is inconsistent')
    digest=hashlib.sha256()
    size=0
    with path.open('rb') as source:
        for block in iter(lambda:source.read(1024*1024),b''):
            size+=len(block); digest.update(block)
            if size>expected_size: raise ValueError('Pre-existing asset exceeds expected size')
    if size!=expected_size or digest.hexdigest()!=receipt['sha256']:
        raise ValueError('Pre-existing asset failed checksum readback')
    return receipt


def capture_asset(asset, output, opener=None, max_bytes=LIMIT):
    """Download into mode-0600 asset-id file, atomically emit hash receipt.

    Allows later retry without overwriting verified files. The URL is sourced
    only from an authenticated monday assets GraphQL response and never logged.
    """
    aid=str(asset.get('id',''))
    size=asset.get('file_size')
    if not ASSET_ID.fullmatch(aid) or type(size) is not int or size<=0 or size>max_bytes:
        raise ValueError('Invalid or unsupported source asset size/ID')
    url=validate_url(asset.get('public_url'))
    requested_output=output.expanduser().absolute()
    if requested_output.is_symlink():
        raise ValueError('Asset folder may not be a symlink')
    output=requested_output.resolve()
    if output.is_relative_to(provider.REPOSITORY):
        raise ValueError('Private asset recovery cannot write to repository')
    output.mkdir(parents=True,exist_ok=True,mode=0o700)
    if output.stat().st_mode & 0o077:
        raise ValueError('Private asset folder permits group/other access')
    binary=output/('asset-'+aid+'.bin')
    receipt_path=output/('asset-'+aid+'.json')
    previous=verify_existing(binary,receipt_path,size)
    if previous is not None:
        if (previous.get('source_asset_id')!=aid or
            previous.get('original_filename')!=asset.get('name')):
            raise ValueError('Previous asset identity/filename mismatch')
        return dict(previous, status='ALREADY_VERIFIED')
    if opener is None:
        opener=build_opener(ValidatedRedirect,HTTPSHandler())
    req=Request(url,headers={'User-Agent':'APSYNTRA-source-readback/1.0'})
    temp=output/('asset-'+aid+'.part')
    hasher=hashlib.sha256(); total=0
    fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
    try:
        with os.fdopen(fd,'wb') as dest, opener.open(req,timeout=60) as response:
            validate_url(response.geturl())
            for chunk in iter(lambda:response.read(1024*1024),b''):
                total+=len(chunk)
                if total>size or total>max_bytes:
                    raise ValueError('Provider bytes exceed declared size')
                hasher.update(chunk); dest.write(chunk)
        if total!=size:
            raise ValueError('Provider binary truncated or size mismatched')
        os.link(temp,binary)  # O_EXCL-like: never replace a prior verified capture
        os.unlink(temp)
        receipt={'source_asset_id':aid,'byte_count':total,'sha256':hasher.hexdigest(),
                 'original_filename':asset.get('name'), 'source_file_size':size,
                 'bytes_verified':True,'status':'VERIFIED_LOCAL_BYTES'}
        # Exclusive create; if this fails, the captured binary will be retained
        # for investigation and next run will refuse an incomplete receipt.
        rf=os.open(receipt_path,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
        with os.fdopen(rf,'w',encoding='utf-8') as f:
            json.dump(receipt,f,sort_keys=True)
            f.write('\n')
        assert verify_existing(binary,receipt_path,size) is not None
        return receipt
    finally:
        if temp.exists(): temp.unlink()


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--manifest',required=True,type=Path)
    p.add_argument('--inventory',required=True,type=Path)
    p.add_argument('--output-dir',required=True,type=Path)
    args=p.parse_args()
    try:
        if hashlib.sha256(args.manifest.read_bytes()).hexdigest()!=provider.MANIFEST_HASH:
            raise ValueError('Pinned source manifest mismatch')
        if hashlib.sha256(args.inventory.read_bytes()).hexdigest()!=provider.INVENTORY_HASH:
            raise ValueError('Pinned media inventory mismatch')
        manifest=json.loads(args.manifest.read_text()); inventory=json.loads(args.inventory.read_text())
        _, ids=provider.source_ids(manifest,inventory)
        token=os.environ.get('MONDAY_API_TOKEN')
        if not token:
            print(json.dumps({'status':'BLOCKED_PROVIDER_CREDENTIAL','verified_bytes':0,
                              'expected_assets':len(ids),'production_writes':False}))
            return 3
        api=provider.Provider(token)
        batches=api.asset_batches(ids)
        provider.reconcile_assets(ids,batches) # all source IDs validated before writes
        completed=0
        for asset in (item for batch in batches for item in batch):
            capture_asset(asset,args.output_dir)
            completed+=1
        print(json.dumps({'status':'LOCAL_ASSET_BYTES_VERIFIED','verified_bytes':completed,
                          'expected_assets':len(ids),'production_writes':False,
                          'ready_for_production':False}))
        return 0
    except (ValueError,OSError,RuntimeError,KeyError,TypeError):
        print(json.dumps({'status':'BLOCKED_MEDIA_RECOVERY','production_writes':False,
                          'ready_for_production':False}))
        return 2


if __name__=='__main__': sys.exit(main())
