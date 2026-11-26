import {introHeading} from '../docs/text-presentation.js';
export const introCopyVersion='intro-copy-2026-11-26-v1';
export function updateIntroCopy(model={}){
 const next={...model,headingOverrides:{...model.headingOverrides},headingParts:{...model.headingParts,intro:introHeading.map(p=>({...p}))},texts:{...model.texts,'intro-1':introHeading[0].text,'intro-2':introHeading[1].text}};
 delete next.headingOverrides.intro;
 return next;
}
export async function applyIntroCopy(db){
 const marker=db.prepare("SELECT value FROM booking_settings WHERE key=?").bind(introCopyVersion);
 if(await marker.first())return {ok:true,alreadyApplied:true};
 const latest=await db.prepare('SELECT id,body,published FROM site_revisions ORDER BY id DESC LIMIT 1').first();
 const published=await db.prepare('SELECT id,body,published FROM site_revisions WHERE published=1 ORDER BY id DESC LIMIT 1').first();
 const stamp=new Date().toISOString();
 const statements=[db.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?)').bind(introCopyVersion,JSON.stringify({latest:latest?.id||null,published:published?.id||null}))];
 if(published)statements.push(db.prepare('INSERT INTO site_revisions(body,published,created_at) VALUES(?,1,?)').bind(JSON.stringify(updateIntroCopy(JSON.parse(published.body))),stamp));
 if(latest&&latest.id!==published?.id)statements.push(db.prepare('INSERT INTO site_revisions(body,published,created_at) VALUES(?,0,?)').bind(JSON.stringify(updateIntroCopy(JSON.parse(latest.body))),stamp));
 try{await db.batch(statements);}catch(e){if(await db.prepare("SELECT value FROM booking_settings WHERE key=?").bind(introCopyVersion).first())return {ok:true,alreadyApplied:true};throw e;}
 return {ok:true,alreadyApplied:false};
}
