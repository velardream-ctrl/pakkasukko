import {headingControls,introHeading} from './text-presentation.js';
import {initial} from './site.js?v=70';
import {sellerForm,invoiceControls} from './billing-panel.js';
import {prepaymentControls} from './prepayment-panel.js?v=65';
import {applyBrand} from './site.js';
import {musicAdmin} from './music-admin.js';
import {holidayRules,validFare,validHolidayRule,bookingPaymentMode} from './fares.js?v=68';
import {nextAnnualISO,endAnnualISO,isoToAnnual,compareHolidayRules,shiftEndForNewStart} from './holiday-calendar.js?v=59';
import {renderVideoOrders} from './video-admin.js';
import {moveControls,slotControls} from './reschedule-panel.js';

const $=id=>document.getElementById(id);
let state=null,publicServices={},stripeConnection={enabled:false,mode:'off'};
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
async function mountHeadingQuickEditor(){
 const box=$('headingQuickEditor');if(!box||box.dataset.ready)return;
 try{
  const data=await request('/api/admin/editor');const model=Object.assign(initial(),data.model||{});
  model.headingParts??={};model.headingOverrides??={};
  // Preserve any existing draft and require an explicit save or publish.
  const mock=document.createElement('h2');mock.append(document.createTextNode(introHeading[0].text),document.createElement('br'));const em=document.createElement('em');em.textContent=introHeading[1].text;mock.append(em);
  const published=el('p','Заголовок «Подарить воспоминания»','status');box.append(published);
  let dirty=false,revision=data.id||0;
  headingControls(box,model,'intro',mock,()=>{dirty=true;published.textContent='Есть несохранённые изменения';});
  for(const [publish,label] of [[false,'Сохранить черновик'],[true,'Опубликовать']])button(box,label,async()=>{
   try{if(!dirty){published.textContent='Нет изменений';return;}
    if(publish&&data.history?.[0]?.published===0&&!confirm('Будет опубликован весь текущий черновик сайта, включая другие сохранённые правки. Продолжить?'))return;
    const result=await request('/api/admin/editor','POST',{id:revision,model,publish});revision=result.id;dirty=false;published.textContent=publish?'Опубликовано':'Черновик сохранён';
   }catch(e){published.textContent=e.message;}
  },'btn btn-dark');
  box.dataset.ready='1';
 }catch(e){box.textContent=e.message;}
}
$('textAppearance')?.addEventListener('toggle',()=>{if($('textAppearance').open)mountHeadingQuickEditor();});
async function reload(){
 try{state=await request('/api/admin/dashboard');try{stripeConnection=await request('/api/admin/stripe/status');}catch{stripeConnection={enabled:false,mode:'off'};}try{publicServices=(await request('/api/public-config')).services||{};}catch{publicServices={};}$('loginBox').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');render();renderFare();renderPrepayments();renderPerformance();await reloadInvoices();await reloadBookingState();await renderVideoOrders($('videoOrderList'),request);}
 catch(e){$('dashboard').classList.add('hidden');$('loginBox').classList.remove('hidden');$('logout').classList.add('hidden');}
}
async function reloadInvoices(){
 const box=$('invoiceList');box.replaceChildren();
 try{const {invoices}=await request('/api/admin/billing/list');if(!invoices.length)textBlock(box,'p','Счетов пока нет.');
 for(const i of invoices){const item=el('article',undefined,'record');textBlock(item,'h3','Счёт № '+i.number+' · '+i.buyer);textBlock(item,'p',i.issued+' · '+(i.total/100).toFixed(2)+' € · '+(i.sent_at?'Письмо принято почтовым сервисом':'Не отправлен'));const actions=el('div',undefined,'admin-actions');for(const [op,label] of [['view','Открыть счёт'],['pdf','Открыть PDF']]){const a=el('a',label);a.href='/api/admin/billing/'+op+'?id='+encodeURIComponent(i.id);actions.append(a);}item.append(actions);box.append(item);}
 }catch(e){textBlock(box,'p','Не удалось загрузить счета: '+e.message,'error');}
 try{const {prepayments}=await request('/api/admin/prepayments/list');
 for(const p of prepayments){const item=el('article',undefined,'record');textBlock(item,'h3','Авансовый счёт A-'+p.number+' · '+p.name);
 textBlock(item,'p',p.city+' · '+(p.amount/100).toFixed(2)+' € · '+({requested:'Ожидает оплаты',paid:'Оплачено',refunded:'Возвращено'}[p.status]||p.status));
 const actions=el('div',undefined,'admin-actions');for(const [op,label] of [['view','Открыть аванс'],['pdf','PDF']]){const link=el('a',label);link.href='/api/admin/prepayments/'+op+'?id='+encodeURIComponent(p.booking_id);actions.append(link);}item.append(actions);box.append(item);
 }
 }catch(e){textBlock(box,'p','Не удалось получить авансовые счета: '+e.message,'error');}
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
// City-by-city advance payment: persisted together with fares but edited independently.
function refreshPaymentMode(){
 const select=$('bookingPaymentMethod'),mode=select.value;
 $('paymentTariffFields').hidden=mode==='none';$('autoBankFields').hidden=mode!=='bank';
 $('bookingPaymentHint').textContent=mode==='none'?'Новые заявки без предоплаты. Тарифы городов и старые счета сохраняются.':mode==='bank'?'В автоматическом режиме счёт открывается сразу после заявки. Оплату проверяет администратор.':stripeConnection.enabled&&stripeConnection.mode==='live'?'Онлайн-ссылка Stripe после выставления счёта; оплата подтверждается платёжным сервисом.':'Stripe не подключён в рабочем режиме. Для реальных заявок выберите банковский перевод или без предоплаты.';
}
function renderPrepayments(){
 const p=state.fares.prepayments||{enabled:true,dueDays:14,defaultRule:{mode:'fixed',percent:0,amount:5000},rules:{}};
 const select=$('bookingPaymentMethod');select.value=bookingPaymentMode(p);
 const stripeOption=select.querySelector('[value="stripe"]');stripeOption.disabled=!(stripeConnection.enabled&&stripeConnection.mode==='live')&&select.value!=='stripe';
 refreshPaymentMode();
 $('automaticBank').checked=p.automaticBank===true;$('holdHours').value=p.holdHours||24;
 $('prepaymentDue').value=p.dueDays||14;
 $('prepaymentBase').value=((p.defaultRule?.amount??5000)/100).toFixed(2);
 const list=$('prepaymentCities');list.replaceChildren();
 for(const city of Object.keys(state.fares.km)){
  const row=el('fieldset',undefined,'record'),grid=el('div',undefined,'admin-grid');
  const title=textBlock(row,'h3',city);
  const modeLabel=el('label','Способ предоплаты'),mode=el('select');
  for(const [label,key] of [['Как в общем тарифе','inherit'],['Без предоплаты','none'],['Стоимость дороги','travel'],['Процент от полной суммы','percent'],['Фиксированная сумма','fixed']])mode.add(new Option(label,key));
  const rule=p.rules?.[city]||{mode:'inherit',percent:0,amount:0};mode.value=rule.mode;
  modeLabel.append(mode);grid.append(modeLabel);
  const percent=fareNumber(grid,'Процент от заказа, %',rule.percent||0,100,'1');
  const amount=fareNumber(grid,'Фиксированная предоплата, €',(rule.amount/100||0).toFixed(2),100000);
  const refresh=()=>{percent.parentElement.hidden=mode.value!=='percent';amount.parentElement.hidden=mode.value!=='fixed';};
  mode.addEventListener('change',refresh);refresh();row.append(grid);
  row.readPayment=()=>[city,{mode:mode.value,percent:Math.round(percent.valueAsNumber),amount:Math.round(amount.valueAsNumber*100)}];
  list.append(row);
 }
 status('prepaymentStatus','Текущий режим: '+$('bookingPaymentMethod').selectedOptions[0].textContent+'.');
}
$('prepaymentForm').onsubmit=async event=>{
 event.preventDefault();
 const submit=$('prepaymentForm').querySelector('[type="submit"]'),rules=Object.fromEntries([...$('prepaymentCities').children].map(row=>row.readPayment()));
 const method=$('bookingPaymentMethod').value;
 if(method==='stripe'&&!(stripeConnection.enabled&&stripeConnection.mode==='live')){status('prepaymentStatus','Stripe не подключён в рабочем режиме.',true);return;}
 const prepayments={enabled:method!=='none',paymentMethod:method,automaticBank:$('automaticBank').checked,holdHours:Number($('holdHours').value),dueDays:Number($('prepaymentDue').value),defaultRule:{mode:'fixed',percent:0,amount:Math.round(Number($('prepaymentBase').value)*100)},rules};
 const next={...state.fares,prepayments};
 if(!validFare(next)){status('prepaymentStatus','Проверьте процент (0–100), сумму и срок (1–30 дней).',true);return;}
 submit.disabled=true;
 try{
  status('prepaymentStatus','Сохраняем…');
  await request('/api/admin/travel-fare','POST',next);
  const verified=(await request('/api/public-config')).fares;
  if(JSON.stringify(verified.prepayments)!==JSON.stringify(prepayments))throw Error('Настройки не подтвердились после сохранения.');
  state.fares=verified;status('prepaymentStatus','Условия предоплаты сохранены. Изменения применяются только к новым заявкам.');
 }catch(e){status('prepaymentStatus','Не сохранено: '+e.message,true);}
 finally{submit.disabled=false;}
};
$('bookingPaymentMethod').addEventListener('change',refreshPaymentMode);
$('prepaymentForm').addEventListener('input',()=>status('prepaymentStatus','Есть несохранённые изменения.'));

 // Each duration has two independent prices. Stored values are integer euro cents.
function performanceRow(parent,rate={minutes:30,solo:null,duo:null}){
 const row=el('fieldset',undefined,'record performance-rate'),grid=el('div',undefined,'admin-grid');
 const minutes=fareNumber(grid,'Длительность, минуты',rate.minutes,480,'5');
 minutes.min='10';minutes.step='5';
 const solo=fareNumber(grid,'Дед Мороз, €',rate.solo===null?'':(rate.solo/100).toFixed(2),100000);
 const duo=fareNumber(grid,'Дед Мороз + Снегурочка, €',rate.duo===null?'':(rate.duo/100).toFixed(2),100000);
 solo.required=false;duo.required=false;
 row.append(grid);
 button(row,'Удалить продолжительность',()=>{row.remove();status('performanceStatus','Есть несохранённые изменения.');});
 row.readRate=()=>{
  const convert=input=>{
   if(input.value.trim()==='')return null;
   if(!input.validity.valid||!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input.value))throw Error('Стоимость должна быть числом с точностью до цента.');
   return Math.round(Number(input.value)*100);
  };
  return {minutes:minutes.valueAsNumber,solo:convert(solo),duo:convert(duo)};
 };
 parent.append(row);
 return row;
}
function renderPerformance(){
 const enabled=state.fares.performance?.enabled===true,rates=state.fares.performance?.rates||{};
 $('performanceEnabled').checked=enabled;
 const root=$('performancePrograms');root.replaceChildren();
 const services=Object.keys(publicServices).length?Object.entries(publicServices).filter(([,item])=>!item.remote):[['gift',{label:'от 50 €'}],['home',{label:'от 100 €'}],['event',{label:'По запросу'}]];
 const labels=new Map(services.map(([id,item])=>[id,item.label||id]));
 for(const id of Object.keys(rates))if(!labels.has(id))labels.set(id,id+' (сохранённая программа)');
 for(const [id,label] of labels){
  const section=el('fieldset',undefined,'record performance-service');section.dataset.service=id;
  const name=el('h3',id==='gift'?'Короткое поздравление':id==='home'?'Домашняя программа':id==='event'?'Мероприятие':id);
  const help=el('p','Исходная цена карточки: '+label,'muted');
  const rows=el('div',undefined,'records');
  const match=String(label).match(/^(?:от\s*)?(\d+(?:[.,]\d{1,2})?)\s*€?$/i);
  const original=match?Math.round(Number(match[1].replace(',','.'))*100):null;
  for(const rate of rates[id]||[{minutes:30,solo:original,duo:null}])performanceRow(rows,rate);
  button(section,'＋ Добавить продолжительность',()=>{
   const current=[...rows.children].map(x=>x.readRate().minutes);
   const n=[10,15,20,30,45,60,90,120].find(n=>!current.includes(n))||Math.max(...current,0)+15;
   if(rows.children.length>=25||n>480){status('performanceStatus','Не более 25 продолжительностей для одной программы.',true);return;}
   performanceRow(rows,{minutes:n,solo:null,duo:null});
   status('performanceStatus','Есть несохранённые изменения.');
  });
  section.prepend(name,help,rows);section.readRates=()=>[...rows.children].map(x=>x.readRate()).filter(x=>x.solo!==null||x.duo!==null);
  root.append(section);
 }
 status('performanceStatus',enabled?'Выбор артистов включён. Изменяйте цены и сохраняйте настройки.':'Пока выключено: прежняя форма бронирования работает как раньше.');
}
$('performanceForm').addEventListener('input',()=>status('performanceStatus','Есть несохранённые изменения. Нажмите «Сохранить программы и цены».'));
$('performanceForm').onsubmit=async event=>{
 event.preventDefault();
 const submit=$('performanceForm').querySelector('button[type="submit"]');
 if(submit.disabled)return;
 try{
  const rates=Object.create(null);
  for(const section of $('performancePrograms').children)rates[section.dataset.service]=section.readRates();
  const performance={enabled:$('performanceEnabled').checked,rates};
  const fares={...state.fares,performance};
  if(!validFare(fares))throw Error('Проверьте длительности (10–480 минут, без повторов) и цены (от 0 до 100 000 €).');
  submit.disabled=true;status('performanceStatus','Сохраняем и проверяем настройки…');
  await request('/api/admin/travel-fare','POST',fares);
  const verified=(await request('/api/public-config')).fares;
  if(JSON.stringify(verified?.performance)!==JSON.stringify(performance))throw Error('Сервер не подтвердил сохранение. Не обновляйте страницу, попробуйте ещё раз.');
  state.fares=verified;status('performanceStatus','Сохранено. Посетители увидят только настроенные сочетания артистов и длительности.');
 }catch(e){status('performanceStatus','Не сохранено: '+e.message,true);}
 finally{submit.disabled=false;}
};

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
 let previousStartISO=startISO;
 fields.startDate.addEventListener('change',()=>{
  const shifted=shiftEndForNewStart(previousStartISO,fields.endDate.value,fields.startDate.value);
  if(shifted)fields.endDate.value=shifted;
  previousStartISO=fields.startDate.value;
 });
 item.append(grid);
 const preview=el('p',undefined,'muted');
 const sample=()=>{const percent=fields.percent.valueAsNumber;preview.textContent=Number.isInteger(percent)&&percent>=0?'Пример: программа 100 € → '+(100*(1+percent/100)).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'Проверьте процент надбавки';};
 fields.percent.oninput=sample;sample();item.append(preview);
 const rowWarning=el('p',undefined,'holiday-row-error');rowWarning.hidden=true;rowWarning.setAttribute('role','alert');item.append(rowWarning);
 item.showIssue=message=>{rowWarning.textContent=message;rowWarning.hidden=!message;item.classList.toggle('holiday-invalid',Boolean(message));};
 item.addEventListener('input',()=>{item.showIssue('');holidayFeedback('Есть несохранённые изменения. Нажмите «Сохранить праздничные интервалы».');});
 const actions=el('div',undefined,'admin-actions');
 button(actions,'Удалить этот интервал',()=>{item.remove();holidayFeedback('Интервал удалён из редактора. Для сохранения нажмите «Сохранить праздничные интервалы».');},'decline');
 item.append(actions);
 item.readHoliday=()=>({
  name:fields.name.value.trim(),startDate:isoToAnnual(fields.startDate.value),
  startTime:fields.startTime.value,endDate:isoToAnnual(fields.endDate.value),
  endTime:fields.endTime.value,percent:fields.percent.valueAsNumber
 });
 $('holidayRows').append(item);
 return fields.name;
}
function holidayFeedback(message,isError=false){
 status('holidayStatus',message,isError);
 status('holidayStatusTop',message,isError);
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
$('holidaySort').onchange=()=>{sortHolidayRows();holidayFeedback('Порядок изменён. Нажмите «Сохранить праздничные интервалы».');};
$('holidaySortApply').onclick=sortHolidayRows;
$('holidayAdd').onclick=()=>{
 if($('holidayRows').children.length>=60){status('holidayStatus','Можно добавить не более 60 интервалов.',true);return;}
 appendHolidayRule().focus({preventScroll:true});
 holidayFeedback('Новый интервал добавлен в редактор. Заполните даты и нажмите «Сохранить праздничные интервалы».');
};
$('holidayForm').onsubmit=async event=>{
 event.preventDefault();
 const submit=$('holidayForm').querySelector('button[type="submit"]');
 if(submit.disabled)return;
 sortHolidayRows();
 const rows=[...$('holidayRows').children],sortedRules=rows.map(row=>row.readHoliday());
 const invalid=[];
 for(let i=0;i<rows.length;i++){
  const ok=validHolidayRule(sortedRules[i]);
  rows[i].showIssue(ok?'':'Проверьте название, дату окончания и длительность (от 15 минут до 72 часов). При переходе через полночь выберите следующий день.');
  if(!ok)invalid.push(i);
 }
 if(invalid.length){
  holidayFeedback('Не сохранено: ошибка в '+invalid.length+' интервале(ах). Исправьте выделенные строки и повторите сохранение.',true);
  rows[invalid[0]].scrollIntoView({behavior:'smooth',block:'center'});
  return;
 }
 const fares={...state.fares,holidayRules:sortedRules,holidaySort:$('holidaySort').value};
 if(!validFare(fares)){
  holidayFeedback('Не сохранено: обнаружена ошибка в параметрах тарифа. Проверьте стоимость поездки и интервалы.',true);
  return;
 }
 submit.disabled=true;
 holidayFeedback('Сохраняем интервалы и проверяем запись в базе…');
 try{
  await request('/api/admin/travel-fare','POST',fares);
  const verified=await request('/api/public-config');
  const stored=verified.fares;
  if(!stored||JSON.stringify(stored.holidayRules)!==JSON.stringify(sortedRules)||stored.holidaySort!==fares.holidaySort)
   throw Error('Сервер не подтвердил сохранение после повторного чтения. Изменения оставлены в редакторе для повторной попытки.');
  state.fares=stored;
  holidayFeedback('Сохранено и проверено: '+sortedRules.length+' интервалов. Изменения останутся после обновления страницы.');
 }catch(e){
  holidayFeedback('Ошибка сохранения: '+e.message+'. Исправьте проблему и повторите попытку, не обновляя страницу.',true);
 }finally{submit.disabled=false;}
};
$('fareForm').onsubmit=async event=>{
 event.preventDefault();
 const km=Object.create(null),routes=Object.create(null),names=new Set(['kitee']);km.Kitee=0;
 for(const row of $('fareCities').children){
   const entry=row.readRoute(),key=entry.city.toLowerCase();
   if(!key||names.has(key)){status('fareStatus','Введите уникальное название для каждого города.',true);return;}
   names.add(key);km[entry.city]=entry.km;routes[entry.city]=entry.route;
 }
 const fares={...state.fares,fuel:$('fareFuel').valueAsNumber,consumption:$('fareConsumption').valueAsNumber,km,routes,prepayments:{...(state.fares.prepayments||{enabled:true,dueDays:14,defaultRule:{mode:'fixed',percent:0,amount:5000}}),rules:Object.fromEntries(Object.entries(state.fares.prepayments?.rules||{}).filter(([city])=>Object.hasOwn(km,city)))}};
 try{await request('/api/admin/travel-fare','POST',fares);state.fares=fares;renderPrepayments();status('fareStatus','Тариф сохранён. Города автоматически обновятся на главной странице и в форме бронирования.');}
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
  textBlock(item,'span',({open:'Свободно',blocked:'Заблокировано',reserved:'Занято / резерв'}[slot.status]||slot.status),'pill');
  if(slot.note)textBlock(item,'p',slot.note);
  if(slot.status!=='reserved')button(item,'Удалить интервал',async()=>{if(!confirm('Удалить выбранное время?'))return;try{await request('/api/admin/slots/delete','POST',{id:slot.id});await reload();}catch(e){alert(e.message);}});
  slotControls(item,slot,request,reload);
  s.append(item);
 }
 if(!state.bookings.length)textBlock(b,'p','Заявок пока нет.','muted');
 for(const v of state.bookings){
  const item=el('article',undefined,'record');textBlock(item,'h3',format(v.start_at)+' — '+format(v.end_at));
  textBlock(item,'span',v.final_status?({completed:'Выполнено',cancelled:'Отменено'}[v.final_status]||v.final_status):v.deposit_status==='requested'?'Резерв · ожидает предоплату':v.deposit_status==='paid'?'Предоплата получена':({pending:'Ожидает',confirmed:'Подтверждено',declined:'Отклонено'}[v.status]||v.status),'pill '+v.status);
  textBlock(item,'p',v.name+' · '+v.service);
  textBlock(item,'p','Телефон: '+v.phone+' · Email: '+(v.email||'—'));
  textBlock(item,'p','Адрес: '+v.city+', '+v.address);
  if(v.quote_summary)textBlock(item,'p','Зафиксировано при отправке · '+v.quote_summary);
  if(v.message)textBlock(item,'p',v.message);
  textBlock(item,'small','Заявка: '+v.id+' · '+v.created_at);
  if(!v.final_status&&v.status==='pending')for(const [label,next,cls] of [...(JSON.parse(v.quote_snapshot||'{}').prepayment?.amount?[]:[['Подтвердить','confirmed','confirm']]),...(v.deposit_number?[]:[['Отклонить','declined','decline']])]){
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
   if(v.invoice_number!=null||v.deposit_number!=null||v.share!=null)textBlock(item,'p','Удаление недоступно: сохранены финансовые документы или расчёт поездки.','muted');
   else{
    const remove=button(item,'Удалить заказ',async()=>{
     if(!confirm('Окончательно удалить отменённый/отклонённый заказ от «'+v.name+'»? История этого заказа будет удалена, календарь и другие заказы сохранятся.'))return;
     remove.disabled=true;try{await request('/api/admin/bookings/delete','POST',{id:v.id});await reload();}catch(e){alert(e.message);}finally{remove.disabled=false;}
    },'decline');
   }
  }
  moveControls(item,v,state.slots,request,reload);
  prepaymentControls(item,v,request,reload,stripeConnection);
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
