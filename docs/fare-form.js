import {defaultFare,prices,quote,describe,euros,visitQuote,performanceRows,performanceChoice,prepaymentForVisit,bookingPaymentMode} from './fares.js?v=68';
import {routeCities} from './route-cities.js';
export function mountFares(form,config){
  const service=form.elements.service,input=form.elements.city;
  const select=document.createElement('select');
  select.setAttribute('aria-label','Город праздника');
  let source;
  function populate(){
    const cities=(config.fares||defaultFare).km;
    if(source===cities)return;
    const previous=select.value;
    select.replaceChildren(...[...(routeCities({km:cities})||['Kitee']),'Другой город'].map(city=>new Option(city,city)));
    if(previous)select.value=Object.hasOwn(cities,previous)?previous:'Другой город';
    if(previous && previous!=='Другой город' && !Object.hasOwn(cities,previous))input.value=previous;
    source=cities;
  }
  input.before(select);input.required=false;
  const block=document.createElement('div');block.className='fare-summary';
  const note=document.createElement('p');
  note.textContent='При бронировании фиксируется максимальная сумма. Если в день выезда будут другие подтверждённые заказы в ваш город на ту же поездку, расходы разделятся и ваша сумма может уменьшиться. Для нескольких адресов в одном городе выберите отдельное время для каждого.';
  const output=document.createElement('strong');output.setAttribute('aria-live','polite');
  const paymentBox=document.createElement('div');paymentBox.className='prepayment-summary';paymentBox.hidden=true;
  const paymentText=document.createElement('p'),paymentLabel=document.createElement('label');
  const paymentConsent=document.createElement('input');paymentConsent.type='checkbox';paymentConsent.name='prepaymentTerms';paymentConsent.value='accepted';
  const terms=document.createElement('span');terms.append('Я ознакомился(-ась) с ');const link=document.createElement('a');link.href='./prepayment.html';link.target='_blank';link.rel='noopener';link.textContent='условиями предоплаты и отмены';terms.append(link,'. Предоплата входит в общую стоимость заказа.');
  paymentLabel.append(paymentConsent,terms);paymentBox.append(paymentText,paymentLabel);
  block.append(note,output,paymentBox);input.closest('.form-row').after(block);
  // Rates are optional: an unconfigured program keeps the original booking form.
  const choices=document.createElement('div');choices.className='performer-options';choices.hidden=true;
  const durationLabel=document.createElement('label');durationLabel.textContent='Продолжительность выступления';
  const durationSelect=document.createElement('select');durationSelect.setAttribute('aria-label','Продолжительность выступления');
  durationLabel.append(durationSelect);
  const castLabel=document.createElement('label');
  const castTitle=document.createElement('span');castTitle.textContent='Выберите, кто придёт к вам в гости?';
  const castSelect=document.createElement('select');
  castLabel.append(castTitle,castSelect);choices.append(durationLabel,castLabel);
  const hint=document.createElement('p');hint.className='performer-hint';hint.textContent='При изменении длительности свободное время в календаре выше обновится. Выберите подходящий интервал.';choices.append(hint);
  service.closest('label').after(choices);
  let onSelectionChange=()=>{};
  let count=1;
  let selectedSlots=[];
  let current,selectedPerformance=null;
  function updatePerformance(){
    const fare=config.fares||defaultFare;
    const rows=performanceRows(fare,service.value).filter(r=>Number.isInteger(r.solo)||Number.isInteger(r.duo)).sort((a,b)=>a.minutes-b.minutes);
    choices.hidden=!rows.length;
    if(!rows.length){selectedPerformance=null;return;}
    const previous=durationSelect.value;
    durationSelect.replaceChildren(...rows.map(row=>new Option(row.minutes+' мин · от '+euros(Math.min(...[row.solo,row.duo].filter(Number.isInteger))),String(row.minutes))));
    durationSelect.value=rows.some(r=>String(r.minutes)===previous)?previous:String(rows[0].minutes);
    const row=rows.find(r=>String(r.minutes)===durationSelect.value);
    const oldCast=castSelect.value;
    const available=[...(Number.isInteger(row.solo)?[new Option('Дед Мороз','solo')]:[]),...(Number.isInteger(row.duo)?[new Option('Дед Мороз и Снегурочка','duo')]:[])];
    castSelect.replaceChildren(...available);
    castSelect.value=available.some(o=>o.value===oldCast)?oldCast:(available.some(o=>o.value==='solo')?'solo':'duo');
    selectedPerformance=performanceChoice(fare,service.value,Number(durationSelect.value),castSelect.value);
  }
  function update(){
    populate();
    const other=select.value==='Другой город';
    input.hidden=!other;input.required=other;input.placeholder='Название города';
    const items=config.services||prices(config.site,config.content);
    updatePerformance();
    const times=selectedSlots.map(s=>s.start_at).sort();
    current=quote(config.fares||defaultFare,items[service.value]||{label:'По запросу',remote:false},other?input.value.trim():select.value,count>1,times,selectedPerformance);
    output.textContent=describe(visitQuote(current,1,0));
    const visitsForPay=Array.from({length:count},(_,i)=>visitQuote(current,count,i));
    const payments=visitsForPay.map(v=>prepaymentForVisit(config.fares||defaultFare,v)).filter(Boolean);
    const advance=payments.reduce((sum,p)=>sum+p.amount,0);
    paymentBox.hidden=!advance;paymentConsent.required=Boolean(advance);paymentConsent.disabled=!advance;
    const method=bookingPaymentMode((config.fares||defaultFare).prepayments||defaultFare.prepayments);
    const auto=method==='bank'&&config.fares?.prepayments?.automaticBank===true&&visitsForPay.every(v=>Number.isInteger(v.total));
    const modeText=auto?'Счёт откроется сразу после отправки заявки. Время резервируется до '+(config.fares?.prepayments?.holdHours||24)+' ч., но не позже начала визита.':method==='stripe'?'Оплата через защищённую ссылку Stripe после выставления счёта.':'Оплата банковским переводом после выставления счёта.';
    paymentText.textContent=advance?'Обязательная предоплата: '+euros(advance)+'. '+modeText+' Предоплата входит в общую стоимость.':'';
    const signature=JSON.stringify([method,auto,config.fares?.prepayments?.holdHours||24,payments]);
    if(!advance||(paymentBox.dataset.signature&&paymentBox.dataset.signature!==signature))paymentConsent.checked=false;
    paymentBox.dataset.signature=signature;paymentBox.dataset.method=method;
    if(count>1){
      const visits=Array.from({length:count},(_,i)=>visitQuote(current,count,i));
      const total=visits.every(v=>v.total!==null)?visits.reduce((sum,v)=>sum+v.total,0):null;
      output.textContent='Коллективная заявка · Визитов: '+count+(current.durationMinutes?' · '+(current.performerCast==='duo'?'Дед Мороз и Снегурочка':'Дед Мороз')+' · '+current.durationMinutes+' минут':'')+' · Программа за адрес: '+(current.base==null?'по согласованию':euros(current.base))+' · Одна поездка: '+(current.travel==null?'по согласованию':euros(current.travel))+' · Максимум за все адреса: '+(total===null?'по согласованию':euros(total));
      const holidayVisits=visits.filter(v=>v.holidayName);
      if(holidayVisits.length)output.textContent+=' · Праздничный тариф +'+current.holidayPercent+'% на '+holidayVisits.length+' '+(holidayVisits.length===1?'визит':'визита(ов)');
      if(total!==null)output.textContent+=' · По времени: '+visits.map(v=>euros(v.total)).join(' / ');
    }
  }
  for(const control of [select,service,input])control.addEventListener('input',update);
  service.addEventListener('change',()=>{update();onSelectionChange();});
  for(const control of [durationSelect,castSelect])control.addEventListener('change',()=>{update();onSelectionChange();});
  form.addEventListener('reset',()=>queueMicrotask(update));
  update();
  return {note,castTitle,update,onSelectionChange(fn){onSelectionChange=fn;},durationMinutes(){return selectedPerformance?.minutes||0;},setCount(n){count=Math.max(1,n);selectedSlots=[];update();},setSlots(slots){selectedSlots=[...(slots||[])].sort((a,b)=>a.start_at.localeCompare(b.start_at));count=Math.max(1,selectedSlots.length);update();},payload(){update();return {city:current.city,group:count>1,quoteToken:JSON.stringify(current),paymentMethod:bookingPaymentMode((config.fares||defaultFare).prepayments||defaultFare.prepayments),paymentQuote:JSON.stringify(Array.from({length:count},(_,i)=>prepaymentForVisit(config.fares||defaultFare,visitQuote(current,count,i)))),...(selectedPerformance?{performanceMinutes:selectedPerformance.minutes,performerCast:selectedPerformance.cast}:{})};}};
}
