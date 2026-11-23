import {DEFAULT_CONTENT,clean,normalizeContent,validStamp,addMinutes,validateBooking,csvCell} from './validation.js';
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...headers,...extra}});
const fail=(message,status=400)=>reply({error:message},status);
const now=()=>new Date().toISOString();
const live=(env)=>env.ACCEPT_BOOKINGS==='true'&&Boolean(env.DB&&env.TURNSTILE_SECRET&&env.TURNSTILE_SITE_KEY);
const fiNow=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).replace(' ','T');
async function parse(req){const text=await req.text();if(text.length>16000)throw Error('Запрос слишком большой.');try{return JSON.parse(text);}catch{throw Error('Неверный формат JSON.');}}
async function mac(secret,body){const enc=new TextEncoder();const key=await crypto.subtle.importKey('raw',enc.encode(secret),'HMAC',{hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(body)))).map(n=>n.toString(16).padStart(2,'0')).join('');}
function same(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let difference=0;for(let i=0;i<a.length;i++)difference|=a.charCodeAt(i)^b.charCodeAt(i);return difference===0;}
function session(req){return (req.headers.get('Cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('pakkasukko_session='))?.slice('pakkasukko_session='.length)||'';}
async function adminOK(req,env){if(!env.SESSION_SECRET)return false;const parts=session(req).split('.'),exp=parts[0],sig=parts[1];if(!/^\d{13}$/.test(exp||'')||Number(exp)<Date.now()||Number(exp)>Date.now()+86400000)return false;return same(sig,await mac(env.SESSION_SECRET,'pakkasukko:'+exp));}
async function rateLimit(req,env,kind,count,minutes){const ip=(req.headers.get('CF-Connecting-IP')||'127.0.0.1').slice(0,80);const hash=await mac(env.SESSION_SECRET||'pakkasukko-rate-limit',ip);const since=new Date(Date.now()-minutes*60000).toISOString();const r=await env.DB.prepare('SELECT COUNT(*) n FROM attempts WHERE kind=? AND ip_hash=? AND created_at>=?').bind(kind,hash,since).first();if((r?.n||0)>=count)return false;await env.DB.prepare('INSERT INTO attempts(kind,ip_hash,created_at) VALUES(?,?,?)').bind(kind,hash,now()).run();return true;}
async function human(token,req,env){if(!token||!env.TURNSTILE_SECRET)return false;const data=new FormData();data.set('secret',env.TURNSTILE_SECRET);data.set('response',token);const ip=req.headers.get('CF-Connecting-IP');if(ip)data.set('remoteip',ip);try{const r=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:data});return r.ok&&(await r.json()).success===true;}catch{return false;}}
async function getContent(env){if(!env.DB)return DEFAULT_CONTENT;const row=await env.DB.prepare("SELECT value FROM content WHERE key='site'").first();if(!row)return DEFAULT_CONTENT;try{return normalizeContent(JSON.parse(row.value));}catch{return DEFAULT_CONTENT;}}
async function emailOwner(env,subject,body){if(!env.OWNER_EMAIL||!env.FROM_EMAIL||!env.RESEND_API_KEY)return;try{const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.FROM_EMAIL,to:[env.OWNER_EMAIL],subject,text:body})});if(!r.ok)console.warn('Pakkasukko email error',r.status);}catch(e){console.warn('Email request failed',e?.message);}}
function csv(rows,keys,filename){const lines=[keys.map(csvCell).join(';'),...rows.map(row=>keys.map(k=>csvCell(row[k])).join(';'))];return new Response('\uFEFF'+lines.join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="'+filename+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function api(req,env,ctx,url){
 const path=url.pathname,method=req.method;
 if(path==='/api/health'&&method==='GET')return reply({project:'pakkasukko',databaseReady:Boolean(env.DB),bookingsEnabled:live(env),environment:env.ENVIRONMENT||'preview'});
 if(path==='/api/public-config'&&method==='GET')return reply({content:await getContent(env),turnstileSiteKey:live(env)?env.TURNSTILE_SITE_KEY:'',bookingsEnabled:live(env)});
 if(path==='/api/slots'&&method==='GET'){if(!env.DB)return reply({slots:[],timezone:'Europe/Helsinki'});const s=await env.DB.prepare('SELECT id,start_at,end_at,status FROM slots WHERE start_at>=? ORDER BY start_at LIMIT 500').bind(fiNow().slice(0,10)+'T00:00').all();return reply({slots:s.results||[],timezone:'Europe/Helsinki'});}
 if(path==='/api/bookings'&&method==='POST'){
   if(!live(env))return fail('Приём заявок пока не включён.',503);
   const b=validateBooking(await parse(req));
   if(!await human(b.turnstileToken,req,env))return fail('Пройдите проверку от спама.',403);
   if(!await rateLimit(req,env,'booking',5,60))return fail('Слишком много запросов.',429);
   const slot=await env.DB.prepare('SELECT id,start_at,end_at,status FROM slots WHERE id=?').bind(b.slotId).first();
   if(!slot||slot.status!=='open'||slot.start_at<=fiNow())return fail('Время уже недоступно.',409);
   const id=crypto.randomUUID();
   await env.DB.prepare("INSERT INTO bookings(id,slot_id,service,name,phone,email,city,address,message,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,'pending',?)").bind(id,b.slotId,b.service,b.name,b.phone,b.email,b.city,b.address,b.message,now()).run();
   ctx.waitUntil(emailOwner(env,'Новая заявка Pakkasukko',['Новая предварительная заявка. Нуждается в подтверждении.','Дата: '+slot.start_at+' — '+slot.end_at,'Формат: '+b.service,'Имя: '+b.name,'Телефон: '+b.phone,'Email: '+b.email,'Город: '+b.city,'Адрес: '+b.address,'Пожелания: '+b.message,'ID: '+id].join('\n')));
   return reply({id,status:'pending',message:'Заявка получена. Обязательно дождитесь личного подтверждения времени и стоимости.'},201);
 }
 if(path==='/api/messages'&&method==='POST'){
   if(!live(env))return fail('Сообщения пока не принимаются.',503);
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
   const expires=String(Date.now()+8*3600000),signature=await mac(env.SESSION_SECRET,'pakkasukko:'+expires),secure=url.protocol==='https:'?'; Secure':'';
   return reply({ok:true},200,{'Set-Cookie':'pakkasukko_session='+expires+'.'+signature+'; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=28800'+secure});
 }
 if(path==='/api/admin/logout'&&method==='POST')return reply({ok:true},200,{'Set-Cookie':'pakkasukko_session=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0'});
 if(!await adminOK(req,env))return fail('Необходим вход владельца.',401);
 if(path==='/api/admin/dashboard'&&method==='GET'){
   const [slots,bookings,messages]=await Promise.all([env.DB.prepare('SELECT * FROM slots ORDER BY start_at LIMIT 1000').all(),env.DB.prepare('SELECT b.*,s.start_at,s.end_at FROM bookings b JOIN slots s ON s.id=b.slot_id ORDER BY s.start_at,b.created_at LIMIT 1000').all(),env.DB.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500').all()]);
   return reply({slots:slots.results||[],bookings:bookings.results||[],messages:messages.results||[],content:await getContent(env)});
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
   if(!['confirmed','declined'].includes(status))return fail('Недопустимый статус.');
   const booking=await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
   if(!booking||booking.status!=='pending')return fail('Можно обработать только ожидающую заявку.',409);
   if(status==='confirmed'){const r=await env.DB.prepare("UPDATE slots SET status='reserved',booking_id=? WHERE id=? AND status='open'").bind(id,booking.slot_id).run();if(!r.meta.changes)return fail('Этот интервал уже занят.',409);}
   await env.DB.prepare("UPDATE bookings SET status=? WHERE id=? AND status='pending'").bind(status,id).run();return reply({ok:true});
 }
 if(path==='/api/admin/messages/read'&&method==='POST'){const b=await parse(req);await env.DB.prepare("UPDATE messages SET status='read' WHERE id=?").bind(clean(b.id,80)).run();return reply({ok:true});}
 if(path==='/api/admin/export'&&method==='GET'){const keys=['start_at','end_at','service','name','phone','email','city','address','message','status','created_at'];const r=await env.DB.prepare('SELECT s.start_at,s.end_at,b.service,b.name,b.phone,b.email,b.city,b.address,b.message,b.status,b.created_at FROM bookings b JOIN slots s ON s.id=b.slot_id ORDER BY s.start_at').all();return csv(r.results||[],keys,'pakkasukko-bookings.csv');}
 if(path==='/api/admin/export-messages'&&method==='GET'){const keys=['created_at','name','contact','message','status'];const r=await env.DB.prepare('SELECT created_at,name,contact,message,status FROM messages ORDER BY created_at DESC').all();return csv(r.results||[],keys,'pakkasukko-messages.csv');}
 return fail('Маршрут не найден.',404);
}
export default {async fetch(req,env,ctx){
 const url=new URL(req.url);
 try{
  if(url.pathname.startsWith('/api/')){
    if(!['GET','POST'].includes(req.method))return fail('Метод не разрешён.',405);
    const origin=req.headers.get('Origin');
    if(req.method==='POST'&&origin&&origin!==url.origin)return fail('Недопустимый источник запроса.',403);
    return await api(req,env,ctx,url);
  }
  if(url.pathname==='/admin')return Response.redirect(url.origin+'/admin.html',302);
  const response=await env.ASSETS.fetch(req),h=new Headers(response.headers);
  h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Frame-Options','DENY');h.set('X-Robots-Tag','noindex,nofollow');
  return new Response(response.body,{status:response.status,headers:h});
 }catch(e){console.error('Pakkasukko server exception',e?.message);return fail('Ошибка обработки запроса.',500);}
}};