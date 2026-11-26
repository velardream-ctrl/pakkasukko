import {invoiceView} from './invoice-view.js';
import {invoiceService} from '../docs/invoice-service.js';
const fiDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki'}).format(new Date());
const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const fail=(reply,message,status=400)=>reply({error:message},status);
const select=`SELECT p.*,b.name,b.email,b.address,b.city,b.service,s.start_at,b.status AS booking_status,d.final_status
 FROM prepayment_requests p JOIN bookings b ON b.id=p.booking_id
 JOIN slots s ON s.id=b.slot_id LEFT JOIN booking_details d ON d.booking_id=b.id WHERE p.booking_id=?`;
const safeNote=value=>String(value||'').trim().slice(0,300);
const readJSON=async req=>{try{return await req.json();}catch{return {};}};
export async function prepaymentsAPI(req,env,path,reply){
 const db=env.DB,url=new URL(req.url),id=String(url.searchParams.get('id')||'').slice(0,80),method=req.method;
 if(path==='list'&&method==='GET'){
  const {results}=await db.prepare(`SELECT p.number,p.booking_id,p.amount,p.refunded_amount,p.status,p.issued_at,p.due_date,p.sent_at,b.name,b.city FROM prepayment_requests p JOIN bookings b ON b.id=p.booking_id ORDER BY p.number DESC LIMIT 1000`).all();
  return reply({prepayments:results||[]});
 }
 if(!id)return fail(reply,'Выберите заявку.');
 const old=await db.prepare(select).bind(id).first();
 if(path==='request'&&method==='POST'){
  if(old)return reply({number:'A-'+old.number,alreadyIssued:true});
  const b=await db.prepare(`SELECT b.*,s.start_at,s.status AS slot_status,q.snapshot
   FROM bookings b JOIN slots s ON s.id=b.slot_id JOIN booking_quotes q ON q.booking_id=b.id WHERE b.id=?`).bind(id).first();
  if(!b)return fail(reply,'Заявка не найдена.',404);
  if(b.status!=='pending'||b.slot_status!=='open'||b.start_at<=fiDay()+'T00:00')return fail(reply,'Предоплата доступна только для новой заявки со свободным временем.',409);
  const q=JSON.parse(b.snapshot),amount=q.prepayment?.amount;
  if(!Number.isInteger(amount)||amount<=0||amount>10000000)return fail(reply,'Для заявки не установлена предоплата. Проверьте тариф, действовавший на момент заявки.',409);
  const seller=JSON.parse((await db.prepare("SELECT value FROM booking_settings WHERE key='billing_profile'").first())?.value||'{}');
  if(!seller.address||!seller.iban||seller.vatRate===undefined||seller.vatRate==='')return fail(reply,'Сначала заполните реквизиты и ALV в настройках счетов.');
  const issued=fiDay(),due=new Date(issued+'T12:00:00Z');
  due.setUTCDate(due.getUTCDate()+Math.min(30,Math.max(1,q.prepayment.dueDays||14)));
  const dueDate=due.toISOString().slice(0,10)>b.start_at.slice(0,10)?b.start_at.slice(0,10):due.toISOString().slice(0,10);
  const desc=invoiceService(b.service,q.remote,q);
  const doc={advance:true,seller,buyer:b.name,address:b.address+', '+b.city,city:b.city,
   serviceFi:'Ennakkomaksu / '+desc.fi,serviceRu:'Предоплата за выступление / '+desc.ru,
   service:desc.ru,issued,due:dueDate,date:b.start_at.slice(0,10),
   base:amount,travel:0,total:amount,quote:q};
  try{
   await db.batch([
    db.prepare("UPDATE bookings SET status='confirmed' WHERE id=? AND status='pending'").bind(id),
    db.prepare(`INSERT INTO prepayment_requests(booking_id,amount,document,issued_at,due_date)
     SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bookings WHERE id=? AND status='confirmed')`).bind(id,amount,JSON.stringify(doc),new Date().toISOString(),dueDate,id),
    db.prepare("INSERT INTO prepayment_events(booking_id,action,amount,created_at) VALUES(?,'requested',?,?)").bind(id,amount,new Date().toISOString())
   ]);
  }catch(e){return fail(reply,'Не удалось зарезервировать время. Возможно, интервал уже занят. Обновите страницу.',409);}
  const row=await db.prepare(select).bind(id).first();
  return row?reply({ok:true,number:'A-'+row.number,amount:row.amount,due:row.due_date}):fail(reply,'Предоплата не сохранилась.',409);
 }
 if(!old)return fail(reply,'Предоплата ещё не выставлена.',404);
 const document=JSON.parse(old.document),number='A-'+old.number;
 if(path==='view'&&method==='GET')return invoiceView({number,document:old.document,sent_at:old.sent_at},id,'prepayments');
 if(path==='pdf'&&method==='GET'){
  const {makePDF}=await import('./invoice-pdf.js');
  const bytes=await makePDF(document,number,env,url.origin);
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="Pakkasukko-ennakko-'+old.number+'.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path==='send'&&method==='POST'){
  if(old.sent_at)return reply({ok:true,alreadySent:true});
  const input=await readJSON(req),email=String(input.email||old.email||'').trim();
  if(!validEmail(email))return fail(reply,'Введите правильный email для авансового счёта.');
  if(!env.RESEND_API_KEY||!env.FROM_EMAIL)return fail(reply,'Не настроена почта Resend.');
  const {makePDF,base64}=await import('./invoice-pdf.js');
  const bytes=await makePDF(document,number,env,url.origin);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{
   Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json',
   'Idempotency-Key':'pakkasukko-advance-'+old.number
  },body:JSON.stringify({from:env.FROM_EMAIL,to:[email],
   subject:'Pakkasukko · Ennakkomaksu / Предоплата '+number,
   text:'Здравствуйте! По согласованному заказу Pakkasukko выставлен авансовый счёт '+number+
    ' на '+(old.amount/100).toFixed(2)+' €. Оплатите до '+old.due_date+
    '. Время визита зарезервировано до оплаты. Аванс войдёт в окончательную стоимость. Условия отмены: '+url.origin+'/prepayment.html',
   attachments:[{filename:'Pakkasukko-ennakko-'+old.number+'.pdf',content:base64(bytes)}]})});
  if(!response.ok)return fail(reply,'Почтовый сервис не принял письмо. Повторите попытку.',502);
  await db.prepare('UPDATE prepayment_requests SET sent_at=? WHERE booking_id=? AND sent_at IS NULL').bind(new Date().toISOString(),id).run();
  return reply({ok:true});
 }
 if(path==='paid'&&method==='POST'){
  if(document.quote?.prepayment?.paymentMethod==='stripe')return fail(reply,'Для этого заказа подтверждение оплаты поступает от Stripe.',409);
  const outstanding=await db.prepare("SELECT id FROM stripe_checkouts WHERE booking_id=? AND status='open' AND expires_at>? LIMIT 1").bind(id,Math.floor(Date.now()/1000)).first();
  if(outstanding)return fail(reply,'Есть активная ссылка Stripe. Дождитесь подтверждения оплаты или окончания срока ссылки.',409);
  const input=await readJSON(req),note=safeNote(input.note);
  if(!note)return fail(reply,'Укажите дату или примечание к банковскому поступлению.');
  const stamp=new Date().toISOString();
  try{await db.batch([
   db.prepare("UPDATE prepayment_requests SET status='paid',paid_at=?,bank_note=? WHERE booking_id=? AND status='requested'").bind(stamp,note,id),
   db.prepare(`INSERT INTO prepayment_events(booking_id,action,amount,note,created_at)
    SELECT booking_id,'paid',amount,?,? FROM prepayment_requests WHERE booking_id=? AND status='paid'
    AND paid_at=?`).bind(note,stamp,id,stamp)
  ]);}catch{return fail(reply,'Ошибка записи оплаты.',409);}
  const row=await db.prepare(select).bind(id).first();
  return row.status==='paid'?reply({ok:true}):fail(reply,'Оплата уже обработана.',409);
 }
 if(path==='refund'&&method==='POST'){
  const stripePayment=await db.prepare("SELECT id FROM stripe_checkouts WHERE booking_id=? AND status='paid' LIMIT 1").bind(id).first();
  if(stripePayment)return fail(reply,'Возврат по карте оформляется через Stripe. Он поступит в журнал автоматически после подтверждения Stripe.',409);
  const input=await readJSON(req),amount=Number(input.amount),note=safeNote(input.note);
  if(!Number.isInteger(amount)||amount<=0||!note)return fail(reply,'Введите сумму возврата в центах и причину/дату банковского перевода.');
  if(old.status!=='paid'||amount>old.amount-old.refunded_amount)return fail(reply,'Возврат превышает полученный остаток.',409);
  const stamp=new Date().toISOString();
  const updated=await db.prepare(`UPDATE prepayment_requests SET refunded_amount=refunded_amount+?,refunded_at=?,
   status=CASE WHEN refunded_amount+?=amount THEN 'refunded' ELSE 'paid' END
   WHERE booking_id=? AND status='paid' AND refunded_amount+?<=amount`).bind(amount,stamp,amount,id,amount).run();
  if(!updated.meta.changes)return fail(reply,'Состояние изменилось, обновите страницу.',409);
  await db.prepare("INSERT INTO prepayment_events(booking_id,action,amount,note,created_at) VALUES(?,'refunded',?,?,?)").bind(id,amount,note,stamp).run();
  return reply({ok:true});
 }
 return fail(reply,'Маршрут не найден.',404);
}
