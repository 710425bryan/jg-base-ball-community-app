import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputFile = path.join(process.cwd(), 'public', 'logo.jpg');
const outputDir = path.join(process.cwd(), 'public');

async function generateIcons() {
  if (!fs.existsSync(inputFile)) {
    console.error('Input file public/logo.jpg not found');
    process.exit(1);
  }

  console.log('Generating PWA icons from logo.jpg...');
  
  try {
    // Generate standard PWA icons
    await sharp(inputFile).resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(path.join(outputDir, 'pwa-192x192.png'));
    await sharp(inputFile).resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(path.join(outputDir, 'pwa-512x512.png'));
    
    // Generate apple touch icon
    await sharp(inputFile).resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toFile(path.join(outputDir, 'apple-touch-icon.png'));
    await sharp(inputFile).resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toFile(path.join(outputDir, 'apple-touch-icon-180x180.png'));
    
    // Generate favicon.ico (fallback) by generating a 64x64 PNG and renaming it to .ico which works universally
    await sharp(inputFile).resize(64, 64, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toFile(path.join(outputDir, 'favicon.ico'));

    console.log('Icons generated successfully.');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
