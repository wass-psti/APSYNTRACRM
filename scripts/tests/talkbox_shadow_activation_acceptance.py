#!/usr/bin/env python3
"""Only isolated PostgreSQL 17; synthetic activation, authentic source denied."""
import argparse
import concurrent.futures
import copy
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parent))
from talkbox_stage_acceptance import stage,query,synthetic


def activate(container,workspace,evidence):
    data=json.dumps(evidence,sort_keys=True,separators=(',',':'))
    tag='$ev01l'+uuid.uuid4().hex+'$'
    return json.loads(query(container,"select private.tb_legacy_shadow_activate('"+
                            str(workspace)+"'::uuid,'18370784140',"+
                            tag+data+tag+"::jsonb)::text;"))


def denied(container,workspace,evidence):
    try:
        activate(container,workspace,evidence)
    except RuntimeError:
        return
    raise AssertionError("Unsafe activation incorrectly accepted")


def fixture():
    return {
        'subitems':{
            'status':'VERIFIED_ZERO','source_board_id':'18371220520',
            'count':0,'evidence_sha256':'b'*64},
        'media':{'verified_assets':[{
            'source_asset_id':'90001','sha256':'c'*64,
            'bytes_verified':True,'byte_count':123}]},
        'history_display_policy':'PRESERVE_ORIGINAL_AUTHOR_AS_SOURCE'
    }


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--container',required=True)
    p.add_argument('--private-manifest',type=Path)
    args=p.parse_args()
    c=args.container
    base=synthetic()
    evidence=fixture()
    workspace=uuid.uuid4()
    assert stage(c,workspace,base)['status']=='STAGED'
    # Missing independent zero-subitem proof blocks activation.
    missing=copy.deepcopy(evidence)
    del missing['subitems']['evidence_sha256']
    denied(c,workspace,missing)
    missing=copy.deepcopy(evidence)
    missing['media']['verified_assets']=[]
    denied(c,workspace,missing)
    missing=copy.deepcopy(evidence)
    del missing['media']['verified_assets']
    denied(c,workspace,missing)
    missing=copy.deepcopy(evidence)
    missing['media']['verified_assets'][0]['bytes_verified']=False
    denied(c,workspace,missing)
    missing=copy.deepcopy(evidence)
    del missing['media']['verified_assets'][0]['sha256']
    denied(c,workspace,missing)
    missing=copy.deepcopy(evidence)
    del missing['history_display_policy']
    denied(c,workspace,missing)
    assert query(c,"select count(*) from private.tb_legacy_shadow_receipts where workspace_id='"+
                 str(workspace)+"';")=='0'
    first=activate(c,workspace,evidence)
    assert first['status']=='SHADOW_ACTIVATED' and first['ready_for_production'] is False
    assert first['verified_media_references']==1
    assert activate(c,workspace,evidence)['status']=='ALREADY_SHADOW_ACTIVATED'
    changed=copy.deepcopy(evidence)
    changed['media']['verified_assets'][0]['sha256']='d'*64
    denied(c,workspace,changed)
    preserved=query(c,"select source_post_id||':'||original_author||':'||original_created_at||':'||coalesce(parent_source_post_id,'ROOT') from private.tb_legacy_shadow_posts where workspace_id='"+
                    str(workspace)+"' order by source_post_id;")
    assert '201:Synthetic A:2025-01-01T10:00:00Z:ROOT' in preserved
    assert '202:Synthetic B:2025-01-02T10:00:00Z:201' in preserved
    assert query(c,"select count(*) from private.tb_legacy_shadow_posts where workspace_id='"+
                 str(workspace)+"';")=='2'
    shadow_readback=json.loads(query(c,"select private.tb_legacy_verify_shadow('"+str(workspace)+"'::uuid,'18370784140');"))
    assert (shadow_readback['issues'],shadow_readback['posts'],shadow_readback['reply_links'])==(1,2,1)
    assert shadow_readback['ready_for_production'] is False
    concurrent_ws=uuid.uuid4()
    assert stage(c,concurrent_ws,base)['status']=='STAGED'
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        outcomes=[f.result()['status'] for f in
                  [pool.submit(activate,c,concurrent_ws,evidence) for _ in range(2)]]
    assert sorted(outcomes)==['ALREADY_SHADOW_ACTIVATED','SHADOW_ACTIVATED'],outcomes
    assert query(c,"select count(*) from private.tb_legacy_shadow_posts where workspace_id='"+
                 str(concurrent_ws)+"';")=='2'
    query(c,"update private.tb_legacy_shadow_posts set original_author='Changed' where workspace_id='"+str(concurrent_ws)+"' and source_post_id='201';")
    try:activate(c,concurrent_ws,evidence)
    except RuntimeError:pass
    else:raise AssertionError('Tampered shadow replay verified')
    assert query(c,"select to_regclass('public.toolbox_issues') is null;")=='t'
    assert query(c,"select has_table_privilege('authenticated','private.tb_legacy_shadow_posts','SELECT');")=='f'
    print('SHADOW_SYNTHETIC_PASS: completeness gates, historical author/time, replies, byte attestations, immutable replay, concurrency, isolation')
    if args.private_manifest:
        real=json.loads(args.private_manifest.read_text())
        real_ws=uuid.uuid4()
        assert stage(c,real_ws,real)['status']=='STAGED'
        denied(c,real_ws,evidence)
        assert query(c,"select count(*) from private.tb_legacy_shadow_receipts where workspace_id='"+
                     str(real_ws)+"';")=='0'
        print('AUTHENTIC_SOURCE_ACTIVATION_BLOCKED: 87 issues, 1129 posts; unresolved subitem evidence and 148 source assets remain unactivated')


if __name__=='__main__':
    main()
