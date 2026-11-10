// Fundo animado do hero: um piso de tijolos que reage ao ponteiro.
// Atrás do nome e das áreas (Data analysis, Data science, Data visualization)
// os tijolos se quebram, abrindo um vão de bordas irregulares para o texto.
// Desenhado em <canvas data-terrain-field> e pausado fora da tela
// ou com prefers-reduced-motion.
(() => {
  const canvas = document.querySelector('[data-terrain-field]');
  const hero = canvas?.closest('.hero');
  if (!canvas || !hero) return;

  const context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rootStyle = getComputedStyle(document.documentElement);
  const beige = rootStyle.getPropertyValue('--beige').trim() || '#d9d1c4';
  const cream = rootStyle.getPropertyValue('--cream').trim() || '#f0e6cc'; // off-white das linhas
  const beigeMatch = beige.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
  const beigeChannels = beigeMatch
    ? beigeMatch.slice(1).map((channel) => Number.parseInt(channel, 16))
    : [217, 209, 196];
  let width = 0;
  let height = 0;
  let frame = 0;
  let visible = true;
  let last = 0;
  let lastInteraction = -Infinity;
  const pointer = {
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    previousX: 0,
    previousY: 0,
    velocityX: 0,
    velocityY: 0,
    engaged: false,
    pressed: false,
    pressure: 0
  };
  const impact = { x: 0, y: 0, at: -Infinity };
  const heights = new Map();
  const PHI = (1 + Math.sqrt(5)) / 2;
  const GOLDEN_ANGLE = Math.PI * 2 / (PHI * PHI);
  const GOLDEN_PITCH = 2 * Math.log(PHI) / Math.PI;
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const smooth = (edge0, edge1, value) => {
    const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  // Número pseudoaleatório fixo por tijolo (0–1): variação de tom e borda irregular da quebra
  const hash = (a, b) => {
    let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Área do texto (em px do canvas) onde os tijolos se quebram
  let breaks = [];
  const measureBreaks = () => {
    const bounds = canvas.getBoundingClientRect();
    const targets = [
      [hero.querySelector('.hero__eyebrow'), 30],
      ...[...hero.querySelectorAll('h1 span')].map((span) => [span, 30])
    ];
    // Uma única área cobrindo todo o bloco de texto: por dentro não sobra nenhum tijolo
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const [element, pad] of targets) {
      if (!element) continue;
      const range = document.createRange();
      range.selectNodeContents(element);
      const r = range.getBoundingClientRect();
      box.left = Math.min(box.left, r.left - bounds.left - pad);
      box.right = Math.max(box.right, r.right - bounds.left + pad);
      box.top = Math.min(box.top, r.top - bounds.top - pad);
      box.bottom = Math.max(box.bottom, r.bottom - bounds.top + pad);
    }
    breaks = Number.isFinite(box.left) ? [box] : [];
  };
  const breakDistance = (x, y) => {
    let nearest = Infinity;
    for (const box of breaks) {
      const dx = Math.max(box.left - x, 0, x - box.right);
      const dy = Math.max(box.top - y, 0, y - box.bottom);
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
    return nearest;
  };

  const tonePalette = Array.from({ length: 64 }, (_, index) => {
    const amount = index / 63 * .24;
    return `rgb(${beigeChannels.map((channel) => Math.round(channel * amount)).join(', ')})`;
  });
  const tone = (amount) => tonePalette[Math.max(0, Math.min(63, Math.round(amount / .24 * 63)))];

  const settleHeight = (state, target, dt, seconds, calm) => {
    if (calm) {
      state.x = target;
      state.v = 0;
      return;
    }
    const steps = 4;
    const step = dt / steps;
    const frequency = 1 / seconds;
    for (let index = 0; index < steps; index += 1) {
      // Slightly under-damped: a pressure change travels through the bed
      // instead of every column stopping at its target independently.
      state.v += (frequency * frequency * (target - state.x) - 1.16 * frequency * state.v) * step;
      state.x += state.v * step;
    }
  };

  const polygon = (points, fillTone, strokeAlpha, strokeColor = cream) => {
    context.beginPath();
    context.moveTo(points[0][0], points[0][1]);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index][0], points[index][1]);
    }
    context.closePath();
    context.globalAlpha = 1;
    context.fillStyle = fillTone;
    context.fill();
    context.globalAlpha = strokeAlpha;
    context.strokeStyle = strokeColor;
    context.stroke();
  };

  const draw = (time = 0) => {
    frame = 0;
    context.clearRect(0, 0, width, height);

    const dt = last ? Math.min((time - last) / 1000, 1 / 30) : 1 / 60;
    last = time;
    const compact = width < 620;
    // Tijolo visto de cima: face de cima ≈ 2:1, junta de argamassa entre eles
    const tileDepthY = compact ? 17 : 27;
    const tileWidth = tileDepthY * 2.1;
    const tileDepthX = compact ? 3 : 5;
    const joint = compact ? 4 : 6;
    const stepX = tileWidth + joint;
    const stepY = tileDepthY + joint;
    const rows = Math.ceil(height / stepY) + 5;
    const columns = Math.ceil(width / stepX) + 6;
    const seconds = time * .001;
    const touring = !pointer.engaged && time - lastInteraction > 3600;
    const targetX = touring ? width * (.5 + Math.sin(seconds * .19) * .31) : pointer.targetX;
    const targetY = touring ? height * (.48 + Math.sin(seconds * .19 / PHI + GOLDEN_ANGLE) * .23) : pointer.targetY;
    const follow = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / .14);
    pointer.x += (targetX - pointer.x) * follow;
    pointer.y += (targetY - pointer.y) * follow;
    const pressureFollow = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / .075);
    pointer.pressure += ((pointer.pressed ? 1 : 0) - pointer.pressure) * pressureFollow;
    const measuredVelocityX = (pointer.x - pointer.previousX) / Math.max(dt, 1 / 240);
    const measuredVelocityY = (pointer.y - pointer.previousY) / Math.max(dt, 1 / 240);
    const velocityFollow = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / .2);
    pointer.velocityX += (measuredVelocityX - pointer.velocityX) * velocityFollow;
    pointer.velocityY += (measuredVelocityY - pointer.velocityY) * velocityFollow;
    pointer.previousX = pointer.x;
    pointer.previousY = pointer.y;

    const velocityMagnitude = Math.hypot(pointer.velocityX, pointer.velocityY);
    const velocityScale = compact ? 430 : 720;
    const flowSpeed = clamp(velocityMagnitude / velocityScale, 0, 1);
    const flowDirectionX = velocityMagnitude > 1 ? pointer.velocityX / velocityMagnitude : 1;
    const flowDirectionY = velocityMagnitude > 1 ? pointer.velocityY / velocityMagnitude : 0;
    const reach = compact ? 170 : 285;

    // Two quiet wave sources sit on conjugate golden sections. Their
    // frequencies also differ by phi, producing a slowly changing field
    // instead of a single repeating pulse.
    const sourceOrbit = Math.min(width, height) * .035;
    const sourceA = [
      width / PHI + Math.cos(seconds * .11) * sourceOrbit,
      height / (PHI * PHI) + Math.sin(seconds * .11) * sourceOrbit
    ];
    const sourceB = [
      width / (PHI * PHI) + Math.cos(seconds * .11 + GOLDEN_ANGLE) * sourceOrbit,
      height / PHI + Math.sin(seconds * .11 + GOLDEN_ANGLE) * sourceOrbit
    ];

    context.lineJoin = 'round';
    context.lineWidth = compact ? .55 : .7;

    for (let row = -3; row < rows; row += 1) {
      // Fiadas alternadas deslocadas meio tijolo, como numa parede
      const rowOffset = (((row % 2) + 2) % 2) * stepX / 2;
      for (let column = -3; column < columns; column += 1) {
        const restingX = column * stepX + rowOffset - stepX * 1.5;
        const restingY = row * stepY;
        const centerX = restingX + (tileWidth + tileDepthX) * .5;
        const centerY = restingY + tileDepthY * .5;

        // Quebra em volta do texto: dentro do vão o tijolo some; na borda ele afunda e escurece
        const grain = hash(row, column);
        const ragged = hash(column + 7919, row - 104729) * stepY * 1.8;
        const gap = breakDistance(centerX, centerY) - ragged;
        if (gap <= 0) continue;
        const intact = smooth(0, stepY * 1.4, gap);
        const relativeX = centerX - pointer.x;
        const relativeY = centerY - pointer.y;
        const distance = Math.hypot(relativeX, relativeY);
        const distanceRatio = distance / reach;
        const angle = Math.atan2(relativeY, relativeX);
        const core = Math.exp(-Math.pow(distanceRatio / .22, 2));
        const circulation = (1 - Math.exp(-Math.pow(distanceRatio / .2, 2)))
          * Math.exp(-distanceRatio * 1.5) / (distanceRatio + .16);
        const spiralPhase = angle
          - Math.log(Math.max(distanceRatio, .045)) / GOLDEN_PITCH
          - seconds * .48;
        const spiralWave = Math.sin(spiralPhase) * Math.exp(-distanceRatio * 1.15);
        const collar = Math.exp(-Math.pow((distanceRatio - .3) / .15, 2));

        const behind = -(relativeX * flowDirectionX + relativeY * flowDirectionY);
        const across = relativeX * -flowDirectionY + relativeY * flowDirectionX;
        const wakeEnvelope = behind > 0
          ? Math.exp(-behind / (reach * 1.3)) * Math.exp(-Math.abs(across) / (reach * .34))
          : 0;
        const wakeWave = Math.sin(behind * (compact ? .105 : .072) - seconds * 2 / PHI)
          * wakeEnvelope * flowSpeed;

        const distanceA = Math.hypot(centerX - sourceA[0], centerY - sourceA[1]);
        const distanceB = Math.hypot(centerX - sourceB[0], centerY - sourceB[1]);
        const waveA = Math.sin(distanceA * (compact ? .052 : .035) - seconds * .72);
        const waveB = Math.sin(distanceB * (compact ? .052 : .035) * PHI + seconds * .72 / PHI);
        const interference = waveA * .58 + waveB * .42;

        const impactAge = seconds - impact.at;
        const impactDistance = Math.hypot(centerX - impact.x, centerY - impact.y);
        const shockSpeed = compact ? 230 : 380;
        const shockWidth = compact ? 30 : 48;
        const shockRadius = impactAge * shockSpeed;
        const shockFront = Math.exp(-Math.pow((impactDistance - shockRadius) / shockWidth, 2));
        const shockTail = Math.exp(-Math.pow((impactDistance - shockRadius + shockWidth * 1.35) / (shockWidth * 1.45), 2));
        const impactCore = Math.exp(-Math.pow(impactDistance / (compact ? 50 : 78), 2));
        const impactDecay = !reducedMotion.matches && impactAge >= 0 && impactAge < 2
          ? Math.exp(-impactAge * 1.45)
          : 0;
        const shockAttack = 1 - Math.exp(-Math.max(0, impactAge) * 11);
        const impactLift = (
          shockFront * shockAttack * (compact ? 48 : 76)
          - shockTail * (compact ? 12 : 19)
          - impactCore * Math.exp(-Math.max(0, impactAge) * 4.8) * (compact ? 27 : 43)
        ) * impactDecay;

        // Movimento baixo e arredondado: um inchaço suave sob o cursor, ondas circulares
        // que saem dele e só um traço da espiral (as alturas são ~1/3 das anteriores)
        const swell = Math.exp(-Math.pow(distanceRatio / .55, 2));
        const ripple = Math.cos(distanceRatio * 9 - seconds * 2.2) * Math.exp(-distanceRatio * 1.6);
        const pressureWell = -core * (compact ? 6 : 9) * (1 + pointer.pressure * .9);
        const circulatingCrest = spiralWave * circulation * (compact ? 4 : 6);
        const pressureCollar = (swell * (compact ? 10 : 14) + ripple * (compact ? 4 : 6)) * (.8 + pointer.pressure * .6);
        const wakeLift = wakeWave * (compact ? 5 : 8);
        const ambientLift = (compact ? 5 : 6) + interference * (compact ? 2 : 3);
        const interactionLift = pressureWell + circulatingCrest + pressureCollar + wakeLift + impactLift * .4;
        const targetLift = clamp(
          ambientLift + interactionLift,
          1.5,
          compact ? 30 : 42
        );
        const key = `${row}:${column}`;
        let heightState = heights.get(key);
        if (!heightState) {
          heightState = { x: targetLift, v: 0 };
          heights.set(key, heightState);
        }
        settleHeight(heightState, targetLift, dt, compact ? .17 : .21, reducedMotion.matches);
        const lift = clamp(heightState.x * (.25 + .75 * intact), .75, compact ? 36 : 50);

        const tangentX = distance > 1 ? -relativeY / distance : 0;
        const tangentY = distance > 1 ? relativeX / distance : 0;
        const flowShift = circulation * (compact ? 1.6 : 2.6) * (1 + pointer.pressure * .65);
        const wakeShift = wakeEnvelope * flowSpeed * (compact ? 3.2 : 5.4);
        const groundX = restingX + tangentX * flowShift - flowDirectionX * wakeShift;
        const groundY = restingY + tangentY * flowShift - flowDirectionY * wakeShift;

        const baseA = [groundX, groundY];
        const baseB = [groundX + tileWidth, groundY];
        const baseC = [groundX + tileWidth + tileDepthX, groundY + tileDepthY];
        const baseD = [groundX + tileDepthX, groundY + tileDepthY];
        const topA = [baseA[0], baseA[1] - lift];
        const topB = [baseB[0], baseB[1] - lift];
        const topC = [baseC[0], baseC[1] - lift];
        const topD = [baseD[0], baseD[1] - lift];
        const fluidEnergy = clamp(
          .5 + interactionLift / (compact ? 22 : 32) + interference * .08,
          0,
          1
        );
        const light = (.28 + fluidEnergy * .72) * (.45 + .55 * intact);
        const shade = (grain - .5) * .028;

        // True solid faces, painted back-to-front inside each prism.
        polygon([topB, topC, baseC, baseB], tone(.035 + light * .035 + shade), .1 + light * .1);
        polygon([topD, topC, baseC, baseD], tone(.055 + light * .055 + shade), .12 + light * .11);
        polygon([topA, topB, topC, topD], tone(.08 + light * .1 + shade), .15 + light * .14);

        // Porosidade: alguns pontinhos fixos no topo de cada tijolo
        for (let speck = 0; speck < 5; speck += 1) {
          const u = hash(row * 31 + speck, column - speck * 7);
          const v = hash(column * 17 + speck, row + speck * 13);
          const sx = topA[0] + u * tileWidth + v * tileDepthX;
          const sy = topA[1] + v * tileDepthY;
          context.globalAlpha = .22;
          context.fillStyle = speck % 2 ? '#000' : beige;
          context.fillRect(sx, sy, compact ? 1 : 1.4, compact ? 1 : 1.4);
        }

        // Aresta de luz na borda da frente, para ler o volume do tijolo
        context.globalAlpha = .06 + light * .1;
        context.strokeStyle = cream;
        context.beginPath();
        context.moveTo(topD[0], topD[1]);
        context.lineTo(topC[0], topC[1]);
        context.stroke();
      }
    }

    context.globalAlpha = 1;
    if (visible && !reducedMotion.matches) frame = requestAnimationFrame(draw);
  };

  const resize = () => {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    heights.clear();
    measureBreaks();
    if (!pointer.x && !pointer.y) {
      pointer.x = pointer.targetX = width * .58;
      pointer.y = pointer.targetY = height * .5;
      pointer.previousX = pointer.x;
      pointer.previousY = pointer.y;
    }
    last = 0;
    draw(performance.now());
  };

  const restart = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    draw(performance.now());
  };

  const pointToCanvas = (event) => {
    const bounds = canvas.getBoundingClientRect();
    pointer.targetX = event.clientX - bounds.left;
    pointer.targetY = event.clientY - bounds.top;
    pointer.engaged = true;
    lastInteraction = performance.now();
    if (reducedMotion.matches) {
      pointer.x = pointer.targetX;
      pointer.y = pointer.targetY;
      draw(lastInteraction);
    } else if (!frame) {
      frame = requestAnimationFrame(draw);
    }
  };

  hero.addEventListener('pointermove', pointToCanvas, { passive: true });
  hero.addEventListener('pointerdown', (event) => {
    pointToCanvas(event);
    pointer.pressed = true;
    impact.x = pointer.targetX;
    impact.y = pointer.targetY;
    impact.at = performance.now() * .001;
  }, { passive: true });
  hero.addEventListener('pointerup', () => {
    pointer.pressed = false;
  }, { passive: true });
  hero.addEventListener('pointercancel', () => {
    pointer.pressed = false;
  }, { passive: true });
  hero.addEventListener('pointerleave', () => {
    pointer.engaged = false;
    pointer.pressed = false;
    lastInteraction = performance.now();
  });

  new ResizeObserver(resize).observe(canvas);
  // A fonte do nome muda a largura do texto: mede a quebra de novo quando ela carregar
  document.fonts?.ready.then(() => { measureBreaks(); if (!frame) restart(); });
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible && !frame) restart();
  }, { rootMargin: '120px 0px', threshold: .01 }).observe(canvas);
  reducedMotion.addEventListener('change', restart);
})();
