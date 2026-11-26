import {styleElement,styleField,legacyHeadingParts,validHeadingParts} from './text-presentation.js';
import {performanceRows} from './fares.js';
import {deliveryConfig,deliveryNotice,deliveryLink} from './video-service.js';
export const devices = {desktop:[1440,900],tablet:[820,1180],phone:[390,844]};
export const portrait = './assets/pakkasukko-ded-moroz.webp';
export const baseCrop = () => ({x:0,y:0,zoom:100,image:''});
// An older site revision may store the same hero photo in both pictures.top
// and device crops. The header has exactly one photo, with legacy pictures.top
// taking precedence until the owner chooses a device-specific replacement.
export function heroImageId(model,device){
  const global=model?.pictures?.top;
  return (global&&!global.video&&global.id)||model?.crops?.[device]?.image||'';
}
export function setHeroDeviceImage(model,device,id){
  model.crops??={};model.pictures??={};
  const old=model.pictures.top;
  if(old&&!old.video&&old.id){
    for(const profile of Object.keys(devices)){
      model.crops[profile]??=baseCrop();
      model.crops[profile].image=old.id;
    }
  }
  delete model.pictures.top;
  (model.crops[device]??=baseCrop()).image=id||'';
}
export function setHeroGlobalImage(model,id,caption=''){
  model.crops??={};model.pictures??={};
  for(const profile of Object.keys(devices)){
    if(model.crops[profile])model.crops[profile].image='';
  }
  if(id)model.pictures.top={id,caption,video:false};
  else delete model.pictures.top;
}
export const baseSectionCrop = () => ({x:0,y:0,zoom:100,fit:'contain'});
export function sectionCrop(model,section,device){
  const positions=model.sectionCrops?.[section];
  const crop=positions?.[device]|| (section==='routes'?{...baseSectionCrop(),fit:'cover'}:baseSectionCrop());
  // RUN-020: the landscape photo in the tall About arch was letterboxed
  // on phones. Fill the arch by default, including legacy saved "contain"
  // crops. Explicit user choices made with the updated editor still win.
  if(section==='about'&&device==='phone'&&crop.fitCustomized!==true){
    return {...crop,fit:'cover'};
  }
  return crop;
}
export function applySectionCrop(doc,model,section,device,editing=false){
  const crop=sectionCrop(model,section,device);
  let img;
  if(section==='about'){
    const frame=doc.querySelector('.about-portrait');
    if(!frame)return;
    img=frame.querySelector('.about-photo');
    if(!img){img=doc.createElement('img');img.className='about-photo';img.alt='Дед Мороз в красном костюме со светящимся посохом';frame.prepend(img);}
    const chosen=model.pictures?.about;
    const src=chosen&&!chosen.video?mediaURL(chosen.id,editing):portrait;
    if(img.getAttribute('src')!==src)img.setAttribute('src',src);
  }else{
    img=doc.getElementById(section)?.querySelector('.section-media-frame > img');
    if(!img)return;
  }
  img.style.objectFit=crop.fit==='cover'?'cover':'contain';
  img.style.transform='translate('+Math.max(-100,Math.min(100,Number(crop.x)||0))+'%, '+Math.max(-100,Math.min(100,Number(crop.y)||0))+'%) scale('+Math.max(.35,Math.min(3,(Number(crop.zoom)||100)/100))+')';
}

