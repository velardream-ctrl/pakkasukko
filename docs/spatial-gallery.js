// Pakkasukko: owner-controlled spatial hero. The ordinary photo and its crop remain available.
const UUID=/^[a-f0-9-]{36}$/;
export const BUILTIN_SPATIAL=Object.freeze({
  id:'winter-original',title:'Дед Мороз в зимнем лесу',
  foregroundId:'builtin-santa',backgroundId:'builtin-panorama',groundId:'builtin-panorama'
});
const BUILTIN_ASSETS={
  'builtin-santa':'./assets/demo-3d-santa.png',
  'builtin-panorama':'./assets/spatial-lab-panorama.png',
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
export function chosenSpatialScene(settings,device){
  return settings.scenes.find(c=>c.id===settings.selected[device])||BUILTIN_SPATIAL;
}
export function matchSpatialFraming(img,frame,figure,appearance){
  if(!img)return;
  frame.style.transform=img.style.transform;
  frame.style.transformOrigin=appearance.transformOrigin;
  figure.style.backgroundPosition=appearance.objectPosition;
}
export function spatialSnowMask(level){
  const n=clamp(Number(level)||72,62,85);
  return 'linear-gradient(to bottom,#000 0%,#000 '+n+'%,#000c '+(n+5)+'%,#0005 '+(n+10)+'%,transparent '+(n+15)+'%)';
}
export function mountSpatialPhoto({model,currentDevice}){
  const photo=document.querySelector('#top .hero-photo');
  if(!photo)return {refresh(){}};
  const settings=spatialSettings(model);
  const stage=document.createElement('div');stage.className='pk-space-scene';stage.hidden=true;
  const frame=document.createElement('div');frame.className='pk-space-frame';
  const base=document.createElement('div'),moving=document.createElement('div');
  const shadow=document.createElement('div'),figure=document.createElement('div');
  base.className='pk-space-bg pk-space-base';moving.className='pk-space-bg pk-space-moving';
  shadow.className='pk-space-shadow';figure.className='pk-space-figure';
  frame.append(base,moving,shadow,figure);stage.append(frame);
  const hint=document.createElement('div');hint.className='pk-space-tilt-hint';hint.hidden=true;stage.append(hint);
  stage.setAttribute('aria-label','Пространственное фото: движение пальцем или наклоном телефона');
  photo.append(stage);
  let active=false,currentId='',request=0,last=0,frameId=0,enabledDevice='',currentMotion='auto';
  let x=0,y=0,targetX=0,targetY=0,pointer=null,dragged=false,autoBlockedUntil=0;
  let sensorActive=false,sensorSamples=0,neutral=null,gravityNeutral=null,lastOrientationAt=0,sensorStartedAt=0;
  const strength=settings.strength/100;
  const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  function preload(src){
    return new Promise(resolve=>{
      const image=new Image();
      image.onload=()=>resolve(image.naturalWidth>0);
      image.onerror=()=>resolve(false);image.src=src;
    });
  }
  function updateTiltHint(){
    hint.hidden=!(active&&currentMotion==='tilt'&&sensorSamples===0);
    if(!hint.hidden)hint.textContent=!sensorActive?'Коснитесь фото, чтобы включить наклон телефона':
      performance.now()-sensorStartedAt<1600?'Проверяем датчик телефона…':
      'Датчик не отвечает. Попробуйте Safari или движение пальцем.';
  }
  function stopTilt(){
    window.removeEventListener('deviceorientation',onOrientation);
    window.removeEventListener('devicemotion',onMotion);
    sensorActive=false;sensorSamples=0;neutral=null;gravityNeutral=null;lastOrientationAt=0;
    updateTiltHint();
  }
  function listenTilt(){
    if(sensorActive)return;
    sensorActive=true;sensorSamples=0;neutral=null;gravityNeutral=null;lastOrientationAt=0;sensorStartedAt=performance.now();
    window.addEventListener('deviceorientation',onOrientation,{passive:true});
    window.addEventListener('devicemotion',onMotion,{passive:true});
    updateTiltHint();
    setTimeout(()=>{if(active&&currentMotion==='tilt')updateTiltHint();},1700);
  }
  function startUnrestrictedTilt(){
    if(!active||currentMotion!=='tilt'||sensorActive)return;
    const orient=window.DeviceOrientationEvent,motion=window.DeviceMotionEvent;
    if(typeof orient?.requestPermission==='function'||typeof motion?.requestPermission==='function')return;
    if(typeof orient==='undefined'&&typeof motion==='undefined')return;
    listenTilt();
  }
  function onOrientation(ev){
    if(!active||!sensorActive||currentMotion!=='tilt'||pointer||ev.gamma==null||ev.beta==null)return;
    if(!neutral)neutral={gamma:ev.gamma,beta:ev.beta};
    targetX=clamp((ev.gamma-neutral.gamma)/17,-1,1);
    targetY=clamp((ev.beta-neutral.beta)/23,-1,1);
    sensorSamples++;lastOrientationAt=performance.now();if(sensorSamples===1)updateTiltHint();
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
    sensorSamples++;if(sensorSamples===1)updateTiltHint();
  }
  function ordinary(){
    active=false;stage.hidden=true;photo.classList.remove('pk-space-active');stopTilt();
    if(frameId){cancelAnimationFrame(frameId);frameId=0;}
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
    stage.style.setProperty('--pk-space-bg-size',settings.backgroundZoom[device]+'%');
    stage.style.setProperty('--pk-space-bg-focus',settings.backgroundFocus[device]+'%');
    if(builtin){
      const mask=spatialSnowMask(settings.snowLevel[device]);
      moving.style.webkitMaskImage=mask;moving.style.maskImage=mask;
    }else{moving.style.webkitMaskImage='';moving.style.maskImage='';}
    if(!settings.enabled||settings.modes[device]!=='spatial'){ordinary();return;}
    if(currentMotion!=='tilt'&&sensorActive)stopTilt();
    if(active&&currentId===chosen.id){startUnrestrictedTilt();updateTiltHint();return;}
    const fg=spatialAsset(chosen.foregroundId),bg=spatialAsset(chosen.backgroundId),ground=spatialAsset(chosen.groundId)||bg;
    if(!fg||!bg){ordinary();return;}
    const ticket=++request;
    Promise.all([preload(fg),preload(bg),ground===bg?Promise.resolve(true):preload(ground)]).then(ok=>{
      if(ticket!==request||!ok.every(Boolean)||!settings.enabled||settings.modes[currentDevice()]!=='spatial'){
        if(ticket===request)ordinary();return;
      }
      base.style.backgroundImage='url("'+ground+'")';
      moving.style.backgroundImage='url("'+bg+'")';
      figure.style.backgroundImage='url("'+fg+'")';
      stage.hidden=false;photo.classList.add('pk-space-active');
      active=true;currentId=chosen.id;
      startUnrestrictedTilt();updateTiltHint();
      if(!frameId)frameId=requestAnimationFrame(tick);
    }).catch(()=>{if(ticket===request)ordinary();});
  }
  function tick(now){
    const dt=Math.min(65,now-last||16);last=now;
    if(active){
      const builtin=stage.classList.contains('pk-space-lab-scene');
      if(currentMotion==='auto'&&!sensorActive&&!pointer&&!reduce&&now>autoBlockedUntil){
        targetX=Math.sin(now*(builtin ? 0.00045 : 0.00034))*(builtin ? 0.72 : 0.52);
        targetY=Math.cos(now*(builtin ? 0.00037 : 0.00027))*(builtin ? 0.44 : 0.35);
      }
      const ease=1-Math.exp(-dt/(builtin?82:120));
      x+=(targetX-x)*ease;y+=(targetY-y)*ease;
      const W=stage.clientWidth,H=stage.clientHeight;
      const px=Math.min(W*(builtin ? 0.105 : 0.14),builtin?46:105)*strength;
      const py=Math.min(H*(builtin ? 0.038 : 0.055),builtin?24:31)*strength;
      const set=(k,v)=>stage.style.setProperty(k,v);
      set('--pk-space-x',(-x*px).toFixed(2)+'px');
      set('--pk-space-y',(-y*py*(builtin?1:.65)).toFixed(2)+'px');
      set('--pk-space-bg-yaw',(-x*(builtin?2.35:3.9)*strength).toFixed(2)+'deg');
      set('--pk-space-bg-pitch',(y*(builtin?1.45:2.5)*strength).toFixed(2)+'deg');
    }
    frameId=active?requestAnimationFrame(tick):0;
  }
  stage.addEventListener('pointerdown',ev=>{
    if(!active||ev.pointerType==='mouse'&&ev.button!==0)return;
    pointer={id:ev.pointerId,startX:ev.clientX,startY:ev.clientY,baseX:targetX,baseY:targetY};
    dragged=false;autoBlockedUntil=performance.now()+8000;
    stage.setPointerCapture?.(ev.pointerId);
  });
  stage.addEventListener('pointermove',ev=>{
    if(!pointer||pointer.id!==ev.pointerId||!active)return;
    const dx=ev.clientX-pointer.startX,dy=ev.clientY-pointer.startY;
    if(Math.abs(dx)>5||Math.abs(dy)>5)dragged=true;
    const builtin=stage.classList.contains('pk-space-lab-scene');
    targetX=clamp(pointer.baseX+dx/Math.max(builtin?115:140,stage.clientWidth*(builtin ? 0.29 : 0.38)),-1,1);
    targetY=clamp(pointer.baseY+dy/Math.max(builtin?150:180,stage.clientHeight*(builtin ? 0.40 : 0.48)),-1,1);
  });
  function endPointer(ev){if(pointer?.id===ev.pointerId){pointer=null;autoBlockedUntil=performance.now()+4500;}}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,endPointer);
  stage.addEventListener('click',async()=>{
    if(!active||currentMotion!=='tilt'||dragged||sensorActive)return;
    const tasks=[];
    for(const sensor of [window.DeviceOrientationEvent,window.DeviceMotionEvent]){
      if(typeof sensor?.requestPermission==='function')try{tasks.push(sensor.requestPermission());}catch{}
    }
    if(tasks.length){
      const results=await Promise.allSettled(tasks);
      if(!results.some(v=>v.status==='fulfilled'&&v.value==='granted')){
        hint.hidden=false;hint.textContent='Датчик недоступен. Откройте страницу в Safari или двигайте пальцем.';return;
      }
    }
    if(window.DeviceOrientationEvent||window.DeviceMotionEvent)listenTilt();
    else{hint.hidden=false;hint.textContent='Датчик не поддерживается. Используйте движение пальцем.';}
  });
  window.addEventListener('pagehide',stopTilt);
  document.addEventListener('pakkasukko:layout',refresh);
  refresh();return {refresh};
}
