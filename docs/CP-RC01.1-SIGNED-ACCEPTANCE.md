# CP-RC01.1 — Real signed bootstrap-only acceptance (without merging main)

This test is intentionally available **before** a feature branch's UI deployment. It runs only on
\`https://wass-psti.github.io/APSYNTRACRM/\` using the existing browser-tab Supabase Auth
session. It never copies or prints JWTs, passwords, refresh tokens, names, emails, or user UUIDs.

**Only execute the following in a trusted APSYNTRA CRM tab after reviewing the source.**
Never paste a JWT or password into a chat, GitHub issue or workflow.

## Steps

1. Open the existing APSYNTRA CRM GitHub Pages app, log in through its normal interface.
2. Open Chromium/LibreWolf Developer Tools → Console.
3. Paste and run the self-contained acceptance block below.
4. Save only the small printed result object; it does not contain identity secrets.
5. Repeat separately while signed in as \`lmsenagan\`, then \`asenagan\`, and once as an
   existing normal administrator (or other nonbootstrap account) where authorized.
6. Do not modify user memberships, active roles or production application records.
7. The bootstrap test creates **one staged-only non-effective change request** and the
   corresponding immutable audit event; that is the sole permitted write.

\`\`\`js
(async () => {
  if (location.origin !== 'https://wass-psti.github.io' ||
      !location.pathname.startsWith('/APSYNTRACRM/')) {
    throw Error('Run only inside the official APSYNTRA CRM GitHub Pages application');
  }
  const { AuthClient } = await import('/APSYNTRACRM/frontend/session.js');
  const { DomainApi } = await import('/APSYNTRACRM/frontend/data.js');
  const auth = new AuthClient();
  if (!(await auth.restore())) throw Error('Sign in normally first');
  const verified = await auth.getVerifiedUser();
  const api = new DomainApi(auth);
  const context = await api.context();
  if (context.user_id !== verified.id) throw Error('Identity mismatch');
  const bootstrap = await api.rpc('apsyntra_role_is_bootstrap');
  if (typeof bootstrap !== 'boolean') throw Error('Invalid bootstrap decision');

  const result = {
    milestone: 'CP-RC01.1', scenario: bootstrap ? 'bootstrap' : 'nonbootstrap',
    eligibility: bootstrap, snapshot: 'NOT_RUN', scopeDenial: 'NOT_RUN',
    selfElevationDenial: 'NOT_RUN', proposalPersistence: 'NOT_RUN', audit: 'NOT_RUN',
    productionAccessChanged: false
  };
  const denied = async (name, args = {}) => {
    try { await api.rpc(name, args); return false; }
    catch (err) { if (err.status !== 403) throw err; return true; }
  };
  const snapshotArgs = { p_workspace_id: context.workspace_id };
  if (!bootstrap) {
    result.snapshot = await denied('apsyntra_role_configuration_snapshot', snapshotArgs)
      ? 'PASS_DENIED' : 'FAIL_EXPOSED';
    if (result.snapshot !== 'PASS_DENIED') throw Error('Unexpected nonbootstrap snapshot access');
    result.selfElevationDenial = await denied('apsyntra_role_configuration_propose', {
      ...snapshotArgs, p_operation: 'role.create',
      p_payload: { roleKey: 'should_be_denied' }
    }) ? 'PASS_DENIED' : 'FAIL_PROPOSAL_ALLOWED';
    if (result.selfElevationDenial !== 'PASS_DENIED')
      throw Error('Unauthorized proposal was accepted');
  } else {
    const snapshot = await api.rpc('apsyntra_role_configuration_snapshot', snapshotArgs);
    result.snapshot = snapshot?.bootstrapVerified === true &&
      snapshot.workspaceId === context.workspace_id &&
      snapshot.mode === 'staged_only' && Array.isArray(snapshot.roles)
      ? 'PASS_SCOPED' : 'FAIL_MALFORMED';
    if (result.snapshot !== 'PASS_SCOPED') throw Error('Invalid authenticated snapshot');
    result.scopeDenial = await denied('apsyntra_role_configuration_snapshot', {
      p_workspace_id: '09815a5b-70bc-41df-960c-f7c661c477a1'
    }) ? 'PASS_DENIED' : 'FAIL_CROSS_WORKSPACE_LEAK';
    if (result.scopeDenial !== 'PASS_DENIED') throw Error('Cross-workspace scope violation');
    result.selfElevationDenial = await denied('apsyntra_role_configuration_propose', {
      ...snapshotArgs, p_operation:'assignment.assign',
      p_payload:{ userId:verified.id, moduleId:'time-tracker', role:'Employee' }
    }) ? 'PASS_DENIED' : 'FAIL_SELF_ELEVATION';
    if (result.selfElevationDenial !== 'PASS_DENIED') throw Error('Self-elevation protection failed');
    const short = crypto.randomUUID().replaceAll('-','').slice(0,12);
    const id = await api.rpc('apsyntra_role_configuration_propose', {
      ...snapshotArgs, p_operation:'role.create',
      p_payload:{roleKey:'cp_rc01_qa_'+short,displayName:'CP-RC01 Signed QA',kind:'proposal_only'}
    });
    const latest = await api.rpc('apsyntra_role_configuration_snapshot', snapshotArgs);
    const p = latest?.proposals?.find(p => p.id === id);
    const a = latest?.audit?.find(a => a.changeId === id);
    result.proposalPersistence = p?.status === 'proposed' ? 'PASS_STAGED_ONLY' : 'FAIL_NOT_PERSISTED';
    result.audit = a?.event === 'proposed' ? 'PASS_APPEND_ONLY_EVENT' : 'FAIL_AUDIT_MISSING';
    if (result.proposalPersistence !== 'PASS_STAGED_ONLY' || result.audit !== 'PASS_APPEND_ONLY_EVENT')
      throw Error('Proposal persistence/audit mismatch');
  }
  // The output contains NO tokens, user UUID, account email, proposal UUID, or PII.
  console.log('APSYNTRA CP-RC01.1 signed result:', JSON.stringify(result,null,2));
  return result;
})()
\`\`\`

### Expected results

- Both bootstrap sessions: \`eligibility:true\`, \`snapshot:PASS_SCOPED\`, \`scopeDenial:PASS_DENIED\`,
  \`selfElevationDenial:PASS_DENIED\`, \`proposalPersistence:PASS_STAGED_ONLY\`,
  \`audit:PASS_APPEND_ONLY_EVENT\`.
- An existing regular admin/other account: \`eligibility:false\`,
  \`snapshot:PASS_DENIED\`, \`selfElevationDenial:PASS_DENIED\`. No proposal is created.
- A session with no authorized workspace cannot complete \`api.context()\`; it is **NOT ELIGIBLE**.
- These signed results **must be independently corroborated** by querying the already-installed
  role request/audit tables, current role assignments and workspace membership counts afterward.

### Production feature UI boundary

This is a controlled backend acceptance, **not** a deployment of the feature-branch Role
Configuration interface. Its navigation is still unavailable on live GitHub Pages until
the repository's \`main\` release is explicitly approved. No security claim is made for
a feature UI that has not been independently exercised in the browser.
