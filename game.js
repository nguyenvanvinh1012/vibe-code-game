const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const livesEl = document.querySelector("#lives");
const chargeEl = document.querySelector("#charge");
const sectorEl = document.querySelector("#sector");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#startButton");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();

let state;
let lastTime = 0;
let animationId = 0;

const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const sectors = [
  { name: "Astra", top: "#060916", mid: "#091226", bottom: "#04060b", star: "#dbe9ff" },
  { name: "Ember", top: "#17080c", mid: "#29101b", bottom: "#070509", star: "#ffd9c2" },
  { name: "Verdant", top: "#06120e", mid: "#0b251e", bottom: "#040907", star: "#c9ffe8" },
  { name: "Ion", top: "#10091a", mid: "#17204a", bottom: "#060711", star: "#eadbff" },
];
const BASE_SECTOR_SCORE = 2400;
const playerBulletColors = ["#7df7ff", "#54e0a7", "#ffca5f", "#ff9e64", "#f85f73"];

function difficultyScale() {
  return state.wave * 0.85 + state.sectorLevel * 1.15;
}

function createState() {
  return {
    running: true,
    paused: false,
    gameOver: false,
    score: 0,
    wave: 1,
    lives: 3,
    charge: 0,
    elapsed: 0,
    sector: 0,
    sectorLevel: 1,
    sectorStartScore: 0,
    nextSectorScore: BASE_SECTOR_SCORE,
    sectorFlash: 0,
    notice: "",
    noticeTimer: 0,
    upgrades: {
      shot: 1,
      rapid: 1,
      power: 1,
      speed: 1,
      shield: 0,
    },
    stars: Array.from({ length: 140 }, () => ({
      x: rand(0, W),
      y: rand(0, H),
      size: rand(0.6, 2.2),
      speed: rand(25, 150),
      alpha: rand(0.28, 0.95),
    })),
    player: {
      x: W / 2,
      y: H - 92,
      r: 18,
      speed: 420,
      fireCooldown: 0,
      invulnerable: 0,
      heat: 0,
    },
    bullets: [],
    enemies: [],
    enemyBullets: [],
    particles: [],
    powerups: [],
    spawnTimer: 0.4,
    waveKills: 0,
    nextWaveKills: 16,
    bossSpawned: false,
    sectorBossActive: false,
    sectorBossReason: "",
  };
}

function startGame() {
  state = createState();
  lastTime = performance.now();
  overlay.classList.add("hidden");
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(loop);
}

function showOverlay(title, body, buttonText) {
  overlay.querySelector("h1").textContent = title;
  overlay.querySelector("p").textContent = body;
  startButton.textContent = buttonText;
  overlay.classList.remove("hidden");
}

function loop(now) {
  try {
    const frameTime = Number.isFinite(now) ? now : performance.now();
    const dt = Math.min(Math.max((frameTime - lastTime) / 1000, 0), 0.033);
    lastTime = frameTime;

    if (state.running && !state.paused && !state.gameOver) {
      update(dt);
    }
    draw();
    updateHud();

    if (state.running) {
      animationId = requestAnimationFrame(loop);
    }
  } catch (error) {
    console.error(error);
    state.running = false;
    showOverlay("Render Error", error.message || "The game stopped while rendering.", "Restart Mission");
  }
}

function update(dt) {
  state.elapsed += dt;
  updateSector(dt);
  updateStars(dt);
  updatePlayer(dt);
  updateBullets(dt);
  updateEnemies(dt);
  updateEnemyBullets(dt);
  updatePowerups(dt);
  updateParticles(dt);
  spawnEnemies(dt);
  detectCollisions();
  maybeAdvanceWave();
}

function updateSector(dt) {
  if (!Number.isFinite(state.elapsed)) {
    state.elapsed = 0;
  }
  if (state.score >= state.nextSectorScore && !state.bossSpawned && !state.sectorBossActive) {
    spawnSectorBoss("Gate boss");
  }

  const timedSectorLevel = Math.floor(state.elapsed / 75) + 1;
  if (timedSectorLevel > state.sectorLevel && !state.bossSpawned && !state.sectorBossActive) {
    spawnSectorBoss("Warp guardian");
  }

  state.sectorFlash = Math.max(0, state.sectorFlash - dt);
  state.noticeTimer = Math.max(0, state.noticeTimer - dt);
}

