import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,PAKKASUKKO_ADMIN_PASSWORD:password,
 PAKKASUKKO_TURNSTILE_SITE_KEY:siteKey='',PAKKASUKKO_TURNSTILE_SECRET:turnstileSecret='',
 PAKKASUKKO_RESEND_API_KEY:resendKey='',PAKKASUKKO_OWNER_EMAIL:ownerEmail='',PAKKASUKKO_FROM_EMAIL:fromEmail='',
 PAKKASUKKO_GOOGLE_MAPS_BROWSER_KEY:mapsBrowserKey='',PAKKASUKKO_GOOGLE_ROUTES_API_KEY:routesKey='',PAKKASUKKO_GOOGLE_MAPS_MAP_ID:mapsId='',
 PAKKASUKKO_STRIPE_SECRET_KEY:stripeKey='',PAKKASUKKO_STRIPE_WEBHOOK_SECRET:stripeWebhookSecret=''}=process.env;
if(!/^[a-f0-9]{32}$/.test(account)||!token||!password||password.length<16)throw Error('Configure the three Pakkasukko repository secrets first.');
const api='https://api.cloudflare.com/client/v4/accounts/'+account;
async function call(path,options={}){
 const response=await fetch(api+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'}});
 const data=await response.json();
 if(!response.ok||!data.success)throw Error('Cloudflare '+response.status+' at '+path+' (codes '+data.errors?.map(e=>e.code).join(',')+')');
 return data.result;
}
const dbName='pakkasukko-db',bucket='pakkasukko-preview-media';
let db=(await call('/d1/database?name='+dbName)).find(item=>item.name===dbName);
if(!db)db=await call('/d1/database',{method:'POST',body:JSON.stringify({name:dbName})});
if(db.name!==dbName||!/^[a-f0-9-]{36}$/.test(db.uuid))throw Error('Unexpected D1 identity');
let mediaEnabled=true;
try {
const buckets=await call('/r2/buckets?name_contains='+bucket);
if(!buckets.buckets.some(item=>item.name===bucket))await call('/r2/buckets',{method:'POST',body:JSON.stringify({name:bucket})});
} catch(error) {
 if(!error.message.includes('(codes 10042)'))throw error;
 mediaEnabled=false;
 console.warn('R2 subscription inactive. Publishing preview with bundled portrait.');
}
let original=readFileSync('wrangler.toml','utf8');
if(!mediaEnabled)original=original.replace(/\[\[r2_buckets\]\]\s*binding = "MEDIA"\s*bucket_name = "pakkasukko-preview-media"/, '');
if(!original.includes('name = "pakkasukko"')||!original.includes('ACCEPT_BOOKINGS = "true"'))throw Error('Unexpected deployment configuration');
for(const [key,value] of [['TURNSTILE_SITE_KEY',siteKey],['OWNER_EMAIL',ownerEmail],['FROM_EMAIL',fromEmail]]){
 const pattern=new RegExp('^'+key+' = ""'+String.fromCharCode(36), 'm');
 if(!pattern.test(original))throw Error('Pakkasukko variable not found: '+key);
 original=original.replace(pattern,key+' = '+JSON.stringify(String(value).trim()));
}
const config='.pakkasukko-preview.toml', secrets=process.env.RUNNER_TEMP+'/pakkasukko-worker-secrets.json';
const wrangler=(...args)=>execFileSync('node_modules/.bin/wrangler',[...args,'--config',config],{stdio:'inherit'});
try{
 writeFileSync(config,original.replace('00000000-0000-0000-0000-000000000000',db.uuid));
 const secure={ADMIN_PASSWORD:password,SESSION_SECRET:randomBytes(48).toString('hex')};
 if(turnstileSecret)secure.TURNSTILE_SECRET=turnstileSecret;
 if(resendKey)secure.RESEND_API_KEY=resendKey;
 if(stripeKey&&stripeWebhookSecret){
  if(!/^sk_(test|live)_[A-Za-z0-9_]+$/.test(stripeKey)||!/^whsec_[A-Za-z0-9_]+$/.test(stripeWebhookSecret))throw Error('Incorrect Stripe key format');
  secure.STRIPE_SECRET_KEY=stripeKey;
  secure.STRIPE_WEBHOOK_SECRET=stripeWebhookSecret;
 }
 if(mapsBrowserKey&&routesKey&&mapsId){secure.GOOGLE_MAPS_BROWSER_KEY=mapsBrowserKey;secure.GOOGLE_ROUTES_API_KEY=routesKey;secure.GOOGLE_MAPS_MAP_ID=mapsId;}
 writeFileSync(secrets,JSON.stringify(secure),{mode:0o600});
 wrangler('d1','execute',dbName,'--remote','--file=schema.sql');
 wrangler('deploy','--secrets-file',secrets);
 const {subdomain}=await call('/workers/subdomain');
 if(!/^[a-z0-9-]+$/.test(subdomain))throw Error('Unexpected workers.dev subdomain');
 const url='https://pakkasukko.'+subdomain+'.workers.dev';
 const health=await (await fetch(url+'/api/health',{cache:'no-store'})).json();
 if(health.databaseReady!==true||typeof health.bookingsEnabled!=='boolean')throw Error('Public configuration check failed');
 if(mediaEnabled&&health.mediaReady!==true)throw Error('R2 binding MEDIA missing from deployed Pakkasukko Worker');
 const slotsResponse=await fetch(url+'/api/slots',{cache:'no-store'});
 if(!slotsResponse.ok||!Array.isArray((await slotsResponse.json()).slots))throw Error('Public calendar read API not ready');
 const publicResponse=await fetch(url+'/api/public-config',{cache:'no-store'});
 const publicConfig=await publicResponse.json();
 if(!publicResponse.ok||typeof publicConfig.bookingsEnabled!=='boolean')throw Error('Public booking configuration unavailable');
 // Verify presence of the Google bindings, never log their values or call billable services.
 if(mapsBrowserKey&&routesKey&&mapsId){
   let mapsReady=false;
   for(let attempt=0;attempt<10;attempt++){
     const check=await fetch(url+'/api/public-config',{cache:'no-store'}).then(r=>r.json()).catch(()=>null);
     if(check?.distanceLookup?.configured===true){mapsReady=true;console.log('Google Maps bindings ready; map enabled: '+Boolean(check.distanceLookup.enabled));break;}
     if(attempt<9)await new Promise(resolve=>setTimeout(resolve,1000));
   }
   if(!mapsReady)throw Error('Google Maps bindings missing after deployment');
 }else console.log('Google Maps bindings incomplete; automatic map not activated by deployment.');
 console.log('Pakkasukko calendar availability endpoint ready; live booking enabled: '+publicConfig.bookingsEnabled);
 console.log('Pakkasukko R2 media binding ready: '+health.mediaReady);
 const login=await fetch(url+'/api/admin/login',{method:'POST',redirect:'error',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({password})});
 if(!login.ok)throw Error('Owner login check failed (HTTP '+login.status+')');
 let cookie=login.headers.get('set-cookie')?.split(';')[0];
 if(!cookie)throw Error('Session cookie missing');
 let editorOk=false,lastStatus='not started';
 // Worker edges may briefly disagree on a newly rotated SESSION_SECRET.
 // Re-authenticate after a 401 and allow extra time for the new deployment to propagate.
 for(let attempt=0;attempt<14;attempt++){
   const editor=await fetch(url+'/api/admin/editor',{headers:{Cookie:cookie},cache:'no-store'});
   lastStatus='HTTP '+editor.status;
   if(editor.ok){
     const data=await editor.json().catch(()=>null);
     if(Array.isArray(data?.history)){editorOk=true;break;}
     lastStatus+=' (unexpected response)';
   }
   if(editor.status===401){
     const again=await fetch(url+'/api/admin/login',{method:'POST',redirect:'error',
       headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({password})});
     if(again.ok)cookie=again.headers.get('set-cookie')?.split(';')[0]||cookie;
   }
   if(attempt<13)await new Promise(resolve=>setTimeout(resolve,700*Math.min(attempt+1,4)));
 }
 if(!editorOk)throw Error('Editor check failed after retries: '+lastStatus);
 // During deployment different Cloudflare edges can briefly serve older sessions.
 // Re-authenticate if the rotating SESSION_SECRET causes an intermittent 401.
 let booking=null,lastBookingStatus='not started';
 for(let attempt=0;attempt<10;attempt++){
   const response=await fetch(url+'/api/admin/booking-state',{headers:{Cookie:cookie},cache:'no-store'});
   lastBookingStatus='HTTP '+response.status;
   const body=await response.json().catch(()=>null);
   if(response.ok&&typeof body?.enabled==='boolean'&&Array.isArray(body.missing)){
     booking=body;break;
   }
   if(response.status===401){
     const again=await fetch(url+'/api/admin/login',{method:'POST',redirect:'error',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({password})});
     if(again.ok)cookie=again.headers.get('set-cookie')?.split(';')[0]||cookie;
   }
   if(attempt<9)await new Promise(resolve=>setTimeout(resolve,700*(attempt+1)));
 }
 if(!booking)throw Error('Owner booking readiness API not ready: '+lastBookingStatus);
 // Read-only smoke checks: no test bookings, real transfers or settings changes.
 let advanceReady=false;
 for(let attempt=0;attempt<10;attempt++){
   const [admin,denied]=await Promise.all([
     fetch(url+'/admin',{cache:'no-store'}),
     fetch(url+'/api/advance/view?id=00000000-0000-0000-0000-000000000000&token='+ '0'.repeat(64),{cache:'no-store'})
   ]);
   const html=await admin.text(),body=await denied.json().catch(()=>null);
   if(admin.ok&&html.includes('id="automaticBank"')&&html.includes('id="holdHours"')&&denied.status===404&&body?.error==='Счёт не найден.'){advanceReady=true;break;}
   if(attempt<9)await new Promise(resolve=>setTimeout(resolve,1000));
 }
 if(!advanceReady)throw Error('Advance booking controls or secure public route unavailable');
 console.log('Automatic bank advance UI ready; unknown payment link rejected.');
 // Authorized one-time tariff update; the database marker prevents overwriting later owner edits.
 const tariffUpdate=await fetch(url+'/api/admin/tariffs/competitive-2026',{method:'POST',headers:{Cookie:cookie,Origin:url,'Content-Type':'application/json'},body:'{}'});
 const tariffResult=await tariffUpdate.json().catch(()=>null);
 if(!tariffUpdate.ok||!tariffResult?.ok)throw Error('Competitive tariff migration failed (HTTP '+tariffUpdate.status+')');
 console.log('Competitive tariff migration: '+(tariffResult.alreadyApplied?'already applied':'applied; cities='+tariffResult.cityCount+', video cards='+tariffResult.videoCards+', payment mode='+tariffResult.paymentMode));
 const verifiedTariffs=await fetch(url+'/api/public-config',{cache:'no-store'}).then(r=>r.json());
 if(!tariffResult.alreadyApplied){
  const f=verifiedTariffs.fares;
  if(f?.performance?.rates?.gift?.[0]?.solo!==4500||f?.performance?.rates?.home?.[0]?.solo!==6000||f?.prepayments?.rules?.Kitee?.amount!==2000||verifiedTariffs.services?.gift?.label!=='от 45 €'||verifiedTariffs.services?.home?.label!=='от 60 €')throw Error('New public tariffs did not match the migration');
 }
 const doorstepUpdate=await fetch(url+'/api/admin/tariffs/doorstep-2026',{method:'POST',headers:{Cookie:cookie,Origin:url,'Content-Type':'application/json'},body:'{}'});
 const doorstepResult=await doorstepUpdate.json().catch(()=>null);
 if(!doorstepUpdate.ok||!doorstepResult?.ok)throw Error('Doorstep tariff migration failed (HTTP '+doorstepUpdate.status+')');
 if(!doorstepResult.alreadyApplied){
  const current=await fetch(url+'/api/public-config',{cache:'no-store'}).then(r=>r.json());
  const gift=current.fares?.performance?.rates?.gift;
  if(JSON.stringify(gift?.map(r=>[r.minutes,r.solo,r.duo]))!==JSON.stringify([[10,4000,6500],[15,4500,7500],[20,5500,9000]])||current.services?.gift?.label!=='от 40 €'||current.fares?.performance?.rates?.home?.find(r=>r.minutes===45)?.duo!==16000)throw Error('Doorstep tariff verification failed');
 }
 console.log('Doorstep tariff migration: '+(doorstepResult.alreadyApplied?'already applied':'applied and verified'));
 const copyUpdate=await fetch(url+'/api/admin/editor/intro-copy-2026',{method:'POST',headers:{Cookie:cookie,Origin:url,'Content-Type':'application/json'},body:'{}'});
 const copyResult=await copyUpdate.json().catch(()=>null);
 if(!copyUpdate.ok||!copyResult?.ok)throw Error('Intro copy migration failed (HTTP '+copyUpdate.status+')');
 if(!copyResult.alreadyApplied){
  const config=await fetch(url+'/api/public-config',{cache:'no-store'}).then(r=>r.json());
  const parts=config.site?.headingParts?.intro;
  if(parts&&JSON.stringify(parts.map(p=>[p.text,p.color,p.font]))!==JSON.stringify([['Не просто вручить подарок,','ink','normal'],['а подарить воспоминания.','gold','italic']]))throw Error('Intro copy verification failed');
 }
 console.log('Intro copy migration: '+(copyResult.alreadyApplied?'already applied':'applied and verified'));
 console.log('Owner calendar launch controls ready.');
 console.log('Readiness (no secret values): Turnstile='+booking.turnstileConfigured+', Resend='+booking.emailConfigured+', testEmailSent='+booking.mailTestSent+', liveBookings='+booking.enabled);
 await fetch(url+'/api/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:url}});
 console.log('Verified site '+url+' and admin '+url+'/admin');
}finally{for(const path of [config,secrets])try{unlinkSync(path)}catch{}}
