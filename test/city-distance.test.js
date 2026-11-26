import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedCity,validCityQuery,mapsLink,fuelEstimate,distanceDefaults} from '../docs/city-distance.js';
import {lookupDistance} from '../src/city-distance.js';
import {defaultFare,quote} from '../docs/fares.js';
test('known names in Finnish and Russian match approved city tariffs',()=>{
 assert.equal(approvedCity(defaultFare,' ЙОЭНСУУ '),'Joensuu');
 assert.equal(approvedCity(defaultFare,'ките'),'Kitee');
 assert.equal(approvedCity(defaultFare,'хельсинки'),null);
 assert.equal(quote(defaultFare,{label:'60 €'},'Йоэнсуу').city,'Joensuu');
 assert.equal(validCityQuery('Helsinki 123'),false);
 assert.match(mapsLink('Kitee','Хельсинки'),/destination=helsinki%2C\+Finland/);
 assert.equal(fuelEstimate(67,defaultFare),2948);
});
test('unknown city keeps agreed-only quote; live provider disabled by default',async()=>{
 const env={};assert.equal((await lookupDistance(env,'Хельсинки',defaultFare,distanceDefaults)).kind,'unknown');
 assert.equal(quote(defaultFare,{label:'60 €'},'Хельсинки').total,null);
 assert.equal((await lookupDistance(env,'Йоэнсуу',defaultFare,distanceDefaults)).km,67);
});
test('live route returns only transient estimate; global cap enforced',async()=>{
 let permitted=true;const env={GOOGLE_ROUTES_API_KEY:'test',DB:{prepare:()=>({bind:()=>({run:async()=>({meta:{changes:permitted?1:0}})})})}};
 const s={origin:'Kitee',enabled:true,configured:true,dailyLimit:50};
 const fake=async(url,options)=>{assert.equal(JSON.parse(options.body).destination.address,'helsinki, Finland');assert.equal(options.headers['X-Goog-Api-Key'],'test');return Response.json({routes:[{distanceMeters:400100}]});};
 assert.deepEqual(await lookupDistance(env,'Хельсинки',defaultFare,s,fake),{kind:'estimate',origin:'Kitee',km:401,provider:'Google Maps'});
 permitted=false;assert.equal((await lookupDistance(env,'Helsinki',defaultFare,s,()=>{throw Error('must not call');})).kind,'limited');
});

test('pin routing submits chosen coordinates, not customer name or address',async()=>{
 const env={GOOGLE_ROUTES_API_KEY:'test',DB:{prepare:()=>({bind:()=>({run:async()=>({meta:{changes:1}})})})}};const s={origin:'Kitee',enabled:true,configured:true,dailyLimit:50};
 const pin={lat:60.17,lng:24.94};let calls=0;
 const fake=async(url,opt)=>{calls++;const q=JSON.parse(opt.body);assert.deepEqual(q.destination,{location:{latLng:{latitude:60.17,longitude:24.94}}});return Response.json({routes:[{distanceMeters:400100}]});};
 assert.equal((await lookupDistance(env,'Хельсинки',defaultFare,s,fake,pin)).km,401);
 assert.equal((await lookupDistance(env,'Хельсинки',defaultFare,s,fake,{lat:0,lng:0})).kind,'unknown');assert.equal(calls,1);
});
