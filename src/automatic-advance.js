import {bankProfileReady,paymentData} from './bank-payment.js';
import {invoiceService} from '../docs/invoice-service.js';
import {invoiceView} from './invoice-view.js';
const localTime=date=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(' ','T');
const now=()=>new Date().toISOString();
export async function advanceAccessDigest(token){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function createAdvanceAccess(){
 const token=crypto.randomUUID().replace(/-/g,'')+crypto.randomUUID().replace(/-/g,'');
 return {token,digest:await advanceAccessDigest(token)};
}
export async function bankProfile(db){
 const p=JSON.parse((await db.prepare("SELECT value FROM booking_settings WHERE key='billing_profile'").first())?.value||'{}');
 if(!bankProfileReady(p))return null;
 return p;
}
export function autoAdvanceDocument({seller,order,serviceId,slot,quote,hours=24}){
 const issued=localTime(new Date()).slice(0,10),hold=localTime(new Date(Date.now()+hours*3600000));
 const holdUntil=hold<slot.start_at?hold:slot.start_at;
 const desc=invoiceService(serviceId,quote.remote,quote);
 const amount=quote.prepayment.amount;
 return {advance:true,bankPayment:true,automatic:true,holdUntil,seller,buyer:order.name,address:order.address+', '+order.city,city:order.city,
  serviceFi:'Ennakkomaksu / '+desc.fi,serviceRu:'Предоплата за выступление / '+desc.ru,service:desc.ru,issued,due:holdUntil.slice(0,10),
  date:slot.start_at.slice(0,10),time:slot.start_at,base:amount,travel:0,total:amount,quote};
}
export function advanceStatements(db,id,doc,stamp){
 // Existing slot constraint and transaction guarantee that only one automatic reserve wins.
 return [
  db.prepare("UPDATE slots SET status='reserved',booking_id=? WHERE id=(SELECT slot_id FROM bookings WHERE id=?) AND status='open'").bind(id,id),
  db.prepare("INSERT INTO prepayment_requests(booking_id,amount,document,issued_at,due_date) VALUES(?, ?, ?, ?, ?)").bind(id,doc.total,JSON.stringify(doc),stamp,doc.due),
  db.prepare("INSERT INTO prepayment_events(booking_id,action,amount,created_at) VALUES(?,'requested',?,?)").bind(id,doc.total,stamp)
 ];
}
export async function expireBankHolds(db){
 // Cancelled bookings and financial records remain in the journal; the existing cancel trigger frees the slot.
 await db.prepare(`INSERT INTO booking_details(booking_id,final_status)
  SELECT p.booking_id,'cancelled' FROM prepayment_requests p JOIN bookings b ON b.id=p.booking_id
  LEFT JOIN booking_details d ON d.booking_id=b.id
  WHERE p.status='requested' AND b.status='pending' AND d.final_status IS NULL
  AND json_extract(p.document,'$.automatic')=1 AND ((p.bank_note='' AND json_extract(p.document,'$.holdUntil')<=?) OR json_extract(p.document,'$.time')<=?)
  ON CONFLICT(booking_id) DO UPDATE SET final_status='cancelled' WHERE booking_details.final_status IS NULL`).bind(localTime(new Date()),localTime(new Date())).run();
}
export async function publicAdvance(req,env,url,reply,mac,same,emailOwner){
 const id=url.searchParams.get('id')||'',token=url.searchParams.get('token')||'';
 if(!/^[a-f0-9-]{36}$/.test(id)||! /^[a-f0-9]{64}$/.test(token)||!env.DB)return reply({error:'Счёт не найден.'},404);
 const lookup=()=>env.DB.prepare(`SELECT p.*,b.status AS booking_status,b.email,d.final_status
 FROM prepayment_requests p JOIN bookings b ON b.id=p.booking_id LEFT JOIN booking_details d ON d.booking_id=b.id WHERE p.booking_id=?`).bind(id).first();
 let row=await lookup();if(!row)return reply({error:'Счёт не найден.'},404);
 const doc=JSON.parse(row.document),number='A-'+row.number;
 const valid=doc.accessDigest?same(doc.accessDigest,await advanceAccessDigest(token)):Boolean(env.SESSION_SECRET&&same(token,await mac(env.SESSION_SECRET,'advance:'+id)));
 if(!doc.automatic||!valid)return reply({error:'Счёт не найден.'},404);
 await expireBankHolds(env.DB);row=await lookup();
 const active=row.status==='requested'&&!row.final_status&&row.booking_status==='pending';
 const params='?id='+encodeURIComponent(id)+'&token='+encodeURIComponent(token);
 const root='/api/advance/';
 if(url.pathname===root+'view'&&req.method==='GET'){
  return invoiceView({number,document:row.document,sent_at:row.sent_at},id,'prepayments',{
   pdf:active&&!row.bank_note?root+'pdf'+params:null,report:active&&!row.bank_note?root+'report'+params:null,
   status:row.final_status?'Бронирование отменено. Не оплачивайте счёт. Если уже перевели деньги, свяжитесь с организатором.':row.status==='paid'?'Оплата получена.':row.status==='refunded'?'Предоплата возвращена.':row.bank_note?'Вы сообщили об оплате. Ожидается проверка банка.':'Время временно зарезервировано. Бронь подтверждается после получения денег.',
   active,ownerEmail:env.OWNER_EMAIL||'',reported:Boolean(row.bank_note)
  });
 }
 if(url.pathname===root+'pdf'&&req.method==='GET'&&active&&!row.bank_note){
  const {makePDF}=await import('./invoice-pdf.js');
  const bytes=await makePDF(doc,number,env,url.origin);
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="Pakkasukko-ennakko-'+row.number+'.pdf"','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','X-Content-Type-Options':'nosniff'}});
 }
 if(url.pathname===root+'report'&&req.method==='POST'&&active){
  const stamp=now();
  const result=await env.DB.prepare("UPDATE prepayment_requests SET bank_note=? WHERE booking_id=? AND status='requested' AND bank_note='' AND NOT EXISTS(SELECT 1 FROM booking_details WHERE booking_id=? AND final_status IS NOT NULL)").bind('Клиент сообщил об оплате '+stamp,id,id).run();
  if(result.meta.changes)await emailOwner(env,'Pakkasukko · клиент сообщил об оплате '+number,'Счёт '+number+' · viitenumero '+paymentData(doc,number).reference+' · '+(row.amount/100).toFixed(2)+' €. Проверьте фактическое поступление в банке.');
  return new Response(null,{status:303,headers:{Location:root+'view'+params,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }
 return reply({error:'Действие недоступно.'},409);
}
