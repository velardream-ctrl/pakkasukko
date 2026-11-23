export const DEFAULT_CONTENT=Object.freeze({
 giftPrice:"от 50 €",homePrice:"от 100 €",eventPrice:"По запросу",
 bio:"Мой путь Деда Мороза начался в 1995 году. За плечами — праздничные представления для детей и взрослых, опыт театральной сцены и выступления в роли главного Деда Мороза Республики Карелия во время работы в театре оперы и балета.",
 travel:"Основные районы выездов — Китее, Пухос, Тохмаярви и окрестности. Возможны поездки в Йоэнсуу и другие города по индивидуальной договорённости."
});
export function clean(value,max=200){return typeof value==='string'?value.trim().slice(0,max):'';}
export function normalizeContent(input){const output={...DEFAULT_CONTENT};for(const key of Object.keys(DEFAULT_CONTENT)){const raw=clean(input?.[key],key==='bio'||key==='travel'?2000:80);if(raw)output[key]=raw;}return output;}
export function validStamp(s){
 if(typeof s!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])T([01]\d|2[0-3]):[0-5]\d$/.test(s))return false;
 const date=new Date(s+':00Z');return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,16)===s;
}
export function addMinutes(stamp,minutes){
 if(!validStamp(stamp)||!Number.isInteger(minutes)||minutes<1||minutes>720)throw Error('Неверное время.');
 return new Date(Date.parse(stamp+':00Z')+minutes*60000).toISOString().slice(0,16);
}
export function validateBooking(input){
 const b={slotId:clean(input?.slotId,80),service:clean(input?.service,30),name:clean(input?.name,100),phone:clean(input?.phone,40),
 email:clean(input?.email,150),city:clean(input?.city,100),address:clean(input?.address,200),message:clean(input?.message,1200),turnstileToken:clean(input?.turnstileToken,2048)};
 if(!/^[\w-]{6,80}$/.test(b.slotId))throw Error('Выберите время.');
 if(!['gift','home','event'].includes(b.service))throw Error('Выберите формат праздника.');
 if(b.name.length<2||b.phone.length<5||b.city.length<2||b.address.length<3)throw Error('Укажите имя, телефон, город и адрес.');
 if(b.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))throw Error('Неверный email.');
 return b;
}
export function csvCell(value){
 let s=String(value??'').replaceAll('\r',' ').replaceAll('\n',' ');
 if(/^\s*[=+\-@]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
}