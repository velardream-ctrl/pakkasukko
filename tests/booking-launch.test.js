import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {defaultFare,quote,prices,prepaymentForVisit,visitQuote} from '../docs/fares.js';

const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
  sqlite.prepare("INSERT INTO booking_settings(key,value) VALUES('travel_fare',?)").run(JSON.stringify({...defaultFare,prepayments:{...defaultFare.prepayments,enabled:false}}));
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

test('booking saves the chosen pin, freezes the approved price, and refuses stale quotes',async()=>{
 const {request,login,sqlite,env}=fixture();
 const {quote}=await import('../docs/fares.js');
 env.DB.batch=async statements=>{sqlite.exec('BEGIN');try{for(const s of statements)s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}};
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare('INSERT INTO booking_settings VALUES(?,?)').run(key,'true');
 await login();
 await request('admin/slots',{startAt:'2099-12-24T10:00',minutes:30});
 const slot=sqlite.prepare('SELECT id FROM slots').get();
 const config=await (await request('public-config')).json();
 const body={service:'gift',city:'Tohmajärvi',slotId:slot.id,name:'Test',address:'Road 1',phone:'123456',turnstileToken:'test',group:true,destinationPin:{lat:62.227,lng:30.332}};
 body.quoteToken=JSON.stringify(quote(config.fares,config.services.gift,body.city,true,['2099-12-24T10:00']));
 const original=globalThis.fetch;
 try{
   globalThis.fetch=async()=>Response.json({success:true});
   const created=await request('bookings',body);assert.equal(created.status,201);
   const {id}=await created.json();
   const saved=()=>JSON.parse(sqlite.prepare('SELECT snapshot FROM booking_quotes WHERE booking_id=?').get(id).snapshot);
   assert.equal(saved().total,5880);
   assert.deepEqual(saved().destinationPin,body.destinationPin);
   const dashboard=await (await request('admin/dashboard')).json();
   assert.deepEqual(JSON.parse(dashboard.bookings.find(b=>b.id===id).quote_snapshot).destinationPin,body.destinationPin);
   assert.equal((await request('admin/travel-fare',{...config.fares,fuel:3})).status,200);
   assert.equal((await request('bookings',body)).status,409);
   assert.equal((await request('admin/bookings/status',{id,status:'confirmed'})).status,200);
   assert.equal(saved().total,5880);
 }finally{globalThis.fetch=original;}
});

