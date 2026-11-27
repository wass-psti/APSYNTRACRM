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


/**
 * Accept a route-read result only while its original route and signed scope
 * remain active. This prevents a slow response from replacing a newer view.
 */
export function isCurrentApplicationRouteRead(token, activeToken, {
 currentHash = '',
 isSignedIn = false,
 userId = null,
 workspaceId = null
} = {}) {
 return Boolean(token) &&
  activeToken === token &&
  currentHash === token.hash &&
  isSignedIn === true &&
  userId === token.userId &&
  workspaceId === token.workspaceId;
}
