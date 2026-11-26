import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {advanceStatements,expireBankHolds} from '../src/automatic-advance.js';
import {prepaymentsAPI} from '../src/prepayment-api.js';

const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
function fixture(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
 const db={prepare(sql){return {bind(...args){const st=sqlite.prepare(sql);return {run:async()=>({meta:{changes:st.run(...args).changes}}),first:async()=>st.get(...args),all:async()=>({results:st.all(...args)}),execute:()=>st.run(...args)};}}},async batch(stmts){sqlite.exec('BEGIN');try{for(const s of stmts)s.execute();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const future='2099-12-24T17:00',stamp='2026-11-26T08:00:00Z';
 sqlite.prepare("INSERT INTO slots(id,start_at,end_at,created_at) VALUES('s',?,?,?)").run(future,'2099-12-24T17:30',stamp);
 const insert=id=>db.prepare("INSERT INTO bookings(id,slot_id,service,name,phone,city,address,created_at) VALUES(?,(SELECT id FROM slots WHERE id='s' AND status='open'),'home','Test','123','Kitee','Road',?)").bind(id,stamp);
 const doc={automatic:true,bankPayment:true,holdUntil:future,time:future,total:5000,quote:{prepayment:{paymentMethod:'bank'}}};
 const reserve=(id,d=doc)=>db.batch([insert(id),...advanceStatements(db,id,d,stamp)]);
 const get=(table,id)=>sqlite.prepare('SELECT * FROM '+table+' WHERE '+(table==='slots'?'id':table==='bookings'?'id':'booking_id')+'=?').get(id);
 const paid=(id,amount=5000)=>prepaymentsAPI(new Request('https://test.invalid/api/admin/prepayments/paid?id='+id,{method:'POST',body:JSON.stringify({note:'Verified in bank',amount})}),{DB:db},'paid',(data,status=200)=>({data,status}));
 return {sqlite,db,reserve,get,doc,paid};
}
test('real SQLite: reserve blocks double booking, exact payment confirms only once',async()=>{
 const f=fixture();await f.reserve('a');
 assert.equal(f.get('bookings','a').status,'pending');assert.equal(f.get('slots','s').booking_id,'a');
 await assert.rejects(f.reserve('b'));assert.equal(f.get('bookings','b'),undefined);
 assert.equal((await f.paid('a',100)).status,409);assert.equal(f.get('prepayment_requests','a').status,'requested');
 assert.equal((await f.paid('a')).data.confirmed,true);assert.equal(f.get('bookings','a').status,'confirmed');
 assert.equal(f.get('slots','s').booking_id,'a');
 await f.paid('a');assert.equal(f.sqlite.prepare("SELECT count(*) n FROM prepayment_events WHERE action='paid'").get().n,1);
 f.sqlite.close();
});
test('real SQLite: expiry frees slot, late payment cannot take new reservation',async()=>{
 const f=fixture();await f.reserve('a',{...f.doc,holdUntil:'2000-01-01T00:00'});
 await expireBankHolds(f.db);assert.equal(f.get('booking_details','a').final_status,'cancelled');
 assert.equal(f.get('slots','s').status,'open');await f.reserve('b');
 assert.equal((await f.paid('a')).data.confirmed,false);
 assert.equal(f.get('prepayment_requests','a').status,'paid');
 assert.equal(f.get('slots','s').booking_id,'b');assert.equal(f.get('bookings','b').status,'pending');
 f.sqlite.close();
});
test('reported payment stays held until visit or manual review',async()=>{
 const f=fixture();await f.reserve('a',{...f.doc,holdUntil:'2000-01-01T00:00'});
 f.sqlite.prepare("UPDATE prepayment_requests SET bank_note='reported' WHERE booking_id='a'").run();
 await expireBankHolds(f.db);assert.equal(f.get('booking_details','a'),undefined);
 assert.equal(f.get('slots','s').booking_id,'a');
 f.sqlite.close();
});
