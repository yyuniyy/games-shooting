(() => {
  "use strict";

  const BASE_W = 540;
  const BASE_H = 960;

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  const startOverlay = document.getElementById("startOverlay");
  const startBtn = document.getElementById("startBtn");

  const continueOverlay = document.getElementById("continueOverlay");
  const continueBtn = document.getElementById("continueBtn");
  const countdownEl = document.getElementById("countdown");

  const finalOverlay = document.getElementById("finalOverlay");
  const restartBtn = document.getElementById("restartBtn");
  const finalScoreEl = document.getElementById("finalScore");
  const finalRankEl = document.getElementById("finalRank");

  const superBtn = document.getElementById("superBtn");

  const hpBar = document.getElementById("hpBar");
  const hpText = document.getElementById("hpText");
  const scoreText = document.getElementById("scoreText");
  const powerText = document.getElementById("powerText");
  const superText = document.getElementById("superText");
  const crashText = document.getElementById("clashText");
  const rageText = document.getElementById("rageText");

  const bossHud = document.getElementById("bossHud");
  const bossBar = document.getElementById("bossBar");
  const bossText = document.getElementById("bossText");

  // Mobile D-Pad
  const mobileControls = document.getElementById("mobileControls");
  const dpad = document.getElementById("dpad");
  const dpadButtons = Array.from(document.querySelectorAll(".dpadBtn"));

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  const W = BASE_W;
  const H = BASE_H;

  // === Detect mobile/touch ===
  const isTouchDevice = (() => {
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const ua = navigator.userAgent || "";
    const uaMobile = /Android|iPhone|iPad|iPod/i.test(ua);
    return coarse || uaMobile || ("ontouchstart" in window);
  })();

  if (isTouchDevice) {
    mobileControls.classList.remove("hidden");
  } else {
    mobileControls.classList.add("hidden");
  }

  // ===== Input (keyboard) =====
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (["w","a","s","d","p","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) {
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

  // ===== Mobile D-Pad state (8-direction) =====
  const activePads = new Map(); // pointerId -> {x,y}
  let dpadVec = { x: 0, y: 0 };

  function recomputeDpadVec() {
    let sx = 0, sy = 0;
    for (const v of activePads.values()) { sx += v.x; sy += v.y; }
    sx = clamp(sx, -1, 1);
    sy = clamp(sy, -1, 1);

    // Normalize diagonal to avoid faster movement
    if (sx !== 0 && sy !== 0) {
      const inv = 1 / Math.sqrt(2);
      sx *= inv; sy *= inv;
    }
    dpadVec.x = sx;
    dpadVec.y = sy;
  }

  function parseDir(btn) {
    const s = btn.getAttribute("data-dir") || "0,0";
    const [x, y] = s.split(",").map(Number);
    return { x: clamp(x, -1, 1), y: clamp(y, -1, 1) };
  }

  // Hold-to-move
  for (const btn of dpadButtons) {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (audio) audio.ac.resume().catch(() => {});
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("pressed");
      activePads.set(e.pointerId, parseDir(btn));
      recomputeDpadVec();
    }, { passive: false });

    const end = (e) => {
      if (activePads.has(e.pointerId)) activePads.delete(e.pointerId);
      btn.classList.remove("pressed");
      recomputeDpadVec();
    };

    btn.addEventListener("pointerup", (e) => { e.preventDefault(); end(e); }, { passive: false });
    btn.addEventListener("pointercancel", (e) => { e.preventDefault(); end(e); }, { passive: false });
    btn.addEventListener("pointerleave", (e) => { if (e.pressure === 0) end(e); }, { passive: true });
  }

  // ===== Responsive canvas scaling =====
  let dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  function resizeCanvas() {
    dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  window.addEventListener("resize", resizeCanvas);

  // ===== Audio (WebAudio) =====
  let audio = null;

  function makeAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ac = new AudioCtx();
    const master = ac.createGain();
    master.gain.value = 0.75;
    master.connect(ac.destination);

    const delay = ac.createDelay(1.0);
    delay.delayTime.value = 0.16;
    const fb = ac.createGain();
    fb.gain.value = 0.22;
    delay.connect(fb);
    fb.connect(delay);

    const wet = ac.createGain();
    wet.gain.value = 0.22;
    delay.connect(wet);
    wet.connect(master);

    function sfxTone({ type="sine", freq=440, dur=0.08, gain=0.2, detune=0, sweepTo=null }) {
      const t0 = ac.currentTime;
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (sweepTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(30, sweepTo), t0 + dur);
      osc.detune.setValueAtTime(detune, t0);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.connect(g);
      g.connect(master);
      g.connect(delay);

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noiseBurst({ dur=0.16, gain=0.18, hp=600, lp=6000 }) {
      const t0 = ac.currentTime;
      const bufferSize = Math.floor(ac.sampleRate * dur);
      const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);

      const src = ac.createBufferSource();
      src.buffer = buffer;

      const hpf = ac.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = hp;

      const lpf = ac.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = lp;

      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      src.connect(hpf);
      hpf.connect(lpf);
      lpf.connect(g);
      g.connect(master);
      g.connect(delay);

      src.start(t0);
      src.stop(t0 + dur + 0.02);
    }

    const bgm = { mode:"normal", isPlaying:false, stopFlag:false, interval:null, bpm:152, step:0 };
    const scaleA = [0,2,3,5,7,8,10];
    function midiToFreq(m){ return 440 * Math.pow(2, (m - 69) / 12); }

    function playBgm(mode){
      bgm.mode = mode;
      if (bgm.isPlaying) return;
      bgm.isPlaying = true;
      bgm.stopFlag = false;
      bgm.step = 0;

      const stepMs = () => (60_000 / bgm.bpm) / 4;

      bgm.interval = setInterval(() => {
        if (bgm.stopFlag) return;

        const st = bgm.step++;
        if (bgm.mode === "normal") {
          if (st % 8 === 0) { sfxTone({ type:"sine", freq:95, dur:0.08, gain:0.13, sweepTo:45 }); noiseBurst({ dur:0.05, gain:0.03, hp:2500, lp:9000 }); }
          if (st % 8 === 4) { noiseBurst({ dur:0.10, gain:0.07, hp:1200, lp:6500 }); }
          if (st % 2 === 1) { noiseBurst({ dur:0.03, gain:0.02, hp:5200, lp:12000 }); }

          if (st % 4 === 0) {
            const degree = scaleA[(st / 4) % scaleA.length];
            const m = 57 + degree + (Math.random() < 0.2 ? 12 : 0);
            sfxTone({ type:"triangle", freq:midiToFreq(m), dur:0.12, gain:0.05, detune: rand(-6,6) });
          }
          if (st % 8 === 0) {
            const degree = scaleA[(st / 8) % scaleA.length];
            const m = 45 + degree;
            sfxTone({ type:"sawtooth", freq:midiToFreq(m), dur:0.18, gain:0.032, detune: rand(-3,3) });
          }
        } else {
          if (st % 8 === 0) { sfxTone({ type:"sine", freq:72, dur:0.11, gain:0.18, sweepTo:36 }); noiseBurst({ dur:0.08, gain:0.05, hp:1800, lp:9000 }); }
          if (st % 8 === 4) { noiseBurst({ dur:0.12, gain:0.10, hp:900, lp:5600 }); }
          if (st % 2 === 1) { noiseBurst({ dur:0.03, gain:0.03, hp:5200, lp:12000 }); }

          if (st % 4 === 0) {
            const deg = [0, 3, 5, 7][(st / 4) % 4];
            const root = 50 + deg;
            [0, 3, 7].forEach((iv, i) => {
              sfxTone({ type:"sawtooth", freq:midiToFreq(root + iv), dur:0.20, gain:0.032/(i+1), detune: rand(-7,7) });
            });
          }
          if (st % 2 === 0) {
            const degree = scaleA[(st / 2) % scaleA.length];
            const m = 69 + degree;
            sfxTone({ type:"square", freq:midiToFreq(m), dur:0.09, gain:0.045, detune: rand(-10,10) });
          }
        }
      }, stepMs());
    }

    function stopBgm(){
      if (!bgm.isPlaying) return;
      bgm.stopFlag = true;
      bgm.isPlaying = false;
      if (bgm.interval) clearInterval(bgm.interval);
      bgm.interval = null;
    }

    return {
      ac,
      playBgm,
      stopBgm,
      sfx: {
        shot: () => sfxTone({ type:"triangle", freq: 1040, dur: 0.05, gain: 0.06, sweepTo: 740 }),
        laserStart: () => sfxTone({ type:"square", freq: 520, dur: 0.10, gain: 0.06, sweepTo: 980 }),
        laserHum: () => sfxTone({ type:"sine", freq: 220, dur: 0.06, gain: 0.02, sweepTo: 260 }),
        homing: () => sfxTone({ type:"sine", freq: 560, dur: 0.05, gain: 0.035, sweepTo: 760 }),
        spiral: () => sfxTone({ type:"triangle", freq: 420, dur: 0.05, gain: 0.03, sweepTo: 520 }),
        bombLaunch: () => sfxTone({ type:"sawtooth", freq: 240, dur: 0.08, gain: 0.06, sweepTo: 120 }),
        bombBoom: () => { noiseBurst({ dur:0.22, gain:0.20, hp:160, lp:6200 }); sfxTone({ type:"sawtooth", freq: 160, dur: 0.16, gain: 0.10, sweepTo: 60 }); },
        enemyHit: () => sfxTone({ type:"sine", freq: 520, dur: 0.05, gain: 0.04, sweepTo: 360 }),
        enemyBoom: () => { noiseBurst({ dur:0.18, gain:0.12, hp:240, lp:5200 }); sfxTone({ type:"sawtooth", freq: 180, dur: 0.12, gain: 0.06, sweepTo: 60 }); },
        playerBoom: () => { noiseBurst({ dur:0.30, gain:0.22, hp:120, lp:4200 }); sfxTone({ type:"sawtooth", freq: 140, dur: 0.20, gain: 0.09, sweepTo: 45 }); },
        item: () => sfxTone({ type:"triangle", freq: 880, dur: 0.10, gain: 0.06, sweepTo: 1320 }),
        clash: () => { noiseBurst({ dur:0.06, gain:0.06, hp:2400, lp:10000 }); sfxTone({ type:"sine", freq: 920, dur: 0.05, gain: 0.03, sweepTo: 520 }); },
        super: () => { noiseBurst({ dur:0.36, gain:0.22, hp:120, lp:8000 }); sfxTone({ type:"sawtooth", freq: 120, dur: 0.25, gain: 0.12, sweepTo: 620 }); }
      }
    };
  }

  // ===== Entities =====
  const stars = [];
  const bullets = [];
  const enemyBullets = [];
  const enemies = [];
  const particles = [];
  const items = [];

  let player, boss;
  let running = false;
  let paused = false;
  let gameOver = false;

  let score = 0;
  let power = 1;
  let superShots = 3;

  let postBossDifficulty = 0;

  let shakeTime = 0;
  let shakeAmp = 0;

  let kill100 = 0, kill300 = 0, kill500 = 0;
  let crashKills = 0;

  let nextHealAt100 = 10;
  let nextSuperAt300 = 5;
  let nextSuperAt100 = 30;
  let nextPowerAt500 = 1;
  let nextPowerAt100 = 50;

  let bossNextScore = 10000;
  let bossLevel = 1;

  let enemySpawnTimer = 0;
  let enemySpawnInterval = 0.62;

  let continueLeft = 10;
  let continueTimer = null;
  let continueSnapshot = null;

  let clashStreak = 0;
  let clashDecay = 0;

  let power100ReachedAt = null;
  let enemyRage = 1;
  let enemyRageCount = 1;

  let spiralAngle = 0;
  let beam = null;

  const PLAYER_HIT_R = 14;
  const BOSS_BASE_HP = 300;

  function shake(time, amp) {
    shakeTime = Math.max(shakeTime, time);
    shakeAmp = Math.max(shakeAmp, amp);
  }

  function enemyColorGlow(type) {
    if (type === 100) return "rgba(124,243,255,.95)";
    if (type === 300) return "rgba(255,209,102,.95)";
    return "rgba(255,77,109,.95)";
  }

  function spawnBurst(x, y, n, col, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(120, 520) * scale;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.25, 0.65),
        t: 0,
        r: rand(1.4, 4.8) * scale,
        col
      });
    }
  }

  function spawnRing(x, y, col, r1 = 220, width = 3) {
    particles.push({
      ring: true,
      x, y,
      t: 0,
      life: 0.35,
      r0: 12,
      r1,
      w: width,
      col
    });
  }

  function spawnShardBurst(x, y, n, colA, colB, scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(180, 760) * scale;
      particles.push({
        shard: true,
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: rand(0, Math.PI * 2),
        vr: rand(-14, 14),
        life: rand(0.22, 0.48),
        t: 0,
        w: rand(2, 8) * scale,
        h: rand(1, 5) * scale,
        col: (Math.random() < 0.5 ? colA : colB)
      });
    }
  }

  function spawnClashFx(x, y) {
    audio.sfx.clash();

    const c = clamp(clashStreak, 0, 60);
    const s = 0.85 + c / 35;
    const extra = Math.floor(c * 0.8);

    spawnBurst(x, y, 12 + extra, "rgba(124,243,255,.90)", 0.9 * s);
    spawnBurst(x, y, 8 + Math.floor(extra * 0.6), "rgba(255,209,102,.80)", 0.8 * s);
    spawnShardBurst(x, y, 9 + Math.floor(extra * 0.45), "rgba(223,246,255,.95)", "rgba(255,77,109,.75)", 0.75 * s);

    spawnRing(x, y, "rgba(255,77,109,.20)", 130 * s, 3 + c / 18);
    if (c >= 15) spawnRing(x, y, "rgba(140,0,255,.18)", 190 * s, 3 + c / 16);

    if (c === 10 || c === 25 || c === 40 || c === 55) {
      spawnRing(x, y, "rgba(255,209,102,.28)", 360 + c * 6, 5);
      spawnBurst(x, y, 80, "rgba(255,209,102,.85)", 1.05);
      shake(0.10, 6 + c / 6);
    } else {
      shake(0.04, 2.5 + c / 18);
    }
  }

  function spawnBombExplosion(x, y, radius, bossImmune = false) {
    audio.sfx.bombBoom();
    spawnRing(x, y, "rgba(255,209,102,.55)", radius * 1.8, 6);
    spawnRing(x, y, "rgba(255,77,109,.45)", radius * 2.3, 5);
    spawnBurst(x, y, 120, "rgba(255,209,102,.95)", 1.4);
    spawnBurst(x, y, 90, "rgba(124,243,255,.85)", 1.1);
    spawnShardBurst(x, y, 60, "rgba(223,246,255,.92)", "rgba(140,0,255,.65)", 1.0);
    shake(0.25, 14);

    const r2 = radius * radius;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (dist2(x, y, e.x, e.y) <= (r2 + e.r * e.r)) {
        e.hp -= 10 + Math.floor(power * 0.15);
        if (e.hp <= 0) {
          audio.sfx.enemyBoom();
          spawnBurst(e.x, e.y, 34, enemyColorGlow(e.type), 1.2);
          spawnRing(e.x, e.y, "rgba(223,246,255,.25)", 210);
          score += e.pts;
          crashKills += 1;

          if (e.type === 100) kill100++;
          else if (e.type === 300) kill300++;
          else kill500++;
          enemies.splice(i, 1);
        }
      }
    }

    if (boss && !bossImmune) {
      if (dist2(x, y, boss.x, boss.y) <= (r2 + boss.r * boss.r)) {
        boss.hp -= 6 + Math.floor(power * 0.08);
      }
    }

    for (let j = enemyBullets.length - 1; j >= 0; j--) {
      const eb = enemyBullets[j];
      if (eb.source === "boss") continue;
      if (dist2(x, y, eb.x, eb.y) <= r2) enemyBullets.splice(j, 1);
    }
  }

  // ===== Stars =====
  function initStars() {
    stars.length = 0;
    for (let i = 0; i < 220; i++) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        z: Math.random(),
        sp: rand(80, 320),
        tw: rand(0, Math.PI * 2)
      });
    }
  }

  // ===== Items =====
  function spawnItem(kind) {
    items.push({
      kind,
      x: rand(60, W - 60),
      y: -24,
      vy: rand(120, 160),
      r: 18,
      t: 0
    });
  }

  function handleKillMilestones() {
    while (kill100 >= nextHealAt100) { spawnItem("heal"); nextHealAt100 += 10; }
    while (kill300 >= nextSuperAt300) { spawnItem("super"); nextSuperAt300 += 5; }
    while (kill100 >= nextSuperAt100) { spawnItem("super"); nextSuperAt100 += 30; }
    while (kill500 >= nextPowerAt500) { spawnItem("power"); nextPowerAt500 += 1; }
    while (kill100 >= nextPowerAt100) { spawnItem("power"); nextPowerAt100 += 50; }
  }

  // ===== Enemy spawn =====
  function enemyConf(type) {
    const rage = enemyRage;
    if (type === 100) return { pts:100, hp:1 * rage,  sp:rand(120, 170), r:18 };
    if (type === 300) return { pts:300, hp:10 * rage, sp:rand(110, 160), r:22 };
    return              { pts:500, hp:50 * rage, sp:rand(105, 150), r:24 };
  }

  function pickSpawnSide() {
    if (enemyRage === 10) {
      const t = Math.random();
      if (t < 0.25) return "top";
      if (t < 0.50) return "left";
      if (t < 0.75) return "right";
      return "bottom";
    }
    return "top";
  }

  function spawnEnemy(type, forcedSide = null) {
    const c = enemyConf(type);
    const side = forcedSide ?? pickSpawnSide();

    let x, y, vx, vy;
    const sp = c.sp;

    if (side === "top") {
      x = rand(60, W - 60);
      y = -50;
      vx = rand(-40, 40);
      vy = sp;
    } else if (side === "left") {
      x = -50;
      y = rand(120, H - 120);
      vx = sp;
      vy = rand(-70, 70);
    } else if (side === "right") {
      x = W + 50;
      y = rand(120, H - 120);
      vx = -sp;
      vy = rand(-70, 70);
    } else {
      x = rand(60, W - 60);
      y = H + 50;
      vx = rand(-40, 40);
      vy = -sp;
    }

    enemies.push({
      type,
      pts: c.pts,
      hp: c.hp,
      maxHp: c.hp,
      x, y,
      vx, vy,
      r: c.r,
      shootT: rand(0.25, 0.95),
      phase: rand(0, Math.PI * 2),
      side
    });
  }

  function spawnWeightedEnemy(forcedSide = null) {
    const t = Math.random() * 1.4;
    if (t < 1.0) return spawnEnemy(100, forcedSide);
    if (t < 1.3) return spawnEnemy(300, forcedSide);
    return spawnEnemy(500, forcedSide);
  }

  function spawnWave(count, forcedSide = null) {
    for (let i = 0; i < count; i++) spawnWeightedEnemy(forcedSide);
  }

  // ===== Boss =====
  function spawnBoss() {
    const hp = Math.floor(BOSS_BASE_HP * Math.pow(2, bossLevel - 1));
    const atkMult = Math.pow(1.1, bossLevel - 1);

    boss = {
      level: bossLevel,
      x: W * 0.5,
      y: 140,
      hp,
      maxHp: hp,
      t: 0,
      r: 70 + bossLevel * 4,
      shootT: 0,
      atkMult,
      modeSeed: Math.random() * 1000,
      seed2: Math.random() * 1000
    };

    bossHud.classList.remove("hidden");
    audio.stopBgm();
    audio.playBgm("boss");

    if (power >= 100) {
      const base = (enemyRage === 10 ? 12 : 6);
      spawnWave(base);
      if (enemyRage === 10) spawnWave(6);
    }

    updateHud();
  }

  function checkBossSpawn() {
    if (boss) return;
    if (score > bossNextScore) {
      if (power >= 100) bossNextScore = bossNextScore + 20000;
      else bossNextScore = bossNextScore * 2;
      spawnBoss();
    }
  }

  // ===== Player =====
  function respawnPlayerFull() {
    player = {
      x: W * 0.5,
      y: H * 0.84,
      hp: 120,
      maxHp: 120,
      invuln: 0.6,
      alive: true,

      cdBasic: 0,
      cdHoming: 0,
      cdSpiral: 0,
      cdClone: 0,
      cdBomb: 0,
    };

    beam = {
      active: false,
      w: 12,
      tickAcc: 0,
      dmg: 1,
      humAcc: 0
    };
  }

  // ===== RAGE (20s) =====
  function handlePower100Timer(dt) {
    if (power >= 100) {
      if (power100ReachedAt == null) power100ReachedAt = performance.now();

      const elapsed = (performance.now() - power100ReachedAt) / 1000;
      if (elapsed >= 20 && enemyRage !== 10) {
        enemyRage = 10;
        enemyRageCount = 10;

        spawnRing(W * 0.5, H * 0.5, "rgba(140,0,255,.35)", 820, 7);
        spawnBurst(W * 0.5, H * 0.5, 220, "rgba(140,0,255,.75)", 1.4);
        spawnBurst(W * 0.5, H * 0.5, 160, "rgba(255,0,80,.65)", 1.2);
        shake(0.6, 22);
      }
    }
  }

  function rageCountdownSec() {
    if (power < 100) return null;
    if (power100ReachedAt == null) return 20;
    const elapsed = (performance.now() - power100ReachedAt) / 1000;
    return Math.max(0, 20 - elapsed);
  }

  // ===== Power specs =====
  function basicForwardSpec() {
    const p = clamp(power, 1, 10);
    const t = (p - 1) / 9;
    const count = 1 + Math.floor(t * 9);
    const spread = 0.03 + t * 0.65;
    return { count, spread };
  }
  function laserSpec() {
    if (power < 11) return { enabled:false };
    const t = clamp((power - 11) / 9, 0, 1);
    const w = 10 + t * 22;
    const dmg = 1 + Math.floor(t * 2);
    const tick = clamp(0.08 - t * 0.03, 0.04, 0.08);
    return { enabled:true, w, dmg, tick };
  }
  function homingSpec() {
    if (power < 21) return { enabled:false, perSide:0 };
    const t = clamp((power - 21) / 19, 0, 1);
    const perSide = 1 + Math.floor(t * 4);
    return { enabled:true, perSide };
  }
  function spiralSpec() {
    if (power < 41) return { enabled:false, count:0, rot:0 };
    const t = clamp((power - 41) / 19, 0, 1);
    const count = 2 + Math.floor(t * 10);
    const rot = 2.4 + t * 4.6;
    return { enabled:true, count, rot };
  }
  function clonesSpec() {
    if (power < 60) return { enabled:false, alpha:0 };
    const t = clamp((power - 60) / 20, 0, 1);
    return { enabled:true, alpha: t };
  }
  function bombSpec() {
    if (power < 80) return { enabled:false };
    const t = clamp((power - 80) / 20, 0, 1);
    const radius = 90 + t * 70;
    return { enabled:true, radius };
  }

  function nearestTarget(x, y) {
    let best = null;
    let bestD = Infinity;
    if (boss) {
      const d = dist2(x, y, boss.x, boss.y);
      if (d < bestD) { bestD = d; best = { kind:"boss", ref: boss }; }
    }
    for (const e of enemies) {
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) { bestD = d; best = { kind:"enemy", ref: e }; }
    }
    return best;
  }

  // ===== Super shot =====
  function fireSuperShot() {
    if (superShots <= 0) return;
    superShots = clamp(superShots - 1, 0, 999);

    shake(0.55, 20);
    spawnRing(W * 0.5, H * 0.55, "rgba(255,209,102,.65)", 520, 6);
    spawnRing(W * 0.5, H * 0.55, "rgba(255,77,109,.45)", 720, 5);
    spawnBurst(W * 0.5, H * 0.55, 160, "rgba(255,209,102,.95)", 1.6);
    spawnBurst(W * 0.5, H * 0.55, 140, "rgba(124,243,255,.85)", 1.2);
    spawnBurst(W * 0.5, H * 0.55, 120, "rgba(255,77,109,.85)", 1.0);

    audio.sfx.super();

    if (enemies.length > 0) {
      crashKills += enemies.length;

      for (const e of enemies) {
        score += e.pts;
        if (e.type === 100) kill100++;
        else if (e.type === 300) kill300++;
        else kill500++;
        spawnBurst(e.x, e.y, 22, enemyColorGlow(e.type), 1.1);
        spawnRing(e.x, e.y, "rgba(223,246,255,.25)", 160);
      }
      enemies.length = 0;
      handleKillMilestones();
      checkBossSpawn();
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      if (enemyBullets[i].source !== "boss") enemyBullets.splice(i, 1);
    }

    updateHud();
  }

  function triggerSuperFromUI() {
    if (!running || paused) return;
    if (audio) audio.ac.resume().catch(() => {});
    fireSuperShot();
  }

  superBtn.addEventListener("click", (e) => { e.preventDefault(); triggerSuperFromUI(); }, { passive: false });
  superBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); triggerSuperFromUI(); }, { passive: false });

  // ===== Bullet clash =====
  function bulletClashCheck() {
    const maxChecks = 18000;
    let checks = 0;

    for (let i = bullets.length - 1; i >= 0; i--) {
      const pb = bullets[i];
      for (let j = enemyBullets.length - 1; j >= 0; j--) {
        if (++checks > maxChecks) return;

        const eb = enemyBullets[j];
        const rr = pb.r + eb.r;

        if (dist2(pb.x, pb.y, eb.x, eb.y) < rr * rr) {
          bullets.splice(i, 1);
          enemyBullets.splice(j, 1);

          clashStreak = clamp(clashStreak + 1, 0, 60);
          clashDecay = 0.65;

          const mx = (pb.x + eb.x) * 0.5;
          const my = (pb.y + eb.y) * 0.5;
          spawnClashFx(mx, my);
          break;
        }
      }
    }
  }

  function beamClashCheck(beamRect) {
    for (let j = enemyBullets.length - 1; j >= 0; j--) {
      const eb = enemyBullets[j];
      if (eb.x >= beamRect.x0 - eb.r && eb.x <= beamRect.x1 + eb.r &&
          eb.y >= beamRect.y0 - eb.r && eb.y <= beamRect.y1 + eb.r) {

        enemyBullets.splice(j, 1);

        clashStreak = clamp(clashStreak + 1, 0, 60);
        clashDecay = 0.65;

        spawnClashFx(eb.x, eb.y);
      }
    }
  }

  function clearEntities() {
    bullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0;
    particles.length = 0;
    items.length = 0;
    boss = null;
    bossHud.classList.add("hidden");
  }

  function resetCoreState({ keepAudio = true } = {}) {
    clearEntities();

    score = 0;
    power = 1;
    superShots = 3;
    postBossDifficulty = 0;

    kill100 = 0; kill300 = 0; kill500 = 0;
    crashKills = 0;

    nextHealAt100 = 10;
    nextSuperAt300 = 5;
    nextSuperAt100 = 30;
    nextPowerAt500 = 1;
    nextPowerAt100 = 50;

    bossNextScore = 10000;
    bossLevel = 1;

    enemySpawnTimer = 0;
    enemySpawnInterval = 0.62;

    shakeTime = 0;
    shakeAmp = 0;

    clashStreak = 0;
    clashDecay = 0;

    power100ReachedAt = null;
    enemyRage = 1;
    enemyRageCount = 1;

    spiralAngle = 0;

    activePads.clear();
    recomputeDpadVec();

    respawnPlayerFull();

    if (!keepAudio && audio) audio.stopBgm();
    updateHud();
  }

  // ===== HUD =====
  function updateHud() {
    scoreText.textContent = String(score);
    powerText.textContent = String(power);
    superText.textContent = String(superShots);
    crashText.textContent = String(crashKills);

    const hpPct = clamp(player.hp / player.maxHp, 0, 1);
    hpBar.style.width = `${hpPct * 100}%`;
    hpBar.style.background = (hpPct < 0.3)
      ? "linear-gradient(90deg, #ff4d6d, #ffd166)"
      : "linear-gradient(90deg, #34ffb3, #7cf3ff)";
    hpText.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;

    if (boss) {
      bossHud.classList.remove("hidden");
      const bp = clamp(boss.hp / boss.maxHp, 0, 1);
      bossBar.style.width = `${bp * 100}%`;
      bossText.textContent = `Lv.${boss.level}  ${boss.hp}/${boss.maxHp}`;
    } else {
      bossHud.classList.add("hidden");
    }

    if (enemyRage === 10) {
      rageText.textContent = "ON";
    } else {
      const left = rageCountdownSec();
      if (left == null) rageText.textContent = "-";
      else rageText.textContent = `${Math.ceil(left)}s`;
    }
  }

  // ===== Start =====
  function startGame() {
    running = true;
    paused = false;
    gameOver = false;
    continueSnapshot = null;

    startOverlay.classList.add("hidden");
    continueOverlay.classList.add("hidden");
    finalOverlay.classList.add("hidden");

    if (!audio) audio = makeAudio();
    audio.ac.resume().catch(() => {});

    resetCoreState({ keepAudio: true });

    audio.stopBgm();
    audio.playBgm("normal");

    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  // ===== Game over / Continue =====
  function triggerGameOver() {
    if (gameOver) return;
    gameOver = true;
    paused = true;

    continueSnapshot = {
      power,
      superShots,
      bossLevel,
      bossNextScore,
      postBossDifficulty,
      enemyRage,
      enemyRageCount,
      power100ReachedAt,
      kill100, kill300, kill500,
      nextHealAt100, nextSuperAt300, nextSuperAt100, nextPowerAt500, nextPowerAt100
    };

    audio.stopBgm();
    audio.sfx.playerBoom();

    spawnBurst(player.x, player.y, 120, "rgba(255,77,109,.95)", 1.3);
    spawnBurst(player.x, player.y, 90, "rgba(255,209,102,.85)", 1.1);
    spawnRing(player.x, player.y, "rgba(124,243,255,.55)", 520, 6);
    shake(0.7, 24);

    continueLeft = 10;
    countdownEl.textContent = String(continueLeft);
    continueOverlay.classList.remove("hidden");

    if (continueTimer) clearInterval(continueTimer);
    continueTimer = setInterval(() => {
      continueLeft -= 1;
      countdownEl.textContent = String(continueLeft);
      if (continueLeft <= 0) {
        clearInterval(continueTimer);
        continueTimer = null;
        showFinal();
      }
    }, 1000);
  }

  function doContinue() {
    if (!gameOver) return;
    if (continueTimer) clearInterval(continueTimer);
    continueTimer = null;

    const snap = continueSnapshot;

    clearEntities();
    respawnPlayerFull();

    score = 0;

    if (snap) {
      power = snap.power;
      superShots = snap.superShots;

      bossLevel = snap.bossLevel;
      bossNextScore = snap.bossNextScore;
      postBossDifficulty = snap.postBossDifficulty;

      enemyRage = snap.enemyRage ?? 1;
      enemyRageCount = snap.enemyRageCount ?? 1;
      power100ReachedAt = snap.power100ReachedAt ?? null;

      kill100 = snap.kill100; kill300 = snap.kill300; kill500 = snap.kill500;
      nextHealAt100 = snap.nextHealAt100;
      nextSuperAt300 = snap.nextSuperAt300;
      nextSuperAt100 = snap.nextSuperAt100;
      nextPowerAt500 = snap.nextPowerAt500;
      nextPowerAt100 = snap.nextPowerAt100;

      crashKills = 0;
    }

    activePads.clear();
    recomputeDpadVec();

    gameOver = false;
    paused = false;

    continueOverlay.classList.add("hidden");

    audio.stopBgm();
    audio.playBgm("normal");

    updateHud();

    lastTs = performance.now();
    requestAnimationFrame(loop);
  }

  function showFinal() {
    continueOverlay.classList.add("hidden");
    const USAF_RANKS = [
      "Airman Basic (E-1)","Airman (E-2)","Airman First Class (E-3)","Senior Airman (E-4)",
      "Staff Sergeant (E-5)","Technical Sergeant (E-6)","Master Sergeant (E-7)","Senior Master Sergeant (E-8)",
      "Chief Master Sergeant (E-9)","Second Lieutenant (O-1)","First Lieutenant (O-2)","Captain (O-3)",
      "Major (O-4)","Lieutenant Colonel (O-5)","Colonel (O-6)","Brigadier General (O-7)",
      "Major General (O-8)","Lieutenant General (O-9)","General (O-10)"
    ];
    const rankIdx = Math.max(1, Math.floor(score / 30000));
    const label = USAF_RANKS[Math.min(rankIdx - 1, USAF_RANKS.length - 1)];
    finalScoreEl.textContent = `SCORE: ${score}`;
    finalRankEl.textContent = `RANK: ${rankIdx} → ${label}`;
    finalOverlay.classList.remove("hidden");
  }

  function restartToStart() {
    finalOverlay.classList.add("hidden");
    startOverlay.classList.remove("hidden");
  }

  // ===== Player firing =====
  function firePlayer(dt) {
    player.cdBasic -= dt;
    if (player.cdBasic <= 0) {
      const spec = basicForwardSpec();
      const pNorm = clamp((power - 1) / 99, 0, 1);
      player.cdBasic = clamp(0.095 * (1 - pNorm * 0.55), 0.030, 0.095);

      const sp = 900 + power * 4;
      const y0 = player.y - 28;

      const emit = (x, y, angle) => {
        bullets.push({
          type: "basic",
          x, y,
          vx: Math.cos(angle) * sp,
          vy: Math.sin(angle) * sp,
          r: 4.2 + Math.min(6, power * 0.05),
          dmg: 1,
          t: 0,
          life: 1.8
        });
      };

      if (spec.count === 1) {
        emit(player.x, y0, -Math.PI/2);
      } else {
        for (let i = 0; i < spec.count; i++) {
          const u = (i/(spec.count-1))-0.5;
          const a = (-Math.PI/2) + u * spec.spread;
          emit(player.x + u * 16, y0, a);
        }
      }

      audio.sfx.shot();
    }

    const ls = laserSpec();
    if (ls.enabled) {
      if (!beam.active) audio.sfx.laserStart();
      beam.active = true;
      beam.w = ls.w;
      beam.dmg = ls.dmg;
    } else {
      beam.active = false;
    }

    const hs = homingSpec();
    if (hs.enabled) {
      player.cdHoming -= dt;
      if (player.cdHoming <= 0) {
        const t = clamp((power - 21) / 79, 0, 1);
        player.cdHoming = clamp(0.22 - t * 0.10, 0.10, 0.22);

        for (const side of [-1, 1]) {
          for (let i = 0; i < hs.perSide; i++) {
            bullets.push({
              type: "homing",
              x: player.x + side * (22 + i * 6),
              y: player.y - 12,
              vx: side * 60,
              vy: -520,
              r: 5.4,
              dmg: 1,
              t: 0,
              life: 3.0,
              turn: 6.0 + Math.min(5, (power - 21) / 6),
              spd: 620 + (power - 21) * 4
            });
          }
        }
        audio.sfx.homing();
      }
    }

    const ss = spiralSpec();
    if (ss.enabled) {
      player.cdSpiral -= dt;
      if (player.cdSpiral <= 0) {
        const t = clamp((power - 41) / 19, 0, 1);
        player.cdSpiral = clamp(0.16 - t * 0.07, 0.07, 0.16);
        spiralAngle += ss.rot * dt;

        const spd = 520 + t * 260;
        const n = ss.count;

        for (let k = 0; k < n; k++) {
          const a = spiralAngle + k * (Math.PI * 2 / n);
          bullets.push({
            type: "spiral",
            x: player.x,
            y: player.y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            r: 4.2,
            dmg: 1,
            t: 0,
            life: 2.2
          });
        }

        audio.sfx.spiral();
      }
    }

    const cs = clonesSpec();
    if (cs.enabled) {
      player.cdClone -= dt;
      if (player.cdClone <= 0) {
        const t = clamp((power - 60) / 20, 0, 1);
        player.cdClone = clamp(0.14 - t * 0.05, 0.07, 0.14);

        const spd = 780 + t * 220;
        const r = 4.6 + t * 1.6;

        const emit = (x, y, vx, vy) => {
          bullets.push({
            type: "basic",
            x, y,
            vx, vy,
            r,
            dmg: 1,
            t: 0,
            life: 1.8
          });
        };

        const ox = 54, oy = 54;
        emit(player.x, player.y + oy, 0, spd);
        emit(player.x - ox, player.y, -spd, 0);
        emit(player.x + ox, player.y, spd, 0);
      }
    }

    const bs = bombSpec();
    if (bs.enabled) {
      player.cdBomb -= dt;
      if (player.cdBomb <= 0) {
        const t = clamp((power - 80) / 20, 0, 1);
        player.cdBomb = clamp(0.45 - t * 0.18, 0.22, 0.45);

        bullets.push({
          type: "bomb",
          x: player.x,
          y: player.y - 30,
          vx: 0,
          vy: -520 - t * 140,
          r: 10 + t * 6,
          dmg: 1,
          t: 0,
          life: 2.2,
          radius: bs.radius
        });

        audio.sfx.bombLaunch();
      }
    }
  }

  // ===== Main Update =====
  function update(dt) {
    if (!running || paused) return;

    for (const s of stars) {
      s.y += s.sp * dt * (0.65 + s.z * 1.1);
      s.tw += dt * (0.8 + s.z);
      if (s.y > H + 6) {
        s.y = -6;
        s.x = Math.random() * W;
        s.z = Math.random();
        s.sp = rand(80, 320);
        s.tw = rand(0, Math.PI * 2);
      }
    }

    if (clashDecay > 0) {
      clashDecay -= dt;
      if (clashDecay <= 0) {
        clashStreak = Math.max(0, clashStreak - 2);
        if (clashStreak > 0) clashDecay = 0.35;
      }
    }

    handlePower100Timer(dt);

    const scoreFactor = Math.min(1.0, score / 50000);
    enemySpawnInterval = clamp(0.62 - scoreFactor * 0.22 - postBossDifficulty * 0.04, 0.20, 0.62);
    const intervalMult = (enemyRage === 10 ? 0.65 : 1.0);

    // Keyboard movement
    const kx =
      (keys.has("a") || keys.has("arrowleft") ? -1 : 0) +
      (keys.has("d") || keys.has("arrowright") ?  1 : 0);

    const ky =
      (keys.has("w") || keys.has("arrowup") ? -1 : 0) +
      (keys.has("s") || keys.has("arrowdown") ?  1 : 0);

    // Mobile D-pad movement (スマホ時はこれがメイン。スワイプ/ドラッグ移動は無効化)
    const ax = isTouchDevice ? dpadVec.x : kx;
    const ay = isTouchDevice ? dpadVec.y : ky;

    player.x += ax * 380 * dt;
    player.y += ay * 380 * dt;

    player.x = clamp(player.x, 34, W - 34);
    player.y = clamp(player.y, 90, H - 50);

    if (keys.has("p")) { keys.delete("p"); fireSuperShot(); }

    firePlayer(dt);

    const canSpawn = (!boss) || (power >= 100);
    if (canSpawn) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        enemySpawnTimer = enemySpawnInterval * intervalMult;
        const n = enemyRageCount;
        for (let i = 0; i < n; i++) spawnWeightedEnemy();
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.phase += dt * (1.2 + e.type / 500 * 0.8);

      const sway = Math.sin(e.phase) * (50 + e.type / 500 * 40);
      if (Math.abs(e.vy) >= Math.abs(e.vx)) {
        e.x += (e.vx * dt) + (sway * dt);
        e.y += e.vy * dt;
      } else {
        e.x += e.vx * dt;
        e.y += (e.vy * dt) + (sway * dt);
      }

      e.shootT -= dt;
      if (e.shootT <= 0) {
        const baseCd = clamp(1.25 - postBossDifficulty * 0.08, 0.32, 1.25);
        e.shootT = rand(baseCd * 0.55, baseCd * 1.05);

        const aim = Math.atan2(player.y - e.y, player.x - e.x);
        const n = (e.type === 100 ? 4 : e.type === 300 ? 7 : 10) + postBossDifficulty;
        const spread = (e.type === 100 ? 0.8 : e.type === 300 ? 1.2 : 1.55);
        const spd = 220 + e.type * 0.10 + postBossDifficulty * 12;

        const dmgBase = (e.type === 100 ? 7 : e.type === 300 ? 9 : 11) + Math.floor(postBossDifficulty * 0.6);
        const dmg = dmgBase * enemyRage;

        for (let k = 0; k < n; k++) {
          const t = (n === 1) ? 0 : (k / (n - 1) - 0.5);
          const a = aim + t * spread;
          enemyBullets.push({
            x: e.x,
            y: e.y,
            vx: Math.cos(a) * spd,
            vy: Math.sin(a) * spd,
            r: 4.2,
            dmg,
            col: (e.type === 500 ? "rgba(255,77,109,.92)" : e.type === 300 ? "rgba(255,209,102,.90)" : "rgba(124,243,255,.85)"),
            t: 0,
            source: "enemy"
          });
        }
      }

      if (e.x < -140 || e.x > W + 140 || e.y < -160 || e.y > H + 160) enemies.splice(i, 1);
    }

    if (boss) {
      boss.t += dt;

      boss.x = W * 0.5 + Math.sin(boss.t * 0.85) * (190 + boss.level * 6);

      const t = boss.t;
      const wave = Math.sin(t * 0.28 + boss.modeSeed) * 120;
      const lungeRaw = Math.sin(t * 0.95 + boss.seed2);
      const lunge = Math.pow(Math.max(0, lungeRaw), 2);
      const approachBase = 130 + lunge * 280;
      const towardPlayer = (player.y - (90 + wave + approachBase)) * (0.14 * lunge);

      let y = 90 + wave + approachBase + towardPlayer;
      y = clamp(y, 80, 460);
      boss.y = y;

      boss.shootT -= dt;
      if (boss.shootT <= 0) {
        const base = clamp(0.50 - postBossDifficulty * 0.03 - (boss.level-1)*0.02, 0.16, 0.50);
        boss.shootT = base;

        const aim = Math.atan2(player.y - boss.y, player.x - boss.x);
        const lvl = boss.level;
        const mult = boss.atkMult;
        const phase = Math.floor((boss.t + boss.modeSeed) / 4) % 3;

        if (phase === 0) {
          const n = 18 + lvl * 2 + postBossDifficulty * 2;
          const spd = (220 + lvl * 14 + postBossDifficulty * 10) * mult;
          const dmg = Math.floor((10 + lvl * 2) * mult);

          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + boss.t * (0.6 + lvl * 0.08);
            enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 4.8, dmg,
              col: (lvl <= 1 ? "rgba(255,209,102,.95)" : "rgba(140,0,255,.85)"), t: 0, source: "boss" });
          }
        } else if (phase === 1) {
          const n = 16 + lvl * 2 + postBossDifficulty * 2;
          const spread = 1.9;
          const spd = (260 + lvl * 16 + postBossDifficulty * 12) * mult;
          const dmg = Math.floor((11 + lvl * 2) * mult);

          for (let k = 0; k < n; k++) {
            const tt = (n === 1) ? 0 : (k / (n - 1) - 0.5);
            const a = aim + tt * spread + Math.sin(boss.t * 1.2) * 0.08 * lvl;
            enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 4.8, dmg,
              col: (lvl <= 1 ? "rgba(255,77,109,.92)" : "rgba(255,0,80,.82)"), t: 0, source: "boss" });
          }
        } else {
          const streams = 3 + Math.floor(lvl / 2);
          const per = 5 + Math.floor(lvl / 2);
          const spd = (240 + lvl * 14 + postBossDifficulty * 10) * mult;
          const dmg = Math.floor((10 + lvl * 2) * mult);

          for (let s = 0; s < streams; s++) {
            for (let k = 0; k < per; k++) {
              const a = boss.t * (2.4 + lvl * 0.25) + k * 0.55 + s * (Math.PI * 2 / streams);
              enemyBullets.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: 4.6, dmg,
                col: (lvl <= 1 ? "rgba(124,243,255,.9)" : "rgba(20,255,170,.75)"), t: 0, source: "boss" });
            }
          }
        }
      }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.type === "homing") {
        const target = nearestTarget(b.x, b.y);
        if (target) {
          const tx = target.ref.x, ty = target.ref.y;
          const ang = Math.atan2(ty - b.y, tx - b.x);
          const cur = Math.atan2(b.vy, b.vx);
          let da = ang - cur;
          while (da > Math.PI) da -= Math.PI*2;
          while (da < -Math.PI) da += Math.PI*2;

          const turn = b.turn * dt;
          const na = cur + clamp(da, -turn, turn);
          const spd = b.spd;
          b.vx = Math.cos(na) * spd;
          b.vy = Math.sin(na) * spd;
        }
      }

      if (b.life <= 0 || b.y < -140 || b.x < -160 || b.x > W + 160 || b.y > H + 160) {
        bullets.splice(i, 1);
      }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -160 || b.y > H + 160 || b.x < -160 || b.x > W + 160) enemyBullets.splice(i, 1);
    }

    const ls = laserSpec();
    if (beam.active && ls.enabled) {
      const x0 = player.x - beam.w * 0.5;
      const x1 = player.x + beam.w * 0.5;
      const y0 = 0;
      const y1 = player.y - 34;
      const rect = { x0, x1, y0, y1 };

      beam.humAcc += dt;
      if (beam.humAcc >= 0.12) { beam.humAcc = 0; audio.sfx.laserHum(); }

      beamClashCheck(rect);

      beam.tickAcc += dt;
      if (beam.tickAcc >= ls.tick) {
        beam.tickAcc = 0;

        for (let i = enemies.length - 1; i >= 0; i--) {
          const e = enemies[i];
          if (e.x + e.r >= x0 && e.x - e.r <= x1 && e.y + e.r >= y0 && e.y - e.r <= y1) {
            e.hp -= beam.dmg;
            audio.sfx.enemyHit();
            spawnBurst(e.x, e.y, 5, "rgba(223,246,255,.75)", 0.9);

            if (e.hp <= 0) {
              audio.sfx.enemyBoom();
              spawnBurst(e.x, e.y, 30, enemyColorGlow(e.type), 1.1);
              spawnRing(e.x, e.y, "rgba(223,246,255,.25)", 190);
              shake(0.06, 5);

              score += e.pts;
              crashKills += 1;

              if (e.type === 100) kill100++;
              else if (e.type === 300) kill300++;
              else kill500++;

              enemies.splice(i, 1);
              handleKillMilestones();
            }
          }
        }

        if (boss) {
          if (boss.x + boss.r >= x0 && boss.x - boss.r <= x1 && boss.y + boss.r >= y0 && boss.y - boss.r <= y1) {
            boss.hp -= beam.dmg;
            audio.sfx.enemyHit();
            spawnBurst(boss.x + rand(-18, 18), boss.y + rand(-14, 14), 5, "rgba(255,209,102,.65)", 0.9);
            shake(0.03, 3);

            if (boss.hp <= 0) {
              audio.sfx.enemyBoom();
              spawnBurst(boss.x, boss.y, 220, "rgba(255,77,109,.95)", 1.8);
              spawnBurst(boss.x, boss.y, 180, "rgba(255,209,102,.90)", 1.5);
              spawnBurst(boss.x, boss.y, 160, "rgba(124,243,255,.85)", 1.2);
              spawnRing(boss.x, boss.y, "rgba(140,0,255,.35)", 820, 7);
              shake(0.8, 26);

              crashKills += 1;

              score += 5000;
              player.hp = player.maxHp;
              power = clamp(power + 1, 1, 100);
              superShots = clamp(superShots + 10, 0, 999);

              boss = null;
              bossHud.classList.add("hidden");

              bossLevel += 1;
              postBossDifficulty += 1;

              audio.stopBgm();
              audio.playBgm("normal");
            }
          }
        }

        checkBossSpawn();
        updateHud();
      }
    }

    bulletClashCheck();

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      it.y += it.vy * dt;

      if (dist2(it.x, it.y, player.x, player.y) < (it.r + PLAYER_HIT_R) ** 2) {
        if (it.kind === "heal") player.hp = player.maxHp;
        else if (it.kind === "super") superShots = clamp(superShots + 1, 0, 999);
        else if (it.kind === "power") {
          const prev = power;
          power = clamp(power + 1, 1, 100);

          if (power === 100 && prev < 100) {
            spawnRing(player.x, player.y, "rgba(255,209,102,.55)", 640, 6);
            spawnBurst(player.x, player.y, 140, "rgba(255,209,102,.95)", 1.25);
            spawnBurst(player.x, player.y, 100, "rgba(255,183,3,.85)", 1.1);
            shake(0.35, 12);

            bossNextScore = Math.max(bossNextScore, score + 20000);
          }
        }

        audio.sfx.item();
        spawnBurst(it.x, it.y, 22, "rgba(52,255,179,.85)", 1.0);
        items.splice(i, 1);

        updateHud();
        continue;
      }

      if (it.y > H + 80) items.splice(i, 1);
    }

    // bullets vs enemies/boss (non-laser)
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];

      if (boss) {
        const rr = b.r + boss.r;
        if (dist2(b.x, b.y, boss.x, boss.y) < rr * rr) {
          if (b.type === "bomb") {
            const radius = b.radius ?? 120;
            bullets.splice(bi, 1);
            spawnBombExplosion(b.x, b.y, radius, false);
          } else {
            boss.hp -= 1;
            audio.sfx.enemyHit();
            spawnBurst(boss.x + rand(-24, 24), boss.y + rand(-16, 16), 6, "rgba(255,209,102,.75)", 0.9);
            shake(0.05, 3);
            bullets.splice(bi, 1);
          }

          if (boss.hp <= 0) {
            audio.sfx.enemyBoom();
            spawnBurst(boss.x, boss.y, 220, "rgba(255,77,109,.95)", 1.8);
            spawnBurst(boss.x, boss.y, 180, "rgba(255,209,102,.90)", 1.5);
            spawnBurst(boss.x, boss.y, 160, "rgba(124,243,255,.85)", 1.2);
            spawnRing(boss.x, boss.y, "rgba(140,0,255,.35)", 820, 7);
            shake(0.8, 26);

            crashKills += 1;

            score += 5000;
            player.hp = player.maxHp;
            power = clamp(power + 1, 1, 100);
            superShots = clamp(superShots + 10, 0, 999);

            boss = null;
            bossHud.classList.add("hidden");

            bossLevel += 1;
            postBossDifficulty += 1;

            audio.stopBgm();
            audio.playBgm("normal");

            handleKillMilestones();
            checkBossSpawn();
          }

          updateHud();
          continue;
        }
      }

      for (let ei = enemies.length - 1; ei >= 0; ei--) {
        const e = enemies[ei];
        const rr = b.r + e.r;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          if (b.type === "bomb") {
            const radius = b.radius ?? 120;
            bullets.splice(bi, 1);
            spawnBombExplosion(b.x, b.y, radius, true);
          } else {
            e.hp -= b.dmg;
            audio.sfx.enemyHit();
            spawnBurst(e.x, e.y, 7, enemyColorGlow(e.type), 0.95);
            bullets.splice(bi, 1);
          }

          if (e.hp <= 0) {
            audio.sfx.enemyBoom();
            spawnBurst(e.x, e.y, 30, enemyColorGlow(e.type), 1.1);
            spawnRing(e.x, e.y, "rgba(223,246,255,.25)", 190);
            shake(0.07, 5);

            score += e.pts;
            crashKills += 1;

            if (e.type === 100) kill100++;
            else if (e.type === 300) kill300++;
            else kill500++;

            enemies.splice(ei, 1);
            handleKillMilestones();
            checkBossSpawn();
          }
          updateHud();
          break;
        }
      }
    }

    // enemy bullets vs player
    if (player.invuln > 0) player.invuln -= dt;

    if (player.invuln <= 0) {
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        const rr = b.r + PLAYER_HIT_R;
        if (dist2(b.x, b.y, player.x, player.y) < rr * rr) {
          enemyBullets.splice(i, 1);

          player.hp -= b.dmg;
          player.invuln = 0.12;
          shake(0.06, 4);
          spawnBurst(player.x, player.y, 14, "rgba(255,77,109,.85)", 1.0);

          if (player.hp <= 0) {
            player.hp = 0;
            updateHud();
            triggerGameOver();
            break;
          }
          updateHud();
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;

      if (p.ring) {
        if (p.t > p.life) particles.splice(i, 1);
        continue;
      }
      if (p.shard) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= Math.pow(0.10, dt);
        p.vy *= Math.pow(0.10, dt);
        p.rot += p.vr * dt;
        if (p.t > p.life) particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.08, dt);
      p.vy *= Math.pow(0.08, dt);
      if (p.t > p.life) particles.splice(i, 1);
    }

    if (shakeTime > 0) {
      shakeTime -= dt;
      if (shakeTime <= 0) { shakeTime = 0; shakeAmp = 0; }
    }

    checkBossSpawn();
    updateHud();
  }

  // ===== Render =====
  function draw() {
    const rect = canvas.getBoundingClientRect();
    const sx = (rect.width * dpr) / W;
    const sy = (rect.height * dpr) / H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    ctx.clearRect(0, 0, W, H);

    let cx = 0, cy = 0;
    if (shakeTime > 0) {
      const k = (shakeTime / 0.9);
      cx = rand(-shakeAmp, shakeAmp) * k;
      cy = rand(-shakeAmp, shakeAmp) * k;
    }

    ctx.save();
    ctx.translate(cx, cy);

    const g = ctx.createRadialGradient(W * 0.5, H * 0.25, 60, W * 0.5, H * 0.25, 720);
    g.addColorStop(0, "rgba(124,243,255,0.08)");
    g.addColorStop(0.35, "rgba(150,100,255,0.07)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (const s of stars) {
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(s.tw));
      const r = 0.7 + s.z * 2.0;
      ctx.fillStyle = `rgba(223,246,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "rgba(124,243,255,1)";
    const t = performance.now() * 0.07;
    for (let i = 0; i < 14; i++) {
      const x = (i * 42 + (t % 42));
      ctx.fillRect(x, 0, 1, H);
    }
    ctx.globalAlpha = 1;

    for (const e of enemies) drawEnemy(e);
    if (boss) drawBoss(boss);

    if (beam && beam.active && power >= 11) drawLaserBeam();

    for (const b of bullets) drawPlayerBullet(b);
    for (const b of enemyBullets) drawEnemyBullet(b);

    for (const it of items) drawItem(it);

    if (player && player.alive) drawPlayerWithClones(player);

    for (const p of particles) drawParticle(p);

    ctx.restore();
  }

  // ===== Draw helpers =====
  function drawPlayerWithClones(p) {
    const cs = clonesSpec();
    if (cs.enabled) {
      const a = cs.alpha;
      const ox = 54, oy = 54;

      drawFighter(p.x, p.y + oy, 0.78 * a, true);
      drawFighter(p.x - ox, p.y, 0.78 * a, true);
      drawFighter(p.x + ox, p.y, 0.78 * a, true);
    }
    drawFighter(p.x, p.y, 1.0, false);
  }

  function drawFighter(x, y, alpha, isClone) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    if (power >= 100) {
      const tt = performance.now() * 0.006;
      const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, isClone ? 80 : 120);
      aura.addColorStop(0, "rgba(255,209,102,.32)");
      aura.addColorStop(0.35, "rgba(255,183,3,.20)");
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, isClone ? 80 : 120, 0, Math.PI * 2);
      ctx.fill();

      if (!isClone) {
        ctx.globalAlpha *= 0.75;
        ctx.fillStyle = "rgba(255,183,3,.70)";
        for (let i = 0; i < 8; i++) {
          const a = i * (Math.PI * 2 / 8) + tt;
          const r0 = 26;
          const r1 = 70 + Math.sin(tt * 2 + i) * 10;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
          ctx.lineTo(Math.cos(a + 0.25) * r1, Math.sin(a + 0.25) * r1);
          ctx.lineTo(Math.cos(a - 0.25) * r1, Math.sin(a - 0.25) * r1);
          ctx.closePath();
          ctx.fill();
        }
        ctx.globalAlpha /= 0.75;
      }
    }

    ctx.globalAlpha *= 0.9;
    const eg = ctx.createRadialGradient(0, 28, 2, 0, 28, 34);
    eg.addColorStop(0, "rgba(52,255,179,.85)");
    eg.addColorStop(1, "rgba(52,255,179,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha *= 0.4;
    ctx.fillStyle = "rgba(124,243,255,.9)";
    ctx.beginPath();
    ctx.roundRect(-6, 22, 12, 28, 10);
    ctx.fill();
    ctx.globalAlpha /= 0.4;

    ctx.globalAlpha /= 0.9;
    ctx.fillStyle = "rgba(223,246,255,.95)";
    if (isClone) ctx.fillStyle = "rgba(223,246,255,.86)";
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.lineTo(18, -6);
    ctx.lineTo(30, 18);
    ctx.lineTo(10, 12);
    ctx.lineTo(6, 32);
    ctx.lineTo(0, 22);
    ctx.lineTo(-6, 32);
    ctx.lineTo(-10, 12);
    ctx.lineTo(-30, 18);
    ctx.lineTo(-18, -6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawLaserBeam() {
    const ls = laserSpec();
    if (!ls.enabled) return;

    const x0 = player.x - beam.w * 0.5;
    const x1 = player.x + beam.w * 0.5;
    const y0 = 0;
    const y1 = player.y - 34;

    const flick = 0.85 + 0.15 * Math.sin(performance.now() * 0.02);
    const core = ctx.createLinearGradient(0, y1, 0, y0);
    core.addColorStop(0, `rgba(223,246,255,${0.85*flick})`);
    core.addColorStop(1, `rgba(124,243,255,${0.65*flick})`);

    const halo = ctx.createLinearGradient(0, y1, 0, y0);
    halo.addColorStop(0, `rgba(52,255,179,${0.22*flick})`);
    halo.addColorStop(1, `rgba(124,243,255,${0.18*flick})`);

    ctx.save();
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.roundRect(x0 - beam.w * 0.85, y0, (x1 - x0) + beam.w * 1.7, (y1 - y0), beam.w);
    ctx.fill();

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.roundRect(x0, y0, (x1 - x0), (y1 - y0), beam.w);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(e) {
    if (e.type === 100) return drawUFO(e);
    if (e.type === 300) return drawAlien(e);
    return drawDevil(e);
  }

  // UFO（薄い円なし）
  function drawUFO(e){
    ctx.save(); ctx.translate(e.x,e.y);
    ctx.fillStyle="rgba(223,246,255,.92)";
    ctx.beginPath(); ctx.ellipse(0,6,30,12,0,0,Math.PI*2); ctx.fill();

    ctx.fillStyle="rgba(124,243,255,.85)";
    ctx.beginPath(); ctx.ellipse(0,0,14,10,0,Math.PI,0,true); ctx.fill();

    ctx.fillStyle="rgba(255,209,102,.92)";
    for(let i=-2;i<=2;i++){ ctx.beginPath(); ctx.arc(i*10,10,2.2,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
  }

  // Alien（薄い円なし）
  function drawAlien(e){
    ctx.save(); ctx.translate(e.x,e.y);

    ctx.fillStyle="rgba(52,255,179,.88)";
    ctx.beginPath(); ctx.ellipse(0,0,18,24,0,0,Math.PI*2); ctx.fill();

    ctx.fillStyle="rgba(10,18,35,.92)";
    ctx.beginPath(); ctx.ellipse(-6,-4,6,9,-0.2,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(6,-4,6,9,0.2,0,Math.PI*2); ctx.fill();

    ctx.strokeStyle="rgba(10,18,35,.75)";
    ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,10,6,0,Math.PI); ctx.stroke();

    ctx.restore();
  }

  function drawDevil(e){
    ctx.save(); ctx.translate(e.x,e.y);

    ctx.globalAlpha = 0.85;
    const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, 86);
    aura.addColorStop(0, "rgba(255,77,109,.22)");
    aura.addColorStop(0.45, "rgba(140,0,255,.18)");
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,86,0,Math.PI*2); ctx.fill();

    ctx.globalAlpha = 1;
    const body = ctx.createRadialGradient(-8, -10, 6, 0, 0, 44);
    body.addColorStop(0, "rgba(255,77,109,.95)");
    body.addColorStop(0.55, "rgba(140,0,255,.88)");
    body.addColorStop(1, "rgba(20,0,40,.92)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 6, 30, 26, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,209,102,.92)";
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.lineTo(-30, -38);
    ctx.lineTo(-6, -28);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, -16);
    ctx.lineTo(30, -38);
    ctx.lineTo(6, -28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,77,109,.75)";
    ctx.beginPath();
    ctx.moveTo(-28, 8);
    ctx.lineTo(-58, -6);
    ctx.lineTo(-48, 18);
    ctx.lineTo(-62, 30);
    ctx.lineTo(-36, 26);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(28, 8);
    ctx.lineTo(58, -6);
    ctx.lineTo(48, 18);
    ctx.lineTo(62, 30);
    ctx.lineTo(36, 26);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(223,246,255,.95)";
    ctx.beginPath(); ctx.ellipse(-10, 2, 5, 7, -0.25, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, 2, 5, 7, 0.25, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = "rgba(10,18,35,.95)";
    ctx.beginPath(); ctx.arc(-10, 3, 2.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, 3, 2.2, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = "rgba(255,209,102,.92)";
    ctx.beginPath(); ctx.moveTo(-6, 16); ctx.lineTo(-2, 10); ctx.lineTo(2, 16); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(6, 16); ctx.lineTo(2, 10); ctx.lineTo(-2, 16); ctx.closePath(); ctx.fill();

    ctx.restore();
  }

  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);

    const lvl = b.level;
    const core = ctx.createRadialGradient(-10, -10, 8, 0, 0, 140);
    if (lvl <= 1) {
      core.addColorStop(0, "rgba(255,209,102,.95)");
      core.addColorStop(0.6, "rgba(255,77,109,.75)");
      core.addColorStop(1, "rgba(40,0,60,.85)");
    } else {
      core.addColorStop(0, "rgba(255,0,80,.85)");
      core.addColorStop(0.45, "rgba(140,0,255,.82)");
      core.addColorStop(1, "rgba(10,0,20,.92)");
    }

    const near = clamp((b.y - 120) / 320, 0, 1);
    ctx.globalAlpha = 0.9;
    const aura = ctx.createRadialGradient(0, 0, 10, 0, 0, 220);
    aura.addColorStop(0, `rgba(255,77,109,${0.22 + near*0.12})`);
    aura.addColorStop(0.5, `rgba(140,0,255,${0.18 + near*0.10})`);
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(0,0,220,0,Math.PI*2); ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.roundRect(-90, -54, 180, 108, 26);
    ctx.fill();

    ctx.fillStyle = "rgba(255,209,102,.92)";
    ctx.beginPath();
    ctx.moveTo(-40, -56);
    ctx.lineTo(-72, -92);
    ctx.lineTo(-18, -74);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(40, -56);
    ctx.lineTo(72, -92);
    ctx.lineTo(18, -74);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(223,246,255,.92)";
    ctx.beginPath(); ctx.ellipse(-24, -6, 10, 16, -0.25, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(24, -6, 10, 16, 0.25, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = "rgba(10,18,35,.95)";
    ctx.beginPath(); ctx.arc(-24, -4, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(24, -4, 4, 0, Math.PI*2); ctx.fill();

    ctx.strokeStyle = "rgba(255,209,102,.65)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 26, 26, 0.12*Math.PI, 0.88*Math.PI); ctx.stroke();

    ctx.restore();
  }

  function drawPlayerBullet(b) {
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = "rgba(223,246,255,.95)";
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r, b.r * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemyBullet(b) {
    ctx.save(); ctx.translate(b.x, b.y);
    ctx.fillStyle = b.col || "rgba(124,243,255,.9)";
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawItem(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    const bob = Math.sin(it.t * 4) * 3;
    ctx.translate(0, bob);

    const glow = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
    glow.addColorStop(0, "rgba(223,246,255,.18)");
    glow.addColorStop(0.45, "rgba(124,243,255,.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0,0,46,0,Math.PI*2); ctx.fill();

    if (it.kind === "heal") {
      ctx.globalAlpha = 0.98;
      ctx.fillStyle = "rgba(255,77,109,.98)";
      heartPath(ctx, 0, 0, 20);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(223,246,255,.85)";
      ctx.stroke();
    } else if (it.kind === "super") {
      const pulse = 0.75 + 0.25 * Math.sin(it.t * 7);
      const bg = ctx.createRadialGradient(-6, -8, 4, 0, 0, 28);
      bg.addColorStop(0, `rgba(255,209,102,${0.98*pulse})`);
      bg.addColorStop(0.55, `rgba(255,77,109,${0.92*pulse})`);
      bg.addColorStop(1, `rgba(140,0,255,${0.82*pulse})`);

      ctx.globalAlpha = 1;
      ctx.strokeStyle = "rgba(223,246,255,.92)";
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.stroke();

      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(22, 0);
      ctx.lineTo(0, 22);
      ctx.lineTo(-22, 0);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.85;
      ctx.fillStyle = "rgba(223,246,255,.25)";
      ctx.beginPath(); ctx.arc(0,0,18,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = "rgba(10,18,35,.92)";
      ctx.beginPath();
      ctx.moveTo(-3, -14);
      ctx.lineTo(7, -14);
      ctx.lineTo(0, 0);
      ctx.lineTo(8, 0);
      ctx.lineTo(-6, 18);
      ctx.lineTo(-1, 4);
      ctx.lineTo(-10, 4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.98;
      ctx.fillStyle = "rgba(124,243,255,.98)";
      starPath(ctx, 0, 0, 9, 20, 5);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(223,246,255,.85)";
      ctx.stroke();
    }
    ctx.restore();
  }

  function heartPath(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y + s * 0.35);
    c.bezierCurveTo(x - s, y - s * 0.25, x - s * 0.5, y - s, x, y - s * 0.35);
    c.bezierCurveTo(x + s * 0.5, y - s, x + s, y - s * 0.25, x, y + s * 0.35);
    c.closePath();
  }
  function starPath(c, x, y, innerR, outerR, spikes) {
    let rot = Math.PI / 2 * 3;
    let step = Math.PI / spikes;
    c.beginPath();
    c.moveTo(x, y - outerR);
    for (let i = 0; i < spikes; i++) {
      c.lineTo(x + Math.cos(rot) * outerR, y + Math.sin(rot) * outerR);
      rot += step;
      c.lineTo(x + Math.cos(rot) * innerR, y + Math.sin(rot) * innerR);
      rot += step;
    }
    c.lineTo(x, y - outerR);
    c.closePath();
  }

  function drawParticle(p) {
    if (p.ring) {
      const t = p.t / p.life;
      const r = p.r0 + (p.r1 - p.r0) * t;
      ctx.save();
      ctx.globalAlpha = (1 - t) * 0.55;
      ctx.strokeStyle = p.col;
      ctx.lineWidth = p.w ?? 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (p.shard) {
      const t = p.t / p.life;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = (1 - t) * 0.95;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.roundRect(-p.w/2, -p.h/2, p.w, p.h, 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    const t = p.t / p.life;
    ctx.save();
    ctx.globalAlpha = (1 - t);
    ctx.fillStyle = p.col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ===== Main loop =====
  let lastTs = performance.now();
  function loop(ts) {
    if (!running) return;
    const dt = clamp((ts - lastTs) / 1000, 0, 0.033);
    lastTs = ts;

    update(dt);
    draw();

    if (!paused) requestAnimationFrame(loop);
  }

  // ===== UI handlers =====
  startBtn.addEventListener("click", () => startGame());
  continueBtn.addEventListener("click", () => doContinue());
  restartBtn.addEventListener("click", () => restartToStart());

  // ===== Boot =====
  initStars();
  resizeCanvas();
  resetCoreState({ keepAudio: true });

  // スマホでの音開始を確実にする
  window.addEventListener("pointerdown", () => {
    if (!audio) return;
    audio.ac.resume().catch(() => {});
  }, { passive: true });

})();
