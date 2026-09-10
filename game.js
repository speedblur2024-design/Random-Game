(() => {
  'use strict';

  // ---------- Setup ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const W = 400;
  const H = 600;
  const GROUND_H = 80;
  const GROUND_Y = H - GROUND_H;

  const BIRD_X = 105;
  const BIRD_R = 13;

  const PIPE_W = 66;
  const PIPE_SPACING = 225;
  const BASE_SPEED = 2.2;
  const BASE_GAP = 152;

  // ---------- State ----------
  let state = 'menu'; // menu | play | over
  let paused = false;
  let frames = 0;
  let score = 0;
  let best = Number(localStorage.getItem('flappy-best') || 0);
  let overTimer = 0;
  let shake = 0;
  let flash = 0;

  let bird, pipes, groundX, clouds, particles, scorePop;

  function resetWorld() {
    bird = { y: H * 0.44, vy: 0, rot: 0, wing: 0, alive: true };
    pipes = [];
    groundX = 0;
    particles = [];
    scorePop = 0;
    score = 0;
    overTimer = 0;
    shake = 0;
    flash = 0;
    // Pre-seed clouds
    clouds = Array.from({ length: 5 }, (_, i) => ({
      x: Math.random() * W,
      y: 40 + Math.random() * 220,
      s: 0.5 + Math.random() * 0.9,
      v: 0.15 + Math.random() * 0.25,
    }));
    // Pre-seed one pipe set so menu shows world
    spawnPipe(W + 60);
  }

  function difficulty() {
    return {
      speed: Math.min(BASE_SPEED + score * 0.03, 3.6),
      gap: Math.max(BASE_GAP - score * 0.9, 118),
    };
  }

  function spawnPipe(x) {
    const { gap } = difficulty();
    const margin = 70;
    const minY = margin + gap / 2;
    const maxY = GROUND_Y - margin - gap / 2;
    const gapY = minY + Math.random() * (maxY - minY);
    pipes.push({ x, gapY, gapH: gap, passed: false });
  }

  resetWorld();

  // ---------- Audio (WebAudio, no assets) ----------
  let audioCtx = null;
  function audio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { /* no audio */ }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    const ac = audio();
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  const sfx = {
    flap() { tone(420, 0.09, 'square', 0.07, 700); },
    score() { tone(880, 0.08, 'sine', 0.14); tone(1320, 0.12, 'sine', 0.12, null, 0.08); },
    hit() { tone(200, 0.2, 'sawtooth', 0.18, 60); },
    die() { tone(600, 0.5, 'sawtooth', 0.1, 120); },
    swoosh() { tone(300, 0.15, 'sine', 0.08, 900); },
  };

  // ---------- Input ----------
  function flap() {
    audio(); // unlock on gesture
    if (paused) return;
    if (state === 'menu') {
      state = 'play';
      bird.vy = -7.4;
      sfx.flap();
      burst(BIRD_X, bird.y, 5, '#fef08a');
    } else if (state === 'play') {
      bird.vy = -7.4;
      sfx.flap();
      burst(BIRD_X, bird.y + 8, 3, '#fef9c3');
    } else if (state === 'over' && overTimer > 35) {
      // Click anywhere after short delay restarts to ready-to-play
      resetWorld();
      state = 'menu';
      sfx.swoosh();
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      flap();
    } else if (e.code === 'KeyR') {
      resetWorld();
      state = 'menu';
    } else if (e.code === 'KeyP') {
      if (state === 'play') paused = !paused;
    } else if (e.code === 'Enter' && state !== 'play') {
      flap();
    }
  });

  // Pointer works for mouse + touch
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state === 'over' && overTimer > 35) {
      // Check buttons first
      const rect = canvas.getBoundingClientRect();
      const px = (e.clientX - rect.left) * (W / rect.width);
      const py = (e.clientY - rect.top) * (H / rect.height);
      // OK button: centered ~ (W/2-75 .. W/2+75, 415..455)
      if (px >= W / 2 - 80 && px <= W / 2 + 80 && py >= 412 && py <= 458) {
        resetWorld();
        state = 'play';
        bird.vy = -7.4;
        sfx.flap();
        return;
      }
      // MENU small button
      if (px >= W / 2 - 80 && px <= W / 2 - 8 && py >= 466 && py <= 496) {
        resetWorld();
        state = 'menu';
        sfx.swoosh();
        return;
      }
    }
    flap();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === 'play') paused = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function burst(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 3,
        vy: -1 - Math.random() * 2,
        life: 22 + Math.random() * 14,
        max: 36,
        r: 2 + Math.random() * 2.5,
        color,
      });
    }
  }

  // ---------- Update ----------
  let lastTime = 0;
  function loop(t) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = t;
    let dt = (t - lastTime) / 16.666;
    lastTime = t;
    dt = Math.min(dt, 2.5); // clamp tab-switch jumps

    if (!paused) update(dt);
    render();
  }

  function update(dt) {
    frames += dt;

    // Clouds always drift
    for (const c of clouds) {
      c.x -= c.v * dt;
      if (c.x < -70) {
        c.x = W + 60;
        c.y = 40 + Math.random() * 220;
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.12 * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (scorePop > 0) scorePop -= dt;
    if (shake > 0) shake -= dt;
    if (flash > 0) flash -= dt * 2;

    const { speed } = difficulty();

    if (state === 'menu') {
      // Idle bobbing
      bird.y = H * 0.44 + Math.sin(frames * 0.08) * 7;
      bird.rot = Math.sin(frames * 0.08 + 0.6) * 0.08;
      bird.wing += dt * 0.45;
      groundX = (groundX + speed * 0.6 * dt) % 24;
      // Keep demo pipes drifting
      for (const p of pipes) p.x -= speed * 0.6 * dt;
      if (pipes.length && pipes[0].x < -PIPE_W - 20) pipes.shift();
      if (pipes.length === 0 || pipes[pipes.length - 1].x < W - PIPE_SPACING) {
        // keep one pipe looping in menu for backdrop
        if (pipes.length < 2) spawnPipe(W + 40);
      }
      return;
    }

    if (state === 'play') {
      // Bird physics
      bird.vy = Math.min(bird.vy + 0.42 * dt, 11);
      bird.y += bird.vy * dt;
      bird.wing += dt * (bird.vy < 0 ? 0.9 : 0.35);

      // Tilt: up = -0.35rad, falling = +1.35rad
      const target = bird.vy < 0 ? -0.38 : Math.min(1.35, -0.1 + bird.vy * 0.13);
      bird.rot += (target - bird.rot) * Math.min(1, 0.18 * dt);

      groundX = (groundX + speed * dt) % 24;

      // Pipes
      for (const p of pipes) p.x -= speed * dt;
      const last = pipes[pipes.length - 1];
      if (!last || last.x < W - PIPE_SPACING) spawnPipe(W + 10);
      if (pipes.length && pipes[0].x < -PIPE_W - 10) pipes.shift();

      // Scoring
      for (const p of pipes) {
        if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
          p.passed = true;
          score++;
          scorePop = 12;
          sfx.score();
          burst(BIRD_X + 20, bird.y - 20, 6, '#ffffff');
        }
      }

      // Collisions
      if (collides()) {
        state = 'over';
        overTimer = 0;
        shake = 14;
        flash = 12;
        sfx.hit();
        setTimeout(() => sfx.die(), 150);
        burst(BIRD_X, bird.y, 16, '#fde047');
        if (score > best) {
          best = score;
          localStorage.setItem('flappy-best', String(best));
        }
      }

      // Ceiling clamp (don't die on ceiling, just clamp like original)
      if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = 0; }
      return;
    }

    if (state === 'over') {
      overTimer += dt;
      // Bird tumbles to ground
      if (bird.alive) {
        bird.vy = Math.min(bird.vy + 0.5 * dt, 12);
        bird.y += bird.vy * dt;
        bird.rot = Math.min(bird.rot + 0.09 * dt, 1.5);
        if (bird.y >= GROUND_Y - BIRD_R) {
          bird.y = GROUND_Y - BIRD_R;
          bird.alive = false;
          shake = Math.max(shake, 6);
        }
      }
      // Pipes freeze (classic behavior)
      return;
    }
  }

  function collides() {
    // Ground / allow slight ceiling forgiveness
    if (bird.y + BIRD_R >= GROUND_Y) return true;

    const bx0 = BIRD_X - BIRD_R + 2;
    const bx1 = BIRD_X + BIRD_R - 2;
    for (const p of pipes) {
      const px0 = p.x;
      const px1 = p.x + PIPE_W;
      if (bx1 < px0 || bx0 > px1) continue;
      const topBottom = p.gapY - p.gapH / 2;
      const botTop = p.gapY + p.gapH / 2;
      // shrink hitbox a touch for fairness
      if (bird.y - BIRD_R + 3 < topBottom || bird.y + BIRD_R - 3 > botTop) {
        return true;
      }
    }
    return false;
  }

  // ---------- Render ----------
  function render() {
    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 0.7, (Math.random() - 0.5) * shake * 0.7);
    }

    drawBackground();
    drawPipes();
    drawGround();
    drawParticles();
    drawBird();

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.85, flash / 12)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (state === 'menu') drawMenu();
    else if (state === 'play') drawScoreHUD();
    else if (state === 'over') { drawScoreHUD(true); drawGameOver(); }

    if (paused && state === 'play') drawPaused();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#4fb8e8');
    g.addColorStop(0.62, '#8fd9ef');
    g.addColorStop(0.62, '#b8e6a0');
    g.addColorStop(1, '#9ed68a');
    ctx.fillStyle = g;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // Sun
    ctx.fillStyle = 'rgba(255,244,180,0.9)';
    ctx.beginPath();
    ctx.arc(320, 95, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(320, 95, 36, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    for (const c of clouds) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.s, c.s);
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.arc(18, -6, 20, 0, Math.PI * 2);
      ctx.arc(40, 0, 15, 0, Math.PI * 2);
      ctx.arc(20, 8, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Distant hills
    ctx.fillStyle = '#8fd08a';
    ctx.beginPath();
    ctx.moveTo(-20, GROUND_Y);
    for (let x = -20; x <= W + 20; x += 40) {
      ctx.lineTo(x + 20, GROUND_Y - 42 - Math.sin((x + frames * 0.0) * 0.03) * 12);
      ctx.lineTo(x + 40, GROUND_Y);
    }
    ctx.lineTo(W + 20, GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Bushes row
    ctx.fillStyle = '#6fbf6a';
    for (let x = -20; x < W + 20; x += 34) {
      ctx.beginPath();
      ctx.arc(x + (frames * 0 % 10), GROUND_Y - 4, 14, Math.PI, 0);
      ctx.fill();
    }
  }

  function drawPipeBody(x, y, w, h, isTop) {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#4a9e2b');
    grad.addColorStop(0.18, '#7ed957');
    grad.addColorStop(0.5, '#a8f08a');
    grad.addColorStop(0.82, '#5cbf3a');
    grad.addColorStop(1, '#2f7a1c');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#1e4d12';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y - 1, w - 2, h + 2);

    // Cap
    const capH = 24;
    const capX = x - 3;
    const capW = w + 6;
    const capY = isTop ? y + h - capH : y;
    const cg = ctx.createLinearGradient(capX, 0, capX + capW, 0);
    cg.addColorStop(0, '#3d8a24');
    cg.addColorStop(0.2, '#8df06a');
    cg.addColorStop(0.5, '#d2ffb8');
    cg.addColorStop(0.85, '#54b530');
    cg.addColorStop(1, '#256b14');
    ctx.fillStyle = cg;
    roundRect(capX, capY, capW, capH, 4);
    ctx.fill();
    ctx.strokeStyle = '#1e4d12';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function drawPipes() {
    for (const p of pipes) {
      const topH = p.gapY - p.gapH / 2;
      const botY = p.gapY + p.gapH / 2;
      drawPipeBody(p.x, 0, PIPE_W, topH, true);
      drawPipeBody(p.x, botY, PIPE_W, GROUND_Y - botY, false);
    }
  }

  function drawGround() {
    // Dirt
    ctx.fillStyle = '#ded895';
    ctx.fillRect(-20, GROUND_Y, W + 40, GROUND_H + 20);
    // Grass strip
    ctx.fillStyle = '#7ed957';
    ctx.fillRect(-20, GROUND_Y, W + 40, 16);
    ctx.fillStyle = '#4a9e2b';
    ctx.fillRect(-20, GROUND_Y + 14, W + 40, 4);
    // Moving stripes
    ctx.fillStyle = '#c9c27e';
    for (let x = -groundX - 24; x < W + 24; x += 24) {
      ctx.save();
      ctx.translate(x, GROUND_Y + 32);
      ctx.rotate(0);
      ctx.fillRect(0, 0, 12, 48);
      ctx.restore();
    }
    // Top highlight line
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-20, GROUND_Y, W + 40, 2);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBird() {
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(bird.rot);

    // Tail
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(-20, -5);
    ctx.lineTo(-20, 5);
    ctx.closePath();
    ctx.fill();

    // Body
    const bodyGrad = ctx.createLinearGradient(0, -13, 0, 13);
    bodyGrad.addColorStop(0, '#fef08a');
    bodyGrad.addColorStop(0.55, '#facc15');
    bodyGrad.addColorStop(1, '#eab308');
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R + 1, BIRD_R - 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly
    ctx.fillStyle = '#fefce8';
    ctx.beginPath();
    ctx.ellipse(2, 6, 8, 5.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing (flapping)
    const flapAngle = Math.sin(bird.wing) * 0.9;
    ctx.save();
    ctx.translate(-3, 1);
    ctx.rotate(flapAngle * 0.7 - 0.3);
    ctx.fillStyle = '#fdba74';
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(-4, 0, 9, 5.5, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Eye
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(6, -5, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(7.5, -5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(8.2, -5.8, 0.9, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#fb923c';
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(11, -1);
    ctx.lineTo(19, 1);
    ctx.lineTo(11, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(11, -1);
    ctx.lineTo(19, 1);
    ctx.stroke();

    ctx.restore();
  }

  function drawScoreHUD(dim = false) {
    ctx.save();
    ctx.textAlign = 'center';
    const pop = 1 + (scorePop > 0 ? (scorePop / 12) * 0.35 : 0);
    ctx.translate(W / 2, 96);
    ctx.scale(pop, pop);
    ctx.font = '900 46px ui-rounded, system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(String(score), 0, 0);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(score), 0, 0);
    ctx.restore();
  }

  function drawMenu() {
    ctx.save();
    ctx.textAlign = 'center';

    // Title
    ctx.font = '900 44px ui-rounded, system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    const bob = Math.sin(frames * 0.06) * 3;
    ctx.save();
    ctx.translate(W / 2, 150 + bob);
    ctx.rotate(Math.sin(frames * 0.04) * 0.02);
    ctx.strokeText('FLAPPY', 0, 0);
    ctx.fillStyle = '#facc15';
    ctx.fillText('FLAPPY', 0, 0);
    ctx.strokeText('BIRD', 0, 42);
    ctx.fillStyle = '#fff';
    ctx.fillText('BIRD', 0, 42);
    ctx.restore();

    // Bird badge
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(W / 2 - 105, 228, 210, 34, 17);
    ctx.fill();
    ctx.fillStyle = '#fefce8';
    ctx.fillText(`BEST  ${best}`, W / 2, 250);

    // Tap card
    const pulse = 1 + Math.sin(frames * 0.12) * 0.04;
    ctx.save();
    ctx.translate(W / 2, 355);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(-95, -44, 190, 88, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.font = '900 18px system-ui, sans-serif';
    ctx.fillText('GET READY!', 0, -12);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('Tap / Space to flap', 0, 12);
    // little up arrow bounce
    const ay = 24 + Math.sin(frames * 0.15) * -4;
    ctx.font = '900 18px system-ui';
    ctx.fillStyle = '#16a34a';
    ctx.fillText('▲', 0, ay);
    ctx.restore();

    ctx.restore();
  }

  function medalFor(s) {
    if (s >= 40) return { label: 'PLATINUM', c1: '#e2e8f0', c2: '#94a3b8' };
    if (s >= 30) return { label: 'GOLD', c1: '#fde047', c2: '#ca8a04' };
    if (s >= 20) return { label: 'SILVER', c1: '#f1f5f9', c2: '#64748b' };
    if (s >= 10) return { label: 'BRONZE', c1: '#fdba74', c2: '#9a3412' };
    return null;
  }

  function drawGameOver() {
    if (overTimer < 8) return; // let hit register first
    ctx.save();
    ctx.textAlign = 'center';

    // Darken
    ctx.fillStyle = 'rgba(15,23,42,0.25)';
    ctx.fillRect(0, 0, W, H);

    // Title
    const slide = Math.min(1, overTimer / 18);
    const ty = 178 - (1 - easeOut(slide)) * 60;
    ctx.font = '900 38px ui-rounded, system-ui, sans-serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText('GAME OVER', W / 2, ty);
    ctx.fillStyle = '#fb7185';
    ctx.fillText('GAME OVER', W / 2, ty);

    // Panel
    const py = 200;
    ctx.fillStyle = 'rgba(255,253,240,0.97)';
    roundRect(W / 2 - 130, py, 260, 200, 16);
    ctx.fill();
    ctx.strokeStyle = '#854d0e';
    ctx.lineWidth = 3;
    ctx.stroke();

    const medal = medalFor(score);
    // Medal circle
    ctx.save();
    ctx.translate(W / 2 - 72, py + 68);
    const mg = ctx.createLinearGradient(0, -30, 0, 30);
    if (medal) { mg.addColorStop(0, medal.c1); mg.addColorStop(1, medal.c2); }
    else { mg.addColorStop(0, '#e2e8f0'); mg.addColorStop(1, '#cbd5e1'); }
    ctx.fillStyle = mg;
    ctx.strokeStyle = '#57534e';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = medal ? '#0f172a' : '#94a3b8';
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.fillText(medal ? medal.label : 'NO', 0, -2);
    ctx.font = '900 13px system-ui, sans-serif';
    ctx.fillText(medal ? 'MEDAL' : 'MEDAL', 0, 13);
    ctx.restore();

    // Scores
    ctx.textAlign = 'right';
    ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillStyle = '#b45309';
    ctx.fillText('SCORE', W / 2 + 105, py + 42);
    ctx.fillText('BEST', W / 2 + 105, py + 98);
    ctx.font = '900 34px system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(String(score), W / 2 + 105, py + 74);
    ctx.fillText(String(best), W / 2 + 105, py + 130);

    if (score >= best && score > 0) {
      ctx.textAlign = 'center';
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.fillStyle = '#dc2626';
      ctx.fillText('★ NEW BEST! ★', W / 2 + 38, py + 152);
    }

    // Buttons
    // Main OK / Play again
    ctx.textAlign = 'center';
    button(W / 2, 435, 160, 46, '#4ade80', '#16a34a', '↻  PLAY', '#052e16');
    // Small menu
    button(W / 2 - 44, 481, 72, 30, '#e2e8f0', '#94a3b8', 'MENU', '#0f172a', 14);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('or tap anywhere to continue', W / 2, 528);

    ctx.restore();
  }

  function button(cx, cy, w, h, fill, edge, label, fg, fontSize = 20) {
    ctx.save();
    ctx.translate(cx, cy);
    // shadow / 3D edge
    ctx.fillStyle = edge;
    roundRect(-w / 2, -h / 2 + 3, w, h, 10);
    ctx.fill();
    ctx.fillStyle = fill;
    roundRect(-w / 2, -h / 2 - 1, w, h, 10);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = `900 ${fontSize}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  function drawPaused() {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = '900 32px system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText('PAUSED', W / 2, H / 2 - 10);
    ctx.font = '600 14px system-ui, sans-serif';
    ctx.fillText('Press P to resume', W / 2, H / 2 + 18);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  requestAnimationFrame(loop);
})();
