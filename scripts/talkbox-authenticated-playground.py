#!/usr/bin/env python3
"""Source-only TalkBox recovery through monday's signed API Playground.

Reads solely through GraphiQL's existing signed user session; never obtains
or exposes an API token, creates an app, calls mutations, or writes to CRM.
Private original media and evidence remain outside the git repository.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid

HERE=Path(__file__).resolve().parent
def imported(name,filename):
    spec=importlib.util.spec_from_file_location(name,HERE/filename)
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod
provider=imported('tb_q_provider','talkbox-provider-evidence.py')
recovery=imported('tb_q_recovery','talkbox-provider-byte-recovery.py')
readiness=imported('tb_q_readiness','talkbox-recovery-readiness.py')

SUBMIT_SCRIPT = """
tell application "Brave Browser"
 activate
 set playground to missing value
 repeat with browserWindow in windows
  repeat with browserTab in tabs of browserWindow
   if URL of browserTab contains "/apps/playground" then
    set playground to browserTab
    exit repeat
   end if
  end repeat
  if playground is not missing value then exit repeat
 end repeat
 if playground is missing value then error "Signed-in monday API Playground not open"
 set active tab index of front window to (count of tabs of front window)
 if URL of active tab of front window does not contain "/apps/playground" then error "Active browser tab is not API Playground"
 set focusState to execute playground javascript "(()=>{const e=document.querySelector('.graphiql-editor:not(.hidden) textarea');if(!e)return 'NO_QUERY_EDITOR';e.focus();return 'READY'})()"
 if focusState is not "READY" then error "Query editor unavailable"
end tell
tell application "System Events"
 keystroke "a" using command down
 keystroke "v" using command down
end tell
delay 0.25
tell application "Brave Browser"
 set commandState to execute playground javascript "(()=>{const e=document.querySelector('[aria-label=\\\"Execute query (Ctrl-Enter)\\\"]');if(!e)return 'NO_EXECUTE';e.click();return 'EXECUTED'})()"
 if commandState is not "EXECUTED" then error "Read-only query could not be submitted"
end tell
"""
COPY_SCRIPT = """
tell application "Brave Browser"
 activate
 set playground to missing value
 repeat with browserWindow in windows
  repeat with browserTab in tabs of browserWindow
   if URL of browserTab contains "/apps/playground" then
    set playground to browserTab
    exit repeat
   end if
  end repeat
  if playground is not missing value then exit repeat
 end repeat
 if playground is missing value then error "Signed-in monday API Playground not open"
 set active tab index of front window to (count of tabs of front window)
 if URL of active tab of front window does not contain "/apps/playground" then error "Active browser tab is not API Playground"
 set focusState to execute playground javascript "(()=>{const e=document.querySelector('.result-window textarea');if(!e)return 'NO_RESPONSE_EDITOR';e.focus();return 'READY'})()"
 if focusState is not "READY" then error "Response editor unavailable"
end tell
tell application "System Events"
 keystroke "a" using command down
 keystroke "c" using command down
