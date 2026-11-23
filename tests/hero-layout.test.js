import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
const code=readFileSync(new URL('../docs/site.js',import.meta.url),'utf8');

test('hero portrait blends without a card, while other photo frames retain their decoration',()=>{
  const run=css.slice(css.lastIndexOf('/* RUN-014:'));
  assert.match(run,/\.hero-photo\s*\{[^}]*box-shadow:none/s);
  assert.match(run,/\.hero-photo\s*\{[^}]*border-radius:0/s);
  assert.match(run,/\.hero-photo img\s*\{[^}]*object-fit:cover/s);
  assert.match(run,/linear-gradient\(to right,transparent 0%,#000 24%,#000 100%\)/);
  assert.match(css,/\.about-portrait,[\s\S]+?\.routes-art\{\s*box-shadow:var\(--pk-photo-offset\)/);
  assert.ok(code.includes('image:heroImageId(model,device)'));
});

test('on portrait-width mobile hero photo is above headline, without overlaying it',()=>{
  const run=css.slice(css.lastIndexOf('/* RUN-014:'));
  assert.match(run,/@media\(max-width:980px\)[\s\S]+?\.hero-photo\{\s*inset:66px 0 auto/);
  assert.match(run,/mask-image:linear-gradient\(to bottom,#000 0%,#000 84%,transparent 100%\)/);
  assert.match(run,/\.hero-inner\{padding:calc\(66px \+ clamp\(330px,42svh,490px\) \+ 20px\)/);
  assert.match(run,/@media\(max-width:600px\)/);
});
