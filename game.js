const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const scoreEl = document.querySelector("#score");
const waveEl = document.querySelector("#wave");
const livesEl = document.querySelector("#lives");
const chargeEl = document.querySelector("#charge");
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

function createState() {
  return {
    running: true,
    paused: false,
    gameOver: false,
    score: 0,
    wave: 1,
    lives: 3,
    charge: 0,
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
    nextWaveKills: 10,
    bossSpawned: false,
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
  const dt = Math.min((now - lastTime) / 1000, 0.033);
  lastTime = now;

  if (state.running && !state.paused && !state.gameOver) {
    update(dt);
  }
  draw();
  updateHud();

  if (state.running) {
    animationId = requestAnimationFrame(loop);
  }
}

function update(dt) {
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

  p.x = clamp(p.x + vx * p.speed * dt, p.r + 8, W - p.r - 8);
  p.y = clamp(p.y + vy * p.speed * dt, H * 0.38, H - p.r - 14);
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
  const spread = p.heat > 0.55 ? 15 : 9;
  state.bullets.push({ x: p.x - spread, y: p.y - 18, vx: -45, vy: -760, r: 4, damage: 1 });
  state.bullets.push({ x: p.x + spread, y: p.y - 18, vx: 45, vy: -760, r: 4, damage: 1 });
  p.fireCooldown = 0.13;
  p.heat = clamp(p.heat + 0.08, 0, 1);
}

function triggerNova() {
  if (!state || state.paused || state.gameOver || state.charge < 100) return;
  state.charge = 0;
  for (const enemy of state.enemies) {
    enemy.hp -= enemy.boss ? 8 : 4;
    burst(enemy.x, enemy.y, enemy.boss ? "#ffca5f" : "#5ce7ff", enemy.boss ? 36 : 18);
  }
  state.enemyBullets = [];
  burst(state.player.x, state.player.y, "#54e0a7", 58);
}

function updateBullets(dt) {
  for (const b of state.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  state.bullets = state.bullets.filter((b) => b.y > -30 && b.x > -40 && b.x < W + 40);
}

function spawnEnemies(dt) {
  state.spawnTimer -= dt;
  if (state.spawnTimer > 0 || state.bossSpawned) return;

  const wave = state.wave;
  const isHeavy = Math.random() < Math.min(0.12 + wave * 0.025, 0.34);
  const enemy = {
    x: rand(44, W - 44),
    y: -40,
    r: isHeavy ? 24 : 17,
    hp: isHeavy ? 4 + Math.floor(wave / 2) : 2 + Math.floor(wave / 3),
    maxHp: 0,
    speed: isHeavy ? rand(55, 95) : rand(95, 165),
    sway: rand(0.8, 2.4),
    phase: rand(0, Math.PI * 2),
    fireTimer: rand(1.0, 2.4),
    points: isHeavy ? 80 : 40,
    heavy: isHeavy,
    boss: false,
  };
  enemy.maxHp = enemy.hp;
  state.enemies.push(enemy);
  state.spawnTimer = Math.max(0.18, 0.85 - wave * 0.045);
}

function spawnBoss() {
  state.bossSpawned = true;
  state.enemies.push({
    x: W / 2,
    y: -82,
    r: 52,
    hp: 34 + state.wave * 6,
    maxHp: 34 + state.wave * 6,
    speed: 48,
    sway: 1.2,
    phase: 0,
    fireTimer: 0.9,
    points: 850,
    heavy: true,
    boss: true,
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
      enemy.fireTimer = enemy.boss ? 0.55 : rand(1.2, 2.8) - state.wave * 0.035;
    }
  }

  for (const enemy of state.enemies.filter((e) => e.y > H + 70)) {
    damagePlayer();
    enemy.hp = -999;
  }

  state.enemies = state.enemies.filter((enemy) => enemy.hp > 0 && enemy.y < H + 90);
}

function fireEnemy(enemy) {
  const angle = Math.atan2(state.player.y - enemy.y, state.player.x - enemy.x);
  const speed = enemy.boss ? 250 : 205;
  const shots = enemy.boss ? [-0.34, 0, 0.34] : [0];
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
    if (p.invulnerable <= 0 && dist(p, enemy) < p.r + enemy.r * 0.78) {
      enemy.hp = 0;
      killEnemy(enemy, false);
      damagePlayer();
    }
  }

  for (const bullet of state.enemyBullets) {
    if (p.invulnerable <= 0 && dist(p, bullet) < p.r + bullet.r) {
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
    if (Math.random() < (enemy.boss ? 1 : 0.1)) {
      state.powerups.push({
        x: enemy.x,
        y: enemy.y,
        vy: 150,
        r: 13,
        spin: 0,
        kind: Math.random() < 0.55 ? "life" : "charge",
      });
    }
  }
  if (enemy.boss) {
    state.bossSpawned = false;
    state.wave += 1;
    state.waveKills = 0;
    state.nextWaveKills = 9 + state.wave * 2;
    state.score += 200 * state.wave;
  }
}

function damagePlayer() {
  const p = state.player;
  if (p.invulnerable > 0) return;
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
  if (kind === "life") {
    state.lives = Math.min(5, state.lives + 1);
  } else {
    state.charge = 100;
  }
  burst(state.player.x, state.player.y, kind === "life" ? "#54e0a7" : "#ffca5f", 28);
}

function maybeAdvanceWave() {
  if (state.waveKills >= state.nextWaveKills && !state.bossSpawned) {
    if (state.wave % 3 === 0 && !state.enemies.some((e) => e.boss)) {
      spawnBoss();
      state.waveKills = 0;
      return;
    }
    state.wave += 1;
    state.waveKills = 0;
    state.nextWaveKills = 9 + state.wave * 2;
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

  if (state.paused && !state.gameOver) {
    drawCenterText("Paused", "Press P to resume");
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#060916");
  gradient.addColorStop(0.5, "#091226");
  gradient.addColorStop(1, "#04060b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  for (const star of state.stars) {
    ctx.globalAlpha = star.alpha;
    ctx.fillStyle = "#dbe9ff";
    ctx.fillRect(star.x, star.y, star.size, star.size * 1.8);
  }
  ctx.globalAlpha = 1;
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
  ctx.restore();
}

function drawBullets() {
  for (const b of state.bullets) {
    ctx.fillStyle = "#7df7ff";
    ctx.beginPath();
    ctx.roundRect(b.x - 3, b.y - 13, 6, 20, 4);
    ctx.fill();
  }

  ctx.fillStyle = "#ff667d";
  for (const b of state.enemyBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawEnemies() {
  for (const enemy of state.enemies) {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = enemy.boss ? "#f85f73" : enemy.heavy ? "#ff9e64" : "#6f8dff";
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
      drawBar(enemy.x - 65, enemy.y - 75, 130, 8, enemy.hp / enemy.maxHp, "#ffca5f");
    }
  }
}

function drawPowerups() {
  for (const power of state.powerups) {
    ctx.save();
    ctx.translate(power.x, power.y);
    ctx.rotate(power.spin);
    ctx.strokeStyle = power.kind === "life" ? "#54e0a7" : "#ffca5f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.rect(-10, -10, 20, 20);
    ctx.stroke();
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
  "Move with WASD or arrows. Fire with Space. Use Shift when charge is full.",
  "Start Mission",
);
