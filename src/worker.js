import {availableGiftCode,giftAdmin} from './gift-codes.js';
import {discountVisit} from '../docs/gift-codes.js';
import {distanceSettings,saveDistanceSettings,lookupDistance} from './city-distance.js';
import {approvedCity,validCityQuery,validPin,pinLink} from '../docs/city-distance.js';
import {applyIntroCopy} from './intro-copy.js';
import {applyCompetitiveTariffs,applyDoorstepTariffs} from './competitive-tariffs.js';
import {bankProfile,autoAdvanceDocument,advanceStatements,expireBankHolds,publicAdvance,createAdvanceAccess} from './automatic-advance.js';
import {billing} from './billing.js';
import {prepaymentsAPI} from './prepayment-api.js';
import {stripeAdmin,stripeWebhook} from './stripe.js';
import {serviceCard,deliveryConfig,earliestDelivery} from '../docs/video-service.js';
import {defaultFare,validFare,prices,quote,describe,visitQuote,euros,performanceRows,performanceChoice,prepaymentForVisit,bookingPaymentMode} from '../docs/fares.js';
import {mediaAPI} from './media.js';
import {musicAPI} from './music.js';
import {reschedule} from './reschedule.js';
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
  if(path==='/api/stripe/webhook'&&method==='POST')return stripeWebhook(req,env,reply);
 if(path.startsWith('/api/advance/'))return publicAdvance(req,env,url,reply,mac,same,emailOwner);
 if(path==='/api/trip'&&method==='GET')return billing(req,env,'share',reply);
 if(path.startsWith('/api/music/'))return musicAPI(req,env,path,reply,false);
 if(path.startsWith('/api/media/'))return mediaAPI(req,env,path,reply,false);
 if(path==='/api/health'&&method==='GET'){
   const state=await bookingState(env);
   return reply({project:'pakkasukko',databaseReady:Boolean(env.DB),mediaReady:Boolean(env.MEDIA),bookingsEnabled:state.enabled,environment:env.ENVIRONMENT||'preview'});
 }
 if(path==='/api/public-config'&&method==='GET'){
   const state=await bookingState(env);
   const site=await published(env),content=await getContent(env);
   return reply({site,content,fares:await fareSettings(env),services:prices(site,content),turnstileSiteKey:state.enabled?env.TURNSTILE_SITE_KEY:'',bookingsEnabled:state.enabled,distanceLookup:await distanceSettings(env)});
 }
 if(path==='/api/gift-code'&&method==='POST'){
  if(!env.DB)return fail('Проверка кода временно недоступна.',503);
  if(!await rateLimit(req,env,'gift-code',20,60))return fail('Слишком много попыток.',429);
  const rule=await availableGiftCode(env.DB,(await parse(req)).code);
  return rule?reply({kind:rule.kind,value:rule.value}):fail('Код недействителен, просрочен или уже использован.',404);
 }
 if(path==='/api/distance'&&method==='POST'){
  if(!env.DB)return fail('Расчёт временно недоступен.',503);
  const {city,pin}=await parse(req);if(!validCityQuery(city)||pin&&!validPin(pin))return fail('Укажите город и точку в Финляндии.');
  if(!await rateLimit(req,env,'distance',10,60))return fail('Слишком много запросов.',429);
  return reply(await lookupDistance(env,city,await fareSettings(env),await distanceSettings(env),fetch,pin||null));
 }
 if(path==='/api/slots'&&method==='GET'){if(!env.DB)return reply({slots:[],timezone:'Europe/Helsinki'});await expireBankHolds(env.DB);const s=await env.DB.prepare('SELECT id,start_at,end_at,status FROM slots WHERE start_at>=? ORDER BY start_at LIMIT 500').bind(fiNow().slice(0,10)+'T00:00').all();return reply({slots:s.results||[],timezone:'Europe/Helsinki'});}
 if(path==='/api/video-orders'&&method==='POST'){
   if(!(await bookingState(env)).enabled)return fail('Приём заявок пока не включён.',503);
   const b=await parse(req),site=await published(env),card=serviceCard(site,b.service),deliveryMode=deliveryConfig(site,b.service);
   if(!card||deliveryMode?.mode!=='delivery')return fail('Услуга не доступна для заказа по дате получения.',409);
   const delivery=clean(b.deliveryDate,10),name=clean(b.name,100),email=clean(b.email,150),phone=clean(b.phone,40),message=clean(b.message,1200);
   const key=clean(b.submissionKey,80);
   if(!/^[a-f0-9-]{36}$/.test(key))return fail('Обновите форму заявки.');
   const fingerprint=await mac(env.SESSION_SECRET,JSON.stringify({service:card.id,delivery,name,email,phone,message}));
   const previous=await env.DB.prepare('SELECT id,fingerprint,delivery_date FROM video_orders WHERE submission_key=?').bind(key).first();
   if(previous)return same(previous.fingerprint,fingerprint)?reply({id:previous.id,deliveryDate:previous.delivery_date},201):fail('Данные отправки изменились.',409);
   if(!validStamp(delivery+'T00:00')||delivery<earliestDelivery(fiNow().slice(0,10),deliveryMode.days))return fail('Услугу нужно заказать минимум за '+deliveryMode.days+' календарных дн. до получения.');
   if(name.length<2||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))return fail('Укажите имя и действительный email.');
   if(!await human(clean(b.turnstileToken,2048),req,env))return fail('Пройдите проверку от спама.',403);
   if(!await rateLimit(req,env,'video-order',5,60))return fail('Слишком много запросов.',429);
   const id=crypto.randomUUID(),price=clean(prices(site,await getContent(env))[card.id]?.label,100)||'По запросу';
   const r=await env.DB.prepare("INSERT INTO video_orders(id,service_id,service,delivery_date,name,email,phone,message,price_label,created_at,submission_key,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(submission_key) DO NOTHING").bind(id,card.id,card.title,delivery,name,email,phone,message,price,now(),key,fingerprint).run();
   if(!r.meta.changes){const saved=await env.DB.prepare('SELECT id,fingerprint,delivery_date FROM video_orders WHERE submission_key=?').bind(key).first();return saved&&same(saved.fingerprint,fingerprint)?reply({id:saved.id,deliveryDate:saved.delivery_date},201):fail('Данные отправки изменились.',409);}
   ctx.waitUntil(emailOwner(env,'Новый заказ с датой получения Pakkasukko',[card.title,'Дата получения: '+delivery,name,email,phone,message,price,'Заявка: '+id].join('\n')));
   return reply({id,deliveryDate:delivery},201);
 }
 if(path==='/api/bookings'&&method==='POST'){
   if(!(await bookingState(env)).enabled)return fail('Приём заявок пока не включён.',503);
   const site=await published(env),cards=site.cards||[];
   const input=await parse(req);
   if(deliveryConfig(site,input.service)?.mode==='delivery')return fail('Для этой услуги укажите дату получения в отдельной форме.',400);
   const key=input.submissionKey||'';
   if(key&&!/^[a-f0-9-]{36}$/.test(key))return fail('Неверный идентификатор отправки.');
   const fingerprint=key?await mac(env.SESSION_SECRET,JSON.stringify({...input,turnstileToken:''})):'';
   const replay=async()=>{
     const stored=key&&await env.DB.prepare('SELECT fingerprint,result FROM booking_submissions WHERE token=?').bind(key).first();
     if(!stored)return null;
     if(!same(stored.fingerprint,fingerprint))return fail('Данные отправки изменились.',409);
     const result=JSON.parse(stored.result);
     const ids=(result.receipts||[{id:result.id}]).map(v=>v.id).filter(Boolean);
     if(ids.length){
       const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM bookings WHERE id IN ('+ids.map(()=>'?').join(',')+')').bind(...ids).first();
       if(count.n!==ids.length)return fail('Предыдущая заявка была удалена. Обновите календарь перед новым бронированием.',409);
     }
     return reply(result,201);
   };
   if(key){const previous=await replay();if(previous)return previous;}
   const visits=input.visits??[{slotId:input.slotId,address:input.address}];
   if(!Array.isArray(visits)||!visits.length||visits.length>25||visits.some(v=>!v||typeof v!=='object')||new Set(visits.map(v=>v.slotId)).size!==visits.length)return fail('Выберите от 1 до 25 разных интервалов.');
   let orders;
   try{orders=visits.map(v=>validateBooking({...input,slotId:v.slotId,address:v.address},cards.map(c=>c.id)));}
   catch(e){return fail(e.message);}
   const b=orders[0];
   const services=prices(site,await getContent(env)),fares=await fareSettings(env);
   b.city=approvedCity(fares,b.city)||b.city;
   const destinationPin=input.destinationPin;
   if(destinationPin&&(!validPin(destinationPin)||orders.length!==1))return fail('Точка на карте доступна для одного адреса в Финляндии.');
   const methodForBooking=bookingPaymentMode(fares.prepayments||defaultFare.prepayments);
   if((input.paymentMethod!==undefined||fares.prepayments?.paymentMethod!==undefined)&&input.paymentMethod!==methodForBooking)return reply({error:'Способ оплаты изменился. Проверьте условия и отправьте заявку снова.',fares,services},409);
   const serviceId=b.service;
   b.service=cards.find(c=>c.id===serviceId)?.title||serviceId;
   if(!await human(b.turnstileToken,req,env))return fail('Пройдите проверку от спама.',403);
   if(!await rateLimit(req,env,'booking',5,60))return fail('Слишком много запросов.',429);
   await expireBankHolds(env.DB);
   const placeholders=orders.map(()=>'?').join(',');
   const {results:slots}=await env.DB.prepare('SELECT * FROM slots WHERE id IN ('+placeholders+') ORDER BY start_at').bind(...orders.map(o=>o.slotId)).all();
   if(slots.length!==orders.length||slots.some(s=>s.status!=='open'||s.start_at<=fiNow()||s.start_at.slice(0,10)!==slots[0].start_at.slice(0,10)))return fail('Один из интервалов недоступен. Выберите свободное время в один день.',409);
   // Artist prices are read only from persisted tariffs, never from the browser.
   const programRates=performanceRows(fares,serviceId);
   const wantsPerformance=input.performanceMinutes!==undefined||input.performerCast!==undefined;
   const choice=wantsPerformance?performanceChoice(fares,serviceId,Number(input.performanceMinutes),input.performerCast):null;
   if((programRates.length&&!choice)||(!programRates.length&&wantsPerformance))return fail('Выберите доступную продолжительность и состав артистов. Обновите страницу.',409);
   if(choice&&slots.some(s=>(Date.parse(s.end_at+':00Z')-Date.parse(s.start_at+':00Z'))/60000<choice.minutes))
    return fail('Выбранного свободного интервала недостаточно для этой продолжительности. Выберите другое время.',409);
   // Recalculate with trusted slot timestamps. The client cannot choose its own holiday prices.
   const snapshot=quote(fares,services[serviceId],b.city,orders.length>1||(!input.visits&&input.group===true),slots.map(s=>s.start_at),choice);
   if(JSON.stringify(snapshot)!==input.quoteToken)return reply({error:'Тариф изменился. Проверьте новый расчёт и отправьте заявку ещё раз.',fares,services},409);
   const gift = input.giftCode ? await availableGiftCode(env.DB,input.giftCode) : null;
   const pricedVisit = index => discountVisit(visitQuote(snapshot,slots.length,index),gift);
   if(input.giftCode && (!gift || slots.length!==1 || !pricedVisit(0).discount || input.giftDiscount!==pricedVisit(0).discount))
    return fail('Код не применён. Проверьте код и итоговую цену для одного визита.',409);
   const auto=methodForBooking==='bank'&&fares.prepayments?.automaticBank===true;
   const planned=slots.map((_,i)=>prepaymentForVisit(fares,pricedVisit(i)));
   if(!(gift&&pricedVisit(0).total===0)&&methodForBooking==='stripe'&&!(String(env.STRIPE_SECRET_KEY||'').startsWith('sk_live_')&&String(env.STRIPE_WEBHOOK_SECRET||'').startsWith('whsec_')))return fail('Онлайн-оплата временно недоступна. Свяжитесь с администратором.',503);
   if(planned.some(Boolean)&&input.prepaymentTerms!=='accepted')return fail('Ознакомьтесь с условиями предоплаты и отмены перед отправкой заявки.');
   if((auto||input.paymentQuote!==undefined)&&JSON.stringify(planned)!==input.paymentQuote)return reply({error:'Предоплата изменилась. Проверьте сумму и отправьте заявку снова.',fares,services},409);
   const autoEligible=auto&&planned.some(Boolean)&&slots.every((_,i)=>Number.isInteger(pricedVisit(i).total));
   const seller=autoEligible?await bankProfile(env.DB):null;
   if(autoEligible&&(!seller||!env.SESSION_SECRET))return fail('Автоматический счёт временно недоступен. Свяжитесь с организатором.',503);
   const groupId=crypto.randomUUID(),statements=[],receipts=[];
   for(const [index,slot] of slots.entries()){
     const order=orders.find(o=>o.slotId===slot.id),id=crypto.randomUUID();
     const visit=pricedVisit(index);
     const payment=prepaymentForVisit(fares,visit);
     const saved={...visit,...(destinationPin?{destinationPin:{lat:destinationPin.lat,lng:destinationPin.lng}}:{}),...(payment?{prepayment:{...payment,termsVersion:'2026-11-26',acceptedAt:now()}}:{}),groupId};
     const holiday=saved.holidayName?' · '+saved.holidayName+' +'+saved.holidayPercent+'% ('+(saved.holidayExtra===null?'стоимость по согласованию':euros(saved.holidayExtra))+')':'';
     const artists=saved.durationMinutes?' · '+(saved.performerCast==='duo'?'Дед Мороз и Снегурочка':'Дед Мороз')+' · '+saved.durationMinutes+' минут':'';
     const detailCore=slots.length===1?describe(saved):'Визит '+(index+1)+'/'+slots.length+artists+holiday+' · Программа '+(saved.base==null?'по согласованию':euros(saved.base))+' · Доля дороги '+(saved.travel==null?'по согласованию':euros(saved.travel))+' · Итого '+(saved.total==null?'по согласованию':euros(saved.total));
     const detail=detailCore+(destinationPin?' · Место отмечено на карте: '+pinLink(destinationPin):'')+(saved.prepayment?' · Предоплата '+euros(saved.prepayment.amount):'');
     statements.push(env.DB.prepare("INSERT INTO bookings(id,slot_id,service,name,phone,email,city,address,message,status,created_at) VALUES(?,(SELECT id FROM slots WHERE id=? AND status='open'),?,?,?,?,?,?,?,'pending',?)").bind(id,slot.id,b.service,b.name,b.phone,b.email,b.city,order.address,b.message,now()),
       env.DB.prepare("INSERT INTO booking_quotes(booking_id,snapshot,summary) VALUES(?,?,?)").bind(id,JSON.stringify(saved),detail));
     if(gift)statements.push(env.DB.prepare('INSERT INTO gift_redemptions VALUES(?,?,?)').bind(gift.code,id,now()));
     let paymentUrl;
     if(autoEligible&&payment){const doc=autoAdvanceDocument({seller,order,serviceId,slot,quote:saved,hours:fares.prepayments.holdHours||24});const access=await createAdvanceAccess();doc.accessDigest=access.digest;statements.push(...advanceStatements(env.DB,id,doc,now()));paymentUrl='/api/advance/view?id='+id+'&token='+access.token;}
     receipts.push({id,time:slot.start_at,address:order.address,summary:detail,...(paymentUrl?{paymentUrl}:{} )});
   }
   const result={id:receipts[0].id,receipts,status:'pending',summary:receipts.map(v=>v.summary).join(' / ')};
   if(key)statements.unshift(env.DB.prepare('INSERT INTO booking_submissions VALUES(?,?,?)').bind(key,fingerprint,JSON.stringify(result)));
   try{await env.DB.batch(statements);}catch(e){if(key){const previous=await replay();if(previous)return previous;}if(/gift_redemptions|gift code unavailable/.test(String(e)))return fail('Код уже использован или больше недействителен.',409);if(String(e).includes('NOT NULL'))return fail('Один из интервалов уже занят.',409);throw e;}
   const paymentLinks=receipts.filter(v=>v.paymentUrl);
   if(paymentLinks.length&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email||''))ctx.waitUntil((async()=>{try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'pakkasukko-auto-'+groupId},body:JSON.stringify({from:env.FROM_EMAIL,to:[b.email],subject:'Pakkasukko · счёт предоплаты',text:'Время временно зарезервировано. Для оплаты откройте защищённые ссылки:\n'+paymentLinks.map(v=>v.time+' · '+url.origin+v.paymentUrl).join('\n')+'\nБронь подтверждается только после поступления оплаты.'})});if(!response.ok)console.warn('Advance email not accepted',response.status);}catch(e){console.warn('Advance email failed',e.message);}})());
   ctx.waitUntil(emailOwner(env,'Новая заявка Pakkasukko',[b.service,b.name,b.phone,b.email,b.city,b.message,...receipts.map(v=>v.time+' · '+v.address+' · '+v.summary)].join('\n')));
   return reply(result,201);
 }
 if(path==='/api/messages'&&method==='POST'){
   if(!(await bookingState(env)).enabled)return fail('Сообщения пока не принимаются.',503);
   const b=await parse(req),name=clean(b.name,100),contact=clean(b.contact,150),body=clean(b.message,1800),token=clean(b.turnstileToken,2048),topic=clean(b.topic,100);
   const topics=['Вопрос о бронировании','Особенное поздравление','Корпоративный праздник','Сотрудничество','Персональные данные','Подарочный сертификат','Другое'];
   if(topic&&!topics.includes(topic))return fail('Выберите тему письма.');
   if(body.length<8)return fail('Напишите сообщение.');
   const message=topic?'Тема: '+topic+'\n\n'+body:body;
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
 if(path.startsWith('/api/admin/billing/'))return billing(req,env,path.split('/').pop(),reply);
  if(path.startsWith('/api/admin/prepayments/'))return prepaymentsAPI(req,env,path.split('/').pop(),reply);
  if(path.startsWith('/api/admin/stripe/'))return stripeAdmin(req,env,path.split('/').pop(),reply);
 if(path.startsWith('/api/admin/music/'))return musicAPI(req,env,path,reply,true);
 if(path.startsWith('/api/admin/media/'))return mediaAPI(req,env,path,reply,true);
 if(path==='/api/admin/editor/intro-copy-2026'&&method==='POST')return reply(await applyIntroCopy(env.DB));
 if(path==='/api/admin/tariffs/doorstep-2026'&&method==='POST')return reply(await applyDoorstepTariffs(env.DB));
 if(path==='/api/admin/tariffs/competitive-2026'&&method==='POST')return reply(await applyCompetitiveTariffs(env.DB));
 if(path==='/api/admin/gift-codes')return giftAdmin(req,env.DB,reply);
 if(path==='/api/admin/distance-settings'&&method==='GET')return reply(await distanceSettings(env));
 if(path==='/api/admin/distance-settings'&&method==='POST')return await saveDistanceSettings(env,await parse(req))?reply({ok:true}):fail('Проверьте настройки и наличие ключей Google Maps и Routes.');
 if(path==='/api/admin/travel-fare'&&method==='POST'){
   const f=await parse(req);
   if(!validFare(f))return fail('Проверьте цену топлива, расход, километраж и режим оплаты.');
   if(f.prepayments?.paymentMethod==='stripe'&&!(String(env.STRIPE_SECRET_KEY||'').startsWith('sk_live_')&&String(env.STRIPE_WEBHOOK_SECRET||'').startsWith('whsec_')))return fail('Для онлайн-оплаты необходимо подключить Stripe в рабочем режиме.',409);
   if(f.prepayments?.paymentMethod==='bank'&&f.prepayments.automaticBank&&(!env.SESSION_SECRET||!await bankProfile(env.DB)))return fail('Для автоматического счёта заполните и проверьте финский IBAN, BIC / SWIFT, имя получателя и налоговые реквизиты.',409);
   const km=f.km,routes=f.routes;
   await setSetting(env,'travel_fare',JSON.stringify({fuel:f.fuel,consumption:f.consumption,km,routes,holidayPercent:f.holidayPercent??50,...(f.holidayRules!==undefined?{holidayRules:f.holidayRules}:{}),holidaySort:f.holidaySort||'date',...(f.performance!==undefined?{performance:f.performance}:{}),...(f.prepayments!==undefined?{prepayments:f.prepayments}:{})}));
   return reply({ok:true});
 }
 if(path==='/api/admin/editor')return await editorAPI(req,env,path,reply);
 if(path==='/api/admin/video-orders'&&method==='GET'){
   const r=await env.DB.prepare('SELECT id,service,delivery_date,name,email,phone,message,price_label,status,notes,created_at FROM video_orders ORDER BY delivery_date,created_at LIMIT 1000').all();return reply({orders:r.results||[]});
 }
 if(path==='/api/admin/video-orders/update'&&method==='POST'){
   const b=await parse(req),id=clean(b.id,80),status=clean(b.status,15),date=clean(b.deliveryDate,10);
   const old=await env.DB.prepare('SELECT status,delivery_date FROM video_orders WHERE id=?').bind(id).first();
   if(!old)return fail('Заказ не найден.',404);
   const transitions={pending:['pending','confirmed','declined','cancelled'],confirmed:['confirmed','completed','cancelled'],completed:['completed'],declined:['declined'],cancelled:['cancelled']};
   if(!transitions[old.status]?.includes(status)||!validStamp(date+'T00:00'))return fail('Проверьте дату и статус.',409);
   if(date!==old.delivery_date&&(!['pending','confirmed'].includes(old.status)||date<fiNow().slice(0,10)))return fail('Нельзя перенести завершённый заказ или выбрать прошедшую дату.',409);
   const r=await env.DB.prepare('UPDATE video_orders SET status=?,delivery_date=?,notes=? WHERE id=? AND status=? AND delivery_date=?').bind(status,date,clean(b.notes,1500),id,old.status,old.delivery_date).run();return r.meta.changes?reply({ok:true}):fail('Заказ изменился. Обновите страницу.',409);
 }
 if(path==='/api/admin/video-orders/delete'&&method==='POST'){
   const b=await parse(req),r=await env.DB.prepare("DELETE FROM video_orders WHERE id=? AND status IN('cancelled','declined')").bind(clean(b.id,80)).run();return r.meta.changes?reply({ok:true}):fail('Сначала отмените или отклоните видеозаказ.',409);
 }
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
   await expireBankHolds(env.DB);
   const [slots,bookings,messages]=await Promise.all([env.DB.prepare('SELECT * FROM slots ORDER BY start_at LIMIT 1000').all(),env.DB.prepare('SELECT b.*,q.summary AS quote_summary,q.snapshot AS quote_snapshot,t.share,t.participants,i.number AS invoice_number,i.sent_at,p.number AS deposit_number,p.amount AS deposit_amount,p.refunded_amount AS deposit_refunded,p.status AS deposit_status,p.sent_at AS deposit_sent,p.due_date AS deposit_due,p.bank_note AS deposit_note,(SELECT COUNT(*) FROM stripe_checkouts c WHERE c.booking_id=b.id AND c.status=\'paid\') AS stripe_paid,s.start_at,s.end_at,d.price,d.notes,d.final_status FROM bookings b JOIN slots s ON s.id=b.slot_id LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN booking_quotes q ON q.booking_id=b.id LEFT JOIN trip_shares t ON t.booking_id=b.id LEFT JOIN invoices i ON i.booking_id=b.id LEFT JOIN prepayment_requests p ON p.booking_id=b.id ORDER BY s.start_at,b.created_at LIMIT 1000').all(),env.DB.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 500').all()]);
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
 if((path==='/api/admin/bookings/move'||path==='/api/admin/slots/edit')&&method==='POST')return reschedule(req,env,reply,fiNow,now,async(row,start,end)=>{
   if(!env.RESEND_API_KEY||!env.FROM_EMAIL)throw Error('Mail unavailable');
   const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:env.FROM_EMAIL,to:[row.email],subject:'Pakkasukko · Изменение времени визита',text:'Здравствуйте! Новое согласованное время визита: '+start.replace('T',' ')+' – '+end.replace('T',' ')+', по времени Финляндии. Прежнее время: '+row.start_at.replace('T',' ')+'. Номер заявки: '+row.id})});if(!r.ok)throw Error('Mail not accepted');
 });
 if(path==='/api/admin/bookings/move-history'&&method==='GET'){const id=clean(url.searchParams.get('id'),80);const r=await env.DB.prepare('SELECT old_start,old_end,new_start,new_end,created_at FROM booking_moves WHERE booking_id=? ORDER BY created_at DESC').bind(id).all();return reply({moves:r.results});}
 if(path==='/api/admin/slots/delete'&&method==='POST'){
   const b=await parse(req);const r=await env.DB.prepare("DELETE FROM slots WHERE id=? AND status!='reserved' AND NOT EXISTS(SELECT 1 FROM bookings WHERE slot_id=slots.id)").bind(clean(b.id,80)).run();
   return r.meta.changes?reply({ok:true}):fail('Нельзя удалить занятый интервал или время с заявками.',409);
 }
 if(path==='/api/admin/bookings/status'&&method==='POST'){
   const b=await parse(req),id=clean(b.id,80),status=clean(b.status,15);
   if(status==='declined'){
     const auto=await env.DB.prepare("SELECT 1 FROM prepayment_requests WHERE booking_id=? AND json_extract(document,'$.automatic')=1").bind(id).first();
     if(auto)return fail('Для финансового резерва используйте «Отменить», чтобы освободить время и сохранить счёт.',409);
   }
   if(['confirmed','declined'].includes(status)){
     if(status==='confirmed'){
       const q=await env.DB.prepare('SELECT snapshot FROM booking_quotes WHERE booking_id=?').bind(id).first();
       if(q&&JSON.parse(q.snapshot).prepayment?.amount>0)return fail('Для этой заявки сначала выставьте авансовый счёт и проверьте оплату.',409);
     }
     try{const r=await env.DB.prepare("UPDATE bookings SET status=? WHERE id=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM booking_details WHERE booking_id=? AND final_status IS NOT NULL)").bind(status,id,id).run();
       return r.meta.changes?reply({ok:true}):fail('Статус уже изменён.',409);
     }catch{return fail('Этот интервал уже занят.',409);}
   }
   if(!['completed','cancelled'].includes(status))return fail('Недопустимый статус.');
   const r=await env.DB.prepare("INSERT INTO booking_details(booking_id,final_status) SELECT id,? FROM bookings WHERE id=? AND (status='confirmed' OR (status='pending' AND ?='cancelled')) ON CONFLICT(booking_id) DO UPDATE SET final_status=excluded.final_status WHERE booking_details.final_status IS NULL").bind(status,id,status).run();
   return r.meta.changes?reply({ok:true}):fail('Переход недоступен.',409);
 }
 if(path==='/api/admin/bookings/delete'&&method==='POST'){
   const body=await parse(req),id=clean(body?.id,80);
   if(!id)return fail('Выберите заказ.');
   try{
     const r=await env.DB.prepare('DELETE FROM bookings WHERE id=?').bind(id).run();
     return r.meta.changes?reply({ok:true}):fail('Заказ уже удалён или не найден.',404);
   }catch(e){
     const msg=String(e?.message||e);
     if(msg.includes('booking active'))return fail('Сначала отмените или отклоните заказ. Выполненные заказы не удаляются.',409);
     if(msg.includes('booking financial lock'))return fail('Удаление запрещено: по заказу выписан счёт или зафиксирована поездка.',409);
     console.warn('Booking deletion rejected',msg);return fail('Не удалось удалить заказ. Данные сохранены.',409);
   }
 }
 if(path==='/api/admin/bookings/details'&&method==='POST'){
   const b=await parse(req),minutes=Number(b.minutes);
   if(!Number.isInteger(minutes)||minutes<15||minutes>480)return fail('Проверьте длительность.');
   const row=await env.DB.prepare('SELECT s.*,q.snapshot FROM slots s JOIN bookings b ON b.slot_id=s.id LEFT JOIN booking_quotes q ON q.booking_id=b.id WHERE b.id=?').bind(b.id).first();
   if(!row)return fail('Заявка не найдена.',404);
   const financial=await env.DB.prepare('SELECT 1 FROM prepayment_requests WHERE booking_id=?').bind(b.id).first();
   if((financial||row.booking_id&&row.booking_id!==b.id)&&addMinutes(row.start_at,minutes)!==row.end_at)return fail('Нельзя менять продолжительность зарезервированного или оплаченного интервала.',409);
   const bookedMinutes=row.snapshot?JSON.parse(row.snapshot).durationMinutes:0;
   if(bookedMinutes&&minutes<bookedMinutes)return fail('Интервал нельзя сделать короче подтверждённой продолжительности выступления.',409);
   try{await env.DB.batch([
    env.DB.prepare('UPDATE slots SET end_at=? WHERE id=?').bind(addMinutes(row.start_at,minutes),row.id),
    env.DB.prepare('INSERT INTO booking_details(booking_id,price,notes) VALUES(?,?,?) ON CONFLICT(booking_id) DO UPDATE SET price=excluded.price,notes=excluded.notes').bind(b.id,clean(b.price,80),clean(b.notes,1500))
   ]);}catch{return fail('Длительность пересекается с другим интервалом.',409);}
   return reply({ok:true});
 }
 if(path==='/api/admin/messages/delete'&&method==='POST'){
   const b=await parse(req),id=clean(b?.id,80);
   if(!id)return fail('Выберите сообщение.');
   const r=await env.DB.prepare('DELETE FROM messages WHERE id=?').bind(id).run();
   return r.meta.changes?reply({ok:true}):fail('Сообщение уже удалено или не найдено.',404);
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
    if(req.method==='POST'&&origin!==url.origin&&url.pathname!=='/api/stripe/webhook')return fail('Недопустимый источник запроса.',403);
    return await api(req,env,ctx,url);
  }
  const response=await env.ASSETS.fetch(req),h=new Headers(response.headers);
  h.set('X-Content-Type-Options','nosniff');h.set('Referrer-Policy','strict-origin-when-cross-origin');h.set('X-Frame-Options','DENY');h.set('X-Robots-Tag','noindex,nofollow');
  return new Response(response.body,{status:response.status,headers:h});
 }catch(e){console.error('Pakkasukko server exception',e?.message);return fail('Ошибка обработки запроса.',500);}
}};