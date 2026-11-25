import test from 'node:test';
import assert from 'node:assert/strict';
import {annualToISO,nextAnnualISO,endAnnualISO,isoToAnnual} from '../docs/holiday-calendar.js';
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
