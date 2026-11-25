import {defaultFare,prices,quote,describe,euros,visitQuote} from './fares.js?v=55';
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
  block.append(note,output);input.closest('.form-row').after(block);
  let count=1;
  let selectedSlots=[];
  let current;
  function update(){
    populate();
    const other=select.value==='Другой город';
    input.hidden=!other;input.required=other;input.placeholder='Название города';
    const items=config.services||prices(config.site,config.content);
    const times=selectedSlots.map(s=>s.start_at).sort();
    current=quote(config.fares||defaultFare,items[service.value]||{label:'По запросу',remote:false},other?input.value.trim():select.value,count>1,times);
    output.textContent=describe(visitQuote(current,1,0));
    if(count>1){
      const visits=Array.from({length:count},(_,i)=>visitQuote(current,count,i));
      const total=visits.every(v=>v.total!==null)?visits.reduce((sum,v)=>sum+v.total,0):null;
      output.textContent='Коллективная заявка · Визитов: '+count+' · Обычная программа: '+(current.base==null?'по согласованию':euros(current.base))+' · Одна поездка: '+(current.travel==null?'по согласованию':euros(current.travel))+' · Максимум за все адреса: '+(total===null?'по согласованию':euros(total));
      const holidayVisits=visits.filter(v=>v.holidayName);
      if(holidayVisits.length)output.textContent+=' · Праздничный тариф +'+current.holidayPercent+'% на '+holidayVisits.length+' '+(holidayVisits.length===1?'визит':'визита(ов)');
      if(total!==null)output.textContent+=' · По времени: '+visits.map(v=>euros(v.total)).join(' / ');
    }
  }
  for(const control of [select,service,input])control.addEventListener('input',update);
  service.addEventListener('change',update);
  form.addEventListener('reset',()=>queueMicrotask(update));
  update();
  return {note,update,setCount(n){count=Math.max(1,n);selectedSlots=[];update();},setSlots(slots){selectedSlots=[...(slots||[])].sort((a,b)=>a.start_at.localeCompare(b.start_at));count=Math.max(1,selectedSlots.length);update();},payload(){update();return {city:current.city,group:count>1,quoteToken:JSON.stringify(current)};}};
}
