import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {introHeading,validTextPresentation,legacyHeadingParts} from '../docs/text-presentation.js';
import {updateIntroCopy,applyIntroCopy} from '../src/intro-copy.js';
test('heading colors and styles are independent, validated and preserve unrelated fields',()=>{
 const model={headingOverrides:{intro:'Не просто вручить подарок. Подарить воспоминание.',about:'Custom'},texts:{'intro-3':'Other','top-1':'Hello'},pictures:{intro:{id:'photo'}}};
 const next=updateIntroCopy(model);assert.deepEqual(next.headingParts.intro,introHeading);assert.equal(next.headingOverrides.intro,undefined);assert.equal(next.headingOverrides.about,'Custom');assert.equal(next.texts['intro-3'],'Other');assert.deepEqual(next.pictures,model.pictures);assert.ok(validTextPresentation(next));
 assert.equal(validTextPresentation({textStyles:{x:{color:'red',font:'italic'}}}),false);
 assert.equal(validTextPresentation({headingParts:{intro:[{text:'x',color:'gold',font:'css'}]}}),false);
 assert.deepEqual(legacyHeadingParts(model,'intro',null),introHeading);
});
test('intro copy migration preserves public revision and unrelated unpublished draft',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
 const db={prepare(query){return {bind(...args){const st=sql.prepare(query);return {first:async()=>st.get(...args),execute:()=>st.run(...args)};},first:async()=>sql.prepare(query).get()};},async batch(xs){sql.exec('BEGIN');try{for(const x of xs)x.execute();sql.exec('COMMIT');}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const insert=sql.prepare("INSERT INTO site_revisions(body,published,created_at) VALUES(?,?,'now')");
 insert.run(JSON.stringify({texts:{other:'public'},headingOverrides:{intro:'old'}}),1);
 insert.run(JSON.stringify({texts:{other:'draft'},headingOverrides:{intro:'old'}}),0);
 assert.equal((await applyIntroCopy(db)).alreadyApplied,false);
 const pub=JSON.parse(sql.prepare('SELECT body FROM site_revisions WHERE published=1 ORDER BY id DESC LIMIT 1').get().body),draft=JSON.parse(sql.prepare('SELECT body FROM site_revisions ORDER BY id DESC LIMIT 1').get().body);
 assert.equal(pub.texts.other,'public');assert.equal(draft.texts.other,'draft');assert.deepEqual(pub.headingParts.intro,introHeading);assert.deepEqual(draft.headingParts.intro,introHeading);
 assert.equal((await applyIntroCopy(db)).alreadyApplied,true);assert.equal(sql.prepare('SELECT COUNT(*) n FROM site_revisions').get().n,4);sql.close();
});
