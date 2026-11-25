import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spatialSettings,spatialAsset,chosenSpatialScene,matchSpatialFraming,BUILTIN_SPATIAL} from '../docs/spatial-gallery.js';
import {validSpatialSettings} from '../src/editor.js';

const uuid='a12f0000-1111-4222-8333-abcdef123456';
const fg='b12f0000-1111-4222-8333-abcdef123456';
const bg='c12f0000-1111-4222-8333-abcdef123456';

test('ordinary photo is retained on every device by default, with built-in spatial scene ready',()=>{
 const s=spatialSettings({});
 assert.equal(s.modes.phone,'photo');
 assert.equal(s.modes.tablet,'photo');
 assert.equal(s.modes.desktop,'photo');
 assert.equal(s.motions.phone,'auto');
 assert.equal(s.motions.tablet,'auto');
 assert.equal(s.motions.desktop,'auto');
 assert.equal(chosenSpatialScene(s,'phone'),BUILTIN_SPATIAL);
 assert.match(spatialAsset('builtin-santa'),/demo-3d-santa\.png/);
 assert.match(spatialAsset('builtin-original'),/pakkasukko-ded-moroz\.webp/);
});
test('owner can select distinct spatial modes and scenes per device',()=>{
 const s=spatialSettings({spatial:{enabled:true,modes:{phone:'spatial',tablet:'photo',desktop:'spatial'},
   motions:{phone:'manual',tablet:'tilt',desktop:'auto'},
   selected:{phone:uuid,desktop:'winter-original'},
   scenes:[{id:uuid,title:'Другой Дед Мороз',foregroundId:fg,backgroundId:bg}],strength:60}});
 assert.equal(s.modes.phone,'spatial');assert.equal(s.modes.tablet,'photo');
 assert.equal(s.motions.phone,'manual');assert.equal(s.motions.tablet,'tilt');
 assert.equal(chosenSpatialScene(s,'phone').foregroundId,fg);
 assert.equal(chosenSpatialScene(s,'desktop'),BUILTIN_SPATIAL);
 assert.equal(spatialAsset(bg),'/api/media/'+bg);
 assert.equal(spatialAsset('javascript:alert(1)'),'');
});
test('server validates spatial scenes while accepting old revisions',()=>{
 assert.equal(validSpatialSettings(undefined),true);
 const config={enabled:true,strength:70,modes:{phone:'spatial',tablet:'photo',desktop:'photo'},
  selected:{phone:uuid},scenes:[{id:uuid,title:'Тест',foregroundId:fg,backgroundId:bg}]};
 assert.equal(validSpatialSettings(config),true);
 assert.equal(validSpatialSettings({...config,scenes:[{...config.scenes[0],backgroundId:'https://evil.example'}]}),false);
 assert.equal(validSpatialSettings({...config,modes:{phone:'unsafe'}}),false);
 assert.equal(validSpatialSettings({...config,motions:{phone:'manual',tablet:'tilt',desktop:'auto'}}),true);
 assert.equal(validSpatialSettings({...config,motions:{phone:'unsafe'}}),false);
 assert.equal(validSpatialSettings({...config,selected:{phone:'missing'}}),false);
 assert.equal(validSpatialSettings({...config,strength:101}),false);
});

test('spatial layers follow the exact position and zoom of the existing per-device photo crop',()=>{
 const original={style:{transform:'translate(15%, -8%) scale(2.35)'}};
 const frame={style:{}},figure={style:{}};
 matchSpatialFraming(original,frame,figure,{transformOrigin:'195px 0px',objectPosition:'50% 0%'});
 assert.equal(frame.style.transform,original.style.transform);
 assert.equal(frame.style.transformOrigin,'195px 0px');
 assert.equal(figure.style.backgroundPosition,'50% 0%');
});

test('the original church is restored behind a rigid Santa silhouette',()=>{
 const css=readFileSync(new URL('../docs/spatial-gallery.css',import.meta.url),'utf8');
 const js=readFileSync(new URL('../docs/spatial-gallery.js',import.meta.url),'utf8');
 assert.match(css,/\.pk-space-original-background \.pk-space-restored/);
 assert.match(css,/\.pk-space-figure\s*\{[^}]*transform:none;/);
 assert.doesNotMatch(js,/set\('--pk-space-fg/);
});
