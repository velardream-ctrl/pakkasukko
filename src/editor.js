import {currentCopy} from './privacy-copy.js';
export async function published(env){
  if(!env.DB)return {};
  const row=await env.DB.prepare('SELECT body FROM site_revisions WHERE published=1 ORDER BY id DESC LIMIT 1').first();
  return row?currentCopy(JSON.parse(row.body)):{};
}
export async function editorAPI(req,env,path,reply){
  const db=env.DB;
  if(path==='/api/admin/editor' && req.method==='GET'){
    const latest=await db.prepare('SELECT id,body FROM site_revisions ORDER BY id DESC LIMIT 1').first();
    const history=await db.prepare('SELECT id,created_at,published FROM site_revisions ORDER BY id DESC LIMIT 50').all();
    const media=await db.prepare('SELECT * FROM media ORDER BY position,id').all();
    return reply({id:latest?.id||0,model:latest?currentCopy(JSON.parse(latest.body)):{},history:history.results,media:media.results});
  }
  if(path==='/api/admin/editor' && req.method==='POST'){
    const raw=await req.text();
    if(raw.length>200000)return reply({error:'Слишком большой черновик'},413);
    const {model,id,publish,restore}=JSON.parse(raw);
    let body;
    if(restore){
      body=(await db.prepare('SELECT body FROM site_revisions WHERE id=?').bind(restore).first())?.body;
      if(!body)return reply({error:'Версия не найдена'},404);
    }else{
      if(!model || !['texts','crops','pictures','seo'].every(k=>model[k] && typeof model[k]==='object'&&!Array.isArray(model[k])) || !['order','hidden','cards'].every(k=>Array.isArray(model[k])))return reply({error:'Некорректный черновик'},400);
      body=JSON.stringify(model);
    }
    const result=await db.prepare('INSERT INTO site_revisions(body,published,created_at) SELECT ?,?,? WHERE (SELECT COALESCE(MAX(id),0) FROM site_revisions)=?').bind(body,publish===true&&!restore?1:0,new Date().toISOString(),id).run();
    return result.meta.changes?reply({id:result.meta.last_row_id}):reply({error:'Версия изменилась. Откройте редактор заново.'},409);
  }
}
