import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const iconsDir = path.join(rootDir, "public", "icons");
const screenshotsDir = path.join(rootDir, "public", "screenshots");

const ICON_SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const SCREENSHOTS = [
  { name: "screenshot-home.png", width: 1080, height: 1920, mode: "portrait" },
  { name: "screenshot-history.png", width: 1280, height: 720, mode: "landscape" }
];

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      if ((crc & 1) === 1) {
        crc = 0xedb88320 ^ (crc >>> 1);
      } else {
        crc >>>= 1;
      }
    }
    table[index] = crc >>> 0;
  }
  return table;
}

const CRC_TABLE = createCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length, 0);

  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

function createPng(width, height, getPixel) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixel = getPixel(x, y, width, height);
      const offset = rowOffset + 1 + x * 4;
      raw[offset] = clamp(Math.round(pixel.r), 0, 255);
      raw[offset + 1] = clamp(Math.round(pixel.g), 0, 255);
      raw[offset + 2] = clamp(Math.round(pixel.b), 0, 255);
      raw[offset + 3] = clamp(Math.round(pixel.a ?? 255), 0, 255);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    createChunk("IHDR", ihdr),
    createChunk("IDAT", idat),
    createChunk("IEND", Buffer.alloc(0))
  ]);
}

function mixColor(colorA, colorB, amount) {
  return {
    r: colorA.r + (colorB.r - colorA.r) * amount,
    g: colorA.g + (colorB.g - colorA.g) * amount,
    b: colorA.b + (colorB.b - colorA.b) * amount,
    a: colorA.a + (colorB.a - colorA.a) * amount
  };
}

function iconPixel(x, y, width, height) {
  const backgroundTop = { r: 241, g: 246, b: 244, a: 255 };
  const backgroundBottom = { r: 210, g: 233, b: 229, a: 255 };
  const base = mixColor(backgroundTop, backgroundBottom, y / height);

  const centerX = width * 0.5;
  const centerY = height * 0.48;
  const dx = x - centerX;
  const dy = y - centerY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const glow = clamp(1 - distance / (width * 0.7), 0, 1);

  let color = {
    r: base.r + glow * 10,
    g: base.g + glow * 10,
    b: base.b + glow * 12,
    a: 255
  };

  const cardX = width * 0.18;
  const cardY = height * 0.14;
  const cardW = width * 0.64;
  const cardH = height * 0.72;
  const corner = width * 0.09;

  const localX = clamp(x, cardX, cardX + cardW);
  const localY = clamp(y, cardY, cardY + cardH);
  const cornerDx = x - localX;
  const cornerDy = y - localY;
  const insideCard =
    cornerDx * cornerDx + cornerDy * cornerDy <= corner * corner ||
    (x >= cardX + corner && x <= cardX + cardW - corner) ||
    (y >= cardY + corner && y <= cardY + cardH - corner);

  if (insideCard) {
    color = { r: 252, g: 254, b: 253, a: 255 };
  }

  const shadowStart = width * 0.015;
  if (
    x > cardX + shadowStart &&
    x < cardX + cardW + width * 0.04 &&
    y > cardY + shadowStart &&
    y < cardY + cardH + height * 0.04 &&
    !insideCard
  ) {
    color = mixColor(color, { r: 155, g: 182, b: 178, a: 255 }, 0.18);
  }

  const accentCircleX = width * 0.72;
  const accentCircleY = height * 0.28;
  const accentRadius = width * 0.13;
  const accentDistance = Math.sqrt(
    (x - accentCircleX) * (x - accentCircleX) +
      (y - accentCircleY) * (y - accentCircleY)
  );
  if (accentDistance <= accentRadius) {
    const blend = 1 - accentDistance / accentRadius;
    color = mixColor(color, { r: 54, g: 145, b: 142, a: 255 }, blend * 0.9);
  }

  const waterDropDistance = Math.sqrt(
    (x - width * 0.7) * (x - width * 0.7) +
      (y - height * 0.69) * (y - height * 0.69)
  );
  if (waterDropDistance < width * 0.09 && y > height * 0.56) {
    color = mixColor(color, { r: 68, g: 153, b: 210, a: 255 }, 0.88);
  }

  const waterPoint = Math.abs(x - width * 0.7) / (width * 0.08) + (height * 0.58 - y) / (height * 0.12);
  if (waterPoint < 1 && y < height * 0.66 && y > height * 0.5) {
    color = mixColor(color, { r: 68, g: 153, b: 210, a: 255 }, 0.88);
  }

  const lineStartX = width * 0.28;
  const checkboxSize = width * 0.09;
  const lineGap = height * 0.14;
  for (let index = 0; index < 3; index += 1) {
    const boxY = height * 0.28 + lineGap * index;
    if (
      x >= lineStartX &&
      x <= lineStartX + checkboxSize &&
      y >= boxY &&
      y <= boxY + checkboxSize
    ) {
      const border = 3 + Math.round(width * 0.01);
      const isBorder =
        x < lineStartX + border ||
        x > lineStartX + checkboxSize - border ||
        y < boxY + border ||
        y > boxY + checkboxSize - border;

      color = isBorder
        ? { r: 64, g: 118, b: 117, a: 255 }
        : { r: 242, g: 248, b: 246, a: 255 };
    }

    if (
      x > lineStartX + checkboxSize + width * 0.05 &&
      x < width * 0.7 &&
      Math.abs(y - (boxY + checkboxSize * 0.45)) < height * 0.015
    ) {
      color = { r: 97, g: 115, b: 121, a: 255 };
    }
  }

  const checkOne =
    x > width * 0.305 &&
    x < width * 0.35 &&
    y > height * 0.44 &&
    y < height * 0.49 &&
    Math.abs((y - height * 0.49) - (x - width * 0.305)) < width * 0.01;
  const checkTwo =
    x > width * 0.34 &&
    x < width * 0.4 &&
    y > height * 0.4 &&
    y < height * 0.47 &&
    Math.abs((y - height * 0.47) + (x - width * 0.34) * 0.9) < width * 0.01;

  if (checkOne || checkTwo) {
    color = { r: 236, g: 131, b: 78, a: 255 };
  }

  return color;
}

