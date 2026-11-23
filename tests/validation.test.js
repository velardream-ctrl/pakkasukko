import test from 'node:test';
import assert from 'node:assert/strict';
import {addMinutes,validStamp,validateBooking,normalizeContent,csvCell} from '../src/validation.js';
test('invalid and impossible local dates are rejected',()=>{assert.equal(validStamp('2026-02-30T10:00'),false);assert.equal(validStamp('2026-12-27T18:30'),true);assert.equal(validStamp('2026-13-27T18:30'),false);});
test('cross-midnight intervals are calculated',()=>assert.equal(addMinutes('2026-12-31T23:30',90),'2027-01-01T01:00'));
test('booking requires valid contact and service',()=>{assert.throws(()=>validateBooking({slotId:'abc',service:'gift'}));assert.equal(validateBooking({slotId:'e1ca135b-b365-4e35-afda-72f4df8d7dea',service:'home',name:'Тест',phone:'+358401234567',city:'Kitee',address:'Testikatu 1'}).service,'home');});
test('content only allows known fields',()=>{const v=normalizeContent({giftPrice:'от 60 €',adminPassword:'abc'});assert.equal(v.giftPrice,'от 60 €');assert.equal('adminPassword' in v,false);});
test('CSV prevents spreadsheet formula execution',()=>assert.equal(csvCell('=WEBSERVICE("https://x")'),'"\'=WEBSERVICE(""https://x"")"'));