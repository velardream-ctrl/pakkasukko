import {deliveryConfig,deliveryLink} from './video-service.js';
import {mountFares} from './fare-form.js?v=66';
import {holidayInfo,bookingPaymentMode,defaultFare} from './fares.js?v=65';
import {fitTagline} from './tagline.js';
import {pageText,initial,bindPage,renderPage,deviceFor} from './site.js?v=45';
import {mountSpatialPhoto} from './spatial-gallery.js?v=8';
const $=(s)=>document.querySelector(s);
fitTagline(document);
$('#year').textContent=new Date().getFullYear();
document.querySelectorAll('[data-service]').forEach(a=>a.addEventListener('click',()=>{if(a.getAttribute('href')!=='#booking')return;$('#service').value=a.dataset.service;$('#service').dispatchEvent(new Event('change'));}));
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
    $('#service').addEventListener('change',()=>{const id=$('#service').value;if(deliveryConfig(model,id)?.mode==='delivery')location.assign(deliveryLink(id));});
    const currentDevice=()=>deviceFor(innerWidth,innerHeight);
    const boundFields=bindPage(document);
    // Add the fare explanation after binding legacy text keys, preserving saved edits.
    // It must exist before the inline editor scans the page for editable elements.
    const fare=mountFares($('#bookingForm'),config);
    boundFields.push({group:'booking',key:'booking:fare-explanation',node:fare.note,original:fare.note.textContent});
    boundFields.push({group:'booking',key:'booking:performer-prompt',node:fare.castTitle,original:fare.castTitle.textContent});
    let ownerPreview=false;
    const redraw=()=>renderPage(document,model,boundFields,currentDevice(),ownerPreview,config.fares);
    redraw();
    const spatialPhoto=mountSpatialPhoto({model,currentDevice});
    const visitOption=[...$('#service').options].find(o=>deliveryConfig(model,o.value)?.mode==='visit');
    if(deliveryConfig(model,$('#service').value)?.mode==='delivery'&&visitOption)$('#service').value=visitOption.value;
    addEventListener('resize',()=>{redraw();document.dispatchEvent(new Event('pakkasukko:layout'));});
    // Ordinary visitors receive no editing UI. Authentication is validated by the Worker.
    try{
      const {startInlineEditor}=await import('./inline-editor.js?v=46');
      await startInlineEditor({model,fields:boundFields,currentDevice,fares:config.fares,spatialPhoto,onAdmin:()=>{ownerPreview=true;}});
    }catch(err){console.warn('Inline editor unavailable',err?.message);}
    // Open availability is public and needs no login, cookies or Turnstile.
    // Sending personal information is a separate owner-controlled feature.
    const selectable=Boolean(config.bookingsEnabled&&config.turnstileSiteKey);
    const paymentNotice=document.createElement('p');paymentNotice.className='privacy-note';paymentNotice.setAttribute('aria-live','polite');$('#bookingMode').after(paymentNotice);
    const updatePaymentNotice=()=>{const mode=bookingPaymentMode(config.fares?.prepayments||defaultFare.prepayments);paymentNotice.textContent=mode==='none'?'Бронирование без предоплаты. Дождитесь подтверждения заявки.':mode==='stripe'?'Для бронирования предусмотрена онлайн-предоплата после согласования.':config.fares?.prepayments?.automaticBank?'Для бронирования с известной стоимостью счёт предоплаты откроется сразу.':'Для бронирования предусмотрена предоплата банковским переводом после согласования.';};updatePaymentNotice();
    const select=$('#dateSelect'),area=$('#slots'),form=$('#bookingForm'),submit=$('#bookingSubmit');
    if(!visitOption){$('#bookingMode').textContent='Все услуги заказываются по дате получения. Выберите нужную карточку выше.';form.hidden=true;select.hidden=true;area.hidden=true;return;}
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

    let submissionKey='',previousSelection='';
    const chosen=new Map(),addressInputs=new Map(),originalAddress=form.elements.address;
    const addressLabel=originalAddress.closest('label'),addressList=document.createElement('div');
    addressLabel.after(addressList);
    function syncVisits(){
      const list=[...chosen.values()].sort((a,b)=>a.start_at.localeCompare(b.start_at));
      if(!addressInputs.size&&list.length===1&&!addressInputs.has(list[0].id))addressInputs.set(list[0].id,originalAddress.value);
      addressList.replaceChildren();addressLabel.hidden=Boolean(list.length);originalAddress.required=!list.length;
      for(const slot of list){
        const label=document.createElement('label'),field=document.createElement('input');
        label.textContent='Адрес на '+slot.start_at.slice(11,16);field.required=true;field.maxLength=200;field.minLength=3;
        field.value=addressInputs.get(slot.id)||'';field.placeholder='Улица и дом';
        field.oninput=()=>addressInputs.set(slot.id,field.value);label.append(field);addressList.append(label);
      }
      $('#slotId').value=list[0]?.id||'';fare.setSlots(list);
      submit.disabled=!list.length;submit.textContent=list.length?pageText(model,'send'):pageText(model,'chooseTime');
    }
    const slotMinutes=slot=>(Date.parse(slot.end_at+':00Z')-Date.parse(slot.start_at+':00Z'))/60000;
    function fill(preserve=false){
      if(!preserve){chosen.clear();addressInputs.clear();}
      addressList.replaceChildren();addressLabel.hidden=false;originalAddress.required=true;
      area.replaceChildren();$('#slotId').value='';submit.disabled=true;
      submit.textContent=selectable?pageText(model,'chooseTime'):'Приём заявок пока закрыт';
      const matching=slots.filter(s=>s.start_at.startsWith(select.value)&&slotMinutes(s)>=fare.durationMinutes());
      const allowed=new Set(matching.map(s=>s.id));for(const id of chosen.keys())if(!allowed.has(id)){chosen.delete(id);addressInputs.delete(id);}
      if(!matching.length)area.textContent='На выбранную продолжительность свободных интервалов нет. Выберите другой день или продолжительность.';
      for(const slot of matching){
        const element=document.createElement(selectable?'button':'span');
        element.className=selectable?'slot':'slot slot-readonly';
        element.textContent=slot.start_at.slice(11,16)+'–'+slot.end_at.slice(11,16);
        const special=holidayInfo(slot.start_at,config.fares);
        if(special?.percent>0)element.textContent+=' · ✦ +'+special.percent+'%';
        if(selectable){
          element.type='button';element.classList.toggle('selected',chosen.has(slot.id));element.setAttribute('aria-pressed',String(chosen.has(slot.id)));
          element.addEventListener('click',()=>{
            if(chosen.has(slot.id))chosen.delete(slot.id);
            else{if(chosen.size>=25){alert('За одну заявку можно выбрать до 25 адресов.');return;}chosen.set(slot.id,slot);}
            element.classList.toggle('selected',chosen.has(slot.id));element.setAttribute('aria-pressed',String(chosen.has(slot.id)));syncVisits();
          });
        }else element.title='Интервал открыт для просмотра. Отправка заявки пока выключена.';
        area.append(element);
      }
      syncVisits();if(!selectable)submit.textContent='Приём заявок пока закрыт';
    }
    fare.onSelectionChange(()=>fill(true));
    select.addEventListener('change',()=>fill(false));fill();
    $('#bookingMode').textContent=selectable?pageText(model,'pending'):
      'Свободные даты уже видны. Отправка заявок пока закрыта — можно ознакомиться с расписанием.';
    if(!selectable)return;
    const privacyNote=document.querySelector('#booking .booking-copy .privacy-note');
    if(privacyNote)privacyNote.hidden=true;
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>{window.turnstile?.render('#captcha',{sitekey:config.turnstileSiteKey,callback:(token)=>{form.dataset.captcha=token;},'expired-callback':()=>{form.dataset.captcha='';}});};document.head.append(script);
    form.addEventListener('submit',async e=>{e.preventDefault();const out=$('#bookingMessage');out.textContent='';if(!form.reportValidity())return;
      if(!form.dataset.captcha){out.textContent=pageText(model,'captcha');return;}
      const pricing=fare.payload();if(!form.reportValidity())return;
      const fd=new FormData(form);const payload={...Object.fromEntries(fd.entries()),...pricing};payload.visits=[...chosen.values()].sort((a,b)=>a.start_at.localeCompare(b.start_at)).map(s=>({slotId:s.id,address:addressInputs.get(s.id)||''}));delete payload.consent;
      const signature=JSON.stringify(payload);
      if(signature!==previousSelection){submissionKey=crypto.randomUUID();previousSelection=signature;}
      payload.submissionKey=submissionKey;payload.turnstileToken=form.dataset.captcha;submit.disabled=true;submit.textContent=pageText(model,'sending');
      try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const res=await r.json();if(!r.ok){if(res.fares){Object.assign(config,{fares:res.fares,services:res.services});fare.update();redraw();updatePaymentNotice();}throw Error(res.error||pageText(model,'error'));}previousSelection='';const advances=(res.receipts||[]).filter(v=>v.paymentUrl);if(advances.length===1&&res.receipts.length===1){location.assign(advances[0].paymentUrl);return;}out.textContent=(advances.length?'Время временно зарезервировано. Оплатите счета по ссылкам ниже.':pageText(model,'success'))+' '+res.summary;for(const visit of res.receipts||[]){const link=document.createElement('a');link.href=visit.paymentUrl||'./trip.html#'+visit.id;link.textContent=(visit.paymentUrl?'Оплатить предоплату за визит ':'Расчёт по визиту ')+visit.time.replace('T',' ');out.append(document.createElement('br'),link);}form.reset();$('#slotId').value='';$('#dateSelect').dispatchEvent(new Event('change'));window.turnstile?.reset();form.dataset.captcha='';}catch(err){out.textContent=err.message;submit.disabled=false;submit.textContent=pageText(model,'retry');}
    });
  }catch(error){console.warn('Pakkasukko API not ready',error.message);}
}
activate();