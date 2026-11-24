import {defaults,ranges,settings} from './snow.js';

export function snowPanel(root,raw,change){
  const s=settings(raw);
  root.replaceChildren();
  function field(key,title,type,options){
    const label=document.createElement('label'), el=document.createElement(options?'select':'input');
    const caption=document.createElement('span');
    const describe=()=>{caption.textContent=title+(type==='range'?' · '+s[key]+'%':'');};
    describe();
    if(options)for(const [value,text] of options)el.add(new Option(text,value));
    else el.type=type;
    if(type==='checkbox')el.checked=s[key];
    else {
      if(type==='range'){el.min=ranges.find(r=>r[0]===key)[2];el.max=100;}
      el.value=s[key];
    }
    el.addEventListener(type==='range'?'input':'change',()=>{
      s[key]=type==='range'?Number(el.value):type==='checkbox'?el.checked:el.value;
      describe();change({...s});
      if(key==='season')snowPanel(root,s,change);
    });
    label.append(caption,el);root.append(label);
  }
  field('enabled','Включить снег','checkbox');
  for(const [key,title] of ranges)field(key,title,'range');
  for(const [key,title] of [['phone','Телефоны'],['tablet','Планшеты'],['desktop','Компьютеры']])field(key,title,'checkbox');
  field('area','Область снегопада','select',[['site','Весь сайт'],['hero','Первый экран']]);
  field('season','Сезонность','select',[['always','Всегда'],['winter','Зимой (декабрь — февраль)'],['period','Заданный период']]);
  if(s.season==='period'){field('from','С даты (включительно)','date');field('until','По дату (включительно)','date');}
  const reset=document.createElement('button');reset.type='button';reset.textContent='Сбросить настройки снега';
  reset.onclick=()=>{change({...defaults});snowPanel(root,defaults,change);};
  root.append(reset);
}