function screenshotPixel(x, y, width, height, mode) {
  const top = mode === "portrait"
    ? { r: 243, g: 246, b: 243, a: 255 }
    : { r: 235, g: 244, b: 249, a: 255 };
  const bottom = mode === "portrait"
    ? { r: 225, g: 235, b: 228, a: 255 }
    : { r: 214, g: 228, b: 236, a: 255 };
  let color = mixColor(top, bottom, y / height);

  const spotlightDistance = Math.sqrt(
    (x - width * 0.78) * (x - width * 0.78) +
      (y - height * 0.18) * (y - height * 0.18)
  );
  if (spotlightDistance < width * 0.25) {
    color = mixColor(color, { r: 255, g: 255, b: 255, a: 255 }, 0.3);
  }

  const shellMargin = mode === "portrait" ? width * 0.08 : width * 0.04;
  const shellWidth = mode === "portrait" ? width * 0.84 : width * 0.52;
  const shellHeight = mode === "portrait" ? height * 0.88 : height * 0.8;
  const shellX = mode === "portrait" ? width * 0.08 : width * 0.06;
  const shellY = mode === "portrait" ? height * 0.06 : height * 0.1;
  const shellInside =
    x >= shellX && x <= shellX + shellWidth && y >= shellY && y <= shellY + shellHeight;

  if (shellInside) {
    color = { r: 251, g: 253, b: 252, a: 255 };
  }

  if (
    x >= shellX &&
    x <= shellX + shellWidth &&
    y >= shellY &&
    y <= shellY + height * 0.12
  ) {
    color = { r: 217, g: 242, b: 238, a: 255 };
  }

  const progressX = shellX + shellMargin * 0.55;
  const progressY = shellY + height * 0.09;
  const progressW = shellWidth - shellMargin * 1.1;
  const progressH = height * 0.018;
  if (
    x >= progressX &&
    x <= progressX + progressW &&
    y >= progressY &&
    y <= progressY + progressH
  ) {
    color = { r: 229, g: 237, b: 235, a: 255 };
  }
  if (
    x >= progressX &&
    x <= progressX + progressW * 0.62 &&
    y >= progressY &&
    y <= progressY + progressH
  ) {
    color = { r: 54, g: 145, b: 142, a: 255 };
  }

  const cardWidth = mode === "portrait" ? shellWidth - shellMargin * 1.1 : shellWidth - shellMargin * 1.2;
  const cardHeight = mode === "portrait" ? height * 0.12 : height * 0.19;
  const cardX = progressX;
  const firstCardY = shellY + height * 0.16;
  const cardGap = mode === "portrait" ? height * 0.03 : height * 0.05;

  for (let index = 0; index < 4; index += 1) {
    const currentY = firstCardY + index * (cardHeight + cardGap);
    if (
      x >= cardX &&
      x <= cardX + cardWidth &&
      y >= currentY &&
      y <= currentY + cardHeight
    ) {
      color = index % 2 === 0
        ? { r: 247, g: 250, b: 249, a: 255 }
        : { r: 244, g: 248, b: 246, a: 255 };
    }

    const accentWidth = cardWidth * (0.45 + index * 0.08);
    if (
      x >= cardX &&
      x <= cardX + accentWidth &&
      y >= currentY &&
      y <= currentY + height * 0.015
    ) {
      color = { r: 104, g: 126, b: 133, a: 255 };
    }

    const lineY = currentY + cardHeight * 0.38;
    if (
      x >= cardX + cardWidth * 0.18 &&
      x <= cardX + cardWidth * 0.8 &&
      Math.abs(y - lineY) < height * 0.007
    ) {
      color = { r: 190, g: 201, b: 200, a: 255 };
    }

    const boxX = cardX + cardWidth * 0.06;
    const boxY = currentY + cardHeight * 0.28;
    const boxSize = cardHeight * 0.28;
    if (x >= boxX && x <= boxX + boxSize && y >= boxY && y <= boxY + boxSize) {
      const border = Math.max(2, Math.floor(height * 0.003));
      const borderHit =
        x < boxX + border ||
        x > boxX + boxSize - border ||
        y < boxY + border ||
        y > boxY + boxSize - border;
      color = borderHit
        ? { r: 64, g: 118, b: 117, a: 255 }
        : { r: 242, g: 248, b: 246, a: 255 };
    }
  }

  if (mode === "landscape") {
    const sideX = width * 0.64;
    const sideY = height * 0.18;
    const sideW = width * 0.28;
    const sideH = height * 0.58;
    if (x >= sideX && x <= sideX + sideW && y >= sideY && y <= sideY + sideH) {
      color = { r: 250, g: 252, b: 251, a: 255 };
    }

    const ringCenterX = sideX + sideW * 0.5;
    const ringCenterY = sideY + sideH * 0.28;
    const ringDistance = Math.sqrt(
      (x - ringCenterX) * (x - ringCenterX) +
        (y - ringCenterY) * (y - ringCenterY)
    );
    if (ringDistance < sideW * 0.28 && ringDistance > sideW * 0.18) {
      color = { r: 236, g: 131, b: 78, a: 255 };
    }
    if (ringDistance <= sideW * 0.18) {
      color = { r: 251, g: 253, b: 252, a: 255 };
    }

    const metricY = sideY + sideH * 0.58;
    if (
      x >= sideX + sideW * 0.12 &&
      x <= sideX + sideW * 0.82 &&
      Math.abs(y - metricY) < height * 0.01
    ) {
      color = { r: 190, g: 201, b: 200, a: 255 };
    }
  }

  return color;
}

async function writePng(filePath, width, height, pixelFunction) {
  const png = createPng(width, height, pixelFunction);
  await writeFile(filePath, png);
}

async function main() {
  await mkdir(iconsDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });

  await Promise.all(
    ICON_SIZES.map((size) =>
      writePng(path.join(iconsDir, `icon-${size}.png`), size, size, iconPixel)
    )
  );

  await Promise.all(
    SCREENSHOTS.map((shot) =>
      writePng(
        path.join(screenshotsDir, shot.name),
        shot.width,
        shot.height,
        (x, y, width, height) => screenshotPixel(x, y, width, height, shot.mode)
      )
    )
  );
}

await main();
