#!/usr/bin/env python3
"""Isolated PostgreSQL 17 acceptance; no production credentials or RPC access.

Required: disposable Docker container with candidate SQL already loaded.
Use --private-manifest only for a local authorized machine; never commit it.
"""
import argparse
import concurrent.futures
import copy
import json
import subprocess
import uuid
from pathlib import Path


def stage(container, workspace, manifest):
    content=json.dumps(manifest,sort_keys=True,ensure_ascii=False,separators=(',',':'))
    tag='$tb01k_'+uuid.uuid4().hex+'$'
    sql=("select private.tb_legacy_stage_snapshot('"+str(workspace)+"'::uuid,"+
         tag+content+tag+"::jsonb)::text;")
    result=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres',
                           '-X','-At','-v','ON_ERROR_STOP=1'],
                          input=sql,text=True,capture_output=True)
    # Never emit source content or SQL to logs, including on failures.
    if result.returncode:
        raise RuntimeError('STAGING_REJECTED')
    return json.loads(result.stdout.strip().splitlines()[-1])


def query(container,sql):
    result=subprocess.run(['docker','exec','-i',container,'psql','-U','postgres',
                           '-X','-At','-v','ON_ERROR_STOP=1'],
                          input=sql,text=True,capture_output=True)
    if result.returncode:
        raise RuntimeError('STAGING_QUERY_FAILED')
    return result.stdout.strip()


