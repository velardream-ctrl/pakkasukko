import {defaultFare,prices,quote,describe} from './fares.js';
export function mountFares(form,config){
  const service=form.elements.service,input=form.elements.city;
  const select=document.createElement('select');
  select.setAttribute('aria-label','Город праздника');
  let source;
  function populate(){
    const cities=(config.fares||defaultFare).km;
    if(source===cities)return;
    const previous=select.value;
    select.replaceChildren(...['Kitee',...Object.keys(cities).filter(city=>city!=='Kitee'),'Другой город'].map(city=>new Option(city,city)));
    if(previous)select.value=Object.hasOwn(cities,previous)?previous:'Другой город';
    if(previous && previous!=='Другой город' && !Object.hasOwn(cities,previous))input.value=previous;
    source=cities;
  }
  input.before(select);input.required=false;
  const block=document.createElement('div');block.className='fare-summary';
  const note=document.createElement('p');note.textContent='Дед Мороз выезжает из Kitee. Стоимость дороги рассчитана за путь туда и обратно.';
  const output=document.createElement('strong');output.setAttribute('aria-live','polite');
  const label=document.createElement('label'),group=document.createElement('input');
  group.type='checkbox';label.className='consent';label.append(group,' Коллективная заявка (несколько семей или групп)');
  block.append(note,output,label);input.closest('.form-row').after(block);
  let current;
  function update(){
    populate();
    const other=select.value==='Другой город';
    input.hidden=!other;input.required=other;input.placeholder='Название города';
    const items=config.services||prices(config.site,config.content);
    current=quote(config.fares||defaultFare,items[service.value]||{label:'По запросу',remote:false},other?input.value.trim():select.value,group.checked);
    output.textContent=describe(current);
  }
  for(const control of [select,service,group,input])control.addEventListener('input',update);
  service.addEventListener('change',update);
  form.addEventListener('reset',()=>queueMicrotask(update));
  update();
  return {update,payload(){update();return {city:current.city,group:group.checked,quoteToken:JSON.stringify(current)};}};
}
