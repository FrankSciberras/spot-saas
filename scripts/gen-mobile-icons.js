// One-off: generate Expo app icons for mobile/ from the Rovora "R" mark.
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'public', 'logo-mark.png');
const OUT = path.join(__dirname, '..', 'mobile', 'assets');
const BG = '#0f1411';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  // Main icon: 1024x1024 on solid background.
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
    .composite([{ input: await sharp(SRC).resize(820, 820, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer() }])
    .png()
    .toFile(path.join(OUT, 'icon.png'));

  // Android adaptive foreground: logo within the ~66% safe zone, transparent around it.
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await sharp(SRC).resize(600, 600, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer() }])
    .png()
    .toFile(path.join(OUT, 'android-icon-foreground.png'));

  // Adaptive background: solid brand dark.
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
    .png()
    .toFile(path.join(OUT, 'android-icon-background.png'));

  // Monochrome: white silhouette from the logo's alpha.
  const { data, info } = await sharp(SRC)
    .resize(600, 600, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
  }
  const mono = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mono }])
    .png()
    .toFile(path.join(OUT, 'android-icon-monochrome.png'));

  // Favicon + splash icon.
  await sharp(SRC).resize(48, 48).png().toFile(path.join(OUT, 'favicon.png'));

  console.log('Mobile icons written to', OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
