import {validPin,routeName} from './city-distance.js';
let loading;
function loadGoogle(key){
 if(window.google?.maps?.importLibrary)return Promise.resolve();
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.async=true;
  const callback='pakkasukkoGoogleReady';const timeout=setTimeout(()=>{delete window[callback];script.remove();loading=null;reject(Error('Google Maps не отвечает.'));},15000);window[callback]=()=>{clearTimeout(timeout);delete window[callback];resolve();};
  script.src='https://maps.googleapis.com/maps/api/js?'+new URLSearchParams({key,callback,loading:'async',v:'weekly',language:'fi',region:'FI'});
  script.onerror=()=>{clearTimeout(timeout);delete window[callback];script.remove();loading=null;reject(Error('Google Maps недоступен.'));};
  document.head.append(script);
 });return loading;
}
export async function mountDestinationMap(box,{key,city,address='',onPin,onAddress}){
 box.replaceChildren();
 const field=document.createElement('input');field.placeholder='Улица и дом';field.value=address;field.maxLength=200;field.setAttribute('aria-label','Адрес на карте');
 const search=document.createElement('button');search.type='button';search.textContent='Найти адрес';
 const note=document.createElement('p');note.setAttribute('role','status');note.textContent='Загрузка карты…';
 const canvas=document.createElement('div');canvas.className='destination-map';canvas.setAttribute('aria-label','Карта места праздника');
 box.append(field,search,note,canvas);
 await loadGoogle(key);
 if(!box.isConnected||!canvas.isConnected)return;
 const [{Map},{Geocoder},{AdvancedMarkerElement}]=await Promise.all(['maps','geocoding','marker'].map(x=>google.maps.importLibrary(x)));
 const map=new Map(canvas,{center:{lat:64.5,lng:26},zoom:5,mapId:'DEMO_MAP_ID',streetViewControl:false,mapTypeControl:false,fullscreenControl:false});
 const geocoder=new Geocoder();let marker,sequence=0;
 function choose(p){const pin={lat:Number(p.lat.toFixed(6)),lng:Number(p.lng.toFixed(6))};if(!validPin(pin)){note.textContent='Выберите место в Финляндии.';return;}
  if(marker)marker.position=pin;else marker=new AdvancedMarkerElement({map,position:pin,title:'Место праздника'});
  note.textContent='Точка выбрана. Расстояние рассчитывается по автомобильному маршруту. Проверьте адрес в форме.';onPin(pin);
 }
 map.addListener('click',event=>{if(event.latLng){sequence++;choose(event.latLng.toJSON());}});
 async function locate(useAddress){
  const id=++sequence;search.disabled=true;
  try{const addressText=useAddress?field.value.trim():'';
   const response=await geocoder.geocode({address:[addressText,routeName(city),'Finland'].filter(Boolean).join(', '),componentRestrictions:{country:'FI'}});
   if(id!==sequence||!canvas.isConnected)return;
   const place=response.results?.[0];if(!place){note.textContent='Адрес не найден. Выберите точку вручную.';return;}
   const point=place.geometry.location.toJSON();if(!validPin(point)){note.textContent='Выберите адрес в Финляндии.';return;}
   map.setCenter(point);map.setZoom(useAddress?16:12);
   if(useAddress&&addressText){onAddress(addressText);choose(point);}else note.textContent='Введите адрес или нажмите на нужную точку карты.';
  }catch{if(id===sequence)note.textContent='Не удалось найти адрес. Выберите точку вручную.';}finally{search.disabled=false;}
 }
 search.onclick=()=>locate(true);field.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();locate(true);}};
 await locate(false);
}
