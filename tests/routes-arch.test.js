import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sectionCrop,initial} from '../docs/site.js';

// Keep the location gallery within the original arched area instead of
// generating a second, full-width media row below the entire Routes section.
test('routes pictures target the existing arched frame',()=>{
 const script=readFileSync(new URL('../docs/site.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
 const editor=readFileSync(new URL('../docs/editor.html',import.meta.url),'utf8');
 assert.match(script,/section\.id==='routes'\)section\.querySelector\('\.routes-art'\)\?\.append\(wrapper\)/);
 assert.match(css,/\.routes-art > \.section-media-frame/);
 assert.match(css,/\.routes-art > \.section-media-frame > \.section-media/);
 assert.match(editor,/<option value="routes">/);
 assert.equal(sectionCrop(initial(),'routes','desktop').fit,'cover');
 assert.equal(sectionCrop(initial(),'about','desktop').fit,'contain');
});
