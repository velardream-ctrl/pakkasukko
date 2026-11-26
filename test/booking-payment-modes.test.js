import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFare,bookingPaymentMode,validPrepayments,prepaymentForVisit} from '../docs/fares.js';

const city={city:'Kitee',remote:false,total:10000,travel:0};
const rule={mode:'fixed',percent:0,amount:8000};
const cfg=(method)=>({...defaultFare,prepayments:{...defaultFare.prepayments,enabled:method!=='none',paymentMethod:method,rules:{Joensuu:rule}}});

test('legacy settings remain compatible',()=>{
 assert.equal(bookingPaymentMode(defaultFare.prepayments),'bank');
 assert.equal(bookingPaymentMode({enabled:false}),'none');
 assert.equal(prepaymentForVisit(defaultFare,city).amount,5000);
});
test('no prepayment overrides all cities without deleting tariffs',()=>{
 const fare=cfg('none');
 assert.equal(bookingPaymentMode(fare.prepayments),'none');
 assert.equal(prepaymentForVisit(fare,city),null);
 assert.equal(prepaymentForVisit(fare,{...city,city:'Joensuu',total:16000}),null);
 assert.deepEqual(fare.prepayments.rules.Joensuu,rule);
});
test('bank and stripe preserve city tariff and freeze payment channel',()=>{
 for(const method of ['bank','stripe']){
  const fare=cfg(method);
  assert.equal(validPrepayments(fare.prepayments,fare.km),true);
  assert.equal(prepaymentForVisit(fare,city).amount,5000);
  const other=prepaymentForVisit(fare,{...city,city:'Joensuu',total:16000});
  assert.equal(other.amount,8000);
  assert.equal(other.paymentMethod,method);
  assert.equal(prepaymentForVisit(fare,{...city,total:2000}).amount,2000);
 }
});
test('inconsistent and unknown payment modes rejected',()=>{
 for(const p of [{...cfg('none').prepayments,enabled:true},{...cfg('bank').prepayments,enabled:false},{...cfg('bank').prepayments,paymentMethod:'invalid'}])
  assert.equal(validPrepayments(p,defaultFare.km),false);
});
