// Bounded operator diagnostic. Never logs keys, raw Google errors, or customer data.
import {pathToFileURL} from 'node:url';

const cities=['Kitee','Joensuu','Savonlinna','Kuopio','Helsinki'];
const safeReasons=new Set(['BILLING_DISABLED','SERVICE_DISABLED','API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','CONSUMER_INVALID','RATE_LIMIT_EXCEEDED','QUOTA_EXCEEDED']);

export async function checkGoogleRoutes(apiKey,fetcher=fetch){
 if(!apiKey)return [{status:'MISSING_SERVER_KEY'}];
 const results=[];
 for(const city of cities){
  try{
   const response=await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes',{
    method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':apiKey,'X-Goog-FieldMask':'routes.distanceMeters'},
    body:JSON.stringify({origin:{address:'Kitee, Finland'},destination:{address:city+', Finland'},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',regionCode:'FI',languageCode:'fi-FI'}),signal:AbortSignal.timeout(8000)
   });
   const data=await response.json();
   if(!response.ok){
    const reasons=[...new Set((data.error?.details||[]).map(d=>d.reason).filter(r=>safeReasons.has(r)))];
    results.push({city,status:'GOOGLE_REJECTED',httpStatus:response.status,reasons});
    // Billing/key/quota failures apply to every city; stop instead of repeating them.
    if([401,403,429].includes(response.status)){for(const remaining of cities.slice(results.length))results.push({city:remaining,status:'SKIPPED_AFTER_PROVIDER_REJECTION'});break;}
    continue;
   }
   const meters=data.routes?.[0]?.distanceMeters;
   results.push(Number.isInteger(meters)&&meters>=0&&meters<=2000000?{city,status:'OK',oneWayKm:Math.ceil(meters/1000),roundTripKm:2*Math.ceil(meters/1000)}:{city,status:'NO_VALID_ROUTE'});
  }catch{results.push({city,status:'PROVIDER_UNAVAILABLE'});break;}
 }
 return results;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const results=await checkGoogleRoutes(process.env.PAKKASUKKO_GOOGLE_ROUTES_API_KEY);
 console.log(JSON.stringify({origin:'Kitee',results},null,2));
 if(results.some(r=>r.status!=='OK'))process.exitCode=1;
}
