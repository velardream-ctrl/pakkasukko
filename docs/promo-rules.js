// Shared preview and authoritative server pricing. All money is integer cents.
export const promoKinds=['percent','fixed','waive_holiday','free_program','free_visit'];
export function promoDiscount(visit,rule,serviceId){
 if(!rule||!promoKinds.includes(rule.kind)||visit.remote||visit.groupSize>1||!Number.isSafeInteger(visit.base)||!Number.isSafeInteger(visit.travel)||visit.base<0||visit.travel<0)return null;
 if(rule.city&&rule.city!==visit.city||rule.service&&rule.service!==serviceId)return null;
 let discount=0;
 switch(rule.kind){
  case 'percent':if(!Number.isInteger(rule.value)||rule.value<1||rule.value>100)return null;discount=Math.round(visit.base*rule.value/100);break;
  case 'fixed':if(!Number.isSafeInteger(rule.value)||rule.value<1)return null;discount=Math.min(visit.base,rule.value);break;
  case 'waive_holiday':if(rule.holiday&&rule.holiday!==visit.holidayName)return null;discount=visit.holidayExtra||0;break;
  case 'free_program':discount=visit.base;break;
  case 'free_visit':if(visit.city!=='Kitee'||visit.travel!==0)return null;discount=visit.base;break;
 }
 if(!Number.isSafeInteger(discount)||discount<1||discount>visit.base)return null;
 const promo={id:rule.id,kind:rule.kind,discount,originalBase:visit.base,originalTotal:visit.total};
 return {...visit,base:visit.base-discount,total:visit.total-discount,promo,
  ...(rule.kind==='waive_holiday'?{holidayName:null,holidayPercent:0,holidayExtra:0,waivedHoliday:visit.holidayName}: {})};
}
export function normalizePromo(value){return typeof value==='string'?value.trim().toUpperCase().replace(/\s+/g,''):'';}
