import {fitTagline,taglineSlider} from './tagline.js';
import {applySnow} from './snow.js';
import {snowPanel} from './snow-panel.js';
import {initial,mediaURL,baseCrop,baseSectionCrop,sectionCrop,cropPhoto,applySectionCrop,renderPage,setField,applyHeroShade,heroShadePercent,applyRoutesShade,routesShadePercent,heroImageId,setHeroDeviceImage} from './site.js';

// RUN-009: In-page controls are loaded only after the protected /api/admin/editor request succeeds.
export function editableFields(fields,element){
  return fields.filter(f=>f.node && f.node.isConnected && element.contains(f.node));
}
export function photoState(model,target,device){
  if(target==='top')return model.crops[device]??=baseCrop();
  if(target==='logo')return baseSectionCrop();
  model.sectionCrops??={};
  return (model.sectionCrops[target]??={})[device]??=baseSectionCrop();
}
const names={header:'Шапка',top:'Главный экран',intro:'Подарить воспоминание',programs:'Программы',about:'У волшебства есть голос',routes:'Города',booking:'Календарь',contact:'Контакты',privacy:'Конфиденциальность',footer:'Подвал'};
const short=(s,n=45)=>String(s||'').trim().replace(/\s+/g,' ').slice(0,n);
function make(tag,className,text){
  const e=document.createElement(tag);
  if(className)e.className=className;
  if(text!==undefined)e.textContent=text;
  return e;
}
function button(parent,label,fn,cls){
  const el=make('button','pk-action '+(cls||''),label);
  el.type='button';
  el.addEventListener('click',fn);
  parent.append(el);
  return el;
}
function labeled(parent,label,tag,value,onChange){
  const wrapper=make('label','pk-field');
  wrapper.append(make('span','',label));
  const input=make(tag);
  if(tag==='input')input.type='text';
  input.value=value??'';
  input.addEventListener('input',()=>onChange(input.value));
  wrapper.append(input);parent.append(wrapper);
  return input;
}
function option(select,value,label){select.add(new Option(label,value));}
function sectionOf(el){
  const section=el.closest('main > section,header,footer');
  return section?(section.id||section.tagName.toLowerCase()):'';
}
function isPicture(el){
  return el.classList?.contains('hero-photo')||el.classList?.contains('about-portrait')||el.classList?.contains('section-media-frame');
}
function pictureId(el){
  if(el.classList.contains('hero-photo'))return 'top';
  if(el.classList.contains('about-portrait'))return 'about';
  return sectionOf(el);
}
function cropBounds(n){return Math.max(-100,Math.min(100,Math.round(n)));}
export async function startInlineEditor({model,fields,currentDevice,onAdmin}){
  let result;
  try{
    const r=await fetch('/api/admin/editor',{cache:'no-store',credentials:'same-origin'});
    if(!r.ok)return false;
    result=await r.json();
    if(!Array.isArray(result.history)||!Array.isArray(result.media))return false;
  }catch{return false;}
  const host=make('div','pk-inline-host');
  host.id='pk-inline-host';
  document.body.append(host);
  const pins=make('div','pk-pin-layer');host.append(pins);
  const bar=make('div','pk-toolbar');
  const status=make('span','pk-status','Режим администратора');
  const editToggle=button(bar,'✎ Редактирование',()=>{active=!active;editToggle.textContent=active?'✎ Редактирование':'✎ Включить правки';pins.hidden=!active;snowButton.hidden=!active;if(!active)closePanel();else refreshPins();});
  const snowButton=button(bar,'Настроить снег',()=>{
    openPanel('Снег и зимние эффекты');
    snowPanel(panelBody,model.snow,value=>{model.snow=value;applySnow(document,value,currentDevice());changed();});
  });
  const sectionsButton=button(bar,'☷ Разделы',()=>sectionPanel());
  const addButton=button(bar,'＋ Раздел',()=>addSection());
  const saveButton=button(bar,'Сохранить черновик',()=>save(false),'pk-save');
  const publishButton=button(bar,'Опубликовать',()=>save(true),'pk-publish');
  const advanced=make('a','pk-action','Полный редактор ↗');advanced.href='./editor';bar.append(advanced);
  const statusRow=make('div','pk-toolbar-status');statusRow.append(status);
  host.append(bar,statusRow);
  const panel=make('aside','pk-panel');panel.hidden=true;panel.setAttribute('aria-label','Редактирование элемента');
  const panelHead=make('div','pk-panel-head'),panelTitle=make('strong','pk-panel-title','Редактирование');
  const close=button(panelHead,'✕',()=>closePanel(),'pk-close');close.setAttribute('aria-label','Закрыть панель');
  panelHead.prepend(panelTitle);
  const panelBody=make('div','pk-panel-body');panel.append(panelHead,panelBody);host.append(panel);
  let active=true,dirty=false,pinItems=[],openPicture='',dragSurface=null,dragStart=null,baseline=null;
  const revision=()=>result.id||0;
  function replaceModel(value){
    for(const key of Object.keys(model))delete model[key];
    Object.assign(model,initial(),structuredClone(value||{}));
    model.sectionCrops??={};model.shades??={};model.routesShades??={};model.pictures??={};model.hidden??=[];model.order??=[];model.cards??=[];model.sections??=[];
    if(!model.order.length)model.order=['top','intro','programs','about','routes','booking','contact','privacy'];
  }
  baseline=structuredClone(result.model||{});
  replaceModel(baseline);
  onAdmin?.();
  renderPage(document,model,fields,currentDevice(),true);
  function info(message,isError=false){
    status.textContent=message;status.classList.toggle('pk-error',isError);
    saveButton.classList.toggle('pk-unsaved',dirty);
  }
  function changed(){dirty=true;info('● Есть несохранённые изменения');}
  function draw(){
    for(const item of pinItems)item.button.remove();
    pinItems=[];
    pins.replaceChildren();
    renderPage(document,model,fields,currentDevice(),true);
    refreshPins();
    positionDrag();
  }
  function makePin(kind,target,id,title,fn){
    const b=make('button','pk-pin pk-pin-'+kind,kind==='photo'?'▣':kind==='section'?'⚙':'✎');
    b.type='button';b.title=title;b.setAttribute('aria-label',title);
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();fn();});
    pins.append(b);
    pinItems.push({kind,target,button:b,id});
  }
  function refreshPins(){
    if(!active)return;
    pins.replaceChildren();pinItems=[];
    for(const section of document.querySelectorAll('header,main > section,footer')){
      if(section.hidden||section.closest('[hidden]'))continue;
      const id=section.id||section.tagName.toLowerCase();
      makePin('section',section,id,'Настроить раздел '+(names[id]||id),()=>sectionPanel(id));
      const seen=new Set();
      const selectors='h1,h2,h3,p,nav a,.brand,.top-cta,.hero-actions a,.card-foot strong,.card-foot a,.card-number,.card-icon,.eyebrow,.hero-stats span,.tags span,.portrait-label,.panel-overline,.timezone,.field-label,.preview-banner,.footer-bottom span,.owner-contact,.extra-card strong,.extra-card a,.booking-form label';
      for(const el of section.querySelectorAll(selectors)){
        if(!el.isConnected||el.closest('[hidden]')||seen.has(el)||isPicture(el))continue;
        if(el.closest('.snow')||el.closest('script'))continue;
        if(el.matches('a,span')&&el.closest('h1,h2,h3,p')&&el.closest('h1,h2,h3,p')!==el)continue;
        if(group==='header'&&el.closest('.brand'))taglineSlider(panelBody,model,document,changed);
    const related=editableFields(fields,el);
        const extra=el.closest('.extra-card');
        const custom=el.closest('section[data-created]');
        const heading=el.matches('h1,h2')&&Object.hasOwn(model.headingOverrides||{},id);
        if(related.length||extra||custom||heading){
          seen.add(el);
          makePin('text',el,id,'Редактировать: '+short(el.textContent),()=>textPanel(el,id));
        }
      }
    }
    for(const el of document.querySelectorAll('.hero-photo,.about-portrait,.section-media-frame')){
      if(el.closest('[hidden]'))continue;
      makePin('photo',el,pictureId(el),'Изменить фотографию',()=>photoPanel(pictureId(el)));
    }
    positionPins();
  }
  function positionPins(){
    if(!active)return;
    for(const {kind,target,button} of pinItems){
      if(!target.isConnected||target.closest('[hidden]')){button.hidden=true;continue;}
      const r=target.getBoundingClientRect();
      if(r.bottom<0||r.top>innerHeight||r.width<12||r.height<10){button.hidden=true;continue;}
      button.hidden=false;
      const x=kind==='section'?r.right-30:kind==='photo'?r.left+r.width/2:r.right-10;
      const y=kind==='section'?Math.max(72,r.top+12):kind==='photo'?r.top+Math.min(r.height/2,80):r.top+7;
      button.style.left=Math.max(15,Math.min(innerWidth-37,x))+'px';
      button.style.top=Math.max(73,Math.min(innerHeight-39,y))+'px';
    }
    positionDrag();
  }
  function openPanel(title){
    panelTitle.textContent=title;panelBody.replaceChildren();panel.hidden=false;
    clearDrag();
    panelBody.scrollTop=0;
  }
  function closePanel(){panel.hidden=true;openPicture='';clearDrag();}
  function callRow(parent){return parent.appendChild(make('div','pk-row'));}
  function textPanel(el,group){
    openPanel('✎ '+(names[group]||group));
    const card=el.closest('.extra-card');
    if(card){
      const index=[...document.querySelectorAll('.extra-card')].indexOf(card);
      const entry=model.cards[index];
      if(entry){
        for(const [key,label] of [
          ['title','Название'],['accent','Выделение части заголовка'],['label','Подпись над названием'],
          ['icon','Иконка'],['description','Описание'],['duration','Длительность'],['price','Цена']
        ]){
          labeled(panelBody,label,'textarea',entry[key]||'',value=>{
            entry[key]=value;changed();draw();
          });
        }
        button(panelBody,'Удалить карточку',()=>{model.cards.splice(index,1);changed();draw();closePanel();});
        return;
      }
    }
    const custom=model.sections.find(s=>s.id===group);
    if(custom){
      for(const [key,label] of [['title','Заголовок'],['body','Текст']]){
        labeled(panelBody,label,'textarea',custom[key],value=>{custom[key]=value;const section=document.getElementById(group),node=section?.querySelector(key==='title'?'h2':'p');if(node)node.textContent=value;changed();});
      }
      return;
    }
    if(el.matches('h1,h2')&&Object.hasOwn(model.headingOverrides||{},group)){
      labeled(panelBody,'Заголовок целиком','textarea',model.headingOverrides[group],value=>{model.headingOverrides[group]=value;el.textContent=value;changed();});
      button(panelBody,'Вернуть исходное оформление заголовка',()=>{delete model.headingOverrides[group];changed();draw();closePanel();});
      return;
    }
    const related=editableFields(fields,el);
    if(!related.length){
      panelBody.append(make('p','pk-hint','Для этого элемента пока нет текстового поля. Можно открыть полный редактор.'));
      button(panelBody,'Открыть полный редактор',()=>{location.href='./editor';});
      return;
    }
    related.forEach((f,index)=>{
      const current=model.texts[f.key]??f.original;
      const label=(f.attribute?'Атрибут '+f.attribute:'Фрагмент '+(index+1))+' · '+short(f.original,38);
      labeled(panelBody,label,'textarea',current,value=>{
        model.texts[f.key]=value;
        if(f.node?.isConnected)setField(f,value);
        if(group==='header')fitTagline(document,model.taglineWidth);
        changed();
      });
    });
    panelBody.append(make('p','pk-hint','Текст меняется на странице сразу. Для посетителей правки появятся только после публикации.'));
  }
  function titleOf(id){return model.sections.find(x=>x.id===id)?.title||names[id]||id;}
  function sectionPanel(group){
    openPanel('⚙ Разделы сайта');
    const ids=['top',...model.order.filter(x=>x!=='top'),'footer'];
    if(!ids.includes('intro'))ids.splice(1,0,'intro');
    const unique=[...new Set(ids)];
    for(const id of unique){
      const row=make('div','pk-section-row');
      row.append(make('span','pk-section-label',titleOf(id)));
      const buttons=callRow(row);
      const target=model.hidden.includes(id);
      if(!['header','footer'].includes(id)){
        button(buttons,target?'Показать':'Скрыть',()=>{model.hidden=target?model.hidden.filter(x=>x!==id):[...model.hidden,id];changed();draw();sectionPanel(id);});
      }
      for(const [label,delta] of [['↑',-1],['↓',1]]){
        button(buttons,label,()=>{
          const i=model.order.indexOf(id),j=i+delta;
          if(i<0||j<0||j>=model.order.length)return;
          [model.order[i],model.order[j]]=[model.order[j],model.order[i]];
          changed();draw();sectionPanel(id);
        });
      }
      if(id!=='footer'&&id!=='header')button(buttons,'▣ Фото',()=>photoPanel(id));
      const custom=model.sections.some(s=>s.id===id);
      if(custom)button(buttons,'Удалить',()=>{if(!confirm('Удалить раздел из черновика?'))return;model.sections=model.sections.filter(s=>s.id!==id);model.order=model.order.filter(x=>x!==id);model.hidden=model.hidden.filter(x=>x!==id);delete model.pictures[id];changed();draw();sectionPanel();},'pk-danger');
      panelBody.append(row);
    }
    button(panelBody,'＋ Добавить текстовый раздел',()=>addSection());
    panelBody.append(make('p','pk-hint','Скрытые разделы остаются в черновике и их можно снова показать.'));
  }
  function addSection(){
    const id='section-'+crypto.randomUUID();
    model.sections.push({id,title:'Новый раздел',body:'Расскажите о празднике…'});
    model.order.push(id);
    changed();draw();
    document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'center'});
    sectionPanel(id);
  }
  function imageFrame(target){
    if(target==='top')return document.querySelector('.hero-photo');
    if(target==='about')return document.querySelector('.about-portrait');
    return document.getElementById(target)?.querySelector('.section-media-frame');
  }
  function imageSource(target){
    if(target==='top')return heroImageId(model,currentDevice());
    return model.pictures?.[target]?.id||'';
  }
  function setSource(target,id){
    if(target==='top')setHeroDeviceImage(model,currentDevice(),id);
    else if(id){
      const entry=id==='pakkasukko-gifts'?{id,caption:'Дед Мороз дарит подарки',mime:'image/webp'}:result.media.find(f=>f.id===id);
      if(entry)model.pictures[target]={id:entry.id,caption:entry.caption,video:false};
    }else delete model.pictures[target];
    changed();draw();photoPanel(target);
  }
  function applyCrop(target){
    if(target==='top')cropPhoto(document,{...photoState(model,target,currentDevice()),image:heroImageId(model,currentDevice())},true);
    else applySectionCrop(document,model,target,currentDevice(),true);
  }
  function photoPanel(target){
    openPicture=target;
    openPanel('▣ Фотография · '+titleOf(target));
    panelBody.append(make('p','pk-hint','Выберите фотографию и передвигайте её прямо в рамке. Для каждого устройства положение сохраняется отдельно.'));
    const deviceRow=callRow(panelBody);
    const current=make('strong','',currentDevice()==='desktop'?'Компьютер':currentDevice()==='tablet'?'Планшет':'Телефон');deviceRow.append(current);
    const selectLabel=make('label','pk-field');selectLabel.append(make('span','','Изображение'));
    const select=make('select');
    option(select,'',target==='intro'?'Без фотографии':'Исходный портрет Деда Мороза');
    option(select,'pakkasukko-gifts','Дед Мороз дарит подарки');
    for(const f of result.media)if(f.mime?.startsWith('image/'))option(select,f.id,f.caption||f.id);
    select.value=imageSource(target);select.addEventListener('change',()=>setSource(target,select.value));
    selectLabel.append(select);panelBody.append(selectLabel);
    const upload=make('label','pk-field');upload.append(make('span','','Загрузить новую фотографию'));
    const file=make('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.addEventListener('change',async()=>{
      if(!file.files?.[0])return;
      const uploaded=file.files[0];
      if(uploaded.size>30*1024*1024){info('Файл слишком большой (до 30 МБ).',true);return;}
      const uploadForm=new FormData();uploadForm.set('original',uploaded);
      try{
        if(typeof createImageBitmap==='function'){
          const bitmap=await createImageBitmap(uploaded);
          const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
          const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);
          canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
          const output=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));
          if(output)uploadForm.set('display',output,'display.webp');
        }
        info('Загружаем изображение…');
        const response=await fetch('/api/admin/media/upload',{method:'POST',body:uploadForm,credentials:'same-origin'});
        const payload=await response.json();
        if(!response.ok)throw Error(payload.error||'Ошибка загрузки');
        const refreshed=await api('editor');
        result.media=refreshed.media;
        setSource(target,payload.id);
        info('Фотография добавлена в R2. Теперь сохраните черновик.');
      }catch(e){info('Загрузка: '+e.message,true);}
    });
    upload.append(file);panelBody.append(upload);
    if(!imageFrame(target)){
      panelBody.append(make('p','pk-hint','Сначала выберите изображение — после этого появится рамка для перемещения.'));
      return;
    }
    if(target==='top'){
      const wrapper=make('label','pk-field');wrapper.append(make('span','','Затемнение фотографии: 0% — без затемнения'));
      const slider=make('input');slider.type='range';slider.min='0';slider.max='100';slider.step='1';
      const value=make('strong','',heroShadePercent(model,currentDevice())+'%');slider.value=String(heroShadePercent(model,currentDevice()));
      slider.addEventListener('input',()=>{
        model.shades??={};model.shades[currentDevice()]=Number(slider.value);
        value.textContent=heroShadePercent(model,currentDevice())+'%';
        applyHeroShade(document,model,currentDevice());changed();
      });
      wrapper.append(slider,value);panelBody.append(wrapper);
      button(panelBody,'Убрать затемнение (0%)',()=>{
        model.shades??={};model.shades[currentDevice()]=0;
        slider.value='0';value.textContent='0%';applyHeroShade(document,model,currentDevice());changed();
      });
    }
    if(target==='routes'){
      const wrapper=make('label','pk-field');wrapper.append(make('span','','Затемнение только снизу арки (0–100%)'));
      const slider=make('input');slider.type='range';slider.min='0';slider.max='100';slider.step='1';
      const value=make('strong','',routesShadePercent(model,currentDevice())+'%');
      slider.value=String(routesShadePercent(model,currentDevice()));
      slider.addEventListener('input',()=>{
        model.routesShades??={};model.routesShades[currentDevice()]=Number(slider.value);
        value.textContent=routesShadePercent(model,currentDevice())+'%';
        applyRoutesShade(document,model,currentDevice());changed();
      });
      wrapper.append(slider,value);panelBody.append(wrapper);
      button(panelBody,'Убрать затемнение (0%)',()=>{
        model.routesShades??={};model.routesShades[currentDevice()]=0;
        slider.value='0';value.textContent='0%';
        applyRoutesShade(document,model,currentDevice());changed();
      });
      panelBody.append(make('p','pk-hint','Верх и середина фотографии остаются без затемнения. Настройка индивидуальна для каждого устройства.'));
    }
    if(target!=='top'){
      const fLabel=make('label','pk-field');fLabel.append(make('span','','Отображение'));
      const fit=make('select');option(fit,'contain','Показать целиком');option(fit,'cover','Заполнить рамку');
      fit.value=sectionCrop(model,target,currentDevice()).fit==='cover'?'cover':'contain';
      fit.onchange=()=>{
        const crop=photoState(model,target,currentDevice());
        crop.fit=fit.value;crop.fitCustomized=true;
        applyCrop(target);changed();
      };
      fLabel.append(fit);panelBody.append(fLabel);
    }
    for(const [key,label,min,max] of [['x','Смещение по горизонтали (%)',-100,100],['y','Смещение по вертикали (%)',-100,100],['zoom','Масштаб (%)',35,300]]){
      const wrapper=make('label','pk-field');wrapper.append(make('span','',label));
      const row=make('div','pk-range-row');const slider=make('input');slider.type='range';slider.min=String(min);slider.max=String(max);slider.step='1';
      const num=make('input');num.type='number';num.min=String(min);num.max=String(max);num.step='1';num.className='pk-number';
      slider.dataset.cropAxis=key;num.dataset.cropAxis=key;
      slider.value=String(photoState(model,target,currentDevice())[key]);num.value=slider.value;
      const update=value=>{
        const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)return;
        photoState(model,target,currentDevice())[key]=n;slider.value=String(n);num.value=String(n);applyCrop(target);changed();
      };
      slider.oninput=()=>update(slider.value);num.oninput=()=>update(num.value);
      row.append(slider,num);wrapper.append(row);panelBody.append(wrapper);
    }
    button(panelBody,'Сбросить положение',()=>{
      Object.assign(photoState(model,target,currentDevice()),{x:0,y:0,zoom:100,fit:'contain',fitCustomized:false});
      applyCrop(target);changed();photoPanel(target);
    });
    button(panelBody,'Проверить другой экран',()=>{
      const order=['desktop','tablet','phone'];const next=order[(order.indexOf(currentDevice())+1)%3];
      info('Для проверки '+(next==='phone'?'телефона':next==='tablet'?'планшета':'компьютера')+' измените ширину окна либо используйте полный редактор.');
    });
    setDrag(target);
  }
  function clearDrag(){if(dragSurface){dragSurface.remove();dragSurface=null;}dragStart=null;}
  function setDrag(target){
    clearDrag();const frame=imageFrame(target);if(!frame)return;
    dragSurface=make('div','pk-drag-surface','↔ Перетащите фотографию');
    dragSurface.title='Перемещайте фотографию мышью или пальцем';
    host.append(dragSurface);
    dragSurface.onpointerdown=e=>{
      const r=frame.getBoundingClientRect(),c=photoState(model,target,currentDevice());
      dragStart={id:e.pointerId,x:e.clientX,y:e.clientY,x0:c.x,y0:c.y,width:Math.max(1,r.width),height:Math.max(1,r.height)};
      dragSurface.setPointerCapture(e.pointerId);e.preventDefault();
    };
    dragSurface.onpointermove=e=>{
      if(!dragStart||dragStart.id!==e.pointerId)return;
      const c=photoState(model,target,currentDevice());
      c.x=cropBounds(dragStart.x0+100*(e.clientX-dragStart.x)/dragStart.width);
      c.y=cropBounds(dragStart.y0+100*(e.clientY-dragStart.y)/dragStart.height);
      applyCrop(target);changed();e.preventDefault();
      for(const input of panelBody.querySelectorAll('[data-crop-axis]')){
        const axis=input.dataset.cropAxis;
        if(axis==='x'||axis==='y')input.value=String(c[axis]);
      }
    };
    dragSurface.onlostpointercapture=()=>dragStart=null;
    positionDrag();
  }
  function positionDrag(){
    if(!dragSurface||!openPicture||panel.hidden)return;
    const frame=imageFrame(openPicture);if(!frame){dragSurface.hidden=true;return;}
    const r=frame.getBoundingClientRect();
    dragSurface.hidden=r.bottom<0||r.top>innerHeight;
    if(dragSurface.hidden)return;
    const left=openPicture==='top'?r.left+r.width*.48:r.left;
    dragSurface.style.left=Math.max(0,left)+'px';
    dragSurface.style.top=Math.max(0,r.top)+'px';
    dragSurface.style.width=Math.max(70,r.right-left)+'px';
    dragSurface.style.height=Math.max(70,Math.min(r.bottom,innerHeight)-Math.max(0,r.top))+'px';
  }
  async function api(path,data){
    const r=await fetch('/api/admin/'+path,{method:data?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:data?{'Content-Type':'application/json'}:undefined,body:data?JSON.stringify(data):undefined});
    const value=await r.json().catch(()=>({error:'Невозможно прочитать ответ сервера'}));
    if(!r.ok)throw Error(value.error||'Ошибка '+r.status);
    return value;
  }
  async function save(publish){
    if(publish&&!confirm('Опубликовать изменения на сайте для всех посетителей?'))return;
    saveButton.disabled=publishButton.disabled=true;
    info(publish?'Публикуем…':'Сохраняем черновик…');
    try{
      await api('editor',{id:revision(),model,publish});
      result=await api('editor');
      baseline=structuredClone(result.model);
      dirty=false;
      info(publish?'Изменения опубликованы.':'Черновик сохранён.');
      // After publishing, change media URLs to the normal public path; the owner view stays authenticated.
      draw();
    }catch(e){
      info('Не удалось сохранить: '+e.message,true);
      if(/Версия изменилась/.test(e.message))panelBody.prepend(make('p','pk-warning','Черновик был изменён в другом окне. Обновите страницу, чтобы не потерять чужие правки.'));
    }finally{saveButton.disabled=publishButton.disabled=false;}
  }
  function reset(){
    if(dirty&&!confirm('Отменить несохранённые правки?'))return;
    replaceModel(baseline);dirty=false;draw();info('Несохранённые изменения отменены.');closePanel();
  }
  button(bar,'Отменить',()=>reset(),'pk-cancel');
  const update=()=>{if(active)positionPins();};
  addEventListener('scroll',update,{passive:true});
  addEventListener('resize',()=>{if(active){refreshPins();positionDrag();}},{passive:true});
  document.addEventListener('pakkasukko:layout',()=>{if(active)refreshPins();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)closePanel();});
  refreshPins();
  info('Режим администратора · изменения сохраняются в черновик');
  return true;
}
