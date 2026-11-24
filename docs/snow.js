// One controller per preview document. A resize or a slider change reuses its particles.
export const defaults = Object.freeze({
  enabled:true, intensity:48, size:40, speed:38, wind:20, transparency:32,
  chaos:55, count:62, phone:true, tablet:true, desktop:true, area:'site',
  season:'always', from:'', until:''
});
export const ranges = [
  ['intensity','Интенсивность снегопада',0], ['size','Размер снежинок',1],
  ['speed','Скорость падения',1], ['wind','Сила ветра',0],
  ['transparency','Прозрачность снега',0], ['chaos','Хаотичность движения',0],
  ['count','Количество снежинок',0]
];
export function settings(raw) {
  const s={...defaults,...raw};
  for(const [key,,min] of ranges) {
    const n=Number(s[key]);
    s[key]=Number.isFinite(n)?Math.max(min,Math.min(100,n)):defaults[key];
  }
  return s;
}
const helsinki=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'});
export function inSeason(s,date=new Date()) {
  const day=helsinki.format(date);
  if(s.season==='winter')return ['12','01','02'].includes(day.slice(5,7));
  if(s.season==='period')return Boolean(s.from && s.until && day>=s.from && day<=s.until);
  return true;
}
const controllers=new WeakMap();
export function applySnow(doc,raw,device) {
  const canvas=doc.querySelector('canvas.snow');
  if(!canvas)return;
  let update=controllers.get(canvas);
  if(!update){update=controller(canvas);controllers.set(canvas,update);}
  update(settings(raw),device);
}
function controller(canvas) {
  const doc=canvas.ownerDocument,w=doc.defaultView,ctx=canvas.getContext('2d');
  if(!ctx)return ()=>{};
  const reduce=w.matchMedia('(prefers-reduced-motion: reduce)');
  const randomBuffer=new Uint32Array(256);
  let index=randomBuffer.length;
  function random(){
    if(index===randomBuffer.length){w.crypto.getRandomValues(randomBuffer);index=0;}
    return randomBuffer[index++]/4294967296;
  }
  let s,device,width,height,limit,frame=0,last=0,nextGust=0,gust=0,wind=0,clock=0;
  let cluster=random(),season=true,checkDate;
  const particles=[];
  function spawn(fill){
    const depth=random(),layer=depth<0.59?0.36:depth<0.92?0.7:1.2;
    const x=random()<0.35?(cluster+(random()+random()-1)*0.31+1)%1:random();
    return {x:x*width,y:fill?random()*height:-5,layer,
      radius:layer*(0.65+random()),fall:layer*(23+random()*32),
      phase:random()*Math.PI*2,freq:0.45+random(),drift:random()*2-1,
      alpha:0.29+random()*0.57,age:fill?2:-random()*(100-s.intensity)/16,life:7+random()*32};
  }
  function tick(now){
    frame=0;
    if(last && now-last<1000/(device==='desktop'?50:30)-1){schedule();return;}
    const dt=last?Math.min(0.08,(now-last)/1000):0;
    last=now;clock+=dt;
    if(clock>=nextGust){gust=(random()*2-1)*52;nextGust=clock+2+random()*7;cluster=random();}
    wind+=(gust-wind)*(1-Math.exp(-dt*0.65));
    ctx.clearRect(0,0,width,height);ctx.fillStyle='#fff';
    for(let i=0;i<limit;i++){
      let p=particles[i];
      if(!p)p=particles[i]=spawn(true);
      p.age+=dt;
      if(p.y>height+5 || p.age>=p.life)p=particles[i]=spawn(false);
      if(p.age<0)continue;
      p.phase+=dt*p.freq;
      p.y+=dt*p.fall*(0.25+s.speed/43);
      p.x+=dt*p.layer*(wind*s.wind/100+(p.drift*7+Math.sin(p.phase)*18+Math.sin(p.phase*0.43)*9)*s.chaos/100);
      if(p.x< -5)p.x+=width+10;
      if(p.x>width+5)p.x-=width+10;
      ctx.globalAlpha=(1-s.transparency/100)*p.alpha*Math.min(1,p.age,p.life-p.age);
      ctx.beginPath();ctx.arc(p.x,p.y,p.radius*(0.45+s.size/47),0,2*Math.PI);ctx.fill();
    }
    schedule();
  }
  function schedule(){if(!frame)frame=w.requestAnimationFrame(tick);}
  function refresh(){
    if(!s)return;
    width=w.innerWidth;height=w.innerHeight;
    const hero=doc.getElementById('top');
    const rect=s.area==='hero'&&hero?hero.getBoundingClientRect():null;
    canvas.style.clipPath=rect?'inset('+Math.max(0,rect.top)+'px 0 '+Math.max(0,height-rect.bottom)+'px 0)':'none';
    const low=w.navigator.hardwareConcurrency<=4 || w.navigator.deviceMemory<=4;
    const cap=(device==='phone'?78:device==='tablet'?125:200)*(low?0.62:1);
    limit=Math.ceil(Math.min(cap,width*height/6300)*s.count/100*Math.sqrt(s.intensity/100));
    const visible=limit && s.intensity && width && height && season && s.enabled && s[device] && !reduce.matches && !doc.hidden && s.transparency<100 && (!rect || rect.bottom>0 && rect.top<height);
    canvas.hidden=!visible;
    if(!visible){w.cancelAnimationFrame(frame);frame=0;last=0;return;}
    const ratio=Math.min(w.devicePixelRatio||1,low?1:1.5);
    const bw=Math.round(width*ratio),bh=Math.round(height*ratio);
    if(canvas.width!==bw || canvas.height!==bh){canvas.width=bw;canvas.height=bh;ctx.setTransform(ratio,0,0,ratio,0,0);particles.length=0;}
    particles.length=Math.min(particles.length,limit);
    schedule();
  }
  function calendar(){
    w.clearTimeout(checkDate);season=inSeason(s);
    if(s.season!=='always'&&!doc.hidden)checkDate=w.setTimeout(()=>{calendar();refresh();},60000-Date.now()%60000);
  }
  doc.addEventListener('visibilitychange',()=>{calendar();refresh();});
  w.addEventListener('scroll',()=>{if(s?.area==='hero')refresh();},{passive:true});
  w.addEventListener('resize',refresh);
  if(reduce.addEventListener)reduce.addEventListener('change',refresh);else reduce.addListener(refresh);
  return (value,type)=>{s=value;device=type;calendar();refresh();};
}
