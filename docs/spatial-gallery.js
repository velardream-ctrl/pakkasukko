// Pakkasukko: editor-controlled spatial photograph. No public photo/3D switch.
const UUID=/^[a-f0-9-]{36}$/;
export const BUILTIN_SPATIAL=Object.freeze({
  id:'winter-original',title:'Дед Мороз в зимнем лесу',
  foregroundId:'builtin-santa',backgroundId:'builtin-panorama',
  groundId:'builtin-panorama'
});
const BUILTIN_ASSETS={
  'builtin-santa':'./assets/demo-3d-santa.png',
  'builtin-panorama':'./assets/demo-3d-panorama.png'
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
  base.className='pk-space-bg pk-space-base';moving.className='pk-space-bg pk-space-moving';
  shadow.className='pk-space-shadow';figure.className='pk-space-figure';
  // The entire depth composition uses the exact same crop frame as the ordinary hero <img>.
  // Keep the interactive surface fixed while transforming its inner layers together.
  const frame=document.createElement('div');frame.className='pk-space-frame';
  frame.append(base,moving,shadow,figure);stage.append(frame);
  photo.append(stage);
  let active=false,currentId='',request=0,autoBlockedUntil=0,orientation=false,neutral=null,frameId=0;
  let x=0,y=0,targetX=0,targetY=0,last=0,pointer=null,dragged=false,enabledDevice='',currentMotion='auto';
  const strength=settings.strength/100;
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
    if(!fg||!bg){ordinary();return;}
    const ticket=++request;
    Promise.all([preload(fg),preload(bg),ground===bg?Promise.resolve(true):preload(ground)]).then(ok=>{
      if(ticket!==request||!ok.every(Boolean)||!settings.enabled||settings.modes[currentDevice()]!=='spatial'){
        if(ticket===request)ordinary();return;
      }
      moving.style.backgroundImage='url("'+bg+'")';
      base.style.backgroundImage='url("'+ground+'")';
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
      set('--pk-space-x',(-x*px).toFixed(2)+'px');
      set('--pk-space-y',(-y*py*.65).toFixed(2)+'px');
      set('--pk-space-fg',(x*3.2*strength).toFixed(2)+'deg');
      set('--pk-space-fg-yaw',(x*4.5*strength).toFixed(2)+'deg');
      set('--pk-space-fg-pitch',(-y*2.7*strength).toFixed(2)+'deg');
      set('--pk-space-bg-yaw',(-x*5.2*strength).toFixed(2)+'deg');
      set('--pk-space-bg-pitch',(y*3.4*strength).toFixed(2)+'deg');
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
