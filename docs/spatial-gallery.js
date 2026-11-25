// Pakkasukko: editor-controlled spatial photograph. No public photo/3D switch.
const UUID=/^[a-f0-9-]{36}$/;
export const BUILTIN_SPATIAL=Object.freeze({
  id:'winter-original',title:'Дед Мороз в зимнем лесу',
  foregroundId:'builtin-santa',backgroundId:'builtin-panorama',
  groundId:'builtin-panorama'
});
const BUILTIN_ASSETS={
  'builtin-santa':'./assets/demo-3d-santa.png',
  'builtin-panorama':'./assets/demo-3d-panorama.png',
  'builtin-original':'./assets/pakkasukko-ded-moroz.webp'
};
export const SPATIAL_DEVICES=['phone','tablet','desktop'];
export function spatialSettings(model){
  const s=model?.spatial||{};
  const scenes=(Array.isArray(s.scenes)?s.scenes:[])
    .filter(c=>c&&UUID.test(c.id)&&UUID.test(c.foregroundId)&&UUID.test(c.backgroundId))
    .slice(0,30);
  return {
    enabled:s.enabled!==false,
    modes:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,s.modes?.[d]==='spatial'?'spatial':'photo'])),
    motions:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,['manual','auto','tilt'].includes(s.motions?.[d])?s.motions[d]:'auto'])),
    selected:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,String(s.selected?.[d]||BUILTIN_SPATIAL.id)])),
    scenes:[BUILTIN_SPATIAL,...scenes],
    strength:Math.max(0,Math.min(100,Number(s.strength??75)||0))
  };
}
export function spatialAsset(id,editing=false){
  if(BUILTIN_ASSETS[id])return BUILTIN_ASSETS[id];
  if(UUID.test(String(id||'')))return '/api/'+(editing?'admin/':'')+'media/'+id;
  return '';
}
export function chosenSpatialScene(settings,device){
  return settings.scenes.find(c=>c.id===settings.selected[device])||BUILTIN_SPATIAL;
}
// The regular hero <img> is the single source of truth for all saved crop settings.
export function matchSpatialFraming(img,frame,figure,appearance){
  if(!img)return;
  frame.style.transform=img.style.transform;
  frame.style.transformOrigin=appearance.transformOrigin;
  figure.style.backgroundPosition=appearance.objectPosition;
}
export function mountSpatialPhoto({model,currentDevice}){
  const photo=document.querySelector('#top .hero-photo');
  if(!photo)return {refresh(){}};
  const settings=spatialSettings(model);
  const stage=document.createElement('div');
  stage.className='pk-space-scene';
  stage.setAttribute('aria-label','Пространственная зимняя фотография: проведите пальцем или мышью для изменения ракурса');
  stage.hidden=true;
  const base=document.createElement('div'),moving=document.createElement('div');
  const shadow=document.createElement('div'),figure=document.createElement('div');
  const panorama=document.createElement('div');panorama.className='pk-space-panorama';
  const baseSource=document.createElement('div'),movingSource=document.createElement('div');
  baseSource.className='pk-space-restored';movingSource.className='pk-space-restored';
  base.className='pk-space-bg pk-space-base';moving.className='pk-space-bg pk-space-moving';
  base.append(baseSource);moving.append(movingSource);
  shadow.className='pk-space-shadow';figure.className='pk-space-figure';
  // The entire depth composition uses the exact same crop frame as the ordinary hero <img>.
  // Keep the interactive surface fixed while transforming its inner layers together.
  const frame=document.createElement('div');frame.className='pk-space-frame';
  frame.append(panorama,base,moving,shadow,figure);stage.append(frame);
  photo.append(stage);
  let active=false,currentId='',request=0,autoBlockedUntil=0,orientation=false,neutral=null,frameId=0;
  let x=0,y=0,targetX=0,targetY=0,last=0,pointer=null,dragged=false,enabledDevice='',currentMotion='auto';
  const strength=settings.strength/100;
  // Safari and modern browsers can subtract the Santa silhouette from his original photograph.
  const canRestore=!!(window.CSS?.supports?.('mask-composite','exclude')||window.CSS?.supports?.('-webkit-mask-composite','xor'));
  const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
  function preload(src){
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>resolve(image.naturalWidth>0);
      image.onerror=()=>resolve(false);
      image.src=src;
    });
  }
  function ordinary(){
    active=false;stage.hidden=true;photo.classList.remove('pk-space-active');
    if(orientation)window.removeEventListener('deviceorientation',onOrientation);
    orientation=false;neutral=null;
    if(frameId){cancelAnimationFrame(frameId);frameId=0;}
  }
  function startUnrestrictedTilt(){
    const sensor=window.DeviceOrientationEvent;
    if(!active||currentMotion!=='tilt'||orientation||typeof sensor==='undefined'||typeof sensor.requestPermission==='function')return;
    orientation=true;neutral=null;
    window.addEventListener('deviceorientation',onOrientation,{passive:true});
  }
  function refresh(){
    const device=currentDevice(),scene=chosenSpatialScene(settings,device);
    if(enabledDevice!==device){
      if(orientation)window.removeEventListener('deviceorientation',onOrientation);
      orientation=false;neutral=null;targetX=0;targetY=0;
    }
    enabledDevice=device;currentMotion=settings.motions[device];
    stage.style.touchAction=currentMotion==='manual'?'none':'pan-y';
    // The main editor already applies the owner's phone/tablet/desktop crop to this img.
    // Reuse that exact transform, fit and focal point for all three spatial layers.
    const img=photo.querySelector('img');
    if(img)matchSpatialFraming(img,frame,figure,getComputedStyle(img));
    if(!settings.enabled||settings.modes[device]!=='spatial'){ordinary();return;}
    if(currentMotion!=='tilt'&&orientation){
      window.removeEventListener('deviceorientation',onOrientation);orientation=false;neutral=null;
    }
    if(active&&currentId===scene.id){startUnrestrictedTilt();return;}
    const fg=spatialAsset(scene.foregroundId),bg=spatialAsset(scene.backgroundId);
    const ground=spatialAsset(scene.groundId)||bg;
    const original=scene.id===BUILTIN_SPATIAL.id&&canRestore?spatialAsset('builtin-original'):'';
    if(!fg||!bg){ordinary();return;}
    const ticket=++request;
    Promise.all([preload(fg),preload(bg),ground===bg?Promise.resolve(true):preload(ground),original?preload(original):Promise.resolve(true)]).then(ok=>{
      if(ticket!==request||!ok.every(Boolean)||!settings.enabled||settings.modes[currentDevice()]!=='spatial'){
        if(ticket===request)ordinary();return;
      }
      // For the original Santa photo, retain the REAL church and snow at the same
      // pixel positions as the ordinary photograph. The extended panorama only
      // fills space revealed behind the transparent cutout during parallax.
      stage.classList.toggle('pk-space-original-background',Boolean(original));
      moving.style.backgroundImage=original?'none':'url("'+bg+'")';
      base.style.backgroundImage=original?'none':'url("'+ground+'")';
      movingSource.style.backgroundImage=original?'url("'+original+'")':'none';
      baseSource.style.backgroundImage=original?'url("'+original+'")':'none';
      panorama.style.backgroundImage=original?'url("'+bg+'")':'none';
      figure.style.backgroundImage='url("'+fg+'")';
      stage.setAttribute('aria-label',scene.title||'Пространственная зимняя фотография');
      stage.hidden=false;photo.classList.add('pk-space-active');
      active=true;currentId=scene.id;
      startUnrestrictedTilt();
      if(!frameId)frameId=requestAnimationFrame(tick);
    }).catch(()=>{if(ticket===request)ordinary();});
  }
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  function tick(now){
    const dt=Math.min(65,now-last||16);last=now;
    if(active){
      if(currentMotion==='auto'&&!orientation&&!pointer&&!reduce&&now>autoBlockedUntil){
        targetX=Math.sin(now*.00034)*.52;
        targetY=Math.cos(now*.00027)*.35;
      }
      const ease=1-Math.exp(-dt/120);
      x+=(targetX-x)*ease;y+=(targetY-y)*ease;
      const W=stage.clientWidth,H=stage.clientHeight;
      const px=Math.min(W*.14,105)*strength,py=Math.min(H*.055,31)*strength;
      const set=(k,v)=>stage.style.setProperty(k,v);
      // Keep the church close to its photographic position as the viewer turns.
      const backgroundShift=stage.classList.contains('pk-space-original-background')?0.42:1;
      set('--pk-space-x',(-x*px*backgroundShift).toFixed(2)+'px');
      set('--pk-space-y',(-y*py*.65*backgroundShift).toFixed(2)+'px');
      // Santa stays completely still, firmly planted in the snow. Only the scenery moves.
      const rotation=stage.classList.contains('pk-space-original-background')?0.55:0.75;
      set('--pk-space-bg-yaw',(-x*5.2*strength*rotation).toFixed(2)+'deg');
      set('--pk-space-bg-pitch',(y*3.4*strength*rotation).toFixed(2)+'deg');
    }
    frameId=active?requestAnimationFrame(tick):0;
  }
  stage.addEventListener('pointerdown',ev=>{
    if(!active||ev.pointerType==='mouse'&&ev.button!==0)return;
    pointer={id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,baseX:targetX,baseY:targetY};
    dragged=false;
    autoBlockedUntil=performance.now()+9000;
    stage.setPointerCapture?.(ev.pointerId);
  });
  stage.addEventListener('pointermove',ev=>{
    if(!pointer||pointer.id!==ev.pointerId||!active)return;
    const dx=ev.clientX-pointer.startX,dy=ev.clientY-pointer.startY;
    if(Math.abs(dx)>5||Math.abs(dy)>5)dragged=true;
    targetX=clamp(pointer.baseX+dx/Math.max(140,stage.clientWidth*.38),-1,1);
    targetY=clamp(pointer.baseY+dy/Math.max(180,stage.clientHeight*.48),-1,1);
  });
  function endPointer(ev){if(pointer?.id===ev.pointerId){pointer=null;autoBlockedUntil=performance.now()+6500;}}
  stage.addEventListener('pointerup',endPointer);
  stage.addEventListener('pointercancel',endPointer);
  stage.addEventListener('lostpointercapture',endPointer);
  const onOrientation=ev=>{
    if(!active||!orientation||currentMotion!=='tilt'||pointer||ev.gamma===null||ev.beta===null)return;
    if(!neutral)neutral={gamma:ev.gamma,beta:ev.beta};
    targetX=clamp((ev.gamma-neutral.gamma)/19,-1,1);
    targetY=clamp((ev.beta-neutral.beta)/25,-1,1);
  };
  stage.addEventListener('click',async()=>{
    if(!active||currentMotion!=='tilt'||dragged||orientation||typeof window.DeviceOrientationEvent==='undefined')return;
    try{
      const d=window.DeviceOrientationEvent;
      if(typeof d.requestPermission==='function'&&(await d.requestPermission())!=='granted')return;
      orientation=true;neutral=null;
      window.addEventListener('deviceorientation',onOrientation,{passive:true});
    }catch{}
  });
  window.addEventListener('pagehide',()=>{window.removeEventListener('deviceorientation',onOrientation);});
  document.addEventListener('pakkasukko:layout',refresh);
  refresh();
  return {refresh};
}
