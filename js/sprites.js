/* ============================================================
 * 绘图：格子纹理、坦克、道具、老鹰 等（全部用 rect 像素风绘制）
 * ============================================================ */

// 16×16 格子纹理离屏图
const TILE_ART = (() => {
  function mk(size) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    return { c, g: c.getContext('2d') };
  }

  function brickTile() {
    const { g, c } = mk(16);
    g.fillStyle = '#b34428';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#7e2b18';            // 砖缝
    g.fillRect(0, 7, 16, 2);            // 横向缝（第 7 像素）
    g.fillRect(7, 0, 2, 7);             // 下半左块
    g.fillRect(7, 9, 2, 7);             // 上半右块
    g.fillStyle = '#d96b4a';            // 受光面
    g.fillRect(0, 0, 16, 1);
    g.fillStyle = '#6d2113';
    g.fillRect(0, 15, 16, 1);
    return c;
  }

  function steelTile() {
    const { g, c } = mk(16);
    g.fillStyle = '#c7ccd4';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#eef1f5';
    g.fillRect(0, 0, 16, 2);
    g.fillStyle = '#8f97a3';
    g.fillRect(0, 5, 16, 6);            // 中横条
    g.fillRect(5, 0, 6, 16);            // 中竖条
    g.fillStyle = '#b0b7c2';
    g.fillRect(5, 5, 6, 6);
    g.fillStyle = '#d9dee5';
    g.fillRect(6, 6, 4, 4);
    return c;
  }

  function waterTile() {
    const { g, c } = mk(16);
    g.fillStyle = '#1f4fbf';
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#5b8cff';
    for (let y = 2; y < 16; y += 5) {
      g.fillRect(0, y, 16, 2);
    }
    g.fillStyle = '#9cc0ff';
    g.fillRect(0, 2, 16, 1);
    return c;
  }

  function bushTile() {
    const { g, c } = mk(16);
    g.clearRect(0, 0, 16, 16);
    g.fillStyle = '#2f8f3f';
    for (const [x, y, r] of [[2, 3, 4], [9, 2, 4], [12, 7, 3], [6, 6, 5], [2, 9, 4], [11, 11, 4]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#3fb54f';
    for (const [x, y, r] of [[4, 4, 3], [10, 4, 3], [7, 8, 3], [3, 11, 2], [12, 9, 3]]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }

  return { '#': brickTile(), 'S': steelTile(), 'W': waterTile(), 'G': bushTile() };
})();

/* ---------------- 坦克绘制（朝上版，旋转复用） ---------------- */
// dir: 0上 1右 2下 3左；color: {body,trim}
function drawTank(g, tank, time = 0) {
  if (tank.spawn > 0 && Math.floor(time * 12) % 2 === 0) return; // 出生闪烁
  const s = TANK;
  g.save();
  g.translate(tank.x + s / 2, tank.y + s / 2);
  g.rotate(tank.dir * Math.PI / 2);
  // 履带（左右两条）——朝上造型
  g.fillStyle = shade(tank.color.trim, -0.4);
  g.fillRect(-s / 2, -s / 2, s, s);
  g.fillStyle = '#3a3f45';
  for (let y = -s / 2 + 3; y < s / 2 - 3; y += 5) {
    g.fillRect(-s / 2 + 1, y, 3, 2);
    g.fillRect(s / 2 - 4, y, 3, 2);
  }
  // 车体
  g.fillStyle = tank.color.body;
  g.fillRect(-11, -9, 22, 18);
  g.strokeStyle = tank.color.trim;
  g.lineWidth = 2;
  g.strokeRect(-11, -9, 22, 18);
  g.fillStyle = tank.color.trim;
  g.fillRect(-3, -3, 6, 6); // 舱盖
  // 炮管
  g.fillStyle = tank.color.trim;
  g.fillRect(-3, -21, 6, 13);
  g.restore();

  if (tank.shield > 0) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 12);
    g.save();
    g.translate(tank.x + s / 2, tank.y + s / 2);
    g.strokeStyle = `rgba(120,190,255,${0.5 + pulse * 0.4})`;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, s * 0.72, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = `rgba(120,190,255,${0.12 + pulse * 0.1})`;
    g.beginPath();
    g.arc(0, 0, s * 0.72, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  if (tank.frozen) {
    g.save();
    g.translate(tank.x + s / 2, tank.y + s / 2);
    g.strokeStyle = 'rgba(160,220,255,0.85)';
    g.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 / 3) * i;
      g.beginPath();
      g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
      g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20);
      g.stroke();
    }
    g.restore();
  }
}

// 简单颜色明暗
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p) + r;
  gg = Math.round((t - gg) * p) + gg;
  b = Math.round((t - b) * p) + b;
  return `rgb(${r},${gg},${b})`;
}

// 老鹰（基地）32×32
function drawEagle(g, x, y, time = 0) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#f5d442';
  g.fillRect(10, 2, 12, 6);     // 冠
  g.fillRect(6, 6, 20, 8);      // 头
  g.fillRect(2, 12, 28, 6);     // 胸/翼上
  g.fillRect(14, 12, 4, 10);    // 颈
  g.fillRect(6, 16, 20, 8);     // 躯干
  g.fillRect(0, 18, 32, 8);     // 展翼下沿
  g.fillStyle = '#e0a91f';
  g.fillRect(4, 18, 4, 6);      // 左翼羽
  g.fillRect(24, 18, 4, 6);     // 右翼羽
  g.fillRect(14, 22, 4, 8);     // 腿
  g.fillStyle = '#a86f00';
  g.fillRect(0, 26, 3, 2);
  g.fillRect(29, 26, 3, 2);
  g.restore();
}

// 道具图标（kind: 0-4），绘制于 32 见方中心
const PU_ART = [
  { label: '★', color: '#ffd23f' },   // 火力
  { label: '＋', color: '#ff5a5f' },   // 生命
  { label: '⬤', color: '#5cc9ff' },   // 护盾
  { label: '✸', color: '#ffb23f' },   // 炸弹
  { label: '◷', color: '#9be5ff' },   // 冻结
];

function drawPowerup(g, item, time) {
  const cx = item.x + TANK / 2, cy = item.y + TANK / 2 + Math.sin(time * 3) * 2;
  const art = PU_ART[item.kind];
  g.save();
  g.translate(cx, cy);
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.arc(1, 1, 13, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = art.color;
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, 12, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = '#3a2410';
  g.font = 'bold 15px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(art.label, 0, 1);
  g.restore();
}

// HUD 里的小坦克图标（生命数）
function drawLifeIcon(g, x, y, size, color) {
  g.save();
  g.fillStyle = shade(color.trim, -0.4);
  g.fillRect(x, y + 1, size, size - 2);
  g.fillStyle = color.body;
  g.fillRect(x + size * 0.2, y + size * 0.2, size * 0.6, size * 0.6);
  g.fillStyle = color.trim;
  g.fillRect(x + size * 0.45, y + size * 0.25, size * 0.1, size * 0.4); // 炮口朝上
  g.restore();
}