function changeSector(reason) {
  state.sectorLevel += 1;
  state.sector = (state.sector + 1) % sectors.length;
  state.sectorStartScore = state.nextSectorScore;
  state.nextSectorScore += BASE_SECTOR_SCORE + state.sectorLevel * 650;
  state.sectorFlash = 2.8;
  state.score += 250;
  state.charge = clamp(state.charge + 35, 0, 100);
  state.enemyBullets = [];
  state.enemies = [];
  state.spawnTimer = 1.1;
  state.bossSpawned = false;
  state.sectorBossActive = false;
  state.sectorBossReason = "";
  state.wave = Math.max(state.wave, state.sectorLevel);
  showNotice(`${reason}: ${sectors[state.sector].name}`);
}

function spawnSectorBoss(reason) {
  state.sectorBossActive = true;
  state.sectorBossReason = reason;
  state.enemyBullets = [];
  state.enemies = [];
  state.spawnTimer = 2.2;
  showNotice(`${reason} incoming`);
  spawnBoss(true);
}

function updateStars(dt) {
  for (const star of state.stars) {
    star.y += star.speed * dt;
    if (star.y > H + 4) {
      star.x = rand(0, W);
      star.y = -4;
      star.speed = rand(25, 150);
    }
  }
}

function updatePlayer(dt) {
  const p = state.player;
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  const up = keys.has("arrowup") || keys.has("w");
  const down = keys.has("arrowdown") || keys.has("s");
  let vx = Number(right) - Number(left);
  let vy = Number(down) - Number(up);
  const len = Math.hypot(vx, vy) || 1;
  vx /= len;
  vy /= len;

  const speed = p.speed + (state.upgrades.speed - 1) * 34;
  p.x = clamp(p.x + vx * speed * dt, p.r + 8, W - p.r - 8);
  p.y = clamp(p.y + vy * speed * dt, H * 0.38, H - p.r - 14);
  p.fireCooldown = Math.max(0, p.fireCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);
  p.heat = Math.max(0, p.heat - dt * 0.42);
  state.charge = clamp(state.charge + dt * 4.5, 0, 100);

  if (keys.has(" ") && p.fireCooldown <= 0) {
    firePlayerBullet();
  }
}

function firePlayerBullet() {
  const p = state.player;
  const spread = p.heat > 0.55 ? 17 : 10;
  const damage = state.upgrades.power;
  const color = playerBulletColors[Math.min(damage - 1, playerBulletColors.length - 1)];
  const shots = [
    { x: -spread, y: -18, vx: -45, vy: -760, r: 4, damage, color, kind: "bolt" },
    { x: spread, y: -18, vx: 45, vy: -760, r: 4, damage, color, kind: "bolt" },
  ];

  if (state.upgrades.shot >= 2) {
    shots.push({ x: 0, y: -24, vx: 0, vy: -820, r: 5, damage: damage + 0.5, color, kind: "lance" });
  }
  if (state.upgrades.shot >= 3) {
    shots.push(
      { x: -26, y: -12, vx: -180, vy: -720, r: 4, damage, color: "#c78bff", kind: "wing" },
      { x: 26, y: -12, vx: 180, vy: -720, r: 4, damage, color: "#c78bff", kind: "wing" },
    );
  }
  if (state.upgrades.shot >= 4) {
    shots.push(
      { x: -40, y: -4, vx: -72, vy: -800, r: 3.5, damage, color: "#9dd8ff", kind: "drone" },
      { x: 40, y: -4, vx: 72, vy: -800, r: 3.5, damage, color: "#9dd8ff", kind: "drone" },
    );
  }
  if (state.upgrades.shot >= 5) {
    shots.push(
      { x: -6, y: -30, vx: -28, vy: -900, r: 7, damage: damage + 1, color: "#ffffff", kind: "pulse" },
      { x: 6, y: -30, vx: 28, vy: -900, r: 7, damage: damage + 1, color: "#ffffff", kind: "pulse" },
    );
  }
  if (state.upgrades.shot >= 6) {
    shots.push(
      { x: -58, y: 2, vx: -245, vy: -690, r: 4, damage, color: "#ffca5f", kind: "flare" },
      { x: 58, y: 2, vx: 245, vy: -690, r: 4, damage, color: "#ffca5f", kind: "flare" },
    );
  }

  for (const shot of shots) {
    state.bullets.push({
      x: p.x + shot.x,
      y: p.y + shot.y,
      vx: shot.vx,
      vy: shot.vy,
      r: shot.r + (damage - 1) * 0.8,
      damage: shot.damage,
      color: shot.color,
      kind: shot.kind,
      life: 0,
    });
  }
  p.fireCooldown = Math.max(0.055, 0.14 - (state.upgrades.rapid - 1) * 0.022);
  p.heat = clamp(p.heat + 0.08, 0, 1);
  burst(p.x, p.y - 20, color, 2 + state.upgrades.rapid);
}

