/**
 * Generate the web favicon + PWA icon set from the Rovora "R" mark.
 * Source: public/logo-mark.png (green R on transparent background).
 * Run: node scripts/generate-icons.js
 * Requires: npm install sharp
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../public/logo-mark.png');
const PUBLIC = path.join(__dirname, '../public');
const ICONS = path.join(PUBLIC, 'icons');
const DARK_BG = '#0f1411'; // brand dark, matches the mobile app icons

/** The mark on a transparent square, contained with a little breathing room. */
async function markOnTransparent(size, scale = 1) {
  const inner = Math.round(size * scale);
  const markBuf = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: markBuf }])
    .png()
    .toBuffer();
}

/** The mark centred on a solid dark tile (for app/home-screen icons). */
async function markOnDark(size, scale) {
  const inner = Math.round(size * scale);
  const markBuf = await sharp(SRC)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: DARK_BG } })
    .composite([{ input: markBuf }])
    .png()
    .toBuffer();
}

/** Assemble a .ico file from PNG buffers (PNG-in-ICO, supported everywhere modern). */
function buildIco(entries) {
  // entries: [{ size, buf }]
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const dirSize = 16 * count;
  let offset = 6 + dirSize;
  const dirs = [];
  for (const { size, buf } of entries) {
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    dir.writeUInt8(size >= 256 ? 0 : size, 1); // height
    dir.writeUInt8(0, 2); // palette
    dir.writeUInt8(0, 3); // reserved
    dir.writeUInt16LE(1, 4); // colour planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(buf.length, 8); // data size
    dir.writeUInt32LE(offset, 12); // data offset
    dirs.push(dir);
    offset += buf.length;
  }
  return Buffer.concat([header, ...dirs, ...entries.map((e) => e.buf)]);
}

async function main() {
  fs.mkdirSync(ICONS, { recursive: true });

  // Small favicons: the bare mark, near full-bleed so it stays legible tiny.
  fs.writeFileSync(path.join(ICONS, 'favicon-16x16.png'), await markOnTransparent(16, 1));
  fs.writeFileSync(path.join(ICONS, 'favicon-32x32.png'), await markOnTransparent(32, 1));

  // favicon.ico with 16/32/48 variants.
  const ico = buildIco([
    { size: 16, buf: await markOnTransparent(16, 1) },
    { size: 32, buf: await markOnTransparent(32, 1) },
    { size: 48, buf: await markOnTransparent(48, 1) },
  ]);
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico);

  // Apple touch icon: solid dark tile (iOS squares it off itself).
  fs.writeFileSync(path.join(ICONS, 'apple-touch-icon.png'), await markOnDark(180, 0.62));

  // Android / PWA icons: solid dark tile, mark inside the maskable safe zone.
  fs.writeFileSync(path.join(ICONS, 'android-chrome-192x192.png'), await markOnDark(192, 0.58));
  fs.writeFileSync(path.join(ICONS, 'android-chrome-512x512.png'), await markOnDark(512, 0.58));

  console.log('Done: favicon.ico, favicon-16/32, apple-touch-icon, android-chrome-192/512.');
}

main().catch((e) => { console.error(e); process.exit(1); });
