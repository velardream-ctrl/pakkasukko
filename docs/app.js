import {mountFares} from './fare-form.js';
import {fitTagline} from './tagline.js';
import {pageText,initial,bindPage,renderPage,deviceFor} from './site.js';
const $=(s)=>document.querySelector(s);
fitTagline(document);
$('#year').textContent=new Date().getFullYear();
document.querySelectorAll('[data-service]').forEach(a=>a.addEventListener('click',()=>{$('#service').value=a.dataset.service;$('#service').dispatchEvent(new Event('change'));}));
const pageIsPreview=location.hostname.endsWith('github.io')||location.hostname.endsWith('githack.com')||location.hostname==='localhost'&&location.port===''; 
async function activate(){
  if(pageIsPreview){
  const {applySnow}=await import("./snow.js");
  const drawSnow=()=>applySnow(document,undefined,deviceFor(innerWidth,innerHeight));
  drawSnow();addEventListener("resize",drawSnow);
  $('#bookingMode').textContent='Это статический макет. Актуальные свободные даты смотрите на сайте Pakkasukko в Cloudflare.';
  return;
}
  try {
    const configResp=await fetch('/api/public-config',{cache:'no-store'});
    if(!configResp.ok) return;
    const config=await configResp.json();
    for(const [id,key] of [['priceGift','giftPrice'],['priceHome','homePrice'],['priceEvent','eventPrice'],['bio','bio'],['travel','travel']]){
      if(config.content&&typeof config.content[key]==='string'&&config.content[key])document.getElementById(id).textContent=config.content[key];
    }
    const model=Object.assign(initial(),config.site);
    const currentDevice=()=>deviceFor(innerWidth,innerHeight);
    const boundFields=bindPage(document);
    let ownerPreview=false;
    const redraw=()=>renderPage(document,model,boundFields,currentDevice(),ownerPreview);
    redraw();
    addEventListener('resize',()=>{redraw();document.dispatchEvent(new Event('pakkasukko:layout'));});
    // Ordinary visitors receive no editing UI. Authentication is validated by the Worker.
    try{
      const {startInlineEditor}=await import('./inline-editor.js');
      await startInlineEditor({model,fields:boundFields,currentDevice,onAdmin:()=>{ownerPreview=true;}});
    }catch(err){console.warn('Inline editor unavailable',err?.message);}
    // Open availability is public and needs no login, cookies or Turnstile.
    // Sending personal information is a separate owner-controlled feature.
    const selectable=Boolean(config.bookingsEnabled&&config.turnstileSiteKey);
    const select=$('#dateSelect'),area=$('#slots'),form=$('#bookingForm'),submit=$('#bookingSubmit');
    const fare=mountFares(form,config);
    // Keep the calculator available even while the booking calendar is closed.
    $('#bookingFields').disabled=false;
    for(const control of form.querySelectorAll('input,textarea,button')){
      if(control.name && !['city','service','slotId'].includes(control.name))control.disabled=!selectable;
    }
    let slots=[];
    try{
      const slotsResp=await fetch('/api/slots',{cache:'no-store'});
      if(!slotsResp.ok)throw Error('HTTP '+slotsResp.status);
      const data=await slotsResp.json();
      slots=(data.slots||[]).filter(x=>x.status==='open');
    }catch(e){
      $('#bookingMode').textContent='Не удалось загрузить расписание. Обновите страницу позже.';
      area.textContent='Свободные интервалы пока недоступны для просмотра.';
      return;
    }
    const dates=[...new Set(slots.map(s=>s.start_at.slice(0,10)))].sort();
    const dateLabel=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
    if(!dates.length){
      $('#bookingMode').textContent=pageText(model,'noDates');
      area.textContent='Открытые интервалы появятся здесь после добавления расписания.';
      return;
    }
    select.disabled=false;
    select.replaceChildren(...dates.map(d=>new Option(dateLabel(d),d)));

    function fill(){
      area.replaceChildren();$('#slotId').value='';submit.disabled=true;
      submit.textContent=selectable?pageText(model,'chooseTime'):'Приём заявок пока закрыт';
      for(const slot of slots.filter(s=>s.start_at.startsWith(select.value))){
        const element=document.createElement(selectable?'button':'span');
        element.className=selectable?'slot':'slot slot-readonly';
        element.textContent=slot.start_at.slice(11,16)+'–'+slot.end_at.slice(11,16);
        if(selectable){
          element.type='button';
          element.addEventListener('click',()=>{
            area.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
            element.classList.add('selected');$('#slotId').value=slot.id;
            submit.disabled=false;submit.textContent=pageText(model,'send');
          });
        }else element.title='Интервал открыт для просмотра. Отправка заявки пока выключена.';
        area.append(element);
      }
    }
    select.addEventListener('change',fill);fill();
    $('#bookingMode').textContent=selectable?pageText(model,'pending'):
      'Свободные даты уже видны. Отправка заявок пока закрыта — можно ознакомиться с расписанием.';
    if(!selectable)return;
    const privacyNote=document.querySelector('#booking .privacy-note');
    if(privacyNote)privacyNote.hidden=true;
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>{window.turnstile?.render('#captcha',{sitekey:config.turnstileSiteKey,callback:(token)=>{form.dataset.captcha=token;},'expired-callback':()=>{form.dataset.captcha='';}});};document.head.append(script);
    form.addEventListener('submit',async e=>{e.preventDefault();const out=$('#bookingMessage');out.textContent='';if(!form.reportValidity())return;
      if(!form.dataset.captcha){out.textContent=pageText(model,'captcha');return;}
      const fd=new FormData(form);const payload={...Object.fromEntries(fd.entries()),...fare.payload()};delete payload.consent;payload.turnstileToken=form.dataset.captcha;submit.disabled=true;submit.textContent=pageText(model,'sending');
      try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const res=await r.json();if(!r.ok){if(res.fares){Object.assign(config,{fares:res.fares,services:res.services});fare.update();}throw Error(res.error||pageText(model,'error'));}out.textContent=pageText(model,'success')+' '+res.summary;form.reset();$('#slotId').value='';$('#dateSelect').dispatchEvent(new Event('change'));window.turnstile?.reset();form.dataset.captcha='';}catch(err){out.textContent=err.message;submit.disabled=false;submit.textContent=pageText(model,'retry');}
    });
  }catch(error){console.warn('Pakkasukko API not ready',error.message);}
}
activate();