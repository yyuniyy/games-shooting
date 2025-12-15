(() => {
  "use strict";

  // ===== Base (portrait) resolution =====
  const BASE_W = 540;
  const BASE_H = 960;

  // ===== Canvas =====
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ===== UI =====
  const startOverlay = document.getElementById("startOverlay");
  const startBtn = document.getElementById("startBtn");

  const continueOverlay = document.getElementById("continueOverlay");
  const continueBtn = document.getElementById("continueBtn");
  const countdownEl = document.getElementById("countdown");

  const finalOverlay = document.getElementById("finalOverlay");
  const restartBtn = document.getElementById("restartBtn");
  const finalScoreEl = document.getElementById("finalScore");
  const finalRankEl = document.getElementById("finalRank");

  const hpBar = document.getElementById("hpBar");
  const hpText = document.getElementById("hpText");
  const scoreText = document.getElementById("scoreText");
  const powerText = document.getElementById("powerText");
  const superText = document.getElementById("superText");
  const clashText = document.getElementById("clashText");
  const rageText = document.getElementById("rageText");

  const bossHud = document.getElementById("bossHud");
  const bossBar = document.getElementById("bossBar");
  const bossText = document.getElementById("bossText");

  // ===== Utils =====
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };

  const W = BASE_W;
  const H = BASE_H;

  // ===== Input =====
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (["w","a","s","d","p","arrowup","arrowdown","arrowleft","arrowright"," "].includes(k)) {
      e.preventDefault();
    }
  }, { passive: false });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

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
  const bullets = [];       // player bullets (basic/homing/spiral/bomb)
  const enemyBullets = [];  // enemy & boss bullets
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

  // kill counters
  let kill100 = 0, kill300 = 0, kill500 = 0;
  let nextHealAt100 = 10;
  let nextSuperAt300 = 5;
  let nextSuperAt100 = 30;
  let nextPowerAt500 = 1;
  let nextPowerAt100 = 50;

  // boss schedule
  let bossNextScore = 10000;
  let bossLevel = 1;

  // spawn pacing
  let enemySpawnTimer = 0;
  let enemySpawnInterval = 0.62;

  // continue
  let continueLeft = 10;
  let continueTimer = null;
  let continueSnapshot = null;

  // clash combo
  let clashCombo = 0;
  let clashDecay = 0;

  // RAGE (power=100 reached + 20s)
  let power100ReachedAt = null;
  let enemyRage = 1;        // 1 or 10 (atk/hp multiplier)
  let enemyRageCount = 1;   // 1 or 10 (spawn multiplier)

  // pattern state
  let spiralAngle = 0;

  // laser (persistent beam)
  let beam = null;          // { active, w, tickAcc, dmg, humAcc }

  // ===== Config =====
  const PLAYER_MAX_HP = 120;
  const PLAYER_HIT_R = 14;
  const BOSS_BASE_HP = 300;

  // ===== FX helpers =====
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

    const c = clamp(clashCombo, 0, 60);
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
    const rage = enemyRage; // hp multiplier
    if (type === 100) return { pts:100, hp:1 * rage,  sp:rand(120, 170), r:18 };
    if (type === 300) return { pts:300, hp:10 * rage, sp:rand(110, 160), r:22 };
    return              { pts:500, hp:50 * rage, sp:rand(105, 150), r:24 };
  }

  function pickSpawnSide() {
    // RAGE発動後は四方向（前/左/右/後）から出現
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
    } else { // bottom
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
    // 300は100の0.3、500は0.1
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
      modeSeed: Math.random() * 1000
    };

    bossHud.classList.remove("hidden");
    audio.stopBgm();
    audio.playBgm("boss");

    // ★ POWER=100以降：ボス出現時に雑魚も同時出現
    if (power >= 100) {
      const base = (enemyRage === 10 ? 12 : 6);
      spawnWave(base);
      if (enemyRage === 10) spawnWave(6); // さらに厚め
    }

    updateHud();
  }

  function checkBossSpawn() {
    if (boss) return;
    if (score > bossNextScore) {
      // ★ POWER=100以降は +20000 で出現
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
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      invuln: 0.6,
      alive: true,

      // cooldowns
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
      humAcc: 0,
      justStarted: false
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
    const left = Math.max(0, 20 - elapsed);
    return left;
  }

  // ===== Power specs (積み上がり) =====
  function basicForwardSpec() {
    const p = clamp(power, 1, 10);
    const t = (p - 1) / 9;
    const count = 1 + Math.floor(t * 9);      // 1..10
    const spread = 0.03 + t * 0.65;
    return { count, spread };
  }

  function laserSpec() {
    if (power < 11) return { enabled:false };
    const t = clamp((power - 11) / 9, 0, 1); // 11..20
    // 持続ビーム幅とダメージ（帯の強さ）
    const w = 10 + t * 22;
    const dmg = 1 + Math.floor(t * 2);        // 1..3
    const tick = clamp(0.08 - t * 0.03, 0.04, 0.08); // ヒット刻み
    return { enabled:true, w, dmg, tick };
  }

  function homingSpec() {
    if (power < 21) return { enabled:false, perSide:0 };
    const t = clamp((power - 21) / 19, 0, 1);
    const perSide = 1 + Math.floor(t * 4); // 1..5
    return { enabled:true, perSide };
  }

  function spiralSpec() {
    if (power < 41) return { enabled:false, count:0, rot:0 };
    const t = clamp((power - 41) / 19, 0, 1);
    const count = 2 + Math.floor(t * 10);     // 2..12 per burst
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

  // ===== Super shot (P) =====
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

    // 雑魚全滅（ボス無効）
    if (enemies.length > 0) {
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

    // 雑魚弾だけ消去（ボス弾は残す）
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      if (enemyBullets[i].source !== "boss") enemyBullets.splice(i, 1);
    }

    updateHud();
  }

  // ==========================================================
  // 弾×弾 相殺
  // ==========================================================
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

          clashCombo = clamp(clashCombo + 1, 0, 60);
          clashDecay = 0.65;

          const mx = (pb.x + eb.x) * 0.5;
          const my = (pb.y + eb.y) * 0.5;
          spawnClashFx(mx, my);
          break;
        }
      }
    }
  }

  // ==========================================================
  // レーザ（持続ビーム）×敵弾 相殺（当たり判定帯）
  // ==========================================================
  function beamClashCheck(beamRect) {
    // beamRect: {x0,x1,y0,y1}
    for (let j = enemyBullets.length - 1; j >= 0; j--) {
      const eb = enemyBullets[j];
      // ビーム帯のAABBに敵弾中心が入ったら相殺
      if (eb.x >= beamRect.x0 - eb.r && eb.x <= beamRect.x1 + eb.r &&
          eb.y >= beamRect.y0 - eb.r && eb.y <= beamRect.y1 + eb.r) {

        enemyBullets.splice(j, 1);

        clashCombo = clamp(clashCombo + 1, 0, 60);
        clashDecay = 0.65;

        spawnClashFx(eb.x, eb.y);
      }
    }
  }

  // ===== Reset helpers =====
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

    clashCombo = 0;
    clashDecay = 0;

    power100ReachedAt = null;
    enemyRage = 1;
    enemyRageCount = 1;

    spiralAngle = 0;

    respawnPlayerFull();

    if (!keepAudio && audio) audio.stopBgm();
    updateHud();
  }

  // ===== HUD =====
  function updateHud() {
    scoreText.textContent = String(score);
    powerText.textContent = String(power);
    superText.textContent = String(superShots);
    clashText.textContent = String(clashCombo);

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

    // RAGE HUD
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
    }

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

  // ===== Player firing (積み上がり) =====
  function firePlayer(dt) {
    // 1) 基本前方弾（1..10）
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

    // 2) レーザは「持続ビーム」（別処理：update内で当たり判定帯として処理）
    // ここでは開始音だけ制御
    const ls = laserSpec();
    if (ls.enabled) {
      if (!beam.active) {
        beam.active = true;
        beam.justStarted = true;
        audio.sfx.laserStart();
      }
      beam.w = ls.w;
      beam.dmg = ls.dmg;
    } else {
      beam.active = false;
    }

    // 3) 紫ホーミング（21..40で追加、以後維持）
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

    // 4) 渦巻弾（41..60で追加、以後維持）
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

    // 5) 分身（60..80）— 分身位置から弾を発射（見た目は本体同等シルエット）
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
        // 後ろ分身（後方へ）
        emit(player.x, player.y + oy, 0, spd);
        // 左分身（左へ）
        emit(player.x - ox, player.y, -spd, 0);
        // 右分身（右へ）
        emit(player.x + ox, player.y, spd, 0);
      }
    }

    // 6) ボム弾（80..100）
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

    // stars
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

    // clash combo decay
    if (clashDecay > 0) {
      clashDecay -= dt;
      if (clashDecay <= 0) {
        clashCombo = Math.max(0, clashCombo - 2);
        if (clashCombo > 0) clashDecay = 0.35;
      }
    }

    // RAGE timing
    handlePower100Timer(dt);

    // spawn interval
    const scoreFactor = Math.min(1.0, score / 50000);
    enemySpawnInterval = clamp(0.62 - scoreFactor * 0.22 - postBossDifficulty * 0.04, 0.20, 0.62);
    // RAGE時は湧きのテンポも少し上げる（数×10は「同時出現数」で担保）
    const intervalMult = (enemyRage === 10 ? 0.65 : 1.0);

    // player move
    const ax = (keys.has("a") ? -1 : 0) + (keys.has("d") ? 1 : 0);
    const ay = (keys.has("w") ? -1 : 0) + (keys.has("s") ? 1 : 0);

    player.x += ax * 380 * dt;
    player.y += ay * 380 * dt;
    player.x = clamp(player.x, 34, W - 34);
    player.y = clamp(player.y, 90, H - 50);

    // super
    if (keys.has("p")) { keys.delete("p"); fireSuperShot(); }

    // fire
    firePlayer(dt);

    // ===== Enemy spawn rules =====
    // ボス中でも「POWER=100以降」は雑魚を継続出現させる
    const canSpawn = (!boss) || (power >= 100);

    if (canSpawn) {
      enemySpawnTimer -= dt;
      if (enemySpawnTimer <= 0) {
        enemySpawnTimer = enemySpawnInterval * intervalMult;

        // ★ RAGE時：敵数×10（同時に10体生成）
        const n = enemyRageCount;
        for (let i = 0; i < n; i++) spawnWeightedEnemy();
      }
    }

    // enemies update & shoot
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.phase += dt * (1.2 + e.type / 500 * 0.8);

      // 進行方向に応じて揺らす
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

        // ★ 敵攻撃力×10（RAGE）
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

    // boss update & shoot
    if (boss) {
      boss.t += dt;
      boss.x = W * 0.5 + Math.sin(boss.t * 0.85) * (190 + boss.level * 6);
      boss.y = 140 + Math.sin(boss.t * 0.55) * 24;

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
            enemyBullets.push({
              x: boss.x, y: boss.y,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              r: 4.8, dmg,
              col: (lvl <= 1 ? "rgba(255,209,102,.95)" : "rgba(140,0,255,.85)"),
              t: 0,
              source: "boss"
            });
          }
        } else if (phase === 1) {
          const n = 16 + lvl * 2 + postBossDifficulty * 2;
          const spread = 1.9;
          const spd = (260 + lvl * 16 + postBossDifficulty * 12) * mult;
          const dmg = Math.floor((11 + lvl * 2) * mult);

          for (let k = 0; k < n; k++) {
            const t = (n === 1) ? 0 : (k / (n - 1) - 0.5);
            const a = aim + t * spread + Math.sin(boss.t * 1.2) * 0.08 * lvl;
            enemyBullets.push({
              x: boss.x, y: boss.y,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              r: 4.8, dmg,
              col: (lvl <= 1 ? "rgba(255,77,109,.92)" : "rgba(255,0,80,.82)"),
              t: 0,
              source: "boss"
            });
          }
        } else {
          const streams = 3 + Math.floor(lvl / 2);
          const per = 5 + Math.floor(lvl / 2);
          const spd = (240 + lvl * 14 + postBossDifficulty * 10) * mult;
          const dmg = Math.floor((10 + lvl * 2) * mult);

          for (let s = 0; s < streams; s++) {
            for (let k = 0; k < per; k++) {
              const a = boss.t * (2.4 + lvl * 0.25) + k * 0.55 + s * (Math.PI * 2 / streams);
              enemyBullets.push({
                x: boss.x, y: boss.y,
                vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                r: 4.6, dmg,
                col: (lvl <= 1 ? "rgba(124,243,255,.9)" : "rgba(20,255,170,.75)"),
                t: 0,
                source: "boss"
              });
            }
          }
        }
      }
    }

    // bullets update
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

    // ===== Laser beam: hit & clash =====
    const ls = laserSpec();
    if (beam.active && ls.enabled) {
      // ビーム矩形（画面端まで）
      const x0 = player.x - beam.w * 0.5;
      const x1 = player.x + beam.w * 0.5;
      const y0 = 0;
      const y1 = player.y - 34;
      const rect = { x0, x1, y0, y1 };

      // ビームの低いハム音（連続が重くならないよう間引き）
      beam.humAcc += dt;
      if (beam.humAcc >= 0.12) {
        beam.humAcc = 0;
        audio.sfx.laserHum();
      }

      // 敵弾と相殺
      beamClashCheck(rect);

      // ダメージ刻み
      beam.tickAcc += dt;
      if (beam.tickAcc >= ls.tick) {
        beam.tickAcc = 0;

        // 雑魚
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
              if (e.type === 100) kill100++;
              else if (e.type === 300) kill300++;
              else kill500++;

              enemies.splice(i, 1);
              handleKillMilestones();
            }
          }
        }

        // ボス
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

    // ★ bullet clash (circle bullets)
    bulletClashCheck();

    // items update
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      it.t += dt;
      it.y += it.vy * dt;

      if (dist2(it.x, it.y, player.x, player.y) < (it.r + PLAYER_HIT_R) ** 2) {
        if (it.kind === "heal") {
          player.hp = player.maxHp;
        } else if (it.kind === "super") {
          superShots = clamp(superShots + 1, 0, 999);
        } else if (it.kind === "power") {
          const prev = power;
          power = clamp(power + 1, 1, 100);

          if (power === 100 && prev < 100) {
            spawnRing(player.x, player.y, "rgba(255,209,102,.55)", 640, 6);
            spawnBurst(player.x, player.y, 140, "rgba(255,209,102,.95)", 1.25);
            spawnBurst(player.x, player.y, 100, "rgba(255,183,3,.85)", 1.1);
            shake(0.35, 12);

            // ★ POWER=100到達以降：ボス周期を +20000 に切り替え
            // 次のボスが遠すぎないよう、現スコア+20000 を下限にする
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

    // player bullets vs enemies/boss（レーザ以外）
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];

      // boss hit
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

      // enemies hit
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

    // particles
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

    // boss spawn check
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

    // enemies
    for (const e of enemies) drawEnemy(e);
    if (boss) drawBoss(boss);

    // ===== Laser beam draw (bullets layer) =====
    if (beam && beam.active && power >= 11) drawLaserBeam();

    // bullets
    for (const b of bullets) drawPlayerBullet(b);
    for (const b of enemyBullets) drawEnemyBullet(b);

    // items overlay bullets
    for (const it of items) drawItem(it);

    // player + clones (most front)
    if (player && player.alive) drawPlayerWithClones(player);

    // particles
    for (const p of particles) drawParticle(p);

    ctx.restore();
  }

  // ===== Draw helpers =====
  function drawPlayerWithClones(p) {
    // clones are same silhouette as player
    const cs = clonesSpec();
    if (cs.enabled) {
      const a = cs.alpha;
      const ox = 54, oy = 54;

      drawFighter(p.x, p.y + oy, 0.78 * a, true);      // rear clone
      drawFighter(p.x - ox, p.y, 0.78 * a, true);      // left clone
      drawFighter(p.x + ox, p.y, 0.78 * a, true);      // right clone
    }

    drawFighter(p.x, p.y, 1.0, false);

    // invuln ring
    if (p.invuln > 0) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(255,209,102,.9)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFighter(x, y, alpha, isClone) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = alpha;

    // gold aura at power 100
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

    // engine glow
    ctx.globalAlpha *= 0.9;
    const eg = ctx.createRadialGradient(0, 28, 2, 0, 28, 34);
    eg.addColorStop(0, "rgba(52,255,179,.85)");
    eg.addColorStop(1, "rgba(52,255,179,0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(0, 28, 32, 0, Math.PI * 2);
    ctx.fill();

    // thrust plume
    ctx.globalAlpha *= 0.4;
    ctx.fillStyle = "rgba(124,243,255,.9)";
    ctx.beginPath();
    ctx.roundRect(-6, 22, 12, 28, 10);
    ctx.fill();
    ctx.globalAlpha /= 0.4;

    // body
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

    // canopy
    ctx.fillStyle = "rgba(10,18,35,.9)";
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(8, -6);
    ctx.lineTo(0, 6);
    ctx.lineTo(-8, -6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(124,243,255,.85)";
    ctx.beginPath();
    ctx.ellipse(0, -10, 7, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // glow
    const glowK = clamp(power / 100, 0, 1);
    ctx.globalAlpha *= (0.10 + glowK * 0.18);
    const ag = ctx.createRadialGradient(0, 0, 8, 0, 0, isClone ? 56 : 80);
    ag.addColorStop(0, power >= 100 ? "rgba(255,183,3,.55)" : "rgba(124,243,255,.45)");
    ag.addColorStop(1, "rgba(124,243,255,0)");
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(0, 0, isClone ? 56 : 80, 0, Math.PI * 2);
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

    // outer halo
    ctx.save();
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.roundRect(x0 - beam.w * 0.85, y0, (x1 - x0) + beam.w * 1.7, (y1 - y0), beam.w);
    ctx.fill();

    // core
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.roundRect(x0, y0, (x1 - x0), (y1 - y0), beam.w);
    ctx.fill();

    // spark line accents
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "rgba(255,209,102,.9)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo((x0 + x1) * 0.5, y1);
    ctx.lineTo((x0 + x1) * 0.5 + Math.sin(performance.now()*0.01) * 4, y0);
    ctx.stroke();

    ctx.restore();
  }

  function drawEnemy(e) {
    if (e.type === 100) return drawUFO(e);
    if (e.type === 300) return drawAlien(e);
    return drawDevil(e);
  }

  function drawUFO(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.globalAlpha = 0.9;
    const gg = ctx.createRadialGradient(0, 0, 4, 0, 0, 58);
    gg.addColorStop(0, "rgba(124,243,255,.55)");
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(223,246,255,.92)";
    ctx.beginPath(); ctx.ellipse(0, 6, 30, 12, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(124,243,255,.85)";
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 10, 0, Math.PI, 0, true); ctx.fill();

    ctx.fillStyle = "rgba(255,209,102,.92)";
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * 10, 10, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  function drawAlien(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.globalAlpha = 0.9;
    const gg = ctx.createRadialGradient(0, 0, 4, 0, 0, 68);
    gg.addColorStop(0, "rgba(255,209,102,.55)");
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, 66, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(52,255,179,.88)";
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 24, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(10,18,35,.92)";
    ctx.beginPath(); ctx.ellipse(-6, -4, 6, 9, -0.2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 6, -4, 6, 9,  0.2, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = "rgba(223,246,255,.88)";
    ctx.beginPath(); ctx.roundRect(-14, 18, 28, 20, 10); ctx.fill();

    ctx.strokeStyle = "rgba(52,255,179,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, 26); ctx.lineTo(-28, 18);
    ctx.moveTo( 12, 26); ctx.lineTo( 28, 18);
    ctx.stroke();
    ctx.restore();
  }

  function drawDevil(e) {
    ctx.save(); ctx.translate(e.x, e.y);
    ctx.globalAlpha = 0.95;
    const gg = ctx.createRadialGradient(0, 0, 6, 0, 0, 80);
    gg.addColorStop(0, "rgba(255,77,109,.55)");
    gg.addColorStop(0.4, "rgba(140,0,255,.25)");
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.arc(0, 0, 78, 0, Math.PI * 2); ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,77,109,.92)";
    ctx.beginPath();
    ctx.moveTo(-8, 10);
    ctx.quadraticCurveTo(-50, 10, -42, -18);
    ctx.quadraticCurveTo(-24, -8, -8, 10);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(8, 10);
    ctx.quadraticCurveTo(50, 10, 42, -18);
    ctx.quadraticCurveTo(24, -8, 8, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(255,209,102,.92)";
    ctx.beginPath(); ctx.ellipse(0, 6, 18, 16, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = "rgba(140,0,255,.85)";
    ctx.beginPath(); ctx.moveTo(-10, -6); ctx.lineTo(-20, -28); ctx.lineTo(-2, -12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(10, -6); ctx.lineTo(20, -28); ctx.lineTo(2, -12); ctx.closePath(); ctx.fill();

    ctx.fillStyle = "rgba(10,18,35,.95)";
    ctx.beginPath(); ctx.ellipse(-6, 6, 5, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 6, 6, 5, 6, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "rgba(255,0,80,.9)";
    ctx.beginPath(); ctx.arc(-5, 5, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc( 7, 5, 2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawBoss(b) {
    ctx.save();
    ctx.translate(b.x, b.y);

    const aura = ctx.createRadialGradient(0, 0, 12, 0, 0, 220);
    aura.addColorStop(0, `rgba(140,0,255,${0.10 + b.level*0.02})`);
    aura.addColorStop(0.35, `rgba(255,0,80,${0.08 + b.level*0.015})`);
    aura.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, 220, 0, Math.PI * 2);
    ctx.fill();

    const coreCol = (b.level <= 1) ? "rgba(255,209,102,.95)" : "rgba(90,0,140,.92)";
    ctx.fillStyle = coreCol;
    ctx.beginPath();
    ctx.roundRect(-70, -42, 140, 84, 22);
    ctx.fill();

    ctx.fillStyle = (b.level <= 1) ? "rgba(255,77,109,.92)" : "rgba(20,255,170,.70)";
    for (let i = 0; i < 8 + b.level; i++) {
      const a = (i / (8 + b.level)) * Math.PI * 2 + b.t * 0.6;
      const r0 = 76, r1 = 96 + b.level * 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      ctx.lineTo(Math.cos(a + 0.18) * r1, Math.sin(a + 0.18) * r1);
      ctx.lineTo(Math.cos(a - 0.18) * r1, Math.sin(a - 0.18) * r1);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "rgba(10,18,35,.95)";
    ctx.beginPath();
    ctx.ellipse(0, -6, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    const iris = (b.level <= 1) ? "rgba(124,243,255,.95)" : "rgba(255,0,80,.90)";
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(8, -8, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = (b.level <= 1) ? "rgba(223,246,255,.9)" : "rgba(140,0,255,.85)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawPlayerBullet(b) {
    ctx.save();
    ctx.translate(b.x, b.y);

    if (b.type === "homing") {
      const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
      rg.addColorStop(0, "rgba(180,90,255,.60)");
      rg.addColorStop(0.55, "rgba(140,0,255,.35)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "rgba(180,90,255,.95)";
      ctx.beginPath();
      ctx.ellipse(0, 0, b.r, b.r * 1.8, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (b.type === "spiral") {
      const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 22);
      rg.addColorStop(0, "rgba(52,255,179,.35)");
      rg.addColorStop(0.6, "rgba(124,243,255,.22)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 20, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "rgba(52,255,179,.92)";
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (b.type === "bomb") {
      const rg = ctx.createRadialGradient(0, 0, 4, 0, 0, 42);
      rg.addColorStop(0, "rgba(255,209,102,.55)");
      rg.addColorStop(0.45, "rgba(255,77,109,.30)");
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,209,102,.95)";
      ctx.beginPath();
      ctx.arc(0, 0, b.r, 0, Math.PI*2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,77,109,.9)";
      ctx.beginPath();
      ctx.arc(0, 0, b.r * 0.45, 0, Math.PI*2);
      ctx.fill();

      ctx.restore();
      return;
    }

    // basic
    const pK = clamp(power / 100, 0, 1);
    const glow = 0.30 + pK * 0.60;
    const halo = 18 + power * 0.10;

    const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, halo);
    rg.addColorStop(0, power >= 100 ? `rgba(255,183,3,${glow})` : `rgba(124,243,255,${glow})`);
    rg.addColorStop(0.55, power >= 100 ? `rgba(255,209,102,${glow * 0.85})` : `rgba(52,255,179,${glow * 0.75})`);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, halo, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(223,246,255,.95)";
    ctx.beginPath();
    ctx.ellipse(0, 0, b.r, b.r * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawEnemyBullet(b) {
    ctx.save();
    ctx.translate(b.x, b.y);

    const rg = ctx.createRadialGradient(0, 0, 2, 0, 0, 18);
    rg.addColorStop(0, b.col);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(223,246,255,.75)";
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawItem(it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    const bob = Math.sin(it.t * 4) * 3;
    ctx.translate(0, bob);

    if (it.kind === "heal") {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(255,77,109,.95)";
      heartPath(ctx, 0, 0, 20);
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(255,77,109,1)";
      heartPath(ctx, 0, 0, 32);
      ctx.fill();
    } else if (it.kind === "super") {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(255,209,102,.95)";
      ctx.beginPath();
      ctx.roundRect(-16, -16, 32, 32, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(10,18,35,.9)";
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.lineTo(8, -12);
      ctx.lineTo(0, 2);
      ctx.lineTo(10, 2);
      ctx.lineTo(-6, 14);
      ctx.lineTo(0, 2);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(255,209,102,1)";
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = "rgba(124,243,255,.95)";
      starPath(ctx, 0, 0, 9, 20, 5);
      ctx.fill();

      ctx.globalAlpha = 0.22;
      ctx.fillStyle = "rgba(124,243,255,1)";
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fill();
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

  window.addEventListener("pointerdown", () => {
    if (!audio) return;
    audio.ac.resume().catch(() => {});
  }, { passive: true });

})();