function triggerNova() {
  if (!state || state.paused || state.gameOver || state.charge < 100) return;
  state.charge = 0;
  for (const enemy of state.enemies) {
    enemy.hp -= enemy.boss ? 8 : 4;
    burst(enemy.x, enemy.y, enemy.boss ? "#ffca5f" : "#5ce7ff", enemy.boss ? 36 : 18);
    if (enemy.hp <= 0) {
      killEnemy(enemy);
    }
  }
  state.enemyBullets = [];
  burst(state.player.x, state.player.y, "#54e0a7", 58);
}

function updateBullets(dt) {
  for (const b of state.bullets) {
    b.life += dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.kind === "wing") {
      b.x += Math.sin(b.life * 18) * 38 * dt;
    }
    if (b.kind === "pulse") {
      b.r = 7 + Math.sin(b.life * 24) * 1.6;
    }
  }
  state.bullets = state.bullets.filter((b) => b.y > -30 && b.x > -40 && b.x < W + 40);
}

function spawnEnemies(dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0 || state.bossSpawned) return;

  const wave = state.wave;
  const difficulty = difficultyScale();
  const isHeavy = Math.random() < Math.min(0.14 + difficulty * 0.018, 0.42);
  const isHunter = !isHeavy && state.sectorLevel >= 2 && Math.random() < Math.min(0.08 + difficulty * 0.01, 0.24);
  const enemy = {
    x: rand(44, W - 44),
    y: -40,
    r: isHeavy ? 24 : isHunter ? 15 : 17,
    hp: isHeavy
      ? 4 + Math.floor(difficulty / 2)
      : 2 + Math.floor(difficulty / 4) + (isHunter ? 1 : 0),
    maxHp: 0,
    speed: isHeavy
      ? rand(65, 110) + state.sectorLevel * 5
      : rand(110, 185) + state.sectorLevel * 8 + (isHunter ? 38 : 0),
    sway: rand(0.9, 2.7) + state.sectorLevel * 0.08,
    phase: rand(0, Math.PI * 2),
    fireTimer: rand(0.85, 2.1) - Math.min(difficulty * 0.025, 0.45),
    points: isHeavy ? 90 : isHunter ? 65 : 45,
    heavy: isHeavy,
    hunter: isHunter,
    boss: false,
  };
  enemy.maxHp = enemy.hp;
  state.enemies.push(enemy);
  state.spawnTimer = Math.max(0.13, 0.82 - difficulty * 0.035);
}

function spawnBoss(sectorBoss = false) {
  state.bossSpawned = true;
  const bossHp = sectorBoss
    ? 82 + state.wave * 11 + state.sectorLevel * 18
    : 38 + state.wave * 7 + state.sectorLevel * 8;
  state.enemies.push({
    x: W / 2,
    y: -82,
    r: sectorBoss ? 64 : 52,
    hp: bossHp,
    maxHp: bossHp,
    speed: sectorBoss ? 44 + state.sectorLevel * 2 : 52 + state.sectorLevel * 3,
    sway: sectorBoss ? 1.55 : 1.2,
    phase: 0,
    fireTimer: sectorBoss ? 0.65 : 0.9,
    points: sectorBoss ? 1250 + state.sectorLevel * 250 : 850,
    heavy: true,
    boss: true,
    sectorBoss,
  });
}

