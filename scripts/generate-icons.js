/**
 * Generate PWA icons from SVG
 * Run: node scripts/generate-icons.js
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const inputSvg = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

async function generateIcons() {
  console.log('Generating PWA icons...');
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
    
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    
    console.log(`Created: icon-${size}x${size}.png`);
  }
  
  // Also create a badge icon for notifications
  await sharp(inputSvg)
    .resize(72, 72)
    .png()
    .toFile(path.join(outputDir, 'badge-72x72.png'));
  
  console.log('Created: badge-72x72.png');
  console.log('Done! All icons generated.');
}

generateIcons().catch(console.error);
