import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../docs/admin.html',import.meta.url),'utf8');

test('travel pricing has a native closed-by-default accordion like the sections above',()=>{
 const block=html.match(/<details class="admin-box" id="travelSettings">([\s\S]*?)<\/details>/);
 assert.ok(block,'travel settings must be wrapped in a details element');
 assert.match(block[1],/^<summary>Стоимость поездки<\/summary>/);
 assert.doesNotMatch(block[0],/<details[^>]*\bopen(?:\s|=|>)/);
 for(const id of ['fareForm','fareInputs','fareCities','addFareCity','fareStatus'])
   assert.match(block[1],new RegExp('id="'+id+'"'));
 assert.match(html,/<details class="admin-box" id="musicSettings">/);
 assert.match(html,/<details class="admin-box" id="billingSettings">/);
});
