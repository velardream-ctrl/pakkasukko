const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const field=(box,title,type,value)=>{const label=el('label',title),input=el('input');Object.assign(input,{type,value});label.append(input);box.append(label);return input;};
const btn=(box,title,fn)=>{const b=el('button',title);b.type='button';b.onclick=fn;box.append(b);return b;};
const minutes=(v)=>(Date.parse(v.end_at+'Z')-Date.parse(v.start_at+'Z'))/60000;
function panel(box,title){const p=el('details');p.append(el('summary',title));p.style.margin='12px 0';box.append(p);return p;}
function result(box){const out=el('p');out.setAttribute('role','alert');out.style.fontWeight='700';box.append(out);return (s,bad=false)=>{out.textContent=s;out.style.color=bad?'#a02626':'#176840';};}
export function moveControls(box,v,slots,request,reload){
 const history=panel(box,'История переносов');const list=el('div');history.append(list);
 history.ontoggle=async()=>{if(!history.open)return;try{const {moves}=await request('/api/admin/bookings/move-history?id='+encodeURIComponent(v.id));list.replaceChildren(...(moves.length?moves.map(m=>el('p',m.old_start.replace('T',' ')+' → '+m.new_start.replace('T',' ')+' · '+m.created_at.slice(0,10))):[el('p','Переносов пока не было.')]));}catch(e){list.textContent=e.message;}};
 if(v.final_status||!['pending','confirmed'].includes(v.status))return;
 if(v.invoice_number||v.share!=null){box.append(el('p','Перенос недоступен: счёт выписан или поездка зафиксирована.'));return;}
 const p=panel(box,'Перенести бронирование'),pick=el('select');pick.add(new Option('Указать новую дату и время',''));for(const s of slots.filter(s=>s.status==='open'&&s.start_at!==v.start_at))pick.add(new Option(s.start_at.replace('T',' ')+' — '+s.end_at.slice(11),s.id));const l=el('label','Выбрать свободный интервал');l.append(pick);p.append(l);
 const date=field(p,'Новая дата и время','datetime-local',v.start_at),length=field(p,'Длительность, минут','number',minutes(v));length.min=15;length.max=480;
 pick.onchange=()=>{const s=slots.find(x=>x.id===pick.value);if(s){date.value=s.start_at;length.value=minutes(s);}};
 const release=field(p,'Освободить прежнее время (иначе заблокировать)','checkbox','');release.checked=true;release.disabled=v.status!=='confirmed';
 const notify=field(p,'Отправить клиенту уведомление о переносе','checkbox','');notify.checked=false;notify.disabled=!v.email;
 const show=result(p);const check=()=>{
  const start=date.value,n=Number(length.value),end=new Date(Date.parse(start+'Z')+n*60000);
  if(!start||!Number.isFinite(+end)||!Number.isInteger(n)||n<15||n>480)return;
  const stop=end.toISOString().slice(0,16),hits=slots.filter(s=>s.start_at<stop&&s.end_at>start);
  if(start===v.start_at&&stop===v.end_at){show('Выберите другое время.');return;}
  if(hits.length&&!(hits.length===1&&hits[0].status==='open'&&hits[0].start_at===start&&hits[0].end_at===stop)){show('ВНИМАНИЕ: выбранное время занято или пересекается с '+hits[0].start_at.replace('T',' ')+'.',true);return;}
  show('Проверка на сервере при сохранении обязательна.');
 };
 date.oninput=length.oninput=check;pick.addEventListener('change',check);
 const save=btn(p,'Подтвердить перенос',async()=>{if(!date.reportValidity()||!length.reportValidity())return;if(!confirm('Перенести заявку на '+date.value.replace('T',' ')+'?'))return;save.disabled=true;try{const r=await request('/api/admin/bookings/move','POST',{id:v.id,oldStart:v.start_at,oldEnd:v.end_at,startAt:date.value,minutes:Number(length.value),releaseOld:release.checked,notify:notify.checked});let msg='Бронирование перенесено.';if(r.notification==='accepted')msg+=' Уведомление принято почтовым сервисом.';else if(r.notification==='failed'||r.notification==='unavailable')msg+=' Письмо не отправлено: сообщите клиенту вручную.';if(r.travelReview)msg+=' Проверьте транспортные расходы для новой даты.';alert(msg);await reload();}catch(e){show(e.message,true);alert(e.message);}finally{save.disabled=false;}});
}
export function slotControls(box,s,request,reload){
 if(s.status==='reserved')return;
 const p=panel(box,'Редактировать интервал'),date=field(p,'Дата и время','datetime-local',s.start_at),length=field(p,'Длительность, минут','number',minutes(s)),note=field(p,'Примечание','text',s.note||'');length.min=15;length.max=480;
 const label=el('label','Статус'),select=el('select');select.add(new Option('Свободно','open'));select.add(new Option('Заблокировано','blocked'));select.value=s.status;label.append(select);p.append(label);
 const show=result(p);const save=btn(p,'Сохранить интервал',async()=>{save.disabled=true;try{await request('/api/admin/slots/edit','POST',{id:s.id,startAt:date.value,minutes:Number(length.value),status:select.value,note:note.value});await reload();}catch(e){show(e.message,true);alert(e.message);}finally{save.disabled=false;}});
}
