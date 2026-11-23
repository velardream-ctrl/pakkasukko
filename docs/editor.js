import {setField,devices,baseCrop,initial,bindPage,renderPage,cropPhoto,mediaURL} from './site.js';
const $=id=>document.getElementById(id);
const frame=document.querySelector('iframe'), panel=document.querySelector('main');
const names={header:'Шапка',top:'Первый экран',intro:'Вступление',programs:'Программы',about:'Об артисте',routes:'Города',booking:'Календарь',contact:'Контакты',privacy:'Конфиденциальность',footer:'Подвал'};
let data,model,fields,doc,landscape=false,scale=1,start;
function note(s){$('status').textContent=s;}
async function api(path,body){
  const options=body instanceof FormData?{method:'POST',body}:body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{};
  const r=await fetch('/api/admin/'+path,{...options,cache:'no-store'});
  const value=await r.json().catch(()=>({error:'Для редактирования нужен сервер Pakkasukko.'}));
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
const crop=()=>model.crops[device()]??=baseCrop();
function draw(){
  renderPage(doc,model,fields,device(),true);
  for(const key of ['x','y','zoom'])$(key).value=crop()[key];
  $('photo').value=crop().image;
}
function layout(){
  let [w,h]=devices[device()];if(landscape)[w,h]=[h,w];
  const box=$('viewport');scale=Math.min(box.clientWidth/w,innerHeight*.62/h);
  box.style.height=h*scale+'px';frame.style.width=w+'px';frame.style.height=h+'px';frame.style.transform='scale('+scale+')';draw();
}
function assets(select,imagesOnly=false){
  select.replaceChildren(new Option(imagesOnly?'Исходный портрет':'Без дополнительного изображения',''));
  for(const f of data.media)if(!imagesOnly||f.mime.startsWith('image'))select.add(new Option(f.caption,f.id));
}
function section(){
  const group=$('section').value;
  $('fields').replaceChildren();
  const query=$('textSearch').value.trim().toLocaleLowerCase('ru');
  for(const f of fields){
    const value=model.texts[f.key]??f.original;
    if(query ? !(value+' '+f.original).toLocaleLowerCase('ru').includes(query) : f.group!==group)continue;
    const label=(query?names[f.group]+' · ':'')+(f.attribute==='placeholder'?'Подсказка поля · ':'')+f.original.trim().slice(0,80);
    input($('fields'),label,value,v=>{model.texts[f.key]=v;setField(f,v);if(!f.node)draw();},'textarea');
  }
  if(group==='programs')for(const link of doc.querySelectorAll('.card [data-service]')){
    const k=link.dataset.service;input($('fields'),'Длительность · '+link.closest('.card').querySelector('h3').textContent,model.durations[k]||'',v=>{model.durations[k]=v;draw();});
  }
  $('picture').value=model.pictures[group]?.id||'';
  for(const id of ['up','down','visibility','picture'])$(id).disabled=!model.order.includes(group);
  $('visibility').textContent=model.hidden.includes(group)?'Показать раздел':'Скрыть раздел';
}
function cards(){
  $('cards').replaceChildren();
  for(const c of model.cards){
    for(const [k,label] of Object.entries({title:'Название',description:'Описание',price:'Цена',duration:'Длительность'}))input($('cards'),label,c[k],v=>{c[k]=v;draw();});
    button($('cards'),'Удалить карточку',()=>{model.cards.splice(model.cards.indexOf(c),1);cards();draw();});
  }
}
function library(){
  assets($('logo'),true);$('logo').options[0].text='Текстовый логотип';$('logo').value=model.logo;assets($('picture'));assets($('photo'),true);$('library').replaceChildren();
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
  if(!model.order.length)model.order=Object.keys(names).filter(k=>!['header','footer'].includes(k));
  library();section();cards();$('contacts').replaceChildren();for(const [k,label] of [['email','Email'],['phone','Телефон']])input($('contacts'),label,model.contacts[k]||'',v=>{model.contacts[k]=v;draw();});$('seo').replaceChildren();
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
  doc=frame.contentDocument;fields=bindPage(doc);
  for(const [key,label] of Object.entries(names))$('section').add(new Option(label,key));
  for(const [key,label,min,max] of [['x','X (%)',-100,100],['y','Y (%)',-100,100],['zoom','Масштаб (%)',35,300]]){
    const el=input($('coords'),label,0,v=>{if(v!==''&&Number(v)>=min&&Number(v)<=max){crop()[key]=Number(v);cropPhoto(doc,crop(),true);}},'number');el.id=key;el.min=min;el.max=max;
  }
  panel.hidden=false;reset();note('Редактор готов.');
}
$('device').onchange=()=>{landscape=false;layout();};
action('rotate',()=>{landscape=!landscape;layout();});
$('textSearch').oninput=section;
$('section').onchange=()=>{$('textSearch').value='';section();};
$('preset').onchange=e=>{if(e.target.value){Object.assign(crop(),{zoom:Number(e.target.value),x:0,y:0});draw();}};
$('logo').onchange=e=>{model.logo=e.target.value;draw();};
$('photo').onchange=e=>{crop().image=e.target.value;draw();};
$('picture').onchange=e=>{const f=data.media.find(i=>i.id===e.target.value);if(f)model.pictures[$('section').value]={id:f.id,video:f.mime.startsWith('video'),caption:f.caption};else delete model.pictures[$('section').value];draw();};
for(const [id,delta] of [['up',-1],['down',1]])action(id,()=>{const i=model.order.indexOf($('section').value),j=i+delta;if(j>=0&&j<model.order.length){[model.order[i],model.order[j]]=[model.order[j],model.order[i]];draw();note('Порядок: '+model.order.map(k=>names[k]).join(' · '));}});
action('visibility',()=>{const k=$('section').value;model.hidden=model.hidden.includes(k)?model.hidden.filter(i=>i!==k):[...model.hidden,k];section();draw();});
action('add',()=>{model.cards.push({id:crypto.randomUUID(),title:'Новая программа',description:'',price:'',duration:''});cards();draw();});
action('save',()=>commit());action('publish',()=>commit(true));action('restore',()=>{if($('history').value)return commit(false,Number($('history').value));});
action('cancel',reset);action('reset',()=>{Object.assign(crop(),{x:0,y:0,zoom:100});draw();});
const drag=$('drag');
drag.onpointerdown=e=>{const img=doc.querySelector('.hero-photo img');start={id:e.pointerId,x:e.clientX,y:e.clientY,c:{...crop()},w:img.offsetWidth*scale,h:img.offsetHeight*scale};drag.setPointerCapture(e.pointerId);};
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
