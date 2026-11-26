// Stripe-hosted Checkout for previously agreed advances. Card details never reach Pakkasukko.
const available=env=>Boolean(/^sk_(test|live)_/.test(env.STRIPE_SECRET_KEY||'')&&/^whsec_/.test(env.STRIPE_WEBHOOK_SECRET||''));
const fail=(reply,message,status=400)=>reply({error:message},status);
const euroMoney=n=>(n/100).toFixed(2)+' €';
function secureSame(a,b){if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;}
const hash=async(key,message)=>{
 const encoder=new TextEncoder(),cryptoKey=await crypto.subtle.importKey('raw',encoder.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',cryptoKey,encoder.encode(message)))).map(n=>n.toString(16).padStart(2,'0')).join('');
};
export async function stripeWebhook(req,env,reply){
 if(!available(env))return fail(reply,'Stripe ещё не подключён.',503);
 const raw=await req.text();
 if(raw.length>100000)return fail(reply,'Слишком большой запрос.',413);
 const signature=req.headers.get('Stripe-Signature')||'',m=/(?:^|,)t=(\d+)(?:,|$)/.exec(signature);
 if(!m||Math.abs(Date.now()/1000-Number(m[1]))>300)return fail(reply,'Недействительная подпись Stripe.',400);
 const digest=await hash(env.STRIPE_WEBHOOK_SECRET,m[1]+'.'+raw);
 const values=[...signature.matchAll(/(?:^|,)v1=([a-f0-9]{64})(?=,|$)/g)];
 if(!values.some(([,v])=>secureSame(v,digest)))return fail(reply,'Недействительная подпись Stripe.',400);
 let event;try{event=JSON.parse(raw);}catch{return fail(reply,'Неверный формат события.',400);}
 const db=env.DB,entry=event?.data?.object;
 if(!entry||!event.id||typeof event.type!=='string')return fail(reply,'Событие Stripe неполное.',400);
 if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
  if(entry.payment_status!=='paid')return reply({received:true});
  const session=await db.prepare('SELECT * FROM stripe_checkouts WHERE id=?').bind(entry.id).first();
  if(!session||session.amount!==entry.amount_total||entry.currency!=='eur'
    ||entry.client_reference_id!==session.booking_id)return fail(reply,'Событие не соответствует заявке.',409);
  const stamp=new Date().toISOString();
  await db.prepare('UPDATE stripe_checkouts SET status=?,payment_intent=? WHERE id=?')
   .bind('paid',String(entry.payment_intent||''),session.id).run();
  const updated=await db.prepare("UPDATE prepayment_requests SET status='paid',paid_at=? WHERE booking_id=? AND status='requested' AND amount=?")
   .bind(stamp,session.booking_id,session.amount).run();
  if(updated.meta.changes)await db.prepare("INSERT INTO prepayment_events(booking_id,action,amount,note,created_at) VALUES(?,'paid',?,?,?)")
   .bind(session.booking_id,session.amount,'Stripe · '+session.id,stamp).run();
  return reply({received:true});
 }
 if(event.type==='charge.refunded'&&entry.currency==='eur'&&typeof entry.payment_intent==='string'){
  const session=await db.prepare("SELECT * FROM stripe_checkouts WHERE payment_intent=? AND status='paid'").bind(entry.payment_intent).first();
  if(!session)return reply({received:true});
  const refunded=Number(entry.amount_refunded);
  if(!Number.isSafeInteger(refunded)||refunded<0||refunded>session.amount)return fail(reply,'Неверная сумма возврата.',409);
  const old=await db.prepare('SELECT refunded_amount,status FROM prepayment_requests WHERE booking_id=?').bind(session.booking_id).first();
  if(old?.status==='paid'&&refunded>old.refunded_amount){
   const stamp=new Date().toISOString(),difference=refunded-old.refunded_amount;
   const updated=await db.prepare(`UPDATE prepayment_requests SET refunded_amount=?,refunded_at=?,
    status=CASE WHEN ?=amount THEN 'refunded' ELSE 'paid' END
    WHERE booking_id=? AND status='paid' AND refunded_amount<?`).bind(refunded,stamp,refunded,session.booking_id,refunded).run();
   if(updated.meta.changes)await db.prepare("INSERT INTO prepayment_events(booking_id,action,amount,note,created_at) VALUES(?,'refunded',?,?,?)")
     .bind(session.booking_id,difference,'Stripe · '+entry.id,stamp).run();
  }
  return reply({received:true});
 }
 return reply({received:true});
}
export async function stripeAdmin(req,env,path,reply){
 if(path==='status'&&req.method==='GET')return reply({enabled:available(env),mode:env.STRIPE_SECRET_KEY?.startsWith('sk_test_')?'test':available(env)?'live':'off'});
 if(!available(env))return fail(reply,'Для Stripe ещё не настроены секретные ключи и вебхук.',503);
 const id=String(new URL(req.url).searchParams.get('id')||'').slice(0,80);
 if(!id)return fail(reply,'Не указан заказ.');
 if(path==='checkout-link'&&req.method==='POST'){
  const db=env.DB;
  const deposit=await db.prepare(`SELECT p.number,p.amount,p.status,p.due_date,b.name,b.email,b.city,b.service,d.final_status,q.snapshot AS quote_snapshot
   FROM prepayment_requests p JOIN bookings b ON b.id=p.booking_id LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN booking_quotes q ON q.booking_id=b.id WHERE p.booking_id=?`).bind(id).first();
  if(!deposit)return fail(reply,'Сначала выпишите авансовый счёт.',409);
  if(JSON.parse(deposit.quote_snapshot||'{}').prepayment?.paymentMethod==='bank')return fail(reply,'Для этого заказа выбран банковский перевод.',409);
  if(deposit.status!=='requested'||deposit.final_status==='cancelled')return fail(reply,'Оплата этого заказа уже обработана или отменена.',409);
  const now=Math.floor(Date.now()/1000);
  const active=await db.prepare("SELECT * FROM stripe_checkouts WHERE booking_id=? AND status='open' AND expires_at>? ORDER BY created_at DESC LIMIT 1").bind(id,now+180).first();
  if(active)return reply({url:active.checkout_url,amount:active.amount,expiresAt:active.expires_at});
  const count=await db.prepare('SELECT COUNT(*) AS n FROM stripe_checkouts WHERE booking_id=?').bind(id).first();
  const current=new URL(req.url).origin,params=new URLSearchParams();
  params.set('mode','payment');
  params.set('success_url',current+'/payment-result.html?result=success');
  params.set('cancel_url',current+'/payment-result.html?result=cancel');
  params.set('client_reference_id',id);
  params.set('metadata[booking_id]',id);
  params.set('metadata[advance_number]','A-'+deposit.number);
  params.set('line_items[0][quantity]','1');
  params.set('line_items[0][price_data][currency]','eur');
  params.set('line_items[0][price_data][unit_amount]',String(deposit.amount));
  params.set('line_items[0][price_data][product_data][name]','Pakkasukko · предоплата за выступление');
  params.set('line_items[0][price_data][product_data][description]','Авансовый счёт A-'+deposit.number+' · '+deposit.city);
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(deposit.email||''))params.set('customer_email',deposit.email);
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',
   headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Content-Type':'application/x-www-form-urlencoded',
    'Idempotency-Key':'pakkasukko-advance-'+deposit.number+'-attempt-'+(count.n+1)},body:params});
  if(!response.ok)return fail(reply,'Stripe не открыл оплату. Проверьте настройки метода оплаты в кабинете Stripe.',502);
  const session=await response.json();
  if(!/^cs_(test|live)_/.test(session.id||'')||!/^https:\/\/checkout\.stripe\.com\//.test(session.url||'')
    ||session.amount_total!==deposit.amount||session.currency!=='eur'||session.expires_at<=now)return fail(reply,'Некорректный ответ платёжной системы.',502);
  try{await db.prepare(`INSERT INTO stripe_checkouts(id,booking_id,amount,checkout_url,expires_at,status,created_at)
   VALUES(?,?,?,?,?,'open',?)`).bind(session.id,id,deposit.amount,session.url,session.expires_at,new Date().toISOString()).run();}
  catch{return fail(reply,'Не удалось сохранить платёжную ссылку. Не отправляйте её клиенту.',409);}
  return reply({url:session.url,amount:deposit.amount,expiresAt:session.expires_at});
 }
 return fail(reply,'Маршрут Stripe не найден.',404);
}
