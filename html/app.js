// Fundo animado do hero: um campo de prismas que reage ao ponteiro.
// Desenhado em <canvas data-terrain-field> e pausado fora da tela
// ou com prefers-reduced-motion.
(() => {
  const canvas = document.querySelector('[data-terrain-field]');
  const hero = canvas?.closest('.hero');
  if (!canvas || !hero) return;

  const context = canvas.getContext('2d');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const beige = getComputedStyle(document.documentElement).getPropertyValue('--beige').trim() || '#d9d1c4';
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

  const polygon = (points, fillTone, strokeAlpha) => {
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
    context.strokeStyle = beige;
    context.stroke();
  };

  const draw = (time = 0) => {
    frame = 0;
    context.clearRect(0, 0, width, height);

    const dt = last ? Math.min((time - last) / 1000, 1 / 30) : 1 / 60;
    last = time;
    const compact = width < 620;
    const depthX = compact ? 9 : 16;
    const depthY = compact ? 21 : 34;
    const tileDepthX = depthX * .78;
    const tileDepthY = depthY - (compact ? 2 : 3);
    const tileWidth = Math.hypot(tileDepthX, tileDepthY) * PHI;
    const stepX = tileWidth + (compact ? 5 : 7);
    const stepY = depthY + (compact ? 4 : 6);
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
      // A golden-ratio advance removes the obvious brick repeat while
      // keeping every prism separate and consistently proportioned.
      const rowOffset = ((row * stepX / PHI) % stepX + stepX) % stepX;
      for (let column = -3; column < columns; column += 1) {
        const restingX = column * stepX + rowOffset - stepX * 1.5;
        const restingY = row * stepY;
        const centerX = restingX + (tileWidth + tileDepthX) * .5;
        const centerY = restingY + tileDepthY * .5;
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

        const pressureWell = -core * (compact ? 28 : 44) * (1 + pointer.pressure * .95);
        const circulatingCrest = spiralWave * circulation * (compact ? 34 : 56) * (1 + pointer.pressure * .55);
        const pressureCollar = collar * (compact ? 20 : 32) * (.7 + pointer.pressure * .75);
        const wakeLift = wakeWave * (compact ? 18 : 28);
        const ambientLift = (compact ? 12 : 15) + interference * (compact ? 5 : 8);
        const interactionLift = pressureWell + circulatingCrest + pressureCollar + wakeLift + impactLift;
        const targetLift = clamp(
          ambientLift + interactionLift,
          2,
          compact ? 105 : 155
        );
        const key = `${row}:${column}`;
        let heightState = heights.get(key);
        if (!heightState) {
          heightState = { x: targetLift, v: 0 };
          heights.set(key, heightState);
        }
        settleHeight(heightState, targetLift, dt, compact ? .17 : .21, reducedMotion.matches);
        const lift = clamp(heightState.x, .75, compact ? 130 : 190);

        const tangentX = distance > 1 ? -relativeY / distance : 0;
        const tangentY = distance > 1 ? relativeX / distance : 0;
        const flowShift = circulation * (compact ? 4.6 : 7.8) * (1 + pointer.pressure * .65);
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
          .5 + interactionLift / (compact ? 62 : 96) + interference * .08,
          0,
          1
        );
        const light = .28 + fluidEnergy * .72;

        // True solid faces, painted back-to-front inside each prism.
        polygon([topB, topC, baseC, baseB], tone(.035 + light * .035), .1 + light * .1);
        polygon([topD, topC, baseC, baseD], tone(.055 + light * .055), .12 + light * .11);
        polygon([topA, topB, topC, topD], tone(.08 + light * .1), .15 + light * .14);
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
  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    if (visible && !frame) restart();
  }, { rootMargin: '120px 0px', threshold: .01 }).observe(canvas);
  reducedMotion.addEventListener('change', restart);
})();
