const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=cents=>(cents/100).toFixed(2).replace('.',',')+' €';
export function invoiceView(invoice,id){
 const d=JSON.parse(invoice.document),p=d.seller;
 const row=(label,value)=>'<tr><th>'+escape(label)+'</th><td>'+escape(value)+'</td></tr>';
 const party=(label,values)=>'<section><h2>'+label+'</h2>'+values.filter(Boolean).map(v=>'<p>'+escape(v)+'</p>').join('')+'</section>';
 const logo=p.logo?.startsWith('data:image/png;base64,')?p.logo:'/assets/pakkasukko-medallion.png';
 const rate=Number(p.vatRate.replace(',','.')),net=Math.round(d.total/(1+rate/100));
 const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Счёт № ${invoice.number} · Pakkasukko</title>
 <style>*{box-sizing:border-box}body{margin:0;background:#edf1f3;color:#193145;font:16px/1.5 system-ui}main{margin:24px auto;padding:clamp(18px,5vw,52px);max-width:760px;background:white}nav{display:flex;gap:16px;flex-wrap:wrap}a,button{color:#13557c;font:inherit}h1{font-family:Georgia,serif}h2{font-size:17px}p{margin:.3em 0;overflow-wrap:anywhere}img{float:right;width:58px;height:58px;object-fit:contain}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{text-align:left;border-bottom:1px solid #ccd7dc;padding:8px 4px;overflow-wrap:anywhere}td{text-align:right}section{margin:1em 0}@media print{body{background:white}main{margin:0;max-width:none}nav,.status{display:none}}</style><main>
 <nav><a href="/admin">← К заявкам</a><a href="pdf?id=${encodeURIComponent(id)}">Открыть PDF</a><button type="button" onclick="window.print()">Печать</button></nav>
 <p class="status">${invoice.sent_at?'Письмо принято почтовым сервисом.':'Счёт сохранён. Для отправки на email вернитесь к заявке и нажмите «Отправить счёт клиенту».'}</p>
 <img src="${escape(logo)}" alt=""><h1>Lasku / Счёт № ${invoice.number}</h1><p>Дата счёта · ${escape(d.issued)}</p>
 ${party('Исполнитель',[p.name,p.owner,'Y-tunnus '+p.businessId,p.address,p.contact,p.vatId])}
 ${party('Получатель',[d.buyer,d.address])}<p>Дата услуги · ${escape(d.date)} · ${escape(d.city)}</p>
 <table>${row(d.service,money(d.base))}${d.participants?row('Расходы на поездку / число заказов',money(d.pool)+' / '+d.participants):''}${row('Ваша доля поездки',money(d.travel))}${d.maximum!=null?row('Максимум при бронировании',money(d.maximum)):''}${row('Без налога',money(net))}${row('ALV '+rate+'%',money(d.total-net))}${row('К оплате',money(d.total))}</table>
 <p>${escape(p.vatNote)}</p><p>Оплатить до · ${escape(d.due)}</p><p>IBAN · ${escape(p.iban)}</p>${p.bic?'<p>BIC / SWIFT · '+escape(p.bic)+'</p>':''}<p>Сообщение к платежу · Lasku ${invoice.number}</p></main></html>`;
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex','X-Frame-Options':'DENY'}});
}
