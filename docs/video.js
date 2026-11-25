import {isVideoGreeting,earliestDelivery,helsinkiDay,videoNotice} from './video-service.js';
const $=id=>document.getElementById(id),form=$('videoForm'),fields=$('videoFields'),send=$('videoSend'),status=$('videoStatus'),date=form.elements.deliveryDate;
$('videoNotice').textContent=videoNotice;
let token='',widget,busy=false,card,key='',signature='';
async function init(){
 try{
  const r=await fetch('/api/public-config',{cache:'no-store'});if(!r.ok)throw Error();
  const config=await r.json(),id=new URLSearchParams(location.search).get('service');
  card=(config.site?.cards||[]).find(c=>isVideoGreeting(c)&&(!id||c.id===id));
  if(!card){status.textContent='Видеопоздравление пока недоступно.';return;}
  $('videoTitle').textContent=card.title;$('videoDescription').textContent=card.description||'';$('videoPrice').textContent='Стоимость: '+(card.price||'По запросу');
  date.min=earliestDelivery(helsinkiDay());$('videoEarliest').textContent='Самая ранняя дата получения: '+date.min.split('-').reverse().join('.');
  if(!config.bookingsEnabled||!config.turnstileSiteKey){status.textContent='Приём заявок пока закрыт.';return;}
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onerror=()=>status.textContent='Не удалось загрузить защиту. Обновите страницу.';
  script.onload=()=>{try{widget=window.turnstile.render('#videoCaptcha',{sitekey:config.turnstileSiteKey,callback:t=>{token=t;send.disabled=busy;},'expired-callback':()=>{token='';send.disabled=true;},'error-callback':()=>{token='';send.disabled=true;status.textContent='Проверка от спама недоступна.';}});fields.disabled=false;status.textContent='';}catch{status.textContent='Не удалось включить защиту.';}};
  document.head.append(script);
 }catch{status.textContent='Не удалось открыть форму. Попробуйте позже.';}
}
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!token||!card)return;date.min=earliestDelivery(helsinkiDay());if(!form.reportValidity())return;
 const data={...Object.fromEntries(new FormData(form)),service:card.id};delete data.consent;
 const sig=JSON.stringify(data);if(sig!==signature){signature=sig;key=crypto.randomUUID();}
 busy=true;send.disabled=true;status.textContent='Отправляем заявку…';
 try{const r=await fetch('/api/video-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,submissionKey:key,turnstileToken:token})});const result=await r.json();if(!r.ok)throw Error(result.error||'Ошибка отправки');form.reset();signature='';status.textContent='Заявка получена! Желаемая дата: '+result.deliveryDate.split('-').reverse().join('.')+'. Дождитесь личного подтверждения по email.';}catch(e){status.textContent=e.message;}finally{busy=false;token='';send.disabled=true;if(widget!==undefined)window.turnstile?.reset(widget);}
};
init();
