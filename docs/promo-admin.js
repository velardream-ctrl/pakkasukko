import {holidayRules,euros} from './fares.js';
const labels={percent:'Скидка, %',fixed:'Скидка, €',waive_holiday:'Отмена надбавки',free_program:'Бесплатная программа (дорога отдельно)',free_visit:'Бесплатный визит в Kitee'};
const sources={personal:'Личный подарок',velar:'Velar Dream Records',campaign:'Рекламная акция'};
function add(box,tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;box.append(n);return n;}
function field(box,title,type,value=''){const l=add(box,'label',title),n=add(l,'input');n.type=type;n.value=value;return n;}
function select(box,title,options){const l=add(box,'label',title),n=add(l,'select');for(const [value,name] of options)n.add(new Option(name,value));return n;}
function button(box,title,fn){const n=add(box,'button',title);n.type='button';n.onclick=async()=>{n.disabled=true;try{await fn();}catch(e){alert(e.message);}finally{n.disabled=false;}};return n;}
function checked(box,title,value=false){const l=add(box,'label',title),n=add(l,'input');n.type='checkbox';n.checked=value;return n;}
const dateLocal=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export async function mountPromoAdmin(box,request,fares,services){
 if(!box)return;
 box.replaceChildren();
 try{
  const data=await request('/api/admin/promos/list');
  const refresh=()=>mountPromoAdmin(box,request,fares,services);
  add(box,'p','Подарочные коды уменьшают стоимость программы. Они не являются купленными сертификатами. Действуют на один визит с известной ценой; поездка оплачивается отдельно, кроме бесплатного визита в Kitee.');
  const toggle=checked(box,'Показывать поле подарочного кода на сайте',data.enabled);
  button(box,'Сохранить доступность',async()=>{await request('/api/admin/promos/settings','POST',{enabled:toggle.checked});await refresh();});
  const editor=add(box,'details');add(editor,'summary','Создать новый код');
  const label=field(editor,'Название акции или подарка','text');label.maxLength=120;
  const kind=select(editor,'Вид подарка',Object.entries(labels));
  const value=field(editor,'Скидка (% или €)','number','25');value.min='0.01';value.step='0.01';
  const city=select(editor,'Город',[['','Все города'],...Object.keys(fares.km||{Kitee:0}).map(c=>[c,c])]);
  const service=select(editor,'Программа',[['','Все выездные программы'],...Object.entries(services||{}).filter(([,s])=>!s.remote).map(([id,s])=>[id,(s.title||id)+' · '+s.label])]);
  const holiday=select(editor,'Какая надбавка',[['','Любая действующая праздничная надбавка'],...holidayRules(fares).map(x=>[x.name,x.name])]);
  const max=field(editor,'Лимит использований','number','1');max.min='1';max.max='1000';max.step='1';
  const expiry=field(editor,'Действует до включительно','date',dateLocal());expiry.min=dateLocal();
  const source=select(editor,'Источник',Object.entries(sources));
  const sync=()=>{value.closest('label').hidden=!['percent','fixed'].includes(kind.value);holiday.closest('label').hidden=kind.value!=='waive_holiday';if(kind.value==='free_visit')city.value='Kitee';city.disabled=kind.value==='free_visit';};
  kind.onchange=sync;sync();
  button(editor,'Сгенерировать код',async()=>{const v=await request('/api/admin/promos/create','POST',{label:label.value,kind:kind.value,value:kind.value==='percent'?Number(value.value):kind.value==='fixed'?Math.round(Number(value.value)*100):0,city:city.value,service:service.value,holiday:kind.value==='waive_holiday'?holiday.value:'',maxUses:Number(max.value),expires:expiry.value,source:source.value});await refresh();alert('Код создан (пока выключен): '+v.code);});
  add(box,'h3','Журнал подарочных кодов');
  if(!data.codes.length)add(box,'p','Кодов пока нет.');
  for(const p of data.codes){
   const row=add(box,'article');row.className='record';add(row,'h3',p.code);add(row,'p',p.label+' · '+labels[p.kind]+(p.kind==='percent'?' '+p.value+'%':p.kind==='fixed'?' '+euros(p.value):''));
   add(row,'p',sources[p.source]+' · '+(p.city||'Все города')+' · '+(p.service||'Все программы')+' · '+(p.holiday||'')+' · до '+p.expires);
   add(row,'p','Использовано '+p.used+' из '+p.max_uses+(p.used>=p.max_uses?' · Лимит исчерпан':'')+(p.distributed_at?' · Распространён '+p.distributed_at.slice(0,10):' · Не распространён'));
   const active=checked(row,'Код активен',Boolean(p.active)),distributed=checked(row,'Подарен или опубликован',Boolean(p.distributed_at));
   const note=field(row,'Заметка: кому подарен / где опубликован','text',p.note||'');note.maxLength=250;
   button(row,'Сохранить состояние',async()=>{await request('/api/admin/promos/state','POST',{id:p.id,active:active.checked,distributed:distributed.checked,note:note.value});await refresh();});
   button(row,'Копировать код',async()=>{await navigator.clipboard.writeText(p.code);});
  }
 }catch(e){add(box,'p','Промокоды: '+e.message);button(box,'Повторить',()=>mountPromoAdmin(box,request,fares,services));}
}
