import {sellerForm,invoiceControls} from './billing-panel.js';
import {applyBrand} from './site.js';
import {musicAdmin} from './music-admin.js';
import {holidayRules,validFare} from './fares.js?v=58';
import {nextAnnualISO,endAnnualISO,isoToAnnual,compareHolidayRules} from './holiday-calendar.js?v=58';
import {renderVideoOrders} from './video-admin.js';
import {moveControls,slotControls} from './reschedule-panel.js';

const $=id=>document.getElementById(id);
let state=null;
const preview=location.hostname.endsWith('github.io')||location.hostname.endsWith('githack.com');
if(!preview)request('/api/public-config').then(config=>applyBrand(document,config.site?.logo)).catch(()=>{});
if(preview){$('previewNotice').classList.remove('hidden');$('loginForm').querySelector('button').disabled=true;}
async function request(path,method='GET',data){
 const r=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,cache:'no-store'});
 let body;try{body=await r.json();}catch{throw Error('Сервер бронирования ещё не подключён.');}
 if(!r.ok)throw Error(body.error||'Ошибка сервера');return body;
}
function status(id,message,isError=false){$(id).textContent=message;$(id).classList.toggle('error',isError);}
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=String(text);if(cls)node.className=cls;return node;}
function textBlock(parent,tag,text,cls){const child=el(tag,text,cls);parent.append(child);return child;}
function button(parent,label,cb,cls){const b=el('button',label,cls);b.type='button';b.addEventListener('click',cb);parent.append(b);return b;}
function format(stamp){return (stamp||'').replace('T',' ');}
async function reload(){
 try{state=await request('/api/admin/dashboard');$('loginBox').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');render();renderFare();await reloadInvoices();await reloadBookingState();await renderVideoOrders($('videoOrderList'),request);}
 catch(e){$('dashboard').classList.add('hidden');$('loginBox').classList.remove('hidden');$('logout').classList.add('hidden');}
}
async function reloadInvoices(){
 const box=$('invoiceList');box.replaceChildren();
 try{const {invoices}=await request('/api/admin/billing/list');if(!invoices.length)textBlock(box,'p','Счетов пока нет.');
 for(const i of invoices){const item=el('article',undefined,'record');textBlock(item,'h3','Счёт № '+i.number+' · '+i.buyer);textBlock(item,'p',i.issued+' · '+(i.total/100).toFixed(2)+' € · '+(i.sent_at?'Письмо принято почтовым сервисом':'Не отправлен'));const actions=el('div',undefined,'admin-actions');for(const [op,label] of [['view','Открыть счёт'],['pdf','Открыть PDF']]){const a=el('a',label);a.href='/api/admin/billing/'+op+'?id='+encodeURIComponent(i.id);actions.append(a);}item.append(actions);box.append(item);}
 }catch(e){textBlock(box,'p','Не удалось загрузить счета: '+e.message,'error');}
}
function fareNumber(parent,title,value,max,step='0.01'){
 const label=el('label',title),input=el('input');
 Object.assign(input,{type:'number',min:'0',max:String(max),step,value,required:true});
 label.append(input);parent.append(label);return input;
}
function addFareCity(city='',km=0,r={}){
 const row=el('fieldset'),grid=el('div',undefined,'admin-grid');
 const nameLabel=el('label','Город'),name=el('input');
 Object.assign(name,{value:city,required:true,maxLength:80});nameLabel.append(name);grid.append(nameLabel);
 const modeLabel=el('label','Способ поездки'),mode=el('select');
 mode.add(new Option('Автомобиль','car'));mode.add(new Option('Поезд','rail'));
 mode.value=r.mode||'car';modeLabel.append(mode);grid.append(modeLabel);
 const distance=fareNumber(grid,'Километры в одну сторону',km,2000,'0.1');
 const ticket=fareNumber(grid,'Билеты туда и обратно, €',r.ticket||0,5000);
 const nights=fareNumber(grid,'Ночей в гостинице',r.nights||0,30,'1');
 const hotel=fareNumber(grid,'Цена за ночь, €',r.hotel||0,2000);
 const meals=fareNumber(grid,'Питание за поездку, €',r.meals||0,2000);
 const display=()=>{
   distance.parentElement.style.display=mode.value==='car'?'':'none';
   ticket.parentElement.style.display=mode.value==='rail'?'':'none';
 };
 mode.onchange=display;display();row.append(grid);
 button(row,'Убрать город из тарифа',()=>row.remove());
 row.readRoute=()=>({city:name.value.trim(),km:distance.valueAsNumber,route:{mode:mode.value,
   ticket:ticket.valueAsNumber,nights:nights.valueAsNumber,hotel:hotel.valueAsNumber,meals:meals.valueAsNumber}});
 $('fareCities').append(row);return name;
}
function renderFare(){
 const f=state.fares,box=$('fareInputs');box.replaceChildren();$('fareCities').replaceChildren();
 renderHoliday();
 fareNumber(box,'Цена бензина, €/л',f.fuel,20,'0.001').id='fareFuel';
 fareNumber(box,'Расход, л/100 км',f.consumption,100,'0.1').id='fareConsumption';
 for(const [city,km] of Object.entries(f.km))if(city!=='Kitee')addFareCity(city,km,f.routes?.[city]);
}
$('addFareCity').onclick=()=>addFareCity().focus();
function appendHolidayRule(rule={}){
 const item=el('div',undefined,'record holiday-rule'),grid=el('div',undefined,'holiday-grid');
 const fields={};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki'}).format(new Date());
 const startISO=nextAnnualISO(rule.startDate||'24.12',today);
 const endISO=endAnnualISO(startISO,rule.endDate||'25.12');
 for(const [key,title,type,fallback] of [
  ['name','Название праздника','text','Новый праздник'],
  ['startDate','Дата начала','date','24.12'],
  ['startTime','Начало','time','20:00'],
  ['endDate','Дата окончания','date','25.12'],
  ['endTime','Окончание','time','09:00'],
  ['percent','Надбавка, %','number',50]
 ]){
  const label=el('label',title),input=el('input');
  input.type=type;input.required=true;
  input.value=key==='startDate'?startISO:key==='endDate'?endISO:String(rule[key]??fallback);
  if(key==='name')input.maxLength=80;
  if(key.endsWith('Date'))input.addEventListener('click',()=>{try{input.showPicker?.();}catch{/* Native picker icon remains available. */}});
  if(key==='percent'){input.min='0';input.max='300';input.step='1';}
  label.append(input);grid.append(label);fields[key]=input;
 }
 fields.startDate.addEventListener('change',()=>{
  const endAnnual=isoToAnnual(fields.endDate.value);
  if(endAnnual){const next=endAnnualISO(fields.startDate.value,endAnnual);if(next)fields.endDate.value=next;}
 });
 item.append(grid);
 const preview=el('p',undefined,'muted');
 const sample=()=>{const percent=fields.percent.valueAsNumber;preview.textContent=Number.isInteger(percent)&&percent>=0?'Пример: программа 100 € → '+(100*(1+percent/100)).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'Проверьте процент надбавки';};
 fields.percent.oninput=sample;sample();item.append(preview);
 const actions=el('div',undefined,'admin-actions');
 button(actions,'Удалить этот интервал',()=>item.remove(),'decline');
 item.append(actions);
 item.readHoliday=()=>({
  name:fields.name.value.trim(),startDate:isoToAnnual(fields.startDate.value),
  startTime:fields.startTime.value,endDate:isoToAnnual(fields.endDate.value),
  endTime:fields.endTime.value,percent:fields.percent.valueAsNumber
 });
 $('holidayRows').append(item);
 return fields.name;
}
function sortHolidayRows(){
 const parent=$('holidayRows'),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki'}).format(new Date());
 const mode=$('holidaySort').value,rows=[...parent.children];
 rows.sort((a,b)=>compareHolidayRules(a.readHoliday(),b.readHoliday(),mode,today));
 parent.append(...rows);
}
function renderHoliday(){
 const parent=$('holidayRows');parent.replaceChildren();
 for(const rule of holidayRules(state.fares))appendHolidayRule(rule);
 $('holidaySort').value=state.fares.holidaySort||'date';
 sortHolidayRows();
}
$('holidaySort').onchange=sortHolidayRows;
$('holidaySortApply').onclick=sortHolidayRows;
$('holidayAdd').onclick=()=>{
 if($('holidayRows').children.length>=60){status('holidayStatus','Можно добавить не более 60 интервалов.',true);return;}
 appendHolidayRule().focus({preventScroll:true});
};
$('holidayForm').onsubmit=async event=>{
 event.preventDefault();
 sortHolidayRows();
 const sortedRules=[...$('holidayRows').children].map(row=>row.readHoliday());
 const fares={...state.fares,holidayRules:sortedRules,holidaySort:$('holidaySort').value};
 if(!validFare(fares)){
   status('holidayStatus','Проверьте название, выбранные даты, часы, надбавку 0–300% и длительность интервала (от 15 минут до 72 часов).',true);
   return;
 }
 try{
  await request('/api/admin/travel-fare','POST',fares);
  state.fares=fares;
  status('holidayStatus','Сохранено: '+sortedRules.length+' интервалов и порядок сортировки. Новые тарифы действуют для следующих заявок.');
 }catch(e){status('holidayStatus',e.message,true);}
};
$('fareForm').onsubmit=async event=>{
 event.preventDefault();
 const km=Object.create(null),routes=Object.create(null),names=new Set(['kitee']);km.Kitee=0;
 for(const row of $('fareCities').children){
   const entry=row.readRoute(),key=entry.city.toLowerCase();
   if(!key||names.has(key)){status('fareStatus','Введите уникальное название для каждого города.',true);return;}
   names.add(key);km[entry.city]=entry.km;routes[entry.city]=entry.route;
 }
 const fares={...state.fares,fuel:$('fareFuel').valueAsNumber,consumption:$('fareConsumption').valueAsNumber,km,routes};
 try{await request('/api/admin/travel-fare','POST',fares);state.fares=fares;status('fareStatus','Тариф сохранён. Города автоматически обновятся на главной странице и в форме бронирования.');}
 catch(e){status('fareStatus',e.message,true);}
};
async function reloadBookingState(){
 const panel=$('bookingChecklist');panel.replaceChildren();
 try{
   const response=await request('/api/admin/booking-state');
   status('bookingStateStatus',response.enabled?'Приём заявок ВКЛЮЧЁН.':'Приём заявок выключен. Свободное время видно в календаре.');
   $('mailConfirmed').checked=response.mailReceived;
   $('privacyConfirmed').checked=response.privacyConfirmed;
   for(const issue of response.missing)textBlock(panel,'p','Требуется: '+issue,'muted');
   if(!response.missing.length)textBlock(panel,'p','Настройки готовы. Приём заявок можно включать.','status');
   $('enableBookings').disabled=response.enabled||!response.turnstileConfigured||!response.emailConfigured||!response.mailTestSent;
   $('disableBookings').disabled=!response.requested;
   $('emailTestButton').disabled=!response.emailConfigured;
 }catch(e){status('bookingStateStatus',e.message,true);}
}
$('emailTestButton').onclick=async()=>{
 status('emailTestStatus','Отправляем проверочное письмо…');
 try{const result=await request('/api/admin/email-test','POST',{});status('emailTestStatus',result.message);await reloadBookingState();}
 catch(e){status('emailTestStatus',e.message,true);}
};
$('enableBookings').onclick=async()=>{
 if(!confirm('Включить реальные заявки посетителей? Подтвердите, что получили тестовое письмо и разместили юридическую информацию.'))return;
 try{
   await request('/api/admin/booking-state','POST',{enabled:true,mailReceived:$('mailConfirmed').checked,privacyConfirmed:$('privacyConfirmed').checked});
   await reloadBookingState();
 }catch(e){status('bookingStateStatus',e.message,true);await reloadBookingState();}
};
$('disableBookings').onclick=async()=>{
 if(!confirm('Выключить отправку новых заявок? Ранее полученные заявки останутся в базе.'))return;
 try{await request('/api/admin/booking-state','POST',{enabled:false});await reloadBookingState();}
 catch(e){status('bookingStateStatus',e.message,true);}
};
$('day').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki'}).format(new Date());
$('day').onchange=$('period').onchange=()=>render();
function render(){
 const start=new Date($('day').value+'T00:00:00Z');
 if(!Number.isFinite(+start))return;
 const period=$('period').value;
 if(period==='month')start.setUTCDate(1);
 if(period==='week')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
 const end=new Date(start);
 if(period==='month')end.setUTCMonth(end.getUTCMonth()+1);else end.setUTCDate(end.getUTCDate()+(period==='week'?7:1));
 const slots=state.slots.filter(s=>s.start_at<end.toISOString().slice(0,16)&&s.end_at>start.toISOString().slice(0,16));
 const s=$('slotList'),b=$('bookingList'),m=$('messageList');s.replaceChildren();b.replaceChildren();m.replaceChildren();
 if(!slots.length)textBlock(s,'p','Интервалы пока не добавлены.','muted');
 for(const slot of slots){
  const item=el('article',undefined,'record');textBlock(item,'h3',format(slot.start_at)+' — '+format(slot.end_at));
  textBlock(item,'span',({open:'Свободно',blocked:'Заблокировано',reserved:'Подтверждено'}[slot.status]||slot.status),'pill');
  if(slot.note)textBlock(item,'p',slot.note);
  if(slot.status!=='reserved')button(item,'Удалить интервал',async()=>{if(!confirm('Удалить выбранное время?'))return;try{await request('/api/admin/slots/delete','POST',{id:slot.id});await reload();}catch(e){alert(e.message);}});
  slotControls(item,slot,request,reload);
  s.append(item);
 }
 if(!state.bookings.length)textBlock(b,'p','Заявок пока нет.','muted');
 for(const v of state.bookings){
  const item=el('article',undefined,'record');textBlock(item,'h3',format(v.start_at)+' — '+format(v.end_at));
  textBlock(item,'span',({pending:'Ожидает',confirmed:'Подтверждено',declined:'Отклонено',completed:'Выполнено',cancelled:'Отменено'}[v.final_status||v.status]||v.status),'pill '+v.status);
  textBlock(item,'p',v.name+' · '+v.service);
  textBlock(item,'p','Телефон: '+v.phone+' · Email: '+(v.email||'—'));
  textBlock(item,'p','Адрес: '+v.city+', '+v.address);
  if(v.quote_summary)textBlock(item,'p','Зафиксировано при отправке · '+v.quote_summary);
  if(v.message)textBlock(item,'p',v.message);
  textBlock(item,'small','Заявка: '+v.id+' · '+v.created_at);
  if(!v.final_status&&v.status==='pending')for(const [label,next,cls] of [['Подтвердить','confirmed','confirm'],['Отклонить','declined','decline']]){
   button(item,label,async()=>{if(!confirm('Обработать заявку: '+label+'?'))return;try{await request('/api/admin/bookings/status','POST',{id:v.id,status:next});await reload();}catch(e){alert(e.message);}},cls);
  }
  if(!v.final_status&&['pending','confirmed'].includes(v.status)){
   for(const [key,title] of [['cancelled','Отменить'],...(v.status==='confirmed'?[['completed','Выполнено']]:[])]){
    button(item,title,async()=>{try{await request('/api/admin/bookings/status','POST',{id:v.id,status:key});await reload();}catch(e){alert(e.message);}});
   }
   const values={};
   for(const [key,title,value] of [['price',v.quote_summary?'Дополнительная договорённость':'Стоимость',v.price],['minutes','Минуты интервала',(+new Date(v.end_at+'Z')-new Date(v.start_at+'Z'))/60000],['notes','Заметки',v.notes]]){
    const label=el('label',title),input=el('input');values[key]=input;input.value=value??'';label.append(input);item.append(label);
   }
   button(item,'Сохранить детали',async()=>{try{await request('/api/admin/bookings/details','POST',{id:v.id,...Object.fromEntries(Object.entries(values).map(([k,i])=>[k,i.value]))});await reload();}catch(e){alert(e.message);}});
  }
  if(v.final_status==='cancelled'||v.status==='declined'){
   if(v.invoice_number!=null||v.share!=null)textBlock(item,'p','Удаление недоступно: сохранены финансовые документы или расчёт поездки.','muted');
   else{
    const remove=button(item,'Удалить заказ',async()=>{
     if(!confirm('Окончательно удалить отменённый/отклонённый заказ от «'+v.name+'»? История этого заказа будет удалена, календарь и другие заказы сохранятся.'))return;
     remove.disabled=true;try{await request('/api/admin/bookings/delete','POST',{id:v.id});await reload();}catch(e){alert(e.message);}finally{remove.disabled=false;}
    },'decline');
   }
  }
  moveControls(item,v,state.slots,request,reload);
  invoiceControls(item,v,request,reload);
  b.append(item);
 }
 if(!state.messages.length)textBlock(m,'p','Сообщений пока нет.','muted');
 for(const v of state.messages){
  const item=el('article',undefined,'record');textBlock(item,'h3',v.name);
  textBlock(item,'p','Контакт: '+v.contact);textBlock(item,'p',v.message);textBlock(item,'small',v.created_at+' · '+v.status);
  if(v.status==='unread')button(item,'Отметить прочитанным',async()=>{try{await request('/api/admin/messages/read','POST',{id:v.id});await reload();}catch(e){alert(e.message);}});
  const remove=button(item,'Удалить сообщение',async()=>{
    if(!confirm('Удалить письмо от «'+v.name+'»? Восстановить его из админки нельзя.'))return;
    remove.disabled=true;
    try{await request('/api/admin/messages/delete','POST',{id:v.id});await reload();}
    catch(e){alert(e.message);}finally{remove.disabled=false;}
  },'decline');
  m.append(item);
 }

}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/admin/login','POST',Object.fromEntries(new FormData(e.currentTarget)));$('loginForm').reset();status('loginStatus','');await reload();}catch(err){status('loginStatus',err.message,true);}});
$('logout').addEventListener('click',async()=>{try{await request('/api/admin/logout','POST');}finally{await reload();}});
$('slotForm').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));try{await request('/api/admin/slots','POST',values);status('slotStatus','Интервал добавлен.');await reload();}catch(err){status('slotStatus',err.message,true);}});
if(!preview)reload();

document.getElementById('billingSettings').ontoggle=e=>{if(e.target.open)sellerForm(document.getElementById('sellerForm'),request).catch(err=>alert(err.message));};

document.getElementById('musicSettings').ontoggle=e=>{if(e.target.open)musicAdmin(document.getElementById('musicForm'),request).catch(err=>alert(err.message));};
