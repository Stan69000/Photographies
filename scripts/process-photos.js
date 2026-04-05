#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.JPG', '.JPEG', '.png', '.PNG']);

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    i += 1;
  }
  return args;
}

function usage() {
  console.log('Usage: node scripts/process-photos.js --input ./exports --output ./processed --name "Stan" --year 2025');
}

function escapeXml(input) {
  return String(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

async function collectFiles(dir) {
  const stack = [dir];
  const files = [];

  while (stack.length) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && IMAGE_EXT.has(path.extname(entry.name))) {
        files.push(full);
      }
    }
  }

  return files.sort();
}

function createWatermarkSvg({ text, imageWidth, imageHeight }) {
  const pad = 24;
  const width = Math.max(220, Math.min(1800, imageWidth - pad * 2));
  const height = Math.max(72, Math.min(160, Math.round(imageHeight * 0.09)));
  const fontSize = Math.max(18, Math.min(44, Math.round(height * 0.45)));
  const safeText = escapeXml(text);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <text
        x="${width - pad}"
        y="${height - pad}"
        text-anchor="end"
        font-family="monospace"
        font-size="${fontSize}"
        fill="rgba(255,255,255,0.6)"
      >${safeText}</text>
    </svg>
  `);
}

async function ensureDirs(base) {
  const dirs = {
    public: path.join(base, 'public'),
    watermarked: path.join(base, 'public', 'watermarked'),
    thumbs: path.join(base, 'thumbs')
  };

  await Promise.all(Object.values(dirs).map((dir) => fs.mkdir(dir, { recursive: true })));
  return dirs;
}

async function processOne(file, inputBase, dirs, watermarkText) {
  const relative = path.relative(inputBase, file);
  const name = relative.replace(path.extname(relative), '').replaceAll(path.sep, '-');

  const baseImage = sharp(file).rotate();
  const resized = baseImage.clone().resize({
    width: 2400,
    height: 2400,
    fit: 'inside',
    withoutEnlargement: true
  });

  const resizedBuffer = await resized.clone().webp({ quality: 85 }).toBuffer();
  const metadata = await sharp(resizedBuffer).metadata();
  const imageWidth = metadata.width ?? 2400;
  const imageHeight = metadata.height ?? 2400;
  const wmSvg = createWatermarkSvg({ text: watermarkText, imageWidth, imageHeight });
  const wmOverlay = await sharp(wmSvg).png().toBuffer();

  const baseOut = path.join(dirs.public, `${name}.webp`);
  const watermarkOut = path.join(dirs.watermarked, `${name}.webp`);
  const thumbOut = path.join(dirs.thumbs, `${name}.webp`);

  await fs.writeFile(baseOut, resizedBuffer);
  await sharp(resizedBuffer)
    .composite([{ input: wmOverlay, gravity: 'southeast' }])
    .webp({ quality: 85 })
    .toFile(watermarkOut);

  await sharp(file)
    .rotate()
    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(thumbOut);

  return {
    source: relative,
    public: baseOut,
    watermarked: watermarkOut,
    thumb: thumbOut
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const input = args.input;
  const output = args.output;
  const name = args.name;
  const year = args.year;

  if (!input || !output || !name || !year) {
    usage();
    process.exit(1);
  }

  const inputDir = path.resolve(process.cwd(), input);
  const outputDir = path.resolve(process.cwd(), output);
  const watermarkText = `© ${name} ${year}`;

  const files = await collectFiles(inputDir);
  if (!files.length) {
    console.error(`Aucune image détectée dans ${inputDir}`);
    process.exit(1);
  }

  const dirs = await ensureDirs(outputDir);
  const manifest = [];

  for (const file of files) {
    const result = await processOne(file, inputDir, dirs, watermarkText);
    manifest.push(result);
    console.log(`OK: ${result.source}`);
  }

  const manifestPath = path.join(outputDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`\nTerminé: ${manifest.length} image(s)`);
  console.log(`Public: ${dirs.public}`);
  console.log(`Watermarked: ${dirs.watermarked}`);
  console.log(`Thumbs: ${dirs.thumbs}`);
  console.log(`Manifest: ${manifestPath}`);
  console.log(`\nUpload public O2Switch:`);
  console.log(`rsync -avz ${dirs.public}/ user@o2switch:/home/user/photos/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
