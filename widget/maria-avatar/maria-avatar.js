/* =========================================================================
   MarIA Avatar — runtime del muñeco articulado
   ------------------------------------------------------------------------
   Idea: se toma UN frame del gif de MarIA, se lo corta en cajas (cabeza,
   torso, brazos, antebrazos, manos, piernas...) y cada caja se dibuja como
   una "ventana" al mismo frame (background-position negativo). Las cajas se
   anidan en el DOM siguiendo el esqueleto, así cada hueso hereda la rotación
   del padre y el conjunto se mueve como un muñeco de papel articulado.

   Con todos los ángulos en 0 el muñeco reconstruye el frame original pixel a
   pixel: por eso las piezas siempre calzan.

   API:
     const maria = MariaAvatar.mount({ rig, sheet, chat: {...} });
     maria.open(); maria.close(); maria.play('saludo'); maria.say('hola');
   ========================================================================= */

(function (global) {
  'use strict';

  var RAD = Math.PI / 180;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function reducedMotion() {
    return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Un recorte puede venir como string CSS (`inset`, `ellipse`, `polygon`,
     `path`) o como cápsula: { capsule: [ax, ay, bx, by, r] } en coordenadas
     del dibujo original. La cápsula es el recorte natural de un brazo o una
     pierna: sigue el miembro y deja afuera lo que el vecino haya metido
     dentro de la caja (una pollera acampanada, por ejemplo). */
  function capsulePath(ax, ay, bx, by, r) {
    var dx = bx - ax, dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var px = -dy / len * r, py = dx / len * r;
    var n = function (v) { return Math.round(v * 100) / 100; };
    return 'path("M' + n(ax + px) + ' ' + n(ay + py) +
           ' L' + n(bx + px) + ' ' + n(by + py) +
           ' A' + n(r) + ' ' + n(r) + ' 0 0 0 ' + n(bx - px) + ' ' + n(by - py) +
           ' L' + n(ax - px) + ' ' + n(ay - py) +
           ' A' + n(r) + ' ' + n(r) + ' 0 0 0 ' + n(ax + px) + ' ' + n(ay + py) + ' Z")';
  }

  function resolveClip(clip, box) {
    if (typeof clip === 'string') return clip;
    if (clip && clip.capsule) {
      var c = clip.capsule;
      return capsulePath(c[0] - box[0], c[1] - box[1], c[2] - box[0], c[3] - box[1], c[4]);
    }
    return '';
  }

  /* ======================================================================
     1. RIG — arma el muñeco en el DOM y le aplica poses
     ====================================================================== */

  function Rig(def, sheetUrl) {
    this.def = def;
    this.sheet = sheetUrl || def.sheet;
    this.bones = {};          // id -> { def, el, parent, children[] }
    this.order = [];          // ids en orden padre -> hijo
    this.overlays = [];
    this.pose = {};           // id -> { r, x, y, sx, sy }
    this.el = el('div', 'ma-stage');
    this._build();
  }

  Rig.prototype._build = function () {
    var def = this.def, self = this;
    this.el.style.width = def.stage.w + 'px';
    this.el.style.height = def.stage.h + 'px';

    var byId = {};
    def.bones.forEach(function (b) { byId[b.id] = b; });

    // orden topológico: un hueso no se crea antes que su padre
    var pending = def.bones.slice(), guard = 0;
    while (pending.length && guard++ < 500) {
      var next = [];
      pending.forEach(function (b) {
        if (b.parent && !self.bones[b.parent]) { next.push(b); return; }
        self._makeBone(b, byId);
      });
      if (next.length === pending.length) break;   // ciclo o padre inexistente
      pending = next;
    }

    (def.overlays || []).forEach(function (o) { self._makeOverlay(o); });

    if (def.shadow) {
      var sh = el('div', 'ma-shadow', this.el);
      sh.style.width = def.shadow.w + 'px';
      sh.style.height = def.shadow.h + 'px';
      sh.style.top = def.shadow.y + 'px';
      sh.style.left = (def.shadow.x != null ? def.shadow.x + 'px' : '50%');
      this.shadowEl = sh;
    }
  };

  Rig.prototype._makeBone = function (b, byId) {
    var parent = b.parent ? this.bones[b.parent] : null;
    var box = b.box;                                  // [x, y, w, h] en el sheet
    var pivot = b.pivot || [box[0] + box[2] / 2, box[1] + box[3] / 2];  // punto absoluto de la articulación
    var node = el('div', 'ma-bone');
    node.dataset.bone = b.id;
    node.style.width = box[2] + 'px';
    node.style.height = box[3] + 'px';
    // el pivote es un punto del dibujo original: local = absoluto - origen de la caja
    node.style.transformOrigin = (pivot[0] - box[0]) + 'px ' + (pivot[1] - box[1]) + 'px';
    // posición relativa al padre: la diferencia entre los orígenes de las cajas
    var px = parent ? box[0] - parent.def.box[0] : box[0];
    var py = parent ? box[1] - parent.def.box[1] : box[1];
    node.style.left = px + 'px';
    node.style.top = py + 'px';
    if (b.z != null) node.style.zIndex = b.z;

    // Un hueso puede no tener dibujo (hueso "vacío" que solo sirve de pivote,
    // como la cadera) o llevar un recorte para que no arrastre pixeles del
    // vecino: `clip` (clip-path) o `radius` (border-radius).
    var art = null;
    if (b.art !== false) {
      art = el('div', 'ma-art', node);
      art.style.backgroundImage = 'url("' + this.sheet + '")';
      art.style.backgroundPosition = (-box[0]) + 'px ' + (-box[1]) + 'px';
      art.style.backgroundSize = this.def.stage.w + 'px ' + this.def.stage.h + 'px';
      if (b.clip) art.style.clipPath = resolveClip(b.clip, box);
      if (b.radius) art.style.borderRadius = b.radius;
      if (this.def.pixelated) art.style.imageRendering = 'pixelated';
    }

    (parent ? parent.el : this.el).appendChild(node);

    var rec = { def: b, el: node, art: art, parent: parent, children: [], rest: b.rest || 0, follow: b.follow || 0, vel: 0, prev: 0 };
    if (parent) parent.children.push(rec);
    this.bones[b.id] = rec;
    this.order.push(b.id);
    this.pose[b.id] = { r: 0, x: 0, y: 0, sx: 1, sy: 1 };
  };

  Rig.prototype._makeOverlay = function (o) {
    var host = this.bones[o.bone];
    if (!host) return;
    var node = el('div', 'ma-overlay', host.el);
    node.dataset.role = o.role || 'deco';
    node.style.left = (o.x - host.def.box[0]) + 'px';
    node.style.top = (o.y - host.def.box[1]) + 'px';
    node.style.width = o.w + 'px';
    node.style.height = o.h + 'px';
    node.style.background = o.color || 'currentColor';
    node.style.borderRadius = o.shape === 'rect' ? (o.radius || 2) + 'px' : '50%';
    if (o.rotate) node.style.rotate = o.rotate + 'deg';
    node.style.transformOrigin = o.role === 'lid' ? '50% 0%' : '50% 50%';
    node.style.transform = 'scaleY(' + (o.role === 'lid' ? 0 : (o.role === 'mouth' ? 0.18 : 1)) + ')';
    this.overlays.push({ def: o, el: node });
  };

  Rig.prototype.get = function (id) { return this.bones[id]; };

  Rig.prototype.apply = function (pose) {
    for (var id in this.bones) {
      if (!Object.prototype.hasOwnProperty.call(this.bones, id)) continue;
      var b = this.bones[id];
      var p = pose[id];
      if (!p) { b.el.style.transform = ''; continue; }
      var t = '';
      if (p.x || p.y) t += 'translate(' + (p.x || 0).toFixed(2) + 'px,' + (p.y || 0).toFixed(2) + 'px)';
      if (p.r) t += ' rotate(' + p.r.toFixed(2) + 'deg)';
      if ((p.sx != null && p.sx !== 1) || (p.sy != null && p.sy !== 1)) {
        t += ' scale(' + (p.sx == null ? 1 : p.sx).toFixed(3) + ',' + (p.sy == null ? 1 : p.sy).toFixed(3) + ')';
      }
      b.el.style.transform = t;
    }
  };

  Rig.prototype.setOverlay = function (role, value) {
    this.overlays.forEach(function (o) {
      if (o.def.role !== role) return;
      o.el.style.transform = 'scaleY(' + value.toFixed(3) + ')';
    });
  };

  /* ======================================================================
     2. CLIPS — poses clave por hueso, en grados
     Los ids son los estándar del template del riggeador; los huesos que
     falten se ignoran, así un rig incompleto igual anima.
     ====================================================================== */

  var CLIPS = {
    idle: { dur: 4200, loop: true, tracks: {} },

    saludo: {
      dur: 2600, loop: false, next: 'idle',
      tracks: {
        brazo_d:     [[0, 0], [.22, -108], [.85, -112], [1, 0]],
        antebrazo_d: [[0, 0], [.22, -34], [.38, -6], [.52, -40], [.66, -6], [.8, -38], [.9, -20], [1, 0]],
        mano_d:      [[0, 0], [.25, 14], [.4, -12], [.55, 14], [.7, -12], [.85, 8], [1, 0]],
        cabeza:      [[0, 0], [.3, -5], [.8, -4], [1, 0]],
        torso:       [[0, 0], [.3, -2.5], [.85, -2], [1, 0]],
        brazo_i:     [[0, 0], [.3, 8], [.85, 7], [1, 0]]
      }
    },

    hablar: {
      dur: 2000, loop: true,
      tracks: {
        cabeza:      [[0, 0], [.25, -3.5], [.5, 1], [.75, -2.5], [1, 0]],
        torso:       [[0, 0], [.5, 1.4], [1, 0]],
        brazo_d:     [[0, -16], [.3, -34], [.55, -22], [.8, -38], [1, -16]],
        antebrazo_d: [[0, -46], [.3, -62], [.55, -40], [.8, -58], [1, -46]],
        mano_d:      [[0, 10], [.35, -14], [.7, 12], [1, 10]],
        brazo_i:     [[0, 6], [.5, 12], [1, 6]],
        antebrazo_i: [[0, -8], [.5, -18], [1, -8]]
      }
    },

    atencion: {   // se da vuelta y mira/señala al dedo que cruza la pantalla
      dur: 1400, loop: false, next: 'idle',
      tracks: {
        cabeza:      [[0, 0], [.3, -8], [.85, -7], [1, 0]],
        torso:       [[0, 0], [.35, -4], [.85, -3], [1, 0]],
        brazo_d:     [[0, 0], [.35, -68], [.85, -64], [1, 0]],
        antebrazo_d: [[0, 0], [.35, -26], [.85, -22], [1, 0]],
        mano_d:      [[0, 0], [.4, 16], [.85, 14], [1, 0]],
        cadera:      [[0, 0], [.4, 2], [1, 0]]
      }
    },

    dock: {       // se acomoda cuando se achica y se va abajo a la izquierda
      dur: 900, loop: false, next: 'idle',
      tracks: {
        cadera:      [[0, 0], [.4, 3], [1, 0]],
        torso:       [[0, 0], [.4, -3], [1, 0]],
        cabeza:      [[0, 0], [.35, 6], [.7, -3], [1, 0]],
        brazo_d:     [[0, 0], [.5, -18], [1, 0]],
        brazo_i:     [[0, 0], [.5, 14], [1, 0]]
      }
    }
  };

  function sampleTrack(keys, t) {
    if (!keys.length) return 0;
    if (t <= keys[0][0]) return keys[0][1];
    for (var i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        var a = keys[i - 1], b = keys[i];
        var span = b[0] - a[0] || 1;
        return lerp(a[1], b[1], easeInOut((t - a[0]) / span));
      }
    }
    return keys[keys.length - 1][1];
  }

  /* ======================================================================
     3. ANIMATOR — mezcla clip + capa procedural (respiración, balanceo,
     mirada, parpadeo, boca) y la inercia del pelo/manos
     ====================================================================== */

  function Animator(rig, opts) {
    this.rig = rig;
    this.opts = opts || {};
    this.t0 = performance.now();
    this.current = null;
    this.previous = null;
    this.blendUntil = 0;
    this.blendDur = 260;
    this.look = { x: 0, y: 0, tx: 0, ty: 0 };
    this.talk = 0;
    this.blink = { next: this.t0 + 1600, closed: 0, phase: 0 };
    this.energy = 1;
    this.running = false;
    this._frame = this._frame.bind(this);
    this.play('idle');
  }

  Animator.prototype.play = function (name, opts) {
    var clip = CLIPS[name];
    if (!clip) return;
    opts = opts || {};
    if (this.current && this.current.name === name && clip.loop) return;
    this.previous = this.current;
    this.blendUntil = performance.now() + (opts.blend == null ? this.blendDur : opts.blend);
    this.current = { name: name, clip: clip, start: performance.now(), speed: opts.speed || 1 };
  };

  Animator.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this.t0 = performance.now();
    requestAnimationFrame(this._frame);
  };
  Animator.prototype.stop = function () { this.running = false; };

  Animator.prototype.lookAt = function (clientX, clientY, figureRect) {
    if (!figureRect) return;
    var cx = figureRect.left + figureRect.width * 0.5;
    var cy = figureRect.top + figureRect.height * 0.28;   // altura de la cabeza
    this.look.tx = clamp((clientX - cx) / Math.max(240, figureRect.width * 1.6), -1, 1);
    this.look.ty = clamp((clientY - cy) / Math.max(280, figureRect.height), -1, 1);
  };

  Animator.prototype._sampleClip = function (entry, now) {
    var pose = {};
    if (!entry) return pose;
    var clip = entry.clip;
    var elapsed = (now - entry.start) * entry.speed;
    var t = clip.loop ? (elapsed % clip.dur) / clip.dur : clamp(elapsed / clip.dur, 0, 1);
    if (!clip.loop && elapsed >= clip.dur && clip.next && entry === this.current) {
      this.play(clip.next, { blend: 320 });
    }
    for (var id in clip.tracks) {
      if (Object.prototype.hasOwnProperty.call(clip.tracks, id)) {
        pose[id] = sampleTrack(clip.tracks[id], t);
      }
    }
    return pose;
  };

  Animator.prototype._frame = function (now) {
    if (!this.running) return;
    this.update(now);
    requestAnimationFrame(this._frame);
  };

  Animator.prototype.update = function (now) {
    var rig = this.rig, T = (now - this.t0) / 1000;
    var base = this._sampleClip(this.current, now);

    // crossfade con el clip anterior para que no salte
    if (this.previous && now < this.blendUntil) {
      var k = 1 - (this.blendUntil - now) / this.blendDur;
      var prev = this._sampleClip(this.previous, now);
      for (var id in prev) {
        if (Object.prototype.hasOwnProperty.call(prev, id)) {
          base[id] = lerp(prev[id], base[id] || 0, easeInOut(clamp(k, 0, 1)));
        }
      }
    } else if (now >= this.blendUntil) {
      this.previous = null;
    }

    // ---- capa procedural: lo que hace que "respire" aunque no pase nada ----
    var e = this.energy;
    var breath = Math.sin(T * 1.25) * e;
    var sway = Math.sin(T * 0.55) * e;
    var sway2 = Math.sin(T * 0.55 + 1.1) * e;
    var micro = Math.sin(T * 2.7) * Math.sin(T * 0.9) * e;

    this.look.x = lerp(this.look.x, this.look.tx, 0.06);
    this.look.y = lerp(this.look.y, this.look.ty, 0.06);

    var add = {
      cadera:      { r: sway * 1.5, y: Math.abs(breath) * 0.7 },
      torso:       { r: sway * -1.1 + micro * 0.5, sy: 1 + breath * 0.014, sx: 1 - breath * 0.008 },
      cabeza:      { r: sway2 * -1.8 + this.look.x * 7 + micro * 0.6, x: this.look.x * 3, y: -breath * 0.9 + this.look.y * 2 },
      pelo:        { r: sway2 * -2.6 },
      brazo_i:     { r: sway * 3.2 },
      antebrazo_i: { r: sway * 2.4 },
      brazo_d:     { r: sway * -3.2 },
      antebrazo_d: { r: sway * -2.4 },
      muslo_i:     { r: sway * -0.7 },
      muslo_d:     { r: sway * 0.7 }
    };

    // ---- boca y parpadeo ----
    if (this.talk > 0) {
      var m = 0.2 + Math.abs(Math.sin(T * 9.3) * 0.5 + Math.sin(T * 14.7) * 0.3) * 0.8;
      rig.setOverlay('mouth', clamp(m, 0.15, 1));
      add.cabeza.r += Math.sin(T * 6.1) * 0.7;
    } else {
      rig.setOverlay('mouth', 0.18);
    }

    if (now > this.blink.next) {
      this.blink.phase = 1;
      this.blink.next = now + 2200 + Math.random() * 3800;
    }
    if (this.blink.phase > 0) {
      this.blink.phase -= 0.11;
      var k2 = this.blink.phase;
      rig.setOverlay('lid', clamp(Math.sin(clamp(k2, 0, 1) * Math.PI) * 1.35, 0, 1));
      if (this.blink.phase <= 0) rig.setOverlay('lid', 0);
    }

    // ---- composición final + inercia (el pelo y las manos llegan tarde) ----
    var pose = rig.pose;
    for (var bid in rig.bones) {
      if (!Object.prototype.hasOwnProperty.call(rig.bones, bid)) continue;
      var bone = rig.bones[bid];
      var a = add[bid] || {};
      var target = (base[bid] || 0) + (a.r || 0) + bone.rest;
      var p = pose[bid];

      if (bone.follow) {
        // segunda acción: se persigue al objetivo con retardo
        bone.vel = bone.vel * 0.82 + (target - p.r) * (0.34 - bone.follow * 0.22);
        p.r += bone.vel;
      } else {
        p.r = target;
      }
      p.x = a.x || 0;
      p.y = a.y || 0;
      p.sx = a.sx == null ? 1 : a.sx;
      p.sy = a.sy == null ? 1 : a.sy;
    }
    rig.apply(pose);
  };

  /* ======================================================================
     4. EL DEDO que cruza la pantalla
     ====================================================================== */

  var FINGER_SVG =
    '<svg viewBox="0 0 74 96" aria-hidden="true">' +
    '<circle class="ma-tap-ring" cx="26" cy="14" r="12" fill="none" stroke="var(--ma-accent)" stroke-width="2.5"/>' +
    '<g filter="url(#ma-fsh)">' +
    '<path d="M26 8c-4.4 0-8 3.6-8 8v29l-5.6-5.2c-2.6-2.4-6.6-2.3-9 .3-2.2 2.4-2.3 6-.3 8.6l14 18.4c3.5 4.6 9 7.3 14.8 7.3h9.4c9.4 0 17-7.6 17-17V37c0-3.6-2.9-6.5-6.5-6.5-1.3 0-2.5.4-3.5 1a6.5 6.5 0 0 0-9.9-4 6.5 6.5 0 0 0-9.9-3.6V16c0-4.4-3.6-8-8-8Z" fill="#f7cfae" stroke="#2b2233" stroke-width="2.6" stroke-linejoin="round"/>' +
    '<path d="M34 74v-9M44 74v-9M54 74v-9" stroke="#2b2233" stroke-width="2.2" stroke-linecap="round" opacity=".45"/>' +
    '</g>' +
    '<defs><filter id="ma-fsh" x="-40%" y="-30%" width="200%" height="180%">' +
    '<feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#17122a" flood-opacity=".26"/>' +
    '</filter></defs></svg>';

  function Finger(host, opts) {
    this.opts = opts;
    this.btn = el('button', 'ma-finger', host);
    this.btn.type = 'button';
    this.btn.setAttribute('aria-label', opts.label || 'Tocá para hablar con MarIA');
    this.btn.innerHTML = FINGER_SVG;
    this.trail = [];
    for (var i = 0; i < 5; i++) {
      var d = el('div', 'ma-finger-trail', host);
      d.style.opacity = '0';
      this.trail.push({ el: d, x: 0, y: 0 });
    }
    this.state = 'wait';
    this.until = performance.now() + (opts.firstDelay || 2600);
    this.pos = { x: -200, y: -200 };
    this.visible = false;
  }

  Finger.prototype.setVisible = function (v) {
    if (this.visible === v) return;
    this.visible = v;
    this.btn.dataset.visible = v ? '1' : '0';
    if (!v) this.trail.forEach(function (t) { t.el.style.opacity = '0'; });
  };

  Finger.prototype.hide = function () { this.setVisible(false); this.state = 'off'; };
  Finger.prototype.resume = function (delay) {
    this.state = 'wait';
    this.until = performance.now() + (delay || 9000);
  };

  // recorrido: entra por la izquierda, cruza en arco y va a "tocar" a MarIA
  Finger.prototype.update = function (now, targetPt) {
    if (this.state === 'off') return;
    var vw = global.innerWidth, vh = global.innerHeight;

    if (this.state === 'wait') {
      if (now < this.until) return;
      this.state = 'travel';
      this.start = now;
      this.dur = this.opts.travelMs || 5200;
      this.from = { x: -80, y: vh * (0.42 + Math.random() * 0.22) };
      this.to = targetPt;
      this.ctrl = { x: vw * 0.42, y: Math.min(this.from.y, this.to.y) - vh * 0.16 };
      this.setVisible(true);
      return;
    }

    if (this.state === 'travel') {
      var p = clamp((now - this.start) / this.dur, 0, 1);
      var e = easeInOut(p);
      var q = 1 - e;
      // bezier cuadrática: entrada, arco, llegada
      var x = q * q * this.from.x + 2 * q * e * this.ctrl.x + e * e * this.to.x;
      var y = q * q * this.from.y + 2 * q * e * this.ctrl.y + e * e * this.to.y;
      y += Math.sin(now / 420) * 6 * (1 - e);            // flota
      var tilt = -14 + Math.sin(now / 520) * 5 + e * 12;
      var scale = 0.86 + e * 0.18;
      this.pos.x = x; this.pos.y = y;
      this.btn.style.transform = 'translate(' + (x - 18) + 'px,' + (y - 12) + 'px) rotate(' + tilt + 'deg) scale(' + scale + ')';
      this._trail(x, y, e);
      if (p >= 1) { this.state = 'tap'; this.start = now; this.taps = 0; }
      return;
    }

    if (this.state === 'tap') {
      var k = (now - this.start) / 760;
      var i = Math.floor(k);
      if (i > this.taps && i < 3) {
        this.taps = i;
        this.btn.dataset.tapping = '1';
        var self = this;
        setTimeout(function () { self.btn.dataset.tapping = '0'; }, 620);
        if (this.opts.onTap) this.opts.onTap();
      }
      var bob = Math.sin(k * Math.PI * 2) * 7;
      this.pos.y = this.to.y + bob;
      this.btn.style.transform = 'translate(' + (this.to.x - 18) + 'px,' + (this.to.y - 12 + bob) + 'px) rotate(-2deg) scale(1.04)';
      if (k > 3) { this.state = 'leave'; this.start = now; }
      return;
    }

    if (this.state === 'leave') {
      var p2 = clamp((now - this.start) / 900, 0, 1);
      this.btn.style.transform = 'translate(' + (this.to.x - 18) + 'px,' + (this.to.y - 12 + p2 * 40) + 'px) rotate(6deg) scale(' + (1 - p2 * 0.25) + ')';
      this.btn.style.opacity = String(1 - p2);
      if (p2 >= 1) {
        this.btn.style.opacity = '';
        this.setVisible(false);
        this.resume(this.opts.interval || 12000);
      }
    }
  };

  Finger.prototype._trail = function (x, y, e) {
    for (var i = this.trail.length - 1; i > 0; i--) {
      this.trail[i].x = this.trail[i - 1].x;
      this.trail[i].y = this.trail[i - 1].y;
    }
    this.trail[0].x = x; this.trail[0].y = y;
    for (var j = 0; j < this.trail.length; j++) {
      var t = this.trail[j];
      var s = (1 - j / this.trail.length);
      t.el.style.transform = 'translate(' + (t.x - 5) + 'px,' + (t.y - 5) + 'px) scale(' + s + ')';
      t.el.style.opacity = String(0.14 * s * (1 - e * 0.4));
    }
  };

  Finger.prototype.near = function (x, y, r) {
    if (!this.visible) return false;
    var dx = x - this.pos.x, dy = y - this.pos.y;
    return dx * dx + dy * dy < r * r;
  };

  /* ======================================================================
     5. CHAT — el globo estilo maria.ar
     ====================================================================== */

  var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12 4 4l6 8-6 8 16-8Z" fill="currentColor"/></svg>';

  function Chat(host, opts, ctrl) {
    this.opts = opts || {};
    this.ctrl = ctrl;
    var root = el('div', 'ma-chat', host);
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Chat con MarIA');
    root.setAttribute('aria-modal', 'false');
    this.el = root;

    var head = el('div', 'ma-chat-head', root);
    var av = el('div', 'ma-chat-avatar', head);
    if (this.opts.avatar) av.style.backgroundImage = 'url("' + this.opts.avatar + '")';
    var meta = el('div', '', head);
    el('div', 'ma-chat-title', meta).textContent = this.opts.name || 'MarIA';
    var st = el('div', 'ma-chat-status', meta);
    el('i', '', st);
    st.appendChild(document.createTextNode(this.opts.status || 'en línea'));
    var close = el('button', 'ma-chat-close', head);
    close.type = 'button';
    close.setAttribute('aria-label', 'Cerrar chat');
    close.innerHTML = '&times;';
    close.addEventListener('click', function () { ctrl.close(); });

    this.body = el('div', 'ma-chat-body', root);
    this.quick = el('div', 'ma-quick', root);

    var form = el('form', 'ma-chat-form', root);
    this.input = el('input', '', form);
    this.input.type = 'text';
    this.input.placeholder = this.opts.placeholder || 'Escribile a MarIA…';
    this.input.setAttribute('aria-label', 'Mensaje para MarIA');
    var send = el('button', '', form);
    send.type = 'submit';
    send.setAttribute('aria-label', 'Enviar');
    send.innerHTML = SEND_SVG;
    var self = this;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var v = self.input.value.trim();
      if (!v) return;
      self.input.value = '';
      self.send(v);
    });
    this.greeted = false;
  }

  Chat.prototype.push = function (from, text) {
    var m = el('div', 'ma-msg', this.body);
    m.dataset.from = from;
    m.textContent = text;
    this.body.scrollTop = this.body.scrollHeight;
    return m;
  };

  Chat.prototype.typing = function (on) {
    if (on) {
      if (this._typing) return;
      this._typing = el('div', 'ma-msg ma-typing', this.body);
      this._typing.dataset.from = 'maria';
      this._typing.innerHTML = '<span></span><span></span><span></span>';
      this.body.scrollTop = this.body.scrollHeight;
    } else if (this._typing) {
      this._typing.remove();
      this._typing = null;
    }
  };

  Chat.prototype.setQuick = function (list) {
    var self = this;
    this.quick.innerHTML = '';
    (list || []).forEach(function (q) {
      var b = el('button', '', self.quick);
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', function () { self.send(q); });
    });
  };

  Chat.prototype.reply = function (text, opts) {
    this.typing(false);
    this.push('maria', text);
    this.ctrl.talkFor(Math.min(6000, 900 + text.length * 42));
    if (opts && opts.quick) this.setQuick(opts.quick);
  };

  Chat.prototype.send = function (text) {
    this.push('user', text);
    this.setQuick([]);
    var api = {
      typing: this.typing.bind(this),
      reply: this.reply.bind(this),
      quick: this.setQuick.bind(this)
    };
    this.el.dispatchEvent(new CustomEvent('maria:send', { bubbles: true, detail: { text: text, api: api } }));
    if (this.opts.onSend) { this.opts.onSend(text, api); return; }
    this.demoAnswer(text, api);
  };

  // Respuestas de demo: se reemplazan pasando chat.onSend
  Chat.prototype.demoAnswer = function (text, api) {
    var t = text.toLowerCase();
    var a;
    if (/geo|generative|ia|chatgpt|gemini/.test(t)) {
      a = 'GEO es optimizar para que te citen los modelos, no solo para rankear. En el Campus tenemos un hilo con el checklist completo.';
    } else if (/seo|posicion|google|serp/.test(t)) {
      a = 'Contame qué sitio es y te digo por dónde empezaría: casi siempre es contenido + intención de búsqueda antes que tecnicismos.';
    } else if (/foro|campus|comunidad|sumar|entrar/.test(t)) {
      a = 'El Campus es gratis y abierto: entrás, te presentás en el hilo de bienvenida y ya podés preguntar.';
    } else if (/hola|buenas|hey|qué tal|que tal/.test(t)) {
      a = '¡Hola! Soy MarIA. Preguntame de SEO, GEO o de la comunidad.';
    } else {
      a = 'Buena pregunta. Esto es una demo del widget, así que engancho la respuesta real a tu backend con chat.onSend().';
    }
    api.typing(true);
    setTimeout(function () {
      api.reply(a, { quick: ['¿Qué es GEO?', 'Quiero entrar al Campus'] });
    }, 700 + Math.random() * 700);
  };

  Chat.prototype.greet = function () {
    if (this.greeted) return;
    this.greeted = true;
    var self = this;
    this.typing(true);
    setTimeout(function () {
      self.reply(self.opts.greeting || '¡Hola! Soy MarIA 👋 ¿En qué andás? Preguntame de SEO, GEO o del Campus.',
        { quick: self.opts.quickReplies || ['¿Qué es GEO?', '¿Cómo entro al Campus?', 'Ayuda con mi web'] });
    }, 620);
  };

  /* ======================================================================
     6. CONTROLLER
     ====================================================================== */

  function Avatar(opts) {
    this.opts = Object.assign({
      dockSize: 118,
      heroHeight: 0.46,      // fracción del alto de la ventana
      heroMax: 430,
      gap: 16,
      side: 'right',         // dónde vive en modo hero
      finger: true,
      brushRadius: 52,       // "roce": abre sin necesidad de click preciso
      theme: null,
      autoGreet: true
    }, opts || {});

    this.root = el('div', 'ma-root', document.body);
    this.root.dataset.state = 'hero';
    if (this.opts.theme) this.root.dataset.theme = this.opts.theme;
    this.root.style.setProperty('--ma-dock-size', this.opts.dockSize + 'px');
    this.root.style.setProperty('--ma-gap', this.opts.gap + 'px');
    if (this.opts.accent) this.root.style.setProperty('--ma-accent', this.opts.accent);
    if (this.opts.accent2) this.root.style.setProperty('--ma-accent-2', this.opts.accent2);

    this.figure = el('div', 'ma-figure', this.root);
    this.figure.tabIndex = 0;
    this.figure.setAttribute('role', 'button');
    this.figure.setAttribute('aria-label', 'Abrir el chat de MarIA');
    el('div', 'ma-halo', this.figure);

    this.rig = new Rig(this.opts.rig, this.opts.sheet);
    this.figure.appendChild(this.rig.el);

    this.anim = new Animator(this.rig, {});
    this.chat = new Chat(this.root, this.opts.chat, this);
    if (!(this.opts.chat && this.opts.chat.avatar)) this._avatarFromRig();
    this.callout = el('div', 'ma-callout', this.root);
    this.callout.addEventListener('click', this.open.bind(this));

    if (this.opts.finger) {
      var self = this;
      this.finger = new Finger(this.root, Object.assign({
        onTap: function () { self._nudge(); }
      }, this.opts.fingerOpts || {}));
      this.finger.btn.addEventListener('click', function () { self.open(); });
    }

    this.state = 'hero';
    this.home = this.opts.target || null;
    this.talkUntil = 0;
    this._bind();
    this.layout();
    this.anim.start();
    if (reducedMotion()) this.anim.energy = 0.25;
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }

  // El avatar del encabezado del chat es la cabeza del propio rig: no hace
  // falta subir otra imagen.
  Avatar.prototype._avatarFromRig = function () {
    var head = this.rig.bones[this.opts.headBone || 'cabeza'];
    if (!head) return;
    var box = head.def.box, stage = this.rig.def.stage;
    var size = 34, zoom = size / (box[2] * 0.94);
    var cx = box[0] + box[2] / 2, cy = box[1] + box[3] * 0.42;
    var av = this.chat.el.querySelector('.ma-chat-avatar');
    av.style.backgroundImage = 'url("' + this.rig.sheet + '")';
    av.style.backgroundSize = (stage.w * zoom) + 'px ' + (stage.h * zoom) + 'px';
    av.style.backgroundPosition = (-(cx * zoom - size / 2)) + 'px ' + (-(cy * zoom - size / 2)) + 'px';
  };

  Avatar.prototype._bind = function () {
    var self = this;
    this.figure.addEventListener('click', function () { self.toggle(); });
    this.figure.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self.toggle(); }
    });
    global.addEventListener('resize', function () { self.layout(); });
    // en captura: así también se entera de los scrolls de un contenedor
    // interno (por ejemplo si el avatar vive dentro de un panel con scroll)
    document.addEventListener('scroll', function () { if (self.home) self.layout(); },
      { passive: true, capture: true });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && self.state === 'chat') self.close();
    });
    document.addEventListener('pointermove', function (ev) {
      self.anim.lookAt(ev.clientX, ev.clientY, self.figure.getBoundingClientRect());
      // "roza el dedo": no hace falta acertarle, alcanza con pasarle cerca
      if (self.finger && self.state !== 'chat' && ev.pointerType === 'mouse' &&
          self.finger.near(ev.clientX, ev.clientY, self.opts.brushRadius)) {
        self.open();
      }
    }, { passive: true });
  };

  Avatar.prototype.layout = function () {
    var stage = this.rig.def.stage;
    var vw = global.innerWidth, vh = global.innerHeight;
    var gap = this.opts.gap, x, y, s;

    if (this.state === 'chat') {
      s = this.opts.dockSize / stage.h;
      x = gap;
      y = vh - gap - stage.h * s;
    } else if (this.home) {
      var r = this.home.getBoundingClientRect();
      s = Math.min(r.width / stage.w, r.height / stage.h);
      x = r.left + (r.width - stage.w * s) / 2;
      y = r.top + (r.height - stage.h * s) / 2;
    } else {
      // en un teléfono no puede taparle media pantalla al contenido
      var frac = vw < 520 ? Math.min(this.opts.heroHeight, 0.30) : this.opts.heroHeight;
      s = Math.min(vh * frac, vw < 520 ? Math.min(this.opts.heroMax, 300) : this.opts.heroMax) / stage.h;
      s = Math.min(s, (vw - gap * 2) / stage.w);
      x = this.opts.side === 'left' ? gap : vw - gap - stage.w * s;
      y = vh - gap - stage.h * s;
    }
    this.figure.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    this._rect = { x: x, y: y, s: s, w: stage.w * s, h: stage.h * s };
    this._placeCallout();
  };

  Avatar.prototype._placeCallout = function () {
    if (!this._rect) return;
    var r = this._rect;
    this.callout.style.left = clamp(r.x + r.w * 0.42, 10, global.innerWidth - 250) + 'px';
    this.callout.style.top = Math.max(10, r.y - 16) + 'px';
    this.callout.style.transform = this.callout.dataset.visible === '1' ? 'translateY(-100%)' : 'translateY(calc(-100% + 6px)) scale(.96)';
  };

  Avatar.prototype._tick = function (now) {
    if (this.finger && this.state !== 'chat') {
      var r = this._rect || { x: 0, y: 0, w: 0, h: 0 };
      // el dedo apunta a la mano/hombro de MarIA
      this.finger.update(now, { x: r.x + r.w * 0.34, y: r.y + r.h * 0.30 });
    }
    if (this.talkUntil && now > this.talkUntil) {
      this.talkUntil = 0;
      this.anim.talk = 0;
      if (this.state === 'chat') this.anim.play('idle', { blend: 400 });
    }
    requestAnimationFrame(this._tick);
  };

  Avatar.prototype._nudge = function () {
    // el dedo "toca" la pantalla: MarIA lo mira y lo señala
    if (this.state === 'chat') return;
    this.anim.play('atencion', { blend: 200 });
    if (!this._nudged && this.opts.calloutOnNudge !== false) {
      this._nudged = true;
      this.say(this.opts.nudgeText || '¿Charlamos? Tocá acá 👆', 4200);
    }
  };

  Avatar.prototype.say = function (text, ms) {
    this.callout.textContent = text;
    this.callout.dataset.visible = '1';
    this._placeCallout();
    this.talkFor(Math.min(5000, 800 + text.length * 40));
    var self = this;
    clearTimeout(this._sayTimer);
    this._sayTimer = setTimeout(function () {
      self.callout.dataset.visible = '0';
      self._placeCallout();
    }, ms || 4000);
    return this;
  };

  Avatar.prototype.talkFor = function (ms) {
    this.anim.talk = 1;
    this.talkUntil = performance.now() + ms;
    this.anim.play('hablar', { blend: 260 });
  };

  Avatar.prototype.play = function (name, opts) { this.anim.play(name, opts); return this; };

  Avatar.prototype.open = function () {
    if (this.state === 'chat') return this;
    this.state = 'chat';
    this.root.dataset.state = 'chat';
    this.callout.dataset.visible = '0';
    if (this.finger) this.finger.hide();
    this.anim.play('dock', { blend: 200 });
    this.layout();
    var self = this;
    setTimeout(function () {
      if (self.opts.autoGreet) self.chat.greet();
      if (!('ontouchstart' in global)) self.chat.input.focus();
    }, 460);
    this.root.dispatchEvent(new CustomEvent('maria:open', { bubbles: true }));
    return this;
  };

  Avatar.prototype.close = function () {
    if (this.state !== 'chat') return this;
    this.state = 'hero';
    this.root.dataset.state = 'hero';
    this.layout();
    this.anim.play('saludo', { blend: 200 });
    if (this.finger) this.finger.resume(this.opts.fingerReturnMs || 16000);
    this.root.dispatchEvent(new CustomEvent('maria:close', { bubbles: true }));
    return this;
  };

  Avatar.prototype.toggle = function () { return this.state === 'chat' ? this.close() : this.open(); };

  Avatar.prototype.setRig = function (def, sheet) {
    var wasOpen = this.state === 'chat';
    this.anim.stop();
    this.rig.el.remove();
    this.rig = new Rig(def, sheet);
    this.figure.appendChild(this.rig.el);
    this.anim = new Animator(this.rig, {});
    this.anim.start();
    this.layout();
    if (wasOpen) this.open();
    return this;
  };

  Avatar.prototype.destroy = function () {
    this.anim.stop();
    this.root.remove();
  };

  /* ====================================================================== */

  var MariaAvatar = {
    mount: function (opts) {
      if (!opts || !opts.rig) throw new Error('MariaAvatar.mount necesita un rig');
      return new Avatar(opts);
    },
    Rig: Rig,
    clips: CLIPS
  };

  if (typeof module === 'object' && module.exports) module.exports = MariaAvatar;
  global.MariaAvatar = MariaAvatar;

})(typeof window !== 'undefined' ? window : this);
