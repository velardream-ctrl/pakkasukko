import sharp from 'sharp';
import {stat} from 'node:fs/promises';

const source='docs/assets/spatial-lab-panorama.png';
const output='docs/assets/spatial-lab-panorama.webp';
const input=await stat(source);
const meta=await sharp(source).metadata();
if(!meta.width||!meta.height)throw Error('Panorama source is not a readable image.');
await sharp(source).webp({quality:82,effort:5}).toFile(output);
const optimized=await stat(output);
if(optimized.size>=input.size)throw Error('Optimized panorama must be smaller than the original.');
console.log('Panorama '+meta.width+'×'+meta.height+': '+input.size+' → '+optimized.size+' bytes ('+Math.round(100*optimized.size/input.size)+'%).');

const portraitSource='docs/assets/demo-3d-santa.png';
const portraitOutput='docs/assets/demo-3d-santa.webp';
const portraitInput=await stat(portraitSource);
const portraitMeta=await sharp(portraitSource).metadata();
if(!portraitMeta.width||!portraitMeta.height||!portraitMeta.hasAlpha)throw Error('Santa foreground must retain transparency.');
await sharp(portraitSource).webp({quality:90,alphaQuality:100,effort:5}).toFile(portraitOutput);
const portraitOptimized=await stat(portraitOutput);
if(portraitOptimized.size>=portraitInput.size)throw Error('Optimized Santa foreground must be smaller than the PNG.');
console.log('Santa foreground '+portraitMeta.width+'×'+portraitMeta.height+': '+portraitInput.size+' → '+portraitOptimized.size+' bytes ('+Math.round(100*portraitOptimized.size/portraitInput.size)+'%).');
