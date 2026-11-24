export async function musicAdmin(box,request){
 const url='/api/admin/music/',p=await request(url+'config');box.replaceChildren();
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const status=el('p');status.setAttribute('role','status');
 const label=(text,node)=>{const l=el('label',text);l.append(node);box.append(l);return node;};
 const enabled=label('Музыкальное сопровождение',el('input'));enabled.type='checkbox';enabled.checked=p.enabled;
 const autoplay=label('Запускать автоматически тихо, если браузер разрешает',el('input'));autoplay.type='checkbox';autoplay.checked=p.autoplay;
 const vol=label('Начальная громкость, %',el('input'));Object.assign(vol,{type:'range',min:0,max:100,value:p.volume});const val=el('p',vol.value+'%');box.append(val);vol.oninput=()=>val.textContent=vol.value+'%';
 box.append(el('p','Первая композиция в списке играет первой. После последней снова звучит первая.'));
 const list=el('div');box.append(list);let tracks=p.tracks.map(t=>({...t}));let dirty=false,busy=false;
 const button=(parent,title,fn)=>{const b=el('button',title);b.type='button';b.onclick=fn;parent.append(b);return b;};
 function change(){dirty=true;}
 enabled.onchange=autoplay.onchange=change;vol.addEventListener('input',change);
 function draw(){list.replaceChildren();if(!tracks.length)list.append(el('p','Загрузите MP3, чтобы включить музыку.'));
  tracks.forEach((t,i)=>{const row=el('div');row.className='record';row.append(el('strong',(i+1)+'. '+(i===0?'Начальная композиция':'')));
   const title=el('input');title.value=t.title;title.maxLength=150;title.setAttribute('aria-label','Название композиции');title.oninput=()=>{t.title=title.value;change();};row.append(title);
   const actions=el('div');actions.className='admin-actions';row.append(actions);
   const move=(j)=>{[tracks[i],tracks[j]]=[tracks[j],tracks[i]];change();draw();};
   button(actions,'↑',()=>move(i-1)).disabled=i===0;button(actions,'↓',()=>move(i+1)).disabled=i===tracks.length-1;
   button(actions,'Первой',()=>{tracks.splice(i,1);tracks.unshift(t);change();draw();}).disabled=i===0;
   button(actions,'Убрать',()=>{if(confirm('Убрать из плейлиста?')){tracks.splice(i,1);change();draw();}});
   const audio=el('audio');audio.controls=true;audio.preload='none';audio.src=url+t.id;audio.style.width='100%';row.append(audio);list.append(row);
  });
 }
 draw();
 const files=label('Добавить MP3 (можно несколько)',el('input'));files.type='file';files.accept='.mp3,audio/mpeg';files.multiple=true;
 const persist=async()=>{const result=await request(url+'config','POST',{enabled:enabled.checked,autoplay:autoplay.checked,volume:Number(vol.value),tracks});tracks=result.tracks;dirty=false;return result;};
 button(box,'Загрузить выбранные файлы',async()=>{if(busy||!files.files.length)return;busy=true;try{if(dirty)await persist();for(const file of files.files){status.textContent='Загрузка: '+file.name;const fd=new FormData();fd.append('file',file);const r=await fetch(url+'upload',{method:'POST',body:fd,credentials:'same-origin'});const data=await r.json();if(!r.ok)throw Error(data.error||'Ошибка загрузки');tracks=data.tracks;draw();}files.value='';status.textContent='Музыка добавлена.';}catch(e){status.textContent=e.message;}finally{busy=false;}});
 button(box,'Сохранить настройки и порядок',async()=>{if(busy)return;busy=true;try{await persist();draw();status.textContent='Настройки сохранены.';}catch(e){status.textContent=e.message;}finally{busy=false;}});box.append(status);
}