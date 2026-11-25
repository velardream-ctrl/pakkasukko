export async function renderVideoOrders(box,request){
 const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const labels={pending:'Ожидает подтверждения',confirmed:'В работе',completed:'Готово / отправлено',declined:'Отклонён',cancelled:'Отменён'};
 const transitions={pending:['pending','confirmed','declined','cancelled'],confirmed:['confirmed','completed','cancelled'],completed:['completed'],declined:['declined'],cancelled:['cancelled']};
 box.replaceChildren();
 try{
 const {orders}=await request('/api/admin/video-orders');
 if(!orders.length)box.append(el('p','Видеозаказов пока нет.'));
 for(const v of orders){
  const item=el('article');item.className='record';item.append(el('h3','Получение: '+v.delivery_date),el('p',labels[v.status]+' · '+v.service),el('p',v.name+' · '+v.email+' · '+(v.phone||'—')),el('p','Стоимость при заказе: '+v.price_label),el('p',v.message),el('small','Заявка: '+v.id+' · '+v.created_at));
  const field=(title,node)=>{const l=el('label',title);l.append(node);item.append(l);return node;};
  const date=field('Дата получения',el('input'));date.type='date';date.value=v.delivery_date;date.disabled=!['pending','confirmed'].includes(v.status);
  const status=field('Статус',el('select'));for(const s of transitions[v.status]||[])status.add(new Option(labels[s],s));status.value=v.status;
  const notes=field('Заметки / согласованная стоимость',el('textarea'));notes.value=v.notes||'';notes.maxLength=1500;
  const message=el('p');message.setAttribute('role','status');
  const button=(text,fn)=>{const b=el('button',text);b.type='button';b.onclick=async()=>{b.disabled=true;try{await fn();await renderVideoOrders(box,request);}catch(e){message.textContent=e.message;}finally{b.disabled=false;}};item.append(b);};
  button('Сохранить',async()=>{if(!date.value)throw Error('Укажите дату.');if(status.value!==v.status&&!confirm('Изменить статус видеозаказа?'))throw Error('Изменения отменены.');await request('/api/admin/video-orders/update','POST',{id:v.id,deliveryDate:date.value,status:status.value,notes:notes.value});});
  if(['cancelled','declined'].includes(v.status))button('Удалить заказ',async()=>{if(!confirm('Окончательно удалить видеозаказ?'))throw Error('Удаление отменено.');await request('/api/admin/video-orders/delete','POST',{id:v.id});});
  item.append(message);box.append(item);
 }
 }catch(e){box.append(el('p','Не удалось загрузить видеозаказы: '+e.message));}
}