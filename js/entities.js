/* ============================================================
 * 实体工厂与数值配置（实体多为纯对象，行为逻辑集中在 game.js）
 * ============================================================ */

// 方向：0=上 1=右 2=下 3=左
const DIRS_X = [0, 1, 0, -1];
const DIRS_Y = [-1, 0, 1, 0];

// 坦克本体 32px = 2 格；命中框略小，便于贴近墙面
const TANK = 32;
const TANK_HIT = 30;

// 敌人类型表：0 普通 / 1 快速 / 2 装甲 / 3 重甲
const ENEMY_TYPES = [
  { hp: 1, speed: 92,  score: 100, fire: [2.2, 4.6] },
  { hp: 1, speed: 185, score: 200, fire: [1.7, 3.3] },
  { hp: 2, speed: 72,  score: 300, fire: [2.6, 5.0] },
  { hp: 3, speed: 60,  score: 400, fire: [1.2, 2.6] },
];

const ENEMY_COLORS = [
  { body: '#b7bfca', trim: '#6c747f' }, // 普通（浅灰）
  { body: '#eef1f4', trim: '#8a929c' }, // 快速（近白）
  { body: '#4caf50', trim: '#265c29' }, // 装甲（绿）
  { body: '#e0465a', trim: '#7a1f2c' }, // 重甲（红）
];

const PLAYER_COLOR = { body: '#f7c33b', trim: '#7a5a00' };

// 玩家参数
const PLAYER_SPEED = 165;
const PLAYER_SHOOT_CD = 0.30;
const PLAYER_SPAWN_TIME = 2.6;

// 子弹
const PLAYER_BULLET_SPEED = 320;
const ENEMY_BULLET_SPEED = 210;

// 道具种类
const PU_STAR = 0, PU_LIFE = 1, PU_SHIELD = 2, PU_BOMB = 3, PU_FREEZE = 4;
const PU_COUNT = 5;

function createPlayer() {
  return {
    x: PLAYER_X, y: PLAYER_Y, dir: 0, moving: false,
    alive: true, color: PLAYER_COLOR, speed: PLAYER_SPEED,
    power: 0, shootCd: 0, spawn: PLAYER_SPAWN_TIME, shield: 0,
    lives: 3, locked: true,
  };
}

function createEnemy(type, x, y) {
  const spec = ENEMY_TYPES[type];
  return {
    x, y, dir: 2, moving: true, type,
    color: ENEMY_COLORS[type],
    hp: spec.hp, speed: spec.speed, score: spec.score,
    shootTimer: 1.5 + Math.random() * 2,
    aiTimer: 0.2 + Math.random() * 0.5,
    alive: true, frozen: false, spawn: 1.0, blocked: false,
    strong: type >= 3,
  };
}

function createBullet(x, y, dir, speed, team, strong) {
  return { x, y, dir, speed, team, strong, dead: false, size: 6 };
}

// 道具出现在被摧毁坦克的位置，2 格见方
function createPowerup(kind, x, y) {
  return { kind, x, y, t: 0, dead: false };
}

/* ---------- 粒子 ---------- */
const BOOM_COLORS = ['#ffd23f', '#ff9f1c', '#ff6b35', '#ffffff', '#ff4136'];

function spawnBurst(parts, cx, cy, big = false) {
  const n = big ? 26 : 12;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (big ? 130 : 70) * (0.3 + Math.random() * 0.9);
    parts.push({
      x: cx + (Math.random() - 0.5) * 16,
      y: cy + (Math.random() - 0.5) * 16,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      size: big ? 5 : 4,
      color: BOOM_COLORS[(Math.random() * BOOM_COLORS.length) | 0],
      life: big ? 0.7 : 0.4,
      max: big ? 0.7 : 0.4,
    });
  }
}
