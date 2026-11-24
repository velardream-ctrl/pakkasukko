import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,routesShadePercent,applyRoutesShade,heroShadePercent,applyHeroShade} from '../docs/site.js';

test('arch bottom shading defaults to gentle 48% and is separate from hero',()=>{
 const m=initial();
 for(const d of ['desktop','tablet','phone'])assert.equal(routesShadePercent(m,d),48);
 assert.equal(heroShadePercent(m,'desktop'),0);
 const values={};
 const arch={style:{setProperty:(k,v)=>values[k]=v}};
 applyRoutesShade({querySelector:s=>s==='#routes .routes-art'?arch:null},m,'desktop');
 assert.equal(values['--pk-routes-shade-opacity'],'0.48');
 const hero={style:{}};
 applyHeroShade({querySelector:s=>s==='.hero-shade'?hero:null},m,'desktop');
 assert.equal(hero.style.opacity,'0');
});
test('per-device arch shading supports 0–100 and safe fallback',()=>{
 const m=initial();m.routesShades={desktop:20,tablet:50,phone:80};
 assert.equal(routesShadePercent(m,'desktop'),20);
 assert.equal(routesShadePercent(m,'tablet'),50);
 assert.equal(routesShadePercent(m,'phone'),80);
 m.routesShades.phone=0;assert.equal(routesShadePercent(m,'phone'),0);
 m.routesShades.phone=101;assert.equal(routesShadePercent(m,'phone'),100);
 m.routesShades.phone=-5;assert.equal(routesShadePercent(m,'phone'),0);
 m.routesShades.phone='n/a';assert.equal(routesShadePercent(m,'phone'),48);
});
test('gradient only darkens bottom 35% and caption sits above it',()=>{
 const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
 const match=css.match(/\.routes-art:has\(> \.section-media-frame\)::after\{([^}]*)\}/);
 assert.ok(match);
 assert.match(match[1],/bottom:0;height:35%/);
 assert.match(match[1],/linear-gradient\(to top,rgba\(5,17,28,var\(--pk-routes-shade-opacity,\.48\)\) 0%,transparent 100%\)/);
 assert.doesNotMatch(match[1],/inset:40%/);
 assert.match(css,/\.routes-art > i\{z-index:3/);
});
test('both editors have independent controls and dragging does not alter shade',()=>{
 const html=readFileSync(new URL('../docs/editor.html',import.meta.url),'utf8');
 const editor=readFileSync(new URL('../docs/editor.js',import.meta.url),'utf8');
 const inline=readFileSync(new URL('../docs/inline-editor.js',import.meta.url),'utf8');
 assert.match(html,/id="routesShadeLabel"/);
 assert.match(html,/id="routesShade" type="range"/);
 assert.match(editor,/\$\('routesShade'\)\.oninput=/);
 assert.match(editor,/applyRoutesShade\(doc,model,device\(\)\)/);
 assert.match(inline,/if\(target==='routes'\)/);
 assert.match(inline,/applyRoutesShade\(document,model,currentDevice\(\)\);changed\(\)/);
 assert.match(inline,/slider\.dataset\.cropAxis=key;num\.dataset\.cropAxis=key/);
 assert.match(inline,/querySelectorAll\('\[data-crop-axis\]'\)/);
});
