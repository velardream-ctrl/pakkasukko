import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sleighArt} from '../docs/sleigh-player.js';
const read=name=>readFileSync(new URL('../docs/'+name,import.meta.url),'utf8');
test('RUN-040: independent animated artwork and stationary controls, no track title',()=>{
 const player=read('sleigh-player.js'),music=read('music.js');
 assert.match(sleighArt,/class="pk-leg pk-leg-front"/);
 assert.match(sleighArt,/class="pk-santa-head"/);
 assert.match(player,/\.pk-music\.is-playing \.pk-leg-front\{animation:/);
 assert.match(player,/\.pk-music\.is-playing \.pk-santa\{animation:/);
 assert.doesNotMatch(player,/\.pk-music-controls[^{}]*\{[^}]*animation:/);
 assert.match(player,/prefers-reduced-motion:reduce/);
 assert.match(player,/5000/);
 assert.match(music,/createSleighPlayer\(box,volume/);
 assert.doesNotMatch(music,/p\.tracks\[index\]\.title/);
 assert.match(music,/audio\.addEventListener\('ended',advance\)/);
 for(const f of ['index.html','contact.html','privacy.html','video.html','trip.html'])assert.match(read(f),/music\.js\?v=40/);
});
