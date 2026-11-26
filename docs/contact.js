const form=document.getElementById('letterForm'),fields=document.getElementById('letterFields'),send=document.getElementById('letterSend'),status=document.getElementById('mailStatus');
let token='',widget,busy=false;
function resetCaptcha(){token='';send.disabled=true;if(widget!==undefined)window.turnstile?.reset(widget);}
async function init(){
 try{
   const r=await fetch('/api/public-config',{cache:'no-store'});if(!r.ok)throw Error();
   const config=await r.json();
   if(!config.bookingsEnabled||!config.turnstileSiteKey){status.textContent='Приём писем пока недоступен. Попробуйте позже.';return;}
   const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
   script.onerror=()=>{status.textContent='Не удалось загрузить защиту от спама. Обновите страницу.';};
   script.onload=()=>{try{widget=window.turnstile.render('#mailCaptcha',{sitekey:config.turnstileSiteKey,callback:t=>{token=t;send.disabled=busy;},'expired-callback':()=>{token='';send.disabled=true;},'error-callback':()=>{token='';send.disabled=true;status.textContent='Проверка от спама недоступна. Попробуйте ещё раз.';}});fields.disabled=false;status.textContent='';}catch{status.textContent='Не удалось включить защиту формы.';}};
   document.head.append(script);
 }catch{status.textContent='Почта Деда Мороза пока недоступна. Попробуйте позже.';}
}
form.addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!form.reportValidity())return;if(!token){status.textContent='Пройдите проверку от спама.';return;}
 const data=Object.fromEntries(new FormData(form));delete data.consent;data.turnstileToken=token;busy=true;send.disabled=true;status.textContent='Отправляем письмо…';
 try{const r=await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await r.json();if(!r.ok)throw Error(result.error||'Не удалось отправить письмо.');form.reset();status.textContent='Ваше письмо получено! Дед Мороз ответит по указанному адресу.';}catch(e){status.textContent=e.message||'Не удалось отправить письмо. Попробуйте снова.';}finally{busy=false;resetCaptcha();}
});
init();
if(new URLSearchParams(location.search).get('topic')==='certificate'){
 document.querySelector('#letterForm').elements.topic.value='Подарочный сертификат';
}
