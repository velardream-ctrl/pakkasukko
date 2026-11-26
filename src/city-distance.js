import {approvedCity,validCityQuery,routeName,distanceDefaults,validDistanceSettings,validPin} from '../docs/city-distance.js';
export async function distanceSettings(env){
 if(!env.DB)return {...distanceDefaults,configured:false};
 const row=await env.DB.prepare("SELECT value FROM booking_settings WHERE key='distance_lookup'").first();
 let value;try{value=JSON.parse(row?.value||'null');}catch{}
 const s=validDistanceSettings(value)?value:distanceDefaults;
 return {...s,configured:Boolean(env.GOOGLE_ROUTES_API_KEY&&env.GOOGLE_MAPS_BROWSER_KEY),browserKey:s.enabled&&env.GOOGLE_ROUTES_API_KEY?env.GOOGLE_MAPS_BROWSER_KEY||'':''};
}
export async function saveDistanceSettings(env,v){
 if(!validDistanceSettings(v)||v.enabled&&!(env.GOOGLE_ROUTES_API_KEY&&env.GOOGLE_MAPS_BROWSER_KEY))return false;
 await env.DB.prepare("INSERT INTO booking_settings(key,value) VALUES('distance_lookup',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({origin:v.origin.trim(),enabled:v.enabled,dailyLimit:v.dailyLimit})).run();return true;
}
export async function lookupDistance(env,city,fare,settings,fetcher=fetch,pin=null){
 if(!validCityQuery(city))return {kind:'unknown'};
 const known=approvedCity(fare,city);
 if(known&&!pin)return {kind:'approved',city:known,origin:'Kitee',km:fare.routes?.[known]?.mode==='rail'?null:fare.km[known]};
 if(pin&&!validPin(pin))return {kind:'unknown'};
 if(!settings.enabled||!settings.configured)return {kind:'unknown'};
 // This provider result is a transient estimate, never stored as a binding tariff.
 const now=new Date().toISOString(),since=new Date(Date.now()-86400000).toISOString();
 const permit=await env.DB.prepare("INSERT INTO attempts(kind,ip_hash,created_at) SELECT 'route-provider','global',? WHERE (SELECT COUNT(*) FROM attempts WHERE kind='route-provider' AND created_at>=?)<?").bind(now,since,settings.dailyLimit).run();
 if(!permit.meta.changes)return {kind:'limited'};
 try{
  const response=await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':env.GOOGLE_ROUTES_API_KEY,'X-Goog-FieldMask':'routes.distanceMeters,routes.duration'},body:JSON.stringify({origin:{address:settings.origin+', Finland'},destination:pin?{location:{latLng:{latitude:pin.lat,longitude:pin.lng}}}:{address:routeName(city)+', Finland'},travelMode:'DRIVE',routingPreference:'TRAFFIC_UNAWARE',regionCode:'FI',languageCode:'fi-FI'}),signal:AbortSignal.timeout(8000)});
  if(!response.ok)return {kind:'unknown'};
  const route=(await response.json()).routes?.[0];
  if(!Number.isInteger(route?.distanceMeters)||route.distanceMeters<0||route.distanceMeters>2000000)return {kind:'unknown'};
  return {kind:'estimate',origin:settings.origin,km:Math.ceil(route.distanceMeters/1000),provider:'Google Maps'};
 }catch{return {kind:'unknown'};}
}
