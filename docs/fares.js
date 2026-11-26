import {approvedCity} from './city-distance.js';
import {deliveryConfig} from './video-service.js';
export const defaultHolidayRules=[
  {name:'Рождественская ночь',startDate:'24.12',startTime:'20:00',endDate:'25.12',endTime:'09:00',percent:50},
  {name:'Новогодняя ночь',startDate:'31.12',startTime:'20:00',endDate:'01.01',endTime:'09:00',percent:50},
  {name:'Старый Новый год',startDate:'13.01',startTime:'20:00',endDate:'14.01',endTime:'09:00',percent:50}
];
const YEAR_MINUTES=365*24*60;
function dayMinute(date,time){
 const d=/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/.exec(String(date||''));
 const h=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time||''));
 if(!d||!h)return null;
 const stamp=Date.UTC(2025,Number(d[2])-1,Number(d[1]));
 const correct=new Date(stamp);
 if(correct.getUTCDate()!==Number(d[1])||correct.getUTCMonth()+1!==Number(d[2]))return null;
 return Math.round((stamp-Date.UTC(2025,0,1))/60000)+Number(h[1])*60+Number(h[2]);
}
function holidayWindow(rule){
 if(!rule||typeof rule!=='object'||Array.isArray(rule))return null;
 const start=dayMinute(rule.startDate,rule.startTime),rawEnd=dayMinute(rule.endDate,rule.endTime);
 if(start===null||rawEnd===null)return null;
 const end=rawEnd<=start?rawEnd+YEAR_MINUTES:rawEnd;
 return end-start>=15&&end-start<=72*60?{start,end}:null;
}
export function validHolidayRule(rule){
 return Boolean(holidayWindow(rule))&&typeof rule.name==='string'&&rule.name.length>=1&&rule.name.length<=80&&rule.name===rule.name.trim()
   &&Number.isInteger(rule.percent)&&rule.percent>=0&&rule.percent<=300;
}
export const defaultFare={fuel:2.20,consumption:10,holidayPercent:50,km:{Kitee:0,Puhos:15,'Tohmajärvi':20,Joensuu:67},routes:{},prepayments:{enabled:true,dueDays:14,defaultRule:{mode:'fixed',percent:0,amount:5000},rules:{}}};
// Rates are stored in integer cents. An empty price means that artist combination
// cannot be booked for that duration. Older tariffs continue to work unchanged.
export function validPerformanceConfig(value){
 if(value===undefined)return true;
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean'
   ||!value.rates||typeof value.rates!=='object'||Array.isArray(value.rates))return false;
 const services=Object.entries(value.rates);
 if(services.length>60)return false;
 for(const [id,rows] of services){
  if(!/^[a-z0-9_-]{1,80}$/i.test(id)||['__proto__','prototype','constructor'].includes(id.toLowerCase())
    ||!Array.isArray(rows)||rows.length>25)return false;
  const seen=new Set();
  for(const row of rows){
   if(!row||!Number.isInteger(row.minutes)||row.minutes<10||row.minutes>480||seen.has(row.minutes))return false;
   seen.add(row.minutes);
   if(!['solo','duo'].every(key=>row[key]===null||Number.isInteger(row[key])&&row[key]>=0&&row[key]<=10000000))return false;
   if(row.solo===null&&row.duo===null)return false;
  }
 }
 return true;
}
export function performanceRows(fare,service){
 if(fare?.performance?.enabled!==true)return [];
 const rows=fare.performance.rates?.[service];
 return Array.isArray(rows)?rows:[];
}
export function performanceChoice(fare,service,minutes,cast){
 if(!['solo','duo'].includes(cast)||!Number.isInteger(minutes))return null;
 const row=performanceRows(fare,service).find(r=>r.minutes===minutes);
 return row&&Number.isInteger(row[cast])?{minutes,cast,amount:row[cast]}:null;
}

