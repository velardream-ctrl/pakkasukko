const $=id=>document.getElementById(id);
let state=null;
const labels={giftPrice:'Стоимость короткого поздравления',homePrice:'Стоимость домашней программы',eventPrice:'Стоимость корпоратива',bio:'История и опыт',travel:'География выездов'};
const preview=location.hostname.endsWith('github.io')||location.hostname.endsWith('githack.com');
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
 try{state=await request('/api/admin/dashboard');$('loginBox').classList.add('hidden');$('dashboard').classList.remove('hidden');$('logout').classList.remove('hidden');render();}
 catch(e){$('dashboard').classList.add('hidden');$('loginBox').classList.remove('hidden');$('logout').classList.add('hidden');}
}
function render(){
 const s=$('slotList'),b=$('bookingList'),m=$('messageList');s.replaceChildren();b.replaceChildren();m.replaceChildren();
 if(!state.slots.length)textBlock(s,'p','Интервалы пока не добавлены.','muted');
 for(const slot of state.slots){
  const item=el('article',undefined,'record');textBlock(item,'h3',format(slot.start_at)+' — '+format(slot.end_at));
  textBlock(item,'span',({open:'Свободно',blocked:'Заблокировано',reserved:'Подтверждено'}[slot.status]||slot.status),'pill');
  if(slot.note)textBlock(item,'p',slot.note);
  if(slot.status!=='reserved')button(item,'Удалить интервал',async()=>{if(!confirm('Удалить выбранное время?'))return;try{await request('/api/admin/slots/delete','POST',{id:slot.id});await reload();}catch(e){alert(e.message);}});
  s.append(item);
 }
 if(!state.bookings.length)textBlock(b,'p','Заявок пока нет.','muted');
 for(const v of state.bookings){
  const item=el('article',undefined,'record');textBlock(item,'h3',format(v.start_at)+' — '+format(v.end_at));
  textBlock(item,'span',({pending:'Ожидает',confirmed:'Подтверждено',declined:'Отклонено'}[v.status]||v.status),'pill '+v.status);
  textBlock(item,'p',v.name+' · '+v.service);
  textBlock(item,'p','Телефон: '+v.phone+' · Email: '+(v.email||'—'));
  textBlock(item,'p','Адрес: '+v.city+', '+v.address);
  if(v.message)textBlock(item,'p',v.message);
  textBlock(item,'small','Заявка: '+v.id+' · '+v.created_at);
  if(v.status==='pending')for(const [label,next,cls] of [['Подтвердить','confirmed','confirm'],['Отклонить','declined','decline']]){
   button(item,label,async()=>{if(!confirm('Обработать заявку: '+label+'?'))return;try{await request('/api/admin/bookings/status','POST',{id:v.id,status:next});await reload();}catch(e){alert(e.message);}},cls);
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
 const fields=$('contentFields');fields.replaceChildren();
 for(const [key,label] of Object.entries(labels)){
  const wrap=el('label',label);const multiline=['bio','travel'].includes(key);const input=document.createElement(multiline?'textarea':'input');input.name=key;input.value=state.content?.[key]||'';input.maxLength=multiline?2000:80;if(multiline){input.rows=4;wrap.classList.add('wide');}wrap.append(input);fields.append(wrap);
 }
}
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/admin/login','POST',Object.fromEntries(new FormData(e.currentTarget)));e.currentTarget.reset();status('loginStatus','');await reload();}catch(err){status('loginStatus',err.message,true);}});
$('logout').addEventListener('click',async()=>{try{await request('/api/admin/logout','POST');}finally{await reload();}});
$('slotForm').addEventListener('submit',async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(e.currentTarget));try{await request('/api/admin/slots','POST',values);status('slotStatus','Интервал добавлен.');await reload();}catch(err){status('slotStatus',err.message,true);}});
$('contentForm').addEventListener('submit',async e=>{e.preventDefault();try{await request('/api/admin/content','POST',Object.fromEntries(new FormData(e.currentTarget)));status('contentStatus','Сохранено.');await reload();}catch(err){status('contentStatus',err.message,true);}});
if(!preview)reload();