import {defaultFare,validFare,bookingPaymentMode,performanceRows} from '../docs/fares.js';
import {isVideoGreeting} from '../docs/video-service.js';
export const tariffVersion='competitive-2026-11-26-v1';
export const launchHolidayRules=[
 {name:'Сочельник · дневной пик',startDate:'24.12',startTime:'14:00',endDate:'24.12',endTime:'20:00',percent:20},
 {name:'31 декабря · день',startDate:'31.12',startTime:'00:00',endDate:'31.12',endTime:'18:00',percent:10},
 {name:'Новогодний вечер',startDate:'31.12',startTime:'18:00',endDate:'31.12',endTime:'22:00',percent:25},
 {name:'Новогодняя ночь',startDate:'31.12',startTime:'22:00',endDate:'01.01',endTime:'02:00',percent:50},
 {name:'Старый Новый год · вечер',startDate:'13.01',startTime:'18:00',endDate:'14.01',endTime:'00:00',percent:10}
];
const rule=amount=>({mode:'fixed',percent:0,amount});
export function competitiveFare(old=defaultFare){
 const prev=old.prepayments||defaultFare.prepayments;
 const km=old.km||defaultFare.km;
 const rules=Object.fromEntries(Object.entries(km).map(([city,distance])=>[city,rule(city==='Kitee'?2000:distance<=30?2500:5000)]));
 const next={...old,holidayRules:launchHolidayRules.map(x=>({...x})),holidayPercent:50,
  performance:{enabled:true,rates:{...(old.performance?.rates||{}),gift:[{minutes:15,solo:4500,duo:null}],home:[
   {minutes:20,solo:6000,duo:9500},{minutes:30,solo:8000,duo:12000},{minutes:45,solo:11000,duo:null}
  ]}},
  prepayments:{...prev,enabled:prev.enabled===true,defaultRule:rule(5000),rules}};
 if(!validFare(next))throw Error('New tariffs failed validation');
 return next;
}
export function competitiveContent(old){return {...old,giftPrice:'от 45 €',homePrice:'от 60 €'};}
export function competitiveModel(old={}){
 const model={...old,texts:{...(old.texts||{}),'programs-9':'от 45 €','programs-16':'от 60 €'},
  durations:{...(old.durations||{}),gift:'15 минут',home:'20 / 30 / 45 минут'},
  cards:(old.cards||[]).map(c=>isVideoGreeting(c)?{...c,price:'25 €'}:c)};
 return model;
}
export const doorstepVersion='doorstep-2026-11-26-v2';
export function doorstepFare(old){
 const gift=[{minutes:10,solo:4000,duo:null},{minutes:15,solo:4500,duo:null},{minutes:20,solo:5500,duo:null}];
 const next={...old,performance:{...old.performance,enabled:true,rates:{...old.performance?.rates,gift}}};
 if(!validFare(next))throw Error('Doorstep tariff failed validation');return next;
}
export function doorstepModel(old={}){return {...old,texts:{...old.texts,'programs-9':'от 40 €'},durations:{...old.durations,gift:'10 / 15 / 20 минут'}};}
export function applyDoorstepTariffs(db){return migrateTariffs(db,doorstepVersion,doorstepFare,old=>({...old,giftPrice:'от 40 €'}),doorstepModel);}
export function applyCompetitiveTariffs(db){return migrateTariffs(db,tariffVersion,competitiveFare,competitiveContent,competitiveModel);}
async function migrateTariffs(db,version,updateFare,updateContent,updateModel){
 const marker=await db.prepare("SELECT value FROM booking_settings WHERE key=?").bind(version).first();
 if(marker)return {ok:true,alreadyApplied:true};
 const old=await db.prepare("SELECT value FROM booking_settings WHERE key='travel_fare'").first();
 const content=await db.prepare("SELECT value FROM content WHERE key='site'").first();
 const latest=await db.prepare('SELECT id,body,published FROM site_revisions ORDER BY id DESC LIMIT 1').first();
 const published=await db.prepare('SELECT id,body,published FROM site_revisions WHERE published=1 ORDER BY id DESC LIMIT 1').first();
 const fares=updateFare(old?JSON.parse(old.value):defaultFare);
 const backup={tariff:old?.value||null,content:content?.value||null,published:published?.id||null,latest:latest?.id||null};
 const stamp=new Date().toISOString();
 const statements=[
  db.prepare('INSERT INTO booking_settings(key,value) VALUES(?,?)').bind(version,JSON.stringify(backup)),
  db.prepare("INSERT INTO booking_settings(key,value) VALUES('travel_fare',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(fares)),
  db.prepare("INSERT INTO content(key,value) VALUES('site',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(updateContent(content?JSON.parse(content.value):{})))
 ];
 const pub=published?JSON.parse(published.body):{};
 // Keep the exact previous published revision and any separate unpublished draft in history.
 if(published)statements.push(db.prepare('INSERT INTO site_revisions(body,published,created_at) VALUES(?,1,?)').bind(JSON.stringify(updateModel(pub)),stamp));
 if(latest&&latest.id!==published?.id)statements.push(db.prepare('INSERT INTO site_revisions(body,published,created_at) VALUES(?,0,?)').bind(JSON.stringify(updateModel(JSON.parse(latest.body))),stamp));
 try{await db.batch(statements);}catch(e){if(await db.prepare("SELECT value FROM booking_settings WHERE key=?").bind(version).first())return {ok:true,alreadyApplied:true};throw e;}
 return {ok:true,alreadyApplied:false,videoCards:(pub.cards||[]).filter(isVideoGreeting).length,cityCount:Object.keys(fares.km).length,paymentMode:bookingPaymentMode(fares.prepayments)};
}
