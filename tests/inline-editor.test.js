import test from 'node:test';
import assert from 'node:assert/strict';
import {initial} from '../docs/site.js';
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
