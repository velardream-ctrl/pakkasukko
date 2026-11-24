import {applySnow} from './snow.js';
import {snowPanel} from './snow-panel.js';
import {applyBrand,setField,devices,baseCrop,baseSectionCrop,sectionCrop,initial,bindPage,renderPage,cropPhoto,applySectionCrop,applyHeroShade,heroShadePercent,applyRoutesShade,routesShadePercent,heroImageId,setHeroDeviceImage,setHeroGlobalImage,mediaURL} from './site.js';
const $=id=>document.getElementById(id);
const frame=document.querySelector('iframe'), panel=document.querySelector('main');
const names={header:'Шапка',top:'Первый экран',intro:'Вступление',programs:'Программы',about:'Об артисте',routes:'Города',booking:'Календарь',contact:'Контакты',privacy:'Конфиденциальность',footer:'Подвал'};
let data,model,fields,doc,landscape=false,scale=1,start,sessionNotice,lastBrokenImage='';
function note(s){$('status').textContent=s;}
function requireOwnerLogin(){
  if(!sessionNotice){
    const banner=document.createElement('div');banner.id='ownerSessionNotice';banner.setAttribute('role','alert');
    const message=document.createElement('p');message.textContent='Сессия владельца больше не действует. Изображения из R2 защищены, поэтому они не появятся в предпросмотре до повторного входа.';
    const login=document.createElement('a');login.href='./admin.html';login.target='_blank';login.rel='noopener noreferrer';login.textContent='Войти в админку ↗';
    const retry=document.createElement('button');retry.type='button';retry.textContent='Проверить вход и обновить фотографии';
    retry.onclick=async()=>{
      try{
        const r=await fetch('/api/admin/editor',{cache:'no-store',credentials:'same-origin'});
        if(!r.ok)throw Error('Сначала войдите в админку в новой вкладке.');
        sessionNotice.hidden=true;lastBrokenImage='';
        if(!doc){await init();return;}
        for(const img of doc.querySelectorAll('.hero-photo img,.about-photo'))img.removeAttribute('src');
        draw();note('Вход восстановлен. Фотографии загружаются снова.');
      }catch(e){note(e.message);}
    };
    banner.append(message,login,retry);$('status').after(banner);sessionNotice=banner;
  }
  sessionNotice.hidden=false;
  note('Необходим вход владельца — откройте админку и затем проверьте вход.');
}
async function verifyMedia(id){
  if(!/^[a-f0-9-]{36}$/.test(id||''))return true;
  const response=await fetch('/api/admin/media/check/'+id,{cache:'no-store',credentials:'same-origin'});
  if(response.status===401){requireOwnerLogin();return false;}
  if(!response.ok){
    const data=await response.json().catch(()=>({}));
    note(data.error||'Фотография отсутствует в R2. Выберите другой файл или загрузите её снова.');
    return false;
  }
  return true;
}
async function api(path,body){
  const options=body instanceof FormData?{method:'POST',body}:body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{};
  const r=await fetch('/api/admin/'+path,{...options,cache:'no-store',credentials:'same-origin'});
  const value=await r.json().catch(()=>({error:'Для редактирования нужен сервер Pakkasukko.'}));
  if(r.status===401)requireOwnerLogin();
  if(!r.ok||value.error)throw Error(value.error||'Ошибка сервера');return value;
}
function action(id,fn){$(id).onclick=async()=>{try{await fn();}catch(e){note(e.message);}};}
function input(parent,label,value,change,type='text'){
  const wrap=document.createElement('label');wrap.textContent=label;
  const el=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')el.type=type;
  el.value=value;el.oninput=()=>change(el.value);wrap.append(el);parent.append(wrap);return el;
}
function button(parent,label,fn){const el=document.createElement('button');el.textContent=label;el.onclick=async()=>{try{await fn();}catch(e){note(e.message);}};parent.append(el);}
const device=()=>$('device').value;
const target=()=>$('photoTarget').value;
const crop=()=>{
  if(target()==='top')return model.crops[device()]??=baseCrop();
  model.sectionCrops??={};
  const section=model.sectionCrops[target()]??={};
  return section[device()]??=baseSectionCrop();
};
const source=()=>{
  if(target()==='top')return heroImageId(model,device());
  return model.pictures?.[target()]?.id||'';
};
const displayTarget=()=>{
  if(!doc)return;
  if(target()==='top')doc.defaultView.scrollTo(0,0);
  else doc.getElementById(target())?.scrollIntoView({block:'start'});
};
function draw(){
  applyBrand(document,model.logo,true);
  renderPage(doc,model,fields,device(),true);
  for(const key of ['x','y','zoom'])$(key).value=crop()[key];
  $('photo').value=source();
  $('photoFit').value=sectionCrop(model,target(),device()).fit==='cover'?'cover':'contain';
  $('photoFitLabel').hidden=target()==='top';
  $('heroShadeLabel').hidden=target()!=='top';
  $('heroShadeHint').hidden=target()!=='top';
  $('heroShade').value=String(heroShadePercent(model,device()));
  $('heroShadeValue').textContent=heroShadePercent(model,device())+'%';
  $('routesShadeLabel').hidden=target()!=='routes';
  $('routesShadeHint').hidden=target()!=='routes';
  $('routesShade').value=String(routesShadePercent(model,device()));
  $('routesShadeValue').textContent=routesShadePercent(model,device())+'%';
}
function layout(){
  let [w,h]=devices[device()];if(landscape)[w,h]=[h,w];
  const box=$('viewport');scale=Math.min(box.clientWidth/w,innerHeight*.62/h);
  box.style.height=h*scale+'px';frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform='scale('+scale+')';draw();
}
function assets(select,imagesOnly=false){
  select.replaceChildren(new Option(imagesOnly?'Исходный портрет':'Без дополнительного изображения',''));
  if(imagesOnly)select.add(new Option('Дед Мороз дарит подарки','pakkasukko-gifts'));
  for(const f of data.media)if(!imagesOnly||f.mime.startsWith('image'))select.add(new Option(f.caption,f.id));
}
function groupName(id){return model.sections.find(s=>s.id===id)?.title||names[id]||id;}
function outline(){
  const selected=$('section').value;
  $('section').replaceChildren();$('outline').replaceChildren();
  for(const id of ['header',...model.order,'footer']){
    const label=groupName(id)+(model.hidden.includes(id)?' (скрыт)':'');
    $('section').add(new Option(label,id));
    button($('outline'),label,()=>selectGroup(id));
  }
  if([...$('section').options].some(o=>o.value===selected))$('section').value=selected;
}
function selectGroup(id){
  $('section').value=id;$('textSearch').value='';section();
  const element=doc.getElementById(id)||doc.getElementsByTagName(id)[0];
  element?.scrollIntoView({block:'start'});
}
function previewClick(event){
  if($('mode').value!=='text')return;
  event.preventDefault();event.stopPropagation();
  const target=event.target,container=target.closest('main > section,header,footer');
  if(!container)return;
  const group=container.id||container.localName;
  $('section').value=group;$('textSearch').value='';section();
  if(target.closest('.about-portrait')||target.closest('.section-media-frame')){
    $('photoTarget').value=group==='about'?'about':group;
    $('mode').value='photo';mode();draw();return;
  }
  const heading=target.closest('h1,h2'),card=target.closest('.extra-card');
  let field;
  if(card){
    const idx=[...doc.querySelectorAll('.extra-card')].indexOf(card);
    const key=target.closest('.card-icon')?'icon':target.closest('.card-number')?'label':
      target.closest('h3')?'title':target.closest('.program-duration')?'duration':
      target.closest('.card-foot strong')?'price':'description';
    field=[...$('cards').querySelectorAll('input,textarea')].find(el=>el.dataset.cardIndex===String(idx)&&el.dataset.cardKey===key);
  }else if(heading)field=$('wholeHeading');
  else if(container.hasAttribute('data-created'))field=$('customBody');
  else{
    const item=fields.find(f=>f.node===target&&f.attribute==='placeholder')||fields.find(f=>f.node?.parentElement===target&&!f.attribute);
    field=item&&document.getElementById('edit-'+item.key);
    if(!field && target.closest('.owner-contact'))field=$('contacts').querySelectorAll('input')[target.closest('a').href.startsWith('mailto:')?0:1];
    if(!field && target.closest('.program-duration'))field=[...$('fields').querySelectorAll('input')][[...doc.querySelectorAll('.card [data-service]')].findIndex(link=>link.closest('.card')===target.closest('.card'))];
  }
  (field||$('fields').querySelector('textarea,input')||$('section')).focus();
}
function section(){
  const group=$('section').value;
  $('fields').replaceChildren();
  const query=$('textSearch').value.trim().toLocaleLowerCase('ru');
  const custom=model.sections.find(s=>s.id===group);
  if(custom&&!query){
    const title=input($('fields'),'Заголовок раздела',custom.title,v=>{custom.title=v;outline();draw();});title.id='wholeHeading';
    input($('fields'),'Текст раздела',custom.body,v=>{custom.body=v;draw();},'textarea').id='customBody';
    button($('fields'),'Удалить этот раздел',()=>{if(!confirm('Удалить раздел из редактируемой версии?'))return;
      model.sections=model.sections.filter(s=>s.id!==group);model.order=model.order.filter(id=>id!==group);model.hidden=model.hidden.filter(id=>id!==group);delete model.pictures[group];outline();section();draw();
    });
  }
  const heading=doc.getElementById(group)?.querySelector('h1,h2');
  if(heading&&!custom&&!query){
    const title=input($('fields'),'Заголовок целиком',model.headingOverrides[group]??(heading.innerText||heading.textContent),v=>{model.headingOverrides[group]=v;draw();},'textarea');title.id='wholeHeading';
    button($('fields'),'Вернуть составной заголовок',()=>{delete model.headingOverrides[group];draw();section();});
  }
  for(const f of fields){
    const value=model.texts[f.key]??f.original;
    if(query ? !(value+' '+f.original).toLocaleLowerCase('ru').includes(query) : f.group!==group)continue;
    const label=(query?names[f.group]+' · ':'')+(f.attribute==='placeholder'?'Подсказка поля · ':'')+f.original.trim().slice(0,80);
    const editor=input($('fields'),label,value,v=>{model.texts[f.key]=v;setField(f,v);if(!f.node)draw();
      if(f.node?.parentElement?.closest('[data-heading-original]')){delete model.headingOverrides[f.group];draw();}
    },'textarea');editor.id='edit-'+f.key;
  }
  if(group==='programs')for(const link of doc.querySelectorAll('.card [data-service]')){
    const k=link.dataset.service;input($('fields'),'Длительность · '+link.closest('.card').querySelector('h3').textContent,model.durations[k]||'',v=>{model.durations[k]=v;draw();});
  }
  if(![...$('picture').options].some(o=>o.value==='pakkasukko-gifts'))$('picture').add(new Option('Дед Мороз дарит подарки','pakkasukko-gifts'));
  $('picture').value=model.pictures[group]?.id||'';
  for(const id of ['up','down','visibility','picture'])$(id).disabled=!model.order.includes(group);
  $('visibility').textContent=model.hidden.includes(group)?'Показать раздел':'Скрыть раздел';
}
function cards(){
  $('cards').replaceChildren();
  for(const [index,c] of model.cards.entries()){
    const box=document.createElement('fieldset');box.className='program-edit-fields';
    const legend=document.createElement('legend');legend.textContent='Программа '+String(index+4).padStart(2,'0');box.append(legend);
    for(const [k,label] of Object.entries({
      title:'Название',accent:'Выделить цветом окончание названия (необязательно)',
      label:'Подпись над названием (необязательно)',icon:'Иконка (например ▶, ✧, ♫)',
      description:'Описание',duration:'Длительность',price:'Цена'
    })){
      const control=input(box,label,c[k]||'',v=>{c[k]=v;draw();},k==='description'?'textarea':'text');
      control.dataset.cardIndex=String(index);control.dataset.cardKey=k;
    }
    button(box,'Удалить карточку',()=>{model.cards.splice(model.cards.indexOf(c),1);cards();draw();});
    $('cards').append(box);
  }
}
function library(){
  assets($('logo'),true);$('logo').options[0].text='Дед Мороз в золотом медальоне (по умолчанию)';$('logo').value=model.logo;assets($('picture'));assets($('photo'),true);$('library').replaceChildren();
  for(const item of data.media){
    const box=document.createElement('article'), view=document.createElement(item.mime.startsWith('image')?'img':'video');
    view.src=mediaURL(item.id,true);view.controls=true;box.append(view);
    input(box,'Подпись',item.caption,v=>item.caption=v);
    input(box,'Порядок',item.position,v=>item.position=Number(v),'number');
    button(box,'Сохранить подпись и порядок',async()=>{await api('media/edit',item);await refreshMedia();});
    button(box,'Заменить в черновике',()=>{
      const replacement=document.createElement('select');assets(replacement);replacement.options[0].text='Выберите замену';
      replacement.onchange=()=>{const other=data.media.find(f=>f.id===replacement.value);if(!other)return;
        if((model.logo===item.id||Object.values(model.crops).some(c=>c.image===item.id))&&!other.mime.startsWith('image')){note('Для портрета и логотипа выберите фотографию.');return;}
        for(const c of Object.values(model.crops))if(c.image===item.id)c.image=other.id;
        if(model.logo===item.id)model.logo=other.id;
        for(const k of Object.keys(model.pictures))if(model.pictures[k].id===item.id)model.pictures[k]={id:other.id,caption:other.caption,video:other.mime.startsWith('video')};
        library();section();draw();note('Замена подготовлена. Сохраните черновик или опубликуйте.');
      };box.append(replacement);
    });
    button(box,'Убрать из медиатеки',async()=>{if(confirm('Убрать из списка? Сохранённые версии сохранят доступ к файлу.')){await api('media/edit',{id:item.id,archive:true});await refreshMedia();}});
    $('library').append(box);
  }
}
async function refreshMedia(){data.media=(await api('editor')).media;library();section();draw();}
function reset(){
  model=Object.assign(initial(),structuredClone(data.model));
  snowPanel($('snowFields'),model.snow,value=>{model.snow=value;applySnow(doc,value,device());});
  if(!model.order.length)model.order=Object.keys(names).filter(k=>!['header','footer'].includes(k));
  outline();library();section();cards();$('contacts').replaceChildren();for(const [k,label] of [['email','Email'],['phone','Телефон']])input($('contacts'),label,model.contacts[k]||'',v=>{model.contacts[k]=v;draw();});$('seo').replaceChildren();
  for(const [key,label,v] of [['title','Заголовок',doc.title],['description','Описание',doc.querySelector('meta[name=description]').content]])input($('seo'),label,model.seo[key]??v,text=>model.seo[key]=text);
  $('history').replaceChildren(...data.history.map(v=>new Option('#'+v.id+' · '+v.created_at+' · '+(v.published?'публикация':'черновик'),v.id)));layout();
}
async function commit(publish=false,restore=0){
  await api('editor',{model,id:data.id,publish,restore});data=await api('editor');reset();note(publish?'Опубликовано.':'Черновик сохранён.');
}
async function init(){
  data=await api('editor');
  const page=new DOMParser().parseFromString(await (await fetch('./index.html')).text(),'text/html');
  page.querySelectorAll('script').forEach(s=>s.remove());
  const config=await (await fetch('/api/public-config')).json();
  for(const [id,key] of Object.entries({priceGift:'giftPrice',priceHome:'homePrice',priceEvent:'eventPrice',bio:'bio',travel:'travel'}))if(config.content?.[key])page.getElementById(id).textContent=config.content[key];
  const loaded=new Promise(resolve=>frame.onload=resolve);frame.srcdoc=page.documentElement.outerHTML;await loaded;
  doc=frame.contentDocument;fields=bindPage(doc);doc.addEventListener('click',previewClick,true);
  // Image errors cannot be read through img.onload as they may be caused by
  // expired owner cookies, or an R2 object missing after an old draft restore.
  doc.addEventListener('error',async event=>{
    const img=event.target;
    if(img?.tagName!=='IMG')return;
    const src=img.getAttribute('src')||'';
    if(!src.startsWith('/api/admin/media/'))return;
    const id=src.split('/').pop()?.split('?')[0];
    if(!id||id===lastBrokenImage)return;
    lastBrokenImage=id;
    try{
      const ok=await verifyMedia(id);
      if(ok)note('Файл существует в R2, но предпросмотр не смог его показать. Откройте админку и проверьте вход.');
    }catch(e){note('Ошибка проверки фотографии: '+e.message);}
  },true);
  for(const [key,label] of Object.entries(names))$('section').add(new Option(label,key));
  for(const [key,label,min,max] of [['x','X (%)',-100,100],['y','Y (%)',-100,100],['zoom','Масштаб (%)',35,300]]){
    const el=input($('coords'),label,0,v=>{if(v!==''&&Number(v)>=min&&Number(v)<=max){crop()[key]=Number(v);if(target()==='top')cropPhoto(doc,crop(),true);else applySectionCrop(doc,model,target(),device(),true);}},'number');el.id=key;el.min=min;el.max=max;
  }
  panel.hidden=false;reset();note('Редактор готов.');
}
function mode(){
  const photo=$('mode').value==='photo';
  $('drag').hidden=!photo;frame.style.pointerEvents=photo?'none':'auto';frame.tabIndex=photo?-1:0;
  $('photoTools').hidden=!photo;$('hint').hidden=photo;
  if(photo)displayTarget();
}
mode();$('mode').onchange=mode;
action('newSection',()=>{
  const id='section-'+crypto.randomUUID();model.sections.push({id,title:'Новый раздел',body:''});model.order.push(id);
  outline();draw();selectGroup(id);$('wholeHeading').focus();
});
$('device').onchange=()=>{landscape=false;layout();};
$('photoTarget').onchange=()=>{draw();displayTarget();};
$('photoFit').onchange=e=>{
  crop().fit=e.target.value==='cover'?'cover':'contain';
  crop().fitCustomized=true;
  draw();
};
$('heroShade').oninput=e=>{
  if(target()!=='top')return;
  model.shades??={};model.shades[device()]=Number(e.target.value);
  $('heroShadeValue').textContent=heroShadePercent(model,device())+'%';
  applyHeroShade(doc,model,device());
};
$('routesShade').oninput=e=>{
  if(target()!=='routes')return;
  model.routesShades??={};model.routesShades[device()]=Number(e.target.value);
  $('routesShadeValue').textContent=routesShadePercent(model,device())+'%';
  applyRoutesShade(doc,model,device());
};
action('rotate',()=>{landscape=!landscape;layout();});
$('textSearch').oninput=section;
$('section').onchange=()=>{selectGroup($('section').value);};
$('preset').onchange=e=>{if(e.target.value){Object.assign(crop(),{zoom:Number(e.target.value),x:0,y:0});draw();}};
$('logo').onchange=e=>{model.logo=e.target.value;draw();};
$('photo').onchange=async e=>{
  if(!(await verifyMedia(e.target.value))){draw();return;}
  if(target()==='top')setHeroDeviceImage(model,device(),e.target.value);
  else {
    model.pictures??={};
    if(!e.target.value)delete model.pictures[target()];
    else {
      const f=e.target.value==='pakkasukko-gifts'?{id:e.target.value,caption:'Дед Мороз дарит подарки',mime:'image/webp'}:data.media.find(i=>i.id===e.target.value);
      if(f&&f.mime.startsWith('image'))model.pictures[target()]={id:f.id,caption:f.caption,video:false};
    }
  }
  draw();
};
$('picture').onchange=async e=>{
  if(!(await verifyMedia(e.target.value))){section();return;}
  const f=e.target.value==='pakkasukko-gifts'?{id:e.target.value,caption:'Дед Мороз дарит подарки',mime:'image/webp'}:data.media.find(i=>i.id===e.target.value);
  const group=$('section').value;
  if(group==='top'){
    if(f?.mime.startsWith('video')){note('Для верхнего портрета выберите фотографию, не видео.');section();return;}
    setHeroGlobalImage(model,f?.id||'',f?.caption||'');
  }else if(f)model.pictures[group]={id:f.id,video:f.mime.startsWith('video'),caption:f.caption};
  else delete model.pictures[group];
  draw();
};
for(const [id,delta] of [['up',-1],['down',1]])action(id,()=>{const i=model.order.indexOf($('section').value),j=i+delta;if(j>=0&&j<model.order.length){[model.order[i],model.order[j]]=[model.order[j],model.order[i]];outline();draw();note('Порядок: '+model.order.map(groupName).join(' · '));}});
action('visibility',()=>{const k=$('section').value;model.hidden=model.hidden.includes(k)?model.hidden.filter(i=>i!==k):[...model.hidden,k];outline();section();draw();});
action('add',()=>{model.cards.push({id:crypto.randomUUID(),title:'Новая программа',description:'',price:'',duration:''});cards();draw();});
action('save',()=>commit());action('publish',()=>commit(true));action('restore',()=>{if($('history').value)return commit(false,Number($('history').value));});
action('cancel',reset);action('reset',()=>{Object.assign(crop(),{x:0,y:0,zoom:100,fit:'contain'});draw();});
const drag=$('drag');
drag.onpointerdown=e=>{
  const img=target()==='top'?doc.querySelector('.hero-photo img'):target()==='about'?doc.querySelector('.about-photo'):doc.querySelector('#'+target()+' .section-media-frame img');
  if(!img)return;
  start={id:e.pointerId,x:e.clientX,y:e.clientY,c:{...crop()},w:Math.max(1,img.offsetWidth*scale),h:Math.max(1,img.offsetHeight*scale)};
  drag.setPointerCapture(e.pointerId);
};
drag.onpointermove=e=>{if(start?.id!==e.pointerId)return;
  for(const [k,pos,size] of [['x',e.clientX,'w'],['y',e.clientY,'h']])crop()[k]=Math.max(-100,Math.min(100,Math.round(start.c[k]+100*(pos-start[k])/start[size])));
  draw();};
drag.onlostpointercapture=()=>start=null;
$('file').onchange=async e=>{
  try{const file=e.target.files[0];if(!file)return;
    const form=new FormData();form.set('original',file);
    if(file.type.startsWith('image')){
      const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
      canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.86));if(blob?.type==='image/webp')form.set('display',blob,'display.webp');
    }
    await api('media/upload',form);await refreshMedia();note('Файл добавлен.');e.target.value='';
  }catch(err){note(err.message);}
};
addEventListener('resize',()=>{if(model)layout();});init().catch(e=>note(e.message));
