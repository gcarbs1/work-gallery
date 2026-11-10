/* Fundo animado do hero: um relevo de densidade desenhado só com curvas de nível.

   1. RELEVO   – soma de poucas "montanhas" gaussianas, amplas e suaves, que se
                 deslocam e respiram devagar.
   2. CURVAS   – marching squares transforma o relevo em curvas de nível a cada
                 quadro; cada curva fica na sua altura, então os picos têm volume.
   3. CÂMERA   – vista inclinada; o ponteiro gira a câmera de leve (paralaxe).
   4. LEITURA  – a curva de nível que está sob o ponteiro se acende inteira.
   5. NOME     – a área do nome e das áreas de atuação fica vazia, com borda suave.
   6. ENTRADA  – ao abrir, o relevo sobe do plano.

   Desenhado em <canvas data-terrain-field>; pausa fora da tela e respeita
   prefers-reduced-motion (sem movimento automático).                          */
(() => {
  'use strict';

  const canvas = document.querySelector('[data-terrain-field]');
  const hero = canvas?.closest('.hero');
  const context = canvas?.getContext('2d');
  if (!canvas || !hero || !context) return;

  // Ajustes
  const CONFIG = {
    cell: 10,            // célula da grade (px do plano); menor = curvas mais lisas
    cellCompact: 8,
    levels: 14,          // número de curvas de nível
    levelsCompact: 11,
    indexEvery: 5,       // a cada N curvas, uma mais grossa (como em mapas)
    relief: .4,          // altura do pico mais alto (fração da altura da tela)
    tilt: 56,            // inclinação da câmera (graus; 0 = vista de cima)
    perspective: 2400,   // distância da câmera (px); menor = perspectiva mais forte
    yawRange: 14,        // quanto o ponteiro gira a câmera para os lados (graus)
    tiltRange: 6,        // quanto o ponteiro inclina a câmera (graus)
    breathe: .08,        // velocidade com que as montanhas se movem
    intro: 2.2,          // duração da entrada: o relevo sobe do plano (s)
    clearPad: 34,        // folga em volta do texto que fica vazia (px)
    clearFeather: 46     // suavidade da borda da área vazia (px)
  };

  // Montanhas: posição (u, v em −1…1 do plano), tamanho, peso e giro da elipse
  const HILLS = [
    { u: .36, v: -.02, sx: .2, sy: .26, w: 1, a: .4 },
    { u: .66, v: .34, sx: .13, sy: .17, w: .72, a: -.3 },
    { u: .1, v: .52, sx: .18, sy: .14, w: .58, a: .9 },
    { u: -.48, v: .56, sx: .24, sy: .18, w: .5, a: .2 },
    { u: .82, v: -.38, sx: .17, sy: .2, w: .52, a: -.8 },
    { u: -.15, v: -.48, sx: .3, sy: .2, w: .42, a: .5 },
    { u: -.74, v: -.06, sx: .16, sy: .22, w: .38, a: 1.2 }
  ];

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rootStyle = getComputedStyle(document.documentElement);
  const cream = rootStyle.getPropertyValue('--cream').trim() || '#f0e6cc';
  const creamRGB = (cream.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i) || [0, 'f0', 'e6', 'cc'])
    .slice(1).map((c) => Number.parseInt(c, 16)).join(', ');
  const ink = (alpha) => `rgba(${creamRGB}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  // Tela e câmera
  let width = 1;
  let height = 1;
  let compact = false;
  let levels = CONFIG.levels;
  let relief = 100;
  const camera = { cosT: 1, sinT: 0, cosY: 1, sinY: 0, cx: 0, cy: 0, yaw: 0, tilt: 0 };
  const out = [0, 0];

  function setCamera(yawDeg, tiltDeg) {
    const yaw = yawDeg * Math.PI / 180;
    const tilt = (CONFIG.tilt + tiltDeg) * Math.PI / 180;
    camera.cosY = Math.cos(yaw);
    camera.sinY = Math.sin(yaw);
    camera.cosT = Math.cos(tilt);
    camera.sinT = Math.sin(tilt);
  }

  // Plano: x, y em px a partir do centro; z = altura (px)
  function project(x, y, z) {
    const xr = x * camera.cosY - y * camera.sinY;
    const yr = x * camera.sinY + y * camera.cosY;
    const depth = yr * camera.sinT + z * camera.cosT;
    const f = CONFIG.perspective / (CONFIG.perspective - depth);
    out[0] = camera.cx + xr * f;
    out[1] = camera.cy + (yr * camera.cosT - z * camera.sinT) * f;
    return out;
  }
  function unproject(px, py) {
    const u = py - camera.cy;
    const denominator = camera.cosT * CONFIG.perspective + u * camera.sinT;
    if (denominator < 1e-3) return null;
    const yr = u * CONFIG.perspective / denominator;
    const f = CONFIG.perspective / (CONFIG.perspective - yr * camera.sinT);
    const xr = (px - camera.cx) / f;
    return [xr * camera.cosY + yr * camera.sinY, -xr * camera.sinY + yr * camera.cosY];
  }

  // Grade do relevo e memória das curvas (reaproveitada a cada quadro)
  let nx = 2;
  let ny = 2;
  let cell = CONFIG.cell;
  let halfX = 1;
  let halfY = 1;
  let values = new Float32Array(4);
  let buffers = [];
  let counts = new Int32Array(1);

  function makeGrid() {
    cell = compact ? CONFIG.cellCompact : CONFIG.cell;
    halfX = width * .72;
    halfY = height * .62 / Math.cos(CONFIG.tilt * Math.PI / 180);
    nx = Math.ceil(2 * halfX / cell) + 1;
    ny = Math.ceil(2 * halfY / cell) + 1;
    values = new Float32Array(nx * ny);
    buffers = Array.from({ length: levels }, () => new Float32Array(4096));
    counts = new Int32Array(levels);
  }

  // Relevo: as montanhas se deslocam e respiram devagar
  const hillsNow = HILLS.map(() => ({}));
  function updateRelief(seconds) {
    const t = seconds * CONFIG.breathe;
    HILLS.forEach((h, k) => {
      const now = hillsNow[k];
      const turn = h.a + t * .3 * (k % 2 ? 1 : -1);
      now.x = (h.u + Math.sin(t * (1 + k * .23) + k * 1.9) * .08) * halfX;
      now.y = (h.v + Math.cos(t * (.8 + k * .17) + k * 2.7) * .09) * halfY;
      now.w = h.w * (.8 + .2 * Math.sin(t * (1.3 + k * .11) + k));
      now.ix = 1 / (h.sx * halfX * (1 + .08 * Math.sin(t + k)));
      now.iy = 1 / (h.sy * halfY);
      now.cosA = Math.cos(turn);
      now.sinA = Math.sin(turn);
    });
    for (let j = 0; j < ny; j += 1) {
      const y = -halfY + j * cell;
      const row = j * nx;
      for (let i = 0; i < nx; i += 1) {
        const x = -halfX + i * cell;
        let v = 0;
        for (let k = 0; k < hillsNow.length; k += 1) {
          const h = hillsNow[k];
          const dx = x - h.x;
          const dy = y - h.y;
          const a = (dx * h.cosA + dy * h.sinA) * h.ix;
          const b = (-dx * h.sinA + dy * h.cosA) * h.iy;
          const r2 = a * a + b * b;
          if (r2 < 40) v += h.w * Math.exp(-.5 * r2);
        }
        values[row + i] = 1 - Math.exp(-1.6 * v);
      }
    }
  }

  function sample(x, y) {
    const gx = clamp((x + halfX) / cell, 0, nx - 1.001);
    const gy = clamp((y + halfY) / cell, 0, ny - 1.001);
    const i = Math.floor(gx);
    const j = Math.floor(gy);
    const fx = gx - i;
    const fy = gy - j;
    const a = values[j * nx + i];
    const b = values[j * nx + i + 1];
    const c = values[(j + 1) * nx + i];
    const d = values[(j + 1) * nx + i + 1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }

  // Curvas de nível (marching squares). Cada célula só testa as curvas que passam por ela.
  // Arestas: 0 = topo (a–b), 1 = direita (b–c), 2 = base (d–c), 3 = esquerda (a–d)
  const CASES = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2],
    [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], []];

  function push(k, x, y) {
    let buffer = buffers[k];
    if (counts[k] + 2 > buffer.length) {
      const bigger = new Float32Array(buffer.length * 2);
      bigger.set(buffer);
      buffers[k] = buffer = bigger;
    }
    buffer[counts[k]] = x;
    buffer[counts[k] + 1] = y;
    counts[k] += 2;
  }

  function edge(k, e, i, j, t, a, b, c, d) {
    let gx = i;
    let gy = j;
    if (e === 0) gx = i + (t - a) / (b - a);
    else if (e === 1) { gx = i + 1; gy = j + (t - b) / (c - b); }
    else if (e === 2) { gx = i + (t - d) / (c - d); gy = j + 1; }
    else gy = j + (t - a) / (d - a);
    push(k, -halfX + gx * cell, -halfY + gy * cell);
  }

  function traceContours() {
    counts.fill(0);
    const steps = levels + 1;
    for (let j = 0; j < ny - 1; j += 1) {
      for (let i = 0; i < nx - 1; i += 1) {
        const a = values[j * nx + i];
        const b = values[j * nx + i + 1];
        const c = values[(j + 1) * nx + i + 1];
        const d = values[(j + 1) * nx + i];
        const low = Math.min(a, b, c, d);
        const high = Math.max(a, b, c, d);
        // curva k tem altura (k + 1) / steps; só as que ficam entre low e high cruzam a célula
        const kLow = Math.max(0, Math.ceil(low * steps) - 1);
        const kHigh = Math.min(levels - 1, Math.ceil(high * steps) - 2);
        for (let k = kLow; k <= kHigh; k += 1) {
          const t = (k + 1) / steps;
          const code = (a > t ? 1 : 0) | (b > t ? 2 : 0) | (c > t ? 4 : 0) | (d > t ? 8 : 0);
          if (code === 0 || code === 15) continue;
          const pairs = CASES[code];
          for (let p = 0; p < pairs.length; p += 2) {
            edge(k, pairs[p], i, j, t, a, b, c, d);
            edge(k, pairs[p + 1], i, j, t, a, b, c, d);
          }
        }
      }
    }
  }

  // Área vazia atrás do texto (máscara com borda suave)
  let clearMask = null;
  function measureClearArea() {
    const bounds = canvas.getBoundingClientRect();
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const element of [hero.querySelector('.hero__eyebrow'), ...hero.querySelectorAll('h1 span')]) {
      if (!element) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const r = range.getBoundingClientRect();
      box.left = Math.min(box.left, r.left - bounds.left);
      box.right = Math.max(box.right, r.right - bounds.left);
      box.top = Math.min(box.top, r.top - bounds.top);
      box.bottom = Math.max(box.bottom, r.bottom - bounds.top);
    }
    if (!Number.isFinite(box.left)) {
      clearMask = null;
      return;
    }
    const pad = CONFIG.clearPad;
    const ratio = canvas.width / width;
    clearMask = document.createElement('canvas');
    clearMask.width = canvas.width;
    clearMask.height = canvas.height;
    const m = clearMask.getContext('2d');
    m.setTransform(ratio, 0, 0, ratio, 0, 0);
    // o retângulo vira uma "sombra" desfocada desenhada fora da tela (funciona em todos os navegadores)
    const offset = width * 3;
    m.shadowColor = '#000';
    m.shadowBlur = CONFIG.clearFeather * ratio;
    m.shadowOffsetX = offset * ratio;
    m.fillStyle = '#000';
    for (let pass = 0; pass < 2; pass += 1) {
      m.fillRect(box.left - pad - offset, box.top - pad, box.right - box.left + 2 * pad, box.bottom - box.top + 2 * pad);
    }
  }

  // Ponteiro: gira a câmera e escolhe a curva que se acende
  const pointer = { sx: 0, sy: 0, inside: false, amount: 0, level: -1 };
  let glow = new Float32Array(CONFIG.levels);
  let intro = 1;

  // Desenho de um quadro
  function render() {
    context.clearRect(0, 0, width, height);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    const rise = easeOut(intro);

    for (let k = 0; k < levels; k += 1) {
      const count = counts[k];
      if (!count) continue;
      const list = buffers[k];
      const share = (k + 1) / (levels + 1);
      const index = k % CONFIG.indexEvery === CONFIG.indexEvery - 1;
      const base = (.14 + .55 * share + (index ? .12 : 0)) * (.35 + .65 * rise);
      const z = share * relief * rise;

      context.beginPath();
      for (let n = 0; n < count; n += 4) {
        project(list[n], list[n + 1], z);
        context.moveTo(out[0], out[1]);
        project(list[n + 2], list[n + 3], z);
        context.lineTo(out[0], out[1]);
      }
      // linhas ao fundo (topo da tela) mais apagadas: dá profundidade
      const depth = context.createLinearGradient(0, 0, 0, height);
      depth.addColorStop(0, ink(base * .5));
      depth.addColorStop(.45, ink(base * .9));
      depth.addColorStop(1, ink(base));
      context.strokeStyle = depth;
      context.lineWidth = index ? (compact ? 1.6 : 2) : (compact ? .85 : 1.1);
      context.stroke();

      // a curva sob o ponteiro se acende, com um halo suave
      if (glow[k] > .01) {
        context.strokeStyle = ink(.16 * glow[k]);
        context.lineWidth = compact ? 6 : 9;
        context.stroke();
        context.strokeStyle = ink(glow[k]);
        context.lineWidth = compact ? 1.8 : 2.4;
        context.stroke();
      }
    }

    // esvazia a área do texto
    if (clearMask) {
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'destination-out';
      context.drawImage(clearMask, 0, 0);
      context.restore();
    }
  }

  // Loop e eventos
  let visible = true;
  let running = false;
  let last = 0;
  let clock = 0;

  function updatePointer(dt) {
    pointer.amount += ((pointer.inside ? 1 : 0) - pointer.amount) * (1 - Math.exp(-dt / .5));
    const idleYaw = Math.sin(clock * .05) * 3;
    const targetYaw = pointer.inside ? (pointer.sx / width - .5) * 2 * CONFIG.yawRange : idleYaw;
    const targetTilt = pointer.inside ? (pointer.sy / height - .5) * -2 * CONFIG.tiltRange : 0;
    const follow = 1 - Math.exp(-dt / .7);
    camera.yaw += (targetYaw - camera.yaw) * follow;
    camera.tilt += (targetTilt - camera.tilt) * follow;
    setCamera(camera.yaw, camera.tilt);

    // qual curva está sob o ponteiro
    pointer.level = -1;
    if (pointer.inside) {
      const ground = unproject(pointer.sx, pointer.sy);
      if (ground && Math.abs(ground[0]) < halfX && Math.abs(ground[1]) < halfY) {
        const k = Math.round(sample(ground[0], ground[1]) * (levels + 1)) - 1;
        if (k >= 0 && k < levels) pointer.level = k;
      }
    }
    const fadeRate = 1 - Math.exp(-dt / .25);
    for (let k = 0; k < levels; k += 1) {
      const target = k === pointer.level ? pointer.amount : 0;
      glow[k] += (target - glow[k]) * fadeRate;
    }
  }

  function frame(now) {
    // passo de tempo real (limitado), para o movimento não "pular" se um quadro atrasar
    const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
    last = now;
    clock += dt;
    intro = Math.min(1, intro + dt / CONFIG.intro);
    // o relevo é recalculado a cada quadro: as formas mudam de forma contínua
    updateRelief(clock);
    traceContours();
    updatePointer(dt);
    render();
    if (visible && !reducedMotion.matches) {
      requestAnimationFrame(frame);
    } else {
      running = false;
    }
  }

  function drawStill() {
    setCamera(camera.yaw, camera.tilt);
    updateRelief(clock);
    traceContours();
    render();
  }

  function start() {
    if (reducedMotion.matches) {
      intro = 1;
      drawStill();
      return;
    }
    if (running || !visible) return;
    running = true;
    last = 0;
    requestAnimationFrame(frame);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    compact = width < 620;
    levels = compact ? CONFIG.levelsCompact : CONFIG.levels;
    glow = new Float32Array(levels);
    relief = height * CONFIG.relief;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    camera.cx = width / 2;
    camera.cy = height * .56;
    makeGrid();
    measureClearArea();
    drawStill();
  }

  hero.addEventListener('pointermove', (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.sx = event.clientX - bounds.left;
    pointer.sy = event.clientY - bounds.top;
    pointer.inside = event.pointerType === 'mouse' && pointer.sy > 0;
    if (reducedMotion.matches) {
      updatePointer(1);
      render();
    }
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    pointer.inside = false;
    if (reducedMotion.matches) {
      updatePointer(1);
      render();
    }
  });

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  }).observe(canvas);
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible) start();
  }, { rootMargin: '120px 0px', threshold: .01 }).observe(canvas);
  reducedMotion.addEventListener('change', () => {
    running = false;
    start();
  });
  // a fonte do nome muda a largura do texto: mede a área vazia de novo quando ela carregar
  document.fonts?.ready.then(() => {
    measureClearArea();
    if (reducedMotion.matches) drawStill();
  });

  if (!reducedMotion.matches) intro = 0;
  resize();
  start();
})();
