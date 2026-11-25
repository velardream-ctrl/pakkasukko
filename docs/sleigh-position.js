// Keep the lower-right anchor stable when the controls expand or collapse.
const clamp=(v,min,max)=>Math.min(Math.max(v,min),Math.max(min,max));
export function fitPlayer(anchor,viewport,size,pad=12){
 const {left,top,width,height}=viewport;
 const x=clamp(anchor.x,left+pad+size.width,left+width-pad);
 const y=clamp(anchor.y,top+pad+size.height,top+height-pad);
 // If the visual viewport is extremely small, prioritize keeping the handle accessible.
 return {left:width<size.width+2*pad?left+Math.max(0,(width-size.width)/2):x-size.width,
 top:height<size.height+2*pad?top: y-size.height};
}
export function anchorFromRatio(ratio,v){
 return {x:v.left+ratio.x*v.width,y:v.top+ratio.y*v.height};
}
export function ratioFromAnchor(anchor,v){
 return {x:clamp((anchor.x-v.left)/Math.max(1,v.width),0,1),y:clamp((anchor.y-v.top)/Math.max(1,v.height),0,1)};
}
export function validRatio(r){return r&&Number.isFinite(r.x)&&Number.isFinite(r.y)&&r.x>=0&&r.x<=1&&r.y>=0&&r.y<=1;}
export function isDrag(dx,dy){return Math.hypot(dx,dy)>=7;}
export function attachPlayerPosition(box,handle,onDragStart,onDragEnd){
 const key='pk-music-position-v1';
 let ratio=null,drag=null,skipClick=false;
 try{const stored=JSON.parse(localStorage.getItem(key)||'null');if(validRatio(stored))ratio=stored;}catch{}
 function viewport(){
  const v=window.visualViewport;
  return {left:v?.offsetLeft||0,top:v?.offsetTop||0,width:v?.width||document.documentElement.clientWidth||window.innerWidth,height:v?.height||document.documentElement.clientHeight||window.innerHeight};
 }
 function remember(){try{localStorage.setItem(key,JSON.stringify(ratio));}catch{}}
 function place(anchor,v=viewport()){
  if(!box.isConnected)return;
  const size={width:box.offsetWidth,height:box.offsetHeight};
  const pos=fitPlayer(anchor,v,size);
  Object.assign(box.style,{right:'auto',bottom:'auto',left:pos.left+'px',top:pos.top+'px'});
 }
 function layout(){if(drag?.moved)return;const v=viewport();if(ratio)place(anchorFromRatio(ratio,v),v);else{Object.assign(box.style,{left:'auto',top:'auto',right:'12px',bottom:'max(12px, env(safe-area-inset-bottom))'});if(box.isConnected){const r=box.getBoundingClientRect();if(r.left<v.left+12||r.right>v.left+v.width-12||r.top<v.top+12||r.bottom>v.top+v.height-12)place({x:v.left+v.width-12,y:v.top+v.height-12},v);}}}
 handle.addEventListener('pointerdown',e=>{
  if(drag||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return;
  skipClick=false;
  const r=box.getBoundingClientRect();
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,right:r.right,bottom:r.bottom,moved:false};
  try{handle.setPointerCapture(e.pointerId);}catch{}
 });
 function move(e){
  if(!drag||drag.id!==e.pointerId)return;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&!isDrag(dx,dy))return;
  if(!drag.moved){drag.moved=true;skipClick=true;box.classList.add('is-dragging');onDragStart?.();}
  if(e.cancelable)e.preventDefault();
  place({x:drag.right+dx,y:drag.bottom+dy});
 }
 function finish(e){
  if(!drag||drag.id!==e.pointerId)return;
  const moved=drag.moved;drag=null;
  try{if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);}catch{}
  if(moved){
   const r=box.getBoundingClientRect();ratio=ratioFromAnchor({x:r.right,y:r.bottom},viewport());remember();
   box.classList.remove('is-dragging');onDragEnd?.();
  }
 }
 handle.addEventListener('pointermove',move);
 handle.addEventListener('pointerup',finish);
 handle.addEventListener('pointercancel',finish);
 handle.addEventListener('lostpointercapture',finish);
 // A drag can generate a synthetic click on pointerup; suppress it, not keyboard activation.
 handle.addEventListener('click',e=>{if(skipClick&&e.detail!==0){skipClick=false;e.preventDefault();e.stopImmediatePropagation();}else skipClick=false;},true);
 handle.addEventListener('keydown',e=>{
  const offsets={ArrowLeft:[-24,0],ArrowRight:[24,0],ArrowUp:[0,-24],ArrowDown:[0,24]};
  if(e.key==='Home'){e.preventDefault();ratio=null;try{localStorage.removeItem(key);}catch{}layout();return;}
  const delta=offsets[e.key];if(!delta)return;
  e.preventDefault();const r=box.getBoundingClientRect();place({x:r.right+delta[0],y:r.bottom+delta[1]});
  const next=box.getBoundingClientRect();ratio=ratioFromAnchor({x:next.right,y:next.bottom},viewport());remember();onDragEnd?.();
 });
 handle.title='Нажмите для управления музыкой или перетащите упряжку';
 handle.setAttribute('aria-description','Перетащите пальцем или мышью. Стрелки перемещают плеер, Home возвращает в нижний правый угол.');
 window.addEventListener('resize',layout);
 window.visualViewport?.addEventListener('resize',layout);
 window.visualViewport?.addEventListener('scroll',layout);
 return {layout};
}
