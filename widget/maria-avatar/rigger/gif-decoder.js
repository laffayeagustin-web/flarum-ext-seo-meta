/* =========================================================================
   Decodificador de GIF (87a/89a) en JS puro, sin dependencias.
   Devuelve los frames ya compuestos (aplicando disposal), listos para
   elegir cuál sirve de pose base para el recorte.

     GifDecoder.decode(arrayBuffer)
       -> { width, height, frames: [{ imageData, delay, disposal }] }
   ========================================================================= */

(function (global) {
  'use strict';

  function readSubBlocks(b, p) {
    var chunks = [], total = 0, size;
    while ((size = b[p.i++]) !== 0) {
      if (p.i + size > b.length) break;
      chunks.push(b.subarray(p.i, p.i + size));
      total += size;
      p.i += size;
    }
    var out = new Uint8Array(total), o = 0;
    for (var k = 0; k < chunks.length; k++) { out.set(chunks[k], o); o += chunks[k].length; }
    return out;
  }

  function readPalette(b, p, n) {
    var pal = new Uint8Array(n * 3);
    pal.set(b.subarray(p.i, p.i + n * 3));
    p.i += n * 3;
    return pal;
  }

  // LZW de GIF: códigos empaquetados de menor a mayor bit
  function lzw(minCodeSize, data, pixelCount) {
    var MAX = 4096;
    var clear = 1 << minCodeSize;
    var eoi = clear + 1;
    var prefix = new Int32Array(MAX);
    var suffix = new Uint8Array(MAX);
    var stack = new Uint8Array(MAX + 1);
    var out = new Uint8Array(pixelCount);
    var i;
    for (i = 0; i < clear; i++) { prefix[i] = -1; suffix[i] = i; }

    var codeSize = minCodeSize + 1;
    var next = eoi + 1;
    var bytePos = 0, bitPos = 0, pos = 0, sp = 0;
    var prev = -1, first = 0;

    function readCode() {
      var code = 0;
      for (var n = 0; n < codeSize; n++) {
        if (bytePos >= data.length) return eoi;
        code |= ((data[bytePos] >> bitPos) & 1) << n;
        if (++bitPos === 8) { bitPos = 0; bytePos++; }
      }
      return code;
    }

    while (pos < pixelCount) {
      var code = readCode();
      if (code === clear) {
        codeSize = minCodeSize + 1;
        next = eoi + 1;
        prev = -1;
        continue;
      }
      if (code === eoi) break;
      if (prev === -1) {
        out[pos++] = suffix[code];
        first = suffix[code];
        prev = code;
        continue;
      }
      var inCode = code;
      if (code >= next) { stack[sp++] = first; code = prev; }
      var guard = 0;
      while (code >= clear && guard++ < MAX) { stack[sp++] = suffix[code]; code = prefix[code]; }
      first = suffix[code];
      stack[sp++] = first;
      while (sp > 0 && pos < pixelCount) out[pos++] = stack[--sp];
      sp = 0;
      if (next < MAX) {
        prefix[next] = prev;
        suffix[next] = first;
        next++;
        if (next === (1 << codeSize) && codeSize < 12) codeSize++;
      }
      prev = inCode;
    }
    return out;
  }

  var INTERLACE = [[0, 8], [4, 8], [2, 4], [1, 2]];

  function decode(buffer) {
    var b = new Uint8Array(buffer);
    var p = { i: 0 };
    var sig = String.fromCharCode(b[0], b[1], b[2], b[3], b[4], b[5]);
    if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new Error('No parece un GIF (' + sig + ')');
    p.i = 6;

    var width = b[p.i++] | (b[p.i++] << 8);
    var height = b[p.i++] | (b[p.i++] << 8);
    var packed = b[p.i++];
    p.i++;  // índice de fondo
    p.i++;  // aspect ratio
    var gct = null;
    if (packed & 0x80) gct = readPalette(b, p, 1 << ((packed & 7) + 1));

    var frames = [];
    var canvas = new Uint8ClampedArray(width * height * 4);   // lienzo compuesto
    var gce = { delay: 100, disposal: 0, transparent: -1 };
    var guard = 0;

    while (p.i < b.length && guard++ < 5000) {
      var block = b[p.i++];

      if (block === 0x3B) break;                                  // fin

      if (block === 0x21) {                                       // extensión
        var label = b[p.i++];
        if (label === 0xF9) {
          p.i++;                                                  // tamaño (4)
          var flags = b[p.i++];
          var delay = (b[p.i++] | (b[p.i++] << 8)) * 10;
          var tIndex = b[p.i++];
          p.i++;                                                  // terminador
          gce = {
            delay: delay || 100,
            disposal: (flags >> 2) & 7,
            transparent: (flags & 1) ? tIndex : -1
          };
        } else {
          readSubBlocks(b, p);
        }
        continue;
      }

      if (block !== 0x2C) continue;                               // sólo quedan imágenes

      var left = b[p.i++] | (b[p.i++] << 8);
      var top = b[p.i++] | (b[p.i++] << 8);
      var fw = b[p.i++] | (b[p.i++] << 8);
      var fh = b[p.i++] | (b[p.i++] << 8);
      var fPacked = b[p.i++];
      var lct = (fPacked & 0x80) ? readPalette(b, p, 1 << ((fPacked & 7) + 1)) : null;
      var interlaced = !!(fPacked & 0x40);
      var pal = lct || gct;
      var minCodeSize = b[p.i++];
      var data = readSubBlocks(b, p);
      var indices = lzw(minCodeSize, data, fw * fh);

      // guardar para disposal 3 (volver al estado anterior)
      var snapshot = gce.disposal === 3 ? canvas.slice(0) : null;

      var rows = [];
      if (interlaced) {
        var r = 0;
        for (var pass = 0; pass < 4; pass++) {
          for (var y = INTERLACE[pass][0]; y < fh; y += INTERLACE[pass][1]) rows[y] = r++;
        }
      }

      for (var yy = 0; yy < fh; yy++) {
        var srcRow = interlaced ? rows[yy] : yy;
        var cy = top + yy;
        if (cy < 0 || cy >= height) continue;
        for (var xx = 0; xx < fw; xx++) {
          var cx = left + xx;
          if (cx < 0 || cx >= width) continue;
          var idx = indices[srcRow * fw + xx];
          if (idx === gce.transparent) continue;
          var o = (cy * width + cx) * 4;
          canvas[o] = pal[idx * 3];
          canvas[o + 1] = pal[idx * 3 + 1];
          canvas[o + 2] = pal[idx * 3 + 2];
          canvas[o + 3] = 255;
        }
      }

      frames.push({
        imageData: new ImageData(new Uint8ClampedArray(canvas), width, height),
        delay: gce.delay,
        disposal: gce.disposal
      });

      // preparar el lienzo para el frame siguiente
      if (gce.disposal === 2) {
        for (var ry = top; ry < top + fh; ry++) {
          if (ry < 0 || ry >= height) continue;
          for (var rx = left; rx < left + fw; rx++) {
            if (rx < 0 || rx >= width) continue;
            var ro = (ry * width + rx) * 4;
            canvas[ro] = canvas[ro + 1] = canvas[ro + 2] = canvas[ro + 3] = 0;
          }
        }
      } else if (gce.disposal === 3 && snapshot) {
        canvas.set(snapshot);
      }

      gce = { delay: 100, disposal: 0, transparent: -1 };
    }

    if (!frames.length) throw new Error('El GIF no tiene frames legibles');
    return { width: width, height: height, frames: frames };
  }

  global.GifDecoder = { decode: decode };

})(typeof window !== 'undefined' ? window : this);
