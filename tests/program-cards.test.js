import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,programPresentation} from '../docs/site.js';

test('legacy additional video program receives the original card typography defaults',()=>{
  const card={id:'v1',title:'Видеопоздравление от Деда Мороза',description:'Персональная сказка',price:'50 €',duration:'3 минуты'};
  const before=JSON.stringify(card);
  const result=programPresentation(card,0);
  assert.deepEqual(result,{
    regular:'Видеопоздравление',accent:'от Деда Мороза',
    icon:'▶',number:'04 / ВИДЕОПОЗДРАВЛЕНИЕ'
  });
  assert.equal(JSON.stringify(card),before,'render defaults should not modify saved D1 draft');
  assert.equal(initial().cards.length,0);
});

test('additional programs have stable numbering and editable icon/label/accent',()=>{
  const card={title:'Новогодняя программа для детей',icon:'♫',label:'Детский праздник',accent:'для детей'};
  assert.deepEqual(programPresentation(card,2),{
    regular:'Новогодняя программа',accent:'для детей',icon:'♫',
    number:'06 / ДЕТСКИЙ ПРАЗДНИК'
  });
  assert.equal(programPresentation({title:'Волшебная встреча'},1).number,'05 / ПРАЗДНИЧНАЯ ПРОГРАММА');
  assert.equal(programPresentation({title:'Волшебная встреча'},1).regular,'Волшебная встреча');
});

test('dynamic program cards use the same DOM classes as the three built-in cards',()=>{
  const site=readFileSync(new URL('../docs/site.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
  assert.match(html,/<article class="card card-highlight">/);
  assert.match(html,/class="card-icon"/);
  assert.match(html,/class="card-number"/);
  assert.match(html,/class="card-foot"/);
  assert.match(site,/box\.className='card extra-card'/);
  assert.match(site,/icon\.className='card-icon'/);
  assert.match(site,/number\.className='card-number'/);
  assert.match(site,/foot\.className='card-foot'/);
  assert.match(site,/title\.append\(doc\.createElement\('br'\)\)/);
  assert.match(site,/const em=doc\.createElement\('em'\)/);
  assert.match(site,/programGrid\?\.classList\.toggle\('cards-four',3\+model\.cards\.length===4\)/);
  assert.match(css,/\.cards\.cards-four\{\s*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/@media\(max-width:760px\)\{\s*\.cards\.cards-four\{grid-template-columns:minmax\(0,1fr\)/);
});

test('program click selectors follow named fields rather than old child-index positions',()=>{
  const editor=readFileSync(new URL('../docs/editor.js',import.meta.url),'utf8');
  const inline=readFileSync(new URL('../docs/inline-editor.js',import.meta.url),'utf8');
  assert.match(editor,/control\.dataset\.cardIndex=String\(index\);control\.dataset\.cardKey=k;/);
  assert.match(editor,/el\.dataset\.cardIndex===String\(idx\)&&el\.dataset\.cardKey===key/);
  assert.match(inline,/\['label','Подпись над названием'\]/);
  assert.match(inline,/\['icon','Иконка'\]/);
});
