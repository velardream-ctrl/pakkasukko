import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPlayer,anchorFromRatio,ratioFromAnchor,validRatio,isDrag} from '../docs/sleigh-position.js';
import {readFileSync} from 'node:fs';
const v={left:0,top:0,width:390,height:844},small={width:132,height:70},large={width:190,height:126};
test('RUN-044: drag clamps entire widget to visible viewport',()=>{
 assert.deepEqual(fitPlayer({x:-300,y:-300},v,small),{left:12,top:12});
 assert.deepEqual(fitPlayer({x:900,y:900},v,small),{left:246,top:762});
 assert.deepEqual(fitPlayer({x:900,y:900},v,large),{left:188,top:706});
 const zoom={left:100,top:200,width:280,height:310};
 assert.deepEqual(fitPlayer({x:-100,y:999},zoom,large),{left:112,top:372});
});
test('RUN-044: normalized position survives orientation changes and panel expansion',()=>{
 const a={x:220,y:400},r=ratioFromAnchor(a,v);assert.ok(validRatio(r));assert.deepEqual(anchorFromRatio(r,v),a);
 const landscape={left:0,top:0,width:844,height:390};const p=fitPlayer(anchorFromRatio(r,landscape),landscape,large);
 assert.ok(p.left>=12&&p.top>=12&&p.left+large.width<=832&&p.top+large.height<=378);
 const x=fitPlayer(a,v,small),y=fitPlayer(a,v,large);
 assert.equal(x.left+small.width,y.left+large.width);assert.equal(x.top+small.height,y.top+large.height);
 assert.equal(validRatio({x:NaN,y:1}),false);
});
test('RUN-044: distinguish taps and dragging, persist and retain volume control',()=>{
 assert.equal(isDrag(3,4),false);assert.equal(isDrag(7,0),true);
 const p=readFileSync(new URL('../docs/sleigh-position.js',import.meta.url),'utf8');
 const s=readFileSync(new URL('../docs/sleigh-player.js',import.meta.url),'utf8');
 assert.match(p,/setPointerCapture/);assert.match(p,/stopImmediatePropagation/);assert.match(p,/localStorage.setItem/);
 assert.match(s,/touch-action:none/);assert.match(s,/slider.oninput/);assert.match(s,/attachPlayerPosition\(box,toggle/);
});
