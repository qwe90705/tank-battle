/* ============================================================
 * 坦克大战 · 关卡生成
 * 战场 26×26 格（每格 16px）。为了保证可玩性与安全导航：
 *   - 中央走廊（列 10..15）永远留空，左右两侧装饰互不封死对方；
 *   - 左右对称：凡在左列 c 放置的物件同时镜像到 25-c；
 *   - 出生点与玩家出生区域在生成后被清理。
 * ============================================================ */

const TILE = 16;
const ROWS = 26;
const COLS = 26;

// 格子位掩码
const C_EMPTY = 0;
const C_BRICK = 1;
const C_STEEL = 2;
const C_WATER = 4;
const C_BUSH = 8;

// 基地（老鹰）：行 24-25，列 12-13
const BASE_R1 = 24, BASE_R2 = 25, BASE_C1 = 12, BASE_C2 = 13;
// 玩家出生：列 8-9，行 24-25
const PLAYER_X = 8 * TILE, PLAYER_Y = 24 * TILE;
// 敌方三个出生口
const ENEMY_SPAWNS = [
  { x: 0 * TILE, y: 0 },
  { x: 12 * TILE, y: 0 },
  { x: 24 * TILE, y: 0 },
];

// 玩家火力点数上限
const MAX_POWER = 2;

function emptyCells() {
  const cells = [];
  for (let r = 0; r < ROWS; r++) cells.push(new Uint8Array(COLS));
  return cells;
}

// 镜像放置：写入 (r, c) 与 (r, 25-c)。c 限制在 0..11，保证中央走廊留空
function put(cells, r, c, bit) {
  if (r < 0 || r >= ROWS || c < 0 || c > 11) return;
  cells[r][c] |= bit;
  cells[r][25 - c] |= bit;
}

// 线性同余伪随机，保证每关生成结果稳定
function mulberry(seed) {
  let s = seed >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* 每关装饰参数：
 * cols   参与墙体装饰的列数（镜像后每列成对）
 * steel  钢墙数量
 * water  水面块数量
 * bush   灌木块数量
 * fort   基地上方守卫砖层数
 */
const LEVEL_PARAM = [
  { cols: 2, steel: 2, water: 1, bush: 4, fort: 1 },
  { cols: 2, steel: 4, water: 2, bush: 5, fort: 1 },
  { cols: 3, steel: 4, water: 3, bush: 6, fort: 1 },
  { cols: 3, steel: 6, water: 2, bush: 5, fort: 1 },
  { cols: 3, steel: 7, water: 3, bush: 7, fort: 2 },
  { cols: 3, steel: 8, water: 3, bush: 6, fort: 2 },
];
const LEVELS = LEVEL_PARAM;   // 关卡总数 = 6

// 指定列上相隔 6 行放置 2 格高的砖墙短节，形成“虚线墙”，留出足够穿越空隙
function dashColumns(cells, count, rnd) {
  const used = new Set();
  let guard = 0;
  while (used.size < count && guard++ < 30) {
    const c = 2 + Math.floor(rnd() * 7); // 列 2..8
    if (used.has(c)) continue;
    used.add(c);
    for (let r = 4; r <= 19; r += 6) {
      put(cells, r, c, C_BRICK);
      put(cells, r + 1, c, C_BRICK);
    }
  }
}

// 在任意空旷格放入 N 个单格物件
function scatter(cells, n, bit, rnd) {
  let done = 0, guard = 0;
  while (done < n && guard++ < n * 30) {
    const c = Math.floor(rnd() * 9);     // 0..8
    const r = 3 + Math.floor(rnd() * 20); // 3..22
    if (cells[r][c] !== C_EMPTY) continue;
    if (bit === C_WATER && c <= 1 && (r <= 4 || r >= 18)) continue; // 别挡出生/边路太久
    put(cells, r, c, bit);
    done++;
  }
}

// 基地上方守卫（破坏后敌方炮弹才能直击老鹰）
function fortify(cells, layers) {
  for (let i = 0; i < layers; i++) {
    const rr = 21 - i;
    if (rr < 0) break;
    for (let c = 10; c <= 15; c++) cells[rr][c] |= C_BRICK;
  }
}

// 清理出生点 / 玩家出生区一小片空地
function carve(cells) {
  const areas = [
    [0, 0, 3, 2],
    [0, 12, 3, 2],
    [0, 24, 3, 2],
    [24, 8, 2, 2],
  ];
  for (const [r0, c0, dr, dc] of areas) {
    for (let r = r0; r < r0 + dr && r < ROWS; r++) {
      for (let c = c0; c < c0 + dc; c++) {
        cells[r][c] &= (C_WATER | C_BUSH); // 只清砖/钢
      }
    }
  }
}

// 组装一关的战场与敌人
function getLevelData(index) {
  const cells = emptyCells();
  const level = index % LEVELS.length;
  const param = LEVEL_PARAM[level];
  const rnd = mulberry(1200 + level * 7919);

  dashColumns(cells, param.cols, rnd);
  scatter(cells, param.steel, C_STEEL, rnd);
  scatter(cells, param.water, C_WATER, rnd);
  scatter(cells, param.bush, C_BUSH, rnd);
  fortify(cells, param.fort);
  carve(cells);

  const roster = weightedRoster(index + 1);
  return {
    index,
    cells,
    roster,
    activeCap: 4,
    spawnInterval: level >= 4 ? 1.5 : level >= 2 ? 1.7 : 2.0,
  };
}

// 敌方生成表：类型 0 普通 / 1 快速 / 2 装甲 / 3 重甲
// 普通、快速在前，装甲、重甲序列靠后（越打越强）
function weightedRoster(stage) {
  const n = stage;
  const list = [];
  const counts = [
    Math.round(Math.max(8, 14 - n * 1.6)),
    Math.round(Math.max(2, n * 1.5 + 1)),
    Math.max(0, n - 2),
    Math.max(0, n - 5),
  ];
  for (let t = 0; t < counts.length; t++) {
    for (let i = 0; i < counts[t]; i++) list.push(t);
  }
  // 轻量洗牌（普通/快速混排），随后把装甲/重甲稳定移到序列后段
  const rnd = mulberry(500 + stage * 104729);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
  }
  return list.filter(t => t <= 1).concat(list.filter(t => t > 1));
}
