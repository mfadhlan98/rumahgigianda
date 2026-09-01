import zlib from 'node:zlib';

/**
 * Encoder PNG minimal (RGBA 8-bit) untuk membuat logo uji beresolusi tinggi
 * tanpa dependensi tambahan. Dipakai oleh smoke.mjs untuk menguji jalur
 * unggah logo dan penyematannya ke dalam PDF.
 */

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** Lingkaran teal berhuruf "M" — cukup mewakili logo klinik pada pengujian. */
export function makeLogoPng(size = 600) {
  const S = size;
  const px = Buffer.alloc(S * S * 4);
  const set = (x, y, r, g, b, a = 255) => {
    const i = (y * S + x) * 4;
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a;
  };

  const cx = S / 2;
  const cy = S / 2;
  const R = S * 0.46;
  for (let y = 0; y < S; y += 1) {
    for (let x = 0; x < S; x += 1) {
      if (Math.hypot(x - cx, y - cy) <= R) set(x, y, 15, 61, 62, 255);
      else set(x, y, 0, 0, 0, 0);
    }
  }

  const t = S * 0.055;
  const stroke = (x0, y0, x1, y1) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let s = 0; s <= steps; s += 1) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      for (let dy = -t; dy <= t; dy += 1) {
        for (let dx = -t; dx <= t; dx += 1) {
          const px_ = Math.round(x + dx);
          const py_ = Math.round(y + dy);
          if ( px_ >= 0 && px_ < S && py_ >= 0 && py_ < S) set( px_, py_, 255, 255, 255, 255);
        }
      }
    }
  };
  stroke(S * 0.30, S * 0.68, S * 0.30, S * 0.33);
  stroke(S * 0.30, S * 0.33, S * 0.50, S * 0.56);
  stroke(S * 0.50, S * 0.56, S * 0.70, S * 0.33);
  stroke(S * 0.70, S * 0.33, S * 0.70, S * 0.68);

  // Setiap scanline diawali byte filter 0 (None).
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y += 1) {
    raw[y * (S * 4 + 1)] = 0;
    px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Bisa juga dipanggil langsung:  node test/make-logo.mjs logo.png
if (process.argv[1] && process.argv[1].endsWith('make-logo.mjs') && process.argv[2]) {
  const fs = await import('node:fs');
  const png = makeLogoPng(600);
  fs.writeFileSync(process.argv[2], png);
  console.log(`PNG 600x600 ditulis ke ${process.argv[2]} (${(png.length / 1024).toFixed(0)} KB)`);
}
