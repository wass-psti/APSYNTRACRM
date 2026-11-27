import {renderRecoveryChoices} from './tradelink/draft-recovery-ui.js';
import {TradeLinkRecoveryController} from './tradelink/draft-recovery-controller.js';
import {captureRecoveryFields} from './tradelink/draft-recovery-state.js';
import {syncFuelTrans} from './fueltrans-lazy.js';
import {syncDda} from './dda-native-host.js?v=cp-dda-ui-05-20261126';
import {DDA_APPLICATION,DDA_RELEASE_ENABLED,DDA_ROUTE_SECTION,DDA_HOST_MARKUP} from './dda-release.js';
import {OrderIntakeOperationalClient as OrderIntakeRegistryClient} from './order-intake-operational-client.js';
import {buildConfirmation} from './order-intake-confirmation.js';
import {confirmationFields,bindConfirmationForm,readConfirmationForm} from './order-intake-confirmation-ui.js';
import {recipientFields,notificationInbox} from './order-intake-notifications.js';
import {nativeEditable,orderEditorDraft,orderEditorMarkup,updateOrderEditorPreview,createOrderEditorSave} from './order-intake-editor.js';
import {orderTablePage,orderExportCsv,compareOrderDecimals,decimalParts} from './order-intake-search.js';
import {runOrderBulk,validateBulkRequest} from './order-intake-bulk.js';
import {bulkFields} from './order-intake-bulk-ui.js';
import {lifecycleActions,lifecycleFields,saveLifecycle,bindWorkflowDrag} from './order-intake-lifecycle.js';
import {readOrderIntakePreference,saveOrderIntakePreference} from './order-intake-preference.js';
import {parseOrderIntakeRoute,orderIntakeHref} from './order-intake-route.js';
import {createOrderIntakeReadState,filterOrderIntakeRows} from './order-intake-read-state.js';
import {renderOrderIntake} from './order-intake-ui.js';
import {applySearchVisibility} from './interaction-search.js';
import {createFrameCoalescer} from './frame-coalescer.js';
import {mountBoardHorizontalRail} from './board/presentation/horizontal-rail.js';
import {AuthClient,ApiError} from './session.js';
import {createTimeTrackerPendingRecovery,timeTrackerPendingKeyMatches} from './time-tracker-pending-recovery.js';
import {formatTimeTrackerAutoClockoutTime} from './apps/TimeTracker/time-tracker-auto-clockout.js';
import {runPendingTimeTrackerAutoClockout} from './apps/TimeTracker/time-tracker-auto-clockout-execution.js';
import {readTimeTrackerLocationPreference,saveTimeTrackerLocationPreference,readTimeTrackerViewPreference,saveTimeTrackerViewPreference} from './apps/TimeTracker/time-tracker-preferences.js';
import {avatarPreviewMarkup,mountAvatarPreview,stopAvatarPreview,mergeProfileAvatarContext} from './profile-avatar.js';
import {ProfileAvatarClient} from './profile-avatar-client.js';
import {mountAvatarImages} from './profile-avatar.js';

import {renderWorkspaceSwitcher,renderWorkspaceInviteLaunch,openWorkspaceSelector,openWorkspaceInvitationDialog,closeWorkspacePanels,WS01_SWITCHING_ENABLED} from './workspace-ui.js?v=cp-crm-wm-invite-flow-01';
import {WORK_MANAGEMENT_WORKSPACE_ID} from './workspace-identity.js';
import {workspaceApplicationsForNavigation,workspaceApplicationRouteAccess} from './workspace-application-routing.js';
import {WorkspaceLifecycleClient,WS01_CONFIGURATION_ENABLED} from './workspace-lifecycle-client.js';
import {readWorkspacePreference,writeWorkspacePreference,watchWorkspacePreference,restoreWorkspacePreference} from './workspace-preference.js';
import {WorkspaceInvitationClient,WS02D_INVITE_CLIENT_ENABLED} from './workspace-invitation-client.js';
import {WorkspaceInvitationManagementClient} from './workspace-invitation-management.js';
import {WorkspaceInvitationAcceptanceClient,captureInvitationLink,renderInvitationAcceptance} from './workspace-invitation-acceptance.js';
import {startInitialization,setInitializationPhase,finishInitialization} from './initialization-core.js';
import {renderAuthMarkup} from './auth/markup.js';
import {validateAccessRequest} from './request-access.js';
import {captureAuthReturn,
 inspectRecoveryToken,requestPasswordRecovery,applyRecoveredPassword} from './auth/account-flows.js';
import {mountAuthExperience} from './auth/experience.js';
import {sidebarIcon,animateSidebarSelection,stopSidebarSelection} from './sidebar-visuals.js';
import {sidebarActiveRoute} from './sidebar-active-route.js';
import {overviewIcon,mountOverviewMotion,stopOverviewMotion} from './overview-visuals.js';
import {mountBoardCatalogMotion,stopBoardCatalogMotion} from './board/presentation/catalog-visuals.js';
import {BOARD_ITEM_PAGE_SIZE,DomainApi,validUuid} from './data.js';
import {nativeApplicationModuleForBoardId,nativeApplicationModuleForBoardRoute,workspaceRouteAllowsBoardCatalogFallback} from './native-application-access.js';
import {BoardCacheChannel} from './board/cache-channel.js';
import {BoardTrashPermanentDeleteClient,eligibleTrashBoard} from './board/crud/trash-permanent-delete.js';
import {modalRecoveryKind,installModalRecoveryAction} from './modal-recovery.js';
import {openBoardSharePreview,closeBoardSharePreview} from './board/collaboration/share.js';
// Invite modal is loaded only after an authorized board invitation gesture.
let closeBoardInviteDialog=()=>{};
import {normalizeSignedBoardCandidates,normalizeAdminBoardCandidates,adminBoardChangeTarget,BoardGroupAccessClient,
 BOARD_GROUP_ACCESS_ENABLED} from './workspace-board-groups.js';
import {CreatorAccessClient,WS10_CREATOR_POLICY_ACTIVE} from './ws10-ownership.js';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './config.js';
import {PlatformSync,shouldRefreshWorkspaceBoardList,shouldRecheckWorkspaceRoles,shouldResumeDeferredReconciliation,shouldPreserveSignedSessionOnContextFailure} from './platform-sync.js';
import {APP_NAME} from './config.js';
import {runReadOnlyAcceptance,summarizeAcceptance} from './acceptance.js';
import {runPagesPersistenceAcceptance,QA_BOARD_NAME} from './pages-persistence.js';
import {renderPagesAcceptance} from './pages-acceptance-ui.js';
import {mountPagesAcceptanceMotion,stopPagesAcceptanceMotion} from './pages-acceptance-visuals.js';
import {runNativeQa} from './native-qa.js';
import {NativeIssueClient} from './native-client.js';
import {TalkBoxNativeClient} from './talkbox-native.js';
import {renderTalkBoxApplication} from './talkbox-ui.js';
import {findTalkBoxBoard,TALKBOX_APPLICATION_ROUTE,talkBoxIssueHref} from './talkbox-application.js';
import {BOARD_MODULES,moduleByBoardName} from './board/services/manifest.js';
import {inspectFoundation,provisionMissingBoards} from './board/foundation/foundation.js';
import {renderFoundation} from './board/presentation/foundation-ui.js';
import {mountFoundationMotion,stopFoundationMotion} from './foundation-visuals.js';
import {boardGrid,boardGridColumns,prepareBoardGrid} from './board/presentation/grid.js';
import {boardGroupArchiveSuffix} from './board/presentation/group-counts.js';
import {renderBoardCollapsedRollup} from './board/presentation/group-rollups.js';
import {BoardGroupStateClient} from './board/preferences/group-state-client.js';
import {FUELTRACK_V3_ID,findFuelTrackV3Board,isFuelTrackV3ApplicationBoard,normalizeFuelTrackSection,fuelTrackHref,renderFuelTrackV3Application} from './fueltrack-v3-ui.js?v=cp-ft-all-requests-redesign-02-20261126-cp-ft-new-request-redesign-01-20261126-cp-ft-approvals-redesign-01-20261126-cp-ft-approvals-context-02-20261127';
import {fuelTrackAnalyticsCsv} from './fueltrack-v3-signed-views.js';
import {FUELTRACK_V3_APPLICATION_ROUTE,parseFuelTrackApplicationRoute} from './fueltrack-v3-application-route.js';
import {verifyFuelTrackBackendSnapshot} from './fueltrack-v3-backend-projections.js';
import {renderFuelTrackAnalytics,normalizeFuelTrackAnalyticsView,normalizeFuelTrackAnalyticsRange,normalizeFuelTrackAnalyticsMetric} from './fueltrack-v3-analytics.js';
import {renderFuelTrackRequests,fuelTrackRequestsModel,fuelTrackRequestsSummary,fuelTrackRequestsCsv,fuelTrackRequestQuickDates,FUELTRACK_REQUEST_FILTER_DEFAULTS} from './fueltrack-v3-requests.js';
import {FUELTRACK_ACTIVITY_FILTER_DEFAULTS,fuelTrackActivityModel,fuelTrackActivityCsv} from './fueltrack-v3-activity.js';
import {FuelTrackV3DomainClient,verifyFuelTrackSubmission} from './fueltrack-v3-native.js';
import {runFuelTrackSignedPreflight} from './fueltrack-v3-signed-preflight.js';
import {fuelTrackNewRequestPayload} from './fueltrack-v3-new-request.js?v=cp-ft-new-request-redesign-01-20261126';
import {FuelTrackV3ReceiptStorageClient,validFuelTrackReceiptFile} from './fueltrack-v3-receipt-storage.js';
import {TRADELINK_BOARD_ID,tradeLinkSetupStatus,configureTradeLinkColumns,
 isTradeLinkBoard} from './tradelink-board-items.js';
import {TRADELINK_APPLICATION_ROUTE,tradeLinkApplicationHref,parseTradeLinkApplicationRoute} from './tradelink-application-route.js';
import {normalizeTradeLinkSection,renderTradeLinkApplication,filterTradeLinkRenderedRows,
 searchTradeLinkBoardItems,captureTradeLinkTabMotion,mountTradeLinkTabMotion} from './tradelink-ui.js?v=cp-tl-universal-edit-01k-20261126-01';
import {renderTradeLinkSavedDocumentOutput,mountTradeLinkSavedDocumentOutput,
 closeTradeLinkSavedDocumentOutput} from './tradelink-saved-document-output.js?v=cp-tl-universal-edit-01k-20261126-01-cp-tl-approval-01-20261127';
import {TradeLinkAttachmentClient,TL03_ATTACHMENTS_ENABLED}
 from './tradelink-attachments.js';
import {TradeLinkDraftWorkspace,initialTradeLinkDraftView,resetTradeLinkDraftForm,parseTradeLinkDraftForm,
 tradeLinkDraftValidationMessage,tradeLinkDraftReady,tradeLinkDraftSaveFailureMessage,
 tradeLinkDraftHasUnsavedChanges,reconcileTradeLinkSavedListing,
 tradeLinkSaveDefinitelyRejected,
 serializeTradeLinkDocumentCsv,
 prepareTradeLinkDraftCommand,tradeLinkApprovalFreeDraftPreview,
 renderTradeLinkDraftLineItem,snapshotTradeLinkDraftLineItems,restoreTradeLinkPendingSave,updateTradeLinkDraftLocalAmounts,
 updateTradeLinkLineRowTotals,updateTradeLinkDraftInputCurrencyLabels,updateTradeLinkDraftLocalSummary,
 normalizeTradeLinkDraftListFilters,updateTradeLinkDraftListUI} from './tradelink-draft-workspace.js?v=cp-tl-universal-edit-01k-20261126-01';
import {summarizeTradeLinkSubmitReadiness} from './tradelink-submit-readiness.js';
import {TL03_DOMAIN_READS_ENABLED,TL03_ANALYTICS_ENABLED,TL03_WORKFLOW_SUBMIT_ENABLED,
 TL03_WORKFLOW_REVIEW_ENABLED,TL03_WORKFLOW_DECISION_ENABLED,
 TL03_WORKFLOW_OPERATIONAL_ENABLED,TL03_DUAL_REVIEW_ENABLED,
 tradeLinkBoardProjectionMatches,tradeLinkSavedDraftMatches} from './tradelink-native.js?v=cp-tl-universal-edit-01k-20261126-01';
import {runTradeLinkStageASignedReadOnly,renderTradeLinkStageAAcceptance,sanitizeTradeLinkStageAReport} from './tradelink-stage-a-signed-acceptance.js';
import {runTradeLinkLocalSessionRevocation,renderTradeLinkSessionRevocation,renderTradeLinkSignedOutRevocationResult,sanitizeTradeLinkRevocationReport} from './tradelink-revoked-session-acceptance.js';
import {runWs01B2SignedDiscovery,renderWs01B2SignedAcceptance,sanitizeWs01B2Report} from './workspace-b2-signed-acceptance.js';
import {runWs02dB3SignedReadPreflight,renderWs02dB3SignedPreflight,sanitizeWs02dB3SignedReport} from './workspace-b3-signed-read-preflight.js';
import {runWs02dB3DeployedHttpsAcceptance,renderWs02dB3DeployedHttpsAcceptance,sanitizeWs02dB3DeployedHttpsReport} from './workspace-b3-deployed-https-acceptance.js';
import {captureWs02dB3OwnerRlsFixture,verifyWs02dB3ForeignRlsDenial,clearWs02dB3ForeignRlsFixture,hasWs02dB3ForeignRlsFixture,renderWs02dB3ForeignRlsDenial,sanitizeWs02dB3ForeignRlsReport} from './workspace-b3-foreign-rls-denial.js';
import {runWs02dB3LocalSessionRevocation,renderWs02dB3LocalRevocation,sanitizeWs02dB3LocalRevocationReport} from './workspace-b3-revoked-session-denial.js';
import {createB2SignedQaFixture,inspectB2SignedQaFixture,renderB2SignedQaFixture,sanitizeB2QaFixtureReport} from './board/acceptance/col-delete-b2-signed-fixture.js';
import {runB4SignedRecoveryPreflight,renderB4SignedRecoveryPreflight,sanitizeB4SignedRecoveryReport} from './board/acceptance/col-delete-b4-signed-preflight.js';
import {runPhaseBSignedDenial,renderPhaseBSignedDenial,sanitizePhaseBDenialReport} from './board/acceptance/col-delete-phase-b-signed-denial.js';
import {updateTradeLinkFinancePreview} from './tradelink-finance.js';
import {captureBoardGroupScroll,restoreBoardGroupScroll} from './board/scroll-state.js';
import {canRetainVisibleBoard,replaceVisibleBoardContent} from './board/services/background-update.js';
import {renderBoardLoading,renderBoardLoadingError,setBoardLoadingVisibility} from './board/presentation/loading.js';
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,planMaterialSourcingSchema} from './material-sourcing-schema-plan.js';
import {MATERIAL_TRACKER_DEFAULT_FILTERS,renderMaterialSourcingTracker,isMaterialTrackerBoard,materialTrackerRows,filterMaterialTrackerRows,materialTrackerPublicCsv} from './material-sourcing-tracker.js';
import {parseMaterialAddForm,materialAddPublicColumns} from './material-sourcing-add-material.js';
import {createMaterialSourcingAtomic} from './material-sourcing-atomic-create.js';
import {showEngineeringDiagnostics} from './engineering-diagnostics-visibility.js';
import {renderMaterialSourcingDetailTabs,renderMaterialSourcingPublicOverview,renderMaterialSourcingUnavailableDetails,classifyMaterialSourcingDetailError,selectMaterialSourcingDetailTab,materialSourcingItemAuditRows,renderMaterialSourcingItemActivity} from './material-sourcing-detail-tabs.js';
import {readMaterialBoardItemTasks,saveMaterialBoardItemTask,renderMaterialBoardItemTasks} from './material-sourcing-board-tasks.js';
import {planMaterialSourcingPublicChanges,saveMaterialSourcingPublicChange,verifyMaterialSourcingPublicChanges} from './material-sourcing-public-edit.js';
import {isMaterialSourcingBoard,readProtectedSourcingItem,writeProtectedSourcingField,planProtectedSourcingChanges,renderProtectedSourcingEditor,createMaterialSourcingPart} from './material-sourcing-application.js';
import {activateApprovedPublicSourcingColumns,MATERIAL_SOURCING_ACTIVATION_ACK} from './material-sourcing-controlled-activation.js';
import {BOARD_STRUCTURE_ADMIN_ENABLED,BOARD_STRUCTURE_TYPES,BoardStructureClient,
 applyBoardViewSettings,renderBoardStructureAdmin,describeBoardColumns,parseChoiceConfig,columnOptionLines,
 setOptionalVirtualColumnVisibility} from './board/crud/structure-admin.js';
import {BOARD_CARD_LIFECYCLE_ENABLED,isProtectedBoard,boardCardActionState,BoardCardLifecycleClient} from './board/services/card-lifecycle.js';
import {BoardItemSelection,matchBoardSearch,exportVisibleBoardItems} from './board/selection.js';
import {boardCatalogResultLabel} from './board/presentation/catalog-results.js';
import {resolveColumnTypeSelection,renderColumnTypeOptions,BOARD_STANDARD_COLUMN_CATALOG} from './board/columns/column-catalog.js';
import {resolveInlineColumn,columnStoredValueCount,prepareInlineColumnUpdate,
 projectConfirmedColumnRename,
 confirmInlineColumnDelete} from './board/inline/inline-context.js';
import {isQaBoardRecoveryInterfaceAllowed,canStartB4QaRecoveryDeletion,BoardColumnRecoveryClient,BoardColumnOperationalRecoveryClient,renderBoardColumnRecoveryList,explainColumnDeleteError} from './board/columns/column-recovery.js';
import {planBoardColumnRemoval} from './board/columns/column-removal-plan.js';
import {cmp02CreationConfig} from './board/inline/typed-cmp02.js';
import {resetBoardWindows,mountBoardWindows,filterBoardWindows,visibleBoardWindowIds} from './board/presentation/window.js';
import {mountBoardPagination,renderBoardPagination} from './board/presentation/pagination-ui.js?v=cp-board-import-sync-01-20261115';
import {canManuallyEditBoard,genericBoardColumns,cellColumn,expectedCellValue,visibleValue,editableCellButton,renderInlineCellEditor,renderGroupAddRow,groupColumnSummaries,parseCellForm,configuredStatus,statusColorClass} from './board/inline/inline-items.js';
import {canBulkEditBoard,BoardBulkClient} from './board/bulk/bulk02-client.js';
import {probeBulk02SignedSession} from './board/acceptance/bulk02-signed-acceptance.js';
import {createItemOnlyBoard,enableItemOnlyBoard,isItemOnlyBoard,itemOnlyColumnKeys} from './board/foundation/minimal-default.js';
import {deleteOneAuthorizedItem,selectedDeleteCandidates} from './board/crud/single-delete.js';
import {moveTabInOrder,reorderManagedTimeTrackerTabs} from './board/services/tab-order.js';
import {publicBoardDescription} from './board/foundation/public-copy.js';
import {MANAGED_TT_GROUP_DELETE_ENABLED,isManagedTimeTrackerBoard,
 canSafelyHideEmptyTimeTrackerGroup,isRedundantEmptyTimeTrackerGroup,
 readHiddenEmptyGroups,hideEmptyTimeTrackerGroup,
 restoreHiddenTimeTrackerGroups,deleteEmptyManagedTimeTrackerGroup} from './managed-time-tracker-groups.js';
import {isRow01Fixture,readRow01Pending,prepareRow01Acceptance,finalizeRow01Acceptance,sanitizeRow01Report} from './board/acceptance/row01-signed-acceptance.js';
import {normalizeBoardActivity,renderBoardActivityResults,boardItemSummary} from './board/presentation/activity-ui.js';
import {BOARD_COL01_AUDIT_CURSOR_ENABLED,BOARD_COL01_AUDIT_MAX_PAGES,
 loadBoardInvitableDirectory,renderBoardInvitableDirectory,
 loadBoardAuditCursorPage,renderBoardAuditCursorPage} from './board/columns/col01-readers.js';
import {loadBoardCollaboration,renderBoardCollaboration} from './board/collaboration/collaboration.js';
import {normalizeBoardPeople,renderBoardPeople,boardInviteControl,renderMentionDraft,mentionCandidates,insertMention,renderMentionOptions} from './board/collaboration/people.js';
import {BoardPreferenceStore} from './board/services/preferences-idb.js';
import {createStartupCriticalPath} from './performance-critical-path.js';
import {summarizeEntryWaterfall} from './performance-entry-waterfall.js';
import {readWorkspaceStartup} from './workspace-startup-read.js?v=cp-crm-account-recognition-01';
import {startupVerifiedRead,startupFailureDescription} from './startup-recovery-policy.js';
import {boardTable,boardColumnMenu,loadBoardLayout,saveBoardLayout,resetBoardLayout,reorderVisible,
 normalizeLayout,BOARD_REQUIRED_COLUMNS,BOARD_COLUMN_MIN,BOARD_COLUMN_MAX,columnWidth} from './board/presentation/presentation.js';
import {runSignedNegativeBoardAcceptance,sanitizeNegativeReport} from './board/acceptance/negative-acceptance.js';
import {renderSecurityAcceptance} from './board/acceptance/security-ui.js';
import {mountSecurityMotion,stopSecurityMotion} from './security-experience.js';
import {runDeniedQaWrite} from './board/acceptance/negative-write.js';
import {runFRTSec03SignedAcceptance} from './frt-sec03-signed-acceptance.js';
import {runFRTSec07ActivationGate} from './frt-sec07-signed-activation.js';
import {runFRTSec09SignedAcceptance,sanitizeFRTSec09Report} from './frt-sec09-signed-acceptance.js';
import {runFRTSec10SignedCeilingProbe,sanitizeFRTSec10Report} from './frt-sec10-signed-ceiling.js';
import {runFRTCI07SignedRoleProbe,sanitizeFRTCI07Report} from './frt-sec10-ci07-signed-runtime.js';
import {runSEC14SignedRead,sanitizeSEC14SignedRead} from './frt-sec14-signed-acceptance.js';
import {runSEC14SignedDenials,sanitizeSEC14SignedDenials} from './frt-sec14-signed-denials.js';

import {renderFRTRequestWizard,enhanceFRTRequestWizard,collectFRTWizardRequest} from './frt-request-wizard.js';
import {getFRTBrowserStorage,createFRTRequestDraftStore,createFRTDuplicateGuard,mountFRTRequestDraft} from './frt-request-draft.js';
import {mountFRTRecipientUI} from './frt-recipient-ui.js';
import {renderFRTBoardSignedSnapshot} from './frt-board-signed-snapshot.js';
import {renderFRTComments,renderFRTActivityEvents,renderFRTActivityFilters,renderFRTNotifications,renderFRTNotificationSummary} from './frt-collaboration-ui.js';
import {renderFRTLiquidationForm,enhanceFRTLiquidationForm,collectFRTLiquidationForm} from './frt-liquidation-ui.js';
import {renderFRTArchive} from './frt-archive-ui.js';
import {renderFRTVoucherDocument} from './frt-voucher-document.js';
import {renderFRTCompanyProfileEditor,hydrateFRTCompanyProfileForm} from './frt-company-profile.js';
import {FRT_BOARD_ID,isFRTBoardReference,frtReferenceColumns,FRT_REFERENCE_STATUS_LABELS,FRT_UNMAPPED_FIELDS} from './frt-board-reference.js';
import {TimeTrackerNativeClient,captureAttendanceGeo,filterMyAttendancePeriod,TT_LIVE_ATTENDANCE_WRITES_ACCEPTED,TT_DEPARTMENTS} from './time-tracker-native.js';
import {recordTimeTrackerGpsDiagnostic,exportTimeTrackerGpsDiagnostics,
 getTimeTrackerGpsDiagnostics,clearTimeTrackerGpsDiagnostics} from './time-tracker-gps-diagnostics.js';
import {FundTrackerNativeClient} from './fund-tracker-native.js';
import {renderFundTrackerNative} from './fund-tracker-ui.js';
import {findFundTrackerBoard,FUND_TRACKER_APPLICATION_ROUTE,parseFundTrackerRecordRoute,fundTrackerRecordHref} from './fund-tracker-application.js';
import {renderTimeTrackerNative,ownAttendanceCsv,syncTimeTrackerClock,syncTimeTrackerClockView,syncTimeTrackerSidebar} from './time-tracker-ui.js';
import {isTimeTrackerHomeNoteRequired,createTimeTrackerWorkNoteDraft} from './time-tracker-offsite-note.js';
import {mountTimeTrackerPixi,stopTimeTrackerPixi} from './time-tracker-pixi-scene.js';
import {startSelectExperience} from './select-experience.js';
import {startActionMenuExperience,enhanceActionContextMenu} from './action-menu-experience.js';
import {startSearchExperience} from './search-experience.js';
import {startGlobalSearch} from './global-search.js';
import {createNativeSearchAdapter,createNativeSearchRegistry,createSnapshotReader} from './global-search-adapters.js';
import {createRemainingNativeSearchAdapters,readNativeSearchRecordDetail,renderNativeSearchRecordDetail} from './global-search-native-apps.js';
import {startInputExperience} from './input-experience.js';
import {startMetricsExperience} from './metrics-experience.js';
import {applyTimeTrackerOverviewFilters,filterTimeTrackerOverviewRows,syncTimeTrackerOverviewClock,timeTrackerOverviewCsv} from './time-tracker-overview.js';
import {applyTimeTrackerLogSearch,filterTimeTrackerLogRows,timeTrackerLogCsv,timeTrackerLogRowsForSnapshot,retainTimeTrackerLogDetailIds,TT_LOG_DEFAULT_FILTERS,startTimeTrackerLogColumnResize} from './time-tracker-log.js';
import {filterTimeTrackerReportRows,applyTimeTrackerReportSearch,TT_REPORT_DEFAULT_FILTERS} from './time-tracker-reports.js';
import {timeTrackerCalendarMonth,shiftTimeTrackerCalendarMonth} from './time-tracker-calendar.js';
import {TT_OT_DEFAULT_FILTERS,TT_OT_WRITES_ACCEPTED,TT_OT_MAX_WEEK_OFFSET,timeTrackerOtWeek,timeTrackerOtWeekOffsetForDate,updateTimeTrackerOvertimePreview,updateTimeTrackerManualOtPreview} from './time-tracker-overtime.js';
import {parseTimeTrackerClockInput} from './time-tracker-time-format.js';
import {timeTrackerMyHoursWeek} from './time-tracker-my-hours.js';
import {timeTrackerTeamCsv,TT_TEAM_ROLES} from './time-tracker-team.js';
import {probeTimeTrackerMonitor} from './time-tracker-monitor.js';
import {buildTimeTrackerAdminPatch,buildTimeTrackerManualClockOut,syncManualClockOutPreview,TT_ADMIN_RECORD_LIMIT} from './time-tracker-record-management.js';
import {manualAttendancePreviewRoster,syncManualAttendanceForm,validateManualAttendanceForm} from './apps/TimeTracker/time-tracker-manual-attendance-ui.js';
import {manualAttendanceToday} from './apps/TimeTracker/time-tracker-manual-attendance.js';
import {timeTrackerGpsWindow,summarizeGps} from './time-tracker-gps.js';
import {TT_BOARD_GPS_PROJECTION_ENABLED,loadTimeTrackerBoardGps,renderTimeTrackerBoardGps} from './time-tracker-board-projection.js';
import {renderTimeTrackerMainGroup} from './time-tracker-main-group.js';
import {findTimeTrackerAttendanceBoard,TIMETRACKER_APPLICATION_ROUTE} from './time-tracker-application.js';
import {canViewTimeTrackerEmployees} from './time-tracker-application.js';
import {FUELTRANS_APPLICATION_ROUTE,FUELTRANS_BOARD_ID,fuelTransApplicationHref,parseFuelTransApplicationRoute} from './fueltrans-application-route.js';
import {openTimeTrackerAddDepartmentModal} from './apps/TimeTracker/time-tracker-add-department-modal.js';
import {TimeTrackerOjtClient,isEligibleTimeTrackerSharedOjtAccount,TIMETRACKER_SHARED_OJT_USER_ID} from './apps/TimeTracker/time-tracker-ojt.js';
import {buildTimeTrackerOjtAdminPatch} from './apps/TimeTracker/time-tracker-ojt-admin-editor.js';
import {attendanceSnapshotOutcome,attendanceAuthFailure,attendanceClockError} from './time-tracker-clock-recovery.js';
import {signedMapPoints,mountTimeTrackerMaps,disposeTimeTrackerMaps,setTimeTrackerMapTheme,retryTimeTrackerMaps,toggleTimeTrackerMapFullscreen} from './time-tracker-map.js';
import {inspectMySignedEffectiveAccess,sanitizeEffectiveAccessReport} from './signed-effective-access.js';
import {RoleConfigurationClient} from './role-configuration-client.js';
import {stagedProposalReadbackVerified} from './role-configuration-client.js';
import {renderRoleConfiguration,ROLE_MODULE_OPTIONS} from './role-configuration-ui.js';
import {mountRoleConfigurationMotion,stopRoleConfigurationMotion} from './role-configuration-visuals.js';
import {mountUserRoleMotion,stopUserRoleMotion} from './user-role-visuals.js';
import {settingsIcon,mountSettingsMotion,stopSettingsMotion} from './settings-visuals.js';
import {crmPlatformRoleChangeNeeded,FUELTRANS_WORKSPACE_ROLES,SCOPED_SIX_MODULE_IDS,UserRoleManagementClient,renderUserRoleManagement,selectDefaultUserRoleTarget,defaultModuleRoleForAssignment,MODULE_ROLE_OPTIONS,APSYNTRA_CRM_PLATFORM_ROLES} from './user-role-management.js';
import {parseSignedCrmRole,signedCrmRoleLabel,signedCrmIdentityLabel,currentSignedCrmRole} from './crm-role-context.js';
import {workspaceRelationFromCatalog,workspaceRelationLabel} from './workspace-relation-context.js';

const BOARD_BASE_COLUMNS=[{key:'record',title:'Item name'},{key:'status',title:'Status'},
 {key:'owner',title:'Owner'},{key:'due',title:'Due date'},{key:'actions',title:'Actions'}];
const root=document.getElementById('app');
let fm1Module=null;
const auth=new AuthClient();
const db=new DomainApi(auth);
const boardCacheChannel=new BoardCacheChannel({auth,onInvalidate:({boardId,revision,userId,workspaceId})=>{
 if(!auth.isSignedIn||state.context?.user_id!==userId||
    state.context?.workspace_id!==workspaceId)return;
 if(!db.invalidateBoardCache(boardId,{revision}))return;
 // Reconcile the active CRM view, including the board catalog and overview.
 // A board-specific event for another open board is filtered before follow-up reads.
 void reconcilePlatformSync({boardIds:boardId?[boardId]:[],
  reason:boardId?'broadcast':'cross-tab',userId,workspaceId}).catch(()=>{});
}});
db.onBoardMutation=({boardId,revision})=>boardCacheChannel.publish(boardId,revision);
const profileAvatarClient=new ProfileAvatarClient({auth});
const workspaceLifecycleClient=new WorkspaceLifecycleClient({auth,api:db});
const boardGroupAccessClient=new BoardGroupAccessClient({auth,api:db});
// The recipient confirmation UI is available after a valid one-time link;
// the trusted Edge accept route and SQL are the only membership authority.
const workspaceInvitationAcceptanceClient=new WorkspaceInvitationAcceptanceClient({auth,api:db,enabled:true});
// Signed runtime activation: a dedicated non-mutating manager readiness route must verify delivery
// before any invitation issue. Never infer readiness from a UI flag alone.
const workspaceInvitationLiveClient=new WorkspaceInvitationClient({auth,api:db,enabled:true});
const workspaceInvitationLiveManager=new WorkspaceInvitationManagementClient({auth,api:db,enabled:true});
const checkWorkspaceInvitationAvailability=workspaceId=>workspaceInvitationLiveManager.readiness(workspaceId);
const sendWorkspaceInvitation=request=>workspaceInvitationLiveClient.send(request);
const platformSync=new PlatformSync({
 auth,api:db,url:SUPABASE_URL,publishableKey:SUPABASE_PUBLISHABLE_KEY,
 onStatus:updatePlatformSyncIndicator,onInvalidate:async event=>{
  if(event.reason==='broadcast'&&event.boardIds?.length){
   for(const id of event.boardIds)db.invalidateBoardCache(id);
  }else db.invalidateBoardCache(null,{invalidateContext:event.reason==='cross-tab'});
  return reconcilePlatformSync(event);
 }
});
const boardStructureClient=new BoardStructureClient(db);
const boardColumnRecovery=new BoardColumnRecoveryClient(db);
const boardColumnOperationalRecovery=new BoardColumnOperationalRecoveryClient(db);
const boardCardLifecycle=new BoardCardLifecycleClient(db);
const itemSelection=new BoardItemSelection();
const boardPreferences=new BoardPreferenceStore();
const boardBulkClient=new BoardBulkClient(db);
const nativeIssues=new NativeIssueClient(db);
const tradeLinkDraftWorkspace=new TradeLinkDraftWorkspace({auth,api:db});
const tradeLinkNativeSearchAdapter=createNativeSearchAdapter({
 id:'tradelink',name:'TradeLink',recordType:'Commercial document',
 read:async(query,{limit=20}={})=>{
  const bounded=Math.max(1,Math.min(20,Number.isInteger(limit)?limit:20));
  try{
   const page=await tradeLinkDraftWorkspace.searchPage({
    filters:{query,documentType:'all',workflowState:'all',archiveMode:'active',
     sortBy:'createdAt',sortDirection:'desc'},limit:bounded
   });
   return page.rows;
  }catch(error){
   if(error?.status!==403)throw error;
  }
  const rows=await tradeLinkDraftWorkspace.assignedDocuments(bounded);
  const terms=String(query||'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row=>terms.every(term=>
   [row.documentNumber,row.documentType,row.workflowState].some(value=>
    String(value||'').toLocaleLowerCase().includes(term)))).slice(0,bounded);
 },
 getId:row=>row.documentId,
 getTitle:row=>row.documentNumber,
 getSubtitle:row=>[row.documentType,row.workflowState].filter(Boolean).join(' · '),
 getExcerpt:row=>[row.documentType,row.workflowState].filter(Boolean).join(' · '),
 getSearchFields:row=>[row.documentNumber,row.documentType,row.workflowState],
 getHref:row=>tradeLinkApplicationHref('documents/record/'+encodeURIComponent(row.documentId))
});

const frtNativeSearchAdapter=createNativeSearchAdapter({
 id:'frt-requests',applicationId:'frt',name:'Fund Release Tracker',recordType:'Funding request',
 read:(query,{limit=20}={})=>fundTracker.searchRequests(query,{limit}),
 getId:row=>row.requestId,getTitle:row=>row.title,
 getSubtitle:row=>[row.voucher,row.status].filter(Boolean).join(' · '),
 getExcerpt:row=>row.dateNeeded,
 getSearchFields:row=>[row.voucher,row.status,row.dateNeeded,row.companyCode],
 getNavigationScope:row=>row.companyCode,
 getHref:row=>fundTrackerRecordHref(row.companyCode,row.requestId)
});


const timeTrackerSearchSnapshot=createSnapshotReader(({boardId})=>timeTracker.snapshot(boardId),
 {ttlMs:12000,maxEntries:4});
const timeTrackerAttendanceSearchAdapter=createNativeSearchAdapter({
 id:'timetracker-attendance',applicationId:'timetracker',name:'TimeTracker Attendance',
 recordType:'Attendance session',
 read:async(query,{userId,workspaceId,limit=20}={})=>{
  const board=findTimeTrackerAttendanceBoard(state.boards,moduleByBoardName);
  if(!board?.id||!userId||!workspaceId)return [];
  const snapshot=await timeTrackerSearchSnapshot({userId,workspaceId,boardId:board.id});
  if(snapshot?.status!=='VERIFIED_READ')return [];
  const terms=String(query||'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (snapshot.log?.rows||snapshot.records||[]).slice(0,250).filter(row=>
   terms.every(term=>[row.id,row.clockIn,row.clockOut,row.status,row.classification]
    .some(value=>String(value||'').toLocaleLowerCase().includes(term)))).slice(0,limit);
 },
 getId:row=>row.id,
 getTitle:row=>'Attendance · '+String(row.clockIn||'').slice(0,10),
 getSubtitle:row=>[row.status,row.classification].filter(Boolean).join(' · '),
 getExcerpt:row=>String(row.clockIn||'').slice(0,16),
 getSearchFields:row=>[row.id,row.clockIn,row.clockOut,row.status,row.classification],
 getHref:row=>'#/time-tracker/attendance/'+encodeURIComponent(row.id)
});
const timeTrackerOvertimeSearchAdapter=createNativeSearchAdapter({
 id:'timetracker-overtime',applicationId:'timetracker',name:'TimeTracker Attendance',
 recordType:'Overtime request',
 read:async(query,{userId,workspaceId,limit=20}={})=>{
  const board=findTimeTrackerAttendanceBoard(state.boards,moduleByBoardName);
  if(!board?.id||!userId||!workspaceId)return [];
  const snapshot=await timeTrackerSearchSnapshot({userId,workspaceId,boardId:board.id});
  if(snapshot?.status!=='VERIFIED_READ')return [];
  const terms=String(query||'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (snapshot.otRequests||[]).slice(0,250).filter(row=>
   ['Submitted','Approved','Rejected'].includes(row.status)&&
   terms.every(term=>[row.id,row.date,row.status,row.start,row.end]
    .some(value=>String(value||'').toLocaleLowerCase().includes(term)))).slice(0,limit);
 },
 getId:row=>row.id,getTitle:row=>'Overtime · '+row.date,
 getSubtitle:row=>[row.status,row.start&&row.end?row.start+'–'+row.end:''].filter(Boolean).join(' · '),
 getExcerpt:row=>row.status,
 getSearchFields:row=>[row.id,row.date,row.status,row.start,row.end],
 getHref:row=>'#/time-tracker/overtime/'+encodeURIComponent(row.id)
});


const fuelTrackSearchSnapshot=createSnapshotReader(async({userId,workspaceId,boardId})=>{
 if(!auth.isSignedIn||auth.userId!==userId||state.context?.user_id!==userId||
    state.context?.workspace_id!==workspaceId||boardId!==FUELTRACK_V3_ID||
    await db.allowed(boardId,'view')!==true)throw new ApiError('FuelTrack search scope unavailable.',403);
 return new FuelTrackV3DomainClient({api:db,auth,boardId,workspaceId}).read({limit:200});
},{ttlMs:12000,maxEntries:4});
const fuelTrackNativeSearchAdapter=createNativeSearchAdapter({
 id:'fueltrack-requests',applicationId:'fueltrack',name:'FuelTrack+',
 recordType:'Fuel request / receipt reference',
 read:async(query,{userId,workspaceId,limit=20}={})=>{
  const snapshot=await fuelTrackSearchSnapshot({userId,workspaceId,boardId:FUELTRACK_V3_ID});
  if(snapshot?.status!=='VERIFIED_READ'||snapshot.boardId!==FUELTRACK_V3_ID||
     snapshot.workspaceId!==workspaceId)return [];
  const terms=String(query||'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return snapshot.rows.slice(0,200).filter(row=>terms.every(term=>[
   row.id,row.kind,row.state,row.created_at,row.receipt_number
  ].some(value=>String(value||'').toLocaleLowerCase().includes(term)))).slice(0,limit);
 },
 getId:row=>row.id,
 getTitle:row=>'Fuel request · '+(row.kind==='vehicle'?'Vehicle':'Container'),
 getSubtitle:row=>[row.state,row.receipt_number?'Receipt '+row.receipt_number:''].filter(Boolean).join(' · '),
 getExcerpt:row=>String(row.created_at||'').slice(0,10),
 getSearchFields:row=>[row.id,row.kind,row.state,row.created_at,row.receipt_number],
 getHref:row=>fuelTrackHref('requests')+'/record/'+encodeURIComponent(row.id)
});


const fuelTransNativeSearchAdapter=createNativeSearchAdapter({
 id:'fueltrans-tickets',applicationId:'fueltrans',name:'FuelTrans Support Portal',
 recordType:'Support ticket',
 read:async(query,{userId,workspaceId,limit=20}={})=>{
  const board=state.boards.find(entry=>moduleByBoardName(entry.name)?.key==='fueltrans');
  if(!board?.id||!userId||!workspaceId)return [];
  const context={auth,api:db,boardId:board.id,workspaceId,userId,
   isCurrent:()=>auth.isSignedIn&&auth.userId===userId&&
    state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
    state.boards.some(entry=>entry.id===board.id&&moduleByBoardName(entry.name)?.key==='fueltrans')};
  const {searchFuelTransTickets}=await import('./fueltrans/supabase-client.js');
  return searchFuelTransTickets(context,{query,limit});
 },
 getId:row=>row.id,getTitle:row=>row.ticketNumber,
 getSubtitle:row=>[row.clientCode,row.status].filter(Boolean).join(' · '),
 getExcerpt:row=>String(row.createdAt||'').slice(0,10),
 getSearchFields:row=>[row.ticketNumber,row.clientCode,row.status],
 getHref:row=>{const board=state.boards.find(entry=>moduleByBoardName(entry.name)?.key==='fueltrans');
  return board?.id?fuelTransApplicationHref('ticket/'+encodeURIComponent(row.id)):'#/boards';}
});

const remainingNativeSearchAdapters=createRemainingNativeSearchAdapters({auth,api:db,getBoards:()=>state.boards});
const nativeSearchRegistry=createNativeSearchRegistry([tradeLinkNativeSearchAdapter,frtNativeSearchAdapter,timeTrackerAttendanceSearchAdapter,timeTrackerOvertimeSearchAdapter,fuelTrackNativeSearchAdapter,fuelTransNativeSearchAdapter,...remainingNativeSearchAdapters]);
const tradeLinkAttachments=new TradeLinkAttachmentClient({auth,api:db});
const row01BootId=crypto.randomUUID();
const timeTracker=new TimeTrackerNativeClient({auth,api:db});
const timeTrackerOjt=new TimeTrackerOjtClient({auth,api:db});
const fundTracker=new FundTrackerNativeClient({auth,api:db});
const roleConfig=new RoleConfigurationClient(db);
const userRoleManager=new UserRoleManagementClient(db);
let systemAdminClient=null;
async function getSystemAdminClient(){
 if(!systemAdminClient){
  const {SystemAdminClient}=await import('./system-admin-access.js');
  systemAdminClient=new SystemAdminClient(db);
 }
 return systemAdminClient;
}
let performanceProfileAbort=null;
const startupCriticalPath=createStartupCriticalPath();
const state={workspaceTransitionPending:false,workspaceTransitionTargetId:null,workspaceTransitionTargetName:'',performanceBusy:false,performanceReport:null,context:null,boardCatalogError:'',crmRoleSnapshot:null,workspaceRelationSnapshot:null,avatarMutationBusy:false,user:null,boards:[],archived:[],trashed:[],showArchived:false,showTrash:false,boardSearch:'',boardItemSearch:'',mrhTrackerFilters:{...MATERIAL_TRACKER_DEFAULT_FILTERS},mrhTrackerScope:'',mrhAddView:false,mrhAddBusy:false,groupEditId:null,groupEditBusy:false,inlineCell:null,inlineCellBusy:false,inlineAddBusy:false,row01Busy:false,row01Result:null,bulk02Busy:false,bulk02Result:null,bulk02Access:null,boardLifecycleBusy:false,columnOrderBusy:false,board:null,boardUi:null,boardPageBusy:false,boardPageError:'',issues:[],edit:false,boardManage:false,
  view:'overview',boardId:null,tab:'items',fuelTrackSection:'dashboard',fuelTrackAnalyticsView:'fuel-price',fuelTrackAnalyticsRange:'all',fuelTrackAnalyticsMetric:'both',fuelTrackRequestFilters:{...FUELTRACK_REQUEST_FILTER_DEFAULTS},fuelTrackRequestScope:'',fuelTrackBackend:null,fuelTrackBackendBusy:false,fuelTrackBackendError:'',fuelTrackPreflight:null,fuelTrackPreflightBusy:false,fuelTrackPendingSubmission:null,fuelTrackReceiptLink:null,fuelTrackRefuelingDialog:null,fuelTrackActivity:null,fuelTrackActivityBusy:false,fuelTrackActivityError:'',fuelTrackActivityFilters:{...FUELTRACK_ACTIVITY_FILTER_DEFAULTS},loading:false,loadingIssues:false,frtFinance:null,frtFinanceBusy:false,frtFinanceView:'tracker',frtStatusFilter:'all',ttStandalone:false,frtStandalone:false,tlStandalone:false,fuelTrackStandalone:false,fuelTransStandalone:false,ttBoardGpsEligible:false,ttBoardAttendance:null,ttAttendance:null,ttOjtSelected:null,ttOjtSnapshot:null,ttOjtBusy:false,ttOjtError:'',ttOjtSuccess:'',ttOjtPending:false,ttClockPending:null,ttAutoClockoutBusy:false,ttAutoClockoutRunId:0,ttBusy:false,ttError:'',ttSuccess:'',ttClockCorrectionNotice:'',ttClockStage:'idle',ttGeoPromptVisible:false,ttGeoPermission:'unknown',ttGeoMessage:'',ttRunId:0,ttReportPeriod:'all',ttReportFilters:{...TT_REPORT_DEFAULT_FILTERS},ttCalendarMonth:'',ttCalendarSelectedDay:'',ttOtFilters:{...TT_OT_DEFAULT_FILTERS},ttOtManualVisibleCount:50,ttOtExpandedRequestIds:[],ttOtModalOpen:false,ttOtDraft:{},ttHoursWeekOffset:0,ttHoursMonth:'',ttHoursSelectedDay:'',ttTeam:null,ttTeamBusy:false,ttTeamError:'',ttTeamRunId:0,ttTeamFilters:{search:'',role:'All',layout:'list'},ttMonitor:null,ttMonitorHistory:[],ttMonitorBusy:false,ttMonitorError:'',ttMonitorRunId:0,ttLogGpsData:null,ttLogGpsBusy:false,ttLogGpsError:'',ttLogGpsErrorRecordId:'',ttLogGpsRunId:0,ttLogGpsCacheAt:0,ttLogExpandedIds:[],ttLogSelectedIds:[],ttLogAdminEditor:null,ttLogAdminDeleteConfirm:null,ttLogAdminBusy:false,ttLogAdminError:'',ttLogAdminSuccess:'',ttGpsData:null,ttGpsBusy:false,ttGpsError:'',ttGpsRunId:0,ttGpsCacheAt:0,ttGpsView:'map',ttGpsFilters:{},ttMapConsent:true,ttMapConsentIdentity:'',ttView:'clock',ttEmployeesSearch:'',ttEmployeesTab:'directory',ttEmployeesDepartment:'',ttOverviewFilters:{search:'',location:'all',department:'all',status:'all',sort:'newest'},ttLogFilters:{...TT_LOG_DEFAULT_FILTERS},frtFinanceDetail:null,frtFinanceDetailBusy:false,frtFinanceDetailId:null,frtFinanceDetailRevision:0,filter:'',error:null,authBusy:false,acceptance:null,acceptanceBusy:false,boardTtSignedResult:null,boardTtSignedBusy:false,pagesAcceptance:null,pagesBusy:false,nativeAcceptance:null,nativeBusy:false,foundationRows:[],foundationBusy:false,provisionBusy:false,foundationLog:[],foundationError:'',foundationTesting:false,foundationTestResult:null,securityBusy:false,securityResult:null,securityProgress:[],securityWriteBusy:false,securityWriteResult:null,frtSecurityBusy:false,frtSecurityResult:null,ci07Busy:false,ci07Result:null,ci07RunId:0,sec14Busy:false,sec14Result:null,sec14RunId:0,sec14DenialBusy:false,sec14DenialResult:null,sec14DenialRunId:0,sec07Busy:false,sec07Result:null,sec09Busy:false,sec09Result:null,sec09RunId:0,sec10Busy:false,sec10Result:null,sec10RunId:0,effectiveAccessBusy:false,effectiveAccessResult:null,effectiveAccessRunId:0,securityBoardsError:'',tradeLinkSetupBusy:false,tl03ReadBusy:false,tl03ReadResult:null,tl03ReadRunId:0,tl03RevokeArmed:false,tl03RevokedReport:null,ws01B2Busy:false,ws01B2Result:null,ws01B2RunId:0,ws02dB3Busy:false,ws02dB3Report:null,ws02dB3RunId:0,ws02dB3HttpsBusy:false,ws02dB3HttpsReport:null,ws02dB3HttpsRunId:0,ws02dB3RlsBusy:false,ws02dB3RlsReport:null,ws02dB3RlsRunId:0,ws02dB3HandoffPending:false,ws02dB3RevokeArmed:false,ws02dB3RevokedReport:null,b2QaBusy:false,b2QaReport:null,b2QaRunId:0,b4QaBusy:false,b4QaReport:null,b4QaRunId:0,phaseBDenialBusy:false,phaseBDenialReport:null,phaseBDenialRunId:0,tradeLinkSection:'overview',tradeLinkModuleRole:'',tradeLinkActivity:null,tradeLinkActivityBusy:false,tradeLinkActivityError:'',tradeLinkAnalytics:null,tradeLinkAnalyticsBusy:false,tradeLinkAnalyticsRunId:0,tradeLinkAnalyticsError:'',tradeLinkDraft:initialTradeLinkDraftView(),roleVerified:false,adminVerified:false,roleData:null,roleTab:'roles',roleBusy:false,roleError:'',userRoleData:null,userRoleSelected:null,userRoleSection:'applications',userRoleBoardSearch:'',userRoleBatchMode:false,userRoleBatchSelected:[],userRoleBatchMemberSearch:'',userRoleBatchIdentity:'',userRoleBatchScope:'module',userRoleBatchResource:'',userRoleBatchRole:'',userRoleBatchAction:'assign',userRoleBatchModulesSelected:[],userRoleBatchModuleRoles:{},userRoleNativeBatchResults:[],userRoleBusy:false,userRoleError:'',systemAdminData:null,systemAdminBusy:false,systemAdminError:''};
// A work plan is an unsaved, signed-scope draft until Clock In succeeds.
const ttWorkNoteDraft=createTimeTrackerWorkNoteDraft();
function timeTrackerWorkNoteScope(internId=''){
 if(!auth.isSignedIn||!state.context?.user_id||
    state.context.user_id!==auth.userId||!state.context?.workspace_id||
    !state.boardId)return null;
 return {userId:state.context.user_id,workspaceId:state.context.workspace_id,
  boardId:state.boardId,internId};
}
let teamsController=null;
async function ensureTeamsController(){
 if(teamsController)return teamsController;
 // The Teams role-management editor is deliberately loaded only after the route
 // is opened, preserving the existing signed anonymous startup module budget.
 const {TeamsController}=await import('./teams/teams-controller.js');
 if(!teamsController)teamsController=new TeamsController({api:db,auth,
   getContext:()=>state.context,getBoards:()=>state.boards,
   onClose:()=>{location.hash='#/overview';},
   onToast:(message,failed=false)=>toast(message,failed)});
 return teamsController;
}
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusClass=value=>({'done':'done','completed':'completed','working':'working','in progress':'in-progress',
'stuck':'stuck','blocked':'blocked','todo':'todo','planned':'planned'}[String(value??'').toLowerCase()]||'todo');
const displayDate=value=>{if(!value)return '—';const d=new Date(value);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric'}).format(d)};
const initials=value=>String(value||'U').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const iconColor=index=>['','green','orange','pink','blue'][Math.abs(index)%5];
const name=()=>state.context?.profile?.display_name||state.context?.profile?.email?.split('@')[0]||'Member';
const workspaceName=()=>state.workspaceTransitionPending?
 'Switching to '+(state.workspaceTransitionTargetName||'workspace')+'…':
 state.context?.workspace_id===WORK_MANAGEMENT_WORKSPACE_ID?'Work Management':'Current workspace';
const STANDALONE_APPLICATION_MODULE_KEYS=new Set(['timetracker','frt','tradelink','fueltrack','fueltrans']);
const isStandaloneApplicationBoard=board=>STANDALONE_APPLICATION_MODULE_KEYS.has(
 moduleByBoardName(board?.name)?.key)||moduleByBoardName(board?.name)?.key==='toolbox';
const cards=()=>state.showTrash?state.trashed:state.showArchived?state.archived:
 state.boards.filter(board=>!isStandaloneApplicationBoard(board));
const routeHome='#/overview';
const unsavedTradeLinkWarning='You have unsaved TradeLink Draft changes. Leave this page and discard them?';
let approvedRouteHash=location.hash||routeHome;
let rejectedRouteHash=null;
let pendingInvitation=null;
let invitationAcceptanceBusy=false;
let invitationAcceptanceStatus='';
let modal=null;
let globalSearchController=null;
let pendingGlobalSearchItem=null;
let pendingNativeSearchSelection=null;
let talkBoxState={page:null,selected:null,busy:false,error:'',scope:'',filter:{name:'',status:'All'},features:null,meetingOpen:false,meetingDate:'',meetingHistory:[],meetingRecord:null,meetingRows:[]};
let talkBoxReportUrl=null;
function clearTalkBoxReportUrl(){
 if(talkBoxReportUrl){URL.revokeObjectURL(talkBoxReportUrl);talkBoxReportUrl=null;}
}
const talkBoxClient=()=>new TalkBoxNativeClient({api:db,workspaceId:state.context.workspace_id});
async function talkBoxMeetings(){
 // Meeting functionality is not part of the ordinary CRM startup module graph.
 const {TalkBoxMeetingsClient}=await import('./talkbox-meetings.js');
 return new TalkBoxMeetingsClient({api:db,workspaceId:state.context.workspace_id});
}
async function talkBoxAttachments(){
 // Private upload/download code must not inflate the ordinary CRM startup graph.
 const {TalkBoxAttachmentClient}=await import('./talkbox-attachments.js');
 return new TalkBoxAttachmentClient({api:db,auth,workspaceId:state.context.workspace_id});
}
function talkBoxCurrent(scope){return auth.isSignedIn&&state.view==='talkbox'&&state.tab==='talkbox'&&state.context?.user_id===auth.userId&&
 [auth.userId,state.context.workspace_id,state.boardId].join('|')===scope;}
function renderTalkBoxNativeApplication(){
 if(state.loading||state.nativeInitialRead==='talkbox'||(talkBoxState.busy&&!talkBoxState.page))return sharedApplicationLoading();
 return renderTalkBoxApplication({
  page:talkBoxState.page,selected:talkBoxState.selected,
  busy:talkBoxState.busy||state.loading,
  error:talkBoxState.error||state.error||'',
  canEdit:state.edit,filter:talkBoxState.filter,features:talkBoxState.features||{},
  meetingOpen:talkBoxState.meetingOpen===true,meetingDate:talkBoxState.meetingDate||'',
  meetingHistory:talkBoxState.meetingHistory||[],meetingRecord:talkBoxState.meetingRecord||null,
  meetingRows:talkBoxState.meetingRows||[],meetingError:talkBoxState.meetingError||'',
  reportUrl:talkBoxState.reportUrl||''
 });
}
async function loadTalkBox({more=false,selectedId=null}={}){
 const scope=[auth.userId,state.context?.workspace_id,state.boardId].join('|');
 if(!talkBoxCurrent(scope)||talkBoxState.busy)return;
 // Never carry a previously selected issue or list page into a new workspace.
 if(talkBoxState.scope!==scope)talkBoxState={
  page:null,selected:null,busy:false,error:'',scope,filter:{name:'',status:'All'},features:null,meetingOpen:false,meetingDate:'',meetingHistory:[],meetingRecord:null,meetingRows:[]
 };
 clearTalkBoxReportUrl();
 talkBoxState={...talkBoxState,busy:true,error:'',scope,reportUrl:''};render();
 try{
  const client=talkBoxClient();
  const features=talkBoxState.features??await client.nativeV2Capabilities();
  const page=await client.list(more?talkBoxState.page?.cursor:null,talkBoxState.filter);
  if(!talkBoxCurrent(scope))return;
  const existing=more?(talkBoxState.page?.items||[]):[];
  const known=new Set(existing.map(item=>item.id));
  const items=[...existing,...page.items.filter(item=>!known.has(item.id))];
  // Read the durable meeting ledger separately from the issue list. A failed
  // meeting read must not hide otherwise valid native issues.
  let meetingHistory=[],meetingRecord=null,meetingRows=[],meetingError='';
  try{
   const stored=await (await talkBoxMeetings()).read();
   meetingHistory=stored.meetings;
   if(talkBoxState.meetingOpen){
    meetingRecord=stored.meetings.find(x=>x.date===talkBoxState.meetingDate)||null;
    if(meetingRecord){
     // Read active issues in 50-item pages rather than issuing a separate
     // detail RPC for each meeting reference. Stop as soon as all are found.
     const needed=new Set(meetingRecord.issueIds),active=new Map(),cursors=new Set();
     let cursor=null,pages=0;
     do{
      const visible=await client.list(cursor);
      for(const issue of visible.items)if(needed.has(issue.id))active.set(issue.id,issue);
      cursor=visible.cursor;pages++;
      if(cursor){
       if(cursors.has(cursor)||pages>=50)throw Error('Meeting issue pagination is incomplete');
       cursors.add(cursor);
      }
     }while(cursor&&active.size<needed.size);
     for(const id of meetingRecord.issueIds){
      const record=active.get(id);
      if(record){meetingRows.push(record);continue;}
      const snapshot=meetingRecord.issueSnapshots.find(x=>x.id===id);
      if(snapshot)meetingRows.push({id:snapshot.id,name:snapshot.name,status:snapshot.status,
       date:snapshot.date,person:snapshot.person?[{name:snapshot.person}]:[],unavailable:true});
     }
    }
   }
  }catch(error){meetingError=errorMessage(error);}
  if(!talkBoxCurrent(scope))return;
  let reportUrl='';
  if(meetingRecord&&!meetingError){
   const {meetingReportCsv}=await import('./talkbox-meetings.js');
   if(!talkBoxCurrent(scope))return;
   const csv=meetingReportCsv(meetingRecord,meetingRows);
   reportUrl=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
   talkBoxReportUrl=reportUrl;
  }
  const openId=selectedId||talkBoxState.selected?.id;
  const selected=openId?await client.getIfAvailable(openId):null;
  if(!talkBoxCurrent(scope))return;
  talkBoxState={page:{...page,items},selected,busy:false,error:'',scope,filter:talkBoxState.filter,features,
   meetingOpen:talkBoxState.meetingOpen===true,meetingDate:talkBoxState.meetingDate||'',
   meetingHistory,meetingRecord,meetingRows,meetingError,reportUrl};
 }catch(err){if(talkBoxCurrent(scope))talkBoxState={...talkBoxState,busy:false,error:errorMessage(err)};}
 finally{if(talkBoxCurrent(scope)){talkBoxState.busy=false;render();}}
}
async function openTalkBoxIssue(issueId){
 const scope=[auth.userId,state.context?.workspace_id,state.boardId].join('|');
 if(!talkBoxCurrent(scope)||talkBoxState.busy)return;
 talkBoxState.busy=true;render();
 try{const selected=await talkBoxClient().getIfAvailable(issueId);
  if(talkBoxCurrent(scope))talkBoxState={...talkBoxState,selected,
   error:selected?'':'This issue is no longer available. Refresh the list.'};
 }catch(err){if(talkBoxCurrent(scope))talkBoxState.error=errorMessage(err);}
 finally{if(talkBoxCurrent(scope)){talkBoxState.busy=false;render();}}
}
const trashPermanentDelete=new BoardTrashPermanentDeleteClient(db);
const trashBoardSelection=new Set();
let routeSerial=0;
let applicationRouteRead=null;
function beginApplicationRouteRead(label){
 const token={label,hash:location.hash,userId:auth.userId,workspaceId:state.context?.workspace_id};
 applicationRouteRead=token;
 routeSerial++;
 render();
 return token;
}
function finishApplicationRouteRead(token){
 if(applicationRouteRead!==token||location.hash!==token.hash||
    !auth.isSignedIn||auth.userId!==token.userId||state.context?.workspace_id!==token.workspaceId)return false;
 applicationRouteRead=null;
 return true;
}
function sharedApplicationLoading(){
 return renderBoardLoading({hidden:document.hidden,
  lowPower:navigator.connection?.saveData===true||
   (Number.isFinite(navigator.deviceMemory)&&navigator.deviceMemory<=4)});
}
let orderIntakeRoute=null,orderIntakeRecord=null,orderIntakeRecordRun=0;
let orderIntakeCreateSave=null,orderIntakeCreateScope=null,orderIntakeEditorGeneration=0;
const orderIntakeScope=()=>[state.context?.user_id,state.context?.workspace_id].join('|');
const orderIntakeCurrent=scope=>!state.workspaceTransitionPending&&auth.isSignedIn&&state.context?.user_id===auth.userId&&
 state.view==='order-intake'&&Boolean(parseOrderIntakeRoute(location.hash))&&scope===orderIntakeScope();
const orderIntakeRead=createOrderIntakeReadState({
 clientFor:scope=>new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]}),
 isCurrent:orderIntakeCurrent,onChange:()=>render()
});
const orderIntakeArchived=createOrderIntakeReadState({
 clientFor:scope=>({list:options=>new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]}).list({...options,archived:true})}),
 isCurrent:orderIntakeCurrent,onChange:()=>render()
});
const currentOrderIntakeRead=()=>orderIntakeRoute?.section==='archived'?orderIntakeArchived:orderIntakeRead;
const completeOrderIntakeView=()=>Boolean(orderIntakeRoute);
let orderIntakeLifecycleBusy=false;
const orderIntakeTable={page:0,selected:new Set(),results:[],busy:false};
function resetOrderIntakeTable(){orderIntakeTable.page=0;orderIntakeTable.selected.clear();orderIntakeTable.results=[];orderIntakeTable.busy=false;}
function orderIntakeMatching(){const snapshot=currentOrderIntakeRead().read(orderIntakeScope());return filterOrderIntakeRows(snapshot?.rows||[],orderIntakeRoute?.filters);}
function orderIntakeTableReady(){const scope=orderIntakeScope(),snapshot=currentOrderIntakeRead().read(scope);return orderIntakeCurrent(scope)&&snapshot&&!snapshot.busy&&!snapshot.hasMore&&!snapshot.error&&!orderIntakeTable.busy&&!orderIntakeLifecycleBusy;}
let resetOrderIntakeDrag=()=>{};
function clearOrderIntake(){
 if(modal?.dataset.oiEditor)hideModal();
 orderIntakeEditorGeneration++;orderIntakeCreateSave=null;orderIntakeCreateScope=null;
 orderIntakeRead.clear();orderIntakeArchived.clear();resetOrderIntakeTable();orderIntakeLifecycleBusy=false;resetOrderIntakeDrag();orderIntakeRecordRun++;orderIntakeRecord=null;orderIntakeRoute=null;
}
async function loadOrderIntakeRecord(route,scope){
 const run=++orderIntakeRecordRun;
 orderIntakeRecord=null;
 if(!route.recordId)return;
 orderIntakeRecord={busy:true};render();
 try{
  const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
  const row=await client.detail(route.recordId,{includeArchived:route.section==='archived'});
  if(route.section==='archived'&&row.archived!==true)throw new Error('This order is no longer archived. Open All Orders.');
  const activity=await client.operationalActivity(row).catch(error=>({error:errorMessage(error)}));
  if(row.id!==route.recordId||row.workspace_id!==state.context?.workspace_id)throw new Error('Order record unavailable.');
  if(run===orderIntakeRecordRun&&orderIntakeCurrent(scope))orderIntakeRecord={row,activity};
 }catch(error){
  if(run===orderIntakeRecordRun&&orderIntakeCurrent(scope))orderIntakeRecord={error:errorMessage(error)};
 }
 if(run===orderIntakeRecordRun&&orderIntakeCurrent(scope))render();
}
function openOrderIntakeEditor(edit=false){
 const scope=orderIntakeScope();
 if(!orderIntakeCurrent(scope)||orderIntakeTable.busy)return;
 const row=edit?orderIntakeRecord?.row:null;
 if(edit&&!nativeEditable(row))return;
 const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
 const generation=orderIntakeEditorGeneration;
 const current=()=>generation===orderIntakeEditorGeneration&&orderIntakeCurrent(scope);
 if(!edit&&orderIntakeCreateScope!==scope){orderIntakeCreateScope=scope;orderIntakeCreateSave=null;}
 const save=edit?createOrderEditorSave({client,row,isCurrent:current}):
  (orderIntakeCreateSave??=createOrderEditorSave({client,isCurrent:current}));
 let view;
 openModal(edit?'Edit purchase order':'New purchase order',orderEditorMarkup(save.pendingDraft()||orderEditorDraft(row)),async fd=>{
  const feedback=view.querySelector('[data-oi-editor-error]');
  feedback.textContent='';
  try{
   const saved=await save(Object.fromEntries(fd));
   if(!edit&&orderIntakeCreateSave===save){orderIntakeCreateSave=null;}
   if(!current())return;
   if(modal!==view){if(orderIntakeRoute?.section==='archived')orderIntakeRead.clear();else void orderIntakeRead.refresh(scope,completeOrderIntakeView());return;}
   toast('Purchase order saved and verified.');
   if(orderIntakeRoute?.recordId===saved.id){
    await loadOrderIntakeRecord(orderIntakeRoute,scope);
   }else location.hash=orderIntakeHref('all-orders',{},saved.id);
   await orderIntakeRead.refresh(scope,true);
  }catch(error){
   const message=errorMessage(error);
   feedback.textContent=message.includes('ORDER_INTAKE_REVISION_CONFLICT')?'This order changed elsewhere. Close, refresh and reopen it before editing again.':message;
   throw error;
  }
 },{submitLabel:edit?'Save changes':'Create order',successMessage:''});
 view=modal;view.dataset.oiEditor='true';
 view.querySelector('.modal')?.classList.add('oi-editor-modal');
 const form=view.querySelector('form');
 form.addEventListener('input',()=>updateOrderEditorPreview(form));
 updateOrderEditorPreview(form);
}
function openOrderIntakeLifecycle(action,id,target=null){
 const scope=orderIntakeScope(),generation=orderIntakeEditorGeneration;
 if(!orderIntakeCurrent(scope)||orderIntakeLifecycleBusy||orderIntakeTable.busy)return;
 const row=orderIntakeRecord?.row?.id===id?orderIntakeRecord.row:currentOrderIntakeRead().read(scope)?.rows.find(item=>item.id===id);
 if(!lifecycleActions(row)[action])return;
 const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
 const current=()=>generation===orderIntakeEditorGeneration&&orderIntakeCurrent(scope);
 const title=action==='status'?'Change order status':action==='archive'?'Archive purchase order':'Restore purchase order';
 let view;
 openModal(title,lifecycleFields(row,action,target)+'<p role="alert" data-oi-lifecycle-error></p>',async fd=>{
  if(orderIntakeLifecycleBusy)throw new Error('Another lifecycle update is in progress.');
  orderIntakeLifecycleBusy=true;
  try{
   const saved=await saveLifecycle({client,row,action,target:fd.get('status'),isCurrent:current});
   if(!current())return;
   const active=orderIntakeRoute?.section!=='archived';
   if(active){if(action!=='status')orderIntakeArchived.clear();}else orderIntakeRead.clear();
   if(orderIntakeRoute?.recordId===saved.id){
    if(action==='archive'||action==='restore'){
     location.hash=orderIntakeHref(action==='archive'?'archived':'all-orders',{},saved.id);
    }else await loadOrderIntakeRecord(orderIntakeRoute,scope);
   }
   await currentOrderIntakeRead().refresh(scope,completeOrderIntakeView());
   if(current())toast('Order '+(action==='status'?'status updated':action==='archive'?'archived':'restored')+' and verified.');
  }catch(error){
   if(view?.isConnected)view.querySelector('[data-oi-lifecycle-error]').textContent=errorMessage(error)+' Refresh before retrying if the record changed.';
   if(current()){
    await currentOrderIntakeRead().refresh(scope,completeOrderIntakeView());
    if(orderIntakeRoute?.recordId===row.id)await loadOrderIntakeRecord(orderIntakeRoute,scope);
   }
   throw error;
  }finally{if(generation===orderIntakeEditorGeneration)orderIntakeLifecycleBusy=false;}
 },{submitLabel:action==='status'?'Save status':action==='archive'?'Archive order':'Restore order',successMessage:''});
 view=modal;view.dataset.oiEditor='true';
}
async function openOrderIntakeRecipient(id){
 const scope=orderIntakeScope(),generation=orderIntakeEditorGeneration,row=orderIntakeRecord?.row;
 const current=()=>generation===orderIntakeEditorGeneration&&orderIntakeCurrent(scope)&&orderIntakeRoute?.recordId===id;
 if(!current()||row?.id!==id)return;
 const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
 try{
  const directory=await client.recipientOptions(row);
  if(!current())return;
  openModal('Notification recipient',recipientFields(directory),async fd=>{
   if(!current())throw new Error('Order context changed.');
   await client.bindRecipient(row,fd.get('recipient'));
   if(current())toast('Notification recipient confirmed.');
  },{submitLabel:'Confirm recipient',successMessage:''});
  modal.dataset.oiEditor='true';
 }catch(error){if(current())notice(error);}
}
async function openOrderIntakeInbox(){
 const scope=orderIntakeScope(),generation=orderIntakeEditorGeneration;
 const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
 const current=()=>generation===orderIntakeEditorGeneration&&orderIntakeCurrent(scope);
 if(!current())return;
 openModal('Order Intake notifications','<div data-oi-inbox-host role="status">Loading notifications…</div>',async()=>{}, {submitDisabled:true,submitLabel:'Close',successMessage:''});
 const view=modal;view.dataset.oiEditor='true';
 view.querySelector('[type=submit]').hidden=true;
 const host=view.querySelector('[data-oi-inbox-host]');
 let rows=[],busy=false,hasMore=false;
 const active=()=>current()&&modal===view;
 async function load(more=false){
  if(!active()||busy)return;busy=true;
  try{
   const page=await client.notifications({offset:more?rows.length:0});
   if(!active())return;
   rows=more?[...rows,...page.rows.filter(row=>!rows.some(old=>old.id===row.id))]:page.rows;
   hasMore=page.hasMore;host.innerHTML=notificationInbox({rows,hasMore});
  }catch(error){if(active())host.textContent=errorMessage(error);}
  finally{busy=false;}
 }
 host.addEventListener('click',async event=>{
  if(!active()||busy)return;
  const button=event.target.closest('[data-oi-notification-read]');
  if(event.target.closest('[data-oi-inbox-more]')){void load(true);return;}
  if(!button)return;
  busy=true;button.disabled=true;
  try{
   const receipt=await client.markNotificationRead(button.dataset.oiNotificationRead);
   if(active()){rows=rows.map(row=>row.id===receipt.id?{...row,read_at:receipt.readAt}:row);host.innerHTML=notificationInbox({rows,hasMore});}
  }catch(error){if(active()){button.disabled=false;notice(error);}}
  finally{busy=false;}
 });
 await load();
}
function openOrderIntakeBulk(action){
 if(!orderIntakeTableReady())return;
 const scope=orderIntakeScope(),generation=orderIntakeEditorGeneration;
 const rows=orderIntakeMatching().filter(row=>orderIntakeTable.selected.has(row.id));
 if(!rows.length)return;
 const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
 const current=()=>generation===orderIntakeEditorGeneration&&orderIntakeCurrent(scope);
 let view;
 openModal('Bulk '+(action==='details'?'edit native details':action),bulkFields(action,rows),async fd=>{
  const values=Object.fromEntries(fd);
  validateBulkRequest(action,values);
  if(!orderIntakeTableReady())throw Error('Refresh the complete order list before starting a batch.');
  orderIntakeTable.busy=true;orderIntakeTable.results=[];render();
  try{
   const results=await runOrderBulk({client,rows,action,values,isCurrent:()=>current()&&modal===view,onProgress:results=>{
    if(current()&&modal===view)view.querySelector('[data-oi-bulk-progress]').textContent=results.length+' of '+rows.length+' processed';
   }});
   if(!current())return;
   orderIntakeTable.results=results;orderIntakeTable.selected.clear();
   if(orderIntakeRoute.section==='archived')orderIntakeRead.clear();else orderIntakeArchived.clear();
   await currentOrderIntakeRead().refresh(scope,true);
   if(orderIntakeRoute.recordId)await loadOrderIntakeRecord(orderIntakeRoute,scope);
   if(current())toast(results.filter(r=>r.state==='verified').length+' orders verified. Review bulk operation results.');
  }finally{if(current()){orderIntakeTable.busy=false;render();}}
 },{submitLabel:'Confirm batch',successMessage:''});
 view=modal;view.dataset.oiEditor='true';
}
function handleOrderIntakeTableAction(action){
 if(orderIntakeTable.busy)return;
 const matching=orderIntakeMatching(),page=orderTablePage(matching,orderIntakeTable.page);
 if(action==='prev-page'||action==='next-page'){orderIntakeTable.page=page.page+(action==='next-page'?1:-1);render();return;}
 if(action==='clear-selection'){orderIntakeTable.selected.clear();render();return;}
 if(!orderIntakeTableReady())return;
 if(action==='select-page'||action==='select-all'){
  for(const row of action==='select-page'?page.rows:matching)orderIntakeTable.selected.add(row.id);
  render();return;
 }
 if(action==='export'){
  const url=URL.createObjectURL(new Blob([orderExportCsv(matching)],{type:'text/csv;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download='order-intake-matching.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
 }
 if(action.startsWith('bulk-'))openOrderIntakeBulk(action.slice(5));
}
function openOrderIntakeConfirmation(){
 const scope=orderIntakeScope(),row=orderIntakeRecord?.row,generation=orderIntakeEditorGeneration;
 if(!row||!orderIntakeCurrent(scope)||orderIntakeTable.busy)return;
 const client=new OrderIntakeRegistryClient({auth,api:db,workspaceId:scope.split('|')[1]});
 let view,prepared;
 const current=()=>generation===orderIntakeEditorGeneration&&orderIntakeCurrent(scope)&&orderIntakeRoute?.recordId===row.id&&modal===view;
 openModal('Purchase order confirmation',confirmationFields(row),async()=>{
  if(!current())throw Error('Order context changed. Reopen the confirmation.');
  const form=view.querySelector('form'),doc=buildConfirmation(row,readConfirmationForm(form,row));
  const serialized=JSON.stringify(doc);
  if(prepared&&prepared.serialized!==serialized&&prepared.auditAttempted)throw Error('Previous PDF audit outcome may be uncertain. Retry unchanged fields or reopen the confirmation.');
  const latest=await client.detail(row.id,{includeArchived:true});
  if(!current()||latest.revision!==row.revision||latest.record_kind!==row.record_kind)throw Error('Order changed. Refresh the order and reopen the confirmation.');
  const engine=await import('./order-intake-confirmation-pdf.js');
  if(!prepared||prepared.serialized!==serialized){
   const logo=await engine.loadConfirmationLogo(doc.entity);
   const blob=await engine.createConfirmationPdf(doc,logo);
   prepared={serialized,blob,sha256:await engine.confirmationDigest(blob),id:crypto.randomUUID(),auditAttempted:false};
  }
  if(!current())throw Error('Order context changed.');
  prepared.auditAttempted=true;
  await client.recordConfirmation(doc,prepared.id,prepared.sha256);
  if(!current())return;
  const url=URL.createObjectURL(prepared.blob);
  const link=document.createElement('a');link.href=url;link.download=engine.confirmationFilename(doc);document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 },{submitLabel:'Generate and download PDF',successMessage:'Confirmation PDF generated; audit receipt verified.'});
 view=modal;view.dataset.oiEditor='true';view.querySelector('.modal')?.classList.add('oi-editor-modal');
 bindConfirmationForm(view.querySelector('form'),row);
}
let avatarHydrationPromise=Promise.resolve({attempted:0,loaded:0,failed:0,stale:0});
let ttClockTimer=null;
let ttClockSyncInFlight=false;
let ttClockLastCheckAt=0;
let ttClockSyncScope='';
const TT_CLOCK_CORRECTION_POLL_MS=45000;
const TT_CLOCK_FOCUS_MIN_MS=10000;
function stopTimeTrackerClock(){
 if(ttClockTimer!==null){clearInterval(ttClockTimer);ttClockTimer=null;}
}
let ttEmployeeDirectoryInFlight=false;
let ttEmployeeDirectoryLastCheck=0;
const TT_EMPLOYEE_DIRECTORY_POLL_MS=30000;
function timeTrackerEmployeeDirectoryRefreshReady(){
 return !document.hidden&&auth.isSignedIn&&navigator.onLine!==false&&
  state.view==='board'&&state.tab==='attendance'&&state.ttView==='employees'&&
  state.ttEmployeesTab==='directory'&&state.ttAttendance?.status==='VERIFIED_READ'&&
  canViewTimeTrackerEmployees(state.ttAttendance.access)&&!state.ttLogAdminBusy&&
  !state.ttLogAdminEditor&&!state.ttOjtBusy&&!platformSyncEditInProgress();
}
async function refreshTimeTrackerEmployeeDirectory({onFocus=false}={}){
 if(ttEmployeeDirectoryInFlight||!timeTrackerEmployeeDirectoryRefreshReady()||
    Date.now()-ttEmployeeDirectoryLastCheck<(onFocus?5000:TT_EMPLOYEE_DIRECTORY_POLL_MS))return;
 const before=state.ttAttendance,route=routeSerial,run=state.ttRunId,boardId=state.boardId,
  actor=state.context?.user_id,workspace=state.context?.workspace_id;
 ttEmployeeDirectoryInFlight=true;ttEmployeeDirectoryLastCheck=Date.now();
 try{
  const fresh=await timeTracker.employeeDirectory(boardId);
  if(!timeTrackerEmployeeDirectoryRefreshReady()||state.ttAttendance!==before||
     route!==routeSerial||run!==state.ttRunId||state.boardId!==boardId||
     actor!==state.context?.user_id||workspace!==state.context?.workspace_id||
     fresh.userId!==actor||fresh.workspaceId!==workspace||fresh.boardId!==boardId||
     fresh.moduleRole!==before.access.moduleRole)return;
  if(JSON.stringify(fresh.employees)===JSON.stringify(before.access.employees)&&
     JSON.stringify(fresh.departmentCatalog)===JSON.stringify(before.access.departmentCatalog)&&
     JSON.stringify(fresh.overviewDirectory)===JSON.stringify(before.access.overviewDirectory))return;
  state.ttAttendance={...before,access:{...before.access,employees:fresh.employees,
   departmentCatalog:fresh.departmentCatalog,overviewDirectory:fresh.overviewDirectory}};
  render();
 }catch{/* Retain the last verified view on transient failure; writes reauthorize independently. */}
 finally{ttEmployeeDirectoryInFlight=false;}
}
setInterval(()=>{void refreshTimeTrackerEmployeeDirectory();},TT_EMPLOYEE_DIRECTORY_POLL_MS);
function maintainTimeTrackerClock(){
 const mounted=state.view==='board'&&state.tab==='attendance'&&
  state.ttAttendance?.status==='VERIFIED_READ'&&
  (state.ttView==='clock'&&root.querySelector('#tt-clock-hours')||
   state.ttView==='overview'&&root.querySelector('#tt-overview-time'));
 if(!mounted){stopTimeTrackerClock();return;}
 const scope=[state.context?.workspace_id,state.context?.user_id,state.boardId].join(':');
 if(scope!==ttClockSyncScope){
  ttClockSyncScope=scope;ttClockLastCheckAt=Date.now();
 }
 const tick=()=>{
  if(state.ttView==='clock')syncTimeTrackerClock(root);
  else if(state.ttView==='overview')syncTimeTrackerOverviewClock(root);
 };
 tick();
 if(ttClockTimer===null)ttClockTimer=setInterval(()=>{
  if(!document.hidden)tick();
  if(!document.hidden&&state.ttView==='clock')void refreshCorrectedTimeTrackerClock();
 },1000);
}
/** A periodic signed read reconciles administrator corrections made in another browser.
 * No local attendance mutation, automatic write, or trust in other tabs.
 * Poll both idle and active regular Clock screens; never poll hidden views.
 */
async function refreshCorrectedTimeTrackerClock({onFocus=false}={}){
 const before=state.ttAttendance;
 if(ttClockSyncInFlight||document.hidden||!auth.isSignedIn||
   state.view!=='board'||state.tab!=='attendance'||state.ttView!=='clock'||
   before?.status!=='VERIFIED_READ'||state.ttBusy||state.ttLogAdminBusy||navigator.onLine===false||
   ['SHARED_LOGIN','SHARED_DISABLED','SERVICE_UNAVAILABLE','SETUP_REQUIRED'].includes(before.ojtRoster?.mode))return;
 const now=Date.now();
 if(now-ttClockLastCheckAt<(onFocus?TT_CLOCK_FOCUS_MIN_MS:TT_CLOCK_CORRECTION_POLL_MS))return;
 ttClockLastCheckAt=now;
 ttClockSyncInFlight=true;
 const route=routeSerial,run=state.ttRunId,boardId=state.boardId,
  actor=state.context?.user_id,workspace=state.context?.workspace_id;
 try{
  const fresh=await timeTracker.snapshot(boardId,{clockOnly:true});
  if(route!==routeSerial||run!==state.ttRunId||document.hidden||!auth.isSignedIn||
     state.view!=='board'||state.tab!=='attendance'||state.ttView!=='clock'||
     state.ttBusy||state.boardId!==boardId||
     state.context?.user_id!==actor||state.context?.workspace_id!==workspace||
     fresh?.status!=='VERIFIED_READ'||fresh.access?.userId!==actor||
     fresh.access?.workspaceId!==workspace||fresh.access?.boardId!==boardId||
     Number(fresh.revision)<=Number(state.ttAttendance?.revision))return;
  const previous=state.ttAttendance;
  const sessionChanged=previous.active?.id!==fresh.active?.id;
  const changed=sessionChanged||
   previous.active?.clockIn!==fresh.active?.clockIn||
   previous.active?.location!==fresh.active?.location||
   previous.active?.department!==fresh.active?.department||
   previous.active?.workNote!==fresh.active?.workNote||
   previous.records.length!==fresh.records.length||
   previous.records.some((record,index)=>{
    const next=fresh.records[index];
    return !next||record.id!==next.id||record.clockIn!==next.clockIn||
      record.clockOut!==next.clockOut||record.status!==next.status||
      record.creditedMs!==next.creditedMs||record.location!==next.location||
      record.department!==next.department||record.workNote!==next.workNote;
   })||previous.autoClockout?.status!==fresh.autoClockout?.status||
   previous.autoClockout?.nextAt!==fresh.autoClockout?.nextAt||
   previous.autoClockout?.cutoffAt!==fresh.autoClockout?.cutoffAt||
   previous.autoClockoutUnavailable!==fresh.autoClockoutUnavailable;
  state.ttAttendance=fresh;
  const reconciled=state.ttClockPending&&reconcileTimeTrackerClock(fresh)==='CONFIRMED';
  if(sessionChanged||reconciled){
   // A signed session start/end changes the action form itself. Reconcile
   // locally with current signed capabilities and retained work-plan draft.
   state.ttClockStage='idle';state.ttGeoPromptVisible=false;
   state.ttGeoMessage='';state.ttGeoPermission='unknown';
   if(!state.ttClockPending){
    state.ttError='';
    if(!reconciled)state.ttSuccess=fresh.active?
     'Active attendance synchronized from the server.':
     'Attendance closed on the server. You can start a new session.';
   }
  }
  if(sessionChanged||reconciled||(changed&&!state.ttClockPending)){
   syncTimeTrackerClockView(root,{
    result:fresh,now:new Date(),clockPending:!!state.ttClockPending,
    forceReconcile:sessionChanged||!!reconciled,clearError:!state.ttError,
    displayName:name(),referenceShell:state.ttStandalone===true,
    gpsDiagnosticsAvailable:getTimeTrackerGpsDiagnostics().events.length>0,
    clockPendingAction:state.ttClockPending?.action||'clock-out',
    locationPreference:readTimeTrackerLocationPreference(
     typeof localStorage==='undefined'?null:localStorage,
     {userId:actor,workspaceId:workspace}
    ),
    workPlanDraft:ttWorkNoteDraft.read(timeTrackerWorkNoteScope()),
    success:state.ttSuccess,clockCorrectionNotice:state.ttClockCorrectionNotice,
    geoPromptVisible:state.ttGeoPromptVisible,geoPermission:state.ttGeoPermission,
    geoMessage:state.ttGeoMessage,clockStage:state.ttClockStage
   });
  }
 }catch{
  // Keep the previous signed view on transient read failures. Never guess
  // corrected attendance timestamps or replay a Clock mutation.
 }finally{ttClockSyncInFlight=false;}
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
function renderLogin(message='',{mode=authViewFromHash(),notice='',emailValue=''}={}){
 stopTimeTrackerClock();
 stopTimeTrackerPixi();
 // Clear detached protected item values on every signed-out transition.
 hideModal();
 if(mode==='login'&&!emailValue)emailValue=mobileAccountEmail;
 ttClockSyncScope='';ttClockLastCheckAt=0;
 state.ttClockCorrectionNotice='';
 stopAvatarPreview();
 syncFuelTrans({container:null});
 stopAuthVisuals();
 stopSidebarSelection();
 sidebarMobileOpen=false;sidebarManualCollapsed=false;timeTrackerSubmenuOpen=true;
 stopOverviewMotion();
 stopBoardCatalogMotion();
 stopFoundationMotion();
 stopSecurityMotion();
 stopRoleConfigurationMotion();
 stopUserRoleMotion();
 stopSettingsMotion();
 stopPagesAcceptanceMotion();
 syncDda();
 const formsubmitReturn=mode==='register'&&new URLSearchParams(location.search).get('request_access')==='received';
 root.innerHTML=renderAuthMarkup({message,emailValue,notice:notice||(formsubmitReturn?
  'Returned from FormSubmit. If the provider confirmed success, the request was sent for administrator review. No account has been created.':''),mode,resetReady:mode==='reset'&&!!recoveryContext,invitationPending:pendingInvitation?.status==='ready'});
 if(state.tl03RevokedReport&&!auth.isSignedIn)
  root.insertAdjacentHTML('beforeend',renderTradeLinkSignedOutRevocationResult(state.tl03RevokedReport));
 authVisualController=mountAuthExperience(root.querySelector('.aps-auth-v2'));
}

/** Visual-only route links. Permission-aware inclusion stays server-derived. */
function sidebarNav(href,label,icon,active,{count=null,application=false}={}){
 const selected=active?' aria-current="page"':'';
 const badge=count!==null?'<span class="nav-count">'+e(count)+'</span>':'';
 return '<a class="nav-link '+(active?'active':'')+'" href="'+e(href)+'" '+
  'title="'+e(label)+'" aria-label="'+e(label)+'"'+selected+
  (application?' data-global-search-application="true"':'')+'>'+
  '<span class="nav-ico">'+sidebarIcon(icon)+'</span>'+
  '<span class="nav-label">'+e(label)+'</span>'+badge+'</a>';
}
// Session-local navigation presentation. No permissions or routes are changed.
let sidebarManualCollapsed=false;
let sidebarMobileOpen=false;
let timeTrackerSubmenuOpen=true;
function syncSidebarLayout(){
 const shellElement=root.querySelector(':scope > .shell');
 if(!shellElement)return;
 shellElement.classList.toggle('sidebar-user-collapsed',sidebarManualCollapsed);
 shellElement.classList.toggle('sidebar-mobile-open',sidebarMobileOpen);
 const toggle=shellElement.querySelector('.sidebar-layout-toggle');
 if(toggle){
  const mobile=window.matchMedia('(max-width:810px)').matches;
  const expanded=mobile?sidebarMobileOpen:!sidebarManualCollapsed;
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.setAttribute('aria-label',expanded?'Collapse navigation':'Expand navigation');
  toggle.setAttribute('title',expanded?'Collapse navigation':'Expand navigation');
 }
 syncTimeTrackerSidebar(shellElement,{enabled:state.ttStandalone===true&&state.ttAttendance?.status==='VERIFIED_READ',
  expanded:!window.matchMedia('(max-width:820px)').matches&&!sidebarManualCollapsed,
  submenuOpen:timeTrackerSubmenuOpen});
}
/** Canonical navigation selection shared by initial render and cached-shell updates. */
function currentSidebarNavigation(){
 const recentBoardIds=state.boards.filter(board=>!isStandaloneApplicationBoard(board))
  .map(board=>board.id);
 return sidebarActiveRoute(location.hash,{
  tradelinkBoardId:TRADELINK_BOARD_ID,fundTrackerBoardId:FRT_BOARD_ID,
  fueltrackBoardId:FUELTRACK_V3_ID,
  timeTrackerBoardId:findTimeTrackerAttendanceBoard(state.boards,moduleByBoardName)?.id,
  recentBoardIds
 });
}
// Keep the latest manual/native readback authoritative. Older responses must not
// replace a newer booking snapshot after refresh, navigation, or sign-out.
let paseoReadRunId=0;
async function loadPaseoManagement(cursor=null){
 const actor=auth.userId;
 if(!actor||!state.context||state.view!=='paseo')return;
 const runId=++paseoReadRunId;
 const current=()=>runId===paseoReadRunId&&auth.userId===actor&&
   state.context?.user_id===actor&&state.view==='paseo';
 if(!cursor)state.paseoManagement={status:'LOADING'};
 else state.paseoManagement={...state.paseoManagement,loadingMore:true};
 render();
 try{
  const token=await auth.token();
  if(!current())return;
  const {readPaseoManagement}=await import('./apps/Paseo/native-admin.js');
  if(!current())return;
  const result=await readPaseoManagement(token,{cursor});
  if(current()){
   state.paseoManagement=cursor&&result.status==='VERIFIED'&&state.paseoManagement?.status==='VERIFIED'
    ? {...result,reservations:[...state.paseoManagement.reservations,...result.reservations]}
    : result;
   render();
  }
 }catch(error){
  if(current()){
   state.paseoManagement={status:'UNAVAILABLE',message:errorMessage(error)};
   render();
  }
 }
}

function renderPaseoNative(){
 const current=state.paseoManagement||{status:'LOADING'};
 if(current.status==='LOADING')return sharedApplicationLoading();
 const verified=current.status==='VERIFIED';
 const heading=verified?'Booking overview':current.status==='DENIED'?'Administrator access unavailable':'Booking overview';
 const summary=verified?`<section class="pdl-crm-summary" aria-label="Signed booking administration">
   <div class="pdl-crm-summary-head">
    <div><p class="pdl-crm-eyebrow">CURRENT ACTIVITY</p><h2>${heading}</h2></div>
    <span class="pdl-crm-status"><span aria-hidden="true"></span>Up to date</span>
   </div>
   <div class="pdl-crm-metrics">
    <div class="pdl-crm-metric"><span>Courts enabled</span>
     <strong>${current.enabledCourtCount}<small> / ${current.courtCount}</small></strong></div>
    <div class="pdl-crm-metric"><span>Recent reservations</span>
     <strong>${current.reservations.length}</strong></div>
   </div>
   <div class="pdl-crm-records">
    <h3>Latest reservations</h3>
    ${current.reservations.length?`<ul>${current.reservations.map(record=>
     `<li><span class="pdl-crm-record-name">${e(record.name)}</span>
     <span class="pdl-crm-record-meta">${e(record.id)} · ${e(record.bookingStatus)} · ${e(record.paymentStatus)}</span></li>`
    ).join('')}</ul>`:'<p class="pdl-crm-empty">No reservations to display yet.</p>'}
    ${current.nextCursor?`<button type="button" class="pdl-crm-button pdl-crm-button-secondary" data-action="pdl-more"
      ${current.loadingMore?'disabled':''}>${current.loadingMore?'Loading more…':'Load more reservations'}</button>`:''}
   </div>
  </section>`:current.status==='DENIED'?
  '<section class="pdl-crm-summary pdl-crm-notice" role="status"><h2>Administrator access unavailable</h2><p>This CRM account is not assigned to manage Paseo bookings. Public booking remains available.</p></section>':
  current.status==='UNAVAILABLE'?
  '<section class="pdl-crm-summary pdl-crm-notice" role="alert"><h2>Bookings could not be loaded</h2><p>Try refreshing your booking overview. Existing records have not been changed.</p></section>':
  '<section class="pdl-crm-summary pdl-crm-loading" role="status" aria-busy="true" aria-label="Loading booking overview"><div class="pdl-crm-skeleton pdl-crm-skeleton-heading"></div><div class="pdl-crm-metrics"><div class="pdl-crm-skeleton pdl-crm-skeleton-metric"></div><div class="pdl-crm-skeleton pdl-crm-skeleton-metric"></div></div></section>';
 return `<section class="section pdl-crm-portal" aria-labelledby="pdl-native-title">
  <header class="pdl-crm-hero">
   <div><p class="pdl-crm-eyebrow">NATIVE APPLICATION / COURT MANAGEMENT</p>
    <h1 id="pdl-native-title">Paseo de Lomboy</h1>
    <p>Pickleball bookings, court availability and daily operations in one place.</p>
   </div>
   <span class="pdl-crm-hero-mark" aria-hidden="true">${sidebarIcon('paseo')}</span>
  </header>
  <div class="pdl-crm-actions" aria-label="Booking destinations">
   <section class="pdl-crm-action">
    <div class="pdl-crm-action-symbol" aria-hidden="true">${sidebarIcon('paseo')}</div>
    <div class="pdl-crm-action-copy"><p class="pdl-crm-eyebrow">FOR PLAYERS</p>
     <h2>Public booking</h2>
     <p>Explore available courts and start a reservation. No CRM account is needed.</p></div>
    <a class="pdl-crm-button pdl-crm-button-primary" href="./paseo/">Open public booking
     <span aria-hidden="true">↗</span></a>
   </section>
   <section class="pdl-crm-action">
    <div class="pdl-crm-action-symbol" aria-hidden="true">${sidebarIcon('settings')}</div>
    <div class="pdl-crm-action-copy"><p class="pdl-crm-eyebrow">FOR STAFF</p>
     <h2>Booking administration</h2>
     <p>Manage court settings, reservations and payment reviews.</p></div>
    <div class="pdl-crm-action-buttons">
     <a class="pdl-crm-button pdl-crm-button-primary" href="./paseo/admin/sign-in">Open administration
      <span aria-hidden="true">↗</span></a>
     <button class="pdl-crm-button pdl-crm-button-secondary" type="button" data-action="pdl-refresh">Refresh booking records</button>
    </div>
   </section>
  </div>
  ${summary}
 </section>`;
}

function sidebar(){
 const engineeringUi=showEngineeringDiagnostics(location.search,state.roleVerified===true);
 const recent=state.boards.filter(board=>!isStandaloneApplicationBoard(board));
 const selectedNav=currentSidebarNavigation();
 const active=key=>selectedNav===key;
 const applications=state.workspaceTransitionPending?[]:
  workspaceApplicationsForNavigation(state.context?.workspace_id,state.boards);
 const applicationNav=applications.map(application=>sidebarNav(
  application.href,application.label,application.icon,
  active(application.navigationKey),{application:true}
 )).join('');
 const applicationSection=applications.length?
  '<div class="side-section sidebar-nav-section">Applications</div>'+applicationNav:'';
 const nav=sidebarNav('#/overview','Overview','overview',active('overview'))+
  sidebarNav('#/boards','My boards','boards',active('boards'),{count:state.boards.filter(board=>!isStandaloneApplicationBoard(board)).length})+
  applicationSection+
  (engineeringUi?sidebarNav('#/foundation','12-board foundation','foundation',active('foundation')):'')+
  (engineeringUi?sidebarNav('#/security','Access acceptance','security',active('security')):'')+
  (state.adminVerified===true?'<div class="side-section sidebar-nav-section">Administration</div>'+
   sidebarNav('#/role-configuration','Role Configuration','roles',active('role-configuration')):'')+
   sidebarNav('#/user-role-management','Teams','users',active('user-role-management'))+
  '<div class="side-section sidebar-nav-section">Account</div>'+
  sidebarNav('#/settings','Settings','settings',active('settings'))+
  (engineeringUi?sidebarNav('#/acceptance','Pages acceptance','acceptance',active('acceptance')):'');
 return `<aside class="sidebar aps-sidebar" aria-label="Workspace sidebar">
  <div class="sidebar-brand-wrap">
   <a href="#/overview" class="brand" aria-label="APSYNTRA CRM — Go to overview" title="Go to overview">
    <img class="brand-mark" src="./frontend/apsyntra-logo.webp" alt="" width="37" height="37" decoding="async"/>
    <span class="brand-text">APSYNTRA <span class="csp-u043">CRM</span></span>
   </a>
   <span class="sidebar-brand-subtitle" aria-hidden="true">WORKSPACE OPERATIONS</span>
   <button type="button" class="sidebar-layout-toggle" data-action="sidebar-toggle"
    aria-label="Expand navigation" title="Expand navigation" aria-expanded="false"
    aria-controls="sidebar-navigation-content"><span aria-hidden="true" class="sidebar-layout-toggle-glyph">${sidebarIcon('chevron')}</span></button>
  </div>
  `+renderWorkspaceSwitcher({id:state.context?.workspace_id,name:workspaceName()})+`
  <div class="ws01-context-relation" role="status">`+e(workspaceRelationLabel(state.workspaceRelationSnapshot,state.context))+`</div>

  <div class="sidebar-nav-scroll" id="sidebar-navigation-content">
   <div class="side-section sidebar-nav-section">Workspace</div>
   <nav class="nav-list" aria-label="Primary">`+nav+`</nav>
   <div class="side-section sidebar-recent-heading">Boards
    <span class="sidebar-recent-count" aria-hidden="true">`+recent.length+`</span>
   </div>
   <nav class="nav-list sidebar-recent-list" aria-label="Boards">`+
    (recent.map((b,i)=>{
     const title=String(b.name||'Untitled board');
     const active=selectedNav==='recent:'+b.id;
     const tone=['violet','teal','amber','rose','blue','indigo'][i%6];
     return '<a class="nav-link sidebar-recent-link '+(active?'active':'')+
      '" href="#/boards/'+e(b.id)+'" title="'+e(title)+'" aria-label="'+e(title)+'"'+
      (active?' aria-current="page"':'')+'>'+
      '<span class="sidebar-board-initial sidebar-tone-'+tone+'" aria-hidden="true">'+
      e(title.slice(0,1).toUpperCase())+'</span>'+
      '<span class="nav-label">'+e(title)+'</span></a>';
    }).join('')||(state.boardCatalogError?'<div class="sidebar-empty-recent">Board catalog unavailable</div>':'<div class="sidebar-empty-recent">No boards yet</div>'))+`</nav>
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
let boardItemFilterScope='';
let shellIdentity=null;
let shellSidebarSignature=null;
let shellRoute=null;
function shell(body){
 stopAuthVisuals();
 const crumb=applicationRouteRead?.label||(state.ttStandalone?'TimeTracker':state.frtStandalone?'Fund Tracker':state.tlStandalone?'TradeLink':state.fuelTrackStandalone?'FuelTrack+':state.fuelTransStandalone?'FuelTrans Support Portal':state.view==='paseo'?'Paseo de Lomboy':state.view==='order-intake'?'Order Intake':state.view===DDA_ROUTE_SECTION?DDA_APPLICATION.label:currentSidebarNavigation()==='talkbox'?'TalkBox':state.view==='board'?state.board?.board?.name||'Board':state.view==='overview'?'Overview':state.view==='boards'?'My boards':state.view==='fm1'?'FM1 Ticketing':state.view==='acceptance'?'Pages acceptance':state.view==='foundation'?'12-board foundation':state.view==='security'?'Access acceptance':state.view==='role-configuration'?'Role Configuration':state.view==='user-role-management'?'Teams':state.view==='invitation'?'Workspace invitation':'Settings');
 const identity=[state.context?.user_id,state.context?.workspace_id].join('|');
 const sidebarSignature=JSON.stringify([state.workspaceTransitionPending,state.roleVerified,state.adminVerified,state.boardCatalogError,name(),
  state.context?.profile?.platform_role,state.crmRoleSnapshot?.effectiveRole,
  state.workspaceRelationSnapshot?.relation,workspaceName(),
  state.boards.filter(board=>!isStandaloneApplicationBoard(board)).map(board=>[board.id,board.name]),
  state.boards.map(board=>[board.id,board.name])]);
 const route=[state.view,state.boardId,state.tab,state.ttStandalone,state.frtStandalone,state.tlStandalone,state.fuelTrackStandalone,state.fuelTransStandalone].join('|');
 // Preserve each group's horizontal position only across same-signed-view renders.
 const scrollPositions=state.view==='board'&&shellIdentity===identity&&shellRoute===route?
  captureBoardGroupScroll(root.querySelector(':scope > .shell .main-content')):null;
 disposeTimeTrackerMaps();
 const existing=root.querySelector(':scope > .shell');
 const reusable=existing&&shellIdentity===identity;
 const preserveDda=body===DDA_HOST_MARKUP&&reusable&&shellRoute===route&&
  auth.isSignedIn&&state.context?.user_id===auth.userId&&!state.workspaceTransitionPending&&
  !!existing.querySelector('#dda-native-host');
 if(!preserveDda)syncDda();
 if(shellIdentity!==identity){closeWorkspacePanels();timeTrackerSubmenuOpen=true;}
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
   const selected=currentSidebarNavigation();
   const activeHref=selected.startsWith('recent:')?'#/boards/'+selected.slice(7):
    selected?'#/'+selected:'';
   for(const link of existing.querySelectorAll('.aps-sidebar a.nav-link')){
    const path=link.getAttribute('href')||'';
    const active=!!activeHref&&path===activeHref;
    link.classList.toggle('active',active);
    if(active)link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
   }
  }
  existing.querySelector('.breadcrumb strong').textContent=crumb;
  existing.querySelector('.top-avatar').innerHTML='<span data-avatar-initials aria-hidden="true">'+e(initials(name()))+'</span><img data-avatar-current alt="" hidden />';
  if(!preserveDda)existing.querySelector('.main-content').innerHTML=body;
  if(scrollPositions)restoreBoardGroupScroll(existing.querySelector('.main-content'),scrollPositions);
 }else{
  root.innerHTML=`<div class="shell">${sidebar()}<main class="main">
 <header class="topbar"><div class="breadcrumb"><span>Workspace</span><span>›</span><strong>${e(crumb)}</strong></div><button type="button" class="ws01-topbar-launch" data-action="ws01-open" aria-label="Browse authorized workspaces">Workspaces ▾</button>
 <div class="top-actions"><button type="button" class="aps-global-search-trigger" data-global-search-open aria-haspopup="dialog" aria-expanded="false" aria-label="Search APSYNTRA CRM"><span class="aps-global-search-trigger-icon" aria-hidden="true">⌕</span><span class="aps-global-search-trigger-label">Search</span><kbd data-global-search-key>⌘ K</kbd></button>${renderWorkspaceInviteLaunch({id:state.context?.workspace_id,name:workspaceName()},{placement:'topbar'})}<span class="top-pill"><span class="online-dot"></span> Secure session</span><button type="button" class="aps-sync" data-action="platform-sync-verify" data-sync-state="connecting" aria-label="Checking synchronization status" title="Checking signed workspace updates"><span class="aps-sync-orbit" aria-hidden="true"></span><span class="aps-sync-caption">Connecting</span></button><button type="button" class="secondary topbar-signout" data-action="logout" aria-label="Sign out of APSYNTRA CRM" title="Sign out of APSYNTRA CRM">Sign out</button><a href="#/settings" class="avatar top-avatar" title="Account settings"><span data-avatar-initials aria-hidden="true">${e(initials(name()))}</span><img data-avatar-current alt="" hidden /></a></div></header>
 <div class="main-content">${body}</div></main></div>`;
 }
 // Discard previously mounted tabs before relocating the freshly rendered, signed tab set.
 const shellElement=root.querySelector(':scope > .shell');
 if(shellElement)syncTimeTrackerSidebar(shellElement,{enabled:state.ttStandalone===true&&state.ttAttendance?.status==='VERIFIED_READ',fresh:true});
 syncSidebarLayout();
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
 root.querySelector('.main')?.classList.toggle('aps-time-tracker-shell',state.ttStandalone===true);
  root.querySelector('.main')?.classList.toggle('aps-fund-tracker-shell',state.frtStandalone===true||
   (state.view==='board'&&state.boardId===FRT_BOARD_ID&&state.tab==='finance'));
 root.querySelector('.main')?.classList.toggle('aps-tradelink-shell',state.tlStandalone===true);
 root.querySelector('.main')?.classList.toggle('aps-fueltrack-shell',state.fuelTrackStandalone===true);
 root.querySelector('.main')?.classList.toggle('aps-fueltrans-shell',state.fuelTransStandalone===true);
 root.querySelector('.main')?.classList.toggle('aps-order-intake-shell',state.view==='order-intake');
 root.querySelector('.main')?.classList.toggle('aps-dda-shell',state.view===DDA_ROUTE_SECTION);
 root.querySelector('.main')?.classList.toggle('aps-overview-shell',state.view==='overview');
 root.querySelector('.main')?.classList.toggle('aps-fm1-shell',state.view==='fm1');
 root.querySelector('.main')?.classList.toggle('aps-talkbox-shell',state.view==='talkbox');
 root.querySelector('.main')?.classList.toggle('aps-boards-shell',state.view==='boards');
 root.querySelector('.main')?.classList.toggle('aps-foundation-shell',state.view==='foundation');
 root.querySelector('.main')?.classList.toggle('aps-security-shell',state.view==='security');
 root.querySelector('.main')?.classList.toggle('aps-role-config-shell',state.view==='role-configuration');
 root.querySelector('.main')?.classList.toggle('aps-user-roles-shell',state.view==='user-role-management');
 root.querySelector('.main')?.classList.toggle('aps-settings-shell',state.view==='settings');
 root.querySelector('.main')?.classList.toggle('aps-pages-shell',state.view==='acceptance');
 animateSidebarSelection(root.querySelector('.aps-sidebar'),currentSidebarNavigation());
 mountOverviewMotion(root.querySelector('.aps-overview'),state.view);
 mountBoardCatalogMotion(root.querySelector('.aps-boards'),state.view);
 mountFoundationMotion(root.querySelector('.aps-foundation'),state.view);
 mountSecurityMotion(root.querySelector('.aps-security'),state.view);
 mountRoleConfigurationMotion(root.querySelector('.aps-role-configuration'),state.view);
 mountUserRoleMotion(root.querySelector('.aps-user-role-management'),state.view);
 mountSettingsMotion(root.querySelector('.aps-settings'),state.view);
 mountPagesAcceptanceMotion(root.querySelector('.aps-pages-acceptance'),state.view);
 maintainTimeTrackerClock();
 if(state.ttStandalone)stopTimeTrackerPixi();
 else mountTimeTrackerPixi(root);
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
      '<button type="button" data-action="board-card-restore" data-id="'+e(board.id)+'">Restore board</button>'+
      '<button type="button" class="board-card-danger" data-action="board-card-permanent-delete" data-id="'+e(board.id)+'">Delete permanently</button>':
      '<button type="button" data-action="board-card-edit" data-id="'+e(board.id)+'">Edit board</button>'+
      (board.status==='archived'?'<button type="button" data-action="board-card-restore" data-id="'+e(board.id)+'">Restore board</button>':'')+
      '<button type="button" class="board-card-danger" data-action="board-card-trash" data-id="'+e(board.id)+'">Move to Trash</button>'):
   '<p class="board-card-actions-info">'+
    e(status==='PROTECTED'?'Application-managed board. Editing and deletion are protected.':
      'Only authorized board managers can edit or delete this board.')+'</p>')+
  '</div></details>':
  '<span class="board-menu" aria-label="Board management not yet activated">···</span>';
 return '<article class="board-card" data-searchable="'+e((board.name+' '+(board.description||'')).toLowerCase())+'">'+
  '<div class="board-card-top">'+(board.status==='trashed'&&status==='MANAGE'?
   '<label class="board-trash-select"><input type="checkbox" id="trash-board-select-'+e(board.id)+'" name="trash-board-select-'+e(board.id)+'" data-trash-board-select="'+e(board.id)+'" '+
    (trashBoardSelection.has(board.id)?'checked ':'')+(state.boardLifecycleBusy?'disabled ':'')+
    'aria-label="Select '+e(board.name)+' for permanent deletion"/><span>Select</span></label>':'')+
   '<span class="board-symbol '+iconColor(index)+'" aria-hidden="true">'+
   e((board.name||'B').slice(0,1).toUpperCase())+'</span>'+options+'</div>'+
  '<a class="board-card-main" href="'+href+'" aria-label="Open '+e(board.name||'Untitled board')+'"><h3>'+e(board.name||'Untitled board')+'</h3>'+
  '<p>'+e(publicBoardDescription(board))+'</p>'+
  '<div class="board-card-footer"><span>▤ '+(Number(board.item_count)||0)+' items</span>'+
  '<span>'+e(displayDate(board.updated_at))+'</span></div></a></article>';
}
function empty(title,description,action=''){
 return `<div class="empty"><span class="empty-icon">▦</span><h3>${e(title)}</h3><p>${e(description)}</p>${action}</div>`;
}
function overviewBoardPreview(boards,limit=6){
 const source=(Array.isArray(boards)?boards:[])
  .filter(board=>!isStandaloneApplicationBoard(board));
 const size=Math.max(0,Number.isSafeInteger(limit)?limit:6);
 return size?source.slice(0,size):[];
}
function overview(){
 const visibleBoards=state.boards.filter(board=>!isStandaloneApplicationBoard(board));
 const total=visibleBoards.reduce((a,b)=>a+(Number(b.item_count)||0),0);
 const recent=overviewBoardPreview(visibleBoards);
 const countLabel=value=>Number(value).toLocaleString('en-US');
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
 ` +(state.boardCatalogError?'<div class="panel boards-empty-state" role="alert"><strong>Board catalog temporarily unavailable</strong><p>'+e(state.boardCatalogError)+'</p><p>Native applications remain available. Retry workspace refresh to restore generic board discovery.</p><button type="button" class="secondary" data-action="refresh">Retry workspace refresh</button></div>':'')+ `
 <section class="stat-grid overview-stat-grid overview-entrance" aria-label="Workspace statistics">
  <div class="stat-card" role="group" aria-label="Active boards: `+countLabel(visibleBoards.length)+`">
   <span class="stat-icon">`+overviewIcon('grid')+`</span>
   <div class="stat-label">Active boards</div>
   <div class="stat-value">`+countLabel(visibleBoards.length)+`</div>
   <div class="stat-footer">Available to your account</div>
  </div>
  <div class="stat-card" role="group" aria-label="Board items: `+countLabel(total)+`">
   <span class="stat-icon green">`+overviewIcon('items')+`</span>
   <div class="stat-label">Board items</div>
   <div class="stat-value">`+countLabel(total)+`</div>
   <div class="stat-footer">Across your active boards</div>
  </div>
  <div class="stat-card" role="group" aria-label="Workspace status">
   <span class="stat-icon orange">`+overviewIcon('pulse')+`</span>
   <div class="stat-label">Workspace status</div>
   <div class="stat-value csp-u042">Active</div>
   <div class="stat-footer">Access context verified</div>
  </div>
  <div class="stat-card" role="group" aria-label="Your access">
   <span class="stat-icon pink">`+overviewIcon('shield')+`</span>
   <div class="stat-label">Your access</div>
   <div class="stat-value csp-u041" title="Verified CRM tier in the active workspace">`+e(signedCrmRoleLabel(state.crmRoleSnapshot,state.context))+`</div>
   <div class="stat-footer">`+e(workspaceRelationLabel(state.workspaceRelationSnapshot,state.context))+` · `+e(signedCrmIdentityLabel(state.context))+`</div>
  </div>
 </section>
 <section class="overview-board-section" aria-labelledby="overview-boards-title">
 <div class="section-header overview-section-heading overview-entrance">
  <div class="overview-heading-copy"><span class="overview-section-eyebrow">YOUR WORKSPACE</span><h2 id="overview-boards-title" class="section-title">Your boards</h2><p class="overview-board-count">Showing `+recent.length+` of `+countLabel(visibleBoards.length)+` available boards</p></div>
  <a class="inline-link" href="#/boards"><span>View all boards</span>`+overviewIcon('arrow')+`</a>
 </div>
 `+(recent.length?
  '<div class="card-grid overview-board-grid overview-entrance">'+recent.map(boardCard).join('')+'</div>':
  '<div class="panel overview-empty">'+empty('Start with your first board',
   'Create a board to organize tasks and updates.',
   '<button class="primary" data-action="new-board">＋ Create board</button>')+'</div>')+'</section>'+(state.roleVerified===true?`
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
    <p class="board-search-result" id="board-search-result" role="status" aria-live="polite" aria-atomic="true">`+boardCatalogResultLabel(items.length,{query:state.boardSearch,status:selectedStatus})+`</p>
    <span class="boards-selected-filter" aria-hidden="true">`+e(selectedStatus)+` boards</span>
   </div>
   `+(state.showTrash?'<div class="boards-trash-bulk" role="region" aria-label="Trash bulk actions">'+
    '<span id="boards-trash-selected" role="status" aria-live="polite">'+trashBoardSelection.size+' selected</span>'+
    '<button type="button" class="secondary" data-action="trash-board-select-visible" '+(state.boardLifecycleBusy?'disabled':'')+'>Select visible</button>'+
    '<button type="button" class="secondary" data-action="trash-board-clear-selection" '+(!trashBoardSelection.size||state.boardLifecycleBusy?'disabled':'')+'>Clear selection</button>'+
    '<button type="button" class="board-modal-danger" data-action="trash-board-bulk-permanent-delete" '+(!trashBoardSelection.size||state.boardLifecycleBusy?'disabled':'')+'>Delete selected permanently</button>'+
    '</div>':'')+`
  </section>
  <p id="board-search-no-results" class="board-search-no-results" hidden>No boards match this search.</p>
  `+(items.length?
   '<div class="card-grid boards-catalog-grid boards-entrance" id="boards-catalog-grid">'+items.map(boardCard).join('')+'</div>':
   (state.boardCatalogError?
    '<div class="panel boards-empty-state" id="boards-catalog-grid" role="alert"><strong>Board catalog temporarily unavailable</strong><p>'+e(state.boardCatalogError)+'</p><p>Native applications remain available. Retry workspace refresh to restore the generic board catalog.</p><button type="button" class="secondary" data-action="refresh">Retry workspace refresh</button></div>':
    '<div class="panel boards-empty-state" id="boards-catalog-grid">'+
    empty(state.boardSearch?'No matching boards':state.showTrash?'Trash is empty':state.showArchived?'No archived boards':'No boards available',
     state.boardSearch?'Try another search term or clear the search.':state.showTrash?'Moved boards can be restored here.':state.showArchived?'You have no archived boards in this workspace.':'Only boards allowed by your organization appear here.','')+'</div>'))+`
 </div>`;
}
/** Presentation-only typed cells. Original signed values and mutation contracts are unchanged. */
function boardFriendlyDate(value){
 const raw=String(value??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return null;
 const day=new Date(raw+'T00:00:00Z');
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==raw)return null;
 const label=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',year:'numeric',month:'short',day:'numeric'}).format(day);
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=key=>parts.find(p=>p.type===key)?.value||'';
 const today=part('year')+'-'+part('month')+'-'+part('day');
 const delta=(Date.parse(raw+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
 return '<time datetime="'+e(raw)+'" class="board-friendly-date '+
  (delta<0?'is-expired':delta<=7?'is-soon':'is-upcoming')+'">'+e(label)+'</time>';
}
function boardMemberCell(id,detail){
 const member=(detail?.members||[]).find(m=>String(m.user_id||m.id||'')===String(id||''));
 const label=String(member?.display_name||member?.name||member?.email||'Assigned member');
 const letters=label.split(/[\s@]+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 return '<span class="board-member-cell" title="'+e(label)+'"><span class="board-member-initials" aria-hidden="true">'+
  e(letters||'•')+'</span><span class="board-member-name">'+e(label)+'</span></span>';
}
function boardReadableCell(value,definition,detail){
 if(value===null||value===undefined||value==='')return '<span class="board-empty-cell" aria-label="Empty cell"></span>';
 const type=definition?.data_type||'text',plain=visibleValue(value,type,definition?.config);
 if(type==='people')return boardMemberCell(value,detail);
 if(type==='date')return boardFriendlyDate(value)||'<span class="board-wrap-cell">'+e(plain)+'</span>';
 if(type==='number'&&typeof value==='number'&&Number.isFinite(value))
  return '<span class="board-number-cell">'+e(value.toLocaleString('en-US',{maximumFractionDigits:12}))+'</span>';
 if(type==='checkbox')
  return '<span class="board-checkbox-cell'+(value===true?' is-checked':'')+'" role="img" aria-label="'+
   (value===true?'Checked':'Unchecked')+'">'+(value===true?'✓':'')+'</span>';
 if(type==='dropdown')return '<span class="board-dropdown-tag">'+e(plain)+'</span>';
 if(type==='rating'&&Number.isInteger(Number(value))&&Number(value)>=0&&Number(value)<=10)
  return '<span class="board-rating-cell" aria-label="'+e(value)+' stars">'+
   '★'.repeat(Number(value))+'</span>';
 if(type==='timeline'&&value&&typeof value==='object')
  return '<span class="board-timeline-cell"><span class="board-timeline-track" aria-hidden="true"></span><span>'+
   e(value.start||'')+' → '+e(value.end||'')+'</span></span>';
 if(type==='url'&&typeof value==='string'&&/^https?:\/\//i.test(value)){
  let label='Link';
  try{const url=new URL(value);label=decodeURIComponent(url.pathname.split('/').filter(Boolean).pop()||url.hostname)}catch{}
  return '<span class="board-file-chip" title="'+e(value)+'"><span aria-hidden="true">↗</span> '+
   e(label.slice(0,60))+'</span>';
 }
 if(type==='text'||type==='long_text'||type==='email')
  return '<span class="board-wrap-cell" title="'+e(plain)+'">'+e(plain)+'</span>';
 return '<span class="board-readable-cell">'+e(plain)+'</span>';
}
function groupRows(items,allowEdit,layout=null,groupId='ungrouped',primaryTitle='Record',detail=state.board,columnLabels={},primaryEditable=false){
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
   display('record','<span class="board-wrap-cell" title="'+e(item.title||'Untitled')+'">'+e(item.title||'Untitled')+'</span>');
  cell.status=display('status','<span class="status '+statusClass(item.status)+'">'+e(item.status||'Planned')+'</span>');
  cell.owner=display('owner',boardReadableCell(item.assignee_id,{data_type:'people'},detail));
  cell.due=display('due',boardReadableCell(item.due_date,{data_type:'date'},detail));
  for(const column of columns.filter(c=>c.key.startsWith('col:'))){
   const def=cellColumn(detail,column.key);
   const value=expectedCellValue(detail,item,column.key);
   const status=def?.data_type==='status'?configuredStatus(value,def.config):null;
   const formatted=status?
    '<span class="board-configured-status '+statusColorClass(status.color)+'">'+
     e(status.label)+'</span>':
    boardReadableCell(value,def,detail);
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
  summaries:detail?.pagination?.loaded!==true||detail?.pagination?.has_more===true?null:groupColumnSummaries({items,columns,detail}),
  addColumn:writable&&state.boardManage&&BOARD_STRUCTURE_ADMIN_ENABLED,minimal,
  virtualize:true,primaryEditable});
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
/** Non-destructive loaded-row filters, isolated to the current signed board. */
const boardViewFilter={person:'',status:'',sort:'board'};
let boardViewFilterScope='';
function applyBoardViewFilter(rows){
 const filtered=rows.filter(item=>
  (!boardViewFilter.person||String(item.assignee_id||'')===boardViewFilter.person)&&
  (!boardViewFilter.status||String(item.status||'')===boardViewFilter.status));
 if(boardViewFilter.sort==='title_asc'||boardViewFilter.sort==='title_desc'){
  const factor=boardViewFilter.sort==='title_asc'?1:-1;
  filtered.sort((a,b)=>factor*String(a.title||'').localeCompare(String(b.title||'')));
 }else if(boardViewFilter.sort==='due_asc'||boardViewFilter.sort==='due_desc'){
  const factor=boardViewFilter.sort==='due_asc'?1:-1;
  filtered.sort((a,b)=>factor*String(a.due_date||'9999-12-31').localeCompare(String(b.due_date||'9999-12-31')));
 }
 return filtered;
}
/** Board-group presentation preferences never provide access to data.
 * Signed Supabase is authoritative when its forward migration is deployed.
 * A server outage leaves an explicitly temporary in-tab view.
 */
const boardGroupCollapsedByScope=new Map();
const boardGroupTransientExpanded=new Set();
const boardGroupRevisions=new Map();
const boardGroupSaveBusy=new Set();
function boardGroupCollapseKey(groupId){
 return [state.context?.user_id,state.context?.workspace_id,state.boardId,groupId].join('|');
}
function boardGroupScopeMatches(snapshot){
 return auth.isSignedIn&&auth.userId===snapshot.userId&&
  state.context?.user_id===snapshot.userId&&
  state.context?.workspace_id===snapshot.workspaceId&&
  state.boardId===snapshot.boardId&&state.view==='board'&&
  state.board?.board?.id===snapshot.boardId;
}
async function readBoardGroupPreferences(snapshot){
 if(!boardGroupScopeMatches(snapshot))return false;
 try{
  const result=await new BoardGroupStateClient(db).read(snapshot.boardId);
  if(!boardGroupScopeMatches(snapshot))return false;
  const allowed=new Set((state.board.groups||[]).map(g=>g.id));
  let changed=false;
  for(const group of result){
   if(!allowed.has(group.group_id))continue;
   const key=boardGroupCollapseKey(group.group_id);
   if(boardGroupCollapsedByScope.get(key)!==group.collapsed)changed=true;
   boardGroupCollapsedByScope.set(key,group.collapsed);
   boardGroupRevisions.set(key,group.revision);
  }
  // Foreground focus must not discard an inline editor when preferences are unchanged.
  if(changed)render();
  return true;
 }catch{
  // RPC may be absent before controlled migration deployment.
  // Never confuse local state with a confirmed cross-device save.
  return false;
 }
}
function boardGroupCollapsed(groupId,count){
 const search=String(state.boardItemSearch||'').trim().toLowerCase();
 const viewFiltered=!!(boardViewFilter.person||boardViewFilter.status);
 if((search||viewFiltered)&&(state.board?.items||[]).some(i=>
   i.group_id===groupId&&(!search||String(i.title||'').toLowerCase().includes(search))&&
   (!boardViewFilter.person||i.assignee_id===boardViewFilter.person)&&
   (!boardViewFilter.status||i.status===boardViewFilter.status)))return false;
 const key=boardGroupCollapseKey(groupId);
 if(boardGroupTransientExpanded.has(key))return false;
 if(boardGroupCollapsedByScope.has(key))return boardGroupCollapsedByScope.get(key);
 const groups=state.board?.groups||[];
 return groups.length>5&&groups[0]?.id!==groupId;
}
async function persistBoardGroupCollapsed(groupId,collapsed){
 const snapshot={userId:state.context?.user_id,workspaceId:state.context?.workspace_id,
  boardId:state.boardId};
 if(!boardGroupScopeMatches(snapshot)||!(state.board.groups||[]).some(g=>g.id===groupId))return;
 const key=boardGroupCollapseKey(groupId);
 if(boardGroupSaveBusy.has(key))return;
 const count=(state.board.items||[]).filter(i=>i.group_id===groupId).length;
 const before=boardGroupCollapsed(groupId,count);
 boardGroupTransientExpanded.delete(key);
 boardGroupCollapsedByScope.set(key,collapsed);render();
 const expected=boardGroupRevisions.get(key);
 if(!Number.isSafeInteger(expected)){
  toast('Group state is temporary until Board preference synchronization is deployed.',true);
  return;
 }
 boardGroupSaveBusy.add(key);
 try{
  const receipt=await new BoardGroupStateClient(db).set(snapshot.boardId,groupId,collapsed,expected);
  if(boardGroupScopeMatches(snapshot))boardGroupRevisions.set(key,receipt.revision);
 }catch(error){
  if(boardGroupScopeMatches(snapshot)){
   boardGroupCollapsedByScope.set(key,before);render();
   toast('Group preference was not saved. Refresh the board and retry.',true);
  }
 }finally{boardGroupSaveBusy.delete(key);}
}
async function persistAllBoardGroupsCollapsed(collapsed){
 const snapshot={userId:state.context?.user_id,workspaceId:state.context?.workspace_id,
  boardId:state.boardId};
 if(!boardGroupScopeMatches(snapshot))return;
 const ids=(state.board.groups||[]).map(g=>g.id);
 const previous=new Map(ids.map(id=>[id,boardGroupCollapsedByScope.get(boardGroupCollapseKey(id))]));
 boardGroupTransientExpanded.clear();
 ids.forEach(id=>boardGroupCollapsedByScope.set(boardGroupCollapseKey(id),collapsed));
 render();
 try{
  const result=await new BoardGroupStateClient(db).setAll(snapshot.boardId,collapsed);
  if(!boardGroupScopeMatches(snapshot))return;
  for(const group of result){
   const key=boardGroupCollapseKey(group.group_id);
   boardGroupCollapsedByScope.set(key,group.collapsed);
   boardGroupRevisions.set(key,group.revision);
  }
  render();
 }catch{
  if(!boardGroupScopeMatches(snapshot))return;
  for(const [id,prior] of previous){
   const key=boardGroupCollapseKey(id);
   if(prior===undefined)boardGroupCollapsedByScope.delete(key);
   else boardGroupCollapsedByScope.set(key,prior);
  }
  render();toast('Expand/collapse all was not saved to your account.',true);
 }
}
function groupHeading(group,count){
 const {columns=[],layout=null,items=[]}=arguments[2]||{};
 const collapsed=boardGroupCollapsed(group.id,count);
 const id=e(group.id),editing=state.groupEditId===group.id;
 const managedEmpty=state.board?.pagination?.loaded===true&&state.board?.pagination?.has_more!==true&&canSafelyHideEmptyTimeTrackerGroup(state.board?.board,group,
  state.board?.groups||[],state.board?.items||[]);
 const managedDelete=managedEmpty&&MANAGED_TT_GROUP_DELETE_ENABLED&&state.boardManage;
 const ordinaryDelete=state.boardManage&&state.board?.groups?.length>1&&
  !isProtectedBoard(state.board?.board)&&!moduleByBoardName(state.board?.board?.name);
 // The saved group title is the sole source for both display and editing.
 const title=e(group.title||'Group');
 const displayTitle=title;
 const persistedCount=Number.isSafeInteger(group.total_item_count)?group.total_item_count:null;
 const activeCount=Number.isSafeInteger(group.active_item_count)?group.active_item_count:null;
 const archivedCount=Number.isSafeInteger(group.archived_item_count)?group.archived_item_count:null;
 const archiveSuffix=boardGroupArchiveSuffix(activeCount,archivedCount);
 const groupCountLabel=persistedCount===null?
  count+' item'+(count===1?'':'s')+(state.board?.pagination?.has_more===true?' shown':''):
  count===persistedCount?persistedCount+' items'+archiveSuffix:
   'Showing '+count+' of '+persistedCount+' items'+archiveSuffix;
 const fuelTrackEditable=state.edit&&state.board?.board?.id===FUELTRACK_V3_ID&&
  state.board?.board?.name==='FuelTrack+ v3'&&
  String(state.board.board.description||'').startsWith('[APSYNTRA:MODULE:fueltrack:v1]');
 if(editing)return '<div class="group-heading board-group-editing" data-group-id="'+id+'">'+
  '<form class="board-group-inline-form" data-group-inline-form="'+id+'">'+
  '<label class="sr-only" for="group-title-'+id+'">Group name</label>'+
  '<input id="group-title-'+id+'" name="title" required maxlength="120" value="'+title+'"'+(state.groupEditBusy?' disabled':'')+' />'+
  '<button type="submit" class="primary"'+(state.groupEditBusy?' disabled':'')+'>Save</button>'+
  '<button type="button" class="secondary" data-action="group-inline-cancel"'+(state.groupEditBusy?' disabled':'')+'>Cancel</button>'+
  '</form></div>';
 const tone=Math.max(0,(state.board?.groups||[]).findIndex(g=>g.id===group.id))%6;
 if(collapsed){
  const complete=state.board?.pagination?.loaded===true&&
   state.board?.pagination?.has_more!==true;
  const totalCount=persistedCount??count;
  return '<section class="board-collapsed-group board-group-tone-'+tone+'" data-group-id="'+id+'" data-group-collapsed="true">'+
   renderBoardCollapsedRollup({detail:state.board,items,columns,layout,complete,
    groupId:group.id,groupTitle:group.title||'Group',itemCount:totalCount})+
   (state.edit?'<details class="board-group-actions board-collapsed-group-menu"><summary aria-label="Actions for '+displayTitle+'">⋯</summary>'+
    '<div class="board-group-actions-list"><button type="button" data-action="group-inline-edit" data-id="'+id+'">Edit name inline</button>'+
    '<button type="button" data-action="board-group-toggle" data-id="'+id+'">Expand group</button>'+
    '<button type="button" data-action="group-select-visible" data-id="'+id+'">Select visible records</button>'+
    (ordinaryDelete?'<button type="button" data-action="group-delete-empty" data-id="'+id+'">Delete group</button>':
     managedDelete?'<button type="button" data-action="managed-group-delete-empty" data-id="'+id+'">Delete empty group</button>':
     managedEmpty?'<button type="button" data-action="group-hide-empty" data-id="'+id+'">Hide empty group (reversible)</button>':'')+
    '</div></details>':'')+'</section>';
 }
 return '<div class="group-heading'+(collapsed?' is-collapsed':'')+'" data-group-id="'+id+'" data-group-collapsed="'+collapsed+'">'+
  '<button type="button" class="board-group-toggle" data-action="board-group-toggle" data-id="'+id+'" aria-expanded="'+(!collapsed)+'" aria-label="'+(collapsed?'Expand ':'Collapse ')+displayTitle+' group">'+(collapsed?'▸':'▾')+'</button><h3>'+displayTitle+'</h3>'+
  (fuelTrackEditable?'<button type="button" class="board-group-rename-trigger" data-action="group-inline-edit" data-id="'+id+'" aria-label="Edit name inline for '+displayTitle+'" title="Edit name inline">✎ <span>Edit name</span></button>':'')+
  (state.board?.pagination?.loaded===true?'<small>'+groupCountLabel+'</small>':'')+
  (state.edit?'<details class="board-group-actions"><summary aria-label="Actions for '+displayTitle+
   '" title="Group actions">⋮</summary><div class="board-group-actions-list">'+
   '<button type="button" data-action="group-inline-edit" data-id="'+id+'">Edit name inline</button>'+
   '<button type="button" data-action="group-select-visible" data-id="'+id+'">Select visible records</button>'+
   (ordinaryDelete?'<button type="button" data-action="group-delete-empty" data-id="'+id+'">Delete group</button>':
    managedDelete?'<button type="button" data-action="managed-group-delete-empty" data-id="'+id+'">Delete empty group</button>':
    managedEmpty?'<button type="button" data-action="group-hide-empty" data-id="'+id+'">Hide empty group (reversible)</button>':'')+
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

function clearTimeTrackerOjtSelection(){
 if(state.ttOjtSelected?.id)ttWorkNoteDraft.clear(timeTrackerWorkNoteScope(state.ttOjtSelected.id));
 state.ttOjtSelected=null;state.ttOjtSnapshot=null;
 state.ttOjtBusy=false;state.ttOjtPending=false;
 state.ttOjtError='';state.ttOjtSuccess='';
 state.ttOjtGeoProgress='';state.ttOjtLocationSelection='Office-Base Duty';
}
function timeTrackerOjtScope(){
 const a=state.ttAttendance?.access;
 if(!a||state.ttAttendance?.ojtRoster?.mode!=='SHARED_LOGIN'||
  !auth.isSignedIn||a.userId!==auth.userId||
  a.workspaceId!==state.context?.workspace_id||a.boardId!==state.boardId||
  state.view!=='board'||state.tab!=='attendance')return null;
 return {userId:a.userId,workspaceId:a.workspaceId,boardId:a.boardId};
}
function timeTrackerOjtAdminScope(){
 const a=state.ttAttendance?.access;
 if(!a||!['System Admin','IT Administrator'].includes(a.moduleRole)||
  !auth.isSignedIn||a.userId!==auth.userId||
  a.workspaceId!==state.context?.workspace_id||a.boardId!==state.boardId||
  state.view!=='board'||state.tab!=='attendance'||state.ttView!=='employees')return null;
 return {userId:a.userId,workspaceId:a.workspaceId,boardId:a.boardId};
}
function renderTimeTrackerApplication(){
 if(state.ttReadLoading||state.nativeInitialRead==='attendance')return sharedApplicationLoading();
 return renderTimeTrackerNative({
  displayName:name(),referenceShell:state.ttStandalone===true,
  ojtSelected:timeTrackerOjtScope()?state.ttOjtSelected:null,
  ojtAttendance:timeTrackerOjtScope()?state.ttOjtSnapshot:null,
  ojtBusy:state.ttOjtBusy||state.ttOjtPending,
  ojtError:state.ttOjtError,ojtSuccess:state.ttOjtSuccess,
  ojtGeoProgress:state.ttOjtGeoProgress||'',
  ojtLocationSelection:state.ttOjtLocationSelection||'Office-Base Duty',
  result:state.ttAttendance,busy:state.ttBusy,clockPending:!!state.ttClockPending,clockPendingAction:state.ttClockPending?.action||'clock-out',
   workPlanDraft:ttWorkNoteDraft.read(timeTrackerWorkNoteScope()),
   ojtWorkPlanDraft:ttWorkNoteDraft.read(timeTrackerWorkNoteScope(state.ttOjtSelected?.id||'')),
  locationPreference:readTimeTrackerLocationPreference(typeof localStorage==='undefined'?null:localStorage,{
   userId:state.context?.user_id,workspaceId:state.context?.workspace_id
  }),
  geoPromptVisible:state.ttGeoPromptVisible,geoPermission:state.ttGeoPermission,
  geoMessage:state.ttGeoMessage,clockStage:state.ttClockStage,
  clockCorrectionNotice:state.ttClockCorrectionNotice,
  error:state.ttError,success:state.ttSuccess,period:state.ttReportPeriod,
  view:state.ttView,employeesSearch:state.ttEmployeesSearch,employeesTab:state.ttEmployeesTab,employeesDepartment:state.ttEmployeesDepartment,overviewFilters:state.ttOverviewFilters,logFilters:state.ttLogFilters,
  reportFilters:state.ttReportFilters,calendarMonth:state.ttCalendarMonth,
  calendarSelectedDay:state.ttCalendarSelectedDay,otFilters:state.ttOtFilters,
  otModalOpen:state.ttOtModalOpen,otDraft:state.ttOtDraft,
  hoursWeekOffset:state.ttHoursWeekOffset,hoursMonth:state.ttHoursMonth,
  hoursSelectedDay:state.ttHoursSelectedDay,teamEligible:state.roleVerified===true,
  teamDirectory:state.ttTeam,teamFilters:state.ttTeamFilters,
  teamBusy:state.ttTeamBusy,teamError:state.ttTeamError,
  monitorResult:state.ttMonitor,monitorHistory:state.ttMonitorHistory,
  monitorBusy:state.ttMonitorBusy,monitorError:state.ttMonitorError,
  logGpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',
  logGpsData:state.ttLogGpsData,logGpsBusy:state.ttLogGpsBusy,
  logGpsError:state.ttLogGpsError,logGpsErrorRecordId:state.ttLogGpsErrorRecordId,
  logExpandedRecordIds:state.ttLogExpandedIds,
  adminEligible:['System Admin','IT Administrator'].includes(state.ttAttendance?.access?.moduleRole),
  adminFullAccess:state.ttAttendance?.access?.moduleRole==='System Admin',
  adminDirectory:state.ttLogAdminEditor?.directory||state.ttAttendance?.access?.overviewDirectory||[],
  adminSelectedIds:state.ttLogSelectedIds,adminEditor:state.ttLogAdminEditor,adminDeleteConfirm:state.ttLogAdminDeleteConfirm,
  adminBusy:state.ttLogAdminBusy,adminError:state.ttLogAdminError,adminSuccess:state.ttLogAdminSuccess,
  mapEnabled:auth.isSignedIn&&state.ttAttendance?.status==='VERIFIED_READ'&&
   (state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'),
  mapTheme:state.ttGpsFilters.theme==='dark'?'dark':'map',
  gpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',
  gpsData:state.ttGpsData,gpsView:state.ttGpsView,gpsFilters:state.ttGpsFilters,
  gpsBusy:state.ttGpsBusy,gpsError:state.ttGpsError,
  gpsDiagnosticsAvailable:getTimeTrackerGpsDiagnostics().events.length>0
 });
}
function renderFundTrackerApplication(){
 if(state.frtFinanceBusy||state.nativeInitialRead==='finance')return sharedApplicationLoading();
 return renderFundTrackerNative({
   result:state.frtFinance,busy:state.frtFinanceBusy,
   detailResult:state.frtFinanceDetail,detailBusy:state.frtFinanceDetailBusy,
   selectedRequestId:state.frtFinanceDetailId,statusFilter:state.frtStatusFilter,
   view:state.frtFinanceView
  });
 }
 function renderFuelTrackApplication(){
 if(state.fuelTrackBackendBusy||state.nativeInitialRead==='fueltrack')return sharedApplicationLoading();
 return renderFuelTrackV3Application({detail:state.board,section:state.fuelTrackSection,
  actorName:name(),analyticsRenderer:renderFuelTrackAnalytics,
  analyticsView:state.fuelTrackAnalyticsView,analyticsRange:state.fuelTrackAnalyticsRange,
  analyticsMetric:state.fuelTrackAnalyticsMetric,requestsRenderer:renderFuelTrackRequests,
  requestsFilters:state.fuelTrackRequestFilters,
  activity:{snapshot:state.fuelTrackActivity,boardId:state.boardId,
   workspaceId:state.context?.workspace_id,filters:state.fuelTrackActivityFilters,
   busy:state.fuelTrackActivityBusy,error:state.fuelTrackActivityError},
  backend:{snapshot:state.fuelTrackBackend?.snapshot||null,
   analytics:state.fuelTrackBackend?.analytics||null,busy:state.fuelTrackBackendBusy,
   message:state.fuelTrackBackendError,error:state.fuelTrackBackendError,
   receiptLink:state.fuelTrackReceiptLink,refuelingDialog:state.fuelTrackRefuelingDialog,
   preflight:state.fuelTrackPreflight,preflightBusy:state.fuelTrackPreflightBusy}});
}
function renderFuelTransRouteUnavailable(message='The existing FuelTrans Support Portal board was not found in this workspace.') {
 return '<section class="ft-application-unavailable" role="alert" aria-label="FuelTrans application unavailable">'+
  '<h2>FuelTrans Support Portal</h2><p>'+e(message||'FuelTrans is unavailable.')+'</p>'+
  '<p>The existing FuelTrans application board and records were not changed or recreated.</p>'+
  '<a href="#/boards" class="secondary">Return to My Boards</a></section>';
}

function renderFuelTrackRouteUnavailable(message='The existing FuelTrack+ v3 board was not found in this workspace.') {
 return '<section class="ft3-placeholder" role="alert" aria-label="FuelTrack+ application unavailable">'+
  '<h2>FuelTrack+</h2><p>'+e(message||'FuelTrack+ is unavailable.')+'</p>'+
  '<p>The existing application board and records were not changed or recreated.</p>'+
  '<a href="#/boards" class="ft3-soft-action">Return to My Boards</a></section>';
}

function renderTradeLinkRouteUnavailable(message='The existing TradeLink board was not found in this workspace.') {
 return '<section class="tl-content-panel" role="alert" aria-label="TradeLink application unavailable">'+
  '<p class="tl-eyebrow">APSYNTRA CRM · TRADELINK</p><h1>TradeLink</h1>'+
  '<p>'+e(message||'TradeLink is unavailable.')+'</p>'+
  '<p>The existing application board and records were not changed or recreated.</p>'+
  '<a class="secondary" href="#/boards">Return to My Boards</a></section>';
}

function renderTimeTrackerRouteUnavailable(){
 const message=state.ttError||'The existing TimeTracker Attendance board was not found in this workspace. No board was created.';
 const isAssignmentFailure=/native application assignment is not active|native application role is unavailable|native application access is unavailable/i.test(message);
 const title=isAssignmentFailure?'TimeTracker access unavailable':'Existing attendance board unavailable';
 return '<section class="fm1-app tt-application-unavailable" aria-label="TimeTracker application">'+
  '<header class="fm1-app-header"><div><span class="fm1-eyebrow">APSYNTRA CRM · ATTENDANCE OPERATIONS</span>'+
  '<h1>TimeTracker <span>Attendance</span></h1><p>Timekeeping and attendance workspace</p></div></header>'+
  '<section class="fm1-panel"><h2>'+e(title)+'</h2>'+
  '<p>'+e(message)+'</p>'+
  '<p>No application board or attendance records were changed or recreated.</p>'+
  '<a class="fm1-quiet-button" href="#/boards">Return to My Boards</a></section></section>';
}

function boardPage(){
 const engineeringUi=showEngineeringDiagnostics(location.search,state.roleVerified===true);
 if(state.loading)return renderBoardLoading({
  hidden:document.hidden,
  lowPower:navigator.connection?.saveData===true||
   (Number.isFinite(navigator.deviceMemory)&&navigator.deviceMemory<=4),
  application:state.ttStandalone?'TimeTracker':state.frtStandalone?'Fund Tracker':state.tlStandalone?'TradeLink':state.fuelTrackStandalone?'FuelTrack+':state.fuelTransStandalone?'FuelTrans Support Portal':'Board'
 });
 if(state.ttStandalone&&!state.board)return renderBoardLoadingError(state.error,{application:'TimeTracker'});
  if(state.frtStandalone&&!state.board)return renderBoardLoadingError(state.error,{application:'Fund Tracker'});
 if(state.tlStandalone&&!state.board)return renderTradeLinkRouteUnavailable(state.error);
 if(state.fuelTrackStandalone&&!state.board)return renderFuelTrackRouteUnavailable(state.error);
 if(state.fuelTransStandalone&&!state.board)return renderFuelTransRouteUnavailable(state.error);
 if(!state.board)return renderBoardLoadingError(state.error);
 const b=state.board.board;
 if(state.fuelTrackStandalone&&isFuelTrackV3ApplicationBoard(b))return renderFuelTrackApplication();
 if(moduleByBoardName(b.name)?.key==='fueltrans')return '<div id="fueltrans-native-host"></div>';
 if(state.tlStandalone&&isTradeLinkBoard(b)&&(
  (state.tradeLinkActivityBusy&&!state.tradeLinkActivity)||
  (state.tradeLinkAnalyticsBusy&&!state.tradeLinkAnalytics)||
  (state.tradeLinkDraft.busy&&state.tradeLinkDraft.status==='LOADING')))
  return sharedApplicationLoading();
 if(state.tlStandalone&&isTradeLinkBoard(b))return renderTradeLinkApplication({
  detail:state.board,section:state.tradeLinkSection,workspaceId:state.context?.workspace_id,
  activity:{events:state.tradeLinkActivity,busy:state.tradeLinkActivityBusy,error:state.tradeLinkActivityError},
  analytics:state.tradeLinkAnalytics,analyticsBusy:state.tradeLinkAnalyticsBusy,
  analyticsError:state.tradeLinkAnalyticsError,analyticsEnabled:TL03_ANALYTICS_ENABLED,
  draftView:state.tradeLinkDraft,canManage:state.boardManage,canReview:!state.boardManage,
  canCreate:state.boardManage||state.tradeLinkModuleRole==='User',actorId:state.context?.user_id||'',
  actorName:name(),actorEmail:state.context?.profile?.email||'',actorModuleRole:state.tradeLinkModuleRole
 });
 if(moduleByBoardName(b.name)?.key==='timetracker')return renderTimeTrackerApplication();
  if(state.tab==='finance'&&moduleByBoardName(b.name)?.key==='frt')return renderFundTrackerApplication();
 if(state.boardItemSearchBoard!==b.id){state.boardItemSearch='';state.boardItemSearchBoard=b.id;}
 const viewFilterScope=[state.context?.user_id,state.context?.workspace_id,b.id].join('|');
 if(boardViewFilterScope!==viewFilterScope){
  boardViewFilterScope=viewFilterScope;
  boardViewFilter.person='';boardViewFilter.status='';boardViewFilter.sort='board';
 }
 // TradeLink Draft archives retain signed Board/audit records, but are not
 // active Board items. Other boards keep their established archive presentation.
 const items=isTradeLinkBoard(b)?searchTradeLinkBoardItems(state.board):
  Array.isArray(state.board.items)?state.board.items:[];
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
 if(state.tab==='items'){
  for(const [id,rows] of groupedItems)groupedItems.set(id,applyBoardViewFilter(rows));
  ungroupedItems.splice(0,ungroupedItems.length,...applyBoardViewFilter(ungroupedItems));
 }
 const boardStatusOptions=[...new Set(items.map(item=>item.status).filter(Boolean))];
 const hiddenIds=isManagedTimeTrackerBoard(b)?readHiddenEmptyGroups(state.context,b.id):new Set();
 // The exact, verified empty TimeTracker secondary group is omitted for all
 // signed viewers, without any DB mutation or browser-local preference.
 // Populated, renamed or archived-item-bearing groups are never suppressed.
 const redundantGroups=state.board?.pagination?.loaded!==true||state.board?.pagination?.has_more===true?[]:groups.filter(g=>
  isRedundantEmptyTimeTrackerGroup(b,g,groups,items));
 const hiddenGroups=state.board?.pagination?.loaded!==true||state.board?.pagination?.has_more===true?[]:groups.filter(g=>!redundantGroups.includes(g)&&hiddenIds.has(g.id)&&
  canSafelyHideEmptyTimeTrackerGroup(b,g,groups,items));
 const shownGroups=groups.filter(g=>
  !hiddenGroups.includes(g)&&!redundantGroups.includes(g));
 const moduleKey=moduleByBoardName(b.name)?.key;
 const loadedBoardItemCount=items.length.toLocaleString('en-US');
 const persistedBoardItemCount=Number.isSafeInteger(state.board.pagination?.total_count)?
  state.board.pagination.total_count.toLocaleString('en-US'):null;
 const boardItemCountLabel=persistedBoardItemCount===null?
  loadedBoardItemCount+(state.board.pagination?.has_more===true?'+':''):
  loadedBoardItemCount+'/'+persistedBoardItemCount;
 const minimal=isItemOnlyBoard(state.board,state.boardUi);
 const primaryTitle=state.boardUi?.status==='VERIFIED_READ'?state.boardUi.primaryLabel:'Item';
 const primaryEditable=state.boardManage===true&&state.boardUi?.status==='VERIFIED_READ'&&
  state.tab==='items'&&BOARD_STRUCTURE_ADMIN_ENABLED;
 const columnLabels=state.boardUi?.status==='VERIFIED_READ'?state.boardUi.columnLabels:{};
 const allowCustom=BOARD_STRUCTURE_ADMIN_ENABLED&&state.boardUi?.status==='VERIFIED_READ';
 const tabSpecs=moduleKey==='toolbox'?[]:[
  ...(isMaterialTrackerBoard(state.board)?[{key:'sourcing',href:'#/boards/'+b.id+'/sourcing',label:'◇ Material Tracker'}]:[]),
  {key:'items',href:'#/boards/'+b.id+(moduleKey==='fueltrans'?'/items':moduleKey==='timetracker'?'/items':''),
    label:'▤ Main table'},
  {key:'issues',href:'#/boards/'+b.id+'/issues',
    label:'◇ APSYNTRA Issues <span class="csp-u060">('+state.issues.length+')</span>'},
  ...(moduleKey==='fueltrans'?[{key:'fueltrans',href:'#/boards/'+b.id+'/fueltrans',label:'FuelTrans application'}]:[]),
 ];
 const columns=moduleKey?boardGridColumns(state.board,{primaryTitle,columnLabels,allowCustom}):
  genericBoardColumns(state.board,{primaryTitle,columnLabels,minimal,
   hiddenVirtual:state.boardUi?.hiddenVirtual});
 const layout=loadBoardLayout(state.context,b.id,tabSpecs.map(t=>t.key),columns.map(c=>c.key),boardPreferences);
 if(minimal)layout.columns=itemOnlyColumnKeys(columns,state.boardUi);
 const tabLookup=new Map(tabSpecs.map(t=>[t.key,t]));
 const tabOrder=applyBoardViewSettings(moduleKey==='timetracker'?tabSpecs:
  layout.tabs.map(k=>tabLookup.get(k)).filter(Boolean),state.boardUi);
 const canReorderTabs=moduleKey!=='timetracker'||(state.boardManage&&
  state.boardUi?.status==='VERIFIED_READ'&&!state.tabMoveBusy);
 // One render-local value index for all application-managed board groups.
 const preparedGrid=moduleKey&&state.tab==='items'?
  prepareBoardGrid(state.board,{primaryTitle,columnLabels,allowCustom}):null;

 const boardToolbarMore = `<details class="board-actions-menu"><summary aria-label="More board actions" title="More board actions">⋯</summary><div class="board-actions-popover"><button type="button" data-action="board-activity">Activity history</button><button type="button" data-action="board-members">People &amp; members</button><button type="button" data-action="board-structure">Advanced board settings &amp; views</button>${engineeringUi?'<button type="button" data-action="profile-rendering">Profile board rendering (5 seconds)</button>':''}<button type="button" data-action="board-layout-reset">Reset board layout</button><button type="button" data-action="refresh-board">Refresh board</button>${state.tab==='items'?'<button type="button" data-action="board-groups-collapse-all">Collapse all groups</button><button type="button" data-action="board-groups-expand-all">Expand all groups</button>':''}${state.edit&&canManuallyEditBoard(b,true)?'<button type="button" data-action="board-import">Import CSV/XLSX</button>':''}</div></details>`;
 return `<div class="page-head"><div><span class="label-top">Workspace / ${e(workspaceName())} / Board</span>
 <h1>${e(b.name)}</h1><p>${e(publicBoardDescription(b))}</p></div>
 <div class="head-actions">
 ${isMaterialSourcingBoard(b)&&state.edit&&['items','sourcing'].includes(state.tab)?'<button class="primary" data-action="mrh-new-part">＋ New part number</button>':''}
 ${boardInviteControl(normalizeBoardPeople(state.board,{boardId:b.id,workspaceId:b.workspace_id}))}
 ${boardToolbarMore}
 </div></div>
 <div class="tabs board-draggable-tabs" role="tablist" aria-label="Board views">
 ${tabOrder.map(t=>'<div class="board-tab-slot" data-board-tab-slot="'+e(t.key)+'">'+
  '<a role="tab" draggable="'+(canReorderTabs?'true':'false')+'" data-board-tab="'+e(t.key)+'" aria-selected="'+(state.tab===t.key)+
  '" class="tab '+(state.tab===t.key?'active':'')+'" href="'+e(t.href)+'"'+
  (state.tab===t.key?' aria-current="page"':'')+
  (canReorderTabs?' aria-keyshortcuts="Alt+Shift+ArrowLeft Alt+Shift+ArrowRight" title="Drag to reorder; Alt+Shift+Left/Right to move"':'')+
  '>'+t.label+'</a></div>').join('')}</div>

<div data-board-live-content>
${state.tab==='sourcing'&&isMaterialTrackerBoard(state.board)?renderMaterialSourcingTracker(state.board,state.mrhTrackerFilters,new Date(),{canCreate:state.edit===true,view:state.mrhAddView?'add':'list'}):state.tab==='fueltrack'&&isFuelTrackV3ApplicationBoard(b)?renderFuelTrackV3Application({detail:state.board,section:state.fuelTrackSection,actorName:name(),analyticsRenderer:renderFuelTrackAnalytics,analyticsView:state.fuelTrackAnalyticsView,analyticsRange:state.fuelTrackAnalyticsRange,analyticsMetric:state.fuelTrackAnalyticsMetric,requestsRenderer:renderFuelTrackRequests,requestsFilters:state.fuelTrackRequestFilters,activity:{snapshot:state.fuelTrackActivity,boardId:state.boardId,workspaceId:state.context?.workspace_id,filters:state.fuelTrackActivityFilters,busy:state.fuelTrackActivityBusy,error:state.fuelTrackActivityError},backend:{snapshot:state.fuelTrackBackend?.snapshot||null,analytics:state.fuelTrackBackend?.analytics||null,busy:state.fuelTrackBackendBusy,message:state.fuelTrackBackendError,error:state.fuelTrackBackendError,receiptLink:state.fuelTrackReceiptLink,refuelingDialog:state.fuelTrackRefuelingDialog,preflight:state.fuelTrackPreflight,preflightBusy:state.fuelTrackPreflightBusy}}):state.tab==='fueltrans'&&moduleKey==='fueltrans'?'<div id="fueltrans-native-host"></div>':state.tab==='finance'&&moduleByBoardName(b.name)?.key==='frt'?renderFundTrackerApplication():state.tab==='attendance'&&moduleByBoardName(b.name)?.key==='timetracker'?renderTimeTrackerNative({result:state.ttAttendance,busy:state.ttBusy,clockPending:!!state.ttClockPending,otExpandedRequestIds:state.ttOtExpandedRequestIds,clockPendingAction:state.ttClockPending?.action||'clock-out',error:state.ttError,success:state.ttSuccess,period:state.ttReportPeriod,view:state.ttView,employeesSearch:state.ttEmployeesSearch,employeesTab:state.ttEmployeesTab,employeesDepartment:state.ttEmployeesDepartment,overviewFilters:state.ttOverviewFilters,logFilters:state.ttLogFilters,reportFilters:state.ttReportFilters,calendarMonth:state.ttCalendarMonth,calendarSelectedDay:state.ttCalendarSelectedDay,otFilters:state.ttOtFilters,otManualVisibleCount:state.ttOtManualVisibleCount,otModalOpen:state.ttOtModalOpen,otDraft:state.ttOtDraft,hoursWeekOffset:state.ttHoursWeekOffset,hoursMonth:state.ttHoursMonth,hoursSelectedDay:state.ttHoursSelectedDay,teamEligible:state.roleVerified===true,teamDirectory:state.ttTeam,teamFilters:state.ttTeamFilters,teamBusy:state.ttTeamBusy,teamError:state.ttTeamError,monitorResult:state.ttMonitor,monitorHistory:state.ttMonitorHistory,monitorBusy:state.ttMonitorBusy,monitorError:state.ttMonitorError,logGpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',logGpsData:state.ttLogGpsData,logGpsBusy:state.ttLogGpsBusy,logGpsError:state.ttLogGpsError,logGpsErrorRecordId:state.ttLogGpsErrorRecordId,logExpandedRecordIds:state.ttLogExpandedIds,adminEligible:state.ttAttendance?.access?.moduleRole==='System Admin',adminDirectory:state.ttLogAdminEditor?.directory||state.ttAttendance?.access?.overviewDirectory||[],adminSelectedIds:state.ttLogSelectedIds,adminEditor:state.ttLogAdminEditor,adminBusy:state.ttLogAdminBusy,adminError:state.ttLogAdminError,adminSuccess:state.ttLogAdminSuccess,mapEnabled:auth.isSignedIn&&state.ttAttendance?.status==='VERIFIED_READ'&&(state.roleVerified===true||state.ttAttendance.access?.moduleRole==='Supervisor'),mapTheme:state.ttGpsFilters.theme==='dark'?'dark':'map',
 gpsEligible:state.roleVerified===true||state.ttAttendance?.access?.moduleRole==='Supervisor',gpsData:state.ttGpsData,gpsView:state.ttGpsView,gpsFilters:state.ttGpsFilters,gpsBusy:state.ttGpsBusy,gpsError:state.ttGpsError}):state.tab==='tradelink'&&moduleKey==='tradelink'?renderTradeLinkApplication({detail:state.board,section:state.tradeLinkSection,workspaceId:state.context?.workspace_id,activity:{events:state.tradeLinkActivity,busy:state.tradeLinkActivityBusy,error:state.tradeLinkActivityError},analytics:state.tradeLinkAnalytics,analyticsBusy:state.tradeLinkAnalyticsBusy,analyticsError:state.tradeLinkAnalyticsError,analyticsEnabled:TL03_ANALYTICS_ENABLED,draftView:state.tradeLinkDraft,canManage:state.boardManage,canReview:!state.boardManage,canCreate:state.boardManage||state.tradeLinkModuleRole==='User',actorId:state.context?.user_id||'',actorName:name(),actorEmail:state.context?.profile?.email||'',actorModuleRole:state.tradeLinkModuleRole}):state.tab==='issues'?issuesPage():`
 <div class="toolbar board-customize-toolbar">
 ${state.edit&&state.tab==='items'&&canManuallyEditBoard(b,true)?'<button class="primary" data-action="new-item">＋ New item</button>':''}
 <div class="search-wrap board-toolbar-search"><svg class="board-toolbar-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 5 5"></path></svg><input id="search-board-items" class="search-input" aria-label="Search board items" placeholder="Search" value="${e(state.boardItemSearch)}" /></div>
 <details class="board-tool-menu"><summary>♙ Person</summary><div class="board-tool-menu-panel"><label for="board-person-filter">Assigned person</label><select id="board-person-filter" name="board-person-filter"><option value="">All people</option>${(state.board.members||[]).filter(m=>m.user_id).map(m=>'<option value="'+e(m.user_id)+'"'+(boardViewFilter.person===m.user_id?' selected':'')+'>'+e(m.display_name||m.email||'Member')+'</option>').join('')}</select></div></details>
 <details class="board-tool-menu"><summary>▽ Filter</summary><div class="board-tool-menu-panel"><label for="board-status-filter">Status</label><select id="board-status-filter" name="board-status-filter"><option value="">All statuses</option>${boardStatusOptions.map(s=>'<option value="'+e(s)+'"'+(boardViewFilter.status===s?' selected':'')+'>'+e(s)+'</option>').join('')}</select></div></details>
 <details class="board-tool-menu"><summary>⇅ Sort</summary><div class="board-tool-menu-panel"><label for="board-sort-mode">Sort displayed rows</label><select id="board-sort-mode" name="board-sort-mode">${[['board','Board order'],['title_asc','Item A–Z'],['title_desc','Item Z–A'],['due_asc','Due date ↑'],['due_desc','Due date ↓']].map(([value,label])=>'<option value="'+value+'"'+(boardViewFilter.sort===value?' selected':'')+'>'+label+'</option>').join('')}</select></div></details>
 ${boardColumnMenu(columns,layout)}
 <details class="board-tool-menu"><summary>▣ Group by</summary><div class="board-tool-menu-panel" role="note"><strong>Saved board groups</strong><p>Items remain in their authorized group. Re-grouping will be enabled after a verified projection is available.</p></div></details>

 ${moduleKey==='tradelink'&&state.boardManage&&!tradeLinkSetupStatus(state.board).ready?'<button type="button" class="secondary" data-action="tradelink-configure" '+(state.tradeLinkSetupBusy?'disabled':'')+'>'+(state.tradeLinkSetupBusy?'Configuring TradeLink…':'Configure TradeLink columns')+'</button>':''}
  ${moduleKey==='timetracker'&&TT_BOARD_GPS_PROJECTION_ENABLED&&(state.roleVerified===true||state.ttBoardGpsEligible===true)?'<button type="button" class="secondary" data-action="tt-board-gps">Restricted attendance GPS</button>':''}
  ${engineeringUi&&state.edit&&canBulkEditBoard(b)?'<button type="button" class="secondary" data-action="bulk02-verify" '+(state.bulk02Busy?'disabled':'')+'>'+(
   state.bulk02Busy?'Checking signed permissions…':bulkReadyFor(b)?'✓ Bulk access verified':'Verify signed bulk access')+'</button>':''}
  ${hiddenGroups.length?'<button type="button" class="secondary" data-action="group-show-hidden">Show '+hiddenGroups.length+' hidden empty group'+(hiddenGroups.length===1?'':'s')+' (this browser)</button>':''}</div>
  ${isFRTBoardReference(b)?renderFRTBoardSignedSnapshot(state.frtFinance,{busy:state.frtFinanceBusy,boardId:b.id}):''}
  ${isFRTBoardReference(b)?'<div class="note" role="note" aria-label="Fund Released Tracker board mapping">'+
   (frtReferenceColumns(state.board)?'Fund Released Tracker board preview: Status uses the existing Approval Status field and Date uses Request Date. ':
    'Fund Released Tracker reference layout is pending verified source-column mapping.')+
   'The separate board mirror does not store FRT person assignments or private attachments/QR files. '+
   'Existing source lineage, release, and finance data remain unchanged. '+
   'Monday.com reference status labels (not activated as board actions): '+e(FRT_REFERENCE_STATUS_LABELS.join(' · '))+'. '+
   '<a href="#/boards/'+e(b.id)+'/finance">Open signed FRT requests and date editing</a></div>':''}
  ${moduleKey==='tradelink'?'<p class="muted" role="note">Files is reserved for a secured attachment workflow. Uploads are not enabled yet.</p>':''}
  ${engineeringUi&&state.bulk02Result&&state.bulk02Result.boardId===b.id?
   '<div class="board-bulk-probe-summary" role="status" aria-live="polite">Signed bulk authorization: '+e(state.bulk02Result.status)+
   ' — '+state.bulk02Result.checks.filter(x=>x.status==='PASS').length+' / '+state.bulk02Result.checks.length+
   ' checks. '+(state.bulk02Result.ready?'Mutations enabled for this verified board and session.':'No bulk writes enabled. Review account permissions or unavailable evidence.')+
    '<details class="board-bulk-probe-details"><summary>Signed check details</summary>'+
    state.bulk02Result.checks.map(x=>'<p><strong>'+e(x.id)+' — '+e(x.status)+':</strong> '+e(x.detail)+'</p>').join('')+
    '<p>Still pending: real authorized disposable-board writes, revoked/expired sessions and cross-workspace browser acceptance.</p></details>'+
    '<button type="button" class="secondary" data-action="bulk02-copy-report">Copy nonsecret check report</button></div>':''}
  ${engineeringUi?row01AcceptancePanel(b):''}
  <div class="board-bulk-toolbar" id="board-bulk-toolbar" role="region" aria-label="Selected board records" ${itemSelection.size?'':'hidden'}><strong id="board-selected-count">${itemSelection.size} selected</strong><button type="button" class="secondary" data-action="bulk-export">Export selected CSV</button><button type="button" class="secondary" data-action="bulk-clear">Clear selection</button>
 <button type="button" class="secondary" data-action="bulk-actions" ${canRequestBulk(b)||bulkReadyFor(b)?'':'disabled title="Bulk changes require an authorized ordinary board and 1–50 records"'}>Bulk actions…</button>
 <button type="button" class="secondary board-delete-one" data-action="delete-selected-item" ${itemSelection.size>0&&state.edit&&canManuallyEditBoard(b,true)?'':'disabled title="Select an editable ordinary-board item"'}>${itemSelection.size>1?'Delete one of '+itemSelection.size+'…':'Delete item'}</button>
 <span class="muted">${!canBulkEditBoard(b)?'Protected application records: selection and export only; domain-specific bulk writes require separate server authorization.':bulkReadyFor(b)?'Max 50 records per atomic batch.':'Bulk actions verify this signed session before changes; unsupported field edits and multi-delete are unavailable.'}</span></div>
 ${shownGroups.length?shownGroups.map(g=>`${groupHeading(g,groupedItems.get(g.id)?.length||0,{columns,layout,items:groupedItems.get(g.id)||[]})}
 ${boardGroupCollapsed(g.id,groupedItems.get(g.id)?.length||0)?'':(moduleKey==='timetracker'&&String(g.title||'').trim().toLowerCase()==='main group'?
  renderTimeTrackerMainGroup({groupId:g.id,groupItems:groupedItems.get(g.id)||[],
   boardColumns:state.board.columns||[],boardValues:state.board.values||[],
   projection:state.ttBoardAttendance,userId:state.context?.user_id,
   workspaceId:state.context?.workspace_id,boardId:b.id,
   primaryTitle:state.boardUi?.status==='VERIFIED_READ'&&state.boardUi.revision>0?
    primaryTitle:'Employee',primaryEditable}):
  moduleByBoardName(b.name)?boardGrid(state.board,{groupId:g.id,groupItems:groupedItems.get(g.id)||[],layout,primaryTitle,columnLabels,allowCustom,prepared:preparedGrid,selection:{enabled:true,selected:itemSelection.ids},primaryEditable,footer:renderGroupAddRow({groupId:g.id,domain:true}),summaries:{record:Number.isSafeInteger(g.total_item_count)?
    (groupedItems.get(g.id).length+' loaded / '+g.total_item_count+' total'+
     (g.archived_item_count>0?' · '+g.active_item_count+' active · '+g.archived_item_count+' archived':'')):
    groupedItems.get(g.id).length+(state.board.pagination?.has_more?' loaded':' records')}}):groupRows(groupedItems.get(g.id)||[],state.edit,layout,g.id,primaryTitle,state.board,columnLabels,primaryEditable))}`).join(''):
 `<div class="panel">${empty('Your board is ready','Create a group to start adding and organizing items.',state.edit?'<button class="primary" data-action="new-group">＋ Add your first group</button>':'')}</div>`}
 ${ungroupedItems.length?`<div class="group-heading"><h3>Ungrouped</h3></div>${moduleByBoardName(b.name)?boardGrid({...state.board,items:ungroupedItems},{layout,primaryTitle,columnLabels,allowCustom,prepared:preparedGrid,selection:{enabled:true,selected:itemSelection.ids},primaryEditable}):groupRows(ungroupedItems,state.edit,layout,'ungrouped',primaryTitle,state.board,columnLabels,primaryEditable)}`:''}`}${state.tab==='items'&&state.edit?'<button type="button" class="secondary board-add-group-bottom" data-action="new-group">＋ Add new group</button>':''}
 ${state.tab==='items'?renderBoardPagination(state.board.pagination,{busy:state.boardPageBusy,error:state.boardPageError}):''}
 ${state.tab==='items'?'<div class="board-horizontal-rail-slot" data-board-horizontal-rail-slot><div class="board-horizontal-rail" data-board-horizontal-rail role="region" tabindex="0" aria-label="Board horizontal scrollbar"><div class="board-horizontal-rail-spacer" data-board-horizontal-rail-spacer aria-hidden="true"></div></div></div>':''}</div>`;
}
// Mobile account shortcuts retain only explicitly remembered display metadata in this tab.
const mobileAccountChoices=new Map();
let mobileAccountEmail='';
let mobileClockRead=null;
function mobileAccountIdentity(){
 const p=state.context?.profile;
 if(!auth.isSignedIn||!p||state.context.user_id!==auth.userId)return null;
 return {email:String(p.email||state.user?.email||''),name:name(),role:signedCrmRoleLabel(state.crmRoleSnapshot,state.context)};
}
function mobileAccountMarkup(){
 const identity=mobileAccountIdentity();
 if(!identity)return '';
 const current=identity.email.toLowerCase();
 const choices=[...mobileAccountChoices.values()].filter(x=>x.email.toLowerCase()!==current);
 return '<section class="apsm-account" aria-label="Account"><h1>Account</h1><h2>Currently in</h2>'+
  '<div class="apsm-account-current"><span class="apsm-account-avatar">'+e(initials(identity.name))+'</span><div><strong>'+e(identity.name)+'</strong><small>'+e(identity.role)+' · '+e(identity.email)+'</small></div></div>'+
  '<h2>Switch account</h2><div class="apsm-account-list">'+(choices.length?choices.map(x=>
   '<button type="button" data-action="mobile-account-switch" data-email="'+e(x.email)+'"><span class="apsm-account-avatar">'+e(initials(x.name))+'</span><span><strong>'+e(x.name)+'</strong><small>'+e(x.role)+'</small></span><span aria-hidden="true">›</span></button>').join(''):
   '<p>No other accounts remembered in this tab.</p>')+'</div>'+
  '<button type="button" class="apsm-account-add" data-action="mobile-account-switch">+ Add existing account</button>'+
  '<div class="apsm-account-list"><button type="button" data-action="mobile-account-profile" aria-expanded="false">'+settingsIcon('user')+'<span>Profile settings</span><span aria-hidden="true">›</span></button><button type="button" data-action="mobile-account-security" aria-expanded="false">'+settingsIcon('shield')+'<span>Account &amp; security</span><span aria-hidden="true">›</span></button></div>'+
  '<h2>This account</h2><button type="button" class="apsm-account-signout" data-action="logout">'+settingsIcon('logout')+'<span>Sign out of '+e(identity.name)+'</span></button></section>';
}
// Home reads are isolated from the full TimeTracker editor and never issue attendance writes.
async function readMobileHomeClock(){
 if(!window.matchMedia('(max-width:810px)').matches||state.view!=='overview'||!auth.isSignedIn)return;
 const board=findTimeTrackerAttendanceBoard(state.boards,moduleByBoardName);
 if(!board||!workspaceApplicationRouteAccess(TIMETRACKER_APPLICATION_ROUTE,state.context?.workspace_id).allowed)return;
 const actor=auth.userId,workspace=state.context?.workspace_id,seq=routeSerial;
 const scope=[actor,workspace,board.id,seq].join('|');
 if(mobileClockRead===scope)return;
 mobileClockRead=scope;
 const current=()=>auth.isSignedIn&&auth.userId===actor&&state.context?.workspace_id===workspace&&state.view==='overview'&&routeSerial===seq;
 const publish=detail=>{if(current())root.dispatchEvent(new CustomEvent('apsm-clock-snapshot',{detail:{...detail,href:TIMETRACKER_APPLICATION_ROUTE}}));};
 publish({status:'loading'});
 try{
  const snapshot=await timeTracker.snapshot(board.id,{clockOnly:true});
  if(!current())return;
  if(snapshot?.status!=='VERIFIED_READ'||snapshot.access?.userId!==actor||snapshot.access?.workspaceId!==workspace||snapshot.access?.boardId!==board.id){publish({status:'unavailable'});return;}
  if(snapshot.ojtRoster?.mode==='SHARED_LOGIN'){publish({status:'ojt'});return;}
  if(snapshot.ojtRoster?.mode==='SHARED_DISABLED'){publish({status:'unavailable'});return;}
  const pending=timeTrackerPendingRecovery.read({userId:actor,workspaceId:workspace,boardId:board.id});
  if(pending){publish({status:'pending'});return;}
  publish({status:snapshot.active?'active':'idle',clockIn:snapshot.active?.clockIn||null,writeReady:snapshot.access.attendanceWritesAccepted===true});
 }catch{publish({status:'unavailable'});}
}
function settingsPage(){
 const p=state.context.profile;
 const report=state.performanceReport;
 const performancePanel=`<section class="settings-performance-panel panel" aria-labelledby="settings-performance-heading">
  <div class="panel-header"><h3 id="settings-performance-heading">On-demand browser performance</h3></div>
  <div class="panel-body"><p class="muted">Optional 5-second local frame sample. No network requests, recordings, account data, documents, or stored reports. For representative results, run it on a board while scrolling.</p>
  <button type="button" class="secondary" data-action="profile-rendering" ${state.performanceBusy?'disabled':''}>${state.performanceBusy?'Sampling visible frames…':'Measure 5 seconds'}</button>
  ${report?`<p role="status">${e(report.status)} — ${report.frames} sampled frame intervals. P50 ${report.p50Ms??'—'} ms; P95 ${report.p95Ms??'—'} ms; frames exceeding 8.33 ms: ${report.over120Percent??'—'}%; 16.67 ms: ${report.over60Percent??'—'}%.</p>
  <p class="muted">Navigation TTFB ${report.ttfbMs??'—'} ms; DOM ready ${report.domReadyMs??'—'} ms; load ${report.loadMs??'—'} ms. These are browser navigation timings, not signed backend RPC timings or proof of a stable 120 FPS.</p>
  <p class="muted">${report.longTasks?.supported?`Long tasks (50 ms or more) during sampling: ${report.longTasks.count}; total ${report.longTasks.totalMs} ms; maximum ${report.longTasks.maxMs} ms.`:'Long Tasks API unavailable in this browser.'} This is not a full CPU trace.</p>
  ${report.startup?.phases?.length?`<p class="muted">Signed startup after JavaScript entry: ${report.startup.totalMs} ms (entry observed ${report.startup.entryFromNavigationMs} ms after navigation; signed route ready at ${report.startup.signedReadyFromNavigationMs} ms). ${report.startup.phases.map(step=>`${e(step.phase)} ${step.durationMs} ms`).join('; ')}. Each phase includes its awaited network and JavaScript work; not server-only RPC processing time or HTML/module download.</p>`:'<p class="muted">Signed startup phases unavailable in this tab. Reload while signed in and measure again.</p>'}`:''}
  ${report?.entryWaterfall?`<p class="muted">Navigation-to-entry public resource waterfall (same-origin, completed before entry): ${report.entryWaterfall.entryMs} ms to JavaScript entry; ${report.entryWaterfall.groups.javascript.count} JavaScript assets (${report.entryWaterfall.groups.javascript.decodedBytes} decoded bytes; last response ${report.entryWaterfall.groups.javascript.latestEndMs??'—'} ms, last-response request started ${report.entryWaterfall.groups.javascript.latestResponseStartMs??'—'} ms, elapsed ${report.entryWaterfall.groups.javascript.latestResponseDurationMs??'—'} ms, latest request start ${report.entryWaterfall.groups.javascript.latestStartMs??'—'} ms); ${report.entryWaterfall.groups.stylesheet.count} CSS assets (${report.entryWaterfall.groups.stylesheet.decodedBytes} decoded bytes; last response ${report.entryWaterfall.groups.stylesheet.latestEndMs??'—'} ms, last-response request started ${report.entryWaterfall.groups.stylesheet.latestResponseStartMs??'—'} ms, elapsed ${report.entryWaterfall.groups.stylesheet.latestResponseDurationMs??'—'} ms, latest request start ${report.entryWaterfall.groups.stylesheet.latestStartMs??'—'} ms); ${report.entryWaterfall.groups.other.count} other public assets; residual after latest public asset response ${report.entryWaterfall.afterLatestPublicResourceMs??'—'} ms. Request elapsed time includes browser queueing and network work; it is not server-only timing. Latest request start may refer to a different asset than the last response. Residual is not proof of parse, execution or scheduling time; 0 decoded bytes can mean unavailable browser reporting. No URLs, account data or RPC requests collected.</p>`:''}
  ${report?.startup?.reads?.length?`<p class="muted">Workspace signed RPC read durations (network-inclusive; not server-only): ${report.startup.reads.map(read=>`${e(read.operation)} ${read.durationMs} ms`).join('; ')}. Reads are instrumented after the verified session; board and role reads overlap. These durations are not additive.</p>`:''}
  </div></section>`;
 return `<div class="aps-settings"><section class="page-head settings-hero settings-entrance" aria-labelledby="settings-title"><div class="settings-hero-copy"><span class="label-top"><span class="settings-hero-dot" aria-hidden="true"></span>Workspace / Account</span><h1 id="settings-title">Account & security<span class="settings-heading-stop">.</span></h1><p>Your verified user identity and session preferences.</p></div><span class="settings-hero-status">${settingsIcon('shield')}<span>Verified workspace account</span></span><svg class="settings-hero-decoration" viewBox="0 0 420 200" fill="none" aria-hidden="true" focusable="false"><circle cx="355" cy="0" r="120" stroke="currentColor" stroke-opacity=".16"/><circle cx="355" cy="0" r="193" stroke="currentColor" stroke-opacity=".09"/><path d="M105 230C201 70 334 93 446 146" stroke="currentColor" stroke-opacity=".16"/></svg></section>
 <div class="settings-grid">${state.roleVerified===true?performancePanel:''}<section class="panel settings-profile-panel settings-entrance" aria-labelledby="settings-profile-heading"><div class="panel-header settings-panel-header"><div class="settings-panel-title"><span aria-hidden="true">${settingsIcon('user')}</span><h3 id="settings-profile-heading">Profile information</h3></div><span class="settings-auth-provider">Supabase Auth</span></div>
 <div class="panel-body settings-panel-body"><div class="profile settings-profile-identity"><span class="avatar csp-u044 settings-profile-avatar" aria-hidden="true"><span data-avatar-initials>${e(initials(name()))}</span><img data-avatar-current alt="" hidden /></span>
 <div class="settings-profile-copy"><div class="name csp-u040" >${e(name())}</div><div class="role">${e(signedCrmRoleLabel(state.crmRoleSnapshot,state.context))}</div></div></div>
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
 <div class="settings-detail"><label>Effective CRM role</label><strong>${e(signedCrmRoleLabel(state.crmRoleSnapshot,state.context))}</strong></div>
 <div class="settings-detail"><label>Inherited identity role</label><strong>${e(p.platform_role||'unverified')}</strong></div>
 <div class="settings-detail"><label>Workspace relationship</label><strong>${e(workspaceRelationLabel(state.workspaceRelationSnapshot,state.context))}</strong></div>
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
 // One modal at a time. Preserve it across authorized re-renders and GPS reads,
 // validating both standard employee and signed OJT session IDs.
 state.ttLogExpandedIds=retainTimeTrackerLogDetailIds(state.ttAttendance,state.ttLogExpandedIds);
}
function render(){
 // Protected Material Sourcing item details cannot survive a session, board,
 // or workspace transition, even when the enclosing drawer remains mounted.
 if(modal?.querySelector('[data-mrh-private-host]')&&
    (!auth.isSignedIn||state.view!=='board'||
     state.boardId!==MATERIAL_SOURCING_BOARD_ID||
     state.context?.user_id!==modal.dataset.mrhActor||
     state.context?.workspace_id!==modal.dataset.mrhWorkspace))hideModal();
 disposeBoardPagination?.();disposeBoardPagination=null;
 resetBoardWindows();
 const filterScope=[state.context?.user_id,state.context?.workspace_id,state.boardId].join('|');
 if(filterScope!==boardItemFilterScope){
  state.boardItemSearch='';state.boardItemSearchBoard=null;
  boardItemFilterScope=filterScope;
 }
 if(!state.context){applicationRouteRead=null;fm1Module?.unmountFm1Application();closeTradeLinkSavedDocumentOutput();renderLogin();return;}
 if(initialAccountRoleReadPending){root.innerHTML=sharedApplicationLoading();return;}
 if(applicationRouteRead){shell(sharedApplicationLoading());return;}
 if(state.view!=='fm1')fm1Module?.unmountFm1Application();
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
 else if(state.view==='role-configuration')shell(renderRoleConfiguration({verified:state.adminVerified,loading:state.roleBusy,data:state.roleData,tab:state.roleTab,error:state.roleError,
  nativeApplicationAccess:state.roleTab==='application-access'?renderUserRoleManagement({
   verified:state.adminVerified,data:state.userRoleData,selectedUserId:state.userRoleSelected,
   actorUserId:state.context?.user_id,busy:state.userRoleBusy||state.roleBusy,error:state.userRoleError,
   batchMode:state.userRoleBatchMode,batchSelected:state.userRoleBatchSelected,
   batchMemberSearch:state.userRoleBatchMemberSearch,applicationAccessOnly:true,
   batchModulesSelected:state.userRoleBatchModulesSelected,batchModuleRoles:state.userRoleBatchModuleRoles,
   batchAction:state.userRoleBatchAction,nativeBatchResults:state.userRoleNativeBatchResults
  }):''}));
 else if(state.view==='user-role-management'){shell('<div id="teams-route-host"></div>');teamsController?.mount(root.querySelector('#teams-route-host'));}
 else if(state.view==='invitation')shell(renderInvitationAcceptance({
  pending:pendingInvitation,enabled:true,
  busy:invitationAcceptanceBusy,status:invitationAcceptanceStatus
 }));
 else if(state.view==='boards')shell(boardsPage());
 else if(state.view==='fm1'){shell('<div id="fm1-application-root"></div>');fm1Module?.mountFm1Application(root.querySelector('#fm1-application-root'),{userId:state.context?.user_id,workspaceId:state.context?.workspace_id,api:db});}
 else if(state.view==='talkbox')shell(renderTalkBoxNativeApplication());
 else if(state.view==='time-tracker')shell(renderTimeTrackerRouteUnavailable());
 else if(state.view==='paseo')shell(renderPaseoNative());
 else if(state.view===DDA_ROUTE_SECTION){
  if(!DDA_RELEASE_ENABLED)shell('<section><h1>Daily Department Activity</h1><p>Production activation is pending.</p></section>');
  else if(state.workspaceTransitionPending||state.context?.workspace_id!==WORK_MANAGEMENT_WORKSPACE_ID||state.context?.user_id!==auth.userId||!auth.isSignedIn){syncDda();shell(sharedApplicationLoading());}
  else{
   shell(DDA_HOST_MARKUP);
   void syncDda({container:root.querySelector('#dda-native-host'),auth,api:db,userId:state.context.user_id,workspaceId:state.context.workspace_id});
  }
 }
 else if(state.view==='order-intake'&&orderIntakeRoute){
  const scope=orderIntakeScope();
  const snapshot=orderIntakeCurrent(scope)?currentOrderIntakeRead().read(scope):null;
  shell(!snapshot||(snapshot.busy&&!snapshot.rows?.length)?sharedApplicationLoading():renderOrderIntake({route:orderIntakeRoute,snapshot,
   record:orderIntakeCurrent(scope)?orderIntakeRecord:null,tableState:orderIntakeTable}));
 }
 else if(state.view==='tradelink')shell(renderTradeLinkRouteUnavailable(state.error));
 else if(state.view==='settings')shell(settingsPage());
 else shell(overview());
 if(state.view==='settings')root.querySelector('.aps-settings')?.insertAdjacentHTML('afterbegin',mobileAccountMarkup());
 if(state.view==='overview')void readMobileHomeClock();
 mountTradeLinkTabMotion(root);
 paintTradeLinkRecoveryStatus();
 void refreshTradeLinkRecoveryChoices();
 if(state.view==='settings')mountAvatarPreview(root,{
  client:profileAvatarClient,
  userId:state.context.user_id,
  currentPath:state.context.profile?.avatar_path||null,
  onBusyChange:busy=>{state.avatarMutationBusy=busy;},
  onSaved:async({path,updatedAt,cleanupPending})=>{
   state.context.profile.avatar_path=path;
   if(updatedAt)state.context.profile.updated_at=updatedAt;
   boardCacheChannel.publish(null,null);
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
 syncFuelTrans({container:state.view==='board'&&state.tab==='fueltrans'&&
   moduleByBoardName(state.board?.board?.name)?.key==='fueltrans'?root.querySelector('#fueltrans-native-host'):null,
  auth,api:db,boardId:state.boardId,workspaceId:state.context?.workspace_id,
  userId:state.context?.user_id,route:location.hash.split('?')[0].split('/').slice(2).join('/')||'dashboard',
  base:FUELTRANS_APPLICATION_ROUTE,
  onMutation:()=>boardCacheChannel.publish(state.boardId,null)});
 if(state.view==='board'&&state.tab==='items'){
  mountBoardWindows(root,syncBoardSelectionUi);
  applyBoardItemFilter(state.boardItemSearch);
  syncBoardSelectionUi();
  mountBoardPaginationUi();
 }
 mountBoardHorizontalRail(root);
 if(state.view==='board'&&state.tab==='items')void ensureBoardToolbarPopoverBehavior();
 if(state.context&&auth.isSignedIn)platformSync.start({
  userId:state.context.user_id,workspaceId:state.context.workspace_id,
  priorityBoardId:state.view==='board'?state.boardId:null,
  boardIds:state.boards.map(board=>board.id)
 });
 globalSearchController?.syncScope();
}
function findBoardCard(id){
 return [...state.boards,...state.archived,...state.trashed].find(b=>b.id===id)||null;
}
async function refreshBoardCardLists(){
 await refreshWorkspace();
 const [archived,trashed]=await Promise.all([db.boards('archived'),db.boards('trashed')]);
 state.archived=archived;state.trashed=trashed;
 for(const id of trashBoardSelection)if(!trashed.some(board=>board.id===id&&eligibleTrashBoard(board)))trashBoardSelection.delete(id);
}
async function refreshBoardCardListsAfterRecovery(){
 await refreshBoardCardLists();
 render();
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
function visibleGroupSelectionIds(groupId){
 const virtual=visibleBoardWindowIds(groupId);
 if(virtual)return virtual;
 return [...root.querySelectorAll('table[data-group-id="'+groupId+'"] [data-board-select-item]')]
  .filter(input=>!input.closest('tr')?.hidden).map(input=>input.dataset.boardSelectItem);
}
function visibleSelectionOrder(){
 return [...root.querySelectorAll('table[data-group-id]')].flatMap(table=>
  visibleGroupSelectionIds(table.dataset.groupId));
}
function applyBoardItemFilter(query){
 const needle=String(query||'').toLocaleLowerCase().trim();
 filterBoardWindows(needle);
 for(const table of root.querySelectorAll('table[data-group-id]:not([data-board-virtual])')){
  for(const row of table.querySelectorAll('tbody tr[data-searchable]')){
   row.hidden=!row.dataset.searchable.toLocaleLowerCase().includes(needle);
  }
 }
}
function syncBoardSelectionUi(){
 if(state.view!=='board'||state.tab!=='items')return;
 for(const input of root.querySelectorAll('[data-board-select-item]')){
  const selected=itemSelection.has(input.dataset.boardSelectItem);
  input.checked=selected;input.closest('tr')?.classList.toggle('board-row-selected',selected);
 }
 for(const checkbox of root.querySelectorAll('[data-board-select-all]')){
  const rows=visibleGroupSelectionIds(checkbox.dataset.boardSelectAll).map(id=>({dataset:{boardSelectItem:id}}));
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
  flushVisibleBoardContent({afterLocalSave:true});
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
  flushVisibleBoardContent({afterLocalSave:true});
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
 }finally{state.groupEditBusy=false;flushVisibleBoardContent({afterLocalSave:true});}
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
  state.ttOtModalOpen||state.ttLogAdminDeleteConfirm||state.loading||state.loadingIssues||
  state.fuelTrackBackendBusy||state.fuelTrackActivityBusy||
  state.fuelTrackPendingSubmission||state.fuelTrackRefuelingDialog||
  state.tradeLinkDraft?.busy||
  (tradeLinkDraftRoute()&&tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft))||
  (state.mrhAddView&&state.tab==='sourcing')||
  focused?.closest?.('input,textarea,select,[contenteditable="true"]'));
}
/**
 * Drop stale workspace data without discarding a still-valid Auth identity.
 * Workspace-context failures get the normal bounded startup retry surface;
 * only an independently failed Auth identity check returns to sign-in.
 */
function invalidateSignedSyncView({preserveAuth=false,error=null}={}){
 clearOrderIntake();
 startupCriticalPath.clear();
 performanceProfileAbort?.abort();performanceProfileAbort=null;
 state.performanceReport=null;state.performanceBusy=false;
 boardPreferences.clearMemory();
 boardCacheChannel.stop();db.invalidateBoardCache();
 crmRoleReadGeneration++;crmRoleLastReadAt=0;state.crmRoleSnapshot=null;
 workspaceRelationReadGeneration++;state.workspaceRelationSnapshot=null;
 state.board=null;state.boardUi=null;state.boards=[];state.tradeLinkDraft=initialTradeLinkDraftView();
 state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBoardAttendance=null;state.ttBoardGpsEligible=false;state.ttLogSelectedIds=[];state.ttLogAdminEditor=null;state.ttLogAdminDeleteConfirm=null;state.ttLogAdminBusy=false;state.ttLogAdminError='';state.ttLogAdminSuccess='';
 state.roleVerified=false;state.adminVerified=false;state.roleData=null;state.userRoleData=null;state.systemAdminData=null;state.systemAdminError='';
 state.context=null;
 if(preserveAuth&&auth.isSignedIn){
  renderBootstrapFailure(error||new ApiError(
   'The signed workspace context changed. Retry to restore the current workspace.',
   503,'WORKSPACE_CONTEXT_CHANGED'));
  return;
 }
 platformSync.stop();
 auth.clear();
 renderLogin('Your signed workspace access changed. Sign in again to continue.');
}
async function reconcilePlatformSync({boardIds=[],reason,userId,workspaceId}){
 if(state.workspaceTransitionPending)return false;
 if(!state.context||state.context.user_id!==userId||
  state.context.workspace_id!==workspaceId||!auth.isSignedIn)return false;
 const serial=routeSerial,view=state.view,tab=state.tab,boardId=state.boardId;
 const quietReadAtStart=visibleBoardRefreshSerial;
 const isCurrent=()=>auth.isSignedIn&&state.context?.user_id===userId&&
  state.context?.workspace_id===workspaceId&&serial===routeSerial&&
  state.view===view&&state.tab===tab&&state.boardId===boardId;
 const sensitive=reason!=='broadcast';
 const boardChanged=boardId&&boardIds.includes(boardId);
 const refreshBoardCatalog=shouldRefreshWorkspaceBoardList({reason,view});
 // Background reconciliation must recognize a canonical native board by ID,
 // even during a route/tab transition when the tab key is temporarily stale.
 const nativeModuleId=view==='board'?nativeApplicationModuleForBoardId(boardId):null;
 // Board broadcasts carry identifiers only; the server remains authoritative.
 if(reason==='broadcast'&&!boardChanged&&view==='board')return true;
 let who;
 try{
  who=await auth.getVerifiedUser();
 }catch(error){
  // Only a failure from the Auth identity endpoint can expire the Auth session.
  if(isCurrent()&&[401,403].includes(Number(error?.status)))
   invalidateSignedSyncView();
  throw error;
 }
 if(!isCurrent())return false;
 if(who?.id!==userId){
  invalidateSignedSyncView({
   preserveAuth:auth.isSignedIn,
   error:new ApiError(
    'The authenticated identity changed during workspace synchronization. Retry to restore the current workspace.',
    503,'SIGNED_IDENTITY_CHANGED')
  });
  return false;
 }
 let current;
 try{
  current=await db.context();
 }catch(error){
  // A workspace RPC denial or SQL permission error is not an Auth sign-out.
  if(isCurrent()&&shouldPreserveSignedSessionOnContextFailure(error,{
   authSignedIn:auth.isSignedIn
  }))invalidateSignedSyncView({preserveAuth:true,error});
  throw error;
 }
 if(!isCurrent())return false;
 if(current.user_id!==userId||current.workspace_id!==workspaceId){
  invalidateSignedSyncView({
   preserveAuth:auth.isSignedIn,
   error:new ApiError(
    'The active workspace context changed during synchronization. Retry to load the current workspace.',
    503,'WORKSPACE_CONTEXT_CHANGED')
  });
  return false;
 }
 // Revocation takes precedence over preserving local editor state. This is
 // an authoritative signed board-view check, not a client-side visibility rule.
 if(view==='board'&&boardId&&!nativeModuleId&&await db.allowed(boardId,'view')!==true){
  if(isCurrent()){
   platformSync.stop();state.board=null;state.boardUi=null;
   state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBoardAttendance=null;
   state.edit=false;state.boardManage=false;location.hash='#/boards';
  }
  return false;
 }
 // Authorization reads must occur even while an unsaved editor is open.
 if(platformSyncEditInProgress())return false;
 const roleChanged=current.profile?.platform_role!==state.context.profile?.platform_role;
 // Native application refresh is resolved through its module-scoped canonical
 // context. A generic board catalog refresh must never evict an application
 // route whose signed module assignment is already valid.
 const boards=refreshBoardCatalog&&!nativeModuleId?await db.boards('active'):state.boards;
 if(!isCurrent())return false;
 if(refreshBoardCatalog&&!nativeModuleId&&!boards.some(board=>board.id===boardId)&&view==='board'){
  platformSync.stop();state.board=null;location.hash='#/boards';return false;
 }
 if(platformSyncEditInProgress())return false;
 let changedBoards=refreshBoardCatalog&&!nativeModuleId&&JSON.stringify(state.boards)!==JSON.stringify(boards);
 if(refreshBoardCatalog&&!nativeModuleId)state.boards=boards;
 state.context=mergeProfileAvatarContext(state.context,current);state.user=auth.session?.user;
 const roleRecheck=shouldRecheckWorkspaceRoles({reason,roleChanged,
  lastReadAt:crmRoleLastReadAt,now:Date.now()});
 if(reason!=='broadcast'){
  // Effective role refresh remains bounded. Bootstrap/admin identity checks
  // run only after a real role change or a cooled-down focus/reconnect event,
  // never on ordinary periodic board polling.
  void refreshSignedCrmRole({force:roleRecheck}).catch(()=>{});
 }
 if(roleRecheck){
  const [verified,admin]=await Promise.all([
   roleConfig.bootstrapVerified().catch(()=>null),
   roleConfig.adminVerified().catch(()=>null)
  ]);
  if(!isCurrent())return false;
  if(admin!==null&&admin!==state.adminVerified){state.adminVerified=admin;state.roleData=null;state.userRoleData=null;}
  if(admin===false&&view==='role-configuration'){
   location.hash='#/overview';return false;
  }
  if(verified!==null&&verified!==state.roleVerified){
   if(!verified){
    performanceProfileAbort?.abort();performanceProfileAbort=null;
    state.performanceReport=null;state.performanceBusy=false;
   }
   state.roleVerified=verified;state.roleData=null;state.userRoleData=null;
   if(!verified&&['foundation','acceptance'].includes(view)){
    platformSync.stop();location.hash='#/overview';return false;
   }
  }
 }
 if(view==='board'&&boardId){
  let detail,edit,manage,boardUi,resolvedNative=null;
  try{
   const [nativeResult,genericDetail,editResult,manageResult,uiResult]=await Promise.all([
    nativeModuleId?db.nativeApplicationBoardContext(nativeModuleId):Promise.resolve(null),
    nativeModuleId?Promise.resolve(null):readVisibleBoardSnapshot(boardId,tab,{
     itemCount:state.board?.items?.length||BOARD_ITEM_PAGE_SIZE
    }),
    nativeModuleId?db.allowed(boardId,'edit').catch(()=>false):db.allowed(boardId,'edit'),
    nativeModuleId==='tradelink'?readTradeLinkManagementAccess().catch(error=>{
     if(Number(error?.status)===0||Number(error?.status)===408||Number(error?.status)===429||
        Number(error?.status)>=500||['NETWORK_UNAVAILABLE','REQUEST_TIMEOUT'].includes(error?.code))return null;
     throw error;
    }):
     nativeModuleId?db.allowed(boardId,'manage').catch(()=>false):db.allowed(boardId,'manage'),
    nativeModuleId?Promise.resolve(null):boardStructureClient.read(boardId)
   ]);
   if(nativeModuleId&&(!nativeResult||nativeResult.moduleId!==nativeModuleId||
      nativeResult.userId!==userId||nativeResult.workspaceId!==workspaceId||
      nativeResult.board?.id!==boardId||
      nativeResult.detail?.board?.workspace_id!==workspaceId))
    throw new ApiError('Native application context changed during background refresh.',409);
   resolvedNative=nativeResult;
   detail=nativeModuleId?resolvedNative.detail:genericDetail;
   edit=editResult;manage=nativeModuleId==='tradelink'&&manageResult===null?state.boardManage:manageResult;boardUi=uiResult;
  }catch(error){
   if(isCurrent()&&([403,404].includes(Number(error?.status))||
      error?.code==='42501')){
    platformSync.stop();state.board=null;state.boardUi=null;
    state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBoardAttendance=null;
    state.edit=false;state.boardManage=false;
    location.hash='#/boards';
    return false;
   }
   throw error;
  }
  if(!isCurrent()||platformSyncEditInProgress()||
     quietReadAtStart!==visibleBoardRefreshSerial)return false;
  if(detail?.board?.id!==boardId||detail.board.workspace_id!==workspaceId)
   return false;
  if(!refreshBoardCatalog&&detail.board.status!=='active'){
   const activeBoards=await db.boards('active');
   if(!isCurrent())return false;
   state.boards=activeBoards;
   platformSync.stop();state.board=null;state.boardUi=null;
   state.edit=false;state.boardManage=false;location.hash='#/boards';
   return false;
  }
  if(!refreshBoardCatalog){
   const nextBoards=state.boards.map(board=>
    board.id===boardId?{...board,...detail.board}:board);
   changedBoards=JSON.stringify(state.boards)!==JSON.stringify(nextBoards);
   state.boards=nextBoards;
  }
  const changed=JSON.stringify(state.board)!==JSON.stringify(detail);
  state.board=detail;state.edit=edit;state.boardManage=manage;state.boardUi=boardUi;
   if(nativeModuleId==='tradelink')state.tradeLinkModuleRole=resolvedNative?.role||'';
  if(tab==='issues')state.issues=await db.issues(boardId,workspaceId);
  if(tab==='talkbox')await loadTalkBox();
  if(tab==='attendance'&&moduleByBoardName(detail.board.name)?.key==='timetracker'){
   const fresh=await timeTracker.snapshot(boardId,{
    clockOnly:timeTrackerClockOnlyForRoute(userId,workspaceId,boardId),
    nativeContext:nativeModuleId==='time-tracker'?resolvedNative:null
   });
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
  if(['items','finance'].includes(tab)&&moduleByBoardName(detail.board.name)?.key==='frt'){
   const selected=state.frtFinance?.status==='PASS'?state.frtFinance.companyCode:null;
   const signed=await fundTracker.snapshot({companyCode:selected});
   if(isCurrent())state.frtFinance=signed;
  }
  // Module-owned records are not all part of the board snapshot. Refresh their
  // signed projections explicitly so a cross-window board hint cannot leave
  // FuelTrack or TradeLink showing an old list/activity/detail revision.
  if(tab==='fueltrack'&&boardId===FUELTRACK_V3_ID){
   if(!state.fuelTrackBackendBusy)await loadFuelTrackBackend(serial);
   if(!isCurrent()||platformSyncEditInProgress())return false;
   if(state.fuelTrackSection==='activity'&&!state.fuelTrackActivityBusy)
    await loadFuelTrackActivity(serial);
  }
  if(tab==='tradelink'&&boardId===TRADELINK_BOARD_ID){
   if(state.tradeLinkSection==='activity'&&!state.tradeLinkActivityBusy)
    await loadTradeLinkActivity(serial);
   else if(state.tradeLinkSection==='analytics'&&!state.tradeLinkAnalyticsBusy&&
      !state.tradeLinkAnalytics&&!state.tradeLinkAnalyticsError)
    await loadTradeLinkAnalytics(serial);
   else if(['drafts','documents'].includes(state.tradeLinkSection)&&
      TL03_DOMAIN_READS_ENABLED&&!state.tradeLinkDraft.busy){
    const selectedDraft=state.tradeLinkSection==='drafts'?
     state.tradeLinkDraft.selected?.documentId:null;
    const pendingSelection=pendingNativeSearchSelection?.applicationId==='tradelink'&&
     pendingNativeSearchSelection.userId===auth.userId&&
     pendingNativeSearchSelection.workspaceId===state.context?.workspace_id?
     pendingNativeSearchSelection:null;
    const selectedDocument=state.tradeLinkSection==='documents'?
     (pendingSelection?.recordId||state.tradeLinkDraft.documentPreview?.documentId||null):null;
    await loadTradeLinkDrafts(serial);
    if(!isCurrent()||platformSyncEditInProgress())return false;
    if(selectedDraft&&tradeLinkCanEditExisting()){
     const latest=state.tradeLinkDraft.rows.find(row=>row.documentId===selectedDraft);
     if(!latest||latest.archived||!['draft','for-approval','revision-required','approved'].includes(latest.workflowState)){
      state.tradeLinkDraft={...state.tradeLinkDraft,mode:'list',selected:null,
       documentPreview:null,error:'The selected document is no longer an editable Draft. The signed list has been refreshed.'};
      render();
     }else await openTradeLinkDraft(selectedDraft);
    }else if(selectedDocument){
     if(tradeLinkCanCreate()&&!state.tradeLinkDraft.rows.some(row=>row.documentId===selectedDocument)){
      try{
       const record=await tradeLinkDraftWorkspace.read(selectedDocument);
       if(!isCurrent()||!record||record.archived_at!==null||
        (!state.boardManage&&record.created_by!==auth.userId)||
        record.board_item_id==null||record.document_number!==record.content?.documentNumber||
        record.document_type!==record.content?.documentType)throw new ApiError('TradeLink document is unavailable.',404);
       const recoveredRows=[...state.tradeLinkDraft.rows,{
        documentId:record.id,boardItemId:record.board_item_id,
        documentNumber:record.document_number,clientName:record.content?.customerName??null,
        documentType:record.document_type,revision:record.revision,
        workflowState:record.workflow_state,archived:false,
        createdAt:record.created_at,updatedAt:record.updated_at,
        createdByActor:record.created_by===auth.userId
       }];
       recoveredRows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||
        b.documentId.localeCompare(a.documentId));
       state.tradeLinkDraft.rows=recoveredRows.slice(0,50);
      if(!state.tradeLinkDraft.rows.some(row=>row.documentId===target)){
       state.tradeLinkDraft.rows[49]=recoveredRows.find(row=>row.documentId===target);
      }
      }catch(error){
       if(pendingSelection)pendingNativeSearchSelection=null;
       throw error;
      }
     }
     if(state.boardManage||state.tradeLinkDraft.rows.find(row=>row.documentId===selectedDocument)?.createdByActor===true)
      await openTradeLinkDocument(selectedDocument);
     else await openTradeLinkAssignedDocument(selectedDocument);
     if(pendingSelection)pendingNativeSearchSelection=null;
    }
   }
  }
  if(!isCurrent()||platformSyncEditInProgress())return false;
  if(changed||changedBoards||reason!=='broadcast'||tab!=='items'){
   if(['items','sourcing'].includes(tab))deferVisibleBoardContent();
   else if(tab==='fueltrans'){
    // Refresh the mounted shadow-DOM module in place. Rebuilding the parent
    // shell here would detach focused controls and risk losing local form edits.
    syncFuelTrans({container:root.querySelector('#fueltrans-native-host'),auth,api:db,
     boardId,workspaceId,userId,route:location.hash.split('?')[0].split('/').slice(2).join('/')||'dashboard',
     base:FUELTRANS_APPLICATION_ROUTE,
     refresh:true,onMutation:()=>boardCacheChannel.publish(boardId,null)});
   }else render();
  }
  return true;
 }
 if(view==='user-role-management'&&teamsController)await teamsController.load();
 if(view==='role-configuration'&&state.adminVerified===true)
  await loadRoleConfiguration();
 if(view==='foundation'&&sensitive)await refreshFoundation();
 if(view==='boards'&&state.showArchived)state.archived=await db.boards('archived');
 if(view==='boards'&&state.showTrash)state.trashed=await db.boards('trashed');
 if(!isCurrent()||platformSyncEditInProgress())return false;
 if(changedBoards||roleChanged||reason!=='broadcast')render();
 return true;
}

let workspaceRelationReadGeneration=0;
async function refreshSignedWorkspaceRelation(){
 const actor=state.context?.user_id,workspace=state.context?.workspace_id;
 if(!actor||!workspace||!auth.isSignedIn||auth.userId!==actor)return;
 const token=auth.accessToken,generation=++workspaceRelationReadGeneration;
 state.workspaceRelationSnapshot=null;
 try{
  const catalog=await workspaceLifecycleClient.discover();
  const relation=workspaceRelationFromCatalog(catalog,{userId:actor,workspaceId:workspace});
  if(generation!==workspaceRelationReadGeneration||!auth.isSignedIn||
     auth.userId!==actor||auth.accessToken!==token||
     state.context?.user_id!==actor||state.context?.workspace_id!==workspace)return;
  state.workspaceRelationSnapshot=relation;
 }catch{
  if(generation!==workspaceRelationReadGeneration||
     state.context?.user_id!==actor||state.context?.workspace_id!==workspace)return;
  state.workspaceRelationSnapshot=null;
 }
 if(generation===workspaceRelationReadGeneration&&state.context?.user_id===actor&&
    state.context?.workspace_id===workspace&&!platformSyncEditInProgress())render();
}
let crmRoleReadGeneration=0;
let crmRoleLastReadAt=0;
let initialAccountRoleReadPending=false;
async function refreshSignedCrmRole({force=false}={}){
 const ctx=state.context,actor=ctx?.user_id,workspace=ctx?.workspace_id;
 if(!auth.isSignedIn||!actor||!workspace||auth.userId!==actor)return;
 if(!force&&Date.now()-crmRoleLastReadAt<60000)return;
 crmRoleLastReadAt=Date.now();
 const token=auth.accessToken,generation=++crmRoleReadGeneration;
 const previousRole=currentSignedCrmRole(state.crmRoleSnapshot,ctx)?.effectiveRole;
 state.crmRoleSnapshot=null;
 try{
  const raw=await db.effectiveAccess();
  const role=parseSignedCrmRole(raw,{userId:actor,workspaceId:workspace,
   identityRole:ctx.profile?.platform_role});
  if(generation!==crmRoleReadGeneration||!auth.isSignedIn||
     auth.userId!==actor||auth.accessToken!==token||
     state.context?.user_id!==actor||state.context?.workspace_id!==workspace)return;
  state.crmRoleSnapshot=role;
  // A workspace CRM Admin assignment does not alter profiles.platform_role.
  // Re-check the existing signed admin RPC when the authoritative CRM tier
  // changes; keep route and sidebar eligibility synchronized after reassignment.
  if(previousRole!==undefined&&previousRole!==role.effectiveRole){
   const admin=await roleConfig.adminVerified().catch(()=>null);
   if(generation!==crmRoleReadGeneration||!auth.isSignedIn||
      auth.userId!==actor||auth.accessToken!==token||
      state.context?.user_id!==actor||state.context?.workspace_id!==workspace)return;
   if(admin!==null&&admin!==state.adminVerified){
    state.adminVerified=admin;state.roleData=null;state.userRoleData=null;
    if(!admin&&state.view==='role-configuration'){
     location.hash='#/overview';
    }
   }
  }
 }catch{
  // Never present an unverified effective tier or reinterpret it as an identity role.
  if(generation!==crmRoleReadGeneration)return;
  if(state.context?.user_id!==actor||state.context?.workspace_id!==workspace)return;
  state.crmRoleSnapshot=null;
 }
 if(generation===crmRoleReadGeneration&&state.context?.user_id===actor&&
    state.context?.workspace_id===workspace&&!platformSyncEditInProgress())render();
}
async function restoreSavedWorkspacePreference(){
 return restoreWorkspacePreference({auth,lifecycle:workspaceLifecycleClient,api:db});
}
async function refreshWorkspace(){
 const priorIdentity=state.context?.user_id,priorWorkspace=state.context?.workspace_id;
 const incomingContext=await startupCriticalPath.measure('workspace-context',()=>db.context());
 // A transient context-read failure must not tear down the existing signed
 // board sync or invalidate the active board cache. Rotate only after the
 // authoritative context has resolved; identity/scope resets follow below.
 boardCacheChannel.stop();db.invalidateBoardCache();
 if(priorIdentity!==incomingContext?.user_id)initialAccountRoleReadPending=true;
 state.context=mergeProfileAvatarContext(state.context,incomingContext);
 const workspaceIdentityChanged=priorIdentity!==state.context?.user_id||
  priorWorkspace!==state.context?.workspace_id;
 if(workspaceIdentityChanged){
  syncDda();
  clearOrderIntake();
  trashBoardSelection.clear();
  crmRoleReadGeneration++;crmRoleLastReadAt=0;state.crmRoleSnapshot=null;
  workspaceRelationReadGeneration++;state.workspaceRelationSnapshot=null;
  // Do not render the previous workspace's board catalog while the new
  // workspace catalog is loading. A scope transition starts from Overview.
  if(priorWorkspace){
   routeSerial++;
   state.boards=[];state.archived=[];state.trashed=[];
   state.showArchived=false;state.showTrash=false;
   state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.boardPageBusy=false;state.boardPageError='';state.issues=[];
   state.edit=false;state.boardManage=false;state.view='overview';
   state.ttStandalone=false;state.frtStandalone=false;
   state.tlStandalone=false;state.fuelTrackStandalone=false;
   state.fuelTrackBackend=null;state.fuelTrackBackendBusy=false;
   state.fuelTrackBackendError='';state.fuelTrackPreflight=null;
   state.fuelTrackPreflightBusy=false;state.fuelTrackPendingSubmission=null;
   state.fuelTrackReceiptLink=null;state.fuelTrackRefuelingDialog=null;
   state.fuelTrackActivity=null;state.fuelTrackActivityBusy=false;
   state.fuelTrackActivityError='';
   state.tradeLinkModuleRole='';state.tradeLinkActivity=null;
   state.tradeLinkActivityBusy=false;state.tradeLinkActivityError='';
   state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsBusy=false;
   state.tradeLinkAnalyticsError='';state.tradeLinkAnalyticsRunId++;
   state.paseoManagement=null;paseoReadRunId++;
   talkBoxState={page:null,selected:null,busy:false,error:'',scope:'',
    filter:{name:'',status:'All'},features:null,meetingOpen:false,meetingDate:'',
    meetingHistory:[],meetingRecord:null,meetingRows:[]};
   clearTalkBoxReportUrl();
   pendingGlobalSearchItem=null;pendingNativeSearchSelection=null;
   fm1Module?.unmountFm1Application();
   stopTimeTrackerClock();
   history.replaceState(null,'',location.pathname+location.search+routeHome);
   approvedRouteHash=routeHome;
  }
 }
 boardCacheChannel.start({userId:state.context?.user_id,workspaceId:state.context?.workspace_id});
 if(priorIdentity!==state.context?.user_id||priorWorkspace!==state.context?.workspace_id){
   ttWorkNoteDraft.clear();
   performanceProfileAbort?.abort();performanceProfileAbort=null;
   state.performanceReport=null;state.performanceBusy=false;
   if(!startupBusy)startupCriticalPath.clear();
   boardPreferences.clearMemory();
   state.phaseBDenialRunId++;state.phaseBDenialBusy=false;state.phaseBDenialReport=null;
   state.tradeLinkDraft=initialTradeLinkDraftView();
   state.inlineCell=null;state.inlineAddBusy=false;state.inlineCellBusy=false;
   clearBulkActivation();state.row01Busy=false;state.row01Result=null;
   state.boardTtSignedResult=null;state.boardTtSignedBusy=false;
   state.roleData=null;state.userRoleData=null;state.userRoleSelected=null;
   state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;
   state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttClockPending=null;state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtManualVisibleCount=50;state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttLogSelectedIds=[];state.ttLogAdminEditor=null;state.ttLogAdminDeleteConfirm=null;state.ttLogAdminBusy=false;state.ttLogAdminError='';state.ttLogAdminSuccess='';state.ttOtExpandedRequestIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;
 }
 // Both signed reads depend on the freshly validated access context, not
 // on each other. Parallelize only after context and recheck identity/scope
 // before committing either result. Generic routes keep catalog failure fatal;
 // overview/native routes may continue through their own signed data contracts.
 const signedId=state.context?.user_id,signedWorkspace=state.context?.workspace_id;
 const allowBoardListFailure=workspaceRouteAllowsBoardCatalogFallback(location.hash);
 const {boards,bootstrapVerified,adminVerified,boardCatalogError}=await readWorkspaceStartup({
  listBoards:()=>startupCriticalPath.measure('board-list',()=>db.boards('active')),
  verifyBootstrap:()=>startupCriticalPath.measure('bootstrap-role',()=>roleConfig.bootstrapVerified()),
  verifyAdmin:()=>startupCriticalPath.measure('admin-role',()=>roleConfig.adminVerified()),
  isCurrent:()=>auth.isSignedIn&&auth.userId===signedId&&
    state.context?.user_id===signedId&&state.context?.workspace_id===signedWorkspace,
  allowBoardListFailure
 });
 state.boardCatalogError=boardCatalogError?errorMessage(boardCatalogError):'';
 state.boards=boards;
 state.user=auth.session?.user;
 // Both role classifications remain fresh, signed, server-authoritative reads.
 state.roleVerified=bootstrapVerified;
 state.adminVerified=adminVerified;
 initialAccountRoleReadPending=false;
 void refreshSignedCrmRole({force:true}).catch(()=>{});
 void refreshSignedWorkspaceRelation().catch(()=>{});
 if(!state.roleVerified){state.roleData=null;state.roleError='';state.userRoleData=null;state.systemAdminData=null;state.systemAdminError='';state.ttTeam=null;state.ttTeamRunId++;state.ttTeamError='';}
 if(state.workspaceTransitionPending&&
    state.context?.workspace_id===state.workspaceTransitionTargetId&&
    !state.boardCatalogError){
  state.workspaceTransitionPending=false;
  state.workspaceTransitionTargetId=null;
  state.workspaceTransitionTargetName='';
 }
}
async function loadUserRoleManagement(){
 if(state.adminVerified!==true || !(await roleConfig.adminVerified()))throw new ApiError('CRM administrator role management access denied.',403);
 const ctx=await db.context();
 if(ctx.user_id!==state.context?.user_id||ctx.workspace_id!==state.context?.workspace_id)throw new ApiError('Authoritative workspace changed.',403);
 state.userRoleData=await userRoleManager.snapshot(ctx.workspace_id,{includeFuelTrans:true,includeFundTracker:true,includeScopedSix:true,includeCharter:true});
 if(state.systemAdminData?.workspaceId!==ctx.workspace_id||state.systemAdminData?.actorId!==ctx.user_id)
  state.systemAdminData=null;
 const batchIdentity=ctx.workspace_id+':'+ctx.user_id;
 if(state.userRoleBatchIdentity!==batchIdentity){
  state.userRoleBatchSelected=[];
  state.userRoleBatchResource='';
  state.userRoleBatchRole='';
  state.userRoleBatchModulesSelected=[];
  state.userRoleBatchModuleRoles={};
  state.userRoleNativeBatchResults=[];
  state.userRoleBatchIdentity=batchIdentity;
 }
 state.userRoleError='';
 state.userRoleSelected=selectDefaultUserRoleTarget(
  state.userRoleData.users,state.context?.user_id,state.userRoleSelected);
 const validTargets=new Set(state.userRoleData.users.filter(user=>
  !user.protected&&user.id!==state.context?.user_id).map(user=>user.id));
 state.userRoleBatchSelected=state.userRoleBatchSelected.filter(id=>validTargets.has(id));
 const availableNativeModules=state.userRoleBatchModulesSelected.filter(moduleId=>{
  if(moduleId==='fueltrans')return state.userRoleData.fueltransWorkspaceAvailable===true;
  if(moduleId==='tool-traceability')return state.userRoleData.toolTraceabilityWorkspaceAvailable===true;
  if(moduleId==='fund-released-tracker')return state.userRoleData.frtWorkspaceAvailable===true;
  if(moduleId==='charter-navigator')return state.userRoleData.charterWorkspaceAvailable===true;
  if(moduleId==='material-request-hub')return state.userRoleData.workspaceScopedMrhAvailable===true;
  return Object.hasOwn(MODULE_ROLE_OPTIONS,moduleId);
 });
 state.userRoleBatchModulesSelected=availableNativeModules;

}
async function loadSystemAdminManagement(){
 if(state.adminVerified!==true||!state.userRoleData||
    !(await roleConfig.adminVerified()))
   throw new ApiError('CRM administrator verification required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)
   throw new ApiError('System Admin workspace scope changed.',403);
 const snapshot=await (await getSystemAdminClient()).snapshot({
  workspaceId:ctx.workspace_id,actorId:ctx.user_id,users:state.userRoleData.users
 });
 if(!auth.isSignedIn||auth.userId!==identity.id||
    state.context?.user_id!==ctx.user_id||state.context?.workspace_id!==ctx.workspace_id)
   throw new ApiError('System Admin session changed during the read.',403);
 state.systemAdminData=snapshot.status==='VERIFIED_SYSTEM_ADMIN'?snapshot:
  {status:'UNAVAILABLE',roles:[],canManage:false,workspaceId:ctx.workspace_id,actorId:ctx.user_id};
 state.systemAdminError='';
 return state.systemAdminData;
}
async function applyUserRoleChange({userId,scope,resourceId,role,enabled,expectedUpdatedAt}){
 if(state.adminVerified!==true||!(await roleConfig.adminVerified()))throw new ApiError('CRM Administrator required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)throw new ApiError('Signed identity or workspace changed.',403);
 const assignmentTools=scope==='module'?
  await import('./native-application-role-assignment.js'):null;
 if(scope==='module'){
  await assignmentTools.writeNativeApplicationRoleAssignment(userRoleManager,{
   workspaceId:ctx.workspace_id,userId,moduleId:resourceId,role,enabled,
   expectedUpdatedAt,snapshot:state.userRoleData
  });
 }else{
  await userRoleManager.mutate({workspaceId:ctx.workspace_id,userId,scope,
   resourceId,role,enabled,expectedUpdatedAt});
 }
 if(scope==='board')await loadBoardAccessConfiguration();
 else await loadUserRoleManagement();
 const persisted=scope==='module'?
  assignmentTools.nativeApplicationRoleAssignmentPersisted(state.userRoleData,{userId,
   moduleId:resourceId,role,enabled}):
  (()=>{
   const actual=state.userRoleData?.boardAssignments.find(r=>
    r.userId===userId&&r.boardId===resourceId);
   return enabled?actual?.role===role:!actual;
  })();
 if(!persisted)
   throw new ApiError('The role write was acknowledged, but the refreshed workspace assignment could not be verified. Refresh before trying again.',409);
 toast('Authoritative user role updated and audited.');
 render();
}
async function applyCrmPlatformRole({userId,role,expectedUpdatedAt}){
 if(state.adminVerified!==true||!(await roleConfig.adminVerified()))
   throw new ApiError('CRM Administrator required.',403);
 const identity=await auth.getVerifiedUser(),ctx=await db.context();
 if(identity?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
    ctx.workspace_id!==state.context?.workspace_id)
   throw new ApiError('Signed identity or workspace changed.',403);
 try{
  await userRoleManager.setCrmPlatformRole({
   workspaceId:ctx.workspace_id,userId,role,expectedUpdatedAt});
 }catch(err){
  // Another administrator may have completed the same assignment since this
  // dialog opened. A fresh signed read can verify a no-op without creating an
  // inaccurate error toast or claiming an audit event was written.
  if(err?.code==='PT409'&&
     String(err?.message||'').includes('CRM platform role assignment unchanged')){
   await loadUserRoleManagement();
   const current=state.userRoleData.crmPlatformRoles?.find(r=>r.userId===userId);
   if(current?.assignedRole===role){
    toast('This workspace already has the selected CRM role. No changes were made.');
    render();
    return;
   }
  }
  throw err;
 }
 await loadUserRoleManagement();
 const persisted=state.userRoleData.crmPlatformRoles?.find(r=>r.userId===userId);
 if(!persisted||persisted.assignedRole!==role||
    (role!==null&&persisted.effectiveRole!==role))
   throw new ApiError('The CRM role write was acknowledged, but its refreshed assignment could not be verified. Refresh assignments and inspect the current role before attempting another change.',409);
 toast('APSYNTRA CRM platform role updated and verified. WatchdogWorkspace identity is unchanged.');
 render();
}
async function loadBoardAccessConfiguration(){
 if(state.adminVerified!==true||!(await roleConfig.adminVerified()))
  throw new ApiError('CRM administrator board access verification required.',403);
 const context=await db.context();
 if(context.user_id!==state.context?.user_id||context.workspace_id!==state.context?.workspace_id)
  throw new ApiError('Identity or active workspace changed.',403);
 const data=await userRoleManager.snapshot(context.workspace_id);
 const identity=await auth.getVerifiedUser(),current=await db.context();
 if(identity?.id!==context.user_id||current.user_id!==context.user_id||
    current.workspace_id!==context.workspace_id||current.user_id!==state.context?.user_id||
    current.workspace_id!==state.context?.workspace_id)
  throw new ApiError('Identity or active workspace changed during board-access loading.',403);
 state.userRoleData=data;
 state.userRoleSelected=selectDefaultUserRoleTarget(data.users,context.user_id,state.userRoleSelected);
 state.userRoleError='';
}
async function loadRoleConfiguration(){
 if(state.adminVerified!==true)throw new ApiError('CRM Administrator verification required.',403);
 const context=await db.context();
 if(context.user_id!==state.context?.user_id||context.workspace_id!==state.context?.workspace_id)
  throw new ApiError('Identity or active workspace changed.',403);
 // Native Application Access reuses the existing full application-role snapshot,
 // including the specialized workspace-scoped sources used by current applications.
 await loadUserRoleManagement();
 const current=await db.context();
 if(current.user_id!==context.user_id||current.workspace_id!==context.workspace_id||
    current.user_id!==state.context?.user_id||current.workspace_id!==state.context?.workspace_id)
  throw new ApiError('Identity or active workspace changed during application-access loading.',403);
 const data=await roleConfig.snapshot(context.workspace_id);
 state.roleData=data;state.roleError='';
}
async function stageRoleProposal(operation,payload){
 if(state.adminVerified!==true)throw new ApiError('Role configuration access denied.',403);
 const identity=await auth.getVerifiedUser();
 const context=await db.context();
 if(identity?.id!==context.user_id||context.user_id!==state.context?.user_id||
    context.workspace_id!==state.context?.workspace_id||
    !(await roleConfig.adminVerified()))
  throw new ApiError('CRM administrator or active workspace changed.',403);
 const proposalId=await roleConfig.propose(context.workspace_id,operation,payload);
 await loadRoleConfiguration();
 if(!stagedProposalReadbackVerified(state.roleData,{
  workspaceId:context.workspace_id,id:proposalId,operation,payload}))
  throw new ApiError('The proposal RPC returned success, but its exact staged record could not be confirmed by authoritative readback. Refresh the audit history before attempting another submission.',409);
 toast('Staged proposal persisted and verified. No production access has changed.');
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
let visibleBoardRefreshSerial=0;
let pendingBoardContent=null;
let disposeBoardPagination=null;
// Generic item views hydrate progressively. These domain workspaces currently
// compute cross-row summaries or reference validation from the complete board;
// other module tabs need only the signed board shell and must not fetch item rows.
async function readVisibleBoardSnapshot(boardId,tab,{itemCount=BOARD_ITEM_PAGE_SIZE}={}){
 const scope={userId:state.context?.user_id,workspaceId:state.context?.workspace_id};
 if(['attendance','finance','fueltrans','issues','talkbox'].includes(tab))
  return db.boardCached(boardId,{...scope,includeItems:false});
 return db.boardCachedThrough(boardId,scope,{
  itemCount:['sourcing','fueltrack','tradelink'].includes(tab)?
   Infinity:Math.max(BOARD_ITEM_PAGE_SIZE,itemCount||0)
 });
}
function mountBoardPaginationUi(){
 disposeBoardPagination?.();disposeBoardPagination=null;
 if(state.view==='board'&&state.tab==='items'&&state.board?.pagination?.has_more===true&&
    !state.boardPageBusy&&!state.boardPageError)
  disposeBoardPagination=mountBoardPagination(root,()=>loadMoreBoardItems());
}
function deferVisibleBoardContent(){
 if(!state.board||!['items','sourcing'].includes(state.tab))return;
 pendingBoardContent={boardId:state.boardId,tab:state.tab,
  actor:state.context?.user_id,workspace:state.context?.workspace_id,
  routeSerial};
 flushVisibleBoardContent();
}
function flushVisibleBoardContent({afterLocalSave=false}={}){
 const pending=pendingBoardContent;
 if(!pending)return false;
 if(!auth.isSignedIn||state.view!=='board'||state.loading||
    pending.routeSerial!==routeSerial||pending.boardId!==state.boardId||
    pending.tab!==state.tab||pending.actor!==auth.userId||
    pending.actor!==state.context?.user_id||
    pending.workspace!==state.context?.workspace_id){
  pendingBoardContent=null;return false;
 }
 const focused=document.activeElement;
 const focusedEditor=focused?.closest?.('[data-board-live-content] input,'+
  '[data-board-live-content] textarea,[data-board-live-content] select,'+
  '[data-board-live-content] [contenteditable="true"]');
 if(modal?.isConnected||state.inlineCell||state.inlineCellBusy||
    state.inlineAddBusy||state.groupEditId||state.groupEditBusy||
    state.mrhAddBusy||state.mrhAddView&&state.tab==='sourcing'||state.ttBusy||
    root.querySelector('[data-board-live-content] details[open],'+
     '[data-board-live-content] :popover-open')||
    (!afterLocalSave&&focusedEditor))return false;
 const updated=replaceVisibleBoardContent(root,boardPage(),{
  onMounted:()=>{
   if(state.tab==='items'){
    mountBoardWindows(root,syncBoardSelectionUi);
    applyBoardItemFilter(state.boardItemSearch);
    syncBoardSelectionUi();
    mountBoardPaginationUi();
    mountBoardHorizontalRail(root);
   }
  }
 });
 pendingBoardContent=null;
 if(!updated)render();
 return true;
}
/** Routine same-board updates never replace the signed board with a loader.
 * The server still verifies view and edit/manage access on each read.
 */
async function refreshVisibleBoard(boardId,tab){
 const identity=state.context?.user_id,workspace=state.context?.workspace_id,
  seq=routeSerial,refresh=++visibleBoardRefreshSerial;
 const current=()=>refresh===visibleBoardRefreshSerial&&seq===routeSerial&&
  canRetainVisibleBoard(state,{boardId,tab,userId:identity,signed:auth.isSignedIn})&&
  state.context?.workspace_id===workspace;
 try{
  const [detail,view,edit,manage,boardUi]=await Promise.all([
   readVisibleBoardSnapshot(boardId,tab,{
    itemCount:state.board?.items?.length||BOARD_ITEM_PAGE_SIZE
   }),db.allowed(boardId,'view'),db.allowed(boardId,'edit'),
   db.allowed(boardId,'manage'),boardStructureClient.read(boardId)
  ]);
  if(!current())return false;
  if(!view||detail?.board?.id!==boardId||
     detail.board.workspace_id!==workspace){
   state.board=null;state.boardUi=null;state.edit=false;state.boardManage=false;
   location.hash='#/boards';return false;
  }
  const changed=JSON.stringify(state.board)!==JSON.stringify(detail)||
   JSON.stringify(state.boardUi)!==JSON.stringify(boardUi)||
   state.edit!==edit||state.boardManage!==manage;
  state.board=detail;state.boardUi=boardUi;state.edit=edit;state.boardManage=manage;state.boardPageError='';
  if(changed)deferVisibleBoardContent();
  return true;
 }catch(error){
  if(!current())return false;
  if([401,403,404].includes(Number(error?.status))||error?.code==='42501'){
   state.board=null;state.boardUi=null;state.edit=false;state.boardManage=false;
   location.hash='#/boards';return false;
  }
  // A temporary network failure must not clear an already rendered board.
  toast('Board sync could not complete. Your board remains available; retry Refresh.',true);
  return false;
 }
}
async function loadMoreBoardItems(){
 if(state.boardPageBusy||state.view!=='board'||state.tab!=='items'||
    state.board?.pagination?.has_more!==true||!auth.isSignedIn)return false;
 const restoreLoadMoreFocus=document.activeElement?.dataset?.action==='board-load-more';
 const snapshot={
  boardId:state.boardId,userId:state.context?.user_id,
  workspaceId:state.context?.workspace_id,route:routeSerial,
  loadedCount:state.board.items.length
 };
 const current=()=>auth.isSignedIn&&auth.userId===snapshot.userId&&
  state.context?.user_id===snapshot.userId&&
  state.context?.workspace_id===snapshot.workspaceId&&
  state.view==='board'&&state.tab==='items'&&state.boardId===snapshot.boardId&&
  state.board?.board?.id===snapshot.boardId&&
  routeSerial===snapshot.route;
 state.boardPageBusy=true;state.boardPageError='';
 deferVisibleBoardContent();
 try{
  // Rebuild only pages already viewed if the short-lived cache expired.
  let detail=await db.boardCachedThrough(snapshot.boardId,{
   userId:snapshot.userId,workspaceId:snapshot.workspaceId
  },{itemCount:snapshot.loadedCount});
  if(!current())return false;
  if(detail.pagination?.has_more!==true){
   state.board=detail;
   return true;
  }
  detail=await db.boardNextPage(snapshot.boardId,{
   userId:snapshot.userId,workspaceId:snapshot.workspaceId
  });
  if(!current())return false;
  state.board=detail;
  return true;
 }catch(error){
  if(!current())return false;
  if([401,403,404].includes(Number(error?.status))||error?.code==='42501'){
   state.board=null;state.boardUi=null;state.edit=false;state.boardManage=false;
   location.hash='#/boards';
   return false;
  }
  state.boardPageError=errorMessage(error);
  return false;
 }finally{
  if(current()){
   state.boardPageBusy=false;
   deferVisibleBoardContent();
   if(restoreLoadMoreFocus){
    const target=root.querySelector('[data-action="board-load-more"]')||
     root.querySelector('.board-pagination-status');
    target?.focus?.({preventScroll:true});
   }
  }
 }
}
function timeTrackerViewStorage(){
 try{return globalThis.sessionStorage??null;}catch{return null;}
}
async function loadBoard(boardId,tab,draftType=null,draftEditId=null,nativeContext=null){
 const enteringTimeTracker=state.boardId!==boardId||state.tab!=='attendance';
 const nativeModuleId=nativeApplicationModuleForBoardRoute(boardId,tab);
 if(nativeModuleId&&(!nativeContext||nativeContext.moduleId!==nativeModuleId||
    nativeContext.userId!==state.context?.user_id||
    nativeContext.workspaceId!==state.context?.workspace_id||
    nativeContext.board?.id!==boardId||
    nativeContext.detail?.board?.workspace_id!==state.context?.workspace_id)){
  boardCacheChannel.stop();pendingBoardContent=null;
  state.view='board';state.boardId=boardId;state.tab=tab;state.loading=false;
  state.board=null;state.boardUi=null;state.boardManage=false;state.edit=false;
  state.error='Native application context changed before route initialization.';
  render();return;
 }
 if(!nativeModuleId&&canRetainVisibleBoard(state,{boardId,tab,userId:auth.userId,signed:auth.isSignedIn}))
  return refreshVisibleBoard(boardId,tab);
 // Native application routes use their module-scoped canonical board resolver;
 // generic board caching/realtime remains unchanged for ordinary boards.
 pendingBoardContent=null;
 if(nativeModuleId)boardCacheChannel.stop();
 else boardCacheChannel.start({userId:state.context?.user_id,workspaceId:state.context?.workspace_id});
 // Reuse the already authorized TradeLink board only for intra-application
 // navigation in the same signed user/workspace context. Never cache grants
 // across sessions, workspace changes, board switches, or initial loading.
 const nextFuelTrackScope=String(auth.userId||'')+'|'+String(state.context?.workspace_id||'')+'|'+boardId;
 if(state.fuelTrackRequestScope!==nextFuelTrackScope){
  state.fuelTrackRequestScope=nextFuelTrackScope;
  state.fuelTrackRequestFilters={...FUELTRACK_REQUEST_FILTER_DEFAULTS};
  state.fuelTrackBackend=null;state.fuelTrackBackendBusy=false;state.fuelTrackBackendError='';state.fuelTrackPreflight=null;state.fuelTrackPreflightBusy=false;state.fuelTrackPendingSubmission=null;state.fuelTrackReceiptLink=null;state.fuelTrackRefuelingDialog=null;
  state.fuelTrackActivity=null;state.fuelTrackActivityBusy=false;state.fuelTrackActivityError='';
  state.fuelTrackActivityFilters={...FUELTRACK_ACTIVITY_FILTER_DEFAULTS};
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
 const mrhScope=[auth.userId,state.context?.workspace_id,boardId].join('|');
 if(state.mrhTrackerScope!==mrhScope){state.mrhTrackerScope=mrhScope;
  state.mrhTrackerFilters={...MATERIAL_TRACKER_DEFAULT_FILTERS};state.mrhAddView=false;state.mrhAddBusy=false;}
 const seq=++routeSerial;
 state.groupEditId=null;state.groupEditBusy=false;state.inlineCell=null;state.inlineCellBusy=false;state.ttBoardGpsEligible=false;state.ttBoardAttendance=tab==='items'?{status:'LOADING'}:null;state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBusy=false;state.ttError='';state.ttSuccess='';
 if(state.boardId!==boardId||state.tab!=='attendance'){
  state.ttAutoClockoutRunId++;state.ttAutoClockoutBusy=false;
  state.ttView='clock';state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtManualVisibleCount=50;state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttLogSelectedIds=[];state.ttLogAdminEditor=null;state.ttLogAdminDeleteConfirm=null;state.ttLogAdminBusy=false;state.ttLogAdminError='';state.ttLogAdminSuccess='';state.ttOtExpandedRequestIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
 }
 state.tradeLinkDraft=initialTradeLinkDraftView(tab==='tradelink'&&state.tradeLinkSection==='drafts'?draftType:null);
 // No saved content is trusted from the route. A deep-linked edit ID must
 // load the current signed list and be verified by the server before editing.
 if(tab==='tradelink'&&state.tradeLinkSection==='drafts'&&validUuid(draftEditId))
  state.tradeLinkDraft.editRequestId=draftEditId;
 if(reuseFuelTrackBoard){
  // Same signed user and workspace: switching dashboard tabs uses the
  // existing authorized board snapshot. Explicit Refresh re-reads the server.
  render();
  await loadFuelTrackBackend(seq);
  if(state.fuelTrackSection==='activity')await loadFuelTrackActivity(seq);
  return;
 }
 if(reuseTradeLinkBoard){
  state.tradeLinkModuleRole=nativeContext?.role||state.tradeLinkModuleRole;
  // Route state is local. List, edit, and activity data still use their
  // signed APIs below, never a stale or fabricated authorized document.
  state.error=null;
  state.tradeLinkActivityError='';
  render();
  if(state.tradeLinkSection==='activity'&&state.board?.board?.id===TRADELINK_BOARD_ID)
   await loadTradeLinkActivity(seq);
  if(state.tradeLinkSection==='analytics'&&state.board?.board?.id===TRADELINK_BOARD_ID&&
     !state.tradeLinkAnalytics&&!state.tradeLinkAnalyticsError)
   await loadTradeLinkAnalytics(seq);
  if(['drafts','documents'].includes(state.tradeLinkSection)&&
     TL03_DOMAIN_READS_ENABLED&&state.board?.board?.id===TRADELINK_BOARD_ID){
   if(state.tradeLinkSection==='documents')await loadTradeLinkDrafts(seq,{recheckManage:true});
   else await loadTradeLinkDrafts(seq);
  }
  return;
 }
 state.nativeInitialRead=['attendance','finance','fueltrack','talkbox'].includes(tab)?tab:null;state.ttReadLoading=false;
 if(tab==='talkbox')state.view='talkbox';else state.view='board';state.boardId=boardId;state.tab=tab;state.loading=true;state.board=null;state.boardUi=null;state.boardPageBusy=false;state.boardPageError='';state.boardManage=false;state.error=null;state.issues=[];state.tradeLinkActivity=null;state.tradeLinkActivityError='';state.tradeLinkActivityBusy=false;state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError='';state.tradeLinkAnalyticsRunId++;state.tradeLinkAnalyticsBusy=false;state.frtFinanceView='tracker';state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;
 render();
 try{
   const viewRead=nativeModuleId?Promise.resolve(true):db.allowed(boardId,'view');
   const remainingReads=Promise.all([
    nativeModuleId?(nativeContext?Promise.resolve(nativeContext):
      db.nativeApplicationBoardContext(nativeModuleId)):readVisibleBoardSnapshot(boardId,tab),
    db.allowed(boardId,'edit').catch(()=>false),
    nativeModuleId==='tradelink'?readTradeLinkManagementAccess():
     db.allowed(boardId,'manage').catch(()=>false),
    nativeModuleId?Promise.resolve(null):boardStructureClient.read(boardId)
   ]).then(values=>({values}),error=>({error}));
   // Start the other independent server reads immediately. Layout preferences
   // are local-only and are started as soon as signed board-view access resolves.
   const view=await viewRead;
   if(!view)throw new ApiError('Board view access changed.',403);
   if(seq!==routeSerial)return;
   const preferencesRead=nativeModuleId?Promise.resolve(false):
    boardPreferences.hydrate(state.context,boardId).catch(()=>false);
   const [readResult]=await Promise.all([remainingReads,preferencesRead]);
   if(readResult.error)throw readResult.error;
   const [boardResult,edit,manage,boardUi]=readResult.values;
   const resolvedNative=nativeModuleId?boardResult:null;
   const detail=nativeModuleId?resolvedNative?.detail:boardResult;
   if(nativeModuleId&&(!resolvedNative||resolvedNative.moduleId!==nativeModuleId||
      resolvedNative.userId!==state.context?.user_id||
      resolvedNative.workspaceId!==state.context?.workspace_id||
      resolvedNative.board?.id!==boardId))
    throw new ApiError('Native application context changed during initialization.',409);
   if(!auth.isSignedIn||state.context?.user_id!==auth.userId||
      detail?.board?.workspace_id!==state.context?.workspace_id)
    throw new ApiError('Signed board cache scope changed.',403);
   if(seq!==routeSerial||!auth.isSignedIn||auth.userId!==state.context?.user_id||
      detail.board.workspace_id!==state.context?.workspace_id)return;
   state.board=detail;state.edit=edit;state.boardManage=manage;state.boardUi=boardUi;
   if(tab==='items'&&!nativeModuleId)
    void readBoardGroupPreferences({userId:state.context.user_id,
     workspaceId:state.context.workspace_id,boardId});
 }catch(err){if(seq!==routeSerial)return;state.error=errorMessage(err);}
 finally{if(seq===routeSerial){state.loading=false;render();}}
 if(seq!==routeSerial||!state.board){if(seq===routeSerial)state.nativeInitialRead=null;return;}
 state.nativeInitialRead=null;
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
 if(tab==='fueltrack'&&boardId===FUELTRACK_V3_ID){
  await loadFuelTrackBackend(seq);
  if(state.fuelTrackSection==='activity')await loadFuelTrackActivity(seq);
 }
 if(tab==='issues')await loadIssues(seq);
 if(tab==='talkbox'&&moduleByBoardName(state.board?.board?.name)?.key==='toolbox')await loadTalkBox();
 if(tab==='tradelink'&&state.tradeLinkSection==='activity'&&state.board?.board?.id===TRADELINK_BOARD_ID)
  await loadTradeLinkActivity(seq);
 if(tab==='tradelink'&&state.tradeLinkSection==='analytics'&&
    state.board?.board?.id===TRADELINK_BOARD_ID&&!state.tradeLinkAnalyticsBusy&&
    !state.tradeLinkAnalytics&&!state.tradeLinkAnalyticsError)
  await loadTradeLinkAnalytics(seq);
 if(tab==='tradelink'&&['drafts','documents'].includes(state.tradeLinkSection)&&
    TL03_DOMAIN_READS_ENABLED&&state.board?.board?.id===TRADELINK_BOARD_ID){
  // Recheck after the signed native context and board have settled. A
  // manager-role hint triggers only a read, never a permission grant.
  if(state.tradeLinkSection==='documents'&&!state.boardManage&&
     state.tradeLinkModuleRole==='General Manager')
   await loadTradeLinkDrafts(seq,{recheckManage:true});
  else await loadTradeLinkDrafts(seq);
 }
 if(tab==='attendance'&&moduleByBoardName(state.board.board?.name)?.key==='timetracker'){
  if(enteringTimeTracker)state.ttView=readTimeTrackerViewPreference(timeTrackerViewStorage(),timeTrackerWorkNoteScope()||{});
  await loadTimeTracker(seq,nativeModuleId==='time-tracker'?nativeContext:null);
  if(seq===routeSerial&&state.ttView==='log'&&state.ttAttendance?.status==='VERIFIED_READ')
   await loadTimeTrackerLogGps();
 }
 if(tab==='finance'&&moduleByBoardName(state.board.board?.name)?.key==='frt'){
  const pending=pendingNativeSearchSelection?.applicationId==='frt'&&
   pendingNativeSearchSelection.userId===auth.userId&&
   pendingNativeSearchSelection.workspaceId===state.context?.workspace_id&&
   pendingNativeSearchSelection.boardId===boardId?pendingNativeSearchSelection:null;
  if(pending)state.frtFinanceView='tracker';
  await loadFRTFinance(pending?.navigationScope||null,seq,pending?.query||'');
  if(pending&&state.frtFinance?.requests?.some(row=>row.requestId===pending.recordId))
   await loadFRTFinanceDetail(pending.recordId,seq);
  if(pending)pendingNativeSearchSelection=null;
 }
 if(tab==='items'&&moduleByBoardName(state.board.board?.name)?.key==='frt'){
  const identity=state.context?.user_id,workspace=state.context?.workspace_id;
  state.frtFinanceBusy=true;render();
  try{
   const signed=await fundTracker.snapshot({companyCode:null});
   if(seq===routeSerial&&state.tab==='items'&&auth.isSignedIn&&
      state.context?.user_id===identity&&state.context?.workspace_id===workspace)
    state.frtFinance=signed;
  }finally{if(seq===routeSerial){state.frtFinanceBusy=false;render();}}
 }
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
function tradeLinkCanEditExisting(){
 return tradeLinkAuthorizedListRoute()&&(state.boardManage===true||!!state.tradeLinkModuleRole);
}
function tradeLinkCanSave(){
 return state.tradeLinkDraft.mode==='edit'?tradeLinkCanEditExisting()&&!!state.tradeLinkDraft.selected:tradeLinkCanCreate();
}
function tradeLinkCanCreate(){
 return state.boardManage===true||state.tradeLinkModuleRole==='User';
}
// Read the existing signed Board management decision. A transient transport
// failure is not a permanent denial; retry the read once, never a mutation.
async function readTradeLinkManagementAccess(){
 const actor=auth.userId,workspace=state.context?.workspace_id,seq=routeSerial;
 const same=()=>!!actor&&!!workspace&&auth.isSignedIn&&auth.userId===actor&&
  state.context?.user_id===actor&&state.context?.workspace_id===workspace&&
  state.boardId===TRADELINK_BOARD_ID&&state.tab==='tradelink'&&seq===routeSerial;
 if(!same())return false;
 try{
  const allowed=await db.allowed(TRADELINK_BOARD_ID,'manage');
  return same()&&allowed===true;
 }catch(error){
  const status=Number(error?.status);
  if(!same())return false;
  if(Number(error?.retryAttempts)>0||!(status===0||status===408||status===429||status>=500||
       ['NETWORK_UNAVAILABLE','REQUEST_TIMEOUT'].includes(error?.code)))throw error;
  const allowed=await db.allowed(TRADELINK_BOARD_ID,'manage');
  return same()&&allowed===true;
 }
}
// Server-wide TradeLink search is optional. A missing RPC is a capability
// fact for the current loaded application, not a reason to retry a 404 on
// every All Documents refresh. Reload after a backend activation to recheck.
let tradeLinkDocumentsPageRpcUnavailable=false;
async function loadTradeLinkDrafts(seq=routeSerial,pageRequest=null){
 if(!tradeLinkAuthorizedListRoute()||!TL03_DOMAIN_READS_ENABLED||
  state.tradeLinkDraft.busy||(!tradeLinkCanCreate()&&state.tradeLinkSection!=='documents'&&!state.tradeLinkDraft.editRequestId))return;
 const actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  auth.userId===actor&&state.context?.workspace_id===ws;
 const documents=state.tradeLinkSection==='documents';
 const filters=normalizeTradeLinkDraftListFilters(
  pageRequest?.filters??state.tradeLinkDraft.listFilters);
 state.tradeLinkDraft={...state.tradeLinkDraft,
  selectedDocumentIds:[],busy:true,error:''};render();
 try{
  let result,managementCheckError='';
  // Explicit Refresh and intra-app return to All Documents must recover from
  // a previously failed permission read, not just reload the document rows.
  if(documents&&pageRequest?.recheckManage===true){
   let manage=false;
   try{manage=await readTradeLinkManagementAccess();}
   catch{managementCheckError='Management access could not be verified. Select Refresh to retry.';}
   if(!same())return;
   state.boardManage=manage===true;
  }
  if(documents&&!state.boardManage){
   result=await tradeLinkDraftWorkspace.searchPage({
    filters,cursor:pageRequest?.cursor??null});
   if(result.listPage){
    result.listPage={...result.listPage,history:pageRequest?.history??[],
     pageIndex:pageRequest?.pageIndex??0};
   }
   result={...result,
    message:'Showing all TradeLink documents in this workspace.',
    assignedOnly:false,sharedVisibility:true};
  }else if(documents){
   if(!tradeLinkDocumentsPageRpcUnavailable){
    try{
     result=await tradeLinkDraftWorkspace.searchPage({
      filters,cursor:pageRequest?.cursor??null});
     if(result.listPage){
      result.listPage={...result.listPage,history:pageRequest?.history??[],
       pageIndex:pageRequest?.pageIndex??0};
     }
    }catch(err){
     // An absent RPC is not evidence of an empty repository. Cache only
     // confirmed missing-function errors; never swallow a signed denial.
     if(err?.code!=='PGRST202'&&err?.code!=='42883')throw err;
     if(same())tradeLinkDocumentsPageRpcUnavailable=true;
    }
   }
   if(!result){
    if(filters.visibilityMode!=='visible')
     throw new ApiError('Hidden-document listing requires the TradeLink bulk-actions database update. Refresh after that update is deployed.',503);
    result=await tradeLinkDraftWorkspace.list();
    result.listPage=null;
    result.message='Server-wide search is not activated. Showing the current signed 50-record response.';
   }
  }else result=await tradeLinkDraftWorkspace.list();
  if(same()){
   state.tradeLinkDraft={...state.tradeLinkDraft,...result,
    listFilters:filters,listPage:result.listPage??null,
    assignedOnly:false,sharedVisibility:documents,error:managementCheckError,
    message:documents?'Showing all TradeLink documents in this workspace.':result.message,
    selectedDocumentIds:[],documentPreview:null,busy:false};
   const target=state.tradeLinkDraft.editRequestId;
   if(target&&!state.tradeLinkDraft.selected&&tradeLinkDraftRoute()){
    if(!result.rows.some(row=>row.documentId===target)){
     // An exact signed read is authoritative even when a document lies
     // outside the first 50 list entries; it cannot become a fabricated row.
     try{
      const record=await tradeLinkDraftWorkspace.read(target);
      if(!same())return;
      if(!record||record.archived_at!==null||
       !['draft','for-approval','revision-required','approved'].includes(record.workflow_state)||
       record.document_number!==record.content?.documentNumber||
       record.document_type!==record.content?.documentType)
       throw new ApiError('Saved Draft not editable.',409);
      const recoveredRows=[...state.tradeLinkDraft.rows,{
       documentId:record.id,boardItemId:record.board_item_id,
       documentNumber:record.document_number,clientName:record.content?.customerName??null,
       documentType:record.document_type,revision:record.revision,
       workflowState:record.workflow_state,archived:false,
       createdAt:record.created_at,updatedAt:record.updated_at,
       createdByActor:record.created_by===actor
      }];
      recoveredRows.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||
       b.documentId.localeCompare(a.documentId));
      state.tradeLinkDraft.rows=recoveredRows.slice(0,50);
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
 if(!tradeLinkDraftRoute()||!TL03_DOMAIN_READS_ENABLED||!tradeLinkCanEditExisting()||
   state.tradeLinkDraft.busy||state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed)return;
 if(listed.archived||!['draft','for-approval','revision-required','approved'].includes(listed.workflowState)){
  if(state.tradeLinkDraft.editRequestId===documentId){
   state.tradeLinkDraft.error='This document is no longer an editable Draft. Return to All Documents.';
   render();
  }
  return;
 }
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 state.tradeLinkDraft.busy=true;render();
 try{
  const [record,reviewStages]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),
   (state.boardManage||['primary','secondary'].includes(listed.assignedStage))&&
    (listed.workflowState==='for-approval'||['quotation','po'].includes(listed.documentType))?tradeLinkDraftWorkspace.reviewStages(documentId):Promise.resolve(null)
  ]);
  if(seq!==routeSerial||!tradeLinkDraftRoute()||auth.userId!==actor||
   state.context.workspace_id!==ws)return;
  if(!record||!['draft','for-approval','revision-required','approved'].includes(record.workflow_state)||
   record.archived_at!==null||
   record.content?.documentType!==record.document_type||
   record.content?.documentNumber!==record.document_number||
   record.revision!==listed.revision||
   record.board_item_id!==listed.boardItemId||
   record.document_number!==listed.documentNumber||
   record.document_type!==listed.documentType)
   throw new ApiError('Document revision or editability changed. Refresh the signed list.',409);
  state.tradeLinkDraft={...state.tradeLinkDraft,mode:'edit',
   selected:{documentId,record},canEditExisting:true,canEditOwnDraft:record.created_by===actor&&record.workflow_state==='draft',
   reviewStages,pendingCreateId:null,pendingCreateDraft:null,pendingSave:null,lineDrafts:null,formValues:null,unsavedChanges:false,error:'',message:'Signed document loaded. Unsaved edits remain local.'};
 }catch{
  if(seq===routeSerial&&tradeLinkDraftRoute())state.tradeLinkDraft.error=
   'Draft read or authorization failed. Refresh the signed list.';
 }finally{
  if(seq===routeSerial&&tradeLinkDraftRoute()){state.tradeLinkDraft.busy=false;render();}
 }
}

/** Read the exact Board-linked authoritative revision, never local Draft state. */
async function openTradeLinkDocument(documentId,revision=null){
 if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
  !TL03_DOMAIN_READS_ENABLED||state.tradeLinkDraft.sharedVisibility!==true||
  state.tradeLinkDraft.busy||state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 const previous=state.tradeLinkDraft.documentPreview;
 if(!listed||
  (revision!==null&&(!Number.isSafeInteger(revision)||revision<1||
  previous?.documentId!==documentId)))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&auth.userId===actor&&state.context.workspace_id===ws;
 state.tradeLinkDraft.busy=true;render();
 try{
  const canReadOwnedHistory=state.boardManage===true||
   (tradeLinkCanCreate()&&listed.createdByActor===true);
  const [bundle,events,attachments]=await Promise.all([
   tradeLinkDraftWorkspace.revisionBundle(documentId,revision),
   revision===null&&canReadOwnedHistory&&TL03_WORKFLOW_REVIEW_ENABLED?
    tradeLinkDraftWorkspace.history(documentId):Promise.resolve(canReadOwnedHistory?previous?.events??null:null),
   revision===null&&canReadOwnedHistory&&TL03_ATTACHMENTS_ENABLED?
    tradeLinkAttachments.list(documentId):Promise.resolve(canReadOwnedHistory?previous?.attachments??null:null)
  ]);
  if(!same())return;
  const record=bundle?.selected,target=revision??listed.revision;
  if(!bundle||bundle.currentRevision!==listed.revision||!record||
   record.revision!==target||record.board_item_id!==listed.boardItemId||
   record.document_type!==listed.documentType||
   (target===listed.revision&&
    (record.document_number!==listed.documentNumber||record.workflow_state!==listed.workflowState)))
   throw new ApiError('Document revision history changed; refresh the signed list.',409);
  if(revision===null&&canReadOwnedHistory&&TL03_WORKFLOW_REVIEW_ENABLED&&
    (!Array.isArray(events)||events[0]?.revision!==listed.revision))
   throw new ApiError('Signed document history does not match the saved revision.',409);
  let chequeClearance=null;
  if(state.boardManage&&target===listed.revision&&record.document_type==='payment'&&
     ['closed','completed'].includes(record.workflow_state)&&Number(record.content?.chequeAmount)>0){
   try{chequeClearance=await tradeLinkDraftWorkspace.chequeClearance({documentId,expectedRevision:record.revision});}
   catch{ /* Older backend or unavailable status: keep document preview usable. */ }
  }
  if(!same())return;
  state.tradeLinkDraft.documentPreview={
   documentId,record,chequeClearance,
   latestRecord:previous?.documentId===documentId?previous.latestRecord:{
    board_item_id:listed.boardItemId,document_number:listed.documentNumber,revision:listed.revision
   },
   revisions:bundle.revisions,events,attachments
  };
  state.tradeLinkDraft.error='';
  state.tradeLinkDraft.message=bundle.historyAvailable===false?
   'Showing the current signed document. Historical revision history is not yet deployed.':
   'Showing immutable revision '+record.revision+
   (bundle.revisions.find(row=>row.revision===record.revision)?.approved?
    ' · approved and eligible for reprinting.':' · not approved for printing.');
 }catch{
  if(same()){
   state.tradeLinkDraft.documentPreview=previous;
   state.tradeLinkDraft.error='Signed document or revision history could not be verified. Refresh the list.';
  }
 }finally{if(same()){state.tradeLinkDraft.busy=false;render();}}
}
async function openTradeLinkDocumentRevision(documentId,revision){
 return openTradeLinkDocument(documentId,revision);
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
  tradeLinkDraftWorkspace.boardProjection(documentId),tradeLinkAttachments.list(documentId),
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
  !board.items?.some(i=>tradeLinkBoardProjectionMatches(i,{
    boardItemId:receipt.boardItemId,documentNumber:listed.documentNumber,
    updatedAt:record.updated_at}))||
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
async function openTradeLinkAssignedDocument(documentId){
 if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
  state.boardManage||state.tradeLinkDraft.busy||state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed||!['primary','secondary'].includes(listed.assignedStage))return;
 const seq=routeSerial,actor=auth.userId,workspace=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&!state.boardManage&&
  state.context?.workspace_id===workspace&&auth.userId===actor&&auth.isSignedIn;
 state.tradeLinkDraft={...state.tradeLinkDraft,busy:true,error:'',
  message:'Loading the document assigned to your signed account…'};render();
 try{
  const [record,board]=await Promise.all([
   tradeLinkDraftWorkspace.readAssigned(documentId),tradeLinkDraftWorkspace.boardProjection(documentId)
  ]);
  if(!same())return;
  const boardItem=board?.items?.find(item=>item.id===listed.boardItemId);
  if(!record||record.id!==listed.documentId||record.revision!==listed.revision||
   record.workflow_state!==listed.workflowState||record.document_type!==listed.documentType||
   record.document_number!==listed.documentNumber||record.board_item_id!==listed.boardItemId||
   record.archived_at!==null||board?.board?.id!==TRADELINK_BOARD_ID||
   board.board.workspace_id!==workspace||
   !tradeLinkBoardProjectionMatches(boardItem,{
    boardItemId:listed.boardItemId,documentNumber:listed.documentNumber,
    updatedAt:record.updated_at}))
   throw new ApiError('Assigned document, revision or Board projection could not be verified.',409);
  state.tradeLinkDraft={...state.tradeLinkDraft,
   documentPreview:{documentId,record},
   message:'Read-only document preview loaded from the signed TradeLink record. Review the content before validating.'};
 }catch(error){
  if(same())state.tradeLinkDraft.error=errorMessage(error);
 }finally{
  if(same()){state.tradeLinkDraft.busy=false;render();}
 }
}
async function printTradeLinkDocument(documentId,revision=null){
 if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
  !TL03_DOMAIN_READS_ENABLED||!tradeLinkCanCreate()||state.tradeLinkDraft.busy||
  state.tradeLinkDraft.status!=='AUTHORIZED_READ')return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 const targetRevision=revision??listed?.revision;
 if(!listed||(!state.boardManage&&listed.createdByActor!==true)||
  !Number.isSafeInteger(targetRevision)||targetRevision<1)return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&state.context?.workspace_id===ws&&
  auth.userId===actor&&auth.isSignedIn;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 try{
  const [bundle,board]=await Promise.all([
   tradeLinkDraftWorkspace.revisionBundle(documentId,targetRevision),tradeLinkDraftWorkspace.boardProjection(documentId)
  ]);
  if(!same())return;
  const record=bundle?.selected;
  const revisionMeta=bundle?.revisions?.find(row=>row.revision===targetRevision);
  const verifiedApproval=bundle?.historyAvailable===false?
   targetRevision===listed.revision&&record?.workflow_state==='approved':
   revisionMeta?.approved===true&&record?.approved===true&&record.workflow_state==='approved';
  if(!bundle||bundle.currentRevision!==listed.revision||!record||
   record.revision!==targetRevision||record.board_item_id!==listed.boardItemId||
   record.document_type!==listed.documentType||
   (targetRevision===listed.revision&&listed.workflowState!=='approved')||
   record.workflow_state!=='approved'||!verifiedApproval||
   (targetRevision===listed.revision&&record.document_number!==listed.documentNumber)||
   board?.board?.id!==TRADELINK_BOARD_ID||board.board.workspace_id!==ws||
   !board.items?.some(item=>item.id===listed.boardItemId&&item.title===listed.documentNumber))
   throw new ApiError('The requested revision is not a verified Approved TradeLink revision.',409);
  if(!validUuid(record.created_by)||record.created_by!==listed.createdBy||
   record.created_by_name!==listed.createdByName)
   throw new ApiError('The original creator identity does not match the signed document listing.',409);
  const creatorName=record.created_by_name||'';
  const markup=renderTradeLinkSavedDocumentOutput(record,ws,documentId,{creatorName});
  if(!same())return;
  mountTradeLinkSavedDocumentOutput(markup);
 }catch{
  if(same())state.tradeLinkDraft.error=
   'Print preview could not verify the selected Approved revision and Board. Refresh All Documents.';
 }finally{if(same()){state.tradeLinkDraft.busy=false;render();}}
}

async function commitTradeLinkDraft(form){
 if(!tradeLinkDraftRoute()||!tradeLinkDraftReady()||!tradeLinkCanSave()||
  state.tradeLinkDraft.busy)return;
 const seq=routeSerial,actor=auth.userId,ws=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkDraftRoute()&&
  auth.userId===actor&&state.context.workspace_id===ws;
 // Keep the complete original command and receipt in memory until reconciled.
 const previous=state.tradeLinkDraft.pendingSave;
 let recoveryId=tradeLinkRecoveryEnabled&&state.tradeLinkDraft.mode==='create'?tradeLinkRecoveryEditor?.id:null;
 let pending=previous;
 if(!pending){
  const fields=new FormData(form),formValues=Object.fromEntries(fields);
  if(tradeLinkRecoveryEnabled&&state.tradeLinkDraft.mode==='create'){
   captureTradeLinkRecovery(captureRecoveryFields(fields),snapshotTradeLinkDraftLineItems(form));
   recoveryId=tradeLinkRecoveryEditor?.id;
  }
  let command;
  try{
   command=prepareTradeLinkDraftCommand(state.tradeLinkDraft,fields,{actorId:auth.userId,executivePreview:state.context?.profile?.email?.trim().toLowerCase()==='asenagan@watchdogautomation.com.ph'&&state.tradeLinkModuleRole==='General Manager'});
  }catch(err){
   if(same()){
    state.tradeLinkDraft={...state.tradeLinkDraft,formValues,
     lineDrafts:snapshotTradeLinkDraftLineItems(form),
     error:err?.message||'Invalid Draft input. Nothing saved.',message:''};
    render();
    if(err?.message?.startsWith('Invalid Quotation contact email.'))
     root.querySelector('[data-tradelink-draft-form] [name="customerEmail"]')?.focus();
   }
   return;
  }
  const initialState=String(fields.get('documentStatus')||'for-approval');
  if(!['draft','for-approval'].includes(initialState))
   throw new ApiError('Choose For Approval or explicitly choose Draft. Other statuses cannot bypass dual validation.',400);
  pending={command:{documentId:command.documentId,expectedRevision:command.expectedRevision,
   draft:command.draft,initialState,
   ...(command.approvalFreePreview?{approvalFreePreview:true}:{}),
   reviseApproved:state.tradeLinkDraft.selected?.record?.workflow_state==='approved'},
   receipt:null,uncertain:false};
  state.tradeLinkDraft={...state.tradeLinkDraft,
   pendingCreateId:command.expectedRevision===0?command.documentId:null,
   pendingCreateDraft:command.pendingCreateDraft,
   pendingSave:pending,reviewStages:null,
   lineDrafts:command.expectedRevision===0&&command.draft.items?.length?
    command.draft.items:snapshotTradeLinkDraftLineItems(form),formValues};
 }
 const {documentId,expectedRevision,draft,initialState}=pending.command;
 state.tradeLinkDraft={...state.tradeLinkDraft,busy:true,error:'',
  message:pending.receipt?'Verifying saved document…':'Saving document to the signed database…'};
 render();
 let committed=!!pending.receipt;
 let dispatched=false;
 try{
  // A retained receipt means the mutation must not be repeated.
  if(tradeLinkRecoveryEnabled&&expectedRevision===0){
   if(!recoveryId||!await tradeLinkRecovery.checkpointSave(recoveryId,pending))
    throw new ApiError('Local save checkpoint failed. No new request was sent.',400);
   if(!same())return;
  }
  dispatched=!pending.receipt;
  const receipt=pending.receipt||await tradeLinkDraftWorkspace.save(pending.command);
  committed=true;
  pending={...pending,receipt};
  if(tradeLinkRecoveryEnabled&&recoveryId)await tradeLinkRecovery.checkpointSave(recoveryId,pending);
  if(!same())return;
  state.tradeLinkDraft.pendingSave=pending;
  const workflowState=receipt.state;
  const [record,list,board,approvalBundle]=await Promise.all([
   tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.list(),
   tradeLinkDraftWorkspace.boardProjection(documentId),
   workflowState==='approved'?tradeLinkDraftWorkspace.revisionBundle(documentId,receipt.revision):null
  ]);
  if(!same())return;
  const savedDraft={...draft,documentNumber:receipt.documentNumber||draft.documentNumber};
  if(!record||record.revision!==receipt.revision||
   record.board_item_id!==receipt.boardItemId||
   record.document_number!==savedDraft.documentNumber||
   record.content?.documentNumber!==savedDraft.documentNumber||
   record.content?.documentType!==draft.documentType||
   !tradeLinkSavedDraftMatches(record,savedDraft)||
   record.workflow_state!==workflowState||
   (workflowState==='approved'&&(initialState!=='for-approval'||!['quotation','po'].includes(draft.documentType)||
    approvalBundle?.currentRevision!==receipt.revision||approvalBundle?.selected?.board_item_id!==receipt.boardItemId||
    approvalBundle.selected.approval_policy!=='gm-creator-approval-free-v1'||approvalBundle.selected.approved!==true||
    !tradeLinkSavedDraftMatches(approvalBundle.selected,savedDraft)))||
   board?.board?.workspace_id!==ws||
   !board.items?.some(item=>item.id===receipt.boardItemId&&
    item.title===savedDraft.documentNumber))
   throw new ApiError('Saved document/Board projection verification incomplete.',409);
  // The original signed list is bounded to 50. Its absence is not proof
  // that an exactly read and Board-verified saved document was not committed.
  const verifiedList=reconcileTradeLinkSavedListing(list,approvalBundle?{...record,approval_policy:approvalBundle.selected.approval_policy}:record,receipt);
  if(tradeLinkRecoveryEnabled&&recoveryId){
   try{if(!await tradeLinkRecovery.discard(recoveryId))toast('Saved; local recovery cleanup needs attention.',true);}catch{toast('Saved; local recovery cleanup needs attention.',true);}
   if(!same())return;
   tradeLinkRecoveryEditor=null;
  }
  state.tradeLinkDraft={...initialTradeLinkDraftView(),
   status:'AUTHORIZED_READ',rows:verifiedList.rows,
   message:'Saved '+(workflowState==='draft'?'Draft':workflowState==='approved'?'Approved document':'For Approval document')+' revision '+receipt.revision+'; TradeLink, Board items and All Documents are synchronized.'};
  toast('Document '+savedDraft.documentNumber+' saved. Board item and All Documents verified.');
  location.hash=tradeLinkApplicationHref('documents');
 }catch(err){
  if(same()){
   // A rejection of a retry does not prove the original uncertain write failed.
   if(!committed&&!previous?.uncertain&&dispatched&&tradeLinkSaveDefinitelyRejected(err)&&
      (!tradeLinkRecoveryEnabled||!recoveryId||await tradeLinkRecovery.checkpointSave(recoveryId,null))){
    if(!same())return;
    state.tradeLinkDraft.pendingSave=null;
    state.tradeLinkDraft.pendingCreateId=null;
    state.tradeLinkDraft.pendingCreateDraft=null;
   }else{
    state.tradeLinkDraft.pendingSave={...pending,uncertain:!committed&&(dispatched||!!previous?.uncertain)};
   }
   state.tradeLinkDraft.error=!dispatched&&!committed?
    'Local preservation failed. No new save request was sent. Retry Save to preserve the original command.':
    previous?.uncertain&&!committed?'Original save outcome remains uncertain. Retry the original transaction.':tradeLinkDraftSaveFailureMessage(err,{committed});
   state.tradeLinkDraft.message='';
  }
 }finally{
  if(same()){
   state.tradeLinkDraft.busy=false;
   render();
   if(state.tradeLinkDraft.error?.startsWith('Invalid Quotation contact email.'))
    root.querySelector('[data-tradelink-draft-form] [name="customerEmail"]')?.focus();
  }
 }
}
/** Advisory readiness preview; existing signed read, no mutation or new gate. */
async function checkTradeLinkDocumentReadiness(documentId){
 if(!TL03_WORKFLOW_SUBMIT_ENABLED||!tradeLinkAuthorizedListRoute()||
  state.tradeLinkSection!=='documents'||state.tradeLinkDraft.busy||
  state.tradeLinkDraft.status!=='AUTHORIZED_READ'||!state.boardManage)return;
 const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
 if(!listed||listed.archived||
  !['draft','revision-required'].includes(listed.workflowState))return;
 const seq=routeSerial,actor=auth.userId,workspace=state.context.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  state.tradeLinkSection==='documents'&&auth.userId===actor&&
  state.context?.workspace_id===workspace;
 state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
 try{
  const record=await tradeLinkDraftWorkspace.read(documentId);
  if(!same())return;
  if(!record||record.id!==listed.documentId||
    record.revision!==listed.revision||record.workflow_state!==listed.workflowState||
    record.document_number!==listed.documentNumber||
    record.document_type!==listed.documentType||
    record.board_item_id!==listed.boardItemId||record.archived_at!==null)
   throw new ApiError('The signed document changed; refresh All Documents.',409);
  state.tradeLinkDraft.message=summarizeTradeLinkSubmitReadiness({...record,approval_policy:listed.approvalPolicy});
 }catch(err){
  if(same())state.tradeLinkDraft.error=
   'Submit readiness could not be verified. Refresh the signed document before trying again.';
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
   tradeLinkDraftWorkspace.boardProjection(documentId)
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
    !board.items?.some(item=>tradeLinkBoardProjectionMatches(item,{
      boardItemId:receipt.boardItemId,documentNumber:listed.documentNumber,
      updatedAt:record.updated_at})))
   throw new ApiError('TradeLink submitted state or Board verification incomplete.',409);
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
   tradeLinkDraftWorkspace.boardProjection(documentId),tradeLinkDraftWorkspace.history(documentId)
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
    !board.items?.some(i=>tradeLinkBoardProjectionMatches(i,{
      boardItemId:receipt.boardItemId,documentNumber:listed.documentNumber,
      updatedAt:record.updated_at})))
   throw new ApiError('Signed TradeLink review/audit synchronization incomplete.',409);
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
   tradeLinkDraftWorkspace.boardProjection(documentId),tradeLinkDraftWorkspace.history(documentId)
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
   !board.items?.some(item=>tradeLinkBoardProjectionMatches(item,{
     boardItemId:receipt.boardItemId,documentNumber:listed.documentNumber,
     updatedAt:record.updated_at})))
   throw new ApiError('Signed TradeLink decision/audit/Board reconciliation incomplete.',409);
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
   tradeLinkDraftWorkspace.boardProjection(documentId),tradeLinkDraftWorkspace.history(documentId)
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
   !board.items?.some(item=>tradeLinkBoardProjectionMatches(item,{
     boardItemId:receipt.boardItemId,documentNumber:listed.documentNumber,
     updatedAt:record.updated_at})))
   throw new ApiError('Signed TradeLink operational/Board/audit reconciliation incomplete.',409);
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
async function applyTradeLinkDocumentBulkAction(operation){
 if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
  !state.boardManage||state.tradeLinkDraft?.status!=='AUTHORIZED_READ'||
  state.tradeLinkDraft.busy||!['hide','unhide','delete'].includes(operation))return;
 updateTradeLinkDocumentSelection(root.querySelector('[data-tradelink-domain-list]'));
 const selectedIds=[...new Set(state.tradeLinkDraft.selectedDocumentIds||[])];
 if(!selectedIds.length||selectedIds.length>50)return;
 const selectedSet=new Set(selectedIds);
 const documents=state.tradeLinkDraft.rows.filter(row=>selectedSet.has(row.documentId));
 if(documents.length!==selectedIds.length||documents.some(row=>
  !Number.isSafeInteger(row.revision)||row.revision<1||
  (operation==='hide'&&row.hidden===true)||
  (operation==='unhide'&&row.hidden!==true))) {
  state.tradeLinkDraft={...state.tradeLinkDraft,
   error:'The selected documents changed or no longer match this view. Refresh All Documents before retrying.'};
  render();return;
 }
 if(operation==='delete'&&!globalThis.confirm(
  'Delete '+documents.length+' selected document(s)? They will be removed from All Documents and the linked Board view. Their immutable audit and revision history will be retained. This action cannot be undone from the interface.'
 ))return;
 const seq=routeSerial,actor=auth.userId,ws=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
  auth.userId===actor&&state.context?.workspace_id===ws&&
  state.tradeLinkSection==='documents';
 const pageFilters=state.tradeLinkDraft.listPage?.appliedFilters||
  state.tradeLinkDraft.listFilters;
 state.tradeLinkDraft={...state.tradeLinkDraft,busy:true,error:''};render();
 let committed=false;
 try{
  await tradeLinkDraftWorkspace.bulkAction({action:operation,documents:documents.map(row=>({
   documentId:row.documentId,revision:row.revision
  }))});
  committed=true;
  if(!same())return;
  state.tradeLinkDraft={...state.tradeLinkDraft,busy:false,selectedDocumentIds:[]};
  await loadTradeLinkDrafts(seq,{cursor:null,history:[],pageIndex:0,filters:pageFilters});
  if(!same())return;
  if(state.tradeLinkDraft.status==='AUTHORIZED_READ'){
   const label=operation==='hide'?'hidden':operation==='unhide'?'restored':'deleted';
   toast(documents.length+' TradeLink document(s) '+label+'.');
  }else{
   state.tradeLinkDraft.error='The bulk action was committed, but All Documents could not be refreshed. Refresh the listing before continuing.';
  }
 }catch(error){
  if(same())state.tradeLinkDraft={...state.tradeLinkDraft,
   error:committed?
    'The bulk action was committed, but its readback could not be verified. Refresh All Documents before retrying.':
    tradeLinkDraftSaveFailureMessage(error)};
 }finally{
  if(same()&&state.tradeLinkDraft.busy){
   state.tradeLinkDraft={...state.tradeLinkDraft,busy:false};render();
  }else if(same())render();
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
   tradeLinkDraftWorkspace.list(),tradeLinkDraftWorkspace.boardProjection(documentId),
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
  state.tradeLinkDraft={...initialTradeLinkDraftView(),...list,
   message:'Signed Draft '+operation+' confirmed at revision '+receipt.revision+'.'};
  toast('TradeLink Draft '+operation+' confirmed.');
  if(state.tradeLinkSection==='drafts')
   location.hash=tradeLinkApplicationHref('documents');
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
/** Signed, workspace-scoped FuelTrack module Admin audit read. */
/** Optional signed FuelTrack RPC read. Until the migration is activated,
 * missing endpoints never enable mutations or fabricate transactional data.
 */
/** Perform only server-authorized FuelTrack transitions with current signed revision. */
/**
 * Attach a real receipt to an already completed FuelTrack request when its
 * original completion did not include a receipt. This surfaces the existing
 * signed Admin receipt RPCs; it does not change roles, grants or server policy.
 */
async function attachFuelTrackReceipt(requestId,file){
 const actor=state.context?.user_id,workspaceId=state.context?.workspace_id,seq=routeSerial;
 const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===actor&&
  state.context?.user_id===actor&&state.context?.workspace_id===workspaceId&&
  state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection==='lightfuels'&&
  state.boardId===FUELTRACK_V3_ID&&state.board?.board?.workspace_id===workspaceId;
 const snapshot=state.fuelTrackBackend?.snapshot;
 if(!same()||!validUuid(requestId)||state.fuelTrackBackendBusy||
    snapshot?.role!=='Admin'||
    !snapshot.rows?.some(row=>row.id===requestId&&row.state==='completed'))return;
 try{validFuelTrackReceiptFile(file);}
 catch(error){toast(errorMessage(error));return;}
 state.fuelTrackBackendBusy=true;
 render();
 let registered=false;
 try{
  const storage=new FuelTrackV3ReceiptStorageClient({api:db,auth,
   boardId:FUELTRACK_V3_ID,workspaceId});
  const existing=await storage.read(requestId);
  if(!same())return;
  if(existing.status==='VERIFIED_RECEIPT'){
   toast('A private receipt is already registered. Use Get receipt link or Verify file.');
   return;
  }
  if(existing.status!=='NO_RECEIPT')
   throw new Error('Receipt status could not be verified. Refresh before retrying.');
  await storage.uploadAndRegister(requestId,file);
  registered=true;
  if(!same())return;
  const proof=await storage.verifyPrivateReceiptBinary(requestId);
  if(!same())return;
  state.fuelTrackReceiptLink=null;
  toast('Private receipt uploaded and verified: '+proof.mimeType+' · '+proof.bytes+' bytes.');
 }catch(error){
  if(same())toast(registered?
   'Receipt registered, but private binary verification failed: '+errorMessage(error):
   'Private receipt attachment failed: '+errorMessage(error));
 }finally{
  if(same()){state.fuelTrackBackendBusy=false;render();}
 }
}

async function mutateFuelTrackBackend(operation,requestId,{reason=null,amount=null,liters=null,receiptNumber=null,receiptFile=null}={}){
 const user=state.context?.user_id,ws=state.context?.workspace_id,seq=routeSerial;
 const expectedSection=operation==='decide'?'approvals':'lightfuels';
 const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===user&&
  state.context?.user_id===user&&state.context?.workspace_id===ws&&
  state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection===expectedSection&&
  state.boardId===FUELTRACK_V3_ID&&state.board?.board?.workspace_id===ws;
 const snapshot=state.fuelTrackBackend?.snapshot;
 if(!same()||state.fuelTrackBackendBusy||
  !snapshot||snapshot.role!=='Admin')return;
 const record=snapshot.rows?.find(r=>r.id===requestId);
 if(!record||!Number.isSafeInteger(Number(record.revision))||Number(record.revision)<1)return;
 if(operation==='decide'&&record.state!=='submitted')return;
 if(operation==='mark'&&record.state!=='approved')return;
 if(operation==='complete'&&record.state!=='refueling_done')return;
 const client=new FuelTrackV3DomainClient({api:db,auth,boardId:FUELTRACK_V3_ID,workspaceId:ws});
 state.fuelTrackBackendBusy=true;
 try{
  const params={requestId,expectedRevision:Number(record.revision)};
  if(operation==='decide')await client.decide({...params,decision:reason===null?'approved':'rejected',reason});
  else if(operation==='mark')await client.markRefueled(params);
  else if(operation==='complete'){
   if(receiptFile){
    validFuelTrackReceiptFile(receiptFile);
    const storage=new FuelTrackV3ReceiptStorageClient({api:db,auth,
      boardId:FUELTRACK_V3_ID,workspaceId:ws});
    const existing=await storage.read(requestId);
    if(!same())return;
    if(existing.status==='NO_RECEIPT')await storage.uploadAndRegister(requestId,receiptFile);
    else if(existing.status==='VERIFIED_RECEIPT')
     toast('Existing private receipt retained for this request.');
    if(!same())return;
   }
   await client.complete({...params,actualAmount:amount,fuelLiters:liters,receiptNumber});
  }
  if(!same())return;
  const next=await client.read({limit:200});
  if(!same())return;
  state.fuelTrackBackend={snapshot:next,analytics:null};
  state.fuelTrackBackendError='';
  if(operation==='mark'&&state.fuelTrackRefuelingDialog?.id===requestId)
   state.fuelTrackRefuelingDialog={id:requestId,stage:'details'};
  if(operation==='complete'&&state.fuelTrackRefuelingDialog?.id===requestId)
   state.fuelTrackRefuelingDialog=null;
  state.fuelTrackBackendBusy=false;
  render();toast('FuelTrack transaction saved.');
  return true;
 }catch(err){
  if(same()){
   state.fuelTrackBackendError=errorMessage(err);
   toast('FuelTrack transaction failed: '+errorMessage(err));
  }
 }finally{if(same())state.fuelTrackBackendBusy=false;}
}

async function loadFuelTrackBackend(seq=routeSerial){
 const userId=state.context?.user_id,ws=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===userId&&
  state.context?.user_id===userId&&state.context?.workspace_id===ws&&
  state.view==='board'&&state.tab==='fueltrack'&&state.boardId===FUELTRACK_V3_ID&&
  isFuelTrackV3ApplicationBoard(state.board?.board)&&
  state.board?.board?.workspace_id===ws;
 if(!same())return;
 state.fuelTrackBackend=null;
 state.fuelTrackBackendError='';
 state.fuelTrackBackendBusy=true;render();
 try{
  const native=await db.nativeApplicationBoardContext('fueltrack-plus');
  if(native?.board?.id!==FUELTRACK_V3_ID||native.workspaceId!==ws)
   throw new ApiError('FuelTrack native application workspace is unavailable.',403);
  if(!same())return;
  const client=new FuelTrackV3DomainClient({api:db,auth,boardId:FUELTRACK_V3_ID,workspaceId:ws});
  const snapshot=await client.read({limit:200});
  if(!same())return;
  let analytics=null;
  if(state.fuelTrackSection==='analytics'){
   analytics=await client.analytics({days:({'week':7,'month':30,'six-months':180,'all':365}[state.fuelTrackAnalyticsRange]||365)});
   if(!same())return;
  }
  state.fuelTrackBackend={snapshot,analytics};
  const pending=pendingNativeSearchSelection?.applicationId==='fueltrack'&&
   pendingNativeSearchSelection.userId===userId&&
   pendingNativeSearchSelection.workspaceId===ws&&
   pendingNativeSearchSelection.boardId===FUELTRACK_V3_ID?pendingNativeSearchSelection:null;
  if(pending&&snapshot.rows.some(row=>row.id===pending.recordId)){
   state.fuelTrackSection='requests';
   state.fuelTrackRequestFilters={...FUELTRACK_REQUEST_FILTER_DEFAULTS,
    search:'',status:'all',expandedId:pending.recordId};
   pendingNativeSearchSelection=null;
  }
 }catch(err){
  if(same()){
   state.fuelTrackBackend=null;
   state.fuelTrackBackendError=errorMessage(err);
  }
 }finally{if(same()){state.fuelTrackBackendBusy=false;render();}}
}

async function loadFuelTrackActivity(seq=routeSerial){
 const userId=state.context?.user_id,workspaceId=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===userId&&
   state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
   state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection==='activity'&&
   state.boardId===FUELTRACK_V3_ID&&isFuelTrackV3ApplicationBoard(state.board?.board)&&
   state.board?.board?.workspace_id===workspaceId;
 if(!same()||state.fuelTrackActivityBusy)return;
 state.fuelTrackActivityBusy=true;state.fuelTrackActivityError='';render();
 try{
  const native=await db.nativeApplicationBoardContext('fueltrack-plus');
  if(native?.board?.id!==FUELTRACK_V3_ID||native.workspaceId!==workspaceId)
   throw new ApiError('FuelTrack native application activity scope is unavailable.',403);
  if(!same())return;
  // The existing signed audit contract is Admin-only. User roles can open
  // the Activity reference but should not issue a predictably denied RPC.
  // This changes request scheduling only; no grants or role checks are added.
  if(native.role!=='Admin'){
   state.fuelTrackActivity=null;
   state.fuelTrackActivityError='';
   return;
  }
  const rows=(await new FuelTrackV3DomainClient({api:db,auth,
    boardId:FUELTRACK_V3_ID,workspaceId}).audit({limit:200})).events;
  if(!same())return;
  if(!Array.isArray(rows))throw new ApiError('Unexpected FuelTrack activity response.',502);
  const snapshot={status:'VERIFIED_READ',boardId:FUELTRACK_V3_ID,workspaceId,events:rows};
  if(!fuelTrackActivityModel({snapshot,boardId:FUELTRACK_V3_ID,workspaceId}))
   throw new ApiError('Invalid FuelTrack activity response.',502);
  state.fuelTrackActivity=snapshot;
 }catch(err){
  if(same()){state.fuelTrackActivity=null;state.fuelTrackActivityError=errorMessage(err);}
 }finally{if(same()){state.fuelTrackActivityBusy=false;render();}}
}

async function loadTradeLinkActivity(seq=routeSerial){
 const userId=state.context?.user_id,workspaceId=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===userId&&
  state.view==='board'&&state.tab==='tradelink'&&
  state.boardId===TRADELINK_BOARD_ID&&state.tradeLinkSection==='activity'&&
  state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
  state.board?.board?.workspace_id===workspaceId;
 if(!same()||state.tradeLinkActivityBusy)return;
 state.tradeLinkActivityBusy=true;state.tradeLinkActivityError='';render();
 try{
  const events=await db.rpc('tl03_native_activity',{p_limit:100});
  if(!Array.isArray(events)||events.length>100)
   throw new ApiError('TradeLink application activity response is invalid.',409);
  if(!same())return;
  state.tradeLinkActivity=events;
 }catch(err){
  if(same()){state.tradeLinkActivity=null;state.tradeLinkActivityError=errorMessage(err);}
 }finally{if(same()){state.tradeLinkActivityBusy=false;render();}}
}
async function loadTradeLinkAnalytics(seq=routeSerial){
 const userId=state.context?.user_id,workspaceId=state.context?.workspace_id;
 const same=()=>seq===routeSerial&&auth.isSignedIn&&
  state.view==='board'&&state.tab==='tradelink'&&
  state.boardId===TRADELINK_BOARD_ID&&state.tradeLinkSection==='analytics'&&
  state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
  state.board?.board?.workspace_id===workspaceId&&state.boardManage===true;
 if(!same()||state.tradeLinkAnalyticsBusy)return;
 if(!TL03_ANALYTICS_ENABLED){
  state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError='';render();return;
 }
 const run=++state.tradeLinkAnalyticsRunId;
 state.tradeLinkAnalyticsBusy=true;state.tradeLinkAnalyticsError='';render();
 try{
  if(!same())return;
  // The existing signed TradeLink manager session is revalidated by the
  // domain client; avoid duplicate permission round-trips here.
  const summary=await tradeLinkDraftWorkspace.analyticsSummary();
  if(!same())return;
  state.tradeLinkAnalytics=summary;
 }catch(err){
  if(same()){state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError=errorMessage(err);}
 }finally{
  // A route can change while the signed read is in flight. Always release
  // this request's busy state, but never clear a newer request's indicator.
  if(run===state.tradeLinkAnalyticsRunId){
   state.tradeLinkAnalyticsBusy=false;
   const routeStillAnalytics=auth.isSignedIn&&auth.userId===userId&&
    state.view==='board'&&state.tab==='tradelink'&&state.boardId===TRADELINK_BOARD_ID&&
    state.tradeLinkSection==='analytics'&&state.context?.user_id===userId&&
    state.context?.workspace_id===workspaceId&&
    state.board?.board?.workspace_id===workspaceId&&state.boardManage===true;
   render();
   // If an overlapping route event invalidated the original route sequence
   // but returned to Analytics, issue one fresh read for the current route.
   if(routeStillAnalytics&&seq!==routeSerial)
    void loadTradeLinkAnalytics(routeSerial);
  }
 }
}
function timeTrackerClockOnlyForRoute(identity,workspaceId,boardId){
 if(state.ttView!=='clock')return false;
 const pending=pendingNativeSearchSelection;
 const hasPendingRecord=pending?.applicationId==='timetracker'&&
  ['Attendance session','Overtime request'].includes(pending.recordType)&&
  pending.userId===identity&&pending.workspaceId===workspaceId&&
  pending.boardId===boardId;
 return !hasPendingRecord;
}
async function loadTimeTracker(seq=routeSerial,nativeContext=null){
 if(state.view!=='board'||state.tab!=='attendance'||
    moduleByBoardName(state.board?.board?.name)?.key!=='timetracker')return;
 const run=++state.ttRunId,identity=state.context?.user_id,ws=state.context?.workspace_id;
 const clockOnly=timeTrackerClockOnlyForRoute(identity,ws,state.boardId);
 restoreTimeTrackerClockPending();
 // Normal Clock loading never probes browser geolocation.
 state.ttGeoPromptVisible=false;state.ttGeoMessage='';state.ttGeoPermission='unknown';
 if(state.ttClockPending&&(state.ttClockPending.userId!==identity||
  state.ttClockPending.workspaceId!==ws||state.ttClockPending.boardId!==state.boardId))
  state.ttClockPending=null;
 state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';
 state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttLogSelectedIds=[];state.ttLogAdminEditor=null;state.ttLogAdminDeleteConfirm=null;state.ttLogAdminBusy=false;state.ttLogAdminError='';state.ttLogAdminSuccess='';state.ttOtExpandedRequestIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
 state.ttReadLoading=true;state.ttBusy=true;state.ttError='';render();
 try{
  const snapshot=await timeTracker.snapshot(state.boardId,{
   clockOnly,nativeContext
  });
  if(run===state.ttRunId&&seq===routeSerial&&auth.isSignedIn&&
    state.context?.user_id===identity&&state.context?.workspace_id===ws)
   {state.ttAttendance=snapshot;
    if(['SHARED_LOGIN','SHARED_DISABLED','SERVICE_UNAVAILABLE','SETUP_REQUIRED'].includes(snapshot.ojtRoster?.mode))
     state.ttView='clock';
    if(state.ttView==='employees'&&(snapshot?.status!=='VERIFIED_READ'||!canViewTimeTrackerEmployees(snapshot.access))){
     state.ttView='clock';state.ttEmployeesTab='directory';state.ttEmployeesSearch='';state.ttEmployeesDepartment='';
    }
    const ojtScope=timeTrackerOjtScope();
    if(!ojtScope||!state.ttOjtSelected||
      state.ttOjtSelected.scope.userId!==ojtScope.userId||
      state.ttOjtSelected.scope.workspaceId!==ojtScope.workspaceId||
      state.ttOjtSelected.scope.boardId!==ojtScope.boardId){
     clearTimeTrackerOjtSelection();
    }else{
     try{
      state.ttOjtSnapshot=await timeTrackerOjt.snapshot(ojtScope,state.ttOjtSelected.id);
      state.ttOjtPending=false;
     }catch{
      clearTimeTrackerOjtSelection();
      state.ttOjtError='The selected intern is no longer active. Select your name again.';
     }
    }
    if(state.ttView==='clock')ttClockLastCheckAt=Date.now();
    // An earlier bootstrap/read error must not remain visible after a
    // verified signed attendance snapshot. Preserve uncertain-write warnings.
    if(snapshot?.status==='VERIFIED_READ'&&!state.ttClockPending)
     state.ttError='';
    const pending=pendingNativeSearchSelection?.applicationId==='timetracker'&&
     pendingNativeSearchSelection.userId===identity&&
     pendingNativeSearchSelection.workspaceId===ws&&
     pendingNativeSearchSelection.boardId===state.boardId?pendingNativeSearchSelection:null;
    if(pending){
     if(pending.recordType==='Attendance session'&&
       (snapshot.log?.rows||snapshot.records||[]).some(row=>row.id===pending.recordId)){
      state.ttView='log';state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS,search:'',period:'all'};
      state.ttLogExpandedIds=[pending.recordId];
     }else if(pending.recordType==='Overtime request'){
      const request=(snapshot.otRequests||[]).find(row=>row.id===pending.recordId);
      if(request){
       const currentWeek=timeTrackerOtWeek(0);
       const offset=Math.floor((Date.parse(request.date+'T00:00:00Z')-
        Date.parse(currentWeek.start+'T00:00:00Z'))/604800000);
       state.ttView='ot';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS,weekOffset:offset,
        status:['Submitted','Approved','Rejected'].includes(request.status)?request.status:'Submitted',search:''};
       state.ttOtExpandedRequestIds=[pending.recordId];
      }
     }
     pendingNativeSearchSelection=null;
    }
    if(state.ttClockPending)reconcileTimeTrackerClock(snapshot,{
     resolveUncommittedClockIn:true
    });}
 }catch(err){
  if(run===state.ttRunId&&seq===routeSerial){
   state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttError=errorMessage(err);
  }
 }finally{
  if(run===state.ttRunId&&seq===routeSerial){
   state.ttReadLoading=false;state.ttBusy=false;render();
    // The first platform reconciliation can be deferred while this signed
   // attendance snapshot protects the visible TimeTracker controls. Resume it
   // immediately after the read, unless another local edit is still active.
   if(shouldResumeDeferredReconciliation(platformSync.lastStatus,{
    blocked:platformSyncEditInProgress()
   }))void platformSync.syncNow('manual',[]);
   if(state.ttAttendance?.autoClockout?.status==='PENDING_GPS')
    void runPendingTimeTrackerAutoClockout({state,seq,getRouteSerial:()=>routeSerial,
     identity,workspaceId:ws,boardId:state.boardId,auth,navigator,
     captureAttendanceGeo,timeTracker,render,formatTimeTrackerAutoClockoutTime,errorMessage});
  }
 }
}
/** The UI guard is presentation only; both RPCs independently enforce System Admin. */
function timeTrackerAdminLogReady(){
 return auth.isSignedIn&&state.view==='board'&&state.tab==='attendance'&&
  state.ttView==='log'&&state.ttAttendance?.status==='VERIFIED_READ'&&
  ['System Admin','IT Administrator'].includes(state.ttAttendance?.access?.moduleRole)&&
  state.context?.user_id===auth.userId&&
  state.ttAttendance.access?.userId===auth.userId&&
  state.ttAttendance.access?.workspaceId===state.context?.workspace_id&&
  state.ttAttendance.access?.boardId===state.boardId&&
  state.board?.board?.workspace_id===state.context?.workspace_id&&
  moduleByBoardName(state.board?.board?.name)?.key==='timetracker';
}
function timeTrackerOjtLogAdminScope(){
 if(!timeTrackerAdminLogReady()||!state.ttAttendance?.ojtAdminAttendance)return null;
 const a=state.ttAttendance.access;
 return {userId:a.userId,workspaceId:a.workspaceId,boardId:a.boardId};
}
async function openTimeTrackerAdminEditor(recordIds,mode='single',{timeOnly=false,manualClockout=false}={}){
 if(manualClockout&&state.ttAttendance?.access?.moduleRole!=='System Admin')return;
 if(!timeTrackerAdminLogReady()||state.ttLogAdminBusy)return;
 if(timeOnly&&mode!=='single')return;
 if(state.ttAttendance.access.moduleRole!=='System Admin'&&mode!=='single')return;
 const ids=[...new Set(recordIds||[])];
 if(ids.some(id=>String(id).startsWith('ojt:'))){
  const scope=timeTrackerOjtLogAdminScope();
  const preview=state.ttAttendance?.ojtAdminAttendance?.records?.find(row=>'ojt:'+row.id===ids[0]);
  if(!scope||mode!=='single'||ids.length!==1||!preview||
     !timeTrackerLogRowsForSnapshot(state.ttAttendance).some(row=>row.isOjt&&row.id===ids[0])){
   state.ttLogAdminError='Select one authorized intern attendance record.';render();return;
  }
  const identity=scope.userId,boardId=scope.boardId,seq=routeSerial;
  const editor={ojt:true,mode:'single',manualClockout,
   timeOnly:timeOnly||state.ttAttendance.access.moduleRole==='IT Administrator',
   record:preview,recordIds:ids,revision:null,verifying:true,
   actorId:identity,workspaceId:scope.workspaceId,boardId};
  // Present the editor immediately and wait for a fresh signed revision before writes.
  state.ttLogAdminEditor=editor;
  state.ttLogAdminBusy=true;state.ttLogAdminError='';state.ttLogAdminSuccess='';render();
  try{
   const signed=await timeTrackerOjt.adminAttendance(scope);
   if(seq!==routeSerial||!timeTrackerOjtLogAdminScope()||
      state.context?.user_id!==identity||state.boardId!==boardId||
      state.ttLogAdminEditor!==editor)return;
   const row=signed.records.find(item=>'ojt:'+item.id===ids[0]);
   if(!row)throw Error('Intern attendance was changed or removed. Refresh Logs.');
   const revision=Number.isSafeInteger(row.revision)&&row.revision>=1?row.revision:null;
   state.ttLogAdminEditor={...editor,record:row,revision,verifying:false};
   if(revision===null)
    state.ttLogAdminError='Signed OJT editing requires database migration 20261123150000_cp_tt_ojt_admin_record_management.sql. Deploy it, then refresh Logs.';
  }catch(err){
   if(seq===routeSerial&&state.boardId===boardId&&state.ttLogAdminEditor===editor){
    state.ttLogAdminEditor={...editor,verifying:false};
    state.ttLogAdminError='Unable to verify OJT editing permissions: '+errorMessage(err);
   }
  }finally{
   if(seq===routeSerial&&state.boardId===boardId){
    state.ttLogAdminBusy=false;render();
    root.querySelector('#tt-attendance-admin-form input[name="clockInAt"]')?.focus();
   }
  }
  return;
 }
 if(!ids.length||ids.length>TT_ADMIN_RECORD_LIMIT||
    (mode==='single'&&ids.length!==1)||
    ids.some(id=>!(state.ttAttendance.log?.rows||[]).some(row=>row.id===id))){
  state.ttLogAdminError='Select valid attendance records before editing.';render();return;
 }
 const identity=state.context.user_id,workspace=state.context.workspace_id,boardId=state.boardId,seq=routeSerial;
 state.ttLogAdminBusy=true;state.ttLogAdminError='';state.ttLogAdminSuccess='';render();
 try{
  const snapshot=await timeTracker.attendanceAdminRecords(boardId,ids);
  if(seq!==routeSerial||!timeTrackerAdminLogReady()||state.context?.user_id!==identity||
     state.context?.workspace_id!==workspace||state.boardId!==boardId)return;
  state.ttLogAdminEditor={mode,manualClockout,timeOnly:timeOnly||state.ttAttendance.access.moduleRole==='IT Administrator',
   recordIds:ids,records:snapshot.records,
   directory:snapshot.directory,revision:snapshot.revision,
   actorId:snapshot.actorId,workspaceId:snapshot.workspaceId,boardId:snapshot.boardId};
 }catch(err){
  if(seq===routeSerial&&state.boardId===boardId)state.ttLogAdminError=errorMessage(err);
 }finally{
  if(seq===routeSerial&&state.boardId===boardId){state.ttLogAdminBusy=false;render();if(state.ttLogAdminEditor)root.querySelector('#tt-attendance-admin-form select')?.focus();}
 }
}
async function saveTimeTrackerAdminEditor(form){
 if(!form||form.id!=='tt-attendance-admin-form'||!timeTrackerAdminLogReady()||
    state.ttLogAdminBusy||!state.ttLogAdminEditor)return;
 if(!form.reportValidity())return;
 const editor=state.ttLogAdminEditor;
 if(editor.mode==='manual'){
  if(!editor.signedCreateReady||editor.uncertain||state.ttAttendance.access.moduleRole!=='System Admin'||
     editor.actorId!==auth.userId||editor.workspaceId!==state.context?.workspace_id||
     editor.boardId!==state.boardId){
   state.ttLogAdminError='Signed manual attendance creation is unavailable. No record was saved.';render();return;
  }
  let entry;
  try{entry=validateManualAttendanceForm(form,editor);}
  catch(err){state.ttLogAdminError=errorMessage(err);render();return;}
  const seq=routeSerial,boardId=state.boardId;
  state.ttLogAdminBusy=true;state.ttLogAdminError='';render();
  try{
   let receipt;
   if(entry.status==='active'){
    if(editor.capability?.activeReady!==true)
     throw Error('Regular employee auto clock-out is not active. Today’s manual clock-in is unavailable.');
    receipt=await timeTracker.createManualClockIn(boardId,entry,editor.revision);
   }else{
    if(editor.capability?.historicalReady!==true)
     throw Error('Historical attendance creation is unavailable.');
    editor.requestId=editor.requestId||globalThis.crypto?.randomUUID?.();
    if(!editor.requestId)throw Error('Secure historical attendance request ID generation is unavailable.');
    receipt=await timeTracker.createHistoricalAttendance(boardId,entry,editor.revision,editor.requestId);
   }
   if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerAdminLogReady())return;
   state.ttLogAdminEditor=null;state.ttLogAdminBusy=false;
   await loadTimeTracker(seq);
   if(seq!==routeSerial||state.boardId!==boardId)return;
   const visible=state.ttAttendance?.status==='VERIFIED_READ'&&
    (state.ttAttendance.log?.rows||[]).some(row=>row.id===receipt.recordId);
   if(entry.status==='active')
    state.ttLogAdminSuccess=visible?
     'Manual clock-in recorded. The employee can refresh their Clock.':
     'Clock-in committed. Refresh the signed Log before another change.';
   else
    state.ttLogAdminSuccess=visible?
     (receipt.clockOutMethod==='standard_nine_credited_hours'?
      'Historical attendance recorded. Clock-out was system-calculated at nine credited hours. The employee’s current Clock is unchanged.':
      'Historical attendance recorded with the admin-entered actual clock-out. The employee’s current Clock is unchanged.'):
     'Historical attendance committed. Refresh the signed Log before another change.';
  }catch(err){
   if(seq===routeSerial&&state.boardId===boardId&&state.ttLogAdminEditor===editor){
    editor.uncertain=true;
    state.ttLogAdminError=errorMessage(err)+' Refresh the signed Log before retrying.';
   }
  }finally{
   if(seq===routeSerial&&state.boardId===boardId){state.ttLogAdminBusy=false;render();}
  }
  return;
 }
 if(editor.actorId!==auth.userId||editor.workspaceId!==state.context?.workspace_id||
    editor.boardId!==state.boardId){
  state.ttLogAdminError='Signed workspace changed. Reopen the attendance editor.';render();return;
 }
 if(editor.manualClockout){
  if(state.ttAttendance.access.moduleRole!=='System Admin')return;
  const draft=new FormData(form);
  editor.clockOutDraft=String(draft.get('clockOutAt')||'');
  editor.clockOutDateDraft=String(draft.get('clockOutDate')||'');
 }
 if(editor.ojt){
  const scope=timeTrackerOjtLogAdminScope();
  if(!scope||editor.mode!=='single'||editor.actorId!==scope.userId||
     editor.workspaceId!==scope.workspaceId||editor.boardId!==scope.boardId){
   state.ttLogAdminError='Signed OJT scope changed. Reopen the attendance editor.';render();return;
  }
  if(!Number.isSafeInteger(editor.revision)||editor.revision<1){
   state.ttLogAdminError='Signed OJT editing is not active. Deploy the OJT admin migration and refresh Logs.';render();return;
  }
  let ojtPlan;
  try{
   ojtPlan=editor.manualClockout?buildTimeTrackerManualClockOut(new FormData(form),editor.record):buildTimeTrackerOjtAdminPatch(new FormData(form),{
    record:editor.record,timeOnly:editor.timeOnly});
  }catch(err){state.ttLogAdminError=errorMessage(err);render();return;}
  const seq=routeSerial,boardId=scope.boardId;
  state.ttLogAdminBusy=true;state.ttLogAdminError='';render();
  try{
   await timeTrackerOjt.mutateAdminRecord(scope,{
    recordId:editor.record.id,action:editor.timeOnly?'correct-time':'edit',
    patch:ojtPlan.patch,reason:ojtPlan.reason,expectedRevision:editor.revision
   });
   if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerOjtLogAdminScope())return;
   state.ttLogAdminEditor=null;state.ttLogSelectedIds=[];state.ttLogAdminBusy=false;
   await loadTimeTracker(seq);
   if(seq===routeSerial&&state.boardId===boardId&&state.ttAttendance?.status==='VERIFIED_READ')
    state.ttLogAdminSuccess='Intern attendance correction saved and verified.';
  }catch(err){
   if(seq===routeSerial&&state.boardId===boardId){
    const message=errorMessage(err);
    state.ttLogAdminError=/OJT_REVISION_CONFLICT|40001/i.test(message)?
     'Intern attendance changed. Close and reopen the editor to use the latest record.':
     /timeout|network|fetch|connection/i.test(message)?
      'Save confirmation is uncertain. Refresh the signed OJT Log before trying again.':message;
   }
  }finally{
   if(seq===routeSerial&&state.boardId===boardId){state.ttLogAdminBusy=false;render();}
  }
  return;
 }
 let plan;
 try{
  plan=editor.manualClockout?buildTimeTrackerManualClockOut(new FormData(form),editor.records[0]):buildTimeTrackerAdminPatch(new FormData(form),{
   mode:editor.mode,record:editor.records[0]||null,records:editor.records
  });
  if(editor.timeOnly&&(
     editor.mode!=='single'||Object.keys(plan.patch).some(k=>!['clockInAt','clockOutAt'].includes(k))))
   throw Error('IT Administrators can only correct recorded times.');
 }catch(err){state.ttLogAdminError=errorMessage(err);render();return;}
 const seq=routeSerial,boardId=state.boardId;
 state.ttLogAdminBusy=true;state.ttLogAdminError='';render();
 try{
  const receipt=await timeTracker.mutateAttendanceRecords(boardId,{
   action:editor.mode==='bulk'?'bulk-edit':'edit',recordIds:editor.recordIds,
   patch:plan.patch,reason:plan.reason,expectedRevision:editor.revision,manualClockout:editor.manualClockout===true
  });
  if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerAdminLogReady())return;
  state.ttLogAdminEditor=null;state.ttLogSelectedIds=[];state.ttLogAdminBusy=false;
  await loadTimeTracker(seq);
  if(seq!==routeSerial||state.boardId!==boardId)return;
  if(state.ttAttendance?.status==='VERIFIED_READ')
   state.ttLogAdminSuccess=`Updated ${receipt.changedCount} attendance record${receipt.changedCount===1?'':'s'}.`;
  else state.ttLogAdminError='The correction was committed, but the Log refresh could not be verified. Refresh before making another change.';
 }catch(err){
  if(seq===routeSerial&&state.boardId===boardId){
   state.ttLogAdminBusy=false;
   const message=errorMessage(err);
   state.ttLogAdminError=/REVISION_CONFLICT|serialization|40001/i.test(message)?
    'Attendance records changed while this editor was open. Close and reopen it to load the latest revision.':
    /timeout|network|fetch|connection/i.test(message)?
     'The save response was not confirmed. Refresh the Log and verify the record before retrying.':message;
  }
 }finally{
  if(seq===routeSerial&&state.boardId===boardId){state.ttLogAdminBusy=false;render();}
 }
}
function deleteTimeTrackerAdminRecords(recordIds){
 if(state.ttAttendance?.access?.moduleRole!=='System Admin')return;
 if(!timeTrackerAdminLogReady()||state.ttLogAdminBusy||state.ttLogAdminEditor)return;
 const ids=[...new Set(recordIds||[])];
 if(ids.some(id=>String(id).startsWith('ojt:'))){
  const scope=timeTrackerOjtLogAdminScope();
  const row=timeTrackerLogRowsForSnapshot(state.ttAttendance).find(r=>
   r.isOjt&&r.id===ids[0]);
  if(!scope||ids.length!==1||!row){
   state.ttLogAdminError='Select one authorized intern attendance record.';render();return;
  }
  const revision=Number.isSafeInteger(row.revision)&&row.revision>=1?row.revision:null;
  state.ttLogAdminError='';state.ttLogAdminSuccess='';
  state.ttLogAdminDeleteConfirm={ojt:true,recordIds:ids,
   revision,records:[{id:row.id,name:row.name,clockIn:row.clockIn,status:row.status}],
   error:revision===null?'Signed OJT deletion requires database migration 20261123150000_cp_tt_ojt_admin_record_management.sql. Deploy it, then refresh Logs.':''};
  render();root.querySelector('[data-action="tt-log-admin-delete-cancel"]')?.focus();
  return;
 }
 if(!ids.length||ids.length>TT_ADMIN_RECORD_LIMIT)return;
 const rows=state.ttAttendance.log?.rows||[];
 const selected=ids.map(id=>rows.find(row=>row.id===id));
 if(selected.some(row=>!row)){
  state.ttLogAdminError='One or more selected attendance records are no longer in the current Log. Refresh before continuing.';
  render();return;
 }
 state.ttLogAdminError='';state.ttLogAdminSuccess='';
 state.ttLogAdminDeleteConfirm={recordIds:ids,records:selected.map(row=>({
  id:row.id,name:row.name||row.ownerName||'Attendance record',
  clockIn:row.clockIn,status:row.status
 }))};
 render();
 root.querySelector('[data-action="tt-log-admin-delete-cancel"]')?.focus();
}
function cancelTimeTrackerAdminDeletion(){
 if(state.ttLogAdminBusy||!state.ttLogAdminDeleteConfirm)return;
 state.ttLogAdminDeleteConfirm=null;render();
}
async function confirmTimeTrackerAdminDeletion(){
 if(state.ttAttendance?.access?.moduleRole!=='System Admin')return;
 const confirmation=state.ttLogAdminDeleteConfirm;
 if(!confirmation||!timeTrackerAdminLogReady()||state.ttLogAdminBusy)return;
 const ids=[...confirmation.recordIds];
 if(confirmation.ojt){
  const scope=timeTrackerOjtLogAdminScope();
  if(!scope||ids.length!==1||!String(ids[0]).startsWith('ojt:')||
     !Number.isSafeInteger(confirmation.revision))return;
  const seq=routeSerial,boardId=scope.boardId;
  state.ttLogAdminBusy=true;state.ttLogAdminError='';render();
  try{
   const fresh=await timeTrackerOjt.adminAttendance(scope);
   if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerOjtLogAdminScope())return;
   const row=fresh.records.find(r=>'ojt:'+r.id===ids[0]);
   if(!row||row.revision!==confirmation.revision)
    throw Error('OJT_REVISION_CONFLICT');
   await timeTrackerOjt.mutateAdminRecord(scope,{
    recordId:row.id,action:'delete',patch:{},
    expectedRevision:row.revision,reason:'Administrator deleted intern attendance record'
   });
   if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerOjtLogAdminScope())return;
   state.ttLogAdminDeleteConfirm=null;state.ttLogAdminEditor=null;
   state.ttLogSelectedIds=[];state.ttLogAdminBusy=false;
   await loadTimeTracker(seq);
   if(seq===routeSerial&&state.boardId===boardId&&state.ttAttendance?.status==='VERIFIED_READ')
    state.ttLogAdminSuccess='Intern attendance record deleted; audit history retained.';
  }catch(err){
   if(seq===routeSerial&&state.boardId===boardId){
    const message=errorMessage(err);
    state.ttLogAdminError=/OJT_REVISION_CONFLICT|40001/i.test(message)?
     'Intern attendance changed before deletion. Refresh the Log and retry.':
     /timeout|network|fetch|connection/i.test(message)?
      'Deletion confirmation is uncertain. Refresh the Log and verify the record before retrying.':message;
   }
  }finally{
   if(seq===routeSerial&&state.boardId===boardId){
    state.ttLogAdminBusy=false;state.ttLogAdminDeleteConfirm=null;render();
   }
  }
  return;
 }
 if(!ids.length||ids.length>TT_ADMIN_RECORD_LIMIT)return;
 const seq=routeSerial,boardId=state.boardId;
 state.ttLogAdminBusy=true;state.ttLogAdminError='';state.ttLogAdminSuccess='';render();
 try{
  const snapshot=await timeTracker.attendanceAdminRecords(boardId,ids);
  if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerAdminLogReady())return;
  const receipt=await timeTracker.mutateAttendanceRecords(boardId,{
   action:ids.length===1?'delete':'bulk-delete',recordIds:ids,
   patch:{},reason:'',expectedRevision:snapshot.revision
  });
  if(seq!==routeSerial||state.boardId!==boardId||!timeTrackerAdminLogReady())return;
  state.ttLogAdminDeleteConfirm=null;state.ttLogAdminEditor=null;
  state.ttLogSelectedIds=[];state.ttLogAdminBusy=false;
  await loadTimeTracker(seq);
  if(seq!==routeSerial||state.boardId!==boardId)return;
  if(state.ttAttendance?.status==='VERIFIED_READ')
   state.ttLogAdminSuccess='Deleted '+receipt.deletedCount+' attendance record'+(receipt.deletedCount===1?'':'s')+'.';
  else state.ttLogAdminError='Deletion was committed, but the Log refresh could not be verified. Refresh before further management.';
 }catch(err){
  if(seq===routeSerial&&state.boardId===boardId){
   state.ttLogAdminDeleteConfirm=null;state.ttLogAdminBusy=false;
   const message=errorMessage(err);
   state.ttLogAdminError=/REVISION_CONFLICT|serialization|40001/i.test(message)?
    'Attendance records changed before deletion. Refresh the Log and retry with the current selection.':
    /timeout|network|fetch|connection/i.test(message)?
     'The deletion response was not confirmed. Refresh the Log and verify the selected records before retrying.':message;
  }
 }finally{
  if(seq===routeSerial&&state.boardId===boardId){state.ttLogAdminBusy=false;render();}
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
const timeTrackerPendingRecovery=createTimeTrackerPendingRecovery((()=>{
 try{return typeof window!=='undefined'?window.localStorage:null;}
 catch{return null;}
})());
/** GPS is captured only for a user-triggered Start or End Session. */
function timeTrackerClockScope(){
 return {userId:state.context?.user_id,workspaceId:state.context?.workspace_id,boardId:state.boardId};
}
function rememberTimeTrackerClockPending(context){
 state.ttClockPending=context;
 timeTrackerPendingRecovery.save(context);
}
function clearTimeTrackerClockPending(){
 const scope=state.ttClockPending||timeTrackerClockScope();
 timeTrackerPendingRecovery.clear(scope);
 state.ttClockPending=null;
}
function restoreTimeTrackerClockPending(){
 if(state.ttClockPending)return;
 const context=timeTrackerPendingRecovery.read(timeTrackerClockScope());
 if(context){
  state.ttClockPending=context;
  state.ttError='A previous attendance action needs a signed status check. Verify the session before another Clock In or Clock Out.';
 }
}
function reconcileTimeTrackerClock(snapshot,{
 allowRetry=false,resolveUncommittedClockIn=false
}={}){
 const pending=state.ttClockPending;
 if(!pending)return null;
 const action=pending.action||'clock-out';
 const outcome=attendanceSnapshotOutcome(snapshot,pending);
 if(outcome==='CONFIRMED'){
  if(action==='clock-in')ttWorkNoteDraft.clear(timeTrackerWorkNoteScope());
  clearTimeTrackerClockPending();
  state.ttGeoPromptVisible=false;state.ttGeoMessage='';
  state.ttSuccess=(action==='clock-in'?'Clock In':'Clock Out')+
   ' confirmed — successfully recorded in your signed attendance history.';
  state.ttError='';
 }else if(!pending.receiptVerified&&
   ((action==='clock-out'&&allowRetry&&outcome==='STILL_ACTIVE')||
    (action==='clock-in'&&(allowRetry||resolveUncommittedClockIn)&&
     outcome==='NOT_COMMITTED'))){
  // A fresh signed read can clear an uncommitted Clock-In even when another
  // employee advanced the shared revision. Clock-Out recovery still requires
  // the explicit Verify action; a receipt-confirmed write is never discarded.
  clearTimeTrackerClockPending();
  if(resolveUncommittedClockIn&&!allowRetry&&action==='clock-in'){
   state.ttSuccess='Previous Clock In was not committed. You can start a new session.';
   state.ttError='';
  }else{
   state.ttSuccess='';
   state.ttError=action==='clock-in'?
    'Clock In was not committed. Your signed attendance state is unchanged; you may try again.':
    'Your signed attendance record is still active. Clock Out was not completed; you may try again.';
  }
 }
 return outcome;
}
async function verifyTimeTrackerAttendance(){
 const pending=state.ttClockPending;
 if(!pending||state.ttBusy||!auth.isSignedIn||
    state.view!=='board'||state.tab!=='attendance'||state.boardId!==pending.boardId||
    state.context?.user_id!==pending.userId||
    state.context?.workspace_id!==pending.workspaceId)return;
 const seq=routeSerial,run=++state.ttRunId;
 state.ttBusy=true;state.ttError='';render();
 try{
  const snapshot=await timeTracker.snapshot(pending.boardId,{clockOnly:true});
  if(seq!==routeSerial||run!==state.ttRunId||!auth.isSignedIn||
     state.context?.user_id!==pending.userId||
     state.context?.workspace_id!==pending.workspaceId)return;
  state.ttAttendance=snapshot;
  if(reconcileTimeTrackerClock(snapshot,{allowRetry:true})==='UNVERIFIED')
   state.ttError='The server has not confirmed this attendance action yet. Refresh your signed session before trying again.';
 }catch(err){
  if(seq===routeSerial&&run===state.ttRunId)
   state.ttError=attendanceAuthFailure(err)?
    attendanceClockError(err):
    'Attendance status could not be verified. The attendance action remains locked to prevent duplicate requests.';
 }finally{
  if(seq===routeSerial&&run===state.ttRunId){state.ttBusy=false;render();}
 }
}
async function submitTimeTrackerAction(form,actionName){
 // Capture the live textarea before any validation or GPS-triggered rerender.
 // Retain exact whitespace for editing; only the payload is trimmed.
 if(actionName==='clock-in'&&form?.querySelector('#tt-note'))
  ttWorkNoteDraft.write(timeTrackerWorkNoteScope(),form.querySelector('#tt-note').value);
 restoreTimeTrackerClockPending();
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
  String(state.ttAttendance.access?.employeeDepartment||'');
 if(actionName==='clock-in'&&!department){
  state.ttError='Your department has not been assigned by a TimeTracker administrator. Clock In is unavailable until it is verified.';
  render();return;
 }
 const workNote=actionName==='clock-in'&&location==='Offsite (Home)'?
  String(form.querySelector('#tt-note')?.value||'').trim():'';
 if(actionName==='clock-in'&&isTimeTrackerHomeNoteRequired(location,state.ttAttendance.access?.email,state.ttAttendance.access?.userId)&&!workNote){
  state.ttError='Work Plan is required for Offsite (Home). Enter a reason before starting your session.';
  render();return;
 }
 const seq=routeSerial,run=++state.ttRunId,identity=state.context.user_id,
  ws=state.context.workspace_id,boardId=state.boardId;
 recordTimeTrackerGpsDiagnostic({phase:'attendance-submit',action:actionName});
 const context={action:actionName,recordId:active?.id||null,userId:identity,workspaceId:ws,boardId,
  baselineRevision:Number(state.ttAttendance.revision)||0,
  previousRecordIds:state.ttAttendance.records.map(row=>row.id),location,department};
 const sameSession=()=>seq===routeSerial&&run===state.ttRunId&&auth.isSignedIn&&
  state.boardId===boardId&&state.context?.user_id===identity&&
  state.context?.workspace_id===ws;
 let commitAttempted=false;
 state.ttClockCorrectionNotice='';
 // Request GPS only in response to this Start/End Session submit.
 state.ttGeoPromptVisible=true;state.ttGeoPermission='unknown';state.ttGeoMessage='';
 state.ttBusy=true;state.ttClockStage='location';state.ttError='';state.ttSuccess='';render();
 try{
  const geo=await captureAttendanceGeo(navigator.geolocation,{
   diagnosticContext:{action:actionName}
  });
  recordTimeTrackerGpsDiagnostic({phase:'gps-fix-ready',action:actionName,
   accuracyMeters:geo.accuracy,positionAgeMs:Math.max(0,Date.now()-Date.parse(geo.capturedAt))});
  if(sameSession()){
   state.ttGeoPermission='granted';state.ttGeoMessage='';
   state.ttClockStage='saving';render();
  }
  if(!sameSession()){
   recordTimeTrackerGpsDiagnostic({phase:'session-context-changed-before-commit',action:actionName});
   throw new Error('Attendance session changed before commit');
  }
  recordTimeTrackerGpsDiagnostic({phase:'attendance-commit-start',action:actionName});
  commitAttempted=true;
  rememberTimeTrackerClockPending({...context,receiptVerified:false});
  const receipt=await timeTracker.commit(boardId,{
   action:actionName,location,department,workNote,geo,
   expectedRecordId:actionName==='clock-out'?context.recordId:null
  });
  recordTimeTrackerGpsDiagnostic({phase:'attendance-commit-success',action:actionName,
   result:'committed'});
  if(!sameSession()){
   recordTimeTrackerGpsDiagnostic({phase:'session-context-changed-after-commit',action:actionName});
   return;
  }
  // A verified commit receipt confirms persistence even if refresh later fails.
  if(actionName==='clock-in')ttWorkNoteDraft.clear(timeTrackerWorkNoteScope());
  state.ttGeoPromptVisible=false;state.ttGeoMessage='';
  state.ttSuccess=(receipt.action==='clock-in'?'Clock In':'Clock Out')+
   ' successfully recorded and confirmed by the server.';
  state.ttClockStage='verifying';render();
  // The commit receipt is authoritative; a failed refresh is not a failed write.
  rememberTimeTrackerClockPending({...context,recordId:receipt.recordId,receiptVerified:true});
  try{
   const snapshot=await timeTracker.snapshot(boardId,{clockOnly:true});
   recordTimeTrackerGpsDiagnostic({phase:'attendance-readback-success',action:actionName,
    result:snapshot?.status==='VERIFIED_READ'?'verified':'unverified'});
   if(!sameSession()){
    recordTimeTrackerGpsDiagnostic({phase:'session-context-changed-after-readback',action:actionName});
    return;
   }
   state.ttAttendance=snapshot;
   if(reconcileTimeTrackerClock(snapshot)!=='CONFIRMED')
    state.ttError=(actionName==='clock-in'?'Clock In':'Clock Out')+
     ' was committed, but the current session view is not reconciled. Select Verify session status.';
  }catch{
   recordTimeTrackerGpsDiagnostic({phase:'attendance-readback-failed',action:actionName,
    result:'unavailable'});
   if(sameSession())state.ttError=(actionName==='clock-out'?'Clock Out':'Clock In')+
    ' was committed, but the refreshed session is unavailable. Select Verify session status.';
  }
 }catch(err){
  recordTimeTrackerGpsDiagnostic({phase:commitAttempted?'attendance-commit-failed':'attendance-action-failed',
   action:actionName,errorCode:typeof err?.code==='string'?err.code:undefined,
   httpStatus:err?.status});
  if(!sameSession())return;
  if(commitAttempted){
   rememberTimeTrackerClockPending({...context,receiptVerified:false});
   if(!attendanceAuthFailure(err)){
    try{
     const snapshot=await timeTracker.snapshot(boardId,{clockOnly:true});
     if(!sameSession())return;
     state.ttAttendance=snapshot;
     if(reconcileTimeTrackerClock(snapshot)==='CONFIRMED')return;
     if(!state.ttClockPending)return;
    }catch{/* Uncertain outcome: never retry the write automatically. */}
   }
  }
  if(err?.code==='TT_GEO_DENIED'){
   state.ttGeoPermission='denied';
   state.ttGeoMessage='Location is blocked. Allow Location for this site in your browser and enable device Location Services, then press Start Session or End Session again.';
  }else if(err?.code==='TT_GEO_UNAVAILABLE'){
   state.ttGeoPermission='unavailable';
   state.ttGeoMessage='A fresh GPS fix was unavailable. Enable device Location Services, check signal, then press Start Session or End Session again.';
  }
  if(err?.code!=='TT_GEO_DENIED'&&err?.code!=='TT_GEO_UNAVAILABLE')state.ttGeoPromptVisible=false;
  state.ttError=attendanceClockError(err,{commitAttempted,action:actionName});
 }finally{
  if(sameSession()){state.ttBusy=false;state.ttClockStage='idle';render();}
 }
}

async function loadIssues(seq=routeSerial){
 state.loadingIssues=true;render();
 try{const rows=await db.issues(state.boardId,state.context.workspace_id);
 if(seq===routeSerial)state.issues=rows;
 }catch(err){if(seq===routeSerial)notice(err);}
 finally{if(seq===routeSerial){state.loadingIssues=false;render();}}
}
async function loadFRTFinance(companyCode=null,seq=routeSerial,searchQuery=''){
 if(state.view!=='board'||state.tab!=='finance'||
    moduleByBoardName(state.board?.board?.name)?.key!=='frt'||state.frtFinanceBusy)return;
 const identity=state.context?.user_id;
 const workspace=state.context?.workspace_id;
 state.frtFinanceBusy=true;state.frtFinance=null;state.frtFinanceDetail=null;state.frtFinanceDetailId=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailRevision++;render();
 try{
  const result=await fundTracker.snapshot({companyCode,includeIntercompany:state.frtFinanceView==='opex',searchQuery});
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
  const response=await fundTracker.loadRequestDetail({
   auth,api:db,requestId,companyCode,allowedRequestIds:ids,workspaceId:workspace,
   expectedRole:state.frtFinance.role
  });
  if(response.status==='PASS'){
   try{response.bankRelease=await fundTracker.loadBankExecution({auth,api:db,workspaceId:workspace,
    requestId,allowedRequestIds:ids});}
   catch{response.bankReleaseError='Bank execution readback unavailable';}
  }
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
function navigateGlobalSearchResult(item){
 pendingGlobalSearchItem=null;
 if(!item)return;
 pendingNativeSearchSelection=null;
 if(item.native===true&&item.applicationId==='fueltrack'&&item.recordId){
  pendingNativeSearchSelection={applicationId:'fueltrack',recordId:item.recordId,
   boardId:FUELTRACK_V3_ID,userId:auth.userId,workspaceId:state.context?.workspace_id};
  const target=item.href||fuelTrackHref('requests')+'/record/'+encodeURIComponent(item.recordId);
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(item.native===true&&item.applicationId==='timetracker'&&
   ['Attendance session','Overtime request'].includes(item.recordType)&&item.recordId){
  const board=findTimeTrackerAttendanceBoard(state.boards,moduleByBoardName);
  if(!board?.id)return;
  pendingNativeSearchSelection={applicationId:'timetracker',recordId:item.recordId,
   recordType:item.recordType,boardId:board.id,userId:auth.userId,
   workspaceId:state.context?.workspace_id};
  const target=item.href||('#/time-tracker/attendance/'+encodeURIComponent(item.recordId));
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(item.native===true&&item.applicationId==='frt'&&
   item.recordId&&item.navigationScope){
  pendingNativeSearchSelection={applicationId:'frt',recordId:item.recordId,
   navigationScope:item.navigationScope,query:item.query,boardId:FRT_BOARD_ID,
   userId:auth.userId,workspaceId:state.context?.workspace_id};
  const base=item.href||('#/boards/'+FRT_BOARD_ID+'/finance/record/'+encodeURIComponent(item.navigationScope)+'/'+encodeURIComponent(item.recordId));
  const target=base+'?q='+encodeURIComponent(item.query||'');
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(item.native===true&&item.applicationId==='fm1'&&item.recordId){
  pendingNativeSearchSelection={applicationId:'fm1',recordId:item.recordId,boardId:null,
   userId:auth.userId,workspaceId:state.context?.workspace_id};
  const target='#/fm1/ticket/'+encodeURIComponent(item.recordId);
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(item.native===true&&item.applicationId==='orders'&&item.recordId){
  const target=orderIntakeHref('all-orders',{},item.recordId);
  if(location.hash===target)void onRoute().catch(notice);
  else location.hash=target;
  return;
 }
 if(item.native===true&&['tools','toolbox','materials','evaluation','charter','aims'].includes(item.applicationId)&&
   item.recordId){
  const module=BOARD_MODULES.find(entry=>entry.key===item.applicationId);
  const board=module&&state.boards.find(entry=>entry.name===module.name&&entry.status!=='trashed');
  if(!board?.id){notice(new Error('The application board is not available in this workspace.'));return;}
  pendingNativeSearchSelection={applicationId:item.applicationId,recordId:item.recordId,
   navigationScope:item.navigationScope||'',boardId:board.id,userId:auth.userId,
   workspaceId:state.context?.workspace_id};
  const target='#/boards/'+board.id+'/native/'+item.applicationId+'/'+encodeURIComponent(item.recordId)+
   (item.navigationScope?'/'+encodeURIComponent(item.navigationScope):'');
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(item.native===true&&item.applicationId==='tradelink'&&
   item.recordId&&typeof item.recordId==='string'){
  pendingNativeSearchSelection={applicationId:'tradelink',recordId:item.recordId,
   userId:auth.userId,workspaceId:state.context?.workspace_id};
  const target=item.href||tradeLinkApplicationHref('documents/record/'+encodeURIComponent(item.recordId));
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(item.type==='record'&&validUuid(item.boardId)&&validUuid(item.itemId)){
  pendingGlobalSearchItem={boardId:item.boardId,itemId:item.itemId,
   userId:auth.userId,workspaceId:state.context?.workspace_id};
  const target='#/boards/'+item.boardId+'/items';
  if(location.hash===target)void onRoute().catch(error=>notice(error));
  else location.hash=target;
  return;
 }
 if(typeof item.href==='string'&&item.href.startsWith('#/'))location.hash=item.href;
}

async function openPendingGlobalSearchItem(boardId){
 const pending=pendingGlobalSearchItem;
 if(!pending||pending.boardId!==boardId)return;
 const route=routeSerial;
 const current=()=>route===routeSerial&&auth.isSignedIn&&
  auth.userId===pending.userId&&state.context?.user_id===pending.userId&&
  state.context?.workspace_id===pending.workspaceId&&state.view==='board'&&
  state.boardId===pending.boardId&&state.board?.board?.id===pending.boardId;
 if(!current()){pendingGlobalSearchItem=null;return;}
 try{
  while(current()&&!state.board.items.some(item=>item.id===pending.itemId)&&
        state.board.pagination?.has_more===true){
   const next=await db.boardNextPage(boardId,{
    userId:pending.userId,workspaceId:pending.workspaceId
   });
   if(!current())return;
   state.board=next;
  }
  if(!current())return;
  pendingGlobalSearchItem=null;
  if(!state.board.items.some(item=>item.id===pending.itemId)){
   toast('This record is no longer available in the selected board.',true);return;
  }
  render();
  await openBoardItemDetails(pending.itemId);
 }catch(error){
  if(pendingGlobalSearchItem===pending)pendingGlobalSearchItem=null;
  if(current())notice(error);
 }
}

async function openPendingNativeSearchRecord(boardId){
 const pending=pendingNativeSearchSelection;
 const fm1=pending?.applicationId==='fm1';
 if(!pending||(!fm1&&!['tools','toolbox','materials','evaluation','charter','orders','aims'].includes(pending.applicationId))||
    (fm1?boardId!==null:pending.boardId!==boardId))return;
 const serial=routeSerial,userId=pending.userId,workspaceId=pending.workspaceId;
 const module=fm1?{name:'Feedmill Ticketing Portal'}:BOARD_MODULES.find(item=>item.key===pending.applicationId);
 const current=()=>pendingNativeSearchSelection===pending&&serial===routeSerial&&auth.isSignedIn&&auth.userId===userId&&
  state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
  (fm1?state.view==='fm1'&&state.boardId===null:
   state.view==='board'&&state.boardId===boardId&&state.board?.board?.id===boardId&&state.board?.board?.name===module?.name);
 if(!current()){if(pendingNativeSearchSelection===pending)pendingNativeSearchSelection=null;return;}
 try{
  const record=await readNativeSearchRecordDetail({applicationId:pending.applicationId,
   recordId:pending.recordId,navigationScope:pending.navigationScope,auth,api:db,workspaceId});
  if(!current()){if(pendingNativeSearchSelection===pending)pendingNativeSearchSelection=null;return;}
  if(!record||typeof record!=='object'||Array.isArray(record))throw new Error('The native record is unavailable.');
  const title=record.ticket?.ticket_number||record.ticket?.subject||record.name||record.reference||
   record.po_number||record.payload?.name||record.payload?.assetTag||record.employeeName||
   record.entity_type||record.period||'Application record';
  const subtitle=record.ticket?.status||record.status||record.requestStatus||
   record.approvalStatus||record.bookingStatus||'';
  hideModal();modal=document.createElement('div');
  modal.className='modal-backdrop native-search-detail-backdrop';
  modal.innerHTML='<aside class="native-search-detail-drawer" role="dialog" aria-modal="true" aria-labelledby="native-search-detail-title">'+
   '<header class="native-search-detail-header"><div><span class="label-top">'+e(module?.name||'Application')+' / Native record</span>'+
   '<h2 id="native-search-detail-title">'+e(title)+'</h2>'+(subtitle?'<p>'+e(subtitle)+'</p>':'')+'</div>'+
   '<button type="button" class="modal-close" data-dismiss aria-label="Close record details">×</button></header>'+
   '<div class="native-search-detail-scroll">'+renderNativeSearchRecordDetail(record,{escape:e})+'</div>'+
   '<footer class="native-search-detail-footer"><span class="muted">Read-only native application record</span><button type="button" class="secondary" data-dismiss>Close</button></footer></aside>';
  document.body.append(modal);
  modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-dismiss]'))hideModal();});
  modal.querySelector('[data-dismiss]')?.focus();
  if(pendingNativeSearchSelection===pending)pendingNativeSearchSelection=null;
 }catch(error){
  if(pendingNativeSearchSelection===pending)pendingNativeSearchSelection=null;
  if(current())notice(error);
 }
}

async function onRoute(){
 applicationRouteRead=null;state.nativeInitialRead=null;state.ttReadLoading=false;
 closeTradeLinkSavedDocumentOutput();
 syncFuelTrans({container:null});
 if(!state.context||!auth.isSignedIn)syncDda();
 if(!state.context)return;
 if(initialAccountRoleReadPending)return;
 if(state.workspaceTransitionPending){
  syncDda();
  clearOrderIntake();
  history.replaceState(null,'',location.pathname+location.search+routeHome);
  approvedRouteHash=routeHome;
  state.view='overview';
  render();
  return;
 }
 sidebarMobileOpen=false;
 const hash=location.hash||routeHome;
 const routePath=hash.split('?')[0];
 const routeQuery=new URLSearchParams(hash.split('?')[1]||'').get('q')||'';
 const parts=routePath.replace(/^#\/?/,'').split('/');
 if(parts[0]!==DDA_ROUTE_SECTION||state.context?.workspace_id!==WORK_MANAGEMENT_WORKSPACE_ID||state.context?.user_id!==auth.userId)syncDda();
 if(parts[0]!=='order-intake')clearOrderIntake();
 if(parts[0]!=='user-role-management')teamsController?.unmount();
 state.ttStandalone=false;state.frtStandalone=false;state.tlStandalone=false;state.fuelTrackStandalone=false;state.fuelTransStandalone=false;
 if(parts[0]!=='tradelink'){
  state.tradeLinkModuleRole='';
  if(state.tradeLinkAnalyticsBusy){state.tradeLinkAnalyticsRunId++;state.tradeLinkAnalyticsBusy=false;}
  state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError='';state.tradeLinkSection='overview';
 }
 if(parts[0]!=='fm1')fm1Module?.unmountFm1Application();
 const applicationRoute=workspaceApplicationRouteAccess(hash,state.context?.workspace_id);
 if(!applicationRoute.allowed){
  // Application ownership controls which workspace opens its navigation route.
  // Existing server-side role and data permissions are unchanged.
  routeSerial++;
  stopTimeTrackerClock();
  state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
  state.boardManage=false;state.edit=false;state.error='';
  state.ttRunId++;state.ttAttendance=null;state.ttBusy=false;state.ttError='';
  clearTimeTrackerOjtSelection();
  state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;
  state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;
  state.frtFinanceDetailRevision++;
  state.tradeLinkDraft=initialTradeLinkDraftView();
  state.tradeLinkModuleRole='';state.tradeLinkActivity=null;
  state.tradeLinkAnalyticsRunId++;state.tradeLinkAnalytics=null;
  state.tradeLinkAnalyticsBusy=false;state.tradeLinkAnalyticsError='';
  state.fuelTrackBackend=null;state.fuelTrackBackendBusy=false;
  state.fuelTrackActivity=null;state.fuelTrackActivityBusy=false;
  state.fuelTrackPendingSubmission=null;state.fuelTrackRefuelingDialog=null;
  state.paseoManagement=null;paseoReadRunId++;
  talkBoxState={page:null,selected:null,busy:false,error:'',scope:'',
   filter:{name:'',status:'All'},features:null,meetingOpen:false,meetingDate:'',
   meetingHistory:[],meetingRecord:null,meetingRows:[]};
  clearTalkBoxReportUrl();
  pendingGlobalSearchItem=null;pendingNativeSearchSelection=null;
  fm1Module?.unmountFm1Application();
  history.replaceState(null,'',location.pathname+location.search+routeHome);
  approvedRouteHash=routeHome;
  await onRoute();
  toast('This application belongs to Work Management. Switch to that workspace to open it.');
  return;
 }
 if(parts[0]==='invitations'&&parts[1]==='accept'){
  state.view='invitation';render();return;
 }
 if(pendingInvitation){pendingInvitation=null;invitationAcceptanceStatus='';}
 if(parts[0]!=='paseo')paseoReadRunId++;
 if(parts[0]==='paseo'){
  state.view='paseo';await loadPaseoManagement();return;
 }
 if(parts[0]==='fm1'){
  const routeRead=beginApplicationRouteRead('FM1 Ticketing');
  try{fm1Module=await import('./fm1/index.js');}
  catch{
   if(finishApplicationRouteRead(routeRead)){
    state.view='fm1';shell(renderBoardLoadingError('FM1 Ticketing could not load. Refresh to retry.'));
   }
   return;
  }
  if(!finishApplicationRouteRead(routeRead))return;
 }
 if(parts[0]==='fm1'&&parts[1]==='ticket'&&parts[2]){
  let recordId='';try{recordId=decodeURIComponent(parts[2]);}catch{}
  if(recordId&&recordId.length<=180)pendingNativeSearchSelection={applicationId:'fm1',recordId,boardId:null,
   userId:auth.userId,workspaceId:state.context?.workspace_id};
 }else if(parts[0]==='fm1'&&pendingNativeSearchSelection?.applicationId==='fm1')pendingNativeSearchSelection=null;
 if(parts[0]===DDA_ROUTE_SECTION){
  if(hash!==DDA_APPLICATION.route)history.replaceState(null,'',location.pathname+location.search+DDA_APPLICATION.route);
  if(state.view!==DDA_ROUTE_SECTION){routeSerial++;stopTimeTrackerClock();}
  state.view=DDA_ROUTE_SECTION;state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
  state.boardManage=false;state.edit=false;state.error='';
  render();return;
 }
 if(parts[0]==='order-intake'){
  let nextRoute=parseOrderIntakeRoute(hash);
  if(!nextRoute)return;
  const entering=state.view!=='order-intake';
  if(entering&&hash==='#/order-intake'){
   const saved=readOrderIntakePreference(orderIntakeScope());
   if(saved)nextRoute=parseOrderIntakeRoute(saved)||nextRoute;
  }
  if(modal?.dataset.oiEditor&&orderIntakeRoute?.canonicalHash!==nextRoute.canonicalHash)hideModal();
  if(nextRoute.canonicalHash!==hash)history.replaceState(null,'',location.pathname+location.search+nextRoute.canonicalHash);
  if(state.view!=='order-intake'){clearOrderIntake();routeSerial++;stopTimeTrackerClock();}
  state.view='order-intake';state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
  state.boardManage=false;state.edit=false;state.error='';
  if(orderIntakeRoute?.section!==nextRoute.section||JSON.stringify(orderIntakeRoute?.filters)!==JSON.stringify(nextRoute.filters)){orderIntakeTable.page=0;orderIntakeTable.selected.clear();}
  orderIntakeRoute=nextRoute;
  const scope=orderIntakeScope();
  resetOrderIntakeDrag();
  if(orderIntakeCurrent(scope))saveOrderIntakePreference(scope,nextRoute);
  const read=currentOrderIntakeRead().open(scope,completeOrderIntakeView());
  const record=loadOrderIntakeRecord(nextRoute,scope);
  render();
  await Promise.all([read,record]);
  return;
 }
 if(parts[0]==='fueltrans'){
  state.fuelTransStandalone=true;
  const fuelTransRoute=parseFuelTransApplicationRoute(parts);
  if(!fuelTransRoute){state.view='board';state.error='Invalid FuelTrans application route.';render();return;}
  if(fuelTransRoute.canonicalHash!==routePath)
   history.replaceState(null,'',location.pathname+location.search+fuelTransRoute.canonicalHash);
  await loadBoard(FUELTRANS_BOARD_ID,'fueltrans');
  await openPendingGlobalSearchItem(FUELTRANS_BOARD_ID);
  await openPendingNativeSearchRecord(FUELTRANS_BOARD_ID);
  return;
 }
 if(parts[0]==='tradelink'){
  state.tlStandalone=true;
  const tradeLinkRoute=parseTradeLinkApplicationRoute(parts);
  if(!tradeLinkRoute){state.view='tradelink';state.error='Invalid TradeLink application route.';render();return;}
  if(tradeLinkRoute.canonicalHash!==routePath)
   history.replaceState(null,'',location.pathname+location.search+tradeLinkRoute.canonicalHash);
  const routeRead=beginApplicationRouteRead('TradeLink');
  let tradeLinkContext;
  try{tradeLinkContext=await db.nativeApplicationBoardContext('tradelink');}
  catch(error){
   if(!finishApplicationRouteRead(routeRead))return;
   routeSerial++;state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.boardManage=false;state.edit=false;state.tradeLinkModuleRole='';state.error='TradeLink native application access is unavailable: '+errorMessage(error);
   state.view='tradelink';render();return;
  }
  if(!finishApplicationRouteRead(routeRead))return;
  const tradeLinkBoard=tradeLinkContext.board;
  state.tradeLinkSection=tradeLinkRoute.section;
  state.tradeLinkModuleRole=tradeLinkContext.role||'';
  if(state.tradeLinkSection!=='analytics'){
   state.tradeLinkAnalyticsRunId++;state.tradeLinkAnalyticsBusy=false;
   state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError='';
  }
  if(tradeLinkRoute.recordId){
   pendingNativeSearchSelection={applicationId:'tradelink',recordId:tradeLinkRoute.recordId,
    boardId:TRADELINK_BOARD_ID,userId:auth.userId,workspaceId:state.context?.workspace_id};
  }else if(pendingNativeSearchSelection?.applicationId==='tradelink')pendingNativeSearchSelection=null;
  if(!tradeLinkBoard?.id){
   routeSerial++;state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.boardManage=false;state.edit=false;state.tradeLinkModuleRole='';state.error='The canonical TradeLink application board is unavailable in this workspace.';
   state.view='tradelink';render();return;
  }
  await loadBoard(TRADELINK_BOARD_ID,'tradelink',tradeLinkRoute.draftType,tradeLinkRoute.editId,tradeLinkContext);
  await openPendingGlobalSearchItem(TRADELINK_BOARD_ID);
  await openPendingNativeSearchRecord(TRADELINK_BOARD_ID);
  return;
 }
 if(parts[0]==='fueltrack'){
  state.fuelTrackStandalone=true;
  const fuelTrackRoute=parseFuelTrackApplicationRoute(parts);
  if(!fuelTrackRoute){state.error='Invalid FuelTrack application route.';state.view='board';render();return;}
  if(fuelTrackRoute.canonicalHash!==routePath)
   history.replaceState(null,'',location.pathname+location.search+fuelTrackRoute.canonicalHash);
  const routeRead=beginApplicationRouteRead('FuelTrack+');
  let fuelTrackContext;
  try{fuelTrackContext=await db.nativeApplicationBoardContext('fueltrack-plus');}
  catch(error){
   if(!finishApplicationRouteRead(routeRead))return;
   routeSerial++;state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.boardManage=false;state.edit=false;state.error='FuelTrack+ native application access is unavailable: '+errorMessage(error);
   state.view='board';render();return;
  }
  if(!finishApplicationRouteRead(routeRead))return;
  const fuelTrackBoard=fuelTrackContext.board;
  state.fuelTrackSection=fuelTrackRoute.section;
  state.fuelTrackAnalyticsView=fuelTrackRoute.analyticsView;
  state.fuelTrackAnalyticsRange=fuelTrackRoute.analyticsRange;
  state.fuelTrackAnalyticsMetric=fuelTrackRoute.analyticsMetric;
  if(state.fuelTrackSection!=='lightfuels')state.fuelTrackRefuelingDialog=null;
  if(fuelTrackRoute.recordId){
   pendingNativeSearchSelection={applicationId:'fueltrack',recordId:fuelTrackRoute.recordId,
    boardId:FUELTRACK_V3_ID,userId:auth.userId,workspaceId:state.context?.workspace_id};
  }else if(pendingNativeSearchSelection?.applicationId==='fueltrack')pendingNativeSearchSelection=null;
  if(!fuelTrackBoard?.id){
   routeSerial++;state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.boardManage=false;state.edit=false;state.error='The canonical FuelTrack+ v3 application board is unavailable in this workspace.';
   state.view='board';render();return;
  }
  await loadBoard(FUELTRACK_V3_ID,'fueltrack',null,null,fuelTrackContext);
  await openPendingGlobalSearchItem(FUELTRACK_V3_ID);
  await openPendingNativeSearchRecord(FUELTRACK_V3_ID);
  return;
 }
 if(parts[0]==='talkbox'){
  const board=findTalkBoxBoard(state.boards,moduleByBoardName);
  if(!board){routeSerial++;state.boardId=null;state.board=null;state.loading=false;
   state.error='The existing Toolbox Issues board was not found in this workspace.';
   state.view='board';render();return;}
  const issueId=parts[1]==='issue'&&/^[1-9][0-9]{0,18}$/.test(parts[2]||'')?parts[2]:null;
  if(state.boardId!==board.id||state.tab!=='talkbox'){
   clearTalkBoxReportUrl();
   talkBoxState={page:null,selected:null,busy:false,error:'',scope:'',
   filter:{name:'',status:'All'},features:null,meetingOpen:false,meetingDate:'',meetingHistory:[],meetingRecord:null,meetingRows:[]};
  }
  if(!issueId)talkBoxState.selected=null;
  await loadBoard(board.id,'talkbox');
  if(issueId)await openTalkBoxIssue(issueId);
  return;
 }
 if(parts[0]==='fund-tracker'){
  state.frtStandalone=true;
  const routeRead=beginApplicationRouteRead('Fund Tracker');
  let fundTrackerContext;
  try{fundTrackerContext=await db.nativeApplicationBoardContext('fund-released-tracker');}
  catch(error){
   if(!finishApplicationRouteRead(routeRead))return;
   routeSerial++;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;
   state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;
   state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.error='Fund Tracker native application access is unavailable: '+errorMessage(error);
   state.view='board';render();return;
  }
  if(!finishApplicationRouteRead(routeRead))return;
  const fundTrackerBoard=fundTrackerContext.board;
  const selectedRecord=parseFundTrackerRecordRoute(parts);
  if(fundTrackerBoard&&selectedRecord){
   pendingNativeSearchSelection={applicationId:'frt',recordId:selectedRecord.requestId,
    navigationScope:selectedRecord.companyCode,query:routeQuery,boardId:fundTrackerBoard.id,
    userId:auth.userId,workspaceId:state.context?.workspace_id};
  }else if(pendingNativeSearchSelection?.applicationId==='frt'){
   pendingNativeSearchSelection=null;
  }
  if(!fundTrackerBoard?.id){
   routeSerial++;
   state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;
   state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;
   state.boardId=null;state.board=null;state.boardUi=null;state.loading=false;
   state.error='The canonical Fund Released Tracker application board is unavailable in this workspace.';
   state.view='board';render();return;
  }
  await loadBoard(fundTrackerBoard.id,'finance',null,null,fundTrackerContext);
  return;
 }
 if(parts[0]==='time-tracker'){
  state.ttStandalone=true;
  const routeRead=beginApplicationRouteRead('TimeTracker');
  let timeTrackerContext;
  try{timeTrackerContext=await db.nativeApplicationBoardContext('time-tracker');}
  catch(error){
   if(!finishApplicationRouteRead(routeRead))return;
   routeSerial++;state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBusy=false;
   state.ttError='TimeTracker native application access is unavailable: '+errorMessage(error);
   state.boardId=null;state.board=null;state.boardUi=null;state.view='time-tracker';render();return;
  }
  if(!finishApplicationRouteRead(routeRead))return;
  const attendanceBoard=timeTrackerContext.board;
  const attendanceRecordId=parts[1]==='attendance'&&validUuid(parts[2])?parts[2]:null;
  const overtimeRecordId=parts[1]==='overtime'&&validUuid(parts[2])?parts[2]:null;
  if(attendanceBoard?.id&&(attendanceRecordId||overtimeRecordId)){
   pendingNativeSearchSelection={applicationId:'timetracker',recordId:attendanceRecordId||overtimeRecordId,
    recordType:attendanceRecordId?'Attendance session':'Overtime request',boardId:attendanceBoard.id,
    userId:auth.userId,workspaceId:state.context?.workspace_id};
  }else if(pendingNativeSearchSelection?.applicationId==='timetracker')pendingNativeSearchSelection=null;
  if(!attendanceBoard?.id){
   routeSerial++;state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBusy=false;
   state.ttError='The canonical TimeTracker Attendance application board is unavailable in this workspace.';
   state.boardId=null;state.board=null;state.view='time-tracker';render();return;
  }
  await loadBoard(attendanceBoard.id,'attendance',null,null,timeTrackerContext);
  return;
 }
 if(parts[0]==='boards'&&validUuid(parts[1])){
  const legacyTalkBox=state.boards.find(b=>b.id===parts[1]&&moduleByBoardName(b.name)?.key==='toolbox');
  if(legacyTalkBox){
   const target=parts[2]==='talkbox'&&parts[3]&&/^[1-9][0-9]{0,18}$/.test(parts[3])?
    TALKBOX_APPLICATION_ROUTE+'/issue/'+parts[3]:TALKBOX_APPLICATION_ROUTE;
   history.replaceState(null,'',location.pathname+location.search+target);
   return onRoute();
  }
 if(parts[1]===FUELTRANS_BOARD_ID){
   const legacy=parts[2]==='fueltrans'?parts.slice(3):[];
   const canonical=fuelTransApplicationHref(legacy.join('/'));
   history.replaceState(null,'',location.pathname+location.search+canonical);
   return onRoute();
  }
  if(parts[1]===TRADELINK_BOARD_ID){
   const legacy=parts[2]==='tradelink'?parts.slice(3):[];
   const canonical=legacy.length?tradeLinkApplicationHref(legacy.join('/')):
    tradeLinkApplicationHref('drafts/quotation');
   history.replaceState(null,'',location.pathname+location.search+canonical);
   return onRoute();
  }
  if(parts[1]===FRT_BOARD_ID){
   const canonical=parts[2]==='finance'&&parts[3]==='record'&&parts[4]&&parts[5]?
    fundTrackerRecordHref(parts[4],parts[5]):FUND_TRACKER_APPLICATION_ROUTE;
   history.replaceState(null,'',location.pathname+location.search+canonical);
   return onRoute();
  }
  if(parts[1]===FUELTRACK_V3_ID){
   const legacy=parts[2]==='fueltrack'?parts.slice(3):[];
   const canonical=parseFuelTrackApplicationRoute(['fueltrack',...legacy])?.canonicalHash||
    FUELTRACK_V3_APPLICATION_ROUTE;
   history.replaceState(null,'',location.pathname+location.search+canonical);
   return onRoute();
  }
  const defaultClock=!parts[2]&&state.boards.some(b=>
    b.id===parts[1]&&moduleByBoardName(b.name)?.key==='timetracker');
  const requested=parts[2]==='sourcing'&&parts[1]===MATERIAL_SOURCING_BOARD_ID?'sourcing':
    parts[2]==='issues'?'issues':
    parts[2]==='talkbox'&&moduleByBoardName(state.boards.find(b=>b.id===parts[1])?.name)?.key==='toolbox'?'talkbox':
    parts[2]==='native'?'items':
    parts[2]==='finance'?'finance':
    parts[2]==='attendance'?'attendance':
    defaultClock?'attendance':'items';
  const timeTrackerBoard=state.boards.find(b=>b.id===parts[1]&&moduleByBoardName(b.name)?.key==='timetracker');
  if(timeTrackerBoard){
   state.ttStandalone=true;
   history.replaceState(null,'',location.pathname+location.search+TIMETRACKER_APPLICATION_ROUTE);
   await loadBoard(parts[1],'attendance');
   return;
  }
  state.fuelTrackSection=requested==='fueltrack'?normalizeFuelTrackSection(parts[3]):'dashboard';
  if(state.fuelTrackSection!=='lightfuels')state.fuelTrackRefuelingDialog=null;
  state.fuelTrackAnalyticsView=normalizeFuelTrackAnalyticsView(parts[4]);
  state.fuelTrackAnalyticsRange=normalizeFuelTrackAnalyticsRange(parts[5]);
  state.fuelTrackAnalyticsMetric=normalizeFuelTrackAnalyticsMetric(parts[6]);
  if(requested==='finance'&&moduleByBoardName(state.boards.find(b=>b.id===parts[1])?.name)?.key==='frt'&&
     parts[3]==='record'&&parts[4]&&validUuid(parts[5])){
   pendingNativeSearchSelection={applicationId:'frt',recordId:parts[5],navigationScope:parts[4],
    query:routeQuery,boardId:parts[1],userId:auth.userId,workspaceId:state.context?.workspace_id};
  }
  const nativeApp=['tools','toolbox','materials','evaluation','charter','orders','aims'].includes(parts[3])?parts[3]:null;
  if(parts[2]==='native'&&nativeApp&&parts[4]){
   let recordId='';try{recordId=decodeURIComponent(parts[4]);}catch{}
   if(recordId&&recordId.length<=180)pendingNativeSearchSelection={applicationId:nativeApp,recordId,
    navigationScope:parts[5]||'',boardId:parts[1],userId:auth.userId,workspaceId:state.context?.workspace_id};
  }
  await loadBoard(parts[1],requested);
  await openPendingGlobalSearchItem(parts[1]);
  await openPendingNativeSearchRecord(parts[1]);
  return;
 }
 pendingGlobalSearchItem=null;
 routeSerial++;state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttView='clock';state.boardId=null;state.board=null;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.view=parts[0]==='boards'?'boards':parts[0]==='fm1'?'fm1':parts[0]==='time-tracker'?'time-tracker':parts[0]==='settings'?'settings':parts[0]==='acceptance'?'acceptance':parts[0]==='foundation'?'foundation':parts[0]==='security'?'security':parts[0]==='role-configuration'?'role-configuration':parts[0]==='user-role-management'?'user-role-management':'overview';
 if(['role-configuration','foundation','acceptance'].includes(state.view)){
   // Independent signed server checks; bootstrap is an identity label only.
   const roleAdmin=['role-configuration','user-role-management'].includes(state.view);
   if(roleAdmin){try{state.adminVerified=await roleConfig.adminVerified();}
    catch{state.adminVerified=false;}}
   else{try{state.roleVerified=await roleConfig.bootstrapVerified();}
    catch{state.roleVerified=false;}}
   if(!(roleAdmin?state.adminVerified:state.roleVerified)){
     state.roleData=null;state.roleError='';
     location.hash=routeHome;return onRoute();
   }
 }
 if(state.view==='user-role-management'){
  {const controller=await ensureTeamsController();controller.bindGlobal();render();await controller.load();}
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
 if(state.view==='fm1')await openPendingNativeSearchRecord(null);
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
let startupRecoveryStage='authentication';
function renderBootstrapFailure(error){
 syncDda();
 startupRecoveryActive=true;
 initialAccountRoleReadPending=false;
 platformSync.stop();
 state.context=null;
 state.boards=[];
 state.board=null;
 state.roleVerified=false;
 const denied=error?.status===403;
 const description=startupFailureDescription(error,startupRecoveryStage);
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
   await restoreSavedWorkspacePreference();
   await refreshWorkspace();
   if(mobileAccountEmail||mobileAccountChoices.size){const identity=mobileAccountIdentity();if(identity?.email)mobileAccountChoices.set(identity.email.toLowerCase(),identity);}
   mobileAccountEmail='';
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
     boardCacheChannel.stop();db.invalidateBoardCache();state.context=null;renderLogin(errorMessage(err),{mode:'login',emailValue:email});
   }
 }
 finally{state.authBusy=false;}
}
function hideModal(){if(modal){modal.remove();modal=null;}flushVisibleBoardContent();}
function openModal(title,fields,submit,{submitLabel='Save changes',submitDisabled=false,
 successMessage='Changes saved.',destructive=false,disableOnConflict=false,
 recoveryLabel='Close and refresh board',partialRecoveryLabel='Close and refresh Trash',
 recoveryAction=null}={}){
 const previousFocus=document.activeElement;
 hideModal();
 modal=document.createElement('div');modal.className='modal-backdrop';modal.setAttribute('role','presentation');
 const view=modal;
 modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="modal-head"><h2 id="modal-title">${e(title)}</h2><button type="button" class="modal-close" data-dismiss aria-label="Close dialog">×</button></div>
  <form id="modal-form">${fields}<div class="modal-actions"><button class="secondary" type="button" data-dismiss>Cancel</button>
  <button class="${destructive?'board-modal-danger':'primary'}" type="submit"${submitDisabled?' disabled':''}>${e(submitLabel)}</button></div></form></section>`;
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
   if(modal===view){closeAndRestore();if(successMessage)toast(successMessage);}
  }catch(err){
   notice(err);
   if(button.isConnected){
    if(err?.schemaOutcomeUncertain===true){
     button.disabled=true;
     button.textContent='Close and verify board';
    }else{
     const recoveryKind=modalRecoveryKind(err,{disableOnConflict});
     if(recoveryKind){
      if(recoveryKind==='partial'){
       let feedback=view.querySelector('[data-modal-feedback]');
       if(!feedback){
        feedback=document.createElement('div');
        feedback.className='note security-note';
        feedback.setAttribute('role','alert');
        feedback.dataset.modalFeedback='true';
        view.querySelector('form').insertBefore(feedback,view.querySelector('.modal-actions'));
       }
       feedback.textContent=err?.message||'The batch stopped before all boards were deleted. Refresh Trash and review the remaining selection.';
      }
      const label=recoveryKind==='partial'?partialRecoveryLabel:recoveryLabel;
      installModalRecoveryAction(button,{
       label,
       action:()=>typeof recoveryAction==='function'?recoveryAction(err):Promise.resolve(),
       close:closeAndRestore,
       onError:recoveryError=>notice(recoveryError)
      });
     }else{
      button.type='submit';button.disabled=false;button.textContent=submitLabel;
     }
    }
   }
  }
 });
 // Destructive confirmation defaults to Cancel, never the destructive submit.
 (destructive?view.querySelector('.modal-actions [data-dismiss]'):
  view.querySelector('input,select,textarea')||view.querySelector('.modal-actions [data-dismiss]'))?.focus();
}
function openFRTCollabPanel(title,body){
 const previousFocus=document.activeElement;
 hideModal();
 const view=document.createElement('div');
 view.className='modal-backdrop';view.setAttribute('role','presentation');
 view.innerHTML='<section class="modal frt-collab-panel" role="dialog" aria-modal="true" aria-labelledby="frt-collab-title">'+
  '<div class="modal-head"><h2 id="frt-collab-title">'+e(title)+'</h2>'+
  '<button type="button" class="modal-close" data-frt-collab-close aria-label="Close dialog">×</button></div>'+
  '<div class="frt-collab-panel-body" data-frt-panel-body>'+body+'</div></section>';
 modal=view;document.body.append(view);
 const close=()=>{
  if(modal!==view)return;
  hideModal();
  const target=previousFocus?.isConnected?previousFocus:root.querySelector('.head-actions button');
  target?.focus?.();
 };
 view.addEventListener('click',event=>{
  if(event.target===view||event.target.closest('[data-frt-collab-close]'))close();
 });
 view.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
  if(event.key!=='Tab')return;
  const focusable=[...view.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]
   .filter(element=>!element.hidden&&!element.closest('[hidden]'));
  if(!focusable.length)return;
  if(event.shiftKey&&document.activeElement===focusable[0]){
   event.preventDefault();focusable.at(-1).focus();
  }else if(!event.shiftKey&&document.activeElement===focusable.at(-1)){
   event.preventDefault();focusable[0].focus();
  }
 });
 view.querySelector('[data-frt-collab-close]')?.focus();
 return view;
}
function frtPanelIsCurrent(view,{seq,workspaceId,boardId,userId}){
 return modal===view&&seq===routeSerial&&state.view==='board'&&state.tab==='finance'&&
  state.boardId===boardId&&state.context?.workspace_id===workspaceId&&
  state.context?.user_id===userId&&auth.isSignedIn&&auth.userId===userId;
}
async function openFRTDiscussionDialog(requestId,request){
 const workspaceId=state.context?.workspace_id,boardId=state.boardId;
 const userId=auth.userId,seq=routeSerial;
 if(!workspaceId||!userId||!state.frtFinance.requests.some(row=>row.requestId===requestId))return;
 const view=openFRTCollabPanel('Discussion',
  '<p class="frt-collab-intro">'+e(request.voucher)+' · '+e(request.title)+
  '<br>Comments are saved to this fund request and appear in the request activity history.</p>'+
  '<div data-frt-comment-thread role="region" aria-label="Request comments"><div class="frt-collab-empty">Loading discussion…</div></div>'+
  '<form class="frt-collab-composer" data-frt-comment-form><label for="frt-comment-body">Add comment</label>'+
  '<textarea id="frt-comment-body" name="body" maxlength="4000" required placeholder="Write a comment for this request…"></textarea>'+
  '<div class="frt-collab-status" data-frt-comment-status role="status" aria-live="polite"></div>'+
  '<div class="modal-actions"><button type="submit" class="primary" data-frt-comment-submit>Post comment</button></div></form>');
 const thread=view.querySelector('[data-frt-comment-thread]');
 const status=view.querySelector('[data-frt-comment-status]');
 const form=view.querySelector('[data-frt-comment-form]');
 const submit=view.querySelector('[data-frt-comment-submit]');
 const textarea=view.querySelector('[name="body"]');
 let busy=false;
 const current=()=>frtPanelIsCurrent(view,{seq,workspaceId,boardId,userId});
 const refresh=async()=>{
  const comments=await fundTracker.loadComments({auth,workspaceId,requestId});
  if(!current())return false;
  thread.innerHTML=renderFRTComments(comments,{currentUserId:userId,currentUserName:name()});
  return true;
 };
 try{await refresh();}
 catch(error){if(current()){thread.innerHTML='<div class="frt-collab-empty" role="alert">Discussion could not be loaded. '+e(error?.message||'Refresh and try again.')+'</div>';}}
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!current())return;
  const body=String(textarea.value||'').trim();
  if(!body){status.textContent='Enter a comment before posting.';status.setAttribute('role','alert');return;}
  busy=true;submit.disabled=true;submit.textContent='Posting…';status.textContent='Saving comment…';status.setAttribute('role','status');
  try{
   await fundTracker.addComment({api:db,workspaceId,requestId,body});
   textarea.value='';
   try{
    await refresh();
    if(current()){status.textContent='Comment posted and discussion refreshed.';toast('Comment posted.');}
   }catch{
    if(current()){status.textContent='Comment was saved. The thread could not refresh; reopen Discussion to verify it.';status.setAttribute('role','alert');}
   }
  }catch(error){
   if(current()){status.textContent=error?.message||'Comment could not be posted.';status.setAttribute('role','alert');}
  }finally{
   busy=false;
   if(current()){submit.disabled=false;submit.textContent='Post comment';}
  }
 });
}
async function openFRTCompanyProfileDialog(companyCode){
 const workspaceId=state.context?.workspace_id,boardId=state.boardId;
 const userId=auth.userId,seq=routeSerial;
 if(!workspaceId||!userId||state.frtFinance?.status!=='PASS'||
  !state.frtFinance?.companies?.some(company=>company.code===companyCode))return;
 const view=openFRTCollabPanel('Company Profile · '+companyCode,
  '<div class="frt-collab-empty" role="status">Loading persisted company profile…</div>');
 const host=view.querySelector('[data-frt-panel-body]');
 const current=()=>frtPanelIsCurrent(view,{seq,workspaceId,boardId,userId});
 let profile=null,pendingLogoFile=null,previewUrl='',removeLogo=false,busy=false;
 const revokePreview=()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}};
 view.addEventListener('click',event=>{
  if(event.target===view||event.target.closest('[data-frt-collab-close]'))revokePreview();
 });
 try{
  profile=await fundTracker.loadCompanyProfile({auth,api:db,workspaceId,companyCode});
  if(profile.logoPath)profile.logoDataUrl=await fundTracker.loadCompanyLogoDataUrl({
   auth,api:db,workspaceId,companyCode,logoPath:profile.logoPath
  });
  if(!current())return;
  host.innerHTML=renderFRTCompanyProfileEditor(profile);
  const form=host.querySelector('[data-frt-company-profile-form]');
  // Persisted company data is authoritative; never retain browser-restored values.
  hydrateFRTCompanyProfileForm(form,profile);
  const status=host.querySelector('[data-frt-company-profile-status]');
  const submit=host.querySelector('[data-frt-company-profile-save]');
  const logoInput=form.querySelector('[name="companyLogo"]');
  const logoPreview=host.querySelector('[data-frt-company-logo-preview]');
  const removeButton=host.querySelector('[data-frt-company-logo-remove]');
  const setStatus=(message,isError=false)=>{
   if(!status)return;
   status.textContent=message;
   status.setAttribute('role',isError?'alert':'status');
  };
  logoInput.addEventListener('change',()=>{
   pendingLogoFile=logoInput.files?.[0]||null;
   removeLogo=false;revokePreview();
   if(pendingLogoFile){
    previewUrl=URL.createObjectURL(pendingLogoFile);
    logoPreview.innerHTML='<img src="'+e(previewUrl)+'" alt="Selected company logo preview">';
    setStatus('Logo selected. It will be uploaded when the profile is saved.');
   }else{
    logoPreview.innerHTML=profile.logoDataUrl?
     '<img src="'+e(profile.logoDataUrl)+'" alt="'+e(profile.legalName)+' logo">':
     '<span>No company logo configured</span>';
    setStatus('');
   }
  });
  removeButton.addEventListener('click',()=>{
   pendingLogoFile=null;removeLogo=true;logoInput.value='';revokePreview();
   logoPreview.innerHTML='<span>Company logo will be removed when saved</span>';
   setStatus('Logo removal selected. Save the profile to apply it.');
  });
  form.addEventListener('submit',async event=>{
   event.preventDefault();
   if(busy||!current())return;
   busy=true;submit.disabled=true;setStatus('Saving company profile…');
   try{
    const formData=new FormData(form);
    const saved=await fundTracker.saveCompanyProfileWithLogo({auth,api:db,workspaceId,companyCode,
     file:pendingLogoFile,removeLogo,profile:{
      legalName:String(formData.get('legalName')||''),
      registeredAddress:String(formData.get('registeredAddress')||''),
      contactPhone:String(formData.get('contactPhone')||''),
      contactEmail:String(formData.get('contactEmail')||''),
      taxIdNumber:String(formData.get('taxIdNumber')||''),
      logoPath:profile.logoPath
     }});
    if(!current())return;
    pendingLogoFile=null;removeLogo=false;logoInput.value='';revokePreview();
    profile=saved;
    state.frtFinance.companies=state.frtFinance.companies.map(company=>
     company.code===companyCode?{...company,name:profile.legalName}:company);
    render();
    setStatus(saved.logoLoadError?
     'Company profile saved and read back. The saved logo preview is unavailable: '+saved.logoLoadError:
     'Company profile saved and read back successfully. Voucher previews and PDFs will use the saved information.');
    logoPreview.innerHTML=profile.logoDataUrl?
     '<img src="'+e(profile.logoDataUrl)+'" alt="'+e(profile.legalName)+' logo">':
     '<span>No company logo configured</span>';
   }catch(error){
    if(current())setStatus(error?.message||'Company profile could not be saved.',true);
   }finally{
    busy=false;
    if(current())submit.disabled=false;
   }
  });
 }catch(error){
  if(current())host.innerHTML='<div class="frt-collab-empty" role="alert">Company profile could not be loaded: '+
   e(error?.message||'Refresh the company and try again.')+'</div>';
 }
}
async function openFRTVoucherDialog(requestId,request){
 const workspaceId=state.context?.workspace_id,boardId=state.boardId;
 const userId=auth.userId,seq=routeSerial,companyCode=state.frtFinance?.companyCode;
 const expectedRole=state.frtFinance?.role;
 const allowedRequestIds=(state.frtFinance?.requests||[]).map(row=>row.requestId);
 if(!workspaceId||!userId||!companyCode||!allowedRequestIds.includes(requestId))return;
 const view=openFRTCollabPanel('Disbursement Voucher',
  '<div class="frt-voucher-status" role="status">Retrieving persisted voucher and expense details…</div>');
 const host=view.querySelector('[data-frt-panel-body]');
 let previewUrl='',busy=false;
 const current=()=>frtPanelIsCurrent(view,{seq,workspaceId,boardId,userId});
 const revokePreview=()=>{
  if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl='';}
 };
 view.addEventListener('click',event=>{
  if(event.target===view||event.target.closest('[data-frt-collab-close]'))revokePreview();
 });
 view.addEventListener('keydown',event=>{if(event.key==='Escape')revokePreview();});
 const setStatus=message=>{
  const status=host?.querySelector('[data-frt-voucher-status]');
  if(status)status.textContent=message;
 };
 try{
  const result=await fundTracker.loadVoucher({auth,api:db,workspaceId,requestId,companyCode,
   expectedRole,expectedVoucher:request.voucher,expectedTitle:request.title,allowedRequestIds});
  if(!current())return;
  let voucher=result.voucher;
  host.innerHTML=renderFRTVoucherDocument(voucher);
  fundTracker.mountAccountingEditor({host,api:db,workspaceId,requestId,getVoucher:()=>voucher,onSaved:async()=>{
   const fresh=await fundTracker.loadVoucher({auth,api:db,workspaceId,requestId,companyCode,expectedRole,
    expectedVoucher:request.voucher,expectedTitle:request.title,
    allowedRequestIds:(state.frtFinance?.requests||[]).map(row=>row.requestId)});
   if(!current())return null;
   voucher=fresh.voucher;revokePreview();host.innerHTML=renderFRTVoucherDocument(voucher);
   return voucher;
  }});
  const controls=()=>[...host.querySelectorAll('[data-frt-voucher-preview],[data-frt-voucher-download],[data-frt-voucher-print],[data-frt-voucher-reprint]')];
  const setBusy=value=>{busy=value;const ready=host.querySelector('[data-frt-accounting-editor]')?.dataset.balanced==='true';controls().forEach(control=>{control.disabled=value||!ready;});};
  const pdfModule=()=>import('./frt-voucher-pdf.js');
  const preview=async()=>{
   const pdf=await pdfModule();
   const blob=await pdf.createFRTVoucherPdfBlob(voucher);
   if(!current())return;
   revokePreview();
   previewUrl=URL.createObjectURL(blob);
   const frameHost=host.querySelector('[data-frt-voucher-pdf-preview]');
   frameHost.innerHTML='<iframe data-frt-voucher-pdf-frame title="PDF preview of '+e(voucher.voucherNumber)+
    '" src="'+e(previewUrl)+'"></iframe>';
   setStatus('PDF preview generated from persisted request data. Voucher number unchanged.');
  };
  const printCurrent=async(reprint)=>{
   // Open synchronously inside the real click handler to avoid popup blocking.
   const printWindow=window.open('about:blank','_blank');
   if(!printWindow)throw new ApiError('Allow pop-ups to print the voucher.',400);
   try{
    let documentVoucher=voucher;
    if(reprint){
     const fresh=await fundTracker.loadVoucher({auth,api:db,workspaceId,requestId,companyCode,
      expectedRole,expectedVoucher:request.voucher,expectedTitle:request.title,
      allowedRequestIds:(state.frtFinance?.requests||[]).map(row=>row.requestId)});
     if(!current()){printWindow.close();return;}
     documentVoucher=fresh.voucher;
     if(documentVoucher.voucherNumber!==voucher.voucherNumber)
      throw new ApiError('The persisted voucher number changed unexpectedly. Reopen the request.',409);
    }
    const pdf=await pdfModule();
    await pdf.printFRTVoucherPdf(documentVoucher,printWindow);
    if(current())setStatus(reprint?
     'Reprint generated from a fresh signed read of the persisted voucher. Voucher number preserved.':
     'Print document opened. No approval or payment action was performed.');
   }catch(error){if(!printWindow.closed)printWindow.close();throw error;}
  };
  host.addEventListener('click',async event=>{
   const button=event.target.closest('[data-frt-voucher-preview],[data-frt-voucher-download],[data-frt-voucher-print],[data-frt-voucher-reprint]');
   if(!button||busy||!current())return;
   setBusy(true);
   try{
    if(button.matches('[data-frt-voucher-preview]'))await preview();
    else if(button.matches('[data-frt-voucher-download]')){
     const pdf=await pdfModule();await pdf.downloadFRTVoucherPdf(voucher);
     if(current())setStatus('PDF downloaded. Reprinting will reuse '+voucher.voucherNumber+'.');
    }else if(button.matches('[data-frt-voucher-print]'))await printCurrent(false);
    else if(button.matches('[data-frt-voucher-reprint]'))await printCurrent(true);
   }catch(error){if(current())setStatus(error?.message||'Voucher output could not be generated.');}
   finally{if(current())setBusy(false);}
  });
 }catch(error){
  if(current())host.innerHTML='<div class="frt-collab-empty" role="alert">Voucher could not be loaded: '+
   e(error?.message||'Refresh the request and try again.')+'</div>';
 }
}
function downloadFRTActivityCsv(events,requests){
 const requestMap=new Map(requests.map(request=>[request.requestId,request]));
 const blob=new Blob([fundTracker.auditCsv(events,requestMap)],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='frt-activity-'+new Date().toISOString().slice(0,10)+'.csv';
 document.body.append(link);link.click();link.remove();URL.revokeObjectURL(url);
}
async function openFRTActivityDialog(){
 const workspaceId=state.context?.workspace_id,boardId=state.boardId,userId=auth.userId,seq=routeSerial;
 if(!workspaceId||!userId||state.frtFinance?.status!=='PASS')return;
 const companies=state.frtFinance.companies;
 const filters={companyCode:state.frtFinance.companyCode,requestId:'',action:'',search:''};
 let offset=0,page=null,busy=false,error='';
 const view=openFRTCollabPanel('Activity Log',
  '<p class="frt-collab-intro">Persisted FRT audit events for the selected company. Records are shown newest first; CSV exports the current filtered page.</p>'+
  '<div data-frt-activity-content><div class="frt-collab-empty">Loading activity…</div></div>');
 const host=view.querySelector('[data-frt-activity-content]');
 const current=()=>frtPanelIsCurrent(view,{seq,workspaceId,boardId,userId});
 const render=()=>{
  if(!current())return;
  const requests=page?.requests||[];
  const events=page?.events||[];
  host.innerHTML=renderFRTActivityFilters({companies,requests,...filters})+
   (busy?'<p class="frt-collab-status" role="status">Loading persisted activity…</p>':'')+
   (error?'<p class="frt-collab-status" role="alert">'+e(error)+'</p>':'')+
   renderFRTActivityEvents(events,requests,{currentUserId:userId,currentUserName:name()})+
   '<div class="frt-collab-actions"><button type="button" class="secondary frt-collab-export" data-frt-activity-export '+(!events.length?'disabled':'')+'>Export current page CSV</button></div>'+
   '<div class="frt-collab-pagination"><button type="button" class="secondary" data-frt-activity-prev '+(offset===0||busy?'disabled':'')+'>Previous</button>'+
   '<span>Showing '+(events.length?offset+1:0)+'–'+(offset+events.length)+' · Page '+(Math.floor(offset/50)+1)+'</span>'+
   '<button type="button" class="secondary" data-frt-activity-next '+(!page?.hasMore||busy?'disabled':'')+'>Next</button></div>';
  if(busy)host.querySelectorAll('[data-frt-activity-filters] input,[data-frt-activity-filters] select,[data-frt-activity-filters] button').forEach(control=>{control.disabled=true;});
  host.querySelector('[data-frt-activity-filters]')?.addEventListener('submit',event=>{
   event.preventDefault();
   const data=new FormData(event.currentTarget);
   const nextCompany=String(data.get('companyCode')||filters.companyCode);
   const companyChanged=nextCompany!==filters.companyCode;
   filters.companyCode=nextCompany;
   filters.requestId=companyChanged?'':String(data.get('requestId')||'');
   filters.action=String(data.get('action')||'');
   filters.search=String(data.get('search')||'').slice(0,80);
   offset=0;void loadPage();
  });
  host.querySelector('[data-frt-activity-prev]')?.addEventListener('click',()=>{if(offset>=50){offset-=50;void loadPage();}});
  host.querySelector('[data-frt-activity-next]')?.addEventListener('click',()=>{if(page?.hasMore){offset+=50;void loadPage();}});
  host.querySelector('[data-frt-activity-export]')?.addEventListener('click',()=>downloadFRTActivityCsv(events,requests));
 };
 const loadPage=async()=>{
  if(busy||!current())return;
  busy=true;error='';render();
  try{
   page=await fundTracker.loadAuditPage({auth,api:db,workspaceId,companyCode:filters.companyCode,
    requestId:filters.requestId,action:filters.action,search:filters.search,offset,limit:50});
   if(!current())return;
  }catch(err){if(current())error=err?.message||'Activity could not be loaded.';}
  finally{busy=false;if(current())render();}
 };
 render();await loadPage();
}
async function openFRTNotificationsDialog(){
 const workspaceId=state.context?.workspace_id,boardId=state.boardId,userId=auth.userId,seq=routeSerial;
 const companyCode=state.frtFinance?.companyCode;
 if(!workspaceId||!userId||!companyCode||state.frtFinance?.status!=='PASS')return;
 const view=openFRTCollabPanel('Notification Center',
  '<p class="frt-collab-intro">Notifications are derived from persisted FRT audit events and the existing signed 72-hour bank-execution snapshots. Refresh to update; no background polling is used.</p>'+
  '<div class="frt-collab-actions"><button type="button" class="secondary" data-frt-notification-refresh>Refresh notifications</button></div>'+
  '<div data-frt-notification-content><div class="frt-collab-empty">Loading notifications…</div></div>');
 const host=view.querySelector('[data-frt-notification-content]');
 const current=()=>frtPanelIsCurrent(view,{seq,workspaceId,boardId,userId});
 let busy=false;
 const load=async()=>{
  if(busy||!current())return;
  busy=true;host.innerHTML='<div class="frt-collab-empty" role="status">Loading persisted events and liquidation deadlines…</div>';
  try{
   const [page,agingResult]=await Promise.all([
    fundTracker.loadAuditPage({auth,api:db,workspaceId,companyCode,limit:100,offset:0}),
    fundTracker.loadAgingSummary({api:db,workspaceId,companyCode}).then(aging=>({aging})).catch(error=>({error}))
   ]);
   const snapshots=await fundTracker.loadDeadlineSnapshots({api:db,workspaceId,requests:page.requests,concurrency:6});
   if(!current())return;
   const notifications=fundTracker.projectNotifications({events:page.events,requests:page.requests,
    bankSnapshots:snapshots.filter(item=>item.snapshot).map(item=>({requestId:item.requestId,snapshot:item.snapshot}))});
   const failed=snapshots.filter(item=>item.error).length;
   host.innerHTML=(agingResult.aging?renderFRTNotificationSummary(agingResult.aging):
    '<p class="frt-collab-status">Liquidation aging summary is temporarily unavailable.</p>')+
    (page.hasMore?'<p class="frt-collab-status">Showing the latest 100 persisted request events. Older events are available in Activity Log.</p>':'')+
    (failed?'<p class="frt-collab-status">Some request-specific deadline snapshots were unavailable and were not inferred.</p>':'')+
    renderFRTNotifications(notifications,page.requests,{currentUserId:userId,currentUserName:name()});
  }catch(error){
   if(current())host.innerHTML='<div class="frt-collab-empty" role="alert">'+e(error?.message||'Notifications could not be loaded.')+'</div>';
  }finally{busy=false;}
 };
 view.querySelector('[data-frt-notification-refresh]')?.addEventListener('click',()=>void load());
 host.addEventListener('click',async event=>{
  const button=event.target.closest('[data-frt-notification-request]');
  if(!button||!current())return;
  const requestId=String(button.dataset.frtNotificationRequest||'');
  if(!state.frtFinance.requests.some(request=>request.requestId===requestId))return;
  hideModal();await loadFRTFinanceDetail(requestId,seq);
 });
 await load();
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
 const tabs=['items','issues',...(isMaterialTrackerBoard(state.board)?['sourcing']:[]),
  ...(moduleKey==='fueltrans'?['fueltrans']:[])];
 const minimal=isItemOnlyBoard(state.board,state.boardUi);
 const columns=(moduleKey?boardGridColumns(state.board,{allowCustom:BOARD_STRUCTURE_ADMIN_ENABLED&&state.boardUi?.status==='VERIFIED_READ'}):genericBoardColumns(state.board,{minimal,hiddenVirtual:state.boardUi?.hiddenVirtual})).map(c=>c.key);
 const pref=loadBoardLayout(state.context,state.boardId,tabs,columns,boardPreferences);
 if(minimal)pref.columns=itemOnlyColumnKeys(columns,state.boardUi);
 return {tabs,columns,pref};
}
function persistBoardLayout(transform){
 const a=activeBoardLayout();
 if(!a)return false;
 const changed=normalizeLayout(transform(a.pref,a),a.tabs,a.columns);
 return saveBoardLayout(state.context,state.boardId,changed,boardPreferences);
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
   cachedNext:boardHistory.index<boardHistory.pages.length-1,
   avatarPaths:boardHistory.avatarPaths
  });
  void mountAvatarImages(host,profileAvatarClient,null,null);
  return;
 }
 const results=renderBoardActivityResults(boardHistory.rows,boardHistory);
 boardHistory.page=results.page;
 host.innerHTML=renderBoardColumnRecoveryList(boardHistory.recoveries)+results.html;
 void mountAvatarImages(host,profileAvatarClient,null,null);
 if(focus){
  const search=host.querySelector('#board-activity-search');
  search?.focus();search?.setSelectionRange(search.value.length,search.value.length);
 }
}
async function openBoardActivity(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 let recoveries=[];
 if(state.boardManage){
  try{
   const available=await boardColumnOperationalRecovery.available(snapshot.boardId);
   recoveries=available.entries;
  }catch{
   // Activity and its filters must remain functional when recovery is offline.
   recoveries=[];
  }
 }
 const cursorMode=BOARD_COL01_AUDIT_CURSOR_ENABLED;
 const events=cursorMode?
  await loadBoardAuditCursorPage(db,snapshot.boardId):
  await db.boardEvents(snapshot.boardId,100);
 if(!boardHistoryAuthorized(snapshot))return;
 // Only the signed exact-board direct-member snapshot and the user's own
 // avatar are permitted sources. Unrecognized actors render initials.
 const signedPeople=normalizeBoardPeople(state.board,{
  boardId:snapshot.boardId,workspaceId:snapshot.workspaceId});
 const actorAvatars=new Map();
 if(signedPeople.status==='SIGNED_MEMBERSHIP'){
  for(const person of signedPeople.people)
   if(person.avatarPath)actorAvatars.set(person.id,person.avatarPath);
 }
 if(snapshot.userId===state.context?.user_id&&
    typeof state.context?.profile?.avatar_path==='string')
  actorAvatars.set(snapshot.userId,state.context.profile.avatar_path);
 boardHistory=cursorMode?
  {...snapshot,recoveries,avatarPaths:actorAvatars,mode:'cursor',pages:[events],index:0,busy:false,error:''}:
  {...snapshot,recoveries,avatarPaths:actorAvatars,rows:normalizeBoardActivity(events),limit:100,
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
   if(!state.boardManage)return;
   const current=boardHistory;
   const entry=current.recoveries?.find(x=>x.deletionId===
     event.target.closest('[data-board-history-action]')?.dataset.id);
   if(!entry?.restorable)return;
   current.busy=true;redrawBoardHistory();
   try{
    const fresh=await verifyInlineColumnBoard({...current,
     boardRevision:state.board?.board?.updated_at});
    await boardColumnOperationalRecovery.restore(fresh,entry);
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
 const sourcing=isMaterialSourcingBoard(state.board?.board);
 const sourcingPublic=sourcing?materialTrackerRows(state.board).find(row=>row.id===itemId):null;
 const collaboration=sourcing?null:await loadBoardCollaboration(db,itemId).catch(()=>({status:'ERROR'}));
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-detail-backdrop';
 modal.innerHTML='<aside class="board-item-drawer'+(sourcing?' mrh-detail-drawer':'')+
  '" role="dialog" aria-modal="true" aria-labelledby="board-detail-title">'+
  '<div class="board-item-drawer-header"><span class="label-top">'+
  (sourcing?'MATERIAL REQUEST HUB / MATERIAL SOURCING':'APSYNTRA CRM / Board item')+'</span>'+
  '<button type="button" class="modal-close" data-dismiss aria-label="Close item details">×</button></div>'+
  '<div class="mrh-detail-identity"><h2 id="board-detail-title">'+e(item.title||'Untitled')+'</h2>'+
   (sourcing?'<span class="mrh-detail-group-pill">'+e(group?.title||'Main group')+'</span>':'')+'</div>'+
  (sourcing?'<div class="mrh-detail-scroll">'+
   renderMaterialSourcingDetailTabs(renderMaterialSourcingPublicOverview(sourcingPublic,{
    groupTitle:group?.title||'Main group'}))+
   '</div><div class="mrh-detail-footer">'+
    '<button type="button" class="primary" data-mrh-save-all hidden>Save changes</button>'+
    '<span class="mrh-save-feedback" role="status" aria-live="polite" data-mrh-save-feedback></span>'+
    '<button type="button" class="secondary" data-mrh-editor-toggle hidden>Edit material fields</button>'+
    '<button type="button" class="secondary" data-dismiss>Close</button></div>':
   '<p class="muted">Read-only item details from the signed board response.</p>'+
    boardItemSummary(item,{groupTitle:group?.title||'Ungrouped',restricted})+
    renderBoardCollaboration(collaboration))+
  '</aside>';
 document.body.append(modal);
 modal.addEventListener('click',event=>{if(event.target===modal||event.target.closest('[data-dismiss]'))hideModal();});
 const privateHost=modal.querySelector('[data-mrh-private-host]');
 const publicHost=modal.querySelector('[data-mrh-public-host]');
 if(privateHost){
  modal.dataset.mrhActor=snapshot.userId;
  modal.dataset.mrhWorkspace=snapshot.workspaceId;
  const itemDialog=modal;
  const input={api:db,auth,boardId:snapshot.boardId,
   workspaceId:snapshot.workspaceId,itemId};
  const current=()=>modal===itemDialog&&boardHistoryAuthorized(snapshot)&&
   auth.isSignedIn&&auth.userId===snapshot.userId;
  let activityRequested=false,taskRequested=false,taskBusy=false;
  const taskHost=itemDialog.querySelector('[data-mrh-board-tasks]');
  const refreshTasks=async()=>{
   if(!taskHost||!current())return false;
   taskHost.textContent='Checking signed board-item task authorization…';
   try{
    const tasks=await readMaterialBoardItemTasks(input);
    if(!current())return;
    const editable=await db.allowed(snapshot.boardId,'edit');
    if(!current())return;
    taskHost.innerHTML=renderMaterialBoardItemTasks(tasks,{editable:editable===true});
    return true;
   }catch{
    if(current()){
     taskRequested=false;
     taskHost.innerHTML='<p role="status">Signed board-item tasks are not activated or are unavailable for this session. No task changes were made.</p>';
    }
    return false;
   }
  };
  itemDialog.addEventListener('submit',async event=>{
   const form=event.target.closest('[data-mrh-board-task]');
   if(!form)return;
   event.preventDefault();
   if(!current()||taskBusy)return;
   const taskId=form.dataset.taskId||null;
   const revision=taskId?Number(form.dataset.revision):null;
   const data=new FormData(form);
   taskBusy=true;
   let confirmed=false;
   form.querySelectorAll('button').forEach(b=>b.disabled=true);
   const status=taskHost?.querySelector('[data-mrh-task-status]');
   if(status)status.textContent='Saving task…';
   try{
    await saveMaterialBoardItemTask(input,{
     id:taskId,title:data.get('title'),status:data.get('status'),revision
    });
    if(!current())return;
    if(!await refreshTasks())throw new ApiError('Task reload not verified.',409);
    confirmed=true;
    if(current()){
     const next=taskHost?.querySelector('[data-mrh-task-status]');
     if(next)next.textContent='Task saved and reloaded from the authoritative server.';
    }
   }catch{
    if(current()){
     const next=taskHost?.querySelector('[data-mrh-task-status]');
     if(next)next.textContent='Task write not confirmed. Close and reopen this item before attempting another write.';
     taskRequested=false;
     form.querySelectorAll('button,input,select').forEach(control=>control.disabled=true);
    }
   }finally{
    taskBusy=false;
    if(confirmed&&form.isConnected)form.querySelectorAll('button').forEach(b=>b.disabled=false);
   }
  });
  itemDialog.addEventListener('click',async event=>{
   const button=event.target.closest('[data-mrh-detail-tab]');
   if(!button||!current())return;
   const tab=button.dataset.mrhDetailTab;
   if(!selectMaterialSourcingDetailTab(itemDialog,tab))return;
   if(tab==='tasks'){
    if(!taskRequested){taskRequested=true;await refreshTasks();}
    return;
   }
   if(tab!=='activity'||activityRequested)return;
   activityRequested=true;
   const target=itemDialog.querySelector('[data-mrh-item-activity]');
   if(!target)return;
   target.textContent='Loading signed item activity…';
   try{
    const rows=await db.boardEvents(snapshot.boardId,200);
    if(!current())return;
    const allowed=await db.allowed(snapshot.boardId,'view');
    if(!current())return;
    if(!allowed)throw new ApiError('Item activity access denied.',403);
    target.innerHTML=renderMaterialSourcingItemActivity(
     materialSourcingItemAuditRows(rows,itemId));
   }catch{
    if(current()){
     target.textContent='Item activity unavailable for this session. No unrelated board events were shown.';
     activityRequested=false;
    }
   }
  });
  let values=null,busy=false,editing=false,needsReopen=false;
  let publicDetail=state.board,canPublicEdit=false,canProtectedEdit=false;
  const editToggle=itemDialog.querySelector('[data-mrh-editor-toggle]');
  const saveAll=itemDialog.querySelector('[data-mrh-save-all]');
  const statusMessage=message=>{
   const status=privateHost.querySelector('[data-mrh-private-status]');
   if(status)status.textContent=message;
   const feedback=itemDialog.querySelector('[data-mrh-save-feedback]');
   if(feedback)feedback.textContent=message;
  };
  const controls=()=>[...privateHost.querySelectorAll('[data-mrh-private-field]')];
  const rawDraft=()=>Object.fromEntries(controls().map(host=>[
   host.dataset.mrhPrivateField,host.querySelector('[name="value"]')?.value??''
  ]));
  const pendingChanges=()=>planProtectedSourcingChanges(values,rawDraft());
  const publicControls=()=>[...publicHost.querySelectorAll('[data-mrh-public-field]')];
  const rawPublicDraft=()=>Object.fromEntries(publicControls().map(el=>[el.dataset.mrhPublicField,el.value]));
  const pendingPublicChanges=()=>planMaterialSourcingPublicChanges(publicDetail,itemId,rawPublicDraft());
  const publicRow=()=>materialTrackerRows(publicDetail).find(row=>row.id===itemId);
  const publicEnabled=()=>{
   const cols=materialAddPublicColumns(publicDetail);
   return ['partNumber',...Object.entries({source:'sourceType',rfq:'rfq',description:'description',
    brand:'brand',quantity:'quantity',due:'due',lead:'lead'})
    .filter(([,key])=>cols[key]).map(([key])=>key)];
  };
  const renderPublic=()=>{
   if(!publicHost)return;
   publicHost.innerHTML=renderMaterialSourcingPublicOverview(publicRow(),{
    groupTitle:group?.title||'Main group',editing,
    enabledFields:publicEnabled()});
  };
  const publicSavedDisplay=()=>{
   for(const [key,value] of Object.entries(publicRow()||{})){
    const output=publicHost.querySelector('[data-mrh-public-value="'+key+'"]');
    if(output){
     // Source has a small badge in the read view; replace only its text.
     const badge=output.querySelector('.mrh-detail-source');
     if(badge){
      badge.textContent=value??'—';
      badge.className='mrh-detail-source '+(value==='Local'?'local':value==='Import'?'import':'');
     }else output.textContent=value===null||value===undefined||value===''?'—':String(value);
    }
   }
   const item=publicDetail.items?.find(i=>i.id===itemId);
   const title=itemDialog.querySelector('#board-detail-title');
   if(item&&title)title.textContent=item.title;
  };
  const updateDisplay=records=>{
   for(const host of controls()){
    const field=host.dataset.mrhPrivateField;
    const cell=records?.[field];
    const output=host.closest('.mrh-sourcing-field')?.querySelector('[data-mrh-private-value]');
    if(output)output.textContent=cell?.value===undefined?'—':String(cell.value);
   }
  };
  const updateButtons=()=>{
   if(!saveAll)return;
   saveAll.hidden=!editing;
   saveAll.disabled=busy||needsReopen;
   if(editToggle)editToggle.disabled=busy||needsReopen;
   for(const host of controls()){
    const field=host.querySelector('[name="value"]');
    if(field)field.disabled=busy||needsReopen;
   }
   for(const field of publicControls())field.disabled=busy||needsReopen;
  };
  editToggle?.addEventListener('click',()=>{
   if(!current()||busy||!values)return;
   if(editing){
    try{
     if(pendingChanges().length||pendingPublicChanges().length){
      statusMessage('Unsaved edits retained. Save changes before leaving edit mode.');
      return;
     }
    }catch{
     statusMessage('Correct the pending values or restore the saved values before leaving edit mode.');
     return;
    }
   }
   editing=!editing;
   editToggle.textContent=editing?'Done editing':'Edit material fields';
   privateHost.innerHTML=renderProtectedSourcingEditor(values,{editing:editing&&canProtectedEdit});
   renderPublic();
   updateButtons();
  });
  const refresh=async()=>{
   try{
    const result=await readProtectedSourcingItem(input);
    if(!current())return false;
    values=result;
    const detail=await db.board(snapshot.boardId);
    if(!current()||detail.board?.workspace_id!==snapshot.workspaceId||
       !detail.items?.some(item=>item.id===itemId&&item.group_id===MATERIAL_SOURCING_GROUP.id))return false;
    publicDetail=detail;
    needsReopen=false;
    const editAllowed=await db.allowed(snapshot.boardId,'edit').catch(()=>false);
    canPublicEdit=editAllowed===true;
    canProtectedEdit=false;
    if(editAllowed===true){
     try{
      const role=await db.rpc('material_request_hub_bootstrap',{
       p_workspace_id:snapshot.workspaceId});
      canProtectedEdit=role?.workspaceId===snapshot.workspaceId&&role?.role==='ADMIN';
     }catch{}
    }
    if(!current())return false;
    editing=editing&&(canPublicEdit||canProtectedEdit);
    privateHost.innerHTML=renderProtectedSourcingEditor(result,{editing:editing&&canProtectedEdit});
    renderPublic();
    if(editToggle){
     editToggle.hidden=!(canPublicEdit||canProtectedEdit);
     editToggle.textContent=editing?'Done editing':'Edit material fields';
    }
    updateButtons();
    return true;
   }catch(error){
    if(!current())return false;
    values=null;
    if(editToggle)editToggle.hidden=true;
    if(saveAll)saveAll.hidden=true;
    privateHost.innerHTML=renderMaterialSourcingUnavailableDetails({
     reason:classifyMaterialSourcingDetailError(error)});
    return false;
   }
  };
  itemDialog.addEventListener('click',event=>{
   if(!event.target.closest('[data-mrh-details-retry]')||!current()||busy)return;
   privateHost.innerHTML='<p role="status" class="muted">Reloading material details…</p>';
   void refresh();
  });
  // Keep the fields mounted throughout saving: no page, board or drawer refresh.
  saveAll?.addEventListener('click',async()=>{
   if(!current()||busy||!editing||!values)return;
   let changes,publicChanges;
   try{
    changes=pendingChanges();
    publicChanges=pendingPublicChanges();
   }catch(error){statusMessage(errorMessage(error));return;}
   const total=changes.length+publicChanges.length;
   if(!total){statusMessage('No changes to save.');return;}
   busy=true;updateButtons();
   const originalDraft=rawDraft(),originalPublicDraft=rawPublicDraft();
   statusMessage('Saving '+total+' pending change'+(total===1?'':'s')+'…');
   let completed=0;
   try{
    for(const change of publicChanges){
     await saveMaterialSourcingPublicChange({api:db,itemId,change});
     if(!current())return;
     completed++;
    }
    for(const change of changes){
     const receipt=await writeProtectedSourcingField({...input,
      fieldName:change.fieldName,value:change.value,
      expectedRevision:change.expectedRevision});
     if(!current())return;
     values={...values,[change.fieldName]:{
      value:change.value,revision:receipt.revision}};
     completed++;
    }
    // One post-save authoritative read, no input replacement or focus loss.
    const [persisted,board]=await Promise.all([
     readProtectedSourcingItem(input),db.board(snapshot.boardId)]);
    if(!current())return;
    if(board.board?.workspace_id!==snapshot.workspaceId||
       !verifyMaterialSourcingPublicChanges(board,itemId,publicChanges)||
       changes.some(change=>persisted?.[change.fieldName]?.value!==change.value))
     throw new ApiError('Saved values could not be verified.',409);
    values=persisted;publicDetail=board;
    if(state.boardId===snapshot.boardId)state.board=board;
    updateDisplay(values);publicSavedDisplay();
    statusMessage(total+' change'+(total===1?'':'s')+
     ' saved and verified. Continue editing or select Done editing.');
   }catch(error){
    if(!current())return;
    // A later write or verification may fail after earlier fields committed.
    // Reconcile revisions without replacing any input or discarding the draft.
    try{
     const [persisted,board]=await Promise.all([
      readProtectedSourcingItem(input),db.board(snapshot.boardId)]);
     if(!current()||board.board?.workspace_id!==snapshot.workspaceId)return;
     values=persisted;publicDetail=board;
     if(state.boardId===snapshot.boardId)state.board=board;
     updateDisplay(values);publicSavedDisplay();
     const unresolvedPrivate=Object.entries(originalDraft).filter(([name,raw])=>{
      try{return planProtectedSourcingChanges(persisted,{[name]:raw}).length>0;}
      catch{return true;}
     }).length;
     const unresolvedPublic=(()=>{
      try{return planMaterialSourcingPublicChanges(board,itemId,originalPublicDraft).length;}
      catch{return Object.keys(originalPublicDraft).length;}
     })();
     const unresolved=unresolvedPrivate+unresolvedPublic;
     statusMessage(unresolved?
      'Some changes were not saved ('+unresolved+' pending). Your edits are retained; review the values and retry Save changes. '+errorMessage(error):
      'All values match the server, but confirmation was interrupted. Your edits are retained.');
    }catch{
     statusMessage('Save was not fully verified ('+completed+'/'+total+
      ' acknowledged). Your edits are retained. Reopen details to reconcile before another attempt.');
     // An unknown commit outcome cannot safely be retried with stale revisions.
     needsReopen=true;
     return;
    }
   }finally{
    busy=false;updateButtons();
   }
  });
  void refresh();
 }
 modal.querySelector('[data-dismiss]')?.focus();
}
async function openBoardMembers(){
 if(!activeBoardLayout())return;
 const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 // Never infer board authorization from the existence of a client-side list.
 if(!(await db.allowed(snapshot.boardId,'view'))||!boardHistoryAuthorized(snapshot))return;
 let detail;
 try{detail=await db.board(snapshot.boardId);}
 catch{return;}
 if(!boardHistoryAuthorized(snapshot)||detail.board?.workspace_id!==snapshot.workspaceId)return;
 const people=normalizeBoardPeople(detail,{
  boardId:snapshot.boardId,workspaceId:snapshot.workspaceId});
 const directory=await loadBoardInvitableDirectory(db,snapshot.boardId)
  .catch(()=>({status:'ERROR'}));
 if(!boardHistoryAuthorized(snapshot))return;
 hideModal();modal=document.createElement('div');
 modal.className='modal-backdrop board-history-backdrop';
 modal.innerHTML='<section class="modal board-history-modal" role="dialog" aria-modal="true" aria-labelledby="board-members-title">'+
  '<div class="modal-head"><h2 id="board-members-title">Who can access this board?</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close board members">×</button></div>'+
  '<p class="bs02-people-compact-note">Hover or focus an avatar to see the member’s full name and role. Select an avatar to copy @name.</p>'+
  renderBoardPeople(people)+
  '<details class="bs02-tools"><summary>More board tools</summary><div class="bs02-tools-body">'+
   renderMentionDraft(people)+
   '<div data-col01-directory-results>'+renderBoardInvitableDirectory(directory)+'</div>'+
  '</div></details></section>';
 document.body.append(modal);
 const view=modal;
 // Existing signed avatar URL flow; no new profile directory or broad reads.
 void mountAvatarImages(view,profileAvatarClient,null,null);
 const editor=view.querySelector('#bs02-mention-editor');
 const options=view.querySelector('[data-bs02-mention-options]');
 const suggestions=()=>{
  if(!editor||!options||view!==modal||!boardHistoryAuthorized(snapshot))return;
  options.innerHTML=renderMentionOptions(
   mentionCandidates(people,editor.value,editor.selectionStart));
 };
 view.addEventListener('input',event=>{
  if(view!==modal||!boardHistoryAuthorized(snapshot))return;
  if(event.target.id==='bs02-people-search'){
   const query=event.target.value.slice(0,120);
   const host=view.querySelector('.bs02-people [data-bs02-people-results]');
   if(host){
    const html=renderBoardPeople(people,{query});
    const parsed=document.createElement('div');parsed.innerHTML=html;
    const candidate=parsed.querySelector('[data-bs02-people-results]');
    host.replaceChildren(...(candidate?[...candidate.childNodes]:[]));
    void mountAvatarImages(host,profileAvatarClient,null,null);
   }
  }
  if(event.target===editor)suggestions();
 });
 view.addEventListener('keyup',event=>{if(event.target===editor)suggestions();});
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
 view.addEventListener('click',async event=>{
  if(event.target===view||event.target.closest('[data-dismiss]')){hideModal();return;}
  if(!boardHistoryAuthorized(snapshot)||view!==modal)return;
  const mention=event.target.closest('[data-bs02-mention-id]');
  if(mention&&editor){
   const person=people.people.find(p=>p.id===mention.dataset.bs02MentionId);
   if(!person)return;
   const inserted=insertMention(editor.value,editor.selectionStart,person);
   if(!inserted)return;
   editor.value=inserted.text;
   editor.focus();editor.setSelectionRange(inserted.cursor,inserted.cursor);
   if(options)options.replaceChildren();
   return;
  }
  const member=event.target.closest('[data-bs02-copy-name]');
  const copy=event.target.closest('[data-bs02-copy-draft]');
  if(!member&&!copy)return;
  const person=member&&people.people.find(p=>p.id===member.dataset.bs02CopyName);
  if(member&&!person)return;
  const value=member?'@'+person.name:editor?.value||'';
  if(!value||!navigator.clipboard?.writeText)return;
  try{await navigator.clipboard.writeText(value);
   if(boardHistoryAuthorized(snapshot))toast('Local '+(member?'name reference':'draft')+' copied. No notification was sent.');
  }catch{if(boardHistoryAuthorized(snapshot))toast('Clipboard unavailable; select and copy the text manually.');}
 });
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
 // Independent signed reads may overlap. The same identity, permission,
 // revision and workspace checks still gate every subsequent mutation.
 const [user,ctx,fresh,allowed,session]=await Promise.all([
  auth.getVerifiedUser(),db.context(),
  db.board(snapshot.boardId),
  db.allowed(snapshot.boardId,'manage'),
  db.rpc('wm_board_ui_read',{p_board_id:snapshot.boardId})
 ]);
 if(user?.id!==snapshot.userId||ctx?.user_id!==snapshot.userId||
    ctx?.profile?.status!=='active'||ctx?.workspace_id!==snapshot.workspaceId||
    allowed!==true||!canManuallyEditBoard(fresh?.board,true)||
    fresh?.board?.id!==snapshot.boardId||
    fresh?.board?.workspace_id!==snapshot.workspaceId)
  throw new ApiError('Signed board manager authorization is no longer valid.',403);
 if(fresh.board.updated_at!==snapshot.boardRevision)
  throw new ApiError('Board columns changed since this menu was opened. Refresh and review.',409);
 if(session?.board_id!==snapshot.boardId)
  throw new ApiError('Active signed board session is required.',403);
 return fresh;
}
function inlineColumnSnapshot(){
 if(!state.board?.board||!state.context)return null;
 return {boardId:state.boardId,userId:state.context.user_id,
  workspaceId:state.context.workspace_id,boardRevision:state.board.board.updated_at};
}
/** Inline label save uses the existing signed board UI revision CAS. */
async function savePrimaryHeaderLabel(label,origin){
 const text=String(label??'').trim();
 if(!text||text.length>80)
  throw new ApiError('Primary column name must contain 1–80 characters.',400);
 const sameScope=()=>auth.isSignedIn&&state.view==='board'&&
  state.boardId===origin.boardId&&state.context?.workspace_id===origin.workspaceId&&
  auth.userId===origin.userId&&state.boardManage===true;
 if(!sameScope())throw new ApiError('Board session changed. Reload before saving.',403);
 const [actor,context,settings,canManage]=await Promise.all([
  auth.getVerifiedUser(),db.context(),boardStructureClient.read(origin.boardId),
  db.allowed(origin.boardId,'manage')
 ]);
 if(!sameScope()||actor?.id!==origin.userId||context?.user_id!==origin.userId||
   context.workspace_id!==origin.workspaceId||context.profile?.status!=='active'||
   canManage!==true||settings.status!=='VERIFIED_READ')
  throw new ApiError('Signed board management session changed.',403);
 if(settings.revision!==origin.revision)
  throw new ApiError('Column label was updated elsewhere. Refresh and retry.',409);
 if(settings.primaryLabel===text&&origin.displayedLabel===text)return settings;
 const fresh=await db.board(origin.boardId);
 if(!sameScope()||fresh.board?.workspace_id!==origin.workspaceId||
    fresh.board.id!==origin.boardId||fresh.board.status!=='active')
  throw new ApiError('Board workspace or lifecycle changed.',403);
 const saved=await boardStructureClient.save(fresh,{...settings,primaryLabel:text});
 if(!sameScope())return saved;
 const verified=await boardStructureClient.read(origin.boardId);
 if(!sameScope()||verified.primaryLabel!==text||verified.revision!==saved.revision)
  throw new ApiError('Column rename result could not be verified. Refresh the board.',409);
 state.boardUi=verified;
 // No full board reload or row mutation: existing board data remains mounted.
 deferVisibleBoardContent();
 return verified;
}
function beginPrimaryHeaderEdit(button){
 if(!button?.isConnected||!state.boardManage||
    state.boardUi?.status!=='VERIFIED_READ'||state.tab!=='items'||
    !BOARD_STRUCTURE_ADMIN_ENABLED)return;
 const th=button.closest('th[data-column-key="record"]');
 if(!th||root.querySelector('[data-board-primary-label-editor]'))return;
 const previous=button.textContent.trim();
 const origin={boardId:state.boardId,userId:auth.userId,
  workspaceId:state.context?.workspace_id,revision:state.boardUi.revision,
  displayedLabel:previous};
 const input=document.createElement('input');
 input.type='text';input.maxLength=80;input.value=previous;
 input.className='board-primary-label-input';
 input.setAttribute('data-board-primary-label-editor','');
 input.setAttribute('aria-label','Primary column name');
 const restore=()=>{if(input.isConnected)input.replaceWith(button);};
 let busy=false,cancelled=false;
 const commit=async()=>{
  if(busy||cancelled||!input.isConnected)return;
  const next=input.value.trim();
  if(next===previous){restore();return;}
  busy=true;input.disabled=true;
  try{
   await savePrimaryHeaderLabel(next,origin);
   restore();
   // Once focused editor is removed, apply any deferred content replacement.
   flushVisibleBoardContent({afterLocalSave:true});
   toast('Primary column renamed.');
  }catch(error){
   if(input.isConnected){input.disabled=false;input.focus();input.select();}
   notice(error);
  }finally{busy=false;}
 };
 input.addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();void commit();}
  else if(event.key==='Escape'){event.preventDefault();cancelled=true;restore();}
 });
 // Blur saves the value, with Escape offering a non-mutating cancellation.
 input.addEventListener('blur',()=>{if(!cancelled&&!busy)void commit();});
 button.replaceWith(input);input.focus();input.select();
}
function contextualColumnEditor(key){
 const snapshot=inlineColumnSnapshot();
 if(!snapshot||!state.boardManage)return;
 const column=resolveInlineColumn(state.board,key,{canManage:state.boardManage});
 if(column.kind==='primary'){
  beginPrimaryHeaderEdit(root.querySelector('th[data-column-key="record"] .board-primary-label-button'));
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
  const receipt=await boardStructureClient.mutate(fresh,{action:'update',columnId:target.id,
   name:update.name,type:update.type,config,visible:update.visible},
   {verifiedManagerPreflight:true});
  const nameOnly=update.type===target.type&&update.visible===target.visible&&
   JSON.stringify(config)===JSON.stringify(target.config);
  const projected=nameOnly&&state.boardId===snapshot.boardId&&
   state.context?.user_id===snapshot.userId&&
   state.context?.workspace_id===snapshot.workspaceId&&
   projectConfirmedColumnRename(state.board,{columnId:target.id,name:update.name,
    receipt,expectedRevision:snapshot.boardRevision});
  if(projected){
   state.board=projected;
   deferVisibleBoardContent();
   // Server-side CAS has committed. Reconcile with a complete authorized read
   // without blocking the successful rename dialog on every board/row request.
   void loadBoard(snapshot.boardId,'items');
  }else await loadBoard(snapshot.boardId,'items');
 });
}
async function contextualColumnDelete(key){
 const snapshot=inlineColumnSnapshot();
 if(!snapshot||!state.boardManage)return;
 const column=resolveInlineColumn(state.board,key,{canManage:true});
 if(column.kind==='primary')
  throw new ApiError('The required Item column cannot be deleted.',403);
 const storedCount=columnStoredValueCount(state.board,column.id);
 // The currently installed server remains default-off and QA scoped.
 // A signed server response, never an expired browser flag, determines whether
 // a recoverable action is offered. Server deletion still independently denies
 // missing activation, scoped access and incompatible board revisions.
 let recoveryReady=false;
 if(storedCount>0){
  try{
   const capability=await boardColumnOperationalRecovery.available(snapshot.boardId);
   if(!boardHistoryAuthorized(snapshot))return;
   recoveryReady=capability.ready;
  }catch{
   // Preserve the reversible hide action if the recovery service is unavailable.
  }
 }
 const plan=planBoardColumnRemoval({storedCount,recoveryReady});
 const summary=plan.kind==='hide-preserve'?
  'This column contains '+storedCount+' stored cell row'+(storedCount===1?'':'s')+
  '. To avoid deleting saved data, remove it from your board view instead. '+
  'The column and every stored value remain unchanged and can be shown again using Columns. '+
  'Permanent deletion with private recovery requires a separately activated server operation.':
  plan.kind==='delete-recoverable'?
   'This column contains '+storedCount+' stored value row'+(storedCount===1?'':'s')+
   '. Deletion first stores a private transactional recovery snapshot. '+
   'Authorized managers can restore its original values from Board Activity.':
   'This custom column has zero stored value rows. '+
   'Deletion removes the column and records an Activity event.';
 openModal(plan.kind==='hide-preserve'?'Hide '+column.name+' column':
   'Delete '+column.name+' column',
  '<p class="note security-note">'+e(summary)+'</p>'+
  (plan.kind==='hide-preserve'?'':input('Type DELETE '+column.name+' exactly','confirmation','')),
  async fd=>{
   const fresh=await verifyInlineColumnBoard(snapshot);
   const target=resolveInlineColumn(fresh,key,{canManage:true});
   if(target.name!==column.name)
    throw new ApiError('Column was renamed. Reopen and review this action.',409);
   const valuesNow=columnStoredValueCount(fresh,target.id);
   if(valuesNow!==storedCount)
    throw new ApiError('Column values changed. Refresh and review before continuing.',409);
   if(plan.kind==='hide-preserve'){
    // The existing per-user board layout is reversible; no schema/record write.
    if(!activeBoardLayout()?.columns.includes(key)||
       BOARD_REQUIRED_COLUMNS.includes(key))
     throw new ApiError('Column is no longer available in this board view.',409);
    persistBoardLayout(p=>({...p,hidden:[...new Set([...p.hidden,key])]}));
    render();toast('Column hidden from your view. Stored values were preserved.');return;
   }
   const confirmation=confirmInlineColumnDelete(target,String(fd.get('confirmation')||''));
   if(plan.kind==='delete-recoverable'){
    await boardColumnOperationalRecovery.delete(fresh,target,confirmation);
   }else{
    try{
     await boardStructureClient.mutate(fresh,{action:'delete',columnId:target.id,
      confirmation});
    }catch(error){throw explainColumnDeleteError(error);}
   }
   await loadBoard(snapshot.boardId,'items');
  },{submitLabel:plan.submitLabel});
}

/** Header-adjacent picker: no speculative writes or new server schema. */
let boardQuickPicker=null,boardQuickPickerTrigger=null;
const boardRecentColumnTypes=[];
const boardPlannedColumnTypes=[
 ['Files','▣'],['Doc','▤'],['Connect boards','⇄'],['Formula','ƒx'],
 ['Accounts','▣'],['Contacts','♧'],['Time tracking','◷']
];
function closeBoardQuickColumnPicker({restoreFocus=false}={}){
 const previous=boardQuickPickerTrigger;
 boardQuickPicker?.remove();
 boardQuickPicker=null;boardQuickPickerTrigger=null;
 previous?.classList.remove('board-add-column-anchor');
 if(restoreFocus&&previous?.isConnected)previous.focus();
}
function boardQuickTypeTile(entry,{disabled=false}={}){
 const type=entry.type||'',label=entry.label||'';
 return '<button class="board-quick-type-choice" type="button"'+
  (disabled?' disabled title="Requires a separately activated storage and UI contract"':' data-board-quick-type="'+e(type)+'"')+
  ' data-board-type-search="'+e((label+' '+(entry.keywords||'')+' '+(entry.description||'')).toLowerCase())+'"'+
  ' data-type="'+e(type||label.toLowerCase().replaceAll(' ','-'))+'">'+
  '<span class="board-quick-type-icon" aria-hidden="true">'+e(entry.icon||'▤')+'</span>'+
  '<span class="board-quick-type-info"><strong>'+e(label)+'</strong>'+
  (disabled?'<small>Not enabled</small>':'')+'</span></button>';
}
document.addEventListener('pointerdown',event=>{
 if(boardQuickPicker?.isConnected&&!boardQuickPicker.contains(event.target)&&
    !boardQuickPickerTrigger?.contains(event.target))closeBoardQuickColumnPicker();
},true);
function openBoardQuickColumnPicker(trigger){
 if(!trigger?.isConnected||!activeBoardLayout()||!state.boardManage||
    !BOARD_STRUCTURE_ADMIN_ENABLED||!canManuallyEditBoard(state.board?.board,true))return;
 if(boardQuickPicker?.isConnected&&boardQuickPickerTrigger===trigger){
  closeBoardQuickColumnPicker({restoreFocus:true});return;
 }
 closeBoardQuickColumnPicker();
 const catalog=BOARD_STANDARD_COLUMN_CATALOG;
 const recent=boardRecentColumnTypes.map(type=>catalog.find(entry=>entry.type===type)).filter(Boolean);
 const tileGroup=(title,entries,disabled=false)=>entries.length?
  '<section class="board-quick-type-section" data-board-quick-group><h4>'+e(title)+'</h4>'+
  '<div class="board-quick-type-grid">'+entries.map(entry=>boardQuickTypeTile(entry,{disabled})).join('')+'</div></section>':'';
 const picker=document.createElement('section');
 picker.className='board-quick-column-picker';picker.setAttribute('role','dialog');
 picker.setAttribute('aria-label','Add a board column');
 picker.innerHTML='<div class="board-quick-picker-heading"><div><strong>Add a column</strong>'+
  '<p>Choose a supported field type</p></div>'+
  '<button type="button" data-board-picker-close aria-label="Close column picker">×</button></div>'+
  '<input type="search" id="board-quick-column-search" data-board-picker-search aria-label="Search column types" placeholder="Search or describe your column" autocomplete="off">'+
  '<div class="board-quick-picker-list">'+
   tileGroup('Recently used',recent)+
   tileGroup('Essentials',catalog.filter(x=>x.group==='Essentials'))+
   tileGroup('Super useful',catalog.filter(x=>x.group==='Super useful'))+
   tileGroup('Additional types — planned',boardPlannedColumnTypes.map(([label,icon])=>({label,icon})),true)+
  '</div><button type="button" class="board-quick-picker-more" data-board-picker-more>More columns &amp; settings…</button>';
 (trigger.closest('.aps-board-shell')||root).append(picker);
 boardQuickPicker=picker;boardQuickPickerTrigger=trigger;
 trigger.classList.add('board-add-column-anchor');
 const search=picker.querySelector('[data-board-picker-search]');
 search.addEventListener('input',()=>{
  const terms=search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  for(const group of picker.querySelectorAll('[data-board-quick-group]')){
   let visible=0;
   for(const tile of group.querySelectorAll('.board-quick-type-choice')){
    tile.hidden=!terms.every(word=>(tile.dataset.boardTypeSearch||'').includes(word));
    if(!tile.hidden)visible++;
   }
   group.hidden=visible===0;
  }
 });
 picker.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeBoardQuickColumnPicker({restoreFocus:true});return;}
  if(!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(event.key)||
     !event.target.matches('.board-quick-type-choice'))return;
  const tiles=[...picker.querySelectorAll('.board-quick-type-choice:not([hidden]):not(:disabled)')]
   .filter(tile=>!tile.closest('[hidden]'));
  const current=tiles.indexOf(event.target);
  if(current<0||tiles.length<2)return;
  const step=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:
   event.key==='ArrowDown'?2:-2;
  event.preventDefault();tiles[(current+step+tiles.length)%tiles.length].focus();
 });
 picker.addEventListener('click',event=>{
  event.stopPropagation();
  if(event.target.closest('[data-board-picker-close]')){
   closeBoardQuickColumnPicker({restoreFocus:true});return;
  }
  if(event.target.closest('[data-board-picker-more]')){
   closeBoardQuickColumnPicker();void openBoardStructure();return;
  }
  const tile=event.target.closest('[data-board-quick-type]');
  if(!tile)return;
  const type=tile.dataset.boardQuickType;
  closeBoardQuickColumnPicker();
  void createBoardQuickColumn(type).catch(notice);
 });
 search.focus({preventScroll:true});
}
async function createBoardQuickColumn(type){
 if(!BOARD_STANDARD_COLUMN_CATALOG.some(x=>x.type===type))return;
 const snapshot=inlineColumnSnapshot();
 if(!snapshot||!state.boardManage||!BOARD_STRUCTURE_ADMIN_ENABLED||
    !canManuallyEditBoard(state.board?.board,true))return;
 const detail=await verifyInlineColumnBoard(snapshot);
 const label=BOARD_STANDARD_COLUMN_CATALOG.find(x=>x.type===type).label;
 const base=(type==='long_text'?'Long text':label).slice(0,70);
 const used=new Set((detail.columns||[]).map(x=>String(x.name||'').trim().toLowerCase()));
 let name=base,index=2;
 while(used.has(name.toLowerCase()))name=base+' '+index++;
 const defaults=type==='status'?'Not started\nWorking on it\nStuck\nDone':
  type==='dropdown'?'Option 1\nOption 2':'';
 const selection=resolveColumnTypeSelection(type,defaults);
 const receipt=await boardStructureClient.mutate(detail,{
  action:'create',name,type:selection.type,
  config:parseChoiceConfig(selection.type,selection.options)
 },{verifiedManagerPreflight:true});
 if(state.boardId!==snapshot.boardId||state.context?.user_id!==snapshot.userId||
    state.context?.workspace_id!==snapshot.workspaceId)return;
 boardRecentColumnTypes.unshift(type);
 boardRecentColumnTypes.splice(5);
 await loadBoard(snapshot.boardId,'items');
 if(state.boardId===snapshot.boardId&&state.context?.user_id===snapshot.userId){
  toast(name+' column added. Rename it in place.');
  beginBoardQuickColumnRename('col:'+receipt.column_id);
 }
}
function beginBoardQuickColumnRename(key){
 if(!state.boardManage||!key?.startsWith('col:')||state.tab!=='items')return;
 const header=[...root.querySelectorAll('th[data-column-key]')]
  .find(th=>th.dataset.columnKey===key);
 const label=header?.querySelector('.board-heading-label');
 if(!label||label.querySelector('input'))return;
 const column=resolveInlineColumn(state.board,key,{canManage:true});
 if(column.kind!=='custom')return;
 const oldName=column.name,field=document.createElement('input');
 field.type='text';field.className='board-quick-column-rename';
 field.maxLength=80;field.value=oldName;field.setAttribute('aria-label','Rename new column');
 label.textContent='';label.append(field);
 let cancelled=false,busy=false;
 const restore=()=>{if(label.isConnected)label.textContent=oldName;};
 const commit=async()=>{
  if(cancelled||busy||!field.isConnected)return;
  const name=field.value.trim();
  if(name===oldName){restore();return;}
  if(!name||name.length>80){field.setCustomValidity('Name must contain 1–80 characters');field.reportValidity();return;}
  busy=true;field.disabled=true;
  try{
   const snapshot=inlineColumnSnapshot();
   const fresh=await verifyInlineColumnBoard(snapshot);
   const target=resolveInlineColumn(fresh,key,{canManage:true});
   if(target.name!==oldName)throw new ApiError('Column name changed elsewhere. Refresh.',409);
   await boardStructureClient.mutate(fresh,{action:'update',columnId:target.id,
    name,type:target.type,config:target.config,visible:target.visible},
    {verifiedManagerPreflight:true});
   await loadBoard(snapshot.boardId,'items');
   toast('Column renamed.');
  }catch(error){
   if(field.isConnected){field.disabled=false;field.focus();field.select();}
   notice(error);
  }finally{busy=false;}
 };
 field.addEventListener('keydown',event=>{
  if(event.key==='Enter'){event.preventDefault();void commit();}
  else if(event.key==='Escape'){event.preventDefault();cancelled=true;restore();}
 });
 field.addEventListener('blur',()=>{if(!cancelled&&!busy)void commit();});
 field.focus({preventScroll:true});field.select();
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
 if(!activeBoardLayout()){
  toast('Board settings require a verified signed board. Refresh the board and retry.',true);
  return;
 }
 const snapshot={boardId:state.boardId,userId:auth.userId,
  workspaceId:state.context.workspace_id};
 const detail=state.board;
 const moduleKey=moduleByBoardName(detail.board.name)?.key;
 const availableTabs=[
  {key:'items',title:'Board items'},{key:'issues',title:'APSYNTRA Issues'},
  ...(moduleKey==='frt'?[{key:'finance',title:'FRT finance'}]:[]),
  ...(moduleKey==='timetracker'?[{key:'attendance',title:'TimeTracker attendance'}]:[])
 ];
 // Show a real dialog before awaiting any signed RPC. The previous code
 // waited for both reads while the action menu closed, leaving no UI.
 hideModal();modal=document.createElement('div');
 const pending=modal;
 pending.className='modal-backdrop board-history-backdrop';
 pending.innerHTML='<section class="modal board-history-modal board-structure-modal" role="dialog" '+
  'aria-modal="true" aria-labelledby="board-structure-title">'+
  '<div class="modal-head"><h2 id="board-structure-title">Board structure &amp; views</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close settings">×</button></div>'+
  '<div class="board-structure-scroll" role="region" aria-label="Board settings loading state" tabindex="0">'+
  '<p role="status" aria-live="polite" data-board-structure-loading>Checking signed board settings and permissions…</p>'+
  '</div></section>';
 document.body.append(pending);
 pending.querySelector('[data-dismiss]')?.focus();
 const current=()=>modal===pending&&boardHistoryAuthorized(snapshot);
 pending.addEventListener('click',event=>{
  if(event.target===pending||event.target.closest('[data-dismiss]')){
   if(modal===pending)hideModal();
  }else if(event.target.closest('[data-board-structure-retry]')&&current()){
   void openBoardStructure();
  }
 });
 pending.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&modal===pending){
   event.preventDefault();hideModal();
  }
 });
 let settings,canManage;
 try{
  [settings,canManage]=await Promise.all([
   state.boardUi?.status==='VERIFIED_READ'?
    Promise.resolve(state.boardUi):boardStructureClient.read(snapshot.boardId),
   BOARD_STRUCTURE_ADMIN_ENABLED?db.allowed(snapshot.boardId,'manage'):Promise.resolve(false)
  ]);
 }catch(err){
  if(!current())return;
  const content=pending.querySelector('[data-board-structure-loading]');
  if(content){
   content.setAttribute('role','alert');
   content.innerHTML='<strong>Board settings could not be loaded.</strong> '+
    '<span>'+e(errorMessage(err))+'</span> '+
    '<button type="button" class="secondary" data-board-structure-retry>Retry</button>';
  }
  return;
 }
 if(!current())return;
 const sourcingPlan=snapshot.boardId===MATERIAL_SOURCING_BOARD_ID?
  planMaterialSourcingSchema(detail):null;
 const offerPublicSourcing=canManage&&sourcingPlan?.status==='BLOCKED_FIELD_AUTHORIZATION'&&
  sourcingPlan.additions.length>0;
 hideModal();modal=document.createElement('div');
 const view=modal;
 view.className='modal-backdrop board-history-backdrop';
 view.innerHTML='<section class="modal board-history-modal board-structure-modal" role="dialog" '+
  'aria-modal="true" aria-labelledby="board-structure-title">'+
  '<div class="modal-head"><h2 id="board-structure-title">Board structure &amp; views</h2>'+
  '<button type="button" data-dismiss class="modal-close" aria-label="Close settings">×</button></div>'+
  '<div class="board-structure-scroll" role="region" aria-label="Board structure form" tabindex="0">'+
  renderBoardStructureAdmin(detail,settings,{canManage,availableTabs})+
  (offerPublicSourcing?'<section class="panel panel-body" aria-label="Material Sourcing public schema activation">'+
   '<h3>Material Sourcing — public columns</h3>'+
   '<p class="muted">Add only '+sourcingPlan.additions.length+
   ' non-sensitive sourcing columns using signed board management. The Main group, original columns, and restricted financial fields are preserved.</p>'+
   '<button type="button" class="secondary" data-mrh-activate-public>Activate public sourcing columns</button></section>':'')+
  '</div></section>';
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
  const sourcingButton=event.target.closest('[data-mrh-activate-public]');
  if(sourcingButton){
   if(sourcingButton.disabled||snapshot.boardId!==MATERIAL_SOURCING_BOARD_ID||
      !offerPublicSourcing)return;
   const phrase=window.prompt('This adds only non-sensitive Material Sourcing columns, preserving Main group and existing columns. Restricted prices, vendors and requester data are NOT activated. Type ACTIVATE SOURCING COLUMNS to continue:');
   if(phrase!=='ACTIVATE SOURCING COLUMNS')return;
   sourcingButton.disabled=true;
   try{
    const result=await activateApprovedPublicSourcingColumns({
     api:db,auth,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
    });
    if(!authorized())return;
    hideModal();
    await loadBoard(snapshot.boardId,state.tab);
    toast(result.created.length+' public Material Sourcing columns verified. Restricted fields remain protected.');
   }catch(err){if(authorized())notice(err);}
   finally{if(sourcingButton.isConnected)sourcingButton.disabled=false;}
   return;
  }
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
 if(name==='pdl-refresh'){await loadPaseoManagement();return;}
 if(name==='pdl-more'){if(state.paseoManagement?.nextCursor&&!state.paseoManagement?.loadingMore)await loadPaseoManagement(state.paseoManagement.nextCursor);return;}
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
 case 'profile-rendering':{
  // Bootstrap-only, including direct dispatch from a stale DOM control.
  if(state.roleVerified!==true||state.performanceBusy||!auth.isSignedIn||
     auth.userId!==state.context?.user_id||!state.context?.workspace_id)break;
  const actor=auth.userId,workspace=state.context.workspace_id;
  const bootstrap=await roleConfig.bootstrapVerified().catch(()=>false);
  if(!bootstrap){
   if(actor===auth.userId&&workspace===state.context?.workspace_id){
    state.roleVerified=false;state.performanceReport=null;
    if(state.view==='settings')render();
   }
   break;
  }
  if(state.roleVerified!==true||!auth.isSignedIn||
     actor!==auth.userId||workspace!==state.context?.workspace_id)break;
  const controller=new AbortController();
  performanceProfileAbort=controller;
  state.performanceBusy=true;state.performanceReport=null;
  if(state.view==='settings')render();
  try{
   const {sampleBrowserFrames}=await import('./performance-profile.js');
   const profile=await sampleBrowserFrames({signal:controller.signal});
   if(!auth.isSignedIn||state.roleVerified!==true||actor!==auth.userId||
      workspace!==state.context?.workspace_id||controller.signal.aborted)break;
   if(profile.status==='COMPLETE'){
    const startup=startupCriticalPath.snapshot();
    state.performanceReport={...profile,startup,
     entryWaterfall:startup?summarizeEntryWaterfall({entryMs:startup.entryFromNavigationMs}):null};
    toast('Local frame sample complete. Review results in Account settings.');
   }else toast('Performance sampling unavailable or interrupted.',true);
  }catch{toast('Browser performance sampling was unavailable.',true);}
  finally{
   if(performanceProfileAbort===controller)performanceProfileAbort=null;
   state.performanceBusy=false;
   if(state.view==='settings'&&auth.isSignedIn&&state.roleVerified===true&&actor===auth.userId&&
      workspace===state.context?.workspace_id)render();
  }
  break;
 }
 case 'tt-sidebar-disclosure':{
   if(!state.context||!auth.isSignedIn||state.ttStandalone!==true||state.ttAttendance?.status!=='VERIFIED_READ')return;
   timeTrackerSubmenuOpen=!timeTrackerSubmenuOpen;
   syncSidebarLayout();
   break;
 }
 case 'sidebar-toggle':{
   if(!state.context||!auth.isSignedIn)return;
   const mobile=window.matchMedia('(max-width:810px)').matches;
   if(mobile)sidebarMobileOpen=!sidebarMobileOpen;
   else sidebarManualCollapsed=!sidebarManualCollapsed;
   syncSidebarLayout();
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
 case 'mobile-account-security':{
  if(state.view!=='settings'||!auth.isSignedIn)break;
  const settings=root.querySelector('.aps-settings');
  const expanded=settings?.classList.toggle('apsm-security-expanded')||false;
  button.setAttribute('aria-expanded',String(expanded));
  if(expanded)root.querySelector('.settings-session-panel')?.scrollIntoView({block:'start'});
  break;
 }
 case 'mobile-account-profile':{
  if(state.view!=='settings'||!auth.isSignedIn)break;
  const settings=root.querySelector('.aps-settings');
  const expanded=settings?.classList.toggle('apsm-profile-expanded')||false;
  button.setAttribute('aria-expanded',String(expanded));
  if(expanded)root.querySelector('.settings-profile-panel')?.scrollIntoView({block:'start'});
  break;
 }
 case 'mobile-account-switch':
 case 'security-tl03-revoke-run':
 case 'security-ws02d-b3-revoke-run':
 case 'security-ws02d-b3-rls-handoff':
  case 'logout':{
  const isMobileSwitch=name==='mobile-account-switch';
  if(isMobileSwitch){
   if(state.view!=='settings'||!auth.isSignedIn||state.authBusy)break;
   const identity=mobileAccountIdentity(),target=String(button.dataset.email||'').toLowerCase();
   if(!identity?.email||(target&&!mobileAccountChoices.has(target)))break;
   if(!confirm('Switch accounts in this tab? You will need to sign in again.'))break;
   mobileAccountChoices.set(identity.email.toLowerCase(),identity);
   mobileAccountEmail=target?mobileAccountChoices.get(target).email:'';
  }else{mobileAccountChoices.clear();mobileAccountEmail='';}
  startupCriticalPath.clear();
  performanceProfileAbort?.abort();performanceProfileAbort=null;
  state.performanceBusy=false;state.performanceReport=null;
  boardPreferences.clearMemory();
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
    clearOrderIntake();paseoReadRunId++;state.paseoManagement=null;    state.row01Busy=false;state.row01Result=null;state.inlineCell=null;state.inlineAddBusy=false;state.inlineCellBusy=false;if(!isB3LocalRevoke&&!isTl03LocalRevoke&&!isB3RlsHandoff){if(isMobileSwitch)await auth.signOut({scope:'local'});else await auth.signOut();}ttWorkNoteDraft.clear();clearTimeTrackerGpsDiagnostics();timeTrackerPendingRecovery.clear(state.ttClockPending||timeTrackerClockScope());state.ttClockPending=null;stopTimeTrackerClock();state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtManualVisibleCount=50;state.ttOtExpandedRequestIds=[];state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};boardCacheChannel.stop();db.invalidateBoardCache();state.tradeLinkActivity=null;state.tradeLinkActivityError='';state.tradeLinkActivityBusy=false;state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError='';state.tradeLinkAnalyticsRunId++;state.tradeLinkAnalyticsBusy=false;state.tl03ReadRunId++;state.tl03ReadBusy=false;state.tl03ReadResult=null;state.context=null;state.ws01B2RunId++;state.ws01B2Busy=false;state.ws01B2Result=null;state.ws02dB3RunId++;state.ws02dB3Busy=false;state.ws02dB3Report=null;state.ws02dB3HttpsRunId++;state.ws02dB3HttpsBusy=false;state.ws02dB3HttpsReport=null;state.ws02dB3RlsRunId++;state.ws02dB3RlsBusy=false;state.ws02dB3RlsReport=null;state.ws02dB3RevokeArmed=false;state.ws02dB3RevokedReport=revoked;state.b2QaRunId++;state.b2QaBusy=false;state.b2QaReport=null;state.b4QaRunId++;state.b4QaBusy=false;state.b4QaReport=null;state.phaseBDenialRunId++;state.phaseBDenialBusy=false;state.phaseBDenialReport=null;state.roleVerified=false;state.adminVerified=false;state.roleData=null;state.userRoleData=null;state.systemAdminData=null;state.systemAdminError='';state.boards=[];state.board=null;state.securityResult=null;state.securityProgress=[];state.securityWriteResult=null;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.frtSecurityResult=null;state.sec07Result=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;location.hash='#/login';state.tl03RevokeArmed=false;state.tl03RevokedReport=isTl03LocalRevoke?state.tl03RevokedReport:null;renderLogin();toast(isB3RlsHandoff?'Local sign-out complete. Sign in as another existing user in another workspace; then click B3 Step 2 without refreshing.':
     isTl03LocalRevoke?'Signed out of this session only. TradeLink revocation: '+(state.tl03RevokedReport?.status||'BLOCKED')+'.':
     isB3LocalRevoke?'Signed out of this session only. B3 revocation: '+(revoked?.status||'BLOCKED')+'.':isMobileSwitch?'Sign in to the existing account to continue.':'Signed out successfully.');break;}
 case 'ws01-open':{
   if(!auth.isSignedIn||!state.context)break;
   const actor=auth.userId,workspaceId=state.context.workspace_id;
   let creatorReceipt=null;
   if(WS10_CREATOR_POLICY_ACTIVE){
    try{creatorReceipt=await new CreatorAccessClient({auth,api:db}).read();}
    catch{creatorReceipt=null;}
   }
   if(!auth.isSignedIn||auth.userId!==actor||
      state.context?.workspace_id!==workspaceId)break;
   openWorkspaceSelector({id:workspaceId,name:workspaceName()},
    {lifecycle:workspaceLifecycleClient,signedUserId:actor,creatorReceipt,
     activeCrmRole:currentSignedCrmRole(state.crmRoleSnapshot,state.context),
     onOpenCurrent:()=>{location.hash='#/overview';},
     configurationEnabled:WS01_CONFIGURATION_ENABLED,
     invitationEnabled:true,
     sendInvitation:sendWorkspaceInvitation,
     checkInvitationAvailability:checkWorkspaceInvitationAvailability,
     managementEnabled:true,
     listInvitations:workspaceId=>workspaceInvitationLiveManager.list(workspaceId),
     revokeInvitation:request=>workspaceInvitationLiveManager.revoke(request),
     switchingEnabled:WS01_SWITCHING_ENABLED,
     onWorkspaceSwitched:async(receipt,targetWorkspace)=>{
      // The lifecycle client has verified the selection receipt and re-read
      // the new signed context. Persist the account preference, then reconcile
      // the active shell in place without a page reload.
      const previousWorkspaceId=state.context?.workspace_id;
      if(receipt?.switched!==true||
         receipt.previousWorkspaceId!==previousWorkspaceId||
         !validUuid(receipt.workspaceId))
       throw new ApiError('The verified workspace selection receipt is invalid.',409);
      const saved=writeWorkspacePreference(actor,receipt.workspaceId);
      if(!saved)toast('Workspace changed, but this browser could not save the preference.',true);
      clearOrderIntake();
      syncDda();
      state.workspaceTransitionPending=true;
      state.workspaceTransitionTargetId=receipt.workspaceId;
      state.workspaceTransitionTargetName=typeof targetWorkspace?.name==='string'?
       targetWorkspace.name.trim().slice(0,120):'';
      routeSerial++;
      crmRoleReadGeneration++;crmRoleLastReadAt=0;
      workspaceRelationReadGeneration++;
      boardCacheChannel.stop();db.invalidateBoardCache();
      state.boards=[];state.archived=[];state.trashed=[];
      state.showArchived=false;state.showTrash=false;
      state.boardId=null;state.board=null;state.boardUi=null;
      state.loading=false;state.loadingIssues=false;state.boardPageBusy=false;
      state.boardPageError='';state.issues=[];state.edit=false;state.boardManage=false;
      state.view='overview';state.ttStandalone=false;state.frtStandalone=false;
      state.tlStandalone=false;state.fuelTrackStandalone=false;
      pendingGlobalSearchItem=null;pendingNativeSearchSelection=null;
      fm1Module?.unmountFm1Application();stopTimeTrackerClock();
      history.replaceState(null,'',location.pathname+location.search+routeHome);
      approvedRouteHash=routeHome;
      render();
      try{
       await refreshWorkspace();
       const activeWorkspaceId=state.context?.workspace_id;
       if(activeWorkspaceId===receipt.workspaceId&&state.boardCatalogError)
        throw new ApiError('The selected workspace board catalog is not available yet.',503);
       if(activeWorkspaceId!==receipt.workspaceId){
        if(validUuid(activeWorkspaceId)&&activeWorkspaceId!==previousWorkspaceId){
         // A newer signed selection won while this transition was refreshing.
         // Follow the latest server context rather than leaving the shell pending.
         state.workspaceTransitionPending=false;
         state.workspaceTransitionTargetId=null;
         state.workspaceTransitionTargetName='';
        }else{
         throw new ApiError('The selected workspace context has not been confirmed yet.',409);
        }
       }
      }catch(error){
       // The server selection is already committed. Keep the previous scope
       // hidden and let the existing Refresh action retry the signed context read.
       syncDda();
       state.workspaceTransitionPending=true;
       state.workspaceTransitionTargetId=receipt.workspaceId;
       state.workspaceTransitionTargetName=typeof targetWorkspace?.name==='string'?
        targetWorkspace.name.trim().slice(0,120):'';
       closeWorkspacePanels();
       render();
       toast('Workspace switch confirmed. The new workspace is still loading; use Refresh to retry.',true);
       return;
      }
      state.workspaceTransitionPending=false;
      state.workspaceTransitionTargetId=null;
      state.workspaceTransitionTargetName='';
      closeWorkspacePanels();
      try{
       await onRoute();
       toast('Switched to '+(targetWorkspace?.name||'the selected workspace')+'.');
      }catch(error){
       toast('Workspace switched. Overview is available; refresh the workspace if content is incomplete.',true);
      }
     }});
   break;
 }
 case 'ws02d-accept-invitation':{
  if(invitationAcceptanceBusy||
     pendingInvitation?.status!=='ready'||!auth.isSignedIn||!state.context)return;
  invitationAcceptanceBusy=true;render();
  try{
   await workspaceInvitationAcceptanceClient.accept(pendingInvitation.token);
   // The server already committed a single verified membership. Do not
   // downgrade an accepted receipt if a subsequent UI refresh fails.
   pendingInvitation=null;invitationAcceptanceStatus='accepted';
   try{await refreshWorkspace();}catch{
    // A reload/sign-in will re-read the committed membership from the server.
   }
  }catch{
   // No automatic replay: a timeout may have committed the membership.
   pendingInvitation=null;invitationAcceptanceStatus='unconfirmed';
  }finally{invitationAcceptanceBusy=false;render();}
  break;
 }
 case 'ws02-open-invites':{
   if(!auth.isSignedIn||!state.context?.workspace_id)break;
   openWorkspaceInvitationDialog({
    id:state.context.workspace_id,name:workspaceName()
   },{
     enabled:true,
     sendInvitation:sendWorkspaceInvitation,
     checkInvitationAvailability:checkWorkspaceInvitationAvailability,
     managementEnabled:true,
     listInvitations:workspaceId=>workspaceInvitationLiveManager.list(workspaceId),
     revokeInvitation:request=>workspaceInvitationLiveManager.revoke(request)
   });
   break;
 }
 case 'platform-sync-verify':{await platformSync.syncNow('manual',[]);break;}
 case 'refresh':{try{await refreshWorkspace();render();toast(state.boardCatalogError?
  'Native application access refreshed; board catalog remains unavailable.':'Workspace refreshed.');}catch(err){notice(err);}break;}
 case 'board-activity':{await openBoardActivity();break;}
 case 'board-import':{
  if(!activeBoardLayout()||!canManuallyEditBoard(state.board?.board,state.edit))
   throw new ApiError('Import is limited to signed ordinary-board editors.',403);
  const selected=state.boardId;
  // A route transition can update the browser hash before the previous
  // toolbar is replaced. Never open an old board's import wizard over the
  // next board; this is navigation synchronization, not a new access rule.
  const routeBoard=()=>location.hash.match(/^#\/boards\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  if(routeBoard()!==selected)
   throw new ApiError('Board navigation is still updating. Retry import after the destination loads.',409);
  const {openBoardImportWizard}=await import('./board/import/import-ui.js?v=cp-board-import-sync-01-20261115');
  if(state.boardId!==selected||routeBoard()!==selected||
     !auth.isSignedIn||!canManuallyEditBoard(state.board?.board,state.edit))
   throw new ApiError('Board access changed before import opened.',403);
  await openBoardImportWizard({api:db,auth,boardId:selected,onComplete:async receipt=>{
   if(state.boardId===selected){await loadBoard(selected,'items');
   toast(receipt.reconciled===false?
    'Import writes committed, but row totals need reconciliation. Do not repeat the import yet.':
    'Committed '+receipt.committedWrites+' database writes ('+receipt.created+' inserted, '+receipt.updated+' updated); '+receipt.skipped+' skipped.');}
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
 case 'tradelink-draft-section':{
  if(!tradeLinkDraftRoute())break;
  const sectionId=button?.dataset?.target||'';
  const allowedSections=['tl-section-document','tl-section-client',
   'tl-section-items','tl-section-totals','tl-section-notes',
   'tl-section-terms','tl-section-approval'];
  if(!allowedSections.includes(sectionId))break;
  const section=root.querySelector('[id="'+sectionId+'"]');
  if(!section||typeof section.scrollIntoView!=='function')break;
  const reduceMotion=typeof window.matchMedia==='function'&&
   window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  section.scrollIntoView({behavior:reduceMotion?'auto':'smooth',block:'start'});
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
   const gmPreview=state.context?.profile?.email?.trim().toLowerCase()==='asenagan@watchdogautomation.com.ph'&&state.tradeLinkModuleRole==='General Manager';
    const selectedRecord=state.tradeLinkDraft.mode==='edit'?state.tradeLinkDraft.selected?.record:null;
    const draft=parseTradeLinkDraftForm(new FormData(form),{executivePreview:gmPreview&&!selectedRecord||selectedRecord?.approval_policy==='gm-sales-supervisor-exempt-v1',approvalFreePreview:tradeLinkApprovalFreeDraftPreview({executivePreview:gmPreview,actorId:auth.userId,record:selectedRecord})});
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
  if(!container||!rows||rows.length>=250||
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
 case 'tradelink-recovery-resume':
 case 'tradelink-recovery-remove':{
  await selectTradeLinkRecovery(button.dataset.id,name==='tradelink-recovery-remove');break;
 }
 case 'tradelink-draft-clear':{
  if(!tradeLinkDraftRoute()||state.tradeLinkDraft.busy||state.tradeLinkDraft.pendingSave)break;
  if(tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft)&&
    !confirm(unsavedTradeLinkWarning))break;
  const clearRoute=routeSerial;
  if(!await discardTradeLinkRecovery()||clearRoute!==routeSerial||!tradeLinkDraftRoute())break;
  state.tradeLinkDraft.unsavedChanges=false;
  if(state.tradeLinkDraft.editRequestId){
   const type=state.tradeLinkDraft.selected?.record?.document_type||'quotation';
   location.hash=tradeLinkApplicationHref('drafts/'+type);
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
   checkpointTradeLinkRecovery();
   tradeLinkRecoveryEditor=null;
   state.tradeLinkDraft.unsavedChanges=false;
   if(state.tradeLinkDraft.editRequestId){
    location.hash=tradeLinkApplicationHref('drafts/'+
     (state.tradeLinkDraft.selected?.record?.document_type||'quotation'));
    break;
   }
   state.tradeLinkDraft={...state.tradeLinkDraft,mode:'create',selected:null,pendingCreateId:null,pendingCreateDraft:null,pendingSave:null,lineDrafts:null,formValues:null,error:'',message:''};
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
 case 'tradelink-document-revision-open':{
  await openTradeLinkDocumentRevision(button.dataset.id,Number(button.dataset.revision));break;
 }
 case 'tradelink-document-revision-print':{
  await printTradeLinkDocument(button.dataset.id,Number(button.dataset.revision));break;
 }
 case 'tradelink-review-document-open':{
  await openTradeLinkAssignedDocument(button.dataset.id);break;
 }
 case 'tradelink-document-preview-close':{
  if(tradeLinkAuthorizedListRoute()&&state.tradeLinkSection==='documents'&&
     state.tradeLinkDraft.status==='AUTHORIZED_READ'){
   state.tradeLinkDraft.documentPreview=null;render();
  }
  break;
 }
 case 'tradelink-cheque-clearance':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !state.boardManage||state.tradeLinkDraft.busy)break;
  const documentId=button.dataset.id,selection=state.tradeLinkDraft.documentPreview;
  const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
  if(!listed||selection?.documentId!==documentId||selection.record?.revision!==listed.revision||
     selection.record.document_type!=='payment'||!['closed','completed'].includes(listed.workflowState)||
     !selection.chequeClearance||selection.chequeClearance.clearedAt!==null)break;
  if(!window.confirm('Confirm that the bank has actually cleared this cheque?'))break;
  const seq=routeSerial,actor=auth.userId,workspace=state.context?.workspace_id;
  const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&state.tradeLinkSection==='documents'&&
   state.boardManage&&auth.isSignedIn&&auth.userId===actor&&state.context?.workspace_id===workspace;
  state.tradeLinkDraft.busy=true;state.tradeLinkDraft.error='';render();
  try{
   const input={documentId,expectedRevision:listed.revision};
   const receipt=await tradeLinkDraftWorkspace.chequeClearance({...input,record:true});
   if(!same())break;
   state.tradeLinkAnalytics=null;state.tradeLinkAnalyticsError='';
   state.tradeLinkAnalyticsRunId++;state.tradeLinkAnalyticsBusy=false;
   const persisted=await tradeLinkDraftWorkspace.chequeClearance(input);
   if(!same())break;
   if(!persisted.clearedAt||Date.parse(persisted.clearedAt)!==Date.parse(receipt.clearedAt))
    throw new ApiError('Clearance readback unavailable. Refresh before retrying.',409);
   state.tradeLinkDraft.documentPreview={...selection,chequeClearance:persisted};
   state.tradeLinkDraft.message='Bank clearance recorded and verified. Analytics will reload on opening.';
  }catch(error){
   if(same()){
    state.tradeLinkDraft.documentPreview={...selection,chequeClearance:null};
    state.tradeLinkDraft.error=errorMessage(error);
   }
  }finally{if(same()){state.tradeLinkDraft.busy=false;render();}}
  break;
 }
 case 'tradelink-document-status-update':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !state.boardManage||state.tradeLinkDraft.busy||
     state.tradeLinkDraft.status!=='AUTHORIZED_READ')break;
  const documentId=button.dataset.id;
  const listed=state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
  const select=button.closest('[data-tradelink-action-menu]')?.querySelector(
   '[data-tradelink-status-select][data-id="'+documentId+'"]');
  const targetState=String(select?.value||'');
  if(!listed||listed.archived||!targetState||targetState===listed.workflowState)break;
  const seq=routeSerial,actor=auth.userId,workspace=state.context?.workspace_id;
  const same=()=>seq===routeSerial&&tradeLinkAuthorizedListRoute()&&
   state.tradeLinkSection==='documents'&&state.boardManage&&auth.isSignedIn&&
   auth.userId===actor&&state.context?.workspace_id===workspace;
  state.tradeLinkDraft={...state.tradeLinkDraft,busy:true,error:'',
   message:'Saving document status…'};render();
  try{
   const receipt=await tradeLinkDraftWorkspace.updateStatus({
    documentId,expectedRevision:listed.revision,targetState});
   if(!same())break;
   const [record,board]=await Promise.all([
    tradeLinkDraftWorkspace.read(documentId),tradeLinkDraftWorkspace.boardProjection(documentId)
   ]);
   if(!same())break;
   const boardItem=board?.items?.find(item=>item.id===listed.boardItemId);
   if(!record||record.revision!==receipt.revision||
      record.workflow_state!==targetState||
      Date.parse(record.updated_at)!==Date.parse(receipt.updatedAt)||
      !tradeLinkBoardProjectionMatches(boardItem,{
      boardItemId:listed.boardItemId,documentNumber:listed.documentNumber,
      updatedAt:record.updated_at}))
    throw new ApiError('Status was changed, but the refreshed document/Board projection could not be verified.',409);
   state.tradeLinkDraft={...state.tradeLinkDraft,
    rows:state.tradeLinkDraft.rows.map(row=>row.documentId===documentId?{
     ...row,workflowState:targetState,updatedAt:record.updated_at
    }:row),
    message:'Status updated to '+targetState+'. Board synchronization verified.'};
   toast('Document status updated.');
  }catch(error){
   if(same())state.tradeLinkDraft.error=errorMessage(error);
  }finally{
   if(same()){state.tradeLinkDraft.busy=false;render();}
  }
  break;
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
 case 'tradelink-document-review-stage':{
  if(!TL03_DUAL_REVIEW_ENABLED||state.tradeLinkDraft.busy)break;
  const documentId=button.dataset.id,stage=button.dataset.stage;
  const inEditor=tradeLinkDraftRoute()&&
   state.tradeLinkDraft.selected?.documentId===documentId;
  const inAssignedList=tradeLinkAuthorizedListRoute()&&
   state.tradeLinkSection==='documents'&&state.tradeLinkDraft.status==='AUTHORIZED_READ';
  if((!inEditor&&!inAssignedList)||!['primary','secondary'].includes(stage))break;
  const listed=inEditor?{
   documentId,boardItemId:state.tradeLinkDraft.selected.record.board_item_id,
   revision:state.tradeLinkDraft.selected.record.revision,
   workflowState:state.tradeLinkDraft.selected.record.workflow_state,
   documentNumber:state.tradeLinkDraft.selected.record.document_number,
   archived:state.tradeLinkDraft.selected.record.archived_at!==null,
   assignedStage:stage
  }:state.tradeLinkDraft.rows.find(row=>row.documentId===documentId);
  if(!listed||listed.workflowState!=='for-approval'||listed.archived||
     listed.assignedStage!==stage)break;
  const seq=routeSerial,actor=auth.userId,workspace=state.context?.workspace_id;
  const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===actor&&
   state.context?.workspace_id===workspace&&
   (inEditor?tradeLinkDraftRoute():tradeLinkAuthorizedListRoute()&&
    state.tradeLinkSection==='documents');
  state.tradeLinkDraft={...state.tradeLinkDraft,busy:true,error:'',
   message:'Recording your assigned validation time…'};render();
  try{
   const receipt=await tradeLinkDraftWorkspace.recordReviewStage({
    documentId,expectedRevision:listed.revision,stage});
   if(!same())break;
   if(inEditor){
    const [record,reviewStages,board]=await Promise.all([
     tradeLinkDraftWorkspace.read(documentId),
     tradeLinkDraftWorkspace.reviewStages(documentId),
     tradeLinkDraftWorkspace.boardProjection(documentId)
    ]);
    if(!same())break;
    const boardItem=board?.items?.find(item=>item.id===listed.boardItemId);
    if(!record||record.revision!==receipt.revision||
       record.workflow_state!==receipt.state||
       !tradeLinkBoardProjectionMatches(boardItem,{
        boardItemId:listed.boardItemId,documentNumber:listed.documentNumber,
        updatedAt:record.updated_at}))
     throw new ApiError('Review was recorded, but the refreshed document/Board projection could not be verified.',409);
    state.tradeLinkDraft={...state.tradeLinkDraft,
     selected:{documentId,record},reviewStages,
     message:receipt.state==='approved'?
      (receipt.approvalPolicy==='gm-sales-supervisor-exempt-v1'?
       'Management validation complete. Sales Supervisor exempted. Status is now Approved.':
       'Both assigned reviewers have validated this document. Status is now Approved.'):
      'Your signed validation time was recorded. The document remains For Approval until the second reviewer validates.'};
    if(receipt.state==='approved'){
     toast(receipt.approvalPolicy==='gm-sales-supervisor-exempt-v1'?'Management validation complete. Document Approved.':'Both validations complete. Document Approved.');
     location.hash=tradeLinkApplicationHref('documents');
    }else toast('Validation recorded. Awaiting the second reviewer.');
   }else{
    const currentPage=state.tradeLinkDraft.listPage;
    const currentFilters=currentPage?.appliedFilters??state.tradeLinkDraft.listFilters;
    const [board,refreshed,page]=await Promise.all([
     tradeLinkDraftWorkspace.boardProjection(documentId),
     tradeLinkDraftWorkspace.readAssigned(documentId),
     tradeLinkDraftWorkspace.searchPage({
      filters:currentFilters,cursor:currentPage?.cursor??null
     })
    ]);
    if(!same())break;
    const boardItem=board?.items?.find(item=>item.id===listed.boardItemId);
    if(!refreshed||refreshed.revision!==receipt.revision||
       refreshed.workflow_state!==receipt.state||
       !tradeLinkBoardProjectionMatches(boardItem,{
        boardItemId:refreshed.board_item_id,documentNumber:refreshed.document_number,
        updatedAt:refreshed.updated_at}))
     throw new ApiError('Review was recorded, but the refreshed Board/list projection could not be verified. Refresh before retrying.',409);
    state.tradeLinkDraft={...initialTradeLinkDraftView(),status:'AUTHORIZED_READ',
     assignedOnly:false,sharedVisibility:true,rows:page.rows,
     listFilters:currentFilters,
     listPage:{...page.listPage,history:currentPage?.history??[],
      pageIndex:currentPage?.pageIndex??0},
     message:receipt.state==='approved'?
      (receipt.approvalPolicy==='gm-sales-supervisor-exempt-v1'?
       'Management validation complete. Sales Supervisor exempted. Status is now Approved.':
       'Both assigned reviewers have validated this document. Status is now Approved.'):
      'Your signed validation time was recorded. The document remains For Approval until the second reviewer validates.'};
    toast(receipt.state==='approved'?(receipt.approvalPolicy==='gm-sales-supervisor-exempt-v1'?'Management validation complete. Document Approved.':'Both validations complete. Document Approved.'):
     'Validation recorded. Awaiting the second reviewer.');
   }
  }catch(error){
   if(same())state.tradeLinkDraft.error=errorMessage(error);
  }finally{
   if(same()){state.tradeLinkDraft.busy=false;render();}
  }
  break;
 }
 case 'tradelink-document-check-readiness':{
  await checkTradeLinkDocumentReadiness(button.dataset.id);break;
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
   await loadTradeLinkDrafts(routeSerial,{
    ...(page?.server?{cursor:page.cursor,history:page.history,pageIndex:page.pageIndex,
     filters:page.appliedFilters}:{}),recheckManage:true});
  }
  break;
 }
 case 'tradelink-documents-export-selection':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !state.boardManage||state.tradeLinkDraft?.status!=='AUTHORIZED_READ')break;
  exportTradeLinkDocumentSelection(button.closest('[data-tradelink-domain-list]'));
  break;
 }
 case 'tradelink-documents-hide-selection':
 case 'tradelink-documents-unhide-selection':
 case 'tradelink-documents-delete-selection':{
  const operation=name==='tradelink-documents-hide-selection'?'hide':
   name==='tradelink-documents-unhide-selection'?'unhide':'delete';
  await applyTradeLinkDocumentBulkAction(operation);break;
 }
 case 'tradelink-documents-clear-selection':{
  if(!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
     !state.boardManage||state.tradeLinkDraft?.status!=='AUTHORIZED_READ')break;
  const panel=button.closest('[data-tradelink-domain-list]');
  for(const checkbox of panel?.querySelectorAll('[data-tl-select-document]')||[])
   checkbox.checked=false;
  state.tradeLinkDraft={...state.tradeLinkDraft,selectedDocumentIds:[]};
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
     !TL03_DOMAIN_READS_ENABLED||state.tradeLinkDraft?.sharedVisibility!==true||
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
     tradeLinkCanSave()&&!state.tradeLinkDraft.busy){
   const form=root.querySelector('[data-tradelink-draft-form]');
   if(form&&state.tradeLinkDraft.pendingSave)await commitTradeLinkDraft(form);
   else form?.requestSubmit();
  }
  break;
 }
 case 'tradelink-draft-archive':
 case 'tradelink-draft-restore':{
  await changeTradeLinkDraftState(button.dataset.id,
   name==='tradelink-draft-archive'?'archive':'restore');break;
 }
 case 'ft3-retry-backend':{
  if(state.view==='board'&&state.tab==='fueltrack'&&state.boardId===FUELTRACK_V3_ID&&
   state.fuelTrackSection==='new-request'&&!state.fuelTrackBackendBusy)
   await loadFuelTrackBackend(routeSerial);
  break;
 }
 case 'ft3-signed-preflight':{
  const userId=state.context?.user_id,workspaceId=state.context?.workspace_id,seq=routeSerial;
  const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===userId&&
   state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
   state.view==='board'&&state.tab==='fueltrack'&&state.boardId===FUELTRACK_V3_ID&&
   state.board?.board?.workspace_id===workspaceId;
  if(!same()||state.fuelTrackPreflightBusy||state.fuelTrackBackendBusy)break;
  state.fuelTrackPreflight=null;state.fuelTrackPreflightBusy=true;render();
  try{
   const native=await db.nativeApplicationBoardContext('fueltrack-plus');
   if(native?.board?.id!==FUELTRACK_V3_ID||native.workspaceId!==workspaceId)
    throw new ApiError('FuelTrack native application preflight scope is unavailable.',403);
   if(!same())break;
   const client=new FuelTrackV3DomainClient({api:db,auth,
    boardId:FUELTRACK_V3_ID,workspaceId});
   const report=await runFuelTrackSignedPreflight({client,api:db,boardId:FUELTRACK_V3_ID,isCurrent:same});
   if(same())state.fuelTrackPreflight=report;
  }catch(err){
   if(same())state.fuelTrackPreflight={status:'PREFLIGHT_BLOCKED',message:errorMessage(err)};
  }finally{if(same()){state.fuelTrackPreflightBusy=false;render();}}
  break;
 }
 case 'ft3-approve':
 case 'ft3-reject':{
  if(state.fuelTrackSection!=='approvals')break;
  const id=button.dataset.id;
  if(!validUuid(id))break;
  if(name==='ft3-reject'){
   const reason=root.querySelector('#ft3-reason-'+id)?.value?.trim()||'';
   if(!reason||reason.length>1000){toast('Enter a rejection reason.');break;}
   await mutateFuelTrackBackend('decide',id,{reason});
  }else await mutateFuelTrackBackend('decide',id);
  break;
 }
 case 'ft3-attach-receipt':{
  const requestId=button.dataset.id;
  const actor=state.context?.user_id,workspaceId=state.context?.workspace_id;
  const snapshot=state.fuelTrackBackend?.snapshot;
  if(!validUuid(requestId)||!auth.isSignedIn||auth.userId!==actor||
     state.context?.user_id!==actor||state.context?.workspace_id!==workspaceId||
     state.view!=='board'||state.tab!=='fueltrack'||state.fuelTrackSection!=='lightfuels'||
     state.boardId!==FUELTRACK_V3_ID||state.board?.board?.workspace_id!==workspaceId||
     state.fuelTrackBackendBusy||snapshot?.role!=='Admin'||
     !snapshot.rows?.some(row=>row.id===requestId&&row.state==='completed'))break;
  const input=document.createElement('input');
  input.type='file';
  input.accept='image/jpeg,image/png,image/webp';
  input.setAttribute('aria-label','Choose a private FuelTrack receipt image');
  input.hidden=true;
  input.addEventListener('change',()=>{
   const file=input.files?.[0]||null;
   input.remove();
   if(file)attachFuelTrackReceipt(requestId,file).catch(notice);
  },{once:true});
  input.addEventListener('cancel',()=>input.remove(),{once:true});
  document.body.append(input);
  input.click();
  break;
 }
 case 'ft3-view-receipt':{
  const requestId=button.dataset.id;
  const userId=state.context?.user_id,workspaceId=state.context?.workspace_id;
  const seq=routeSerial;
  const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===userId&&
   state.context?.user_id===userId&&state.context?.workspace_id===workspaceId&&
   state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection==='lightfuels'&&
   state.boardId===FUELTRACK_V3_ID&&state.board?.board?.workspace_id===workspaceId;
  if(!same()||!validUuid(requestId)||state.fuelTrackBackendBusy||
     state.fuelTrackBackend?.snapshot?.role!=='Admin')break;
  state.fuelTrackReceiptLink=null;
  try{
   const client=new FuelTrackV3ReceiptStorageClient({api:db,auth,
    boardId:FUELTRACK_V3_ID,workspaceId});
   const url=await client.signedUrl(requestId);
   if(!same())break;
   if(url)state.fuelTrackReceiptLink={requestId,href:url,expiresAt:Date.now()+240000};
   else toast('No receipt photo is registered for this request.');
   render();
  }catch(err){if(same())toast(errorMessage(err));}
  break;
 }
 case 'ft3-verify-receipt':{
  const requestId=button.dataset.id;
  const actor=state.context?.user_id,ws=state.context?.workspace_id,seq=routeSerial;
  const same=()=>seq===routeSerial&&auth.isSignedIn&&auth.userId===actor&&
   state.context?.user_id===actor&&state.context?.workspace_id===ws&&
   state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection==='lightfuels'&&
   state.boardId===FUELTRACK_V3_ID&&state.board?.board?.workspace_id===ws;
  const snapshot=state.fuelTrackBackend?.snapshot;
  if(!same()||!validUuid(requestId)||state.fuelTrackBackendBusy||
     snapshot?.role!=='Admin'||
     !snapshot.rows?.some(r=>r.id===requestId&&r.state==='completed'))break;
  state.fuelTrackBackendBusy=true;render();
  try{
   const client=new FuelTrackV3ReceiptStorageClient({api:db,auth,
    boardId:FUELTRACK_V3_ID,workspaceId:ws});
   const proof=await client.verifyPrivateReceiptBinary(requestId);
   if(same())toast('Private receipt verified: '+proof.mimeType+' · '+proof.bytes+' bytes.');
  }catch(err){
   if(same())toast('Private receipt could not be verified: '+errorMessage(err));
  }finally{
   if(same()){state.fuelTrackBackendBusy=false;render();}
  }
  break;
 }
 case 'ft3-mark-refueled':
 case 'ft3-open-receipt':{
  const id=button.dataset.id;
  const expected=name==='ft3-mark-refueled'?'approved':'refueling_done';
  const row=state.fuelTrackBackend?.snapshot?.rows?.find(r=>r.id===id);
  if(state.view!=='board'||state.tab!=='fueltrack'||state.fuelTrackSection!=='lightfuels'||
   state.fuelTrackBackend?.snapshot?.role!=='Admin'||state.fuelTrackBackendBusy||
   !validUuid(id)||row?.state!==expected||!Number.isSafeInteger(Number(row.revision))||
   Number(row.revision)<1)break;
  state.fuelTrackRefuelingDialog={id,stage:expected==='approved'?'confirm':'details'};
  render();
  root.querySelector('.ft3-refuel-dialog [data-action="ft3-refuel-cancel"]')?.focus();
  break;
 }
 case 'ft3-refuel-cancel':{
  if(!state.fuelTrackBackendBusy&&state.fuelTrackRefuelingDialog){
   state.fuelTrackRefuelingDialog=null;render();
   root.querySelector('[data-action="ft3-mark-refueled"],[data-action="ft3-open-receipt"]')?.focus();
  }
  break;
 }
 case 'ft3-refuel-confirm':{
  const dialog=state.fuelTrackRefuelingDialog;
  if(dialog?.stage==='confirm'&&!state.fuelTrackBackendBusy){
   button.disabled=true;button.textContent='Saving…';
   const completed=await mutateFuelTrackBackend('mark',dialog.id);
   if(completed)root.querySelector('#ft3-refuel-details-form input[name="amount"]')?.focus();
   else if(button.isConnected){button.disabled=false;button.textContent='✓ Mark as Refueling Done';}
  }
  break;
 }
 case 'ft3-refuel-amount':
 case 'ft3-refuel-liters':{
  const form=root.querySelector('#ft3-refuel-details-form');
  const field=form?.elements.namedItem(name==='ft3-refuel-amount'?'amount':'liters');
  if(field&&Number(button.dataset.value)>0&&!state.fuelTrackBackendBusy){
   field.value=button.dataset.value;field.focus();
  }
  break;
 }
 case 'ft3-activity-refresh':{
  if(state.view==='board'&&state.tab==='fueltrack'&&state.boardId===FUELTRACK_V3_ID&&
     state.fuelTrackSection==='activity')await loadFuelTrackActivity(routeSerial);
  break;
 }
 case 'ft3-activity-filter':
 case 'ft3-activity-expand':{
  if(state.view!=='board'||state.tab!=='fueltrack'||state.fuelTrackSection!=='activity'||
     state.boardId!==FUELTRACK_V3_ID||!state.fuelTrackActivity||!auth.isSignedIn)break;
  const model=fuelTrackActivityModel({snapshot:state.fuelTrackActivity,
   boardId:state.boardId,workspaceId:state.context?.workspace_id,filters:state.fuelTrackActivityFilters});
  if(!model)break;
  if(name==='ft3-activity-filter'){
   const type=button.dataset.type;
   if(!['all','submitted','approved','rejected','completed'].includes(type))break;
   state.fuelTrackActivityFilters={...state.fuelTrackActivityFilters,type,expandedId:null};
  }else{
   const id=button.dataset.id;
   if(!model.visible.some(e=>e.id===id))break;
   state.fuelTrackActivityFilters={...state.fuelTrackActivityFilters,
    expandedId:state.fuelTrackActivityFilters.expandedId===id?null:id};
  }
  render();break;
 }
 case 'ft3-activity-export':{
  if(state.view!=='board'||state.tab!=='fueltrack'||state.fuelTrackSection!=='activity'||
     state.boardId!==FUELTRACK_V3_ID||!auth.isSignedIn||state.fuelTrackActivityBusy||
     state.context?.user_id!==auth.userId)break;
  // Re-read permissions and the event page before exporting sensitive audit data.
  // A revoked role or changed workspace cannot export an older cached snapshot.
  const exportSeq=routeSerial,exportUser=auth.userId,exportWorkspace=state.context?.workspace_id;
  await loadFuelTrackActivity(exportSeq);
  if(exportSeq!==routeSerial||!auth.isSignedIn||auth.userId!==exportUser||
     state.context?.workspace_id!==exportWorkspace||state.context?.user_id!==exportUser||
     state.boardId!==FUELTRACK_V3_ID||state.fuelTrackSection!=='activity'||
     !state.fuelTrackActivity||state.fuelTrackActivityBusy||state.fuelTrackActivityError)break;
  const model=fuelTrackActivityModel({snapshot:state.fuelTrackActivity,boardId:state.boardId,
   workspaceId:state.context?.workspace_id,filters:state.fuelTrackActivityFilters});
  const csv=fuelTrackActivityCsv(model);if(!csv)break;
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  try{
   const a=document.createElement('a');a.href=url;a.download='fueltrack-activity-authorized-page.csv';
   document.body.append(a);a.click();a.remove();
  }finally{URL.revokeObjectURL(url);}
  break;
 }
 case 'tradelink-analytics-refresh':{
  if(state.boardId===TRADELINK_BOARD_ID&&state.view==='board'&&
     state.tab==='tradelink'&&state.tradeLinkSection==='analytics'&&
     !state.tradeLinkAnalyticsBusy)await loadTradeLinkAnalytics(routeSerial);
  break;
 }
 case 'tradelink-activity-refresh':{
  if(state.boardId===TRADELINK_BOARD_ID&&state.view==='board'&&
     state.tab==='tradelink'&&state.tradeLinkSection==='activity'&&
     !state.tradeLinkActivityBusy)await loadTradeLinkActivity(routeSerial);
  break;
 }
 case 'board-copy-link':{
  if(!auth.isSignedIn||state.view!=='board'||state.board?.board?.id!==state.boardId)break;
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard not available');
   const url=new URL(location.href);
   url.search='';
   if(!url.hash.includes(state.boardId))throw new Error('Board route not verified');
   await navigator.clipboard.writeText(url.href);
   toast('Board link copied. Existing permissions still apply.');
  }catch{toast('Board link could not be copied.',true);}
  break;
 }
 case 'board-share-preview':{
  if(!auth.isSignedIn||!state.context||!state.board?.board||!state.boardId)break;
  const board=state.board.board;
  const workspaceId=state.context.workspace_id,boardId=state.boardId,userId=auth.userId;
  if(board.id!==boardId||board.workspace_id!==workspaceId)break;
  const manage=state.boardManage===true;
  // The existing, deployed CRM User Role Management RPC provides a signed,
  // workspace-scoped roster to authorized administrators. Other board managers
  // use the separately authorized COL01 directory if that contract is installed.
  // There is no browser-side permission grant or fallback to arbitrary profiles.
  const currentBoard=()=>auth.isSignedIn&&auth.userId===userId&&
    state.view==='board'&&state.boardId===boardId&&
    state.context?.workspace_id===workspaceId&&
    state.board?.board?.id===boardId;
  const readAdminDirectory=async()=>{
    if(!currentBoard()||!manage||await db.allowed(boardId,'manage')!==true)
      throw new ApiError('Signed board management access is required.',403);
    const snapshot=await db.rpc('apsyntra_role_user_management_snapshot',{
      p_workspace_id:workspaceId
    });
    const directory=normalizeAdminBoardCandidates(snapshot,{workspaceId,boardId,actorId:userId});
    if(directory.status!=='VERIFIED_SIGNED_CANDIDATES')
      throw new ApiError('Administrator directory could not be verified.',403);
    return {directory,snapshot};
  };
  let adminSnapshot=null,peopleDirectory={status:'UNAVAILABLE',members:[]},directoryMode='unavailable';
  if(manage){
    try{
      const verified=await readAdminDirectory();
      adminSnapshot=verified.snapshot;peopleDirectory=verified.directory;
      directoryMode='admin';
    }catch{
      // Do not retry a denied administrator RPC or infer an admin role.
      // A board-manager-only directory can be used if its separate signed
      // COL01 endpoint has been deployed and independently authorized.
      try{
        const raw=await loadBoardInvitableDirectory(db,boardId,{enabled:true});
        const directory=normalizeSignedBoardCandidates({
          ...raw,boardId,workspaceId,manage
        },{boardId,workspaceId});
        if(directory.status==='VERIFIED_SIGNED_CANDIDATES'){
          peopleDirectory=directory;directoryMode='board';
        }
      }catch{/* The server did not authorize this directory; stay fail-closed. */}
    }
  }
  if(!currentBoard())break;
  const people=normalizeBoardPeople(state.board,{boardId,workspaceId});
  const {openBoardInviteDialog,closeBoardInviteDialog:closeInvite}=
    await import('./board/collaboration/invite.js');
  if(!currentBoard())break;
  closeBoardInviteDialog=closeInvite;
  const assertManager=async()=>{
    if(!currentBoard()||!manage||await db.allowed(boardId,'manage')!==true)
      throw new ApiError('Signed board management permission changed.',403);
    const verified=await auth.getVerifiedUser();
    if(verified?.id!==userId)throw new ApiError('Signed identity changed.',403);
  };
  const refreshDirectory=async(query='')=>{
    await assertManager();
    if(directoryMode==='admin'){
      const verified=await readAdminDirectory();
      adminSnapshot=verified.snapshot;
      peopleDirectory=verified.directory;
    }else if(directoryMode==='board'){
      const raw=await loadBoardInvitableDirectory(db,boardId,{enabled:true,query});
      peopleDirectory=normalizeSignedBoardCandidates({
        ...raw,boardId,workspaceId,manage
      },{boardId,workspaceId});
    }
    return peopleDirectory;
  };
  const changeAccess=async(memberId,action)=>{
    await assertManager();
    if(directoryMode==='admin'){
      // Refresh the privileged source immediately before each write to stop
      // stale, self, protected, foreign-board, or escalated-role assignments.
      const {directory,snapshot}=await readAdminDirectory();
      adminSnapshot=snapshot;peopleDirectory=directory;
      const approved=adminBoardChangeTarget(directory,{memberId,action,actorId:userId});
      if(!approved)throw new ApiError('Board access target is protected or stale.',403);
      const result=await userRoleManager.mutate({
        workspaceId,userId:memberId,scope:'board',resourceId:boardId,
        role:approved.role,enabled:action==='grant',
        expectedUpdatedAt:approved.expectedUpdatedAt
      });
      // The backend enforces administrator scope, active workspace membership,
      // board ownership protection and audit. Read back the signed board shell.
      db.invalidateBoardCache(boardId,{invalidateContext:false});
      return result;
    }
    if(directoryMode!=='board'||!BOARD_GROUP_ACCESS_ENABLED)
      throw new ApiError('Board access changes are not activated for this manager.',403);
    const raw=await loadBoardInvitableDirectory(db,boardId,{enabled:true});
    const directory=normalizeSignedBoardCandidates({...raw,boardId,workspaceId,manage},
      {boardId,workspaceId});
    const target=directory.members.find(p=>p.id===memberId);
    if(!target||(action==='grant'?!!target.boardRole:target.boardRole!=='viewer'))
      throw new ApiError('Board membership changed; refresh the list.',409);
    const result=await boardGroupAccessClient.changeBoardAccess({
      workspaceId,boardId,subjectType:'member',subjectId:memberId,
      requestId:globalThis.crypto.randomUUID(),action,role:'viewer'
    });
    db.invalidateBoardCache(boardId,{invalidateContext:false});
    return result;
  };
  let boardTeamClient=null,verifiedTeamDirectory=null;
  if(manage){
   try{
    const {BoardTeamInviteClient}=await import('./teams/team-board-invite.js');
    const client=new BoardTeamInviteClient(db);
    const candidate=await client.search({workspaceId,boardId,actorId:userId});
    if(candidate.status==='VERIFIED_BOARD_TEAM_CANDIDATES'){
     boardTeamClient=client;verifiedTeamDirectory=candidate;
    }
   }catch{/* Missing or denied optional Teams RPC never enables writes. */}
  }
  if(!currentBoard())break;
  const searchBoardTeams=async(query='')=>{
   if(!boardTeamClient)throw new ApiError('Team invitations are not activated.',403);
   await assertManager();
   const candidate=await boardTeamClient.search({workspaceId,boardId,actorId:userId,query});
   if(candidate.status!=='VERIFIED_BOARD_TEAM_CANDIDATES')
    throw new ApiError('Signed workspace team search unavailable.',403);
   verifiedTeamDirectory=candidate;return candidate;
  };
  const inviteBoardTeam=async(teamId)=>{
   if(!boardTeamClient)throw new ApiError('Team invitations are not activated.',403);
   await assertManager();
   const candidate=await searchBoardTeams('');
   const team=candidate.teams.find(t=>t.teamId===teamId&&!t.hasAccess);
   if(!team)throw new ApiError('Team or permission changed before the invite.',409);
   const receipt=await boardTeamClient.invite({
    workspaceId,boardId,teamId,actorId:userId,expectedRevision:candidate.revision
   });
   const after=await searchBoardTeams('');
   if(after.revision!==receipt.revision||
      !after.teams.some(t=>t.teamId===teamId&&t.hasAccess))
    throw new ApiError('Team invitation did not reconcile after server commit.',409);
   db.invalidateBoardCache(boardId,{invalidateContext:false});
   return receipt;
  };
  openBoardInviteDialog({
    board,workspaceId,manage,
    people,peopleDirectory,workspaceName:workspaceName(),currentUserId:userId,
    teamDirectory:verifiedTeamDirectory,teamInviteEnabled:!!boardTeamClient,
    onSearchTeams:boardTeamClient?searchBoardTeams:null,
    onInviteTeam:boardTeamClient?inviteBoardTeam:null,
    accessEnabled:directoryMode==='admin'||
      directoryMode==='board'&&BOARD_GROUP_ACCESS_ENABLED,
    onToast:message=>toast(message),
    onMountAvatars:node=>{void mountAvatarImages(node,profileAvatarClient,null,null);},
    onCountChange:count=>{
      if(currentBoard()){
        const target=root.querySelector('[data-board-invite-count]');
        if(target)target.textContent=count===null?'—':String(count);
      }
    },
    onRefreshMembers:async()=>{
      if(!currentBoard())throw new ApiError('Board scope changed.',403);
      const fresh=await db.board(boardId,{complete:false,includeItems:false});
      const verified=normalizeBoardPeople(fresh,{boardId,workspaceId});
      if(verified.status!=='SIGNED_MEMBERSHIP')
        throw new ApiError('Signed board membership unavailable.',409);
      if(currentBoard())state.board.members=fresh.members;
      return verified;
    },
    onSearchDirectory:directoryMode==='board'?query=>refreshDirectory(query):null,
    onRefreshDirectory:()=>refreshDirectory(),
    onAssignBoard:memberId=>changeAccess(memberId,'grant'),
    onRemoveBoard:memberId=>changeAccess(memberId,'revoke'),
    onInviteWorkspace:()=>{
      if(!currentBoard())return;
      openWorkspaceInvitationDialog({id:workspaceId,name:workspaceName()},{
        enabled:true,sendInvitation:sendWorkspaceInvitation,
        checkInvitationAvailability:checkWorkspaceInvitationAvailability,
        managementEnabled:true,
        listInvitations:workspaceId=>workspaceInvitationLiveManager.list(workspaceId),
        revokeInvitation:request=>workspaceInvitationLiveManager.revoke(request)
      });
    }
  });
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
 case 'board-group-toggle':{
  if(state.view!=='board'||state.tab!=='items'||state.board?.board?.id!==state.boardId)return;
  const id=button.dataset.id;
  if(!(state.board.groups||[]).some(g=>g.id===id))return;
  const count=(state.board.items||[]).filter(row=>row.group_id===id).length;
  const newState=!boardGroupCollapsed(id,count);
  await persistBoardGroupCollapsed(id,newState);
  [...root.querySelectorAll('[data-action="board-group-toggle"]')]
   .find(el=>el.dataset.id===id)?.focus({preventScroll:true});
  break;
 }
 case 'board-groups-collapse-all':{
  if(state.tab!=='items'||!activeBoardLayout())return;
  await persistAllBoardGroupsCollapsed(true);break;
 }
 case 'board-groups-expand-all':{
  if(state.tab!=='items'||!activeBoardLayout())return;
  await persistAllBoardGroupsCollapsed(false);break;
 }
 case 'board-add-column':{
  if(!activeBoardLayout()||!state.boardManage)return;
  openBoardQuickColumnPicker(button);break;
 }
 case 'tt-board-gps':{try{await openTimeTrackerBoardProjectedGps();}catch(err){notice(err);}break;}
 case 'mrh-export-csv':{
  if(state.view!=='board'||state.tab!=='sourcing'||
     !isMaterialTrackerBoard(state.board)||!auth.isSignedIn||
     state.board?.board?.workspace_id!==state.context?.workspace_id||
     state.context?.user_id!==auth.userId)return;
  const rows=filterMaterialTrackerRows(materialTrackerRows(state.board),state.mrhTrackerFilters);
  const csv=materialTrackerPublicCsv(rows);
  const url=URL.createObjectURL(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}));
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download='material-sourcing-public-'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast('Exported '+rows.length+' visible material records (public fields only).');
  break;
 }
 case 'mrh-activate-public':{
  if(state.view!=='board'||state.tab!=='sourcing'||!state.mrhAddView||
     !isMaterialTrackerBoard(state.board)||state.mrhAddBusy)break;
  const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context?.workspace_id};
  state.mrhAddBusy=true;
  const trigger=button;trigger.disabled=true;
  try{
   const result=await activateApprovedPublicSourcingColumns({
    api:db,auth,acknowledgement:MATERIAL_SOURCING_ACTIVATION_ACK
   });
   if(!boardHistoryAuthorized(snapshot))break;
   db.invalidateBoardCache();
   await loadBoard(snapshot.boardId,'sourcing');
   state.mrhAddView=true;
   render();
   toast(result.created.length+' sourcing columns activated; original Main group preserved.');
  }catch(error){
   if(boardHistoryAuthorized(snapshot))notice(error);
  }finally{
   state.mrhAddBusy=false;
   if(trigger.isConnected)trigger.disabled=false;
  }
  break;
 }
 case 'mrh-add-view':
 case 'mrh-show-items':{
  if(state.view!=='board'||state.tab!=='sourcing'||!isMaterialTrackerBoard(state.board))break;
  // All signed board viewers can navigate to Add Material; only authorized
  // editors receive the active create form and server mutation contract.
  if(state.mrhAddBusy)break;
  state.mrhAddView=name==='mrh-add-view';
  render();
  if(state.mrhAddView)root.querySelector('#mrh-add-partNumber')?.focus({preventScroll:true});
  break;
 }
 case 'mrh-new-part':{
  if(!isMaterialSourcingBoard(state.board?.board)||!state.edit||
     !['items','sourcing'].includes(state.tab)||!activeBoardLayout())break;
  if(state.tab==='sourcing'){
   state.mrhAddView=true;render();
   root.querySelector('#mrh-add-partNumber')?.focus({preventScroll:true});
   break;
  }
  const snapshot={boardId:state.boardId,userId:auth.userId,
   workspaceId:state.context?.workspace_id,tab:state.tab};
  openModal('New Material Sourcing part',
   input('Part number','partNumber'),
   async fd=>{
    if(!boardHistoryAuthorized(snapshot))throw new ApiError('Board context changed.',403);
    const created=await createMaterialSourcingPart({
     api:db,auth,workspaceId:snapshot.workspaceId,
     partNumber:fd.get('partNumber')
    });
    if(!boardHistoryAuthorized(snapshot))return;
    db.invalidateBoardCache();
    await loadBoard(snapshot.boardId,snapshot.tab);
    if(!boardHistoryAuthorized(snapshot)||state.tab!==snapshot.tab)return;
    toast('Part number '+created.partNumber+' created and reloaded in Main group. Select the part number for protected details.');
   },{submitLabel:'Create part'});
  break;
 }
 case 'board-item-detail':{await openBoardItemDetails(button.dataset.id);break;}
 case 'board-columns-hide-all':
 case 'board-columns-show-all':{
  const current=activeBoardLayout();
  if(!current||state.tab!=='items')return;
  const all=name==='board-columns-show-all';
  persistBoardLayout(pref=>({...pref,hidden:all?[]:
   [...new Set([...pref.hidden,...current.columns.filter(key=>
    !BOARD_REQUIRED_COLUMNS.includes(key)&&key!=='actions')])]}));
  render();
  root.querySelector('.board-hide-columns')?.setAttribute('open','');
  root.querySelector('#board-hide-search')?.focus({preventScroll:true});
  break;
 }
 case 'board-layout-reset':{
  const current=activeBoardLayout();if(!current)return;
  resetBoardLayout(state.context,state.boardId,boardPreferences);render();break;
 }
 case 'board-primary-label-edit':{beginPrimaryHeaderEdit(button);break;}
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
  if(key==='record'){
   beginPrimaryHeaderEdit(root.querySelector('th[data-column-key="record"] .board-primary-label-button'));
  }else contextualColumnEditor(key);
  break;
 }
 case 'board-column-delete-custom':{
  const key=button.dataset.key,layout=activeBoardLayout();
  closeBoardColumnContext();
  if(!layout?.columns.includes(key)||!state.boardManage||!key.startsWith('col:'))return;
  await contextualColumnDelete(key);break;
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
 case 'ft3-analytics-export':{
  if(state.view!=='board'||state.tab!=='fueltrack'||state.fuelTrackSection!=='analytics')break;
  const snapshot=verifyFuelTrackBackendSnapshot(
   state.fuelTrackBackend?.snapshot,state.boardId,state.context?.workspace_id
  );
  const analytics=state.fuelTrackBackend?.analytics;
  if(!snapshot||!analytics||analytics.status!=='VERIFIED_READ'||
    analytics.boardId!==state.boardId||analytics.workspaceId!==state.context?.workspace_id)break;
  const csv=fuelTrackAnalyticsCsv(analytics);
  if(!csv){toast('Verified analytics are unavailable for CSV export.');break;}
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  try{
   const link=document.createElement('a');
   link.href=url;link.download='fueltrack-v3-analytics-'+
    (state.fuelTrackAnalyticsRange||'all')+'.csv';
   link.hidden=true;document.body.append(link);link.click();link.remove();
   toast('Verified FuelTrack analytics exported to CSV.');
  }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  break;
 }
  case 'ft3-signed-request-status':
 case 'ft3-signed-request-sort':
 case 'ft3-signed-request-more':
 case 'ft3-signed-request-clear':
 case 'ft3-signed-request-expand':{
  if(state.view!=='board'||state.tab!=='fueltrack'||state.fuelTrackSection!=='requests'||
   !verifyFuelTrackBackendSnapshot(state.fuelTrackBackend?.snapshot,state.boardId,state.context?.workspace_id))break;
  const f=state.fuelTrackRequestFilters;
  if(name==='ft3-signed-request-status'){
   const selected=button.dataset.status;
   if(!['all','submitted','approved','refueling_done','completed','rejected'].includes(selected))break;
   updateFuelTrackRequestFilters({status:selected,expandedId:null,limit:25});
  }else if(name==='ft3-signed-request-sort'){
   updateFuelTrackRequestFilters({sort:f.sort==='newest'?'oldest':'newest',expandedId:null});
  }else if(name==='ft3-signed-request-more'){
   updateFuelTrackRequestFilters({limit:Math.min(200,Number(f.limit||25)+25)});
  }else if(name==='ft3-signed-request-clear'){
   updateFuelTrackRequestFilters({...FUELTRACK_REQUEST_FILTER_DEFAULTS});
  }else{
   const id=button.dataset.id;
   if(!state.fuelTrackBackend.snapshot.rows.some(r=>r.id===id))break;
   updateFuelTrackRequestFilters({expandedId:f.expandedId===id?null:id});
   root.querySelector('[data-action="ft3-signed-request-expand"][data-id="'+id+'"]')?.focus();
  }
  break;
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
  case 'board-load-more':{await loadMoreBoardItems();break;}
 case 'tb-meeting-enter':{
  const scope=talkBoxState.scope;
  if(!talkBoxCurrent(scope)||talkBoxState.busy)break;
  const {meetingDay}=await import('./talkbox-meetings.js');
  const chosen=meetingDay(root.querySelector('#tb-meeting-date')?.value||new Date().toLocaleDateString('sv-SE'));
  // A meeting must never capture only the first page of active issues.
  const client=talkBoxClient(),issues=[],seen=new Set(),cursors=new Set();
  let cursor=null;
  do{
   const page=await client.list(cursor);
   for(const issue of page.items)if(!seen.has(issue.id)){
    issues.push(issue);seen.add(issue.id);
   }
   if(issues.length>500)throw Error('Meeting supports at most 500 active issues');
   cursor=page.cursor;
   if(cursor){if(cursors.has(cursor))throw Error('Issue pagination repeated');cursors.add(cursor);}
  }while(cursor);
  if(!talkBoxCurrent(scope))break;
  if(!state.edit&&!talkBoxState.meetingHistory?.some(item=>item.date===chosen))
   throw Error('Editing access is required to create a new meeting sheet');
  await (await talkBoxMeetings()).openOrCreate(chosen,issues);
  if(!talkBoxCurrent(scope))break;
  talkBoxState.meetingDate=chosen;talkBoxState.meetingOpen=true;
  talkBoxState.filter={name:'',status:'All'};
  await loadTalkBox();toast('Meeting sheet saved in this workspace.');break;
 }
 case 'tb-meeting-history':{
  if(!talkBoxCurrent(talkBoxState.scope)||talkBoxState.busy)break;
  const {meetingDay}=await import('./talkbox-meetings.js');
  const day=meetingDay(button.dataset.date);
  if(!talkBoxState.meetingHistory?.some(item=>item.date===day))break;
  talkBoxState.meetingDate=day;talkBoxState.meetingOpen=true;
  talkBoxState.filter={name:'',status:'All'};
  await loadTalkBox();break;
 }
 case 'tb-meeting-notes':{
  if(!state.edit||!talkBoxCurrent(talkBoxState.scope)||!talkBoxState.meetingRecord)break;
  const scope=talkBoxState.scope,day=talkBoxState.meetingRecord.date;
  await (await talkBoxMeetings()).saveNotes(day,root.querySelector('#tb-meeting-notes')?.value||'');
  if(talkBoxCurrent(scope)){await loadTalkBox();toast('Meeting notes saved.');}
  break;
 }
 case 'tb-meeting-back':{
  if(!talkBoxCurrent(talkBoxState.scope))break;
  clearTalkBoxReportUrl();
  talkBoxState.meetingOpen=false;talkBoxState.reportUrl='';render();break;
 }
 case 'tb-filter':{
  if(!talkBoxCurrent(talkBoxState.scope))break;
  const name=String(root.querySelector('#tb-search-text')?.value||'').trim();
  const status=String(root.querySelector('#tb-search-status')?.value||'All');
  talkBoxState.filter={name,status};talkBoxState.page=null;
  await loadTalkBox();break;
 }
 case 'tb-clear-filter':{
  if(!talkBoxCurrent(talkBoxState.scope))break;
  talkBoxState.filter={name:'',status:'All'};talkBoxState.page=null;
  await loadTalkBox();break;
 }
 case 'tb-refresh':{await loadTalkBox();break;}
 case 'tb-more':{if(talkBoxState.page?.cursor)await loadTalkBox({more:true});break;}
 case 'tb-open':{location.hash=talkBoxIssueHref(button.dataset.id);break;}
 case 'tb-close':{talkBoxState.selected=null;location.hash=TALKBOX_APPLICATION_ROUTE;render();break;}
 case 'tb-new':{
  if(!state.edit||!talkBoxCurrent(talkBoxState.scope))break;
  openModal('Create TalkBox issue',input('Issue name','name'),async fd=>{
   const saved=await talkBoxClient().createVerified(fd.get('name'));
   if(talkBoxState.meetingOpen&&talkBoxState.meetingRecord)
    await (await talkBoxMeetings()).includeIssue(talkBoxState.meetingRecord.date,saved.id);
   talkBoxState.selected=saved;await loadTalkBox({selectedId:saved.id});
  });break;
 }
 case 'tb-edit':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const current=talkBoxState.selected;
  openModal('Edit TalkBox issue',input('Issue name','name',current.name)+
   select('Status','status',[['Working on it','Working on it'],['Stuck','Stuck'],['Done','Done']],current.status)+
   input('Target date (optional)','date',current.date||'','date',false),async fd=>{
    const updated=await talkBoxClient().updateVerified(current.id,{
     name:fd.get('name'),status:fd.get('status'),date:fd.get('date')||null
    },current.version);
    talkBoxState.selected=updated;await loadTalkBox({selectedId:current.id});
  });break;
 }
 case 'tb-assignees':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const scope=talkBoxState.scope,current=talkBoxState.selected,users=await talkBoxClient().users();
  if(!talkBoxCurrent(scope)||talkBoxState.selected?.id!==current.id)break;
  const assigned=new Set(current.person.map(p=>String(p.id).toLowerCase()));
  const checkboxes=users.map(u=>
   '<label class="tb-member-choice"><input type="checkbox" name="person" value="'+e(u.id)+'"'+
   (assigned.has(u.id)?' checked':'')+'> '+e(u.name)+'</label>').join('');
  openModal('Assign TalkBox workspace members',
   '<p class="note">Select existing members of this APSYNTRA CRM workspace.</p>'+
   '<div class="tb-member-directory">'+(checkboxes||'<p>No workspace members available.</p>')+'</div>',
   async fd=>{
    if(!talkBoxCurrent(scope))throw Error('TalkBox workspace changed');
    const ids=fd.getAll('person');
    const members=users.filter(u=>ids.includes(u.id));
    const record=await talkBoxClient().saveAssignees(current.id,members,current.version);
    if(talkBoxCurrent(scope)){talkBoxState.selected=record;await loadTalkBox({selectedId:current.id});}
   },{submitLabel:'Save assignees'});
  break;
 }
 case 'tb-timer-start':
 case 'tb-timer-stop':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const scope=talkBoxState.scope,issueId=talkBoxState.selected.id;
  const record=name==='tb-timer-start'?
   await talkBoxClient().startTimerVerified(issueId,new Date(),{
    serverTimer:talkBoxState.features?.serverTimer===true}):
   await talkBoxClient().stopTimerVerified(issueId,new Date(),{
    serverTimer:talkBoxState.features?.serverTimer===true});
  if(talkBoxCurrent(scope)&&talkBoxState.selected?.id===issueId){
   talkBoxState.selected=record;render();
   toast(name==='tb-timer-start'?'Timer started.':'Tracked time saved.');
  }
  break;
 }
 case 'tb-subtask-delete':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const scope=talkBoxState.scope,issueId=talkBoxState.selected.id,subId=button.dataset.id;
  if(!talkBoxState.selected.subitems.some(row=>String(row.id)===subId))break;
  if(!confirm('Delete this subtask? This action cannot be undone.'))break;
  const record=await talkBoxClient().deleteSubitemVerified(issueId,subId);
  if(talkBoxCurrent(scope)&&talkBoxState.selected?.id===issueId){
   talkBoxState.selected=record;render();toast('Subtask deleted.');
  }
  break;
 }
 case 'tb-time-edit':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const current=talkBoxState.selected;
  if(current.timeTracking?.running)throw new Error('Stop the running TalkBox timer before correcting tracked time.');
  openModal('Correct TalkBox tracked time',
   input('Tracked hours','hours',current.timeTracking?.hours??0,'number')+
   input('Tracked minutes (0–59)','minutes',current.timeTracking?.minutes??0,'number'),async fd=>{
    const hours=Number(fd.get('hours')),minutes=Number(fd.get('minutes'));
    const timeTracking={...current.timeTracking,
     hours,minutes,totalSeconds:hours*3600+minutes*60};
    const updated=await talkBoxClient().updateVerified(current.id,{timeTracking},current.version);
    talkBoxState.selected=updated;await loadTalkBox({selectedId:current.id});
   });break;
 }
 case 'tb-post':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const message=root.querySelector('#tb-message')?.value||'';
  const issueId=talkBoxState.selected.id;
  const result=await talkBoxClient().postVerified(issueId,message);
  if(talkBoxCurrent(talkBoxState.scope)){talkBoxState.selected=result.record;render();}
  break;
 }
 case 'tb-archive':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const issueId=talkBoxState.selected.id;
  if(!confirm('Archive this TalkBox issue? It will disappear from the active list.'))break;
  await talkBoxClient().archiveVerified(issueId);
  if(talkBoxCurrent(talkBoxState.scope)){
   talkBoxState.selected=null;
   location.hash=TALKBOX_APPLICATION_ROUTE;
   await loadTalkBox();
  }
  break;
 }
 case 'tb-file-upload':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const file=root.querySelector('#tb-upload-file')?.files?.[0];
  if(!file)throw new Error('Choose a TalkBox file before uploading.');
  const scope=talkBoxState.scope,issueId=talkBoxState.selected.id;
  const saved=await (await talkBoxAttachments()).uploadVerified(issueId,file);
  if(talkBoxCurrent(scope)&&talkBoxState.selected?.id===issueId){
   talkBoxState.selected=(await talkBoxClient().get(issueId));
   render();toast('Native attachment uploaded and verified.');
  }
  break;
 }
 case 'tb-file-download':{
  if(!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const asset=talkBoxState.selected.assets?.find(x=>String(x.id)===button.dataset.id);
  if(!asset)break;
  const {blob,fileName}=await (await talkBoxAttachments()).download(talkBoxState.selected.id,asset);
  const url=URL.createObjectURL(blob);
  try{
   const link=document.createElement('a');link.href=url;link.download=fileName;
   document.body.appendChild(link);link.click();link.remove();
  }finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
  break;
 }
 case 'tb-reply':{
  if(!state.edit||!talkBoxState.features?.threadedReplies||
     !talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const scope=talkBoxState.scope,issueId=talkBoxState.selected.id,parentId=button.dataset.id;
  if(!talkBoxState.selected.updates.some(row=>String(row.id)===parentId))break;
  openModal('Reply in TalkBox discussion',input('Reply','reply','', 'text'),async fd=>{
   const record=await talkBoxClient().replyVerified(issueId,parentId,fd.get('reply'));
   if(talkBoxCurrent(scope)&&talkBoxState.selected?.id===issueId){
    talkBoxState.selected=record;render();
   }
  },{submitLabel:'Post reply'});
  break;
 }
 case 'tb-file-cleanup':{
  if(!state.edit||!talkBoxState.features?.attachmentRemoval||
     !talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const scope=talkBoxState.scope,issueId=talkBoxState.selected.id;
  const asset=talkBoxState.selected.pendingAttachmentCleanup?.find(x=>String(x.id)===button.dataset.id);
  if(!asset)break;
  await (await talkBoxAttachments()).removeVerified(issueId,asset);
  if(talkBoxCurrent(scope)&&talkBoxState.selected?.id===issueId){
   talkBoxState.selected=await talkBoxClient().get(issueId);
   render();toast('Private attachment cleanup confirmed.');
  }
  break;
 }
 case 'tb-file-remove':{
  if(!state.edit||!talkBoxState.features?.attachmentRemoval||
     !talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const scope=talkBoxState.scope,issueId=talkBoxState.selected.id;
  const asset=talkBoxState.selected.assets?.find(x=>String(x.id)===button.dataset.id);
  if(!asset)break;
  if(!confirm('Permanently remove this native TalkBox attachment? This cannot be undone.'))break;
  const detail=await (await talkBoxAttachments()).removeVerified(issueId,asset);
  if(talkBoxCurrent(scope)&&talkBoxState.selected?.id===issueId){
   talkBoxState.selected=await talkBoxClient().get(issueId);
   render();toast('Private attachment removed.');
  }
  break;
 }
 case 'tb-subtask-new':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const issueId=talkBoxState.selected.id;
  openModal('Add TalkBox subtask',input('Subtask name','name'),async fd=>{
   const record=await talkBoxClient().createSubitem(issueId,fd.get('name'));
   if(talkBoxCurrent(talkBoxState.scope)){talkBoxState.selected=record;render();}
  });break;
 }
 case 'tb-subtask-status':{
  if(!state.edit||!talkBoxState.selected||!talkBoxCurrent(talkBoxState.scope))break;
  const issueId=talkBoxState.selected.id,subId=button.dataset.id;
  const sub=talkBoxState.selected.subitems.find(row=>String(row.id)===subId);
  if(!sub)break;
  openModal('Edit TalkBox subtask',input('Subtask name','name',sub.name)+
   select('Status','status',[
    ['Working on it','Working on it'],['Stuck','Stuck'],['Done','Done']],sub.status),async fd=>{
    const record=await talkBoxClient().updateSubitem(issueId,subId,{
     name:fd.get('name'),status:String(fd.get('status'))
    });
    if(talkBoxCurrent(talkBoxState.scope)){talkBoxState.selected=record;render();}
  });break;
 }
 case 'refresh-board':{await loadBoard(state.boardId,state.tab);break;}
 case 'tt-ojt-leave':{
  const scope=timeTrackerOjtScope(),selected=state.ttOjtSelected;
  if(!scope||!selected||state.ttOjtBusy||state.ttOjtPending||
    state.ttOjtSnapshot?.active)break;
  // Dropdown identity is a TimeTracker attribution choice, not a second login.
  // Clearing it locally does not sign out the shared Supabase Auth account.
  clearTimeTrackerOjtSelection();render();
  break;
 }
 case 'tt-ojt-clock':{
  const scope=timeTrackerOjtScope(),selected=state.ttOjtSelected;
  if(!scope||!selected||state.ttOjtBusy||state.ttOjtPending||
   state.ttAttendance?.status!=='VERIFIED_READ')break;
  const active=state.ttOjtSnapshot?.active||null,action=active?'clock-out':'clock-in';
  const locationValue=active?.location||String(document.getElementById('tt-ojt-location')?.value||'');
  const note=active||locationValue!=='Offsite (Home)'?'':String(document.getElementById('tt-ojt-note')?.value||'').trim();
  if(!active)state.ttOjtLocationSelection=locationValue;
  if(action==='clock-in')ttWorkNoteDraft.write(timeTrackerWorkNoteScope(selected.id),
   document.getElementById('tt-ojt-note')?.value||'');
  if(action==='clock-in'&&locationValue==='Offsite (Home)'&&!note){
   state.ttOjtError='Work Plan is required for Offsite (Home).';render();break;
  }
  state.ttOjtBusy=true;state.ttOjtError='';state.ttOjtSuccess='';
  state.ttOjtGeoProgress='Finding your GPS location…';render();
  try{
   // Deliberate user action: browser GPS is never queried on page load.
   const geo=await captureAttendanceGeo(navigator.geolocation,{
    diagnosticContext:{action:'ojt-attendance'},
    onProgress:message=>{
     if(timeTrackerOjtScope()&&state.ttOjtSelected===selected&&state.ttOjtBusy){
      state.ttOjtGeoProgress=message;render();
     }
    }
   });
   state.ttOjtGeoProgress='';
   if(!timeTrackerOjtScope()||state.ttOjtSelected!==selected)
    throw Error('Identity changed before location capture');
   // Unknown write outcomes require a fresh signed snapshot, never replay.
   state.ttOjtPending=true;
   await timeTrackerOjt.commit(scope,selected.id,{
    action,recordId:active?.id||null,location:locationValue,geo,workNote:note
   });
   state.ttOjtSnapshot=await timeTrackerOjt.snapshot(scope,selected.id);
   state.ttOjtPending=false;
   if(action==='clock-in')ttWorkNoteDraft.clear(timeTrackerWorkNoteScope(selected.id));
   state.ttOjtSuccess=action==='clock-in'?
    'Clock in successfully recorded for '+selected.name+'.':
    'Clock out successfully recorded for '+selected.name+'.';
  }catch(err){
   const gpsHelp={
    TT_GEO_DENIED:'Browser location permission is blocked. Allow Location for this site in browser settings and retry. No attendance request was sent.',
    TT_GEO_TIMEOUT:'GPS timed out. Keep this page open, enable device location and Wi-Fi, move near a window, then retry. No attendance request was sent.',
    TT_GEO_UNAVAILABLE:'Your device cannot provide a current location. Check Location Services and network connectivity, then retry. No attendance request was sent.',
    TT_GEO_INSECURE:'Location needs a secure HTTPS connection. Open APSYNTRA CRM using HTTPS and retry. No attendance request was sent.'
   };
   state.ttOjtError=state.ttOjtPending?
    'Attendance result is uncertain. Use Refresh to verify the record before trying again.':
    (gpsHelp[err?.code]||errorMessage(err));
  }finally{state.ttOjtBusy=false;state.ttOjtGeoProgress='';render();}
  break;
 }
 case 'tt-ojt-group-enable':
 case 'tt-ojt-group-toggle':{
  const scope=timeTrackerOjtAdminScope(),id=button.dataset.ojtUser;
  const enabled=name==='tt-ojt-group-enable'?true:button.dataset.ojtEnabled==='true';
  const users=state.ttAttendance?.access?.employees?.members||[];
  const eligible=users.some(u=>u.id===id&&isEligibleTimeTrackerSharedOjtAccount(u));
  const configured=state.ttAttendance?.ojtAdmin?.groups?.some(g=>g.userId===id);
  if(!scope||state.ttOjtBusy||id!==TIMETRACKER_SHARED_OJT_USER_ID||
    (enabled?!eligible:!configured))break;
  if(!enabled&&!confirm('Disable the shared OJT login? All active intern sessions must be ended first. Attendance history will be preserved.'))break;
  state.ttOjtBusy=true;render();
  try{await timeTrackerOjt.setGroup(scope,id,enabled);
   await loadTimeTracker();toast(enabled?'Shared OJT login enabled.':'Shared OJT login disabled.');}
  catch(err){notice(err);}
  finally{state.ttOjtBusy=false;render();}
  break;
 }
 case 'tt-ojt-intern-add':
 case 'tt-ojt-intern-edit':{
  const scope=timeTrackerOjtAdminScope(),userId=button.dataset.ojtUser,
   group=state.ttAttendance?.ojtAdmin?.groups?.find(g=>g.userId===userId);
  const existing=name==='tt-ojt-intern-edit'?
   group?.interns?.find(i=>i.id===button.dataset.ojtId):null;
  if(!scope||!group||(name==='tt-ojt-intern-edit'&&!existing)||state.ttOjtBusy)break;
  openModal(existing?'Edit OJT intern':'Add OJT intern',
   '<p class="note">Interns use the existing shared company login and select their own name from the TimeTracker dropdown. No separate password or PIN is created.</p>'+
   '<label>Intern name<input name="name" maxlength="100" minlength="2" required value="'+e(existing?.name||'')+'"></label>'+
   (existing?select('Profile status','active',[['true','Active'],['false','Inactive']],
      String(existing.active)):''),
   async fd=>{
    const nameValue=String(fd.get('name')||'').trim();
    const active=existing?String(fd.get('active'))==='true':true;
    state.ttOjtBusy=true;render();
    try{
     await timeTrackerOjt.setIntern(scope,{userId,id:existing?.id||null,
       name:nameValue,active});
     await loadTimeTracker();toast(existing?'Intern updated.':'Intern profile added.');
    }finally{state.ttOjtBusy=false;render();}
   },{submitLabel:existing?'Save intern':'Add intern'});
  break;
 }
 case 'tt-clock-verify':{await verifyTimeTrackerAttendance();break;}
 case 'tt-gps-diagnostics-copy':{
  const report=exportTimeTrackerGpsDiagnostics();
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard API unavailable');
   await navigator.clipboard.writeText(report);
   toast('GPS diagnostics copied. Precise coordinates are not included.');
  }catch{
   window.prompt('Copy the local TimeTracker GPS diagnostic report. Precise coordinates are not included:',report);
  }
  break;
 }
 case 'tt-refresh':{if(!state.ttBusy&&!state.ttLogAdminBusy){const team=state.ttView==='team',gps=state.ttView==='gps',log=state.ttView==='log';await loadTimeTracker();if(team&&state.roleVerified===true&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerTeam();if(gps&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerGps();if(log&&state.ttAttendance?.status==='VERIFIED_READ')await loadTimeTrackerLogGps();}break;}
 case 'tt-employees-department-edit':{
   if(state.ttBusy||state.ttView!=='employees'||state.ttAttendance?.status!=='VERIFIED_READ'||
      !['System Admin','IT Administrator'].includes(state.ttAttendance.access.moduleRole)||
      state.ttAttendance.access.employees?.departmentsReady!==true||
      !state.ttAttendance.access.departmentCatalog)return;
   const member=state.ttAttendance.access.employees.members.find(m=>m.id===button.dataset.userId);
   if(!member)return;
   const seq=routeSerial,boardId=state.boardId,actorId=state.context?.user_id,
    workspaceId=state.context?.workspace_id;
   const available=state.ttAttendance.access.departmentCatalog.departments.map(d=>d.name);
   openModal('Assign department · '+member.name,
    '<p class="note">Employee: '+e(member.name)+'. Department changes affect new clock-ins; historical records remain unchanged.</p>'+
    select('Department','department',[['','Select a department'],...available.map(d=>[d,d])],member.department||''),
    async fd=>{
     if(seq!==routeSerial||state.view!=='board'||state.tab!=='attendance'||
        state.ttView!=='employees'||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId||state.boardId!==boardId)
      throw Error('Signed TimeTracker workspace changed; refresh and try again');
     const department=String(fd.get('department')||'');
     if(!available.includes(department))throw Error('Select a current department');
     const verified=await timeTracker.assignEmployeeDepartment(boardId,member.id,department,{
      verifiedAccess:state.ttAttendance.access
     });
     if(seq!==routeSerial||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId||state.boardId!==boardId||
        state.ttAttendance?.status!=='VERIFIED_READ')
      throw Error('Department saved but the session changed; refresh Employees');
     // Both employee assignment and catalog count were verified by fresh signed RPCs.
     state.ttAttendance={...state.ttAttendance,access:{
      ...state.ttAttendance.access,employees:verified,
      departmentCatalog:verified.departmentCatalog,
      ...(member.id===actorId?{employeeDepartment:department}:{})
     }};
     render();
    },{submitLabel:'Save department',successMessage:'Department assignment saved.'});
   break;
  }
 case 'tt-departments-add':
 case 'tt-departments-rename':{
   if(state.ttBusy||state.ttView!=='employees'||state.view!=='board'||
      state.tab!=='attendance'||state.ttAttendance?.status!=='VERIFIED_READ'||
      !['System Admin','IT Administrator'].includes(state.ttAttendance.access.moduleRole))return;
   const catalog=state.ttAttendance.access.departmentCatalog;
   if(catalog?.scope!=='SIGNED_TIMETRACKER_DEPARTMENT_CATALOG')return;
   const rename=name==='tt-departments-rename';
   const dept=rename?catalog.departments.find(d=>d.id===button.dataset.departmentId):null;
   if(rename&&!dept)return;
   const seq=routeSerial,boardId=state.boardId,actorId=state.context?.user_id,
    workspaceId=state.context?.workspace_id;
   const submitDepartment=async fd=>{
     if(seq!==routeSerial||state.view!=='board'||state.tab!=='attendance'||
        state.ttView!=='employees'||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId||state.boardId!==boardId)
      throw Error('TimeTracker workspace changed; reopen Department Management');
     const nextName=String(fd.get('departmentName')||'').trim();
     if(nextName.length<2||nextName.length>60)
      throw Error('Department name must have 2 to 60 characters');
     const after=await timeTracker.mutateDepartmentCatalog(boardId,{
      action:rename?'rename':'add',departmentId:dept?.id||null,
      name:nextName,expectedRevision:catalog.revision
     });
     if(seq!==routeSerial||state.boardId!==boardId||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId)
      throw Error('Department saved but the workspace changed; refresh Employees');
     if(!after.departments.some(d=>d.name===nextName))throw Error('Department could not be verified');
     await loadTimeTracker(seq);
   };
   if(rename){
    // Existing rename fields and backend mutation stay unchanged.
    openModal('Rename '+dept.name,
     '<p class="note">Changes to department names and current assignments are saved to this workspace in Supabase.</p>'+
     '<label>Department name<input type="text" name="departmentName" minlength="2" maxlength="60" required value="'+e(dept.name)+'"></label>',
     submitDepartment,{submitLabel:'Save department name',
      successMessage:'Department renamed.'});
   }else{
    // Only the Add department interaction uses the specialized modal.
    hideModal();
    modal=openTimeTrackerAddDepartmentModal({
     existingDepartments:catalog.departments,trigger:button,
     onSubmit:submitDepartment,onSuccess:()=>toast('Department added.'),
     onError:notice,onClose:()=>{modal=null;flushVisibleBoardContent();}
    });
   }
   break;
 }
 case 'tt-departments-delete':{
   if(state.ttBusy||state.ttView!=='employees'||state.view!=='board'||
      state.tab!=='attendance'||state.ttAttendance?.status!=='VERIFIED_READ'||
      !['System Admin','IT Administrator'].includes(state.ttAttendance.access.moduleRole))return;
   const catalog=state.ttAttendance.access.departmentCatalog;
   if(catalog?.scope!=='SIGNED_TIMETRACKER_DEPARTMENT_CATALOG')return;
   const dept=catalog.departments.find(d=>d.id===button.dataset.departmentId);
   if(!dept)return;
   const seq=routeSerial,boardId=state.boardId,actorId=state.context?.user_id,
    workspaceId=state.context?.workspace_id;
   openModal('Delete department · '+dept.name,
    '<p class="note" role="alert"><strong>'+dept.assignedCount+' employee'+(dept.assignedCount===1?' is':'s are')+
    ' assigned to this '+e(dept.name)+' department.</strong></p>'+
    '<p class="note">Deleting this department will unassign these employees. They cannot start a new Clock-In until an administrator assigns another department. Previously recorded attendance remains unchanged.</p>'+
    '<label class="tt-department-delete-ack"><input type="checkbox" name="acknowledge" value="yes" required> I understand this deletion will remove the department and any current employee assignments.</label>',
    async fd=>{
     if(fd.get('acknowledge')!=='yes')throw Error('Acknowledge the assignment impact before deleting');
     if(seq!==routeSerial||state.view!=='board'||state.tab!=='attendance'||
        state.ttView!=='employees'||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId||state.boardId!==boardId)
      throw Error('TimeTracker workspace changed; reopen the department warning');
     const after=await timeTracker.mutateDepartmentCatalog(boardId,{
      action:'delete',departmentId:dept.id,
      expectedRevision:catalog.revision,expectedCount:dept.assignedCount
     });
     if(seq!==routeSerial||state.boardId!==boardId||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId)
      throw Error('Department deleted but the session changed; refresh Employees');
     if(after.departments.some(d=>d.id===dept.id))
      throw Error('Department deletion could not be verified');
     await loadTimeTracker(seq);
    },{submitLabel:'Delete department',destructive:true,
       successMessage:'Department deleted; affected employees are unassigned.'});
   break;
 }
 case 'tt-employees-attendance':{
   if(state.ttBusy||state.ttView!=='employees'||state.ttAttendance?.status!=='VERIFIED_READ'||
      !['System Admin','IT Administrator'].includes(state.ttAttendance.access.moduleRole))return;
   const member=state.ttAttendance.access.employees?.members.find(m=>m.id===button.dataset.userId);
   if(!member)return;
   state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS,employeeId:member.id};
   state.ttView='log';render();
   break;
  }
 case 'tt-log-employee-clear':{
   if(state.ttView!=='log'||state.ttAttendance?.status!=='VERIFIED_READ')return;
   state.ttLogFilters={...state.ttLogFilters,employeeId:null};
   render();break;
  }
 case 'tt-employees-section':{
  if(state.ttBusy||state.ttOjtBusy||state.ttView!=='employees'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  const next=button.dataset.target;
  if(!['directory','departments','ojt'].includes(next))return;
  if(!canViewTimeTrackerEmployees(state.ttAttendance.access))return;
  state.ttEmployeesTab=next;render();
  root.querySelector('[data-action="tt-employees-section"][aria-pressed="true"]')?.focus();
  break;
 }
 case 'tt-employees-refresh':{
  if(state.ttBusy||state.ttView!=='employees'||state.ttAttendance?.status!=='VERIFIED_READ'||
     !canViewTimeTrackerEmployees(state.ttAttendance.access))return;
  await loadTimeTracker();break;
 }
 case 'tt-tab':{
  if(state.ttBusy||state.ttLogAdminBusy||state.ttLogAdminEditor||state.view!=='board'||state.tab!=='attendance'||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const next=button.dataset.target;
  if(!['overview','clock','employees','log','reports','calendar','ot','hours','team','monitor','gps'].includes(next))return;
  if(next==='gps'&&state.roleVerified!==true&&state.ttAttendance.access?.moduleRole!=='Supervisor')return;
  if(next==='team'&&state.roleVerified!==true)return;
  if(next==='employees'&&!canViewTimeTrackerEmployees(state.ttAttendance.access))return;
  if(next!=='ot')state.ttOtModalOpen=false;
  if(next===state.ttView)return;
  state.ttGeoPromptVisible=false;state.ttGeoMessage='';
  if(next!=='log'){state.ttLogAdminEditor=null;state.ttLogAdminDeleteConfirm=null;state.ttLogSelectedIds=[];state.ttLogAdminError='';state.ttLogAdminSuccess='';}
  state.ttView=next;
  saveTimeTrackerViewPreference(timeTrackerViewStorage(),timeTrackerWorkNoteScope()||{},next);
  render();
  animateTabContent('.tt-secondary-content, .tt-clock-stage');
  // Clock opens with only critical signed reads. Hydrate secondary views on demand.
  const requiresDetail=next!=='clock'&&state.ttAttendance?.clockOnly===true;
  if(requiresDetail)await loadTimeTracker();
  if(next==='employees'&&!requiresDetail)await loadTimeTracker();
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
 case 'tt-log-open-detail':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='log'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttLogAdminEditor)return;
  const rows=timeTrackerLogRowsForSnapshot(state.ttAttendance);
  const id=button.dataset.recordId;
  const selectedRow=rows.find(r=>r.id===id);
  if(!selectedRow)return;
  if(selectedRow.isOjt){
   // OJT selection is individual-only and never enters standard employee bulk operations.
   if(timeTrackerAdminLogReady()&&state.ttAttendance.access.moduleRole==='System Admin')
    state.ttLogSelectedIds=[id];
   state.ttLogExpandedIds=[id];render();
   root.querySelector('[data-tt-log-detail-dialog] [data-action="tt-log-detail-close"]')?.focus();
   break;
  }
  if(timeTrackerAdminLogReady()&&state.ttAttendance.access?.moduleRole==='System Admin'&&!state.ttLogAdminBusy){
   let selected=new Set(state.ttLogSelectedIds.filter(id=>!String(id).startsWith('ojt:')));
   if(button.dataset.shiftSelect==='true'){
    const standardIds=new Set(state.ttAttendance.log?.rows?.map(row=>row.id)||[]);
    const order=[...root.querySelectorAll('.tt-log-filterable:not([hidden])')]
     .map(row=>row.dataset.recordId).filter(id=>standardIds.has(id));
    const last=state.ttLogSelectedIds.at(-1),start=order.indexOf(last),end=order.indexOf(id);
    if(start>=0&&end>=0){
     for(const candidate of order.slice(Math.min(start,end),Math.max(start,end)+1)){
      if(selected.size>=TT_ADMIN_RECORD_LIMIT)break;
      selected.add(candidate);
     }
    }else selected=new Set([id]);
   }else if(button.dataset.multiSelect==='true'){
    if(selected.has(id))selected.delete(id);
    else if(selected.size<TT_ADMIN_RECORD_LIMIT)selected.add(id);
    else toast('Select at most '+TT_ADMIN_RECORD_LIMIT+' attendance records.',true);
   }else selected=new Set([id]);
   state.ttLogSelectedIds=[...selected];
   // Modified clicks extend/toggle the selection without obstructing bulk selection.
   // An ordinary click still opens the signed record details popup.
   if(button.dataset.multiSelect==='true'){
    render();
    [...root.querySelectorAll('[data-action="tt-log-open-detail"]')]
     .find(row=>row.dataset.recordId===id)?.focus();
    break;
   }
  }
  state.ttLogExpandedIds=[id];render();
  root.querySelector('[data-tt-log-detail-dialog] [data-action="tt-log-detail-close"]')?.focus();
  void mountSignedTimeTrackerMaps();break;
 }
 case 'tt-log-detail-close':{
  if(state.ttView!=='log'||!state.ttLogExpandedIds.length)return;
  const id=state.ttLogExpandedIds[0];state.ttLogExpandedIds=[];render();
  [...root.querySelectorAll('[data-action="tt-log-open-detail"]')]
   .find(row=>row.dataset.recordId===id)?.focus();
  break;
 }
 case 'tt-log-detail-toggle-select':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin'||state.ttLogAdminBusy)return;
  const id=button.dataset.recordId;
  const record=timeTrackerLogRowsForSnapshot(state.ttAttendance).find(row=>row.id===id);
  if(!state.ttLogExpandedIds.includes(id)||!record)return;
  if(record.isOjt){
   if(state.ttLogSelectedIds.includes(id)){
    state.ttLogSelectedIds=state.ttLogSelectedIds.filter(value=>value!==id);
    state.ttLogExpandedIds=[];
    render();
    [...root.querySelectorAll('[data-action="tt-log-open-detail"]')]
     .find(row=>row.dataset.recordId===id)?.focus();
   }else{
    state.ttLogSelectedIds=[id];render();
    root.querySelector('[data-action="tt-log-detail-toggle-select"]')?.focus();
   }
   break;
  }
  const selected=new Set(state.ttLogSelectedIds.filter(value=>!String(value).startsWith('ojt:')));
  if(selected.has(id))selected.delete(id);
  else if(selected.size<TT_ADMIN_RECORD_LIMIT)selected.add(id);
  else {toast('Select at most '+TT_ADMIN_RECORD_LIMIT+' attendance records.',true);return;}
  state.ttLogSelectedIds=[...selected];render();
  root.querySelector('[data-action="tt-log-detail-toggle-select"]')?.focus();break;
 }
 case 'tt-log-row-select':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin'||state.ttLogAdminBusy)return;
  const id=button.dataset.recordId;
  const record=timeTrackerLogRowsForSnapshot(state.ttAttendance).find(r=>r.id===id);
  if(!record)return;
  if(record.isOjt){
   state.ttLogSelectedIds=state.ttLogSelectedIds.includes(id)?[]:[id];
  }else{
   const selected=new Set(state.ttLogSelectedIds.filter(value=>!String(value).startsWith('ojt:')));
   if(selected.has(id))selected.delete(id);
   else if(selected.size<TT_ADMIN_RECORD_LIMIT)selected.add(id);
   else {toast('Select at most '+TT_ADMIN_RECORD_LIMIT+' attendance records.',true);return;}
   state.ttLogSelectedIds=[...selected];
  }
  render();
  [...root.querySelectorAll('[data-action="tt-log-row-select"]')].find(row=>row.dataset.recordId===id)?.focus();
  break;
 }
 case 'tt-log-view':
 case 'tt-log-date-clear':
 case 'tt-log-filter-reset':
 case 'tt-log-filter-apply':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='log'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  let next={...TT_LOG_DEFAULT_FILTERS,...state.ttLogFilters};
  if(name==='tt-log-view'){
   if(!['all','today','Completed','Active'].includes(button.dataset.target))return;
   next.view=button.dataset.target;
   if(next.view==='today'){next.date='';next.period='all';next.start='';next.end='';}
  }else if(name==='tt-log-date-clear'){
   next.date='';
  }else if(name==='tt-log-filter-reset'){
   next={...TT_LOG_DEFAULT_FILTERS,view:next.view,search:next.search,employeeId:next.employeeId};
  }else{
   const panel=button.closest('.tt-log-filter-panel');
   if(!panel)return;
   for(const key of ['period','status','location','department','sort','start','end'])next[key]=panel.querySelector('#tt-log-'+key)?.value||TT_LOG_DEFAULT_FILTERS[key];
   if(next.period==='custom'&&(!next.start||!next.end||next.start>next.end)){toast('Select a valid start and end date.',true);return;}
   if(next.period!=='all')next.date='';
  }
  state.ttLogFilters=next;
  const visible=new Set(filterTimeTrackerLogRows(timeTrackerLogRowsForSnapshot(state.ttAttendance),next).map(r=>r.id));
  state.ttLogSelectedIds=state.ttLogSelectedIds.filter(id=>visible.has(id));
  state.ttLogExpandedIds=[];
  render();
  if(name==='tt-log-date-clear')root.querySelector('#tt-log-date')?.focus();
  else if(name!=='tt-log-view')root.querySelector('.tt-log-filter-trigger')?.focus();
  break;
 }
 case 'tt-log-insights':{
  const insights=root.querySelector('.tt-log-secondary-analytics');
  if(insights){insights.open=!insights.open;if(insights.open)insights.scrollIntoView({block:'nearest'});}
  break;
 }
 case 'tt-log-admin-select-visible':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin'||state.ttLogAdminBusy)return;
  const standardIds=new Set(state.ttAttendance.log?.rows?.map(row=>row.id)||[]);
  const selected=new Set(state.ttLogSelectedIds.filter(id=>standardIds.has(id)));
  const ids=[...root.querySelectorAll('.tt-log-filterable:not([hidden])')]
   .map(row=>row.dataset.recordId).filter(id=>standardIds.has(id));
  if(ids.length&&ids.every(id=>selected.has(id))){
   ids.forEach(id=>selected.delete(id));state.ttLogSelectedIds=[...selected];render();break;
  }
  for(const id of ids){
   if(selected.size>=TT_ADMIN_RECORD_LIMIT&&!selected.has(id))break;
   selected.add(id);
  }
  if(ids.some(id=>!selected.has(id)))toast('Selection limited to '+TT_ADMIN_RECORD_LIMIT+' attendance records.',true);
  state.ttLogSelectedIds=[...selected];render();break;
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
 case 'tt-log-admin-add':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin'||
     state.ttLogAdminBusy||state.ttLogAdminEditor||state.ttLogAdminDeleteConfirm)return;
  const access=state.ttAttendance.access;
  state.ttLogAdminError='';state.ttLogAdminSuccess='';
  state.ttLogAdminEditor={mode:'manual',actorId:access.userId,workspaceId:access.workspaceId,
   boardId:access.boardId,roster:manualAttendancePreviewRoster(state.ttAttendance),
   signedCreateReady:false,draft:{date:manualAttendanceToday(),status:'active'}};
  const editor=state.ttLogAdminEditor;
  const seq=routeSerial,boardId=state.boardId;
  state.ttLogAdminBusy=true;render();
  try{
   const capability=await timeTracker.manualClockInCapability(boardId);
   if(seq===routeSerial&&state.ttLogAdminEditor===editor&&timeTrackerAdminLogReady()&&
      capability?.historicalReady===true){
    editor.capability=capability;
    editor.signedCreateReady=true;
    editor.revision=state.ttAttendance.revision;
   }
  }catch(err){
   if(seq===routeSerial&&state.ttLogAdminEditor===editor)
    state.ttLogAdminError=errorMessage(err);
  }finally{
   if(seq===routeSerial&&state.ttLogAdminEditor===editor){
    state.ttLogAdminBusy=false;render();
    root.querySelector('#tt-attendance-admin-form select[name="employee"]')?.focus();
   }
  }
  break;
 }
 case 'tt-log-admin-manual-clock-out':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin'||
     !timeTrackerLogRowsForSnapshot(state.ttAttendance).some(row=>row.id===button.dataset.recordId&&row.status==='Active'&&!row.clockOut))return;
  await openTimeTrackerAdminEditor([button.dataset.recordId],'single',{manualClockout:true});break;
 }
 case 'tt-log-admin-correct-time':{
  if(!timeTrackerAdminLogReady())return;
  await openTimeTrackerAdminEditor([button.dataset.recordId],'single',{timeOnly:true});break;
 }
 case 'tt-log-admin-edit':{
  if(!timeTrackerAdminLogReady())return;
  await openTimeTrackerAdminEditor([button.dataset.recordId],'single');break;
 }
 case 'tt-log-admin-bulk-edit':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin')return;
  await openTimeTrackerAdminEditor(state.ttLogSelectedIds.filter(id=>!String(id).startsWith('ojt:')),'bulk');break;
 }
 case 'tt-log-admin-delete':{
  if(!timeTrackerAdminLogReady())return;
  await deleteTimeTrackerAdminRecords([button.dataset.recordId]);break;
 }
 case 'tt-log-admin-delete-confirm':{
  await confirmTimeTrackerAdminDeletion();break;
 }
 case 'tt-log-admin-delete-cancel':{
  cancelTimeTrackerAdminDeletion();break;
 }
 case 'tt-log-admin-bulk-delete':{
  if(!timeTrackerAdminLogReady()||state.ttAttendance.access.moduleRole!=='System Admin')return;
  await deleteTimeTrackerAdminRecords(state.ttLogSelectedIds.filter(id=>!String(id).startsWith('ojt:')));break;
 }
 case 'tt-log-admin-clear-selection':{
  if(state.ttAttendance?.access?.moduleRole!=='System Admin')return;
  if(!timeTrackerAdminLogReady()||state.ttLogAdminBusy)return;
  state.ttLogSelectedIds=[];render();break;
 }
 case 'tt-log-admin-cancel':{
  if(!timeTrackerAdminLogReady()||state.ttLogAdminBusy)return;
  {const editor=state.ttLogAdminEditor;state.ttLogAdminEditor=null;state.ttLogAdminError='';render();
   const target=editor?.mode==='manual'?root.querySelector('[data-action="tt-log-admin-add"]'):editor?.mode==='bulk'?root.querySelector('[data-action=\"tt-log-admin-bulk-edit\"]'):
    root.querySelector('[data-tt-log-detail-dialog] [data-action=\"tt-log-detail-close\"]')||
    root.querySelector('[data-action=\"tt-log-open-detail\"][data-record-id=\"'+editor?.recordIds?.[0]+'\"]');
   target?.focus();}
  break;
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
  const rows=filterTimeTrackerLogRows(timeTrackerLogRowsForSnapshot(state.ttAttendance),state.ttLogFilters);
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
  state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttOtExpandedRequestIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};
  state.ttMonitorBusy=false;render();break;
 }
 case 'tt-team-department-edit':{
   if(state.ttBusy||state.ttTeamBusy||state.ttView!=='team'||state.roleVerified!==true||
      state.ttAttendance?.status!=='VERIFIED_READ'||state.ttTeam?.departmentsReady!==true)return;
   const member=state.ttTeam.members.find(m=>m.id===button.dataset.userId);
   if(!member||member.status!=='Active'||member.role==='Unassigned')return;
   const boardId=state.boardId,actorId=state.context?.user_id,
    workspaceId=state.context?.workspace_id,seq=routeSerial;
   openModal('Assign department · '+member.name,
    '<p class="note">Employee: '+e(member.email)+'. Department changes apply to new clock-ins only; existing attendance records are preserved.</p>'+
    select('Department','department',[
     ['', 'Select a department'],...TT_DEPARTMENTS.map(d=>[d,d])
    ],member.department||''),
    async fd=>{
     if(seq!==routeSerial||state.view!=='board'||state.tab!=='attendance'||
        state.ttView!=='team'||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId||state.boardId!==boardId||
        state.roleVerified!==true)
      throw Error('TimeTracker identity or workspace changed; refresh and retry');
     const department=String(fd.get('department')||'');
     if(!TT_DEPARTMENTS.includes(department))throw Error('Choose a valid department');
     const updated=await timeTracker.assignTeamDepartment(boardId,member.id,department);
     if(seq!==routeSerial||state.context?.user_id!==actorId||
        state.context?.workspace_id!==workspaceId||state.boardId!==boardId)
      throw Error('Department saved but session changed; refresh TimeTracker');
     state.ttTeam=updated;render();
    },{submitLabel:'Save department',successMessage:'Employee department saved.'});
   break;
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
 case 'tt-ot-manual-more':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ')return;
  const total=(state.ttAttendance.otRequests||[]).filter(row=>row?.isManual===true).length;
  const current=Number.isSafeInteger(state.ttOtManualVisibleCount)&&state.ttOtManualVisibleCount>0?
   state.ttOtManualVisibleCount:50;
  state.ttOtManualVisibleCount=Math.min(total,current+50);
  render();break;
 }
 case 'tt-ot-prev':
 case 'tt-ot-next':
 case 'tt-ot-current':
 case 'tt-ot-status':
 case 'tt-ot-sort':
 case 'tt-ot-open':
 case 'tt-ot-manual-open':
 case 'tt-ot-close':{
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttBusy||state.ttAttendance?.status!=='VERIFIED_READ')return;
  if(name==='tt-ot-open'){state.ttOtDraft={};state.ttOtModalOpen=true;}
  if(name==='tt-ot-manual-open'){
   if(state.ttAttendance.access?.manualOtManager!==true||state.ttAttendance.access?.moduleRole!=='System Admin')return;
   state.ttOtDraft={};state.ttOtModalOpen='manual';
  }
  if(name==='tt-ot-close'){state.ttOtModalOpen=false;state.ttOtDraft={};}
  if(name==='tt-ot-current')state.ttOtFilters={...state.ttOtFilters,weekOffset:0};
  if(name==='tt-ot-prev'||name==='tt-ot-next'){
   const offset=state.ttOtFilters.weekOffset+(name==='tt-ot-prev'?-1:1);
   if(Math.abs(offset)>TT_OT_MAX_WEEK_OFFSET)return;
   state.ttOtFilters={...state.ttOtFilters,weekOffset:offset};
  }
  if(name==='tt-ot-status'&&['All','Submitted','Approved','Rejected'].includes(button.dataset.status))
   state.ttOtFilters={...state.ttOtFilters,status:button.dataset.status};
  if(name==='tt-ot-sort')
   state.ttOtFilters={...state.ttOtFilters,
    sort:state.ttOtFilters.sort==='oldest'?'newest':'oldest'};
  render();
  if(name==='tt-ot-open')root.querySelector('#tt-ot-date')?.focus();
  if(name==='tt-ot-manual-open')root.querySelector('#tt-ot-manual-employee')?.focus();
  if(name==='tt-ot-close')root.querySelector('[data-action="tt-ot-open"]')?.focus();
  break;
 }
 case 'tt-ot-reason':{
  if(state.ttBusy||state.ttOtModalOpen!=='manual')return;
  const input=root.querySelector('#tt-ot-manual-reason');
  if(input){input.value=button.dataset.reason||'';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
  break;
 }
 case 'tt-ot-withdraw':{
  if(!TT_OT_WRITES_ACCEPTED||state.ttBusy||state.view!=='board'||state.tab!=='attendance'||
     state.ttView!=='ot'||state.ttAttendance?.status!=='VERIFIED_READ')return;
  const requestId=button.dataset.id;
  if(!state.ttAttendance.otRequests?.some(row=>row.id===requestId&&row.status==='Submitted'&&row.canWithdraw===true))return;
  if(!confirm('Remove this pending overtime request? This action cannot be undone.'))return;
  state.ttBusy=true;render();
  try{
   await timeTracker.withdrawOvertime(state.boardId,requestId);
   await loadTimeTracker();
   toast('Overtime request removed.');
  }finally{state.ttBusy=false;render();}
  break;
 }
 case 'tt-ot-approve':
 case 'tt-ot-reject':{
  if(!TT_OT_WRITES_ACCEPTED||state.ttBusy||
     state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ')return;
  const requestId=button.dataset.id;
  const request=state.ttAttendance.otRequests?.find(row=>row.id===requestId&&row.status==='Submitted');
  const access=state.ttAttendance.access;
  const canReview=access?.bootstrapApprover===true||
   (access?.manualOtManager===true&&request?.isManual===true);
  if(!request||!canReview||(access?.bootstrapApprover!==true&&
     request.ownerId==='cloud:'+access?.userId))return;
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
 case 'user-role-mode':{
   if(!state.adminVerified||state.userRoleBusy||
      !(state.view==='user-role-management'||(state.view==='role-configuration'&&state.roleTab==='application-access')))break;
   const mode=button.dataset.mode;
   if(!['individual','batch'].includes(mode))break;
   state.userRoleBatchMode=mode==='batch';
   render();break;
 }
 case 'user-role-batch-clear':{
   if(!state.adminVerified||state.userRoleBusy||!state.userRoleBatchMode)break;
   state.userRoleBatchSelected=[];render();break;
 }
 case 'user-role-batch-select-eligible':{
   if(!state.adminVerified||state.userRoleBusy||!state.userRoleBatchMode||
      !state.userRoleData)break;
   if(state.view==='role-configuration'&&state.roleTab==='application-access'){
    state.userRoleBatchSelected=state.userRoleData.users.filter(user=>
     !user.protected&&user.id!==state.context?.user_id).map(user=>user.id);
    render();break;
   }
   const {planUserRoleBatch}=await import('./user-role-batch.js');
   const data=state.userRoleData,scope=state.userRoleBatchScope;
   const choices=scope==='module'?ROLE_MODULE_OPTIONS:data.boards.map(b=>[b.id,b.name]);
   const resourceId=choices.some(([id])=>id===state.userRoleBatchResource)?
     state.userRoleBatchResource:choices[0]?.[0];
   const roles=scope==='module'?(resourceId==='fueltrans'?(data.fueltransWorkspaceAvailable===true?FUELTRANS_WORKSPACE_ROLES:[]):MODULE_ROLE_OPTIONS[resourceId]||[]):['viewer','editor'];
   const role=roles.includes(state.userRoleBatchRole)?state.userRoleBatchRole:roles[0];
   const selected=[];
   for(const user of data.users){
    if(user.protected||user.id===state.context?.user_id)continue;
    try{
     planUserRoleBatch(data,{userIds:[user.id],actorUserId:state.context?.user_id,
      scope,resourceId,role,enabled:state.userRoleBatchAction!=='revoke'});
     selected.push(user.id);
    }catch{/* Keep source permissions unchanged; only eligible members are selected. */}
   }
   state.userRoleBatchSelected=selected;
   render();break;
 }
 case 'user-role-native-batch-review':{
   if(!state.adminVerified||state.userRoleBusy||!state.userRoleData||
      !state.userRoleBatchMode||state.view!=='role-configuration'||
      state.roleTab!=='application-access')break;
   const {planNativeApplicationBatch}=await import('./user-role-batch.js');
   const snapshot=state.userRoleData;
   const selectedIds=[...state.userRoleBatchSelected];
   const moduleIds=[...state.userRoleBatchModulesSelected];
   const enabled=state.userRoleBatchAction!=='revoke';
   const applications=moduleIds.map(moduleId=>{
    const options=moduleId==='fueltrans'&&snapshot.fueltransWorkspaceAvailable===true?
     FUELTRANS_WORKSPACE_ROLES:MODULE_ROLE_OPTIONS[moduleId]||[];
    const selectedRole=state.userRoleBatchModuleRoles[moduleId];
    return {moduleId,role:options.includes(selectedRole)?selectedRole:options[0]||''};
   });
   const plan=planNativeApplicationBatch(snapshot,{userIds:selectedIds,
    actorUserId:state.context?.user_id,applications,enabled});
   if(!plan.operations.length){
    state.userRoleNativeBatchResults=[
     ...plan.unchanged.map(item=>({userId:item.userId,moduleId:item.moduleId,status:'Unchanged',detail:'Already at the requested application state.'})),
     ...plan.skipped.map(item=>({userId:item.userId,moduleId:item.moduleId,email:item.email,status:'Skipped',detail:item.reason}))
    ];
    render();
    toast('No application assignments needed changing. Review the unchanged and skipped results.');
    break;
   }
   const targetEmails=selectedIds.map(id=>snapshot.users.find(user=>user.id===id)?.email).filter(Boolean);
   const appLabels=applications.map(item=>{
    const name=ROLE_MODULE_OPTIONS.find(([id])=>id===item.moduleId)?.[1]||item.moduleId;
    return '<li>'+e(name)+' — '+e(enabled?item.role:'Revoke existing role')+'</li>';
   }).join('');
   const fields='<div class="note">Review '+plan.operations.length+' planned member/application changes across '+
    applications.length+' selected application(s). '+plan.unchanged.length+' unchanged pair(s) will be skipped and '+
    plan.skipped.length+' unsupported or ineligible pair(s) will not be modified. Each application assignment is saved independently and checked against a refreshed workspace snapshot.</div>'+
    '<div class="user-role-batch-confirm-targets"><strong>Selected members ('+targetEmails.length+')</strong><ul>'+targetEmails.map(email=>'<li>'+e(email)+'</li>').join('')+'</ul></div>'+
    '<div class="user-role-batch-confirm-targets"><strong>Selected applications and roles</strong><ul>'+appLabels+'</ul></div>'+
    (plan.skipped.length?'<p class="note">Skipped pairs: '+plan.skipped.map(item=>e(item.email||item.userId)+' / '+e(ROLE_MODULE_OPTIONS.find(([id])=>id===item.moduleId)?.[1]||item.moduleId)+': '+e(item.reason)).join('; ')+'</p>':'')+
    '<p class="muted">The operation records an individual result for each member/application pair. Successful writes are not silently rolled back if another pair fails.</p>';
   openModal(enabled?'Review native application assignments':'Review native application revocations',fields,async()=>{
    if(!state.adminVerified||state.userRoleBusy||state.userRoleData!==snapshot||
       state.view!=='role-configuration'||state.roleTab!=='application-access')
     throw new ApiError('Application assignments changed. Reopen and review the batch again.',409);
    const actor=await auth.getVerifiedUser(),ctx=await db.context();
    if(actor?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
       ctx.workspace_id!==state.context?.workspace_id||!(await roleConfig.adminVerified()))
     throw new ApiError('Verified CRM Administrator and active workspace are required.',403);
    state.userRoleBusy=true;state.userRoleError='';render();
    const writeResults=[];
    let readbackAvailable=false;
    try{
     const current=await userRoleManager.snapshot(ctx.workspace_id,{
      includeFuelTrans:true,includeFundTracker:true,includeScopedSix:true,includeCharter:true
     });
     const freshPlan=planNativeApplicationBatch(current,{userIds:selectedIds,
      actorUserId:ctx.user_id,applications,enabled});
     const sameOperations=freshPlan.operations.length===plan.operations.length&&
      freshPlan.operations.every((op,index)=>{
       const previous=plan.operations[index];
       return op.userId===previous.userId&&op.resourceId===previous.resourceId&&
        op.role===previous.role&&op.enabled===previous.enabled&&
        op.expectedUpdatedAt===previous.expectedUpdatedAt;
      });
     if(!sameOperations||JSON.stringify(freshPlan.unchanged)!==JSON.stringify(plan.unchanged)||
        JSON.stringify(freshPlan.skipped)!==JSON.stringify(plan.skipped))
      throw new ApiError('Application assignments changed since review. Refresh and review the batch again.',409);
     const currentIdentity=await auth.getVerifiedUser(),currentContext=await db.context();
     if(currentIdentity?.id!==ctx.user_id||currentContext.user_id!==ctx.user_id||
        currentContext.workspace_id!==ctx.workspace_id)
      throw new ApiError('Signed identity or active workspace changed before application writes.',403);
     const assignmentTools=await import('./native-application-role-assignment.js');
     for(const op of plan.operations){
      try{
       await assignmentTools.writeNativeApplicationRoleAssignment(userRoleManager,{
        workspaceId:ctx.workspace_id,userId:op.userId,moduleId:op.resourceId,
        role:op.role,enabled:op.enabled,expectedUpdatedAt:op.expectedUpdatedAt,
        snapshot:current
       });
       writeResults.push({op,error:''});
      }catch(error){
       writeResults.push({op,error:errorMessage(error)});
       if(error?.status===401||error?.status===403)break;
      }
     }
    }finally{
     try{await loadUserRoleManagement();readbackAvailable=true;}
     catch(error){state.userRoleError=errorMessage(error);}
     state.userRoleBusy=false;
     const results=[
      ...plan.unchanged.map(item=>({userId:item.userId,moduleId:item.moduleId,
       email:snapshot.users.find(user=>user.id===item.userId)?.email||'',
       status:'Unchanged',detail:'Already at the requested application state.'})),
      ...plan.skipped.map(item=>({userId:item.userId,moduleId:item.moduleId,email:item.email,
       status:'Skipped',detail:item.reason}))
     ];
     for(const {op,error} of writeResults){
      const persisted=readbackAvailable&&assignmentTools.nativeApplicationRoleAssignmentPersisted(
       state.userRoleData,{userId:op.userId,moduleId:op.resourceId,
        role:op.role,enabled:op.enabled});
      results.push({userId:op.userId,moduleId:op.resourceId,
       email:state.userRoleData?.users.find(user=>user.id===op.userId)?.email||
        snapshot.users.find(user=>user.id===op.userId)?.email||'',
       status:persisted?'Saved & verified':readbackAvailable&&error?'Failed':'Unverified',
       detail:persisted?'Persisted application role confirmed by refreshed readback.':
        !readbackAvailable?'Readback unavailable; the write outcome could not be verified.':
        error||'Write acknowledgement could not be confirmed by refreshed assignment readback.'});
     }
     const attempted=new Set(writeResults.map(result=>result.op));
     for(const op of plan.operations){
      if(!attempted.has(op))results.push({userId:op.userId,moduleId:op.resourceId,
       email:snapshot.users.find(user=>user.id===op.userId)?.email||'',
       status:'Not attempted',detail:'Processing stopped before this pair was written.'});
     }
     state.userRoleNativeBatchResults=results;
     render();
    }
    const saved=state.userRoleNativeBatchResults.filter(result=>result.status==='Saved & verified').length;
    const unchanged=state.userRoleNativeBatchResults.filter(result=>result.status==='Unchanged').length;
    const skipped=state.userRoleNativeBatchResults.filter(result=>result.status==='Skipped').length;
    const unresolved=state.userRoleNativeBatchResults.length-saved-unchanged-skipped;
    toast('Bulk application access: '+saved+' saved and verified, '+unchanged+' unchanged, '+skipped+' skipped, '+unresolved+' failed or unverified.');
   },{submitLabel:enabled?'Apply '+plan.operations.length+' assignments':'Confirm '+plan.operations.length+' revocations',
     destructive:!enabled,successMessage:''});
   break;
 }
 case 'user-role-batch-review':{
   if(!state.adminVerified||state.userRoleBusy||!state.userRoleData||
      !state.userRoleBatchMode||!(state.view==='user-role-management'||
       (state.view==='role-configuration'&&state.roleTab==='application-access')))break;
   const {planUserRoleBatch,unverifiedBatchRoleAssignments}=await import('./user-role-batch.js');
   const snapshot=state.userRoleData;
   const scope=state.view==='role-configuration'?'module':state.userRoleBatchScope;
   const choices=scope==='module'?ROLE_MODULE_OPTIONS:
     snapshot.boards.map(board=>[board.id,board.name]);
   const resourceId=choices.some(([id])=>id===state.userRoleBatchResource)?
     state.userRoleBatchResource:choices[0]?.[0];
   const roles=scope==='module'?(resourceId==='fueltrans'?(snapshot.fueltransWorkspaceAvailable===true?FUELTRANS_WORKSPACE_ROLES:[]):MODULE_ROLE_OPTIONS[resourceId]||[]):['viewer','editor'];
   const role=roles.includes(state.userRoleBatchRole)?state.userRoleBatchRole:roles[0];
   const enabled=state.userRoleBatchAction!=='revoke';
   const selectedIds=[...state.userRoleBatchSelected];
   const plan=planUserRoleBatch(snapshot,{userIds:selectedIds,
    actorUserId:state.context?.user_id,scope,resourceId,role,enabled});
   if(!plan.operations.length){toast('No changes needed: selected users already have the requested access.');break;}
   const resourceLabel=choices.find(([id])=>id===resourceId)?.[1]||resourceId;
   const targets=selectedIds.map(id=>snapshot.users.find(user=>user.id===id)?.email).filter(Boolean);
   const fields='<div class="note">Review '+plan.operations.length+' change'+
     (plan.operations.length===1?'':'s')+' for '+e(resourceLabel)+
     '. '+plan.unchanged.length+' unchanged account'+(plan.unchanged.length===1?'':'s')+
     ' will be skipped. Each change is individually authorized, audited, and can succeed independently.</div>'+
     '<div class="user-role-batch-confirm-targets"><strong>Selected accounts</strong><ul>'+
     targets.map(email=>'<li>'+e(email)+'</li>').join('')+'</ul></div>'+
     '<p class="muted">The first failure stops the remaining operations. Successful changes are not rolled back automatically.</p>';
   openModal(enabled?'Review batch role assignments':'Review batch revocations',fields,async()=>{
    // Refresh before any writes to catch changes to membership, scope, or role.
    // Do not silently rebase a stale plan: require the operator to review again.
    if(!state.adminVerified||state.userRoleBusy||state.userRoleData!==snapshot)
     throw new ApiError('Role configuration changed. Review the batch again.',409);
    const actor=await auth.getVerifiedUser(),ctx=await db.context();
    if(actor?.id!==ctx.user_id||ctx.user_id!==state.context?.user_id||
      ctx.workspace_id!==state.context?.workspace_id||
      !(await roleConfig.adminVerified()))
     throw new ApiError('Verified CRM Administrator and workspace are required.',403);
    state.userRoleBusy=true;
    let completed=0,failed=null,verifiedReadback=false;
    try{
     const current=await userRoleManager.snapshot(ctx.workspace_id,{includeFuelTrans:resourceId==='fueltrans',includeFundTracker:resourceId==='fund-released-tracker',includeScopedSix:SCOPED_SIX_MODULE_IDS.includes(resourceId),includeCharter:resourceId==='charter-navigator'});
     const refreshed=planUserRoleBatch(current,{userIds:selectedIds,
       actorUserId:ctx.user_id,scope,resourceId,role,enabled});
     if(refreshed.operations.length!==plan.operations.length||
       refreshed.unchanged.length!==plan.unchanged.length||
       refreshed.operations.some((op,i)=>op.userId!==plan.operations[i].userId||
         op.expectedUpdatedAt!==plan.operations[i].expectedUpdatedAt||
         op.role!==plan.operations[i].role))
      throw new ApiError('Assignments changed since review. Refresh and review the batch again.',409);
     for(const op of plan.operations){
      try{
       if(scope==='module'&&resourceId==='fueltrans')
        await userRoleManager.setFueltransWorkspaceRole({workspaceId:ctx.workspace_id,
         ...op});
       else if(scope==='module'&&resourceId==='charter-navigator')
        await userRoleManager.setCharterWorkspaceRole({
         workspaceId:ctx.workspace_id,userId:op.userId,role:op.role,enabled:op.enabled,
         expectedUpdatedAt:current.moduleAssignments.some(a=>
           a.userId===op.userId&&a.moduleId===resourceId&&a.scopedSource===true)?
           op.expectedUpdatedAt:null});
       else if(scope==='module'&&SCOPED_SIX_MODULE_IDS.includes(resourceId)&&
         current.scopedSixAvailable===true)
        await userRoleManager.setScopedSixRole({
         workspaceId:ctx.workspace_id,userId:op.userId,moduleId:resourceId,
         role:op.role,enabled:op.enabled,
         expectedUpdatedAt:current.moduleAssignments.some(a=>
          a.userId===op.userId&&a.moduleId===resourceId&&a.scopedSource===true)?
          op.expectedUpdatedAt:null});
       else if(scope==='module'&&resourceId==='fund-released-tracker')
        await userRoleManager.setFrtWorkspaceRole({
         workspaceId:ctx.workspace_id,...op,
         expectedUpdatedAt:current.moduleAssignments.some(a=>
           a.userId===op.userId&&a.moduleId==='fund-released-tracker'&&
           a.scopedSource===true)?op.expectedUpdatedAt:null});
       else if(scope==='module'&&resourceId==='tool-traceability')
        await userRoleManager.setToolTraceabilityWorkspaceRole({
         workspaceId:ctx.workspace_id,...op});
       else await userRoleManager.mutate({workspaceId:ctx.workspace_id,...op});
       completed++;
      }catch(err){failed=err;break;}
     }
    }finally{
     try{await loadUserRoleManagement();verifiedReadback=true;}
     catch(err){state.userRoleError=errorMessage(err);}
     state.userRoleBusy=false;render();
    }
    if(!failed&&(!verifiedReadback||
       unverifiedBatchRoleAssignments(state.userRoleData,plan.operations).length>0)){
     hideModal();
     throw new ApiError('The role writes returned success, but refreshed assignment readback could not confirm every target. Review current assignments before retrying.',409);
    }
    if(failed){
     // RPC acknowledgements are not persistence proof. Verify the successful
     // prefix independently after partial failure, never recommend blind retry.
     const unverified=verifiedReadback?
      unverifiedBatchRoleAssignments(state.userRoleData,plan.operations.slice(0,completed)).length:
      completed;
     const persisted=completed-unverified;
     hideModal();
     throw new ApiError(persisted+' of '+plan.operations.length+
      ' changes verified in authoritative readback; '+unverified+
      ' write acknowledgement(s) remain unverified. Stopped on failure: '+errorMessage(failed)+
      '. Inspect refreshed assignments before any retry.',failed.status||409);
    }
    toast('Batch complete: '+completed+' role change'+(completed===1?'':'s')+' verified in authoritative assignment readback.');
   },{submitLabel:enabled?'Apply '+plan.operations.length+' changes':'Confirm '+plan.operations.length+' revocations',
     destructive:!enabled,successMessage:''});
   break;
 }
 case 'user-role-section':{
   if(!state.adminVerified||state.view!=='user-role-management')break;
   const section=button.dataset.section;
   if(!['applications','boards','system-admins'].includes(section)||
      state.userRoleSection===section)break;
   state.userRoleSection=section;
   render();
   if(section==='system-admins'){
    state.systemAdminBusy=true;render();
    try{await loadSystemAdminManagement();}
    catch(err){
     state.systemAdminData=null;
     state.systemAdminError='Unable to verify the System Admin backend. No role assignments were changed.';
     notice(err);
    }finally{state.systemAdminBusy=false;render();}
   }
   break;
 }
 case 'user-role-refresh':{
   if(!state.adminVerified||state.userRoleBusy)return;
   state.userRoleBusy=true;render();
   try{
    await loadUserRoleManagement();
    if(state.userRoleSection==='system-admins')await loadSystemAdminManagement();
   }catch(err){state.userRoleError=errorMessage(err);notice(err);}
   finally{state.userRoleBusy=false;render();}
   break;
 }
 case 'user-role-grant-system-admin':
 case 'user-role-revoke-system-admin':{
   if(state.view!=='user-role-management'||state.adminVerified!==true||
      state.userRoleBusy||state.systemAdminBusy||!state.userRoleData)return;
   const snapshot=state.systemAdminData;
   if(snapshot?.status!=='VERIFIED_SYSTEM_ADMIN'||snapshot.canManage!==true||
      snapshot.workspaceId!==state.context?.workspace_id||
      snapshot.actorId!==state.context?.user_id)
    throw new ApiError('Signed System Admin authority is unavailable.',403);
   const targetId=button.dataset.userId;
   if(targetId!==state.userRoleSelected||targetId===state.context.user_id)
    throw new ApiError('System Admin self-assignment or stale target denied.',403);
   const target=state.userRoleData.users.find(u=>u.id===targetId);
   const role=snapshot.roles.find(r=>r.userId===targetId);
   const revoking=name==='user-role-revoke-system-admin';
   const count=snapshot.roles.filter(r=>r.active).length;
   if(!target||!role||revoking&&(!role.active||target.protected||count<=1)||
      !revoking&&role.active)
    throw new ApiError('Protected, last-admin or stale System Admin assignment.',403);
   const designation=revoking?role.designation:null;
   const fields='<div class="note">System Admin is a global designation reserved for trusted IT '+ 
     'administrators and the General Manager / CEO. Employee departments never confer '+ 
     'administrative authority. Changes are audited; self-promotion is prohibited.</div>'+
     (revoking?'':select('Explicit designation','designation',[
      ['trusted_it','Trusted IT administrator'],['general_manager','General Manager / CEO']
     ],'trusted_it'))+
     input('Reason for change (minimum 12 characters)','reason','','text',true);
   openModal(revoking?'Revoke System Admin':'Assign System Admin',fields,async fd=>{
    const requestedDesignation=revoking?designation:String(fd.get('designation')||'');
    const reason=String(fd.get('reason')||'').trim();
    if(!['trusted_it','general_manager'].includes(requestedDesignation)||
       reason.length<12||reason.length>180)
     throw new ApiError('Choose a valid designation and provide at least 12 characters of justification.',400);
    state.userRoleBusy=true;
    try{
     const identity=await auth.getVerifiedUser(),ctx=await db.context();
     if(identity?.id!==snapshot.actorId||ctx.user_id!==snapshot.actorId||
        ctx.workspace_id!==snapshot.workspaceId||
        state.context?.user_id!==ctx.user_id||
        state.context?.workspace_id!==ctx.workspace_id)
      throw new ApiError('Signed administrator identity or workspace changed.',403);
     const fresh=await (await getSystemAdminClient()).snapshot({
      workspaceId:ctx.workspace_id,actorId:ctx.user_id,users:state.userRoleData.users
     });
     const freshRole=fresh.roles?.find(r=>r.userId===targetId);
     if(fresh.status!=='VERIFIED_SYSTEM_ADMIN'||!fresh.canManage||
        freshRole?.revision!==role.revision||freshRole?.active!==role.active)
      throw new ApiError('System Admin role changed. Refresh before retrying.',409);
     state.systemAdminData=null; // do not show stale authority on ambiguous writes
     await (await getSystemAdminClient()).change({
      workspaceId:ctx.workspace_id,actorId:ctx.user_id,userId:targetId,
      action:revoking?'revoke':'grant',designation:requestedDesignation,
      reason,expectedRevision:role.revision
     });
     const verified=await (await getSystemAdminClient()).snapshot({
      workspaceId:ctx.workspace_id,actorId:ctx.user_id,users:state.userRoleData.users
     });
     const finalRole=verified.roles.find(r=>r.userId===targetId);
     if(verified.status!=='VERIFIED_SYSTEM_ADMIN'||
        finalRole?.active===revoking||finalRole?.revision!==role.revision+1)
      throw new ApiError('System Admin change could not be verified. Refresh before retrying.',409);
     state.systemAdminData=verified;
     toast(revoking?'System Admin revoked and verified.':'System Admin assigned and verified.');
    }finally{state.userRoleBusy=false;render();}
   },{submitLabel:revoking?'Confirm System Admin revocation':'Assign System Admin',
     destructive:revoking,successMessage:''});
   break;
 }
 case 'user-role-edit-crm-platform':
 case 'user-role-revert-crm-platform':{
   if(!state.adminVerified||state.userRoleBusy||!state.userRoleData)return;
   const userId=button.dataset.userId;
   const user=state.userRoleData.users.find(u=>u.id===userId&&
     !u.protected);
   if(!user||userId!==state.userRoleSelected)
     throw new ApiError('Protected or stale CRM platform role target.',403);
   const record=state.userRoleData.crmPlatformRoles?.find(r=>r.userId===userId);
   if(!record)throw new ApiError('Authoritative CRM role snapshot missing.',403);
   const reverting=name==='user-role-revert-crm-platform';
   if(reverting&&!record.assignedRole)throw new ApiError('No CRM override to revoke.',409);
   const initialRole=record.assignedRole||record.effectiveRole;
   const roleAlreadyAssigned=!reverting&&
     !crmPlatformRoleChangeNeeded(record.assignedRole,initialRole);
   const fields='<div class="note">APSYNTRA CRM platform role for '+e(user.name||user.email)+
    '. CRM tiers cap module and board permissions without changing WatchdogWorkspace identity. '+
    'Changes are audited and enforced by the central backend.</div>'+
    (reverting?'':select('CRM platform role','role',
      APSYNTRA_CRM_PLATFORM_ROLES.map(x=>[x,x[0].toUpperCase()+x.slice(1)]),
      initialRole)+
      '<p class="note" data-crm-role-change-hint aria-live="polite">'+
      (roleAlreadyAssigned?
       'This role is already assigned in the selected workspace. Choose a different role to apply a change.':
       'Applying this role creates a workspace-specific assignment.')+'</p>');
   openModal(reverting?'Revert CRM platform role':'Assign APSYNTRA CRM platform role',fields,async fd=>{
     const role=reverting?null:String(fd.get('role'));
     if(role!==null&&!APSYNTRA_CRM_PLATFORM_ROLES.includes(role))
       throw new ApiError('Invalid CRM platform role.',400);
     if(!crmPlatformRoleChangeNeeded(record.assignedRole,role)){
      await loadUserRoleManagement();
      toast('This workspace already has the selected CRM role. No changes were made.');
      render();
      return;
     }
     state.userRoleBusy=true;
     try{await applyCrmPlatformRole({userId,role,
       expectedUpdatedAt:record.updatedAt||null});}
     finally{state.userRoleBusy=false;render();}
   },{submitLabel:reverting?'Confirm CRM role revert':'Apply CRM role',
     submitDisabled:roleAlreadyAssigned,successMessage:''});
   if(!reverting){
    const dialog=modal;
    const picker=dialog?.querySelector('#modal-role');
    const submitButton=dialog?.querySelector('#modal-form button[type=submit]');
    const hint=dialog?.querySelector('[data-crm-role-change-hint]');
    picker?.addEventListener('change',()=>{
     if(modal!==dialog||!submitButton||!hint)return;
     const changed=crmPlatformRoleChangeNeeded(record.assignedRole,picker.value);
     submitButton.disabled=!changed;
     hint.textContent=changed?
      'This change will update only the selected workspace CRM role.':
      'This role is already assigned in the selected workspace. Choose a different role to apply a change.';
    });
   }
   break;
 }
 case 'user-role-edit-module':
 case 'user-role-revoke-module':
 case 'user-role-edit-board':
 case 'user-role-revoke-board':{
   if(!state.adminVerified||state.userRoleBusy||!state.userRoleData)return;
   const scope=name.includes('module')?'module':'board';
   const resourceId=button.dataset.resource,userId=button.dataset.userId;
   const user=state.userRoleData.users.find(u=>u.id===userId&&!u.protected);
   if(!user||userId!==state.userRoleSelected)throw new ApiError('Protected or stale target.',403);
   if(userId===state.context?.user_id)
    throw new ApiError('The signed-in administrator cannot assign application or board roles to their own account.',403);
   if(scope==='module'){
     const workspaceCount=user.activeWorkspaceCount;
     if(!Number.isInteger(workspaceCount)||workspaceCount<1)
       throw new ApiError('The backend has not verified this account’s active workspace scope. Refresh role assignments before changing an application role.',409);
     if(resourceId==='material-request-hub'&&
        state.userRoleData.workspaceScopedMrhAvailable!==true)
       throw new ApiError('Workspace-scoped Material Request Hub role management is not installed yet. No role was changed.',409);
     if(resourceId==='fueltrans'&&
        (state.userRoleData.fueltransWorkspaceAvailable!==true||
         state.userRoleData.moduleAssignments.some(a=>a.moduleId==='fueltrans'&&
          a.userId===userId&&a.clientManaged===true)))
       throw new ApiError('FuelTrans requires an active non-client workspace membership contract.',409);
     if(resourceId==='charter-navigator'&&state.userRoleData.charterWorkspaceAvailable!==true)
       throw new ApiError('Charter workspace role backend is not activated.',409);
     if(resourceId==='fund-released-tracker'&&
       state.userRoleData.frtWorkspaceAvailable!==true)
       throw new ApiError('Fund Tracker workspace membership is not installed yet.',409);
     if(resourceId==='tool-traceability'&&
       state.userRoleData.toolTraceabilityWorkspaceAvailable!==true)
       throw new ApiError('Tool Traceability workspace membership is not installed yet.',409);
     const scopedAllowed=['material-request-hub','toolbox-issues','tool-traceability','fund-released-tracker'].includes(resourceId)||
       (resourceId==='charter-navigator'&&state.userRoleData.charterWorkspaceAvailable===true)||
       (SCOPED_SIX_MODULE_IDS.includes(resourceId)&&state.userRoleData.scopedSixAvailable===true);
     const globalScopeBlocked=!scopedAllowed&&workspaceCount>1;
     if(globalScopeBlocked&&
         !(resourceId==='fueltrans'&&state.userRoleData.fueltransWorkspaceAvailable===true))
       throw new ApiError('This application role is shared across the user’s active workspaces. It cannot be changed from a single-workspace screen.',409);
   }
   const record=scope==='module'?
      state.userRoleData.moduleAssignments.find(r=>r.userId===userId&&r.moduleId===resourceId):
      state.userRoleData.boardAssignments.find(r=>r.userId===userId&&r.boardId===resourceId);
   if(record?.role==='owner')throw new ApiError('Board owner is protected.',403);
   const enabled=!name.includes('revoke');
   const options=scope==='module'?(resourceId==='fueltrans'&&state.userRoleData.fueltransWorkspaceAvailable===true?FUELTRANS_WORKSPACE_ROLES:MODULE_ROLE_OPTIONS[resourceId]):['viewer','editor'];
   if(!options?.length)throw new ApiError('Unsupported role resource.');
   const current=scope==='module'?defaultModuleRoleForAssignment(resourceId,record,options):
      (record?.role&&options.includes(record.role)?record.role:options[0]);
   const label=scope==='module'?ROLE_MODULE_OPTIONS.find(m=>m[0]===resourceId)?.[1]:
      state.userRoleData.boards.find(b=>b.id===resourceId)?.name;
   if(!label)throw new ApiError('Unknown board or application.');
   const fields='<div class="note">Target: '+e(user.name||user.email)+' / '+e(label)+
       '. The change is enforced immediately by the existing central backend and recorded in immutable audit history.</div>'+
      (enabled?select('Role','role',options.map(r=>[r,r]),current):'');
   openModal((enabled?'Assign / modify':'Revoke')+' role',fields,async fd=>{
      state.userRoleBusy=true;
      try{await applyUserRoleChange({userId,scope,resourceId,role:enabled?String(fd.get('role')):current,
        enabled,expectedUpdatedAt:record?.updatedAt||null});}
      finally{state.userRoleBusy=false;render();}
   },{submitLabel:enabled?'Apply role change':'Confirm revoke access',destructive:!enabled});
   break;
 }
 case 'role-tab':{
   if(!state.adminVerified)return;
   const tab=button.dataset.tab;
   if(['roles','users','matrix','application-access','workspace','audit'].includes(tab)&&tab!==state.roleTab){
    state.roleTab=tab;
    if(tab==='application-access')state.userRoleBatchScope='module';
    render();
    animateTabContent('.aps-role-configuration');
   }
   break;
 }
 case 'role-refresh':{
   if(!state.adminVerified||state.roleBusy)return;
   state.roleBusy=true;render();
   try{await loadRoleConfiguration();}catch(err){state.roleError=errorMessage(err);notice(err);}
   finally{state.roleBusy=false;render();}
   break;
 }
 case 'role-propose-create':{
   if(!state.adminVerified)return;
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
   if(!state.adminVerified)return;
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
   if(!state.adminVerified)return;
   const roles=state.roleData?.roles?.filter(r=>r.kind==='custom_draft')||[];
   if(!roles.length){toast('No custom roles are available for staging.',true);return;}
   openModal('Stage activation or deactivation',
      select('Custom role','roleKey',roles.map(r=>[r.roleKey,r.displayName]))+
      select('Proposed change','operation',[['role.activate','Activate'],['role.deactivate','Deactivate']]),
      async fd=>stageRoleProposal(String(fd.get('operation')),{roleKey:String(fd.get('roleKey'))}));break;
 }
 case 'role-propose-assign':{
   if(!state.adminVerified)return;
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
   if(!state.adminVerified)return;
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
   if(!state.adminVerified)return;
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
 case 'frt-person-edit':{
   if(state.tab!=='finance'||state.frtFinanceBusy||state.frtFinance?.status!=='PASS'||
      !auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   const request=state.frtFinance.requests.find(r=>r.requestId===requestId);
   if(!request||!['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'].includes(state.frtFinance.role))return;
   const companyCode=state.frtFinance.companyCode,role=state.frtFinance.role;
   const workspaceId=state.context?.workspace_id,boardId=state.boardId;
   const userId=auth.userId,seq=routeSerial;
   const listedRequestIds=state.frtFinance.requests.map(r=>r.requestId);
   try{
    const snapshot=await fundTracker.loadPersonAssignment({auth,api:db,requestId,workspaceId,
     companyCode,role,listedRequestIds});
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==userId||state.context?.workspace_id!==workspaceId)return;
    const options='<option value="">Unassigned</option>'+snapshot.people.map(person=>
     '<option value="'+e(person.id)+'"'+
      (person.id===snapshot.assigneeId?' selected':'')+'>'+e(person.name)+'</option>').join('');
    openModal('Assign FRT request person',
     '<p class="note">'+e(request.title)+' — select an active workspace member.</p>'+
     '<div class="field"><label for="frt-assignee">Person</label>'+
     '<select id="frt-assignee" name="assignee">'+options+'</select></div>',async fd=>{
      if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
         auth.userId!==userId||state.context?.workspace_id!==workspaceId||
         state.frtFinance?.companyCode!==companyCode)
       throw new ApiError('FRT view changed. Reopen person assignment.',409);
      const raw=String(fd.get('assignee')||'');
      await fundTracker.savePersonAssignment({auth,api:db,snapshot,
       nextAssigneeId:raw||null,listedRequestIds:
        state.frtFinance.requests.map(r=>r.requestId)});
      await loadFRTFinance(companyCode);
     },{submitLabel:'Save person',successMessage:'FRT person assignment saved and verified.'});
   }catch(error){notice(error);}
   break;
 }
 case 'frt-payee-correct':{
   if(state.tab!=='finance'||state.frtFinanceBusy||state.frtFinance?.status!=='PASS'||!auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   const row=state.frtFinance.requests.find(r=>r.requestId===requestId);
   if(!row||row.status!=='PENDING_APPROVAL'||
      !['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'].includes(state.frtFinance.role))return;
   const workspaceId=state.context?.workspace_id,companyCode=state.frtFinance.companyCode,
    role=state.frtFinance.role,boardId=state.boardId,actorId=auth.userId,seq=routeSerial;
   try{
    const snapshot=await fundTracker.loadPayeeCorrection({requestId,workspaceId,companyCode,
     role,expectedVoucher:row.voucher,listedRequestIds:state.frtFinance.requests.map(r=>r.requestId)});
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
      auth.userId!==actorId||state.context?.workspace_id!==workspaceId)return;
    openModal('Correct actual payee',
     '<p class="note">'+e(row.voucher)+' — '+e(row.title)+'</p>'+
     '<p class="note">Use the verified supplier/payee from the original business document. The voucher number and amount will not change.</p>'+
     '<div class="field"><label for="frt-payee-correction">Payee / Supplier</label>'+
     '<input id="frt-payee-correction" name="payee" maxlength="180" required value="'+e(snapshot.expectedPayee)+'" autocomplete="off"></div>',async fd=>{
      if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
        auth.userId!==actorId||state.context?.workspace_id!==workspaceId||
        state.frtFinance?.companyCode!==companyCode)
       throw new ApiError('FRT view changed. Reopen payee correction.',409);
      await fundTracker.savePayeeCorrection({snapshot,nextPayee:String(fd.get('payee')||''),
       listedRequestIds:state.frtFinance.requests.map(r=>r.requestId)});
      await loadFRTFinance(companyCode);
     },{submitLabel:'Save corrected payee',successMessage:'Payee saved and verified against the original voucher.'});
   }catch(error){notice(error);}
   break;
 }
 case 'frt-date-edit':{
   if(state.tab!=='finance'||state.frtFinanceBusy||state.frtFinance?.status!=='PASS'||
      !auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   const row=state.frtFinance.requests.find(r=>r.requestId===requestId);
   if(!row||!['FINANCE_MANAGER','FINANCE_APPROVER','GENERAL_MANAGER'].includes(state.frtFinance.role))return;
   const expectedDate=row.dateNeeded==='—'?null:row.dateNeeded,workspaceId=state.context?.workspace_id,
    companyCode=state.frtFinance.companyCode,expectedRole=state.frtFinance.role,
    boardId=state.boardId,actorId=auth.userId,seq=routeSerial;
   openModal('Change request date',
    '<p class="note">'+e(row.title)+' — '+e(row.voucher)+'</p>'+
    input('Date needed','dateNeeded',expectedDate??'','date'),async fd=>{
     if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
        auth.userId!==actorId||state.context?.workspace_id!==workspaceId||
        state.frtFinance?.companyCode!==companyCode)
      throw new ApiError('FRT view changed. Reopen this request.',409);
     await fundTracker.updateRequestDate({auth,api:db,requestId,workspaceId,companyCode,
      expectedRole,expectedDate,nextDate:String(fd.get('dateNeeded')||''),
      listedRequestIds:state.frtFinance.requests.map(r=>r.requestId)});
     await loadFRTFinance(companyCode);
    },{submitLabel:'Save date',successMessage:'FRT request date saved and refreshed.'});
   break;
 }
 case 'frt-filing-toggle':{
   if(state.tab!=='finance'||state.frtFinanceBusy||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS')return;
   const requestId=String(button?.dataset?.requestId||'');
   const row=state.frtFinance.requests.find(r=>r.requestId===requestId);
   if(!row||!['NOT_FILED','FILED'].includes(row.filingStatus))return;
   const expectedStatus=row.filingStatus,nextStatus=expectedStatus==='NOT_FILED'?'FILED':'NOT_FILED';
   const workspaceId=state.context?.workspace_id,companyCode=state.frtFinance.companyCode,
    role=state.frtFinance.role,boardId=state.boardId,actor=auth.userId,seq=routeSerial;
   openModal('Update request filing status',
    '<p class="note">'+e(row.title)+' — '+e(row.voucher)+'</p>'+
    '<p>Change filing status from <strong>'+e(expectedStatus==='FILED'?'Filed':'Not Filed')+
    '</strong> to <strong>'+e(nextStatus==='FILED'?'Filed':'Not Filed')+'?</strong></p>',
    async()=>{
     if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==actor||state.context?.workspace_id!==workspaceId||
       state.frtFinance?.companyCode!==companyCode||state.frtFinance.role!==role)
      throw new ApiError('FRT view changed. Reopen filing status.',409);
     await fundTracker.updateFiling({auth,api:db,workspaceId,companyCode,role,
      requestId,expectedStatus,nextStatus,
      listedRequestIds:state.frtFinance.requests.map(r=>r.requestId)});
     await loadFRTFinance(companyCode);
    },{submitLabel:'Save filing status',
       successMessage:'Filing status saved and verified.'});
   break;
 }
 case 'frt-ui-dialog':{
   if(state.tab!=='finance'||state.frtFinanceBusy||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS')return;
   const section=String(button?.dataset?.frtSection||'');
   if(section==='discussion'){
    const requestId=String(button?.dataset?.requestId||'');
    const request=state.frtFinance.requests.find(row=>row.requestId===requestId);
    if(request)await openFRTDiscussionDialog(requestId,request);
    break;
   }
   if(section==='activity'){await openFRTActivityDialog();break;}
   if(section==='notifications'){await openFRTNotificationsDialog();break;}
   const companyCode=state.frtFinance.companyCode;
   const company=state.frtFinance.companies.find(c=>c.code===companyCode);
   if(!company)return;
   const requestId=String(button?.dataset?.requestId||'');
   const selected=state.frtFinance.requests.find(r=>r.requestId===requestId);
   if(section==='discussion'&&!selected)return;
   let title='',body='';
   if(section==='new'){
    title='New Fund Request';
    const requestClock=new Date();
    const requestDate=[requestClock.getFullYear(),String(requestClock.getMonth()+1).padStart(2,'0'),
     String(requestClock.getDate()).padStart(2,'0')].join('-');
    body=renderFRTRequestWizard({companies:state.frtFinance.companies,
     selectedCompany:companyCode,requestDate});
   }else if(section==='activity'){
    title='Activity Log';
    body='<p class="note">Signed activity history for '+e(company.name)+'</p>'+
     '<p class="muted">The current safe FRT endpoint does not provide auditable activity records. No events are fabricated or retrieved through a broad privileged API.</p>';
   }else if(section==='archive'){
    title='Archive Storage';
    try{
     const archive=await fundTracker.loadArchive({auth,api:db,
      workspaceId:state.context?.workspace_id,companyCode,
      expectedRole:state.frtFinance.role});
     body=renderFRTArchive({...archive,
      canRestore:state.frtFinance.role==='GENERAL_MANAGER'});
    }catch(error){
     body=renderFRTArchive({companyCode,error:error?.message||'Archive history unavailable.'});
    }
   }else if(section==='discussion'){
    title='Discussion';
    body='<p class="note">'+e(selected.title)+'</p>'+
     '<p class="muted">Signed comments and attachment discussions are not exposed by the current FRT API. No historical messages or attachments are fabricated.</p>'+
     '<div class="field"><label for="frt-discussion-preview">Add Comment</label>'+
     '<textarea id="frt-discussion-preview" rows="3" disabled placeholder="Posting is unavailable until signed comments are integrated"></textarea></div>';
   }else return;
   if(section==='new'){
    const workspaceId=state.context?.workspace_id,boardId=state.boardId;
    const actor=auth.userId,role=state.frtFinance.role,seq=routeSerial;
    const draftStorage=getFRTBrowserStorage();
    const draftStore=createFRTRequestDraftStore({storage:draftStorage,workspaceId,userId:actor});
    const duplicateGuard=createFRTDuplicateGuard({storage:draftStorage,workspaceId,userId:actor});
    let duplicateConfirmed=false,draftController=null;
    openModal(title,body,async form=>{
     if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==actor||state.context?.workspace_id!==workspaceId||
       state.frtFinance?.companyCode!==companyCode||state.frtFinance.role!==role)
      throw new ApiError('FRT company or session changed. Reopen request creation.',409);
     const payload=collectFRTWizardRequest(form);
     if(!state.frtFinance.companies.some(c=>c.code===payload.companyCode))
      throw new ApiError('Choose an authorized FRT company.',403);
     if(!duplicateConfirmed&&duplicateGuard.isRecentDuplicate(payload)){
      duplicateConfirmed=true;
      const formElement=modal.querySelector('#modal-form');
      let warning=formElement?.querySelector('[data-frt-duplicate-warning]');
      if(!warning){
       warning=document.createElement('p');
       warning.className='note';
       warning.setAttribute('role','alert');
       warning.dataset.frtDuplicateWarning='true';
       formElement?.insertBefore(warning,formElement.querySelector('.modal-actions'));
      }
      if(warning)warning.textContent='Potential duplicate: the same company, payee and total were submitted in this browser within the last 10 minutes. Review the request, then submit again to continue.';
      throw new Error('Potential duplicate detected. Review the warning and submit again to continue.');
     }
     const creation=await fundTracker.createRequest({auth,api:db,workspaceId,
      companyCode:payload.companyCode,role,data:payload,
      allowPotentialDuplicate:duplicateConfirmed});
     if(creation?.status==='DUPLICATE_WARNING'){
      duplicateConfirmed=true;
      const formElement=modal.querySelector('#modal-form');
      let warning=formElement?.querySelector('[data-frt-duplicate-warning]');
      if(!warning){
       warning=document.createElement('p');
       warning.className='note';
       warning.setAttribute('role','alert');
       warning.dataset.frtDuplicateWarning='true';
       formElement?.insertBefore(warning,formElement.querySelector('.modal-actions'));
      }
      if(warning)warning.textContent='Potential duplicate: this company, payee and amount were submitted within the last 10 minutes. Review the request, then submit again to confirm the intentional duplicate.';
      throw new Error('Potential duplicate detected. Review the warning and submit again to continue.');
     }
     duplicateGuard.record(payload);
     draftController?.clear();
     await loadFRTFinance(payload.companyCode);
    },{submitLabel:'Submit Fund Request',
     successMessage:'Fund request saved with Not Filed status.'});
    const wizard=enhanceFRTRequestWizard(modal);
    draftController=mountFRTRequestDraft(modal,{store:draftStore,
     companies:state.frtFinance.companies,wizard});
    const wizardForm=modal.querySelector('#modal-form');
    const resetDuplicateConfirmation=()=>{
     duplicateConfirmed=false;
     wizardForm?.querySelector('[data-frt-duplicate-warning]')?.remove();
    };
    wizardForm?.addEventListener('input',resetDuplicateConfirmation);
    wizardForm?.addEventListener('change',resetDuplicateConfirmation);
    const recipientClient=fundTracker.recipients;
    void mountFRTRecipientUI(modal,{client:recipientClient,scope:()=>({
     workspaceId:state.context?.workspace_id,
     companyCode:modal?.querySelector('[name=companyCode]')?.value||'',
     role:state.frtFinance?.role
    })});
   }else if(section==='archive')openModal(title,body,async()=>{},
     {submitLabel:'Close'});
   else openModal(title,body,async()=>{},
     {submitLabel:'Not connected',submitDisabled:true});
   break;
 }
 case 'frt-archive-restore':{
   if(state.tab!=='finance'||state.frtFinanceBusy||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS')return;
   const requestId=String(button?.dataset?.requestId||'');
   const workspaceId=state.context?.workspace_id,companyCode=state.frtFinance.companyCode;
   const role=state.frtFinance.role,boardId=state.boardId,actor=auth.userId,seq=routeSerial;
   if(role!=='GENERAL_MANAGER'){toast('Archive recovery uses the existing General Manager action.');break;}
   let archive;
   try{archive=await fundTracker.loadArchive({auth,api:db,workspaceId,companyCode,expectedRole:role});}
   catch(error){notice(error);break;}
   const archived=archive.requests.find(row=>row.requestId===requestId);
   if(!archived){toast('This request is no longer in the active company archive.');break;}
   openModal('Restore archived request',
    '<p class="note">'+e(archived.title)+' · '+e(archived.voucher)+'</p>'+
    '<p>Restore this request to the active Fund Release Tracker? Its voucher, liquidation and audit history will be retained.</p>',
    async()=>{
     if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
        auth.userId!==actor||state.context?.workspace_id!==workspaceId||
        state.frtFinance?.companyCode!==companyCode||state.frtFinance?.role!==role)
      throw new ApiError('FRT company or signed session changed. Reopen archive recovery.',409);
     await fundTracker.restoreRequest({auth,api:db,workspaceId,companyCode,requestId,expectedRole:role});
     await loadFRTFinance(companyCode);
    },{submitLabel:'Restore request',
       successMessage:'Archived request restored and active tracker refreshed.'});
   break;
 }
 case 'frt-bank-record':{
   if(state.tab!=='finance'||state.frtFinance?.status!=='PASS'||
      state.frtFinanceDetail?.status!=='PASS'||!auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   if(requestId!==state.frtFinanceDetailId||
      !state.frtFinance.requests.some(r=>r.requestId===requestId))return;
   const ws=state.context?.workspace_id,company=state.frtFinance.companyCode;
   const boardId=state.boardId,actor=auth.userId,seq=routeSerial;
   const ids=state.frtFinance.requests.map(r=>r.requestId);
   let snapshot;
   try{snapshot=await fundTracker.loadBankExecution({auth,api:db,workspaceId:ws,requestId,allowedRequestIds:ids});}
   catch(error){notice(error);break;}
   if(!snapshot.eligible||snapshot.recorded){toast('Bank execution is not eligible or was already recorded.');break;}
   const fields='<p class="note">Record evidence of an actual bank-executed disbursement. This does not initiate a transfer or verify it with the bank. The liquidation deadline is 72 hours after the execution timestamp.</p>'+
    input('Executing bank','bankName')+input('Bank transaction reference','transactionReference')+
    '<div class="field"><label>Bank-executed date and time (with timezone)</label><input type="datetime-local" name="executedAt" required></div>';
   openModal('Record bank execution evidence',fields,async form=>{
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==actor||state.context?.workspace_id!==ws||
       state.frtFinance?.companyCode!==company)
     throw new ApiError('Financial session changed; reopen bank recording.',409);
    await fundTracker.recordBankExecution({auth,api:db,workspaceId:ws,requestId,allowedRequestIds:ids,
     snapshot,bankName:String(form.get('bankName')||''),
     transactionReference:String(form.get('transactionReference')||''),
     executedAt:String(form.get('executedAt')||'')});
    await loadFRTFinance(company);
   },{submitLabel:'Record bank execution',successMessage:'Bank evidence saved and verified by signed readback.'});
   break;
 }
 case 'frt-liquidation-open':{
   if(state.tab!=='finance'||!auth.isSignedIn||state.frtFinance?.status!=='PASS'||
      state.frtFinanceDetail?.status!=='PASS')return;
   const requestId=String(button?.dataset?.requestId||'');
   if(requestId!==state.frtFinanceDetailId||
      !state.frtFinanceDetail.detail.financeApproved||
      !state.frtFinance.requests.some(r=>r.requestId===requestId))return;
   const workspaceId=state.context?.workspace_id,companyCode=state.frtFinance.companyCode;
   const boardId=state.boardId,actor=auth.userId,seq=routeSerial;
   const allowedRequestIds=state.frtFinance.requests.map(r=>r.requestId);
   let snapshot;
   try{
    snapshot=await fundTracker.loadLiquidation({auth,api:db,workspaceId,requestId,allowedRequestIds});
   }catch(error){notice(error);break;}
   if(seq!==routeSerial||state.boardId!==boardId||auth.userId!==actor||
      state.context?.workspace_id!==workspaceId)return;
   if(!snapshot.eligible){toast('This request is not eligible for liquidation.');break;}
   const submissionKey=crypto.randomUUID();
   openModal('Submit fund liquidation',renderFRTLiquidationForm(snapshot),async()=>{
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==actor||state.context?.workspace_id!==workspaceId||
       state.frtFinance?.companyCode!==companyCode)
     throw new ApiError('FRT session or company changed. Reopen liquidation.',409);
    const fields=collectFRTLiquidationForm(modal);
    await fundTracker.submitLiquidation({auth,api:db,workspaceId,requestId,allowedRequestIds,
     snapshot,submissionKey,...fields});
    await loadFRTFinance(companyCode);
   },{submitLabel:'Submit liquidation',successMessage:'Liquidation saved and verified by signed readback.'});
   enhanceFRTLiquidationForm(modal);
   break;
 }
 case 'frt-finance-action':{
   if(state.tab!=='finance'||state.frtFinanceBusy||state.frtFinanceDetailBusy||
      state.frtFinance?.status!=='PASS'||state.frtFinanceDetail?.status!=='PASS'||
      !auth.isSignedIn)return;
   const requestId=String(button?.dataset?.requestId||'');
   const code=String(button?.dataset?.frtAction||''),spec=fundTracker.actionSpec(code);
   const existing=state.frtFinanceDetail;
   if(!spec||requestId!==state.frtFinanceDetailId||
      !state.frtFinance.requests.some(r=>r.requestId===requestId)||
      !existing.detail.workflow.some(w=>w.code===code&&w.candidate))return;
   const companyCode=state.frtFinance.companyCode,role=state.frtFinance.role;
   const workspaceId=state.context?.workspace_id,boardId=state.boardId;
   const userId=auth.userId,seq=routeSerial;
   const fields='<p class="note">'+e(spec.label)+' on '+e(existing.detail.title)+
     ' ('+e(existing.detail.voucher)+'). This changes a financial request, '+
     'and cannot be treated as a cosmetic board status.</p>'+
     (spec.payload==='reason'?input('Reason','reason'):
      spec.payload==='reference'?input('Verification reference (optional)','reference','','text',false):'');
   openModal('Confirm FRT financial action',fields,async form=>{
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==userId||state.context?.workspace_id!==workspaceId||
       state.frtFinanceDetailId!==requestId||state.frtFinanceDetail!==existing)
     throw new ApiError('Request view changed. Reopen action confirmation.',409);
    await fundTracker.executeAction({auth,api:db,requestId,workspaceId,
     companyCode,role,existingDetail:existing,action:code,
     reason:String(form.get('reason')||''),reference:String(form.get('reference')||''),
     allowedRequestIds:state.frtFinance.requests.map(r=>r.requestId)});
    await loadFRTFinance(companyCode);
   },{submitLabel:'Confirm '+spec.label,destructive:true,
     successMessage:'FRT action acknowledged by the server. Request list refreshed.'});
   break;
 }
 case 'frt-company-profile-open':{
   if(state.frtFinanceBusy||state.tab!=='finance'||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS')return;
   const companyCode=String(button?.dataset?.code||'');
   if(!state.frtFinance.companies?.some(company=>company.code===companyCode))return;
   await openFRTCompanyProfileDialog(companyCode);
   break;
 }
 case 'frt-voucher-open':{
   if(state.frtFinanceBusy||state.tab!=='finance'||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS')return;
   const requestId=String(button?.dataset?.requestId||'');
   const request=state.frtFinance.requests.find(row=>row.requestId===requestId);
   if(!request)return;
   await openFRTVoucherDialog(requestId,request);
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
 case 'frt-finance-view':{
   if(state.tab!=='finance'||!auth.isSignedIn||state.frtFinanceBusy)return;
   const next=String(button?.dataset?.view||'');
   if(!['tracker','executive','opex','manual'].includes(next))return;
   state.frtFinanceView=next;
   state.frtFinanceDetailRevision++;state.frtFinanceDetail=null;
   state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;
   if(next==='opex'&&state.frtFinance?.icStatus!=='PASS')
    await loadFRTFinance(state.frtFinance?.companyCode||null);
   else render();
   break;
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

 case 'frt-ic-retry-read':{
   if(state.tab!=='finance'||state.frtFinanceBusy||!auth.isSignedIn||
      state.frtFinanceView!=='opex')return;
   await loadFRTFinance(state.frtFinance?.companyCode||null);
   break;
 }
 case 'frt-ic-new-obligation':{
   if(state.tab!=='finance'||state.frtFinanceBusy||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS'||
      !['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER'].includes(state.frtFinance.role)||
      state.frtFinance?.icStatus!=='PASS')return;
   const companies=state.frtFinance.companies||[];
   if(companies.length<2)return;
   const workspaceId=state.context?.workspace_id,companyCode=state.frtFinance.companyCode,
    role=state.frtFinance.role,boardId=state.boardId,actor=auth.userId,seq=routeSerial,
    snapshot=state.frtFinance.icSnapshot;
   const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
   const companyOptions=companies.map(c=>'<option value="'+e(c.code)+'">'+
    e(c.code+' — '+c.name)+'</option>').join('');
   const debtorOptions=companies.map((c,index)=>'<option value="'+e(c.code)+'"'+
    (index===1?' selected':'')+'>'+e(c.code+' — '+c.name)+'</option>').join('');
   const body='<p class="note">Record an existing intercompany receivable or loan from its source document. '+
    'This creates a ledger entry only; it does not transfer funds or certify payment.</p>'+
    '<div class="field"><label for="frt-ic-kind">Entry type</label><select id="frt-ic-kind" name="kind" required>'+
    '<option value="RECEIVABLE">Intercompany receivable</option><option value="LOAN">Intercompany loan</option></select></div>'+
    '<div class="field"><label for="frt-ic-reference">Reference</label><input id="frt-ic-reference" name="reference" maxlength="80" required placeholder="Source document reference"></div>'+
    '<div class="field"><label for="frt-ic-creditor">Creditor / Lender</label><select id="frt-ic-creditor" name="creditorCode" required>'+companyOptions+'</select></div>'+
    '<div class="field"><label for="frt-ic-debtor">Debtor / Borrower</label><select id="frt-ic-debtor" name="debtorCode" required>'+debtorOptions+'</select></div>'+
    '<div class="field"><label for="frt-ic-amount">Principal amount (PHP)</label><input id="frt-ic-amount" name="amount" type="number" min="0.01" step="0.01" required></div>'+
    '<div class="field"><label for="frt-ic-issued">Issue date</label><input id="frt-ic-issued" name="issuedOn" type="date" value="'+today+'" max="'+today+'" required></div>'+
    '<div class="field"><label for="frt-ic-due">Due / maturity date</label><input id="frt-ic-due" name="dueOn" type="date"></div>'+
    '<div class="field"><label for="frt-ic-description">Description (optional)</label><textarea id="frt-ic-description" name="description" maxlength="500" rows="2"></textarea></div>'+
    '<p class="muted">Loan entries require a maturity date. Receivables may have no due date. The ledger automatically presents the same outstanding amount as a creditor receivable and debtor payable.</p>';
   openModal('New Intercompany Entry',body,async form=>{
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==actor||state.context?.workspace_id!==workspaceId||
       state.frtFinance?.companyCode!==companyCode||state.frtFinance?.role!==role||
       state.frtFinance?.icSnapshot!==snapshot)
     throw new ApiError('The finance view or signed session changed. Reopen the entry form.',409);
    const payload={kind:String(form.get('kind')||''),reference:String(form.get('reference')||''),
     creditorCode:String(form.get('creditorCode')||''),debtorCode:String(form.get('debtorCode')||''),
     amount:String(form.get('amount')||''),issuedOn:String(form.get('issuedOn')||''),
     dueOn:String(form.get('dueOn')||''),description:String(form.get('description')||'')};
    await fundTracker.createIntercompanyObligation({auth,api:db,workspaceId,payload});
    await loadFRTFinance(companyCode);
   },{submitLabel:'Save intercompany entry',
      successMessage:'Intercompany obligation saved and dashboard refreshed.'});
   break;
 }
 case 'frt-ic-settle':{
   if(state.tab!=='finance'||state.frtFinanceBusy||!auth.isSignedIn||
      state.frtFinance?.status!=='PASS'||
      !['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER'].includes(state.frtFinance.role)||
      state.frtFinance?.icStatus!=='PASS')return;
   const obligationId=String(button?.dataset?.obligationId||'');
   const snapshot=state.frtFinance.icSnapshot;
   const obligation=snapshot?.obligations?.find(row=>row.id===obligationId);
   if(!obligation||!/^\d+(?:\.\d{1,2})?$/.test(obligation.outstandingAmount)||
      Number(obligation.outstandingAmount)<=0)return;
   const workspaceId=state.context?.workspace_id,companyCode=state.frtFinance.companyCode,
    role=state.frtFinance.role,boardId=state.boardId,actor=auth.userId,seq=routeSerial;
   const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),
    String(now.getDate()).padStart(2,'0')].join('-');
   const body='<p class="note">Record a payment already made against <strong>'+e(obligation.reference)+
    '</strong> ('+e(obligation.creditorCode)+' receivable owed by '+e(obligation.debtorCode)+'). '+
    'Outstanding balance: <strong>₱'+e(obligation.outstandingAmount)+'</strong>.</p>'+
    input('Settlement amount (PHP)','amount',obligation.outstandingAmount,'number')+
    input('Settlement date','settledOn',today,'date')+
    input('Settlement reference','reference','','text')+
    '<div class="field"><label for="frt-ic-settlement-notes">Notes (optional)</label><textarea id="frt-ic-settlement-notes" name="notes" maxlength="500" rows="2"></textarea></div>'+
    '<p class="muted">The server verifies the remaining balance and prevents over-settlement. This records settlement evidence; it does not initiate a bank transfer.</p>';
   openModal('Record Intercompany Settlement',body,async form=>{
    if(seq!==routeSerial||state.boardId!==boardId||state.tab!=='finance'||
       auth.userId!==actor||state.context?.workspace_id!==workspaceId||
       state.frtFinance?.companyCode!==companyCode||state.frtFinance?.role!==role||
       state.frtFinance?.icSnapshot!==snapshot||
       !state.frtFinance.icSnapshot.obligations.some(row=>row.id===obligationId))
     throw new ApiError('The finance view or signed session changed. Reopen settlement entry.',409);
    const payload={amount:String(form.get('amount')||''),settledOn:String(form.get('settledOn')||''),
     reference:String(form.get('reference')||''),notes:String(form.get('notes')||'')};
    await fundTracker.recordIntercompanySettlement({auth,api:db,workspaceId,obligationId,payload});
    await loadFRTFinance(companyCode);
   },{submitLabel:'Record settlement',
      successMessage:'Intercompany settlement saved and both matrix sides refreshed.'});
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
         const {runTwelveBoardQa}=await import('./board/acceptance/operational-qa.js');
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
   },{submitLabel:'Create board',successMessage:'Board created.'});break;
 }
 case 'active-boards':{trashBoardSelection.clear();state.showArchived=false;state.showTrash=false;render();break;}
 case 'archived-boards':{trashBoardSelection.clear();state.showArchived=true;state.showTrash=false;try{state.archived=await db.boards('archived');}catch(err){notice(err);}render();break;}
 case 'trashed-boards':{if(!BOARD_CARD_LIFECYCLE_ENABLED)return;trashBoardSelection.clear();state.showTrash=true;state.showArchived=false;try{state.trashed=await db.boards('trashed');}catch(err){notice(err);}render();break;}
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
   },{disableOnConflict:true,recoveryAction:refreshBoardCardListsAfterRecovery,
     recoveryLabel:'Close and refresh boards'});
  break;
 }
 case 'board-card-trash':{
  const board=await authorizeBoardCardAction(button.dataset.id);
  closeBoardCardMenus();
  openModal('Move board to Trash',
   '<div class="note security-note" role="note">'+
   '<p><strong>Move '+e(board.name)+' to Trash?</strong></p>'+
   '<p>This board will disappear from Active and Archived. '+
   'Its '+(Number(board.item_count)||0)+' active items, columns, groups, files, members and audit history remain stored.</p>'+
   '<p>You can restore this board from Trash or permanently delete it there if eligible. Permanent deletion cannot be undone.</p></div>',
   async()=>{
    state.boardLifecycleBusy=true;
    try{
     // An explicit click replaces manual retyping. The existing server still
     // verifies the exact board name, signed manage access, and board revision.
     await boardCardLifecycle.trash(board,board.name);
     await refreshBoardCardLists();render();
    }finally{state.boardLifecycleBusy=false;}
   },{submitLabel:'Move to Trash',destructive:true,disableOnConflict:true,
     recoveryAction:refreshBoardCardListsAfterRecovery,
     recoveryLabel:'Close and refresh boards',
     successMessage:'Board moved to Trash. Restore it from Trash when needed.'});
  break;
 }
 case 'board-card-permanent-delete':{
  if(!state.showTrash)return;
  const board=await authorizeBoardCardAction(button.dataset.id);
  if(!eligibleTrashBoard(board))throw new ApiError('Only trashed boards can be permanently deleted.',403);
  closeBoardCardMenus();
  openModal('Permanently delete board',
   '<div class="note security-note" role="note"><p><strong>'+e(board.name)+'</strong></p>'+
   '<p>All board records and related history will be permanently removed. This cannot be undone.</p>'+
   '<p>Boards with attached files or retained module/audit records cannot be deleted until their owning workflows resolve them.</p></div>'+
   input('Type DELETE to confirm','confirmDelete','','text'),
   async fd=>{
    if(String(fd.get('confirmDelete')||'').trim()!=='DELETE')
     throw new ApiError('Type DELETE exactly to confirm permanent deletion.',400);
    if(!state.showTrash)throw new ApiError('Trash view changed. Reopen the action.',409);
    state.boardLifecycleBusy=true;
    try{
     await trashPermanentDelete.delete(board);
     trashBoardSelection.delete(board.id);
     await refreshBoardCardLists();render();
     toast('Board permanently deleted.');
    }catch(err){
     try{await refreshBoardCardLists();render();}catch{/* Preserve the original error. */}
     throw err;
    }finally{state.boardLifecycleBusy=false;}
   },{submitLabel:'Delete permanently',destructive:true,disableOnConflict:true,
     recoveryAction:refreshBoardCardListsAfterRecovery,
     partialRecoveryLabel:'Close and refresh Trash',
     recoveryLabel:'Close and refresh Trash',successMessage:''});
  break;
 }
 case 'trash-board-select-visible':{
  if(!state.showTrash||state.boardLifecycleBusy)return;
  const visible=state.trashed.filter(board=>eligibleTrashBoard(board)&&
   boardCardActionState(board)==='MANAGE'&&matchBoardSearch(board,state.boardSearch));
  if(visible.length>50||trashBoardSelection.size+visible.filter(board=>!trashBoardSelection.has(board.id)).length>50)
   throw new ApiError('Select up to 50 boards per batch. Narrow your search first.',400);
  for(const board of visible)trashBoardSelection.add(board.id);
  render();break;
 }
 case 'trash-board-clear-selection':{
  if(!state.showTrash||state.boardLifecycleBusy)return;
  trashBoardSelection.clear();render();break;
 }
 case 'trash-board-bulk-permanent-delete':{
  if(!state.showTrash||state.boardLifecycleBusy)return;
  const selected=state.trashed.filter(board=>trashBoardSelection.has(board.id));
  if(!selected.length||selected.length!==trashBoardSelection.size||selected.length>50||
     !selected.every(board=>eligibleTrashBoard(board)&&boardCardActionState(board)==='MANAGE'))
   throw new ApiError('Selection changed. Refresh Trash and select the boards again.',409);
  const snapshot=selected.map(board=>({...board}));
  openModal('Permanently delete '+snapshot.length+' boards',
   '<div class="note security-note" role="note"><p><strong>This permanently deletes '+snapshot.length+
   ' selected boards and their records.</strong></p><p>There is no undo. Individual deletions may succeed before a later board fails; remaining boards will not be retried automatically.</p>'+
   '<p>Boards with attached files or retained module/audit records cannot be deleted until their owning workflows resolve them.</p>'+
   '<ul class="trash-delete-board-list">'+snapshot.map(board=>'<li>'+e(board.name)+'</li>').join('')+'</ul></div>'+
   '<div class="field"><label for="modal-confirm-bulk-delete">Type DELETE '+snapshot.length+' BOARDS to confirm</label>'+
   '<input id="modal-confirm-bulk-delete" name="confirmDelete" required autocomplete="off"/></div>',
   async fd=>{
    if(String(fd.get('confirmDelete')||'').trim()!=='DELETE '+snapshot.length+' BOARDS')
     throw new ApiError('Enter the exact confirmation phrase.',400);
    if(!state.showTrash||snapshot.some(board=>!trashBoardSelection.has(board.id)))
     throw new ApiError('Trash selection changed. Review it again.',409);
    state.boardLifecycleBusy=true;
    try{
     const result=await trashPermanentDelete.deleteMany(snapshot,{
      onDeleted:id=>trashBoardSelection.delete(id)});
     await refreshBoardCardLists();render();
     toast(result.deletedIds.length+' boards permanently deleted.');
    }catch(err){
     // The server is authoritative after partial success or transport errors.
     try{await refreshBoardCardLists();render();}catch{/* Preserve the original failure. */}
     throw err;
    }finally{state.boardLifecycleBusy=false;}
   },{submitLabel:'Delete '+snapshot.length+' permanently',destructive:true,
     disableOnConflict:true,recoveryAction:refreshBoardCardListsAfterRecovery,
     partialRecoveryLabel:'Close and refresh Trash',
     recoveryLabel:'Close and refresh Trash',successMessage:''});
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
 const visible=visibleGroupSelectionIds(button.dataset.id);
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
 if(!activeBoardLayout()||!isManagedTimeTrackerBoard(state.board?.board)||
    state.board?.pagination?.loaded!==true||state.board?.pagination?.has_more===true)return;
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
 if(!MANAGED_TT_GROUP_DELETE_ENABLED||!state.boardManage||!activeBoardLayout()||
    state.board?.pagination?.loaded!==true||state.board?.pagination?.has_more===true)return;
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
 if(!activeBoardLayout()||!state.boardManage)return;
 const boardId=state.boardId,board=state.board?.board;
 if(!board||isProtectedBoard(board)||moduleByBoardName(board.name))return;
 const group=state.board.groups?.find(g=>g.id===button.dataset.id);
 if(!group)return;
 // One authoritative signed board read verifies the group and all records,
 // including archived records omitted by the displayed row count.
 const snapshot={boardId,userId:auth.userId,workspaceId:state.context.workspace_id};
 const fresh=await db.board(boardId);
 if(!boardHistoryAuthorized(snapshot)||fresh.board?.id!==boardId||
    fresh.board.workspace_id!==snapshot.workspaceId||
    isProtectedBoard(fresh.board)||moduleByBoardName(fresh.board.name))return;
 const candidate=fresh.groups?.find(g=>g.id===group.id);
 if(!candidate||candidate.updated_at!==group.updated_at)
  throw new ApiError('Group has changed. Refresh the board before deleting.',409);
 if(fresh.groups.length<=1)
  throw new ApiError('The last group cannot be deleted. Add another group first.',400);
 if(fresh.items?.some(item=>item.group_id===candidate.id))
  throw new ApiError('Group contains records, including archived records. Move or remove them before deleting the group.',409);
 if(!confirm('Permanently delete the empty group "'+candidate.title+'"? This cannot be undone.'))return;
 if(!boardHistoryAuthorized(snapshot))return;
 // The server revalidates signed manage access, workspace, emptiness and revision
 // while holding the board lock. Never call the legacy cascading delete RPC.
 await db.deleteEmptyGroupCas(boardId,candidate);
 if(!boardHistoryAuthorized(snapshot))return;
 const persisted=await db.board(boardId);
 if(!boardHistoryAuthorized(snapshot))return;
 if(persisted.board?.workspace_id!==snapshot.workspaceId||
    persisted.groups?.some(g=>g.id===candidate.id))
  throw new ApiError('Delete result could not be verified. Refresh before retrying.',409);
 await loadBoard(boardId,'items');
 if(boardHistoryAuthorized(snapshot))toast('Group deleted and verified.');
 break;
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
  let footer=root.querySelector('[data-inline-add-row] input');
  if(!footer){
   const first=(state.board?.groups||[])[0];
   if(first){
    // Reveal the creation context temporarily; saved collapse preferences stay intact.
    boardGroupTransientExpanded.add(boardGroupCollapseKey(first.id));render();
    footer=root.querySelector('[data-inline-add-row] input');
   }
  }
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
     const {runBoardTtSignedReadOnly}=await import('./board/acceptance/tt-signed-acceptance.js');
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
  (manageable?make('board-column-manage',key==='record'?'Rename primary column inline…':
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
function boardColumnWidthLimits(key){
 if(key==='record')return {min:200,max:600,default:300};
 if(key==='status')return {min:100,max:260,default:132};
 if(key==='owner')return {min:100,max:280,default:140};
 if(key==='due')return {min:108,max:240,default:136};
 if(key==='actions')return {min:84,max:200,default:100};
 const field=key?.startsWith('col:')?(state.board?.columns||[])
  .find(col=>col.id===key.slice(4)):null;
 const name=String(field?.name||'').trim().toLowerCase();
 if(/^(work request id|record id|item id|reference id)$/.test(name))
  return {min:84,max:200,default:116};
 return ({
  number:{min:88,max:280,default:120},rating:{min:88,max:220,default:120},
  people:{min:100,max:280,default:140},date:{min:108,max:240,default:136},
  status:{min:100,max:260,default:132},timeline:{min:128,max:400,default:180},
  url:{min:110,max:360,default:160},text:{min:100,max:520,default:160},
  long_text:{min:100,max:520,default:185}
 })[field?.data_type]||{min:100,max:520,default:160};
}
function boundBoardColumnWidth(key,value){
 const {min,max}=boardColumnWidthLimits(key);
 return Math.min(max,Math.max(min,Math.round(Number(value)||min)));
}
const boardResizeFrames=createFrameCoalescer({
 requestFrame:callback=>requestAnimationFrame(callback),
 cancelFrame:handle=>cancelAnimationFrame(handle),
 apply:width=>{
  if(!boardResize)return;
  const current=boardResize,fit=boundBoardColumnWidth(current.key,width);
  for(const target of current.targets){
   if(!target.col.isConnected||!target.table.isConnected)continue;
   target.col.setAttribute('width',String(fit));
   target.table.setAttribute('width',String(target.tableWidth+fit-target.start));
  }
  current.current=fit;
 }
});
function cancelBoardResize(){
 boardResizeFrames.cancel();
 if(boardResize){
  for(const target of boardResize.targets){
   target.col.setAttribute('width',String(target.start));
   target.table.setAttribute('width',String(target.tableWidth));
  }
  boardResize.guide?.remove();
 }
 boardResize=null;
}
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
 // Interactive header controls must never start a column drag.
 if(event.target.closest('.board-column-more,.board-column-resize,input,textarea,select,[contenteditable]')){
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
  const key=resize.dataset.columnKey;
  const start=Number(col.getAttribute('width'))||th.getBoundingClientRect().width;
  const targets=[...root.querySelectorAll('table.board-table-custom,table.board-collapsed-rollup-table')]
   .map(table=>{
    const col=[...table.querySelectorAll('col[data-column-key]')].find(c=>c.dataset.columnKey===key);
    return col?{col,table,start:Number(col.getAttribute('width'))||start,
     tableWidth:Number(table.getAttribute('width'))||table.getBoundingClientRect().width}:null;
   }).filter(Boolean);
  const guide=document.createElementNS('http://www.w3.org/2000/svg','svg');
  guide.classList.add('board-column-resize-guide');
  guide.setAttribute('aria-hidden','true');
  guide.setAttribute('viewBox','0 0 '+window.innerWidth+' '+window.innerHeight);
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  line.setAttribute('x1',String(event.clientX));line.setAttribute('x2',String(event.clientX));
  line.setAttribute('y1','0');line.setAttribute('y2',String(window.innerHeight));
  guide.append(line);root.append(guide);
  boardResize={pointerId:event.pointerId,x:event.clientX,key,start,current:start,targets,guide};
  event.preventDefault();return;
 }
 // Native drag is for mouse/trackpad; pointer reorder supports touch and pen.
 if(event.pointerType==='mouse')return;
 if(event.target.closest('button,input,textarea,select,[contenteditable]'))return;
 const tab=event.target.closest('[data-board-tab][draggable="true"]');
 const th=event.target.closest('th[data-column-key][draggable="true"]');
 if(!tab&&!th)return;
 const kind=tab?'tab':'column',element=tab||th;
 const key=element.dataset[kind==='tab'?'boardTab':'columnKey'];
 if(kind==='tab'&&isManagedTimeTrackerBoard(state.board?.board)&&
    (!state.boardManage||state.boardUi?.status!=='VERIFIED_READ'||state.tabMoveBusy))return;
 if(kind==='column'&&(BOARD_REQUIRED_COLUMNS.includes(key)||
    (isItemOnlyBoard(state.board,state.boardUi)&&!state.boardManage)))return;
 boardTouch={kind,key,x:event.clientX,y:event.clientY,pointerId:event.pointerId};
});
window.addEventListener('pointermove',event=>{
 if(boardResize&&event.pointerId===boardResize.pointerId){
  const line=boardResize.guide.querySelector('line');
   line?.setAttribute('x1',String(event.clientX));line?.setAttribute('x2',String(event.clientX));
   boardResizeFrames.schedule(boundBoardColumnWidth(boardResize.key,boardResize.start+event.clientX-boardResize.x));
  return;
 }
});
window.addEventListener('pointerup',event=>{
 if(boardResize&&event.pointerId===boardResize.pointerId){
  const current=boardResize;
  boardResizeFrames.flush();
  const width=boundBoardColumnWidth(current.key,current.current);
  persistBoardLayout(p=>({...p,widths:{...p.widths,[current.key]:width}}));
  current.guide?.remove();
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
window.addEventListener('pointercancel',()=>{cancelBoardResize();boardTouch=null;});

/** All group tables, collapsed rollups and the viewport sticky rail share one X offset. */
let boardGroupScrollSyncing=false;
root.addEventListener('scroll',event=>{
 const source=event.target;
 const selector='.board-group-scroll,.board-collapsed-rollup-scroll,[data-board-horizontal-rail]';
 if(boardGroupScrollSyncing||!source?.matches?.(selector))return;
 if(!source.closest('.aps-board-shell'))return;
 boardGroupScrollSyncing=true;
 try{
  for(const other of root.querySelectorAll(selector))
   if(other!==source&&other.scrollLeft!==source.scrollLeft)other.scrollLeft=source.scrollLeft;
 }finally{boardGroupScrollSyncing=false;}
},true);
/** Double-click the right-edge handle to fit currently loaded, authorized text. */
root.addEventListener('dblclick',event=>{
 const resize=event.target.closest?.('.board-column-resize[data-column-key]');
 if(!resize||!activeBoardLayout())return;
 const key=resize.dataset.columnKey,table=resize.closest('table.board-table-custom');
 const header=resize.closest('th[data-column-key]');
 if(!table||!header)return;
 event.preventDefault();
 const position=[...header.parentElement.children].indexOf(header);
 if(position<0)return;
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 if(!ctx)return;
 ctx.font=getComputedStyle(header).font||'13px sans-serif';
 let max=ctx.measureText(header.querySelector('.board-heading-label')?.textContent||'').width+48;
 for(const table of root.querySelectorAll('table.board-table-custom')){
  for(const row of [...table.tBodies[0]?.rows||[]].slice(0,150)){
   const cell=row.cells[position];
   if(!cell||row.classList.contains('board-virtual-spacer'))continue;
   const text=String(cell.textContent||'').trim().slice(0,150);
   max=Math.max(max,ctx.measureText(text).width+32);
  }
 }
 const width=boundBoardColumnWidth(key,Math.ceil(max));
 persistBoardLayout(pref=>({...pref,widths:{...pref.widths,[key]:width}}));
 render();
});

document.addEventListener('pointerdown',event=>{
 if(boardColumnMenuNode?.isConnected&&
    !boardColumnMenuNode.contains(event.target)&&
    !event.target.closest('.board-column-more'))
  closeBoardColumnContext();
},true);
// No reorder arrows or grip icons: the focused tab/header remains keyboard movable.
root.addEventListener('keydown',event=>{
 if(!event.altKey||!event.shiftKey||event.ctrlKey||event.metaKey||
    !['ArrowLeft','ArrowRight'].includes(event.key)||!activeBoardLayout())return;
 const tab=event.target.closest('[data-board-tab][draggable="true"]');
 const th=event.target.matches('th[data-column-key][draggable="true"]')?event.target:null;
 if(!tab&&!th)return;
 const kind=tab?'tab':'column',key=(tab||th).dataset[kind==='tab'?'boardTab':'columnKey'];
 const layout=activeBoardLayout();
 if(kind==='tab'&&isManagedTimeTrackerBoard(state.board?.board)&&
   (!state.boardManage||state.boardUi?.status!=='VERIFIED_READ'||state.tabMoveBusy))return;
 if(kind==='column'&&(BOARD_REQUIRED_COLUMNS.includes(key)||
   (isItemOnlyBoard(state.board,state.boardUi)&&!state.boardManage)))return;
 const keys=kind==='column'?
   layout.pref.columns.filter(k=>!BOARD_REQUIRED_COLUMNS.includes(k)):
   isManagedTimeTrackerBoard(state.board?.board)?
     [...(state.boardUi?.tabs||[]).filter(t=>t.visible).map(t=>t.key),
      ...['items','issues','attendance'].filter(k=>!(state.boardUi?.tabs||[]).some(t=>t.key===k))]:
     layout.tabs;
 const index=keys.indexOf(key),to=keys[index+(event.key==='ArrowLeft'?-1:1)];
 if(index<0||!to)return;
 event.preventDefault();
 void moveBoardPresentation(kind,key,to).then(moved=>{
  if(!moved)return;
  const selector=kind==='tab'?'[data-board-tab="'+key+'"]':
    'th[data-column-key="'+key+'"][draggable="true"]';
  root.querySelector(selector)?.focus();
 }).catch(notice);
});
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
root.addEventListener('keydown',event=>{
 if(event.key===' '&&event.target.closest?.('[data-action="tt-sidebar-disclosure"]')){
  event.preventDefault();event.target.closest('[data-action="tt-sidebar-disclosure"]').click();return;
 }
 const overtimeDialog=root.querySelector('.tt-ot-modal');
 if(overtimeDialog){
  if(event.key==='Escape'){
   event.preventDefault();
   if(state.ttBusy)return;
   state.ttOtModalOpen=false;state.ttOtDraft={};render();
   root.querySelector('[data-action="tt-ot-open"]')?.focus();
   return;
  }
  if(event.key==='Tab'){
   const focusable=[...overtimeDialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
    .filter(node=>!node.hidden);
   if(!focusable.length){event.preventDefault();overtimeDialog.focus();return;}
   const first=focusable[0],last=focusable[focusable.length-1];
   if(!overtimeDialog.contains(event.target)){event.preventDefault();first.focus();}
   else if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}
   return;
  }
 }
 const dialog=root.querySelector('[data-tt-admin-dialog]')||
  root.querySelector('[data-tt-log-detail-dialog]');
 if(!dialog)return;
 if(event.key==='Escape'){
  event.preventDefault();
  if(dialog.matches('[data-tt-log-detail-dialog]')){
   dialog.querySelector('[data-action="tt-log-detail-close"]')?.click();return;
  }
  if(state.ttLogAdminBusy)return;
  if(state.ttLogAdminDeleteConfirm)cancelTimeTrackerAdminDeletion();
  else dialog.querySelector('[data-action="tt-log-admin-cancel"]')?.click();
  return;
 }
 if(event.key!=='Tab')return;
 const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')]
  .filter(node=>!node.hidden);
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1];
 if(!dialog.contains(event.target)){event.preventDefault();first.focus();}
 else if(event.shiftKey&&event.target===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&event.target===last){event.preventDefault();first.focus();}
});

root.addEventListener('click',event=>{
 if(boardSuppressedClick&&event.target.closest('[data-board-tab]')){
  event.preventDefault();boardSuppressedClick=false;
 }
},true);

document.addEventListener('focusout',()=>{
 if(pendingBoardContent)setTimeout(()=>flushVisibleBoardContent(),0);
},true);
document.addEventListener('click',()=>{
 if(pendingBoardContent)setTimeout(()=>flushVisibleBoardContent(),0);
});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&pendingBoardContent)
  setTimeout(()=>flushVisibleBoardContent(),0);
});
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
// Load Board-only menu behavior on demand, not in the anonymous startup graph.
let boardToolbarPopoverPromise=null;
function ensureBoardToolbarPopoverBehavior(){
 if(boardToolbarPopoverPromise)return boardToolbarPopoverPromise;
 boardToolbarPopoverPromise=import('./board/presentation/toolbar-popovers.js')
  .then(({installBoardToolbarPopoverBehavior})=>
   installBoardToolbarPopoverBehavior(root,document))
  .catch(error=>{
   boardToolbarPopoverPromise=null;
   console.error('Board toolbar popovers unavailable:',error);
  });
 return boardToolbarPopoverPromise;
}
root.addEventListener('keydown',event=>{
 const trigger=event.target.closest?.('.board-group-summary-trigger[role="button"]');
 if(trigger&&['Enter',' '].includes(event.key)){
  event.preventDefault();trigger.click();
 }
});
root.addEventListener('submit',event=>{if(teamsController?.handleSubmit(event))return;},true);
resetOrderIntakeDrag=bindWorkflowDrag(root,{
 enabled:()=>state.view==='order-intake'&&orderIntakeRoute?.section==='workflow'&&!orderIntakeLifecycleBusy,
 findRow:id=>orderIntakeRead.read(orderIntakeScope())?.rows.find(row=>row.id===id),
 onDrop:(id,target)=>openOrderIntakeLifecycle('status',id,target)
});
root.addEventListener('click',event=>{
 const orderAction=event.target.closest('[data-oi-action]');
 if(orderAction&&state.view==='order-intake'&&orderIntakeRoute){
  event.preventDefault();
  const scope=orderIntakeScope();
  if(['select-page','select-all','clear-selection','prev-page','next-page','export','bulk-status','bulk-details','bulk-archive','bulk-restore'].includes(orderAction.dataset.oiAction)){handleOrderIntakeTableAction(orderAction.dataset.oiAction);return;}
  if(orderIntakeTable.busy)return;
  if(orderAction.dataset.oiAction==='create')openOrderIntakeEditor();
  else if(orderAction.dataset.oiAction==='edit')openOrderIntakeEditor(true);
  else if(orderAction.dataset.oiAction==='confirmation')openOrderIntakeConfirmation();
  else if(orderAction.dataset.oiAction==='recipient')void openOrderIntakeRecipient(orderAction.dataset.oiId);
  else if(orderAction.dataset.oiAction==='inbox')void openOrderIntakeInbox();
  else if(['status','archive','restore'].includes(orderAction.dataset.oiAction))openOrderIntakeLifecycle(orderAction.dataset.oiAction,orderAction.dataset.oiId);
  else if(orderAction.dataset.oiAction==='refresh'){
   orderIntakeTable.selected.clear();
   void currentOrderIntakeRead().refresh(scope,completeOrderIntakeView());
   void loadOrderIntakeRecord(orderIntakeRoute,scope);
  }else if(orderAction.dataset.oiAction==='more')void currentOrderIntakeRead().more(scope);
  return;
 }
 const activeRefueling=root.querySelector('.ft3-refuel-dialog');
 if(activeRefueling&&!activeRefueling.contains(event.target)){
  event.preventDefault();event.stopPropagation();return;
 }
 const checkbox=event.target.closest('[data-board-select-item]');
 if(checkbox)checkbox.dataset.shiftSelect=event.shiftKey?'true':'false';
 if(event.target.matches?.('[data-tt-ot-backdrop]')){
  event.preventDefault();
  if(!state.ttBusy&&state.ttOtModalOpen){
   state.ttOtModalOpen=false;state.ttOtDraft={};render();
   root.querySelector('[data-action="tt-ot-open"]')?.focus();
  }
  return;
 }
 if(event.target.matches?.('[data-tt-log-detail-backdrop]')){
  event.preventDefault();Promise.resolve(action('tt-log-detail-close',event.target)).catch(notice);
  return;
 }
 const target=event.target.closest('[data-action]');
 if(!target)return;
 if(target.dataset.action==='tt-log-open-detail'){
  target.dataset.multiSelect=event.ctrlKey||event.metaKey||event.shiftKey?'true':'false';
  target.dataset.shiftSelect=event.shiftKey?'true':'false';
 }
 event.preventDefault();
 Promise.resolve(action(target.dataset.action,target)).catch(notice);
});
/** Preserve unsaved Draft fields only in current signed UI memory across redraws.
 * No browser storage, network requests or persistent document semantics.
 */

function updateTradeLinkDocumentSelection(panel){
 if(!panel||!tradeLinkAuthorizedListRoute()||!state.boardManage||
    state.tradeLinkDraft?.status!=='AUTHORIZED_READ')return;
 const selected=new Set();
 const rows=[...panel.querySelectorAll('[data-tradelink-domain-record]')];
 for(const row of rows){
  const checkbox=row.querySelector('[data-tl-select-document]');
  const id=checkbox?.dataset.documentId||'';
  if(!id)continue;
  if(!row.hidden&&checkbox.checked)selected.add(id);
  else checkbox.checked=false;
 }
 const currentRows=state.tradeLinkDraft.rows.filter(row=>selected.has(row.documentId));
 state.tradeLinkDraft={...state.tradeLinkDraft,
  selectedDocumentIds:currentRows.map(row=>row.documentId)};
 const selectedCount=currentRows.length;
 const selectedHidden=currentRows.filter(row=>row.hidden===true).length;
 const heading=panel.querySelector('[data-tl-selected-count]');
 if(heading)heading.textContent=selectedCount+' selected';
 const setDisabled=(action,disabled)=>{
  const button=panel.querySelector('[data-action="'+action+'"]');
  if(button)button.disabled=disabled||state.tradeLinkDraft.busy===true;
 };
 setDisabled('tradelink-documents-export-selection',selectedCount===0);
 setDisabled('tradelink-documents-delete-selection',selectedCount===0);
 setDisabled('tradelink-documents-hide-selection',selectedCount===0||selectedHidden>0);
 setDisabled('tradelink-documents-unhide-selection',selectedCount===0||selectedHidden!==selectedCount);
 setDisabled('tradelink-documents-clear-selection',selectedCount===0);
 const selectAll=panel.querySelector('[data-tl-select-all]');
 const visibleInputs=rows.filter(row=>!row.hidden)
  .map(row=>row.querySelector('[data-tl-select-document]')).filter(Boolean);
 const visibleSelected=visibleInputs.filter(input=>input.checked).length;
 if(selectAll){
  selectAll.checked=visibleInputs.length>0&&visibleSelected===visibleInputs.length;
  selectAll.indeterminate=visibleSelected>0&&visibleSelected<visibleInputs.length;
 }
}
function exportTradeLinkDocumentSelection(panel){
 if(!panel||!tradeLinkAuthorizedListRoute()||state.tradeLinkSection!=='documents'||
    !state.boardManage||state.tradeLinkDraft?.status!=='AUTHORIZED_READ')return false;
 const selected=new Set(state.tradeLinkDraft.selectedDocumentIds||[]);
 const rows=[...panel.querySelectorAll('[data-tradelink-domain-record]')]
  .filter(row=>!row.hidden&&selected.has(row.dataset.documentId)&&
   row.querySelector('[data-tl-select-document]')?.checked);
 if(!rows.length)return false;
 const records=rows.map(row=>({documentNumber:row.dataset.documentNumber,
  clientName:row.dataset.clientName||null,documentType:row.dataset.documentType,
  workflowState:row.dataset.workflowState,revision:Number(row.dataset.revision),
  createdAt:row.dataset.createdAt,updatedAt:row.dataset.updatedAt,
  archived:row.dataset.archived==='true'}));
 const csv=serializeTradeLinkDocumentCsv(records);
 const url=URL.createObjectURL(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');
 anchor.href=url;anchor.download='tradelink-selected-documents-'+
  new Date().toISOString().slice(0,10)+'.csv';
 anchor.hidden=true;document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 return true;
}
function captureTradeLinkDraftListFilters(event){
 const control=event.target?.closest?.('[data-tradelink-domain-filter]');
 const container=control?.closest?.('[data-tradelink-domain-list]');
 if(!control||!container||!tradeLinkAuthorizedListRoute()||
  !TL03_DOMAIN_READS_ENABLED||(!state.boardManage&&state.tradeLinkDraft?.sharedVisibility!==true)||
  state.tradeLinkDraft?.status!=='AUTHORIZED_READ'||state.tradeLinkDraft.busy)return false;
 const get=name=>container.querySelector('[data-tradelink-domain-filter][name="'+name+'"]')?.value;
 const filters=normalizeTradeLinkDraftListFilters({
  query:get('query'),documentType:get('documentType'),
  workflowState:get('workflowState'),archiveMode:get('archiveMode'),
  visibilityMode:get('visibilityMode'),sortBy:get('sortBy'),
  sortDirection:get('sortDirection')
 });
 state.tradeLinkDraft.listFilters=filters;
 if(!state.tradeLinkDraft.listPage?.server)
  updateTradeLinkDraftListUI(container,filters);
 updateTradeLinkDocumentSelection(container);
 return true;
}
// Staged locally until restoration and interrupted-save reconciliation are complete.
const tradeLinkRecoveryEnabled=true;
let tradeLinkRecoveryEditor=null;
const tradeLinkRecoveryMessages={
 pending:'Inputs awaiting local preservation…',saving:'Preserving inputs on this device…',
 saved:'Inputs preserved on this device.',failed:'Local preservation failed. Your inputs are still in this editor.'
};
const tradeLinkRecovery=new TradeLinkRecoveryController({onStatus:(id,status)=>{
 if(tradeLinkRecoveryEditor?.id!==id)return;
 tradeLinkRecoveryEditor.status=status;
 paintTradeLinkRecoveryStatus();
}});
function paintTradeLinkRecoveryStatus(){
 const pending=state.tradeLinkDraft?.pendingSave;
 const form=root.querySelector('[data-tradelink-draft-form]');
 if(form&&pending&&tradeLinkDraftRoute()){
  const button=root.querySelector('[data-action="tradelink-draft-submit"]');
  for(const control of form.elements)if(control!==button)control.disabled=true;
  if(button){button.disabled=state.tradeLinkDraft.busy===true;button.textContent=pending.receipt?'Retry Verification':'Retry Original Save';}
 }

 const output=root.querySelector('[data-tradelink-recovery-status]');
 if(!output)return;
 const active=tradeLinkRecoveryEnabled&&tradeLinkDraftRoute()&&
  tradeLinkRecoveryEditor?.route===routeSerial&&
  tradeLinkRecoveryEditor?.userId===auth.userId&&
  tradeLinkRecoveryEditor?.workspaceId===state.context?.workspace_id;
 output.hidden=!active;
 output.textContent=active?tradeLinkRecoveryMessages[tradeLinkRecoveryEditor.status]||'':'';
}
let tradeLinkRecoveryChoices=[];
let tradeLinkRecoveryReadSerial=0;
function tradeLinkRecoveryScope(){
 if(!tradeLinkRecoveryEnabled||!tradeLinkDraftRoute()||!tradeLinkCanCreate()||
    state.tradeLinkDraft.mode!=='create'||state.tradeLinkDraft.editRequestId)return null;
 const documentType=root.querySelector('[data-tradelink-draft-form] [name="documentType"]')?.value;
 if(!documentType)return null;
 return {userId:auth.userId,workspaceId:state.context.workspace_id,documentType,route:routeSerial};
}
function sameTradeLinkRecoveryScope(scope){
 const current=tradeLinkRecoveryScope();
 return current&&Object.keys(scope).every(key=>scope[key]===current[key]);
}
async function refreshTradeLinkRecoveryChoices(){
 const serial=++tradeLinkRecoveryReadSerial;
 const scope=tradeLinkRecoveryScope();
 const host=root.querySelector('[data-tradelink-recovery-choices]');
 tradeLinkRecoveryChoices=[];
 if(!host||!scope)return;
 try{
  const rows=await tradeLinkRecovery.store.list(scope.userId,scope.workspaceId,scope.documentType);
  if(serial!==tradeLinkRecoveryReadSerial||!sameTradeLinkRecoveryScope(scope)||!host.isConnected)return;
  tradeLinkRecoveryChoices=rows.filter(row=>row.instanceId!==tradeLinkRecoveryEditor?.id);
  host.innerHTML=renderRecoveryChoices(tradeLinkRecoveryChoices);
 }catch{
  if(serial===tradeLinkRecoveryReadSerial&&host.isConnected&&sameTradeLinkRecoveryScope(scope))
   host.textContent='Local recovery records are unavailable.';
 }
}
async function selectTradeLinkRecovery(id,remove=false){
 const scope=tradeLinkRecoveryScope();
 if(!scope||state.tradeLinkDraft.busy)return;
 const row=tradeLinkRecoveryChoices.find(item=>item.instanceId===id);
 if(!row||row.userId!==scope.userId||row.workspaceId!==scope.workspaceId||row.documentType!==scope.documentType)return;
 try{
  if(remove){
   if(row.pendingSave)throw new Error('Resolve the original Save before discarding.');
   if(!confirm('Discard this unfinished document from this device?'))return;
   if(!await tradeLinkRecovery.store.remove(scope.userId,scope.workspaceId,scope.documentType,id,row.version))
    throw new Error('Recovery record changed. Refresh and retry.');
   await refreshTradeLinkRecoveryChoices();return;
  }
  if(state.tradeLinkDraft.unsavedChanges&&!confirm('Preserve current inputs and resume this unfinished document?'))return;
  if(tradeLinkRecoveryEditor&&!await tradeLinkRecovery.flush(tradeLinkRecoveryEditor.id))
   throw new Error('Current inputs could not be preserved.');
  if(!sameTradeLinkRecoveryScope(scope))return;
  const latest=(await tradeLinkRecovery.store.list(scope.userId,scope.workspaceId,scope.documentType)).find(item=>item.instanceId===id);
  if(!sameTradeLinkRecoveryScope(scope)||!latest||latest.version!==row.version)
   throw new Error('Recovery record changed. Refresh and retry.');
  const restoredPendingSave=latest.pendingSave?
   restoreTradeLinkPendingSave(latest.pendingSave,latest.lines):null;
  tradeLinkRecovery.resume(latest);
  tradeLinkRecoveryEditor={id,route:scope.route,userId:scope.userId,workspaceId:scope.workspaceId,documentType:scope.documentType,status:'saved'};
  state.tradeLinkDraft={...state.tradeLinkDraft,formValues:latest.fields,lineDrafts:latest.lines,
   pendingSave:restoredPendingSave?{...restoredPendingSave,uncertain:!restoredPendingSave.receipt}:null,
   pendingCreateId:restoredPendingSave?.command.documentId||null,
   pendingCreateDraft:restoredPendingSave?.command.draft||null,
   unsavedChanges:true,draftNotice:'Unfinished inputs restored from this device.',error:'',message:''};
  render();
 }catch{if(sameTradeLinkRecoveryScope(scope))toast('Unable to complete local recovery. Refresh the recovery choices and try again.',true);}
}
function checkpointTradeLinkRecovery(){
 if(tradeLinkRecoveryEnabled&&tradeLinkRecoveryEditor)
  void tradeLinkRecovery.flush(tradeLinkRecoveryEditor.id);
}
function captureTradeLinkRecovery(values,lines){
 if(!tradeLinkRecoveryEnabled||!tradeLinkCanCreate()||state.tradeLinkDraft.mode!=='create'||
    !values.documentType||!auth.isSignedIn||state.context?.user_id!==auth.userId)return;
 const userId=auth.userId,workspaceId=state.context.workspace_id,documentType=values.documentType;
 const previous=tradeLinkRecoveryEditor;
 if(!previous||previous.route!==routeSerial||previous.userId!==userId||
    previous.workspaceId!==workspaceId||previous.documentType!==documentType){
  checkpointTradeLinkRecovery();
  tradeLinkRecoveryEditor={id:crypto.randomUUID(),route:routeSerial,userId,workspaceId,documentType,status:'pending'};
 }
 tradeLinkRecovery.capture({instanceId:tradeLinkRecoveryEditor.id,userId,workspaceId,documentType},values,lines);
}
async function discardTradeLinkRecovery(){
 const previous=tradeLinkRecoveryEditor;
 if(!tradeLinkRecoveryEnabled||!previous)return true;
 try{
  if(!await tradeLinkRecovery.discard(previous.id))throw new Error('Recovery record changed.');
  if(tradeLinkRecoveryEditor===previous)tradeLinkRecoveryEditor=null;
  return true;
 }catch{toast('Local recovery record could not be discarded. Inputs retained.',true);return false;}
}
function captureTradeLinkDraftFields(event){
 const form=event.target?.closest?.('[data-tradelink-draft-form]');
 if(!form||!tradeLinkDraftRoute()||state.tradeLinkDraft.busy||state.tradeLinkDraft.pendingSave)return false;
 if(event.target?.name==='customerEmail'&&
    state.tradeLinkDraft.error?.startsWith('Invalid Quotation contact email.')){
  state.tradeLinkDraft.error='';
  event.target.removeAttribute('aria-invalid');
  event.target.removeAttribute('aria-describedby');
  root.querySelector('#tl-quotation-contact-email-error')?.remove();
 }
 // Switch only the associated custom input; never re-render the editor.
 const choice=event.target?.closest?.('[data-tl-commercial-choice]');
 if(choice&&event.target.matches('select')){
  const custom=choice.querySelector('[data-tl-commercial-custom]');
  if(custom){
   const show=event.target.value==='__custom__';
   custom.hidden=!show;
   custom.querySelector('input').required=show;
  }
 }
 const values=captureRecoveryFields(new FormData(form));
 state.tradeLinkDraft.formValues=values;
 state.tradeLinkDraft.lineDrafts=snapshotTradeLinkDraftLineItems(form);
 state.tradeLinkDraft.unsavedChanges=true;
 if(event.target?.name!=='documentType')captureTradeLinkRecovery(values,state.tradeLinkDraft.lineDrafts);
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
 const select=event.target.closest?.('[data-oi-select]');
 if(select&&state.view==='order-intake'){
  const id=select.dataset.oiSelect;
  if(orderIntakeTableReady()&&orderIntakeMatching().some(row=>row.id===id)){
   if(select.checked)orderIntakeTable.selected.add(id);else orderIntakeTable.selected.delete(id);
   render();[...root.querySelectorAll('[data-oi-select]')].find(node=>node.dataset.oiSelect===id)?.focus();
  }
  return;
 }
 const inline=event.target?.closest?.('[data-tb-inline-status]');
 if(inline){
  const scope=talkBoxState.scope;
  if(!talkBoxCurrent(scope)||!state.edit||talkBoxState.busy)return;
  const row=(talkBoxState.meetingOpen&&talkBoxState.meetingRecord?talkBoxState.meetingRows:talkBoxState.page?.items)?.find(item=>item.id===inline.dataset.tbInlineStatus);
  if(!row||row.status===inline.value)return;
  inline.disabled=true;
  (async()=>{
   const updated=await talkBoxClient().updateVerified(row.id,{status:inline.value},row.version);
   if(!talkBoxCurrent(scope))return;
   if(talkBoxState.selected?.id===updated.id)talkBoxState.selected=updated;
   await loadTalkBox({selectedId:talkBoxState.selected?.id||null});
   toast('TalkBox issue status saved.');
  })().catch(error=>{
   if(talkBoxCurrent(scope)){
    toast(errorMessage(error),true);
    // Reconcile after a rejected concurrent or interrupted update.
    void loadTalkBox();
   }
  });
  return;
 }
 if(syncTradeLinkFinanceInput(event))return;
 if(['board-person-filter','board-status-filter','board-sort-mode'].includes(event.target.id)&&
    state.view==='board'&&state.tab==='items'&&activeBoardLayout()){
  const key={'board-person-filter':'person','board-status-filter':'status','board-sort-mode':'sort'}[event.target.id];
  boardViewFilter[key]=event.target.value;
  render();return;
 }
 // TimeTracker uses row highlighting and a details popup; no checkbox selection.
 const trashCheckbox=event.target.closest?.('[data-trash-board-select]');
 if(trashCheckbox){
  if(!state.showTrash||state.boardLifecycleBusy)return;
  const id=trashCheckbox.dataset.trashBoardSelect;
  const board=state.trashed.find(board=>board.id===id);
  if(!board||!eligibleTrashBoard(board)||boardCardActionState(board)!=='MANAGE'){
   trashCheckbox.checked=false;return;
  }
  if(trashCheckbox.checked){
   if(trashBoardSelection.size>=50){trashCheckbox.checked=false;toast('Select at most 50 boards.',true);return;}
   trashBoardSelection.add(id);
  }else trashBoardSelection.delete(id);
  const count=root.querySelector('#boards-trash-selected');
  if(count)count.textContent=trashBoardSelection.size+' selected';
  for(const action of ['trash-board-clear-selection','trash-board-bulk-permanent-delete']){
   const button=root.querySelector('[data-action="'+action+'"]');
   if(button)button.disabled=!trashBoardSelection.size;
  }
  return;
 }
 if((state.view==='user-role-management'||(state.view==='role-configuration'&&state.roleTab==='application-access'))&&
   state.adminVerified&&state.userRoleBatchMode&&!state.userRoleBusy&&state.userRoleData){
  const element=event.target;
  if(element.matches('[data-user-role-batch-member]')){
   const eligible=state.userRoleData.users.some(u=>u.id===element.value&&
     !u.protected&&u.id!==state.context?.user_id);
   if(!eligible)return;
   const ids=new Set(state.userRoleBatchSelected);
   if(element.checked)ids.add(element.value);else ids.delete(element.value);
   state.userRoleBatchSelected=[...ids];
   const count=root.querySelector('.user-role-batch-count');
   const eligibleCount=state.userRoleData.users.filter(u=>
     !u.protected&&u.id!==state.context?.user_id).length;
   if(count)count.textContent=ids.size+' selected of '+eligibleCount+' available workspace members';
   const summaryCount=root.querySelector('#user-role-batch-summary-count');
   if(summaryCount)summaryCount.textContent=ids.size+' selected';
   const nativeAccess=state.view==='role-configuration'&&state.roleTab==='application-access';
   const review=root.querySelector(nativeAccess?
    '[data-action="user-role-native-batch-review"]':'[data-action="user-role-batch-review"]');
   if(review){
    const applicationCount=nativeAccess?state.userRoleBatchModulesSelected.length:0;
    review.disabled=ids.size===0||(nativeAccess&&applicationCount===0);
    review.textContent=nativeAccess?'Review '+(ids.size*applicationCount)+' member/application pairs':
     'Review batch changes ('+ids.size+')';
   }
   const clear=root.querySelector('[data-action="user-role-batch-clear"]');
   if(clear)clear.disabled=ids.size===0;
   return;
  }
  if(element.matches('[data-user-role-batch-app]')&&
     state.view==='role-configuration'&&state.roleTab==='application-access'){
   const moduleId=String(element.value||'');
   if(!ROLE_MODULE_OPTIONS.some(([id])=>id===moduleId))return;
   const selected=new Set(state.userRoleBatchModulesSelected);
   if(element.checked)selected.add(moduleId);else selected.delete(moduleId);
   state.userRoleBatchModulesSelected=[...selected];
   const count=state.userRoleBatchModulesSelected.length;
   const pairs=state.userRoleBatchSelected.length*count;
   const review=root.querySelector('[data-action="user-role-native-batch-review"]');
   if(review){review.disabled=!pairs;review.textContent='Review '+pairs+' member/application pairs';}
   const summary=root.querySelector('.user-role-batch-summary dl');
   if(summary){
    const values=summary.querySelectorAll('dd');
    if(values[1])values[1].textContent=count+' selected';
    if(values[2])values[2].textContent=String(pairs);
   }
   return;
  }
  if(element.matches('[data-user-role-batch-app-role]')&&
     state.view==='role-configuration'&&state.roleTab==='application-access'){
   const moduleId=String(element.dataset.moduleId||'');
   const options=moduleId==='fueltrans'&&state.userRoleData.fueltransWorkspaceAvailable===true?
    FUELTRANS_WORKSPACE_ROLES:MODULE_ROLE_OPTIONS[moduleId]||[];
   if(!options.includes(element.value))return;
   state.userRoleBatchModuleRoles={...state.userRoleBatchModuleRoles,[moduleId]:element.value};
   return;
  }
  if(element.name==='user-role-batch-scope'&&['module','board'].includes(element.value)){
   state.userRoleBatchScope=element.value;
   state.userRoleBatchResource='';
   state.userRoleBatchRole='';
   render();return;
  }
  if(element.id==='user-role-batch-resource'){
   state.userRoleBatchResource=element.value;state.userRoleBatchRole='';
   render();return;
  }
  if(element.id==='user-role-batch-role'){
   state.userRoleBatchRole=element.value;render();return;
  }
  if(element.id==='user-role-batch-action'&&['assign','revoke'].includes(element.value)){
   state.userRoleBatchAction=element.value;render();return;
  }
 }

 if(event.target.id==='frt-status-filter'&&state.view==='board'&&state.tab==='finance'){
  state.frtStatusFilter=String(event.target.value||'all');render();return;
 }
 if(state.view==='board'&&state.tab==='sourcing'&&isMaterialTrackerBoard(state.board)&&
    ['mrh-tracker-source','mrh-tracker-overdue'].includes(event.target.id)){
  state.mrhTrackerFilters={...state.mrhTrackerFilters,
   ...(event.target.id==='mrh-tracker-source'?{source:['all','Local','Import'].includes(event.target.value)?event.target.value:'all'}:
    {overdue:event.target.checked===true})};
  const current=root.querySelector('.mrh-tracker');
  if(current)current.outerHTML=renderMaterialSourcingTracker(state.board,state.mrhTrackerFilters,new Date(),{canCreate:state.edit===true,view:state.mrhAddView?'add':'list'});
  return;
 }
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
   checkpointTradeLinkRecovery();
   tradeLinkRecoveryEditor=null;
   state.tradeLinkDraft=resetTradeLinkDraftForm(state.tradeLinkDraft,event.target.value);
   render();
   root.querySelector('.tl-reference-document-tabs a.active')?.focus({preventScroll:true});
  }
  return;
 }
 if(event.target.matches('[data-board-select-item]')&&activeBoardLayout()){
  const input=event.target;
  const order=visibleSelectionOrder();
  itemSelection.toggle(input.dataset.boardSelectItem,input.checked,{
   shift:input.dataset.shiftSelect==='true',ordered:order});
  delete input.dataset.shiftSelect;syncBoardSelectionUi();return;
 }
 if(event.target.matches('[data-board-select-all]')&&activeBoardLayout()){
  const input=event.target;
  const visible=visibleGroupSelectionIds(input.dataset.boardSelectAll);
  itemSelection.selectVisible(visible,{checked:input.checked});syncBoardSelectionUi();return;
 }
 if(event.target.matches('[data-board-column-toggle]')){
  const c=activeBoardLayout(),key=event.target.dataset.boardColumnToggle;
  if(!c||!c.columns.includes(key)||BOARD_REQUIRED_COLUMNS.includes(key))return;
  persistBoardLayout(p=>({...p,hidden:event.target.checked?
   p.hidden.filter(x=>x!==key):[...p.hidden,key]}));
  render();root.querySelector('.board-hide-columns')?.setAttribute('open','');return;
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
 if(event.target.id==='tt-log-date'&&state.view==='board'&&state.tab==='attendance'&&state.ttView==='log'&&state.ttAttendance?.status==='VERIFIED_READ'){
  const date=event.target.value;
  if(date!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
  const next={...TT_LOG_DEFAULT_FILTERS,...state.ttLogFilters,date,period:'all',start:'',end:''};
  if(next.view==='today')next.view='all';
  state.ttLogFilters=next;
  const visible=new Set(filterTimeTrackerLogRows(timeTrackerLogRowsForSnapshot(state.ttAttendance),next).map(r=>r.id));
  state.ttLogSelectedIds=state.ttLogSelectedIds.filter(id=>visible.has(id));
  state.ttLogExpandedIds=[];
  render();
  root.querySelector('#tt-log-date')?.focus();
  return;
 }
 if(event.target.id==='tt-log-period'&&state.ttView==='log'){
  const range=event.target.closest('.tt-log-filter-panel')?.querySelector('.tt-log-custom-range');
  if(range)range.hidden=event.target.value!=='custom';
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
  saveTimeTrackerLocationPreference(typeof localStorage==='undefined'?null:localStorage,{
   userId:state.context?.user_id,workspaceId:state.context?.workspace_id
  },event.target.value);
  // Collapse the native popup; selection is retained across re-renders/logins.
  event.target.blur?.();
  for(const chip of root.querySelectorAll('[data-action="tt-location-shortcut"]')){
   const chosen=chip.dataset.location===event.target.value;
   chip.classList.toggle('is-selected',chosen);
   chip.setAttribute('aria-pressed',String(chosen));
  }
  const group=root.querySelector('#tt-note-wrap');
  const note=root.querySelector('#tt-note');
  if(group&&note){
   const showHomeNote=event.target.value==='Offsite (Home)'&&
    isTimeTrackerHomeNoteRequired(event.target.value,state.ttAttendance?.access?.email,state.ttAttendance?.access?.userId);
   group.hidden=!showHomeNote;
   note.required=showHomeNote;
   if(!showHomeNote){const message=root.querySelector('#tt-work-plan-validation');if(message)message.hidden=true;note.removeAttribute('aria-invalid');note.setCustomValidity('');}
   else note.setCustomValidity(note.value&&!note.value.trim()?'Work Plan is required for Offsite (Home).':'');
   const requirement=root.querySelector('#tt-note-requirement');
   if(requirement)requirement.textContent=note.required?' (required)':' (optional)';
  }
 }
 if(event.target.id==='managed-user'&&state.adminVerified&&state.userRoleData&&
    (state.view==='user-role-management'||(state.view==='role-configuration'&&state.roleTab==='application-access'))){
  const id=event.target.value;
  if(state.userRoleData.users.some(u=>u.id===id)){
    state.userRoleSelected=id;render();
  }
 }
});
root.addEventListener('submit',event=>{
 if(event.target.id==='oi-filter-form'&&state.view==='order-intake'&&orderIntakeRoute){
  event.preventDefault();
  const filters=Object.fromEntries(new FormData(event.target));
  for(const key of ['minAmount','maxAmount']){filters[key]=String(filters[key]||'').trim();if(filters[key]&&!decimalParts(filters[key])){toast('Enter a valid decimal amount.',true);return;}}
  if(filters.minAmount&&filters.maxAmount&&compareOrderDecimals(filters.minAmount,filters.maxAmount)>0){toast('Minimum amount cannot exceed maximum amount.',true);return;}
  if(filters.from&&filters.to&&filters.from>filters.to){toast('Select a valid received date range.',true);return;}
  location.hash=orderIntakeHref(orderIntakeRoute.section,filters);
  return;
 }
 if(event.target.id==='tt-attendance-admin-form'){
  event.preventDefault();void saveTimeTrackerAdminEditor(event.target);return;
 }
 if(event.target.id==='mrh-add-material-form'){
  event.preventDefault();
  const form=event.target,button=form.querySelector('[data-mrh-add-submit]');
  const snapshot={boardId:state.boardId,userId:auth.userId,workspaceId:state.context?.workspace_id,tab:'sourcing'};
  const authorized=()=>boardHistoryAuthorized(snapshot)&&state.tab==='sourcing'&&
   state.mrhAddView&&state.edit&&auth.isSignedIn&&
   isMaterialTrackerBoard(state.board);
  if(!authorized()||state.mrhAddBusy||!button)return;
  const status=form.querySelector('[data-mrh-add-status]');
  let plan;
  try{
   if(!form.reportValidity())return;
   plan=parseMaterialAddForm(state.board,new FormData(form));
  }catch(err){if(status)status.textContent=errorMessage(err);return;}
  state.mrhAddBusy=true;button.disabled=true;button.textContent='Saving material…';
  let uncertain=false;
  const requestId=form.dataset.mrhRequestId||
   (globalThis.crypto?.randomUUID?.()||'');
  if(!requestId){
   state.mrhAddBusy=false;button.disabled=false;
   if(status)status.textContent='Secure request ID unavailable. Reload and retry.';
   return;
  }
  form.dataset.mrhRequestId=requestId;
  Promise.resolve().then(async()=>{
   if(!authorized())throw new ApiError('Signed material workspace changed.',403);
   const created=await createMaterialSourcingAtomic({
    api:db,auth,workspaceId:snapshot.workspaceId,requestId,plan
   });
   if(!authorized())return;
   db.invalidateBoardCache();
   state.mrhAddView=false;
   await loadBoard(snapshot.boardId,'sourcing');
   if(!boardHistoryAuthorized(snapshot)||state.tab!=='sourcing')return;
   const reloaded=state.board?.items?.find(item=>item.id===created.itemId&&
    item.group_id===MATERIAL_SOURCING_GROUP.id&&item.title===created.partNumber);
   if(!reloaded){
    toast('Material saved, but its board row is not loaded yet. Refresh Material Sourcing to verify.');
    return;
   }
   await openBoardItemDetails(created.itemId);
   if(boardHistoryAuthorized(snapshot)&&state.tab==='sourcing')
    toast('Material '+created.partNumber+' saved and reloaded in Main group.');
  }).catch(error=>{
   if(!authorized())return;
   uncertain=true;
   if(status)status.textContent=
    'Creation status needs verification. Refresh the board before trying again. '+
    errorMessage(error);
   // Retain same idempotency key, and never generate another item through this form.
   button.disabled=true;
   button.textContent='Refresh to verify material';
  }).finally(()=>{
   state.mrhAddBusy=false;
   if(authorized()&&!uncertain&&form.isConnected){
    button.disabled=false;button.textContent='＋ Add Material';
   }
  });
  return;
 }
 if(event.target.matches('[data-ft3-receipt]')){
  event.preventDefault();
  const form=event.target,requestId=form.dataset.ft3Receipt;
  if(!validUuid(requestId)||state.fuelTrackSection!=='lightfuels'||
   state.fuelTrackRefuelingDialog?.id!==requestId||
   state.fuelTrackRefuelingDialog?.stage!=='details'||state.fuelTrackBackendBusy)return;
  const amount=Number(form.elements.namedItem('amount')?.value);
  const liters=Number(form.elements.namedItem('liters')?.value);
  const receiptNumber=String(form.elements.namedItem('receiptNumber')?.value||'').trim();
  const receiptFile=form.elements.namedItem('receiptPhoto')?.files?.[0]||null;
  if(receiptFile)try{validFuelTrackReceiptFile(receiptFile);}
   catch(err){toast(errorMessage(err));return;}
  if(!Number.isFinite(amount)||amount<=0||!Number.isFinite(liters)||liters<=0||
     receiptNumber.length>120){toast('Enter valid amount and fuel quantity.');return;}
  const button=form.querySelector('[type="submit"]');
  if(button){button.disabled=true;button.textContent='Saving…';}
  Promise.resolve(mutateFuelTrackBackend('complete',requestId,{
   amount,liters,receiptNumber:receiptNumber||null,receiptFile
  })).catch(notice).finally(()=>{
   if(button?.isConnected){button.disabled=false;button.textContent='✓ Save & Complete';}
  });
  return;
 }

 if(event.target.id==='ft3-new-request-form'){
  event.preventDefault();
  const form=event.target,button=form.querySelector('.ft3-new-submit');
  const userId=state.context?.user_id,workspaceId=state.context?.workspace_id,seq=routeSerial;
  const same=()=>auth.isSignedIn&&auth.userId===userId&&state.context?.user_id===userId&&
   state.context?.workspace_id===workspaceId&&seq===routeSerial&&
   state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection==='new-request'&&
   state.boardId===FUELTRACK_V3_ID&&state.board?.board?.workspace_id===workspaceId;
  if(!same()||state.fuelTrackBackendBusy||!state.fuelTrackBackend?.snapshot||
     button?.disabled)return;
  const note=form.querySelector('#ft3-new-catalog-note');
  let payload;
  try{payload=fuelTrackNewRequestPayload(form);}
  catch(err){if(note)note.textContent=errorMessage(err);return;}
  const fingerprint=JSON.stringify(payload);
  const key=state.fuelTrackPendingSubmission?.fingerprint===fingerprint?
    state.fuelTrackPendingSubmission.key:crypto.randomUUID();
  state.fuelTrackPendingSubmission={fingerprint,key};
  state.fuelTrackBackendBusy=true;
  button.disabled=true;button.textContent='Submitting…';
  const client=new FuelTrackV3DomainClient({api:db,auth,boardId:FUELTRACK_V3_ID,workspaceId});
  Promise.resolve(client.submit({clientKey:key,...payload})).then(async result=>{
   if(!same())return;
   const snapshot=await client.read({limit:200});
   if(!same())return;
   verifyFuelTrackSubmission(result,snapshot);
   state.fuelTrackBackend={snapshot,analytics:null};
   state.fuelTrackPendingSubmission=null;
   form.reset();
   toast('Fuel request submitted for approval.');
   location.hash=fuelTrackHref('requests');
  }).catch(err=>{
   if(same()&&note)note.textContent=errorMessage(err);
  }).finally(()=>{
   if(same()){
    state.fuelTrackBackendBusy=false;
    if(button.isConnected){button.disabled=false;button.textContent='Submit for Approval';}
   }
  });
  return;
 }

 if(event.target.id==='settings-display-name-form'){
  event.preventDefault();
  if(state.view!=='settings'||!state.context||!auth.isSignedIn)return;
  const form=event.target;
  const status=form.querySelector('[data-profile-name-status]');
  const button=form.querySelector('button[type="submit"]');
  if(button.disabled)return;
  const value=String(form.elements.namedItem('displayName')?.value||'')
   .normalize('NFC').trim().replace(/\s+/gu,' ');
  if(value.length<2||value.length>80||/[^@-^_\u007f<>]/u.test(value)){
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
  if(!tradeLinkDraftRoute()||!tradeLinkDraftReady()||!tradeLinkCanSave()){
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
 if(event.target.id==='tt-ot-week-jump-form'){
  event.preventDefault();
  if(state.view!=='board'||state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy)return;
  try{
   const date=root.querySelector('#tt-ot-week-jump')?.value||'';
   const weekOffset=timeTrackerOtWeekOffsetForDate(date);
   state.ttOtFilters={...state.ttOtFilters,weekOffset};
   render();
  }catch(error){toast(error.message,true);}
  return;
 }
 if(event.target.id==='tt-ot-manual-form'){
  event.preventDefault();
  const access=state.ttAttendance?.access;
  if(!TT_OT_WRITES_ACCEPTED||access?.manualOtManager!==true||
     access?.moduleRole!=='System Admin'||state.view!=='board'||
     state.tab!=='attendance'||state.ttView!=='ot'||
     state.ttAttendance?.status!=='VERIFIED_READ'||state.ttBusy){
   toast('Manual OT submission is unavailable for this TimeTracker session.',true);
   return;
  }
  const draft={
   employeeId:root.querySelector('#tt-ot-manual-employee')?.value||'',
   date:root.querySelector('#tt-ot-manual-date')?.value||'',
   start:root.querySelector('#tt-ot-manual-start')?.value||'',
   end:root.querySelector('#tt-ot-manual-end')?.value||'',
   reason:root.querySelector('#tt-ot-manual-reason')?.value||''
  };
  try{
   draft.start=parseTimeTrackerClockInput(draft.start);
   draft.end=parseTimeTrackerClockInput(draft.end);
  }catch(error){toast(error.message,true);return;}
  let weekOffset;
  try{weekOffset=timeTrackerOtWeekOffsetForDate(draft.date);}
  catch(error){toast(error.message,true);return;}
  state.ttOtDraft={...draft};state.ttBusy=true;render();
  Promise.resolve(timeTracker.submitManualOvertime(state.boardId,draft))
   .then(async()=>{
    state.ttOtFilters={...state.ttOtFilters,weekOffset,status:'All',search:''};
    state.ttOtModalOpen=false;state.ttOtDraft={};
    await loadTimeTracker();
    toast('Manual OT submitted for employee review.');
   }).catch(notice).finally(()=>{state.ttBusy=false;render();});
  return;
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
  const durationInput=root.querySelector('#tt-ot-duration-hours');
  if(durationInput){
   const minutes=Number(durationInput.value)*60;
   draft.durationMinutes=Number.isInteger(minutes)?minutes:null;
  }
  else try{
   draft.start=parseTimeTrackerClockInput(draft.start);
   draft.end=parseTimeTrackerClockInput(draft.end);
  }catch(error){toast(error.message,true);return;}
  state.ttOtDraft={...draft};
  state.ttBusy=true;render();
  root.querySelector('.tt-ot-modal')?.focus({preventScroll:true});
  Promise.resolve().then(()=>timeTracker.submitOvertime(state.boardId,draft))
   .then(async()=>{state.ttOtModalOpen=false;state.ttOtDraft={};
     await loadTimeTracker();toast(durationInput?'OT request submitted for HR approval.':'OT request submitted for bootstrap review.');})
   .catch(notice).finally(()=>{
    state.ttBusy=false;render();
    if(state.ttOtModalOpen)root.querySelector('#tt-ot-date')?.focus({preventScroll:true});
    else root.querySelector('[data-action="tt-ot-open"]')?.focus();
   });
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
  const submitter=event.submitter||null;
  const kind=submitter?.value||'';
  recordTimeTrackerGpsDiagnostic({phase:submitter?'submit-event':'submitter-missing',
   action:kind,submitterAvailable:!!submitter});
  if(!submitter)render();
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
root.addEventListener('change',async event=>{
 if(event.target?.id==='tt-employees-department-filter'){
  if(state.view==='board'&&state.tab==='attendance'&&state.ttView==='employees'&&state.ttAttendance?.status==='VERIFIED_READ'){
   state.ttEmployeesDepartment=String(event.target.value||'');
   render();
   root.querySelector('#tt-employees-department-filter')?.focus();
  }
  return;
 }
 if(event.target?.id==='tt-ojt-location'){
  if(timeTrackerOjtScope()&&state.ttOjtSelected&&!state.ttOjtBusy){
   state.ttOjtLocationSelection=String(event.target.value||'Office-Base Duty');
   const group=root.querySelector('#tt-ojt-note-wrap');
   const note=root.querySelector('#tt-ojt-note');
   const show=state.ttOjtLocationSelection==='Offsite (Home)';
   if(group)group.hidden=!show;
   if(note)note.required=show;
   if(!show){const message=root.querySelector('#tt-ojt-work-plan-validation');if(message)message.hidden=true;if(state.ttOjtError==='Work Plan is required for Offsite (Home).')state.ttOjtError='';}
  }
  return;
 }
 if(event.target?.id!=='tt-ojt-intern-select')return;
 const scope=timeTrackerOjtScope();
 const id=String(event.target.value||'');
 const intern=state.ttAttendance?.ojtRoster?.interns?.find(row=>row.id===id);
 if(!scope||!id||!intern){
  state.ttOjtError='Select your name from the list before starting.';
  render();return;
 }
 if(state.ttOjtBusy||state.ttOjtPending)return;
 state.ttOjtBusy=true;state.ttOjtError='';state.ttOjtSuccess='';render();
 try{
  // A dropdown selection only loads that intern's signed attendance snapshot.
  // GPS and attendance writes remain behind the explicit Start Session action.
  const attendance=await timeTrackerOjt.snapshot(scope,id);
  if(!timeTrackerOjtScope()||state.context?.user_id!==scope.userId||
    state.boardId!==scope.boardId||
    !state.ttAttendance?.ojtRoster?.interns?.some(row=>row.id===id))
   throw Error('The signed OJT account or selected intern changed. Select again.');
  state.ttOjtSelected={id:intern.id,name:intern.name,scope:{...scope}};
  state.ttOjtLocationSelection='Office-Base Duty';
  state.ttOjtSnapshot=attendance;
  state.ttOjtSuccess='Selected '+intern.name+'. Your attendance history is ready.';
 }catch(err){
  state.ttOjtError=errorMessage(err);
 }finally{
  state.ttOjtBusy=false;render();
 }
});
function preserveManualAttendanceDraft(event){
 const form=event.target.closest?.('#tt-attendance-admin-form[data-mode="manual"]');
 if(!form||state.ttLogAdminEditor?.mode!=='manual'||!timeTrackerAdminLogReady()||
    state.ttAttendance.access.moduleRole!=='System Admin')return false;
 const draft=syncManualAttendanceForm(form);
 state.ttLogAdminEditor.draft=draft;
 const capability=state.ttLogAdminEditor.capability||{};
 const canSave=draft.status==='active'?capability.activeReady===true:capability.historicalReady===true;
 const warning=form.querySelector('[data-tt-manual-readiness-warning]');
 if(warning){
  const message=state.ttLogAdminEditor.uncertain?
   'Save confirmation uncertain. Refresh the Log before retrying.':
   draft.status==='active'&&!capability.activeReady?
    'Regular employee auto clock-out is not active. Today’s active manual clock-in is disabled; past-date corrections remain available.':
   draft.status==='completed'&&!capability.historicalReady?
    'Historical attendance service is not verified. Saving is disabled.':'';
  warning.textContent=message;warning.hidden=!message;
 }
 const submit=form.querySelector('button[type="submit"]');
 if(submit)submit.disabled=!canSave||state.ttLogAdminEditor.uncertain||state.ttLogAdminBusy;
 return true;
}
function preserveManualClockOutDraft(event){
 const form=event.target.closest?.('#tt-attendance-admin-form[data-tt-manual-clockout]');
 const editor=state.ttLogAdminEditor;
 if(!form||!editor?.manualClockout||state.ttLogAdminBusy||!timeTrackerAdminLogReady()||
    state.ttAttendance.access.moduleRole!=='System Admin')return false;
 const draft=new FormData(form);
 editor.clockOutDateDraft=String(draft.get('clockOutDate')||'');
 editor.clockOutDraft=String(draft.get('clockOutAt')||'');
 syncManualClockOutPreview(form,editor.ojt?editor.record:editor.records?.[0]);
 return true;
}
root.addEventListener('change',event=>{
 if(!preserveManualClockOutDraft(event))preserveManualAttendanceDraft(event);
});
root.addEventListener('invalid',event=>{
 if(event.target.id!=='tt-note'||!event.target.required)return;
 const message=root.querySelector('#tt-work-plan-validation');
 if(message){message.hidden=false;event.target.setAttribute('aria-invalid','true');}
},true);
root.addEventListener('input',event=>{
 if(syncTradeLinkFinanceInput(event))return;
 const manualOvertimeForm=event.target.closest?.('#tt-ot-manual-form');
 if(manualOvertimeForm&&state.ttOtModalOpen==='manual'&&!state.ttBusy){
  state.ttOtDraft={
   employeeId:manualOvertimeForm.querySelector('#tt-ot-manual-employee')?.value||'',
   date:manualOvertimeForm.querySelector('#tt-ot-manual-date')?.value||'',
   start:manualOvertimeForm.querySelector('#tt-ot-manual-start')?.value||'',
   end:manualOvertimeForm.querySelector('#tt-ot-manual-end')?.value||'',
   reason:manualOvertimeForm.querySelector('#tt-ot-manual-reason')?.value||''
  };
  updateTimeTrackerManualOtPreview(manualOvertimeForm);return;
 }
 const overtimeForm=event.target.closest?.('#tt-ot-form');
 if(overtimeForm&&state.view==='board'&&state.tab==='attendance'&&
    state.ttView==='ot'&&state.ttOtModalOpen&&!state.ttBusy){
  state.ttOtDraft={
   date:overtimeForm.querySelector('#tt-ot-date')?.value||'',
   start:overtimeForm.querySelector('#tt-ot-start')?.value||'',
   end:overtimeForm.querySelector('#tt-ot-end')?.value||'',
   reason:overtimeForm.querySelector('#tt-ot-reason')?.value||''
  };
  const durationInput=overtimeForm.querySelector('#tt-ot-duration-hours');
  if(durationInput){
   const minutes=Number(durationInput.value)*60;
   state.ttOtDraft.durationMinutes=Number.isInteger(minutes)?minutes:null;
  }
  updateTimeTrackerOvertimePreview(overtimeForm);
  return;
 }
 if(preserveManualClockOutDraft(event)||preserveManualAttendanceDraft(event))return;
 if(event.target.id==='tt-note'&&event.target.closest('#tt-clock-form')){
  ttWorkNoteDraft.write(timeTrackerWorkNoteScope(),event.target.value);
  event.target.setCustomValidity(event.target.required&&event.target.value&&!event.target.value.trim()?'Work Plan is required for Offsite (Home).':'');
  if(event.target.value.trim()){const message=root.querySelector('#tt-work-plan-validation');if(message)message.hidden=true;event.target.removeAttribute('aria-invalid');}
  return;
 }
 if(event.target.id==='tt-ojt-note'&&timeTrackerOjtScope()&&state.ttOjtSelected){
  ttWorkNoteDraft.write(timeTrackerWorkNoteScope(state.ttOjtSelected.id),event.target.value);
  if(event.target.value.trim()){const message=root.querySelector('#tt-ojt-work-plan-validation');if(message)message.hidden=true;if(state.ttOjtError==='Work Plan is required for Offsite (Home).')state.ttOjtError='';}
  return;
 }
 if(event.target.matches('[data-board-hide-search]')){
  const query=String(event.target.value||'').trim().toLocaleLowerCase();
  for(const row of root.querySelectorAll('[data-board-hide-option]'))
   row.hidden=!row.dataset.boardHideOption.includes(query);
  return;
 }
 if(event.target.id==='user-role-batch-member-search'&&
    (state.view==='user-role-management'||(state.view==='role-configuration'&&state.roleTab==='application-access'))&&
    state.adminVerified&&state.userRoleBatchMode){
  const query=String(event.target.value).slice(0,120);
  state.userRoleBatchMemberSearch=query;
  const needle=query.trim().toLocaleLowerCase();
  let matches=0;
  for(const row of root.querySelectorAll('[data-batch-member-row]')){
   row.hidden=!row.dataset.searchName.includes(needle);
   if(!row.hidden)matches++;
  }
  const count=root.querySelector('#user-role-batch-search-count');
  if(count)count.textContent=matches+' matching';
  return;
 }
 if(event.target.id==='user-role-board-filter'&&state.view==='user-role-management'&&state.adminVerified){
  const query=String(event.target.value).slice(0,120);
  state.userRoleBoardSearch=query;
  const needle=query.trim().toLocaleLowerCase();
  let matched=0;
  for(const row of root.querySelectorAll('[data-role-board-row]')){
   row.hidden=!row.dataset.boardName.includes(needle);
   if(!row.hidden)matched++;
  }
  const status=root.querySelector('#user-role-board-filter-result');
  if(status)status.textContent=matched.toLocaleString('en-US')+' of '+state.userRoleData.boards.length.toLocaleString('en-US')+' boards';
  return;
 }

 if(event.target.id==='mrh-tracker-search'&&state.view==='board'&&
    state.tab==='sourcing'&&isMaterialTrackerBoard(state.board)){
  const position=event.target.selectionStart;
  state.mrhTrackerFilters={...state.mrhTrackerFilters,search:String(event.target.value).slice(0,120)};
  const current=root.querySelector('.mrh-tracker');
  if(current)current.outerHTML=renderMaterialSourcingTracker(state.board,state.mrhTrackerFilters,new Date(),{canCreate:state.edit===true,view:state.mrhAddView?'add':'list'});
  const input=root.querySelector('#mrh-tracker-search');
  if(input){input.focus({preventScroll:true});if(position!=null)input.setSelectionRange(position,position);}
  return;
 }
 if(event.target.id==='ft3-activity-search'&&state.view==='board'&&
    state.tab==='fueltrack'&&state.fuelTrackSection==='activity'&&
    state.boardId===FUELTRACK_V3_ID&&state.fuelTrackActivity&&auth.isSignedIn){
  const query=String(event.target.value).slice(0,120);
  state.fuelTrackActivityFilters={...state.fuelTrackActivityFilters,query};
  applySearchVisibility(root,{selector:'.ft3-activity-entry',query,
   groupSelector:'.ft3-activity-group',emptySelector:'[data-ft3-activity-empty]'});
  return;
 }
 if(event.target.id==='ft3-signed-request-search'&&
  state.view==='board'&&state.tab==='fueltrack'&&state.fuelTrackSection==='requests'&&
  verifyFuelTrackBackendSnapshot(state.fuelTrackBackend?.snapshot,state.boardId,state.context?.workspace_id)){
  const pos=event.target.selectionStart;
  updateFuelTrackRequestFilters({search:String(event.target.value).slice(0,120),limit:25,expandedId:null});
  const field=root.querySelector('#ft3-signed-request-search');
  if(field){field.focus();if(pos!=null)field.setSelectionRange(pos,pos);}
  return;
 }
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
 if(event.target.id==='tt-employees-search'&&state.view==='board'&&
    state.tab==='attendance'&&state.ttView==='employees'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  const query=String(event.target.value).slice(0,120);
  state.ttEmployeesSearch=query;
  const panel=root.querySelector('[data-tt-employees-panel]:not([hidden])');
  if(!panel)return;
  const rows=[...panel.querySelectorAll('[data-tt-employee-search-row]')];
  const needle=query.trim().toLocaleLowerCase();
  const department=root.querySelector('#tt-employees-department-filter')?.value||'';
  const directory=panel.dataset.ttEmployeesPanel==='directory';
  let visible=0;
  for(const row of rows){
   row.hidden=!(row.dataset.searchText||'').includes(needle)||(directory&&!!department&&row.dataset.department!==department);
   if(!row.hidden)visible++;
  }
  const empty=panel.querySelector('[data-tt-employees-empty]');
  if(empty)empty.hidden=visible!==0;
  const count=root.querySelector('[data-tt-employees-count]');
  if(count&&directory)count.textContent=visible+' of '+rows.length+' employees';
  return;
 }
 if(event.target.id==='tt-team-search'&&state.view==='board'&&state.ttView==='team'&&
    state.roleVerified===true&&state.ttTeam&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  const query=String(event.target.value).slice(0,120);
  state.ttTeamFilters={...state.ttTeamFilters,search:query};
  const result=applySearchVisibility(root,{selector:'.tt-team-member',query,
   emptySelector:'[data-tt-team-empty]'});
  const count=root.querySelector('[data-tt-team-count]');
  if(count)count.textContent=result.visible+' of '+result.total+' members';
  return;
 }
 if(event.target.id==='tt-ot-search'&&state.view==='board'&&state.ttView==='ot'&&
    state.ttAttendance?.status==='VERIFIED_READ'){
  const query=String(event.target.value).slice(0,120);
  state.ttOtFilters={...state.ttOtFilters,search:query};
  applySearchVisibility(root,{selector:'.tt-ot-request',query,
   emptySelector:'[data-tt-ot-empty]'});
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
 if(event.target.id==='search-board-items'&&state.view==='board'&&state.tab==='items'){
  state.boardItemSearch=String(event.target.value).slice(0,160);
  // Matching groups may open temporarily; this never changes the saved preference.
  // Only reconstruct the board when a collapsed/expanded boundary actually changes.
  const requiresGroupUpdate=[...root.querySelectorAll('.board-collapsed-group,.group-heading[data-group-collapsed]')]
   .some(node=>{
    const id=node.dataset.groupId;
    if(!id||!(state.board.groups||[]).some(g=>g.id===id))return false;
    const count=(state.board.items||[]).filter(item=>item.group_id===id).length;
    const currentlyClosed=node.dataset.groupCollapsed==='true';
    return boardGroupCollapsed(id,count)!==currentlyClosed;
   });
  if(requiresGroupUpdate){
   const caret=event.target.selectionStart;
   render();
   const search=root.querySelector('#search-board-items');
   search?.focus({preventScroll:true});
   if(search&&Number.isSafeInteger(caret))search.setSelectionRange(caret,caret);
  }else{
   applyBoardItemFilter(state.boardItemSearch);
   syncBoardSelectionUi();
  }
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
  if(result)result.textContent=boardCatalogResultLabel(matched,{query:state.boardSearch,status:state.showTrash?'Trash':state.showArchived?'Archived':'Active'});
  const hint=root.querySelector('#board-search-no-results');
  if(hint)hint.hidden=matched!==0;
 }else if(event.target.id==='search-board-items')syncBoardSelectionUi();
});
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)checkpointTradeLinkRecovery();
 platformSync.visibilityChanged();
 setBoardLoadingVisibility(root,document.hidden);
 if(!document.hidden)void refreshCorrectedTimeTrackerClock({onFocus:true});
 if(!document.hidden)void refreshTimeTrackerEmployeeDirectory({onFocus:true});
});
// Window focus is distinct from document visibility: switching between two
// visible application windows may not emit visibilitychange in either one.
window.addEventListener('focus',()=>platformSync.focusChanged());
window.addEventListener('focus',()=>{
 if(state.view==='board'&&state.tab==='items'&&state.board?.board?.id===state.boardId&&
    state.context?.user_id===auth.userId)
  void readBoardGroupPreferences({userId:state.context.user_id,
   workspaceId:state.context.workspace_id,boardId:state.boardId});
});
window.addEventListener('focus',()=>{void refreshCorrectedTimeTrackerClock({onFocus:true});void refreshTimeTrackerEmployeeDirectory({onFocus:true});mobileClockRead=null;void readMobileHomeClock();});
// An additional tab may begin a Clock action; surface its pending marker
// immediately, without replaying writes or trusting browser data as attendance.
window.addEventListener('storage',event=>{
 if(!timeTrackerPendingKeyMatches(event.key,timeTrackerClockScope())||
  !event.newValue||!auth.isSignedIn||state.ttBusy||state.ttClockPending||
  state.view!=='board'||state.tab!=='attendance')return;
 restoreTimeTrackerClockPending();
 if(state.ttClockPending)render();
});

window.addEventListener('pageshow',event=>{
 if(event.persisted)platformSync.focusChanged();
});
window.addEventListener('resize',syncSidebarLayout);
window.addEventListener('resize',()=>void readMobileHomeClock());
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&sidebarMobileOpen){
  sidebarMobileOpen=false;syncSidebarLayout();
  root.querySelector('.sidebar-layout-toggle')?.focus({preventScroll:true});
 }
});
window.addEventListener('online',()=>{
 platformSync.network(true);
 // A real browser reconnection can recover a stalled signed startup once.
 // No timer, polling, background agent, or automatic write replay.
 if(startupRecoveryActive&&!startupBusy&&auth.isSignedIn)void boot();
});
window.addEventListener('offline',()=>platformSync.network(false));
// Hash navigation must not silently discard locally edited Draft fields.
// Authentication expiry remains authoritative: a revoked session is never
// retained merely because an unsaved editor was open.
window.addEventListener('hashchange',()=>{
 closeBoardSharePreview();closeBoardInviteDialog();
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
 checkpointTradeLinkRecovery();
 tradeLinkRecoveryEditor=null;
 approvedRouteHash=nextHash;
 onRoute().catch(notice);
});
window.addEventListener('pagehide',closeTradeLinkSavedDocumentOutput);
window.addEventListener('pagehide',checkpointTradeLinkRecovery);
window.addEventListener('beforeunload',event=>{
 if(state.context&&tradeLinkDraftRoute()&&
    tradeLinkDraftHasUnsavedChanges(state.tradeLinkDraft)){
  event.preventDefault();
  event.returnValue=''; // Native browser warning; no sensitive field contents.
 }
});
window.addEventListener('keydown',event=>{
 const ft3Dialog=root.querySelector('.ft3-refuel-dialog');
 if(ft3Dialog&&event.key==='Tab'){
  const focusable=[...ft3Dialog.querySelectorAll('button:not([disabled]),input:not([disabled])')];
  if(focusable.length){
   const first=focusable[0],last=focusable.at(-1);
   if(!ft3Dialog.contains(document.activeElement)){
    event.preventDefault();first.focus();
   }else if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 }
 if(ft3Dialog&&event.key==='Escape'){
  event.preventDefault();
  if(!state.fuelTrackBackendBusy){state.fuelTrackRefuelingDialog=null;render();}
  return;
 }
 if(event.key==='Escape'){
 closeBoardCardMenus();hideModal();
  for(const menu of root.querySelectorAll('.board-group-actions[open]'))menu.open=false;
  if(state.inlineCell&&!state.inlineCellBusy){state.inlineCell=null;preserveInlineScroll();}
  if(state.groupEditId&&!state.groupEditBusy){state.groupEditId=null;render();}
  if(state.ttOtModalOpen){state.ttOtModalOpen=false;render();}
}});
auth.onExpired=()=>{boardCacheChannel.stop();db.invalidateBoardCache();boardPreferences.clearMemory();ttWorkNoteDraft.clear();clearTimeTrackerGpsDiagnostics();mobileAccountChoices.clear();clearOrderIntake();mobileAccountEmail='';mobileClockRead=null;paseoReadRunId++;state.paseoManagement=null;timeTrackerPendingRecovery.clear(state.ttClockPending||timeTrackerClockScope());state.ttClockPending=null;globalSearchController?.close({restoreFocus:false});pendingGlobalSearchItem=null;pendingNativeSearchSelection=null;startupCriticalPath.clear();performanceProfileAbort?.abort();performanceProfileAbort=null;state.performanceBusy=false;state.performanceReport=null;invitationAcceptanceStatus='';// Keep an open invitation through session expiry so the user can sign in again.
 startupRecoveryActive=false;clearWs02dB3ForeignRlsFixture();state.ws02dB3RevokeArmed=false;closeWorkspacePanels();state.context=null;state.b4QaRunId++;state.b4QaBusy=false;state.b4QaReport=null;state.phaseBDenialRunId++;state.phaseBDenialBusy=false;state.phaseBDenialReport=null;state.frtSecurityResult=null;state.sec07Result=null;state.ws01B2RunId++;state.ws01B2Busy=false;state.ws01B2Result=null;state.ws02dB3RunId++;state.ws02dB3Busy=false;state.ws02dB3Report=null;state.ws02dB3HttpsRunId++;state.ws02dB3HttpsBusy=false;state.ws02dB3HttpsReport=null;state.ws02dB3RlsRunId++;state.ws02dB3RlsBusy=false;state.ws02dB3RlsReport=null;state.sec09Result=null;state.sec09RunId++;state.sec10Result=null;state.sec10RunId++;state.effectiveAccessResult=null;state.effectiveAccessRunId++;state.effectiveAccessBusy=false;state.ci07Result=null;state.ci07RunId++;state.ci07Busy=false;state.sec14Result=null;state.sec14RunId++;state.sec14Busy=false;state.sec14DenialResult=null;state.sec14DenialRunId++;state.sec14DenialBusy=false;state.frtFinance=null;state.frtFinanceBusy=false;state.frtFinanceDetail=null;state.frtFinanceDetailBusy=false;state.frtFinanceDetailId=null;state.frtFinanceDetailRevision++;state.roleVerified=false;state.adminVerified=false;state.roleData=null;state.userRoleData=null;state.systemAdminData=null;state.systemAdminError='';state.boards=[];platformSync.stop();stopTimeTrackerClock();state.ttRunId++;state.ttAttendance=null;clearTimeTrackerOjtSelection();state.ttBusy=false;state.ttError='';state.ttSuccess='';state.ttOverviewFilters={search:'',location:'all',department:'all',status:'all',sort:'newest'};state.ttLogFilters={...TT_LOG_DEFAULT_FILTERS};state.ttReportPeriod='all';state.ttReportFilters={...TT_REPORT_DEFAULT_FILTERS};state.ttCalendarMonth='';state.ttCalendarSelectedDay='';state.ttOtFilters={...TT_OT_DEFAULT_FILTERS};state.ttOtManualVisibleCount=50;state.ttOtModalOpen=false;state.ttOtDraft={};state.ttHoursWeekOffset=0;state.ttHoursMonth='';state.ttHoursSelectedDay='';state.ttTeamRunId++;state.ttTeam=null;state.ttTeamBusy=false;state.ttTeamError='';state.ttTeamFilters={search:'',role:'All',layout:'list'};state.ttMonitorRunId++;state.ttMonitor=null;state.ttMonitorBusy=false;state.ttMonitorError='';state.ttMonitorHistory=[];state.ttLogGpsRunId++;state.ttLogGpsData=null;state.ttLogGpsBusy=false;state.ttLogGpsError='';state.ttLogGpsErrorRecordId='';state.ttLogExpandedIds=[];state.ttLogSelectedIds=[];state.ttLogAdminEditor=null;state.ttLogAdminDeleteConfirm=null;state.ttLogAdminBusy=false;state.ttLogAdminError='';state.ttLogAdminSuccess='';state.ttOtExpandedRequestIds=[];state.ttGpsRunId++;state.ttGpsData=null;state.ttGpsBusy=false;state.ttGpsError='';state.ttGpsView='map';state.ttGpsFilters={};state.inlineCell=null;state.inlineAddBusy=false;state.inlineCellBusy=false;clearBulkActivation();renderLogin('Session expired. Please sign in again.');};
let workspacePreferenceSyncPending=false;
let workspacePreferenceSyncQueued=null;
let pendingExternalSignIn=false;
async function reconcileWorkspacePreferenceChange({userId,workspaceId}={}){
 if(!auth.isSignedIn||auth.userId!==userId||state.context?.user_id!==userId)return;
 if(startupBusy||workspacePreferenceSyncPending){
  workspacePreferenceSyncQueued={userId,workspaceId};
  return;
 }
 if(state.context.workspace_id===workspaceId)return;
 workspacePreferenceSyncPending=true;
 const previousWorkspace=state.context.workspace_id;
 try{
  await refreshWorkspace();
  if(!auth.isSignedIn||auth.userId!==userId||state.context?.user_id!==userId)return;
  // The local-storage event is only a hint. Refresh the signed context first
  // and reconcile only when the server confirms the same workspace.
  if(state.context.workspace_id===workspaceId&&state.context.workspace_id!==previousWorkspace)
   await onRoute();
 }catch{/* Keep the current view; the next navigation can retry reconciliation. */}
 finally{
  workspacePreferenceSyncPending=false;
  const queued=workspacePreferenceSyncQueued;
  workspacePreferenceSyncQueued=null;
  if(queued&&queued.workspaceId!==state.context?.workspace_id)
   void reconcileWorkspacePreferenceChange(queued);
 }
}
auth.onSessionChange=(event)=>{
 if(event!=='SIGNED_IN'&&event!=='TOKEN_REFRESHED')return;
 if(startupBusy){pendingExternalSignIn=true;return;}
 if(state.authBusy)return;
 if(auth.isSignedIn&&!state.context)void boot();
};
async function boot(){
 if(startupBusy)return;
 startupBusy=true;
 startupCriticalPath.begin();
 startupRecoveryActive=false;
 startupRecoveryStage='authentication';
 window.__APSYNTRA_STARTUP?.begin();
 startInitialization();
 let outcome='RECOVERABLE_ERROR';
 try{
  setInitializationPhase('authentication');
  // Capture and scrub an invitation before a GoTrue confirmation callback can
  // replace the URL. The one-time invitation remains volatile in this tab.
  if(!pendingInvitation){
   pendingInvitation=captureInvitationLink(location,history);
   if(pendingInvitation)approvedRouteHash=location.hash;
  }
  const callback=captureAuthReturn(location,history);
  if(callback){
   // Recovery tokens are never installed as normal CRM sessions. Keep any
   // separate browser tabs signed in; only clear this tab's in-memory view.
   auth.clear({persist:false});
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
    renderLogin('',{mode:'login',notice:pendingInvitation?.status==='ready'?
     'Email verified. Sign in with the invited email address to accept your workspace invitation.':
     'Email verification completed. Workspace access still requires administrator approval. Sign in only after your account is admitted.'});
   }else{
    renderLogin('The authentication link is invalid or expired.',{mode:'forgot'});
   }
   outcome='UNAUTHENTICATED';
   return;
  }
  if(['#/register','#/forgot-password','#/reset-password'].includes(location.hash)){
   renderLogin(location.hash==='#/reset-password'?
    'Your recovery link is unavailable or expired. Request a new link.':'');
   outcome='UNAUTHENTICATED';
   return;
  }
  if(await startupVerifiedRead(async()=>await auth.restore())){
   state.user=auth.session.user;
   await restoreSavedWorkspacePreference();
   startupCriticalPath.phase('workspace-authorization');
   setInitializationPhase('authorization');
   const startupUserId=auth.userId;
   startupRecoveryStage='workspace';
   await startupVerifiedRead(async()=>await refreshWorkspace(),{
    canContinue:()=>auth.isSignedIn&&auth.userId===startupUserId
   });
   startupRecoveryStage='route';
   setInitializationPhase('workspace');
   startupCriticalPath.phase('authorized-route');
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
  startupCriticalPath.end({authenticated:outcome==='AUTHENTICATED'});
  window.__APSYNTRA_STARTUP?.resolve(outcome);
  finishInitialization();
  startupBusy=false;
  if(pendingExternalSignIn){
   pendingExternalSignIn=false;
   if(auth.isSignedIn&&!state.context&&outcome==='UNAUTHENTICATED')void boot();
  }
  if(workspacePreferenceSyncQueued){
   const queued=workspacePreferenceSyncQueued;
   workspacePreferenceSyncQueued=null;
   void reconcileWorkspacePreferenceChange(queued);
  }
 }
}
startSelectExperience(document.body);
startActionMenuExperience(document.body);
startSearchExperience(document.body);
startTimeTrackerLogColumnResize(root);
globalSearchController=startGlobalSearch({
 root:document.body,
 getScope:()=>auth.isSignedIn&&state.context?{
  userId:state.context.user_id,workspaceId:state.context.workspace_id
 }:null,
 getBoards:async()=>{
  const archived=await db.boards('archived').catch(()=>[]);
  return [...state.boards,...archived].filter(board=>!isStandaloneApplicationBoard(board));
 },
 searchRecords:async(query)=>{
  const [workspace,native]=await Promise.allSettled([
   db.searchWorkspaceContent(query,40),
   nativeSearchRegistry.search(query,{userId:state.context?.user_id,
    workspaceId:state.context?.workspace_id})
  ]);
  const rows=workspace.status==='fulfilled'?[...workspace.value]:[];
  if(native.status==='fulfilled')rows.push(...native.value.results);
  if(workspace.status==='rejected'&&native.status==='rejected')
   throw workspace.reason||native.reason;
  return rows;
 },
 navigate:navigateGlobalSearchResult,
 onError:error=>notice(error)
});
startInputExperience(document.body);
startMetricsExperience(document.body);
watchWorkspacePreference({onChange:change=>void reconcileWorkspacePreferenceChange(change)});
// Register public static caching only after the signed startup promise settles.
// A worker/module failure cannot block initialization or make startup fatal.
void boot().then(()=>import('./static-cache-registration.js').then(
 module=>module.registerStaticCache()).catch(()=>{})).catch(()=>{});