test('multiple times keep their own addresses, freeze a single trip and produce immutable invoices',async()=>{
 const {request,login,sqlite,env}=fixture();
 const {quote}=await import('../docs/fares.js');
 env.DB.batch=async statements=>{sqlite.exec('BEGIN');try{for(const s of statements)s.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}};
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare('INSERT INTO booking_settings VALUES(?,?)').run(key,'true');
 await login();
 for(const time of ['10:00','12:00','14:00'])await request('admin/slots',{startAt:'2099-12-24T'+time,minutes:30});
 const [first,second,third]=sqlite.prepare('SELECT id FROM slots ORDER BY start_at').all();
 const config=await (await request('public-config')).json();
 const payload={service:'gift',city:'Tohmajärvi',name:'Test',phone:'123456',turnstileToken:'test',
   visits:[{slotId:second.id,address:'Second 2'},{slotId:first.id,address:'First 1'}]};
 const token=group=>JSON.stringify(quote(config.fares,config.services.gift,payload.city,group,group?['2099-12-24T10:00','2099-12-24T12:00']:['2099-12-24T14:00']));
 const original=globalThis.fetch;
 try{
   globalThis.fetch=async()=>Response.json({success:true});
   const invalid=await request('bookings',{...payload,visits:[payload.visits[0],{slotId:'missing-id',address:'Unknown'}],quoteToken:token(true)});
   assert.equal(invalid.status,409);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
   const response=await request('bookings',{...payload,quoteToken:token(true)});
   assert.equal(response.status,201);
   const {receipts}=await response.json();assert.deepEqual(receipts.map(v=>v.address),['First 1','Second 2']);
   const other=await (await request('bookings',{...payload,visits:[{slotId:third.id,address:'Third 3'}],quoteToken:token(false)})).json();
   const id=receipts[0].id;
   for(const v of [...receipts,...other.receipts])await request('admin/bookings/status',{id:v.id,status:'confirmed'});
   const draftSeller=await (await request('admin/billing/profile')).json();
   Object.assign(draftSeller,{address:'Test street',iban:'FI test',bic:'OKOYFIHH',vatRate:'0',vatNote:'Example only'});
   assert.equal((await request('admin/billing/profile',draftSeller)).status,200);
   const draft=await request('admin/billing/preview?id='+id,{buyer:'Buyer',address:'Test address'});
   assert.equal(draft.status,200);const draftHtml=await draft.text();
   assert.match(draftHtml,/TESTI — EI MAKSETTAVAKSI/);assert.match(draftHtml,/OKOYFIHH/);assert.match(draftHtml,/Joulupukin lyhyt tervehdys/);assert.match(draftHtml,/Артистическая услуга/);assert.match(draftHtml,/Стоимость поездки уточняется/);
   assert.equal((await request('admin/billing/issue?id='+id,{})).status,400);
   assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM invoices').get().n,0);
   assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM trip_shares').get().n,0);
   sqlite.exec("UPDATE slots SET start_at=replace(start_at,'2099','2020'),end_at=replace(end_at,'2099','2020')");
   assert.equal((await request('admin/billing/depart?id='+id,{})).status,200);
   const splits=sqlite.prepare('SELECT * FROM trip_shares ORDER BY share').all();
   assert.deepEqual(splits.map(v=>v.share),[293,293,294]);
   const result=await (await request('trip?id='+id)).json();
   assert.equal(result.maximum,5440);assert.equal(result.share,294);
   const seller=await (await request('admin/billing/profile')).json();
   Object.assign(seller,{address:'Test street',iban:'FI test',vatRate:'0',vatNote:'Example only'});
   assert.equal((await request('admin/billing/profile',seller)).status,200);
   const issue=()=>request('admin/billing/issue?id='+id,{buyer:'Buyer',address:'Test address',serviceFi:'Esiintymispalvelu – Joulupukin kotikäynti',serviceRu:'Выступление Деда Мороза на дому'});
   assert.equal((await issue()).status,200);await issue();
   const invoices=sqlite.prepare('SELECT * FROM invoices').all();assert.equal(invoices.length,1);
   assert.equal(JSON.parse(invoices[0].document).total,5294);assert.equal(JSON.parse(invoices[0].document).serviceFi,'Esiintymispalvelu – Joulupukin kotikäynti');
   const view=await request('admin/billing/view?id='+id);
   assert.equal(view.status,200);assert.match(view.headers.get('content-type'),/text\/html/);
   const html=await view.text();assert.ok(html.includes('52,94 €'));assert.ok(html.includes('Открыть PDF'));
 }finally{globalThis.fetch=original;}
});

test('Santa mail uses protected existing inbox and never exposes owner email',async()=>{
 const {request,env,sqlite,login}=fixture();Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare('INSERT INTO booking_settings VALUES(?,?)').run(key,'true');
 const original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({success:true});const result=await request('messages',{name:'Test',contact:'client@example.test',topic:'Сотрудничество',message:'Testing Santa mail',turnstileToken:'test'});assert.equal(result.status,201);const saved=sqlite.prepare('SELECT * FROM messages').get();assert.match(saved.message,/Сотрудничество/);assert.equal(saved.contact,'client@example.test');assert.equal(saved.status,'unread');assert.equal((await request('admin/dashboard')).status,401);await login();const dashboard=await (await request('admin/dashboard')).json();assert.equal(dashboard.messages.length,1);assert.doesNotMatch(JSON.stringify(await (await request('public-config')).json()),/owner@example.test/);}finally{globalThis.fetch=original;}
 const html=readFileSync(new URL('../docs/contact.html',import.meta.url),'utf8');assert.match(html,/letterForm/);assert.match(html,/privacy\.html/);assert.doesNotMatch(html,/@gmail\.com/);
});

