import test from 'node:test';
import assert from 'node:assert/strict';
import {autoAdvanceDocument,advanceStatements} from '../src/automatic-advance.js';
import {paymentData} from '../src/bank-payment.js';
import {qrMatrix,qrSvg} from '../src/bank-qr.js';
const seller={name:'Test company',iban:'FI0250004640001302',bic:'OKOYFIHH',vatRate:'0'};
test('auto advance keeps invoice and booking reserve distinct',()=>{
 const order={name:'Test customer',address:'Test street',city:'Kitee'};
 const slot={start_at:'2099-12-24T17:00'};
 const q={total:10000,prepayment:{amount:5000},remote:false};
 const d=autoAdvanceDocument({seller,order,serviceId:'home',slot,quote:q,hours:24});
 assert.equal(d.total,5000);assert.equal(d.quote.total-d.total,5000);
 assert.equal(d.automatic,true);assert.ok(d.holdUntil<=slot.start_at);
 const db={prepare(sql){return {bind(...args){return {sql,args}}}}};
 const statements=advanceStatements(db,'booking-test',d,'2026-11-26T08:00:00Z');
 assert.equal(statements.length,3);assert.match(statements[0].sql,/status='reserved'/);
 assert.match(statements[1].sql,/prepayment_requests/);
 assert.equal(JSON.parse(statements[1].args[2]).total,5000);
});
test('SEPA QR encoder constructs a real matrix and SVG',()=>{
 const d={bankPayment:true,seller,total:5000,due:'2026-12-24'};
 const p=paymentData(d,'A-123');
 const m=qrMatrix(p.payload);assert.ok(m.length>=21);
 assert.equal(m.every(row=>row.length===m.length),true);
 assert.equal(m[0][0],true);assert.match(qrSvg(p.payload),/<svg/);
});
