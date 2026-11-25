import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sleighArt,sleighFrame} from '../docs/sleigh-player.js';
const read=name=>readFileSync(new URL('../docs/'+name,import.meta.url),'utf8');
test('RUN-040: independent animated artwork and stationary controls, no track title',()=>{
 const player=read('sleigh-player.js'),music=read('music.js');
 assert.match(sleighArt,/class="pk-leg pk-leg-front"/);
 assert.match(sleighArt,/class="pk-santa-head"/);
 assert.match(player,/requestAnimationFrame\(tick\)/);
 assert.match(player,/setAttribute\('transform',transform\)/);
 assert.doesNotMatch(player,/\.pk-music-controls[^{}]*\{[^}]*animation:/);
 assert.match(player,/prefers-reduced-motion: reduce/);
 assert.match(player,/5000/);
 assert.match(music,/createSleighPlayer\(box,volume/);
 assert.doesNotMatch(music,/p\.tracks\[index\]\.title/);
 assert.match(music,/audio\.addEventListener\('ended',advance\)/);
 for(const f of ['index.html','contact.html','privacy.html','video.html','trip.html'])assert.match(read(f),/music\.js\?v=42/);
});

test('RUN-041: frame transforms actually change legs, Santa and sleigh independently',()=>{
 const a=sleighFrame(0),b=sleighFrame(.17),d=sleighFrame(.35);
 for(const key of ['pk-leg-front','pk-leg-back','pk-santa','pk-santa-head','pk-sleigh','pk-deer-body'])assert.notEqual(a[key],b[key],key);
 assert.notEqual(b['pk-leg-front'],d['pk-leg-front']);
 assert.match(b['pk-leg-front'],/^rotate\(-?\d+\.\d+ 53 86\)$/);
 assert.equal(Object.keys(a).some(k=>k.includes('controls')),false);
 assert.match(read('music.js'),/player\.update\(!audio\.paused&&!audio\.ended&&!audio\.error,want\)/);
});

test('RUN-042: remove manual track skip while preserving automatic cycling',()=>{const p=read('sleigh-player.js'),m=read('music.js');assert.doesNotMatch(p,/Следующая композиция|onNext|⏭/);assert.match(p,/createSleighPlayer\(box,volume,onPlay,onVolume\)/);assert.match(m,/audio\.addEventListener\('ended',advance\)/);assert.match(m,/index=\(index\+1\)%p\.tracks\.length/);});
