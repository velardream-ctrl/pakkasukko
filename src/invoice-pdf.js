import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
export function base64(bytes){
 let text='';
 for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(text);
}
export async function makePDF(d,number,env,origin){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 // Stable metadata keeps retries with the same Resend idempotency key identical.
 const stamp=new Date(d.issued+'T12:00:00Z');pdf.setCreationDate(stamp);pdf.setModificationDate(stamp);
 const asset=async path=>{
   const res=await env.ASSETS.fetch(new Request(new URL(path,origin)));
   if(!res.ok)throw Error('Материалы счёта недоступны');
   return res.arrayBuffer();
 };
 const font=await pdf.embedFont(await asset('/assets/invoice/font.ttf'));
 const logo=await pdf.embedPng(d.seller.logo||await asset('/assets/pakkasukko-medallion.png'));
 let page=pdf.addPage([595,842]),y=780;
 page.drawImage(logo,{x:487,y:746,...logo.scaleToFit(60,60)});
 function line(value,size=11,width=490){
   let row='';
   function flush(){if(y<55){page=pdf.addPage([595,842]);y=790;}page.drawText(row,{x:46,y,size,font,color:rgb(.08,.15,.21)});y-=size+7;row='';}
   for(const word of String(value).replace(/[\u0000-\u001f]/g,' ').split(/\s+/)){
     if(row&&font.widthOfTextAtSize(row+' '+word,size)>width)flush();
     for(const char of word){if(font.widthOfTextAtSize(row+char,size)>width)flush();row+=char;}
     row+=' ';
   }
   flush();
 }
 const money=n=>(n/100).toFixed(2).replace('.',',')+' €';
 const p=d.seller;
 if(d.preview){line('TESTI — EI MAKSETTAVAKSI',18);line('ТЕСТ — НЕ ОПЛАЧИВАТЬ');line('Даты и суммы предварительные.');if(d.pendingTrip)line('Стоимость дороги уточняется после фиксации выезда.');}
 line('LASKU / СЧЁТ № '+number,21);line(p.name+' · '+p.owner,14,415);
 line('Y-tunnus '+p.businessId);line(p.address);if(p.contact)line(p.contact);
 if(p.vatId)line('VAT ID: '+p.vatId);
 y-=10;line('Asiakas / Клиент: '+d.buyer,13);line(d.address);
 line('Laskun päivä / Дата счёта: '+d.issued);
 line('Palvelupäivä / Дата услуги: '+d.date+' · '+d.city);
 y-=12;line('Palvelun kuvaus / Описание услуги:',13);line(d.serviceFi||d.service);if(d.serviceRu)line(d.serviceRu);line('Palvelu / Услуга (1 kpl / 1 шт.): '+money(d.base));
 if(d.participants){
   if(d.quote?.mode==='rail')line('Поезд, билеты туда и обратно');
   else if(d.quote?.km!=null)line('Автомобиль, путь туда и обратно: '+d.quote.km+' км');
   line('Общие расходы на поездку: '+money(d.pool)+' · Заказов: '+d.participants);
 }
 line('Matkakulut / Транспортные расходы: '+money(d.travel));
 if(d.maximum!=null)line('Максимум при бронировании: '+money(d.maximum));
 const rate=Number(p.vatRate.replace(',','.')),net=Math.round(d.total/(1+rate/100));
 line('Veroton / Без налога: '+money(net)+' · ALV '+rate+'%: '+money(d.total-net));
 if(p.vatNote)line(p.vatNote);
 y-=8;line('Maksettava / К оплате: '+money(d.total),17);
 line('Eräpäivä / Оплатить до: '+d.due);line('IBAN: '+p.iban);if(p.bic)line('BIC / SWIFT: '+p.bic);if(!d.preview)line('Viesti / Сообщение к платежу: Lasku '+number);
 if(d.preview)for(const p of pdf.getPages())p.drawText('TESTI — EI MAKSETTAVAKSI / ТЕСТ — НЕ ОПЛАЧИВАТЬ',{x:46,y:25,size:10,font,color:rgb(.65,.1,.1)});
 return pdf.save();
}
