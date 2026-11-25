import {euros} from './fares.js?v=62';
const add=(parent,tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;parent.append(el);return el;};
function control(parent,title,fn){
 const b=add(parent,'button',title);b.type='button';b.addEventListener('click',async()=>{
  b.disabled=true;try{await fn();}catch(error){alert(error.message);}finally{b.disabled=false;}
 });return b;
}
export function prepaymentControls(box,b,request,reload,stripe={enabled:false,mode:'off'}){
 const q=JSON.parse(b.quote_snapshot||'{}'),planned=q.prepayment;
 if(!planned||!planned.amount)return;
 const p=add(box,'details'),summary=add(p,'summary','Предоплата · '+euros(planned.amount));
 const badge=add(p,'p',b.deposit_status==='paid'?'Получено: '+euros(b.deposit_amount-b.deposit_refunded):
  b.deposit_status==='refunded'?'Аванс полностью возвращён':
  b.deposit_status==='requested'?'Счёт выставлен · ожидается оплата':
  'Счёт ещё не выставлен, время не зарезервировано');
 const url=op=>'/api/admin/prepayments/'+op+'?id='+encodeURIComponent(b.id);
 if(!b.deposit_number){
  if(b.status==='pending'&&!b.final_status)control(p,'Зарезервировать время и выставить аванс',async()=>{
   if(!confirm('Зарезервировать интервал и выписать авансовый счёт на '+euros(planned.amount)+'? Счёт не означает поступления денег.'))return;
   const result=await request(url('request'),'POST',{});await reload();alert('Авансовый счёт '+result.number+' сохранён. Проверьте PDF и отправьте клиенту.');
  });
  return;
 }
 const actions=add(p,'div');actions.className='admin-actions';
 for(const [path,label] of [['view','Открыть авансовый счёт'],['pdf','PDF авансового счёта']]){
  const a=add(actions,'a',label);a.href=url(path);a.target='_blank';a.rel='noopener noreferrer';
 }
 const meta=add(p,'p','Номер A-'+b.deposit_number+' · Срок '+b.deposit_due+' · '+(b.deposit_sent?'Отправлено клиенту':'Не отправлено клиенту'));
 if(!b.deposit_sent){
  const label=add(p,'label','Email клиента для отправки');const email=add(label,'input');email.type='email';email.value=b.email||'';email.placeholder='name@example.com';
  control(p,'Отправить авансовый счёт',async()=>{
   if(!email.reportValidity()||!email.value||!confirm('Отправить авансовый счёт '+email.value+'?'))return;
   await request(url('send'),'POST',{email:email.value});await reload();
  });
 }
 if(b.deposit_status==='requested'&&stripe.enabled){
  const panel=add(p,'div');panel.className='record';
  const title=add(panel,'p',stripe.mode==='test'?'Stripe подключён в тестовом режиме — не отправляйте ссылку реальным клиентам.':'Оплата онлайн: карты, Apple Pay, Google Pay, MobilePay, PayPal (если активированы в Stripe).');
  control(panel,stripe.mode==='test'?'Создать тестовую ссылку Stripe':'Создать ссылку для оплаты',async()=>{
   const {url,expiresAt}=await request('/api/admin/stripe/checkout-link?id='+encodeURIComponent(b.id),'POST',{});
   const link=add(panel,'a','Открыть защищённую страницу оплаты');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
   const label=add(panel,'label','Ссылка для отправки клиенту');
   const field=add(label,'input');field.type='url';field.value=url;field.readOnly=true;field.addEventListener('focus',()=>field.select());
   control(panel,'Копировать ссылку',async()=>{await navigator.clipboard.writeText(url);});
   add(panel,'small','Ссылка действует до '+new Date(expiresAt*1000).toLocaleString('ru-RU')+'. Оплату подтверждает Stripe, не клиент.');
  });
 }
 if(b.deposit_status==='requested'){
  const label=add(p,'label','Подтверждение банка (дата поступления, выписка или примечание)');
  const note=add(label,'input');note.maxLength=300;note.placeholder='Например: получено по выписке 26.11';
  control(p,'Деньги поступили — отметить оплачено',async()=>{
   if(!note.value.trim()){alert('Сначала укажите данные банковского поступления.');return;}
   if(!confirm('Вы лично проверили поступление '+euros(b.deposit_amount)+' на банковский счёт?'))return;
   await request(url('paid'),'POST',{note:note.value});await reload();
  });
 }
 if(b.deposit_status==='paid'){
  if(b.stripe_paid){add(p,'p','Этот аванс оплачен через Stripe. Для возврата средств используйте Stripe Dashboard; после возврата через Stripe сумма автоматически обновится на сайте.');return;}
  const remaining=b.deposit_amount-b.deposit_refunded;
  add(p,'p','Получено '+euros(b.deposit_amount)+' · возвращено '+euros(b.deposit_refunded)+' · остаток '+euros(remaining));
  const label=add(p,'label','Сумма фактически выполненного возврата, €');
  const value=add(label,'input');value.type='number';value.step='.01';value.min='.01';value.max=(remaining/100).toFixed(2);value.value=(remaining/100).toFixed(2);
  const reasonLabel=add(p,'label','Причина и подтверждение возврата');
  const reason=add(reasonLabel,'input');reason.maxLength=300;reason.placeholder='Дата банковского перевода и причина';
  control(p,'Отметить фактический возврат',async()=>{
   const cents=Math.round(Number(value.value)*100);
   if(!Number.isSafeInteger(cents)||cents<=0||cents>remaining||!reason.value.trim())throw Error('Проверьте сумму и примечание.');
   if(!confirm('Подтвердить уже совершённый возврат '+euros(cents)+'? Сайт сам деньги не переводит.'))return;
   await request(url('refund'),'POST',{amount:cents,note:reason.value});await reload();
  });
 }
}