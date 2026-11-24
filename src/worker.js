import {defaultFare,validFare,prices,quote,describe} from '../docs/fares.js';
import {mediaAPI} from './media.js';
import {published,editorAPI} from './editor.js';
import {DEFAULT_CONTENT,clean,normalizeContent,validStamp,addMinutes,validateBooking,csvCell} from './validation.js';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const fail=(message,status=400)=>reply({error:message},status);
const now=()=>new Date().toISOString();
const bookingCredentials=env=>Boolean(env.DB&&env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY&&env.OWNER_EMAIL&&env.FROM_EMAIL&&env.RESEND_API_KEY);
async function setting(env,key){
 if(!env.DB)return '';
 const row=await env.DB.prepare('SELECT value FROM booking_settings WHERE key=?').bind(key).first();
 return row?.value||'';
}
async function setSetting(env,key,value){
 await env.DB.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();
}
async function fareSettings(env){
 const saved=await setting(env,'travel_fare');
 return saved?JSON.parse(saved):defaultFare;
}
async function bookingState(env){
 const [enabled,mailTest,mailReceived,privacyConfirmed]=await Promise.all([
   setting(env,'enabled'),setting(env,'mail_test'),setting(env,'mail_received'),setting(env,'privacy_confirmed')
 ]);
 const missing=[];
 if(!env.DB)missing.push('Отдельная база D1');
 if(env.ACCEPT_BOOKINGS!=='true')missing.push('Разрешение приёма заявок в Worker');
 if(!env.TURNSTILE_SITE_KEY||!env.TURNSTILE_SECRET)missing.push('Ключи защиты Turnstile');
 if(!env.RESEND_API_KEY||!env.FROM_EMAIL||!env.OWNER_EMAIL)missing.push('Почта Resend и адреса отправителя/владельца');
 if(!mailTest)missing.push('Тест отправки уведомления');
 if(mailReceived!=='true')missing.push('Подтверждение получения тестового письма');
 if(privacyConfirmed!=='true')missing.push('Подтверждение опубликованной политики конфиденциальности');
 const canEnable=missing.length===0;
 return {enabled:enabled==='true'&&canEnable,requested:enabled==='true',canEnable,missing,
   mailTestSent:Boolean(mailTest),mailReceived:mailReceived==='true',
   privacyConfirmed:privacyConfirmed==='true',emailConfigured:Boolean(env.OWNER_EMAIL&&env.FROM_EMAIL&&env.RESEND_API_KEY),
   turnstileConfigured:Boolean(env.TURNSTILE_SITE_KEY&&env.TURNSTILE_SECRET)};
}
const fiNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
async function parse(req){const text=await req.text();if(text.length>40000)throw Error('Запрос слишком большой.');try{return JSON.parse(text);}catch{throw Error('Неверный формат JSON.');}}
async function mac(secret,body){const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(body)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
function session(req){return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pakkasukko_session='))?.slice('pakkasukko_session='.length)||'';}
async function adminOK(req,env){if(!env.SESSION_SECRET)return false;const token=session(req);if(!token)return false;
 const row=await env.DB.prepare('SELECT expires FROM sessions WHERE digest=?').bind(await mac(env.SESSION_SECRET,token)).first();return row?.expires>Date.now();}
async function rateLimit(req,env,kind,count,minutes){
 const hash=await mac(env.SESSION_SECRET||'pakkasukko-rate-limit',req.headers.get('CF-Connecting-IP')||'local');
 const since=new Date(Date.now()-minutes*60000).toISOString();
 const result=await env.DB.prepare('INSERT INTO attempts(kind,ip_hash,created_at) SELECT ?,?,? WHERE (SELECT COUNT(*) FROM attempts WHERE kind=? AND ip_hash=? AND created_at>=?)<?').bind(kind,hash,now(),kind,hash,since,count).run();
 return Boolean(result.meta.changes);
}
async function human(token,req,env){if(!token||!env.TURNSTILE_SECRET)return false;const data=new FormData();data.set('secret',env.TURNSTILE_SECRET);data.set('response',token);const ip=req.headers.get('CF-Connecting-IP');if(ip)data.set('remoteip',ip);try{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:data});return r.ok&&(await r.json()).success===true;}catch{return false;}}
async function getContent(env){if(!env.DB)return DEFAULT_CONTENT;const row=await env.DB.prepare("SELECT value FROM content WHERE key='site'").first();if(!row)return DEFAULT_CONTENT;try{return normalizeContent(JSON.parse(row.value));}catch{return DEFAULT_CONTENT;}}
async function sendOwnerEmail(env,subject,body){
 if(!env.OWNER_EMAIL||!env.FROM_EMAIL||!env.RESEND_API_KEY)throw Error('Почта Resend ещё не настроена');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.FROM_EMAIL,to:[env.OWNER_EMAIL],subject,text:body})});
 if(!r.ok)throw Error('Сервис почты не принял сообщение (HTTP '+r.status+')');
 return true;
}
async function emailOwner(env,subject,body){try{await sendOwnerEmail(env,subject,body);}catch(e){console.warn('Pakkasukko email notification failed:',e?.message);}}
function csv(rows,keys,filename){const lines=[keys.map(csvCell).join(';'),...rows.map(row=>keys.map(k=>csvCell(row[k])).join(';'))];return new Response('\uFEFF'+lines.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+filename+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function api(req,env,ctx,url){
 const path=url.pathname,method=req.method;
 if(path.startsWith('/api/media/'))return mediaAPI(req,env,path,reply,false);
 if(path==='/api/health'&&method==='GET'){
   const state=await bookingState(env);
   return reply({project:'pakkasukko',databaseReady:Boolean(env.DB),mediaReady:Boolean(env.MEDIA),bookingsEnabled:state.enabled,environment:env.ENVIRONMENT||'preview'});
 }
 if(path==='/api/public-config'&&method==='GET'){
   const state=await bookingState(env);
   const site=await published(env),content=await getContent(env);
   return reply({site,content,fares:await fareSettings(env),services:prices(site,content),turnstileSiteKey:state.enabled?env.TURNSTILE_SITE_KEY:'',bookingsEnabled:state.enabled});
 }
 if(path==='/api/slots'&&method==='GET'){if(!env.DB)return reply({slots:[],timezone:'Europe/Helsinki'});const s=await env.DB.prepare('SELECT id,start_at,end_at,status FROM slots WHERE start_at>=? ORDER BY start_at LIMIT 500').bind(fiNow().slice(0,10)+'T00:00').all();return reply({slots:s.results||[],timezone:'Europe/Helsinki'});}
 if(path==='/api/bookings'&&method==='POST'){
   if(!(await bookingState(env)).enabled)return fail('Приём заявок пока не включён.',503);
   const site=await published(env),cards=site.cards||[];
   const input=await parse(req);
   const b=validateBooking(input,cards.map(c=>c.id));
   const services=prices(site,await getContent(env)),fares=await fareSettings(env);
   const snapshot=quote(fares,services[b.service],b.city,input.group===true);
   if(JSON.stringify(snapshot)!==input.quoteToken)return reply({error:'Тариф изменился. Проверьте новый расчёт и отправьте заявку ещё раз.',fares,services},409);
   const summary=describe(snapshot);
   b.service=cards.find(c=>c.id===b.service)?.title||b.service;
   if(!await human(b.turnstileToken,req,env))return fail('Пройдите проверку от спама.',403);
   if(!await rateLimit(req,env,'booking',5,60))return fail('Слишком много запросов.',429);
   const slot=await env.DB.prepare('SELECT id,start_at,end_at,status FROM slots WHERE id=?').bind(b.slotId).first();
   if(!slot||slot.status!=='open'||slot.start_at<=fiNow())return fail('Время уже недоступно.',409);
   const id=crypto.randomUUID();
   await env.DB.batch([env.DB.prepare("INSERT INTO bookings(id,slot_id,service,name,phone,email,city,address,message,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)").bind(id,b.slotId,b.service,b.name,b.phone,b.email,b.city,b.address,b.message,now()),
     env.DB.prepare("INSERT INTO booking_quotes(booking_id,snapshot,summary) VALUES(?,?,?)").bind(id,JSON.stringify(snapshot),summary)]);
   ctx.waitUntil(emailOwner(env,'Новая заявка Pakkasukko',['Новая предварительная заявка. Нуждается в подтверждении.','Дата: '+slot.start_at+' — '+slot.end_at,'Формат: '+b.service,summary,'Имя: '+b.name,'Телефон: '+b.phone,'Email: '+b.email,'Город: '+b.city,'Адрес: '+b.address,'Пожелания: '+b.message,'ID: '+id].join('\n')));
   return reply({id,summary,status:'pending',message:'Ваша заявка отправлена. Пожалуйста, дождитесь личного подтверждения бронирования.'},201);
 }
 if(path==='/api/messages'&&method==='POST'){
   if(!(await bookingState(env)).enabled)return fail('Сообщения пока не принимаются.',503);
   const b=await parse(req),name=clean(b.name,100),contact=clean(b.contact,150),message=clean(b.message,2000),token=clean(b.turnstileToken,2048);
   if(name.length<2||contact.length<5||message.length<8)return fail('Укажите имя, контакт и сообщение.');
   if(!await human(token,req,env))return fail('Пройдите проверку от спама.',403);
   if(!await rateLimit(req,env,'message',5,60))return fail('Слишком много сообщений.',429);
   const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO messages(id,name,contact,message,status,created_at) VALUES(?,?,?,?,'unread',?)").bind(id,name,contact,message,now()).run();
   ctx.waitUntil(emailOwner(env,'Новое сообщение Pakkasukko','Имя: '+name+'\nКонтакт: '+contact+'\n\n'+message));
   return reply({ok:true,message:'Сообщение получено.'},201);
 }
 if(!path.startsWith('/api/admin/'))return fail('Маршрут не найден.',404);
 if(!env.DB)return fail('Независимая база Pakkasukko ещё не подключена.',503);
 if(path==='/api/admin/login'&&method==='POST'){
   if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET||env.SESSION_SECRET.length<32)return fail('Вход владельца ещё не настроен.',503);
   if(!await rateLimit(req,env,'login',8,30))return fail('Слишком много попыток входа.',429);
   const raw=await parse(req),candidate=clean(raw.password,500);
   if(!same(await mac(env.SESSION_SECRET,candidate),await mac(env.SESSION_SECRET,env.ADMIN_PASSWORD)))return fail('Неверный пароль.',401);
   const token=crypto.randomUUID()+crypto.randomUUID();
   await env.DB.prepare('INSERT INTO sessions VALUES(?,?)').bind(await mac(env.SESSION_SECRET,token),Date.now()+28800000).run();
   return reply({ok:true},200,{'Set-Cookie':'pakkasukko_session='+token+'; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=28800'+(url.protocol==='https:'?'; Secure':'')});
 }
 if(path==='/api/admin/logout'&&method==='POST'){
   await env.DB.prepare('DELETE FROM sessions WHERE digest=?').bind(await mac(env.SESSION_SECRET,session(req))).run();
   return reply({ok:true},200,{'Set-Cookie':'pakkasukko_session=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0'});
 }
 if(!await adminOK(req,env))return fail('Необходим вход владельца.',401);
 if(path.startsWith('/api/admin/media/'))return mediaAPI(req,env,path,reply,true);
 if(path==='/api/admin/travel-fare'&&method==='POST'){
   const f=await parse(req);
   if(!validFare(f))return fail('Проверьте цену топлива, расход и километраж.');
   const km=f.km,routes=f.routes;
   await setSetting(env,'travel_fare',JSON.stringify({fuel:f.fuel,consumption:f.consumption,km,routes}));
   return reply({ok:true});
 }
 if(path==='/api/admin/editor')return await editorAPI(req,env,path,reply);
 if(path==='/api/admin/booking-state'&&method==='GET')return reply(await bookingState(env));
 if(path==='/api/admin/email-test'&&method==='POST'){
   if(!env.RESEND_API_KEY||!env.FROM_EMAIL||!env.OWNER_EMAIL)return fail('Сначала настройте почтовые параметры Resend.',409);
   try{
     await sendOwnerEmail(env,'Pakkasukko: проверка уведомлений','Это тестовое письмо из календаря Pakkasukko. Если вы получили его, подтвердите получение в админке перед запуском приёма заявок.');
     await setSetting(env,'mail_test',now());
     await setSetting(env,'mail_received','false');
     return reply({ok:true,message:'Почтовый сервис принял тестовое письмо. Проверьте входящие и папку спама.'});
   }catch(e){return fail(e?.message||'Не удалось отправить тестовое письмо.',502);}
 }
 if(path==='/api/admin/booking-state'&&method==='POST'){
   const body=await parse(req);
   if(typeof body.enabled!=='boolean')return fail('Укажите, включать ли приём заявок.');
   if(!body.enabled){
     await setSetting(env,'enabled','false');
     return reply(await bookingState(env));
   }
   if(body.mailReceived!==true||body.privacyConfirmed!==true)return fail('Подтвердите получение письма и публикацию политики конфиденциальности.',409);
   await setSetting(env,'mail_received','true');
   await setSetting(env,'privacy_confirmed','true');
   const state=await bookingState(env);
   if(!state.canEnable)return reply({error:'Не все условия выполнены.',missing:state.missing},409);
   await setSetting(env,'enabled','true');
   return reply(await bookingState(env));
 }
 if(path==='/api/admin/dashboard'&&method==='GET'){
   const [slots,bookings,messages]=await Promise.all([env.DB.prepare('SELECT * FROM slots ORDER BY start_at LIMIT 1000').all(),env.DB.prepare('SELECT b.*,q.summary AS quote_summary,s.start_at,s.end_at,d.price,d.notes,d.final_status FROM bookings b JOIN slots s ON s.id=b.slot_id LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN booking_quotes q ON q.booking_id=b.id ORDER BY s.start_at,b.created_at LIMIT 1000').all(),env.DB.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500').all()]);
   return reply({fares:await fareSettings(env),slots:slots.results||[],bookings:bookings.results||[],messages:messages.results||[],content:await getContent(env)});
 }
 if(path==='/api/admin/content'&&method==='POST'){const value=normalizeContent(await parse(req));await env.DB.prepare("INSERT INTO content(key,value) VALUES('site',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(value)).run();return reply({ok:true,content:value});}
 if(path==='/api/admin/slots'&&method==='POST'){
   const b=await parse(req),start=clean(b.startAt,16),minutes=Number(b.minutes),status=b.status==='blocked'?'blocked':'open';
   if(!validStamp(start)||!Number.isInteger(minutes)||minutes<15||minutes>480||start<=fiNow())return fail('Проверьте дату и длительность.');
   const end=addMinutes(start,minutes);
   const overlap=await env.DB.prepare('SELECT id FROM slots WHERE start_at<? AND end_at>? LIMIT 1').bind(end,start).first();
   if(overlap)return fail('Время пересекается с существующим интервалом.',409);
   const id=crypto.randomUUID();await env.DB.prepare('INSERT INTO slots(id,start_at,end_at,status,note,created_at) VALUES(?,?,?,?,?,?)').bind(id,start,end,status,clean(b.note,180),now()).run();
   return reply({ok:true,id},201);
 }
 if(path==='/api/admin/slots/delete'&&method==='POST'){
   const b=await parse(req);const r=await env.DB.prepare("DELETE FROM slots WHERE id=? AND status!='reserved' AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=slots.id)").bind(clean(b.id,80)).run();
   return r.meta.changes?reply({ok:true}):fail('Нельзя удалить занятый интервал или время с заявками.',409);
 }
 if(path==='/api/admin/bookings/status'&&method==='POST'){
   const b=await parse(req),id=clean(b.id,80),status=clean(b.status,15);
   if(['confirmed','declined'].includes(status)){
     try{const r=await env.DB.prepare("UPDATE bookings SET status=? WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM booking_details WHERE booking_id=? AND final_status IS NOT NULL)").bind(status,id,id).run();
       return r.meta.changes?reply({ok:true}):fail('Статус уже изменён.',409);
     }catch{return fail('Этот интервал уже занят.',409);}
   }
   if(!['completed','cancelled'].includes(status))return fail('Недопустимый статус.');
   const r=await env.DB.prepare("INSERT INTO booking_details(booking_id,final_status) SELECT id,? FROM bookings WHERE id=? AND (status='confirmed' OR (status='pending' AND ?='cancelled')) ON CONFLICT(booking_id) DO UPDATE SET final_status=excluded.final_status WHERE booking_details.final_status IS NULL").bind(status,id,status).run();
   return r.meta.changes?reply({ok:true}):fail('Переход недоступен.',409);
 }
 if(path==='/api/admin/bookings/details'&&method==='POST'){
   const b=await parse(req),minutes=Number(b.minutes);
   if(!Number.isInteger(minutes)||minutes<15||minutes>480)return fail('Проверьте длительность.');
   const row=await env.DB.prepare('SELECT s.* FROM slots s JOIN bookings b ON b.slot_id=s.id WHERE b.id=?').bind(b.id).first();
   if(!row)return fail('Заявка не найдена.',404);
   try{await env.DB.batch([
    env.DB.prepare('UPDATE slots SET end_at=? WHERE id=?').bind(addMinutes(row.start_at,minutes),row.id),
    env.DB.prepare('INSERT INTO booking_details(booking_id,price,notes) VALUES(?,?,?) ON CONFLICT(booking_id) DO UPDATE SET price=excluded.price,notes=excluded.notes').bind(b.id,clean(b.price,80),clean(b.notes,1500))
   ]);}catch{return fail('Длительность пересекается с другим интервалом.',409);}
   return reply({ok:true});
 }
 if(path==='/api/admin/messages/read'&&method==='POST'){const b=await parse(req);await env.DB.prepare("UPDATE messages SET status='read' WHERE id=?").bind(clean(b.id,80)).run();return reply({ok:true});}
 if(path==='/api/admin/schedule.csv'&&method==='GET'){const r=await env.DB.prepare('SELECT start_at,end_at,status,note FROM slots ORDER BY start_at').all();return csv(r.results,['start_at','end_at','status','note'],'pakkasukko-schedule.csv');}
 if(path==='/api/admin/export'&&method==='GET'){const keys=['start_at','end_at','service','name','phone','email','city','address','message','price','quote_summary','notes','status','created_at'];const r=await env.DB.prepare('SELECT s.start_at,s.end_at,b.service,b.name,b.phone,b.email,b.city,b.address,b.message,d.price,q.summary AS quote_summary,d.notes,COALESCE(d.final_status,b.status) status,b.created_at FROM bookings b JOIN slots s ON s.id=b.slot_id LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN booking_quotes q ON q.booking_id=b.id ORDER BY s.start_at').all();return csv(r.results||[],keys,'pakkasukko-bookings.csv');}
 if(path==='/api/admin/export-messages'&&method==='GET'){const keys=['created_at','name','contact','message','status'];const r=await env.DB.prepare('SELECT created_at,name,contact,message,status FROM messages ORDER BY created_at DESC').all();return csv(r.results||[],keys,'pakkasukko-messages.csv');}
 return fail('Маршрут не найден.',404);
}
export default {async fetch(req,env,ctx){
 const url=new URL(req.url);
 try{
  if(url.pathname.startsWith('/api/')){
    if(!['GET','POST'].includes(req.method))return fail('Метод не разрешён.',405);
    const origin=req.headers.get('Origin');
    if(req.method==='POST'&&origin!==url.origin)return fail('Недопустимый источник запроса.',403);
    return await api(req,env,ctx,url);
  }
  const response=await env.ASSETS.fetch(req),h=new Headers(response.headers);
  h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Frame-Options','DENY');h.set('X-Robots-Tag','noindex,nofollow');
  return new Response(response.body,{status:response.status,headers:h});
 }catch(e){console.error('Pakkasukko server exception',e?.message);return fail('Ошибка обработки запроса.',500);}
}};