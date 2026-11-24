import test from 'node:test';
import assert from 'node:assert/strict';
import {prices,quote,defaultFare,validFare} from '../docs/fares.js';
test('return trip, rounding in cents, free local and remote visits, custom quotes',()=>{
 const services=prices({cards:[{id:'video',title:'Видеопоздравление',price:'50 €'}]});
 for(const [city,total] of [['Kitee',5000],['Puhos',5660],['Tohmajärvi',5880],['Joensuu',7948]]){
   assert.equal(quote(defaultFare,services.gift,city).total,total);
 }
 assert.equal(quote(defaultFare,services.video,'Другой город').total,5000);
 assert.equal(quote(defaultFare,services.event,'Joensuu').total,null);
 assert.equal(quote(defaultFare,services.gift,'Tampere').travel,null);
 assert.equal(quote(defaultFare,services.home,'Joensuu',true).total,12948);
 assert.equal(validFare({...defaultFare,fuel:-1}),false);
});
test('new destinations can charge rail tickets, lodging and meals independently of petrol',()=>{
 const f={...defaultFare,km:{Kitee:0,Helsinki:420},routes:{Helsinki:{mode:'rail',ticket:85,nights:1,hotel:72,meals:18}}};
 assert.equal(validFare(f),true);
 const q=quote(f,prices().gift,'Helsinki');
 assert.equal(q.km,null);assert.equal(q.total,22500);
 assert.equal(quote({...f,fuel:5},prices().gift,'Helsinki').total,q.total);
 assert.equal(quote(f,prices().gift,'Kitee').total,5000);
 assert.equal(validFare({...f,km:{...f.km,helsinki:10}}),false);
});
