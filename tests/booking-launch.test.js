import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';

const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
 function prepare(sql,args=[]){
  const statement=sqlite.prepare(sql);
  return {bind:(...values)=>prepare(sql,values),first:()=>statement.get(...args),all:()=>({results:statement.all(...args)}),
   run:()=>{const r=statement.run(...args);return {meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};}};
 }
 const env={DB:{prepare},SESSION_SECRET:crypto.randomUUID(),ADMIN_PASSWORD:'a_very_good_test_password',ACCEPT_BOOKINGS:'true'};
 let cookie='';
 async function request(path,body){
  const response=await worker.fetch(new Request('https://calendar.test/api/'+path,{
   method:body===undefined?'GET':'POST',headers:{Origin:'https://calendar.test',Cookie:cookie,'Content-Type':'application/json'},
   body:body===undefined?undefined:JSON.stringify(body)
  }),env,{waitUntil:()=>{}});
  if(path==='admin/login'&&response.ok)cookie=response.headers.get('Set-Cookie').split(';')[0];
  return response;
 }
 return {env,sqlite,request,login:()=>request('admin/login',{password:env.ADMIN_PASSWORD})};
}
test('public can see free dates even when bookings are switched off',async()=>{
 const {request,login}=fixture();
 await login();
 const slot=await request('admin/slots',{startAt:'2099-12-27T18:00',minutes:30,status:'open'});
 assert.equal(slot.status,201);
 const slots=await (await request('slots')).json();
 assert.equal(slots.slots.length,1);
 assert.equal(slots.slots[0].status,'open');
 const publicSettings=await (await request('public-config')).json();
 assert.equal(publicSettings.bookingsEnabled,false);
 assert.equal(publicSettings.turnstileSiteKey,'');
 const invalid=await request('bookings',{slotId:'test'});
 assert.equal(invalid.status,503);
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../docs/app.js',import.meta.url),'utf8');
 assert.match(app,/fetch\('\/api\/slots'/);
 assert.match(app,/const selectable=Boolean\(config.bookingsEnabled&&config.turnstileSiteKey\)/);
 assert.match(html,/Загружаем свободные даты/);
 assert.doesNotMatch(html,/Подключение защищённого календаря ещё не завершено/);
});
test('booking on/off is protected and requires Turnstile, email test and owner verification',async()=>{
 const {request,env}=fixture();
 assert.equal((await request('admin/booking-state')).status,401);
 await request('admin/login',{password:env.ADMIN_PASSWORD});
 let state=await (await request('admin/booking-state')).json();
 assert.equal(state.enabled,false);
 assert.equal(state.emailConfigured,false);
 assert.equal((await request('admin/booking-state',{enabled:true,mailReceived:true,privacyConfirmed:true})).status,409);
 env.TURNSTILE_SITE_KEY='1x00000000000000000000AA';
 env.TURNSTILE_SECRET='secret-test';
 env.RESEND_API_KEY='not-real';
 env.OWNER_EMAIL='owner@example.invalid';
 env.FROM_EMAIL='test@example.invalid';
 const r1=await request('admin/booking-state',{enabled:true,mailReceived:true,privacyConfirmed:true});
 assert.equal(r1.status,409,'no email test');
 const originalFetch=globalThis.fetch;
 try{
  globalThis.fetch=async(uri)=>{assert.equal(uri,'https://api.resend.com/emails');return new Response(JSON.stringify({id:'accepted'}),{status:200});};
  const mailed=await request('admin/email-test',{});
  assert.equal(mailed.status,200);
 }finally{globalThis.fetch=originalFetch;}
 state=await (await request('admin/booking-state')).json();
 assert.equal(state.mailTestSent,true);
 assert.equal(state.enabled,false);
 assert.equal((await request('admin/booking-state',{enabled:true,mailReceived:false,privacyConfirmed:true})).status,409);
 const enabled=await request('admin/booking-state',{enabled:true,mailReceived:true,privacyConfirmed:true});
 assert.equal(enabled.status,200);
 const active=await (await request('public-config')).json();
 assert.equal(active.bookingsEnabled,true);
 assert.equal(active.turnstileSiteKey,env.TURNSTILE_SITE_KEY);
 await request('admin/booking-state',{enabled:false});
 const disabled=await (await request('public-config')).json();
 assert.equal(disabled.bookingsEnabled,false);
 assert.equal(disabled.turnstileSiteKey,'');
});
test('deploy preserves external mail configuration requirements and does not auto-start on new D1',()=>{
 const config=readFileSync(new URL('../wrangler.toml',import.meta.url),'utf8');
 const deployment=readFileSync(new URL('../scripts/deploy-preview.mjs',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../.github/workflows/pakkasukko-deploy.yml',import.meta.url),'utf8');
 assert.match(config,/ACCEPT_BOOKINGS = "true"/);
 assert.match(deployment,/PAKKASUKKO_TURNSTILE_SECRET/);
 assert.match(deployment,/PAKKASUKKO_RESEND_API_KEY/);
 assert.match(workflow,/secrets.PAKKASUKKO_OWNER_EMAIL/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS booking_settings/);
});
