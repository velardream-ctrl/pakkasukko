import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,sectionCrop} from '../docs/site.js';

test('About photo fills the arch by default on phone, retains desktop and tablet choices',()=>{
 const m=initial();
 assert.equal(sectionCrop(m,'about','phone').fit,'cover');
 assert.equal(sectionCrop(m,'about','desktop').fit,'contain');
 assert.equal(sectionCrop(m,'about','tablet').fit,'contain');
 assert.equal(sectionCrop(m,'routes','phone').fit,'cover');
 assert.equal(sectionCrop(m,'intro','phone').fit,'contain');
});
test('legacy saved mobile contain layout is corrected but owner can explicitly opt out',()=>{
 const m=initial();
 m.sectionCrops={about:{phone:{x:3,y:-9,zoom:115,fit:'contain'}}};
 const fixed=sectionCrop(m,'about','phone');
 assert.equal(fixed.fit,'cover');
 assert.equal(fixed.x,3);
 assert.equal(fixed.y,-9);
 assert.equal(fixed.zoom,115);
 assert.equal(m.sectionCrops.about.phone.fit,'contain','do not alter saved data');
 m.sectionCrops.about.phone.fitCustomized=true;
 assert.equal(sectionCrop(m,'about','phone').fit,'contain');
 m.sectionCrops.about.phone.fit='cover';
 assert.equal(sectionCrop(m,'about','phone').fit,'cover');
 m.sectionCrops.about.phone.fitCustomized=false;
 assert.equal(sectionCrop(m,'about','phone').fit,'cover');
});
test('mobile About frame is compact, photo covers and caption has own bottom gradient',()=>{
 const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
 const s=css.slice(css.indexOf('/* RUN-020'));
 assert.match(s,/@media\(max-width:760px\)/);
 assert.match(s,/\.about-portrait\{[\s\S]*min-height:0;[\s\S]*aspect-ratio:1 \/ 1/);
 assert.match(s,/\.about-portrait::after\{[\s\S]*height:26%;[\s\S]*linear-gradient\(to top/);
 assert.match(s,/\.about-portrait>\.portrait-label\{/);
});
test('both editors expose the effective fit and preserve explicitly selected contain',()=>{
 const editor=readFileSync(new URL('../docs/editor.js',import.meta.url),'utf8');
 const inline=readFileSync(new URL('../docs/inline-editor.js',import.meta.url),'utf8');
 assert.match(editor,/sectionCrop\(model,target\(\),device\(\)\)\.fit/);
 assert.match(editor,/crop\(\)\.fitCustomized=true/);
 assert.match(inline,/sectionCrop\(model,target,currentDevice\(\)\)\.fit/);
 assert.match(inline,/crop\.fitCustomized=true/);
 assert.match(inline,/fitCustomized:false/);
});
