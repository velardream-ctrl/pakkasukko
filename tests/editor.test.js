import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../src/worker.js';
import {initial,deviceFor} from '../docs/site.js';
import {currentCopy} from '../src/privacy-copy.js';
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
  function prepare(sql,args=[]){
    const stmt=sqlite.prepare(sql);
    return {bind:(...values)=>prepare(sql,values),first:()=>stmt.get(...args),all:()=>({results:stmt.all(...args)}),run:()=>{const v=stmt.run(...args);return {meta:{changes:v.changes,last_row_id:v.lastInsertRowid}};}};
  }
  const env={DB:{prepare},SESSION_SECRET:crypto.randomUUID(),ADMIN_PASSWORD:crypto.randomUUID()};
  let cookie='';
  async function request(path,body,origin='https://preview.test'){
    const r=await worker.fetch(new Request('https://preview.test/api/'+path,{method:body?'POST':'GET',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env,{});
    if(path==='admin/login'&&r.ok)cookie=r.headers.get('Set-Cookie').split(';')[0];return r;
  }
  return {request,sqlite,login:()=>request('admin/login',{password:env.ADMIN_PASSWORD})};
}
test('draft publication, revision conflict, restoration, session revocation and public isolation',async()=>{
  const {request,login}=fixture(),model=initial();model.texts['top-1']='Зима';model.snow={enabled:false,intensity:0,area:'hero'};
  assert.equal((await request('admin/editor')).status,401);
  assert.equal((await login()).status,200);
  assert.equal((await request('admin/editor',{id:0,model},'https://other.test')).status,403);
  assert.equal((await request('admin/editor',{id:0,model})).status,200);
  assert.deepEqual((await (await request('public-config')).json()).site,{});
  assert.equal((await request('admin/editor',{id:0,model,publish:true})).status,409);
  assert.equal((await request('admin/editor',{id:1,model,publish:true})).status,200);
  assert.deepEqual((await (await request('public-config')).json()).site,model);
  assert.equal((await request('admin/editor',{id:2,restore:1})).status,200);
  assert.equal((await request('bookings',{name:'test'})).status,503);
  assert.equal((await request('admin/logout',{})).status,200);
  assert.equal((await request('admin/export')).status,401);
});
test('calendar conflict, confirmation, cancellation, second booking and completion',async()=>{
  const {request,sqlite,login}=fixture();await login();
  const slot={startAt:'2099-12-22T15:30',minutes:30};
  const id=(await (await request('admin/slots',slot)).json()).id;
  assert.equal((await request('admin/slots',{...slot,status:'blocked'})).status,409);
  for(const key of ['one','two'])sqlite.prepare("INSERT INTO bookings(id,slot_id,service,name,phone,city,address,status,created_at) VALUES(?,?,'gift','test','test','test','test','pending','test')").run(key,id);
  const status=(id,status)=>request('admin/bookings/status',{id,status});
  assert.equal((await status('one','confirmed')).status,200);
  assert.equal((await status('two','confirmed')).status,409);
  assert.equal((await status('one','cancelled')).status,200);
  assert.equal((await status('two','confirmed')).status,200);
  assert.equal((await status('two','completed')).status,200);
  assert.match(await (await request('admin/export')).text(),/completed/);
});
test('login throttling and responsive profiles',async()=>{
  const {request}=fixture();
  for(let i=0;i<8;i++)assert.equal((await request('admin/login',{password:'wrong'})).status,401);
  assert.equal((await request('admin/login',{password:'wrong'})).status,429);
  for(const [w,h,d] of [[320,640,'phone'],[844,390,'phone'],[820,1180,'tablet'],[1180,820,'tablet'],[1440,900,'desktop']])assert.equal(deviceFor(w,h),d);
});

test('obsolete privacy defaults are replaced without rewriting custom content',()=>{
 const model=initial();model.texts={'privacy-0':'ВАШИ ДАННЫЕ — ПОД ЗАЩИТОЙ','privacy-2':"До публикации политики конфиденциальности и реквизитов организатора приём заявок отключён. После запуска данные о бронировании будут использоваться только для согласования мероприятия, храниться в отдельной базе Pakkasukko и не публиковаться в календаре.",'footer-9':' Pakkasukko · Тестовый макет','privacy-3':'Собственный текст владельца'};
 const next=currentCopy(model);assert.match(next.texts['privacy-2'],/соблюдает конфиденциальность/);assert.equal(next.texts['footer-9'],' Pakkasukko');assert.equal(next.texts['privacy-3'],model.texts['privacy-3']);assert.equal(model.texts['privacy-0'],'ВАШИ ДАННЫЕ — ПОД ЗАЩИТОЙ');
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');assert.match(html,/href="\.\/privacy\.html"/);assert.doesNotMatch(html,/Pakkasukko · Тестовый макет/);
});

test('RUN-031: long stock privacy text migrates to short homepage copy',()=>{
 const model=initial();model.texts={'privacy-2':"Каждый праздник — это часть вашей личной истории, и мы относимся к ней с уважением.\n\nДед Мороз Pakkasukko обязуется соблюдать конфиденциальность при посещении частных домов, семейных праздников, детских учреждений и корпоративных мероприятий. Личная информация, семейные обстоятельства, содержание частных разговоров и другие сведения, ставшие известными артисту во время выступления, не разглашаются без соответствующего разрешения, за исключением случаев, предусмотренных законом.\n\nФото- и видеосъёмка со стороны артиста, а также публикация материалов с участием гостей и детей осуществляются только с необходимого предварительного разрешения.\n\nПерсональные данные, предоставленные при бронировании, используются для организации праздника, связи с заказчиком, оказания услуг и выполнения обязательств по законодательству Финляндии.\n\nПусть воспоминания о празднике остаются вашими, а доверие — нашим общим правилом.",'privacy-3':"Подробнее об обработке персональных данных (GDPR) ↗"};
 const next=currentCopy(model);assert.equal(next.texts['privacy-2'],"Дед Мороз Pakkasukko соблюдает конфиденциальность во время семейных и корпоративных праздников, уважает частную жизнь гостей и не разглашает личные сведения без соответствующего разрешения, кроме случаев, предусмотренных законом.");assert.equal(next.texts['privacy-3'],"Подробнее о конфиденциальности и защите данных ↗");
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');assert.ok(html.includes(next.texts['privacy-2']));assert.ok(!html.includes(model.texts['privacy-2']));
 const policy=readFileSync(new URL('../docs/privacy.html',import.meta.url),'utf8');assert.match(policy,/Конфиденциальность во время праздника/);
});

test('music config is public only when enabled and admin is protected',async()=>{const {request,login}=fixture();assert.equal((await request('admin/music/config')).status,401);const config=await (await request('music/config')).json();assert.equal(config.volume,15);assert.equal(config.autoplay,true);assert.deepEqual(config.tracks,[]);await login();assert.equal((await request('admin/music/config')).status,200);assert.equal((await request('admin/music/config',{enabled:true,autoplay:true,volume:15,tracks:[]})).status,503);});
