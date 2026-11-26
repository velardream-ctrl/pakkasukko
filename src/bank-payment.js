// Finance Finland: domestic reference 7-3-1, bank barcode v4 and EPC transfer form QR.
export function validFinnishIBAN(value){
 const iban=String(value||'').replace(/\s/g,'').toUpperCase();
 if(!/^FI\d{16}$/.test(iban))return false;
 let n=0;
 for(const digit of iban.slice(4)+'1518'+iban.slice(2,4))n=(n*10+Number(digit))%97;
 return n===1;
}
export function finnishReference(base){
 const s=String(base);
 if(!/^[1-9]\d{1,18}$/.test(s))throw Error('Invalid reference base');
 const weights=[7,3,1];
 let sum=0;
 for(let i=0;i<s.length;i++)sum+=Number(s[s.length-1-i])*weights[i%3];
 return s+((10-sum%10)%10);
}
export function virtualBankCode(iban,amount,reference,due){
 iban=String(iban).replace(/\s/g,'').toUpperCase();
 if(!validFinnishIBAN(iban)||!Number.isSafeInteger(amount)||amount<1||amount>99999999||
 !/^[1-9]\d{2,19}$/.test(reference)||finnishReference(reference.slice(0,-1))!==reference||
 !/^20\d\d-\d\d-\d\d$/.test(due)||new Date(due+'T00:00:00Z').toISOString().slice(0,10)!==due)throw Error('Invalid bank barcode data');
 return '4'+iban.slice(2)+String(amount).padStart(8,'0')+'000'+reference.padStart(20,'0')+due.slice(2).replace(/-/g,'');
}
export function paymentData(d,number){
 if(!d.bankPayment||d.preview)return null;
 const match=/^A-([1-9]\d{0,15})$/.exec(String(number));
 if(!match)throw Error('Invalid advance number');
 const reference=finnishReference('83'+match[1]);
 const iban=String(d.seller.iban).replace(/\s/g,'').toUpperCase();
 const name=String(d.seller.name||'').trim();
 const bic=String(d.seller.bic||'').replace(/\s/g,'').toUpperCase();
 if(!name||name.length>70||/[\r\n]/.test(name)||!/^([A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?)?$/.test(bic))throw Error('Invalid payee');
 const barcode=virtualBankCode(iban,d.total,reference,d.due);
 const payload=['BCD','002','1','SCT',bic,name,iban,'EUR'+(d.total/100).toFixed(2),'',reference,'','ReqdExctnDt/'+d.due].join('\n');
 if(new TextEncoder().encode(payload).length>331)throw Error('QR payload too long');
 return {reference,iban,name,bic,barcode,payload};
}
export function bankProfileReady(p){
 return Boolean(p&&p.name&&p.name.length<=70&&!/[\r\n]/.test(p.name)&&p.address&&p.businessId&&validFinnishIBAN(p.iban)&&
 /^([A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?)?$/.test(String(p.bic||'').replace(/\s/g,'').toUpperCase())&&
 /^\d{1,2}([.,]\d{1,2})?$/.test(String(p.vatRate??''))&&(Number(String(p.vatRate).replace(',','.'))?p.vatId:p.vatNote));
}
