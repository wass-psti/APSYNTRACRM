/**
 * CP-OVERVIEW-VIS01: presentation-only icons and interruptible one-shot motion.
 * No credentials, tracking, timers, data mutation, CSSOM injection or GPU loops.
 *
 * @typedef {'refresh'|'plus'|'grid'|'items'|'pulse'|'shield'|'arrow'|'check'|'lock'} OverviewIcon
 */
const paths=Object.freeze({
 refresh:'<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.4-2"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
 items:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="m3 6 1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2"/>',
 pulse:'<path d="M3 12h4l3-6 4 12 3-6h4"/><circle cx="12" cy="12" r="10"/>',
 shield:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
 check:'<path d="m5 12 4.5 4.5L19 7"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
});
/* Filled dark-theme counterparts; leave existing outline artwork for light mode. */
const solidPaths = Object.freeze({
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  items:
    '<rect x="8" y="5" width="13" height="2.5" rx="1.25"/><rect x="8" y="11" width="13" height="2.5" rx="1.25"/><rect x="8" y="17" width="13" height="2.5" rx="1.25"/><circle cx="4.5" cy="6.2" r="1.6"/><circle cx="4.5" cy="12.2" r="1.6"/><circle cx="4.5" cy="18.2" r="1.6"/>',
  pulse:
    '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 3.3 2.8 7.1 1.5-2.5h3v2.2h-1.9l-3 5.3-2.7-7.1-1.6 3.5H4.9v-2.2h3.8L12 5.3Z" fill-rule="evenodd"/>',
  shield:
    '<path d="M12 1.8 21 5v7.1c0 6.2-5.5 9.6-9 10.3-3.5-.7-9-4.1-9-10.3V5l9-3.2Zm4.5 7.7-1.5-1.4-4.3 4.6-1.8-1.8-1.4 1.5 3.3 3.2 5.7-6.1Z" fill-rule="evenodd"/>',
  lock: '<path d="M8 9V7a4 4 0 0 1 8 0v2h1.5A2.5 2.5 0 0 1 20 11.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 19.5v-8A2.5 2.5 0 0 1 6.5 9H8Zm2.3 0h3.4V7a1.7 1.7 0 0 0-3.4 0v2Z" fill-rule="evenodd"/>',
  check:
    '<path d="m9.5 17.7-5.2-5.1 1.8-1.8 3.4 3.4 8.3-8.3 1.8 1.8-10.1 10Z"/>',
  plus: '<path d="M10.7 4h2.6v6.7H20v2.6h-6.7V20h-2.6v-6.7H4v-2.6h6.7V4Z"/>',
  refresh:
    '<path d="M20.5 4v7h-7l2.6-2.6A6 6 0 0 0 5.9 10l-2.3-1A8.5 8.5 0 0 1 18 6.5L20.5 4ZM3.5 20v-7h7l-2.6 2.6A6 6 0 0 0 18.1 14l2.3 1A8.5 8.5 0 0 1 6 17.5L3.5 20Z"/>',
  arrow:
    '<path d="M4 11h11.9l-4.1-4.1 1.7-1.7L20.5 12l-7 6.8-1.7-1.7 4.1-4.1H4v-2Z"/>',
});

/** @param {OverviewIcon} icon */
export function overviewIcon(icon){
 return '<svg class="overview-svg-icon" viewBox="0 0 24 24" width="19" height="19" '+
  'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  '<g class=\"icon-outline\">'+(Object.hasOwn(paths,icon)?paths[icon]:paths.grid)+'</g>'+
  '<g class=\"icon-solid\" fill=\"currentColor\" stroke=\"none\">'+
  (Object.hasOwn(solidPaths,icon)?solidPaths[icon]:solidPaths.grid)+'</g></svg>';
}
/** Intentional minimal-motion policy: route content is placed immediately.
 * Retain public hooks for existing shell imports; no entrance animation work.
 */
export function mountOverviewMotion(){}
export function stopOverviewMotion(){}