function updateEnemies(dt) {
  for (const enemy of state.enemies) {
    enemy.phase += enemy.sway * dt;
    enemy.y += enemy.speed * dt;
    enemy.x += Math.sin(enemy.phase) * (enemy.boss ? 85 : 36) * dt;
    enemy.x = clamp(enemy.x, enemy.r + 8, W - enemy.r - 8);
    enemy.fireTimer -= dt;

    if (enemy.fireTimer <= 0 && enemy.y > 20) {
      fireEnemy(enemy);
      const difficulty = difficultyScale();
      enemy.fireTimer = enemy.boss
        ? Math.max(enemy.sectorBoss ? 0.26 : 0.34, (enemy.sectorBoss ? 0.46 : 0.58) - state.sectorLevel * 0.025)
        : Math.max(0.42, rand(1.0, 2.35) - difficulty * 0.04);
    }
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.y < H + 90);
}

function fireEnemy(enemy) {
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
  const speed = enemy.boss ? 270 + state.sectorLevel * 12 : 215 + state.sectorLevel * 11;
  let shots = enemy.boss ? [-0.42, -0.14, 0.14, 0.42] : [0];
  if (enemy.sectorBoss) shots = [-0.58, -0.32, -0.1, 0.1, 0.32, 0.58];
  if (enemy.heavy && state.sectorLevel >= 2) shots = [-0.18, 0.18];
  if (enemy.hunter && state.sectorLevel >= 3) shots = [-0.28, 0, 0.28];
  for (const offset of shots) {
    state.enemyBullets.push({
      x: enemy.x,
      y: enemy.y + enemy.r * 0.55,
      vx: Math.cos(angle + offset) * speed,
      vy: Math.sin(angle + offset) * speed,
      r: enemy.boss ? 6 : 5,
    });
  }
}

