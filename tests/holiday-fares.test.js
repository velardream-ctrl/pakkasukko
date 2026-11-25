import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFare,defaultHolidayRules,prices,quote,visitQuote,holidayNight,holidayInfo,validFare} from '../docs/fares.js';

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

test('negotiated program prices never claim a fictitious zero-euro holiday surcharge',()=>{
 const q=quote(defaultFare,prices().event,'Kitee',false,['2026-12-24T22:00']);
 const festive=visitQuote(q,1,0);
 assert.equal(festive.base,null);
 assert.equal(festive.holidayExtra,null);
 assert.equal(festive.total,null);
});

test('owner can split the same holiday night into different pricing intervals',()=>{
 const rules=[
  {name:'Ранний вечер',startDate:'24.12',startTime:'20:00',endDate:'24.12',endTime:'23:00',percent:50},
  {name:'Пик праздника',startDate:'24.12',startTime:'23:00',endDate:'25.12',endTime:'03:00',percent:100},
  {name:'Раннее утро',startDate:'25.12',startTime:'03:00',endDate:'25.12',endTime:'09:00',percent:30}
 ];
 const fare={...defaultFare,holidayRules:rules};
 assert.equal(validFare(fare),true);
 for(const [time,price,name] of [
  ['2026-12-24T19:59',10000,null],
  ['2026-12-24T20:00',15000,'Ранний вечер'],
  ['2026-12-24T23:00',20000,'Пик праздника'],
  ['2026-12-25T02:59',20000,'Пик праздника'],
  ['2026-12-25T03:00',13000,'Раннее утро'],
  ['2026-12-25T09:00',10000,null]
 ]){
  const result=visitQuote(quote(fare,prices().home,'Kitee',false,[time]),1,0);
  assert.equal(result.base,price,time);
  assert.equal(result.holidayName,name,time);
 }
 const q=quote(fare,prices().home,'Joensuu',true,['2026-12-24T22:00','2026-12-24T23:30']);
 const first=visitQuote(q,2,0),second=visitQuote(q,2,1);
 assert.equal(first.base,15000);
 assert.equal(second.base,20000);
 assert.equal(first.travel,1474);
 assert.equal(second.travel,1474);
 assert.equal(first.total+second.total,37948);
});

test('annual rules support New Year crossing, overlap priority and removing all surcharges',()=>{
 const extra={name:'Повышенный час',startDate:'31.12',startTime:'23:00',endDate:'01.01',endTime:'01:00',percent:125};
 const fare={...defaultFare,holidayRules:[...defaultHolidayRules,extra]};
 assert.equal(validFare(fare),true);
 assert.deepEqual(holidayInfo('2027-01-01T00:30',fare),{name:'Повышенный час',percent:125});
 assert.equal(holidayInfo('2027-01-01T01:00',fare).percent,50);
 assert.equal(holidayInfo('2027-01-01T09:00',fare),null);
 assert.equal(holidayInfo('2027-01-01T00:30',{...fare,holidayRules:[]}),null);
 for(const rule of [
  {...extra,startDate:'31.02'},
  {...extra,percent:301},
  {...extra,endDate:'31.12',endTime:'22:00'},
  {...extra,name:' '}
 ])assert.equal(validFare({...fare,holidayRules:[rule]}),false);
});

test('holiday display sorting preferences are validated without changing tariff rules',()=>{
 assert.equal(validFare({...defaultFare,holidaySort:'date'}),true);
 assert.equal(validFare({...defaultFare,holidaySort:'percent_desc'}),true);
 assert.equal(validFare({...defaultFare,holidaySort:'percent_asc'}),true);
 assert.equal(validFare({...defaultFare,holidaySort:'name'}),true);
 assert.equal(validFare({...defaultFare,holidaySort:'unsupported'}),false);
});
