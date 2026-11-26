import test from 'node:test';
import assert from 'node:assert/strict';
import {checkGoogleRoutes} from '../scripts/check-google-routes.mjs';

test('operator check is bounded to five Essentials queries and exposes no key',async()=>{
 let calls=0;
 const result=await checkGoogleRoutes('never-print-this',async(url,options)=>{
  calls++;const body=JSON.parse(options.body);
  assert.equal(url,'https://routes.googleapis.com/directions/v2:computeRoutes');
  assert.equal(body.origin.address,'Kitee, Finland');
  assert.equal(body.routingPreference,'TRAFFIC_UNAWARE');
  assert.equal(options.headers['X-Goog-FieldMask'],'routes.distanceMeters');
  return Response.json({routes:[{distanceMeters:12345}]});
 });
 assert.equal(calls,5);assert.equal(result.length,5);
 assert.equal(result[4].roundTripKm,26);
 assert.ok(!JSON.stringify(result).includes('never-print-this'));
});
test('billing failure stops further diagnostic calls and discards raw error text',async()=>{
 let calls=0;
 const result=await checkGoogleRoutes('private-key',async()=>{
  calls++;return Response.json({error:{message:'sensitive private-key',details:[{reason:'BILLING_DISABLED'},{reason:'private-key'}]}},{status:403});
 });
 assert.equal(calls,1);assert.deepEqual(result[0].reasons,['BILLING_DISABLED']);
 assert.ok(result.slice(1).every(r=>r.status==='SKIPPED_AFTER_PROVIDER_REJECTION'));
 assert.ok(!JSON.stringify(result).includes('private-key'));
 assert.deepEqual(await checkGoogleRoutes('',()=>{throw Error('no request');}),[{status:'MISSING_SERVER_KEY'}]);
});
