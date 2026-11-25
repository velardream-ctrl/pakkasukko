import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sleighArt,sleighFrame,deerLegPose,deerLegPaths} from '../docs/sleigh-player.js';
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
 for(const f of ['index.html','contact.html','privacy.html','video.html','trip.html'])assert.match(read(f),/music\.js\?v=43/);
});

test('RUN-041: frame transforms actually change legs, Santa and sleigh independently',()=>{
 const a=sleighFrame(0),b=sleighFrame(.17),d=sleighFrame(.35);
 for(const key of ['pk-santa','pk-santa-head','pk-sleigh','pk-deer-body'])assert.notEqual(a[key],b[key],key);
 assert.notDeepEqual(deerLegPaths(.17,'pk-leg-front'),deerLegPaths(.35,'pk-leg-front'));
 assert.equal(Object.keys(a).some(k=>k.includes('controls')),false);
 assert.match(read('music.js'),/player\.update\(!audio\.paused&&!audio\.ended&&!audio\.error,want\)/);
});

test('RUN-042: remove manual track skip while preserving automatic cycling',()=>{const p=read('sleigh-player.js'),m=read('music.js');assert.doesNotMatch(p,/Следующая композиция|onNext|⏭/);assert.match(p,/createSleighPlayer\(box,volume,onPlay,onVolume\)/);assert.match(m,/audio\.addEventListener\('ended',advance\)/);assert.match(m,/index=\(index\+1\)%p\.tracks\.length/);});

test('RUN-043: articulated trot, constant lower bone lengths, diagonal phases and smooth cycle',()=>{
 const keys=['pk-leg-front','pk-leg-back','pk-leg-frontfar','pk-leg-backfar'];
 const length=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 for(const key of keys){
  for(let i=0;i<=84;i++){
   const p=deerLegPose(i/100,key);
   assert.ok(Math.abs(length(p.upper,p.joint)-p.lengths[0])<1e-7);
   assert.ok(Math.abs(length(p.joint,p.hoof)-p.lengths[1])<1e-7);
   assert.ok(p.hoof[1]>100&&p.hoof[1]<124);
   assert.ok(deerLegPaths(i/100,key).every(s=>!s.includes('NaN')));
  }
  assert.deepEqual(deerLegPaths(0,key),deerLegPaths(.84,key));
 }
 for(const t of [.05,.2,.42,.65]){
  assert.ok(Math.abs(deerLegPose(t,keys[0]).phase-deerLegPose(t,keys[3]).phase)<1e-8);
  assert.ok(Math.abs(deerLegPose(t,keys[0]).phase-deerLegPose(t,keys[2]).phase)>.49);
 }
 const front=deerLegPose(.65,keys[0]),hind=deerLegPose(.23,keys[1]);
 const cross=p=>(p.hoof[0]-p.upper[0])*(p.joint[1]-p.upper[1])-(p.hoof[1]-p.upper[1])*(p.joint[0]-p.upper[0]);
 assert.ok(cross(front)>0);assert.ok(cross(hind)<0);
 assert.match(read('sleigh-player.js'),/applyLegs\(seconds\)/);
});
