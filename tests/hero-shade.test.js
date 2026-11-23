import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,heroShadePercent,applyHeroShade} from '../docs/site.js';

test('upper photo overlay defaults to completely transparent',()=>{
 const m=initial();
 assert.equal(heroShadePercent(m,'desktop'),0);
 assert.equal(heroShadePercent(m,'tablet'),0);
 assert.equal(heroShadePercent(m,'phone'),0);
 const overlay={style:{}};
 applyHeroShade({querySelector:(selector)=>selector==='.hero-shade'?overlay:null},m,'desktop');
 assert.equal(overlay.style.opacity,'0');
});

test('admin may set independently adjustable 0–100% shading for each device',()=>{
 const m=initial();m.shades={desktop:12,tablet:36,phone:70};
 assert.equal(heroShadePercent(m,'desktop'),12);
 assert.equal(heroShadePercent(m,'tablet'),36);
 assert.equal(heroShadePercent(m,'phone'),70);
 const overlay={style:{}};
 applyHeroShade({querySelector:()=>overlay},m,'phone');
 assert.equal(overlay.style.opacity,'0.7');
 m.shades.phone=0;applyHeroShade({querySelector:()=>overlay},m,'phone');
 assert.equal(overlay.style.opacity,'0');
 m.shades.phone=140;assert.equal(heroShadePercent(m,'phone'),100);
 m.shades.phone=-12;assert.equal(heroShadePercent(m,'phone'),0);
 m.shades.phone='invalid';assert.equal(heroShadePercent(m,'phone'),0);
});
