import {published} from './editor.js';
export async function mediaAPI(req,env,path,reply,admin){
  if(!env.MEDIA)return reply({error:'Хранилище Pakkasukko R2 ещё не подключено'},503);
  const id=path.split('/').pop();
  if(req.method==='GET'){
    if(!/^[a-f0-9-]{36}$/.test(id))return reply({},404);
    if(!admin){
      const site=await published(env);
      if(site.logo!==id&&!Object.values(site.crops||{}).some(c=>c.image===id)&&!Object.values(site.pictures||{}).some(p=>p.id===id))return reply({},404);
    }
    const item=await env.MEDIA.get(id) || await env.MEDIA.get(id+'-original');
    return item?new Response(item.body,{headers:{'Content-Type':item.httpMetadata.contentType,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'"}}):reply({},404);
  }
  if(!admin)return reply({},403);
  if(path==='/api/admin/media/upload'){
    if(Number(req.headers.get('content-length')||Infinity)>32*1024*1024)return reply({error:'Максимальный размер 32 МБ'},413);
    const data=await req.formData(),file=data.get('original'),small=data.get('display');
    if(!file||!['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'].includes(file.type)||small&&small.type!=='image/webp')return reply({error:'Выберите JPEG, PNG, WebP, MOV или MP4'},400);
    const key=crypto.randomUUID();
    try{
      await env.MEDIA.put(key+'-original',file.stream(),{httpMetadata:{contentType:file.type}});
      if(small)await env.MEDIA.put(key,small.stream(),{httpMetadata:{contentType:small.type}});
      await env.DB.prepare('INSERT INTO media(id,mime,caption,position) VALUES(?,?,?,0)').bind(key,file.type,String(file.name).slice(0,150)).run();
    }catch(e){await env.MEDIA.delete([key,key+'-original']);throw e;}
    return reply({id:key});
  }
  if(path==='/api/admin/media/edit'){
    const b=await req.json();
    if(b.archive)await env.DB.prepare('DELETE FROM media WHERE id=?').bind(b.id).run();
    else await env.DB.prepare('UPDATE media SET caption=?,position=? WHERE id=?').bind(String(b.caption).slice(0,200),Number(b.position)||0,b.id).run();
    return reply({ok:true});
  }
  return reply({},404);
}
