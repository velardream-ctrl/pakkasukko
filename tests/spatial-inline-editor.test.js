import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spatialSettings,patchSpatialSettings} from '../docs/spatial-gallery.js';
import {validSpatialSettings} from '../src/editor.js';

test('live 3D sliders edit only the selected device and preserve ordinary photo crops',()=>{
 const model={crops:{phone:{x:14,y:2,zoom:120}},spatial:{
   enabled:true,modes:{phone:'spatial',tablet:'photo',desktop:'spatial'},
   motions:{phone:'auto',tablet:'manual',desktop:'auto'},
   backgroundZoom:{phone:100,desktop:119},backgroundFocus:{phone:42},snowLevel:{phone:72},strength:84,
   selected:{phone:'winter-original',desktop:'winter-original'},scenes:[]
 }};
 const originalCrop=structuredClone(model.crops.phone);
 assert.equal(patchSpatialSettings(model,'phone','backgroundZoom',128),true);
 assert.equal(patchSpatialSettings(model,'phone','backgroundFocus',37),true);
 assert.equal(patchSpatialSettings(model,'phone','snowLevel',79),true);
 assert.equal(patchSpatialSettings(model,'phone','motions','manual'),true);
 assert.equal(patchSpatialSettings(model,'phone','strength',65),true);
 const view=spatialSettings(model);
 assert.equal(view.backgroundZoom.phone,128);
 assert.equal(view.backgroundZoom.desktop,119);
 assert.equal(view.backgroundFocus.phone,37);
 assert.equal(view.snowLevel.phone,79);
 assert.equal(view.motions.phone,'manual');
 assert.equal(view.motions.tablet,'manual');
 assert.equal(view.strength,65);
 assert.deepEqual(model.crops.phone,originalCrop);
 assert.equal(validSpatialSettings(model.spatial),true);
 assert.equal(patchSpatialSettings(model,'unknown','snowLevel',65),false);
 assert.equal(patchSpatialSettings(model,'phone','unsafe',99),false);
});

test('inline 3D panel opens only for owner and replaces ordinary crop controls',()=>{
 const editor=readFileSync(new URL('../docs/inline-editor.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
 const gallery=readFileSync(new URL('../docs/spatial-gallery.js',import.meta.url),'utf8');
 assert.ok(editor.indexOf("fetch('/api/admin/editor'")<editor.indexOf('document.body.append(host)'));
 assert.match(editor,/if\(view\.enabled&&view\.modes\[currentDevice\(\)\]==='spatial'\)return spatialPanel\(\)/);
 assert.match(editor,/function spatialPanel\(\)/);
 assert.match(editor,/patchSpatialSettings\(model,device,field,value\)/);
 for(const field of ['backgroundZoom','backgroundFocus','snowLevel','strength','motions','selected'])
   assert.ok(editor.includes("'"+field+"'"),field+' is editable');
 assert.match(editor,/spatialPhoto\?\.updateModel\(\)/);
 assert.match(editor,/spatialPhoto\?\.updateModel\(true\)/);
 assert.match(gallery,/return \{refresh,updateModel\}/);
 assert.match(app,/const spatialPhoto=mountSpatialPhoto/);
 assert.match(app,/fares:config\.fares,spatialPhoto,onAdmin/);
 assert.match(css,/\.pk-panel\[data-spatial="true"\]/);
});
