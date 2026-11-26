import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountFares} from '../docs/fare-form.js';
import {defaultFare,quote,visitQuote,euros} from '../docs/fares.js';
import {fuelEstimate} from '../docs/city-distance.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(){for(let i=0;i<5;i++)await tick();}
function fixture(t,{route,geocode}={}){
 const dom=new JSDOM('<form><label>Программа<select name="service"><option value="home">Дом</option><option value="video">Видео</option></select></label><div class="form-row"><label>Город<input name="city"></label><label>Адрес<input name="address" value="Testikatu 1"></label></div></form>',{url:'https://calendar.test'});
 const saved=Object.fromEntries(['window','document','Option','google','fetch'].map(k=>[k,globalThis[k]]));
 Object.assign(globalThis,{window:dom.window,document:dom.window.document,Option:dom.window.Option});
 t.after(()=>{for(const [key,value] of Object.entries(saved)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}dom.window.close();});
 const maps=[],requests=[],geocodes=[];
 class FakeMap{
  constructor(){maps.push(this);}
  addListener(event,fn){this.click=pin=>fn({latLng:{toJSON:()=>pin}});return {remove:()=>{this.click=()=>{};}};}
  setCenter(p){this.center=p;}
  setZoom(z){this.zoom=z;}
 }
 class FakeGeocoder{geocode(options){geocodes.push(options);return geocode?geocode(options):Promise.resolve({results:[{geometry:{location:{toJSON:()=>({lat:62.1,lng:30.1})}},formatted_address:'DO NOT COPY GOOGLE FORMATTED ADDRESS'}]});}}
 class Marker{constructor(options){Object.assign(this,options);}}
 const google={maps:{importLibrary:async name=>({maps:{Map:FakeMap},geocoding:{Geocoder:FakeGeocoder},marker:{AdvancedMarkerElement:Marker}}[name])}};
 Object.assign(globalThis,{google,fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return route?route(url,options):Response.json({kind:'estimate',origin:'Kitee',km:401,provider:'Google Maps'});}});
 dom.window.google=google;
 const form=document.querySelector('form'),config={fares:structuredClone(defaultFare),services:{home:{label:'60 €',remote:false},video:{label:'25 €',remote:true}},distanceLookup:{origin:'Kitee',enabled:true,configured:true,browserKey:'browser-test-key',mapId:'test-map-id',dailyLimit:50}};
 config.fares.performance={enabled:false,rates:{}};
 const fares=mountFares(form,config),select=form.querySelector('[aria-label="Город праздника"]');
 const button=text=>[...form.querySelectorAll('button')].find(b=>b.textContent===text);
 const change=(element,value)=>{element.value=value;element.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const other=city=>{change(select,'Другой город');change(form.elements.city,city);};
 return {dom,form,config,fares,select,button,change,other,maps,requests,geocodes};
}

test('listed cities can select a pin while their approved tariffs remain authoritative',async t=>{
 const f=fixture(t);
 for(const city of ['Kitee','Joensuu','Tohmajärvi']){
  f.change(f.select,city);
  const open=f.button('Выбрать адрес на карте');assert.equal(open.hidden,false);assert.equal(open.disabled,false);
  await open.onclick();f.maps.at(-1).click({lat:62.1,lng:30.1});await settled();
  const payload=f.fares.payload();assert.deepEqual(payload.destinationPin,{lat:62.1,lng:30.1});
  assert.equal(f.requests.at(-1).city,city);
  const snapshot=JSON.parse(payload.quoteToken);
  assert.equal(snapshot.total,quote(f.config.fares,f.config.services.home,city).total);
  assert.match(f.form.querySelector('.city-distance-help').textContent,/туда и обратно ≈ 802 км/);
  assert.match(f.form.querySelector('.city-distance-help').textContent,/утверждённый тариф/);
 }
});

test('Russian and Finnish unknown cities show transient fuel and full price including holiday program',async t=>{
 const f=fixture(t);
 f.fares.setSlots([{id:'s1',start_at:'2099-12-31T22:00'}]);
 for(const city of ['Хельсинки','Helsinki','Kuopio','Савонлинна']){
  f.other(city);await f.button('Рассчитать расстояние').onclick();
  assert.equal(f.requests.at(-1).city,city);
  const q=JSON.parse(f.fares.payload().quoteToken);
  const amount=visitQuote(q,1,0).base+fuelEstimate(401,f.config.fares);
  assert.ok(f.form.querySelector('.fare-summary').textContent.includes('Предварительно '+euros(amount)));
  assert.equal(q.travel,null,'provider estimate never becomes an approved or payable tariff');
  assert.equal(q.total,null);
  assert.equal(Object.hasOwn(f.config.fares.km,city),false);
 }
 f.change(f.form.elements.service,'video');
 assert.equal(f.form.querySelector('.city-distance-help').hidden,true);
 assert.ok(!f.form.querySelector('.fare-summary').textContent.includes('Предварительно'));
 assert.equal(f.fares.payload().destinationPin,undefined);
});

