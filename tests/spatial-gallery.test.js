import test from 'node:test';
import assert from 'node:assert/strict';
import {spatialSettings,spatialAsset,chosenSpatialScene,BUILTIN_SPATIAL} from '../docs/spatial-gallery.js';
import {validSpatialSettings} from '../src/editor.js';

const uuid='a12f0000-1111-4222-8333-abcdef123456';
const fg='b12f0000-1111-4222-8333-abcdef123456';
const bg='c12f0000-1111-4222-8333-abcdef123456';

test('ordinary photo is retained on every device by default, with built-in spatial scene ready',()=>{
 const s=spatialSettings({});
 assert.equal(s.modes.phone,'photo');
 assert.equal(s.modes.tablet,'photo');
 assert.equal(s.modes.desktop,'photo');
 assert.equal(chosenSpatialScene(s,'phone'),BUILTIN_SPATIAL);
 assert.match(spatialAsset('builtin-santa'),/demo-3d-santa\.png/);
});
test('owner can select distinct spatial modes and scenes per device',()=>{
 const s=spatialSettings({spatial:{enabled:true,modes:{phone:'spatial',tablet:'photo',desktop:'spatial'},
   selected:{phone:uuid,desktop:'winter-original'},
   scenes:[{id:uuid,title:'Другой Дед Мороз',foregroundId:fg,backgroundId:bg}],strength:60}});
 assert.equal(s.modes.phone,'spatial');assert.equal(s.modes.tablet,'photo');
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
 assert.equal(validSpatialSettings({...config,selected:{phone:'missing'}}),false);
 assert.equal(validSpatialSettings({...config,strength:101}),false);
});
