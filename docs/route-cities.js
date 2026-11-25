// A single public city list for the travel calculator and geography section.
export function routeCities(fares){
 const km=fares?.km;
 if(!km||typeof km!=='object'||Array.isArray(km))return null;
 return ['Kitee',...Object.keys(km).filter(city=>city!=='Kitee')];
}
export function renderRouteCities(doc,fares){
 const cities=routeCities(fares),box=doc.querySelector('#routes .tags');
 if(!cities||!box)return;
 const old=Array.from(box.querySelectorAll('span:not([data-provider-copy])'));
 // Retain the original DOM/text keys for compatibility with saved editor revisions.
 for(const node of old)node.hidden=true;
 const existing=Array.from(box.querySelectorAll('[data-route-city]'));
 if(existing.length===cities.length&&existing.every((node,i)=>node.textContent===cities[i].toUpperCase()))return;
 for(const node of existing)node.remove();
 for(const city of cities){
  const tag=doc.createElement('span');tag.dataset.providerCopy='';tag.dataset.routeCity='';
  tag.textContent=city.toUpperCase();box.append(tag);
 }
}
