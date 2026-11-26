// Only the site's own palette and safe font styles are allowed; no HTML or CSS input.
export const textColors=['auto','ink','gold'];
export const textFonts=['auto','normal','italic'];
export const introHeading=[{text:'Не просто вручить подарок,',color:'ink',font:'normal'},{text:'а подарить воспоминания.',color:'gold',font:'italic'}];
export function validTextStyle(s){return Boolean(s&&typeof s==='object'&&!Array.isArray(s)&&textColors.includes(s.color)&&textFonts.includes(s.font));}
export function validHeadingParts(parts){return Array.isArray(parts)&&parts.length>=1&&parts.length<=12&&parts.every(p=>validTextStyle(p)&&typeof p.text==='string'&&p.text.length<=1000);}
export function validTextPresentation(model){
 const fields=model.textStyles??{},heads=model.headingParts??{};
 return [fields,heads].every(v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=2000)&&
 Object.entries(fields).every(([k,v])=>k.length<=160&&!['__proto__','constructor','prototype'].includes(k)&&validTextStyle(v))&&
 Object.entries(heads).every(([k,v])=>k.length<=160&&!['__proto__','constructor','prototype'].includes(k)&&validHeadingParts(v));
}
export function styleElement(node,style){
 if(!node?.dataset)return;
 if(validTextStyle(style)){node.dataset.pkColor=style.color;node.dataset.pkFont=style.font;}
 else{delete node.dataset.pkColor;delete node.dataset.pkFont;}
}
export function styleField(field,style){
 if(field.attribute||!field.node?.parentElement)return;
 const node=field.node;
 if(node.nodeType!==3){styleElement(node,style);return;}
 let span=node.parentElement;
 if(!span.hasAttribute('data-pk-text-fragment')){
  if(!validTextStyle(style)||style.color==='auto'&&style.font==='auto')return;
  span=node.ownerDocument.createElement('span');span.dataset.pkTextFragment='';node.before(span);span.append(node);
 }
 styleElement(span,style);
}
export function legacyHeadingParts(model,group,heading){
 const explicit=model.headingParts?.[group];if(validHeadingParts(explicit))return explicit.map(p=>({...p}));
 const original=heading?.hasAttribute('data-heading-display')?heading.parentElement.querySelector('[data-heading-original]'):heading;
 const base=[];let line={text:'',color:'auto',font:'auto'};
 const flush=()=>{if(line.text.trim())base.push({...line,text:line.text.trim()});line={text:'',color:'auto',font:'auto'};};
 for(const n of original?.childNodes||[]){
  if(n.nodeName==='BR'){flush();continue;}
  if(n.nodeName==='EM'){if(line.text.trim())flush();base.push({text:n.textContent.trim(),color:'gold',font:'italic'});continue;}
  line.text+=n.textContent||'';
 }flush();
 const legacy=model.headingOverrides?.[group];
 if(typeof legacy==='string'&&legacy.trim()){
  if(group==='intro'&&/^не просто вручить подарок[.,]?\s*(?:а\s+)?подарить воспоминани[ея][.!]?$/i.test(legacy.trim()))return introHeading.map(p=>({...p}));
  return legacy.split(/\n+/).filter(Boolean).slice(0,12).map((text,i)=>({text,color:base[i]?.color||'auto',font:base[i]?.font||'auto'}));
 }
 return base.length?base:[{text:heading?.textContent||'',color:'auto',font:'auto'}];
}
function control(parent,title,options,value,change){
 const label=document.createElement('label');label.textContent=title;const select=document.createElement('select');select.setAttribute('aria-label',title);
 for(const [v,t] of options)select.add(new Option(t,v));select.value=value;select.onchange=()=>change(select.value);label.append(select);parent.append(label);
}
export function styleControls(parent,style,onChange){
 let current=validTextStyle(style)?{color:style.color,font:style.font}:{color:'auto',font:'auto'};
 const row=document.createElement('div');row.className='pk-text-style-controls';parent.append(row);
 control(row,'Цвет текста',[['auto','Исходный'],['ink','Основной (тёмный / светлый)'],['gold','Золотой']],current.color,v=>{current.color=v;onChange({...current});});
 control(row,'Начертание',[['auto','Исходное'],['normal','Прямой'],['italic','Курсив']],current.font,v=>{current.font=v;onChange({...current});});
}
export function headingControls(parent,model,group,heading,onChange){
 let parts=legacyHeadingParts(model,group,heading);
 const root=document.createElement('div');parent.append(root);
 function commit(){model.headingParts??={};model.headingParts[group]=parts.map(p=>({...p}));delete model.headingOverrides?.[group];onChange();}
 function draw(){
  root.replaceChildren();
  parts.forEach((p,i)=>{
   const wrap=document.createElement('fieldset');const legend=document.createElement('legend');legend.textContent='Строка '+(i+1);wrap.append(legend);
   const input=document.createElement('textarea');input.value=p.text;input.maxLength=1000;input.setAttribute('aria-label','Строка '+(i+1));input.oninput=()=>{p.text=input.value;commit();};wrap.append(input);
   styleControls(wrap,p,style=>{p.color=style.color;p.font=style.font;commit();});
   if(parts.length>1){const remove=document.createElement('button');remove.type='button';remove.textContent='Удалить строку';remove.onclick=()=>{parts.splice(i,1);commit();draw();};wrap.append(remove);}
   root.append(wrap);
  });
  if(parts.length<12){const add=document.createElement('button');add.type='button';add.textContent='＋ Добавить строку';add.onclick=()=>{parts.push({text:'',color:'auto',font:'auto'});commit();draw();};root.append(add);}
 }
 draw();
 return root;
}