test('RUN-037: video delivery requires seven days and never reserves a visit slot',async()=>{
 const {request,env,sqlite,login}=fixture();const {earliestDelivery,helsinkiDay}=await import('../docs/video-service.js');
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare('INSERT INTO booking_settings VALUES(?,?)').run(key,'true');
 sqlite.prepare('INSERT INTO site_revisions(body,published,created_at) VALUES(?,1,?)').run(JSON.stringify({cards:[{id:'video-test',title:'Видео поздравление Деда Мороза',price:'50 €'}]}),'test');
 const original=globalThis.fetch;
 try{
 globalThis.fetch=async()=>Response.json({success:true});
 const payload={service:'video-test',name:'Test',email:'client@example.test',message:'Greeting',turnstileToken:'test',submissionKey:crypto.randomUUID()};
 assert.equal((await request('video-orders',{...payload,deliveryDate:helsinkiDay()})).status,400);
 const data={...payload,deliveryDate:earliestDelivery(helsinkiDay())};
 const a=await request('video-orders',data);assert.equal(a.status,201);const {id}=await a.json();
 assert.equal((await request('video-orders',data)).status,201);
 assert.equal((await request('video-orders',{...data,submissionKey:crypto.randomUUID()})).status,201);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM video_orders').get().n,2);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM slots').get().n,0);
 assert.equal((await request('bookings',data)).status,400);
 assert.equal((await request('admin/video-orders')).status,401);await login();
 assert.equal((await request('admin/video-orders/update',{id,deliveryDate:data.deliveryDate,status:'confirmed'})).status,200);
 assert.equal((await request('admin/video-orders/delete',{id})).status,409);
 assert.equal((await request('admin/video-orders/update',{id,deliveryDate:data.deliveryDate,status:'cancelled'})).status,200);
 assert.equal((await request('admin/video-orders/delete',{id})).status,200);
 }finally{globalThis.fetch=original;}
});

test('RUN-038: explicit service modes override names and support original cards',async()=>{
 const {request,env,sqlite,login}=fixture();
 const {deliveryConfig,earliestDelivery,helsinkiDay}=await import('../docs/video-service.js');
 const {prices,quote}=await import('../docs/fares.js');
 const model={cards:[{id:'video',title:'Видео поздравление',price:'50 €'},{id:'new',title:'Подарок',price:'20 €'}],deliveryModes:{gift:{mode:'delivery',days:2},video:{mode:'visit',days:7},new:{mode:'delivery',days:0}}};
 assert.equal(deliveryConfig(model,'gift').days,2);assert.equal(deliveryConfig(model,'video').mode,'visit');
 assert.equal(deliveryConfig({cards:model.cards},'video').mode,'delivery');assert.equal(deliveryConfig(model,'new').days,0);
 assert.equal(prices(model).video.remote,false);assert.equal(prices(model).gift.remote,true);
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare('INSERT INTO booking_settings VALUES(?,?)').run(key,'true');
 sqlite.prepare('INSERT INTO site_revisions(body,published,created_at) VALUES(?,1,?)').run(JSON.stringify(model),'test');
 const original=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({success:true});
 const data={service:'gift',name:'Test',email:'client@example.test',turnstileToken:'test',submissionKey:crypto.randomUUID()};
 assert.equal((await request('video-orders',{...data,deliveryDate:helsinkiDay()})).status,400);
 assert.equal((await request('video-orders',{...data,deliveryDate:earliestDelivery(helsinkiDay(),2)})).status,201);
 assert.equal((await request('video-orders',{...data,service:'video',submissionKey:crypto.randomUUID(),deliveryDate:earliestDelivery(helsinkiDay(),7)})).status,409);
 assert.equal((await request('video-orders',{...data,service:'new',submissionKey:crypto.randomUUID(),deliveryDate:helsinkiDay()})).status,201);
 assert.equal((await request('bookings',data)).status,400);
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM slots').get().n,0);
 await login();assert.equal((await request('admin/video-orders')).status,200);
 }finally{globalThis.fetch=original;}
});

