import test from 'node:test';
import assert from 'node:assert/strict';
import {routeCities,renderRouteCities} from '../docs/route-cities.js';
import {defaultFare} from '../docs/fares.js';
import {readFileSync} from 'node:fs';
test('RUN-045: city list follows saved tariff additions and removals',()=>{
 assert.deepEqual(routeCities(defaultFare),['Kitee','Puhos','Tohmajärvi','Joensuu']);
 assert.deepEqual(routeCities({km:{Kitee:0,Helsinki:420,'Savonlinna':100}}),['Kitee','Helsinki','Savonlinna']);
 assert.deepEqual(routeCities({km:{Kitee:0}}),['Kitee']);
 assert.equal(routeCities(null),null);
});
test('RUN-045: rendered badges are updated without changing old editor text keys',()=>{
 const box={children:[],querySelectorAll(s){return this.children.filter(n=>s==='[data-route-city]'?Object.hasOwn(n.dataset,'routeCity'):!Object.hasOwn(n.dataset,'providerCopy'));},append(node){this.children.push(node);node.remove=()=>this.children.splice(this.children.indexOf(node),1);}};
 const original={textContent:'KITEE',dataset:{},hidden:false};box.children.push(original);
 const doc={querySelector:()=>box,createElement:()=>({dataset:{},textContent:''})};
 renderRouteCities(doc,{km:{Kitee:0,Helsinki:420}});assert.equal(original.hidden,true);
 assert.deepEqual(box.querySelectorAll('[data-route-city]').map(n=>n.textContent),['KITEE','HELSINKI']);
 renderRouteCities(doc,{km:{Kitee:0,Savonlinna:100}});renderRouteCities(doc,{km:{Kitee:0,Savonlinna:100}});
 assert.deepEqual(box.querySelectorAll('[data-route-city]').map(n=>n.textContent),['KITEE','SAVONLINNA']);assert.equal(box.children[0],original);
});
test('RUN-045: both booking and geography share saved fares, including editor previews',()=>{
 const read=f=>readFileSync(new URL('../docs/'+f,import.meta.url),'utf8');
 assert.match(read('fare-form.js'),/routeCities\(\{km:cities\}\)/);
 assert.match(read('app.js'),/ownerPreview,config.fares/);
 assert.match(read('site.js'),/renderRouteCities\(doc,fares\)/);
 assert.match(read('editor.js'),/true,publishedFares/);
 assert.match(read('inline-editor.js'),/true,fares/);
});
