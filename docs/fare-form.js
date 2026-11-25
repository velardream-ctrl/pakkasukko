import {defaultFare,prices,quote,describe,euros,visitQuote} from './fares.js';
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
  const note=document.createElement('p');note.textContent='Дед Мороз выезжает из Kitee. Стоимость дороги рассчитана за путь туда и обратно.';
  const output=document.createElement('strong');output.setAttribute('aria-live','polite');
  note.textContent='При бронировании фиксируется максимальная сумма. Если в день выезда будут другие подтверждённые заказы в ваш город на ту же поездку, расходы разделятся и ваша сумма может уменьшиться. Для нескольких адресов в одном городе выберите отдельное время для каждого.';
  block.append(note,output);input.closest('.form-row').after(block);
  let count=1;
  let current;
  function update(){
    populate();
    const other=select.value==='Другой город';
    input.hidden=!other;input.required=other;input.placeholder='Название города';
    const items=config.services||prices(config.site,config.content);
    current=quote(config.fares||defaultFare,items[service.value]||{label:'По запросу',remote:false},other?input.value.trim():select.value,count>1);
    output.textContent=describe(current);
    if(count>1)output.textContent='Коллективная заявка · Визитов: '+count+' · Программа за визит: '+(current.base==null?'по согласованию':euros(current.base))+' · Одна поездка: '+(current.travel==null?'по согласованию':euros(current.travel))+' · Максимум за все адреса: '+(current.total==null?'по согласованию':euros(current.base*count+current.travel));
    if(count>1&&current.total!=null){
      const amounts=Array.from({length:count},(_,i)=>euros(visitQuote(current,count,i).total));
      output.textContent+=' · По времени: '+amounts.join(' / ');
    }
  }
  for(const control of [select,service,input])control.addEventListener('input',update);
  service.addEventListener('change',update);
  form.addEventListener('reset',()=>queueMicrotask(update));
  update();
  return {update,setCount(n){count=Math.max(1,n);update();},payload(){update();return {city:current.city,group:count>1,quoteToken:JSON.stringify(current)};}};
}