end tell
delay 0.15
"""


def source_inputs(directory):
    directory=directory.expanduser().resolve(strict=True)
    if directory.is_relative_to(provider.REPOSITORY):
        raise ValueError('Private source inside repository')
    m_path=directory/'CP-TB-NATIVE-01J-private-migration-manifest.json'
    i_path=directory/'CP-TB-NATIVE-01L-private-media-inventory.json'
    m_bytes=m_path.read_bytes()
    i_bytes=i_path.read_bytes()
    if hashlib.sha256(m_bytes).hexdigest()!=provider.MANIFEST_HASH:
        raise ValueError('Original source manifest digest mismatch')
    if hashlib.sha256(i_bytes).hexdigest()!=provider.INVENTORY_HASH:
        raise ValueError('Original asset inventory digest mismatch')
    manifest=json.loads(m_bytes)
    inventory=json.loads(i_bytes)
    parents,assets=provider.source_ids(manifest,inventory)
    return directory,manifest,inventory,parents,assets


class BrowserPlayground:
    def __init__(self, subprocess_runner=subprocess.run, sleep=time.sleep):
        self.run=subprocess_runner
        self.sleep=sleep

    def api(self, query, alias):
        # Query text has source IDs only; never API tokens.
        self.run(['pbcopy'],input=query,text=True,capture_output=True,check=True)
        self.run(['osascript','-'],input=SUBMIT_SCRIPT,text=True,
                 capture_output=True,check=True,timeout=15)
        for attempt in range(8):
            self.sleep(1.0 if attempt else 1.7)
            self.run(['osascript','-'],input=COPY_SCRIPT,text=True,
                     capture_output=True,check=True,timeout=15)
            result=self.run(['pbpaste'],capture_output=True,text=True,check=True,timeout=12)
            if len(result.stdout)>4*1024*1024:
                raise ValueError('Provider response exceeded size bound')
            try:
                obj=json.loads(result.stdout)
            except (ValueError,TypeError):
                continue
            if obj.get('errors'):
                raise ValueError('Provider returned GraphQL errors')
            data=obj.get('data')
            if not isinstance(data,dict) or alias not in data:
                # The response still belongs to a previous GraphQL query.
                continue
            return data[alias]
        raise ValueError('Current provider query did not yield complete response')

    @staticmethod
    def clear_clipboard():
        subprocess.run(['pbcopy'],input='',capture_output=True,text=True,check=False)


def batches(values,step=20):
    values=sorted(values,key=int)
    return [values[n:n+step] for n in range(0,len(values),step)]


def parent_query(ids,alias):
    return ('query { '+alias+': items(ids:['+','.join(ids)+'])'
            ' { id name board{id} subitems{id name parent_item{id} board{id}} } }')


def asset_query(ids,alias):
    return ('query { '+alias+': assets(ids:['+','.join(ids)+'])'
            ' { id name file_size file_extension public_url created_at uploaded_by{id name} } }')


def verified_parents(session, expected):
    observed=[]
    for index,part in enumerate(batches(expected)):
        result=session.api(parent_query(part,'parents_'+str(index)),'parents_'+str(index))
        if not isinstance(result,list) or {str(x['id']) for x in result}!=set(part) or len(result)!=len(part):
            raise ValueError('Missing, duplicated or wrong provider source parent IDs')
        for row in result:
            if str((row.get('board') or {}).get('id'))!=provider.BOARD:
                raise ValueError('Source issue belongs to wrong board')
        observed.extend(result)
    reconciled=provider.reconcile_parents(expected,[{'cursor':None,'items':observed}])
    if reconciled['verified_source_parent_count']!=len(expected):
        raise ValueError('Source parent count mismatch')
    return reconciled


def verified_assets(session, ids, directory, *, fetch_bytes):
    raw_assets=[]
    for index,part in enumerate(batches(ids)):
        entries=session.api(asset_query(part,'assets_'+str(index)),'assets_'+str(index))
        if not isinstance(entries,list) or {str(x['id']) for x in entries}!=set(part) or len(entries)!=len(part):
            raise ValueError('Incomplete original source asset batch')
        # Provider metadata is source-backed. Bytes are independently checked.
        provider.reconcile_assets(set(part),[entries])
        if fetch_bytes:
            # Bounded parallel reads avoid very slow serialized CDN handshakes.
            # Each immutable source asset ID maps to an independent 0600 file.
            with ThreadPoolExecutor(max_workers=6) as pool:
                futures=[pool.submit(recovery.capture_asset,entry,directory) for entry in entries]
                for future in as_completed(futures):
                    future.result()
        raw_assets.extend(entries)
    return provider.reconcile_assets(ids,[raw_assets])


def run_capture(args, session=None):
    directory,manifest,inventory,parents,assets=source_inputs(args.source_directory)
    browser=session or BrowserPlayground()
    assets_dir=directory/'CP-TB-NATIVE-01Q-private-assets'
    run_id=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    parent_path=directory/('CP-TB-NATIVE-01Q-parent-lineage-'+run_id+'.json')
    meta_path=directory/('CP-TB-NATIVE-01Q-provider-metadata-'+run_id+'.json')
    parity_path=directory/('CP-TB-NATIVE-01Q-source-readiness-'+run_id+'.json')
    try:
        lineage=verified_parents(browser,parents)
        provider.save_private(parent_path,{
            'source_board_id':provider.BOARD,
            'workbook_sha256':provider.SOURCE_HASH,
            'provider_readback_at_utc':datetime.now(timezone.utc).isoformat(),
            'parent_lineage':lineage,
            'ready_for_production':False
        })
        print(json.dumps({'status':'AUTHENTIC_PARENT_LINEAGE_VERIFIED',
                          'parent_count':len(parents),
                          'source_subitem_count':lineage['source_subitem_count'],
                          'production_writes':False}),flush=True)
        if args.parents_only:
            return 0
        media=verified_assets(browser,assets,assets_dir,fetch_bytes=not args.metadata_only)
        provider_evidence={
            'source_board_id':provider.BOARD,
            'workbook_sha256':provider.SOURCE_HASH,
            'provider_metadata_reconciled':True,
            'provider_readback_at_utc':datetime.now(timezone.utc).isoformat(),
            'parent_lineage':lineage,
            'media':media,
            'attachment_bytes_verified':False,
            'ready_for_production':False,
            'production_writes_authorized':False
        }
        provider.save_private(meta_path,provider_evidence)
        print(json.dumps({'status':'AUTHENTIC_ASSET_METADATA_VERIFIED',
                          'asset_count':media['metadata_count'],
                          'bytes_requested':not args.metadata_only,
                          'production_writes':False}),flush=True)
        if args.metadata_only:
            return 0
        report=readiness.assess_source(provider_evidence,manifest,inventory,assets_dir)
        provider.save_private(parity_path,report)
        print(json.dumps({'status':report['status'],
                          'parent_count':report['source_issue_ids_verified'],
                          'source_subitem_count':report['source_subitems_verified'],
                          'original_assets_verified':report['source_media_objects_verified'],
                          'ready_for_production':False,'production_writes':False}),flush=True)
        return 0
    except (OSError,ValueError,TypeError,KeyError,subprocess.SubprocessError) as exc:
        # Provider response can contain sensitive data; print only exception type
        print(json.dumps({'status':'BLOCKED_GENUINE_SOURCE_READBACK',
                          'reason_type':type(exc).__name__,
                          'reason':str(exc) if isinstance(exc,ValueError) else None,
                          'ready_for_production':False,'production_writes':False}),flush=True)
        return 2
    finally:
        browser.clear_clipboard()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-directory',type=Path,
                        default=Path.home()/'.apsyntra-work/talkbox-source-evidence')
    group=parser.add_mutually_exclusive_group()
    group.add_argument('--parents-only',action='store_true')
    group.add_argument('--metadata-only',action='store_true')
    args=parser.parse_args()
    return run_capture(args)


if __name__=='__main__':sys.exit(main())