test('holiday tariff edits persist across separate admin dashboard reads, and invalid dates do not overwrite saved rules',async()=>{
 const {request,login}=fixture();
 await login();
 const current=(await (await request('admin/dashboard')).json()).fares;
 const rules=[
  {name:'Рождество, вечер',startDate:'24.12',startTime:'20:00',endDate:'24.12',endTime:'23:00',percent:50},
  {name:'Рождество, ночь',startDate:'24.12',startTime:'23:00',endDate:'25.12',endTime:'03:00',percent:100},
  {name:'Дополнительный праздник',startDate:'07.01',startTime:'20:00',endDate:'08.01',endTime:'09:00',percent:75}
 ];
 const changed={...current,holidayRules:rules,holidaySort:'percent_desc'};
 const response=await request('admin/travel-fare',changed);
 assert.equal(response.status,200);
 const stored=(await (await request('admin/dashboard')).json()).fares;
 assert.deepEqual(stored.holidayRules,rules);
 assert.equal(stored.holidaySort,'percent_desc');
 const publicFare=(await (await request('public-config')).json()).fares;
 assert.deepEqual(publicFare.holidayRules,rules);
 const invalid={...stored,holidayRules:rules.map((rule,i)=>i===2?{...rule,endDate:'25.12'}:rule)};
 assert.equal((await request('admin/travel-fare',invalid)).status,400);
 const afterError=(await (await request('admin/dashboard')).json()).fares;
 assert.deepEqual(afterError.holidayRules,rules,'invalid form must not wipe previously saved intervals');
});

test('owner-set performer rates persist; quotes are server-priced and require a long enough slot',async()=>{
 const {request,login,sqlite,env}=fixture();
 const {quote,performanceChoice}=await import('../docs/fares.js');
 env.DB.batch=async statements=>{sqlite.exec('BEGIN');try{for(const step of statements)step.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}};
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare('INSERT INTO booking_settings VALUES(?,?)').run(key,'true');
 await login();
 const base=(await (await request('admin/dashboard')).json()).fares;
 const performance={enabled:true,rates:{home:[{minutes:30,solo:10000,duo:15000},{minutes:60,solo:16000,duo:25000}]}};
 assert.equal((await request('admin/travel-fare',{...base,performance})).status,200);
 const config=await (await request('public-config')).json();
 assert.deepEqual(config.fares.performance,performance);
 assert.equal((await request('admin/slots',{startAt:'2099-12-26T10:00',minutes:30})).status,201);
 assert.equal((await request('admin/slots',{startAt:'2099-12-26T11:00',minutes:60})).status,201);
 const [short,long]=sqlite.prepare('SELECT id,start_at FROM slots ORDER BY start_at').all();
 const choice=performanceChoice(config.fares,'home',60,'duo');
 const baseBody={service:'home',city:'Kitee',name:'Test',address:'Road 1',phone:'123456',turnstileToken:'test',
  performanceMinutes:60,performerCast:'duo'};
 const token=(slot,performance=choice)=>JSON.stringify(quote(config.fares,config.services.home,'Kitee',false,[slot.start_at],performance));
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({success:true});
  assert.equal((await request('bookings',{...baseBody,slotId:short.id,quoteToken:token(short)})).status,409,'cannot fit a 60-minute visit in a 30-minute slot');
  assert.equal((await request('bookings',{...baseBody,slotId:long.id,quoteToken:token(long,{...choice,amount:1})})).status,409,'client cannot invent a lower amount');
  const accepted=await request('bookings',{...baseBody,slotId:long.id,quoteToken:token(long)});
  assert.equal(accepted.status,201);
  const {id,summary}=await accepted.json();
  assert.match(summary,/Снегурочка/);
  const snapshot=JSON.parse(sqlite.prepare('SELECT snapshot FROM booking_quotes WHERE booking_id=?').get(id).snapshot);
  assert.equal(snapshot.base,25000);
  assert.equal(snapshot.durationMinutes,60);
  assert.equal(snapshot.performerCast,'duo');
 }finally{globalThis.fetch=original;}
});

