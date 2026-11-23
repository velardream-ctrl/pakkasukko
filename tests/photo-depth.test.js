import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('all major photograph frames use the same static offset-matte language',()=>{
  const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
  const segment=css.split('RUN-013')[1];
  assert.ok(segment,'photo depth style block must exist');
  for(const selector of [
    '.hero-photo', '.about-portrait',
    '.intro-grid > .section-media-frame',
    'main > section:not(.intro) > .section-media-frame',
    '.routes-art'
  ])assert.ok(segment.includes(selector),selector+' missing offset styling');
  assert.match(segment,/box-shadow:var\(--pk-photo-offset\)/);
  assert.match(segment,/--pk-photo-offset-mobile:9px/);
  assert.doesNotMatch(segment,/background-image\s*:/);
  assert.doesNotMatch(segment,/animation\s*:/);
});

test('routes media stays clipped to arch and does not duplicate an image',()=>{
  const site=readFileSync(new URL('../docs/site.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
  assert.match(css,/\.routes-art\{[^\n]*overflow:hidden/);
  assert.match(site,/section\.id==='routes'\)section\.querySelector\('\.routes-art'\)\?\.append\(wrapper\)/);
  assert.match(site,/if\(section\.id==='top'\)continue;/);
});
