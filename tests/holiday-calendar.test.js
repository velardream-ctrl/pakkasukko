import test from 'node:test';
import assert from 'node:assert/strict';
import {annualToISO,nextAnnualISO,endAnnualISO,isoToAnnual,compareHolidayRules,shiftEndForNewStart} from '../docs/holiday-calendar.js';
test('holiday date picker preserves annually recurring dates without storing a specific year',()=>{
 assert.equal(nextAnnualISO('24.12','2026-11-25'),'2026-12-24');
 assert.equal(endAnnualISO('2026-12-24','25.12'),'2026-12-25');
 assert.equal(nextAnnualISO('31.12','2026-11-25'),'2026-12-31');
 assert.equal(endAnnualISO('2026-12-31','01.01'),'2027-01-01');
 assert.equal(nextAnnualISO('13.01','2026-11-25'),'2027-01-13');
 assert.equal(endAnnualISO('2027-01-13','14.01'),'2027-01-14');
 assert.equal(nextAnnualISO('24.12','2026-12-26'),'2027-12-24');
 assert.equal(isoToAnnual('2027-01-01'),'01.01');
 assert.equal(annualToISO('31.02',2026),'');
 assert.equal(isoToAnnual('2026-02-31'),'');
});

test('sorting prefers the next annual occurrence and supports price and name ordering',()=>{
 const rules=[
  {name:'Старый Новый год',startDate:'13.01',startTime:'23:00',percent:30},
  {name:'Рождество',startDate:'24.12',startTime:'20:00',percent:50},
  {name:'Новый год',startDate:'31.12',startTime:'22:00',percent:100},
  {name:'Новогодняя ночь поздняя',startDate:'31.12',startTime:'23:00',percent:20}
 ];
 const sort=mode=>[...rules].sort((a,b)=>compareHolidayRules(a,b,mode,'2026-11-26')).map(x=>x.name);
 assert.deepEqual(sort('date'),['Рождество','Новый год','Новогодняя ночь поздняя','Старый Новый год']);
 assert.deepEqual(sort('percent_desc'),['Новый год','Рождество','Старый Новый год','Новогодняя ночь поздняя']);
 assert.deepEqual(sort('percent_asc'),['Новогодняя ночь поздняя','Старый Новый год','Рождество','Новый год']);
 assert.deepEqual(sort('name'),['Новогодняя ночь поздняя','Новый год','Рождество','Старый Новый год']);
});

test('moving a festive period start also moves its end by the original number of days',()=>{
 assert.equal(shiftEndForNewStart('2026-12-24','2026-12-25','2027-01-07'),'2027-01-08');
 assert.equal(shiftEndForNewStart('2026-12-31','2027-01-01','2027-01-13'),'2027-01-14');
 assert.equal(shiftEndForNewStart('2026-12-24','2026-12-24','2027-01-07'),'2027-01-07');
 assert.equal(shiftEndForNewStart('2026-12-24','2027-12-25','2027-01-07'),'');
});