def synthetic():
    return {
        'manifest_version':1,'source_board_id':'18370784140',
        'workbook_sha256':'a'*64,'source_subitem_provenance':'NOT_ESTABLISHED',
        'ready_for_migration':False,'production_writes_authorized':False,
        'time_tracking_rows_raw':[],
        'issues':[{'monday_item_id':'101','name':'Synthetic test issue','status':'Done'}],
        'posts_parent_first':[
            {'monday_post_id':'201','monday_issue_id':'101','parent_monday_post_id':None,
             'source_author':'Synthetic A','source_created_at':'2025-01-01T10:00:00Z',
             'content':'Parent test','asset_ids':''},
            {'monday_post_id':'202','monday_issue_id':'101','parent_monday_post_id':'201',
             'source_author':'Synthetic B','source_created_at':'2025-01-02T10:00:00Z',
             'content':'Child test','asset_ids':'90001'}]}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--container',required=True)
    parser.add_argument('--private-manifest',type=Path)
    a=parser.parse_args()
    container=a.container
    base=synthetic()
    ws=uuid.uuid4()
    assert stage(container,ws,base)['status']=='STAGED'
    assert stage(container,ws,base)['status']=='ALREADY_STAGED'
    missing_flag=copy.deepcopy(base)
    del missing_flag['ready_for_migration']
    try:stage(container,uuid.uuid4(),missing_flag)
    except RuntimeError:pass
    else:raise AssertionError('Missing readiness flag accepted')
    missing_ledger=copy.deepcopy(base)
    del missing_ledger['time_tracking_rows_raw']
    try:stage(container,uuid.uuid4(),missing_ledger)
    except RuntimeError:pass
    else:raise AssertionError('Incomplete source ledger accepted')
    altered=copy.deepcopy(base)
    altered['posts_parent_first'][0]['content']='Different'
    try:stage(container,ws,altered)
    except RuntimeError:pass
    else:raise AssertionError('Changed content wrongly accepted')
    assert query(container,"select count(*) from private.tb_legacy_source_posts where workspace_id='"+str(ws)+"';")=='2'
    orphan=copy.deepcopy(base)
    orphan['posts_parent_first'][1]['parent_monday_post_id']='999'
    ws_orphan=uuid.uuid4()
    try:stage(container,ws_orphan,orphan)
    except RuntimeError:pass
    else:raise AssertionError('Orphan reply wrongly accepted')
    assert query(container,"select count(*) from private.tb_legacy_source_snapshots where workspace_id='"+str(ws_orphan)+"';")=='0'
    cross=copy.deepcopy(base)
    cross['issues'].append({'monday_item_id':'102','name':'Second synthetic issue'})
    cross['posts_parent_first'][1]['monday_issue_id']='102'
    try:stage(container,uuid.uuid4(),cross)
    except RuntimeError:pass
    else:raise AssertionError('Cross-issue reply wrongly accepted')
    wrong_board=copy.deepcopy(base)
    wrong_board['source_board_id']='18370784141'
    try:stage(container,uuid.uuid4(),wrong_board)
    except RuntimeError:pass
    else:raise AssertionError('Wrong monday board accepted')
    missing=copy.deepcopy(base)
    missing['posts_parent_first'][1]['source_author']=''
    try:stage(container,uuid.uuid4(),missing)
    except RuntimeError:pass
    else:raise AssertionError('Missing source author wrongly accepted')
    # Concurrent same-snapshot ingestion on a new workspace must serialize
    # to one STAGED and one ALREADY_STAGED outcome.
    ws_concurrent=uuid.uuid4()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures=[pool.submit(stage,container,ws_concurrent,base) for _ in range(2)]
        results=[f.result()['status'] for f in futures]
    assert sorted(results)==['ALREADY_STAGED','STAGED'],results
    assert query(container,"select count(*) from private.tb_legacy_source_posts where workspace_id='"+str(ws_concurrent)+"';")=='2'
    assert query(container,"select to_regclass('public.toolbox_issues') is null;")=='t'
    # Private source tables must not be exposed to authenticated clients.
    assert query(container,"select has_table_privilege('authenticated','private.tb_legacy_source_posts','SELECT');")=='f'
    verified=json.loads(query(container,"select private.tb_legacy_verify_snapshot('"+str(ws)+"'::uuid,'18370784140');"))
    assert verified['status']=='VERIFIED_STAGING_ONLY'
    assert (verified['issue_count'],verified['post_count'],verified['reply_count'])==(1,2,1)
    assert verified['posts_with_asset_references']==1
    assert verified['ready_for_migration'] is False
    # A corrupted private source payload cannot pass independent readback.
    query(container,"update private.tb_legacy_source_posts set record=jsonb_set(record,'{content}',to_jsonb('tampered'::text)) where workspace_id='"+str(ws)+"' and source_post_id='201';")
    try:query(container,"select private.tb_legacy_verify_snapshot('"+str(ws)+"'::uuid,'18370784140');")
    except RuntimeError:pass
    else:raise AssertionError('Tampered source payload verified')
    print('STAGING_SYNTHETIC_PASS: idempotency, immutable conflict, orphan rejection, cross-issue denial, missing author rejection, atomic rollback, concurrency serialization, private isolation')
    if a.private_manifest:
        real=json.loads(a.private_manifest.read_text())
        ws_real=uuid.uuid4()
        assert stage(container,ws_real,real)['status']=='STAGED'
        assert stage(container,ws_real,real)['status']=='ALREADY_STAGED'
        result=query(container,"select (select count(*) from private.tb_legacy_source_issues where workspace_id='"+
                     str(ws_real)+"'), (select count(*) from private.tb_legacy_source_posts where workspace_id='"+
                     str(ws_real)+"'), (select count(*) from private.tb_legacy_source_posts where workspace_id='"+
                     str(ws_real)+"' and parent_source_post_id is not null);")
        assert result=='87|1129|70',result
        verified=json.loads(query(container,"select private.tb_legacy_verify_snapshot('"+str(ws_real)+"'::uuid,'18370784140');"))
        assert (verified['issue_count'],verified['post_count'],verified['reply_count'],
                verified['posts_with_asset_references'])==(87,1129,70,51)
        assert verified['ready_for_migration'] is False
        print('STAGING_PRIVATE_SOURCE_PASS: 87 issues, 1129 post records, 70 reply links, replay idempotent; isolated ephemeral DB only')


if __name__=='__main__':
    main()
