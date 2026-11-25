import {euros} from './fares.js';
import {invoiceService} from './invoice-service.js';
const fields={name:'Название предприятия',owner:'Имя исполнителя',businessId:'Y-tunnus',address:'Почтовый адрес предприятия',iban:'IBAN для оплаты',bic:'BIC / SWIFT',contact:'Контакты для счёта',vatRate:'ALV, ставка в % (цена включает налог)',vatId:'VAT ID при начислении ALV',vatNote:'Основание освобождения при отсутствии ALV',terms:'Срок оплаты в днях'};
function input(box,label,value='',type='text'){
 const wrap=document.createElement('label'),el=document.createElement('input');
 el.type=type;el.value=value;wrap.append(label,el);box.append(wrap);return el;
}
function button(box,title,fn){
 const btn=document.createElement('button');btn.type='button';btn.textContent=title;box.append(btn);
 btn.onclick=async()=>{btn.disabled=true;try{await fn();}catch(e){alert(e.message);}finally{btn.disabled=false;}};
}
export async function sellerForm(box,request){
 const url='/api/admin/billing/profile',profile=await request(url);box.replaceChildren();
 const controls={};for(const [k,title] of Object.entries(fields))controls[k]=input(box,title,profile[k]);
 let logo=profile.logo;
 const preview=document.createElement('img');preview.width=64;preview.alt='Логотип счёта';
 preview.src=logo||'./assets/pakkasukko-medallion.png';box.append(preview);
 const file=input(box,'Загрузить логотип для PDF','','file');file.accept='image/png,image/jpeg,image/webp';
 file.onchange=async()=>{
   if(!file.files[0])return;
   const url=URL.createObjectURL(file.files[0]);
   try{const image=new Image();image.src=url;await image.decode();
     const c=document.createElement('canvas'),scale=Math.min(1,96/Math.max(image.width,image.height));
     c.width=Math.max(1,Math.round(image.width*scale));c.height=Math.max(1,Math.round(image.height*scale));
     c.getContext('2d').drawImage(image,0,0,c.width,c.height);logo=c.toDataURL('image/png');preview.src=logo;
   }catch{alert('Не удалось прочитать изображение.');}finally{URL.revokeObjectURL(url);}
 };
 button(box,'Вернуть медальон',()=>{logo='';preview.src='./assets/pakkasukko-medallion.png';});
 button(box,'Сохранить реквизиты',async()=>{await request(url,'POST',{...Object.fromEntries(Object.entries(controls).map(([k,el])=>[k,el.value])),logo});alert('Реквизиты сохранены.');});
}
export function invoiceControls(box,b,request,reload){
 const q=JSON.parse(b.quote_snapshot||'{}');
 if(q.groupSize>1){const tag=document.createElement('p');tag.textContent='Коллективная заявка '+q.groupId.slice(0,8)+' · адресов: '+q.groupSize;box.append(tag);}
 if(b.quote_snapshot){const link=document.createElement('a');link.href='./trip.html#'+b.id;link.target='_blank';link.rel='noopener';link.textContent='Расчёт для клиента';box.append(link);}
 if(b.status!=='confirmed'||(b.final_status==='cancelled'&&!b.invoice_number))return;
 const url=op=>'/api/admin/billing/'+op+'?id='+encodeURIComponent(b.id);
 if(b.share!=null){const p=document.createElement('p');p.textContent='Заказов на поездку: '+b.participants+' · Доля: '+euros(b.share);box.append(p);}
 const needsDeparture=!b.invoice_number&&q.travel!=null&&!q.remote&&b.city!=='Kitee'&&b.share==null;
 if(needsDeparture){
   button(box,'Зафиксировать выезд',async()=>{
     if(!confirm('Зафиксировать подтверждённые заказы в этот город на эту поездку?'))return;
     await request(url('depart'),'POST',{});await reload();
   });
 }
 if(!b.invoice_number){
   const panel=document.createElement('details'),title=document.createElement('summary');title.textContent='Подготовить счёт';panel.append(title);box.append(panel);
   const buyer=input(panel,'Получатель',b.name),address=input(panel,'Платёжный адрес',b.address+', '+b.city);
   const defaults=invoiceService(b.service,q.remote,q);
   const serviceFi=input(panel,'Наименование услуги по-фински (Palvelun kuvaus)',defaults.fi);
   const serviceRu=input(panel,'Наименование услуги по-русски',defaults.ru);
   serviceFi.maxLength=220;serviceRu.maxLength=220;serviceFi.required=true;
   const base=q.base==null?input(panel,'Согласованная цена программы, €','','number'):null;
   const travel=q.travel==null?input(panel,'Согласованная стоимость дороги, €','','number'):null;
   const data=()=>({buyer:buyer.value,address:address.value,serviceFi:serviceFi.value,serviceRu:serviceRu.value,base:base?.value?Number(base.value):null,travel:travel?.value?Number(travel.value):null});
   const note=document.createElement('p');note.textContent='Предварительный просмотр доступен до даты услуги. Тестовый документ не сохраняется и не подлежит оплате.';panel.append(note);
   function openDraft(op){
     if(!serviceFi.value.trim())throw Error('Введите наименование услуги по-фински.');
     if([base,travel].some(el=>el&&(!el.value||!Number.isFinite(Number(el.value))||Number(el.value)<0||Number(el.value)>100000)))throw Error('Укажите согласованные суммы в евро.');
     const form=document.createElement('form');form.method='POST';form.action=url(op);
     const field=document.createElement('input');field.type='hidden';field.name='document';field.value=JSON.stringify(data());form.append(field);document.body.append(form);form.submit();form.remove();
   }
   button(panel,'Предварительный просмотр счёта',()=>openDraft('preview'));
   button(panel,'Тестовый PDF',()=>openDraft('preview-pdf'));
   if(needsDeparture){const hint=document.createElement('p');hint.textContent='Стоимость дороги предварительная до фиксации выезда.';panel.append(hint);return;}
   button(panel,'Выписать счёт',async()=>{
     if(!confirm('Зафиксировать сумму и присвоить номер счёта?'))return;
     const result=await request(url('issue'),'POST',data());await reload();document.getElementById('invoiceJournal')?.scrollIntoView({block:'start'});alert('Счёт № '+result.number+' сохранён. Откройте его в журнале счетов.');
   });
 }else{
   const link=document.createElement('a');link.href=url('view');link.style.display='block';link.textContent='Открыть счёт № '+b.invoice_number;box.append(link);
   if(b.sent_at){const p=document.createElement('p');p.textContent='Письмо принято почтовым сервисом '+b.sent_at.slice(0,10);box.append(p);}
   else{const email=input(box,'Email для отправки PDF',b.email,'email');
     button(box,'Отправить счёт клиенту',async()=>{if(!email.value||!email.reportValidity()||!confirm('Отправить PDF на '+email.value+'?'))return;
       await request(url('send'),'POST',{email:email.value});await reload();});}
 }
}
