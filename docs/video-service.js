export const VIDEO_LEAD_DAYS=7;
export function isVideoGreeting(card){return /видео|videotervehdys|video greeting/i.test(String(card?.title||''))||/видеопоздравление/i.test(String(card?.label||''));}
export function earliestDelivery(today,days=VIDEO_LEAD_DAYS){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function helsinkiDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export const videoNotice='Закажите видеопоздравление минимум за 7 календарных дней до желаемой даты получения. Дед Мороз лично записывает каждое поздравление, а Снегурочка заботится о монтаже.';

export const BUILTIN_SERVICES=[
 {id:'gift',title:'Дед Мороз у порога',description:'Короткое поздравление',titleKeys:[6,7],descriptionKey:8},
 {id:'home',title:'Сказка для всей семьи',description:'Домашняя программа',titleKeys:[13,14],descriptionKey:15},
 {id:'event',title:'Большое новогоднее шоу',description:'Праздничное мероприятие',titleKeys:[20,21],descriptionKey:22}
];
export function serviceCard(model,id){
 const builtin=BUILTIN_SERVICES.find(x=>x.id===id);
 if(builtin){const texts=model?.texts||{};return {...builtin,title:builtin.titleKeys.every(k=>typeof texts['programs-'+k]==='string')?builtin.titleKeys.map(k=>texts['programs-'+k].trim()).join(' '):builtin.title,description:texts['programs-'+builtin.descriptionKey]??builtin.description};}
 return (model?.cards||[]).find(c=>c.id===id);
}
export function deliveryConfig(model,id){
 const card=serviceCard(model,id);
 if(!card)return null;
 const saved=Object.hasOwn(model?.deliveryModes||{},id)?model.deliveryModes[id]:null;
 const video=isVideoGreeting(card);
 const mode=['visit','delivery'].includes(saved?.mode)?saved.mode:video?'delivery':'visit';
 const min=video?7:0;
 const days=Number.isInteger(saved?.days)&&saved.days>=min&&saved.days<=365?saved.days:7;
 return {mode,days,video};
}
export function deliveryNotice(config){
 if(!config||config.mode!=='delivery')return '';
 const lead=config.days?'Оформите заказ минимум за '+config.days+' календарных дн. до желаемой даты получения.':'Укажите желаемую дату получения.';
 return lead+(config.video?' Дед Мороз лично записывает каждое поздравление, а Снегурочка заботится о монтаже.':' Дата готовности и условия будут подтверждены индивидуально.');
}
export function deliveryLink(id){return './video.html?service='+encodeURIComponent(id);}
