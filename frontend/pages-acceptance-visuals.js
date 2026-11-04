/** CP-PAGES-VIS01: lightweight presentation-only SVG icons and one-shot motion.
 * No graphics context, network access, API calls, telemetry or continuous frame loops.
 */
const paths=Object.freeze({
 shield:'<path d="M12 22s8-4.2 8-10V5l-8-3-8 3v7c0 5.8 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
 database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/>',
 checks:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 2 2 3-3M8 16h8"/>',
 arrows:'<path d="M4 7h15l-4-4M20 17H5l4 4"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
 warning:'<path d="m10.3 3.8-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.2l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
 play:'<path d="m8 5 11 7-11 7V5Z"/>',
 check:'<path d="m5 12 5 5L20 7"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 18l9 5 9-5"/>',
 external:'<path d="M11 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M13 3h8v8m0-8-10 10"/>'
});
/** Accessible markup uses visible text; icons are decorative. */
export function pagesAcceptanceIcon(kind){
 return '<svg class="pages-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" '+
  'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" '+
  'stroke-linejoin="round" aria-hidden="true" focusable="false">'+
  (Object.hasOwn(paths,kind)?paths[kind]:paths.shield)+'</svg>';
}
/** Minimal-motion presentation hook retained for existing shell imports.
 * Route content appears at its final position without stagger or overshoot.
 */
export function mountPagesAcceptanceMotion(){}
export function stopPagesAcceptanceMotion(){}
