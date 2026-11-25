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
