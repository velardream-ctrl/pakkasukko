import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,setField} from '../docs/site.js';
import {photoState,editableFields} from '../docs/inline-editor.js';

test('inline editor photo adjustments are independent by section and device',()=>{
 const model=initial();
 photoState(model,'top','desktop').zoom=165;
 photoState(model,'about','desktop').y=21;
 photoState(model,'about','phone').zoom=135;
 photoState(model,'intro','phone').x=-12;
 assert.equal(photoState(model,'top','desktop').zoom,165);
 assert.equal(photoState(model,'top','phone').zoom,100);
 assert.equal(photoState(model,'about','desktop').y,21);
 assert.equal(photoState(model,'about','phone').y,0);
 assert.equal(photoState(model,'about','phone').zoom,135);
 assert.equal(photoState(model,'intro','phone').x,-12);
 assert.equal(photoState(model,'intro','tablet').x,0);
 assert.notStrictEqual(photoState(model,'about','phone'),photoState(model,'about','desktop'));
});

test('editable field selection excludes detached content',()=>{
 const parent={};
 const node={isConnected:true};
 const target={contains:(x)=>x===node};
 assert.deepEqual(editableFields([{key:'yes',node},{key:'no',node:{isConnected:false}},{key:'other'}],target),[{key:'yes',node}]);
});

test('fairy-tale performer prompt stays editable without replacing the booking select',()=>{
 const fareForm=readFileSync(new URL('../docs/fare-form.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
 assert.match(fareForm,/castTitle\.textContent='Выберите, кто придёт к вам в гости\?'/);
 assert.match(fareForm,/castLabel\.append\(castTitle,castSelect\)/);
 assert.match(app,/key:'booking:performer-prompt',node:fare\.castTitle/);
 const node={isConnected:true,textContent:'Выберите, кто придёт к вам в гости?',parentElement:null};
 const wrapper={contains:target=>target===node};
 assert.equal(editableFields([{group:'booking',key:'booking:performer-prompt',node}],wrapper).length,1);
 setField({node},'Кто придёт в вашу сказку?');
 assert.equal(node.textContent,'Кто придёт в вашу сказку?');
});
