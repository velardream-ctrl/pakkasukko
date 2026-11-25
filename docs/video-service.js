export const VIDEO_LEAD_DAYS=7;
export function isVideoGreeting(card){return /видео|videotervehdys|video greeting/i.test(String(card?.title||''))||/видеопоздравление/i.test(String(card?.label||''));}
export function earliestDelivery(today){const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+VIDEO_LEAD_DAYS);return d.toISOString().slice(0,10);}
export function helsinkiDay(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Helsinki',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export const videoNotice='Закажите видеопоздравление минимум за 7 календарных дней до желаемой даты получения. Дед Мороз лично записывает каждое поздравление, а Снегурочка заботится о монтаже.';
