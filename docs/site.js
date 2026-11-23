export const devices = {desktop:[1440,900],tablet:[820,1180],phone:[390,844]};
export const portrait = './assets/pakkasukko-ded-moroz.webp';
export const baseCrop = () => ({x:0,y:0,zoom:100,image:''});
export const baseSectionCrop = () => ({x:0,y:0,zoom:100,fit:'contain'});
export function sectionCrop(model,section,device){
  const positions=model.sectionCrops?.[section];
  return positions?.[device]||baseSectionCrop();
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
  }else if(section==='intro'){
    img=doc.querySelector('#intro .section-media-frame > img');
    if(!img)return;
  }else return;
  img.style.objectFit=crop.fit==='cover'?'cover':'contain';
  img.style.transform='translate('+Math.max(-100,Math.min(100,Number(crop.x)||0))+'%, '+Math.max(-100,Math.min(100,Number(crop.y)||0))+'%) scale('+Math.max(.35,Math.min(3,(Number(crop.zoom)||100)/100))+')';
}

export const initial = () => ({sections:[],headingOverrides:{},texts:{},crops:{},sectionCrops:{},hidden:[],order:[],cards:[],pictures:{},seo:{},logo:"",contacts:{},durations:{}});
export function deviceFor(width,height){
  if(width<=600 || (width<=940 && height<=520))return 'phone';
  return width<=1100 || (width<=1200 && height<=900)?'tablet':'desktop';
}
export function mediaURL(id,editing=false){
  if(id==='pakkasukko-gifts')return './assets/pakkasukko-gifts.webp';
  return /^[a-f0-9-]{36}$/.test(id)?'/api/'+(editing?'admin/':'')+'media/'+id:portrait;
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
  else if(field.node)field.node.textContent=value;
}
export function bindPage(doc){
  const fields=[];
  doc.querySelector('.intro').id='intro';
  for(const section of doc.querySelectorAll('header,main > section,footer')){
    const group=section.id||section.tagName.toLowerCase();
    const walker=doc.createTreeWalker(section,4);
    let node;
    while(node=walker.nextNode()){
      if(!node.textContent.trim()||node.parentElement.closest('#year,script,style,.snow'))continue;
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
export function renderPage(doc,model,fields,device,editing=false){
  for(const f of fields)setField(f,model.texts[f.key]??f.original);
  for(const heading of doc.querySelectorAll('[data-heading-display]'))heading.remove();
  for(const node of doc.querySelectorAll('[data-heading-original]')){
    node.hidden=false;node.removeAttribute('data-heading-original');
  }
  for(const section of doc.querySelectorAll('main > section[data-created]'))section.remove();
  for(const block of model.sections||[]){
    const section=doc.createElement('section');section.id=block.id;section.dataset.created='';section.className='intro section';
    const wrap=doc.createElement('div');wrap.className='container';
    const title=doc.createElement('h2'),body=doc.createElement('p');
    title.textContent=block.title;body.textContent=block.body;body.style.whiteSpace='pre-line';
    wrap.append(title,body);section.append(wrap);doc.querySelector('main').append(section);
  }
  for(const [id,text] of Object.entries(model.headingOverrides||{})){
    const original=doc.getElementById(id)?.querySelector('h1,h2');
    if(!original)continue;
    const replacement=doc.createElement(original.localName);replacement.dataset.headingDisplay='';replacement.className=original.className;replacement.textContent=text;
    original.dataset.headingOriginal='';original.hidden=true;original.after(replacement);
  }
  for(const id of model.order){const section=doc.getElementById(id);if(section?.parentElement?.tagName==='MAIN')section.parentElement.append(section);}
  for(const section of doc.querySelectorAll('main > section')){
    section.hidden=model.hidden.includes(section.id);
    section.querySelector('.section-media-frame')?.remove();
    section.querySelector('.section-media')?.remove();
    const asset=model.pictures[section.id];
    if(asset&&section.id==='about'&&!asset.video){
      // About portrait is the existing image frame, not another image below the text.
    }else if(asset){const item=doc.createElement(asset.video?'video':'img');item.className='section-media';item.controls=true;item.src=mediaURL(asset.id,editing);item.title=asset.caption||'';item.alt=item.title;
      if(section.id==='intro'){
        const wrapper=doc.createElement('div');wrapper.className='section-media-frame';wrapper.append(item);section.querySelector('.intro-grid').append(wrapper);
      }else section.append(item);
    }
  }
  doc.querySelectorAll('.extra-card').forEach(el=>el.remove());
  doc.querySelectorAll('.extra-option,.owner-contact,.owner-logo').forEach(el=>el.remove());
  if(model.logo)for(const brand of doc.querySelectorAll('.brand')){
    const img=doc.createElement('img');img.className='owner-logo';img.alt='';img.src=mediaURL(model.logo,editing);brand.prepend(img);
  }
  for(const [key,value] of Object.entries(model.contacts||{})){
    if(!value)continue;
    const link=doc.createElement('a');link.className='owner-contact';link.textContent=value;
    if(key==='email')link.href='mailto:'+encodeURIComponent(value);
    else if(key==='phone')link.href='tel:'+value.replace(/[^+0-9]/g,'');else continue;
    doc.querySelector('#contact .container').append(link);
  }
  doc.querySelectorAll('.program-duration').forEach(el=>el.remove());
  for(const link of doc.querySelectorAll('[data-service]')){
    const value=model.durations?.[link.dataset.service];
    if(value){const p=doc.createElement('p');p.className='program-duration';p.textContent=value;link.closest('.card').append(p);}
  }
  for(const card of model.cards){
    const box=doc.createElement('article');box.className='card extra-card';
    for(const [tag,key] of [['h3','title'],['p','description'],['strong','price'],['p','duration']]){
      const child=doc.createElement(tag);child.textContent=card[key];box.append(child);
    }
    if(card.id){
      const option=doc.createElement('option');option.className='extra-option';option.value=card.id;option.textContent=card.title+' · '+card.price;doc.querySelector('#service').append(option);
      const link=doc.createElement('a');link.href='#booking';link.textContent=pageText(model,'programButton');link.onclick=()=>{doc.querySelector('#service').value=card.id;};box.append(link);
    }
    doc.querySelector('.cards').append(box);
  }
  if(model.seo.title)doc.title=model.seo.title;
  if(model.seo.description)doc.querySelector('meta[name=description]').content=model.seo.description;
  cropPhoto(doc,model.crops[device]||baseCrop(),editing);
  applySectionCrop(doc,model,'about',device,editing);
  applySectionCrop(doc,model,'intro',device,editing);
}
