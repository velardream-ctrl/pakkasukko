import {invoiceView} from './invoice-view.js';
const eligible=`SELECT b.id,s.start_at,b.city,json_extract(q.snapshot,'$.travel') AS cap,coalesce(json_extract(q.snapshot,'$.tripCost'),json_extract(q.snapshot,'$.travel')) AS cost,
 json_extract(q.snapshot,'$.mode') AS mode
 FROM bookings b JOIN slots s ON s.id=b.slot_id JOIN booking_quotes q ON q.booking_id=b.id
 LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN trip_shares t ON t.booking_id=b.id
 WHERE b.status='confirmed' AND COALESCE(d.final_status,'')!='cancelled' AND t.booking_id IS NULL
 AND json_extract(q.snapshot,'$.remote')=0 AND json_extract(q.snapshot,'$.travel') IS NOT NULL AND b.city!='Kitee'`;
export const departureSQL=`WITH eligible AS (${eligible}), target AS (SELECT * FROM eligible WHERE id=?),
 ranked AS (SELECT e.id,e.cap,COUNT(*) OVER() AS n,MIN(e.cost) OVER() AS pool,
 ROW_NUMBER() OVER(ORDER BY e.start_at,e.id) AS pos
 FROM eligible e JOIN target t ON substr(e.start_at,1,10)=substr(t.start_at,1,10)
 AND e.city=t.city AND e.mode=t.mode)
 INSERT INTO trip_shares(booking_id,trip_id,participants,pool,share,departed)
 SELECT id,?,n,pool,MIN(cap,CAST(pool/n AS INTEGER)+(pos<=pool%n)),? FROM ranked`;
