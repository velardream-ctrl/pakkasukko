import {applyBrand} from './site.js';
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
 try{state=await request('/api/admin/dashboard');$('loginBox').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');render();await reloadBookingState();}
 catch(e){$('dashboard').classList.add('hidden');$('loginBox').classList.remove('hidden');$('logout').classList.add('hidden');}
}
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
  s.append(item);
 }
 if(!state.bookings.length)textBlock(b,'p','Заявок пока нет.','muted');
 for(const v of state.bookings){
  const item=el('article',undefined,'record');textBlock(item,'h3',format(v.start_at)+' — '+format(v.end_at));
  textBlock(item,'span',({pending:'Ожидает',confirmed:'Подтверждено',declined:'Отклонено',completed:'Выполнено',cancelled:'Отменено'}[v.final_status||v.status]||v.status),'pill '+v.status);
  textBlock(item,'p',v.name+' · '+v.service);
  textBlock(item,'p','Телефон: '+v.phone+' · Email: '+(v.email||'—'));
  textBlock(item,'p','Адрес: '+v.city+', '+v.address);
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
   for(const [key,title,value] of [['price','Стоимость',v.price],['minutes','Минуты интервала',(+new Date(v.end_at+'Z')-new Date(v.start_at+'Z'))/60000],['notes','Заметки',v.notes]]){
    const label=el('label',title),input=el('input');values[key]=input;input.value=value??'';label.append(input);item.append(label);
   }
   button(item,'Сохранить детали',async()=>{try{await request('/api/admin/bookings/details','POST',{id:v.id,...Object.fromEntries(Object.entries(values).map(([k,i])=>[k,i.value]))});await reload();}catch(e){alert(e.message);}});
  }
  b.append(item);
 }
 if(!state.messages.length)textBlock(m,'p','Сообщений пока нет.','muted');
 for(const v of state.messages){
  const item=el('article',undefined,'record');textBlock(item,'h3',v.name);
  textBlock(item,'p','Контакт: '+v.contact);textBlock(item,'p',v.message);textBlock(item,'small',v.created_at+' · '+v.status);
  if(v.status==='unread')button(item,'Отметить прочитанным',async()=>{try{await request('/api/admin/messages/read','POST',{id:v.id});await reload();}catch(e){alert(e.message);}});
  m.append(item);
 }

}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/admin/login','POST',Object.fromEntries(new FormData(e.currentTarget)));$('loginForm').reset();status('loginStatus','');await reload();}catch(err){status('loginStatus',err.message,true);}});
$('logout').addEventListener('click',async()=>{try{await request('/api/admin/logout','POST');}finally{await reload();}});
$('slotForm').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));try{await request('/api/admin/slots','POST',values);status('slotStatus','Интервал добавлен.');await reload();}catch(err){status('slotStatus',err.message,true);}});
if(!preview)reload();