function updateEnemyBullets(dt) {
  for (const b of state.enemyBullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  state.enemyBullets = state.enemyBullets.filter(
    (b) => b.y > -30 && b.y < H + 35 && b.x > -35 && b.x < W + 35,
  );
}

function updatePowerups(dt) {
  for (const power of state.powerups) {
    power.y += power.vy * dt;
    power.spin += dt * 5;
  }
  state.powerups = state.powerups.filter((power) => power.y < H + 30);
}

function updateParticles(dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    p.vx *= 0.985;
    p.vy *= 0.985;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
}

function detectCollisions() {
  const p = state.player;

  for (const bullet of state.bullets) {
    for (const enemy of state.enemies) {
      if (dist(bullet, enemy) < bullet.r + enemy.r) {
        bullet.y = -999;
        enemy.hp -= bullet.damage;
        burst(bullet.x, bullet.y, "#7df7ff", 5);
        if (enemy.hp <= 0) {
          killEnemy(enemy);
        }
        break;
      }
    }
  }

  for (const enemy of state.enemies) {
    if (p.invulnerable <= 0 && dist(p, enemy) < 10 + enemy.r * 0.5) {
      enemy.hp = 0;
      killEnemy(enemy, false);
      damagePlayer();
    }
  }

  for (const bullet of state.enemyBullets) {
    if (p.invulnerable <= 0 && dist(p, bullet) < 10 + bullet.r) {
      bullet.y = H + 999;
      damagePlayer();
    }
  }

  for (const power of state.powerups) {
    if (dist(p, power) < p.r + power.r) {
      power.y = H + 999;
      applyPowerup(power.kind);
    }
  }
}

function killEnemy(enemy, award = true) {
  burst(enemy.x, enemy.y, enemy.boss ? "#ff9e64" : "#f85f73", enemy.boss ? 72 : 24);
  if (award) {
    state.score += enemy.points;
    state.waveKills += enemy.boss ? 4 : 1;
    state.charge = clamp(state.charge + (enemy.boss ? 34 : 10), 0, 100);
    const dropChance = Math.max(0.1, 0.18 - state.sectorLevel * 0.015);
    if (Math.random() < (enemy.boss ? 1 : dropChance)) {
      dropPowerup(enemy.x, enemy.y, enemy.boss);
    }
  }
  if (enemy.boss) {
    state.bossSpawned = false;
    state.wave += 1;
    state.waveKills = 0;
    state.nextWaveKills = 15 + state.wave * 3;
    state.score += 200 * state.wave;
    if (enemy.sectorBoss) {
      changeSector("Sector clear");
    }
  }
}

function damagePlayer() {
  const p = state.player;
  if (p.invulnerable > 0) return;
  if (state.upgrades.shield > 0) {
    state.upgrades.shield -= 1;
    p.invulnerable = 0.8;
    burst(p.x, p.y, "#7df7ff", 38);
    showNotice("Shield blocked hit");
    return;
  }
  state.lives -= 1;
  p.invulnerable = 1.5;
  state.charge = clamp(state.charge + 18, 0, 100);
  burst(p.x, p.y, "#ffffff", 42);

  if (state.lives <= 0) {
    state.gameOver = true;
    showOverlay("Mission Failed", `Final score: ${state.score}. Wave reached: ${state.wave}.`, "Retry Mission");
  }
}

function applyPowerup(kind) {
  const upgrades = state.upgrades;
  if (kind === "life") {
    state.lives = Math.min(5, state.lives + 1);
    showNotice("Repair core +1 life");
  }
  if (kind === "charge") {
    state.charge = 100;
    showNotice("Nova core charged");
  }
  if (kind === "shot") {
    upgrades.shot = Math.min(6, upgrades.shot + 1);
    showNotice(`Weapon pattern ${upgrades.shot}`);
  }
  if (kind === "rapid") {
    upgrades.rapid = Math.min(5, upgrades.rapid + 1);
    showNotice(`Rapid level ${upgrades.rapid}`);
  }
  if (kind === "power") {
    upgrades.power = Math.min(5, upgrades.power + 1);
    showNotice(`Damage level ${upgrades.power}`);
  }
  if (kind === "speed") {
    upgrades.speed = Math.min(4, upgrades.speed + 1);
    showNotice(`Engine level ${upgrades.speed}`);
  }
  if (kind === "shield") {
    upgrades.shield = Math.min(3, upgrades.shield + 1);
    showNotice(`Shield x${upgrades.shield}`);
  }
  burst(state.player.x, state.player.y, powerupColor(kind), 32);
}

function dropPowerup(x, y, bossDrop) {
  const pool = bossDrop
    ? ["shot", "rapid", "power", "shield", "life", "charge"]
    : ["shot", "rapid", "power", "speed", "shield", "charge", "life"];
  const kind = pool[Math.floor(rand(0, pool.length))];
  state.powerups.push({
    x,
    y,
    vy: 145,
    r: 14,
    spin: 0,
    kind,
  });
}

function powerupColor(kind) {
  return {
    life: "#54e0a7",
    charge: "#ffca5f",
    shot: "#7df7ff",
    rapid: "#c78bff",
    power: "#ff9e64",
    speed: "#8cff6f",
    shield: "#9dd8ff",
  }[kind];
}

function showNotice(text) {
  state.notice = text;
  state.noticeTimer = 1.8;
}

function maybeAdvanceWave() {
  if (state.waveKills >= state.nextWaveKills && !state.bossSpawned && !state.sectorBossActive) {
    if (state.wave % 4 === 0 && !state.enemies.some((e) => e.boss)) {
      spawnBoss();
      state.waveKills = 0;
      return;
    }
    state.wave += 1;
    state.waveKills = 0;
    state.nextWaveKills = 15 + state.wave * 3;
    state.score += 150 * state.wave;
    state.charge = clamp(state.charge + 20, 0, 100);
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(40, 300);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: rand(1.4, 4.2),
      color,
      life: rand(0.28, 0.78),
    });
  }
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawPowerups();
  drawBullets();
  drawEnemies();
  drawPlayer();
  drawParticles();
  drawSectorProgress();

  if (state.paused && !state.gameOver) {
    drawCenterText("Paused", "Press P to resume");
  }
  if (state.noticeTimer > 0) {
    ctx.globalAlpha = clamp(state.noticeTimer, 0, 1);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 28px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(state.notice, W / 2, 78);
    ctx.globalAlpha = 1;
  }
}

