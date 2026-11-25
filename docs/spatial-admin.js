import {spatialSettings,BUILTIN_SPATIAL,spatialAsset,SPATIAL_DEVICES} from './spatial-gallery.js?v=1';
const $=id=>document.getElementById(id);
const defaults={texts:{},crops:{},pictures:{},seo:{},order:[],hidden:[],cards:[]};
const names={phone:'Телефон',tablet:'Планшет',desktop:'Компьютер'};
let version=0,model={},settings=null,media=[],busy=false;
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
async function request(url,options={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
  const json=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(json.error||'Ошибка HTTP '+r.status);
  return json;
}
function option(value,label){return new Option(label,value);}
function refreshSelect(select,selected){
  select.replaceChildren(option('','Выберите сохранённый файл (если не загружаете новый)'),...media.filter(m=>m.mime?.startsWith('image/')).map(m=>option(m.id,m.caption||m.id)));
  select.value=selected||'';
}
function makePreview(scene){
  const box=document.createElement('article');box.className='scene-item';
  const h=document.createElement('h3');h.textContent=scene.title;
  const img=document.createElement('img');
  img.alt=scene.title;img.loading='lazy';img.src=spatialAsset(scene.foregroundId,true);
  const caption=document.createElement('small');caption.textContent=scene.id===BUILTIN_SPATIAL.id?'Встроенная сцена по твоей фотографии':'Загруженная пространственная сцена';
  box.append(h,img,caption);
  if(scene.id!==BUILTIN_SPATIAL.id){
    const edit=document.createElement('button');edit.className='secondary';edit.type='button';edit.textContent='Переименовать';
    edit.onclick=async()=>{
      const next=prompt('Новое название пространственной сцены',scene.title)?.trim();
      if(!next||next===scene.title)return;
      if(next.length>120){status('Название слишком длинное.',true);return;}
      const old=scene.title;scene.title=next;
      try{await save();}catch(e){scene.title=old;status(e.message,true);}
    };
    const del=document.createElement('button');del.className='danger';del.type='button';del.textContent='Убрать из списка';
    del.onclick=async()=>{
      if(!confirm('Убрать сцену «'+scene.title+'» из списка? Загруженные файлы останутся в хранилище.'))return;
      const previous=settings.scenes.slice(),selected={...settings.selected};
      settings.scenes=settings.scenes.filter(s=>s.id!==scene.id);
      for(const device of SPATIAL_DEVICES)if(settings.selected[device]===scene.id)settings.selected[device]=BUILTIN_SPATIAL.id;
      try{await save();}catch(e){settings.scenes=previous;settings.selected=selected;status(e.message,true);}
    };
    const controls=document.createElement('div');controls.className='form-actions';controls.append(edit,del);box.append(controls);
  }
  return box;
}
function render(){
  $('enabled').checked=settings.enabled;
  $('strength').value=String(settings.strength);
  $('strengthValue').textContent=settings.strength+'%';
  const all=[BUILTIN_SPATIAL,...settings.scenes];
  const profiles=$('profiles');profiles.replaceChildren();
  for(const device of SPATIAL_DEVICES){
    const card=document.createElement('div');card.className='device';
    const title=document.createElement('h3');title.textContent=names[device];
    const modeLabel=document.createElement('label');modeLabel.textContent='Тип фотографии для посетителя';
    const mode=document.createElement('select');mode.dataset.device=device;mode.dataset.kind='mode';
    mode.add(option('photo','Обычная фотография'));mode.add(option('spatial','Пространственная (имитация 3D)'));
    mode.value=settings.modes[device]||'photo';modeLabel.append(mode);
    const sceneLabel=document.createElement('label');sceneLabel.textContent='Пространственная сцена';
    const sceneSel=document.createElement('select');sceneSel.dataset.device=device;sceneSel.dataset.kind='scene';
    for(const scene of all)sceneSel.add(option(scene.id,scene.title));
    sceneSel.value=settings.selected[device]||BUILTIN_SPATIAL.id;
    sceneSel.disabled=mode.value!=='spatial';
    mode.onchange=()=>{sceneSel.disabled=mode.value!=='spatial';};
    sceneLabel.append(sceneSel);card.append(title,modeLabel,sceneLabel);profiles.append(card);
  }
  $('scenes').replaceChildren(...all.map(makePreview));
  for(const suffix of ['foreground','background','ground'])refreshSelect($(suffix+'Existing'));
}
function collect(){
  settings.enabled=$('enabled').checked;
  settings.strength=Number($('strength').value);
  for(const el of $('profiles').querySelectorAll('select')){
    if(el.dataset.kind==='mode')settings.modes[el.dataset.device]=el.value;
    else settings.selected[el.dataset.device]=el.value;
  }
}
async function save(){
  if(busy)throw Error('Подождите завершения предыдущей операции.');
  busy=true;$('saveSettings').disabled=true;$('addScene').disabled=true;
  status('Публикуем настройки на сайте…');
  try{
    model.spatial=structuredClone(settings);
    const result=await request('/api/admin/editor',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:{...defaults,...model},id:version,publish:true})
    });
    version=result.id;
    status('Готово. Настройки опубликованы. Обновите основной сайт для проверки.');
    render();
  }finally{busy=false;$('saveSettings').disabled=false;$('addScene').disabled=false;}
}
async function resolveImage(fileId,existingId,required){
  const file=$(fileId).files[0],id=$(existingId).value;
  if(!file){if(required&&!id)throw Error('Нужно загрузить файл или выбрать его в медиатеке.');return id||'';}
  if(file.size>32*1024*1024)throw Error('Размер одного файла не должен превышать 32 МБ.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Поддерживаются PNG, JPEG и WebP.');
  if(fileId==='foregroundFile'&&!['image/png','image/webp'].includes(file.type))throw Error('Персонаж должен быть PNG или WebP с прозрачностью.');
  const body=new FormData();body.append('original',file,file.name);
  status('Загружаем '+file.name+' в защищённое хранилище…');
  const result=await request('/api/admin/media/upload',{method:'POST',body});
  media.push({id:result.id,mime:file.type,caption:file.name});
  return result.id;
}
$('strength').oninput=()=>{$('strengthValue').textContent=$('strength').value+'%';};
$('saveSettings').onclick=async()=>{try{collect();await save();}catch(e){status(e.message,true);}};
$('newScene').onsubmit=async ev=>{
  ev.preventDefault();
  if(busy)return;
  const title=new FormData(ev.currentTarget).get('title')?.trim();
  if(!title){status('Введите название сцены.',true);return;}
  try{
    collect();
    const foregroundId=await resolveImage('foregroundFile','foregroundExisting',true);
    const backgroundId=await resolveImage('backgroundFile','backgroundExisting',true);
    const groundId=await resolveImage('groundFile','groundExisting',false);
    const scene={id:crypto.randomUUID(),title,foregroundId,backgroundId};
    if(groundId)scene.groundId=groundId;
    settings.scenes.push(scene);
    try{await save();$('newScene').reset();}
    catch(e){settings.scenes=settings.scenes.filter(item=>item.id!==scene.id);throw e;}
  }catch(e){status(e.message,true);}
};
(async()=>{
  try{
    const data=await request('/api/admin/editor');
    version=data.id;model={...defaults,...data.model};media=data.media||[];
    const state=spatialSettings(model);
    settings={enabled:state.enabled,strength:state.strength,modes:state.modes,selected:state.selected,
      scenes:state.scenes.filter(scene=>scene.id!==BUILTIN_SPATIAL.id).map(scene=>({...scene}))};
    $('manager').hidden=false;$('loginHint').hidden=true;render();status('Настройки загружены. Изменения попадут на сайт после нажатия «Сохранить и опубликовать».');
  }catch(e){$('loginHint').hidden=false;status('Нужен вход владельца: '+e.message,true);}
})();
