import {syncFuelTrans} from './fueltrans-native.js';
import {AuthClient,ApiError} from './session.js';
import {avatarPreviewMarkup,mountAvatarPreview,stopAvatarPreview,mergeProfileAvatarContext} from './profile-avatar.js';
import {ProfileAvatarClient} from './profile-avatar-client.js';
import {mountAvatarImages} from './profile-avatar.js';

import {renderWorkspaceSwitcher,renderWorkspaceInviteLaunch,openWorkspaceSelector,openWorkspaceInvitationDialog,closeWorkspacePanels,WS01_SWITCHING_ENABLED} from './workspace-ui.js?v=ws01-controls-20261106';
import {WorkspaceLifecycleClient,WS01_CONFIGURATION_ENABLED} from './workspace-lifecycle-client.js';
import {WorkspaceInvitationClient,WS02D_INVITE_CLIENT_ENABLED} from './workspace-invitation-client.js';
import {WorkspaceInvitationAcceptanceClient,WS02D_ACCEPTANCE_ENABLED,captureInvitationLink,renderInvitationAcceptance} from './workspace-invitation-acceptance.js';
import {startInitialization,setInitializationPhase,finishInitialization} from './initialization-core.js';
import {renderAuthMarkup} from './auth-markup.js';
import {validateAccessRequest} from './request-access.js';
import {captureAuthReturn,
 inspectRecoveryToken,requestPasswordRecovery,applyRecoveredPassword} from './auth-account-flows.js';
import {mountAuthExperience} from './auth-experience.js';
import {sidebarIcon,animateSidebarSelection,stopSidebarSelection} from './sidebar-visuals.js';
import {overviewIcon,mountOverviewMotion,stopOverviewMotion} from './overview-visuals.js';
import {mountBoardCatalogMotion,stopBoardCatalogMotion} from './board-catalog-visuals.js';
import {DomainApi,validUuid} from './data.js';
import {BoardCacheChannel} from './board-cache-channel.js';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {PlatformSync} from './platform-sync.js';
import {APP_NAME} from './config.js';
import {runReadOnlyAcceptance,summarizeAcceptance} from './acceptance.js';
import {runPagesPersistenceAcceptance,QA_BOARD_NAME} from './pages-persistence.js';
import {renderPagesAcceptance} from './pages-acceptance-ui.js';
import {mountPagesAcceptanceMotion,stopPagesAcceptanceMotion} from './pages-acceptance-visuals.js';
import {runNativeQa} from './native-qa.js';
import {NativeIssueClient} from './native-client.js';
import {BOARD_MODULES,moduleByBoardName} from './board-manifest.js';
import {inspectFoundation,provisionMissingBoards} from './board-foundation.js';
import {renderFoundation} from './board-foundation-ui.js';
import {mountFoundationMotion,stopFoundationMotion} from './foundation-visuals.js';
import {boardGrid,boardGridColumns,prepareBoardGrid} from './board-grid.js';
import {FUELTRACK_V3_ID,isFuelTrackV3ApplicationBoard,normalizeFuelTrackSection,fuelTrackHref,renderFuelTrackV3Application} from './fueltrack-v3-application.js';
import {renderFuelTrackAnalytics,normalizeFuelTrackAnalyticsView,normalizeFuelTrackAnalyticsRange,normalizeFuelTrackAnalyticsMetric} from './fueltrack-v3-analytics.js';
import {renderFuelTrackRequests,fuelTrackRequestsModel,fuelTrackRequestsSummary,fuelTrackRequestsCsv,fuelTrackRequestQuickDates,FUELTRACK_REQUEST_FILTER_DEFAULTS} from './fueltrack-v3-requests.js';
import {TRADELINK_BOARD_ID,tradeLinkSetupStatus,configureTradeLinkColumns} from './tradelink-board-items.js';
import {normalizeTradeLinkSection,renderTradeLinkApplication,filterTradeLinkRenderedRows,captureTradeLinkTabMotion,mountTradeLinkTabMotion} from './tradelink-application.js';
import {renderTradeLinkSavedDocumentOutput,mountTradeLinkSavedDocumentOutput,
 closeTradeLinkSavedDocumentOutput} from './tradelink-saved-document-output.js';
import {TradeLinkAttachmentClient,TL03_ATTACHMENTS_ENABLED}
 from './tradelink-attachments.js';
import {TradeLinkDraftWorkspace,initialTradeLinkDraftView,resetTradeLinkDraftForm,parseTradeLinkDraftForm,
 tradeLinkDraftValidationMessage,tradeLinkDraftReady,tradeLinkDraftSaveFailureMessage,
 tradeLinkDraftHasUnsavedChanges,
 prepareTradeLinkDraftCommand,
 renderTradeLinkDraftLineItem,snapshotTradeLinkDraftLineItems,updateTradeLinkDraftLocalAmounts,
 updateTradeLinkLineRowTotals,updateTradeLinkDraftInputCurrencyLabels,updateTradeLinkDraftLocalSummary,
 normalizeTradeLinkDraftListFilters,updateTradeLinkDraftListUI} from './tradelink-draft-workspace.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_WORKFLOW_SUBMIT_ENABLED,
 TL03_WORKFLOW_REVIEW_ENABLED,TL03_WORKFLOW_DECISION_ENABLED,
 TL03_WORKFLOW_OPERATIONAL_ENABLED,
 tradeLinkSavedDraftMatches} from './tradelink-domain-client.js';
import {runTradeLinkStageASignedReadOnly,renderTradeLinkStageAAcceptance,sanitizeTradeLinkStageAReport} from './tradelink-stage-a-signed-acceptance.js';
import {runTradeLinkLocalSessionRevocation,renderTradeLinkSessionRevocation,renderTradeLinkSignedOutRevocationResult,sanitizeTradeLinkRevocationReport} from './tradelink-revoked-session-acceptance.js';
import {runWs01B2SignedDiscovery,renderWs01B2SignedAcceptance,sanitizeWs01B2Report} from './workspace-b2-signed-acceptance.js';
import {runWs02dB3SignedReadPreflight,renderWs02dB3SignedPreflight,sanitizeWs02dB3SignedReport} from './workspace-b3-signed-read-preflight.js';
import {runWs02dB3DeployedHttpsAcceptance,renderWs02dB3DeployedHttpsAcceptance,sanitizeWs02dB3DeployedHttpsReport} from './workspace-b3-deployed-https-acceptance.js';
import {captureWs02dB3OwnerRlsFixture,verifyWs02dB3ForeignRlsDenial,clearWs02dB3ForeignRlsFixture,hasWs02dB3ForeignRlsFixture,renderWs02dB3ForeignRlsDenial,sanitizeWs02dB3ForeignRlsReport} from './workspace-b3-foreign-rls-denial.js';
import {runWs02dB3LocalSessionRevocation,renderWs02dB3LocalRevocation,sanitizeWs02dB3LocalRevocationReport} from './workspace-b3-revoked-session-denial.js';
import {createB2SignedQaFixture,inspectB2SignedQaFixture,renderB2SignedQaFixture,sanitizeB2QaFixtureReport} from './board-col-delete-b2-signed-fixture.js';
import {runB4SignedRecoveryPreflight,renderB4SignedRecoveryPreflight,sanitizeB4SignedRecoveryReport} from './board-col-delete-b4-signed-preflight.js';
import {runPhaseBSignedDenial,renderPhaseBSignedDenial,sanitizePhaseBDenialReport} from './board-col-delete-phase-b-signed-denial.js';
import {updateTradeLinkFinancePreview} from './tradelink-finance.js';
import {captureBoardGroupScroll,restoreBoardGroupScroll} from './board-scroll-state.js';
import {renderBoardLoading,renderBoardLoadingError,setBoardLoadingVisibility} from './board-loading.js';
import {BOARD_STRUCTURE_ADMIN_ENABLED,BOARD_STRUCTURE_TYPES,BoardStructureClient,
 applyBoardViewSettings,renderBoardStructureAdmin,describeBoardColumns,parseChoiceConfig,columnOptionLines,
 setOptionalVirtualColumnVisibility} from './board-structure-admin.js';
import {BOARD_CARD_LIFECYCLE_ENABLED,isProtectedBoard,boardCardActionState,BoardCardLifecycleClient} from './board-card-lifecycle.js';
import {BoardItemSelection,matchBoardSearch,exportVisibleBoardItems} from './board-bulk-selection.js';
import {openBoardImportWizard} from './board-import-ui.js';
import {resolveColumnTypeSelection,renderColumnTypeOptions} from './board-column-catalog.js';
import {resolveInlineColumn,columnStoredValueCount,prepareInlineColumnUpdate,
 confirmInlineColumnDelete} from './board-inline-context.js';
import {isQaBoardRecoveryInterfaceAllowed,canStartB4QaRecoveryDeletion,BoardColumnRecoveryClient,renderBoardColumnRecoveryList,explainColumnDeleteError} from './board-column-recovery.js';
import {cmp02CreationConfig} from './board-typed-cmp02.js';
import {canManuallyEditBoard,genericBoardColumns,cellColumn,expectedCellValue,visibleValue,editableCellButton,renderInlineCellEditor,renderGroupAddRow,groupColumnSummaries,parseCellForm,configuredStatus,statusColorClass} from './board-inline-items.js';
import {canBulkEditBoard,BoardBulkClient} from './board-bulk02-client.js';
import {probeBulk02SignedSession} from './board-bulk02-signed-acceptance.js';
import {createItemOnlyBoard,enableItemOnlyBoard,isItemOnlyBoard,itemOnlyColumnKeys} from './board-minimal-default.js';
import {deleteOneAuthorizedItem,selectedDeleteCandidates} from './board-single-delete.js';
import {moveTabInOrder,reorderManagedTimeTrackerTabs} from './board-tab-order.js';
import {publicBoardDescription} from './board-public-copy.js';
import {MANAGED_TT_GROUP_DELETE_ENABLED,isManagedTimeTrackerBoard,
 canSafelyHideEmptyTimeTrackerGroup,isRedundantEmptyTimeTrackerGroup,
 readHiddenEmptyGroups,hideEmptyTimeTrackerGroup,
 restoreHiddenTimeTrackerGroups,deleteEmptyManagedTimeTrackerGroup} from './managed-time-tracker-groups.js';
import {isRow01Fixture,readRow01Pending,prepareRow01Acceptance,finalizeRow01Acceptance,sanitizeRow01Report} from './board-row01-signed-acceptance.js';
import {runBoardTtSignedReadOnly} from './board-tt-signed-acceptance.js';
import {normalizeBoardActivity,renderBoardActivityResults,boardItemSummary} from './board-activity-ui.js';
import {BOARD_COL01_AUDIT_CURSOR_ENABLED,BOARD_COL01_AUDIT_MAX_PAGES,
 loadBoardInvitableDirectory,renderBoardInvitableDirectory,
 loadBoardAuditCursorPage,renderBoardAuditCursorPage} from './board-col01-readers.js';
import {loadBoardCollaboration,renderBoardCollaboration} from './board-collaboration.js';
import {boardTable,boardColumnMenu,loadBoardLayout,saveBoardLayout,resetBoardLayout,reorderVisible,
 normalizeLayout,BOARD_REQUIRED_COLUMNS,BOARD_COLUMN_MIN,BOARD_COLUMN_MAX,columnWidth} from './board-presentation.js';
import {runTwelveBoardQa} from './board-operational-qa.js';
import {runSignedNegativeBoardAcceptance,sanitizeNegativeReport} from './board-negative-acceptance.js';
import {renderSecurityAcceptance} from './board-security-ui.js';
import {mountSecurityMotion,stopSecurityMotion} from './security-experience.js';
import {runDeniedQaWrite} from './board-negative-write.js';
import {runFRTSec03SignedAcceptance} from './frt-sec03-signed-acceptance.js';
import {runFRTSec07ActivationGate} from './frt-sec07-signed-activation.js';
import {runFRTSec09SignedAcceptance,sanitizeFRTSec09Report} from './frt-sec09-signed-acceptance.js';
import {runFRTSec10SignedCeilingProbe,sanitizeFRTSec10Report} from './frt-sec10-signed-ceiling.js';
import {runFRTCI07SignedRoleProbe,sanitizeFRTCI07Report} from './frt-sec10-ci07-signed-runtime.js';
import {runSEC14SignedRead,sanitizeSEC14SignedRead} from './frt-sec14-signed-acceptance.js';
import {runSEC14SignedDenials,sanitizeSEC14SignedDenials} from './frt-sec14-signed-denials.js';
import {loadFRTFinanceReadOnly} from './frt-finance-readonly.js';
import {renderFRTFinanceReadOnly} from './frt-finance-ui.js';
import {TimeTrackerNativeClient,captureAttendanceGeo,filterMyAttendancePeriod,TT_LIVE_ATTENDANCE_WRITES_ACCEPTED} from './time-tracker-native.js';
import {renderTimeTrackerNative,ownAttendanceCsv,syncTimeTrackerClock} from './time-tracker-ui.js';
import {mountTimeTrackerPixi,stopTimeTrackerPixi} from './time-tracker-pixi-scene.js';
import {startSelectExperience} from './select-experience.js';
import {startActionMenuExperience,enhanceActionContextMenu} from './action-menu-experience.js';
import {startSearchExperience} from './search-experience.js';
import {startInputExperience} from './input-experience.js';
import {startMetricsExperience} from './metrics-experience.js';
import {applyTimeTrackerOverviewFilters,filterTimeTrackerOverviewRows,syncTimeTrackerOverviewClock,timeTrackerOverviewCsv} from './time-tracker-overview.js';
import {applyTimeTrackerLogSearch,filterTimeTrackerLogRows,timeTrackerLogCsv,TT_LOG_DEFAULT_FILTERS} from './time-tracker-log.js';
import {filterTimeTrackerReportRows,applyTimeTrackerReportSearch,TT_REPORT_DEFAULT_FILTERS} from './time-tracker-reports.js';
import {timeTrackerCalendarMonth,shiftTimeTrackerCalendarMonth} from './time-tracker-calendar.js';
import {TT_OT_DEFAULT_FILTERS,TT_OT_WRITES_ACCEPTED} from './time-tracker-overtime.js';
import {timeTrackerMyHoursWeek} from './time-tracker-my-hours.js';
import {timeTrackerTeamCsv,TT_TEAM_ROLES} from './time-tracker-team.js';
import {probeTimeTrackerMonitor} from './time-tracker-monitor.js';
import {timeTrackerGpsWindow,summarizeGps} from './time-tracker-gps.js';
import {TT_BOARD_GPS_PROJECTION_ENABLED,loadTimeTrackerBoardGps,renderTimeTrackerBoardGps} from './time-tracker-board-projection.js';
import {renderTimeTrackerMainGroup} from './time-tracker-main-group.js';
import {clockOutSnapshotOutcome,attendanceAuthFailure,attendanceClockError} from './time-tracker-clock-recovery.js';
import {signedMapPoints,mountTimeTrackerMaps,disposeTimeTrackerMaps,setTimeTrackerMapTheme,retryTimeTrackerMaps,toggleTimeTrackerMapFullscreen} from './time-tracker-map.js';
import {loadFRTRequestDetailReadOnly} from './frt-finance-workflow.js';
import {inspectMySignedEffectiveAccess,sanitizeEffectiveAccessReport} from './signed-effective-access.js';
import {RoleConfigurationClient} from './role-configuration-client.js';
import {renderRoleConfiguration,ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
import {mountRoleConfigurationMotion,stopRoleConfigurationMotion} from './role-configuration-visuals.js';
import {mountUserRoleMotion,stopUserRoleMotion} from './user-role-visuals.js';
import {settingsIcon,mountSettingsMotion,stopSettingsMotion} from './settings-visuals.js';
import {UserRoleManagementClient,renderUserRoleManagement,MODULE_ROLE_OPTIONS,APSYNTRA_CRM_PLATFORM_ROLES} from './user-role-management.js';

const BOARD_BASE_COLUMNS=[{key:'record',title:'Item name'},{key:'status',title:'Status'},
 {key:'owner',title:'Owner'},{key:'due',title:'Due date'},{key:'actions',title:'Actions'}];
const root=document.getElementById('app');
const auth=new AuthClient();
const db=new DomainApi(auth);
const boardCacheChannel=new BoardCacheChannel({auth,onInvalidate:({boardId,revision,userId,workspaceId})=>{
 if(!auth.isSignedIn||state.context?.user_id!==userId||
    state.context?.workspace_id!==workspaceId)return;
 if(!db.invalidateBoardCache(boardId,{revision}))return;
 if(state.view==='board'&&(boardId===null||boardId===state.boardId)){
  // All visible updates and access checks still come from signed server reads.
  void reconcilePlatformSync({boardIds:boardId?[boardId]:[],
   reason:boardId?'broadcast':'cross-tab',userId,workspaceId}).catch(()=>{});
 }
}});
db.onBoardMutation=({boardId,revision})=>boardCacheChannel.publish(boardId,revision);
const profileAvatarClient=new ProfileAvatarClient({auth});
const workspaceLifecycleClient=new WorkspaceLifecycleClient({auth,api:db});
const workspaceInvitationClient=new WorkspaceInvitationClient({auth,api:db});
const workspaceInvitationAcceptanceClient=new WorkspaceInvitationAcceptanceClient({auth,api:db});
const platformSync=new PlatformSync({
 auth,api:db,url:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY,
 onStatus:updatePlatformSyncIndicator,onInvalidate:async event=>{
  if(event.reason==='broadcast'&&event.boardIds?.length){
   for(const id of event.boardIds)db.invalidateBoardCache(id);
  }else db.invalidateBoardCache();
  return reconcilePlatformSync(event);
 }
});
const boardStructureClient=new BoardStructureClient(db);
const boardColumnRecovery=new BoardColumnRecoveryClient(db);
const boardCardLifecycle=new BoardCardLifecycleClient(db);
const itemSelection=new BoardItemSelection();
const boardBulkClient=new BoardBulkClient(db);
const nativeIssues=new NativeIssueClient(db);
const tradeLinkDraftWorkspace=new TradeLinkDraftWorkspace({auth,api:db});
const tradeLinkAttachments=new TradeLinkAttachmentClient({auth,api:db});
const row01BootId=crypto.randomUUID();
const timeTracker=new TimeTrackerNativeClient({auth,api:db});
const roleConfig=new RoleConfigurationClient(db);
const userRoleManager=new UserRoleManagementClient(db);
const state={context:null,avatarMutationBusy:false,user:null,boards:[],archived:[],trashed:[],showArchived:false,showTrash:false,boardSearch:'',groupEditId:null,groupEditBusy:false,inlineCell:null,inlineCellBusy:false,inlineAddBusy:false,row01Busy:false,row01Result:null,bulk02Busy:false,bulk02Result:null,bulk02Access:null,boardLifecycleBusy:false,columnOrderBusy:false,board:null,boardUi:null,issues:[],edit:false,boardManage:false,
  view:'overview',boardId:null,tab:'items',fuelTrackSection:'dashboard',fuelTrackAnalyticsView:'fuel-price',fuelTrackAnalyticsRange:'all',fuelTrackAnalyticsMetric:'both',fuelTrackRequestFilters:{...FUELTRACK_REQUEST_FILTER_DEFAULTS},fuelTrackRequestScope:'',loading:false,loadingIssues:false,frtFinance:null,frtFinanceBusy:false,ttBoardGpsEligible:false,ttBoardAttendance:null,ttAttendance:null,ttClockPending:null,ttBusy:false,ttError:'',ttSuccess:'',ttRunId:0,ttReportPeriod:'all',ttReportFilters:{...TT_REPORT_DEFAULT_FILTERS},ttCalendarMonth:'',ttCalendarSelectedDay:'',ttOtFilters:{...TT_OT_DEFAULT_FILTERS},ttOtModalOpen:false,ttOtDraft:{},ttHoursWeekOffset:0,ttHoursMonth:'',ttHoursSelectedDay:'',ttTeam:null,ttTeamBusy:false,ttTeamError:'',ttTeamRunId:0,ttTeamFilters:{search:'',role:'All',layout:'list'},ttMonitor:null,ttMonitorHistory:[],ttMonitorBusy:false,ttMonitorError:'',ttMonitorRunId:0,ttLogGpsData:null,ttLogGpsBusy:false,ttLogGpsError:'',ttLogGpsErrorRecordId:'',ttLogGpsRunId:0,ttLogGpsCacheAt:0,ttLogExpandedIds:[],ttGpsData:null,ttGpsBusy:false,ttGpsError:'',ttGpsRunId:0,ttGpsCacheAt:0,ttGpsView:'map',ttGpsFilters:{},ttMapConsent:true,ttMapConsentIdentity:'',ttView:'clock',ttOverviewFilters:{search:'',location:'all',department:'all',status:'all',sort:'newest'},ttLogFilters:{...TT_LOG_DEFAULT_FILTERS},frtFinanceDetail:null,frtFinanceDetailBusy:false,frtFinanceDetailId:null,frtFinanceDetailRevision:0,filter:'',error:null,authBusy:false,acceptance:null,acceptanceBusy:false,boardTtSignedResult:null,boardTtSignedBusy:false,pagesAcceptance:null,pagesBusy:false,nativeAcceptance:null,nativeBusy:false,foundationRows:[],foundationBusy:false,provisionBusy:false,foundationLog:[],foundationError:'',foundationTesting:false,foundationTestResult:null,securityBusy:false,securityResult:null,securityProgress:[],securityWriteBusy:false,securityWriteResult:null,frtSecurityBusy:false,frtSecurityResult:null,ci07Busy:false,ci07Result:null,ci07RunId:0,sec14Busy:false,sec14Result:null,sec14RunId:0,sec14DenialBusy:false,sec14DenialResult:null,sec14DenialRunId:0,sec07Busy:false,sec07Result:null,sec09Busy:false,sec09Result:null,sec09RunId:0,sec10Busy:false,sec10Result:null,sec10RunId:0,effectiveAccessBusy:false,effectiveAccessResult:null,effectiveAccessRunId:0,securityBoardsError:'',tradeLinkSetupBusy:false,tl03ReadBusy:false,tl03ReadResult:null,tl03ReadRunId:0,tl03RevokeArmed:false,tl03RevokedReport:null,ws01B2Busy:false,ws01B2Result:null,ws01B2RunId:0,ws02dB3Busy:false,ws02dB3Report:null,ws02dB3RunId:0,ws02dB3HttpsBusy:false,ws02dB3HttpsReport:null,ws02dB3HttpsRunId:0,ws02dB3RlsBusy:false,ws02dB3RlsReport:null,ws02dB3RlsRunId:0,ws02dB3HandoffPending:false,ws02dB3RevokeArmed:false,ws02dB3RevokedReport:null,b2QaBusy:false,b2QaReport:null,b2QaRunId:0,b4QaBusy:false,b4QaReport:null,b4QaRunId:0,phaseBDenialBusy:false,phaseBDenialReport:null,phaseBDenialRunId:0,tradeLinkSection:'overview',tradeLinkActivity:null,tradeLinkActivityBusy:false,tradeLinkActivityError:'',tradeLinkDraft:initialTradeLinkDraftView(),roleVerified:false,roleData:null,roleTab:'roles',roleBusy:false,roleError:'',userRoleData:null,userRoleSelected:null,userRoleBusy:false,userRoleError:''};
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusClass=value=>({'done':'done','completed':'completed','working':'working','in progress':'in-progress',
'stuck':'stuck','blocked':'blocked','todo':'todo','planned':'planned'}[String(value??'').toLowerCase()]||'todo');
const displayDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(d)};
const initials=value=>String(value||'U').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const iconColor=index=>['','green','orange','pink','blue'][Math.abs(index)%5];
const name=()=>state.context?.profile?.display_name||state.context?.profile?.email?.split('@')[0]||'Member';
const workspaceName=()=>state.context?.workspace_id==='00000000-0000-4000-8000-000000000001'?'Work Management':'Current workspace';
const cards=()=>state.showTrash?state.trashed:state.showArchived?state.archived:state.boards;
const routeHome='#/overview';
const unsavedTradeLinkWarning='You have unsaved TradeLink Draft changes. Leave this page and discard them?';
let approvedRouteHash=location.hash||routeHome;
let rejectedRouteHash=null;
let pendingInvitation=null;
let invitationAcceptanceBusy=false;
let invitationAcceptanceStatus='';
let modal=null;
let routeSerial=0;
let avatarHydrationPromise=Promise.resolve({attempted:0,loaded:0,failed:0,stale:0});
let ttClockTimer=null;
function stopTimeTrackerClock(){
 if(ttClockTimer!==null){clearInterval(ttClockTimer);ttClockTimer=null;}
}
function maintainTimeTrackerClock(){
 const mounted=state.view==='board'&&state.tab==='attendance'&&
  state.ttAttendance?.status==='VERIFIED_READ'&&
  (state.ttView==='clock'&&root.querySelector('#tt-clock-hours')||
   state.ttView==='overview'&&root.querySelector('#tt-overview-time'));
 if(!mounted){stopTimeTrackerClock();return;}
 const tick=()=>{
  if(state.ttView==='clock')syncTimeTrackerClock(root);
  else if(state.ttView==='overview')syncTimeTrackerOverviewClock(root);
 };
 tick();
 if(ttClockTimer===null)ttClockTimer=setInterval(()=>{
  if(!document.hidden)tick();
 },1000);
}

function toast(message,error=false){
 let holder=document.querySelector('.toast-container');
 if(!holder){holder=document.createElement('div');holder.className='toast-container';document.body.append(holder);}
 const item=document.createElement('div');item.className='toast'+(error?' error':'');item.textContent=message;holder.append(item);
 setTimeout(()=>item.remove(),4500);
}
function errorMessage(err){if(err instanceof ApiError&&err.status===403)return 'Access denied by your workspace permissions.';return err?.message||'Unable to complete the request.';}
function notice(err){toast(errorMessage(err),true);}
let authVisualController=null;
let recoveryContext=null;
function authViewFromHash(hash=location.hash){
 if(hash==='#/register')return 'register';
 if(hash==='#/forgot-password')return 'forgot';
 if(hash==='#/reset-password')return 'reset';
 return 'login';
}
function stopAuthVisuals(){
 authVisualController?.destroy?.();
 authVisualController=null;
}
function renderLogin(message='',{mode=authViewFromHash(),notice=''}={}){
 stopTimeTrackerClock();
 stopTimeTrackerPixi();
 stopAvatarPreview();
 syncFuelTrans({container:null});
 stopAuthVisuals();
 stopSidebarSelection();
 stopOverviewMotion();
 stopBoardCatalogMotion();
 stopFoundationMotion();
 stopSecurityMotion();
 stopRoleConfigurationMotion();
 stopUserRoleMotion();
 stopSettingsMotion();
 stopPagesAcceptanceMotion();
 const formsubmitReturn=mode==='register'&&new URLSearchParams(location.search).get('request_access')==='received';
 root.innerHTML=renderAuthMarkup({message,notice:notice||(formsubmitReturn?
  'Returned from FormSubmit. If the provider confirmed success, the request was sent for administrator review. No account has been created.':''),mode,resetReady:mode==='reset'&&!!recoveryContext});
 if(state.tl03RevokedReport&&!auth.isSignedIn)
  root.insertAdjacentHTML('beforeend',renderTradeLinkSignedOutRevocationResult(state.tl03RevokedReport));
 authVisualController=mountAuthExperience(root.querySelector('.aps-auth-v2'));
}

/** Visual-only route links. Permission-aware inclusion stays server-derived. */
function sidebarNav(href,label,icon,active,{count=null}={}){
 const selected=active?' aria-current="page"':'';
 const badge=count!==null?'<span class="nav-count">'+e(count)+'</span>':'';
 return '<a class="nav-link '+(active?'active':'')+'" href="'+e(href)+'" '+
  'title="'+e(label)+'" aria-label="'+e(label)+'"'+selected+'>'+
  '<span class="nav-ico">'+sidebarIcon(icon)+'</span>'+
  '<span class="nav-label">'+e(label)+'</span>'+badge+'</a>';
}
function sidebar(){
 const currentBoard=state.boardId;
 const recent=state.boards.slice(0,6);
 const nav=sidebarNav('#/overview','Overview','overview',state.view==='overview')+
  sidebarNav('#/boards','My boards','boards',state.view==='boards',{count:state.boards.length})+
  (state.roleVerified===true?sidebarNav('#/foundation','12-board foundation','foundation',state.view==='foundation'):'')+
  sidebarNav('#/security','Access acceptance','security',state.view==='security')+
  (state.roleVerified===true?'<div class="side-section sidebar-nav-section">Administration</div>'+
   sidebarNav('#/role-configuration','Role Configuration','roles',state.view==='role-configuration')+
   sidebarNav('#/user-role-management','User Role Management','users',state.view==='user-role-management'):'')+
  sidebarNav('#/settings','Settings','settings',state.view==='settings')+
  (state.roleVerified===true?sidebarNav('#/acceptance','Pages acceptance','acceptance',state.view==='acceptance'):'');
 return `<aside class="sidebar aps-sidebar" aria-label="Workspace sidebar">
  <div class="sidebar-brand-wrap">
   <a href="#/overview" class="brand" aria-label="APSYNTRA CRM — Go to overview" title="Go to overview">
    <img class="brand-mark" src="./frontend/apsyntra-logo.webp" alt="" width="37" height="37" decoding="async"/>
    <span class="brand-text">APSYNTRA <span class="csp-u043">CRM</span></span>
   </a>
   <span class="sidebar-brand-subtitle" aria-hidden="true">WORKSPACE OPERATIONS</span>
  </div>
  `+renderWorkspaceSwitcher({id:state.context?.workspace_id,name:workspaceName()})+`
  <div class="ws02-sidebar-action">`+renderWorkspaceInviteLaunch({id:state.context?.workspace_id,name:workspaceName()})+`</div>
  <div class="sidebar-nav-scroll">
   <div class="side-section sidebar-nav-section">Workspace</div>
   <nav class="nav-list" aria-label="Primary">`+nav+`</nav>
   <div class="side-section sidebar-recent-heading">Recent boards
    <span class="sidebar-recent-count" aria-hidden="true">`+recent.length+`</span>
   </div>
   <nav class="nav-list sidebar-recent-list" aria-label="Recent boards">`+
    (recent.map((b,i)=>{
     const title=String(b.name||'Untitled board');
     const active=currentBoard===b.id;
     const tone=['violet','teal','amber','rose','blue','indigo'][i%6];
     return '<a class="nav-link sidebar-recent-link '+(active?'active':'')+
      '" href="#/boards/'+e(b.id)+'" title="'+e(title)+'" aria-label="'+e(title)+'"'+
      (active?' aria-current="page"':'')+'>'+
      '<span class="sidebar-board-initial sidebar-tone-'+tone+'" aria-hidden="true">'+
      e(title.slice(0,1).toUpperCase())+'</span>'+
      '<span class="nav-label">'+e(title)+'</span></a>';
    }).join('')||'<div class="sidebar-empty-recent">No boards yet</div>')+`</nav>
  </div>
  <div class="side-bottom">
   <div class="profile">
    <span class="avatar sidebar-profile-avatar" aria-hidden="true"><span data-avatar-initials aria-hidden="true">`+e(initials(name()))+`</span><img data-avatar-current alt="" hidden /></span>
    <div class="sidebar-profile-text"><div class="name">`+e(name())+`</div>
     <div class="role">`+e(state.context?.profile?.platform_role||'Team member')+`</div>
    </div>
   </div>
   <button type="button" class="sign-out" data-action="logout" aria-label="Sign out of workspace" title="Sign out of workspace">
    <span class="sidebar-signout-icon">`+sidebarIcon('logout')+`</span>
    <span>Sign out</span>
   </button>
  </div>
 </aside>`;
}
/** Signed session-local basemap opt-in. No persisted third-party access consent. */
function timeTrackerMapConsentKey(){
 return [state.context?.user_id,state.context?.workspace_id,state.boardId].join('|');
}
function timeTrackerSignedMapConfigs(){
 if(state.view!=='board'||state.tab!=='attendance'||!auth.isSignedIn||
  state.ttAttendance?.status!=='VERIFIED_READ'||
  !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))
  return [];
 const actor=state.context?.user_id,ws=state.context?.workspace_id;
 if(state.ttView==='log'){
  const data=state.ttLogGpsData;
  if(data?.actorId!==actor||data?.workspaceId!==ws||data?.boardId!==state.boardId)return [];
  return (state.ttAttendance.log?.rows||[]).map(row=>({
   scope:'log',elementId:row.id,points:signedMapPoints(data,{type:'log',record:row}),theme:state.ttGpsFilters.theme==='dark'?'dark':'map'
  })).filter(item=>item.points.length);
 }
 if(state.ttView==='gps'){
  const data=state.ttGpsData;
  if(data?.actorId!==actor||data?.workspaceId!==ws||data?.boardId!==state.boardId)return [];
  const summary=summarizeGps(data,state.ttGpsFilters);
  const points=state.ttGpsView==='trail'?summary.selected:
   state.ttGpsView==='geofence'?summary.latest:summary.points;
  const signed=signedMapPoints(data,{points});
  if(!signed.length)return [];
  return [{scope:'hub',points:signed,theme:state.ttGpsFilters.theme==='dark'?'dark':'map'}];
 }
 return [];
}
async function mountSignedTimeTrackerMaps(){
 const configs=timeTrackerSignedMapConfigs();
 if(configs.length)await mountTimeTrackerMaps(root,configs);
}
let shellIdentity=null;
let shellSidebarSignature=null;
let shellRoute=null;
function shell(body){
 stopAuthVisuals();
 const crumb=state.view==='board'?state.board?.board?.name||'Board':state.view==='overview'?'Overview':state.view==='boards'?'My boards':state.view==='acceptance'?'Pages acceptance':state.view==='foundation'?'12-board foundation':state.view==='security'?'Access acceptance':state.view==='role-configuration'?'Role Configuration':state.view==='user-role-management'?'User Role Management':state.view==='invitation'?'Workspace invitation':'Settings';
 const identity=[state.context?.user_id,state.context?.workspace_id].join('|');
 const sidebarSignature=JSON.stringify([state.roleVerified,name(),
  state.context?.profile?.platform_role,workspaceName(),
  state.boards.slice(0,6).map(board=>[board.id,board.name]),
  state.boards.length]);
 const route=[state.view,state.boardId,state.tab].join('|');
 // Preserve each group's horizontal position only across same-signed-view renders.
 const scrollPositions=state.view==='board'&&shellIdentity===identity&&shellRoute===route?
  captureBoardGroupScroll(root.querySelector(':scope > .shell .main-content')):null;
 disposeTimeTrackerMaps();
 const existing=root.querySelector(':scope > .shell');
 const reusable=existing&&shellIdentity===identity;
 if(shellIdentity!==identity)closeWorkspacePanels();
 if(reusable){
  const oldSidebar=existing.querySelector('.aps-sidebar');
  if(shellSidebarSignature!==sidebarSignature){
   const scroll=oldSidebar?.querySelector('.sidebar-nav-scroll')?.scrollTop||0;
   const template=document.createElement('template');
   template.innerHTML=sidebar();
   oldSidebar?.replaceWith(template.content.firstElementChild);
   const navScroll=existing.querySelector('.sidebar-nav-scroll');
   if(navScroll)navScroll.scrollTop=scroll;
  }else{
   for(const link of existing.querySelectorAll('.aps-sidebar a.nav-link')){
    const path=link.getAttribute('href')||'';
    const active=state.view==='board'?
     path==='#/boards/'+state.boardId:
     path==='#/'+state.view;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
   }
  }
  existing.querySelector('.breadcrumb strong').textContent=crumb;
  existing.querySelector('.top-avatar').innerHTML='<span data-avatar-initials aria-hidden="true">'+e(initials(name()))+'</span><img data-avatar-current alt="" hidden />';
  existing.querySelector('.main-content').innerHTML=body;
  if(scrollPositions)restoreBoardGroupScroll(existing.querySelector('.main-content'),scrollPositions);
 }else{
  root.innerHTML=`<div class="shell">${sidebar()}<main class="main">
 <header class="topbar"><div class="breadcrumb"><span>Workspace</span><span>›</span><strong>${e(crumb)}</strong></div><button type="button" class="ws01-topbar-launch" data-action="ws01-open" aria-label="Browse authorized workspaces">Workspaces ▾</button>
 <div class="top-actions">${renderWorkspaceInviteLaunch({id:state.context?.workspace_id,name:workspaceName()},{placement:'topbar'})}<span class="top-pill"><span class="online-dot"></span> Secure session</span><button type="button" class="aps-sync" data-action="platform-sync-verify" data-sync-state="connecting" aria-label="Checking synchronization status" title="Checking signed workspace updates"><span class="aps-sync-orbit" aria-hidden="true"></span><span class="aps-sync-caption">Connecting</span></button><a href="#/settings" class="avatar top-avatar" title="Account settings"><span data-avatar-initials aria-hidden="true">${e(initials(name()))}</span><img data-avatar-current alt="" hidden /></a></div></header>
 <div class="main-content">${body}</div></main></div>`;
 }
 const previousRoute=shellRoute;
 shellIdentity=identity;
 shellSidebarSignature=sidebarSignature;
 shellRoute=route;
 // Full-page routes have their own entrance effects. Avoid stacking motion.
 const previousBoard=previousRoute?.split('|');
 if(reusable&&previousBoard?.[0]==='board'&&state.view==='board'&&
    previousBoard[1]===String(state.boardId)&&previousBoard[2]!==state.tab)
  animateTabContent('.main-content');
 root.querySelector('.main')?.classList.toggle('aps-board-shell',state.view==='board');
 root.querySelector('.main')?.classList.toggle('aps-overview-shell',state.view==='overview');
 root.querySelector('.main')?.classList.toggle('aps-boards-shell',state.view==='boards');
 root.querySelector('.main')?.classList.toggle('aps-foundation-shell',state.view==='foundation');
 root.querySelector('.main')?.classList.toggle('aps-security-shell',state.view==='security');
 root.querySelector('.main')?.classList.toggle('aps-role-config-shell',state.view==='role-configuration');
 root.querySelector('.main')?.classList.toggle('aps-user-roles-shell',state.view==='user-role-management');
 root.querySelector('.main')?.classList.toggle('aps-settings-shell',state.view==='settings');
 root.querySelector('.main')?.classList.toggle('aps-pages-shell',state.view==='acceptance');
 animateSidebarSelection(root.querySelector('.aps-sidebar'),state.view);
 mountOverviewMotion(root.querySelector('.aps-overview'),state.view);
 mountBoardCatalogMotion(root.querySelector('.aps-boards'),state.view);
 mountFoundationMotion(root.querySelector('.aps-foundation'),state.view);
 mountSecurityMotion(root.querySelector('.aps-security'),state.view);
 mountRoleConfigurationMotion(root.querySelector('.aps-role-configuration'),state.view);
 mountUserRoleMotion(root.querySelector('.aps-user-role-management'),state.view);
 mountSettingsMotion(root.querySelector('.aps-settings'),state.view);
 mountPagesAcceptanceMotion(root.querySelector('.aps-pages-acceptance'),state.view);
 maintainTimeTrackerClock();
 mountTimeTrackerPixi(root);
 updatePlatformSyncIndicator(platformSync.lastStatus);
 avatarHydrationPromise=mountAvatarImages(root,profileAvatarClient,state.context?.profile?.avatar_path,state.context?.user_id);
 void mountSignedTimeTrackerMaps();
}
function animateTabContent(selector){
 if(document.hidden||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;
 // Old animations are disposed along with replaced content; no animation queue.
 root.querySelector(selector)?.animate?.([{opacity:.88},{opacity:1}],{
  duration:170,easing:'cubic-bezier(.2,.75,.3,1)',fill:'none'
 });
}
function boardCard(board,index){
 const status=boardCardActionState(board),href='#/boards/'+e(board.id);
 const options=BOARD_CARD_LIFECYCLE_ENABLED?
  '<details class="board-card-actions"><summary aria-label="Board actions for '+e(board.name)+
  '" title="Board actions"><span aria-hidden="true">···</span></summary>'+
  '<div class="board-card-actions-list" role="group" aria-label="Board actions">'+
  (status==='MANAGE'?
    (board.status==='trashed'?
      '<button type="button" data-action="board-card-restore" data-id="'+e(board.id)+'">Restore board</button>':
      '<button type="button" data-action="board-card-edit" data-id="'+e(board.id)+'">Edit board</button>'+
      (board.status==='archived'?'<button type="button" data-action="board-card-restore" data-id="'+e(board.id)+'">Restore board</button>':'')+
      '<button type="button" class="board-card-danger" data-action="board-card-trash" data-id="'+e(board.id)+'">Delete board · Move to trash</button>'):
   '<p class="board-card-actions-info">'+
    e(status==='PROTECTED'?'Application-managed board. Editing and deletion are protected.':
      'Only authorized board managers can edit or delete this board.')+'</p>')+
  '</div></details>':
  '<span class="board-menu" aria-label="Board management not yet activated">···</span>';
 return '<article class="board-card" data-searchable="'+e((board.name+' '+(board.description||'')).toLowerCase())+'">'+
  '<div class="board-card-top"><span class="board-symbol '+iconColor(index)+'" aria-hidden="true">'+
   e((board.name||'B').slice(0,1).toUpperCase())+'</span>'+options+'</div>'+
  '<a class="board-card-main" href="'+href+'" aria-label="Open '+e(board.name||'Untitled board')+'"><h3>'+e(board.name||'Untitled board')+'</h3>'+
  '<p>'+e(publicBoardDescription(board))+'</p>'+
  '<div class="board-card-footer"><span>▤ '+(Number(board.item_count)||0)+' items</span>'+
  '<span>'+e(displayDate(board.updated_at))+'</span></div></a></article>';
}
function empty(title,description,action=''){
 return `<div class="empty"><span class="empty-icon">▦</span><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
}
function overview(){
 const total=state.boards.reduce((a,b)=>a+(Number(b.item_count)||0),0);
 const recent=state.boards.slice(0,6);
 return `<div class="aps-overview">
 <section class="page-head overview-hero overview-entrance" aria-labelledby="overview-title">
  <div class="overview-hero-copy">
   <span class="label-top"><span class="overview-hero-dot" aria-hidden="true"></span> Workspace / Overview</span>
   <h1 id="overview-title">Good to see you, `+e(name().split(' ')[0])+` <span class="overview-wave" aria-hidden="true">👋</span></h1>
   <p>Here's what your workspace looks like today.</p>
  </div>
  <div class="head-actions">
   <button type="button" class="secondary overview-refresh" data-action="refresh">`+overviewIcon('refresh')+`<span>Refresh</span></button>
   <button type="button" class="primary overview-create" data-action="new-board">`+overviewIcon('plus')+`<span>New board</span></button>
  </div>
  <svg class="overview-hero-art" viewBox="0 0 430 230" aria-hidden="true" focusable="false" fill="none">
   <circle cx="358" cy="49" r="112" stroke="currentColor" stroke-opacity=".12"/>
   <circle cx="358" cy="49" r="163" stroke="currentColor" stroke-opacity=".07"/>
   <path d="M133 222C190 87 287 73 451 118" stroke="currentColor" stroke-opacity=".13"/>
   <circle cx="299" cy="73" r="4" fill="#9af2e5" fill-opacity=".75"/>
   <circle cx="145" cy="185" r="3" fill="#dce0ff" fill-opacity=".7"/>
  </svg>
 </section>
 <section class="stat-grid overview-stat-grid overview-entrance" aria-label="Workspace statistics">
  <div class="stat-card">
   <span class="stat-icon">`+overviewIcon('grid')+`</span>
   <div class="stat-label">Active boards</div>
   <div class="stat-value">`+state.boards.length+`</div>
   <div class="stat-footer">Available to your account</div>
  </div>
  <div class="stat-card">
   <span class="stat-icon green">`+overviewIcon('items')+`</span>
   <div class="stat-label">Board items</div>
   <div class="stat-value">`+total+`</div>
   <div class="stat-footer">Across your active boards</div>
  </div>
  <div class="stat-card">
   <span class="stat-icon orange">`+overviewIcon('pulse')+`</span>
   <div class="stat-label">Workspace status</div>
   <div class="stat-value csp-u042">Active</div>
   <div class="stat-footer">Access context verified</div>
  </div>
  <div class="stat-card">
   <span class="stat-icon pink">`+overviewIcon('shield')+`</span>
   <div class="stat-label">Your access</div>
   <div class="stat-value csp-u041" title="Current platform role">`+e(state.context?.profile?.platform_role||'Member')+`</div>
   <div class="stat-footer">Authoritative account role</div>
  </div>
 </section>
 <div class="section-header overview-section-heading overview-entrance">
  <div class="overview-heading-copy"><span class="overview-section-eyebrow">YOUR WORKSPACE</span><h2 class="section-title">Your boards</h2></div>
  <a class="inline-link" href="#/boards"><span>View all boards</span>`+overviewIcon('arrow')+`</a>
 </div>
 `+(recent.length?
  '<div class="card-grid overview-board-grid overview-entrance">'+recent.map(boardCard).join('')+'</div>':
  '<div class="panel overview-empty">'+empty('Start with your first board',
   'Create a board to organize tasks and updates.',
   '<button class="primary" data-action="new-board">＋ Create board</button>')+'</div>')+(state.roleVerified===true?`
 <div class="section-header overview-section-heading overview-essentials-heading overview-entrance">
  <div class="overview-heading-copy"><span class="overview-section-eyebrow">FOUNDATION</span><h2 class="section-title">Workspace essentials</h2></div>
 </div>
 <section class="panel overview-essentials overview-entrance" aria-label="Workspace essentials">
  <div class="panel-body">
   <div class="activity-item">
    <span class="activity-avatar" aria-hidden="true">`+overviewIcon('lock')+`</span>
    <div><b>Supabase Auth connected</b><small>Your session is verified against the existing identity system.</small></div>
    <span class="overview-essentials-indicator" aria-hidden="true">`+overviewIcon('check')+`</span>
   </div>
   <div class="activity-item">
    <span class="activity-avatar" aria-hidden="true">`+overviewIcon('shield')+`</span>
    <div><b>Board permissions are centralized</b><small>Each board and action is checked against the authoritative workspace permissions.</small></div>
    <span class="overview-essentials-indicator" aria-hidden="true">`+overviewIcon('check')+`</span>
   </div>
   <div class="activity-item">
    <span class="activity-avatar" aria-hidden="true">`+overviewIcon('items')+`</span>
    <div><b>Native issue transactions</b><small>Issue records use the existing RLS view and atomic Supabase transaction RPC.</small></div>
    <span class="overview-essentials-indicator" aria-hidden="true">`+overviewIcon('check')+`</span>
   </div>
  </div>
 </section>`:'')+`
 </div>`;
}
function boardsPage(){
 const items=cards().filter(b=>matchBoardSearch(b,state.boardSearch));
 const active=!state.showArchived&&!state.showTrash;
 const selectedStatus=state.showTrash?'Trash':state.showArchived?'Archived':'Active';
 return `<div class="aps-boards">
  <section class="page-head boards-hero boards-entrance" aria-labelledby="boards-page-title">
   <div class="boards-hero-copy">
    <span class="label-top"><span class="boards-hero-dot" aria-hidden="true"></span>Workspace / Boards</span>
    <h1 id="boards-page-title">My boards<span class="boards-heading-stop">.</span></h1>
    <p>Everything your team is working on, organized in one place.</p>
   </div>
   <button type="button" class="primary boards-create-button" data-action="new-board">`+overviewIcon('plus')+`<span>New board</span></button>
   <svg class="boards-hero-decor" viewBox="0 0 500 220" aria-hidden="true" focusable="false" fill="none">
    <circle cx="397" cy="30" r="130" stroke="currentColor" stroke-opacity=".13"/>
    <circle cx="397" cy="30" r="190" stroke="currentColor" stroke-opacity=".06"/>
    <path d="M176 250C268 48 352 137 506 81" stroke="currentColor" stroke-opacity=".14"/>
    <circle cx="251" cy="102" r="3" fill="#97e7ef" fill-opacity=".86"/>
    <circle cx="475" cy="182" r="4" fill="#b9b8ff" fill-opacity=".85"/>
   </svg>
  </section>
  <section class="boards-filter-panel boards-entrance" aria-label="Browse workspace boards">
   <div class="toolbar boards-toolbar">
    <div class="boards-status-picker">
     <span class="boards-control-label">BOARD STATUS</span>
     <div class="segmented boards-status-segments" aria-label="Board status" role="group">
      <button type="button" class="segment `+(active?'active':'')+`" data-action="active-boards" aria-pressed="`+active+`">Active</button>
      <button type="button" class="segment `+(state.showArchived?'active':'')+`" data-action="archived-boards" aria-pressed="`+state.showArchived+`">Archived</button>
      `+(BOARD_CARD_LIFECYCLE_ENABLED?'<button type="button" class="segment '+(state.showTrash?'active':'')+'" data-action="trashed-boards" aria-pressed="'+state.showTrash+'">Trash</button>':'')+`
     </div>
    </div>
    <div class="boards-search-wrap">
     <label class="boards-control-label" for="board-search">FIND A BOARD</label>
     <div class="search-wrap">
      <svg class="boards-search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>
      <input type="search" class="search-input" id="board-search" placeholder="Search boards…" aria-label="Search boards" aria-controls="boards-catalog-grid" aria-describedby="board-search-result" value="`+e(state.boardSearch)+`" autocomplete="off" />
     </div>
    </div>
   </div>
   <div class="boards-filter-footer">
    <p class="board-search-result" id="board-search-result" role="status" aria-live="polite">`+items.length+` matching board`+(items.length===1?'':'s')+`</p>
    <span class="boards-selected-filter" aria-hidden="true">`+e(selectedStatus)+` boards</span>
   </div>
  </section>
  <p id="board-search-no-results" class="board-search-no-results" hidden>No boards match this search.</p>
  `+(items.length?
   '<div class="card-grid boards-catalog-grid boards-entrance" id="boards-catalog-grid">'+items.map(boardCard).join('')+'</div>':
   '<div class="panel boards-empty-state" id="boards-catalog-grid">'+
   empty(state.boardSearch?'No matching boards':state.showTrash?'Trash is empty':state.showArchived?'No archived boards':'No boards available',
    state.boardSearch?'Try another search term or clear the search.':state.showTrash?'Moved boards can be restored here.':state.showArchived?'You have no archived boards in this workspace.':'Only boards allowed by your organization appear here.','')+'</div>')+`
 </div>`;
}
function groupRows(items,allowEdit,layout=null,groupId='ungrouped',primaryTitle='Record',detail=state.board,columnLabels={}){
 const minimal=isItemOnlyBoard(detail,state.boardUi);
 const columns=genericBoardColumns(detail,{primaryTitle,columnLabels,minimal,
  hiddenVirtual:state.boardUi?.hiddenVirtual});
 const writable=canManuallyEditBoard(detail?.board,allowEdit);
 const rows=items.map(item=>{
  const editable=writable&&!item.archived_at,cell={};
  const display=(key,content)=>{
   if(state.inlineCell?.itemId===item.id&&state.inlineCell?.key===key)
    return renderInlineCellEditor({item,key,detail,members:detail?.members||[]});
   return editableCellButton({key,item,detail,
    writable:editable&&(!cellColumn(detail,key)?.virtual||canBulkEditBoard(detail?.board)),
    cellContent:content});
  };
  cell.record='<button class="board-item-open" type="button" data-action="board-item-detail" data-id="'+e(item.id)+'" aria-label="Open '+e(item.title||'Untitled')+' details">▥</button> '+
   display('record',e(item.title||'Untitled'));
  cell.status=display('status','<span class="status '+statusClass(item.status)+'">'+e(item.status||'Planned')+'</span>');
  cell.owner=display('owner',item.assignee_id?e(String(item.assignee_id).slice(0,8))+'…':'Unassigned');
  cell.due=display('due',e(displayDate(item.due_date)));
  for(const column of columns.filter(c=>c.key.startsWith('col:'))){
   const def=cellColumn(detail,column.key);
   const value=expectedCellValue(detail,item,column.key);
   const status=def?.data_type==='status'?configuredStatus(value,def.config):null;
   const formatted=status?
    '<span class="board-configured-status '+statusColorClass(status.color)+'">'+
     e(status.label)+'</span>':
    e(visibleValue(value,def?.data_type,def?.config));
   cell[column.key]=display(column.key,formatted);
  }
  cell.actions=editable?'<button class="icon-button" data-action="edit-item" data-id="'+
   e(item.id)+'" title="Edit item name inline">✎ Edit</button>':'';
  const statusKeys=editable?columns.filter(c=>{
   const def=cellColumn(detail,c.key);
   return def?.data_type==='status'&&(!def.virtual||canBulkEditBoard(detail?.board));
  }).map(c=>c.key):[];
  return {itemId:item.archived_at?null:item.id,search:String(item.title||'').toLowerCase(),
   cells:cell,statusKeys};
 });
 return boardTable({columns,rows,layout,groupId,
  empty:'No items in this group yet',selection:{enabled:true,selected:itemSelection.ids},
  footer:renderGroupAddRow({groupId,enabled:writable,busy:state.inlineAddBusy}),
  summaries:groupColumnSummaries({items,columns,detail}),
  addColumn:minimal&&state.boardManage,minimal});
}

function bulkReadyFor(board){
 const access=state.bulk02Access;
 return !!boardBulkClient.enabled&&!!access&&auth.isSignedIn&&
  state.edit&&canBulkEditBoard(board)&&
  access.boardId===board?.id&&access.userId===state.context?.user_id&&
  access.workspaceId===state.context?.workspace_id;
}
function clearBulkActivation(){
 state.bulk02Access=null;state.bulk02Result=null;state.bulk02Busy=false;
 boardBulkClient.enabled=false;
}
async function ensureSignedBulkReady(board,{notify=true}={}){
 if(bulkReadyFor(board))return true;
 if(state.bulk02Busy||!auth.isSignedIn||!state.edit||
    !canBulkEditBoard(board)||!activeBoardLayout())return false;
 const user=state.context?.user_id,workspace=state.context?.workspace_id;
 clearBulkActivation();state.bulk02Busy=true;render();
 try{
  const result=await probeBulk02SignedSession({auth,api:db,board});
  if(!auth.isSignedIn||state.context?.user_id!==user||
     state.context?.workspace_id!==workspace||state.boardId!==board.id){
   clearBulkActivation();return false;
  }
  state.bulk02Result=result;
  if(result.ready){
   state.bulk02Access={boardId:board.id,userId:user,workspaceId:workspace,
    canManage:result.canManage};
   boardBulkClient.enabled=true;
  }else{
   boardBulkClient.enabled=false;
  }
  if(notify)toast(result.ready?'Current signed board bulk permissions verified.':
   'Bulk action blocked: review signed authorization checks.',!result.ready);
 }catch{
  clearBulkActivation();
  toast('Signed bulk check unavailable; no mutations were enabled.',true);
 }finally{
  state.bulk02Busy=false;render();
 }
 return bulkReadyFor(board);
}
function fuelTrackRequestReady(){
 return state.view==='board'&&state.tab==='fueltrack'&&
  state.fuelTrackSection==='requests'&&state.boardId===FUELTRACK_V3_ID&&
  isFuelTrackV3ApplicationBoard(state.board?.board)&&auth.isSignedIn&&
  state.board.board.workspace_id===state.context?.workspace_id&&
  state.context?.user_id===auth.userId;
}
function updateFuelTrackRequestFilters(patch){
 if(!fuelTrackRequestReady())return;
 state.fuelTrackRequestFilters={...state.fuelTrackRequestFilters,...patch};
 render();
}
function canRequestBulk(board){
 return auth.isSignedIn&&state.edit&&canBulkEditBoard(board)&&
  !state.bulk02Busy&&itemSelection.size>0&&itemSelection.size<=50;
}
function groupHeading(group,count){
 const id=e(group.id),editing=state.groupEditId===group.id;
 const managedEmpty=canSafelyHideEmptyTimeTrackerGroup(state.board?.board,group,
  state.board?.groups||[],state.board?.items||[]);
 const managedDelete=managedEmpty&&MANAGED_TT_GROUP_DELETE_ENABLED&&state.boardManage;
 // The saved group title is the sole source for both display and editing.
 const title=e(group.title||'Group');
 const displayTitle=title;
 const fuelTrackEditable=state.edit&&state.board?.board?.id==='7af78b3f-67bf-4600-9aa1-9006d19d486e'&&
  state.board?.board?.name==='FuelTrack+ v3'&&
  String(state.board.board.description||'').startsWith('[APSYNTRA:MODULE:fueltrack:v1]');
 if(editing)return '<div class="group-heading board-group-editing" data-group-id="'+id+'">'+
  '<form class="board-group-inline-form" data-group-inline-form="'+id+'">'+
  '<label class="sr-only" for="group-title-'+id+'">Group name</label>'+
  '<input id="group-title-'+id+'" name="title" required maxlength="120" value="'+title+'"'+(state.groupEditBusy?' disabled':'')+' />'+
  '<button type="submit" class="primary"'+(state.groupEditBusy?' disabled':'')+'>Save</button>'+
  '<button type="button" class="secondary" data-action="group-inline-cancel"'+(state.groupEditBusy?' disabled':'')+'>Cancel</button>'+
  '</form></div>';
 return '<div class="group-heading" data-group-id="'+id+'"><h3>'+displayTitle+'</h3>'+
  (fuelTrackEditable?'<button type="button" class="board-group-rename-trigger" data-action="group-inline-edit" data-id="'+id+'" aria-label="Edit name inline for '+displayTitle+'" title="Edit name inline">✎ <span>Edit name</span></button>':'')+
  '<small>'+count+' items</small>'+
  (state.edit?'<details class="board-group-actions"><summary aria-label="Actions for '+displayTitle+
   '" title="Group actions">⋮</summary><div class="board-group-actions-list">'+
   '<button type="button" data-action="group-inline-edit" data-id="'+id+'">Edit name inline</button>'+
   '<button type="button" data-action="group-select-visible" data-id="'+id+'">Select visible records</button>'+
   (bulkReadyFor(state.board?.board)&&state.bulk02Access?.canManage?
    '<button type="button" data-action="group-delete-empty" data-id="'+id+'">Delete empty group</button>':
    managedDelete?'<button type="button" data-action="managed-group-delete-empty" data-id="'+id+'">Delete empty group (signed admin)</button>':
    (managedEmpty?'<button type="button" data-action="group-hide-empty" data-id="'+id+'">Remove empty group from view (reversible)</button>':
     '<button type="button" disabled title="This group is protected or contains records">Delete group — protected</button>'))+
   (managedEmpty&&!managedDelete?'<button type="button" disabled title="Permanent deletion requires separate production security approval">Permanent deletion — approval required</button>':'')+
   '</div></details>':'')+'</div>';
}
function row01AcceptancePanel(board){
 const pending=readRow01Pending(),fixture=isRow01Fixture(board);
 if(!fixture&&pending?.boardId!==board?.id)return '';
 const matching=!!pending&&pending.boardId===board?.id&&
  pending.actorId===state.context?.user_id&&
  pending.workspaceId===state.context?.workspace_id;
 const result=state.row01Result?.boardId===board?.id?state.row01Result:null;
 return '<section class="panel board-row01-qa" aria-label="ROW01 signed acceptance">'+
  '<strong>CP-BOARD-ROW01 — signed disposable-fixture acceptance</strong>'+
  '<p>Only a designated empty ROW01 QA board is eligible. No operational board records are used.</p>'+
  (matching?'<button type="button" class="secondary" data-action="row01-finalize"'+
   (state.row01Busy?' disabled':'')+'>Verify browser reload, audit and cleanup</button>'+
   '<p>Reload this browser tab before finalizing. Only the signed operator’s exact QA item can be removed.</p>':
   pending?'<p>Another signed context owns an unfinished acceptance journal. No writes are enabled.</p>':
   fixture&&state.edit?'<button type="button" class="secondary" data-action="row01-prepare"'+
    (state.row01Busy?' disabled':'')+'>Start controlled signed ROW01 acceptance</button>':
   '<p>Current signed editor permission is required.</p>')+
  (result?'<div role="status" aria-live="polite"><strong>'+e(result.status)+'</strong>: '+
    e(result.reason||'')+
    (result.checks||[]).map(c=>'<p>'+e(c.id)+': '+e(c.status)+'</p>').join('')+
    '<button type="button" class="secondary" data-action="row01-copy-report">Copy nonsecret result</button></div>':'')+
  '</section>';
}
function issuesPage(){
 if(state.loadingIssues)return '<div class="panel">'+empty('Loading issues','Checking permitted Issue records…')+'</div>';
 const rows=state.issues;
 const canEdit=state.edit;
 return `<div class="toolbar"><div class="search-wrap"><input id="search-issues" class="search-input" aria-label="Search issues" placeholder="Search issues…" /></div>
 ${canEdit?'<button class="primary" data-action="new-issue">＋ New issue</button> <button class="secondary" data-action="native-new-issue">＋ Native issue</button>':''}</div>
 ${rows.length?`<div class="issue-cards">${rows.map(row=>{const s=row.payload?.snapshot||{};
 const priority=Number(s.priority??0);return `<article class="issue-row" data-searchable="${e((s.title||'').toLowerCase())}">
 <div><h3>${e(s.title||'Untitled issue')}</h3><small>Revision ${e(row.revision)} · ${e(displayDate(row.updated_at))}</small></div>
 <span class="status ${statusClass(String(s.status||'').split(':').pop())}">${e(String(s.status||'Todo').split(':').pop())}</span>
 <span class="priority ${priority>=4?'urgent':priority>=3?'high':''}">◆ ${['None','Low','Medium','High','Urgent'][Math.max(0,Math.min(4,priority))]}</span>
 ${canEdit?`<div class="issues-actions"><button class="icon-button" data-action="edit-issue" data-id="${e(row.document_id)}">✎ Edit</button>
 <button class="icon-button danger" data-action="remove-issue" data-id="${e(row.document_id)}">Remove</button>
 <button class="icon-button" data-action="native-edit-issue" data-id="${e(row.document_id)}">Native edit</button>
 <button class="icon-button danger" data-action="native-remove-issue" data-id="${e(row.document_id)}">Native remove</button></div>`:''}</article>`}).join('')}</div>`:
 `<div class="panel">${empty('No issues yet','No active APSYNTRA Issues were found for this board.',canEdit?'<button class="primary" data-action="new-issue">＋ Create first issue</button>':'')}</div>`}`;
}
function boardPage(){
 if(state.loading)return renderBoardLoading({
  hidden:document.hidden,
  lowPower:navigator.connection?.saveData===true||
   (Number.isFinite(navigator.deviceMemory)&&navigator.deviceMemory<=4)
 });
 if(!state.board)return renderBoardLoadingError(state.error);
 const b=state.board.board;
 const items=Array.isArray(state.board.items)?state.board.items:[];
 itemSelection.bind([state.context?.user_id,state.context?.workspace_id,state.boardId].join('|'),items.filter(i=>!i.archived_at).map(i=>i.id));
 const groups=Array.isArray(state.board.groups)?state.board.groups:[];
 // Partition once for every board type; preserve source order and ungrouped items.
 const groupedItems=new Map(groups.map(group=>[group.id,[]]));
 const ungroupedItems=[];
 if(state.tab==='items')for(const item of items){
  const bucket=groupedItems.get(item.group_id);
  if(bucket)bucket.push(item);
  else ungroupedItems.push(item);
 }
 const hiddenIds=isManagedTimeTrackerBoard(b)?readHiddenEmptyGroups(state.context,b.id):new Set();
 // The exact, verified empty TimeTracker secondary group is omitted for all
 // signed viewers, without any DB mutation or browser-local preference.
 // Populated, renamed or archived-item-bearing groups are never suppressed.
 const redundantGroups=groups.filter(g=>
  isRedundantEmptyTimeTrackerGroup(b,g,groups,items));
 const hiddenGroups=groups.filter(g=>!redundantGroups.includes(g)&&hiddenIds.has(g.id)&&
  canSafelyHideEmptyTimeTrackerGroup(b,g,groups,items));
 const shownGroups=groups.filter(g=>
  !hiddenGroups.includes(g)&&!redundantGroups.includes(g));
 const moduleKey=moduleByBoardName(b.name)?.key;
 const minimal=isItemOnlyBoard(state.board,state.boardUi);
 const primaryTitle=state.boardUi?.status==='VERIFIED_READ'?state.boardUi.primaryLabel:'Record';
 const columnLabels=state.boardUi?.status==='VERIFIED_READ'?state.boardUi.columnLabels:{};
 const allowCustom=BOARD_STRUCTURE_ADMIN_ENABLED&&state.boardUi?.status==='VERIFIED_READ';
 const tabSpecs=[
  {key:'items',href:'#/boards/'+b.id+(moduleKey==='fueltrans'?'/items':moduleKey==='timetracker'?'/items':''),
    label:'▤ Board items <span class="csp-u060">('+items.length+')</span>'},
  {key:'issues',href:'#/boards/'+b.id+'/issues',
    label:'◇ APSYNTRA Issues <span class="csp-u060">('+state.issues.length+')</span>'},
  ...(isFuelTrackV3ApplicationBoard(b)?[{key:'fueltrack',href:fuelTrackHref('dashboard'),label:'◈ FuelTrack+ v3 app'}]:[]),
  ...(moduleKey==='tradelink'?[{key:'tradelink',href:'#/boards/'+b.id+'/tradelink/drafts/quotation',
    label:'▤ TradeLink application'}]:[]),
  ...(moduleKey==='fueltrans'?[{key:'fueltrans',href:'#/boards/'+b.id+'/fueltrans',label:'FuelTrans application'}]:[]),
  ...(moduleKey==='frt'?[{key:'finance',href:'#/boards/'+b.id+'/finance',
    label:'▣ FRT finance (read-only)'}]:[]),
  ...(moduleKey==='timetracker'?[{key:'attendance',href:'#/boards/'+b.id+'/attendance',
    label:'◷ TimeTracker attendance'}]:[])
 ];
 const columns=moduleKey?boardGridColumns(state.board,{primaryTitle,columnLabels,allowCustom}):
  genericBoardColumns(state.board,{primaryTitle,columnLabels,minimal,
   hiddenVirtual:state.boardUi?.hiddenVirtual});
 const layout=loadBoardLayout(state.context,b.id,tabSpecs.map(t=>t.key),columns.map(c=>c.key));
 if(minimal)layout.columns=itemOnlyColumnKeys(columns,state.boardUi);
 const tabLookup=new Map(tabSpecs.map(t=>[t.key,t]));
 const tabOrder=applyBoardViewSettings(moduleKey==='timetracker'?tabSpecs:
  layout.tabs.map(k=>tabLookup.get(k)).filter(Boolean),state.boardUi);
 const canReorderTabs=moduleKey!=='timetracker'||(state.boardManage&&
  state.boardUi?.status==='VERIFIED_READ'&&!state.tabMoveBusy);
 // One render-local value index for all application-managed board groups.
 const preparedGrid=moduleKey&&state.tab==='items'?
  prepareBoardGrid(state.board,{primaryTitle,columnLabels,allowCustom}):null;

 return `<div class="page-head"><div><span class="label-top">Workspace / Boards / ${e(b.name)}</span>
 <h1>${e(b.name)}</h1><p>${e(publicBoardDescription(b))}</p></div>
 <div class="head-actions"><button class="secondary" data-action="board-activity">◷ Activity</button><details class="board-actions-menu"><summary>Board options</summary><div class="board-actions-popover"><button type="button" data-action="board-members">Members &amp; access</button><button type="button" data-action="board-structure">Advanced board settings &amp; views</button><button type="button" data-action="board-layout-reset">Reset board layout</button><button type="button" data-action="refresh-board">Refresh board</button></div></details><button class="secondary" data-action="refresh-board">↻ Refresh</button>
 ${state.edit&&state.tab==='items'&&canManuallyEditBoard(b,true)?'<button class="primary" data-action="new-item">＋ Add item</button>':''}
 </div></div>
 <div class="tabs board-draggable-tabs" role="tablist" aria-label="Board views">
 ${tabOrder.map(t=>'<div class="board-tab-slot" data-board-tab-slot="'+e(t.key)+'">'+
  '<a role="tab" draggable="'+(canReorderTabs?'true':'false')+'" data-board-tab="'+e(t.key)+'" aria-selected="'+(state.tab===t.key)+
  '" class="tab '+(state.tab===t.key?'active':'')+'" href="'+e(t.href)+'">'+t.label+'</a>'+
  (canReorderTabs?'<button type="button" class="board-tab-reorder" data-action="board-tab-move" data-key="'+e(t.key)+
  '" data-direction="-1" aria-label="Move '+e(t.key)+' tab left" title="Move tab left">‹</button>':'')+
  (canReorderTabs?'<button type="button" class="board-tab-reorder" data-action="board-tab-move" data-key="'+e(t.key)+
  '" data-direction="1" aria-label="Move '+e(t.key)+' tab right" title="Move tab right">›</button>':'')+'</div>').join('')}</div>

 ${state.tab==='fueltrack'&&isFuelTrackV3ApplicationBoard(b)?renderFuelTrackV3Application({detail:state.board,section:state.fuelTrackSection,actorName:name(),analyticsRenderer:renderFuelTrackAnalytics,analyticsView:state.fuelTrackAnalyticsView,analyticsRange:state.fuelTrackAnalyticsRange,analyticsMetric:state.fuelTrackAnalyticsMetric,requestsRenderer:renderFuelTrackRequests,requestsFilters:state.fuelTrackRequestFilters}):state.tab==='fueltrans'&&moduleKey==='fueltrans'?'<div id="fueltrans-native-host"></div>':state.tab==='finance'&&moduleByBoardName(b.name)?.key==='frt'?renderFRTFinanceReadOnly({result:state.frtFinance,busy:state.frtFinanceBusy,detailResult:state.frtFinanceDetail,detailBusy:state.frtFinanceDetailBusy,selectedRequestId:state.frtFinanceDetailId}):state.tab==='attendance'&&moduleByBoardName(b.name)?.key==='timetracker'?renderTimeTrackerNative({result:state.ttAttendance,busy:state.ttBusy,clockPending:!!state.ttClockPending,error:state.ttError,success:state.ttSuccess,period:state.ttReportPeriod,view:state.ttView,overviewFilters:state.ttOverviewFilters,logFilters:state.ttLogFilters,reportFilters:state.ttReportFilters,calendarMonth:state.ttCalendarMonth,calendarSelectedDay:state.ttCalendarSelectedDay,otFilters:state.ttOtFilters,otModalOpen:state.ttOtModalOpen,otDraft:state.ttOtDraft,hoursWeekOffset:state.ttHoursWeekOffset,hoursMonth:state.ttHoursMonth,hoursSelectedDay:state.ttHoursSelectedDay,teamEligible:state.roleVerified===true,teamDirectory:state.ttTeam,teamFilters:state.ttTeamFilters,teamBusy:state.ttTeamBusy,teamError:state.ttTeamError,monitorResult:state.ttMonitor,monitorHistory:state.ttMonitorHistory,monitorBusy:state.ttMonitorBusy,monitorError:state.ttMonitorError,logGpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',logGpsData:state.ttLogGpsData,logGpsBusy:state.ttLogGpsBusy,logGpsError:state.ttLogGpsError,logGpsErrorRecordId:state.ttLogGpsErrorRecordId,logExpandedRecordIds:state.ttLogExpandedIds,mapEnabled:auth.isSignedIn&&state.ttAttendance?.status==='VERIFIED_READ'&&(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'),mapTheme:state.ttGpsFilters.theme==='dark'?'dark':'map',
 gpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',gpsData:state.ttGpsData,gpsView:state.ttGpsView,gpsFilters:state.ttGpsFilters,gpsBusy:state.ttGpsBusy,gpsError:state.ttGpsError}):state.tab==='tradelink'&&moduleKey==='tradelink'?renderTradeLinkApplication({detail:state.board,section:state.tradeLinkSection,workspaceId:state.context?.workspace_id,activity:{events:state.tradeLinkActivity,busy:state.tradeLinkActivityBusy,error:state.tradeLinkActivityError},draftView:state.tradeLinkDraft,canManage:state.boardManage,actorName:name(),actorEmail:state.context?.profile?.email||''}):state.tab==='issues'?issuesPage():`
 <div class="toolbar board-customize-toolbar"><div class="search-wrap"><input id="search-board-items" class="search-input" aria-label="Search items" placeholder="Filter items…" /></div>
 ${boardColumnMenu(columns,layout)}${state.boardManage&&canManuallyEditBoard(b,true)?'<button type="button" class="secondary" data-action="board-add-column">＋ Add column</button>':''}
 ${moduleKey==='tradelink'&&state.boardManage&&!tradeLinkSetupStatus(state.board).ready?'<button type="button" class="secondary" data-action="tradelink-configure" '+(state.tradeLinkSetupBusy?'disabled':'')+'>'+(state.tradeLinkSetupBusy?'Configuring TradeLink…':'Configure TradeLink columns')+'</button>':''}
  ${moduleKey==='timetracker'&&TT_BOARD_GPS_PROJECTION_ENABLED&&(state.roleVerified===true||state.ttBoardGpsEligible===true)?'<button type="button" class="secondary" data-action="tt-board-gps">Restricted attendance GPS</button>':''}
 ${state.edit&&canManuallyEditBoard(b,true)?'<button type="button" class="secondary" data-action="board-import">⇧ Import CSV/XLSX</button>':''}
 ${state.edit?'<button class="secondary" data-action="new-group">＋ Add group</button>':''}
  ${state.edit&&canBulkEditBoard(b)?'<button type="button" class="secondary" data-action="bulk02-verify" '+(state.bulk02Busy?'disabled':'')+'>'+(
   state.bulk02Busy?'Checking signed permissions…':bulkReadyFor(b)?'✓ Bulk access verified':'Verify signed bulk access')+'</button>':''}
  ${hiddenGroups.length?'<button type="button" class="secondary" data-action="group-show-hidden">Show '+hiddenGroups.length+' hidden empty group'+(hiddenGroups.length===1?'':'s')+' (this browser)</button>':''}</div>
  ${moduleKey==='tradelink'?'<p class="muted" role="note">Files is reserved for a secured attachment workflow. Uploads are not enabled yet.</p>':''}
  ${state.bulk02Result&&state.bulk02Result.boardId===b.id?
   '<div class="board-bulk-probe-summary" role="status" aria-live="polite">Signed bulk authorization: '+e(state.bulk02Result.status)+
   ' — '+state.bulk02Result.checks.filter(x=>x.status==='PASS').length+' / '+state.bulk02Result.checks.length+
   ' checks. '+(state.bulk02Result.ready?'Mutations enabled for this verified board and session.':'No bulk writes enabled. Review account permissions or unavailable evidence.')+
    '<details class="board-bulk-probe-details"><summary>Signed check details</summary>'+
    state.bulk02Result.checks.map(x=>'<p><strong>'+e(x.id)+' — '+e(x.status)+':</strong> '+e(x.detail)+'</p>').join('')+
    '<p>Still pending: real authorized disposable-board writes, revoked/expired sessions and cross-workspace browser acceptance.</p></details>'+
    '<button type="button" class="secondary" data-action="bulk02-copy-report">Copy nonsecret check report</button></div>':''}
  ${row01AcceptancePanel(b)}
  <div class="board-bulk-toolbar" id="board-bulk-toolbar" role="region" aria-label="Selected board records" ${itemSelection.size?'':'hidden'}><strong id="board-selected-count">${itemSelection.size} selected</strong><button type="button" class="secondary" data-action="bulk-export">Export selected CSV</button><button type="button" class="secondary" data-action="bulk-clear">Clear selection</button>
 <button type="button" class="secondary" data-action="bulk-actions" ${canRequestBulk(b)||bulkReadyFor(b)?'':'disabled title="Bulk changes require an authorized ordinary board and 1–50 records"'}>Bulk actions…</button>
 <button type="button" class="secondary board-delete-one" data-action="delete-selected-item" ${itemSelection.size>0&&state.edit&&canManuallyEditBoard(b,true)?'':'disabled title="Select an editable ordinary-board item"'}>${itemSelection.size>1?'Delete one of '+itemSelection.size+'…':'Delete item'}</button>
 <span class="muted">${!canBulkEditBoard(b)?'Protected application records: selection and export only; domain-specific bulk writes require separate server authorization.':bulkReadyFor(b)?'Max 50 records per atomic batch.':'Bulk actions verify this signed session before changes; unsupported field edits and multi-delete are unavailable.'}</span></div>
 ${shownGroups.length?shownGroups.map(g=>`${groupHeading(g,groupedItems.get(g.id)?.length||0)}
 ${moduleKey==='timetracker'&&String(g.title||'').trim().toLowerCase()==='main group'?
  renderTimeTrackerMainGroup({groupId:g.id,groupItems:groupedItems.get(g.id)||[],
   boardColumns:state.board.columns||[],boardValues:state.board.values||[],
   projection:state.ttBoardAttendance,userId:state.context?.user_id,
   workspaceId:state.context?.workspace_id,boardId:b.id}):
  moduleByBoardName(b.name)?boardGrid(state.board,{groupId:g.id,groupItems:groupedItems.get(g.id)||[],layout,primaryTitle,columnLabels,allowCustom,prepared:preparedGrid,selection:{enabled:true,selected:itemSelection.ids},footer:renderGroupAddRow({groupId:g.id,domain:true}),summaries:{record:groupedItems.get(g.id).length+' records'}}):groupRows(groupedItems.get(g.id)||[],state.edit,layout,g.id,primaryTitle,state.board,columnLabels)}`).join(''):
 `<div class="panel">${empty('Your board is ready','Create a group to start adding and organizing items.',state.edit?'<button class="primary" data-action="new-group">＋ Add your first group</button>':'')}</div>`}
 ${ungroupedItems.length?`<div class="group-heading"><h3>Ungrouped</h3></div>${moduleByBoardName(b.name)?boardGrid({...state.board,items:ungroupedItems},{layout,primaryTitle,columnLabels,allowCustom,prepared:preparedGrid,selection:{enabled:true,selected:itemSelection.ids}}):groupRows(ungroupedItems,state.edit,layout,'ungrouped',primaryTitle,state.board,columnLabels)}`:''}`}`;
}
function settingsPage(){
 const p=state.context.profile;
 return `<div class="aps-settings"><section class="page-head settings-hero settings-entrance" aria-labelledby="settings-title"><div class="settings-hero-copy"><span class="label-top"><span class="settings-hero-dot" aria-hidden="true"></span>Workspace / Account</span><h1 id="settings-title">Account & security<span class="settings-heading-stop">.</span></h1><p>Your verified user identity and session preferences.</p></div><span class="settings-hero-status">${settingsIcon('shield')}<span>Verified workspace account</span></span><svg class="settings-hero-decoration" viewBox="0 0 420 200" fill="none" aria-hidden="true" focusable="false"><circle cx="355" cy="0" r="120" stroke="currentColor" stroke-opacity=".16"/><circle cx="355" cy="0" r="193" stroke="currentColor" stroke-opacity=".09"/><path d="M105 230C201 70 334 93 446 146" stroke="currentColor" stroke-opacity=".16"/></svg></section>
 <div class="settings-grid"><section class="panel settings-profile-panel settings-entrance" aria-labelledby="settings-profile-heading"><div class="panel-header settings-panel-header"><div class="settings-panel-title"><span aria-hidden="true">${settingsIcon('user')}</span><h3 id="settings-profile-heading">Profile information</h3></div><span class="settings-auth-provider">Supabase Auth</span></div>
 <div class="panel-body settings-panel-body"><div class="profile settings-profile-identity"><span class="avatar csp-u044 settings-profile-avatar" aria-hidden="true"><span data-avatar-initials>${e(initials(name()))}</span><img data-avatar-current alt="" hidden /></span>
 <div class="settings-profile-copy"><div class="name csp-u040" >${e(name())}</div><div class="role">${e(p.platform_role||'Member')}</div></div></div>
 ${avatarPreviewMarkup(initials(name()))}
 <section class="settings-profile-editor" aria-labelledby="settings-display-name-title">
  <div class="settings-profile-editor-head"><div><h4 id="settings-display-name-title">Display name</h4><p>Choose how your name appears throughout APSYNTRA CRM.</p></div>
   <button type="button" class="secondary settings-name-edit" data-action="profile-name-edit">Edit</button></div>
  <div class="settings-profile-name-current" data-profile-name-view><strong>${e(name())}</strong></div>
  <form id="settings-display-name-form" data-profile-name-form hidden>
   <label for="settings-display-name">Display name</label>
   <input id="settings-display-name" type="text" name="displayName" value="${e(p.display_name||'')}" minlength="2" maxlength="80" autocomplete="nickname" required aria-describedby="settings-display-name-help settings-display-name-status"/>
   <small id="settings-display-name-help">2–80 characters. This does not change your email, roles or workspace access.</small>
   <div class="settings-profile-editor-actions">
    <button type="button" class="secondary" data-action="profile-name-cancel">Cancel</button>
    <button type="submit" class="primary">Save display name</button>
   </div>
   <p id="settings-display-name-status" data-profile-name-status role="status" aria-live="polite"></p>
  </form>
 </section>
 <div class="settings-profile-fields">
 <div class="settings-detail settings-detail-wide"><label>Work email</label><strong>${e(p.email||state.user?.email||'Not available')}</strong></div>
 <div class="settings-detail settings-detail-status"><label>Account status</label><strong><span class="status done">${e(p.status)}</span></strong></div>
 <div class="settings-detail"><label>Workspace</label><strong>${e(workspaceName())}</strong></div>
 <div class="settings-detail settings-detail-wide settings-detail-identifier"><label>User identifier</label><strong class="csp-u019" >${e(state.context.user_id)}</strong></div></div><form id="settings-change-password-form" autocomplete="off" class="settings-password-form" aria-labelledby="settings-password-heading">
 <div class="settings-password-heading"><span class="settings-password-icon" aria-hidden="true">${settingsIcon('lock')}</span><div><h4 id="settings-password-heading">Change password</h4><p>Update the password used to sign in to your account.</p></div></div>
 <div class="settings-password-fields">
 <div class="settings-password-field"><label for="settings-new-password">New password</label>
 <input id="settings-new-password" name="password" type="password" autocomplete="new-password" minlength="12" maxlength="72" placeholder="Enter new password" required /></div>
 <div class="settings-password-field"><label for="settings-confirm-password">Confirm password</label>
 <input id="settings-confirm-password" name="confirmation" type="password" autocomplete="new-password" minlength="12" maxlength="72" placeholder="Re-enter new password" required /></div>
 </div>
 <p class="settings-password-hint">${settingsIcon('shield')}<span>Use 12–72 characters. Your password is sent securely to Supabase Auth.</span></p>
 <div class="settings-password-footer"><button type="submit" class="primary settings-password-submit">${settingsIcon('check')}<span>Update password</span></button><p class="settings-password-status" role="status" aria-live="polite" data-password-status></p></div>
 </form><p class="settings-profile-footnote">${settingsIcon('shield')}<span>Identity details are provided by your signed workspace session.</span></p></div></section>
 ${state.roleVerified===true?`<section class="panel settings-session-panel settings-entrance" aria-labelledby="settings-session-heading"><div class="panel-header settings-panel-header"><div class="settings-panel-title"><span aria-hidden="true">${settingsIcon('lock')}</span><h3 id="settings-session-heading">Session security</h3></div><span class="settings-session-indicator"><span class="online-dot"></span>Authenticated</span></div>
 <div class="panel-body settings-panel-body"><div class="settings-session-intro"><span class="settings-session-intro-badge" aria-hidden="true">${settingsIcon('shield')}</span><p class="muted csp-u032" >Your login uses the existing Supabase Auth project. Your session refreshes automatically and is kept in this browser tab.</p></div>
 <div class="note settings-session-callout">${settingsIcon('shield')}<span>The application never requires a database password or privileged backend key. Permissions are enforced by the existing workspace RPCs and row-level security.</span></div>
 <div class="settings-detail settings-auth-detail"><label>Authentication</label><strong>Signed in and verified</strong></div>
 <div class="csp-u015 settings-session-actions" >
 <button class="secondary settings-token-button" data-action="copy-token">${settingsIcon('copy')}<span>Copy short-lived access token</span></button>
 <button class="secondary settings-signout-button" data-action="logout">${settingsIcon('logout')}<span>Sign out</span></button></div>
 <div class="note security-note settings-token-warning">${settingsIcon('lock')}<div><b>Access token:</b> Copy only when necessary for local acceptance testing. Anyone holding it may act as your account until it expires. Never share it in chat or commit it.</div></div>
 <div class="csp-u047 settings-verify-block settings-persistence-link" ><a class="secondary" href="#/acceptance">${settingsIcon('check')}<span>GitHub Pages persistence acceptance</span></a></div>
 <div class="csp-u006 settings-verify-block" >
  <h3 class="csp-u039">${settingsIcon('activity')}<span>Board actions &amp; TimeTracker GPS — live signed acceptance</span></h3>
  <p class="muted csp-u031">Runs only read-only checks using your current authenticated browser session. It will not edit boards, clock attendance, revoke sessions, or display employee GPS coordinates.</p>
  <button class="secondary" data-action="board-tt-signed-verify" ${state.boardTtSignedBusy?'disabled':''}>${settingsIcon('shield')}<span>${state.boardTtSignedBusy?'Verifying signed access…':'Verify board and GPS access'}</span></button>
  ${state.boardTtSignedResult?`<div class="csp-u048">
   <div class="csp-u028">Signed integration: ${e(state.boardTtSignedResult.status)} — ${state.boardTtSignedResult.checks.filter(c=>c.status==='PASS').length} / ${state.boardTtSignedResult.checks.length} checks passed</div>
   ${state.boardTtSignedResult.checks.map(c=>`<div class="csp-u008">
    <div class="csp-u017"><span class="${c.status==='PASS'?'csp-check-pass':c.status==='FAIL'?'csp-check-fail':'csp-check-pending'}" aria-hidden="true">${c.status==='PASS'?'✓':c.status==='FAIL'?'✕':'○'}</span><strong>${e(c.id)}</strong></div>
    <div class="csp-u058">${e(c.detail)}</div></div>`).join('')}
   <p class="muted csp-u026">Read-only session checks do not certify Clock-In/Out persistence, role transitions or historical GPS reconciliation.</p></div>`:''}
 </div>
 <div class="csp-u006 settings-verify-block" >
  <h3 class="csp-u039" >${settingsIcon('lock')}<span>Signed backend verification</span></h3>
  <p class="muted csp-u031" >Run read-only checks against the actual authenticated Supabase session, central board permissions, and Issue view. No token copying or database write required.</p>
  <button class="primary" data-action="verify-backend" ${state.acceptanceBusy?'disabled':''}>${settingsIcon('check')}<span>${state.acceptanceBusy?'Verifying…':'Verify backend connection'}</span></button>
  ${state.acceptance ? `<div class="csp-u048" ><div class="csp-u028" >
  ${summarizeAcceptance(state.acceptance).passed} of ${summarizeAcceptance(state.acceptance).total} read-only checks passed</div>
  ${state.acceptance.map(check=>`<div class="csp-u008" >
  <div class="csp-u017" ><span aria-hidden="true" class="${check.status==='pass'?'csp-check-pass':check.status==='fail'?'csp-check-fail':'csp-check-pending'}">${check.status==='pass'?'✓':check.status==='fail'?'✕':'○'}</span><strong>${e(check.title)}</strong></div>
  <div class="csp-u058" >${e(check.detail)}</div></div>`).join('')}
  <p class="muted csp-u026" >These checks do not certify the local 5173 host or native transaction writes.</p></div>` : ''}
 </div>
 </div></section>`:''}</div></div>`;
}
function preserveTimeTrackerLogExpansion(){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='log'||
    state.ttAttendance?.status!=='VERIFIED_READ')return;
 const section=root.querySelector('.tt-log');
 if(!section)return;
 const allowed=new Set((state.ttAttendance.log?.rows||state.ttAttendance.records||[]).map(r=>r.id));
 state.ttLogExpandedIds=[...section.querySelectorAll('.tt-log-detail[open][data-record-id]')]
  .map(el=>el.dataset.recordId).filter(id=>allowed.has(id)).slice(0,30);
}
function render(){
 if(!state.context){closeTradeLinkSavedDocumentOutput();renderLogin();return;}
 preserveTimeTrackerLogExpansion();
 captureTradeLinkTabMotion(root);
 if(state.view==='board')shell(boardPage());
 else if(state.view==='acceptance'&&state.roleVerified===true)shell(renderPagesAcceptance({qaBoard:state.boards.find(b=>b.name===QA_BOARD_NAME),result:state.pagesAcceptance,running:state.pagesBusy,nativeResult:state.nativeAcceptance,nativeRunning:state.nativeBusy}));
 else if(state.view==='foundation'&&state.roleVerified===true)shell(renderFoundation({
   rows:state.foundationRows,loading:state.foundationBusy,provisioning:state.provisionBusy,
   testing:state.foundationTesting,testResult:state.foundationTestResult,
   log:state.foundationLog,error:state.foundationError,
   canProvision:state.roleVerified===true&&state.context?.profile?.platform_role==='admin_general_manager'
 }));
 else if(state.view==='security')shell(renderSecurityAcceptance({context:state.context,report:state.securityResult,busy:state.securityBusy,progress:state.securityProgress,writeResult:state.securityWriteResult,writeBusy:state.securityWriteBusy,frtResult:state.frtSecurityResult,frtBusy:state.frtSecurityBusy,ci07Result:state.ci07Result,ci07Busy:state.ci07Busy,sec14Result:state.sec14Result,sec14Busy:state.sec14Busy,sec14DenialResult:state.sec14DenialResult,sec14DenialBusy:state.sec14DenialBusy,sec07Result:state.sec07Result,sec07Busy:state.sec07Busy,sec09Result:state.sec09Result,sec09Busy:state.sec09Busy,sec10Result:state.sec10Result,sec10Busy:state.sec10Busy,sec10Boards:state.boards,sec10IsBootstrap:state.roleVerified===true,effectiveAccessResult:state.effectiveAccessResult,effectiveAccessBusy:state.effectiveAccessBusy,sec10BoardsError:state.securityBoardsError})+renderTradeLinkStageAAcceptance({busy:state.tl03ReadBusy,report:state.tl03ReadResult})+renderTradeLinkSessionRevocation({armed:state.tl03RevokeArmed,report:state.tl03RevokedReport})+renderWs01B2SignedAcceptance({busy:state.ws01B2Busy,report:state.ws01B2Result})+renderWs02dB3SignedPreflight({busy:state.ws02dB3Busy,report:state.ws02dB3Report})+renderWs02dB3DeployedHttpsAcceptance({busy:state.ws02dB3HttpsBusy,result:state.ws02dB3HttpsReport})+renderWs02dB3ForeignRlsDenial({busy:state.ws02dB3RlsBusy,result:state.ws02dB3RlsReport,hasFixture:hasWs02dB3ForeignRlsFixture()})+renderWs02dB3LocalRevocation({armed:state.ws02dB3RevokeArmed,report:state.ws02dB3RevokedReport})+renderB2SignedQaFixture({busy:state.b2QaBusy,result:state.b2QaReport})+renderB4SignedRecoveryPreflight({busy:state.b4QaBusy,report:state.b4QaReport})+renderPhaseBSignedDenial({busy:state.phaseBDenialBusy,report:state.phaseBDenialReport}));
 else if(state.view==='role-configuration')shell(renderRoleConfiguration({verified:state.roleVerified,loading:state.roleBusy,data:state.roleData,tab:state.roleTab,error:state.roleError}));
 else if(state.view==='user-role-management')shell(renderUserRoleManagement({verified:state.roleVerified,data:state.userRoleData,selectedUserId:state.userRoleSelected,busy:state.userRoleBusy,error:state.userRoleError}));
 else if(state.view==='invitation')shell(renderInvitationAcceptance({
  pending:pendingInvitation,enabled:WS02D_ACCEPTANCE_ENABLED,
  busy:invitationAcceptanceBusy,status:invitationAcceptanceStatus
 }));
 else if(state.view==='boards')shell(boardsPage());
 else if(state.view==='settings')shell(settingsPage());
 else shell(overview());
 mountTradeLinkTabMotion(root);
 if(state.view==='settings')mountAvatarPreview(root,{
  client:profileAvatarClient,
  userId:state.context.user_id,
  currentPath:state.context.profile?.avatar_path||null,
  onBusyChange:busy=>{state.avatarMutationBusy=busy;},
  onSaved:async({path,updatedAt,cleanupPending})=>{
   state.context.profile.avatar_path=path;
   if(updatedAt)state.context.profile.updated_at=updatedAt;
   render();
   if(path){
    const hydration=await avatarHydrationPromise;
    if(hydration.attempted===0||hydration.failed>0||hydration.loaded===0){
     toast('Profile picture saved, but the image could not be displayed. Retry loading your profile.',true);
     return;
    }
   }
   toast(cleanupPending?
    'Profile picture saved, but the previous image could not be deleted.':
    path?'Profile picture saved.':'Profile picture removed.');
  }
 });
 else stopAvatarPreview();
 syncFuelTrans({container:state.view==='board'&&state.tab==='fueltrans'?root.querySelector('#fueltrans-native-host'):null,auth,api:db,boardId:state.boardId,workspaceId:state.context?.workspace_id,userId:state.context?.user_id,route:location.hash.split('/').slice(4).join('/')||'dashboard'});
 if(state.view==='board'&&state.tab==='items')syncBoardSelectionUi();
 if(state.context&&auth.isSignedIn)platformSync.start({
  userId:state.context.user_id,workspaceId:state.context.workspace_id,
  priorityBoardId:state.view==='board'?state.boardId:null,
  boardIds:state.boards.map(board=>board.id)
 });
}
function findBoardCard(id){
 return [...state.boards,...state.archived,...state.trashed].find(b=>b.id===id)||null;
}
async function refreshBoardCardLists(){
 await refreshWorkspace();
 const [archived,trashed]=await Promise.all([db.boards('archived'),db.boards('trashed')]);
 state.archived=archived;state.trashed=trashed;
}
function closeBoardCardMenus(except=null){
 for(const menu of root.querySelectorAll('.board-card-actions[open]')){
  if(menu!==except)menu.open=false;
 }
}
async function authorizeBoardCardAction(id){
 if(!BOARD_CARD_LIFECYCLE_ENABLED||state.boardLifecycleBusy)
  throw new ApiError('Board actions are unavailable.');
 const board=findBoardCard(id);
 if(!board||isProtectedBoard(board))
  throw new ApiError('Board is protected or no longer available.',403);
 if(!(await db.allowed(id,'manage')))
  throw new ApiError('Board management permission required.',403);
 return board;
}
function syncBoardSelectionUi(){
 if(state.view!=='board'||state.tab!=='items')return;
 for(const input of root.querySelectorAll('[data-board-select-item]')){
  const selected=itemSelection.has(input.dataset.boardSelectItem);
  input.checked=selected;input.closest('tr')?.classList.toggle('board-row-selected',selected);
 }
 for(const checkbox of root.querySelectorAll('[data-board-select-all]')){
  const rows=[...root.querySelectorAll('table[data-group-id="'+checkbox.dataset.boardSelectAll+'"] [data-board-select-item]')]
   .filter(el=>!el.closest('tr')?.hidden);
  checkbox.checked=rows.length>0&&rows.every(el=>itemSelection.has(el.dataset.boardSelectItem));
  checkbox.indeterminate=rows.some(el=>itemSelection.has(el.dataset.boardSelectItem))&&!checkbox.checked;
 }
 const toolbar=root.querySelector('#board-bulk-toolbar');if(toolbar)toolbar.hidden=itemSelection.size===0;
 const count=root.querySelector('#board-selected-count');if(count)count.textContent=itemSelection.size+' selected';
 for(const name of ['bulk-status','bulk-archive']){
  const control=root.querySelector('[data-action="'+name+'"]');
  if(control)control.disabled=!canRequestBulk(state.board?.board);
 }
 const del=root.querySelector('[data-action="delete-selected-item"]');
 if(del){
  del.disabled=itemSelection.size===0||!state.edit||
   !canManuallyEditBoard(state.board?.board,true);
  del.textContent=itemSelection.size>1?
   'Delete one of '+itemSelection.size+'…':'Delete item';
  del.title=itemSelection.size>1?
   'Choose one of '+itemSelection.size+' selected items to permanently delete':
   'Delete the selected item after confirmation';
 }
}
async function applySelectedBulk(action,status=null){
 if(!bulkReadyFor(state.board?.board)||!activeBoardLayout())
  throw new ApiError('Atomic bulk mutation is not yet authorized for this board.',403);
 const ids=[...itemSelection.ids],board=state.board.board;
 const selected=state.board.items?.filter(item=>ids.includes(item.id))||[];
 if(!ids.length||ids.length>50||selected.length!==ids.length)
  throw new ApiError('Select between 1 and 50 currently accessible board items.',400);
 let receipt;
 try{
  receipt=await boardBulkClient.apply(board,action,selected,{status});
 }catch(error){
  if(error?.bulkOutcomeUncertain===true){
   clearBulkActivation();
   itemSelection.clear();
   try{await loadBoard(board.id,'items');}catch{/* Preserve the uncertainty outcome. */}
  }
  throw error;
 }
 itemSelection.clear();await loadBoard(board.id,'items');
 toast(receipt.applied+' board records changed atomically.');
 return receipt;
}
function preserveInlineScroll(){
 const top=window.scrollY,positions=[...root.querySelectorAll('.board-group-scroll')].map(node=>
  ({id:node.querySelector('table[data-group-id]')?.dataset.groupId,left:node.scrollLeft}));
 render();
 for(const pos of positions){
  const table=[...root.querySelectorAll('table[data-group-id]')]
   .find(x=>x.dataset.groupId===pos.id);
  if(table?.parentElement)table.parentElement.scrollLeft=pos.left;
 }
 window.scrollTo(0,top);
}
async function verifyOrdinaryItemWrite(boardId,groupId=null){
 const actor=await auth.getVerifiedUser(),ctx=await db.context();
 const fresh=await db.board(boardId);
 if(!actor?.id||actor.id!==state.context?.user_id||ctx.user_id!==actor.id||
  ctx.workspace_id!==state.context?.workspace_id||
  fresh.board?.workspace_id!==ctx.workspace_id||state.boardId!==boardId||
  state.tab!=='items'||!canManuallyEditBoard(fresh.board,state.edit)||
  !await db.allowed(boardId,'edit'))
  throw new ApiError('Verified signed board editing is required.',403);
 if(groupId&&!fresh.groups?.some(g=>g.id===groupId))
  throw new ApiError('This group is no longer available.',409);
 return fresh;
}
async function addBoardRowInline(form){
 if(state.inlineAddBusy||!form.isConnected||!activeBoardLayout())return;
 const boardId=state.boardId,groupId=form.dataset.inlineAddRow,
  title=String(new FormData(form).get('title')||'').trim();
 if(!validUuid(groupId)||title.length<1||title.length>240)
  throw new ApiError('Item title must contain 1–240 characters.',400);
 state.inlineAddBusy=true;
 const button=form.querySelector('button[type=submit]');
 if(button){button.disabled=true;button.textContent='Saving…';}
 try{
  await verifyOrdinaryItemWrite(boardId,groupId);
  const receipt=await db.addItem(boardId,groupId,title);
  if(!validUuid(receipt))
   throw new ApiError('The item receipt is uncertain. Refresh before retrying.');
  if(state.boardId===boardId){
   await loadBoard(boardId,'items');
   root.querySelector('[data-inline-add-row="'+groupId+'"] input')?.focus();
   toast('Item added.');
  }
 }finally{
  state.inlineAddBusy=false;
  if(button?.isConnected){button.disabled=false;button.textContent='Add item';}
 }
}
async function startBoardInlineEdit(itemId,key){
 if(!validUuid(itemId)||!activeBoardLayout()||
  !canManuallyEditBoard(state.board?.board,state.edit))return;
 const boardId=state.boardId,item=state.board.items?.find(x=>x.id===itemId);
 const col=cellColumn(state.board,key);
 if(!item||item.archived_at||!col)return;
 if(col.virtual&&!await ensureSignedBulkReady(state.board.board))return;
 // Opening a select is a local, nonmutating UI action. Keep the same signed
 // preflight for normal fields, but open a physical status picker synchronously
 // during its user gesture; showPicker requires transient browser activation.
 if(col.data_type!=='status'||col.virtual)await verifyOrdinaryItemWrite(boardId);
 if(state.boardId!==boardId)return;
 state.inlineCell={boardId,itemId,key,expected:expectedCellValue(state.board,item,key)};
 preserveInlineScroll();
 const editor=root.querySelector('[data-inline-cell-form] input,[data-inline-cell-form] select,[data-inline-cell-form] textarea');
 editor?.focus();
 if(col.data_type==='status'&&editor?.tagName==='SELECT'){
  try{editor.showPicker?.();}catch{/* Native picker may require a fresh gesture; focus remains usable. */}
 }
 if(col.data_type==='status'&&!col.virtual){
  try{await verifyOrdinaryItemWrite(boardId);}
  catch(error){
   if(state.inlineCell?.boardId===boardId&&state.inlineCell?.itemId===itemId){
    state.inlineCell=null;preserveInlineScroll();
   }
   throw error;
  }
 }
}
async function saveBoardInlineCell(form){
 const stateCell=state.inlineCell,boardId=state.boardId;
 if(!stateCell||state.inlineCellBusy||!activeBoardLayout()||
  stateCell.boardId!==boardId||form.dataset.inlineCellForm!==stateCell.itemId||
  form.dataset.columnKey!==stateCell.key)return;
 const col=cellColumn(state.board,stateCell.key),value=parseCellForm(col,new FormData(form));
 if(JSON.stringify(value)===JSON.stringify(stateCell.expected)){
  state.inlineCell=null;preserveInlineScroll();return;
 }
 state.inlineCellBusy=true;
 const button=form.querySelector('button[type=submit]');
 if(button){button.disabled=true;button.textContent='Saving…';}
 try{
  const fresh=await verifyOrdinaryItemWrite(boardId);
  const item=fresh.items?.find(x=>x.id===stateCell.itemId),
   column=cellColumn(fresh,stateCell.key);
  if(!item||item.archived_at||!column||column.id!==col.id||
   column.data_type!==col.data_type||
   JSON.stringify(expectedCellValue(fresh,item,stateCell.key))!==JSON.stringify(stateCell.expected))
   throw new ApiError('This cell changed. Reload it before saving.',409);
  if(col.virtual){
   if(!bulkReadyFor(fresh.board))throw new ApiError('Verify signed bulk access before editing status.',403);
   await boardBulkClient.apply(fresh.board,'status',[item],{status:value});
  }else await db.setBoardCellCas(item.id,col.id,value,stateCell.expected);
  state.inlineCell=null;
  if(state.boardId===boardId){await loadBoard(boardId,'items');toast('Cell saved.');}
 }finally{
  state.inlineCellBusy=false;
  if(button?.isConnected){button.disabled=false;button.textContent='Save';}
 }
}
async function saveGroupInline(form){
 if(state.groupEditBusy||state.groupEditId!==form.dataset.groupInlineForm||
    !activeBoardLayout()||!state.edit)throw new ApiError('Authorized group edit required.',403);
 const id=state.groupEditId,group=state.board.groups?.find(g=>g.id===id);
 const title=String(new FormData(form).get('title')||'').trim();
 if(!group||title.length<1||title.length>120)throw new ApiError('Group name must contain 1–120 characters.');
 if(title===group.title){state.groupEditId=null;render();return;}
 state.groupEditBusy=true;
 const boardId=state.boardId,identity=state.context?.user_id,workspace=state.context?.workspace_id;
 try{
  const verified=await auth.getVerifiedUser(),fresh=await db.board(boardId);
  const original=fresh.groups?.find(g=>g.id===id);
  if(verified?.id!==identity||!fresh.board||fresh.board.workspace_id!==workspace||
    !original||original.updated_at!==group.updated_at||original.title!==group.title)
   throw new ApiError('Group changed since opening. Refresh before editing.',409);
  if(!await db.allowed(boardId,'edit'))throw new ApiError('Group editing is not permitted.',403);
  // Use the signed, revision-protected group writer for every board type.
  // The older updateGroup RPC is not a compare-and-swap operation.
  await db.updateGroupCas(boardId,original,title);
  if(state.boardId!==boardId||state.context?.user_id!==identity||
    state.context?.workspace_id!==workspace)return;
  const confirmed=await db.board(boardId);
  const saved=confirmed.groups?.find(g=>g.id===id);
  if(saved?.title!==title)throw new ApiError(
   'The group rename could not be verified. Reload this board before trying again.',409);
  state.groupEditId=null;await loadBoard(boardId,'items');toast('Group renamed.');
 }finally{state.groupEditBusy=false;}
}

/** Status is patched in-place; a heartbeat never triggers a page render. */
function updatePlatformSyncIndicator(status){
 const element=root.querySelector('.aps-sync');
 if(!element||!status)return;
 const labels={connecting:'Connecting',synchronized:status.transport==='realtime'?'Live synced':'Checked',
  synchronizing:'Syncing',reconnecting:'Reconnecting',offline:'Offline',error:'Sync issue'};
 element.dataset.syncState=status.phase;
 element.querySelector('.aps-sync-caption').textContent=labels[status.phase]||'Checking';
 const time=status.lastSyncAt?new Intl.DateTimeFormat('en-PH',{
  hour:'numeric',minute:'2-digit',second:'2-digit',timeZone:'Asia/Manila'
 }).format(status.lastSyncAt):'Not yet verified';
 const label=labels[status.phase]+' · '+(status.detail||'')+' · Last authoritative check: '+time;
 element.setAttribute('aria-label',label);
 element.title=label;
}
/** Protect active forms, selections, modals and local unsaved edits from background
 * DOM replacement; the controller will reconcile again on the next poll/focus.
 */
function platformSyncEditInProgress(){
 const focused=document.activeElement;
 return !!(modal?.isConnected||state.avatarMutationBusy||state.ttBusy||state.ttClockPending||
  state.inlineCell||state.inlineCellBusy||state.inlineAddBusy||
  state.groupEditId||state.groupEditBusy||state.userRoleBusy||state.roleBusy||
  state.ttOtModalOpen||state.loading||state.loadingIssues||
  focused?.closest?.('input,textarea,select,[contenteditable="true"]'));
}
/** Revoke stale rendered data immediately when the server invalidates identity. */
function invalidateSignedSyncView(){
 boardCacheChannel.stop();db.invalidateBoardCache();
 platformSync.stop();
 state.board=null;state.boardUi=null;state.boards=[];state.tradeLinkDraft=initialTradeLinkDraftView();
 state.ttAttendance=null;state.ttBoardAttendance=null;state.ttBoardGpsEligible=false;
 state.roleVerified=false;state.roleData=null;state.userRoleData=null;
 boardCacheChannel.stop();db.invalidateBoardCache();state.context=null;auth.clear();
 renderLogin('Your signed workspace access changed. Sign in again to continue.');
}
async function reconcilePlatformSync({boardIds=[],reason,userId,workspaceId}){
 if(!state.context||state.context.user_id!==userId||
  state.context.workspace_id!==workspaceId||!auth.isSignedIn)return false;
 const serial=routeSerial,view=state.view,tab=state.tab,boardId=state.boardId;
 const isCurrent=()=>auth.isSignedIn&&state.context?.user_id===userId&&
  state.context?.workspace_id===workspaceId&&serial===routeSerial&&
  state.view===view&&state.tab===tab&&state.boardId===boardId;
 const sensitive=reason!=='broadcast';
 const boardChanged=boardId&&boardIds.includes(boardId);
 // Board broadcasts carry identifiers only; the server remains authoritative.
 if(reason==='broadcast'&&!boardChanged&&view==='board')return true;
 let who,current;
 try{
  who=await auth.getVerifiedUser();
  current=await db.context();
 }catch(error){
  if(isCurrent()&&([401,403].includes(Number(error?.status))||
     error?.code==='42501'))invalidateSignedSyncView();
  throw error;
 }
 if(!isCurrent())return false;
 if(who?.id!==userId||current.user_id!==userId||
  current.workspace_id!==workspaceId){
  invalidateSignedSyncView();return false;
 }
 // Revocation takes precedence over preserving local editor state. This is
 // an authoritative signed board-view check, not a client-side visibility rule.
 if(view==='board'&&boardId&&await db.allowed(boardId,'view')!==true){
  if(isCurrent()){
   platformSync.stop();state.board=null;state.boardUi=null;
   state.ttAttendance=null;state.ttBoardAttendance=null;
   state.edit=false;state.boardManage=false;location.hash='#/boards';
  }
  return false;
 }
 // Authorization reads must occur even while an unsaved editor is open.
 if(platformSyncEditInProgress())return false;
 const roleChanged=current.profile?.platform_role!==state.context.profile?.platform_role;
 const boards=await db.boards('active');
 if(!isCurrent())return false;
 if(!boards.some(board=>board.id===boardId)&&view==='board'){
  platformSync.stop();state.board=null;location.hash='#/boards';return false;
 }
 if(platformSyncEditInProgress())return false;
 const changedBoards=JSON.stringify(state.boards)!==JSON.stringify(boards);
 state.boards=boards;state.context=mergeProfileAvatarContext(state.context,current);state.user=auth.session?.user;
 if(roleChanged||sensitive){
  const verified=await roleConfig.bootstrapVerified().catch(()=>false);
  if(!isCurrent())return false;
  if(verified!==state.roleVerified){
   state.roleVerified=verified;state.roleData=null;state.userRoleData=null;
   if(!verified&&['role-configuration','user-role-management','foundation','acceptance'].includes(view)){
    platformSync.stop();location.hash='#/overview';return false;
   }
  }
 }
 if(view==='board'&&boardId){
  let detail,edit,manage,boardUi;
  try{
   [detail,edit,manage,boardUi]=await Promise.all([
    db.board(boardId),db.allowed(boardId,'edit'),db.allowed(boardId,'manage'),
    boardStructureClient.read(boardId)
   ]);
  }catch(error){
   if(isCurrent()&&([403,404].includes(Number(error?.status))||
      error?.code==='42501')){
    platformSync.stop();state.board=null;state.boardUi=null;
    state.ttAttendance=null;state.ttBoardAttendance=null;
    state.edit=false;state.boardManage=false;
    location.hash='#/boards';
    return false;
   }
   throw error;
  }
  if(!isCurrent()||platformSyncEditInProgress())return false;
  if(detail?.board?.id!==boardId||detail.board.workspace_id!==workspaceId)
   return false;
  const changed=JSON.stringify(state.board)!==JSON.stringify(detail);
  state.board=detail;state.edit=edit;state.boardManage=manage;state.boardUi=boardUi;
  if(tab==='issues')state.issues=await db.issues(boardId,workspaceId);
  if(tab==='attendance'&&moduleByBoardName(detail.board.name)?.key==='timetracker'){
   const fresh=await timeTracker.snapshot(boardId);
   if(!isCurrent()||platformSyncEditInProgress())return false;
   state.ttAttendance=fresh;
   if(state.ttClockPending)reconcileTimeTrackerClock(fresh,{allowRetry:true});
  }
  if(tab==='items'&&moduleByBoardName(detail.board.name)?.key==='timetracker'){
   if(state.ttBoardGpsEligible&&TT_BOARD_GPS_PROJECTION_ENABLED){
    state.ttBoardAttendance=await loadTimeTrackerBoardGps({
     auth,api:db,boardId,workspaceId,enabled:true
    });
   }else{
    const signed=await timeTracker.snapshot(boardId);
    if(!isCurrent())return false;
    const access=signed.access;
    const scope=signed.log?.scope;
    if(signed.status==='VERIFIED_READ'&&access?.userId===userId&&
       access?.workspaceId===workspaceId&&access?.boardId===boardId&&
       ['OWN_ATTENDANCE_ONLY','AUTHORIZED_WORKSPACE_TEAM'].includes(scope)){
     state.ttBoardAttendance={status:'VERIFIED_LOG',userId,workspaceId,boardId,
      scope,rows:signed.log.rows||[]};
    }else state.ttBoardAttendance={status:'RESTRICTED'};
   }
  }
  if(tab==='finance'&&moduleByBoardName(detail.board.name)?.key==='frt')
   state.frtFinance=await loadFRTFinanceReadOnly({auth,api:db,companyCode:null});
  if(!isCurrent()||platformSyncEditInProgress())return false;
  if(changed||changedBoards||reason!=='broadcast'||tab!=='items')render();
  return true;
 }
 if(view==='user-role-management'&&state.roleVerified===true)
  await loadUserRoleManagement();
 if(view==='role-configuration'&&state.roleVerified===true)
  await loadRoleConfiguration();
 if(view==='foundation'&&sensitive)await refreshFoundation();
 if(view==='boards'&&state.showArchived)state.archived=await db.boards('archived');
 if(view==='boards'&&state.showTrash)state.trashed=await db.boards('trashed');
 if(!isCurrent()||platformSyncEditInProgress())return false;
 if(changedBoards||roleChanged||reason!=='broadcast')render();
 return true;
}

async function refreshWorkspace(){
 boardCacheChannel.stop();db.invalidateBoardCache();
 const priorIdentity=state.context?.user_id,priorWorkspace=state.context?.workspace_id;
 const incomingContext=await db.context();
 state.context=mergeProfileAvatarContext(state.context,incomingContext);
 boardCacheChannel.start({userId:state.context?.user_id,workspaceId:state.context?.workspace_id});
 if(priorIdentity!==state.context?.user_id||priorWorkspace!==state.context?.workspace_id){
   state.phaseBDenialRunId++;state.phaseBDenialBusy=false;state.phaseBDenialReport=null;
   state.tradeLinkDraft=initialTradeLinkDraftView();
   state.inlineCell=null;state.inlineAddBusy=false;state.inlineCellBusy=false;
   clearBulkActivation();state.row01Busy=false;state.row01Result=null;
   state.boardTtSignedResult=null;state.boardTtSignedBusy=false;
   state.roleData=null;state.userRoleData=null;state.userRoleSelected=null;
   state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;
   state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.ttRunId++;state.ttAttendance=null;state.ttClockPending=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;
 }
 state.boards=await db.boards('active');
 state.user=auth.session?.user;
 // Verified server RPC is the ONLY entry gate. A profile role or email is never sufficient.
 try{state.roleVerified=await roleConfig.bootstrapVerified();}
 catch{state.roleVerified=false;}
 if(!state.roleVerified){state.roleData=null;state.roleError='';state.userRoleData=null;state.ttTeam=null;state.ttTeamRunId++;state.ttTeamError='';}
}
async function loadUserRoleManagement(){
 if(state.roleVerified!==true || !(await roleConfig.bootstrapVerified()))throw new ApiError('Bootstrap role management access denied.',403);
 const ctx=await db.context();
 if(ctx.user_id!==state.context?.user_id||ctx.workspace_id!==state.context?.workspace_id)throw new ApiError('Authoritative workspace changed.',403);
 state.userRoleData=await userRoleManager.snapshot(ctx.workspace_id);
 state.userRoleError='';
 if(!state.userRoleData.users.some(u=>u.id===state.userRoleSelected))
  state.userRoleSelected=state.userRoleData.users[0]?.id??null;
}
async function applyUserRoleChange({userId,scope,resourceId,role,enabled,expectedUpdatedAt}){
 if(state.roleVerified!==true||!(await roleConfig.bootstrapVerified()))throw new ApiError('Bootstrap privilege required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)throw new ApiError('Signed identity or workspace changed.',403);
 await userRoleManager.mutate({workspaceId:ctx.workspace_id,userId,scope,resourceId,role,enabled,expectedUpdatedAt});
 await loadUserRoleManagement();
 toast('Authoritative user role updated and audited.');
 render();
}
async function applyCrmPlatformRole({userId,role,expectedUpdatedAt}){
 if(state.roleVerified!==true||!(await roleConfig.bootstrapVerified()))
   throw new ApiError('Bootstrap privilege required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)
   throw new ApiError('Signed identity or workspace changed.',403);
 await userRoleManager.setCrmPlatformRole({
   workspaceId:ctx.workspace_id,userId,role,expectedUpdatedAt});
 await loadUserRoleManagement();
 toast('APSYNTRA CRM platform role updated and audited.');
 render();
}
async function loadRoleConfiguration(){
 if(state.roleVerified!==true)throw new ApiError('Bootstrap verification required.',403);
 const context=await db.context();
 if(context.user_id!==state.context?.user_id||context.workspace_id!==state.context?.workspace_id)
  throw new ApiError('Identity or active workspace changed.',403);
 const data=await roleConfig.snapshot(context.workspace_id);
 state.roleData=data;state.roleError='';
}
async function stageRoleProposal(operation,payload){
 if(state.roleVerified!==true)throw new ApiError('Role configuration access denied.',403);
 const identity=await auth.getVerifiedUser();
 const context=await db.context();
 if(identity?.id!==context.user_id||context.user_id!==state.context?.user_id||
    context.workspace_id!==state.context?.workspace_id||
    !(await roleConfig.bootstrapVerified()))
  throw new ApiError('Bootstrap identity or active workspace changed.',403);
 await roleConfig.propose(context.workspace_id,operation,payload);
 await loadRoleConfiguration();
 toast('Change proposal recorded. No production access has changed.');
 render();
}
async function refreshFoundation(){
 const context=await db.context();
 if(context.user_id!==state.context?.user_id||context.workspace_id!==state.context?.workspace_id)
   throw new ApiError('Workspace context changed; reload and sign in again.',403);
 state.boards=await db.boards('active');
 state.foundationRows=await inspectFoundation(db,{context,boards:state.boards});
 state.foundationError='';
}
async function loadBoard(boardId,tab,draftType=null,draftEditId=null){
 boardCacheChannel.start({userId:state.context?.user_id,workspaceId:state.context?.workspace_id});
 // Reuse the already authorized TradeLink board only for intra-application
 // navigation in the same signed user/workspace context. Never cache grants
 // across sessions, workspace changes, board switches, or initial loading.
 const nextFuelTrackScope=String(auth.userId||'')+'|'+String(state.context?.workspace_id||'')+'|'+boardId;
 if(state.fuelTrackRequestScope!==nextFuelTrackScope){
  state.fuelTrackRequestScope=nextFuelTrackScope;
  state.fuelTrackRequestFilters={...FUELTRACK_REQUEST_FILTER_DEFAULTS};
 }
 const reuseFuelTrackBoard=tab==='fueltrack'&&state.tab==='fueltrack'&&
  state.view==='board'&&!state.loading&&!state.error&&
  state.boardId===FUELTRACK_V3_ID&&boardId===FUELTRACK_V3_ID&&
  isFuelTrackV3ApplicationBoard(state.board?.board)&&
  state.board.board.workspace_id===state.context?.workspace_id&&
  state.context?.user_id===auth.userId&&auth.isSignedIn;
 const reuseTradeLinkBoard=tab==='tradelink'&&state.tab==='tradelink'&&
  state.view==='board'&&!state.loading&&!state.error&&
  state.boardId===boardId&&state.board?.board?.id===boardId&&
  state.board.board.workspace_id===state.context?.workspace_id&&
  state.context?.user_id===auth.userId&&auth.isSignedIn;
 if(state.bulk02Access?.boardId!==boardId)clearBulkActivation();
 const seq=++routeSerial;
 state.groupEditId=null;state.groupEditBusy=false;state.inlineCell=null;state.inlineCellBusy=false;state.ttBoardGpsEligible=false;state.ttBoardAttendance=tab==='items'?{status:'LOADING'}:null;state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';
 if(state.boardId!==boardId||state.tab!=='attendance'){
  state.ttView='clock';state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
 }
 state.tradeLinkDraft=initialTradeLinkDraftView(tab==='tradelink'&&state.tradeLinkSection==='drafts'?draftType:null);
 // No saved content is trusted from the route. A deep-linked edit ID must
 // load the current signed list and be verified by the server before editing.
 if(tab==='tradelink'&&state.tradeLinkSection==='drafts'&&validUuid(draftEditId))
  state.tradeLinkDraft.editRequestId=draftEditId;
 if(reuseFuelTrackBoard){
  // Same signed user and workspace: switching dashboard tabs uses the
  // existing authorized board snapshot. Explicit Refresh re-reads the server.
  render();return;
 }
 if(reuseTradeLinkBoard){
  // Route state is local. List, edit, and activity data still use their
  // signed APIs below, never a stale or fabricated authorized document.
  state.error=null;
  state.tradeLinkActivityError='';
  render();
  if(state.tradeLinkSection==='activity'&&state.board?.board?.id===TRADELINK_BOARD_ID)
   await loadTradeLinkActivity(seq);
  if(['drafts','documents'].includes(state.tradeLinkSection)&&
     TL03_DOMAIN_READS_ENABLED&&state.board?.board?.id===TRADELINK_BOARD_ID)
   await loadTradeLinkDrafts(seq);
  return;
 }
 state.view='board';state.boardId=boardId;state.tab=tab;state.loading=true;state.board=null;state.boardUi=null;state.boardManage=false;state.error=null;state.issues=[];state.tradeLinkActivity=null;state.tradeLinkActivityError='';state.tradeLinkActivityBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;
 render();
 try{
   const [detail,view,edit,manage,boardUi]=await Promise.all([
    db.boardCached(boardId,{userId:state.context?.user_id,workspaceId:state.context?.workspace_id}),
    db.allowed(boardId,'view'),db.allowed(boardId,'edit'),
    db.allowed(boardId,'manage'),boardStructureClient.read(boardId)]);
   if(!view)throw new ApiError('Board view access changed.',403);
   if(!auth.isSignedIn||state.context?.user_id!==auth.userId||
      detail?.board?.workspace_id!==state.context?.workspace_id)
    throw new ApiError('Signed board cache scope changed.',403);
   if(seq!==routeSerial)return;
   state.board=detail;state.edit=edit;state.boardManage=manage;state.boardUi=boardUi;
 }catch(err){if(seq!==routeSerial)return;state.error=errorMessage(err);}
 finally{if(seq===routeSerial){state.loading=false;render();}}
 if(seq!==routeSerial||!state.board)return;
 if(tab==='items'&&TT_BOARD_GPS_PROJECTION_ENABLED&&
    moduleByBoardName(state.board.board?.name)?.key==='timetracker'){
   const identity=state.context?.user_id,workspace=state.context?.workspace_id;
   const sameSession=()=>seq===routeSerial&&auth.isSignedIn&&
     state.view==='board'&&state.tab==='items'&&state.boardId===boardId&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace;
   if(state.roleVerified===true)state.ttBoardGpsEligible=true;
   else {
     try{
       const signed=await timeTracker.snapshot(boardId);
       if(!sameSession())return;
       const checked=signed?.status==='VERIFIED_READ'&&
         signed?.access?.userId===identity&&
         signed?.access?.workspaceId===workspace&&
         signed?.access?.boardId===boardId;
       state.ttBoardGpsEligible=checked&&signed.access.moduleRole==='Supervisor';
       const permittedLogRole=checked&&
         ['HR','System Admin','IT Administrator','Employee','OJT']
           .includes(signed.access.moduleRole);
       if(permittedLogRole&&Array.isArray(signed.log?.rows)&&
          ['OWN_ATTENDANCE_ONLY','AUTHORIZED_WORKSPACE_TEAM'].includes(signed.log.scope)){
         state.ttBoardAttendance={status:'VERIFIED_LOG',userId:identity,
           workspaceId:workspace,boardId,scope:signed.log.scope,rows:signed.log.rows};
       }
     }catch{
       if(!sameSession())return;
       state.ttBoardGpsEligible=false;
     }
   }
   if(!sameSession())return;
   if(state.ttBoardGpsEligible){
     try{
       const data=await loadTimeTrackerBoardGps({
         auth,api:db,boardId,workspaceId:workspace,enabled:true
       });
       if(!sameSession())return;
       state.ttBoardAttendance=data;
     }catch(err){
       if(!sameSession())return;
       const code=String(err?.code||''),status=Number(err?.status);
       state.ttBoardAttendance={status:status===401||status===403||code==='42501'?
         'RESTRICTED':'UNAVAILABLE'};
       // No fallback to broad module state or generic board values.
     }
   }else if(state.ttBoardAttendance?.status!=='VERIFIED_LOG')
     state.ttBoardAttendance={status:'RESTRICTED'};
   if(sameSession())render();
 }
 if(tab==='issues')await loadIssues(seq);
 if(tab==='tradelink'&&state.tradeLinkSection==='activity'&&state.board?.board?.id===TRADELINK_BOARD_ID)
  await loadTradeLinkActivity(seq);
 if(tab==='tradelink'&&['drafts','documents'].includes(state.tradeLinkSection)&&
    TL03_DOMAIN_READS_ENABLED&&state.board?.board?.id===TRADELINK_BOARD_ID)
  await loadTradeLinkDrafts(seq);
 if(tab==='attendance'&&moduleByBoardName(state.board.board?.name)?.key==='timetracker')await loadTimeTracker(seq);
 if(tab==='finance'&&moduleByBoardName(state.board.board?.name)?.key==='frt')await loadFRTFinance(null,seq);
}
/** CP-TL-03D: authority and route bound Draft UI, never browser persistence. */
function tradeLinkAuthorizedListRoute(){
 return auth.isSignedIn&&state.view==='board'&&state.tab==='tradelink'&&
  state.boardId===TRADELINK_BOARD_ID&&
  ['drafts','documents'].includes(state.tradeLinkSection)&&
  state.context?.user_id===auth.userId&&
  state.board?.board?.workspace_id===state.context?.workspace_id;
}
function tradeLinkDraftRoute(){
 return tradeLinkAuthorizedListRoute()&&state.tradeLinkSection==='drafts';
}
async function loadTradeLinkDrafts(seq=routeSerial,pageRequest=null){
 if(!tradeLinkAuthorizedListRoute()||!TL03_DOMAIN_READS_ENABLED||
  state.tradeLinkDraft.busy)return;
 const actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  auth.userId===actor&&state.context?.workspace_id===ws;
 const documents=state.tradeLinkSection==='documents';
 const filters=normalizeTradeLinkDraftListFilters(
  pageRequest?.filters??state.tradeLinkDraft.listFilters);
 state.tradeLinkDraft={...state.tradeLinkDraft,busy:true,error:''};render();
 try{
  let result;
  if(documents){
   try{
    result=await tradeLinkDraftWorkspace.searchPage({
     filters,cursor:pageRequest?.cursor??null});
    if(result.listPage){
     result.listPage={...result.listPage,history:pageRequest?.history??[],
      pageIndex:pageRequest?.pageIndex??0};
    }
   }catch(err){
    // An absent, not-yet-approved RPC is not evidence of an empty repository.
    // Continue with the original bounded signed list and its truthful scope.
    if(err?.code!=='PGRST202'&&err?.code!=='42883')throw err;
    result=await tradeLinkDraftWorkspace.list();
    result.listPage=null;
    result.message='Server-wide search is not activated. Showing the current signed 50-record response.';
   }
  }else result=await tradeLinkDraftWorkspace.list();
  if(same()){
   state.tradeLinkDraft={...state.tradeLinkDraft,...result,
    listFilters:filters,listPage:result.listPage??null,
    documentPreview:null,busy:false};
   const target=state.tradeLinkDraft.editRequestId;
   if(target&&!state.tradeLinkDraft.selected&&tradeLinkDraftRoute()){
    if(!result.rows.some(row=>row.documentId===target)){
     // An exact signed read is authoritative even when a document lies
     // outside the first 50 list entries; it cannot become a fabricated row.
     try{
      const record=await tradeLinkDraftWorkspace.read(target);
      if(!same())return;
      if(!record||record.archived_at!==null||
       !['draft','revision-required'].includes(record.workflow_state)||
       record.document_number!==record.content?.documentNumber||
       record.document_type!==record.content?.documentType)
       throw new ApiError('Saved Draft not editable.',409);
      state.tradeLinkDraft.rows=[...state.tradeLinkDraft.rows,{
       documentId:record.id,boardItemId:record.board_item_id,
       documentNumber:record.document_number,documentType:record.document_type,
       revision:record.revision,workflowState:record.workflow_state,
       archived:false,updatedAt:record.updated_at
      }];
     }catch{
      if(same())state.tradeLinkDraft.error=
       'This Draft could not be verified by signed server read. Return to All Documents.';
      return;
     }
    }
    if(same())await openTradeLinkDraft(target);
   }
  }
 }catch{
  if(same())state.tradeLinkDraft={...state.tradeLinkDraft,
   status:'READ_FAILED',rows:[],selected:null,documentPreview:null,listPage:null,
   error:'Signed Draft list unavailable. No records were cached.'};
 }finally{if(same()){state.tradeLinkDraft.busy=false;render();}}
}
async function openTradeLinkDraft(documentId){
 if(!tradeLinkDraftRoute()||!TL03_DOMAIN_READS_ENABLED||!state.boardManage||
   state.tradeLinkDraft.busy||state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed)return;
 if(listed.archived||!['draft','revision-required'].includes(listed.workflowState)){
  if(state.tradeLinkDraft.editRequestId===documentId){
   state.tradeLinkDraft.error='This document is no longer an editable Draft. Return to All Documents.';
   render();
  }
  return;
 }
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 state.tradeLinkDraft.busy=true;render();
 try{
  const record=await tradeLinkDraftWorkspace.read(documentId);
  if(seq!==routeSerial||!tradeLinkDraftRoute()||auth.userId!==actor||
   state.context.workspace_id!==ws)return;
  if(!record||!['draft','revision-required'].includes(record.workflow_state)||
   record.archived_at!==null||
   record.revision!==listed.revision||
   record.board_item_id!==listed.boardItemId||
   record.document_number!==listed.documentNumber||
   record.document_type!==listed.documentType)
   throw new ApiError('Document revision or editability changed. Refresh the signed list.',409);
  state.tradeLinkDraft={...state.tradeLinkDraft,mode:'edit',
   selected:{documentId,record},pendingCreateId:null,pendingCreateDraft:null,lineDrafts:null,formValues:null,unsavedChanges:false,error:'',message:'Signed Draft loaded. Unsaved edits remain local.'};
 }catch{
  if(seq===routeSerial&&tradeLinkDraftRoute())state.tradeLinkDraft.error=
   'Draft read or authorization failed. Refresh the signed list.';
 }finally{
  if(seq===routeSerial&&tradeLinkDraftRoute()){state.tradeLinkDraft.busy=false;render();}
 }
}

/** Read the exact Board-linked authoritative revision, never local Draft state. */
async function openTradeLinkDocument(documentId){
 if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
   !TL03_DOMAIN_READS_ENABLED||!state.boardManage||
   state.tradeLinkDraft.busy||state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed)return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&auth.userId===actor&&
  state.context.workspace_id===ws;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.documentPreview=null;render();
 try{
  const [record,events,attachments]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),
   TL03_WORKFLOW_REVIEW_ENABLED?tradeLinkDraftWorkspace.history(documentId):null,
   TL03_ATTACHMENTS_ENABLED?tradeLinkAttachments.list(documentId):null
  ]);
  if(!same())return;
  if(TL03_WORKFLOW_REVIEW_ENABLED&&
    (!Array.isArray(events)||events[0]?.revision!==listed.revision))
   throw new ApiError('Signed document history does not match the saved revision.',409);
  if(!record||record.board_item_id!==listed.boardItemId||
   record.revision!==listed.revision||
   record.document_number!==listed.documentNumber||
   record.document_type!==listed.documentType||
   record.workflow_state!==listed.workflowState)
   throw new ApiError('Document revision changed; refresh the signed list.',409);
  state.tradeLinkDraft.documentPreview={documentId,record,events,attachments};
  state.tradeLinkDraft.error='';
  state.tradeLinkDraft.message='Showing verified server revision '+record.revision+'.';
 }catch{
  if(same()){
   state.tradeLinkDraft.documentPreview=null;
   state.tradeLinkDraft.error='Signed document could not be verified. Refresh the list.';
  }
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
/** Print only the currently authorized document revision after a fresh signed
 * document read and matching Board projection. The resulting content stays
 * in a dismissible, memory-only DOM preview until the user prints or closes it.
 */
/** Every attachment write is reconciled with the signed document, its Board
 * projection, its newest immutable event and its active file metadata list.
 */
async function verifyTradeLinkAttachmentCommit(documentId,listed,receipt,operation){
 const [record,list,board,attachments,events]=await Promise.all([
  tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
  db.board(TRADELINK_BOARD_ID),tradeLinkAttachments.list(documentId),
  tradeLinkDraftWorkspace.history(documentId)
 ]);
 const latest=events?.[0];
 const visible=attachments.some(a=>a.attachmentId===receipt.attachmentId);
 if(!record||record.revision!==receipt.revision||
  record.board_item_id!==receipt.boardItemId||
  record.document_type!==listed.documentType||
  record.document_number!==listed.documentNumber||
  record.workflow_state!==listed.workflowState||
  record.archived_at!==null||
  !list.rows?.some(r=>r.documentId===documentId&&
    r.revision===receipt.revision&&r.boardItemId===receipt.boardItemId)||
  board?.board?.workspace_id!==state.context?.workspace_id||
  !board.items?.some(i=>i.id===receipt.boardItemId&&
    i.title===listed.documentNumber&&i.updated_at===record.updated_at)||
  latest?.revision!==receipt.revision||latest.operation!==operation||
  latest.metadata?.attachmentId!==receipt.attachmentId||
  visible!==(operation==='attachment-added'))
  throw new ApiError('Signed attachment/Board/audit reconciliation incomplete.',409);
 return {record,list,board,attachments,events};
}
function currentTradeLinkAttachmentSelection(documentId){
 if(!TL03_ATTACHMENTS_ENABLED||!tradeLinkAuthorizedListRoute()||
  state.tradeLinkSection!=='documents'||!state.boardManage||
  state.tradeLinkDraft.busy||
  state.tradeLinkDraft.status!=='AUTHORIZED_READ')return null;
 const listed=state.tradeLinkDraft.rows.find(r=>r.documentId===documentId);
 const preview=state.tradeLinkDraft.documentPreview;
 if(!listed||!preview||preview.documentId!==documentId||
  preview.record?.revision!==listed.revision||
  preview.record?.board_item_id!==listed.boardItemId||
  !Array.isArray(preview.attachments))return null;
 return {listed,preview};
}
async function mutateTradeLinkAttachment(documentId,{
 file=null,replacesId=null,attachmentId=null,reason=null
}={}){
 const selection=currentTradeLinkAttachmentSelection(documentId);
 if(!selection)return;
 const {listed}=selection;
 if(listed.archived||!['draft','revision-required'].includes(listed.workflowState))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
  auth.userId===actor&&auth.isSignedIn;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 let committed=false;
 try{
  const receipt=file?await tradeLinkAttachments.upload({
   documentId,expectedRevision:listed.revision,file,replacesId
  }):await tradeLinkAttachments.remove({
   documentId,attachmentId,expectedRevision:listed.revision,reason
  });
  committed=true;
  if(!same())return;
  const operation=file?'attachment-added':'attachment-removed';
  const verified=await verifyTradeLinkAttachmentCommit(
   documentId,listed,receipt,operation);
  if(!same())return;
  state.board=verified.board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...verified.list,
   documentPreview:{documentId,record:verified.record,
    attachments:verified.attachments,events:verified.events},
   message:'Signed file '+(file?'uploaded':'removed from access')+
    '; document, Board and audit confirmed at revision '+receipt.revision+'.'};
  toast(file?'TradeLink attachment registered.':'Attachment access removed.');
 }catch{
  if(same())state.tradeLinkDraft.error=committed?
   'File change committed but document/Board/audit reconciliation failed. Refresh All Documents.':
   'Private attachment operation not confirmed. An upload may remain pending. Refresh the signed document; avoid duplicate uploads.';
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
async function downloadTradeLinkAttachment(documentId,attachmentId){
 const selection=currentTradeLinkAttachmentSelection(documentId);
 if(!selection||!selection.preview.attachments.some(a=>a.attachmentId===attachmentId))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&auth.userId===actor&&
  state.context?.workspace_id===ws&&auth.isSignedIn;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 try{
  const {blob,fileName}=await tradeLinkAttachments.download({
   documentId,attachmentId
  });
  if(!same())return;
  const url=URL.createObjectURL(blob);
  try{
   const link=document.createElement('a');
   link.href=url;link.download=fileName;
   document.body.appendChild(link);
   link.click();link.remove();
  }finally{
   // Ephemeral download URL only; no permanent object URL or signed URL.
   window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  if(same())toast('Verified private file downloaded.');
 }catch{
  if(same())state.tradeLinkDraft.error=
   'Attachment download was denied or failed file integrity verification. No verified file was exported.';
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
async function printTradeLinkDocument(documentId){
 if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
  !TL03_DOMAIN_READS_ENABLED||!state.boardManage||
  state.tradeLinkDraft.busy||
  state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed)return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
  auth.userId===actor&&auth.isSignedIn;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 try{
  const [record,board]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),db.board(TRADELINK_BOARD_ID)
  ]);
  if(!same())return;
  if(!record||record.revision!==listed.revision||
   record.document_type!==listed.documentType||
   record.document_number!==listed.documentNumber||
   record.workflow_state!==listed.workflowState||
   record.board_item_id!==listed.boardItemId||
   Boolean(record.archived_at)!==listed.archived||
   board?.board?.id!==TRADELINK_BOARD_ID||
   board.board.workspace_id!==ws||
   !board.items?.some(item=>item.id===listed.boardItemId&&
    item.title===listed.documentNumber))
   throw new ApiError('Saved TradeLink print revision or Board scope changed.',409);
  const markup=renderTradeLinkSavedDocumentOutput(record,ws,documentId);
  if(!same())return;
  mountTradeLinkSavedDocumentOutput(markup);
 }catch{
  if(same())state.tradeLinkDraft.error=
   'Print preview could not verify the signed document, revision and Board. Refresh All Documents.';
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
async function commitTradeLinkDraft(form){
 if(!tradeLinkDraftRoute()||!tradeLinkDraftReady()||!state.boardManage||
  state.tradeLinkDraft.busy)return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkDraftRoute()&&
  auth.userId===actor&&state.context.workspace_id===ws;
 // Retain the form on validation failure without browser/local storage.
 const fields=new FormData(form),formValues=Object.fromEntries(fields);
 let command;
 try{
  command=prepareTradeLinkDraftCommand(state.tradeLinkDraft,fields);
 }catch(err){
  if(same()){
   state.tradeLinkDraft={...state.tradeLinkDraft,formValues,
    lineDrafts:snapshotTradeLinkDraftLineItems(form),
    error:err?.message||'Invalid Draft input. Nothing saved.',message:''};
   render();
  }
  return;
 }
 const {documentId,expectedRevision,draft}=command;
 const workflowState=state.tradeLinkDraft.selected?.record?.workflow_state??'draft';
 state.tradeLinkDraft={...state.tradeLinkDraft,
  pendingCreateId:expectedRevision===0?documentId:null,
  pendingCreateDraft:command.pendingCreateDraft,
  lineDrafts:expectedRevision===0&&draft.items?.length?
   draft.items:snapshotTradeLinkDraftLineItems(form),
  formValues,busy:true,error:'',message:'Saving Draft to the signed database…'};
 render();
 let committed=false;
 try{
  // The existing server transaction atomically writes the document, Board item
  // and audit event; no second Board-item creation is permitted in the client.
  const receipt=await tradeLinkDraftWorkspace.save({
   documentId,expectedRevision,draft,workflowState});
  committed=true;
  if(!same())return;
  const [record,list,board]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
   db.board(TRADELINK_BOARD_ID)
  ]);
  if(!same())return;
  if(!record||record.revision!==receipt.revision||
   record.board_item_id!==receipt.boardItemId||
   record.document_number!==draft.documentNumber||
   record.content?.documentNumber!==draft.documentNumber||
   record.content?.documentType!==draft.documentType||
   !tradeLinkSavedDraftMatches(record,draft)||
   record.workflow_state!==workflowState||
   list.status!=='AUTHORIZED_READ'||
   !list.rows.some(row=>row.documentId===documentId&&
    row.boardItemId===receipt.boardItemId&&row.revision===receipt.revision)||
   board?.board?.workspace_id!==ws||
   !board.items?.some(item=>item.id===receipt.boardItemId&&
    item.title===draft.documentNumber))
   throw new ApiError('Saved document/Board projection verification incomplete.',409);
  state.board=board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),
   status:'AUTHORIZED_READ',rows:list.rows,
   message:'Saved Draft '+receipt.revision+' confirmed in TradeLink, Board items and All Documents.'};
  toast('Saved Draft. Document and Board item verified.');
  location.hash='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/documents';
 }catch(err){
  if(same()){
   state.tradeLinkDraft.error=tradeLinkDraftSaveFailureMessage(err,{committed});
   state.tradeLinkDraft.message='';
  }
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
/** Genuine source workflow submit, gated until the signed backend is activated.
 * Never infer a transition from a local preview or an optimistic Board status.
 */
async function submitTradeLinkDocument(documentId){
 if(!TL03_WORKFLOW_SUBMIT_ENABLED||!tradeLinkAuthorizedListRoute()||
    state.tradeLinkSection!=='documents'||state.tradeLinkDraft.busy||
    state.tradeLinkDraft.status!=='AUTHORIZED_READ'||!state.boardManage)return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed||listed.archived||
   !['draft','revision-required'].includes(listed.workflowState)||
   !Number.isSafeInteger(listed.revision)||listed.revision<1)return;
 if(!confirm('Submit saved TradeLink '+listed.documentType+
  ' document '+listed.documentNumber+' at revision '+listed.revision+
  '? Submission changes the authoritative workflow state.'))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
   state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
   auth.userId===actor;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 let committed=false;
 try{
  const receipt=await tradeLinkDraftWorkspace.submit({
   documentId,expectedRevision:listed.revision,documentType:listed.documentType,
   fromState:listed.workflowState});
  committed=true;
  if(!same())return;
  const [record,list,board]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
   db.board(TRADELINK_BOARD_ID)
  ]);
  if(!same())return;
  if(!record||record.revision!==receipt.revision||
    record.workflow_state!==receipt.state||
    record.board_item_id!==receipt.boardItemId||
    record.document_number!==listed.documentNumber||
    record.document_type!==listed.documentType||
    record.archived_at!==null||
    !list.rows.some(row=>row.documentId===documentId&&
      row.revision===receipt.revision&&row.workflowState===receipt.state&&
      row.boardItemId===receipt.boardItemId)||
    board?.board?.workspace_id!==ws||
    !board.items?.some(item=>item.id===receipt.boardItemId&&
      item.title===listed.documentNumber&&item.updated_at===record.updated_at))
   throw new ApiError('TradeLink submitted state or Board verification incomplete.',409);
  state.board=board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...list,
   message:'TradeLink '+receipt.state+' at revision '+receipt.revision+
    ' verified against the signed document and Board.'};
  toast('TradeLink submission verified.');
 }catch(err){
  if(same())state.tradeLinkDraft.error=committed?
    'The server committed a submission, but synchronized retrieval failed. Refresh All Documents before any new action.':
    tradeLinkDraftSaveFailureMessage(err);
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
/** Genuine signed reviewer decision, with server-bound account assignment.
 * The frontend never treats an entered reviewer name as a permission.
 */
async function reviewTradeLinkDocument(documentId,action){
 if(!TL03_WORKFLOW_REVIEW_ENABLED||!tradeLinkAuthorizedListRoute()||
    state.tradeLinkSection!=='documents'||state.tradeLinkDraft.busy||
    state.tradeLinkDraft.status!=='AUTHORIZED_READ'||!state.boardManage)return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed||listed.archived||
   !['submitted','under-review'].includes(listed.workflowState)||
   (action==='review'&&(listed.workflowState!=='submitted'||
    !['esi','quotation','po','payment'].includes(listed.documentType)))||
   !['review','request-revision'].includes(action)||
   !Number.isSafeInteger(listed.revision)||listed.revision<1)return;
 let reason='';
 if(action==='request-revision'){
  const entered=prompt('Explain which document fields require revision (3–1500 characters):','');
  if(entered===null)return;
  reason=entered.trim();
  if(reason.length<3||reason.length>1500||/[\x00-\x1f\x7f]/.test(entered)){
   state.tradeLinkDraft.error='A revision request requires a valid 3–1500 character reason.';
   render();return;
  }
 }else if(!confirm('Record signed TradeLink review of '+
  listed.documentNumber+' at revision '+listed.revision+'?'))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
  auth.userId===actor;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 let committed=false;
 try{
  const receipt=await tradeLinkDraftWorkspace.review({
   documentId,expectedRevision:listed.revision,action,
   fromState:listed.workflowState,reason});
  committed=true;
  if(!same())return;
  const [record,list,board,events]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
   db.board(TRADELINK_BOARD_ID),tradeLinkDraftWorkspace.history(documentId)
  ]);
  if(!same())return;
  if(!record||record.revision!==receipt.revision||
    record.workflow_state!==receipt.state||
    record.document_type!==listed.documentType||
    record.document_number!==listed.documentNumber||
    record.board_item_id!==receipt.boardItemId||record.archived_at!==null||
    !list.rows.some(r=>r.documentId===documentId&&
      r.revision===receipt.revision&&r.workflowState===receipt.state&&
      r.boardItemId===receipt.boardItemId)||
    !events.length||events[0].revision!==receipt.revision||
    events[0].operation!==(action==='review'?'reviewed':'revision-requested')||
    events[0].metadata?.from!==listed.workflowState||
    events[0].metadata?.to!==receipt.state||
    (action==='request-revision'&&events[0].metadata?.reason!==reason)||
    board?.board?.workspace_id!==ws||
    !board.items?.some(i=>i.id===receipt.boardItemId&&
      i.title===listed.documentNumber&&i.updated_at===record.updated_at))
   throw new ApiError('Signed TradeLink review/audit synchronization incomplete.',409);
  state.board=board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...list,
   message:'Signed '+receipt.state+' workflow decision verified at revision '+
    receipt.revision+' in document, Board and audit history.'};
  toast('TradeLink signed workflow decision verified.');
 }catch(err){
  if(same())state.tradeLinkDraft.error=committed?
   'The server committed the workflow decision, but signed audit/Board reconciliation failed. Refresh All Documents.':
   tradeLinkDraftSaveFailureMessage(err);
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
/** Signed final commercial decision, never a local status update.
 * Approver email, prior review, reason and current state are enforced by SQL.
 */
async function decideTradeLinkDocument(documentId,action){
 if(!TL03_WORKFLOW_DECISION_ENABLED||!TL03_WORKFLOW_REVIEW_ENABLED||
   !tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
   state.tradeLinkDraft.busy||
   state.tradeLinkDraft.status!=='AUTHORIZED_READ'||!state.boardManage)return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed||listed.archived||!['submitted','under-review'].includes(listed.workflowState)||
    !['approve','reject'].includes(action)||
    listed.documentType==='packing'||
    (action==='approve'&&!['esi','quotation','po'].includes(listed.documentType))||
    !Number.isSafeInteger(listed.revision)||listed.revision<1)return;
 let reason='';
 if(action==='reject'){
  const entered=prompt('State the rejection reason for '+
   listed.documentNumber+' (3–1500 characters):','');
  if(entered===null)return;
  reason=entered.trim();
  if(reason.length<3||reason.length>1500||/[\x00-\x1f\x7f]/.test(entered)){
   state.tradeLinkDraft.error='Rejection requires a valid 3–1500 character reason.';
   render();return;
  }
 }else if(!confirm('Approve saved TradeLink '+listed.documentType+' '+
  listed.documentNumber+' at revision '+listed.revision+
  '? Only the signed, assigned approver with required verification may approve.'))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
  auth.userId===actor;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 let committed=false;
 try{
  const receipt=await tradeLinkDraftWorkspace.decide({
   documentId,expectedRevision:listed.revision,action,
   fromState:listed.workflowState,reason});
  committed=true;
  if(!same())return;
  const [record,list,board,events]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
   db.board(TRADELINK_BOARD_ID),tradeLinkDraftWorkspace.history(documentId)
  ]);
  if(!same())return;
  const event=events?.[0];
  if(!record||record.revision!==receipt.revision||
   record.workflow_state!==receipt.state||
   record.document_type!==listed.documentType||
   record.document_number!==listed.documentNumber||
   record.board_item_id!==receipt.boardItemId||record.archived_at!==null||
   !list.rows.some(r=>r.documentId===documentId&&
     r.revision===receipt.revision&&r.workflowState===receipt.state&&
     r.boardItemId===receipt.boardItemId)||
   !event||event.revision!==receipt.revision||
   event.operation!==(action==='approve'?'approved':'rejected')||
   event.metadata?.action!==action||
   event.metadata?.from!==listed.workflowState||
   event.metadata?.to!==receipt.state||
   (action==='reject'&&event.metadata?.reason!==reason)||
   !Number.isFinite(Date.parse(event.metadata?.decidedAt))||
   Date.parse(event.metadata.decidedAt)!==Date.parse(record.updated_at)||
   board?.board?.workspace_id!==ws||
   !board.items?.some(item=>item.id===receipt.boardItemId&&
     item.title===listed.documentNumber&&item.updated_at===record.updated_at))
   throw new ApiError('Signed TradeLink decision/audit/Board reconciliation incomplete.',409);
  state.board=board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...list,
   message:'Signed '+receipt.state+' decision verified at revision '+
     receipt.revision+' against document, Board and audit.'};
  toast('TradeLink '+receipt.state+' decision verified.');
 }catch(err){
  if(same())state.tradeLinkDraft.error=committed?
   'The server committed the decision, but signed audit/Board reconciliation failed. Refresh All Documents.':
   tradeLinkDraftSaveFailureMessage(err);
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
/** Signed operational event and completion/reopen.
 * All timestamps originate from the database, never the browser clock.
 */
async function operateTradeLinkDocument(documentId,action){
 if(!TL03_WORKFLOW_OPERATIONAL_ENABLED||!TL03_WORKFLOW_REVIEW_ENABLED||
   !tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
   state.tradeLinkDraft.busy||
   state.tradeLinkDraft.status!=='AUTHORIZED_READ'||!state.boardManage)return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed||listed.archived||!Number.isSafeInteger(listed.revision)||
    listed.revision<1||
    !['record-checked','record-delivered','record-received','complete','reopen'].includes(action))
   return;
 const waiting=['submitted','under-review'].includes(listed.workflowState);
 if((action==='record-checked'||action==='record-delivered')&&
     !(listed.documentType==='delivery'&&waiting)||
    action==='record-received'&&!(listed.documentType==='payment'&&waiting)||
    action==='complete'&&
      !(listed.workflowState==='approved'&&
        ['esi','quotation','po'].includes(listed.documentType)||
        waiting&&['delivery','payment'].includes(listed.documentType))||
    action==='reopen'&&
      !['approved','rejected','completed','cancelled'].includes(listed.workflowState))
   return;
 let reason='';
 if(action==='reopen'){
  const entered=prompt('Explain why '+listed.documentNumber+
   ' must reopen as a Draft (3–1500 characters):','');
  if(entered===null)return;
  reason=entered.trim();
  if(reason.length<3||reason.length>1500||/[\x00-\x1f\x7f]/.test(entered)){
   state.tradeLinkDraft.error='Reopening requires a valid 3–1500 character reason.';
   render();return;
  }
 }else if(!confirm(
  (action==='complete'?'Mark completed':action.replace('record-','Record signed '))+
  ' on '+listed.documentNumber+' at revision '+listed.revision+
  '? Only authoritative signed workflow evidence will be saved.'))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
  auth.userId===actor;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 let committed=false;
 try{
  const receipt=await tradeLinkDraftWorkspace.operate({
   documentId,expectedRevision:listed.revision,documentType:listed.documentType,
   action,fromState:listed.workflowState,reason});
  committed=true;
  if(!same())return;
  const [record,list,board,events]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
   db.board(TRADELINK_BOARD_ID),tradeLinkDraftWorkspace.history(documentId)
  ]);
  if(!same())return;
  const event=events?.[0];
  const operation=action==='reopen'?'reopened':
   action==='complete'?'completed':'operational-record';
  if(!record||record.revision!==receipt.revision||
   record.workflow_state!==receipt.state||
   record.document_type!==listed.documentType||
   record.document_number!==listed.documentNumber||
   record.board_item_id!==receipt.boardItemId||record.archived_at!==null||
   !list.rows.some(r=>r.documentId===documentId&&
     r.revision===receipt.revision&&r.workflowState===receipt.state&&
     r.boardItemId===receipt.boardItemId)||
   !event||event.revision!==receipt.revision||
   event.operation!==operation||
   event.metadata?.action!==action||
   event.metadata?.from!==listed.workflowState||
   event.metadata?.to!==receipt.state||
   (action==='reopen'&&event.metadata?.reason!==reason)||
   event.metadata?.field!==receipt.field||
   typeof event.metadata?.at!=='string'||
   Date.parse(event.metadata.at)!==Date.parse(receipt.recordedAt)||
   Date.parse(receipt.recordedAt)!==Date.parse(record.updated_at)||
   board?.board?.workspace_id!==ws||
   !board.items?.some(item=>item.id===receipt.boardItemId&&
     item.title===listed.documentNumber&&item.updated_at===record.updated_at))
   throw new ApiError('Signed TradeLink operational/Board/audit reconciliation incomplete.',409);
  state.board=board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...list,
   message:'Signed '+operation+' verified at revision '+
    receipt.revision+' in document, Board and audit history.'};
  toast('TradeLink operational action verified.');
 }catch(err){
  if(same())state.tradeLinkDraft.error=committed?
    'The server committed the operational action but signed audit/Board reconciliation failed. Refresh All Documents.':
    tradeLinkDraftSaveFailureMessage(err);
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
async function changeTradeLinkDraftState(documentId,operation){
 if(!tradeLinkAuthorizedListRoute()||!tradeLinkDraftReady()||!state.boardManage||
   state.tradeLinkDraft.busy||state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const record=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!record||record.workflowState!=='draft'||!Number.isSafeInteger(record.revision)||
   record.revision<1||(operation==='archive'&&record.archived)||
   (operation==='restore'&&!record.archived))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  auth.userId===actor&&state.context?.workspace_id===ws;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 let committed=false;
 try{
  const receipt=await tradeLinkDraftWorkspace.changeState({
   documentId,revision:record.revision,operation});
  committed=true;
  if(!same())return;
  // Verify the authoritative revision and refresh Board projection as a
  // separate read; never synthesize archived document or Board rows locally.
  const [list,board,updated]=await Promise.all([
   tradeLinkDraftWorkspace.list(),db.board(TRADELINK_BOARD_ID),
   tradeLinkDraftWorkspace.read(documentId)
  ]);
  if(!same())return;
  if(list.status!=='AUTHORIZED_READ'||!Array.isArray(list.rows)||
    !list.rows.some(row=>row.documentId===documentId&&
      row.boardItemId===receipt.boardItemId&&row.revision===receipt.revision&&
      row.archived===(operation==='archive'))||
    !updated||updated.revision!==receipt.revision||
    updated.board_item_id!==receipt.boardItemId||
    (updated.archived_at!==null)!==(operation==='archive')||
    board?.board?.workspace_id!==ws)
   throw new ApiError('TradeLink document state reconciliation incomplete.',409);
  state.board=board;
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...list,
   message:'Signed Draft '+operation+' confirmed at revision '+receipt.revision+'.'};
  toast('TradeLink Draft '+operation+' confirmed.');
  if(state.tradeLinkSection==='drafts')
   location.hash='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/documents';
 }catch(err){
  if(same()){
   state.tradeLinkDraft.error=committed?
    'The server committed the Draft change, but synchronization could not be verified. Refresh All Documents.':
    tradeLinkDraftSaveFailureMessage(err);
  }
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
/** Read-only signed board events; never substitutes for source TradeLink collaboration records. */
async function loadTradeLinkActivity(seq=routeSerial){
 const userId=state.context?.user_id,workspaceId=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&auth.isSignedIn&&
  state.view==='board'&&state.tab==='tradelink'&&
  state.boardId===TRADELINK_BOARD_ID&&state.tradeLinkSection==='activity'&&
  state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
  state.board?.board?.workspace_id===workspaceId;
 if(!same()||state.tradeLinkActivityBusy)return;
 state.tradeLinkActivityBusy=true;state.tradeLinkActivityError='';render();
 try{
  if(await db.allowed(TRADELINK_BOARD_ID,'view')!==true)
   throw new ApiError('TradeLink activity access denied.',403);
  if(!same())return;
  const events=await db.boardEvents(TRADELINK_BOARD_ID,100);
  if(!same())return;
  state.tradeLinkActivity=events;
 }catch(err){
  if(same()){state.tradeLinkActivity=null;state.tradeLinkActivityError=errorMessage(err);}
 }finally{if(same()){state.tradeLinkActivityBusy=false;render();}}
}
async function loadTimeTracker(seq=routeSerial){
 if(state.view!=='board'||state.tab!=='attendance'||
    moduleByBoardName(state.board?.board?.name)?.key!=='timetracker')return;
 const run=++state.ttRunId,identity=state.context?.user_id,ws=state.context?.workspace_id;
 if(state.ttClockPending&&(state.ttClockPending.userId!==identity||
  state.ttClockPending.workspaceId!==ws||state.ttClockPending.boardId!==state.boardId))
  state.ttClockPending=null;
 state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';
 state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
 state.ttBusy=true;state.ttError='';render();
 try{
  const snapshot=await timeTracker.snapshot(state.boardId);
  if(run===state.ttRunId&&seq===routeSerial&&auth.isSignedIn&&
    state.context?.user_id===identity&&state.context?.workspace_id===ws)
   {state.ttAttendance=snapshot;
    if(state.ttClockPending)reconcileTimeTrackerClock(snapshot,{allowRetry:true});}
 }catch(err){
  if(run===state.ttRunId&&seq===routeSerial){
   state.ttAttendance=null;state.ttError=errorMessage(err);
  }
 }finally{
  if(run===state.ttRunId&&seq===routeSerial){state.ttBusy=false;render();}
 }
}
/** Privileged attendance Log GPS. Never sourced from broad, redacted attendance state. */
async function loadTimeTrackerLogGps(seq=routeSerial,record=null,{force=false}={}){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='log'||
    state.ttAttendance?.status!=='VERIFIED_READ'||!auth.isSignedIn||
    state.ttBusy||state.ttLogGpsBusy)return;
 const eligible=state.roleVerified===true||
  state.ttAttendance.access?.moduleRole==='Supervisor';
 if(!eligible)return;
 const run=++state.ttLogGpsRunId,identity=state.context?.user_id,
  workspace=state.context?.workspace_id,boardId=state.boardId;
 const range=record?timeTrackerGpsWindow(new Date(record.clockIn),1):
  timeTrackerGpsWindow(new Date(),31);
 const params={from:range.from,to:range.to,
  userId:record?String(record.ownerId||'').replace(/^cloud:/,''):null};
 const cached=state.ttLogGpsData;
 if(!force&&Date.now()-state.ttLogGpsCacheAt<15000&&!cached?.truncated&&
    cached?.actorId===identity&&cached?.workspaceId===workspace&&cached?.boardId===boardId&&
    cached.ranges?.some(x=>x.from<=range.from&&x.to>=range.to)&&
    (!record||cached.events.some(p=>p.recordId===record.id&&
      'cloud:'+p.userId===record.ownerId)))return;
 state.ttLogGpsBusy=true;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';
 render();
 try{
  const data=await timeTracker.gpsEvidence(boardId,params);
  if(run===state.ttLogGpsRunId&&seq===routeSerial&&
     state.view==='board'&&state.tab==='attendance'&&state.ttView==='log'&&
     state.boardId===boardId&&auth.isSignedIn&&auth.userId===identity&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace){
   const existing=state.ttLogGpsData;
   const merged=new Map();
   if(existing?.actorId===identity&&existing.workspaceId===workspace&&
      existing.boardId===boardId){
    for(const p of existing.events)merged.set(p.userId+':'+p.recordId+':'+p.kind,p);
   }
   for(const p of data.events)merged.set(p.userId+':'+p.recordId+':'+p.kind,p);
   const ranges=existing?.actorId===identity&&existing.workspaceId===workspace&&
      existing.boardId===boardId?existing.ranges||[]:[];
   state.ttLogGpsCacheAt=Date.now();
   state.ttLogGpsData={...data,events:[...merged.values()],
    ranges:[...ranges,{from:range.from,to:range.to}],
    truncated:existing?.truncated===true||data.truncated===true};
  }
 }catch(err){
  if(run===state.ttLogGpsRunId&&seq===routeSerial){
   // Do not invalidate earlier authorized fixes when a single read fails.
   const message=String(err?.message||'');
   const status=Number(err?.status);
   const code=String(err?.code||'');
   state.ttLogGpsErrorRecordId=record?.id||'';
   if(status===401||/signed session required|session.*expir|session.*revok/i.test(message))
    state.ttLogGpsError='Your signed session is no longer valid. Sign in again to view GPS evidence.';
   else if(status===403||/GPS.*(denied|restricted)|bootstrap.*Supervisor|access denied/i.test(message))
    state.ttLogGpsError='GPS authorization was denied. Only bootstrap administrators and assigned TimeTracker Supervisors may view coordinates.';
   else if(code==='PGRST202'||/function.*not found|schema cache/i.test(message))
    state.ttLogGpsError='The GPS evidence service is not available in the active backend schema.';
   else if(/date window|date range|future date/i.test(message))
    state.ttLogGpsError='The selected attendance date is outside the permitted GPS evidence window.';
   else if(/scope mismatch|identity|workspace changed|revoked during/i.test(message))
    state.ttLogGpsError='The signed GPS response did not match your current session or workspace.';
   else
    state.ttLogGpsError='The signed GPS request failed validation. Refresh your session and retry.';
  }
 }finally{
  if(run===state.ttLogGpsRunId&&seq===routeSerial){
   state.ttLogGpsBusy=false;render();
  }
 }
}
/** Fetch only dedicated server-guarded GPS evidence, never broad module state. */
async function loadTimeTrackerGps(seq=routeSerial,{force=false}={}){
 if(state.view!=='board'||state.tab!=='attendance'||
    state.ttAttendance?.status!=='VERIFIED_READ'||!auth.isSignedIn||
    state.ttBusy||state.ttGpsBusy||state.ttView!=='gps')return;
 const eligible=state.roleVerified===true||
  state.ttAttendance.access?.moduleRole==='Supervisor';
 if(!eligible)return;
 const run=++state.ttGpsRunId,identity=state.context?.user_id,
  workspace=state.context?.workspace_id,boardId=state.boardId;
 const range=timeTrackerGpsWindow();
 const params={from:state.ttGpsFilters.from||range.from,
  to:state.ttGpsFilters.to||range.to,userId:state.ttGpsFilters.userId||null};
 if(!force&&Date.now()-state.ttGpsCacheAt<15000&&!state.ttGpsData?.truncated&&
    state.ttGpsData?.actorId===identity&&state.ttGpsData?.workspaceId===workspace&&
    state.ttGpsData?.boardId===boardId&&
    state.ttGpsData?.from===params.from&&state.ttGpsData?.to===params.to&&
    (!params.userId||state.ttGpsData.events.some(p=>p.userId===params.userId)))return;
 state.ttGpsBusy=true;state.ttGpsError='';render();
 try{
  const data=await timeTracker.gpsEvidence(boardId,params);
  if(run===state.ttGpsRunId&&seq===routeSerial&&
     state.view==='board'&&state.tab==='attendance'&&state.ttView==='gps'&&
     state.boardId===boardId&&auth.isSignedIn&&auth.userId===identity&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace){
   state.ttGpsData=data;state.ttGpsCacheAt=Date.now();
  }
 }catch(err){
  if(run===state.ttGpsRunId&&seq===routeSerial){
   state.ttGpsData=null;
   state.ttGpsError='Signed GPS evidence is unavailable or access was denied.';
   if(err?.status===403||/GPS authorization|GPS evidence is restricted|Only bootstrap/.test(String(err?.message||'')))
    state.ttView='clock';
  }
 }finally{
  if(run===state.ttGpsRunId&&seq===routeSerial){
   state.ttGpsBusy=false;render();
  }
 }
}
/** Signed, non-mutating probes. Results are in-memory and invalidated on identity change. */
async function loadTimeTrackerMonitor(seq=routeSerial){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttAttendance?.status!=='VERIFIED_READ'||
    !auth.isSignedIn||state.ttBusy||state.ttMonitorBusy)return;
 const run=++state.ttMonitorRunId,identity=state.context?.user_id,
  workspace=state.context?.workspace_id,boardId=state.boardId;
 state.ttMonitor=null;state.ttMonitorError='';state.ttMonitorBusy=true;render();
 try{
  const result=await probeTimeTrackerMonitor({auth,api:db,boardId,
   bootstrapEligible:state.roleVerified===true});
  if(run===state.ttMonitorRunId&&seq===routeSerial&&
     state.view==='board'&&state.ttView==='monitor'&&state.boardId===boardId&&
     auth.isSignedIn&&auth.userId===identity&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspace){
   state.ttMonitor=result;
   state.ttMonitorHistory=[...state.ttMonitorHistory,result].slice(-12);
  }
 }catch(error){
  if(run===state.ttMonitorRunId&&seq===routeSerial){
   state.ttMonitor=null;
   state.ttMonitorError='Monitor check could not verify the current signed session.';
  }
 }finally{
  if(run===state.ttMonitorRunId&&seq===routeSerial){
   state.ttMonitorBusy=false;render();
  }
 }
}
/** Re-verify bootstrap status and workspace identity for every Team read. */
async function loadTimeTrackerTeam(seq=routeSerial){
 if(state.view!=='board'||state.tab!=='attendance'||
    state.ttAttendance?.status!=='VERIFIED_READ'||state.roleVerified!==true)return;
 const run=++state.ttTeamRunId,identity=state.context?.user_id,
  workspaceId=state.context?.workspace_id,boardId=state.boardId;
 state.ttTeam=null;state.ttTeamError='';state.ttTeamBusy=true;render();
 try{
  const data=await timeTracker.teamDirectory(boardId);
  if(run===state.ttTeamRunId&&seq===routeSerial&&auth.isSignedIn&&
     state.context?.user_id===identity&&state.context?.workspace_id===workspaceId&&
     state.boardId===boardId){
   state.ttTeam=data;
  }
 }catch(err){
  if(run===state.ttTeamRunId&&seq===routeSerial){
   state.ttTeam=null;state.ttTeamError=errorMessage(err);
   if(err?.status===401||err?.status===403||/bootstrap|authorization|permission/i.test(String(err?.message||''))){
    state.roleVerified=false;state.ttView='clock';
   }
  }
 }finally{
  if(run===state.ttTeamRunId&&seq===routeSerial){state.ttTeamBusy=false;render();}
 }
}
/** Resolve only from a fresh signed read of the exact attendance record.
 * Missing history, changed identity and invalid state never permit another write.
 */
function reconcileTimeTrackerClock(snapshot,{allowRetry=false}={}){
 const pending=state.ttClockPending;
 if(!pending)return null;
 const outcome=clockOutSnapshotOutcome(snapshot,pending);
 if(outcome==='CONFIRMED'){
  state.ttClockPending=null;
  state.ttSuccess='Clock Out confirmed in your signed PostgreSQL attendance record.';
  state.ttError='';
 }else if(outcome==='STILL_ACTIVE'&&allowRetry&&!pending.receiptVerified){
  // Only a distinct, user-triggered signed reconciliation may unlock another
  // submission. The database's per-actor transaction lock still rejects races.
  state.ttClockPending=null;
  state.ttSuccess='';
  state.ttError='Your signed attendance record is still active. Clock Out was not completed; you may try again.';
 }
 return outcome;
}
async function verifyTimeTrackerClockOut(){
 const pending=state.ttClockPending;
 if(!pending||state.ttBusy||!auth.isSignedIn||
    state.view!=='board'||state.tab!=='attendance'||state.boardId!==pending.boardId||
    state.context?.user_id!==pending.userId||
    state.context?.workspace_id!==pending.workspaceId)return;
 const seq=routeSerial,run=++state.ttRunId;
 state.ttBusy=true;state.ttError='';render();
 try{
  const snapshot=await timeTracker.snapshot(pending.boardId);
  if(seq!==routeSerial||run!==state.ttRunId||!auth.isSignedIn||
     state.context?.user_id!==pending.userId||
     state.context?.workspace_id!==pending.workspaceId)return;
  state.ttAttendance=snapshot;
  if(reconcileTimeTrackerClock(snapshot,{allowRetry:true})==='UNVERIFIED')
   state.ttError='The server has not confirmed this attendance record yet. Refresh your signed session before attempting another Clock Out.';
 }catch(err){
  if(seq===routeSerial&&run===state.ttRunId)
   state.ttError=attendanceAuthFailure(err)?
    attendanceClockError(err):
    'Attendance status could not be verified. The End Session action remains locked to prevent duplicate requests.';
 }finally{
  if(seq===routeSerial&&run===state.ttRunId){state.ttBusy=false;render();}
 }
}
async function submitTimeTrackerAction(form,actionName){
 if(state.view!=='board'||state.tab!=='attendance'||state.ttBusy||state.ttClockPending||
    moduleByBoardName(state.board?.board?.name)?.key!=='timetracker')return;
 if(!['clock-in','clock-out'].includes(actionName)||state.ttAttendance?.status!=='VERIFIED_READ')return;
 if(!TT_LIVE_ATTENDANCE_WRITES_ACCEPTED||state.ttAttendance?.access?.attendanceWritesAccepted!==true){
  state.ttError='Live attendance writes require a signed, server-verified Clock capability.';render();return;
 }
 const values=new FormData(form);
 const active=state.ttAttendance.active;
 if(actionName==='clock-out'&&!active)return;
 const location=actionName==='clock-out'?String(active.location||''):
  String(values.get('tt-location')||'');
 const department=actionName==='clock-out'?String(active.department||''):
  String(values.get('tt-department')||'');
 const workNote=String(form.querySelector('#tt-note')?.value||'');
 const seq=routeSerial,run=++state.ttRunId,identity=state.context.user_id,
  ws=state.context.workspace_id,boardId=state.boardId;
 const context={recordId:active?.id,userId:identity,workspaceId:ws,boardId};
 const sameSession=()=>seq===routeSerial&&run===state.ttRunId&&auth.isSignedIn&&
  state.boardId===boardId&&state.context?.user_id===identity&&
  state.context?.workspace_id===ws;
 let commitAttempted=false;
 state.ttBusy=true;state.ttError='';state.ttSuccess='';render();
 try{
  const geo=await captureAttendanceGeo(navigator.geolocation);
  if(!sameSession())throw new Error('Attendance session changed before commit');
  commitAttempted=true;
  const receipt=await timeTracker.commit(boardId,{
   action:actionName,location,department,workNote,geo
  });
  if(!sameSession())return;
  state.ttSuccess=(receipt.action==='clock-in'?'Clock In':'Clock Out')+
   ' confirmed by PostgreSQL · revision '+receipt.revision;
  // The commit receipt is authoritative; a failed refresh is not a failed write.
  if(actionName==='clock-out')state.ttClockPending={...context,receiptVerified:true};
  try{
   const snapshot=await timeTracker.snapshot(boardId);
   if(!sameSession())return;
   state.ttAttendance=snapshot;
   if(actionName==='clock-out'&&reconcileTimeTrackerClock(snapshot)!=='CONFIRMED')
    state.ttError='Clock Out was committed, but the current session view is not reconciled. Select Verify session status.';
  }catch{
   if(sameSession())state.ttError=actionName==='clock-out'?
    'Clock Out was committed, but the refreshed session is unavailable. Select Verify session status.':
    'Clock In was committed, but the refreshed session is unavailable. Refresh the board before further attendance actions.';
  }
 }catch(err){
  if(!sameSession())return;
  if(actionName==='clock-out'&&commitAttempted){
   state.ttClockPending=context;
   if(!attendanceAuthFailure(err)){
    try{
     const snapshot=await timeTracker.snapshot(boardId);
     if(!sameSession())return;
     state.ttAttendance=snapshot;
     if(reconcileTimeTrackerClock(snapshot)==='CONFIRMED')return;
     if(!state.ttClockPending)return;
    }catch{/* Uncertain outcome: never retry the write automatically. */}
   }
  }
  state.ttError=attendanceClockError(err,{commitAttempted});
 }finally{
  if(sameSession()){state.ttBusy=false;render();}
 }
}

async function loadIssues(seq=routeSerial){
 state.loadingIssues=true;render();
 try{const rows=await db.issues(state.boardId,state.context.workspace_id);
 if(seq===routeSerial)state.issues=rows;
 }catch(err){if(seq===routeSerial)notice(err);}
 finally{if(seq===routeSerial){state.loadingIssues=false;render();}}
}
async function loadFRTFinance(companyCode=null,seq=routeSerial){
 if(state.view!=='board'||state.tab!=='finance'||
    moduleByBoardName(state.board?.board?.name)?.key!=='frt'||state.frtFinanceBusy)return;
 const identity=state.context?.user_id;
 const workspace=state.context?.workspace_id;
 state.frtFinanceBusy=true;state.frtFinance=null;state.frtFinanceDetail=null;state.frtFinanceDetailId=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailRevision++;render();
 try{
  const result=await loadFRTFinanceReadOnly({auth,api:db,companyCode});
  if(seq===routeSerial&&auth.isSignedIn&&state.context?.user_id===identity&&
     state.context?.workspace_id===workspace)state.frtFinance=result;
 }finally{if(seq===routeSerial){state.frtFinanceBusy=false;render();}}
}
async function loadFRTFinanceDetail(requestId,seq=routeSerial){
 if(state.view!=='board'||state.tab!=='finance'||!auth.isSignedIn||
    state.frtFinanceBusy||state.frtFinanceDetailBusy||
    state.frtFinance?.status!=='PASS'||state.frtFinance?.companyCode===null||
    moduleByBoardName(state.board?.board?.name)?.key!=='frt')return;
 const ids=(state.frtFinance.requests||[]).map(r=>r.requestId);
 if(!ids.includes(requestId))return;
 const revision=++state.frtFinanceDetailRevision;
 const identity=state.context?.user_id,workspace=state.context?.workspace_id;
 const companyCode=state.frtFinance.companyCode;
 state.frtFinanceDetail=null;state.frtFinanceDetailId=requestId;
 state.frtFinanceDetailBusy=true;render();
 try{
  const response=await loadFRTRequestDetailReadOnly({
   auth,api:db,requestId,companyCode,allowedRequestIds:ids,workspaceId:workspace,
   expectedRole:state.frtFinance.role
  });
  if(revision===state.frtFinanceDetailRevision&&seq===routeSerial&&
     auth.isSignedIn&&state.context?.user_id===identity&&
     state.context?.workspace_id===workspace&&
     state.frtFinance?.companyCode===companyCode&&
     state.frtFinance?.requests?.some(r=>r.requestId===requestId))
   state.frtFinanceDetail=response;
 }catch{
  if(revision===state.frtFinanceDetailRevision&&seq===routeSerial)
   state.frtFinanceDetail={status:'BLOCKED',reason:'FRT_DETAIL_READ_INCOMPLETE'};
 }finally{
  if(revision===state.frtFinanceDetailRevision&&seq===routeSerial){
   state.frtFinanceDetailBusy=false;render();
  }
 }
}
async function onRoute(){
 closeTradeLinkSavedDocumentOutput();
 syncFuelTrans({container:null});
 if(!state.context)return;
 const hash=location.hash||routeHome;
 const parts=hash.replace(/^#\/?/,'').split('/');
 if(parts[0]==='invitations'&&parts[1]==='accept'){
  state.view='invitation';render();return;
 }
 if(pendingInvitation){pendingInvitation=null;invitationAcceptanceStatus='';}
 if(parts[0]==='boards'&&validUuid(parts[1])){
  const defaultClock=!parts[2]&&state.boards.some(b=>
    b.id===parts[1]&&moduleByBoardName(b.name)?.key==='timetracker');
  const defaultFuelTrans=!parts[2]&&state.boards.some(b=>b.id===parts[1]&&moduleByBoardName(b.name)?.key==='fueltrans');
  if(defaultFuelTrans)history.replaceState(null,'','#/boards/'+parts[1]+'/fueltrans');
  const requested=parts[2]==='issues'?'issues':
    parts[2]==='fueltrans'&&state.boards.some(b=>b.id===parts[1]&&moduleByBoardName(b.name)?.key==='fueltrans')?'fueltrans':
    parts[2]==='fueltrack'&&parts[1]===FUELTRACK_V3_ID&&
      state.boards.some(b=>b.id===FUELTRACK_V3_ID&&b.name==='FuelTrack+ v3')?'fueltrack':
    parts[2]==='finance'?'finance':
    parts[2]==='attendance'?'attendance':
    parts[2]==='tradelink'&&state.boards.some(b=>b.id===parts[1]&&
      moduleByBoardName(b.name)?.key==='tradelink')?'tradelink':
    defaultFuelTrans?'fueltrans':defaultClock?'attendance':'items';
  state.fuelTrackSection=requested==='fueltrack'?normalizeFuelTrackSection(parts[3]):'dashboard';
  state.fuelTrackAnalyticsView=normalizeFuelTrackAnalyticsView(parts[4]);
  state.fuelTrackAnalyticsRange=normalizeFuelTrackAnalyticsRange(parts[5]);
  state.fuelTrackAnalyticsMetric=normalizeFuelTrackAnalyticsMetric(parts[6]);
  // TradeLink has no overview landing page. Canonicalize legacy entry URLs
  // without adding a history entry or changing authentication/board scope.
  // Keep explicit documents, activity, draft and edit deep links unchanged.
  if(requested==='tradelink'&&(!parts[3]||parts[3]==='overview')){
   const canonical='#/boards/'+parts[1]+'/tradelink/drafts/quotation';
   history.replaceState(null,'',location.pathname+location.search+canonical);
   parts.splice(3,parts.length-3,'drafts','quotation');
  }
  // Legacy direct module URLs resolve to the same functional editor, never
  // the historical reference/instruction page.
  const directModule=requested==='tradelink'&&
   ['esi','packing','delivery','payment','quotation','po'].includes(parts[3]);
  state.tradeLinkSection=directModule?'drafts':
   requested==='tradelink'?normalizeTradeLinkSection(parts[3]):'overview';
  const signedDraftRoute=requested==='tradelink'&&state.tradeLinkSection==='drafts';
  const editId=signedDraftRoute&&parts[4]==='edit'&&validUuid(parts[5])?
   parts[5]:null;
  await loadBoard(parts[1],requested,
   signedDraftRoute&&parts[4]!=='edit'?(directModule?parts[3]:parts[4]):null,editId);
  return;
 }
 routeSerial++;state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttView='clock';state.boardId=null;state.board=null;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.view=parts[0]==='boards'?'boards':parts[0]==='settings'?'settings':parts[0]==='acceptance'?'acceptance':parts[0]==='foundation'?'foundation':parts[0]==='security'?'security':parts[0]==='role-configuration'?'role-configuration':parts[0]==='user-role-management'?'user-role-management':'overview';
 if(['role-configuration','user-role-management','foundation','acceptance'].includes(state.view)){
   // Recheck current server authority on EVERY entry, including direct URL visits.
   try{state.roleVerified=await roleConfig.bootstrapVerified();}
   catch{state.roleVerified=false;}
   if(!state.roleVerified){
     state.roleData=null;state.roleError='';
     location.hash=routeHome;return onRoute();
   }
 }
 if(state.view==='user-role-management'){
   state.userRoleBusy=true;render();
   try{await loadUserRoleManagement();}catch(err){state.userRoleError=errorMessage(err);}
   finally{state.userRoleBusy=false;}
 }
 if(state.view==='role-configuration'){
   state.roleBusy=true;render();
   try{await loadRoleConfiguration();}catch(err){state.roleError=errorMessage(err);}
   finally{state.roleBusy=false;}
 }
 if(state.view==='security'){
   // Re-read existing authenticated board grants whenever security is opened.
   try{await refreshWorkspace();state.securityBoardsError='';}
   catch{state.boards=[];state.securityBoardsError='SIGNED_BOARD_LIST_REFRESH_FAILED';}
 }
 if(state.view==='boards'&&state.showArchived&&!state.archived.length){try{state.archived=await db.boards('archived');}catch(err){notice(err);}}
  if(state.view==='boards'&&state.showTrash&&!state.trashed.length){try{state.trashed=await db.boards('trashed');}catch(err){notice(err);}}
 if(state.view==='foundation'){
   state.foundationBusy=true;render();
   try{await refreshFoundation();}catch(err){state.foundationError=errorMessage(err);}
   finally{state.foundationBusy=false;}
 }
 render();
}
function validateAndSubmitAccessRequest(form,event){
 const recipient=form.getAttribute('action')||'';
 if(!/^https:\/{2}formsubmit\.co\/[A-Za-z0-9_-]{8,128}$/.test(recipient)){
  event.preventDefault();
  renderLogin('The administrator has not configured the request mailbox.',{mode:'register'});
  return;
 }
 const fields=new FormData(form);
 const error=validateAccessRequest({
  name:fields.get('name'),email:fields.get('email'),consent:fields.get('consent')==='yes'
 });
 if(error){
  event.preventDefault();
  const message=form.querySelector('[data-request-error]')||document.createElement('p');
  message.className='login-error';message.dataset.requestError='';
  message.setAttribute('role','alert');message.textContent=error;
  form.prepend(message);return;
 }
 // Native POST preserves FormSubmit CAPTCHA and provider confirmation.
 const button=form.querySelector('[type="submit"]');
 if(button)button.disabled=true;
}
async function submitRecoveryRequest(form){
 if(state.authBusy)return;
 const button=form.querySelector('[type="submit"]');
 const email=String(new FormData(form).get('email')||'');
 state.authBusy=true;
 if(button){button.disabled=true;button.textContent='Requesting…';}
 try{
  const result=await requestPasswordRecovery(auth,email);
  if(result.startsWith('Too many'))renderLogin(result,{mode:'forgot'});
  else renderLogin('',{mode:'forgot',notice:result});
 }catch(error){renderLogin(errorMessage(error),{mode:'forgot'});}
 finally{state.authBusy=false;}
}
async function submitRecoveryPassword(form){
 if(state.authBusy)return;
 if(!recoveryContext){renderLogin('Your recovery link is unavailable or expired.',{mode:'forgot'});return;}
 const password=String(new FormData(form).get('password')||'');
 const confirmation=String(new FormData(form).get('confirmation')||'');
 const button=form.querySelector('[type="submit"]');
 state.authBusy=true;
 if(button){button.disabled=true;button.textContent='Updating…';}
 try{
  const result=await applyRecoveredPassword(auth,recoveryContext,password,confirmation);
  recoveryContext=null;
  location.hash='#/login';
  renderLogin('',{mode:'login',notice:result.globalRevoked?
   'Password updated. Other refresh sessions were signed out. Sign in with your new password.':
   'Password updated. Sign in with your new password. Other sessions may remain valid until expiry; contact your administrator if immediate revocation is required.'});
 }catch(error){
  const invalid=error instanceof ApiError&&[400,401,403].includes(error.status);
  if(invalid)recoveryContext=null;
  renderLogin(invalid?'Recovery session expired or could not be verified. Request a new link.':
   errorMessage(error),{mode:invalid?'forgot':'reset'});
 }finally{state.authBusy=false;}
}
// Availability recovery never installs claims from the browser or bypasses
// wm_auth_access_context. A signed session is preserved until the provider
// confirms invalidation or the user explicitly signs out.
let startupRecoveryActive=false;
let startupBusy=false;
function renderBootstrapFailure(error){
 startupRecoveryActive=true;
 platformSync.stop();
 state.context=null;
 state.boards=[];
 state.board=null;
 state.roleVerified=false;
 const denied=error?.status===403;
 const description=denied?
  'The signed account has no verified access to the requested workspace. '+
  'Contact your administrator if your membership should be active.':
  'The authentication or workspace service could not be verified. '+
  'Check your network connection and retry; your existing session is preserved.';
 root.innerHTML='<div class="access-denied" role="alert">'+
  '<div class="denied-panel">'+
   '<img class="brand-mark csp-u059" src="./frontend/apsyntra-logo.webp" alt="" width="37" height="37" decoding="async"/>'+
   '<h1>'+(denied?'Workspace access unavailable':'Connection interrupted')+'</h1>'+
   '<p>'+description+'</p>'+
   '<div class="startup-recovery-actions">'+
    '<button type="button" class="primary" data-action="retry-startup">Retry connection</button>'+
    (auth.isSignedIn?'<button type="button" class="secondary" data-action="logout">Sign out</button>':'')+
   '</div>'+
  '</div></div>';
}
async function login(form){
 if(state.authBusy)return;
 const email=String(new FormData(form).get('email')||'');
 const password=String(new FormData(form).get('password')||'');
 const submit=form.querySelector('[type="submit"]');
 state.authBusy=true;submit.disabled=true;submit.textContent='Signing in…';
 try{
   await auth.signIn(email,password);
   await refreshWorkspace();
   state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;
   // Preserve only the volatile B3 row reference through the same-tab auth handoff.
   const returnToB3=state.ws02dB3HandoffPending&&hasWs02dB3ForeignRlsFixture();
   state.ws02dB3HandoffPending=false;
   location.hash=returnToB3?'#/security':pendingInvitation?.status==='ready'?'#/invitations/accept':routeHome;
   await onRoute();
   toast(returnToB3?'Signed in. In B3, click Step 2 only to test the foreign row.':
    'Successfully signed in.');
 }catch(err){
   if(auth.isSignedIn&&err?.status!==401){
     renderBootstrapFailure(err);
   }else{
     if(err?.status===401)auth.clear();
     boardCacheChannel.stop();db.invalidateBoardCache();state.context=null;renderLogin(errorMessage(err));
   }
 }
 finally{state.authBusy=false;}
}
function hideModal(){if(modal){modal.remove();modal=null;}}
function openModal(title,fields,submit,{submitLabel='Save changes',submitDisabled=false}={}){
 const previousFocus=document.activeElement;
 hideModal();
 modal=document.createElement('div');modal.className='modal-backdrop';modal.setAttribute('role','presentation');
 const view=modal;
 modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal-head"><h2 id="modal-title">${e(title)}</h2><button type="button" class="modal-close" data-dismiss aria-label="Close dialog">×</button></div>
  <form id="modal-form">${fields}<div class="modal-actions"><button class="secondary" type="button" data-dismiss>Cancel</button>
  <button class="primary" type="submit"${submitDisabled?' disabled':''}>${e(submitLabel)}</button></div></form></section>`;
 document.body.append(modal);
 const closeAndRestore=()=>{
  if(modal!==view)return;
  hideModal();
  const target=previousFocus?.isConnected?previousFocus:
   root.querySelector('[data-action="board-column-context"]')||
   root.querySelector('.board-customize-toolbar button')||
   root.querySelector('.head-actions button');
  target?.focus?.();
 };
 view.addEventListener('click',event=>{
  if(event.target===view||event.target.closest('[data-dismiss]'))closeAndRestore();
 });
 view.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();closeAndRestore();return;
  }
  if(event.key!=='Tab')return;
  const focusable=[...view.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
   .filter(el=>!el.hidden&&!el.closest('[hidden]'));
  if(!focusable.length)return;
  if(event.shiftKey&&document.activeElement===focusable[0]){
   event.preventDefault();focusable.at(-1).focus();
  }else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){
   event.preventDefault();focusable[0].focus();
  }
 });
 view.querySelector('form').addEventListener('submit',async event=>{
  event.preventDefault();
  const button=view.querySelector('[type="submit"]');
  if(modal!==view||!button||button.disabled)return;
  button.disabled=true;button.textContent='Saving…';
  try{
   await submit(new FormData(event.currentTarget));
   if(modal===view){closeAndRestore();toast('Changes saved.');}
  }catch(err){
   notice(err);
   if(button.isConnected){
    if(err?.schemaOutcomeUncertain===true){
     button.disabled=true;
     button.textContent='Close and verify board';
    }else{
     button.disabled=false;button.textContent=submitLabel;
    }
   }
  }
 });
 view.querySelector('input,select,textarea')?.focus();
}
const input=(label,key,value='',type='text',required=true)=>
 `<div class="field"><label for="modal-${e(key)}">${e(label)}</label><input id="modal-${e(key)}" name="${e(key)}" type="${e(type)}" value="${e(value)}" ${required?'required':''} maxlength="180"/></div>`;
const select=(label,key,choices,current)=>
 `<div class="field"><label for="modal-${e(key)}">${e(label)}</label><select id="modal-${e(key)}" name="${e(key)}">${choices.map(([value,text])=>`<option value="${e(value)}" ${current===value?'selected':''}>${e(text)}</option>`).join('')}</select></div>`;
const priorities=[['0','None'],['1','Low'],['2','Medium'],['3','High'],['4','Urgent']];
const statuses=[['tracker:status:Todo','To do'],['tracker:status:InProgress','In progress'],['tracker:status:Done','Done'],['tracker:status:Blocked','Blocked']];
async function writeGuard(){if(!state.boardId||!await db.allowed(state.boardId,'edit'))throw new ApiError('No edit permission for this board.',403);}
async function moveManagedTimeTrackerTab(from,to){
 if(state.tabMoveBusy||!activeBoardLayout()||!state.boardManage)return false;
 const board=state.board.board,settings=state.boardUi;
 const snapshot={boardId:board.id,userId:state.context.user_id,
  workspaceId:state.context.workspace_id};
 state.tabMoveBusy=true;
 try{
  const saved=await reorderManagedTimeTrackerTabs({
   auth,api:db,structure:boardStructureClient,board,settings,
   context:state.context,from,to
  });
  if(!boardHistoryAuthorized(snapshot))return false;
  state.boardUi=saved;
  state.tabMoveBusy=false;
  render();toast('Shared board view order saved.');
  return true;
 }finally{
  state.tabMoveBusy=false;
 }
}
function activeBoardLayout(){
 if(state.view!=='board'||!auth.isSignedIn||auth.userId!==state.context?.user_id||
    state.board?.board?.id!==state.boardId||
    state.board?.board?.workspace_id!==state.context?.workspace_id)return null;
 const moduleKey=moduleByBoardName(state.board.board.name)?.key;
 const tabs=['items','issues',...(moduleKey==='frt'?['finance']:[]),
  ...(moduleKey==='fueltrans'?['fueltrans']:[]),...(moduleKey==='timetracker'?['attendance']:[])];
 const minimal=isItemOnlyBoard(state.board,state.boardUi);
 const columns=(moduleKey?boardGridColumns(state.board,{allowCustom:BOARD_STRUCTURE_ADMIN_ENABLED&&state.boardUi?.status==='VERIFIED_READ'}):genericBoardColumns(state.board,{minimal,hiddenVirtual:state.boardUi?.hiddenVirtual})).map(c=>c.key);
 const pref=loadBoardLayout(state.context,state.boardId,tabs,columns);
 if(minimal)pref.columns=itemOnlyColumnKeys(columns,state.boardUi);
 return {tabs,columns,pref};
}
function persistBoardLayout(transform){
 const a=activeBoardLayout();
 if(!a)return false;
 const changed=normalizeLayout(transform(a.pref,a),a.tabs,a.columns);
 return saveBoardLayout(state.context,state.boardId,changed);
}
let boardHistory=null;
function boardHistoryAuthorized(snapshot){
 return snapshot&&auth.isSignedIn&&
  state.view==='board'&&state.boardId===snapshot.boardId&&
  state.context?.workspace_id===snapshot.workspaceId&&
  auth.userId===snapshot.userId&&
  activeBoardLayout()!==null;
}
function redrawBoardHistory({focus=false}={}){
 if(!modal||!boardHistoryAuthorized(boardHistory)){hideModal();boardHistory=null;return;}
 const host=modal.querySelector('[data-board-activity-results]');
 if(!host)return;
 if(boardHistory.mode==='cursor'){
  const result=boardHistory.pages[boardHistory.index];
  host.innerHTML=renderBoardColumnRecoveryList(boardHistory.recoveries)+
   renderBoardAuditCursorPage(result,{
   pageIndex:boardHistory.index,busy:boardHistory.busy,error:boardHistory.error,
   cachedNext:boardHistory.index<boardHistory.pages.length-1
  });
  return;
 }
 const results=renderBoardActivityResults(boardHistory.rows,boardHistory);
 boardHistory.page=results.page;
 host.innerHTML=renderBoardColumnRecoveryList(boardHistory.recoveries)+results.html;
 if(focus){
  const search=host.querySelector('#board-activity-search');
  search?.focus();search?.setSelectionRange(search.value.length,search.value.length);
 }
}
async function openBoardActivity(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 let recoveries=[];
 if(isQaBoardRecoveryInterfaceAllowed(state.board)&&state.boardManage){
  try{recoveries=await boardColumnRecovery.list(snapshot.boardId);}
  catch{toast('Column recovery list is unavailable; no data changed.',true);}
 }
 const cursorMode=BOARD_COL01_AUDIT_CURSOR_ENABLED;
 const events=cursorMode?
  await loadBoardAuditCursorPage(db,snapshot.boardId):
  await db.boardEvents(snapshot.boardId,100);
 if(!boardHistoryAuthorized(snapshot))return;
 boardHistory=cursorMode?
  {...snapshot,recoveries,mode:'cursor',pages:[events],index:0,busy:false,error:''}:
  {...snapshot,recoveries,rows:normalizeBoardActivity(events),limit:100,
   search:'',type:'all',actor:'all',page:0,busy:false,error:''};
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-history-backdrop';
 modal.innerHTML='<section class="modal board-history-modal" role="dialog" aria-modal="true" aria-labelledby="board-activity-title">'+
  '<div class="modal-head"><h2 id="board-activity-title">Board activity history</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close activity history">×</button></div>'+
  '<p class="muted">'+(cursorMode?'Signed server-paginated board events. Older pages use a protected audit cursor.':'Read-only signed board events. Filters apply to records retrieved from the authoritative server.')+'</p>'+
  '<div data-board-activity-results></div></section>';
 document.body.append(modal);
 modal.addEventListener('click',async event=>{
  if(event.target===modal||event.target.closest('[data-dismiss]')){hideModal();boardHistory=null;return;}
  const action=event.target.closest('[data-board-history-action]')?.dataset.boardHistoryAction;
  if(!action||!boardHistoryAuthorized(boardHistory)||boardHistory.busy)return;
  if(action==='restore-column'){
   if(!isQaBoardRecoveryInterfaceAllowed(state.board)||!state.boardManage)return;
   const current=boardHistory;
   const entry=current.recoveries?.find(x=>x.deletionId===
     event.target.closest('[data-board-history-action]')?.dataset.id);
   if(!entry?.restorable)return;
   current.busy=true;redrawBoardHistory();
   try{
    const fresh=await verifyInlineColumnBoard({...current,
     boardRevision:state.board?.board?.updated_at});
    await boardColumnRecovery.restore(fresh,entry);
    if(boardHistory!==current||!boardHistoryAuthorized(current))return;
    hideModal();boardHistory=null;
    await loadBoard(current.boardId,'items');
    toast('Column restored with its original stored values.');
   }catch(err){
    if(boardHistory===current){
     current.error='Column restoration could not be confirmed. Refresh and review Activity.';
     notice(err);
    }
   }finally{
    if(boardHistory===current){current.busy=false;redrawBoardHistory();}
   }
   return;
  }
  if(boardHistory.mode==='cursor'){
   const current=boardHistory;
   if(action==='cursor-previous'&&current.index>0)current.index--;
   else if(action==='cursor-next'){
    if(current.index<current.pages.length-1)current.index++;
    else if(current.pages.length<BOARD_COL01_AUDIT_MAX_PAGES&&
     current.pages[current.index]?.hasMore){
     current.busy=true;redrawBoardHistory();
     try{
      const page=await loadBoardAuditCursorPage(db,current.boardId,{
       beforeId:current.pages[current.index].nextCursor});
      if(!boardHistoryAuthorized(current)||boardHistory!==current)return;
      current.pages.push(page);current.index++;current.error='';
     }catch{if(boardHistory===current)current.error='Older audit events could not be loaded.';}
     finally{current.busy=false;}
    }
   }else if(action==='cursor-refresh'){
    current.busy=true;redrawBoardHistory();
    try{
     const page=await loadBoardAuditCursorPage(db,current.boardId);
     if(!boardHistoryAuthorized(current)||boardHistory!==current)return;
     current.pages=[page];current.index=0;current.error='';
    }catch{if(boardHistory===current)current.error='Audit events could not be refreshed.';}
    finally{current.busy=false;}
   }
   redrawBoardHistory();return;
  }
  if(action==='next')boardHistory.page++;
  if(action==='previous')boardHistory.page--;
  if(['more','refresh'].includes(action)){
   const current=boardHistory;
   current.busy=true;redrawBoardHistory();
   try{
    const limit=action==='more'?200:current.limit;
    const rows=await db.boardEvents(current.boardId,limit);
    if(!boardHistoryAuthorized(current)||boardHistory!==current)return;
    current.rows=normalizeBoardActivity(rows);current.limit=limit;current.page=0;current.error='';
   }catch(err){if(boardHistory===current)current.error='Activity could not be refreshed. Retry after checking your signed access.';}
   finally{current.busy=false;}
  }
  redrawBoardHistory();
 });
 modal.addEventListener('input',event=>{
  if(event.target.id!=='board-activity-search'||!boardHistory)return;
  boardHistory.search=event.target.value.slice(0,160);
  boardHistory.page=0;redrawBoardHistory({focus:true});
 });
 modal.addEventListener('change',event=>{
  if(!boardHistory)return;
  if(event.target.id==='board-activity-type')boardHistory.type=event.target.value;
  else if(event.target.id==='board-activity-actor')boardHistory.actor=event.target.value;
  else return;
  boardHistory.page=0;redrawBoardHistory();
 });
 redrawBoardHistory();modal.querySelector('[data-dismiss]')?.focus();
}
async function openBoardItemDetails(itemId){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 // Revalidate server-side board access before revealing details from cached state.
 if(!(await db.allowed(snapshot.boardId,'view'))||!boardHistoryAuthorized(snapshot))return;
 const item=state.board?.items?.find(x=>x.id===itemId);
 if(!item)return;
 const restricted=!!moduleByBoardName(state.board.board.name);
 const group=state.board.groups?.find(x=>x.id===item.group_id);
 const collaboration=await loadBoardCollaboration(db,itemId).catch(()=>({status:'ERROR'}));
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-detail-backdrop';
 modal.innerHTML='<aside class="board-item-drawer" role="dialog" aria-modal="true" aria-labelledby="board-detail-title">'+
  '<div class="board-item-drawer-header"><span class="label-top">APSYNTRA CRM / Board item</span>'+
  '<button type="button" class="modal-close" data-dismiss aria-label="Close item details">×</button></div>'+
  '<h2 id="board-detail-title">'+e(item.title||'Untitled')+'</h2>'+
  '<p class="muted">Read-only item details from the signed board response.</p>'+
  boardItemSummary(item,{groupTitle:group?.title||'Ungrouped',restricted})+
  renderBoardCollaboration(collaboration)+
  '</aside>';
 document.body.append(modal);
 modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-dismiss]'))hideModal();});
 modal.querySelector('[data-dismiss]')?.focus();
}
async function openBoardMembers(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 const detail=await db.board(snapshot.boardId);
 if(!boardHistoryAuthorized(snapshot)||detail.board?.workspace_id!==snapshot.workspaceId)return;
 // The existing signed board RPC returns only this board's membership.
 const members=Array.isArray(detail.members)?detail.members:[];
 const directory=await loadBoardInvitableDirectory(db,snapshot.boardId)
  .catch(()=>({status:'ERROR'}));
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-history-backdrop';
 modal.innerHTML='<section class="modal board-history-modal" role="dialog" aria-modal="true" aria-labelledby="board-members-title">'+
  '<div class="modal-head"><h2 id="board-members-title">Board members</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close board members">×</button></div>'+
  '<p class="muted">Existing authorized membership. New invitations require a verified server-side same-workspace and role-ceiling contract.</p>'+
  '<div class="board-member-list">'+(members.length?members.map(row=>
    '<div class="board-member"><strong>'+e(row.display_name||'Registered user')+'</strong>'+
    '<span>'+e(row.role||'Member')+'</span></div>').join(''):
    '<p>No board membership records were returned.</p>')+'</div>'+
  '<div data-col01-directory-results>'+renderBoardInvitableDirectory(directory)+'</div></section>';
 document.body.append(modal);
 const view=modal;
 view.addEventListener('submit',async event=>{
  if(!event.target.matches('[data-col01-directory-search]'))return;
  event.preventDefault();
  if(!boardHistoryAuthorized(snapshot))return;
  const query=event.target.elements.namedItem('query')?.value||'';
  let result;
  try{result=await loadBoardInvitableDirectory(db,snapshot.boardId,{query});}
  catch{result={status:'ERROR'};}
  if(view!==modal||!boardHistoryAuthorized(snapshot))return;
  const host=view.querySelector('[data-col01-directory-results]');
  if(host)host.innerHTML=renderBoardInvitableDirectory(result);
 });
 view.addEventListener('click',event=>{if(event.target===view||event.target.closest('[data-dismiss]'))hideModal();});
 view.querySelector('[data-dismiss]')?.focus();
}

async function openTimeTrackerBoardProjectedGps(){
 if(!TT_BOARD_GPS_PROJECTION_ENABLED||
  !(state.roleVerified===true||state.ttBoardGpsEligible===true)||
  !activeBoardLayout()||state.tab!=='items'||moduleByBoardName(state.board?.board?.name)?.key!=='timetracker')return;
 const snapshot={boardId:state.boardId,userId:auth.userId,
  workspaceId:state.context.workspace_id};
 const details=await loadTimeTrackerBoardGps({
  auth,api:db,boardId:snapshot.boardId,workspaceId:snapshot.workspaceId
 });
 if(!boardHistoryAuthorized(snapshot)||details.status!=='VERIFIED_READ')return;
 hideModal();modal=document.createElement('div');
 const current=modal;
 current.className='modal-backdrop board-history-backdrop';
 current.innerHTML='<section class="modal board-history-modal board-structure-modal" '+
  'role="dialog" aria-modal="true" aria-labelledby="tt-board-gps-title">'+
  '<div class="modal-head"><h2 id="tt-board-gps-title">TimeTracker attendance — restricted GPS</h2>'+
  '<button type="button" class="modal-close" data-dismiss aria-label="Close GPS table">×</button></div>'+
  '<div class="board-structure-scroll" role="region" aria-label="Authorized attendance table" tabindex="0">'+
  renderTimeTrackerBoardGps(details)+'</div></section>';
 document.body.append(current);
 current.addEventListener('click',event=>{
  if(event.target===current||event.target.closest('[data-dismiss]')){
   if(current===modal)hideModal();
  }
 });
 current.querySelector('[data-dismiss]')?.focus();
}


/** Contextual column actions remain on the current board and use its existing
 * signed, audited server CAS writer. No Manage Columns navigation is required.
 */
async function verifyInlineColumnBoard(snapshot){
 if(!BOARD_STRUCTURE_ADMIN_ENABLED||!state.boardManage||!state.board||
    state.boardId!==snapshot.boardId||state.context?.user_id!==snapshot.userId||
    state.context?.workspace_id!==snapshot.workspaceId)
  throw new ApiError('Board context or manager permission changed.',403);
 const [user,ctx,fresh,allowed]=await Promise.all([
  auth.getVerifiedUser(),db.context(),db.board(snapshot.boardId),
  db.allowed(snapshot.boardId,'manage')
 ]);
 if(user?.id!==snapshot.userId||ctx?.user_id!==snapshot.userId||
    ctx?.profile?.status!=='active'||ctx?.workspace_id!==snapshot.workspaceId||
    allowed!==true||!canManuallyEditBoard(fresh?.board,true)||
    fresh?.board?.id!==snapshot.boardId||
    fresh?.board?.workspace_id!==snapshot.workspaceId)
  throw new ApiError('Signed board manager authorization is no longer valid.',403);
 if(fresh.board.updated_at!==snapshot.boardRevision)
  throw new ApiError('Board columns changed since this menu was opened. Refresh and review.',409);
 const session=await db.rpc('wm_board_ui_read',{p_board_id:snapshot.boardId});
 if(session?.board_id!==snapshot.boardId)
  throw new ApiError('Active signed board session is required.',403);
 return fresh;
}
function inlineColumnSnapshot(){
 if(!state.board?.board||!state.context)return null;
 return {boardId:state.boardId,userId:state.context.user_id,
  workspaceId:state.context.workspace_id,boardRevision:state.board.board.updated_at};
}
function contextualColumnEditor(key){
 const snapshot=inlineColumnSnapshot();
 if(!snapshot||!state.boardManage)return;
 const column=resolveInlineColumn(state.board,key,{canManage:state.boardManage});
 if(column.kind==='primary'){
  openModal('Rename Item column',
   input('Main title column label','primaryLabel',state.boardUi?.primaryLabel||'Item'),
   async fd=>{
    const fresh=await verifyInlineColumnBoard(snapshot);
    const settings=await boardStructureClient.read(snapshot.boardId);
    await boardStructureClient.save(fresh,{...settings,
     primaryLabel:String(fd.get('primaryLabel')||'')});
    await loadBoard(snapshot.boardId,'items');
   });
  return;
 }
 const storedCount=columnStoredValueCount(state.board,column.id);
 const existing=column.type;
 const form=input('Column name','name',column.name)+
  select('Column type','type',BOARD_STRUCTURE_TYPES.map(t=>[t,t]),existing)+
  '<p class="muted">Type conversion is denied for populated columns. '+storedCount+
   ' stored value'+(storedCount===1?'':'s')+' detected.</p>'+
  '<div class="field"><label for="modal-column-options">Status/Dropdown labels (one per line)</label>'+
  '<textarea id="modal-column-options" name="options" maxlength="4100" rows="3">'+
   e(columnOptionLines(column))+'</textarea></div>'+
  '<div class="field"><label><input type="checkbox" name="visible" '+
   (column.visible?'checked ':'')+'/> Visible on board</label></div>';
 openModal('Configure '+column.name+' column',form,async fd=>{
  const fresh=await verifyInlineColumnBoard(snapshot);
  const target=resolveInlineColumn(fresh,key,{canManage:true});
  if(target.type!==existing||target.name!==column.name)
   throw new ApiError('Column changed while editing. Refresh and review.',409);
  const update=prepareInlineColumnUpdate(fresh,target,fd);
  const sameType=update.type===target.type;
  const config=['status','dropdown'].includes(update.type)?
   parseChoiceConfig(update.type,fd.get('options'),sameType?target.config:{}):
   sameType?target.config:{};
  await boardStructureClient.mutate(fresh,{action:'update',columnId:target.id,
   name:update.name,type:update.type,config,visible:update.visible});
  await loadBoard(snapshot.boardId,'items');
 });
}
function contextualColumnDelete(key){
 const snapshot=inlineColumnSnapshot();
 if(!snapshot||!state.boardManage)return;
 const column=resolveInlineColumn(state.board,key,{canManage:true});
 if(column.kind==='primary')
  throw new ApiError('The required Item column cannot be deleted.',403);
 const storedCount=columnStoredValueCount(state.board,column.id);
 const qaRecoveryEnabled=canStartB4QaRecoveryDeletion(state.board,column);
 const recoverable=storedCount>0&&qaRecoveryEnabled;
 const blocked=storedCount>0&&!qaRecoveryEnabled;
 const summary=blocked?
  'This column has '+storedCount+' stored value row'+(storedCount===1?'':'s')+
  '. It is not empty. The current server safely denies its deletion. '+
  'Recoverable deletion requires an activated, tested private backup and restore contract. '+
  'Nothing has been deleted; you may hide this column without losing its data.':
  recoverable?
   'This column contains '+storedCount+' stored value row'+(storedCount===1?'':'s')+
   '. Deletion will first store a private transactional recovery snapshot. '+
   'Authorized managers can restore its original values from Board Activity.':
   'This custom column has zero stored value rows. '+
   'Deletion removes only this column and records an Activity event.';
 openModal('Delete '+column.name+' column',
  '<p class="note security-note">'+e(summary)+'</p>'+
  (blocked?'':input('Type DELETE '+column.name+' exactly','confirmation','')),
  async fd=>{
   const fresh=await verifyInlineColumnBoard(snapshot);
   const target=resolveInlineColumn(fresh,key,{canManage:true});
   if(target.name!==column.name)
    throw new ApiError('Column was renamed. Reopen deletion confirmation.',409);
   const valuesNow=columnStoredValueCount(fresh,target.id);
   if(valuesNow!==storedCount)
    throw new ApiError('Stored column values changed. Refresh and review before deleting.',409);
   const confirmation=confirmInlineColumnDelete(target,String(fd.get('confirmation')||''));
   if(valuesNow>0){
    await boardColumnRecovery.delete(fresh,target,confirmation);
   }else{
    try{
     await boardStructureClient.mutate(fresh,{action:'delete',columnId:target.id,
      confirmation});
    }catch(error){throw explainColumnDeleteError(error);}
   }
   await loadBoard(snapshot.boardId,'items');
  },{submitLabel:blocked?'Deletion unavailable':
   recoverable?'Delete with recovery':'Delete empty column',
   submitDisabled:blocked});
}
function contextualColumnCreate(){
 const snapshot=inlineColumnSnapshot();
 if(!snapshot||!state.boardManage||!activeBoardLayout()||
    !canManuallyEditBoard(state.board?.board,true))return;
 const fields=input('Column name','name','')+
  '<div class="field"><label for="modal-type">Column type</label>'+
  '<select name="type" id="modal-type">'+renderColumnTypeOptions()+'</select></div>'+
  '<div class="field"><label for="modal-column-options">Status/Dropdown options (one per line)</label>'+
  '<textarea name="options" id="modal-column-options" rows="3" maxlength="4100"></textarea></div>';
 openModal('Add column to this board',fields,async fd=>{
  const fresh=await verifyInlineColumnBoard(snapshot);
  const selection=resolveColumnTypeSelection(String(fd.get('type')||'text'),
   fd.get('options'));
  await boardStructureClient.mutate(fresh,{action:'create',name:String(fd.get('name')||''),
   type:selection.type,config:parseChoiceConfig(selection.type,selection.options)});
  await loadBoard(snapshot.boardId,'items');
 },{submitLabel:'Add column'});
}
async function openBoardStructure(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,
  workspaceId:state.context.workspace_id};
 const detail=state.board;
 const moduleKey=moduleByBoardName(detail.board.name)?.key;
 const availableTabs=[
  {key:'items',title:'Board items'},{key:'issues',title:'APSYNTRA Issues'},
  ...(moduleKey==='frt'?[{key:'finance',title:'FRT finance'}]:[]),
  ...(moduleKey==='timetracker'?[{key:'attendance',title:'TimeTracker attendance'}]:[])
 ];
 const settings=state.boardUi||await boardStructureClient.read(snapshot.boardId);
 const canManage=BOARD_STRUCTURE_ADMIN_ENABLED&&
  await db.allowed(snapshot.boardId,'manage');
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 const view=modal;
 view.className='modal-backdrop board-history-backdrop';
 view.innerHTML='<section class="modal board-history-modal board-structure-modal" role="dialog" '+
  'aria-modal="true" aria-labelledby="board-structure-title">'+
  '<div class="modal-head"><h2 id="board-structure-title">Board structure &amp; views</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close settings">×</button></div>'+
  '<div class="board-structure-scroll" role="region" aria-label="Board structure form" tabindex="0">'+
  renderBoardStructureAdmin(detail,settings,{canManage,availableTabs})+'</div></section>';
 document.body.append(view);
 const authorized=()=>view===modal&&boardHistoryAuthorized(snapshot);
 const syncColumnPicker=()=>{
  const select=view.querySelector('#structure-new-type');
  if(!select)return;
  const chosen=select.value;
  view.querySelectorAll('[data-column-type]').forEach(button=>{
   button.setAttribute('aria-pressed',String(button.dataset.columnType===chosen));
  });
  const options=view.querySelector('[data-structure-choice-options]');
  if(options)options.hidden=!(chosen==='status'||chosen==='dropdown');
  const rating=view.querySelector('[data-structure-rating-config]');
  if(rating)rating.hidden=chosen!=='rating';
  const percentage=view.querySelector('[data-structure-percentage-config]');
  if(percentage)percentage.hidden=chosen!=='percentage';
 };
 view.addEventListener('input',event=>{
  const search=event.target.closest('[data-column-catalog-search]');
  if(!search||!authorized())return;
  const words=search.value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  view.querySelectorAll('[data-column-group]').forEach(group=>{
   let count=0;
   group.querySelectorAll('[data-column-type]').forEach(button=>{
    const haystack=button.dataset.columnSearchWords||'';
    const visible=words.every(word=>haystack.includes(word));
    button.hidden=!visible;
    if(visible)count++;
   });
   group.hidden=count===0;
  });
 });
 view.addEventListener('click',event=>{
  const button=event.target.closest('[data-column-type]');
  if(!button||!authorized()||!canManage)return;
  const select=view.querySelector('#structure-new-type');
  if(!select||select.disabled)return;
  select.value=button.dataset.columnType;
  if(select.value==='priority_preset'){
   const name=view.querySelector('#structure-new-name');
   if(name&&!name.value.trim())name.value='Priority';
  }
  syncColumnPicker();
  select.focus();
 });
 view.addEventListener('change',event=>{
  if(event.target.matches('#structure-new-type'))syncColumnPicker();
 });
 syncColumnPicker();
 view.addEventListener('submit',async event=>{
  const form=event.target;
  if(!form.matches('[data-structure-form]'))return;
  event.preventDefault();
  if(!authorized()||!canManage||!BOARD_STRUCTURE_ADMIN_ENABLED)return;
  const submit=form.querySelector('[type="submit"]');
  if(!submit||submit.disabled)return;
  submit.disabled=true;
  try{
   const fd=new FormData(form);
   if(form.dataset.structureForm==='settings'){
    const currentTabs=new Map((settings.tabs||[]).map(t=>[t.key,t]));
    const tabs=availableTabs.map((t,index)=>({
     key:t.key,label:String(fd.get('label:'+t.key)||t.title).trim(),
     visible:t.key==='items'||fd.has('visible:'+t.key),
     position:Number(fd.get('order:'+t.key))||currentTabs.get(t.key)?.position||index+1
    })).sort((a,b)=>a.position-b.position).map(({position,...tab})=>tab);
    const columnLabels=Object.fromEntries(describeBoardColumns(detail)
     .filter(col=>col.kind==='custom').map(col=>
      [col.id,String(fd.get('columnLabel:'+col.id)||col.name||'').trim()]));
    await boardStructureClient.save(detail,{
     ...settings,primaryLabel:String(fd.get('primaryLabel')||''),
     tabs,columnLabels
    });
   }else if(form.dataset.structureForm==='create'){
    const selection=resolveColumnTypeSelection(String(fd.get('type')||'text'),
     fd.get('options'));
    await boardStructureClient.mutate(detail,{
     action:'create',name:String(fd.get('name')||''),
     type:selection.type,
     config:['phone','rating','percentage'].includes(selection.type)?
      cmp02CreationConfig(selection.type,{
       max:fd.get('ratingMax'),decimals:fd.get('percentageDecimals')
      }):parseChoiceConfig(selection.type,selection.options)
    });
   }else return;
   if(!authorized())return;
   hideModal();await loadBoard(snapshot.boardId,state.tab);
   toast('Board configuration saved.');
  }catch(err){
   if(authorized())notice(err);
   if(submit.isConnected)submit.disabled=false;
  }
 });
 view.addEventListener('click',async event=>{
  if(event.target===view||event.target.closest('[data-dismiss]')){
   if(authorized())hideModal();
   return;
  }
  if(!authorized()||!canManage||!BOARD_STRUCTURE_ADMIN_ENABLED)return;
  const virtualToggle=event.target.closest('[data-structure-virtual-toggle]');
  if(virtualToggle){
   const columnKey=virtualToggle.dataset.structureVirtualToggle;
   const visible=(settings.hiddenVirtual||[]).includes(columnKey);
   virtualToggle.disabled=true;
   try{
    await setOptionalVirtualColumnVisibility({
     auth,api:db,structure:boardStructureClient,boardId:snapshot.boardId,
     columnKey,visible
    });
    if(!authorized())return;
    hideModal();await loadBoard(snapshot.boardId,state.tab);
    toast(visible?'Optional board column restored.':'Optional board column removed from display; stored values preserved.');
   }catch(err){if(authorized())notice(err);}
   finally{if(virtualToggle.isConnected)virtualToggle.disabled=false;}
   return;
  }
  if(event.target.closest('[data-structure-enable-item-only]')){
   if(!confirm('Use Item-only display for this ordinary board? Existing custom columns and all data remain stored.'))return;
   try{
    await enableItemOnlyBoard({api:db,structure:boardStructureClient,auth,boardId:snapshot.boardId});
    if(!authorized())return;
    hideModal();await loadBoard(snapshot.boardId,state.tab);toast('Item-only display saved.');
   }catch(err){if(authorized())notice(err);}
   return;
  }
  const edit=event.target.closest('[data-structure-edit]');
  const remove=event.target.closest('[data-structure-delete]');
  if(!edit&&!remove)return;
  const id=(edit||remove).dataset[edit?'structureEdit':'structureDelete'];
  const column=describeBoardColumns(detail).find(c=>c.id===id&&c.deletable);
  if(!column)return;
  if(edit){
   openModal('Edit custom column',input('Column name','name',column.name)+
    select('Column type','type',BOARD_STRUCTURE_TYPES.map(t=>[t,t]),column.type)+
    '<div class="field"><label for="modal-column-options">Choice options (Status / Dropdown only; one per line)</label>'+ 
    '<textarea id="modal-column-options" name="options" maxlength="4100" rows="3">'+e(columnOptionLines(column))+'</textarea></div>'+ 
    '<div class="field"><label><input type="checkbox" name="visible" '+
    (column.visible?'checked ':'')+'/> Visible on board</label></div>',
    async fd=>{
     if(!boardHistoryAuthorized(snapshot))throw new ApiError('Board context changed.',403);
     await boardStructureClient.mutate(detail,{action:'update',columnId:column.id,
      name:String(fd.get('name')||''),type:String(fd.get('type')||''),
      config:parseChoiceConfig(String(fd.get('type')||''),fd.get('options'),
       String(fd.get('type')||'')===column.type?column.config:{}),
      visible:fd.has('visible')});
     await loadBoard(snapshot.boardId,state.tab);
    });
  }else{
   const confirmation=window.prompt('Deleting '+column.name+
    ' is irreversible. Existing values must be absent. Type DELETE '+column.name+' to confirm:');
   if(confirmation===null)return;
   try{
    await boardStructureClient.mutate(detail,{action:'delete',columnId:column.id,
     confirmation});
    if(!authorized())return;
    hideModal();await loadBoard(snapshot.boardId,state.tab);
    toast('Empty custom column removed.');
   }catch(err){if(authorized())notice(err);}
  }
 });
 view.querySelector('[data-dismiss]')?.focus();
}

async function action(name,button){
 switch(name){
 case 'profile-name-edit':{
  if(state.view!=='settings'||!state.context||!auth.isSignedIn)return;
  const section=button.closest('.settings-profile-editor');
  if(!section)return;
  section.querySelector('[data-profile-name-form]').hidden=false;
  section.querySelector('[data-profile-name-view]').hidden=true;
  button.hidden=true;
  const input=section.querySelector('#settings-display-name');
  input.value=state.context.profile?.display_name||state.context.profile?.email?.split('@')[0]||'Member';
  input.focus();
  input.select();
  break;
 }
 case 'profile-name-cancel':{
  const section=button.closest('.settings-profile-editor');
  if(!section)return;
  section.querySelector('[data-profile-name-form]').hidden=true;
  section.querySelector('[data-profile-name-view]').hidden=false;
  section.querySelector('.settings-name-edit').hidden=false;
  section.querySelector('[data-profile-name-status]').textContent='';
  section.querySelector('.settings-name-edit').focus();
  break;
 }
 case 'retry-startup':{
   if(startupBusy)break;
   root.innerHTML='<div class="access-denied" role="status">'+
     '<div class="denied-panel"><h1>Retrying verified startup…</h1>'+
     '<p>Checking your existing session and authorized workspace.</p></div></div>';
   await boot();
   break;
 }
 case 'toggle-password':{
  const target=String(button.dataset.passwordTarget||'password');
  if(!['password','register-password','register-confirm','reset-password','reset-confirm'].includes(target))break;
  const f=root.querySelector('#'+target);
  if(f){f.type=f.type==='password'?'text':'password';button.textContent=f.type==='password'?'Show':'Hide';button.setAttribute('aria-label',f.type==='password'?'Show password':'Hide password');button.setAttribute('aria-pressed',String(f.type==='text'));}
  break;
 }
 case 'security-tl03-revoke-run':
 case 'security-ws02d-b3-revoke-run':
 case 'security-ws02d-b3-rls-handoff':
  case 'logout':{
    const isTl03LocalRevoke=name==='security-tl03-revoke-run';
    const isB3LocalRevoke=name==='security-ws02d-b3-revoke-run';
    const isB3RlsHandoff=name==='security-ws02d-b3-rls-handoff';
    if(isB3RlsHandoff){
      if(state.view!=='security'||!auth.isSignedIn||!state.context||
         state.ws02dB3RlsBusy||!hasWs02dB3ForeignRlsFixture())break;
      if(!confirm('Sign out ONLY this browser session and sign in as a DIFFERENT existing user in a DIFFERENT workspace? The captured row stays in this tab for up to 15 minutes. Do not refresh the page.'))break;
    }
    if(isTl03LocalRevoke){
      if(!state.tl03RevokeArmed||state.view!=='security'||
         !auth.isSignedIn||!state.context)break;
      let outcome;
      try{outcome=await runTradeLinkLocalSessionRevocation({auth,api:db});}
      catch{outcome={status:'BLOCKED',stage:'prerequisite'};}
      state.tl03RevokeArmed=false;
      state.tl03RevokedReport=outcome;
      if(auth.isSignedIn){
        // Failed prerequisites never end the current signed session.
        render();toast('TradeLink revocation: '+outcome.status,outcome.status!=='PASS');break;
      }
    }
    if(isB3LocalRevoke&&(!state.ws02dB3RevokeArmed||state.view!=='security'||
       !auth.isSignedIn||!state.context))break;
    pendingInvitation=null;invitationAcceptanceStatus='';
    startupRecoveryActive=false;
    closeWorkspacePanels();clearBulkActivation();platformSync.stop();
    let revoked=null;
    if(isB3LocalRevoke){
      try{revoked=await runWs02dB3LocalSessionRevocation({auth});}
      catch{revoked={status:'BLOCKED',stage:'post-signout-network'};}
      // Even a failed acceptance MUST honor this explicitly clicked local logout.
      if(auth.isSignedIn)await auth.signOut({scope:'local'});
    }
    if(isB3RlsHandoff){
      // No JWT replay: B3 RLS handoff is distinct from revoked-session acceptance.
      // Retain only the ephemeral module reference; never copy it into storage.
      state.ws02dB3HandoffPending=true;
      await auth.signOut({scope:'local'});
    }
    state.row01Busy=false;state.row01Result=null;state.inlineCell=null;state.inlineAddBusy=false;state.inlineCellBusy=false;if(!isB3LocalRevoke&&!isTl03LocalRevoke&&!isB3RlsHandoff)await auth.signOut();stopTimeTrackerClock();state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};boardCacheChannel.stop();db.invalidateBoardCache();state.tradeLinkActivity=null;state.tradeLinkActivityError='';state.tradeLinkActivityBusy=false;state.tl03ReadRunId++;state.tl03ReadBusy=false;state.tl03ReadResult=null;state.context=null;state.ws01B2RunId++;state.ws01B2Busy=false;state.ws01B2Result=null;state.ws02dB3RunId++;state.ws02dB3Busy=false;state.ws02dB3Report=null;state.ws02dB3HttpsRunId++;state.ws02dB3HttpsBusy=false;state.ws02dB3HttpsReport=null;state.ws02dB3RlsRunId++;state.ws02dB3RlsBusy=false;state.ws02dB3RlsReport=null;state.ws02dB3RevokeArmed=false;state.ws02dB3RevokedReport=revoked;state.b2QaRunId++;state.b2QaBusy=false;state.b2QaReport=null;state.b4QaRunId++;state.b4QaBusy=false;state.b4QaReport=null;state.phaseBDenialRunId++;state.phaseBDenialBusy=false;state.phaseBDenialReport=null;state.roleVerified=false;state.roleData=null;state.userRoleData=null;state.boards=[];state.board=null;state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;location.hash='#/login';state.tl03RevokeArmed=false;state.tl03RevokedReport=isTl03LocalRevoke?state.tl03RevokedReport:null;renderLogin();toast(isB3RlsHandoff?'Local sign-out complete. Sign in as another existing user in another workspace; then click B3 Step 2 without refreshing.':
     isTl03LocalRevoke?'Signed out of this session only. TradeLink revocation: '+(state.tl03RevokedReport?.status||'BLOCKED')+'.':
     isB3LocalRevoke?'Signed out of this session only. B3 revocation: '+(revoked?.status||'BLOCKED')+'.':'Signed out successfully.');break;}
 case 'ws01-open':{
   if(!auth.isSignedIn||!state.context)break;
   openWorkspaceSelector({id:state.context.workspace_id,name:workspaceName()},
    {lifecycle:workspaceLifecycleClient,onOpenCurrent:()=>{location.hash='#/overview';},
     configurationEnabled:WS01_CONFIGURATION_ENABLED,
     invitationEnabled:WS02D_INVITE_CLIENT_ENABLED,
     sendInvitation:request=>workspaceInvitationClient.send(request),
     switchingEnabled:WS01_SWITCHING_ENABLED,
     onWorkspaceSwitched:()=>{
      // Reload only after a verified server-side scope change. The fresh app
      // startup must rebuild every board/module/role cache for the new scope.
      location.hash='#/overview';
      location.reload();
     }});
   break;
 }
 case 'ws02d-accept-invitation':{
  if(!WS02D_ACCEPTANCE_ENABLED||invitationAcceptanceBusy||
     pendingInvitation?.status!=='ready'||!auth.isSignedIn||!state.context)return;
  invitationAcceptanceBusy=true;render();
  try{
   await workspaceInvitationAcceptanceClient.accept(pendingInvitation.token);
   pendingInvitation=null;invitationAcceptanceStatus='accepted';
  }catch{
   pendingInvitation=null;invitationAcceptanceStatus='unconfirmed';
  }finally{invitationAcceptanceBusy=false;render();}
  break;
 }
 case 'ws02-open-invites':{
   if(!auth.isSignedIn||!state.context?.workspace_id)break;
   openWorkspaceInvitationDialog({
    id:state.context.workspace_id,name:workspaceName()
   },{enabled:WS02D_INVITE_CLIENT_ENABLED,sendInvitation:request=>workspaceInvitationClient.send(request)});
   break;
 }
 case 'platform-sync-verify':{await platformSync.syncNow('manual',[]);break;}
 case 'refresh':{try{await refreshWorkspace();render();toast('Workspace refreshed.')}catch(err){notice(err);}break;}
 case 'board-activity':{await openBoardActivity();break;}
 case 'board-import':{
  if(!activeBoardLayout()||!canManuallyEditBoard(state.board?.board,state.edit))
   throw new ApiError('Import is limited to signed ordinary-board editors.',403);
  const selected=state.boardId;
  await openBoardImportWizard({api:db,auth,boardId:selected,onComplete:async receipt=>{
   if(state.boardId===selected){await loadBoard(selected,'items');toast('Imported '+receipt.created+' items; updated '+receipt.updated+'.');}
  }});
  break;
 }
 case 'security-ws01-b2-run':{
  if(state.ws01B2Busy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
  const run=++state.ws01B2RunId;
  const actor=state.context.user_id,workspace=state.context.workspace_id;
  state.ws01B2Busy=true;state.ws01B2Result=null;render();
  try{
   const report=await runWs01B2SignedDiscovery({auth,api:db});
   if(run===state.ws01B2RunId&&auth.isSignedIn&&
      state.context?.user_id===actor&&state.context?.workspace_id===workspace){
    state.ws01B2Result=report;
    toast('Workspace B2 signed discovery: '+report.status,report.status!=='PASS');
   }
  }catch{
   if(run===state.ws01B2RunId&&state.context?.user_id===actor&&
      state.context?.workspace_id===workspace){
    state.ws01B2Result={status:'BLOCKED',checks:[{name:'signed-identity',status:'BLOCKED'}]};
   }
  }finally{
   if(run===state.ws01B2RunId){
    state.ws01B2Busy=false;
    if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
   }
  }
  break;
 }
 case 'security-ws01-b2-copy':{
  if(state.view!=='security'||!auth.isSignedIn||!state.context||!state.ws01B2Result)break;
  try{
   await navigator.clipboard.writeText(sanitizeWs01B2Report(state.ws01B2Result));
   toast('Nonsecret workspace B2 result copied.');
  }catch{toast('Clipboard is unavailable; no report was exported.',true);}
  break;
 }
 case 'security-b2-qa-inspect':
 case 'security-b2-qa-create':{
  if(state.b2QaBusy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
  const run=++state.b2QaRunId;
  const actor=state.context.user_id,workspace=state.context.workspace_id;
  const create=name==='security-b2-qa-create';
  state.b2QaBusy=true;state.b2QaReport=null;render();
  try{
   const report=create?
    await createB2SignedQaFixture({auth,api:db,structure:boardStructureClient}):
    await inspectB2SignedQaFixture({auth,api:db});
   if(run===state.b2QaRunId&&auth.isSignedIn&&
      state.context?.user_id===actor&&state.context?.workspace_id===workspace){
    state.b2QaReport=report;
    if(report.status==='PASS'&&create){
     try{await refreshWorkspace();}catch{/* Board remains discoverable by signed inspection. */}
    }
    toast('B2 signed QA fixture: '+report.status,report.status!=='PASS');
   }
  }catch{
   if(run===state.b2QaRunId&&state.context?.user_id===actor&&
      state.context?.workspace_id===workspace)
    state.b2QaReport={status:'BLOCKED',stage:'prerequisites',
     reason:'SIGNED_API_ERROR',completedCells:0};
  }finally{
   if(run===state.b2QaRunId){
    state.b2QaBusy=false;
    if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
   }
  }
  break;
 }
 case 'security-b2-qa-copy':{
  if(state.view!=='security'||!auth.isSignedIn||!state.context||!state.b2QaReport)break;
  try{
   await navigator.clipboard.writeText(sanitizeB2QaFixtureReport(state.b2QaReport));
   toast('Nonsecret B2 QA fixture report copied.');
  }catch{toast('Clipboard is unavailable; no B2 report exported.',true);}
  break;
 }
 case 'security-col-delete-denial-run':{
  if(state.phaseBDenialBusy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
  const run=++state.phaseBDenialRunId;
  const actor=state.context.user_id,workspace=state.context.workspace_id;
  state.phaseBDenialBusy=true;state.phaseBDenialReport=null;render();
  try{
   const outcome=await runPhaseBSignedDenial({auth,api:db});
   if(run===state.phaseBDenialRunId&&auth.isSignedIn&&
      state.context?.user_id===actor&&state.context?.workspace_id===workspace){
    state.phaseBDenialReport=outcome;
    toast('Signed recovery denial: '+outcome.status,outcome.status!=='PASS');
   }
  }catch{
   if(run===state.phaseBDenialRunId&&state.context?.user_id===actor&&
      state.context?.workspace_id===workspace){
    state.phaseBDenialReport={status:'INCONCLUSIVE',reason:'SIGNED_API_ERROR'};
   }
  }finally{
   if(run===state.phaseBDenialRunId){
    state.phaseBDenialBusy=false;
    if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
   }
  }
  break;
 }
 case 'security-col-delete-denial-copy':{
  if(state.view!=='security'||!auth.isSignedIn||!state.context||
     !state.phaseBDenialReport)break;
  try{
   await navigator.clipboard.writeText(sanitizePhaseBDenialReport(state.phaseBDenialReport));
   toast('Nonsecret signed denial report copied.');
  }catch{toast('Clipboard unavailable; no denial report exported.',true);}
  break;
 }
 case 'security-b4-qa-preflight':{
  if(state.b4QaBusy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
  const run=++state.b4QaRunId;
  const actor=state.context.user_id,workspace=state.context.workspace_id;
  state.b4QaBusy=true;state.b4QaReport=null;render();
  try{
   const result=await runB4SignedRecoveryPreflight({auth,api:db});
   if(run===state.b4QaRunId&&auth.isSignedIn&&
      state.context?.user_id===actor&&state.context?.workspace_id===workspace){
    state.b4QaReport=result;
    toast('B4 signed recovery preflight: '+result.status,result.status!=='PASS');
   }
  }catch{
   if(run===state.b4QaRunId&&state.context?.user_id===actor&&
      state.context?.workspace_id===workspace){
    state.b4QaReport={status:'BLOCKED',stage:'prerequisites',
     reason:'SIGNED_RECOVERY_INDEX_DENIED'};
   }
  }finally{
   if(run===state.b4QaRunId){
    state.b4QaBusy=false;
    if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
   }
  }
  break;
 }
 case 'security-b4-qa-copy':{
  if(state.view!=='security'||!auth.isSignedIn||!state.context||!state.b4QaReport)break;
  try{
   await navigator.clipboard.writeText(sanitizeB4SignedRecoveryReport(state.b4QaReport));
   toast('Nonsecret B4 recovery report copied.');
  }catch{toast('Clipboard unavailable; no B4 report exported.',true);}
  break;
 }
 case 'security-ws02d-b3-run':{
  if(state.ws02dB3Busy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
  const run=++state.ws02dB3RunId;
  const actor=state.context.user_id,workspace=state.context.workspace_id;
  state.ws02dB3Busy=true;state.ws02dB3Report=null;render();
  try{
   const report=await runWs02dB3SignedReadPreflight({auth,api:db});
   if(run===state.ws02dB3RunId&&auth.isSignedIn&&
      state.context?.user_id===actor&&state.context?.workspace_id===workspace){
    state.ws02dB3Report=report;
    toast('B3 signed read-only preflight: '+report.status,report.status!=='PASS');
   }
  }catch{
   if(run===state.ws02dB3RunId&&state.context?.user_id===actor&&
      state.context?.workspace_id===workspace){
    state.ws02dB3Report={status:'BLOCKED',checks:[{name:'signed-identity',status:'BLOCKED'}]};
   }
  }finally{
   if(run===state.ws02dB3RunId){
    state.ws02dB3Busy=false;
    if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
   }
  }
  break;
 }
 case 'security-ws02d-b3-copy':{
  if(state.view!=='security'||!auth.isSignedIn||!state.context||!state.ws02dB3Report)break;
  try{
   await navigator.clipboard.writeText(sanitizeWs02dB3SignedReport(state.ws02dB3Report));
   toast('Nonsecret B3 read-only report copied.');
  }catch{toast('Clipboard is unavailable; no report exported.',true);}
  break;
 }
 case 'security-ws02d-b3-revoke-arm':{
   if(state.view!=='security'||!auth.isSignedIn||!state.context)break;
   state.ws02dB3RevokeArmed=true;render();break;
  }
  case 'security-ws02d-b3-revoke-cancel':{
   state.ws02dB3RevokeArmed=false;if(state.view==='security')render();break;
  }
  case 'security-ws02d-b3-revoke-copy':{
   if(state.view!=='security'||!auth.isSignedIn||!state.context||
      !state.ws02dB3RevokedReport)break;
   try{
    await navigator.clipboard.writeText(
     sanitizeWs02dB3LocalRevocationReport(state.ws02dB3RevokedReport));
    toast('Nonsecret local-session revocation result copied.');
   }catch{toast('Clipboard unavailable; no session result exported.',true);}
   break;
  }
  case 'security-ws02d-b3-rls-capture':
  case 'security-ws02d-b3-rls-verify':{
   if(state.ws02dB3RlsBusy||state.view!=='security'||
      !state.context||!auth.isSignedIn)break;
   const run=++state.ws02dB3RlsRunId;
   const actor=state.context.user_id,workspace=state.context.workspace_id;
   state.ws02dB3RlsBusy=true;state.ws02dB3RlsReport=null;render();
   try{
    const outcome=name==='security-ws02d-b3-rls-capture'?
     await captureWs02dB3OwnerRlsFixture({auth,api:db}):
     await verifyWs02dB3ForeignRlsDenial({auth,api:db});
    if(run===state.ws02dB3RlsRunId&&auth.isSignedIn&&
       state.context?.user_id===actor&&state.context?.workspace_id===workspace){
     state.ws02dB3RlsReport=outcome;
     toast('B3 genuine targeted RLS: '+outcome.status,
      outcome.status!=='PASS'&&outcome.status!=='READY');
    }
   }catch{
    if(run===state.ws02dB3RlsRunId&&state.context?.user_id===actor&&
       state.context?.workspace_id===workspace)
     state.ws02dB3RlsReport={status:'BLOCKED',stage:'network'};
   }finally{
    if(run===state.ws02dB3RlsRunId){
     state.ws02dB3RlsBusy=false;
     if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
    }
   }
   break;
  }
  case 'security-ws02d-b3-rls-clear':{
   if(state.view!=='security'||!state.context||!auth.isSignedIn)break;
   ++state.ws02dB3RlsRunId;state.ws02dB3RlsBusy=false;
   state.ws02dB3RlsReport=clearWs02dB3ForeignRlsFixture();
   render();break;
  }
  case 'security-ws02d-b3-rls-copy':{
   if(state.view!=='security'||!auth.isSignedIn||!state.context||
      !state.ws02dB3RlsReport)break;
   try{
    await navigator.clipboard.writeText(
     sanitizeWs02dB3ForeignRlsReport(state.ws02dB3RlsReport));
    toast('Sanitized targeted table-RLS report copied.');
   }catch{toast('Clipboard unavailable; no RLS report exported.',true);}
   break;
  }
  case 'security-ws02d-b3-https-run':{
   if(state.ws02dB3HttpsBusy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
   const run=++state.ws02dB3HttpsRunId;
   const actor=state.context.user_id,workspace=state.context.workspace_id;
   state.ws02dB3HttpsBusy=true;state.ws02dB3HttpsReport=null;render();
   try{
    const result=await runWs02dB3DeployedHttpsAcceptance({auth});
    if(run===state.ws02dB3HttpsRunId&&auth.isSignedIn&&
       state.context?.user_id===actor&&state.context?.workspace_id===workspace){
     state.ws02dB3HttpsReport=result;
     toast('B3 deployed signed HTTPS: '+result.status,result.status!=='PASS');
    }
   }catch{
    if(run===state.ws02dB3HttpsRunId&&state.context?.user_id===actor&&
       state.context?.workspace_id===workspace)
     state.ws02dB3HttpsReport={status:'BLOCKED',stage:'network-or-preflight'};
   }finally{
    if(run===state.ws02dB3HttpsRunId){
     state.ws02dB3HttpsBusy=false;
     if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
    }
   }
   break;
  }
  case 'security-ws02d-b3-https-copy':{
   if(state.view!=='security'||!auth.isSignedIn||!state.context||
      !state.ws02dB3HttpsReport)break;
   try{
    await navigator.clipboard.writeText(
     sanitizeWs02dB3DeployedHttpsReport(state.ws02dB3HttpsReport));
    toast('Nonsecret B3 deployed HTTPS report copied.');
   }catch{toast('Clipboard is unavailable; no signed HTTPS report exported.',true);}
   break;
  }
  case 'security-tl03-revoke-arm':{
   if(state.view!=='security'||!auth.isSignedIn||!state.context)break;
   state.tl03RevokeArmed=true;state.tl03RevokedReport=null;render();break;
  }
 case 'security-tl03-revoke-cancel':{
   state.tl03RevokeArmed=false;if(state.view==='security')render();break;
  }
 case 'security-tl03-revoke-copy':{
   if(!state.tl03RevokedReport||
      (auth.isSignedIn&&state.view!=='security'))break;
   try{
    await navigator.clipboard.writeText(sanitizeTradeLinkRevocationReport(state.tl03RevokedReport));
    toast('Nonsecret TradeLink session-revocation report copied.');
   }catch{toast('Clipboard unavailable; no TradeLink session result exported.',true);}
   break;
  }
 case 'security-tl03-stage-a-run':{
  if(state.tl03ReadBusy||state.view!=='security'||!state.context||!auth.isSignedIn)break;
  const run=++state.tl03ReadRunId;
  const actor=state.context.user_id,workspace=state.context.workspace_id;
  state.tl03ReadBusy=true;state.tl03ReadResult=null;render();
  try{
   const report=await runTradeLinkStageASignedReadOnly({auth,api:db});
   if(run===state.tl03ReadRunId&&auth.isSignedIn&&
      state.context?.user_id===actor&&state.context?.workspace_id===workspace){
    state.tl03ReadResult=report;
    toast('TradeLink Stage A signed read: '+report.status,report.status!=='PASS');
   }
  }catch{
   if(run===state.tl03ReadRunId&&state.context?.user_id===actor&&
      state.context?.workspace_id===workspace){
    state.tl03ReadResult={status:'BLOCKED',scenario:'UNVERIFIED',
     checks:[{name:'signed-identity',status:'BLOCKED',
       detail:'Read-only signed acceptance could not finish.'}]};
   }
  }finally{
   if(run===state.tl03ReadRunId){
    state.tl03ReadBusy=false;
    if(state.context?.user_id===actor&&state.context?.workspace_id===workspace)render();
   }
  }
  break;
 }
 case 'security-tl03-stage-a-copy':{
  if(state.view!=='security'||!auth.isSignedIn||!state.context||!state.tl03ReadResult)break;
  try{
   await navigator.clipboard.writeText(sanitizeTradeLinkStageAReport(state.tl03ReadResult));
   toast('Nonsecret TradeLink Stage A results copied.');
  }catch{toast('Clipboard is unavailable; no report was exported.',true);}
  break;
 }
 case 'tradelink-draft-preview':{
  if(!tradeLinkDraftRoute())break;
  const form=root.querySelector('[data-tradelink-draft-form]');
  const output=form?.querySelector('[data-tradelink-draft-preview-status]');
  if(!form||!output)break;
  // A failed or stale validation never leaves a previous local document summary visible.
  updateTradeLinkDraftLocalSummary(form);
  if(!form.reportValidity()){
   const invalid=form.querySelector(':invalid');
   const label=invalid?.closest('label')?.querySelector('span')?.textContent?.trim();
   output.dataset.validation='invalid';
   output.setAttribute('role','alert');
   output.textContent=(label?'Check '+label+'.':'Check required Draft fields.')+
    ' Nothing saved or transmitted.';
   break;
  }
  try{
   const draft=parseTradeLinkDraftForm(new FormData(form));
   updateTradeLinkDraftLocalSummary(form,draft);
   output.dataset.validation='valid';
   output.setAttribute('role','status');
   output.textContent='Valid local '+draft.documentType+' / '+draft.documentNumber+
    ' preview. Nothing saved or transmitted.';
  }catch(error){
   output.dataset.validation='invalid';
   output.setAttribute('role','alert');
   output.textContent=tradeLinkDraftValidationMessage(error)+' Nothing saved or transmitted.';
  }
  break;
 }
 case 'tradelink-draft-add-line':
 case 'tradelink-draft-add-note':{
  if(!tradeLinkDraftRoute()||state.tradeLinkDraft.busy||
    state.tradeLinkDraft.pendingCreateId)break;
  const form=root.querySelector('[data-tradelink-draft-form]');
  const container=form?.querySelector('[data-tradelink-draft-line-items]');
  const rows=container?.querySelectorAll('[data-tradelink-line-item]');
  const module=form?.querySelector('[name="documentType"]')?.value;
  if(!container||!rows||rows.length>=100||
     !['esi','packing','delivery','quotation','po'].includes(module))break;
  const currency=form.querySelector('[name="currency"]')?.value||'PHP';
  const kind=name==='tradelink-draft-add-note'?'note':'item';
  const next=renderTradeLinkDraftLineItem({kind},module,currency,rows.length);
  const current=button.closest('[data-tradelink-line-item]');
  if(current&&current.parentElement===container)current.insertAdjacentHTML('afterend',next);
  else container.insertAdjacentHTML('beforeend',next);
  const item=current?.nextElementSibling||container.lastElementChild;
  for(const [index,row] of [...container.querySelectorAll('[data-tradelink-line-item]')].entries()){
   const label=row.querySelector('.tl-ref-item-index');
   if(label)label.textContent=String(index+1);
  }
  captureTradeLinkDraftFields({target:item?.querySelector('[name="lineDescription"]')});
  item?.querySelector('[name="lineDescription"]')?.focus({preventScroll:true});
  break;
 }
 case 'tradelink-draft-move-line':{
  if(!tradeLinkDraftRoute()||state.tradeLinkDraft.busy||
    state.tradeLinkDraft.pendingCreateId)break;
  const form=root.querySelector('[data-tradelink-draft-form]');
  const item=button.closest('[data-tradelink-line-item]');
  const container=item?.parentElement;
  if(!form||!item||!container?.matches('[data-tradelink-draft-line-items]'))break;
  const direction=button.dataset.direction;
  const neighbor=direction==='up'?item.previousElementSibling:
   direction==='down'?item.nextElementSibling:null;
  if(!neighbor?.matches('[data-tradelink-line-item]'))break;
  if(direction==='up')container.insertBefore(item,neighbor);
  else container.insertBefore(neighbor,item);
  for(const [index,row] of [...container.querySelectorAll('[data-tradelink-line-item]')].entries()){
   const label=row.querySelector('.tl-ref-item-index');
   if(label)label.textContent=String(index+1);
  }
  captureTradeLinkDraftFields({target:item.querySelector('[name="lineDescription"]')});
  button.focus({preventScroll:true});
  break;
 }
 case 'tradelink-draft-remove-line':{
  if(!tradeLinkDraftRoute()||state.tradeLinkDraft.busy||
    state.tradeLinkDraft.pendingCreateId)break;
  const form=root.querySelector('[data-tradelink-draft-form]');
  const item=button.closest('[data-tradelink-line-item]');
  const container=item?.parentElement;
  if(!form||!item||!container?.matches('[data-tradelink-draft-line-items]'))break;
  const rows=[...container.querySelectorAll('[data-tradelink-line-item]')];
  if(rows.length>1)item.remove();
  else{
   const module=form.querySelector('[name="documentType"]')?.value||'quotation';
   const currency=form.querySelector('[name="currency"]')?.value||'PHP';
   item.insertAdjacentHTML('afterend',renderTradeLinkDraftLineItem({},module,currency,0));
   item.remove();
  }
  for(const [index,row] of [...container.querySelectorAll('[data-tradelink-line-item]')].entries()){
   const label=row.querySelector('.tl-ref-item-index');
   if(label)label.textContent=String(index+1);
  }
  const remaining=container.querySelector('[name="lineDescription"]');
  if(remaining)captureTradeLinkDraftFields({target:remaining});
  remaining?.focus({preventScroll:true});
  break;
 }
 case 'tradelink-draft-clear':{
  if(!tradeLinkDraftRoute()||state.tradeLinkDraft.busy)break;
  if(tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft)&&
    !confirm(unsavedTradeLinkWarning))break;
  state.tradeLinkDraft.unsavedChanges=false;
  if(state.tradeLinkDraft.editRequestId){
   const type=state.tradeLinkDraft.selected?.record?.document_type||'quotation';
   location.hash='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/'+type;
   break;
  }
  state.tradeLinkDraft=resetTradeLinkDraftForm(state.tradeLinkDraft);
  render();
  root.querySelector('.tl-reference-document-tabs a.active')?.focus({preventScroll:true});
  break;
 }
 case 'tradelink-draft-refresh':{
  if(tradeLinkDraftRoute())await loadTradeLinkDrafts(routeSerial);
  break;
 }
 case 'tradelink-draft-new':{
  if(tradeLinkDraftRoute()&&!state.tradeLinkDraft.busy){
   if(tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft)&&
     !confirm(unsavedTradeLinkWarning))break;
   state.tradeLinkDraft.unsavedChanges=false;
   if(state.tradeLinkDraft.editRequestId){
    location.hash='#/boards/'+TRADELINK_BOARD_ID+'/tradelink/drafts/'+
     (state.tradeLinkDraft.selected?.record?.document_type||'quotation');
    break;
   }
   state.tradeLinkDraft={...state.tradeLinkDraft,mode:'create',selected:null,pendingCreateId:null,pendingCreateDraft:null,lineDrafts:null,formValues:null,error:'',message:''};
   render();
  }
  break;
 }
 case 'tradelink-draft-open':{
  await openTradeLinkDraft(button.dataset.id);break;
 }
 case 'tradelink-document-open':{
  await openTradeLinkDocument(button.dataset.id);break;
 }
 case 'tradelink-document-print':{
  await printTradeLinkDocument(button.dataset.id);break;
 }
 case 'tradelink-attachment-upload':{
  const selection=currentTradeLinkAttachmentSelection(button.dataset.id);
  if(!selection)break;
  const container=button.closest('[data-tradelink-saved-attachments]');
  const file=container?.querySelector('[data-tradelink-attachment-input]')?.files?.[0];
  if(!file){
   state.tradeLinkDraft.error='Select one allowed TradeLink attachment file.';
   render();break;
  }
  const replacesId=container?.querySelector('[data-tradelink-attachment-replace]')?.value||null;
  await mutateTradeLinkAttachment(button.dataset.id,{file,replacesId});
  break;
 }
 case 'tradelink-attachment-download':{
  await downloadTradeLinkAttachment(button.dataset.documentId,button.dataset.id);
  break;
 }
 case 'tradelink-attachment-remove':{
  const selection=currentTradeLinkAttachmentSelection(button.dataset.documentId);
  if(!selection)break;
  const file=selection.preview.attachments.find(a=>a.attachmentId===button.dataset.id);
  if(!file)break;
  const entered=prompt('Reason to revoke access to '+file.fileName+
   ' (3–1000 characters):','');
  if(entered===null)break;
  const reason=entered.trim();
  if(reason.length<3||reason.length>1000||/[\x00-\x1f\x7f]/.test(entered)){
   state.tradeLinkDraft.error='Attachment removal requires a valid signed reason.';
   render();break;
  }
  await mutateTradeLinkAttachment(button.dataset.documentId,{
   attachmentId:button.dataset.id,reason
  });
  break;
 }
 case 'tradelink-document-submit':{
  await submitTradeLinkDocument(button.dataset.id);break;
 }
 case 'tradelink-document-review':{
  await reviewTradeLinkDocument(button.dataset.id,'review');break;
 }
 case 'tradelink-document-request-revision':{
  await reviewTradeLinkDocument(button.dataset.id,'request-revision');break;
 }
 case 'tradelink-document-approve':{
  await decideTradeLinkDocument(button.dataset.id,'approve');break;
 }
 case 'tradelink-document-reject':{
  await decideTradeLinkDocument(button.dataset.id,'reject');break;
 }
 case 'tradelink-operational-checked':{
  await operateTradeLinkDocument(button.dataset.id,'record-checked');break;
 }
 case 'tradelink-operational-delivered':{
  await operateTradeLinkDocument(button.dataset.id,'record-delivered');break;
 }
 case 'tradelink-operational-received':{
  await operateTradeLinkDocument(button.dataset.id,'record-received');break;
 }
 case 'tradelink-operational-complete':{
  await operateTradeLinkDocument(button.dataset.id,'complete');break;
 }
 case 'tradelink-operational-reopen':{
  await operateTradeLinkDocument(button.dataset.id,'reopen');break;
 }
 case 'tradelink-documents-refresh':{
  if(tradeLinkAuthorizedListRoute()&&state.tradeLinkSection==='documents'){
   const page=state.tradeLinkDraft.listPage;
   await loadTradeLinkDrafts(routeSerial,page?.server?{
    cursor:page.cursor,history:page.history,pageIndex:page.pageIndex,
    filters:page.appliedFilters}:null);
  }
  break;
 }
 case 'tradelink-documents-clear-selection':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !state.boardManage||state.tradeLinkDraft?.status!=='AUTHORIZED_READ')break;
  const panel=button.closest('[data-tradelink-domain-list]');
  for(const checkbox of panel?.querySelectorAll('[data-tl-select-document]')||[])
   checkbox.checked=false;
  updateTradeLinkDocumentSelection(panel);
  break;
 }
 case 'tradelink-documents-date':
 case 'tradelink-documents-apply-dates':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !TL03_DOMAIN_READS_ENABLED||!state.boardManage||
     state.tradeLinkDraft?.status!=='AUTHORIZED_READ'||state.tradeLinkDraft.busy)break;
  const panel=button.closest('[data-tradelink-domain-list]');
  const start=panel?.querySelector('[data-tl-updated-start]');
  const end=panel?.querySelector('[data-tl-updated-end]');
  if(!start||!end)break;
  if(name==='tradelink-documents-date'){
   const today=new Date();
   const utcToday=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate()));
   const fmt=date=>date.toISOString().slice(0,10);
   const range=button.dataset.range;
   const from=new Date(utcToday);
   if(range==='week')from.setUTCDate(utcToday.getUTCDate()-((utcToday.getUTCDay()+6)%7));
   else if(range==='month')from.setUTCDate(1);
   else if(range==='30')from.setUTCDate(utcToday.getUTCDate()-29);
   else if(range!=='today'&&range!=='clear')break;
   start.value=range==='clear'?'':fmt(from);
   end.value=range==='clear'?'':fmt(utcToday);
  }
  if(start.value&&end.value&&start.value>end.value){
   start.setCustomValidity('Start date must be before end date.');
   start.reportValidity();break;
  }
  start.setCustomValidity('');
  updateTradeLinkDraftListUI(panel,state.tradeLinkDraft.listPage?.server?
   state.tradeLinkDraft.listPage.appliedFilters:state.tradeLinkDraft.listFilters);
  updateTradeLinkDocumentSelection(panel);
  break;
 }
 case 'tradelink-documents-module':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !TL03_DOMAIN_READS_ENABLED||!state.boardManage||
     state.tradeLinkDraft?.status!=='AUTHORIZED_READ'||state.tradeLinkDraft.busy)break;
  const selected=normalizeTradeLinkDraftListFilters({
   ...state.tradeLinkDraft.listFilters,documentType:button.dataset.module
  });
  state.tradeLinkDraft.listFilters=selected;
  if(state.tradeLinkDraft.listPage?.server){
   await loadTradeLinkDrafts(routeSerial,{
    cursor:null,history:[],pageIndex:0,filters:selected
   });
  }else{
   render();
  }
  break;
 }
 case 'tradelink-documents-search':{
  if(tradeLinkAuthorizedListRoute()&&state.tradeLinkSection==='documents'&&
    state.tradeLinkDraft.listPage?.server)
   await loadTradeLinkDrafts(routeSerial,{cursor:null,history:[],pageIndex:0,
    filters:state.tradeLinkDraft.listFilters});
  break;
 }
 case 'tradelink-documents-next':
 case 'tradelink-documents-previous':{
  const page=state.tradeLinkDraft.listPage;
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
    !page?.server||state.tradeLinkDraft.busy)break;
  if(name==='tradelink-documents-next'&&page.hasMore&&page.nextCursor){
   await loadTradeLinkDrafts(routeSerial,{
    cursor:page.nextCursor,history:[...page.history,page.cursor],
    pageIndex:page.pageIndex+1,filters:page.appliedFilters});
  }else if(name==='tradelink-documents-previous'&&page.history?.length){
   await loadTradeLinkDrafts(routeSerial,{
    cursor:page.history.at(-1),history:page.history.slice(0,-1),
    pageIndex:page.pageIndex-1,filters:page.appliedFilters});
  }
  break;
 }
 case 'tradelink-draft-submit':{
  if(tradeLinkDraftRoute()&&tradeLinkDraftReady()&&
     state.boardManage&&!state.tradeLinkDraft.busy){
   root.querySelector('[data-tradelink-draft-form]')?.requestSubmit();
  }
  break;
 }
 case 'tradelink-draft-archive':
 case 'tradelink-draft-restore':{
  await changeTradeLinkDraftState(button.dataset.id,
   name==='tradelink-draft-archive'?'archive':'restore');break;
 }
 case 'tradelink-activity-refresh':{
  if(state.boardId===TRADELINK_BOARD_ID&&state.view==='board'&&
     state.tab==='tradelink'&&state.tradeLinkSection==='activity'&&
     !state.tradeLinkActivityBusy)await loadTradeLinkActivity(routeSerial);
  break;
 }
 case 'board-members':{await openBoardMembers();break;}
 case 'board-structure':{await openBoardStructure();break;}
 case 'tradelink-configure':{
  if(state.view!=='board'||state.tab!=='items'||state.boardId!==TRADELINK_BOARD_ID||
    !state.boardManage||state.tradeLinkSetupBusy)break;
  const userId=state.context?.user_id;
  state.tradeLinkSetupBusy=true;render();
  try{
   await configureTradeLinkColumns({auth,api:db,structure:boardStructureClient});
   if(state.view==='board'&&state.boardId===TRADELINK_BOARD_ID&&
      state.context?.user_id===userId){
    await loadBoard(TRADELINK_BOARD_ID,'items');
    toast('TradeLink columns saved. Secure file uploads remain pending.');
   }
  }catch(err){if(state.context?.user_id===userId)notice(err);}
  finally{state.tradeLinkSetupBusy=false;if(state.context?.user_id===userId)render();}
  break;
 }
 case 'board-add-column':{
  if(!activeBoardLayout()||!state.boardManage)return;
  contextualColumnCreate();break;
 }
 case 'tt-board-gps':{try{await openTimeTrackerBoardProjectedGps();}catch(err){notice(err);}break;}
 case 'board-item-detail':{await openBoardItemDetails(button.dataset.id);break;}
 case 'board-layout-reset':{
  const current=activeBoardLayout();if(!current)return;
  resetBoardLayout(state.context,state.boardId);render();break;
 }
 case 'board-column-context':{
  openBoardColumnContext(button);break;
 }
 case 'board-column-set-width':{
  const key=button.dataset.key,layout=activeBoardLayout();
  if(!layout?.columns.includes(key))return;
  closeBoardColumnContext();
  const answer=window.prompt('Column width in pixels ('+BOARD_COLUMN_MIN+'–'+BOARD_COLUMN_MAX+'):',
   String(layout.pref.widths[key]||185));
  if(answer===null)return;
  const width=Number(answer.trim());
  if(!Number.isFinite(width)||width<BOARD_COLUMN_MIN||width>BOARD_COLUMN_MAX)
   throw new ApiError('Enter a width between '+BOARD_COLUMN_MIN+' and '+BOARD_COLUMN_MAX+' pixels.',400);
  persistBoardLayout(p=>({...p,widths:{...p.widths,[key]:columnWidth(width)}}));
  render();break;
 }
 case 'board-column-reset-width':{
  const key=button.dataset.key,layout=activeBoardLayout();
  if(!layout?.columns.includes(key))return;
  closeBoardColumnContext();
  persistBoardLayout(p=>({...p,widths:{...p.widths,[key]:185}}));render();break;
 }
 case 'board-column-manage':{
  const key=button.dataset.key,layout=activeBoardLayout();
  closeBoardColumnContext();
  if(!layout?.columns.includes(key)||!state.boardManage)return;
  contextualColumnEditor(key);break;
 }
 case 'board-column-delete-custom':{
  const key=button.dataset.key,layout=activeBoardLayout();
  closeBoardColumnContext();
  if(!layout?.columns.includes(key)||!state.boardManage||!key.startsWith('col:'))return;
  contextualColumnDelete(key);break;
 }
 case 'board-column-hide':{
  const key=button.dataset.key,layout=activeBoardLayout();
  closeBoardColumnContext();
  if(!layout?.columns.includes(key)||BOARD_REQUIRED_COLUMNS.includes(key))return;
  persistBoardLayout(p=>({...p,hidden:[...new Set([...p.hidden,key])]}));
  render();break;
 }
 case 'board-column-move':{
  const current=activeBoardLayout(),key=button.dataset.key,
   delta=Number(button.dataset.direction);
  if(!current||!current.columns.includes(key)||
    BOARD_REQUIRED_COLUMNS.includes(key)||![-1,1].includes(delta))return;
  const movable=current.pref.columns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k));
  const target=movable[movable.indexOf(key)+delta];
  if(target)await moveBoardPresentation('column',key,target);
  root.querySelector('.board-column-menu')?.setAttribute('open','');break;
 }
 case 'board-tab-move':{
  const current=activeBoardLayout(),key=button.dataset.key,
   delta=Number(button.dataset.direction);
  if(!current||!current.tabs.includes(key)||![-1,1].includes(delta))return;
  if(isManagedTimeTrackerBoard(state.board?.board)){
   if(!state.boardManage||state.tabMoveBusy)return;
   const configured=state.boardUi?.tabs||[];
   const keys=[...configured.filter(t=>t.visible).map(t=>t.key),
    ...['items','issues','attendance'].filter(k=>!configured.some(t=>t.key===k))];
   const target=keys[keys.indexOf(key)+delta];
   if(target)await moveManagedTimeTrackerTab(key,target);
  }else{
   persistBoardLayout(p=>{
    const target=p.tabs[p.tabs.indexOf(key)+delta];
    return target?{...p,tabs:moveTabInOrder(p.tabs,key,target)}:p;
   });
   render();
  }
  root.querySelector('[data-board-tab="'+key+'"]')?.focus();break;
 }
  case 'ft3-request-status':{
   if(!fuelTrackRequestReady())return;
   const status=button.dataset.status;
   if(!['all','done','pending','approved','rejected','other'].includes(status))return;
   updateFuelTrackRequestFilters({status,limit:25,expandedId:null});break;
  }
  case 'ft3-request-period':{
   if(!fuelTrackRequestReady())return;
   const bounds=fuelTrackRequestQuickDates(button.dataset.period);
   if(!bounds)return;
   updateFuelTrackRequestFilters({...bounds,limit:25,expandedId:null});
   break;
  }
  case 'ft3-request-expand':{
   if(!fuelTrackRequestReady())return;
   const id=button.dataset.id;
   const model=fuelTrackRequestsModel(state.board,state.fuelTrackRequestFilters);
   if(!model?.visible.some(x=>x.id===id))return;
   const scroll=root.querySelector('.ft3-request-table-scroll')?.scrollTop||0;
   updateFuelTrackRequestFilters({expandedId:state.fuelTrackRequestFilters.expandedId===id?null:id});
   const next=root.querySelector('.ft3-request-table-scroll');
   if(next)next.scrollTop=scroll;
   root.querySelector('.ft3-request-expand[data-id="'+id+'"]')?.focus();
   break;
  }
  case 'ft3-request-sort':{
   if(!fuelTrackRequestReady())return;
   updateFuelTrackRequestFilters({sort:state.fuelTrackRequestFilters.sort==='newest'?'oldest':'newest',limit:25,expandedId:null});break;
  }
  case 'ft3-request-more':{
   if(!fuelTrackRequestReady())return;
   const scroll=root.querySelector('.ft3-request-table-scroll')?.scrollTop||0;
   updateFuelTrackRequestFilters({limit:state.fuelTrackRequestFilters.limit+25});
   const next=root.querySelector('.ft3-request-table-scroll');
   if(next)next.scrollTop=scroll;break;
  }
  case 'ft3-request-clear':{
   if(!fuelTrackRequestReady())return;
   updateFuelTrackRequestFilters({...FUELTRACK_REQUEST_FILTER_DEFAULTS});break;
  }
  case 'ft3-request-copy':
  case 'ft3-request-export':{
   if(!fuelTrackRequestReady())return;
   const boardId=state.boardId,userId=state.context.user_id,workspaceId=state.context.workspace_id;
   if(!await db.allowed(boardId,'view'))throw new ApiError('Request export is not authorized.',403);
   if(!fuelTrackRequestReady()||state.context?.user_id!==userId||
      state.context?.workspace_id!==workspaceId)return;
   const model=fuelTrackRequestsModel(state.board,state.fuelTrackRequestFilters);
   if(!model)return;
   if(name==='ft3-request-copy'){
    await navigator.clipboard.writeText(fuelTrackRequestsSummary(model));
    toast('Authorized request summary copied.');
   }else{
    const csv=fuelTrackRequestsCsv(model);
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    try{
     const link=document.createElement('a');
     link.href=url;link.download='fueltrack-v3-requests.csv';
     link.hidden=true;document.body.append(link);
     link.click();link.remove();
     toast('Authorized request records exported to CSV.');
    }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
   }
   break;
  }
  case 'refresh-board':{await loadBoard(state.boardId,state.tab);break;}
 case 'tt-clock-verify':{await verifyTimeTrackerClockOut();break;}
 case 'tt-refresh':{if(!state.ttBusy){const team=state.ttView==='team',gps=state.ttView==='gps',log=state.ttView==='log';await loadTimeTracker();if(team&&state.roleVerified===true&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerTeam();if(gps&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerGps();if(log&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerLogGps();}break;}
 case 'tt-tab':{
  if(state.ttBusy||state.view!=='board'||state.tab!=='attendance'||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const next=button.dataset.target;
  if(!['overview','clock','log','reports','calendar','ot','hours','team','monitor','gps'].includes(next))return;
  if(next==='gps'&&state.roleVerified!==true&&state.ttAttendance.access?.moduleRole!=='Supervisor')return;
  if(next==='team'&&state.roleVerified!==true)return;
  if(next!=='ot')state.ttOtModalOpen=false;
  if(next===state.ttView)return;
  state.ttView=next;render();
  animateTabContent('.tt-secondary-content, .tt-clock-stage');
  if(next==='team')await loadTimeTrackerTeam();
  if(next==='monitor')await loadTimeTrackerMonitor();
  if(next==='gps')await loadTimeTrackerGps();
  if(next==='log')await loadTimeTrackerLogGps();
  break;
 }
 case 'tt-map-fullscreen':{
  if(!auth.isSignedIn||state.view!=='board'||state.tab!=='attendance'||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor')||
     !['log','gps'].includes(state.ttView))return;
  await toggleTimeTrackerMapFullscreen(button.closest('.tt-map-host'));break;
 }
 case 'tt-map-retry':{
  if(!auth.isSignedIn||state.view!=='board'||state.tab!=='attendance'||
    state.ttAttendance?.status!=='VERIFIED_READ'||
    !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor')||
    !['log','gps'].includes(state.ttView))return;
  await retryTimeTrackerMaps(root,timeTrackerSignedMapConfigs(),button.closest('.tt-map-host'));break;
 }
 case 'tt-map-enable':{
  if(!auth.isSignedIn||state.view!=='board'||state.tab!=='attendance'||
   state.ttAttendance?.status!=='VERIFIED_READ'||
   !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor')||
   !['log','gps'].includes(state.ttView))return;
  state.ttMapConsent=true;
  state.ttMapConsentIdentity=timeTrackerMapConsentKey();
  void mountSignedTimeTrackerMaps();break;
 }
 case 'tt-log-gps-load':{
  if(state.ttView!=='log'||state.ttBusy||state.ttLogGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ'||!auth.isSignedIn||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const record=(state.ttAttendance.log?.rows||[]).find(r=>
   r.id===button.dataset.recordId);
  if(!record||typeof record.ownerId!=='string'||!record.ownerId.startsWith('cloud:'))return;
  await loadTimeTrackerLogGps(routeSerial,record,{force:button.textContent?.includes('Refresh')===true});break;
 }
 case 'tt-location-shortcut':{
  if(state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ'||state.ttView!=='clock')return;
  const location=button.dataset.location;
  if(!['Office-Base Duty','Offsite (Home)'].includes(location))return;
  const selected=root.querySelector('#tt-location');
  if(!selected)return;
  selected.value=location;
  selected.dispatchEvent(new Event('change',{bubbles:true}));
  for(const chip of root.querySelectorAll('[data-action="tt-location-shortcut"]')){
   const chosen=chip.dataset.location===location;
   chip.classList.toggle('is-selected',chosen);
   chip.setAttribute('aria-pressed',String(chosen));
  }
  break;
 }
 case 'tt-overview-export':{
  if(state.ttBusy||state.ttView!=='overview'||
     state.ttAttendance?.status!=='VERIFIED_READ'||!state.ttAttendance.overview)return;
  const rows=filterTimeTrackerOverviewRows(state.ttAttendance.overview.rows,state.ttOverviewFilters);
  if(!rows.length)return;
  const blob=new Blob([timeTrackerOverviewCsv(rows)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
    link.download='timetracker-authorized-overview-'+state.ttAttendance.overview.day+'.csv';
    link.click();
  }finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-log-export':{
  if(state.ttBusy||state.ttView!=='log'||state.view!=='board'||
     state.tab!=='attendance'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  const rows=filterTimeTrackerLogRows(state.ttAttendance.log?.rows||state.ttAttendance.records,state.ttLogFilters);
  if(!rows.length)return;
  const blob=new Blob([timeTrackerLogCsv(rows)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
   link.download='timetracker-authorized-filtered-log.csv';link.click();}
  finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-export':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='reports'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const records=filterTimeTrackerReportRows(
   state.ttAttendance.log?.rows||state.ttAttendance.records,
   {period:state.ttReportPeriod,filters:state.ttReportFilters}
  );
  if(!records.length)return;
  const blob=new Blob([timeTrackerLogCsv(records)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
   link.download='timetracker-authorized-reports.csv';link.click();}
  finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-calendar-prev':
 case 'tt-calendar-next':
 case 'tt-calendar-today':
 case 'tt-calendar-day':{
  if(state.view!=='board'||state.tab!=='attendance'||
     state.ttView!=='calendar'||state.ttBusy||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const current=state.ttCalendarMonth||timeTrackerCalendarMonth();
  if(name==='tt-calendar-today'){
   state.ttCalendarMonth=timeTrackerCalendarMonth();
   state.ttCalendarSelectedDay='';
  }else if(name==='tt-calendar-prev'||name==='tt-calendar-next'){
   state.ttCalendarMonth=shiftTimeTrackerCalendarMonth(current,
    name==='tt-calendar-prev'?-1:1);
   state.ttCalendarSelectedDay='';
  }else{
   const day=button.dataset.day;
   if(!/^\d{4}-(0[1-9]|1[0-2])-([0-3]\d)$/.test(day||'')||
      !day.startsWith(current+'-'))return;
   const d=new Date(day+'T00:00:00.000Z');
   if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==day)return;
   state.ttCalendarSelectedDay=state.ttCalendarSelectedDay===day?'':day;
  }
  render();break;
 }
 case 'tt-gps-view':{
  if(state.ttView!=='gps'||state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const next=button.dataset.view;
  if(!['map','geofence','trail','accuracy','trends'].includes(next))return;
  state.ttGpsView=next;render();break;
 }
 case 'tt-gps-zoom':{
  if(state.ttView!=='gps'||state.ttBusy||state.ttGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const direction=button.dataset.direction;
  if(direction!=='in'&&direction!=='out')return;
  const current=Number(state.ttGpsFilters.zoom)||1;
  const zoom=Math.max(1,Math.min(4,current+(direction==='in'?.5:-.5)));
  state.ttGpsFilters={...state.ttGpsFilters,zoom};
  render();break;
 }
 case 'tt-gps-theme':
 case 'tt-map-style':{
  if(!['gps','log'].includes(state.ttView)||state.ttBusy||state.ttGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     !(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'))return;
  const theme=button.dataset.theme;
  if(theme!=='map'&&theme!=='dark')return;
  state.ttGpsFilters={...state.ttGpsFilters,theme};
  setTimeTrackerMapTheme(theme);
  for(const control of root.querySelectorAll('[data-action="tt-gps-theme"],[data-action="tt-map-style"]')){
   const chosen=control.dataset.theme===theme;
   control.classList.toggle('is-active',chosen);
   control.setAttribute('aria-pressed',String(chosen));
  }
  break;
 }
 case 'tt-gps-load':{
  if(state.ttView!=='gps'||state.ttBusy||state.ttGpsBusy||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const from=root.querySelector('#tt-gps-from')?.value||'';
  const to=root.querySelector('#tt-gps-to')?.value||'';
  const userId=root.querySelector('#tt-gps-user')?.value||'';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return;
  const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
  const today=timeTrackerGpsWindow().to;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>end||
     (end-start)>30*86400000||to>today)return;
  if(userId&&!(state.ttGpsData?.events||[]).some(p=>p.userId===userId))return;
  state.ttGpsFilters={...state.ttGpsFilters,from,to,userId,referenceId:''};
  await loadTimeTrackerGps(routeSerial,{force:true});break;
 }
 case 'tt-gps-compare':{
  if(state.ttView!=='gps'||state.ttGpsView!=='geofence'||
     !state.ttGpsData||state.ttGpsBusy)return;
  const referenceId=root.querySelector('#tt-gps-reference')?.value||'';
  if(referenceId&&!state.ttGpsData.events.some(p=>p.recordId+':'+p.kind===referenceId))return;
  const radius=Number(root.querySelector('#tt-gps-radius')?.value);
  if(!Number.isFinite(radius)||radius<100||radius>50000)return;
  state.ttGpsFilters={...state.ttGpsFilters,referenceId,radius};
  render();break;
 }
 case 'tt-monitor-refresh':{
  if(state.ttView!=='monitor'||state.ttMonitorBusy||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  await loadTimeTrackerMonitor();
  break;
 }
 case 'tt-monitor-clear':{
  if(state.ttView!=='monitor'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
  state.ttMonitorBusy=false;render();break;
 }
 case 'tt-team-refresh':{
  if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  await loadTimeTrackerTeam();break;
 }
 case 'tt-team-role':
 case 'tt-team-layout':{
  if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
     state.ttAttendance?.status!=='VERIFIED_READ'||!state.ttTeam)return;
  if(name==='tt-team-role'&&['All','Unassigned',...TT_TEAM_ROLES].includes(button.dataset.role))
    state.ttTeamFilters={...state.ttTeamFilters,role:button.dataset.role};
  if(name==='tt-team-layout'&&['grid','list'].includes(button.dataset.layout))
    state.ttTeamFilters={...state.ttTeamFilters,layout:button.dataset.layout};
  render();break;
 }
 case 'tt-team-export':{
  if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
     state.ttAttendance?.status!=='VERIFIED_READ'||!state.ttTeam)return;
  const id=state.context?.user_id,ws=state.context?.workspace_id,
   boardId=state.boardId,seq=routeSerial;
  const verified=await timeTracker.teamDirectory(boardId);
  if(seq!==routeSerial||state.context?.user_id!==id||
     state.context?.workspace_id!==ws||verified.actorId!==id||
     verified.workspaceId!==ws)return;
  const blob=new Blob([timeTrackerTeamCsv(verified)],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try{const link=document.createElement('a');link.href=url;
   link.download='timetracker-authorized-team.csv';link.click();}
  finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tt-hours-week-prev':
 case 'tt-hours-week-next':
 case 'tt-hours-week-current':
 case 'tt-hours-month-prev':
 case 'tt-hours-month-next':
 case 'tt-hours-month-current':
 case 'tt-hours-day':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='hours'||
     state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ')return;
  if(name==='tt-hours-week-current')state.ttHoursWeekOffset=0;
  if(name==='tt-hours-week-prev'||name==='tt-hours-week-next'){
   const step=name==='tt-hours-week-prev'?-1:1;
   const candidate=state.ttHoursWeekOffset+step;
   if(Math.abs(candidate)>104)return;
   timeTrackerMyHoursWeek(candidate);
   state.ttHoursWeekOffset=candidate;
  }
  if(name==='tt-hours-month-current'){
   state.ttHoursMonth=timeTrackerCalendarMonth();
   state.ttHoursSelectedDay='';
  }
  if(name==='tt-hours-month-prev'||name==='tt-hours-month-next'){
   const current=state.ttHoursMonth||timeTrackerCalendarMonth();
   const next=shiftTimeTrackerCalendarMonth(current,
    name==='tt-hours-month-prev'?-1:1);
   state.ttHoursMonth=next;state.ttHoursSelectedDay='';
  }
  if(name==='tt-hours-day'){
   const day=button.dataset.day||'';
   const current=state.ttHoursMonth||timeTrackerCalendarMonth();
   if(!/^\d{4}-(0[1-9]|1[0-2])-([0-3]\d)$/.test(day)||
      !day.startsWith(current+'-'))return;
   const date=new Date(day+'T00:00:00.000Z');
   if(!Number.isFinite(+date)||date.toISOString().slice(0,10)!==day)return;
   state.ttHoursSelectedDay=state.ttHoursSelectedDay===day?'':day;
  }
  render();break;
 }
 case 'tt-ot-prev':
 case 'tt-ot-next':
 case 'tt-ot-current':
 case 'tt-ot-status':
 case 'tt-ot-sort':
 case 'tt-ot-open':
 case 'tt-ot-close':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ')return;
  if(name==='tt-ot-open')state.ttOtModalOpen=true;
  if(name==='tt-ot-close')state.ttOtModalOpen=false;
  if(name==='tt-ot-current')state.ttOtFilters={...state.ttOtFilters,weekOffset:0};
  if(name==='tt-ot-prev'||name==='tt-ot-next'){
   const offset=state.ttOtFilters.weekOffset+(name==='tt-ot-prev'?-1:1);
   if(Math.abs(offset)>104)return;
   state.ttOtFilters={...state.ttOtFilters,weekOffset:offset};
  }
  if(name==='tt-ot-status'&&['Submitted','Approved','Rejected'].includes(button.dataset.status))
   state.ttOtFilters={...state.ttOtFilters,status:button.dataset.status};
  if(name==='tt-ot-sort')
   state.ttOtFilters={...state.ttOtFilters,
    sort:state.ttOtFilters.sort==='oldest'?'newest':'oldest'};
  render();break;
 }
 case 'tt-ot-approve':
 case 'tt-ot-reject':{
  if(!TT_OT_WRITES_ACCEPTED||state.ttBusy||
     state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ'||
     state.ttAttendance.access?.bootstrapApprover!==true)return;
  const requestId=button.dataset.id;
  const decision=name==='tt-ot-approve'?'Approved':'Rejected';
  if(!confirm(decision+' this overtime request? The decision will be audited and cannot be reversed here.'))return;
  state.ttBusy=true;render();
  try{
   await timeTracker.decideOvertime(state.boardId,requestId,decision);
   await loadTimeTracker();
   toast('Overtime request '+decision.toLowerCase()+'.');
  }finally{state.ttBusy=false;render();}
  break;
 }
 case 'tt-report-preset':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='reports'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const period=button.dataset.period;
  if(!['all','today','week','month','custom'].includes(period))return;
  state.ttReportPeriod=period;render();break;
 }
 case 'tt-report-status':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='reports'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const status=button.dataset.status;
  if(!['all','Late','Active','Completed'].includes(status))return;
  state.ttReportFilters={...state.ttReportFilters,status};render();break;
 }
 case 'user-role-refresh':{
   if(!state.roleVerified||state.userRoleBusy)return;
   state.userRoleBusy=true;render();
   try{await loadUserRoleManagement();}catch(err){state.userRoleError=errorMessage(err);notice(err);}
   finally{state.userRoleBusy=false;render();}
   break;
 }
 case 'user-role-edit-crm-platform':
 case 'user-role-revert-crm-platform':{
   if(!state.roleVerified||state.userRoleBusy||!state.userRoleData)return;
   const userId=button.dataset.userId;
   const user=state.userRoleData.users.find(u=>u.id===userId&&
     !u.protected&&u.platformRole!=='admin_general_manager');
   if(!user||userId!==state.userRoleSelected)
     throw new ApiError('Protected or stale CRM platform role target.',403);
   const record=state.userRoleData.crmPlatformRoles?.find(r=>r.userId===userId);
   if(!record)throw new ApiError('Authoritative CRM role snapshot missing.',403);
   const reverting=name==='user-role-revert-crm-platform';
   if(reverting&&!record.assignedRole)throw new ApiError('No CRM override to revoke.',409);
   const fields='<div class="note">APSYNTRA CRM platform role for '+e(user.name||user.email)+
    '. CRM tiers cap module and board permissions without changing WatchdogWorkspace identity. '+
    'Changes are audited and enforced by the central backend.</div>'+
    (reverting?'':select('CRM platform role','role',
      APSYNTRA_CRM_PLATFORM_ROLES.map(x=>[x,x[0].toUpperCase()+x.slice(1)]),
      record.assignedRole||record.effectiveRole))+
    input('Type APPLY CRM ROLE','ack');
   openModal(reverting?'Revert CRM platform role':'Assign APSYNTRA CRM platform role',fields,async fd=>{
     if(String(fd.get('ack')||'')!=='APPLY CRM ROLE')
       throw new ApiError('Confirm by typing APPLY CRM ROLE exactly.');
     const role=reverting?null:String(fd.get('role'));
     if(role!==null&&!APSYNTRA_CRM_PLATFORM_ROLES.includes(role))
       throw new ApiError('Invalid CRM platform role.',400);
     state.userRoleBusy=true;
     try{await applyCrmPlatformRole({userId,role,
       expectedUpdatedAt:record.updatedAt||null});}
     finally{state.userRoleBusy=false;render();}
   });
   break;
 }
 case 'user-role-edit-module':
 case 'user-role-revoke-module':
 case 'user-role-edit-board':
 case 'user-role-revoke-board':{
   if(!state.roleVerified||state.userRoleBusy||!state.userRoleData)return;
   const scope=name.includes('module')?'module':'board';
   const resourceId=button.dataset.resource,userId=button.dataset.userId;
   const user=state.userRoleData.users.find(u=>u.id===userId&&!u.protected&&u.platformRole!=='admin_general_manager');
   if(!user||userId!==state.userRoleSelected)throw new ApiError('Protected or stale target.',403);
   const record=scope==='module'?
      state.userRoleData.moduleAssignments.find(r=>r.userId===userId&&r.moduleId===resourceId):
      state.userRoleData.boardAssignments.find(r=>r.userId===userId&&r.boardId===resourceId);
   if(record?.role==='owner')throw new ApiError('Board owner is protected.',403);
   const enabled=!name.includes('revoke');
   const options=scope==='module'?MODULE_ROLE_OPTIONS[resourceId]:['viewer','editor'];
   if(!options?.length)throw new ApiError('Unsupported role resource.');
   const current=record?.role&&options.includes(record.role)?record.role:options[0];
   const label=scope==='module'?ROLE_MODULE_OPTIONS.find(m=>m[0]===resourceId)?.[1]:
      state.userRoleData.boards.find(b=>b.id===resourceId)?.name;
   if(!label)throw new ApiError('Unknown board or application.');
   const fields='<div class="note">Target: '+e(user.name||user.email)+' / '+e(label)+
       '. The change is enforced immediately by the existing central backend and recorded in immutable audit history.</div>'+
      (enabled?select('Role','role',options.map(r=>[r,r]),current):'')+
      input('Type APPLY ROLE CHANGE','ack');
   openModal((enabled?'Assign / modify':'Revoke')+' role',fields,async fd=>{
      if(String(fd.get('ack')||'')!=='APPLY ROLE CHANGE')throw new ApiError('Confirm by typing APPLY ROLE CHANGE exactly.');
      state.userRoleBusy=true;
      try{await applyUserRoleChange({userId,scope,resourceId,role:enabled?String(fd.get('role')):current,
        enabled,expectedUpdatedAt:record?.updatedAt||null});}
      finally{state.userRoleBusy=false;render();}
   });
   break;
 }
 case 'role-tab':{
   if(!state.roleVerified)return;
   const tab=button.dataset.tab;
   if(['roles','users','matrix','workspace','audit'].includes(tab)&&tab!==state.roleTab){
    state.roleTab=tab;render();
    animateTabContent('.aps-role-configuration');
   }
   break;
 }
 case 'role-refresh':{
   if(!state.roleVerified||state.roleBusy)return;
   state.roleBusy=true;render();
   try{await loadRoleConfiguration();}catch(err){state.roleError=errorMessage(err);notice(err);}
   finally{state.roleBusy=false;render();}
   break;
 }
 case 'role-propose-create':{
   if(!state.roleVerified)return;
   openModal('Stage a new role definition',
      input('Role key','roleKey','custom_role')+
      input('Display name','displayName','Custom Role')+
      input('Description','description','', 'text',false),
      async fd=>stageRoleProposal('role.create',{
        roleKey:String(fd.get('roleKey')||'').trim(),
        displayName:String(fd.get('displayName')||'').trim(),
        description:String(fd.get('description')||'').trim()
      }));break;
 }
 case 'role-propose-edit':{
   if(!state.roleVerified)return;
   const key=button.dataset.roleKey;
   const role=state.roleData?.roles?.find(r=>r.roleKey===key&&r.kind==='custom_draft');
   if(!role)throw new ApiError('Only draft custom roles may be edited.');
   openModal('Stage role revision',
      input('Role key','roleKey',key,'text',true)+
      input('Display name','displayName',role.displayName)+
      input('Description','description','', 'text',false),
      async fd=>stageRoleProposal('role.edit',{
       roleKey:key,displayName:String(fd.get('displayName')||'').trim(),
       description:String(fd.get('description')||'').trim()
      }));break;
 }
 case 'role-propose-activation':{
   if(!state.roleVerified)return;
   const roles=state.roleData?.roles?.filter(r=>r.kind==='custom_draft')||[];
   if(!roles.length){toast('No custom roles are available for staging.',true);return;}
   openModal('Stage activation or deactivation',
      select('Custom role','roleKey',roles.map(r=>[r.roleKey,r.displayName]))+
      select('Proposed change','operation',[['role.activate','Activate'],['role.deactivate','Deactivate']]),
      async fd=>stageRoleProposal(String(fd.get('operation')),{roleKey:String(fd.get('roleKey'))}));break;
 }
 case 'role-propose-assign':{
   if(!state.roleVerified)return;
   const id=button.dataset.userId;
   const user=state.roleData?.users?.find(u=>u.id===id&&!u.bootstrapProtected);
   if(!user)throw new ApiError('Protected or missing user cannot be assigned.',403);
   openModal('Stage an application role change',
      select('Application module','moduleId',ROLE_MODULE_OPTIONS)+
      select('Proposed change','operation',[['assignment.assign','Assign'],['assignment.revoke','Revoke']])+
      input('Existing application role','role','Employee'),
      async fd=>stageRoleProposal(String(fd.get('operation')),
        {userId:id,moduleId:String(fd.get('moduleId')),role:String(fd.get('role')).trim()}));break;
 }
 case 'role-propose-permission':{
   if(!state.roleVerified)return;
   const moduleId=button.dataset.moduleId,capability=button.dataset.capability;
   if(!ROLE_MODULE_OPTIONS.some(x=>x[0]===moduleId)||
      !['view','create','edit','delete','approve','export','administer'].includes(capability))
     throw new ApiError('Unknown permission scope.');
   openModal('Stage module capability',
     input('Role key','roleKey','employee')+
     select('Proposed access','enabled',[['false','Deny'],['true','Allow']]),
     async fd=>stageRoleProposal('permission.configure',
       {moduleId,capability,roleKey:String(fd.get('roleKey')).trim(),enabled:fd.get('enabled')==='true'}));break;
 }
 case 'role-propose-workspace':{
   if(!state.roleVerified)return;
   const users=state.roleData?.users?.filter(u=>!u.bootstrapProtected)||[];
   if(!users.length){toast('No eligible workspace members.',true);return;}
   openModal('Stage workspace access restriction',
      select('Member','userId',users.map(u=>[u.id,u.displayName||u.email||'Member']))+
      select('Requested restriction','enabled',[['false','Suspend workspace access'],['true','Restore existing access']]),
      async fd=>stageRoleProposal('workspace.configure',
         {userId:String(fd.get('userId')),enabled:fd.get('enabled')==='true'}));break;
 }
 case 'security-effective-access':{
   if(state.effectiveAccessBusy||!state.context||!auth.isSignedIn)return;
   state.effectiveAccessBusy=true;state.effectiveAccessResult=null;
   const revision=++state.effectiveAccessRunId;render();
   try{
     const result=await inspectMySignedEffectiveAccess({auth,api:db});
     if(revision!==state.effectiveAccessRunId||!auth.isSignedIn)return;
     state.effectiveAccessResult=result;
     if(result.status==='PASS'){
       // The snapshot's board list was already filtered by the authoritative
       // work_board_access RPC, not by a client-side guess or host role.
       toast('Signed effective platform, application and board permissions inspected.');
     }else toast('Effective permission inspection '+result.status+'.',true);
   }catch{
     if(revision===state.effectiveAccessRunId&&auth.isSignedIn)
       state.effectiveAccessResult={checkpoint:'CP-FRT-SEC11',status:'BLOCKED',
        reason:'SIGNED_SELF_INSPECTION_INCOMPLETE',modules:[],boards:[],
        writesAttempted:0,roleChangesAttempted:0};
   }finally{if(revision===state.effectiveAccessRunId){state.effectiveAccessBusy=false;render();}}
   break;
 }
 case 'security-effective-access-copy':{
   if(!state.effectiveAccessResult)return;
   try{
     await navigator.clipboard.writeText(sanitizeEffectiveAccessReport(state.effectiveAccessResult));
     toast('Nonsecret permission summary copied.');
   }catch{toast('Clipboard unavailable. Use the displayed summary.',true);}
   break;
 }
 case 'security-sec10-readonly':{
   if(state.sec10Busy||!state.context||!auth.isSignedIn)return;
   if(state.roleVerified===true)
     return toast('SEC10 requires a signed nonbootstrap user in an approved isolated nonproduction environment. Sign out of the bootstrap administrator account.',true);
   const stage=root.querySelector('#sec10-stage')?.value||'';
   const boardId=root.querySelector('#sec10-board')?.value||'';
   if(!state.boards.some(b=>b.id===boardId)||!['VIEWER','SUPERVISOR','RESTORED'].includes(stage))
     return toast('Choose an existing board and the independently verified CRM transition stage.',true);
   state.sec10Busy=true;state.sec10Result=null;
   const revision=++state.sec10RunId;render();
   try{
     const result=await runFRTSec10SignedCeilingProbe({auth,api:db,boardId,stage});
     if(revision!==state.sec10RunId||!auth.isSignedIn)return;
     state.sec10Result=result;
     toast(result.status==='PASS'?'Signed role-ceiling checks passed; fresh login still requires separate evidence.':
       'Signed role-ceiling checks '+result.status+'.',result.status!=='PASS');
   }catch{
     if(revision===state.sec10RunId&&auth.isSignedIn)
       state.sec10Result={checkpoint:'CP-FRT-SEC10',status:'BLOCKED',phase:stage,
        scenario:'NONBOOTSTRAP',checks:[],writesAttempted:0,roleChangesAttempted:0,
        reason:'SIGNED_CAPABILITY_READ_INCOMPLETE'};
   }finally{if(revision===state.sec10RunId){state.sec10Busy=false;render();}}
   break;
 }
 case 'security-sec10-copy':{
   if(!state.sec10Result)return;
   try{
     await navigator.clipboard.writeText(sanitizeFRTSec10Report(state.sec10Result));
     toast('Nonsecret SEC10 capability report copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-sec09-readonly':{
   if(state.sec09Busy||!state.context)return;
   state.sec09Busy=true;state.sec09Result=null;
   const revision=++state.sec09RunId;render();
   try{
     const result=await runFRTSec09SignedAcceptance({auth,api:db});
     if(revision!==state.sec09RunId||!auth.isSignedIn)return;
     state.sec09Result=result;
     toast(result.status==='PASS'?'Signed CP-FRT-SEC09 read-only acceptance passed.':
       'Signed CP-FRT-SEC09 '+result.status+'. Review the result.',result.status!=='PASS');
   }catch{
     if(revision===state.sec09RunId&&auth.isSignedIn)
      state.sec09Result={checkpoint:'CP-FRT-SEC09',status:'BLOCKED',scenario:'UNVERIFIED',
       checks:[],sources:[],writesAttempted:0,roleChangesAttempted:0,
       reason:'SIGNED_READ_ONLY_ACCEPTANCE_INCOMPLETE'};
   }finally{if(revision===state.sec09RunId){state.sec09Busy=false;render();}}
   break;
 }
 case 'security-sec09-copy':{
   if(!state.sec09Result)return;
   try{
     await navigator.clipboard.writeText(sanitizeFRTSec09Report(state.sec09Result));
     toast('Nonsecret SEC09 result copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-sec07-readonly':{
   if(state.sec07Busy||!state.context)return;
   state.sec07Busy=true;state.sec07Result=null;render();
   try{
     state.sec07Result=await runFRTSec07ActivationGate({auth,api:db});
     const outcome=state.sec07Result.status;
     toast(outcome==='PASS'?'CRM signed read-only activation gate passed.':
       'CRM role activation gate '+outcome+'. Review the checks.',outcome!=='PASS');
   }catch{
     state.sec07Result={checkpoint:'CP-FRT-SEC07',status:'BLOCKED',
       scenario:'UNVERIFIED',checks:[],writesAttempted:0,
       reason:'SIGNED_READ_ONLY_CHECK_INCOMPLETE'};
   }finally{state.sec07Busy=false;render();}
   break;
 }
 case 'security-sec07-copy':{
   if(!state.sec07Result)return;
   const {checkpoint,status,scenario,checks,writesAttempted,reason}=state.sec07Result;
   try{
     await navigator.clipboard.writeText(JSON.stringify({
       checkpoint,status,scenario,checks,writesAttempted,reason
     },null,2));
     toast('Nonsecret SEC07 result copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'frt-finance-detail':{
   if(state.frtFinanceBusy||state.frtFinanceDetailBusy||
      state.tab!=='finance'||!auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   if(!state.frtFinance?.requests?.some(r=>r.requestId===requestId))return;
   await loadFRTFinanceDetail(requestId);
   break;
 }
 case 'frt-finance-detail-close':{
   state.frtFinanceDetailRevision++;state.frtFinanceDetailBusy=false;
   state.frtFinanceDetail=null;state.frtFinanceDetailId=null;render();break;
 }
 case 'frt-finance-refresh':{
   if(state.frtFinanceBusy||state.tab!=='finance'||!auth.isSignedIn)return;
   await loadFRTFinance(state.frtFinance?.companyCode||null);
   break;
 }
 case 'frt-finance-company':{
   if(state.frtFinanceBusy||state.tab!=='finance'||!auth.isSignedIn)return;
   const code=String(button?.dataset?.code||'');
   if(!state.frtFinance?.companies?.some(c=>c.code===code))return;
   await loadFRTFinance(code);
   break;
 }
 case 'security-sec14-readonly':{
   if(state.sec14Busy||!state.context||!auth.isSignedIn)return;
   state.sec14Busy=true;state.sec14Result=null;
   const revision=++state.sec14RunId;render();
   try{
    const result=await runSEC14SignedRead({auth,api:db});
    if(revision!==state.sec14RunId||!auth.isSignedIn)return;
    state.sec14Result=result;
    toast(result.status==='PASS'?'SEC14 signed restricted reads passed.':
      'SEC14 signed restricted-read result: '+result.status,result.status!=='PASS');
   }finally{
    if(revision===state.sec14RunId){state.sec14Busy=false;render();}
   }
   break;
 }
 case 'security-sec14-denial':{
   if(state.sec14DenialBusy||!state.context||!auth.isSignedIn)return;
   state.sec14DenialBusy=true;state.sec14DenialResult=null;
   const revision=++state.sec14DenialRunId;render();
   try{
    const result=await runSEC14SignedDenials({auth,api:db});
    if(revision!==state.sec14DenialRunId||!auth.isSignedIn)return;
    state.sec14DenialResult=result;
    toast('SEC14 nonbootstrap denial verification: '+result.status,result.status!=='PASS');
   }finally{
    if(revision===state.sec14DenialRunId){state.sec14DenialBusy=false;render();}
   }
   break;
 }
 case 'security-sec14-denial-copy':{
   if(!state.sec14DenialResult)return;
   try{
    await navigator.clipboard.writeText(sanitizeSEC14SignedDenials(state.sec14DenialResult));
    toast('Nonsecret SEC14 denial report copied.');
   }catch{toast('Clipboard unavailable.',true);}
   break;
 }
 case 'security-sec14-copy':{
   if(!state.sec14Result)return;
   try{
    await navigator.clipboard.writeText(sanitizeSEC14SignedRead(state.sec14Result));
    toast('Nonsecret SEC14 signed read report copied.');
   }catch{toast('Clipboard unavailable.',true);}
   break;
 }
 case 'security-ci07-readonly':{
   if(state.ci07Busy||!state.context||!auth.isSignedIn)return;
   state.ci07Busy=true;state.ci07Result=null;
   const revision=++state.ci07RunId;render();
   try{
     const result=await runFRTCI07SignedRoleProbe({auth,api:db});
     if(revision!==state.ci07RunId||!auth.isSignedIn)return;
     state.ci07Result=result;
     toast(result.status==='PASS'?'Live signed FRT role resolved through session guard.':
       'CI07 signed FRT read-only check '+result.status+'.',result.status!=='PASS');
   }catch{
     if(revision===state.ci07RunId&&auth.isSignedIn)
       state.ci07Result={checkpoint:'CP-FRT-SEC10-CI07',status:'BLOCKED',
        reason:'SIGNED_FRT_READONLY_PROBE_INCOMPLETE',role:'UNVERIFIED',
        checks:[],writesAttempted:0,roleChangesAttempted:0,
        revocationVerified:'NOT_VERIFIED',financialOperationsVerified:'NOT_VERIFIED'};
   }finally{
     if(revision===state.ci07RunId){state.ci07Busy=false;render();}
   }
   break;
 }
 case 'security-ci07-copy':{
   if(!state.ci07Result)return;
   try{
     await navigator.clipboard.writeText(sanitizeFRTCI07Report(state.ci07Result));
     toast('Nonsecret CI07 read-only result copied.');
   }catch{toast('Clipboard unavailable. Use the displayed summary.',true);}
   break;
 }
 case 'security-frt-readonly':{
   if(state.frtSecurityBusy||!state.context)return;
   state.frtSecurityBusy=true;state.frtSecurityResult=null;render();
   try{
     state.frtSecurityResult=await runFRTSec03SignedAcceptance({auth,api:db});
     const result=state.frtSecurityResult;
     toast(result.status==='PASS'?'FRT signed read-only checks passed.':
       result.status==='BLOCKED'?'Signed FRT acceptance blocked. Review the result.':
       'FRT authorization check failed. Review the result.',result.status!=='PASS');
   }catch{
     // Never display or export raw server errors: they may contain identity data.
     state.frtSecurityResult={checkpoint:'CP-FRT-SEC03',status:'BLOCKED',
       scenario:'UNVERIFIED',checks:[],writesAttempted:0,
       reason:'Authenticated read-only request did not complete'};
   }finally{state.frtSecurityBusy=false;render();}
   break;
 }
 case 'security-frt-copy':{
   if(!state.frtSecurityResult)return;
   const {checkpoint,status,scenario,checks,writesAttempted,reason}=state.frtSecurityResult;
   try{
     await navigator.clipboard.writeText(JSON.stringify(
       {checkpoint,status,scenario,checks,writesAttempted,reason},null,2));
     toast('Nonsecret FRT acceptance report copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'security-run-negative':{
   if(state.securityBusy)return;
   state.securityBusy=true;state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;
   render();
   try{
     state.securityResult=await runSignedNegativeBoardAcceptance(auth,db,{
       onBoard:entry=>{state.securityProgress.push(entry);render();}
     });
     const report=state.securityResult;
     if(report.status==='pass')toast('Signed read-only authorization checks passed on twelve boards.');
     else if(report.status==='fail')toast('Unexpected authorization result. Review the failed board.',true);
     else toast('This account cannot establish the selected negative-access scenario.',true);
   }catch(err){notice(err);}
   finally{state.securityBusy=false;render();}
   break;
 }
 case 'security-deny-write':{
   if(state.securityWriteBusy||state.securityResult?.status!=='pass')return;
   openModal('Confirm isolated QA denial',input('Type VERIFY DENIAL','ack')+
    '<div class="note security-note">This submits one expected-to-fail create attempt to the isolated APSYNTRA QA board only. It must return HTTP 403. If unexpectedly authorized, the test attempts to delete only its unique QA item.</div>',
    async fd=>{
      if(String(fd.get('ack')||'')!=='VERIFY DENIAL')throw new ApiError('Enter VERIFY DENIAL exactly.');
      state.securityWriteBusy=true;state.securityWriteResult=null;render();
      try{
        state.securityWriteResult=await runDeniedQaWrite(auth,db,{verifiedReadOnlyResult:state.securityResult});
        toast(state.securityWriteResult.status==='pass'?'Signed QA write rejected correctly.':'QA write rejection was not verified.',state.securityWriteResult.status!=='pass');
      }finally{state.securityWriteBusy=false;render();}
    });
   break;
 }
 case 'security-copy-report':{
   if(!state.securityResult)return;
   try{
     await navigator.clipboard.writeText(sanitizeNegativeReport(state.securityResult));
     toast('Nonsecret acceptance report copied.');
   }catch{toast('Clipboard unavailable. Use the displayed result.',true);}
   break;
 }
 case 'foundation-refresh':{
   if(state.roleVerified!==true)return;
   if(state.foundationBusy||state.provisionBusy)return;
   state.foundationBusy=true;state.foundationError='';render();
   try{await refreshFoundation();}catch(err){state.foundationError=errorMessage(err);notice(err);}
   finally{state.foundationBusy=false;render();}
   break;
 }
 case 'foundation-provision':{
   if(state.roleVerified!==true)return;
   if(state.provisionBusy||state.context?.profile?.platform_role!=='admin_general_manager')return;
   openModal('Provision twelve dedicated boards',
     input('Type PROVISION 12 BOARDS to confirm','ack')+
     '<div class="note security-note">This creates empty domain-specific boards with owner-only membership through existing signed RPCs. Archived boards and operational records are not changed. Application acceptance is not included.</div>',
     async fd=>{
       if(String(fd.get('ack')||'')!=='PROVISION 12 BOARDS')
         throw new ApiError('Enter PROVISION 12 BOARDS exactly.');
       state.provisionBusy=true;state.foundationError='';state.foundationLog=[];render();
       try{
         await provisionMissingBoards(db,{context:state.context,confirm:true,onProgress:entry=>{
           state.foundationLog.push(entry.key+': '+entry.action);render();
         }});
         await refreshWorkspace();await refreshFoundation();
         toast('Dedicated board provisioning completed; inspect live readiness.');
       }catch(err){
         state.foundationError=errorMessage(err);notice(err);
         try{await refreshWorkspace();await refreshFoundation();}catch{/* preserve original error */}
         throw err;
       }finally{state.provisionBusy=false;render();}
     });
   break;
 }
 case 'foundation-operational-test':{
   if(state.roleVerified!==true)return;
   if(state.foundationTesting||state.context?.profile?.platform_role!=='admin_general_manager')return;
   openModal('Verify all twelve dedicated boards',
     input('Type RUN 12 BOARD CHECKS','ack')+
     '<div class="note security-note">This executes real signed QA create, conditional update, stale-write denial, delete and audit checks only on the twelve EMPTY dedicated boards. Changes leave event records. Do not run if any board contains production records.</div>',
     async fd=>{
       if(String(fd.get('ack')||'')!=='RUN 12 BOARD CHECKS')
         throw new ApiError('Type RUN 12 BOARD CHECKS exactly.');
       state.foundationTesting=true;state.foundationTestResult=null;state.foundationLog=[];render();
       try{
         state.foundationTestResult=await runTwelveBoardQa(db,{
          context:state.context,onProgress:entry=>{
           state.foundationLog.push(entry.boardName+': '+entry.status);render();
          }});
         const r=state.foundationTestResult;
         toast(r.status==='pass'?'Signed 12-board foundation acceptance passed.':
           'Foundation acceptance stopped on a failed board. Review evidence.',r.status!=='pass');
       }finally{state.foundationTesting=false;render();}
     });
   break;
 }
 case 'new-board':{
   openModal('Create a board',input('Board name','name')+input('Description (optional)','description','','text',false),async fd=>{
     const title=String(fd.get('name')||'').trim();if(!title)throw new ApiError('Board name is required.');
     const id=await createItemOnlyBoard({api:db,structure:boardStructureClient,auth,
      name:title,description:String(fd.get('description')||'')});
     await refreshWorkspace();location.hash='#/boards/'+id;await onRoute();
   });break;
 }
 case 'active-boards':{state.showArchived=false;state.showTrash=false;render();break;}
 case 'archived-boards':{state.showArchived=true;state.showTrash=false;try{state.archived=await db.boards('archived');}catch(err){notice(err);}render();break;}
 case 'trashed-boards':{if(!BOARD_CARD_LIFECYCLE_ENABLED)return;state.showTrash=true;state.showArchived=false;try{state.trashed=await db.boards('trashed');}catch(err){notice(err);}render();break;}
 case 'board-card-edit':{
  const board=await authorizeBoardCardAction(button.dataset.id);
  closeBoardCardMenus();
  openModal('Edit board — '+board.name,
   '<div class="field"><label for="modal-board-name">Board name</label>'+
   '<input id="modal-board-name" name="name" required maxlength="120" value="'+e(board.name)+'"/></div>'+
   '<div class="field"><label for="modal-board-description">Description</label>'+
   '<textarea id="modal-board-description" name="description" maxlength="1200">'+
   e(board.description||'')+'</textarea></div>'+
   '<div class="note">Existing items, columns, members and audit history remain unchanged.</div>',
   async fd=>{
    state.boardLifecycleBusy=true;
    try{
     await boardCardLifecycle.edit(board,{name:String(fd.get('name')||''),
      description:String(fd.get('description')||'')});
     await refreshBoardCardLists();render();
    }finally{state.boardLifecycleBusy=false;}
   });
  break;
 }
 case 'board-card-trash':{
  const board=await authorizeBoardCardAction(button.dataset.id);
  closeBoardCardMenus();
  openModal('Delete board — '+board.name,
   '<div class="note security-note">Move this exact board to recoverable Trash? '+
   'Its '+(Number(board.item_count)||0)+' active items, columns, groups, files, audit history and members remain stored. '+
   'It will disappear from Active and Archived. Restore it from Trash when needed. '+
   'Permanent deletion is not offered.</div>'+
   '<div class="field"><label for="modal-board-confirm">Type '+e(board.name)+' to confirm</label>'+
   '<input id="modal-board-confirm" name="confirm" required autocomplete="off" maxlength="120" /></div>',
   async fd=>{
    state.boardLifecycleBusy=true;
    try{
     await boardCardLifecycle.trash(board,String(fd.get('confirm')||''));
     await refreshBoardCardLists();render();
    }finally{state.boardLifecycleBusy=false;}
   },{submitLabel:'Move board to trash'});
  break;
 }
 case 'board-card-restore':{
  const board=await authorizeBoardCardAction(button.dataset.id);
  closeBoardCardMenus();state.boardLifecycleBusy=true;
  try{
   await boardCardLifecycle.restore(board);
   await refreshBoardCardLists();render();toast('Board restored to Active.');
  }finally{state.boardLifecycleBusy=false;}
  break;
 }
case 'group-inline-edit':{
 // Open immediately during the originating user gesture. Waiting for a second
 // permission RPC here can leave the menu dismissed with no visible editor.
 // state.edit was obtained from signed board authorization; saveGroupInline
 // independently revalidates identity, board revision and server permissions.
 if(!activeBoardLayout()||!state.edit||state.groupEditBusy)return;
 const groupId=button.dataset.id;
 if(!state.board.groups?.some(g=>g.id===groupId))return;
 state.groupEditId=groupId;
 render();
 const editor=root.querySelector('[data-group-inline-form="'+groupId+'"] input');
 editor?.focus();editor?.select();
 break;
}
case 'group-inline-cancel':{if(!state.groupEditBusy){state.groupEditId=null;render();}break;}
case 'group-select-visible':{
 if(!activeBoardLayout())return;
 const visible=[...root.querySelectorAll('table[data-group-id="'+button.dataset.id+'"] [data-board-select-item]')]
  .filter(input=>!input.closest('tr')?.hidden).map(input=>input.dataset.boardSelectItem);
 itemSelection.selectVisible(visible);syncBoardSelectionUi();break;
}
case 'row01-prepare':
case 'row01-finalize':{
 if(state.row01Busy||!activeBoardLayout()||
    !isRow01Fixture(state.board?.board))return;
 const boardId=state.boardId,actor=state.context?.user_id,
  workspace=state.context?.workspace_id;
 if(name==='row01-prepare'&&!confirm('Run signed ROW01 acceptance on this specifically designated empty fixture? A uniquely identified QA item will be created and edited. Reload this tab and finalize to verify and remove it.'))return;
 state.row01Busy=true;state.row01Result=null;render();
 try{
  const options={auth,api:db,boardId,storage:sessionStorage,bootId:row01BootId};
  const result=name==='row01-prepare'?
   await prepareRow01Acceptance(options):await finalizeRow01Acceptance(options);
  if(state.boardId===boardId&&state.context?.user_id===actor&&
     state.context?.workspace_id===workspace){
   state.row01Result={...result,boardId};
   if(result.status==='PASS')await loadBoard(boardId,'items');
   toast('ROW01 signed fixture acceptance: '+result.status,
    !['PASS','AWAITING_RELOAD'].includes(result.status));
  }
 }finally{state.row01Busy=false;render();}
 break;
}
case 'row01-copy-report':{
 const result=state.row01Result;
 if(!result||result.boardId!==state.boardId)return;
 try{await navigator.clipboard.writeText(sanitizeRow01Report(result));
  toast('ROW01 nonsecret evidence copied.');}
 catch{toast('Clipboard unavailable.',true);}
 break;
}
case 'bulk02-verify':{
 if(!activeBoardLayout()||!state.edit||!canBulkEditBoard(state.board?.board))return;
 await ensureSignedBulkReady(state.board.board);
 break;
}
case 'bulk02-copy-report':{
 if(!state.bulk02Result)return;
 const {checkpoint,status,ready,canManage,checks,pending}=state.bulk02Result;
 try{
  await navigator.clipboard.writeText(JSON.stringify({
   checkpoint,status,ready,canManage,checks,pending
  },null,2));
  toast('Nonsecret signed bulk acceptance result copied.');
 }catch{toast('Clipboard unavailable. Review the visible signed checks.',true);}
 break;
}
case 'bulk-actions':{
 const board=state.board?.board;
 if(!activeBoardLayout()||!itemSelection.size||itemSelection.size>50||
    !canBulkEditBoard(board))return;
 if(!await ensureSignedBulkReady(board))return;
 const count=itemSelection.size;
 const configured=state.board.columns?.find(c=>c.system_key==='status'&&c.data_type==='status');
 const labels=configured?Array.isArray(configured.config?.labels)?
  configured.config.labels.filter(x=>x.active!==false).map(x=>
   [String(x.id),String(x.title||x.label||x.name||x.id)]):[]:
  [['not_started','Not started'],['in_progress','In progress'],
   ['blocked','Blocked'],['done','Done']];
 const actions=[['archive','Archive selected items'],
  ...(labels.length?[['status','Set record status (not custom Status columns)']]:[])];
 const fields=select('Bulk operation','operation',actions,actions[0][0])+
  (labels.length?select('New status (for Set status only)','status',labels,labels[0][0]):'')+
  '<p class="muted">Review before applying to '+count+
  ' selected items. Archive removes records from the active board view but preserves history. '+
  'Submitting is your confirmation for one revision-checked atomic server transaction.</p>';
 openModal('Bulk actions — '+count+' selected',fields,async fd=>{
  const operation=String(fd.get('operation')||'');
  if(!actions.some(([id])=>id===operation))
   throw new ApiError('Unsupported bulk operation.',400);
  if(itemSelection.size!==count||state.boardId!==board.id)
   throw new ApiError('Selection changed; review the bulk action again.',409);
  // This focused submit dialog is the explicit archive confirmation.
  await applySelectedBulk(operation,operation==='status'?String(fd.get('status')||''):null);
 },{submitLabel:'Apply to selected items'});
 if(labels.length){
  const operation=modal?.querySelector('#modal-operation');
  const statusField=modal?.querySelector('#modal-status')?.closest('.field');
  const sync=()=>{if(statusField)statusField.hidden=operation?.value!=='status';};
  operation?.addEventListener('change',sync);sync();
 }
 break;
}
case 'bulk-status':{
 if(!canRequestBulk(state.board?.board)&&!bulkReadyFor(state.board?.board))return;
 if(!itemSelection.size||itemSelection.size>50)return;
 if(!await ensureSignedBulkReady(state.board.board))return;
 const c=state.board.columns?.find(col=>col.system_key==='status'&&col.data_type==='status');
 const options=c?Array.isArray(c.config?.labels)?c.config.labels.filter(x=>x.active!==false)
   .map(x=>[String(x.id),String(x.title||x.label||x.name||x.id)]):[]:
   [['not_started','Not started'],['in_progress','In progress'],['blocked','Blocked'],['done','Done']];
 if(!options.length)throw new ApiError('No writable status labels are configured for this board.',400);
 openModal('Bulk status — '+itemSelection.size+' selected',
  select('New status','status',options,options[0][0]),
  async fd=>{await applySelectedBulk('status',String(fd.get('status')||''));});
 break;
}
case 'delete-selected-item':{
 if(!activeBoardLayout()||!canManuallyEditBoard(state.board?.board,state.edit)||
    itemSelection.size===0)return;
 const board=state.board.board,identity=state.context?.user_id,
  workspace=state.context?.workspace_id;
 const originalIds=new Set(itemSelection.ids);
 const selected=selectedDeleteCandidates(board,state.board.items,originalIds);
 const first=selected[0];
 const choices=selected.map(item=>[item.id,item.title+' — '+item.id.slice(0,8)]);
 const chooser=selected.length>1?
  select('Choose one record to delete','deleteItemId',choices,first.id):'';
 const warning=selected.length>1?
  'You selected '+selected.length+' records. This action permanently deletes ONE chosen record, not the entire selection. The others remain selected. ': '';
 openModal(selected.length>1?'Permanently delete one of '+selected.length+' selected items':
  'Permanently delete item',
  '<div class="note security-note">'+e(warning)+
   'Existing file-backed items are blocked by PostgreSQL. The current delete RPC has no server-side revision compare-and-swap; a simultaneous edit after the final read remains a risk. No multi-item delete loop is performed.</div>'+
  chooser+
  '<div class="field"><label id="modal-delete-title-label" for="modal-delete-title">Type the exact item name: '+e(first.title)+'</label>'+
  '<input id="modal-delete-title" name="confirmTitle" required autocomplete="off" maxlength="240" /></div>',
  async fd=>{
   if(state.boardId!==board.id||state.context?.user_id!==identity||
      state.context?.workspace_id!==workspace||
      itemSelection.size!==originalIds.size||
      [...originalIds].some(id=>!itemSelection.has(id)))
    throw new ApiError('Signed board selection changed. Reopen the confirmation.',403);
   const id=selected.length===1?first.id:String(fd.get('deleteItemId')||'');
   const item=selected.find(row=>row.id===id);
   if(!item||!itemSelection.has(item.id))
    throw new ApiError('Selected deletion target is no longer available.',409);
   const result=await deleteOneAuthorizedItem({api:db,auth,board,item,
    confirmTitle:String(fd.get('confirmTitle')||'')});
   // loadBoard reconciles selection against the authoritative remaining records.
   // Do not clear unrelated selected items or send a non-atomic delete loop.
   await loadBoard(board.id,'items');
   if(result.audit!=='VERIFIED')
    toast('Item deleted; audit read requires independent verification.',true);
  },{submitLabel:'Delete one item permanently'});
 const targetSelector=modal?.querySelector('[name="deleteItemId"]');
 targetSelector?.addEventListener('change',()=>{
  const chosen=selected.find(x=>x.id===targetSelector.value);
  const label=modal?.querySelector('#modal-delete-title-label');
  const input=modal?.querySelector('#modal-delete-title');
  if(!chosen||!label||!input)return;
  label.textContent='Type the exact item name: '+chosen.title;
  input.value='';input.focus();
 });
 break;
}
case 'bulk-archive':{
 if(!canRequestBulk(state.board?.board)&&!bulkReadyFor(state.board?.board))return;
 if(!itemSelection.size)return;
 if(!await ensureSignedBulkReady(state.board.board))return;
 if(itemSelection.size>50)throw new ApiError('Archive up to 50 items per atomic batch.',400);
 if(!confirm('Archive '+itemSelection.size+' selected records? This action will not delete their history.'))return;
 await applySelectedBulk('archive');break;
}
case 'group-hide-empty':{
 if(!activeBoardLayout()||!isManagedTimeTrackerBoard(state.board?.board))return;
 const group=state.board.groups?.find(g=>g.id===button.dataset.id);
 if(!canSafelyHideEmptyTimeTrackerGroup(state.board.board,group,
     state.board.groups,state.board.items))return;
 hideEmptyTimeTrackerGroup(state.context,state.boardId,group.id);
 render();toast('Empty group hidden in this browser only; no database records were deleted.');
 break;
}
case 'group-show-hidden':{
 if(!activeBoardLayout()||!isManagedTimeTrackerBoard(state.board?.board))return;
 restoreHiddenTimeTrackerGroups(state.context,state.boardId);
 render();toast('Hidden groups are visible again.');
 break;
}
case 'managed-group-delete-empty':{
 if(!MANAGED_TT_GROUP_DELETE_ENABLED||!state.boardManage||!activeBoardLayout())return;
 const board=state.board.board,group=state.board.groups?.find(g=>g.id===button.dataset.id);
 if(!canSafelyHideEmptyTimeTrackerGroup(board,group,state.board.groups,state.board.items))return;
 const confirmTitle=window.prompt('Protected TimeTracker board: permanently remove the empty nonprimary group "'+group.title+'"? Type DELETE '+group.title+' to confirm:');
 if(confirmTitle===null)return;
 const result=await deleteEmptyManagedTimeTrackerGroup({
  auth,api:db,board,group,allGroups:state.board.groups,items:state.board.items,
  confirmation:confirmTitle
 });
 restoreHiddenTimeTrackerGroups(state.context,state.boardId);
 await loadBoard(board.id,'items');
 toast(result.audit==='VERIFIED'?'Signed empty group deletion audited.':
  'Group deleted; verify the audit log.',result.audit!=='VERIFIED');
 break;
}
case 'group-delete-empty':{
 if(!bulkReadyFor(state.board?.board)||!state.bulk02Access?.canManage)return;
 const group=state.board.groups?.find(g=>g.id===button.dataset.id);
 if(!group||!activeBoardLayout())return;
 if(state.board.groups.length<=1||state.board.items?.some(item=>item.group_id===group.id))
  throw new ApiError('Only a completely empty, nonfinal group can be deleted.',400);
 if(!await db.allowed(state.boardId,'manage'))
  throw new ApiError('Group deletion requires effective board manager permission.',403);
 if(!confirm('Delete the empty group "'+group.title+'"? This cannot be undone.'))return;
 await boardBulkClient.group(state.board.board,group,'delete_empty');
 await loadBoard(state.boardId,'items');toast('Empty group deleted.');break;
}
case 'bulk-clear':{itemSelection.clear();syncBoardSelectionUi();break;}
case 'bulk-export':{
 if(!activeBoardLayout()||!itemSelection.size)return;
 const before={user:state.context?.user_id,workspace:state.context?.workspace_id,
  board:state.boardId,ids:[...itemSelection.ids]};
 if(before.ids.length>2000)throw new ApiError('Export is limited to 2,000 records.');
 const actor=await auth.getVerifiedUser(),fresh=await db.board(before.board);
 if(actor.id!==before.user||!fresh?.board||fresh.board.workspace_id!==before.workspace||
   !await db.allowed(before.board,'view')||state.boardId!==before.board||
   state.context?.user_id!==before.user||state.context?.workspace_id!==before.workspace)
  throw new ApiError('Signed board scope changed. Refresh before exporting.',403);
 const csv=exportVisibleBoardItems(fresh.items||[],before.ids,{boardId:before.board});
 const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;
 a.download='apsyntra-selected-'+before.board.slice(0,8)+'.csv';
 document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);
 toast('Selected authorized board records exported.');break;
}
case 'new-group':{
   await writeGuard();
   openModal('Add board group',input('Group name','name','New group'),async fd=>{
     await writeGuard();await db.addGroup(state.boardId,String(fd.get('name')||''));await loadBoard(state.boardId,'items');
   });break;
 }
 case 'new-item':{
  if(!activeBoardLayout()||!canManuallyEditBoard(state.board?.board,state.edit))return;
  const footer=root.querySelector('[data-inline-add-row] input');
  if(!footer){toast('Create a group first.',true);return;}
  footer.focus();footer.scrollIntoView({block:'nearest',inline:'nearest'});break;
 }
 case 'edit-item':{await startBoardInlineEdit(button.dataset.id,'record');break;}
 case 'inline-cell-start':{
  await startBoardInlineEdit(button.dataset.itemId,button.dataset.columnKey);break;
 }
 case 'inline-cell-cancel':{
  if(!state.inlineCellBusy){state.inlineCell=null;preserveInlineScroll();}
  break;
 }
 case 'native-new-issue':{
   await writeGuard();
   openModal('Create APSYNTRA native issue',input('Issue title','title')+
    select('Status','status',statuses,statuses[0][0])+select('Priority','priority',priorities,'2'),
    async fd=>{
      await writeGuard();
      await nativeIssues.create(state.boardId,state.context.workspace_id,state.context.user_id,{
        title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))});
      await loadIssues();
    });break;
 }
 case 'new-issue':{
   await writeGuard();
   openModal('Create an APSYNTRA issue',input('Issue title','title')+select('Status','status',statuses,statuses[0][0])+select('Priority','priority',priorities,'2'),
    async fd=>{await writeGuard();await db.createIssue(state.boardId,state.context.workspace_id,
     {title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))},state.context.user_id);
     await loadIssues();});break;
 }
 case 'native-edit-issue':{
   await writeGuard();
   const row=state.issues.find(x=>x.document_id===button.dataset.id);
   if(!row)return;
   const issue=row.payload.snapshot;
   openModal('Edit APSYNTRA native issue',input('Title','title',issue.title)+
    select('Status','status',statuses,issue.status)+select('Priority','priority',priorities,String(issue.priority)),
    async fd=>{
      await writeGuard();
      await nativeIssues.update(state.boardId,state.context.workspace_id,state.context.user_id,row,{
        title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))});
      await loadIssues();
    });break;
 }
 case 'native-remove-issue':{
   await writeGuard();
   const row=state.issues.find(x=>x.document_id===button.dataset.id);
   if(!row||!confirm('Remove this APSYNTRA native issue? Its audit trail remains intact.'))return;
   await nativeIssues.remove(state.boardId,state.context.workspace_id,state.context.user_id,row);
   await loadIssues();toast('Native Issue removed.');break;
 }
 case 'edit-issue':{
   await writeGuard();const row=state.issues.find(x=>x.document_id===button.dataset.id);if(!row)return;
   const issue=row.payload.snapshot;
   openModal('Edit APSYNTRA issue',input('Title','title',issue.title)+select('Status','status',statuses,issue.status)+select('Priority','priority',priorities,String(issue.priority)),
   async fd=>{await writeGuard();await db.updateIssue(state.boardId,state.context.workspace_id,row,{
     title:String(fd.get('title')||''),status:String(fd.get('status')),priority:Number(fd.get('priority'))},state.context.user_id);await loadIssues();});break;
 }
 case 'remove-issue':{
   await writeGuard();const row=state.issues.find(x=>x.document_id===button.dataset.id);
   if(!row||!confirm('Remove this issue? It will be retained as a reversible tombstone.'))return;
   try{await db.removeIssue(state.boardId,state.context.workspace_id,row);await loadIssues();toast('Issue removed.');}catch(err){notice(err);}
   break;
 }
 case 'board-tt-signed-verify':{
   if(state.roleVerified!==true || !(await roleConfig.bootstrapVerified())){toast('Bootstrap administrator access required.',true);break;}
   if(state.boardTtSignedBusy||!state.context)return;
   state.boardTtSignedBusy=true;state.boardTtSignedResult=null;render();
   try{
     state.boardTtSignedResult=await runBoardTtSignedReadOnly({
       auth,api:db,timeTracker,isBootstrap:state.roleVerified===true
     });
     const outcome=state.boardTtSignedResult.status;
     toast('Signed board and GPS read-only checks: '+outcome,outcome!=='PASS');
   }catch{
     state.boardTtSignedResult={checkpoint:'CP-BOARD-MENU01 / CP-TT-GPS01',
      status:'BLOCKED',checks:[{id:'session',status:'BLOCKED',
       detail:'Signed integration could not be completed; no records were modified.'}]};
   }finally{
     state.boardTtSignedBusy=false;render();
   }
   break;
 }
 case 'verify-backend':{
   if(state.roleVerified!==true || !(await roleConfig.bootstrapVerified())){toast('Bootstrap administrator access required.',true);break;}
   if(state.acceptanceBusy)return;
   state.acceptanceBusy=true;state.acceptance=null;render();
   try{
     state.acceptance=await runReadOnlyAcceptance(auth,db);
     const summary=summarizeAcceptance(state.acceptance);
     toast(summary.failed?'Backend verification found '+summary.failed+' failed check(s).':
        summary.passed+' authenticated checks passed.',summary.failed>0);
   }catch(err){notice(err);}
   finally{state.acceptanceBusy=false;render();}
   break;
 }
 case 'run-pages-acceptance':{
   if(state.roleVerified!==true)return;
   if(state.pagesBusy)return;
   const qa=state.boards.find(b=>b.name===QA_BOARD_NAME);
   if(!qa){toast('Create an isolated APSYNTRA QA board first.',true);return;}
   const fields=input('Type APSYNTRA QA to confirm','ack','')+
     '<div class="note security-note">Confirm this is an isolated nonproduction QA board. This test performs real INSERT, UPDATE and removal operations; tombstones and audit events remain in PostgreSQL.</div>';
   openModal('Approve isolated QA write acceptance',fields,async fd=>{
     if(String(fd.get('ack')||'').trim()!==QA_BOARD_NAME)throw new ApiError('Type APSYNTRA QA exactly.');
     state.pagesBusy=true;state.pagesAcceptance=null;render();
     try{
       state.pagesAcceptance=await runPagesPersistenceAcceptance(db,{board:qa,context:state.context});
       if(state.pagesAcceptance.status==='fail')toast('Persistence acceptance failed; inspect the report.',true);
       else toast('Signed Pages persistence and audit acceptance passed.');
     }finally{state.pagesBusy=false;render();}
   });
   break;
 }
 case 'run-native-acceptance':{
   if(state.roleVerified!==true)return;
   if(state.nativeBusy)return;
   const qa=state.boards.find(b=>b.name===QA_BOARD_NAME);
   if(!qa){toast('An isolated APSYNTRA QA board is required.',true);return;}
   const fields=input('Type APSYNTRA QA to confirm','ack','')+
    '<div class="note security-note">This verifies real native Issue transactions on an isolated nonproduction QA board. Successful runs retain audit records and a tombstone.</div>';
   openModal('Confirm native QA acceptance',fields,async fd=>{
     if(String(fd.get('ack')||'').trim()!==QA_BOARD_NAME)throw new ApiError('Type APSYNTRA QA exactly.');
     state.nativeBusy=true;state.nativeAcceptance=null;render();
     try{
       state.nativeAcceptance=await runNativeQa(db,{board:qa,context:state.context});
       toast(state.nativeAcceptance.status==='pass'?'Hosted native acceptance passed.':'Hosted native acceptance failed — inspect the result.',
        state.nativeAcceptance.status!=='pass');
     }finally{state.nativeBusy=false;render();}
   });
   break;
 }
 case 'copy-token':{
   if(state.roleVerified!==true || !(await roleConfig.bootstrapVerified())){toast('Bootstrap administrator access required.',true);break;}
   if(!confirm('Copy your short-lived access token? Anyone with this token can act as your account. Never share it publicly.'))return;
   try{const token=await auth.copyAccessToken();await navigator.clipboard.writeText(token);toast('Token copied. Use it only in your local acceptance test.');}
   catch(err){notice(err);}break;
 }
 }
}
root.addEventListener('toggle',event=>{
 if(event.target.matches('.tt-log-detail')&&event.target.open)
  void mountSignedTimeTrackerMaps();
},true);

let boardColumnMenuNode=null,boardColumnMenuTrigger=null,boardColumnMenuCleanup=null;
function closeBoardColumnContext({restoreFocus=false}={}){
 boardColumnMenuCleanup?.();boardColumnMenuCleanup=null;
 const trigger=boardColumnMenuTrigger;
 boardColumnMenuNode?.remove();
 boardColumnMenuNode=null;boardColumnMenuTrigger=null;
 if(trigger?.isConnected){
  trigger.setAttribute('aria-expanded','false');
  trigger.classList.remove('board-column-anchor-open');
  if(restoreFocus)trigger.focus();
 }
}
function openBoardColumnContext(trigger){
 const layout=activeBoardLayout(),key=trigger?.dataset.columnKey;
 if(!layout?.columns.includes(key)||!trigger.closest('th[data-column-key]'))return;
 if(boardColumnMenuTrigger===trigger&&boardColumnMenuNode?.isConnected){
  closeBoardColumnContext({restoreFocus:true});return;
 }
 closeBoardColumnContext();
 const name=trigger.closest('th')?.querySelector('.board-heading-label')?.textContent?.trim()||key;
 const customId=key.startsWith('col:')?key.slice(4):null;
 const editableCustom=state.boardManage&&customId&&
  describeBoardColumns(state.board).some(c=>c.id===customId&&c.deletable);
 const manageable=state.boardManage&&(key==='record'||editableCustom);
 const make=(action,label)=>'<button type="button" role="menuitem" data-action="'+action+
  '" data-key="'+e(key)+'">'+e(label)+'</button>';
 const node=document.createElement('div');
 node.className='board-header-context-menu';node.id='board-header-context-menu';
 node.setAttribute('role','menu');node.setAttribute('aria-label','Column options: '+name);
 node.innerHTML=make('board-column-set-width','Set width…')+
  make('board-column-reset-width','Reset width')+
  (!BOARD_REQUIRED_COLUMNS.includes(key)?make('board-column-hide','Hide from my board view'):'')+
  (manageable?make('board-column-manage',key==='record'?'Rename Item column…':
   'Configure column here…'):'')+
  (editableCustom?make('board-column-delete-custom','Delete column here…'):'');
 root.append(node);
 boardColumnMenuNode=node;boardColumnMenuTrigger=trigger;
 trigger.setAttribute('aria-expanded','true');
 trigger.setAttribute('aria-controls',node.id);
 trigger.classList.add('board-column-anchor-open');
 boardColumnMenuCleanup=enhanceActionContextMenu(trigger,node,{
  close:()=>closeBoardColumnContext()
 });
 node.querySelector('[role="menuitem"]')?.focus();
}
let boardDrag=null,boardResize=null,boardTouch=null,boardSuppressedClick=false;
/** Save one authoritative, CAS-checked custom-column order for a signed Item-only board. */
async function persistItemOnlyColumnOrder(keys){
 if(state.columnOrderBusy||!state.boardManage||
    !isItemOnlyBoard(state.board,state.boardUi)||!activeBoardLayout())
  throw new ApiError('Signed board manager is required to reorder columns.',403);
 const boardId=state.boardId,actorId=state.context.user_id,
  workspaceId=state.context.workspace_id;
 state.columnOrderBusy=true;
 try{
  const [actor,ctx,detail,settings]=await Promise.all([
   auth.getVerifiedUser(),db.context(),db.board(boardId),boardStructureClient.read(boardId)]);
  if(actor.id!==actorId||ctx.user_id!==actorId||ctx.workspace_id!==workspaceId||
     detail.board?.id!==boardId||detail.board.workspace_id!==workspaceId||
     !isItemOnlyBoard(detail,settings))
   throw new ApiError('Board session or Item-only configuration changed.',409);
  const visible=genericBoardColumns(detail,{minimal:true})
   .map(c=>c.key).filter(k=>k.startsWith('col:'));
  if(keys.length!==visible.length||new Set(keys).size!==visible.length||
     keys.some(k=>!visible.includes(k)))
   throw new ApiError('Column set changed; reload before reordering.',409);
  const orderedIds=keys.map(k=>k.slice(4));
  const hidden=describeBoardColumns(detail).filter(c=>c.kind==='custom'&&
   !orderedIds.includes(c.id)).map(c=>c.id);
  const fullOrder=[...orderedIds,
   ...(settings.columnOrder||[]).filter(id=>hidden.includes(id)),
   ...hidden.filter(id=>!(settings.columnOrder||[]).includes(id))];
  await boardStructureClient.save(detail,{...settings,columnOrder:fullOrder});
  if(state.boardId!==boardId||state.context?.user_id!==actorId||
     state.context?.workspace_id!==workspaceId)return false;
  await loadBoard(boardId,'items');
  return true;
 }finally{state.columnOrderBusy=false;}
}
async function moveBoardPresentation(kind,from,to){
 if(!from||!to||from===to||!activeBoardLayout())return false;
 if(kind==='tab'){
  const c=activeBoardLayout();
  if(!c.tabs.includes(from)||!c.tabs.includes(to))return false;
  if(isManagedTimeTrackerBoard(state.board?.board))
   return moveManagedTimeTrackerTab(from,to);
  persistBoardLayout(p=>({...p,tabs:moveTabInOrder(p.tabs,from,to)}));
 }else if(kind==='column'){
  const c=activeBoardLayout();
  if(!c.columns.includes(from)||!c.columns.includes(to)||
    BOARD_REQUIRED_COLUMNS.includes(from)||BOARD_REQUIRED_COLUMNS.includes(to))return false;
  const movable=c.pref.columns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k));
  if(!movable.includes(from)||!movable.includes(to))return false;
  if(isItemOnlyBoard(state.board,state.boardUi)){
   if(!state.boardManage)return false;
   return persistItemOnlyColumnOrder(reorderVisible(movable,from,to));
  }
  persistBoardLayout(p=>({...p,columns:[
   ...p.columns.filter(k=>BOARD_REQUIRED_COLUMNS.includes(k)),
   ...reorderVisible(movable,from,to)]}));
 }else return false;
 render();return true;
}
root.addEventListener('dragstart',event=>{
 if(event.target.closest('.board-column-more,.board-column-resize')){
  event.preventDefault();return;
 }
 if(!activeBoardLayout())return;
 const tab=event.target.closest('[data-board-tab]');
 const th=event.target.closest('th[data-column-key]');
 const kind=tab?'tab':th?'column':null;
 if(!kind)return;
 const key=(tab||th).dataset[kind==='tab'?'boardTab':'columnKey'];
 if(kind==='tab'&&isManagedTimeTrackerBoard(state.board?.board)&&
    (!state.boardManage||state.boardUi?.status!=='VERIFIED_READ'||state.tabMoveBusy)){
  event.preventDefault();return;
 }
 if(kind==='column'&&(BOARD_REQUIRED_COLUMNS.includes(key)||
    (isItemOnlyBoard(state.board,state.boardUi)&&!state.boardManage))){event.preventDefault();return;}
 boardDrag={kind,key};
 event.dataTransfer?.setData('text/plain','APSYNTRA board layout');
 if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
 (tab||th).classList.add('board-dragging');
});
root.addEventListener('dragover',event=>{
 if(!boardDrag)return;
 const target=event.target.closest(boardDrag.kind==='tab'?'[data-board-tab]':'th[data-column-key]');
 if(!target)return;
 const key=target.dataset[boardDrag.kind==='tab'?'boardTab':'columnKey'];
 if(boardDrag.kind==='column'&&BOARD_REQUIRED_COLUMNS.includes(key))return;
 if(key!==boardDrag.key){event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';}
});
root.addEventListener('drop',event=>{
 if(!boardDrag)return;
 const target=event.target.closest(boardDrag.kind==='tab'?'[data-board-tab]':'th[data-column-key]');
 if(!target)return;
 const key=target.dataset[boardDrag.kind==='tab'?'boardTab':'columnKey'];
 event.preventDefault();void moveBoardPresentation(boardDrag.kind,boardDrag.key,key).catch(notice);
 boardDrag=null;
});
root.addEventListener('dragend',()=>{
 boardDrag=null;root.querySelectorAll('.board-dragging').forEach(x=>x.classList.remove('board-dragging'));
});
root.addEventListener('pointerdown',event=>{
 if(!activeBoardLayout())return;
 const resize=event.target.closest('button.board-column-resize');
 if(resize){
  const th=resize.closest('th[data-column-key]');
  const table=resize.closest('table.board-table-custom');
  const col=table?.querySelector('col[data-column-key="'+resize.dataset.columnKey+'"]');
  if(!col||!th)return;
  boardResize={pointerId:event.pointerId,x:event.clientX,key:resize.dataset.columnKey,
   col,table,start:col.width?Number(col.getAttribute('width')):th.offsetWidth};
  resize.setPointerCapture?.(event.pointerId);event.preventDefault();return;
 }
 // Native drag is for mouse/trackpad; pointer reorder supports touch and pen.
 if(event.pointerType==='mouse')return;
 const tab=event.target.closest('[data-board-tab]');
 const handle=event.target.closest('button.board-column-handle');
 if(!tab&&!handle)return;
 const kind=tab?'tab':'column';
 if(kind==='tab'&&isManagedTimeTrackerBoard(state.board?.board)&&
    (!state.boardManage||state.boardUi?.status!=='VERIFIED_READ'||state.tabMoveBusy))return;
 const element=tab||handle.closest('th[data-column-key]');
 boardTouch={kind,key:element.dataset[kind==='tab'?'boardTab':'columnKey'],
  x:event.clientX,y:event.clientY,pointerId:event.pointerId};
});
window.addEventListener('pointermove',event=>{
 if(boardResize&&event.pointerId===boardResize.pointerId){
  const width=columnWidth(boardResize.start+event.clientX-boardResize.x);
  const previous=Number(boardResize.col.getAttribute('width'))||boardResize.start;
  boardResize.col.setAttribute('width',String(width));
  const total=Number(boardResize.table.getAttribute('width'))||boardResize.table.offsetWidth;
  boardResize.table.setAttribute('width',String(total+width-previous));
  return;
 }
});
window.addEventListener('pointerup',event=>{
 if(boardResize&&event.pointerId===boardResize.pointerId){
  const {key,col}=boardResize;
  const width=columnWidth(col.getAttribute('width'));
  persistBoardLayout(p=>({...p,widths:{...p.widths,[key]:width}}));
  boardResize=null;return;
 }
 if(boardTouch&&event.pointerId===boardTouch.pointerId){
  const {kind,key,x,y}=boardTouch;boardTouch=null;
  if(Math.hypot(event.clientX-x,event.clientY-y)<24)return;
  const at=document.elementFromPoint(event.clientX,event.clientY);
  const target=at?.closest(kind==='tab'?'[data-board-tab]':'th[data-column-key]');
  const to=target?.dataset[kind==='tab'?'boardTab':'columnKey'];
  void moveBoardPresentation(kind,key,to).then(moved=>{
   if(moved)boardSuppressedClick=true;
  }).catch(notice);
 }
});
window.addEventListener('pointercancel',()=>{boardResize=null;boardTouch=null;});
document.addEventListener('pointerdown',event=>{
 if(boardColumnMenuNode?.isConnected&&
    !boardColumnMenuNode.contains(event.target)&&
    !event.target.closest('.board-column-more'))
  closeBoardColumnContext();
},true);
document.addEventListener('keydown',event=>{
 if(!boardColumnMenuNode?.isConnected)return;
 if(event.key==='Escape'){
  event.preventDefault();closeBoardColumnContext({restoreFocus:true});return;
 }
 if(!['ArrowDown','ArrowUp'].includes(event.key)||
    !boardColumnMenuNode.contains(document.activeElement))return;
 const options=[...boardColumnMenuNode.querySelectorAll('[role="menuitem"]')];
 const idx=options.indexOf(document.activeElement);
 if(idx<0||!options.length)return;
 event.preventDefault();
 options[(idx+(event.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();
});
window.addEventListener('scroll',()=>closeBoardColumnContext(),true);
window.addEventListener('resize',()=>closeBoardColumnContext());
root.addEventListener('click',event=>{
 if(boardSuppressedClick&&event.target.closest('[data-board-tab]')){
  event.preventDefault();boardSuppressedClick=false;
 }
},true);

document.addEventListener('click',event=>{
 const active=event.target.closest?.('.board-card-actions')||null;
 closeBoardCardMenus(active);
 for(const menu of root.querySelectorAll('.board-group-actions[open]'))
  if(!event.target.closest?.('.board-group-actions')?.isSameNode(menu))menu.open=false;
});
root.addEventListener('toggle',event=>{
 if(!event.target.matches?.('.board-card-actions'))return;
 const card=event.target.closest('.board-card');
 if(card)card.classList.toggle('board-card-menu-open',event.target.open);
 if(event.target.open)closeBoardCardMenus(event.target);
},true);
root.addEventListener('click',event=>{
 const checkbox=event.target.closest('[data-board-select-item]');
 if(checkbox)checkbox.dataset.shiftSelect=event.shiftKey?'true':'false';
 const target=event.target.closest('[data-action]');
 if(!target)return;
 event.preventDefault();
 Promise.resolve(action(target.dataset.action,target)).catch(notice);
});
/** Preserve unsaved Draft fields only in current signed UI memory across redraws.
 * No browser storage, network requests or persistent document semantics.
 */

function updateTradeLinkDocumentSelection(panel){
 if(!panel||!tradeLinkAuthorizedListRoute()||!state.boardManage||
    state.tradeLinkDraft?.status!=='AUTHORIZED_READ')return;
 const visible=[...panel.querySelectorAll('[data-tradelink-domain-record]')]
   .filter(row=>!row.hidden);
 const inputs=visible.map(row=>row.querySelector('[data-tl-select-document]')).filter(Boolean);
 const selected=inputs.filter(input=>input.checked).length;
 const heading=panel.querySelector('[data-tl-selected-count]');
 if(heading)heading.textContent=selected+' selected';
 const selectAll=panel.querySelector('[data-tl-select-all]');
 if(selectAll){
  selectAll.checked=inputs.length>0&&selected===inputs.length;
  selectAll.indeterminate=selected>0&&selected<inputs.length;
 }
}
function captureTradeLinkDraftListFilters(event){
 const control=event.target?.closest?.('[data-tradelink-domain-filter]');
 const container=control?.closest?.('[data-tradelink-domain-list]');
 if(!control||!container||!tradeLinkAuthorizedListRoute()||
  !TL03_DOMAIN_READS_ENABLED||!state.boardManage||
  state.tradeLinkDraft?.status!=='AUTHORIZED_READ'||state.tradeLinkDraft.busy)return false;
 const get=name=>container.querySelector('[data-tradelink-domain-filter][name="'+name+'"]')?.value;
 const filters=normalizeTradeLinkDraftListFilters({
  query:get('query'),documentType:get('documentType'),
  workflowState:get('workflowState'),archiveMode:get('archiveMode'),
  sortBy:get('sortBy'),sortDirection:get('sortDirection')
 });
 state.tradeLinkDraft.listFilters=filters;
 if(!state.tradeLinkDraft.listPage?.server)
  updateTradeLinkDraftListUI(container,filters);
 updateTradeLinkDocumentSelection(container);
 return true;
}
function captureTradeLinkDraftFields(event){
 const form=event.target?.closest?.('[data-tradelink-draft-form]');
 if(!form||!tradeLinkDraftRoute()||state.tradeLinkDraft.busy)return false;
 const fd=new FormData(form),values={};
 for(const key of ['documentType','documentNumber','customerName','referenceNumber',
  'currency','vatType','lineDescription','lineQuantity','lineUnitPrice','lineUnit',
  'lineSerialNumber','checkedBy','deliveredBy','receivedBy','verifiedBy',
  'paymentParticulars','cashAmount','chequeAmount','bankName','chequeNumber',
  'customerTin','customerEmail','customerPhone','validity','deliveryCommitment',
  'paymentTerms','targetDeliveryDate','poNumber','approvedBy',
  'discountType','discountValue','exchangeRate','remarks']){
  values[key]=String(fd.get(key)??'').slice(0,5000);
 }
 state.tradeLinkDraft.formValues=values;
 state.tradeLinkDraft.lineDrafts=snapshotTradeLinkDraftLineItems(form);
 state.tradeLinkDraft.unsavedChanges=true;
 state.tradeLinkDraft.draftNotice='';
 updateTradeLinkDraftLocalSummary(form);
 updateTradeLinkDraftInputCurrencyLabels(form);
 updateTradeLinkDraftLocalAmounts(form);
 updateTradeLinkLineRowTotals(form);
 // A previous successful preview must never remain authoritative after edits.
 const status=form.querySelector('[data-tradelink-draft-preview-status]');
 if(status&&status.dataset.validation!=='pending'){
  status.dataset.validation='pending';
  status.setAttribute('role','status');
  status.textContent='Inputs changed. Validate again. Nothing saved or transmitted.';
 }
 return true;
}
/** Source financial calculation is a nonpersistent preview; no write client involved. */
function syncTradeLinkFinanceInput(event){
 const panel=event.target?.closest?.('[data-tradelink-finance-preview]');
 if(!panel||state.view!=='board'||state.tab!=='tradelink'||
    state.boardId!==TRADELINK_BOARD_ID||
    state.board?.board?.workspace_id!==state.context?.workspace_id)return false;
 updateTradeLinkFinancePreview(panel);
 return true;
}
root.addEventListener('change',event=>{
 if(syncTradeLinkFinanceInput(event))return;
 if(['ft3-request-from','ft3-request-to'].includes(event.target.id)&&fuelTrackRequestReady()){
  const key=event.target.id==='ft3-request-from'?'from':'to';
  updateFuelTrackRequestFilters({[key]:String(event.target.value).slice(0,10),limit:25,expandedId:null});
  return;
 }
 if(event.target?.matches?.('[data-tl-select-document],[data-tl-select-all]')){
  if(!tradeLinkAuthorizedListRoute()||!state.boardManage||
     state.tradeLinkDraft?.status!=='AUTHORIZED_READ')return;
  const panel=event.target.closest('[data-tradelink-domain-list]');
  if(event.target.matches('[data-tl-select-all]')){
   for(const row of panel?.querySelectorAll('[data-tradelink-domain-record]')||[]){
    if(row.hidden)continue;
    const checkbox=row.querySelector('[data-tl-select-document]');
    if(checkbox)checkbox.checked=event.target.checked;
   }
  }
  updateTradeLinkDocumentSelection(panel);
  return;
 }
 if(captureTradeLinkDraftListFilters(event))return;
 if(captureTradeLinkDraftFields(event)){
  // Keep PDF approval responsibility visibly tied to the exact nominated
  // account. This does not unlock a button, create a timestamp, or grant RBAC.
  const selected=event.target?.matches?.('[data-tradelink-draft-form] .tl-reference-assignment-field select')?
   event.target:null;
  if(selected){
   const stage=selected.closest('.tl-reference-approval-stage');
   const assignment=stage?.querySelector('[data-tl-pdf-stage="'+selected.name+'"]');
   const responsible=assignment?.querySelector('[data-tl-pdf-assignee]');
   const control=assignment?.querySelector('[data-tl-pdf-time-control]');
   const account=selected.value.trim();
   if(responsible)responsible.textContent=account?
    'Assigned account: '+account+'. Only this signed-in account may perform this step after PDF approval is activated.':
    'Select an account to assign responsibility for this step.';
   if(control){control.hidden=!account;control.disabled=true;control.setAttribute('aria-disabled','true');}
  }
  // Never transfer the previous module's customer, financial, or reviewer inputs.
  if(event.target?.matches?.('[data-tradelink-draft-form] select[name="documentType"]')){
   state.tradeLinkDraft=resetTradeLinkDraftForm(state.tradeLinkDraft,event.target.value);
   render();
   root.querySelector('.tl-reference-document-tabs a.active')?.focus({preventScroll:true});
  }
  return;
 }
 if(event.target.matches('[data-board-select-item]')&&activeBoardLayout()){
  const input=event.target;
  const order=[...root.querySelectorAll('[data-board-select-item]')]
   .filter(el=>!el.closest('tr')?.hidden).map(el=>el.dataset.boardSelectItem);
  itemSelection.toggle(input.dataset.boardSelectItem,input.checked,{
   shift:input.dataset.shiftSelect==='true',ordered:order});
  delete input.dataset.shiftSelect;syncBoardSelectionUi();return;
 }
 if(event.target.matches('[data-board-select-all]')&&activeBoardLayout()){
  const input=event.target;
  const visible=[...root.querySelectorAll('table[data-group-id="'+input.dataset.boardSelectAll+'"] [data-board-select-item]')]
   .filter(el=>!el.closest('tr')?.hidden).map(el=>el.dataset.boardSelectItem);
  itemSelection.selectVisible(visible,{checked:input.checked});syncBoardSelectionUi();return;
 }
 if(event.target.matches('[data-board-column-toggle]')){
  const c=activeBoardLayout(),key=event.target.dataset.boardColumnToggle;
  if(!c||!c.columns.includes(key)||BOARD_REQUIRED_COLUMNS.includes(key))return;
  persistBoardLayout(p=>({...p,hidden:event.target.checked?
   p.hidden.filter(x=>x!==key):[...p.hidden,key]}));
  render();root.querySelector('.board-column-menu')?.setAttribute('open','');return;
 }

 if(['tt-overview-location','tt-overview-department','tt-overview-status','tt-overview-sort'].includes(event.target.id)&&
    state.view==='board'&&state.ttView==='overview'){
  const key=event.target.id.slice('tt-overview-'.length);
  const {overview}=state.ttAttendance||{};
  const value=event.target.value;
  if(overview&&(
    key==='location'&&(value==='all'||overview.locations.some(x=>x.location===value))||
    key==='department'&&(value==='all'||overview.departmentCounts.some(x=>x.department===value))||
    key==='status'&&['all','Active','Completed','Late'].includes(value)||
    key==='sort'&&['newest','oldest'].includes(value)
  )){
   state.ttOverviewFilters={...state.ttOverviewFilters,[key]:value};
   render();
  }
 }
 if(['tt-log-period','tt-log-status','tt-log-location','tt-log-sort'].includes(event.target.id)&&
    state.view==='board'&&state.ttView==='log'&&state.ttAttendance?.status==='VERIFIED_READ'){
  const key=event.target.id.slice('tt-log-'.length);
  const value=event.target.value;
  if(key==='period'&&['all','today','week','month'].includes(value)||
     key==='status'&&['all','Active','Completed','Late','Administrative closure'].includes(value)||
     key==='sort'&&['newest','oldest'].includes(value)||
     key==='location'&&(value==='all'||(state.ttAttendance.log?.rows||state.ttAttendance.records).some(r=>r.location===value))){
    state.ttLogFilters={...state.ttLogFilters,[key]:value};
    render();
  }
 }
 if(event.target.id==='tt-report-period'&&
    state.ttView==='reports'&&['all','today','week','month','custom'].includes(event.target.value)){
  state.ttReportPeriod=event.target.value;render();
 }
 if(['tt-report-start','tt-report-end'].includes(event.target.id)&&
    state.ttView==='reports'&&state.ttAttendance?.status==='VERIFIED_READ'){
  const key=event.target.id==='tt-report-start'?'start':'end';
  const value=event.target.value;
  if(value===''||/^\d{4}-\d{2}-\d{2}$/.test(value)){
   state.ttReportFilters={...state.ttReportFilters,[key]:value};render();
  }
 }
 if(event.target.id==='tt-location'){
  const group=root.querySelector('#tt-note-wrap');
  const note=root.querySelector('#tt-note');
  if(group&&note){
   const offsite=event.target.value==='Offsite (Home)' &&
    state.ttAttendance?.access?.moduleRole!=='System Admin';
   group.hidden=!offsite;note.required=offsite;
   if(!offsite)note.value='';
  }
 }
 if(event.target.id==='managed-user'&&state.roleVerified&&state.userRoleData){
  const id=event.target.value;
  if(state.userRoleData.users.some(u=>u.id===id)){
    state.userRoleSelected=id;render();
  }
 }
});
root.addEventListener('submit',event=>{
 if(event.target.id==='settings-display-name-form'){
  event.preventDefault();
  if(state.view!=='settings'||!state.context||!auth.isSignedIn)return;
  const form=event.target;
  const status=form.querySelector('[data-profile-name-status]');
  const button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  const value=String(form.elements.namedItem('displayName')?.value||'')
   .normalize('NFC').trim().replace(/\s+/gu,' ');
  if(value.length<2||value.length>80||/[\u0000-\u001f\u007f<>]/u.test(value)){
   status.textContent='Enter a display name of 2–80 readable characters.';
   form.elements.namedItem('displayName')?.focus();
   return;
  }
  if(value===state.context.profile?.display_name){
   form.closest('.settings-profile-editor')?.querySelector('[data-action="profile-name-cancel"]')?.click();
   return;
  }
  const userId=state.context.user_id;
  const workspaceId=state.context.workspace_id;
  button.disabled=true;
  status.textContent='Saving display name…';
  Promise.resolve(db.rpc('update_own_profile',{p_display_name:value})).then(rows=>{
   const updated=Array.isArray(rows)&&rows.length===1?rows[0]:null;
   if(!updated||updated.id!==userId||updated.status!=='active'||updated.display_name!==value)
    throw new ApiError('The profile change could not be verified. Refresh your profile before retrying.',409);
   if(state.context?.user_id!==userId||state.context?.workspace_id!==workspaceId||!auth.isSignedIn)
    throw new ApiError('Your signed account changed. Reload Settings to verify the update.',409);
   state.context.profile={...state.context.profile,display_name:updated.display_name};
   render();
   toast('Display name updated successfully.');
  }).catch(err=>{if(status.isConnected)status.textContent=errorMessage(err);})
   .finally(()=>{if(button.isConnected)button.disabled=false;});
  return;
 }
 if(event.target.id==='settings-change-password-form'){
  event.preventDefault();
  const form=event.target;
  if(state.view!=='settings'||!auth.isSignedIn||!state.context)return;
  const password=form.elements.namedItem('password')?.value||'';
  const confirmation=form.elements.namedItem('confirmation')?.value||'';
  const status=form.querySelector('[data-password-status]');
  if(password.length<12||password.length>72||password!==confirmation){
   if(status)status.textContent=password!==confirmation?'Passwords do not match.':'Password must contain 12–72 characters.';
   return;
  }
  const button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  button.disabled=true;
  if(status)status.textContent='Updating password…';
  Promise.resolve(auth.changePassword(password)).then(()=>{
   form.reset();
   if(status)status.textContent='Password updated successfully.';
  }).catch(err=>{
   if(status)status.textContent=err?.message||'Password update failed.';
  }).finally(()=>{button.disabled=false;});
  return;
 }

 if(event.target.matches('[data-tradelink-draft-form]')){
  event.preventDefault();
  if(!tradeLinkDraftRoute()||!tradeLinkDraftReady()||!state.boardManage){
   toast('TradeLink Draft persistence is not activated. Nothing saved.',true);
   return;
  }
  Promise.resolve(commitTradeLinkDraft(event.target)).catch(notice);return;
 }
 if(event.target.matches('[data-inline-add-row]')){
  event.preventDefault();Promise.resolve(addBoardRowInline(event.target)).catch(notice);return;
 }
 if(event.target.matches('[data-inline-cell-form]')){
  event.preventDefault();Promise.resolve(saveBoardInlineCell(event.target)).catch(notice);return;
 }
 if(event.target.matches('[data-group-inline-form]')){
  event.preventDefault();Promise.resolve(saveGroupInline(event.target)).catch(notice);return;
 }
 if(event.target.id==='tt-ot-form'){
  event.preventDefault();
  if(!TT_OT_WRITES_ACCEPTED){
   toast('OT submission remains disabled until signed backend authorization and audit are verified.',true);
   return;
  }
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  const draft={
   date:root.querySelector('#tt-ot-date')?.value||'',
   start:root.querySelector('#tt-ot-start')?.value||'',
   end:root.querySelector('#tt-ot-end')?.value||'',
   reason:root.querySelector('#tt-ot-reason')?.value||''
  };
  state.ttBusy=true;
  Promise.resolve(timeTracker.submitOvertime(state.boardId,draft))
   .then(async()=>{state.ttOtModalOpen=false;state.ttOtDraft={};
     await loadTimeTracker();toast('OT request submitted for bootstrap review.');})
   .catch(notice).finally(()=>{state.ttBusy=false;render();});
  return;
 }
 if(event.target.id==='login-form'){event.preventDefault();login(event.target);return;}
 if(event.target.id==='register-form'){
  validateAndSubmitAccessRequest(event.target,event);
  return;
 }
 if(event.target.id==='forgot-form'){
  event.preventDefault();Promise.resolve(submitRecoveryRequest(event.target)).catch(notice);return;
 }
 if(event.target.id==='reset-form'){
  event.preventDefault();Promise.resolve(submitRecoveryPassword(event.target)).catch(notice);return;
 }
 if(event.target.id==='tt-clock-form'){
  event.preventDefault();
  const kind=event.submitter?.value;
  Promise.resolve(submitTimeTrackerAction(event.target,kind)).catch(notice);
 }
});
// Reorder only within the signed, currently displayed Draft editor.
let tradeLinkDraggedLine=null;
root.addEventListener('dragstart',event=>{
 const row=event.target?.closest?.('[data-tradelink-line-item]');
 if(!row||!tradeLinkDraftRoute()||state.tradeLinkDraft.busy||
    state.tradeLinkDraft.pendingCreateId)return;
 tradeLinkDraggedLine=row;
 event.dataTransfer?.setData('text/plain','tradelink-line');
 if(event.dataTransfer)event.dataTransfer.effectAllowed='move';
});
root.addEventListener('dragover',event=>{
 const row=event.target?.closest?.('[data-tradelink-line-item]');
 if(row&&tradeLinkDraggedLine&&row!==tradeLinkDraggedLine&&
    row.parentElement===tradeLinkDraggedLine.parentElement)
  event.preventDefault();
});
root.addEventListener('drop',event=>{
 const row=event.target?.closest?.('[data-tradelink-line-item]');
 const dragged=tradeLinkDraggedLine;
 tradeLinkDraggedLine=null;
 if(!row||!dragged||row===dragged||!tradeLinkDraftRoute()||
    state.tradeLinkDraft.busy||state.tradeLinkDraft.pendingCreateId||
    row.parentElement!==dragged.parentElement)return;
 event.preventDefault();
 const container=row.parentElement,form=row.closest('[data-tradelink-draft-form]');
 const before=dragged.compareDocumentPosition(row)&Node.DOCUMENT_POSITION_FOLLOWING;
 container.insertBefore(dragged,before?row.nextSibling:row);
 for(const [index,item] of [...container.querySelectorAll('[data-tradelink-line-item]')].entries()){
  const label=item.querySelector('.tl-ref-item-index');
  if(label)label.textContent=String(index+1);
 }
 if(form)captureTradeLinkDraftFields({target:dragged.querySelector('[name="lineDescription"]')});
});
root.addEventListener('dragend',()=>{tradeLinkDraggedLine=null;});
root.addEventListener('input',event=>{
 if(syncTradeLinkFinanceInput(event))return;
 if(event.target.id==='ft3-request-search'&&fuelTrackRequestReady()){
  const pos=event.target.selectionStart;
  updateFuelTrackRequestFilters({search:String(event.target.value).slice(0,120),limit:25,expandedId:null});
  const control=root.querySelector('#ft3-request-search');
  if(control){control.focus();if(pos!==null)control.setSelectionRange(pos,pos);}
  return;
 }
 if(captureTradeLinkDraftListFilters(event))return;
 if(captureTradeLinkDraftFields(event))return;
 if(event.target.matches('[data-tradelink-search]')&&
    state.view==='board'&&state.tab==='tradelink'&&
    state.boardId===TRADELINK_BOARD_ID&&state.board?.board?.workspace_id===state.context?.workspace_id){
  filterTradeLinkRenderedRows(root.querySelector('.aps-tradelink-app'),event.target.value);
  return;
 }
 if(event.target.id==='tt-team-search'&&state.view==='board'&&state.ttView==='team'&&
    state.roleVerified===true&&state.ttTeam&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttTeamFilters={...state.ttTeamFilters,search:String(event.target.value).slice(0,120)};
  const focus=event.target.selectionStart;
  render();
  const field=root.querySelector('#tt-team-search');
  if(field){field.focus();field.setSelectionRange(focus,focus);}
  return;
 }
 if(event.target.id==='tt-ot-search'&&state.view==='board'&&state.ttView==='ot'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttOtFilters={...state.ttOtFilters,search:String(event.target.value).slice(0,120)};
  const focus=event.target.selectionStart;
  render();
  const field=root.querySelector('#tt-ot-search');
  if(field){field.focus();field.setSelectionRange(focus,focus);}
  return;
 }
 if(event.target.id==='tt-overview-search'&&state.view==='board'&&state.ttView==='overview'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttOverviewFilters={...state.ttOverviewFilters,search:String(event.target.value).slice(0,120)};
  applyTimeTrackerOverviewFilters(root);
  return;
 }
 if(event.target.id==='tt-log-search'&&state.view==='board'&&state.ttView==='log'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttLogFilters={...state.ttLogFilters,search:String(event.target.value).slice(0,120)};
  applyTimeTrackerLogSearch(root,state.ttLogFilters.search);
  return;
 }
 if(event.target.id==='tt-report-search'&&
    state.view==='board'&&state.ttView==='reports'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  state.ttReportFilters={...state.ttReportFilters,
   search:String(event.target.value).slice(0,120)};
  applyTimeTrackerReportSearch(root,state.ttReportFilters.search);
  return;
 }
 if(!event.target.matches('.search-input'))return;
 const value=event.target.value.toLocaleLowerCase().trim();
 if(event.target.id==='board-search')state.boardSearch=event.target.value.slice(0,160);
 let matched=0;
 for(const row of root.querySelectorAll('[data-searchable]')){
  row.hidden=!row.dataset.searchable.toLocaleLowerCase().includes(value);
  if(!row.hidden&&row.matches('.board-card'))matched++;
 }
 if(event.target.id==='board-search'){
  const result=root.querySelector('#board-search-result');
  if(result)result.textContent=matched+' matching board'+(matched===1?'':'s');
  const hint=root.querySelector('#board-search-no-results');
  if(hint)hint.hidden=matched!==0;
 }else if(event.target.id==='search-board-items')syncBoardSelectionUi();
});
document.addEventListener('visibilitychange',()=>{
 platformSync.visibilityChanged();
 setBoardLoadingVisibility(root,document.hidden);
});
window.addEventListener('online',()=>platformSync.network(true));
window.addEventListener('offline',()=>platformSync.network(false));
// Hash navigation must not silently discard locally edited Draft fields.
// Authentication expiry remains authoritative: a revoked session is never
// retained merely because an unsaved editor was open.
window.addEventListener('hashchange',()=>{
 // Scrub newly pasted invitation links even after the app has initialized.
 const incomingInvitation=captureInvitationLink(location,history);
 if(incomingInvitation){pendingInvitation=incomingInvitation;invitationAcceptanceStatus='';}
 const nextHash=location.hash||routeHome;
 if(rejectedRouteHash===nextHash){
  rejectedRouteHash=null;return; // Cancelled navigation restored its old URL.
 }
 if(!state.context){
  approvedRouteHash=nextHash;
  if(startupRecoveryActive)return;
  const mode=authViewFromHash();
  if(mode!=='reset')recoveryContext=null;
  renderLogin(mode==='reset'&&!recoveryContext?'Your recovery link is unavailable or expired. Request a new link.':'',{mode});
  return;
 }
 if(nextHash!==approvedRouteHash&&tradeLinkDraftRoute()&&
   tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft)&&
   !confirm(unsavedTradeLinkWarning)){
  pendingInvitation=null;invitationAcceptanceStatus='';
  rejectedRouteHash=approvedRouteHash;
  location.replace(approvedRouteHash);
  return;
 }
 approvedRouteHash=nextHash;
 onRoute().catch(notice);
});
window.addEventListener('pagehide',closeTradeLinkSavedDocumentOutput);
window.addEventListener('beforeunload',event=>{
 if(state.context&&tradeLinkDraftRoute()&&
    tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft)){
  event.preventDefault();
  event.returnValue=''; // Native browser warning; no sensitive field contents.
 }
});
window.addEventListener('keydown',event=>{if(event.key==='Escape'){
 closeBoardCardMenus();hideModal();
  for(const menu of root.querySelectorAll('.board-group-actions[open]'))menu.open=false;
  if(state.inlineCell&&!state.inlineCellBusy){state.inlineCell=null;preserveInlineScroll();}
  if(state.groupEditId&&!state.groupEditBusy){state.groupEditId=null;render();}
  if(state.ttOtModalOpen){state.ttOtModalOpen=false;render();}
}});
auth.onExpired=()=>{boardCacheChannel.stop();db.invalidateBoardCache();pendingInvitation=null;invitationAcceptanceStatus='';startupRecoveryActive=false;clearWs02dB3ForeignRlsFixture();state.ws02dB3RevokeArmed=false;closeWorkspacePanels();state.context=null;state.b4QaRunId++;state.b4QaBusy=false;state.b4QaReport=null;state.phaseBDenialRunId++;state.phaseBDenialBusy=false;state.phaseBDenialReport=null;state.frtSecurityResult=null;state.sec07Result=null;state.ws01B2RunId++;state.ws01B2Busy=false;state.ws01B2Result=null;state.ws02dB3RunId++;state.ws02dB3Busy=false;state.ws02dB3Report=null;state.ws02dB3HttpsRunId++;state.ws02dB3HttpsBusy=false;state.ws02dB3HttpsReport=null;state.ws02dB3RlsRunId++;state.ws02dB3RlsBusy=false;state.ws02dB3RlsReport=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.roleVerified=false;state.roleData=null;state.userRoleData=null;state.boards=[];platformSync.stop();stopTimeTrackerClock();state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};state.inlineCell=null;state.inlineAddBusy=false;state.inlineCellBusy=false;clearBulkActivation();renderLogin('Session expired. Please sign in again.');};
async function boot(){
 if(startupBusy)return;
 startupBusy=true;
 startupRecoveryActive=false;
 window.__APSYNTRA_STARTUP?.begin();
 startInitialization();
 let outcome='RECOVERABLE_ERROR';
 try{
  setInitializationPhase('authentication');
  const callback=captureAuthReturn(location,history);
  if(callback){
   // Recovery tokens are never installed as normal CRM sessions.
   auth.clear();
   if(callback.kind==='recovery'){
    try{
     recoveryContext=await inspectRecoveryToken(auth,callback);
     renderLogin('',{mode:'reset'});
    }catch(err){
     recoveryContext=null;
     renderLogin(err?.status===0||err?.status>=500?
      'Recovery verification is temporarily unavailable. Reopen your recovery link when service returns.':
      'The recovery link is invalid or expired. Request a new link.',
      {mode:'forgot'});
    }
   }else if(callback.kind==='confirmation'){
    renderLogin('',{mode:'login',notice:
     'Email verification completed. Workspace access still requires administrator approval. Sign in only after your account is admitted.'});
   }else{
    renderLogin('The authentication link is invalid or expired.',{mode:'forgot'});
   }
   outcome='UNAUTHENTICATED';
   return;
  }
  if(!pendingInvitation){
   pendingInvitation=captureInvitationLink(location,history);
   if(pendingInvitation)approvedRouteHash=location.hash;
  }
  if(['#/register','#/forgot-password','#/reset-password'].includes(location.hash)){
   renderLogin(location.hash==='#/reset-password'?
    'Your recovery link is unavailable or expired. Request a new link.':'');
   outcome='UNAUTHENTICATED';
   return;
  }
  if(await auth.restore()){
   state.user=auth.session.user;
   setInitializationPhase('authorization');
   await refreshWorkspace();
   setInitializationPhase('workspace');
   await onRoute();
   // A revoked/switching session during an async route cannot be classified
   // as authenticated solely because its earlier context RPC had passed.
   if(!auth.isSignedIn||state.context?.user_id!==auth.userId||
     !state.context?.workspace_id)
    throw new ApiError('Session or workspace changed during startup.',401);
   outcome='AUTHENTICATED';
  }else{
   renderLogin(pendingInvitation?.status==='ready'?
    'Sign in with the email address that received the workspace invitation.':
    '');
   outcome='UNAUTHENTICATED';
  }
 }catch(err){
  if(err?.status===401&&!auth.isSignedIn){
   state.context=null;
   renderLogin('Your session has expired. Sign in again.');
   outcome='UNAUTHENTICATED';
  }else{
   renderBootstrapFailure(err);
   outcome='RECOVERABLE_ERROR';
  }
 }finally{
  window.__APSYNTRA_STARTUP?.resolve(outcome);
  finishInitialization();
  startupBusy=false;
 }
}
startSelectExperience(document.body);
startActionMenuExperience(document.body);
startSearchExperience(document.body);
startInputExperience(document.body);
startMetricsExperience(document.body);
boot();
