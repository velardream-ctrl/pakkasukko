import {pageText,initial,bindPage,renderPage,deviceFor} from './site.js';
const $=(s)=>document.querySelector(s);
$('#year').textContent=new Date().getFullYear();
document.querySelectorAll('[data-service]').forEach(a=>a.addEventListener('click',()=>{$('#service').value=a.dataset.service;}));
const pageIsPreview=location.hostname.endsWith('github.io')||location.hostname.endsWith('githack.com')||location.hostname==='localhost'&&location.port===''; 
async function activate(){
  if(pageIsPreview) return;
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
    if(!config.bookingsEnabled||!config.turnstileSiteKey) return;
    const slotsResp=await fetch('/api/slots',{cache:'no-store'});
    if(!slotsResp.ok)return;
    const data=await slotsResp.json();
    const slots=(data.slots||[]).filter(x=>x.status==='open');
    const select=$('#dateSelect'),area=$('#slots'),form=$('#bookingForm'),submit=$('#bookingSubmit');
    const dates=[...new Set(slots.map(s=>s.start_at.slice(0,10)))].sort();
    if(!dates.length){$('#bookingMode').textContent=pageText(model,'noDates');return;}
    $('#bookingFields').disabled=false;select.disabled=false;select.replaceChildren(...dates.map(d=>new Option(new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z')),d)));
    function fill(){area.replaceChildren();$('#slotId').value='';submit.disabled=true;submit.textContent=pageText(model,'chooseTime');
      slots.filter(s=>s.start_at.startsWith(select.value)).forEach(s=>{const btn=document.createElement('button');btn.type='button';btn.className='slot';btn.textContent=s.start_at.slice(11,16)+'–'+s.end_at.slice(11,16);btn.addEventListener('click',()=>{area.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');$('#slotId').value=s.id;submit.disabled=false;submit.textContent=pageText(model,'send');});area.append(btn);});
    }
    select.addEventListener('change',fill);fill();$('#bookingMode').textContent=pageText(model,'pending');
    const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;script.onload=()=>{window.turnstile?.render('#captcha',{sitekey:config.turnstileSiteKey,callback:(token)=>{form.dataset.captcha=token;},'expired-callback':()=>{form.dataset.captcha='';}});};document.head.append(script);
    form.addEventListener('submit',async e=>{e.preventDefault();const out=$('#bookingMessage');out.textContent='';if(!form.reportValidity())return;
      if(!form.dataset.captcha){out.textContent=pageText(model,'captcha');return;}
      const fd=new FormData(form);const payload=Object.fromEntries(fd.entries());delete payload.consent;payload.turnstileToken=form.dataset.captcha;submit.disabled=true;submit.textContent=pageText(model,'sending');
      try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const res=await r.json();if(!r.ok)throw Error(res.error||pageText(model,'error'));out.textContent=pageText(model,'success');form.reset();$('#slotId').value='';$('#dateSelect').dispatchEvent(new Event('change'));window.turnstile?.reset();form.dataset.captcha='';}catch(err){out.textContent=err.message;submit.disabled=false;submit.textContent=pageText(model,'retry');}
    });
  }catch(error){console.warn('Pakkasukko API not ready',error.message);}
}
activate();