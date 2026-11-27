/**
 * Central loading-state policy for the signed APSYNTRA application shell.
 *
 * A pending read may retain a mounted shell only for the exact same signed-in
 * user and workspace. Cold startup, signed-out state, scope changes, and an
 * active workspace transition keep the existing blocking loading behavior.
 */
export function resolveApplicationLoadingState({
 pending = false,
 hasRenderedShell = false,
 isSignedIn = false,
 userId = null,
 workspaceId = null,
 renderedScope = null,
 workspaceTransitionPending = false
} = {}) {
 if (!pending) return 'ready';

 const identity = typeof userId === 'string' ? userId.trim() : '';
 const workspace = typeof workspaceId === 'string' ? workspaceId.trim() : '';
 if (!isSignedIn || !identity || !workspace || workspaceTransitionPending) {
  return 'show-loader';
 }

 const activeScope = identity + '|' + workspace;
 if (hasRenderedShell && renderedScope === activeScope) return 'retain-shell';
 return 'show-loader';
}
