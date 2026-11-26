// Owner-approved tariff names are canonical, including when typed in Russian.
const aliases={'китее':'kitee','ките':'kitee','пухос':'puhos','тохмаярви':'tohmajärvi','йоэнсуу':'joensuu','йоенсуу':'joensuu','хельсинки':'helsinki','гельсингфорс':'helsinki','савонлинна':'savonlinna','куопио':'kuopio','лахти':'lahti','тампере':'tampere','турку':'turku','оулу':'oulu','лиекса':'lieksa','нурмес':'nurmes','рааккюля':'rääkkylä','ряяккюля':'rääkkylä','кюменлааксо':'kymenlaakso','лаппеэнранта':'lappeenranta','иматра':'imatra','миккели':'mikkeli','эспоо':'espoo','вантаа':'vantaa','коли':'koli','кесалахти':'kesälahti'};
export const normalizeCity=s=>String(s||'').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('fi');
export function cityKey(s){const key=normalizeCity(s);return Object.hasOwn(aliases,key)?aliases[key]:key;}
export function approvedCity(fare,city){const key=cityKey(city);return Object.keys(fare?.km||{}).find(c=>cityKey(c)===key)||null;}
export function validCityQuery(s){return typeof s==='string'&&s.trim().length>=2&&s.length<=80&&/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(s.trim());}
export function routeName(s){const n=normalizeCity(s);return Object.hasOwn(aliases,n)?aliases[n]:String(s).trim();}
export function mapsLink(origin,city){return 'https://www.google.com/maps/dir/?'+new URLSearchParams({api:'1',origin:origin+', Finland',destination:routeName(city)+', Finland',travelmode:'driving'});}
export const distanceDefaults={origin:'Kitee',enabled:false,dailyLimit:50};
export function validDistanceSettings(v){return !!v&&validCityQuery(v.origin)&&typeof v.enabled==='boolean'&&Number.isInteger(v.dailyLimit)&&v.dailyLimit>=1&&v.dailyLimit<=100;}
export function fuelEstimate(km,fare){return Math.round(km*2*fare.fuel*fare.consumption);}
