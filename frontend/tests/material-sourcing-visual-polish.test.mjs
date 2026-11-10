import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
test('Material Sourcing typography, metrics and control surface share consistent styling',()=>{
 assert.match(css,/MRH procurement UI refinement/);
 assert.match(css,/\.mrh-tracker-head\{/);
 assert.match(css,/\.mrh-kpi-top\{/);
 assert.match(css,/\.mrh-tracker-stats>\.mrh-kpi-card\{/);
 assert.match(css,/\.mrh-table-panel\{/);
 assert.match(css,/\.mrh-tracker-controls\{/);
 assert.match(css,/\.mrh-tracker-table-scroll\{scrollbar-color:/);
});
test('KPI layout adapts to available board width, not global screen breakpoint',()=>{
 assert.match(css,/\.mrh-tracker-body\{[^}]*container-type:inline-size/s);
 assert.match(css,/@container \(max-width:1130px\)\{/);
 assert.match(css,/@container \(max-width:690px\)\{/);
 assert.match(css,/@container \(max-width:440px\)\{/);
 assert.match(css,/\.mrh-tracker-stats>\.mrh-breakdown\{grid-column:span 2\}/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
test('polish changes do not introduce unsafe visual hacks',()=>{
 const part=css.split('/* MRH procurement UI refinement:')[1];
 assert.ok(part);
 assert.doesNotMatch(part,/\b!important\b|position:fixed|overflow:hidden;?height:100vh/);
});
