# MarIA avatar

Muñeco articulado a partir de un gif + globo de chat, para
[maria.ar](https://maria.ar/) / [Campus MarIA](https://campus.maria.ar/public/).

El gif deja de reproducirse como video: se toma **un frame**, se lo corta en cajas
(cabeza, torso, brazos, antebrazos, manos, piernas…) y cada caja se dibuja como una
*ventana* a esa misma imagen (`background-position` negativo). Las cajas se anidan en
el DOM siguiendo el esqueleto, así cada hueso hereda la rotación del padre y el
conjunto se mueve como un muñeco de papel.

Con todos los ángulos en cero el muñeco **reconstruye el frame original pixel por
pixel**: por eso las piezas siempre calzan.

Cada tanto un dedo cruza la pantalla y señala a MarIA. Si se lo toca —o se le pasa
cerca con el mouse— se abre el globo de chat y MarIA se achica abajo a la izquierda,
con la colita del globo apuntándole. Al cerrar el globo, vuelve a su lugar.

## Archivos

| | |
|---|---|
| `maria-avatar.js` | runtime: rig, animación, el dedo, el globo y el achique al rincón |
| `maria-avatar.css` | estilos, todos colgados de variables CSS |
| `rigs/*.rig.json` | definición del esqueleto (qué caja es cada parte) |
| `art/maria-placeholder.svg` | MarIA de mentira, para probar el mecanismo sin el gif real |
| `rigger/index.html` | herramienta para cortar el gif y exportar el rig |
| `rigger/gif-decoder.js` | decodificador de GIF 87a/89a en JS puro (sin dependencias) |
| `demo.html` | demo de desarrollo |
| `dist/build.mjs` | arma la versión de un solo archivo |

## Uso

```html
<link rel="stylesheet" href="maria-avatar.css">
<script src="maria-avatar.js"></script>
<script>
  fetch('rigs/maria.rig.json').then(r => r.json()).then(rig => {
    const maria = MariaAvatar.mount({
      rig,
      sheet: 'art/maria-frame.png',       // el frame del gif
      chat: {
        greeting: '¡Hola! Soy MarIA 👋',
        quickReplies: ['¿Qué es GEO?', 'Quiero entrar al Campus'],
        onSend(texto, api) {              // acá se engancha el chat real
          api.typing(true);
          fetch('/api/maria', { method: 'POST', body: texto })
            .then(r => r.text())
            .then(r => api.reply(r));
        }
        // Si el backend banca streaming (SSE), en vez de reply() de una:
        //   api.delta('cada pedacito ')  → arma la burbuja al primer delta
        //   api.endDelta({ quick: [...] })  → cierra el turno
        // Además: api.system(texto) nota de sistema (devuelve el nodo: se le
        // puede reescribir .textContent o mandarle .remove() cuando termine
        // un trabajo de fondo); api.link(url, etiqueta, { whatsapp }) para un
        // CTA (whatsapp:true por defecto = verde con ícono); api.error(texto).
      }
    });
  });
</script>
```

`dist/maria-avatar.demo.html` es la misma demo en **un solo archivo** (CSS, JS, rig y
dibujo adentro): sirve para pegarla en cualquier página o mandarla por mail. Se
regenera con `node dist/build.mjs`.

### Opciones

| opción | por defecto | qué hace |
|---|---|---|
| `rig`, `sheet` | — | esqueleto y frame (obligatorios) |
| `target` | `null` | elemento donde se para MarIA; sin esto, flota en un rincón |
| `side` | `'right'` | de qué lado vive cuando no está el globo abierto |
| `heroHeight`, `heroMax` | `.46`, `430` | tamaño grande (en teléfonos se achica sola) |
| `dockSize` | `118` | alto cuando se va al rincón con el globo abierto |
| `finger` | `true` | el dedo que cruza la pantalla |
| `brushRadius` | `52` | qué tan cerca hay que pasarle al dedo para que cuente como roce |
| `fingerOpts.once` | `false` | el dedo aparece, hace su gesto y no vuelve a programarse (ni solo, ni al cerrar el chat). Por defecto sigue reapareciendo cada `fingerOpts.interval`/`fingerReturnMs`. |
| `accent`, `accent2`, `theme` | — | atajos para la marca |
| `autoGreet` | `true` | saluda sola al abrirse el globo |

### API y eventos

```js
maria.open();  maria.close();  maria.toggle();
maria.play('saludo' | 'hablar' | 'atencion' | 'idle');
maria.say('Che, mirá esto', 4000);     // burbuja suelta sobre la cabeza
maria.setRig(otroRig, otroSheet);      // cambiar de personaje en caliente
maria.destroy();
```

Dispara `maria:open`, `maria:close` y `maria:send` (con `detail.text`) sobre su raíz.

### Marca

Todo el color y la forma salen de variables CSS sobre `.ma-root`:

```css
.ma-root {
  --ma-accent: #7c3aed;      /* poner acá el violeta de maria.ar */
  --ma-accent-2: #f0409f;
  --ma-radius: 22px;
  --ma-font: "Tu tipografía", sans-serif;
}
```

Respeta el tema del visitante (claro / oscuro) y `prefers-reduced-motion`.

## Cortar el gif real

Abrir `rigger/index.html` (anda con doble clic, no necesita servidor) y:

1. **Soltar el gif.** Se decodifica en el navegador, cuadro por cuadro; no se sube a
   ningún lado. Elegir en la tira el frame que sirva de pose base —de frente,
   brazos separados del cuerpo.
2. **Encajar al personaje.** Mide la silueta (el perfil de anchos fila por fila),
   encuentra el cuello y los hombros y acomoda solo el esqueleto. Después se
   arrastran las articulaciones que hayan quedado corridas.
3. **Grosores.** Cada tramo tiene su ancho. La previsualización de la derecha se
   anima en vivo con el rig actual: si una parte arrastra pixeles de la de al lado,
   se achica el grosor; si algo desaparece, es que no entró en ninguna caja y hay
   que ensanchar la parte que le corresponde.
4. **Cara.** Tres rectángulos (dos párpados y la boca) y el gotero para sacar el
   color de piel de la propia imagen: con eso parpadea y mueve la boca al hablar.
5. **Exportar.** Guarda `rig.json` y `sheet.png` juntos.

### Qué frame conviene

- De frente y con los brazos algo separados del cuerpo: si el brazo está pegado, la
  caja del brazo se lleva puesto un pedazo de torso.
- Fondo transparente (o un fondo plano bien distinto del personaje: el detector de
  silueta lo usa para medir).
- Cuanto más quieto el frame, mejor: la animación la pone el rig.

## Formato del rig

```jsonc
{
  "stage": { "w": 320, "h": 560 },          // tamaño del frame
  "shadow": { "x": 160, "y": 498, "w": 156, "h": 26 },
  "bones": [
    {
      "id": "brazo_d",
      "parent": "torso",
      "box": [184, 222, 46, 84],            // recorte dentro del frame [x, y, w, h]
      "pivot": [196, 214],                  // articulación, en coordenadas del frame
      "z": 1,                               // orden contra los hermanos
      "clip": { "capsule": [196, 214, 216, 274, 12] },
      "follow": 0.45,                       // inercia (pelo, manos)
      "art": false                          // hueso sin dibujo, sólo pivote
    }
  ],
  "overlays": [
    { "bone": "cabeza", "role": "lid",   "x": 139, "y": 114, "w": 16, "h": 18,
      "shape": "rect", "color": "#f7cfae" },
    { "bone": "cabeza", "role": "mouth", "x": 150, "y": 141, "w": 20, "h": 15,
      "color": "#7d3b4c" }
  ]
}
```

**El pivote es un punto del dibujo original**, no una coordenada local: es lo que hace
que el hijo caiga solo en su lugar dentro del padre (la posición relativa es la resta
de los orígenes de las dos cajas).

**El recorte (`clip`) es lo que evita las costuras.** Puede ser cualquier `clip-path`
de CSS (`inset(0 round 999px)`, `ellipse(…)`, `polygon(…)`) o `{ "capsule": [ax, ay,
bx, by, r] }`, que es el recorte natural de un brazo o una pierna: sigue al miembro y
deja afuera lo que el vecino haya metido dentro de la caja —una pollera acampanada,
por ejemplo.

Los `id` son los que conocen las animaciones (`cadera`, `torso`, `cabeza`, `pelo`,
`brazo_i/d`, `antebrazo_i/d`, `mano_i/d`, `muslo_i/d`, `pierna_i/d`, `pie_i/d`); un
rig al que le falte alguno igual anima, simplemente ese hueso no se mueve. `_i` es el
lado lejano y `_d` el cercano.

## Meterlo en el foro

Es HTML/CSS/JS suelto, no depende de Flarum. La forma más rápida es pegar el
contenido de `dist/maria-avatar.demo.html` en **Apariencia → Custom Header** del panel
de administración. Para hacerlo parte de esta extensión hace falta el toolchain de
JS de Flarum (`js/src/forum/index.js` + `Extend\Frontend->js()`), que hoy no está
armado en este repo.

## Estado

- El muñeco, el dedo, el globo, el achique al rincón y el riggeador funcionan.
- La MarIA que viene incluida es un dibujo de referencia: falta el gif real y los
  colores exactos de maria.ar.
- El globo es una cáscara: las respuestas de demo se reemplazan con `chat.onSend`.