function drawBackground() {
  const sector = sectors[state.sector] || sectors[0];
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, sector.top);
  gradient.addColorStop(0.5, sector.mid);
  gradient.addColorStop(1, sector.bottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  if (state.sector % 2 === 1) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    const offset = (state.elapsed * 34) % 96;
    for (let y = -80; y < H + 80; y += 96) {
      ctx.beginPath();
      ctx.moveTo(0, y + offset);
      ctx.lineTo(W, y + 46 + offset);
      ctx.lineTo(W, y + 58 + offset);
      ctx.lineTo(0, y + 12 + offset);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.045)";
    ctx.lineWidth = 2;
    const offset = (state.elapsed * 24) % 120;
    for (let x = -120; x < W + 120; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x + offset, 0);
      ctx.lineTo(x - 180 + offset, H);
      ctx.stroke();
    }
  }

  for (const star of state.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = sector.star;
    ctx.fillRect(star.x, star.y, star.size, star.size * 1.8);
  }
  ctx.globalAlpha = 1;

  if (state.sectorFlash > 0) {
    ctx.globalAlpha = clamp(state.sectorFlash / 2.5, 0, 0.3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

function drawPlayer() {
  const p = state.player;
  const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0;
  if (blink) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = "#54e0a7";
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.lineTo(18, 22);
  ctx.lineTo(0, 12);
  ctx.lineTo(-18, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#efffff";
  ctx.beginPath();
  ctx.moveTo(0, -12);
  ctx.lineTo(8, 10);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffca5f";
  ctx.beginPath();
  ctx.moveTo(-8, 20);
  ctx.lineTo(0, 34 + Math.sin(performance.now() / 70) * 6);
  ctx.lineTo(8, 20);
  ctx.closePath();
  ctx.fill();

  if (state.upgrades.shot >= 4) {
    drawDrone(-42, 8);
    drawDrone(42, 8);
  }

  if (state.upgrades.shield > 0) {
    ctx.strokeStyle = "#7df7ff";
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawDrone(x, y) {
  ctx.save();
  ctx.translate(x, y + Math.sin(performance.now() / 180 + x) * 3);
  ctx.fillStyle = "#9dd8ff";
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.lineTo(10, 6);
  ctx.lineTo(0, 12);
  ctx.lineTo(-10, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(-3, -2, 6, 6);
  ctx.restore();
}

function drawBullets() {
  for (const b of state.bullets) {
    drawPlayerBullet(b);
  }

  ctx.fillStyle = "#ff667d";
  for (const b of state.enemyBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayerBullet(b) {
  ctx.save();
  ctx.globalAlpha = 0.36;
  ctx.fillStyle = b.color || "#7df7ff";
  drawRoundedRect(b.x - b.r * 0.75, b.y + 4, b.r * 1.5, b.r * 7, b.r);
  ctx.globalAlpha = 1;
  ctx.fillStyle = b.color || "#7df7ff";

  if (b.kind === "pulse") {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r + 4, 0, Math.PI * 2);
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  } else if (b.kind === "lance") {
    drawRoundedRect(b.x - b.r * 0.55, b.y - 22, b.r * 1.1, 34, b.r);
    ctx.fillStyle = "#ffffff";
    drawRoundedRect(b.x - 1.5, b.y - 18, 3, 25, 2);
  } else if (b.kind === "wing" || b.kind === "flare") {
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - 12);
    ctx.lineTo(b.x + b.r * 1.5, b.y + 10);
    ctx.lineTo(b.x, b.y + 4);
    ctx.lineTo(b.x - b.r * 1.5, b.y + 10);
    ctx.closePath();
    ctx.fill();
  } else {
    drawRoundedRect(b.x - b.r * 0.7, b.y - 13, b.r * 1.4, 22, b.r);
  }
  ctx.restore();
}

function drawRoundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = enemy.sectorBoss
      ? "#ffffff"
      : enemy.boss
        ? "#f85f73"
        : enemy.heavy
          ? "#ff9e64"
          : enemy.hunter
            ? "#c78bff"
            : "#6f8dff";
    ctx.beginPath();
    ctx.moveTo(0, enemy.r);
    ctx.lineTo(enemy.r * 0.95, -enemy.r * 0.55);
    ctx.lineTo(enemy.r * 0.25, -enemy.r * 0.2);
    ctx.lineTo(0, -enemy.r);
    ctx.lineTo(-enemy.r * 0.25, -enemy.r * 0.2);
    ctx.lineTo(-enemy.r * 0.95, -enemy.r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#101525";
    ctx.beginPath();
    ctx.arc(0, -enemy.r * 0.08, enemy.r * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (enemy.boss) {
      drawBar(
        enemy.x - (enemy.sectorBoss ? 86 : 65),
        enemy.y - (enemy.sectorBoss ? 92 : 75),
        enemy.sectorBoss ? 172 : 130,
        8,
        enemy.hp / enemy.maxHp,
        enemy.sectorBoss ? "#ffffff" : "#ffca5f",
      );
    }
  }
}

function drawPowerups() {
  for (const power of state.powerups) {
    ctx.save();
    ctx.translate(power.x, power.y);
    ctx.rotate(power.spin);
    ctx.strokeStyle = powerupColor(power.kind);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(-10, -10, 20, 20);
    ctx.stroke();
    ctx.fillStyle = powerupColor(power.kind);
    ctx.font = "700 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(power.kind[0].toUpperCase(), 0, 1);
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    ctx.globalAlpha = clamp(p.life * 1.8, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawSectorProgress() {
  const needed = Math.max(1, state.nextSectorScore - state.sectorStartScore);
  const progress = clamp((state.score - state.sectorStartScore) / needed, 0, 1);
  const x = 28;
  const y = 24;
  const width = 220;
  const height = 8;

  ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = (sectors[state.sector] || sectors[0]).star;
  ctx.fillRect(x, y, width * progress, height);
  ctx.fillStyle = "rgba(238, 244, 255, 0.86)";
  ctx.font = "700 13px Inter, sans-serif";
  ctx.textAlign = "left";
  const label = state.sectorBossActive ? "Defeat gate boss" : `Gate boss: ${state.nextSectorScore}`;
  ctx.fillText(label, x, y + 24);
}

function drawBar(x, y, width, height, value, color) {
  ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * clamp(value, 0, 1), height);
}

function drawCenterText(title, subtitle) {
  ctx.fillStyle = "rgba(5, 8, 14, 0.68)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 58px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, W / 2, H / 2 - 10);
  ctx.fillStyle = "#c6d5ef";
  ctx.font = "500 20px Inter, sans-serif";
  ctx.fillText(subtitle, W / 2, H / 2 + 30);
}

function updateHud() {
  if (!state) return;
  scoreEl.textContent = state.score.toString();
  waveEl.textContent = state.wave.toString();
  livesEl.textContent = state.lives.toString();
  chargeEl.textContent = `${Math.floor(state.charge)}%`;
  sectorEl.textContent = `${(sectors[state.sector] || sectors[0]).name} ${state.sectorLevel}`;
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
  }
  keys.add(key);

  if (key === "shift") triggerNova();
  if (key === "p" && state && !state.gameOver) {
    state.paused = !state.paused;
    if (!state.paused) lastTime = performance.now();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", startGame);

showOverlay(
  "Starline Breaker",
  "Move with WASD or arrows. Fire with Space. Use Shift when charge is full. Collect cores to upgrade.",
  "Start Mission",
);

if (new URLSearchParams(window.location.search).has("autostart")) {
  startGame();
}
