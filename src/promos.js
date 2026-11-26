import {promoKinds,normalizePromo} from '../docs/promo-rules.js';
const now=()=>new Date().toISOString();
const day=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generatePromoCode(){
 const data=crypto.getRandomValues(new Uint8Array(10));
 return 'GIFT-'+Array.from(data,v=>alphabet[v&31]).join('');
}
export function validPromoInput(v){
 if(!v||!promoKinds.includes(v.kind)||!Number.isInteger(v.maxUses)||v.maxUses<1||v.maxUses>1000)return false;
 if(!Number.isSafeInteger(v.value)||v.value<0||v.kind==='percent'&&(v.value<1||v.value>100)||v.kind==='fixed'&&(v.value<1||v.value>10000000)||!['percent','fixed'].includes(v.kind)&&v.value!==0)return false;
 if(!['label','city','service','holiday','source'].every(k=>typeof v[k]==='string'&&v[k].length<=120))return false;
 if(!v.label.trim()||!['personal','velar','campaign'].includes(v.source)||v.kind==='free_visit'&&v.city!=='Kitee')return false;
 return typeof v.expires==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.expires)&&!Number.isNaN(Date.parse(v.expires+'T00:00:00Z'))&&new Date(v.expires+'T00:00:00Z').toISOString().slice(0,10)===v.expires&&v.expires>=day();
}
export async function promosEnabled(db){return (await db.prepare("SELECT value FROM booking_settings WHERE key='promos_enabled'").first())?.value==='true';}
export async function findPromo(db,code){
 code=normalizePromo(code);
 if(!/^GIFT-[A-HJ-NP-Z2-9]{10}$/.test(code)||!await promosEnabled(db))return null;
 return await db.prepare(`SELECT p.id,p.kind,p.value,p.city,p.service,p.holiday FROM promo_codes p
 WHERE p.code=? AND p.active=1 AND p.expires>=? AND (SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_id=p.id)<p.max_uses`).bind(code,day()).first()||null;
}
export function promoRedemption(db,promo,id,stamp){
 return db.prepare('INSERT INTO promo_redemptions(promo_id,booking_id,discount,redeemed_at,local_day) VALUES(?,?,?,?,?)').bind(promo.id,id,promo.discount,stamp,day());
}
export async function promoAdmin(req,env,path,reply){
 const db=env.DB,fail=(error,status=400)=>reply({error},status);
 if(path==='list'&&req.method==='GET'){
  const rows=await db.prepare('SELECT p.*,(SELECT COUNT(*) FROM promo_redemptions r WHERE r.promo_id=p.id) AS used FROM promo_codes p ORDER BY created_at DESC LIMIT 1000').all();
  return reply({enabled:await promosEnabled(db),codes:rows.results||[]});
 }
 if(req.method!=='POST')return fail('Метод не разрешён.',405);
 let v;try{v=await req.json();}catch{return fail('Неверные данные.');}
 if(path==='settings'){
  if(typeof v.enabled!=='boolean')return fail('Неверная настройка.');
  await db.prepare("INSERT INTO booking_settings(key,value) VALUES('promos_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(v.enabled)).run();
  return reply({ok:true});
 }
 if(path==='create'){
  if(!validPromoInput(v))return fail('Проверьте тип, сумму, ограничения и срок действия.');
  const id=crypto.randomUUID(),code=generatePromoCode();
  await db.prepare('INSERT INTO promo_codes(id,code,label,kind,value,city,service,holiday,source,expires,max_uses,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,code,v.label.trim(),v.kind,v.value,v.city.trim(),v.service.trim(),v.holiday.trim(),v.source,v.expires,v.maxUses,now()).run();
  return reply({id,code},201);
 }
 if(path==='state'){
  if(typeof v.id!=='string'||typeof v.active!=='boolean'||typeof v.distributed!=='boolean'||typeof v.note!=='string'||v.note.length>250)return fail('Проверьте состояние и заметку.');
  const result=await db.prepare('UPDATE promo_codes SET active=?,distributed_at=CASE WHEN ?=0 THEN NULL ELSE COALESCE(distributed_at,?) END,note=? WHERE id=?').bind(v.active?1:0,v.distributed?1:0,now(),v.note.trim(),v.id).run();
  return result.meta.changes?reply({ok:true}):fail('Код не найден.',404);
 }
 return fail('Маршрут не найден.',404);
}