const bookingSQL=`SELECT b.*,s.start_at,q.snapshot,d.final_status,t.participants,t.pool,t.share
 FROM bookings b JOIN slots s ON s.id=b.slot_id LEFT JOIN booking_quotes q ON q.booking_id=b.id
 LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN trip_shares t ON t.booking_id=b.id WHERE b.id=?`;
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki'}).format(new Date());
export const profileDefaults={name:'Karjalas',owner:'Илья Дмитриев',businessId:'3445587-1',address:'',iban:'',bic:'',contact:'',vatRate:'',vatId:'',vatNote:'',terms:'14',logo:''};
const readProfile=async db=>({...profileDefaults,...JSON.parse((await db.prepare("SELECT value FROM booking_settings WHERE key='billing_profile'").first())?.value||'{}')});
function cents(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=100000?Math.round(value*100):null;}
export async function billing(req,env,path,reply){
 const db=env.DB,url=new URL(req.url),fail=(error,status=400)=>reply({error},status);
 if(path==='profile'){
   if(req.method==='GET')return reply(await readProfile(db));
   const body=await req.json(),p={};
   if(body.bic===undefined)body.bic=(await readProfile(db)).bic||'';
   for(const k of Object.keys(profileDefaults)){
     if(typeof body[k]!=='string'||body[k].length>(k==='logo'?80000:350))return fail('Проверьте реквизиты.');
     p[k]=body[k].trim();
   }
   p.bic=p.bic.replace(/\s/g,'').toUpperCase();
   if(p.bic&&!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(p.bic))return fail('Проверьте BIC / SWIFT.');
   if(p.logo&&!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(p.logo))return fail('Нужен логотип PNG.');
   if(!/^\d{7}-\d$/.test(p.businessId)||!p.name||!/^\d{1,2}$/.test(p.terms)||!/^\d{1,2}([.,]\d{1,2})?$/.test(p.vatRate))return fail('Введите Y-tunnus, срок и ставку ALV (включая 0).');
   if(!p.address||!p.iban||(!Number(p.vatRate.replace(',','.'))?!p.vatNote:!p.vatId))return fail('Нужны адрес, IBAN и VAT ID либо основание отсутствия ALV.');
   await db.prepare("INSERT INTO booking_settings(key,value) VALUES('billing_profile',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(p)).run();
   return reply({ok:true});
 }
 if(path==='list'&&req.method==='GET'){
   const rows=await db.prepare('SELECT number,booking_id,document,sent_at FROM invoices ORDER BY number DESC').all();
   return reply({invoices:rows.results.map(i=>{const d=JSON.parse(i.document);return {number:i.number,id:i.booking_id,buyer:d.buyer,issued:d.issued,due:d.due,total:d.total,sent_at:i.sent_at};})});
 }
 const id=url.searchParams.get('id')||'';
 const b=await db.prepare(bookingSQL).bind(id).first();
 if(!b)return fail('Заявка не найдена.',404);
 const q=b.snapshot?JSON.parse(b.snapshot):{};
 if(path==='share'&&req.method==='GET'){
   return reply({city:b.city,day:b.start_at.slice(0,10),maximum:q.total??null,travel:q.travel??null,base:q.base??null,
     participants:b.participants,pool:b.pool,share:b.share,cancelled:b.final_status==='cancelled'||b.status==='declined'});
 }
 if(path==='depart'&&req.method==='POST'){
   if(day()<b.start_at.slice(0,10))return fail('Зафиксируйте состав поездки в день выезда.');
   if(b.share!==null)return reply({ok:true});
   const r=await db.prepare(departureSQL).bind(id,crypto.randomUUID(),new Date().toISOString()).run();
   return r.meta.changes?reply({ok:true}):fail('Для этого заказа нет подтверждённой общей поездки.',409);
 }
 let invoice=await db.prepare('SELECT * FROM invoices WHERE booking_id=?').bind(id).first();
 if(path==='issue'&&req.method==='POST'){
   if(invoice)return reply({number:invoice.number});
   if(b.status!=='confirmed'||b.final_status==='cancelled'||day()<b.start_at.slice(0,10))return fail('Счёт доступен для подтверждённого действующего заказа с даты услуги.');
   if(q.travel!=null&&!q.remote&&b.city!=='Kitee'&&b.share==null)return fail('Сначала нажмите «Зафиксировать выезд».');
   const p=await readProfile(db);
   if(!p.address||!p.iban||p.vatRate==='')return fail('Заполните реквизиты для счёта.');
   const input=await req.json(),base=q.base??cents(input.base),travel=b.share??q.travel??cents(input.travel);
   if(base==null||travel==null)return fail('Укажите согласованные суммы в евро.');
   const buyer=String(input.buyer||b.name).trim().slice(0,200),address=String(input.address||b.address+', '+b.city).trim().slice(0,350);
   const issued=day(),due=new Date(issued+'T12:00:00Z');due.setUTCDate(due.getUTCDate()+Number(p.terms));
   const doc={seller:p,buyer,address,service:({gift:'Поздравление с подарком',home:'Домашняя программа',event:'Мероприятие'})[b.service]||b.service,
     date:b.start_at.slice(0,10),city:b.city,issued,due:due.toISOString().slice(0,10),base,travel,total:base+travel,
     maximum:q.total??null,participants:b.participants,pool:b.pool,quote:q};
   await db.prepare("INSERT INTO invoices(booking_id,document) SELECT ?,? WHERE EXISTS(SELECT 1 FROM bookings b LEFT JOIN booking_details d ON d.booking_id=b.id WHERE b.id=? AND b.status='confirmed' AND COALESCE(d.final_status,'')!='cancelled') ON CONFLICT(booking_id) DO NOTHING").bind(id,JSON.stringify(doc),id).run();
   invoice=await db.prepare('SELECT number FROM invoices WHERE booking_id=?').bind(id).first();
   return invoice?reply({number:invoice.number}):fail('Заказ отменён.',409);
 }
 if(!invoice)return fail('Сначала выпишите счёт.',409);
 if(path==='view'&&req.method==='GET')return invoiceView(invoice,id);
 if((path==='pdf'&&req.method==='GET')||(path==='send'&&req.method==='POST')){
   const sending=path==='send';
   if(sending&&invoice.sent_at)return reply({ok:true,alreadySent:true});
   const input=sending?await req.json():{},recipient=String(input.email||b.email||'').trim();
   if(sending&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return fail('Введите email клиента.');
   const {makePDF,base64}=await import('./invoice-pdf.js');
   const bytes=await makePDF(JSON.parse(invoice.document),invoice.number,env,url.origin);
   const filename='Karjalas-'+invoice.number+'.pdf';
   if(!sending)return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="'+filename+'"','Cache-Control':'private, no-store'}});
   const result=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'pakkasukko-invoice-'+invoice.number},body:JSON.stringify({from:env.FROM_EMAIL,to:[recipient],subject:'Pakkasukko · Lasku / Счёт № '+invoice.number,text:'Спасибо за праздник! Ваш счёт с расчётом поездки во вложении.',attachments:[{filename,content:base64(bytes)}]})});
   if(!result.ok)return fail('Почтовый сервис не принял письмо. Проверьте адрес и повторите.',502);
   await db.prepare('UPDATE invoices SET sent_at=? WHERE number=?').bind(new Date().toISOString(),invoice.number).run();
   return reply({ok:true});
 }
 return fail('Маршрут не найден.',404);
}
