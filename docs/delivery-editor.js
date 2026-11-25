import {deliveryConfig} from './video-service.js';
export function deliveryFields(parent,model,id,change){
 const doc=parent.ownerDocument,config=deliveryConfig(model,id);if(!config)return;
 const wrap=doc.createElement('div');wrap.className='delivery-settings';parent.append(wrap);
 const make=(tag,title)=>{const l=doc.createElement('label');l.textContent=title;const x=doc.createElement(tag);l.append(x);wrap.append(l);return x;};
 const select=make('select','Способ оказания услуги');
 for(const [v,t] of [['visit','Личный визит — дата и время'],['delivery','Получение готовой услуги — только дата']])select.add(new Option(t,v));
 select.value=config.mode;
 const days=make('input','Минимальный срок подготовки (календарных дней)');days.type='number';days.min=config.video?7:0;days.max=365;days.step=1;days.value=config.days;
 const hint=doc.createElement('p');hint.textContent='Получение по дате не занимает часы в календаре и не включает транспортные расходы.';wrap.append(hint);
 const visibility=()=>{days.parentElement.hidden=select.value!=='delivery';hint.hidden=select.value!=='delivery';};visibility();
 function save(){const n=Number(days.value);if(!days.value||!Number.isInteger(n)||n<Number(days.min)||n>365)return;model.deliveryModes??={};model.deliveryModes[id]={mode:select.value,days:n};visibility();change();}
 select.onchange=()=>{visibility();if(!days.checkValidity())days.value=config.days;save();};days.onchange=save;
}