test('advance invoice reserves a slot, bank confirmation is manual, final quote deducts paid advance and refund',async()=>{
 const {request,login,sqlite,env}=fixture();
 env.DB.batch=async statements=>{sqlite.exec('BEGIN');try{for(const statement of statements)statement.run();sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}};
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare("INSERT INTO booking_settings(key,value) VALUES(?,?)").run(key,'true');
 sqlite.prepare("INSERT INTO booking_settings(key,value) VALUES('billing_profile',?)").run(JSON.stringify({name:'Karjalas',owner:'Artist',businessId:'3445587-1',address:'Kitee Finland',iban:'FI0000',bic:'ABCDFIHH',contact:'',vatRate:'0',vatId:'',vatNote:'No VAT',terms:'14',logo:''}));
 await login();
 const tariff={...defaultFare,prepayments:{enabled:true,dueDays:14,defaultRule:{mode:'fixed',percent:0,amount:5000},rules:{}}};
 assert.equal((await request('admin/travel-fare',tariff)).status,200);
 await request('admin/slots',{startAt:'2099-12-21T18:00',minutes:30});
 const slot=sqlite.prepare('SELECT id FROM slots').get();
 const config=await (await request('public-config')).json();
 const input={service:'home',city:'Joensuu',slotId:slot.id,name:'Семья',address:'Winter street 1',phone:'1234567',
  turnstileToken:'abc',prepaymentTerms:'accepted',quoteToken:JSON.stringify(quote(config.fares,config.services.home,'Joensuu',false,['2099-12-21T18:00']))};
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({success:true});
  const booked=await request('bookings',input);assert.equal(booked.status,201);
  const {id}=await booked.json();
  const saved=JSON.parse(sqlite.prepare('SELECT snapshot FROM booking_quotes WHERE booking_id=?').get(id).snapshot);
  assert.equal(saved.prepayment.amount,5000);
  assert.equal((await request('admin/bookings/status',{id,status:'confirmed'})).status,409,'deposit cannot be silently skipped');
  assert.equal((await request('admin/prepayments/request?id='+id,{})).status,200);
  assert.equal(sqlite.prepare('SELECT status FROM slots WHERE id=?').get(slot.id).status,'reserved');
  const advance=sqlite.prepare('SELECT * FROM prepayment_requests WHERE booking_id=?').get(id);
  assert.equal(advance.amount,5000);
  assert.equal(advance.status,'requested');
  assert.equal((await request('admin/prepayments/view?id='+id)).status,200);
  assert.match(await (await request('admin/prepayments/view?id='+id)).text(),/Ennakkolasku/);
  assert.equal((await request('admin/prepayments/paid?id='+id,{note:''})).status,400);
  assert.equal((await request('admin/prepayments/paid?id='+id,{note:'Bank statement checked'})).status,200);
  assert.equal(sqlite.prepare('SELECT status FROM prepayment_requests WHERE booking_id=?').get(id).status,'paid');
  const draft=await request('admin/billing/preview?id='+id,{buyer:'Семья',address:'Kitee'});
  assert.equal(draft.status,200);
  assert.match(await draft.text(),/Полученная предоплата/);
  assert.match(await (await request('admin/billing/preview?id='+id,{buyer:'Семья',address:'Kitee'})).text(),/79,48 €/, '129.48 minus 50 deposit');
  assert.equal((await request('admin/prepayments/refund?id='+id,{amount:1500,note:'Partial refund bank checked'})).status,200);
  const newDraft=await request('admin/billing/preview?id='+id,{buyer:'Семья',address:'Kitee'});
  assert.match(await newDraft.text(),/94,48 €/, 'new balance subtracts only 35 euro after partial refund');
  assert.equal((await request('admin/bookings/delete',{id})).status,409,'financial documents block deletion');
 }finally{globalThis.fetch=original;}
});

