/* Arma la versión de un solo archivo: mete adentro el CSS, el JS, el rig y el
   frame (como data URI). Sirve para pegar el widget en cualquier página.
     node dist/build.mjs                 -> dist/maria-avatar.demo.html
     node dist/build.mjs --fragmento     -> además dist/maria-articulada.artifact.html (sin <html>, para publicar) */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aca = dirname(fileURLToPath(import.meta.url));
const raiz = join(aca, '..');
const leer = (p) => readFileSync(join(raiz, p), 'utf8');

const css = leer('maria-avatar.css');
const js = leer('maria-avatar.js');
const rig = leer('rigs/maria-placeholder.rig.json');
const svg = leer('art/maria-placeholder.svg');

// el SVG entra como data URI escapado (más chico y legible que base64)
const sheet = 'data:image/svg+xml,' + encodeURIComponent(svg.replace(/\n\s*/g, ' ')).replace(/'/g, '%27');

let out = leer('dist/plantilla.html')
  .replace('/*  ======= MARIA-AVATAR-CSS =======  */', () => css)
  .replace('/*  ======= MARIA-AVATAR-JS =======  */', () => js)
  .replace('/*  ======= MARIA-RIG =======  */ null', () => JSON.stringify(JSON.parse(rig)))
  .replace("/*  ======= MARIA-SHEET =======  */ ''", () => JSON.stringify(sheet));

writeFileSync(join(aca, 'maria-articulada.artifact.html'), out);
writeFileSync(join(aca, 'maria-avatar.demo.html'),
  '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '<style>*{box-sizing:border-box}img{max-width:100%}[hidden]{display:none!important}</style>\n' +
  out.replace(/^<title>[\s\S]*?<\/title>\n/, '<title>MarIA articulada</title>\n') +
  '\n</html>\n');

console.log('listo:', (out.length / 1024).toFixed(0) + ' KB');