test('editing map search clears the old pin, does not copy Google address content, and needs a new click',async t=>{
 const f=fixture(t);f.other('Helsinki');await f.button('Выбрать адрес на карте').onclick();
 f.maps[0].click({lat:60.17,lng:24.94});await settled();
 assert.ok(f.fares.payload().destinationPin);
 const search=f.form.querySelector('[aria-label="Адрес на карте"]');
 f.change(search,'Mannerheimintie 1');assert.equal(f.fares.payload().destinationPin,undefined);
 await f.button('Найти адрес').onclick();
 assert.equal(f.geocodes.at(-1).address,'Mannerheimintie 1, Helsinki, Finland');
 assert.equal(f.form.elements.address.value,'Mannerheimintie 1');
 assert.equal(f.fares.payload().destinationPin,undefined);
 assert.ok(!f.form.textContent.includes('DO NOT COPY GOOGLE FORMATTED ADDRESS'));
 f.maps[0].click({lat:60.17,lng:24.94});await settled();assert.ok(f.fares.payload().destinationPin);
 f.fares.addressChanged();assert.equal(f.fares.payload().destinationPin,undefined);
});

test('late route responses and removed map callbacks cannot restore a point after group or city changes',async t=>{
 let complete;
 const f=fixture(t,{route:()=>new Promise(resolve=>{complete=resolve;})});
 f.other('Helsinki');await f.button('Выбрать адрес на карте').onclick();
 const oldMap=f.maps[0];oldMap.click({lat:60.17,lng:24.94});
 f.fares.setCount(2);complete(Response.json({kind:'estimate',origin:'Kitee',km:401}));await settled();
 assert.equal(f.fares.payload().destinationPin,undefined);
 assert.ok(!f.form.querySelector('.fare-summary').textContent.includes('Предварительно'));
 const requestCount=f.requests.length;oldMap.click({lat:62,lng:30});await settled();assert.equal(f.requests.length,requestCount);
 f.fares.setCount(1);f.change(f.select,'Joensuu');
 assert.equal(f.fares.payload().destinationPin,undefined);
});

test('disabled maps, provider failure and rate limit preserve the manual form and approved price',async t=>{
 let quota=false;
 const f=fixture(t,{route:async()=>quota?Response.json({error:'limited'},{status:429}):Response.json({kind:'unknown'})});
 await f.button('Выбрать адрес на карте').onclick();f.maps[0].click({lat:62.1,lng:30.1});await settled();
 assert.match(f.form.querySelector('.city-distance-help').textContent,/Расстояние сейчас недоступно/);
 assert.equal(JSON.parse(f.fares.payload().quoteToken).total,6000);
 quota=true;await f.button('Рассчитать расстояние').onclick();
 assert.match(f.form.querySelector('.city-distance-help').textContent,/Лимит расчётов исчерпан/);
 f.config.distanceLookup.enabled=false;f.fares.update();
 assert.equal(f.button('Выбрать адрес на карте').hidden,true);
 assert.equal(f.fares.payload().destinationPin,undefined);
 assert.equal(JSON.parse(f.fares.payload().quoteToken).total,6000);
 assert.equal(f.form.elements.address.disabled,false);
});

test('closing during city geocoding prevents late results from changing the next city',async t=>{
 let complete;
 const f=fixture(t,{geocode:()=>new Promise(resolve=>{complete=resolve;})});
 const opening=f.button('Выбрать адрес на карте').onclick();await settled();
 assert.equal(typeof complete,'function');
 f.change(f.select,'Joensuu');complete({results:[{geometry:{location:{toJSON:()=>({lat:60.17,lng:24.94})}}}]});await opening;
 assert.equal(f.maps[0].center,undefined);assert.equal(f.fares.payload().destinationPin,undefined);
 assert.equal(f.fares.payload().city,'Joensuu');
});
