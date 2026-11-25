// Shared defaults for the invoice editor and the server. Tax treatment is independent.
export function invoiceService(key,remote=false,performance=null){
 let value;
 if(key==='gift')value={fi:'Esiintymispalvelu – Joulupukin lyhyt tervehdys ja lahjojen jako',ru:'Артистическая услуга — короткое поздравление Деда Мороза и вручение подарков'};
 else if(key==='home')value={fi:'Esiintymispalvelu – Joulupukin kotikäynti',ru:'Артистическая услуга — выступление Деда Мороза на дому'};
 else if(key==='event')value={fi:'Esiintymispalvelu – Joulupukin juhlaohjelma',ru:'Артистическая услуга — праздничная программа Деда Мороза'};
 else if(remote)value={fi:'Joulupukin etäohjelma',ru:'Дистанционная праздничная программа Деда Мороза'};
 else value={fi:'Joulupukin ohjelmapalvelu',ru:'Праздничная программа Деда Мороза'};
 if(performance?.performerCast==='duo'){
  value.fi+=' · mukana Lumineito';
  value.ru+=' · с участием Снегурочки';
 }
 if(Number.isInteger(performance?.durationMinutes)){
  value.fi+=' · '+performance.durationMinutes+' min';
  value.ru+=' · '+performance.durationMinutes+' минут';
 }
 return value;
}
