const bindings=new WeakMap();
const percent=value=>Math.max(70,Math.min(150,Number(value)||100));

export function fitTagline(doc,value=100){
  const title=doc.querySelector('.header .brand-name');
  if(!title)return;
  let binding=bindings.get(title);
  if(!binding){
    const brand=title.parentElement,caption=brand.querySelector('small'),row=brand.parentElement;
    const win=doc.defaultView;
    binding={scale:100,fit(){
      const natural=caption.getBoundingClientRect().width;
      const titleWidth=title.getBoundingClientRect().width;
      if(!natural||!titleWidth)return;
      const siblings=Array.from(row.children).filter(el=>el!==brand && el.offsetWidth);
      const gap=parseFloat(win.getComputedStyle(row).columnGap)||0;
      const available=row.clientWidth-parseFloat(win.getComputedStyle(brand).paddingLeft)
        -siblings.reduce((total,el)=>total+el.offsetWidth+gap,0);
      // Ratios of DOM rectangles also work inside the scaled editor iframe.
      const target=Math.min(titleWidth*binding.scale/100,Math.max(titleWidth,available));
      const size=parseFloat(win.getComputedStyle(caption).fontSize)*target/natural;
      caption.style.fontSize=Math.max(5,Math.min(36,size)).toFixed(2)+'px';
    }};
    bindings.set(title,binding);
    if(win.ResizeObserver){
      const observer=new win.ResizeObserver(binding.fit);
      observer.observe(row);observer.observe(title);
    }
    doc.fonts?.ready.then(binding.fit);
    doc.fonts?.addEventListener('loadingdone',binding.fit);
  }
  binding.scale=percent(value);
  binding.fit();
}

export function taglineSlider(parent,model,preview,changed){
  const doc=parent.ownerDocument,label=doc.createElement('label');
  const caption=doc.createElement('span'),range=doc.createElement('input');
  range.type='range';range.min='70';range.max='150';range.step='1';
  range.value=String(percent(model.taglineWidth));
  const describe=()=>{caption.textContent='Размер подписи · '+range.value+'% ширины названия';};
  describe();
  range.oninput=()=>{
    model.taglineWidth=Number(range.value);describe();
    fitTagline(preview,model.taglineWidth);
    changed?.();
  };
  label.append(caption,range);parent.append(label);
}