export const initial = () => ({sections:[],headingOverrides:{},headingParts:{},textStyles:{},texts:{},crops:{},sectionCrops:{},shades:{},routesShades:{},hidden:[],order:[],cards:[],pictures:{},seo:{},logo:"",contacts:{},durations:{},deliveryModes:{}});
// Additional programs use the same visual structure as the three original cards.
// Presentation defaults are derived at render time, so old D1 drafts stay intact.
export function programPresentation(card,index){
  const title=String(card.title||'').trim();
  let regular=title,accent='';
  const explicit=String(card.accent||'').trim();
  if(explicit&&title.toLocaleLowerCase('ru').endsWith(explicit.toLocaleLowerCase('ru'))){
    regular=title.slice(0,title.length-explicit.length).trim();
    accent=title.slice(title.length-explicit.length).trim();
  }else{
    const match=title.match(/^(.+?)\s+((?:от|для|у|на|с)\s+.+)$/i);
    if(match){regular=match[1];accent=match[2];}
  }
  const video=/видео|онлайн|запись/i.test(title);
  const icon=String(card.icon|| (video?'▶':'✧')).trim()||'✧';
  const label=String(card.label||(video?'ВИДЕОПОЗДРАВЛЕНИЕ':'ПРАЗДНИЧНАЯ ПРОГРАММА')).trim();
  const number=String(index+4).padStart(2,'0')+' / '+label.toLocaleUpperCase('ru');
  return {regular,accent,icon,number};
}
export function heroShadePercent(model,device){
  const value=Number(model?.shades?.[device] ?? 0);
  return Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;
}
export function applyHeroShade(doc,model,device){
  const overlay=doc.querySelector('.hero-shade');
  if(overlay)overlay.style.opacity=String(heroShadePercent(model,device)/100);
}
// Darken only a small strip at the foot of the arched Routes photo.
// Saved independently of the top hero overlay and separately per device.
export function routesShadePercent(model,device){
  const value=Number(model?.routesShades?.[device] ?? 48);
  return Number.isFinite(value)?Math.max(0,Math.min(100,value)):48;
}
export function applyRoutesShade(doc,model,device){
  const arch=doc.querySelector('#routes .routes-art');
  if(arch)arch.style.setProperty('--pk-routes-shade-opacity',String(routesShadePercent(model,device)/100));
}
export function deviceFor(width,height){
  if(width<=600 || (width<=940 && height<=520))return 'phone';
  return width<=1100 || (width<=1200 && height<=900)?'tablet':'desktop';
}
export function mediaURL(id,editing=false){
  if(id==='pakkasukko-gifts')return './assets/pakkasukko-gifts.webp';
  return /^[a-f0-9-]{36}$/.test(id)?'/api/'+(editing?'admin/':'')+'media/'+id:portrait;
}
export function applyBrand(doc,id,editing=false){
  const url=id?mediaURL(id,editing):'./assets/pakkasukko-medallion.png';
  for(const link of doc.querySelectorAll('link[rel="icon"],link[rel="apple-touch-icon"]')){
    if(link.getAttribute('href')!==url)link.setAttribute('href',url);
  }
  for(const image of doc.querySelectorAll('.brand .owner-logo')){
    if(image.getAttribute('src')!==url)image.setAttribute('src',url);
  }
}
export function cropPhoto(doc,crop,editing){
  const photo=doc.querySelector('.hero-photo');
  let img=photo.querySelector('img');
  if(!img){img=doc.createElement('img');img.alt='';photo.append(img);}
  const src=mediaURL(crop.image,editing);
  if(img.getAttribute('src')!==src)img.setAttribute('src',src);
  img.style.transform='translate('+crop.x+'%, '+crop.y+'%) scale('+crop.zoom/100+')';
}
const messages={
  "noDates": "Доступные даты пока не открыты. Свяжитесь с Дедом Морозом позже.",
  "chooseTime": "Выберите свободное время",
  "send": "Отправить заявку ↗",
  "pending": "Это предварительная заявка. После отправки дождитесь личного подтверждения.",
  "captcha": "Подтвердите проверку от спама.",
  "sending": "Отправка...",
  "error": "Не удалось отправить заявку",
  "success": "Ваша заявка отправлена. Пожалуйста, дождитесь личного подтверждения бронирования",
  "retry": "Повторить отправку",
  "programButton": "Выбрать программу"
};
export const pageText=(model,key)=>model.texts['message-'+key]??messages[key];
export function setField(field,value){
  if(field.attribute)field.node.setAttribute(field.attribute,value);
  else if(field.node){
    field.node.textContent=value;
    if(field.node.parentElement?.id==='provider-details'){
      const copy=field.node.ownerDocument.querySelector('[data-provider-copy]');
      if(copy)copy.textContent=value;
    }
  }
}
export function bindPage(doc){
  const fields=[];
  doc.querySelector('.intro').id='intro';
  for(const section of doc.querySelectorAll('header,main > section,footer')){
    const group=section.id||section.tagName.toLowerCase();
    const walker=doc.createTreeWalker(section,4);
    let node;
    while(node=walker.nextNode()){
      if(!node.textContent.trim()||node.parentElement.closest('#year,script,style,.snow,[data-provider-copy]'))continue;
      fields.push({group,key:group+'-'+fields.filter(f=>f.group===group).length,node,original:node.textContent});
    }
  }
  // Append non-text fields after collecting legacy keys so earlier revisions still match.
  for(const node of doc.querySelectorAll('header *,main *,footer *')){
    const section=node.closest('main > section,header,footer');
    if(!section)continue;
    const group=section.id||section.tagName.toLowerCase();
    for(const attribute of ['placeholder','aria-label','alt','title']){
      if(!node.hasAttribute(attribute))continue;
      const name=node.name||node.id||node.classList[0]||node.tagName.toLowerCase();
      fields.push({group,key:[group,attribute,name].join(':'),node,attribute,original:node.getAttribute(attribute)});
    }
  }
  const year=doc.getElementById('year');
  fields.push({group:'footer',key:'footer-year',node:year,original:String(new Date().getFullYear())});
  for(const [key,original] of Object.entries(messages))fields.push({group:key==='programButton'?'programs':'booking',key:'message-'+key,original});
  return fields;
}
import {fitTagline} from './tagline.js';
import {applySnow} from './snow.js';
import {renderRouteCities} from './route-cities.js';
export function renderPage(doc,model,fields,device,editing=false,fares=null){
  applySnow(doc,model.snow,device);
  for(const f of fields){setField(f,model.texts[f.key]??f.original);styleField(f,model.textStyles?.[f.key]);}
  renderRouteCities(doc,fares);
  fitTagline(doc,model.taglineWidth);
  for(const heading of doc.querySelectorAll('[data-heading-display]'))heading.remove();
  for(const node of doc.querySelectorAll('[data-heading-original]')){
    node.hidden=false;node.removeAttribute('data-heading-original');if(node.dataset.headingOriginalId){node.id=node.dataset.headingOriginalId;delete node.dataset.headingOriginalId;}
  }
  for(const section of doc.querySelectorAll('main > section[data-created]'))section.remove();
  for(const block of model.sections||[]){
    const section=doc.createElement('section');section.id=block.id;section.dataset.created='';section.className='intro section';
    const wrap=doc.createElement('div');wrap.className='container';
    const title=doc.createElement('h2'),body=doc.createElement('p');
    title.textContent=block.title;body.textContent=block.body;styleElement(title,model.textStyles?.[block.id+':title']);styleElement(body,model.textStyles?.[block.id+':body']);body.style.whiteSpace='pre-line';
    wrap.append(title,body);section.append(wrap);doc.querySelector('main').append(section);
  }
  for(const id of new Set([...Object.keys(model.headingOverrides||{}),...Object.keys(model.headingParts||{})])){
    const original=doc.getElementById(id)?.querySelector('h1,h2');
    if(!original)continue;
    const replacement=doc.createElement(original.localName);replacement.dataset.headingDisplay='';replacement.className=original.className;
    const parts=legacyHeadingParts(model,id,original);
    if(!validHeadingParts(parts))continue;
    for(const [index,part] of parts.entries()){if(index)replacement.append(doc.createElement('br'));const span=doc.createElement('span');span.textContent=part.text;styleElement(span,part);replacement.append(span);}
    if(original.id){replacement.id=original.id;original.dataset.headingOriginalId=original.id;original.removeAttribute('id');}
    original.dataset.headingOriginal='';original.hidden=true;original.after(replacement);
  }
  for(const id of model.order){const section=doc.getElementById(id);if(section?.parentElement?.tagName==='MAIN')section.parentElement.append(section);}
  for(const section of doc.querySelectorAll('main > section')){
    section.hidden=model.hidden.includes(section.id);
    section.querySelector('.section-media-frame')?.remove();
    section.querySelector('.section-media')?.remove();
    const asset=model.pictures[section.id];
    // The hero uses .hero-photo exclusively. Never append a second photo/card
    // to the top section, even for older revisions using pictures.top.
    if(section.id==='top')continue;
    if(asset&&section.id==='about'&&!asset.video){
      // The photo is displayed inside the existing .about-portrait frame.
    }else if(asset){
      const item=doc.createElement(asset.video?'video':'img');
      item.className='section-media';item.src=mediaURL(asset.id,editing);item.title=asset.caption||'';item.alt=item.title;
      if(asset.video){
        item.controls=true;
        if(section.id==='intro')section.querySelector('.intro-grid')?.append(item);
        else section.append(item);
      }else{
        const wrapper=doc.createElement('div');wrapper.className='section-media-frame';wrapper.append(item);
        if(section.id==='intro')section.querySelector('.intro-grid')?.append(wrapper);
        else if(section.id==='routes')section.querySelector('.routes-art')?.append(wrapper);
        else section.append(wrapper);
      }
    }
  }
  doc.querySelectorAll('.extra-card').forEach(el=>el.remove());
  const selectedService=doc.querySelector('#service')?.value;
  doc.querySelectorAll('.extra-option,.owner-contact').forEach(el=>el.remove());
  applyBrand(doc,model.logo,editing);
  for(const [key,value] of Object.entries(model.contacts||{})){
    if(!value)continue;
    const link=doc.createElement('a');link.className='owner-contact';link.textContent=value;
    if(key==='email')link.href='mailto:'+encodeURIComponent(value);
    else if(key==='phone')link.href='tel:'+value.replace(/[^+0-9]/g,'');else continue;
    doc.querySelector('#contact .container').append(link);
  }
  doc.querySelectorAll('.program-duration,.delivery-notice').forEach(el=>el.remove());
  for(const link of doc.querySelectorAll('[data-service]')){
    const id=link.dataset.service,config=deliveryConfig(model,id);
    link.href=config?.mode==='delivery'?deliveryLink(id):'#booking';
    if(config?.mode==='delivery'){const p=doc.createElement('p');p.className='delivery-notice program-duration';p.textContent=deliveryNotice(config);link.closest('.card').append(p);}
    const value=model.durations?.[id];
    if(value){const p=doc.createElement('p');p.className='program-duration';p.textContent=value;link.closest('.card').append(p);}
  }
  const programGrid=doc.querySelector('.cards');
  programGrid?.classList.toggle('cards-four',3+model.cards.length===4);
  for(const [index,card] of model.cards.entries()){
    const display=programPresentation(card,index);
    const box=doc.createElement('article');box.className='card extra-card';
    const icon=doc.createElement('span');icon.className='card-icon';icon.textContent=display.icon;box.append(icon);
    const number=doc.createElement('span');number.className='card-number';number.textContent=display.number;box.append(number);
    const title=doc.createElement('h3');title.textContent=display.regular;
    if(display.accent){
      title.append(doc.createElement('br'));
      const em=doc.createElement('em');em.textContent=display.accent;title.append(em);
    }
    box.append(title);
    const description=doc.createElement('p');description.className='card-description';description.textContent=card.description||'';box.append(description);
    const delivery=deliveryConfig(model,card.id);
    if(delivery?.mode==='delivery'){const notice=doc.createElement('p');notice.className='delivery-notice program-duration';notice.textContent=deliveryNotice(delivery);box.append(notice);}
    if(card.duration){
      const duration=doc.createElement('p');duration.className='program-duration';
      duration.textContent=card.duration;box.append(duration);
    }
    const foot=doc.createElement('div');foot.className='card-foot';
    const price=doc.createElement('strong');price.textContent=card.price||'По запросу';foot.append(price);
    if(card.id){
      const option=doc.createElement('option');option.className='extra-option';option.value=card.id;option.textContent=card.title+' · '+card.price;doc.querySelector('#service').append(option);
      const link=doc.createElement('a');link.href=delivery?.mode==='delivery'?deliveryLink(card.id):'#booking';link.textContent=(delivery?.mode==='delivery'?(delivery.video?'Заказать видео':'Заказать услугу'):pageText(model,'programButton'))+' ↗';
      if(delivery?.mode!=='delivery')link.onclick=()=>{doc.querySelector('#service').value=card.id;doc.querySelector('#service').dispatchEvent(new Event('change'));};foot.append(link);
    }
    box.append(foot);
    programGrid.append(box);
  }
  // Keep visible starting prices synchronized with the actual duration/cast tariff.
  for(const [id,priceId] of [['gift','priceGift'],['home','priceHome'],['event','priceEvent']]){
    const rows=performanceRows(fares,id),amounts=rows.flatMap(r=>[r.solo,r.duo]).filter(Number.isInteger);
    const price=doc.getElementById(priceId),option=[...doc.querySelector('#service').options].find(o=>o.value===id);
    const label=amounts.length?'от '+(Math.min(...amounts)/100).toLocaleString('ru-RU')+' €':price?.textContent;
    if(price&&label)price.textContent=label;
    if(option&&label)option.textContent=option.textContent.split(' · ')[0]+' · '+label;
  }
  if(selectedService && [...doc.querySelector('#service').options].some(o=>o.value===selectedService))doc.querySelector('#service').value=selectedService;
  if(model.seo.title)doc.title=model.seo.title;
  if(model.seo.description)doc.querySelector('meta[name=description]').content=model.seo.description;
  cropPhoto(doc,{...baseCrop(),...(model.crops[device]||{}),image:heroImageId(model,device)},editing);
  applyHeroShade(doc,model,device);
  applyRoutesShade(doc,model,device);
  for(const section of doc.querySelectorAll('main > section'))if(section.id!=='top')applySectionCrop(doc,model,section.id,device,editing);
}
