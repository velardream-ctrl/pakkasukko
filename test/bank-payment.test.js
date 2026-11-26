import test from 'node:test';
import assert from 'node:assert/strict';
import {validFinnishIBAN,finnishReference,virtualBankCode,paymentData} from '../src/bank-payment.js';
test('Finance Finland v4 invoice example 3',()=>{
 const iban='FI02 5000 4640 0013 02',ref='69875672083435364';
 assert.equal(validFinnishIBAN(iban),true);
 assert.equal(validFinnishIBAN('FI03 5000 4640 0013 02'),false);
 assert.equal(finnishReference(ref.slice(0,-1)),ref);
 assert.equal(virtualBankCode(iban,69380,ref,'2011-07-24'),'40250004640001302000693800000069875672083435364110724');
});
test('QR and virtual code use same account, amount and reference',()=>{
 const d={bankPayment:true,seller:{name:'Example',iban:'FI0250004640001302',bic:'OKOYFIHH'},total:5000,due:'2026-12-24'};
 const p=paymentData(d,'A-1');assert.equal(p.barcode.length,54);
 assert.equal(p.barcode.slice(17,25),'00005000');
 assert.equal(p.payload.split('\n')[7],'EUR50.00');
 assert.equal(p.payload.split('\n')[9],p.reference);
 assert.equal(paymentData({...d,preview:true},'A-1'),null);
 assert.notEqual(paymentData(d,'A-2').reference,p.reference);
});
