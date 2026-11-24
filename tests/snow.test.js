import test from 'node:test';
import assert from 'node:assert/strict';
import {settings,defaults,ranges,inSeason} from '../docs/snow.js';
test('older revisions receive defaults and every range respects its bounds',()=>{
  assert.deepEqual(settings(),defaults);
  for(const [key,,min] of ranges){
    assert.equal(settings({[key]:-1})[key],min);
    assert.equal(settings({[key]:111})[key],100);
    assert.equal(settings({[key]:'invalid'})[key],defaults[key]);
  }
});
test('winter and inclusive custom dates use Helsinki midnight',()=>{
  const season=(value,time)=>inSeason(value,new Date(time));
  assert.equal(season({season:'winter'},'2026-11-30T22:00:00Z'),true);
  assert.equal(season({season:'winter'},'2027-02-28T22:00:00Z'),false);
  const one={season:'period',from:'2026-12-24',until:'2026-12-24'};
  assert.equal(season(one,'2026-12-24T21:59:59Z'),true);
  assert.equal(season(one,'2026-12-24T22:00:00Z'),false);
});
