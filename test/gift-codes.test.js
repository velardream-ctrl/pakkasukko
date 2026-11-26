import test from 'node:test';
import assert from 'node:assert/strict';
import {discountVisit} from '../docs/gift-codes.js';

test('each gift changes the paid total without letting an unused certificate balance disappear',()=>{
 const visit={base:9000,travel:2000,total:11000,holidayExtra:3000,holidayName:'Рождество'};
 for(const [kind,value,expected] of [['percent',10,10100],['fixed',1000,10000],['holiday',0,8000],['program',0,2000],['visit',0,0],['certificate',10000,1000]]){
   const priced=discountVisit(visit,{kind,value});
   assert.equal(priced.total,expected);
   assert.equal(priced.base+priced.travel,expected);
   assert.equal(priced.giftCoversTravel,kind==='certificate'||kind==='visit');
 }
 assert.equal(discountVisit(visit,{kind:'certificate',value:12000}),visit);
 assert.equal(discountVisit({...visit,total:null},{kind:'visit',value:0}).total,null);
});
