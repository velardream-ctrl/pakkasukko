import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,heroImageId,setHeroDeviceImage,setHeroGlobalImage} from '../docs/site.js';

test('old global hero photo is drawn once, without any extra hero media card',()=>{
 const site=readFileSync(new URL('../docs/site.js',import.meta.url),'utf8');
 const html=readFileSync(new URL('../docs/index.html',import.meta.url),'utf8');
 const css=readFileSync(new URL('../docs/style.css',import.meta.url),'utf8');
 assert.match(site,/if\(section\.id==='top'\)continue;/);
 assert.match(site,/image:heroImageId\(model,device\)/);
 assert.match(html,/<div class="hero-photo"[^>]*><img src="\.\/assets\/pakkasukko-ded-moroz\.webp" alt=""><\/div>/);
 assert.match(css,/\.hero-photo\{background-image:none!important\}/);
 assert.match(css,/\.about-portrait\{background-image:none!important\}/);
 const m=initial();
 m.pictures.top={id:'one',video:false};
 m.crops.desktop={x:10,y:2,zoom:120,image:'old'};
 assert.equal(heroImageId(m,'desktop'),'one');
 assert.equal(heroImageId(m,'phone'),'one');
});

test('device-specific hero change preserves other devices and removes duplicate legacy source',()=>{
 const m=initial();
 setHeroGlobalImage(m,'global','Main portrait');
 assert.equal(heroImageId(m,'desktop'),'global');
 setHeroDeviceImage(m,'desktop','desktop-image');
 assert.equal(heroImageId(m,'desktop'),'desktop-image');
 assert.equal(heroImageId(m,'tablet'),'global');
 assert.equal(heroImageId(m,'phone'),'global');
 assert.equal(m.pictures.top,undefined);
 setHeroDeviceImage(m,'desktop','');
 assert.equal(heroImageId(m,'desktop'),'');
 assert.equal(heroImageId(m,'phone'),'global');
});

test('assigning photo to hero section makes a single globally chosen image',()=>{
 const m=initial();
 setHeroDeviceImage(m,'phone','mobile');
 setHeroDeviceImage(m,'desktop','desktop');
 setHeroGlobalImage(m,'shared');
 for(const d of ['desktop','tablet','phone'])assert.equal(heroImageId(m,d),'shared');
 setHeroGlobalImage(m,'');
 for(const d of ['desktop','tablet','phone'])assert.equal(heroImageId(m,d),'');
});
