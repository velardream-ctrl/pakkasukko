import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,PAKKASUKKO_ADMIN_PASSWORD:password}=process.env;
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
if(!original.includes('name = "pakkasukko"')||!original.includes('ACCEPT_BOOKINGS = "false"'))throw Error('Unexpected deployment configuration');
const config='.pakkasukko-preview.toml', secrets=process.env.RUNNER_TEMP+'/pakkasukko-worker-secrets.json';
const wrangler=(...args)=>execFileSync('node_modules/.bin/wrangler',[...args,'--config',config],{stdio:'inherit'});
try{
 writeFileSync(config,original.replace('00000000-0000-0000-0000-000000000000',db.uuid));
 writeFileSync(secrets,JSON.stringify({ADMIN_PASSWORD:password,SESSION_SECRET:randomBytes(48).toString('hex')}),{mode:0o600});
 wrangler('d1','execute',dbName,'--remote','--file=schema.sql');
 wrangler('deploy','--secrets-file',secrets);
 const {subdomain}=await call('/workers/subdomain');
 if(!/^[a-z0-9-]+$/.test(subdomain))throw Error('Unexpected workers.dev subdomain');
 const url='https://pakkasukko.'+subdomain+'.workers.dev';
 const health=await (await fetch(url+'/api/public-config')).json();
 if(health.bookingsEnabled!==false)throw Error('Public configuration check failed');
 const login=await fetch(url+'/api/admin/login',{method:'POST',redirect:'error',headers:{Origin:url,'Content-Type':'application/json'},body:JSON.stringify({password})});
 if(!login.ok)throw Error('Owner login check failed');
 const cookie=login.headers.get('set-cookie').split(';')[0];
 const editor=await fetch(url+'/api/admin/editor',{headers:{Cookie:cookie}});
 if(!editor.ok||!Array.isArray((await editor.json()).history))throw Error('Editor check failed');
 await fetch(url+'/api/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:url}});
 console.log('Verified site '+url+' and admin '+url+'/admin');
}finally{for(const path of [config,secrets])try{unlinkSync(path)}catch{}}