test('Stripe links remain private and signed webhooks alone confirm the 50 euro deposit',async()=>{
 const {request,login,sqlite,env}=fixture();
 env.DB.batch=async statements=>{sqlite.exec('BEGIN');try{for(const statement of statements)statement.run();sqlite.exec('COMMIT');}catch(error){sqlite.exec('ROLLBACK');throw error;}};
 Object.assign(env,{TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET:'secret',OWNER_EMAIL:'owner@example.test',FROM_EMAIL:'from@example.test',RESEND_API_KEY:'test',
  STRIPE_SECRET_KEY:'sk_test_testkey',STRIPE_WEBHOOK_SECRET:'whsec_somethingsecret'});
 for(const key of ['enabled','mail_test','mail_received','privacy_confirmed'])sqlite.prepare("INSERT INTO booking_settings(key,value) VALUES(?,?)").run(key,'true');
 sqlite.prepare("INSERT INTO booking_settings(key,value) VALUES('billing_profile',?)").run(JSON.stringify({name:'Karjalas',owner:'Artist',businessId:'3445587-1',address:'Finland',iban:'FI123',bic:'',contact:'',vatRate:'0',vatId:'',vatNote:'No VAT',terms:'14',logo:''}));
 await login();
 const fare={...defaultFare,prepayments:{enabled:true,dueDays:14,defaultRule:{mode:'fixed',percent:0,amount:5000},rules:{}}};
 await request('admin/travel-fare',fare);
 await request('admin/slots',{startAt:'2099-12-21T17:00',minutes:30});
 const slot=sqlite.prepare('SELECT id FROM slots').get();
 const publicCfg=await (await request('public-config')).json();
 const booking={service:'home',city:'Kitee',slotId:slot.id,name:'Client',phone:'1234567',address:'North 1',email:'client@example.test',
  turnstileToken:'abc',prepaymentTerms:'accepted',quoteToken:JSON.stringify(quote(publicCfg.fares,publicCfg.services.home,'Kitee',false,['2099-12-21T17:00']))};
 const original=globalThis.fetch;
 try{
  globalThis.fetch=async(target,options)=>{
   if(String(target).includes('turnstile'))return Response.json({success:true});
   if(String(target).includes('/v1/checkout/sessions')){
    assert.match(options.headers.Authorization,/sk_test_/);
    const form=new URLSearchParams(options.body);
    assert.equal(form.get('line_items[0][price_data][unit_amount]'),'5000');
    return Response.json({id:'cs_test_test_checkout',url:'https://checkout.stripe.com/c/pay/example',amount_total:5000,currency:'eur',expires_at:Math.floor(Date.now()/1000)+86400});
   }
   throw Error('Unexpected external request '+target);
  };
  const created=await request('bookings',booking);assert.equal(created.status,201);
  const {id}=await created.json();
  assert.equal((await request('admin/stripe/status')).status,200);
  assert.equal((await request('admin/stripe/checkout-link?id='+id,{})).status,409,'advance invoice is required');
  assert.equal((await request('admin/prepayments/request?id='+id,{})).status,200);
  const link=await (await request('admin/stripe/checkout-link?id='+id,{})).json();
  assert.equal(link.amount,5000);assert.match(link.url,/stripe/);
  assert.equal((await request('admin/stripe/checkout-link?id='+id,{})).status,200,'reuses active session');
  const body=JSON.stringify({id:'evt_test1',type:'checkout.session.completed',data:{object:{
   id:'cs_test_test_checkout',payment_status:'paid',amount_total:5000,currency:'eur',client_reference_id:id,payment_intent:'pi_test_payment'
  }}});
  async function webhook(data,valid=true){
   const stamp=Math.floor(Date.now()/1000),k=await crypto.subtle.importKey('raw',new TextEncoder().encode('whsec_somethingsecret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);
   const signed=await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(stamp+'.'+data));
   const hex=Array.from(new Uint8Array(signed)).map(n=>n.toString(16).padStart(2,'0')).join('');
   return worker.fetch(new Request('https://calendar.test/api/stripe/webhook',{method:'POST',headers:{'Stripe-Signature':'t='+stamp+',v1='+(valid?hex:'0'.repeat(64))},body:data}),env,{waitUntil:()=>{}});
  }
  assert.equal((await webhook(body,false)).status,400);
  assert.equal(sqlite.prepare('SELECT status FROM prepayment_requests WHERE booking_id=?').get(id).status,'requested');
  assert.equal((await webhook(body)).status,200);
  assert.equal(sqlite.prepare('SELECT status FROM prepayment_requests WHERE booking_id=?').get(id).status,'paid');
  assert.equal((await webhook(body)).status,200,'replayed event is idempotent');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM prepayment_events WHERE booking_id=? AND action='paid'").get(id).n,1);
  assert.equal((await request('admin/prepayments/refund?id='+id,{amount:1000,note:'bank refund'})).status,409,'card refunds are handled via Stripe');
  const refunded=JSON.stringify({id:'evt_test2',type:'charge.refunded',data:{object:{id:'ch_test',payment_intent:'pi_test_payment',currency:'eur',amount_refunded:1200}}});
  assert.equal((await webhook(refunded)).status,200);
  assert.equal(sqlite.prepare('SELECT refunded_amount FROM prepayment_requests WHERE booking_id=?').get(id).refunded_amount,1200);
 }finally{globalThis.fetch=original;}
});
