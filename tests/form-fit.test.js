import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL('../docs/'+name,import.meta.url),'utf8');
test('RUN-039: date and time controls have bounded width on public and admin forms',()=>{
 const css=read('form-fit.css');
 for(const page of ['index.html','video.html','contact.html','admin.html','editor.html'])assert.match(read(page),/href="\.\/form-fit\.css\?v=39"/);
 assert.match(css,/\.letter label:not\(\.consent\)\{\s*grid-template-columns:minmax\(0,1fr\)/);
 for(const type of ['date','time','datetime-local'])assert.ok(css.includes('input[type="'+type+'"]'));
 assert.match(css,/box-sizing:border-box;\s*width:100%;\s*min-width:0;\s*max-width:100%;\s*inline-size:100%;/);
 assert.match(css,/::-webkit-date-and-time-value/);
 assert.match(css,/\.form-row,\.admin-grid,\.content-fields\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
 assert.match(read('video.html'),/name="deliveryDate" type="date" required/);
});
