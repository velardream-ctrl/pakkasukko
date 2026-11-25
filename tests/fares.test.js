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

test('configurable performer prices are in cents, tied to duration and respect holiday rules',async()=>{
 const {validPerformanceConfig,performanceRows,performanceChoice,visitQuote,describe}=await import('../docs/fares.js');
 const performance={enabled:true,rates:{home:[{minutes:30,solo:10000,duo:16000},{minutes:60,solo:15000,duo:24000}]}};
 const fare={...defaultFare,performance};
 assert.equal(validFare(fare),true);
 assert.equal(validPerformanceConfig({enabled:true,rates:{home:[{minutes:30,solo:null,duo:null}]}}),false);
 assert.equal(validFare({...fare,performance:{enabled:true,rates:{home:[{minutes:30,solo:-1,duo:20000}]}}}),false);
 assert.equal(validFare({...fare,performance:{enabled:true,rates:{home:[{minutes:30,solo:10000,duo:20000},{minutes:30,solo:11000,duo:21000}]}}}),false);
 assert.deepEqual(performanceRows(fare,'gift'),[]);
 const chosen=performanceChoice(fare,'home',30,'duo');
 assert.deepEqual(chosen,{minutes:30,cast:'duo',amount:16000});
 assert.equal(performanceChoice(fare,'home',60,'duo').amount,24000);
 assert.equal(performanceChoice(fare,'home',45,'duo'),null);
 const regular=quote(fare,prices().home,'Kitee',false,[],chosen);
 assert.equal(regular.base,16000);assert.equal(regular.total,16000);
 assert.equal(regular.durationMinutes,30);assert.equal(regular.performerCast,'duo');
 assert.match(describe(regular),/Снегурочка/);
 const {invoiceService}=await import('../docs/invoice-service.js');
 assert.match(invoiceService('home',false,regular).ru,/Снегурочки/);
 assert.match(invoiceService('home',false,regular).fi,/30 min/);
 const holiday=quote(fare,prices().home,'Kitee',false,['2099-12-24T21:00'],chosen);
 assert.equal(visitQuote(holiday,1,0).total,24000,'50 percent applies to the full artist performance, not travel');
 assert.equal(quote(defaultFare,prices().home,'Kitee').base,10000,'legacy tariffs remain unchanged');
});
