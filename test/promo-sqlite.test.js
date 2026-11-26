import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const schema=readFileSync(new URL('../schema.sql',import.meta.url),'utf8');
test('promo redemption is atomic, limited and disabled by default',()=>{
 const db=new DatabaseSync(':memory:');db.exec(schema);
 db.exec("INSERT INTO slots(id,start_at,end_at,created_at) VALUES('s','2099-12-24T17:00','2099-12-24T17:30','now'); INSERT INTO promo_codes(id,code,label,kind,value,source,expires,max_uses,created_at) VALUES('p','GIFT-23456789AB','Test','percent',25,'personal','2099-12-31',1,'now')");
 const book=id=>db.prepare("INSERT INTO bookings(id,slot_id,service,name,phone,city,address,created_at) VALUES(?,'s','home','Test','123','Kitee','Road','now')").run(id);
 const use=id=>db.prepare("INSERT INTO promo_redemptions VALUES('p',?,2500,'now','2026-11-26')").run(id);
 const tx=id=>{db.exec('BEGIN');try{book(id);use(id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}};
 assert.throws(()=>tx('a'),/promo unavailable/);assert.equal(db.prepare("SELECT count(*) n FROM bookings").get().n,0);
 db.exec("INSERT INTO booking_settings(key,value) VALUES('promos_enabled','true') ON CONFLICT(key) DO UPDATE SET value='true'; UPDATE promo_codes SET active=1 WHERE id='p'");
 tx('a');assert.throws(()=>tx('b'),/promo unavailable/);assert.equal(db.prepare("SELECT count(*) n FROM bookings").get().n,1);
 assert.throws(()=>db.exec("DELETE FROM bookings WHERE id='a'"),/booking financial lock/);
 db.close();
});
