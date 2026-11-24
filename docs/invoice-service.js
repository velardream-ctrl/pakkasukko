// Shared defaults for the invoice editor and the server. Tax treatment is independent.
export function invoiceService(key,remote=false){
 if(key==='gift')return {fi:'Esiintymispalvelu – Joulupukin lyhyt tervehdys ja lahjojen jako',ru:'Артистическая услуга — короткое поздравление Деда Мороза и вручение подарков'};
 if(key==='home')return {fi:'Esiintymispalvelu – Joulupukin kotikäynti',ru:'Артистическая услуга — выступление Деда Мороза на дому'};
 if(key==='event')return {fi:'Esiintymispalvelu – Joulupukin juhlaohjelma',ru:'Артистическая услуга — праздничная программа Деда Мороза'};
 if(remote)return {fi:'Joulupukin etäohjelma',ru:'Дистанционная праздничная программа Деда Мороза'};
 return {fi:'Joulupukin ohjelmapalvelu',ru:'Праздничная программа Деда Мороза'};
}
