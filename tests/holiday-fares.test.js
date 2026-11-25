import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFare,prices,quote,visitQuote,holidayNight,validFare} from '../docs/fares.js';

const price=(time,city='Joensuu',fare=defaultFare)=>{
 const q=quote(fare,prices().gift,city,false,[time]);
 return visitQuote(q,1,0);
};

test('festive nights in Finland apply from 20:00 to 09:00 on recurring dates',()=>{
 for(const [time,name] of [
  ['2026-12-24T20:00','Рождественская ночь'],
  ['2026-12-25T08:59','Рождественская ночь'],
  ['2026-12-31T23:59','Новогодняя ночь'],
  ['2027-01-01T08:59','Новогодняя ночь'],
  ['2027-01-13T20:00','Старый Новый год'],
  ['2027-01-14T08:59','Старый Новый год'],
  ['2030-12-24T21:15','Рождественская ночь']
 ])assert.equal(holidayNight(time),name,time);
 for(const time of [
  '2026-12-24T19:59','2026-12-25T09:00',
  '2026-12-31T19:59','2027-01-01T09:00',
  '2027-01-13T19:59','2027-01-14T09:00',
  '2027-01-06T21:00','invalid'
 ])assert.equal(holidayNight(time),null,time);
});

test('holiday surcharge is 50 percent of program only; travel and lodging unchanged',()=>{
 const regular=price('2026-12-24T19:30');
 const special=price('2026-12-24T21:00');
 assert.equal(regular.base,5000);
 assert.equal(regular.total,7948);
 assert.equal(special.regularBase,5000);
 assert.equal(special.base,7500);
 assert.equal(special.holidayExtra,2500);
 assert.equal(special.travel,2948);
 assert.equal(special.total,10448);
 const withoutSurcharge=price('2026-12-24T22:00','Kitee',{...defaultFare,holidayPercent:0});
 assert.equal(withoutSurcharge.total,5000);
 assert.equal(withoutSurcharge.holidayExtra,0);
 const custom=price('2026-12-24T22:00','Kitee',{...defaultFare,holidayPercent:100});
 assert.equal(custom.total,10000);
 assert.equal(validFare({...defaultFare,holidayPercent:-1}),false);
 assert.equal(validFare({...defaultFare,holidayPercent:33.5}),false);
});

test('group of mixed evening hours only surcharges the festive visits',()=>{
 const times=['2026-12-24T19:30','2026-12-24T20:30'];
 const snapshot=quote(defaultFare,prices().home,'Joensuu',true,times);
 const regular=visitQuote(snapshot,2,0);
 const festive=visitQuote(snapshot,2,1);
 assert.equal(regular.base,10000);
 assert.equal(festive.base,15000);
 assert.equal(regular.travel,1474);
 assert.equal(festive.travel,1474);
 assert.equal(regular.total+festive.total,27948);
 assert.equal(festive.holidayName,'Рождественская ночь');
 assert.deepEqual(snapshot.visitTimes,times);
});
