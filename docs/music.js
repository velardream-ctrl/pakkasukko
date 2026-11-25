import {createSleighPlayer} from './sleigh-player.js?v=41';
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
 const player=createSleighPlayer(box,volume,()=>{
   if(!audio.paused){want=false;put('choice','off');audio.pause();}else{want=true;put('choice','on');start();}
 },()=>{want=true;put('choice','on');advance();},value=>{volume=value;put('volume',String(volume));setVolume();});
 document.body.append(box);
 function setVolume(){audio.volume=ctx?1:volume/100;if(gain)gain.gain.value=volume/100;}
 function graph(){if(ctx)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;try{ctx=new C();gain=ctx.createGain();source=ctx.createMediaElementSource(audio);source.connect(gain);gain.connect(ctx.destination);setVolume();}catch{ctx=null;gain=null;}}
 function load(){audio.src='/api/music/'+p.tracks[index].id;}
 function ui(){player.update(!audio.paused&&!audio.ended&&!audio.error,want);}
 let starting=false;
 async function start(){
  if(!want||starting||!audio.paused)return;starting=true;
  try{graph();setVolume();if(ctx){const resume=ctx.resume();resume.catch(()=>{});const attempt=audio.play();await attempt;if(ctx.state!=='running'){audio.pause();}}else await audio.play();}catch{ /* Browser may require a gesture. */ }finally{starting=false;ui();}
 }
 function advance(){index=(index+1)%p.tracks.length;audio.pause();load();if(want)start();}
 load();setVolume();ui();
 audio.addEventListener('play',ui);audio.addEventListener('pause',ui);audio.addEventListener('ended',advance);
 audio.addEventListener('error',ui);
 const gesture=e=>{if(want&&!box.contains(e.target)&&audio.paused)start();};
 document.addEventListener('click',gesture,true);document.addEventListener('keydown',gesture,true);
 if(want)start();
}
mount();