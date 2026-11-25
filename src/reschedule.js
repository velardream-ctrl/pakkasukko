import {clean,validStamp,addMinutes} from './validation.js';
const minutesBetween=(start,end)=>(Date.parse(end+'Z')-Date.parse(start+'Z'))/60000;
const active="b.status IN('pending','confirmed') AND d.final_status IS NULL";
export async function reschedule(req,env,reply,fiNow,now,notify){
 const fail=(error,status=400)=>reply({error},status);
 const db=env.DB,path=new URL(req.url).pathname,body=await req.json(),id=clean(body.id,80);
 const start=clean(body.startAt,16),minutes=Number(body.minutes);
 if(!validStamp(start)||start<=fiNow()||!Number.isInteger(minutes)||minutes<15||minutes>480)return fail('Укажите будущую дату и длительность от 15 до 480 минут.');
 const end=addMinutes(start,minutes);
 if(path.endsWith('/slots/edit')){
   const old=await db.prepare('SELECT * FROM slots WHERE id=?').bind(id).first();
   if(!old)return fail('Интервал не найден.',404);
   const status=body.status==='blocked'?'blocked':'open';
   if(old.status==='reserved')return fail('Время занято. Перенесите бронирование в карточке заявки.',409);
   try{
    const r=await db.prepare(`UPDATE slots SET start_at=?,end_at=?,status=?,note=? WHERE id=? AND status<>'reserved'
       AND start_at=? AND end_at=? AND NOT EXISTS(SELECT 1 FROM bookings b LEFT JOIN booking_details d ON d.booking_id=b.id WHERE b.slot_id=slots.id AND ${active})`).bind(start,end,status,clean(body.note,180),id,old.start_at,old.end_at).run();
    return r.meta.changes?reply({ok:true}):fail('Интервал содержит активную заявку или уже изменён.',409);
   }catch{return fail('Новое время пересекается с другим интервалом. Изменения не сохранены.',409);}
 }
 const row=await db.prepare(`SELECT b.*,s.start_at,s.end_at,s.status AS slot_status,d.final_status,q.snapshot,
 i.number AS invoice_number,t.trip_id FROM bookings b JOIN slots s ON s.id=b.slot_id
 LEFT JOIN booking_details d ON d.booking_id=b.id LEFT JOIN booking_quotes q ON q.booking_id=b.id
 LEFT JOIN invoices i ON i.booking_id=b.id LEFT JOIN trip_shares t ON t.booking_id=b.id WHERE b.id=?`).bind(id).first();
 if(!row)return fail('Заявка не найдена.',404);
 if(!['pending','confirmed'].includes(row.status)||row.final_status)return fail('Завершённые и отменённые заявки не переносятся.',409);
 if(row.invoice_number!=null||row.trip_id)return fail('Счёт уже выписан или поездка зафиксирована. Перенос заблокирован для защиты расчётов.',409);
 if(row.start_at!==body.oldStart||row.end_at!==body.oldEnd)return fail('Заявка уже изменилась. Обновите админку.',409);
 const quote=JSON.parse(row.snapshot||'{}');
 if(quote.groupSize>1&&start.slice(0,10)!==row.start_at.slice(0,10))return fail('Коллективный заказ нельзя переносить по одному адресу на другой день: сначала согласуйте новый расчёт всей поездки.',409);
 if(start===row.start_at&&end===row.end_at)return fail('Выберите другое время.');
 const conflicts=(await db.prepare('SELECT id,start_at,end_at,status FROM slots WHERE start_at<? AND end_at>? ORDER BY start_at').bind(end,start).all()).results;
 const target=conflicts.length===1&&conflicts[0].start_at===start&&conflicts[0].end_at===end&&conflicts[0].status==='open'?conflicts[0]:null;
 if(conflicts.length&&!target){
   const x=conflicts[0];return fail('ВНИМАНИЕ: время занято или пересекается с интервалом '+x.start_at.replace('T',' ')+' – '+x.end_at.replace('T',' ')+'. Прежняя бронь сохранена.',409);
 }
 if(target){
   const other=await db.prepare(`SELECT b.id FROM bookings b LEFT JOIN booking_details d ON d.booking_id=b.id WHERE b.slot_id=? AND ${active} LIMIT 1`).bind(target.id).first();
   if(other)return fail('ВНИМАНИЕ: на выбранное время уже есть активная заявка. Прежняя бронь сохранена.',409);
 }
 const newId=target?.id||crypto.randomUUID();
 try{
   await db.prepare('INSERT INTO booking_moves(id,booking_id,old_slot,new_slot,old_start,old_end,new_start,new_end,release_old,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,row.slot_id,newId,row.start_at,row.end_at,start,end,body.releaseOld===false?0:1,now()).run();
 }catch(e){return fail('ВНИМАНИЕ: перенос не выполнен. Время занято или данные заявки изменились. Прежняя бронь сохранена. Обновите календарь.',409);}
 let notification='not_requested';
 if(body.notify===true){
   notification='unavailable';
   if(row.email&&notify){try{await notify(row,start,end);notification='accepted';}catch{notification='failed';}}
 }
 return reply({ok:true,start,end,notification,travelReview:row.start_at.slice(0,10)!==start.slice(0,10)&&!quote.remote&&quote.travel>0});
}
