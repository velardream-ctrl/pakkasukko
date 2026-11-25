// Calendar dates shown to the owner are only a picker UI.
// Pricing rules deliberately store DD.MM (without a year) and recur annually.
export function annualToISO(dayMonth,year){
 const m=/^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/.exec(String(dayMonth||''));
 if(!m||!Number.isInteger(year)||year<2000||year>2100)return '';
 const iso=String(year)+'-'+m[2]+'-'+m[1];
 const date=new Date(iso+'T12:00:00Z');
 return !Number.isNaN(+date)&&date.toISOString().slice(0,10)===iso?iso:'';
}
export function nextAnnualISO(dayMonth,todayISO){
 let year=Number(String(todayISO).slice(0,4));
 if(!Number.isInteger(year))return '';
 let iso=annualToISO(dayMonth,year);
 if(!iso||iso<todayISO)iso=annualToISO(dayMonth,year+1);
 return iso;
}
export function endAnnualISO(startISO,dayMonth){
 const year=Number(String(startISO).slice(0,4));
 let end=annualToISO(dayMonth,year);
 if(end&&end<startISO)end=annualToISO(dayMonth,year+1);
 return end;
}
export function isoToAnnual(iso){
 const m=/^20\d{2}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.exec(String(iso||''));
 if(!m)return '';
 const date=new Date(iso+'T12:00:00Z');
 return !Number.isNaN(+date)&&date.toISOString().slice(0,10)===iso?m[2]+'.'+m[1]:'';
}

const startKey=(rule,todayISO)=>(nextAnnualISO(rule.startDate,todayISO)||'9999-12-31')+'T'+String(rule.startTime||'23:59');
export function compareHolidayRules(a,b,mode='date',todayISO='2026-01-01'){
 const byDate=startKey(a,todayISO).localeCompare(startKey(b,todayISO));
 if(mode==='percent_desc')return (Number(b.percent)-Number(a.percent))||byDate;
 if(mode==='percent_asc')return (Number(a.percent)-Number(b.percent))||byDate;
 if(mode==='name')return String(a.name||'').localeCompare(String(b.name||''),'ru')||byDate;
 return byDate;
}

export function shiftEndForNewStart(previousStartISO,previousEndISO,newStartISO){
 const parse=iso=>/^20\d{2}-\d{2}-\d{2}$/.test(String(iso||''))?Date.parse(iso+'T12:00:00Z'):NaN;
 const oldStart=parse(previousStartISO),oldEnd=parse(previousEndISO),newStart=parse(newStartISO);
 if(![oldStart,oldEnd,newStart].every(Number.isFinite))return '';
 const days=(oldEnd-oldStart)/86400000;
 if(!Number.isInteger(days)||days<0||days>3)return '';
 return new Date(newStart+days*86400000).toISOString().slice(0,10);
}
