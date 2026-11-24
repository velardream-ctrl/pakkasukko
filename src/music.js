const key='music_playlist';
export const defaults=()=>({enabled:true,autoplay:true,volume:15,tracks:[]});
async function read(env){
 if(!env.DB)return defaults();
 const row=await env.DB.prepare('SELECT value FROM booking_settings WHERE key=?').bind(key).first();
 return row?{...defaults(),...JSON.parse(row.value)}:defaults();
}
async function save(env,p){await env.DB.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,JSON.stringify(p)).run();}
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export async function musicAPI(req,env,path,reply,admin){
 const fail=(error,status=400)=>reply({error},status);
 const p=await read(env),id=path.split('/').pop();
 if(req.method==='GET'&&path.endsWith('/config'))return reply(admin?p:p.enabled?{...p}:{...p,tracks:[]});
 if(req.method==='GET'&&validId(id)){
   if(!env.MEDIA||(!admin&&!p.enabled)||!p.tracks.some(t=>t.id===id))return fail('Файл недоступен.',404);
   const k='music/'+id+'.mp3',meta=await env.MEDIA.head(k);if(!meta)return fail('Файл отсутствует.',404);
   const h={'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'};
   let start=0,end=meta.size-1;const range=req.headers.get('Range');
   if(range){
     const m=/^bytes=(\d*)-(\d*)$/.exec(range);
     if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+meta.size}});
     if(m[1]){start=Number(m[1]);if(m[2])end=Math.min(Number(m[2]),end);}else start=Math.max(0,meta.size-Number(m[2]));
     if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=meta.size)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+meta.size}});
     h['Content-Range']='bytes '+start+'-'+end+'/'+meta.size;
   }
   h['Content-Length']=String(end-start+1);
   const object=await env.MEDIA.get(k,range?{range:{offset:start,length:end-start+1}}:undefined);
   return object?new Response(object.body,{status:range?206:200,headers:h}):fail('Файл отсутствует.',404);
 }
 if(!admin||req.method!=='POST')return fail('Маршрут не найден.',404);
 if(!env.MEDIA)return fail('Хранилище R2 не подключено.',503);
 if(id==='upload'){
   if(Number(req.headers.get('Content-Length')||0)>16*1024*1024)return fail('Максимум 15 МБ на файл.',413);
   const data=await req.formData(),file=data.get('file');
   if(!file||typeof file==='string'||file.size<128||file.size>15*1024*1024||!file.name.toLowerCase().endsWith('.mp3'))return fail('Выберите MP3 до 15 МБ.');
   const b=new Uint8Array(await file.slice(0,3).arrayBuffer());
   if(!(b[0]===73&&b[1]===68&&b[2]===51)&&!(b[0]===255&&(b[1]&224)===224))return fail('Некорректный MP3.');
   if(p.tracks.length>=30)return fail('Максимум 30 композиций.');
   const track={id:crypto.randomUUID(),title:file.name.replace(/\.mp3$/i,'').slice(0,150),size:file.size};
   const k='music/'+track.id+'.mp3';await env.MEDIA.put(k,file.stream(),{httpMetadata:{contentType:'audio/mpeg'}});
   try{p.tracks.push(track);await save(env,p);}catch(e){await env.MEDIA.delete(k);throw e;}
   return reply(p);
 }
 if(id==='config'){
   const b=await req.json();
   if(typeof b.enabled!=='boolean'||typeof b.autoplay!=='boolean'||!Number.isInteger(b.volume)||b.volume<0||b.volume>100||!Array.isArray(b.tracks)||b.tracks.length>30)return fail('Проверьте настройки.');
   const known=new Map(p.tracks.map(t=>[t.id,t]));
   if(new Set(b.tracks.map(t=>t?.id)).size!==b.tracks.length||b.tracks.some(t=>!known.has(t?.id)||typeof t.title!=='string'||!t.title.trim()||t.title.length>150))return fail('Проверьте список композиций.');
   const tracks=b.tracks.map(t=>({...known.get(t.id),title:t.title.trim()}));
   const next={enabled:b.enabled,autoplay:b.autoplay,volume:b.volume,tracks};await save(env,next);
   // Removed tracks become inaccessible; keep bytes for recovery.
   return reply(next);
 }
 return fail('Маршрут не найден.',404);
}