// Prepayment is part of the agreed service price; no automatic no-show fine.
// Per-city tariffs are frozen inside each booking snapshot on submission.
export function bookingPaymentMode(settings){
 if(settings?.enabled!==true)return 'none';
 return settings.paymentMethod==='stripe'?'stripe':'bank';
}
export function validPrepayments(value,km){
 if(value===undefined)return true;
 if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.enabled!=='boolean'
   ||!Number.isInteger(value.dueDays)||value.dueDays<1||value.dueDays>30
   ||!value.rules||typeof value.rules!=='object'||Array.isArray(value.rules))return false;
 if(value.paymentMethod!==undefined&&(!['none','bank','stripe'].includes(value.paymentMethod)||value.enabled!==(value.paymentMethod!=='none')))return false;
 if(value.automaticBank!==undefined&&typeof value.automaticBank!=='boolean')return false;
 if(value.holdHours!==undefined&&(!Number.isInteger(value.holdHours)||value.holdHours<1||value.holdHours>168))return false;
 if(Object.keys(value.rules).length>100)return false;
 const base=value.defaultRule||{mode:'fixed',percent:0,amount:5000};
 if(!['none','travel','percent','fixed'].includes(base.mode)||!Number.isInteger(base.percent)||base.percent<0||base.percent>100||!Number.isInteger(base.amount)||base.amount<0||base.amount>10000000)return false;
 for(const [city,rule] of Object.entries(value.rules)){
  if(!Object.hasOwn(km,city)||!rule||typeof rule!=='object'||Array.isArray(rule))return false;
  if(!['inherit','none','travel','percent','fixed'].includes(rule.mode))return false;
  if(!Number.isInteger(rule.percent)||rule.percent<0||rule.percent>100
    ||!Number.isInteger(rule.amount)||rule.amount<0||rule.amount>10000000)return false;
 }
 return true;
}
export function prepaymentForVisit(fare,visit){
 const settings=fare?.prepayments||defaultFare.prepayments;
 if(bookingPaymentMode(settings)==='none'||visit.remote)return null;
 const override=settings.rules?.[visit.city];
 const rule=override&&override.mode!=='inherit'?override:(settings.defaultRule||defaultFare.prepayments.defaultRule);
 if(rule.mode==='none')return null;
 const total=visit.total;
 if(total===null&&rule.mode!=='fixed')return null;
 const raw=rule.mode==='travel'?visit.travel:
   rule.mode==='percent'?Math.round(total*rule.percent/100):rule.amount;
 const amount=total===null?Math.max(0,raw||0):Math.min(total,Math.max(0,raw||0));
 return amount>0?{mode:rule.mode,amount,city:visit.city,dueDays:settings.dueDays,
   ...(rule.mode==='percent'?{percent:rule.percent}:{}),...(settings.paymentMethod?{paymentMethod:bookingPaymentMode(settings)}:{})}:null;
}
export function validFare(f){
  const number=(n,min,max)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
  if(!number(f?.fuel,0.001,20)||!number(f?.consumption,0.1,100)||f.km?.Kitee!==0)return false;
  if(f.holidayPercent!==undefined&&(!Number.isInteger(f.holidayPercent)||!number(f.holidayPercent,0,300)))return false;
  if(f.holidayRules!==undefined&&(!Array.isArray(f.holidayRules)||f.holidayRules.length>60||!f.holidayRules.every(validHolidayRule)))return false;
  if(f.holidaySort!==undefined&&!['date','percent_desc','percent_asc','name'].includes(f.holidaySort))return false;
  if(!validPerformanceConfig(f.performance)||!validPrepayments(f.prepayments,f.km))return false;
  const cities=Object.keys(f.km),seen=new Set();
  if(cities.length>100 || !f.routes || typeof f.routes!=='object' || Array.isArray(f.routes))return false;
  if(Object.keys(f.routes).some(city=>!Object.hasOwn(f.km,city)))return false;
  for(const city of cities){
    const key=city.toLowerCase();
    if(!city.trim()||city!==city.trim()||city.length>80||seen.has(key)||['__proto__','constructor','prototype','другой город'].includes(key)||!number(f.km[city],0,2000))return false;
    seen.add(key);
    const r=f.routes[city];
    if(!r)continue;
    if(!['car','rail'].includes(r.mode)||!number(r.ticket,0,5000)||!number(r.nights,0,30)||!Number.isInteger(r.nights)||!number(r.hotel,0,2000)||!number(r.meals,0,2000))return false;
  }
  return true;
}
export function prices(site={},content={}){
  // Existing editor text keys for the price elements in the three original cards.
  const items={};
  for(const [service,key,field,fallback] of [['gift',9,'giftPrice','от 50 €'],['home',16,'homePrice','от 100 €'],['event',23,'eventPrice','По запросу']]){
    items[service]={label:site.texts?.['programs-'+key]??content[field]??fallback,remote:deliveryConfig(site,service)?.mode==='delivery'};
  }
  for(const card of site.cards||[])items[card.id]={label:card.price||'По запросу',remote:deliveryConfig(site,card.id)?.mode==='delivery'||(!Object.hasOwn(site.deliveryModes||{},card.id)&&/онлайн/i.test(card.title))};
  return items;
}
export const euros=cents=>(cents/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
// All recurring rules are compared in Finland's local calendar, not UTC.
// When rules overlap, the highest percentage is used; ties keep the first rule.
export const holidayRate=fare=>Number.isInteger(fare?.holidayPercent)&&fare.holidayPercent>=0&&fare.holidayPercent<=300?fare.holidayPercent:50;
export function holidayRules(fare=defaultFare){
 if(Array.isArray(fare?.holidayRules))return fare.holidayRules;
 const rate=holidayRate(fare);
 return defaultHolidayRules.map(rule=>({...rule,percent:rate}));
}
export function holidayInfo(startAt,fare=defaultFare){
 const m=/^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(startAt||''));
 if(!m)return null;
 const point=dayMinute(m[2]+'.'+m[1],m[3]+':'+m[4]);
 if(point===null)return null;
 let best=null;
 for(const rule of holidayRules(fare)){
   if(!validHolidayRule(rule))continue;
   const {start,end}=holidayWindow(rule);
   if((point>=start&&point<end)||(point+YEAR_MINUTES>=start&&point+YEAR_MINUTES<end)){
     if(!best||rule.percent>best.percent)best={name:rule.name,percent:rule.percent};
   }
 }
 return best?.percent>0?best:null;
}
export const holidayNight=(startAt,fare=defaultFare)=>holidayInfo(startAt,fare)?.name||null;
export function quote(fare,item,city,group=false,visitTimes=[],performance=null){
  city=approvedCity(fare,city)||city;
  const match=String(item.label).trim().match(/^(?:от\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:€|евро)?$/iu);
  const base=performance?performance.amount:match?Math.round(Number(match[1].replace(',','.'))*100):null;
  const known=Object.hasOwn(fare.km,city),local=item.remote||city==='Kitee';
  const route=known&&!local?fare.routes?.[city]:null;
  const rail=route?.mode==='rail';
  const km=local?0:known&&!rail?fare.km[city]*2:null;
  const transport=rail?Math.round(route.ticket*100):km===null?null:Math.round(km*fare.fuel*fare.consumption+1e-8);
  const nights=route?.nights||0,nightly=Math.round((route?.hotel||0)*100);
  const hotel=nights*nightly,meals=Math.round((route?.meals||0)*100);
  const travel=transport===null?null:transport+hotel+meals;
  return {city,group,remote:item.remote,label:item.label,base,mode:rail?'rail':'car',km,fuel:fare.fuel,consumption:fare.consumption,
    transport,nights,nightly,hotel,meals,travel,total:base===null||travel===null?null:base+travel,
    holidayPercent:holidayRate(fare),visitTimes:[...visitTimes].sort(),
    holidayVisits:[...visitTimes].sort().map(time=>holidayInfo(time,fare)),
    ...(performance?{durationMinutes:performance.minutes,performerCast:performance.cast}: {})};
}
export function describe(q){
  let ride;
  if(q.remote)ride='Дистанционно, без выезда';
  else if(q.travel===null)ride='Поездка по согласованию';
  else if(q.city==='Kitee')ride='Выезд по Kitee без доплаты';
  else if(q.mode==='rail')ride='Поезд, билеты туда и обратно '+euros(q.transport);
  else ride='Автомобиль, туда и обратно '+q.km+' км · '+euros(q.transport);
  const parts=[...(q.durationMinutes?[(q.performerCast==='duo'?'Дед Мороз и Снегурочка':'Дед Мороз')+' · '+q.durationMinutes+' минут']:[]),'Программа '+(q.base===null?'по согласованию':euros(q.base)),ride];
  if(q.holidayName)parts.push(q.holidayName+' · +'+q.holidayPercent+'% к программе'+(q.holidayExtra===null?' (стоимость по согласованию)':' ('+euros(q.holidayExtra)+')'));
  if(q.hotel)parts.push('Гостиница ('+q.nights+' ноч.) '+euros(q.hotel));
  if(q.meals)parts.push('Питание '+euros(q.meals));
  if(q.discount)parts.push('Скидка по коду '+euros(q.discount));
  parts.push(q.total===null?'Итого по согласованию':'Итого '+euros(q.total));
  if(q.group)parts.push('Коллективная заявка');
  return parts.join(' · ');
}

// Distribute integer cents in chronological order, without losing a rounding cent.
export function visitQuote(q,count,index){
 const holiday=q.remote?null:q.holidayVisits?.[index];
 const holidayName=holiday?.name||(q.holidayVisits?null:holidayNight(q.visitTimes?.[index]));
 const holidayPercent=holidayName?(holiday?.percent??q.holidayPercent??50):0;
 const holidayExtra=holidayName?(q.base===null?null:Math.round(q.base*holidayPercent/100)):0;
 const base=q.base===null?null:q.base+holidayExtra;
 const travel=count===1?q.travel:q.travel===null?null:Math.floor(q.travel/count)+(index<q.travel%count?1:0);
 return {...q,...(count>1?{group:true,groupSize:count,tripCost:q.travel}:{}),
   regularBase:q.base,base,holidayName,holidayPercent,holidayExtra,travel,
   total:base===null||travel===null?null:base+travel};
}
