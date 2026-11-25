import {serviceCard,deliveryConfig,deliveryNotice,earliestDelivery,helsinkiDay} from './video-service.js';
const $=id=>document.getElementById(id),form=$('videoForm'),fields=$('videoFields'),send=$('videoSend'),status=$('videoStatus'),date=form.elements.deliveryDate;
let token='',widget,busy=false,card,delivery,key='',signature='';
async function init(){
 try{
  const r=await fetch('/api/public-config',{cache:'no-store'});if(!r.ok)throw Error();
  const config=await r.json(),id=new URLSearchParams(location.search).get('service');
  const selected=id||(config.site?.cards||[]).find(c=>deliveryConfig(config.site,c.id)?.mode==='delivery')?.id;
  card=serviceCard(config.site,selected);delivery=deliveryConfig(config.site,selected);
  if(!card||delivery?.mode!=='delivery'){status.textContent='Эта услуга не доступна для заказа по дате получения.';return;}
  $('videoTitle').textContent=card.title;$('videoDescription').textContent=card.description||'';$('videoPrice').textContent='Стоимость: '+(config.services?.[card.id]?.label||card.price||'По запросу');$('videoNotice').textContent=deliveryNotice(delivery);
  if(!delivery.video){$('deliveryIntro').textContent='Укажите желаемую дату получения услуги. Дату и стоимость подтвердим лично.';$('deliveryDateLabel').firstChild.textContent='Желаемая дата получения услуги';$('deliveryEmailLabel').firstChild.textContent='Электронная почта для связи';$('deliveryMessageLabel').firstChild.textContent='Ваши пожелания';form.elements.message.placeholder='Расскажите о ваших пожеланиях…';send.textContent='Заказать услугу ↗';}
  date.min=earliestDelivery(helsinkiDay(),delivery.days);$('videoEarliest').textContent='Самая ранняя дата получения: '+date.min.split('-').reverse().join('.');
  if(!config.bookingsEnabled||!config.turnstileSiteKey){status.textContent='Приём заявок пока закрыт.';return;}
  const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onerror=()=>status.textContent='Не удалось загрузить защиту. Обновите страницу.';
  script.onload=()=>{try{widget=window.turnstile.render('#videoCaptcha',{sitekey:config.turnstileSiteKey,callback:t=>{token=t;send.disabled=busy;},'expired-callback':()=>{token='';send.disabled=true;},'error-callback':()=>{token='';send.disabled=true;status.textContent='Проверка от спама недоступна.';}});fields.disabled=false;status.textContent='';}catch{status.textContent='Не удалось включить защиту.';}};
  document.head.append(script);
 }catch{status.textContent='Не удалось открыть форму. Попробуйте позже.';}
}
form.onsubmit=async e=>{
 e.preventDefault();if(busy||!token||!card)return;date.min=earliestDelivery(helsinkiDay(),delivery.days);if(!form.reportValidity())return;
 const data={...Object.fromEntries(new FormData(form)),service:card.id};delete data.consent;
 const sig=JSON.stringify(data);if(sig!==signature){signature=sig;key=crypto.randomUUID();}
 busy=true;send.disabled=true;status.textContent='Отправляем заявку…';
 try{const r=await fetch('/api/video-orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,submissionKey:key,turnstileToken:token})});const result=await r.json();if(!r.ok)throw Error(result.error||'Ошибка отправки');form.reset();signature='';status.textContent='Заявка получена! Желаемая дата: '+result.deliveryDate.split('-').reverse().join('.')+'. Дождитесь личного подтверждения по email.';}catch(e){status.textContent=e.message;}finally{busy=false;token='';send.disabled=true;if(widget!==undefined)window.turnstile?.reset(widget);}
};
init();
