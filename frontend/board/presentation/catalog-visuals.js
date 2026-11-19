/**
 * CP-BOARDS-VIS01: overview-consistent, route-scoped catalog animation.
 * Native WAAPI only; navigation, search, signed state and data stay in app.js.
 * @typedef {{cancel?:()=>void}} Animatable
 */
/** Intentional minimal-motion policy: route content is placed immediately.
 * Retain public hooks for existing shell imports; no entrance animation work.
 */
export function mountBoardCatalogMotion(){}
export function stopBoardCatalogMotion(){}
