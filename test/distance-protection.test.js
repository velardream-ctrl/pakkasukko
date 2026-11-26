import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {distanceSettings,saveDistanceSettings,lookupDistance} from '../src/city-distance.js';
import {defaultFare} from '../docs/fares.js';

function fixture(t){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 t.after(()=>sqlite.close());
 function prepare(sql,args=[]){const st=sqlite.prepare(sql);return {bind:(...values)=>prepare(sql,values),first:async()=>st.get(...args),all:async()=>({results:st.all(...args)}),run:async()=>({meta:{changes:st.run(...args).changes}})};}
 const env={DB:{prepare},SESSION_SECRET:'test-session',GOOGLE_ROUTES_API_KEY:'private-server-key',GOOGLE_MAPS_BROWSER_KEY:'public-browser-key',GOOGLE_MAPS_MAP_ID:'map-id'};
 return {env,sqlite};
}

test('real SQLite: concurrent route attempts stop at 50 in a rolling 24-hour window',async t=>{
 const {env,sqlite}=fixture(t);let calls=0;
 const settings={origin:'Kitee',enabled:true,configured:true,dailyLimit:50};
 const fetcher=async()=>{calls++;return Response.json({routes:[{distanceMeters:400000}]});};
 const results=await Promise.all(Array.from({length:60},()=>lookupDistance(env,'Helsinki',defaultFare,settings,fetcher)));
 assert.equal(calls,50);assert.equal(results.filter(r=>r.kind==='limited').length,10);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM attempts WHERE kind='route-provider'").get().n,50);
 sqlite.exec("UPDATE attempts SET created_at='2000-01-01T00:00:00.000Z'");
 assert.equal((await lookupDistance(env,'Helsinki',defaultFare,settings,fetcher)).kind,'estimate');
 assert.equal(calls,51);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM booking_settings WHERE key='travel_fare'").get().n,0,'no provider results written to tariffs');
});

test('disabled and incomplete bindings do not call Google or expose server credentials',async t=>{
 const {env}=fixture(t);
 const disabled=await distanceSettings(env);assert.equal(disabled.enabled,false);assert.equal(disabled.dailyLimit,50);
 assert.equal(disabled.browserKey,'');assert.equal(disabled.mapId,'');
 assert.ok(!JSON.stringify(disabled).includes(env.GOOGLE_ROUTES_API_KEY));
 assert.equal(await saveDistanceSettings(env,{origin:'Kitee',enabled:true,dailyLimit:50}),true);
 const enabled=await distanceSettings(env);assert.equal(enabled.browserKey,env.GOOGLE_MAPS_BROWSER_KEY);
 assert.ok(!JSON.stringify(enabled).includes(env.GOOGLE_ROUTES_API_KEY));
 delete env.GOOGLE_ROUTES_API_KEY;
 assert.equal(await saveDistanceSettings(env,{origin:'Kitee',enabled:true,dailyLimit:50}),false);
 const settings=await distanceSettings(env);assert.equal(settings.configured,false);
 assert.equal((await lookupDistance(env,'Helsinki',defaultFare,settings,()=>{throw Error('must not call');})).kind,'unknown');
});

test('route API rejects foreign origin and invalid data, and limits one IP to ten hourly attempts',async t=>{
 const {env,sqlite}=fixture(t),url='https://calendar.test/api/distance';
 const request=(body,origin='https://calendar.test')=>worker.fetch(new Request(url,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(body)}),env,{});
 assert.equal((await request({city:'Kitee'},'https://other.test')).status,403);
 assert.equal((await request({city:'Kitee',pin:{lat:0,lng:0}})).status,400);
 for(let i=0;i<10;i++)assert.equal((await request({city:'Хельсинки'})).status,200);
 assert.equal((await request({city:'Helsinki'})).status,429);
 assert.equal(sqlite.prepare("SELECT count(*) n FROM attempts WHERE kind='route-provider'").get().n,0,'disabled provider receives no calls');
});
