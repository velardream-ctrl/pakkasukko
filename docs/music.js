// No audio request until playback is attempted. Owner controls the sequence.
async function mount(){
 if(location.hostname.endsWith('github.io'))return;
 let p;try{const r=await fetch('/api/music/config',{cache:'no-store'});if(!r.ok)return;p=await r.json();}catch{return;}
 if(!p.enabled||!p.tracks.length)return;
 const get=k=>{try{return sessionStorage.getItem('pk-music-'+k);}catch{return null;}};
 const put=(k,v)=>{try{sessionStorage.setItem('pk-music-'+k,v);}catch{}};
 let index=0,volume=p.volume,want=get('choice')==='off'?false:get('choice')==='on'||p.autoplay;
 const remembered=get('volume');if(remembered!==null&&Number.isFinite(Number(remembered)))volume=Math.max(0,Math.min(100,Number(remembered)));
 let audio=new Audio(),ctx,gain,source;audio.preload='none';
 const box=document.createElement('div');box.className='pk-music';box.setAttribute('role','group');box.setAttribute('aria-label','Музыка зимней сказки');
 const style=document.createElement('style');style.textContent='.pk-music{position:fixed;z-index:900;bottom:max(12px,env(safe-area-inset-bottom));right:12px;display:flex;align-items:center;gap:6px;max-width:calc(100vw - 24px);padding:6px;border-radius:24px;background:#102531;color:#f5eddb;box-shadow:0 3px 16px #0004;font:13px system-ui}.pk-music button{border:0;border-radius:20px;background:#e7c889;color:#102531;font:inherit;min-width:36px;min-height:36px;padding:6px 10px;cursor:pointer}.pk-music input{width:72px;accent-color:#e7c889}.pk-music span{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}@media(max-width:450px){.pk-music span{max-width:85px}}';document.head.append(style);
 const button=(label,txt)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label',label);b.textContent=txt;box.append(b);return b;};
 const play=button('Включить музыку','♫'),next=button('Следующая композиция','»'),name=document.createElement('span');box.append(name);
 const slider=document.createElement('input');Object.assign(slider,{type:'range',min:0,max:100,value:volume});slider.setAttribute('aria-label','Громкость музыки');box.append(slider);document.body.append(box);
 function setVolume(){audio.volume=ctx?1:volume/100;if(gain)gain.gain.value=volume/100;}
 function graph(){if(ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{ctx=new C();gain=ctx.createGain();source=ctx.createMediaElementSource(audio);source.connect(gain);gain.connect(ctx.destination);setVolume();}catch{ctx=null;gain=null;}}
 function load(){audio.src='/api/music/'+p.tracks[index].id;name.textContent=p.tracks[index].title;name.title=name.textContent;}
 function ui(){play.textContent=audio.paused?'♫':'Ⅱ';play.setAttribute('aria-label',audio.paused?'Включить музыку':'Выключить музыку');}
 let starting=false;
 async function start(){
  if(!want||starting||!audio.paused)return;starting=true;
  try{graph();setVolume();if(ctx){const resume=ctx.resume();resume.catch(()=>{});const attempt=audio.play();await attempt;if(ctx.state!=='running'){audio.pause();}}else await audio.play();}catch{ /* Browser may require a gesture. */ }finally{starting=false;ui();}
 }
 function advance(){index=(index+1)%p.tracks.length;audio.pause();load();if(want)start();}
 load();setVolume();
 audio.addEventListener('play',ui);audio.addEventListener('pause',ui);audio.addEventListener('ended',advance);
 audio.addEventListener('error',()=>{name.textContent='Музыка недоступна';ui();});
 play.onclick=()=>{if(!audio.paused){want=false;put('choice','off');audio.pause();}else{want=true;put('choice','on');start();}};
 next.onclick=()=>{want=true;put('choice','on');advance();};
 slider.oninput=()=>{volume=Number(slider.value);put('volume',String(volume));setVolume();};
 const gesture=e=>{if(want&&!box.contains(e.target)&&audio.paused)start();};
 document.addEventListener('click',gesture,true);document.addEventListener('keydown',gesture,true);
 if(want)start();
}
mount();