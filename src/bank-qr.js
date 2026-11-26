// QR generated locally. No payment data is sent to a third-party QR service.
import qrcode from 'qrcode-generator';
export function qrMatrix(payload){
 qrcode.stringToBytes=value=>Array.from(new TextEncoder().encode(value));
 const qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();
 return Array.from({length:qr.getModuleCount()},(_,r)=>Array.from({length:qr.getModuleCount()},(_,c)=>qr.isDark(r,c)));
}
export function qrSvg(payload){
 const m=qrMatrix(payload),n=m.length+8;
 const path=m.map((row,y)=>row.map((dark,x)=>dark?'M'+(x+4)+' '+(y+4)+'h1v1h-1z':'').join('')).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="SEPA QR" viewBox="0 0 '+n+' '+n+'" shape-rendering="crispEdges" style="width:220px;max-width:100%;height:auto"><rect width="'+n+'" height="'+n+'" fill="#fff"/><path fill="#000" d="'+path+'"/></svg>';
}
