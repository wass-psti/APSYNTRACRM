import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 METRIC_VALUE_SELECTOR,METRIC_CHART_SELECTOR,
 MOTION_SCRIPT,GSAP_SCRIPT,MAX_ACTIVE_KPIS,METRIC_MOTION_DURATION,
 parseMetricValue,metricMotionLevel,metricFrameBudget,metricProgressPoint,
 describeMetricProfiling,createMetricSvgGauge,drawMetricCanvasGauge,
 loadMetricMotionLibraries,startMetricsExperience
} from '../metrics-experience.js';

const js=readFileSync('frontend/metrics-experience.js','utf8');
const css=readFileSync('frontend/metrics-experience.css','utf8');
const app=readFileSync('frontend/app.js','utf8');
const html=readFileSync('index.html','utf8');
const smoke=readFileSync('scripts/pages-smoke.mjs','utf8');

test('metric selector covers dashboard, foundation, role, finance and TimeTracker, not raw item rows',()=>{
 for(const selector of [
  '.stat-value','.tt-overview-metric > strong','.tt-report-stat > strong',
  '.tt-monitor-stat > strong','.tt-hours-kpis strong',
  '.tt-hours-progress-kpis strong','.tt-ot-metrics strong',
  '.tt-cal-kpis strong','.tt-team-stats strong','.tt-gps-kpi strong'
 ])assert.ok(METRIC_VALUE_SELECTOR.includes(selector),selector);
 assert.match(METRIC_CHART_SELECTOR,/tt-report-analytics/);
 assert.match(METRIC_CHART_SELECTOR,/tt-ot-chart/);
 assert.match(METRIC_CHART_SELECTOR,/tt-hours-progress progress/);
 for(const risk of ['.board-row-select','.board-item','.tt-gps-records',
  '.tt-log-row','.board-table td','.user-role-account-select'])
  assert.ok(!METRIC_VALUE_SELECTOR.includes(risk),risk);
});
test('numeric parsing is exact, preserves existing source formatting, never guesses unavailable values',()=>{
 assert.deepEqual(parseMetricValue('1,240'),
  {raw:'1,240',value:1240,prefix:'',suffix:'',percent:false});
 assert.deepEqual(parseMetricValue('73%'),
  {raw:'73%',value:73,prefix:'',suffix:'%',percent:true});
 assert.deepEqual(parseMetricValue('₱1,250.50'),
  {raw:'₱1,250.50',value:1250.5,prefix:'₱',suffix:'',percent:false});
 assert.equal(parseMetricValue('26.5 h')?.value,26.5);
 assert.equal(parseMetricValue('52 ms')?.suffix,' ms');
 assert.equal(parseMetricValue('104%')?.percent,false);
 assert.equal(parseMetricValue('-5%')?.percent,false);
 for(const invalid of ['—','No arrivals','Active','35 / 50','v1','5 of 20',
  '2026-11-04','123abc','Infinity','NaN','99999999999999999999']){
  assert.equal(parseMetricValue(invalid),null,invalid);
 }
 assert.ok(Object.isFrozen(parseMetricValue('51%')));
});
test('adaptive motion shuts down on reduced motion, save-data and hidden tabs',()=>{
 assert.equal(metricMotionLevel({reduced:true}),'none');
 assert.equal(metricMotionLevel({saveData:true}),'none');
 assert.equal(metricMotionLevel({hidden:true}),'none');
 assert.equal(metricMotionLevel({cores:2,memory:8}),'lite');
 assert.equal(metricMotionLevel({cores:8,memory:2}),'lite');
 assert.equal(metricMotionLevel({cores:8,memory:8}),'full');
 assert.equal(metricFrameBudget('full'),1000/60);
 assert.equal(metricFrameBudget('lite'),1000/30);
 assert.equal(metricFrameBudget('none'),Infinity);
 assert.equal(MAX_ACTIVE_KPIS,12);
 assert.ok(METRIC_MOTION_DURATION<=500);
 assert.equal(metricProgressPoint(-1),0);
 assert.equal(metricProgressPoint(5),1);
 assert.equal(metricProgressPoint(NaN),0);
});
test('performance profiling is bounded, numerical, on-demand and never transmits data',()=>{
 assert.deepEqual(describeMetricProfiling([]),
  {frames:0,meanMs:null,maxMs:null,slowFrames:0});
 assert.deepEqual(describeMetricProfiling([5,10,20,-1,NaN]),
  {frames:3,meanMs:11.67,maxMs:20,slowFrames:1});
 const many=describeMetricProfiling(Array(300).fill(18));
 assert.equal(many.frames,120);
 assert.equal(many.slowFrames,120);
 assert.equal(many.meanMs,18);
 assert.match(js,/profile=false,onProfile=null/);
 assert.match(js,/profileSamples\.length>=120/);
 assert.match(js,/profileSamples\.length%30===0/);
 assert.doesNotMatch(js,/sendBeacon|localStorage|sessionStorage|navigator\.sendBeacon|console\.log/);
});
test('SVG progress gauge represents only measured percent with decorative hidden semantics',()=>{
 const doc={createElementNS:(_ns,name)=>{
  const el={tagName:name,children:[],attributes:{},
   setAttribute(key,value){this.attributes[key]=String(value);},
   append(...children){this.children.push(...children);},
   querySelector(selector){return selector==='.aps-metric-gauge-fill'?this.children[1]:null;}
  };return el;
 }};
 const gauge=createMetricSvgGauge(73,doc);
 assert.equal(gauge.tagName,'svg');
 assert.equal(gauge.attributes['aria-hidden'],'true');
 assert.equal(gauge.attributes.viewBox,'0 0 52 52');
 assert.equal(gauge.children.length,2);
 assert.equal(gauge.children[1].attributes['stroke-dasharray'],'73 100');
 assert.equal(gauge.children[1].attributes['pathLength'],'100');
 assert.equal(createMetricSvgGauge(101,doc),null);
 assert.equal(createMetricSvgGauge(-1,doc),null);
 assert.equal(createMetricSvgGauge(NaN,doc),null);
});
test('Canvas 2D draws same signed percentage at capped DPR and requires no infinite loop',()=>{
 const calls=[],ctx={
  setTransform(...args){calls.push(['setTransform',...args]);},
  clearRect(...args){calls.push(['clearRect',...args]);},
  beginPath(){calls.push(['beginPath']);},
  arc(...args){calls.push(['arc',...args]);},
  stroke(){calls.push(['stroke']);}
 };
 const canvas={width:0,height:0,getContext:type=>type==='2d'?ctx:null};
 assert.equal(drawMetricCanvasGauge(canvas,50,{dpr:4}),true);
 assert.equal(canvas.width,104);
 assert.equal(canvas.height,104);
 assert.equal(calls.filter(x=>x[0]==='arc').length,2);
 assert.equal(calls.at(-2)[0],'arc');
 assert.equal(calls.at(-2)[5],-Math.PI/2+Math.PI);
 assert.equal(drawMetricCanvasGauge(canvas,101),false);
 assert.equal(drawMetricCanvasGauge(canvas,NaN),false);
 assert.equal(drawMetricCanvasGauge(null,50),false);
});
test('Motion for JS and GSAP use pinned actual UMD assets from existing CSP origin',()=>{
 assert.equal(MOTION_SCRIPT,'https://unpkg.com/motion@12.38.0/dist/motion.js');
 assert.equal(GSAP_SCRIPT,'https://unpkg.com/gsap@3.15.0/dist/gsap.min.js');
 assert.equal(typeof loadMetricMotionLibraries,'function');
 assert.match(js,/globalThis\.Motion\?\.animate/);
 assert.match(js,/globalThis\.gsap\?\.to/);
 assert.match(js,/loadMetricMotionLibraries\(doc\)/);
 assert.match(js,/gsap\.to\(counter/);
 assert.match(js,/motion\.animate\(entry\.card/);
 assert.match(js,/async=true;node\.src=url/);
 assert.match(html,/script-src 'self' https:\/\/unpkg\.com;/);
 assert.doesNotMatch(html,/cdn\.jsdelivr\.net/);
});
test('Motion fallback uses WAAPI and short RAF only; no expensive looping animations',()=>{
 assert.match(js,/entry\.motion=card\.animate\(\[/);
 assert.match(js,/metricFrameBudget\(level\)/);
 assert.match(js,/win\.requestAnimationFrame/);
 assert.match(js,/win\.cancelAnimationFrame/);
 assert.match(js,/typeof IntersectionObserver==='function'/);
 assert.match(js,/typeof ResizeObserver==='function'/);
 assert.match(js,/visibilityObserver\.unobserve\(change\.target\)/);
 assert.match(js,/doc\.visibilityState==='hidden'/);
 assert.match(js,/stop\(entry\)/);
 assert.match(js,/resizeObserver\?\.unobserve\(entry\.canvas\)/);
 assert.match(js,/visibilityObserver\?\.disconnect\(\);resizeObserver\?\.disconnect\(\)/);
 assert.doesNotMatch(js,/setInterval|setTimeout|new Worker|WebAssembly|requestIdleCallback/);
});
test('existing charts receive visibility-only one-shot animation on intersection',()=>{
 assert.match(js,/function revealChart(chart)/);
 assert.match(js,/function watchChart(chart)/);
 assert.match(js,/if(charts\.has(change\.target))revealChart(change\.target)/);
 assert.match(js,/chart\.animate\(\[/);
 assert.match(js,/chart\.querySelectorAll\?\.\('svg rect'\)/);
 assert.match(js,/bar\.animate\(\[\{opacity:0\.7\},\{opacity:1\}\]/);
 assert.match(js,/chartAnimations\.clear\(\)/);
 assert.match(js,/charts\.clear\(\)/);
 assert.doesNotMatch(js,/path\.setAttribute\('d'/);
 assert.doesNotMatch(css,/contain:layout/);
});
test('canonical metric text and chart contracts remain untouched by animation',()=>{
 assert.match(js,/node\.classList\.add\('aps-metric-value'\)/);
 assert.match(js,/node\.children\?\.length/);
 assert.match(js,/const parsed=parseMetricValue\(node\.textContent\)/);
 assert.match(js,/entry\.gauge=gauge;card\.append\(gauge\)/);
 assert.doesNotMatch(js,/node\.textContent\s*=|node\.innerHTML\s*=|node\.replaceChildren/);
 assert.doesNotMatch(js,/\.style\s*\.|\.style\s*=|\.cssText\s*=|setAttribute\s*\(\s*['"]style['"]/);
 assert.doesNotMatch(js,/fetch\(|\.rpc\(|getUserMedia|geolocation|GPS_LOCATION/);
});
test('status live region announces explicit signed refreshes without exposing metrics or identities',()=>{
 assert.match(js,/live\.setAttribute\('role','status'\)/);
 assert.match(js,/live\.setAttribute\('aria-live','polite'\)/);
 assert.match(js,/live\.setAttribute\('aria-atomic','true'\)/);
 assert.match(js,/Authorized metrics refreshed\./);
 assert.match(js,/data-action="tt-refresh"/);
 assert.match(js,/data-action="tt-monitor-refresh"/);
 assert.match(js,/data-action="tt-gps-load"/);
 assert.doesNotMatch(js,/aria-live[^;]*assert|employee_id|display_name|latitude|longitude/);
});
test('responsive styles, CSS custom properties, high contrast and reduced motion are scoped',()=>{
 for(const name of ['--aps-metric-accent','.aps-metric-card',
  '.aps-metric-value','.aps-metric-gauge-svg',
  '.aps-metric-gauge-canvas','.aps-metric-chart',
  '.aps-metric-live','@media(max-width:720px)',
  '@media(prefers-reduced-motion:reduce)',
  '@media(prefers-contrast:more)','@media(forced-colors:active)'])
  assert.ok(css.includes(name),name);
 assert.match(css,/font-variant-numeric:tabular-nums/);
 assert.match(css,/pointer-events:none/);
 assert.doesNotMatch(css,/@import|url\(https?:|@keyframes|animation:.*infinite|will-change/);
});
test('global ESM startup and exact-deployment Pages asset manifest are registered',()=>{
 assert.match(app,/import \{startMetricsExperience\} from '\.\/metrics-experience\.js'/);
 assert.match(app,/startMetricsExperience\(document\.body\)/);
 assert.ok(app.indexOf('startMetricsExperience(document.body)')>
  app.indexOf('startInputExperience(document.body)'));
 assert.ok(html.indexOf('frontend/metrics-experience.css')>
  html.indexOf('frontend/input-experience.css'));
 assert.match(smoke,/'frontend\/metrics-experience\.js'/);
 assert.match(smoke,/'frontend\/metrics-experience\.css'/);
 assert.match(html,/style-src-attr 'none'/);
 assert.match(html,/script type="module" src="\.\/frontend\/app\.js"/);
 const noop=startMetricsExperience(null);
 assert.equal(typeof noop,'function');
 assert.doesNotThrow(noop);
});
