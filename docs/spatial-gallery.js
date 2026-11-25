// Pakkasukko: owner-controlled spatial hero. The ordinary photo and its crop remain available.
const UUID=/^[a-f0-9-]{36}$/;
export const BUILTIN_SPATIAL=Object.freeze({
  id:'winter-original',title:'Дед Мороз в зимнем лесу',
  foregroundId:'builtin-santa',backgroundId:'builtin-panorama',groundId:'builtin-panorama'
});
const BUILTIN_ASSETS={
  'builtin-santa':'./assets/demo-3d-santa.webp',
  'builtin-panorama':'./assets/spatial-lab-panorama.webp',
  'builtin-original':'./assets/pakkasukko-ded-moroz.webp'
};
export const SPATIAL_DEVICES=['phone','tablet','desktop'];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
function deviceValue(data,device,a,b,fallback){
  if(data?.[device]===undefined)return fallback;
  const n=Number(data[device]);return Number.isFinite(n)?Math.round(clamp(n,a,b)):fallback;
}
export function spatialSettings(model){
  const s=model?.spatial||{};
  const scenes=(Array.isArray(s.scenes)?s.scenes:[])
    .filter(c=>c&&UUID.test(c.id)&&UUID.test(c.foregroundId)&&UUID.test(c.backgroundId)).slice(0,30);
  return {
    enabled:s.enabled!==false,
    modes:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,s.modes?.[d]==='spatial'?'spatial':'photo'])),
    motions:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,['manual','auto','tilt'].includes(s.motions?.[d])?s.motions[d]:'auto'])),
    selected:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,String(s.selected?.[d]||BUILTIN_SPATIAL.id)])),
    backgroundZoom:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,deviceValue(s.backgroundZoom,d,95,135,100)])),
    backgroundFocus:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,deviceValue(s.backgroundFocus,d,32,54,42)])),
    snowLevel:Object.fromEntries(SPATIAL_DEVICES.map(d=>[d,deviceValue(s.snowLevel,d,62,85,72)])),
    scenes:[BUILTIN_SPATIAL,...scenes],
    strength:clamp(Number(s.strength??84)||0,0,100)
  };
}
export function spatialAsset(id,editing=false){
  if(BUILTIN_ASSETS[id])return BUILTIN_ASSETS[id];
  if(UUID.test(String(id||'')))return '/api/'+(editing?'admin/':'')+'media/'+id;
  return '';
}
// GitHub-only previews retain the original PNG; the deployed site uses a lighter WebP.
export function spatialFallbackAsset(src){
  return /\/(?:spatial-lab-panorama|demo-3d-santa)\.webp$/.test(src)?src.replace(/\.webp$/,'.png'):'';
}
export function chosenSpatialScene(settings,device){
  return settings.scenes.find(c=>c.id===settings.selected[device])||BUILTIN_SPATIAL;
}
export function matchSpatialFraming(img,frame,figure,appearance){
  if(!img)return;
  frame.style.transform=img.style.transform;
  frame.style.transformOrigin=appearance.transformOrigin;
  figure.style.backgroundPosition=appearance.objectPosition;
}
// Update only the profile currently being previewed; other devices remain untouched.
export function patchSpatialSettings(model,device,field,value){
  if(!SPATIAL_DEVICES.includes(device)||!['selected','motions','backgroundZoom','backgroundFocus','snowLevel','strength'].includes(field))return false;
  model.spatial??={};
  if(field==='strength')model.spatial.strength=value;
  else{model.spatial[field]??={};model.spatial[field][device]=value;}
  return true;
}
export function spatialSnowMask(level){
  const n=clamp(Number(level)||72,62,85);
  return 'linear-gradient(to bottom,#000 0%,#000 '+n+'%,#000c '+(n+5)+'%,#0005 '+(n+10)+'%,transparent '+(n+15)+'%)';
}
export function mountSpatialPhoto({model,currentDevice}){
  const photo=document.querySelector('#top .hero-photo');
  if(!photo)return {refresh(){}};
  let settings=spatialSettings(model);
  const stage=document.createElement('div');stage.className='pk-space-scene';stage.hidden=true;
  const frame=document.createElement('div');frame.className='pk-space-frame';
  const base=document.createElement('div'),moving=document.createElement('div');
  const shadow=document.createElement('div'),figure=document.createElement('div');
  base.className='pk-space-bg pk-space-base';moving.className='pk-space-bg pk-space-moving';
  shadow.className='pk-space-shadow';figure.className='pk-space-figure';
  frame.append(base,moving,shadow,figure);stage.append(frame);
  stage.setAttribute('aria-label','Пространственное фото: движение пальцем или наклоном телефона');
  photo.append(stage);
  let active=false,currentId='',request=0,last=0,frameId=0,enabledDevice='',currentMotion='auto',motionStartedAt=0;
  let stageWidth=0,stageHeight=0,lastSensorAt=0,sensorTimer=0;const previousCss={};
  let x=0,y=0,targetX=0,targetY=0,pointer=null,autoBlockedUntil=0;
  let sensorActive=false,sensorSamples=0,neutral=null,gravityNeutral=null,lastOrientationAt=0;
  let strength=settings.strength/100;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  function preload(src){
    // Prepare the full image before revealing animated CSS background layers.
    // Without decode(), mobile Safari may decode the foreground on the first moving frame.
    return new Promise(resolve=>{
      const image=new Image();
      image.decoding='async';
      image.onload=()=>{
        if(typeof image.decode==='function'){
          image.decode().then(()=>resolve(image.naturalWidth>0),()=>resolve(image.naturalWidth>0));
        }else resolve(image.naturalWidth>0);
      };
      image.onerror=()=>resolve(false);
      image.src=src;
    });
  }
  function stopTilt(){
    clearTimeout(sensorTimer);sensorTimer=0;
    window.removeEventListener('deviceorientation',onOrientation);
    window.removeEventListener('devicemotion',onMotion);
    sensorActive=false;sensorSamples=0;neutral=null;gravityNeutral=null;lastOrientationAt=0;lastSensorAt=0;
  }
  function fallbackToAuto(){
    if(!active||currentMotion!=='tilt')return;
    // This visit falls back; the owner's saved motion preference is unchanged.
    currentMotion='auto';stage.style.touchAction='pan-y';stopTilt();
    autoBlockedUntil=0;
  }
  function listenTilt(){
    if(sensorActive)return;
    sensorActive=true;sensorSamples=0;neutral=null;gravityNeutral=null;lastOrientationAt=0;
    window.addEventListener('deviceorientation',onOrientation,{passive:true});
    window.addEventListener('devicemotion',onMotion,{passive:true});
    sensorTimer=setTimeout(()=>{if(active&&currentMotion==='tilt'&&sensorSamples===0)fallbackToAuto();},3400);
  }
  function startUnrestrictedTilt(){
    if(!active||currentMotion!=='tilt'||sensorActive)return;
    const orient=window.DeviceOrientationEvent,motion=window.DeviceMotionEvent;
    // Listen silently: use the sensor where the browser already permits it.
    // If the browser requires a gesture, auto-motion takes over without prompting.
    if(typeof orient==='undefined'&&typeof motion==='undefined'){fallbackToAuto();return;}
    listenTilt();
  }
  function onOrientation(ev){
    if(!active||!sensorActive||currentMotion!=='tilt'||pointer||ev.gamma==null||ev.beta==null)return;
    if(!neutral)neutral={gamma:ev.gamma,beta:ev.beta};
    targetX=clamp((ev.gamma-neutral.gamma)/17,-1,1);
    targetY=clamp((ev.beta-neutral.beta)/23,-1,1);
    sensorSamples++;lastSensorAt=lastOrientationAt=performance.now();
  }
  function onMotion(ev){
    if(!active||!sensorActive||currentMotion!=='tilt'||pointer||performance.now()-lastOrientationAt<1200)return;
    const g=ev.accelerationIncludingGravity;
    if(!g||!Number.isFinite(g.x)||!Number.isFinite(g.y)||!Number.isFinite(g.z))return;
    const gx=Math.atan2(g.x,Math.abs(g.z)+1)*180/Math.PI;
    const gy=Math.atan2(g.y,Math.abs(g.z)+1)*180/Math.PI;
    if(!gravityNeutral)gravityNeutral={x:gx,y:gy};
    targetX=clamp((gx-gravityNeutral.x)/17,-1,1);
    targetY=clamp((gy-gravityNeutral.y)/23,-1,1);
    sensorSamples++;lastSensorAt=performance.now();
  }
  function ordinary(){
    active=false;stage.hidden=true;photo.setAttribute('role','img');photo.classList.remove('pk-space-active');photo.parentElement?.classList.remove('pk-space-hero-active');stopTilt();
    if(frameId){cancelAnimationFrame(frameId);frameId=0;}
  }
  function applyTuning(device,builtin){
    stage.style.setProperty('--pk-space-bg-size',settings.backgroundZoom[device]+'%');
    stage.style.setProperty('--pk-space-bg-focus',settings.backgroundFocus[device]+'%');
    if(builtin){
      const mask=spatialSnowMask(settings.snowLevel[device]);
      moving.style.webkitMaskImage=mask;moving.style.maskImage=mask;
    }else{moving.style.webkitMaskImage='';moving.style.maskImage='';}
  }
  function refresh(){
    const device=currentDevice(),chosen=chosenSpatialScene(settings,device);
    if(enabledDevice!==device){stopTilt();targetX=targetY=x=y=0;}
    enabledDevice=device;currentMotion=settings.motions[device];
    stage.style.touchAction=currentMotion==='manual'?'none':'pan-y';
    const img=photo.querySelector('img');
    if(img)matchSpatialFraming(img,frame,figure,getComputedStyle(img));
    const builtin=chosen.id===BUILTIN_SPATIAL.id;
    stage.classList.toggle('pk-space-lab-scene',builtin);
    applyTuning(device,builtin);
    if(!settings.enabled||settings.modes[device]!=='spatial'){ordinary();return;}
    if(currentMotion!=='tilt'&&sensorActive)stopTilt();
    if(active&&currentId===chosen.id){startUnrestrictedTilt();return;}
    const fg=spatialAsset(chosen.foregroundId),bg=spatialAsset(chosen.backgroundId),ground=spatialAsset(chosen.groundId)||bg;
    if(!fg||!bg){ordinary();return;}
    const load=async src=>{
      if(await preload(src))return src;
      const fallback=spatialFallbackAsset(src);
      return fallback&&await preload(fallback)?fallback:'';
    };
    const ticket=++request,bgPromise=load(bg);
    Promise.all([load(fg),bgPromise,ground===bg?bgPromise:load(ground)]).then(([loadedFg,loadedBg,loadedGround])=>{
      if(ticket!==request||!loadedFg||!loadedBg||!loadedGround||!settings.enabled||settings.modes[currentDevice()]!=='spatial'){
        if(ticket===request)ordinary();return;
      }
      base.style.backgroundImage='url("'+loadedGround+'")';
      moving.style.backgroundImage='url("'+loadedBg+'")';
      figure.style.backgroundImage='url("'+loadedFg+'")';
      stage.hidden=false;photo.setAttribute('role','group');photo.classList.add('pk-space-active');photo.parentElement?.classList.add('pk-space-hero-active');
      active=true;currentId=chosen.id;motionStartedAt=performance.now();last=0;
      stageWidth=stage.clientWidth;stageHeight=stage.clientHeight;
      startUnrestrictedTilt();
      if(!frameId)frameId=requestAnimationFrame(tick);
    }).catch(()=>{if(ticket===request)ordinary();});
  }
  function tick(now){
    frameId=active?requestAnimationFrame(tick):0;
    if(!active||document.hidden)return;
    // Avoid 60 costly masked repaints a second on older iPhones.
    const interval=enabledDevice==='phone'?1000/30:enabledDevice==='tablet'?1000/40:1000/50;
    if(last&&now-last<interval-1)return;
    if(!last)last=now;
    const dt=Math.min(65,now-last||16);last=now;
    const builtin=stage.classList.contains('pk-space-lab-scene');
    if(currentMotion==='tilt'&&sensorActive&&sensorSamples>0&&now-lastSensorAt>3800)fallbackToAuto();
    if((currentMotion==='auto'||currentMotion==='tilt'&&sensorSamples===0)&&!pointer&&!reduce&&now>autoBlockedUntil){
      // Give the newly painted masks and GPU layers time to settle; no first-frame lurch.
      const t=Math.min(1,Math.max(0,(now-motionStartedAt-100)/700));
      const rise=t*t*(3-2*t);
      targetX=Math.sin(now*(builtin ? 0.00062 : 0.00034))*(builtin ? 0.78 : 0.52)*rise;
      targetY=Math.cos(now*(builtin ? 0.00047 : 0.00027))*(builtin ? 0.44 : 0.35)*rise;
    }
    const ease=1-Math.exp(-dt/(builtin?82:120));
    x+=(targetX-x)*ease;y+=(targetY-y)*ease;
    const px=Math.min(stageWidth*(builtin ? 0.105 : 0.14),builtin?46:105)*strength;
    const py=Math.min(stageHeight*(builtin ? 0.038 : 0.055),builtin?24:31)*strength;
    const set=(k,v)=>{if(previousCss[k]!==v){previousCss[k]=v;stage.style.setProperty(k,v);}};
    set('--pk-space-x',(-x*px).toFixed(1)+'px');
    set('--pk-space-y',(-y*py*(builtin?1:.65)).toFixed(1)+'px');
    if(!builtin){
      set('--pk-space-bg-yaw',(-x*3.9*strength).toFixed(2)+'deg');
      set('--pk-space-bg-pitch',(y*2.5*strength).toFixed(2)+'deg');
    }
  }
  stage.addEventListener('pointerdown',ev=>{
    if(!active||ev.pointerType==='mouse'&&ev.button!==0)return;
    pointer={id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,baseX:targetX,baseY:targetY};
    autoBlockedUntil=performance.now()+8000;
    stage.setPointerCapture?.(ev.pointerId);
  });
  stage.addEventListener('pointermove',ev=>{
    if(!pointer||pointer.id!==ev.pointerId||!active)return;
    const dx=ev.clientX-pointer.startX,dy=ev.clientY-pointer.startY;
    const builtin=stage.classList.contains('pk-space-lab-scene');
    targetX=clamp(pointer.baseX+dx/Math.max(builtin?115:140,stage.clientWidth*(builtin ? 0.29 : 0.38)),-1,1);
    targetY=clamp(pointer.baseY+dy/Math.max(builtin?150:180,stage.clientHeight*(builtin ? 0.40 : 0.48)),-1,1);
  });
  function endPointer(ev){if(pointer?.id===ev.pointerId){pointer=null;autoBlockedUntil=performance.now()+4500;}}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,endPointer);
  window.addEventListener('pagehide',stopTilt);
  window.addEventListener('pageshow',()=>{if(active&&currentMotion==='tilt')startUnrestrictedTilt();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTilt();else if(active&&currentMotion==='tilt')startUnrestrictedTilt();});
  document.addEventListener('pakkasukko:layout',()=>{if(active){stageWidth=stage.clientWidth;stageHeight=stage.clientHeight;}refresh();});
  function updateModel(force=false){
    // Keep slider changes instant without recalculating the whole hero crop per input.
    const previous=settings,device=currentDevice();
    settings=spatialSettings(model);
    strength=settings.strength/100;
    if(!force&&active&&enabledDevice===device&&previous.enabled===settings.enabled&&
       previous.modes[device]===settings.modes[device]&&
       previous.motions[device]===settings.motions[device]&&
       previous.selected[device]===settings.selected[device]){
      applyTuning(device,chosenSpatialScene(settings,device).id===BUILTIN_SPATIAL.id);
    }else refresh();
  }
  refresh();return {refresh,updateModel};
}
