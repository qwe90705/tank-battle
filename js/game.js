/* ============================================================
 * 坦克大战 · 主游戏逻辑
 * ============================================================ */

const FIELD = COLS * TILE;            // 416
const PANEL_W = 96;                    // 右侧信息栏宽度
const CV_W = FIELD + PANEL_W;          // 512
const CV_H = FIELD;                    // 416
const HIT = 24;                        // 命中框（碰撞用），32 坦克内缩 4px
const HI_KEY = 'tankbattle_hi_v1';

class Game {
  constructor() {
    this.cv = document.getElementById('game');
    this.g = this.cv.getContext('2d');
    this.g.imageSmoothingEnabled = false;

    this.terrain = document.createElement('canvas');
    this.terrain.width = FIELD; this.terrain.height = FIELD;
    this.tctx = this.terrain.getContext('2d');
    this.cells = emptyCells();
    this._rebuildTerrain();

    this.keys = {};
    this.player = createPlayer();
    this.lives = 3;
    this.score = 0;
    this.hi = Number(localStorage.getItem(HI_KEY)) || 0;
    this.state = 'menu';            // menu|intro|play|pause|clear|over|win
    this.stateT = 0;
    this.level = 0;
    this.roster = [];
    this.rosterIdx = 0;
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.powerups = [];
    this.freeze = 0;
    this.banner = '';
    this.bannerT = 0;
    this.time = 0;
    this.respawnT = 0;
    this._keepPower = 0;
    this.baseAlive = true;
    this.muted = false;
    this._bind();
    this._loop();
  }

  /* ---------- 输入 ---------- */
  _bind() {
    const down = (e) => {
      const c = e.code;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(c)) e.preventDefault();
      if (!e.repeat) SFX.unlock();
      this.keys[c] = true;
      if (e.repeat) return;
      if (c === 'Enter') this._onEnter();
      if (c === 'KeyP') this._togglePause();
      if (c === 'KeyM') this._toggleMute();
    };
    const up = (e) => { this.keys[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.cv.addEventListener('pointerdown', () => SFX.unlock());
  }

  _onEnter() {
    if (this.state === 'menu' || this.state === 'over' || this.state === 'win') this.newGame();
    else if (this.state === 'clear') this._advanceLevel();
    else if (this.state === 'pause') this._togglePause();
  }

  _togglePause() {
    if (this.state === 'play' || this.state === 'intro') this.state = 'pause';
    else if (this.state === 'pause') this.state = 'play';
  }
  _toggleMute() {
    this.muted = !this.muted;
    SFX.setMuted(this.muted);
    this._flash(`音效 ${this.muted ? '关' : '开'}`);
  }

  /* ---------- 流程 ---------- */
  newGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 0;
    this.player = createPlayer();
    this.startLevel(0);
  }

  startLevel(i) {
    const data = getLevelData(i);
    this.level = i;
    this.cells = data.cells;
    this.roster = data.roster.slice();
    this.rosterIdx = 0;
    this.spawnT = 1.0;
    this.spawnInterval = data.spawnInterval;
    this.enemies = [];
    this.bullets = [];
    this.particles = [];
    this.powerups = [];
    this.freeze = 0;
    this.baseAlive = true;
    this.baseDeathT = 0;
    this.killsThisLevel = 0;
    this._rebuildTerrain();
    // 玩家复活（火力跨关保留）
    this.player.alive = true;
    this.player.x = PLAYER_X; this.player.y = PLAYER_Y;
    this.player.dir = 0; this.player.moving = false;
    this.player.spawn = PLAYER_SPAWN_TIME;
    this.player.shield = 0; this.player.shootCd = 0;
    this.state = 'intro';
    this.stateT = 2.0;
    this._flash(`第 ${i + 1} 关`);
  }

  _advanceLevel() {
    if (this.level + 1 >= LEVELS.length) {
      this.state = 'win';
      this._saveHi();
    } else {
      this.startLevel(this.level + 1);
    }
  }

  loseGame() {
    this.state = 'over';
    this._saveHi();
    SFX.gameOver();
    this._rebuildOver();
  }

  _saveHi() {
    if (this.score > this.hi) {
      this.hi = this.score;
      localStorage.setItem(HI_KEY, String(this.hi));
    }
  }

  /* ---------- 地形 ---------- */
  _rebuildTerrain() {
    const g = this.tctx;
    g.fillStyle = '#14171c';
    g.fillRect(0, 0, FIELD, FIELD);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this._paintCell(g, r, c);
      }
    }
  }

  _paintCell(g, r, c) {
    const x = c * TILE, y = r * TILE;
    const bit = this.cells[r][c];
    if (bit === C_EMPTY) return;
    const art = bit & C_BRICK ? TILE_ART['#']
      : bit & C_STEEL ? TILE_ART['S']
        : bit & C_WATER ? TILE_ART['W']
          : bit & C_BUSH ? TILE_ART['G'] : null;
    if (art) g.drawImage(art, x, y);
    else { g.fillStyle = '#14171c'; g.fillRect(x, y, TILE, TILE); }
  }

  // 破坏某格砖/钢并重绘
  _breakCell(r, c) {
    const bit = this.cells[r][c];
    if (bit & (C_BRICK | C_STEEL)) {
      this.cells[r][c] = bit & ~(C_BRICK | C_STEEL);
      const g = this.tctx;
      g.fillStyle = '#14171c';
      g.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
  }

  /* ---------- 碰撞工具 ---------- */
  _cellSolid(r, c) {
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return true;
    return (this.cells[r][c] & (C_BRICK | C_STEEL | C_WATER)) !== 0;
  }

  _hitRect(x, y) {
    const o = (TANK - HIT) / 2;
    return { x: x + o, y: y + o, w: HIT, h: HIT };
  }

  _rectOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // 坦克能否放置于 (x,y)：地图 + 边界 + 基地 + 其它坦克
  _canPlace(x, y, self) {
    const o = (TANK - HIT) / 2;
    const hr = { x: x + o, y: y + o, w: HIT, h: HIT };
    const c0 = Math.floor(hr.x / TILE), c1 = Math.floor((hr.x + hr.w - 1) / TILE);
    const r0 = Math.floor(hr.y / TILE), r1 = Math.floor((hr.y + hr.h - 1) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) if (this._cellSolid(r, c)) return false;
    }
    if (this.baseAlive) {
      const base = { x: BASE_C1 * TILE, y: BASE_R1 * TILE, w: TANK, h: TANK };
      if (this._rectOverlap(hr, base)) return false;
    }
    for (const t of this._allTanks()) {
      if (t === self || !t.alive) continue;
      if (this._rectOverlap(hr, this._hitRect(t.x, t.y))) return false;
    }
    return true;
  }

  _allTanks() {
    return this.player.alive ? [this.player].concat(this.enemies.filter(e => e.alive)) : this.enemies.filter(e => e.alive);
  }

  // 尝试沿当前方向前进；返回是否被挡
  _stepTank(t, dt) {
    const v = t.speed * dt;
    if (!v) return false;
    const dx = DIRS_X[t.dir] * v, dy = DIRS_Y[t.dir] * v;
    if (this._canPlace(t.x + dx, t.y + dy, t)) {
      t.x += dx; t.y += dy;
      t.blocked = false;
      return false;
    }
    t.blocked = true;
    return true;
  }

  // 转向：直接改朝向，是否能动由下一步决定
  _turn(t, dir) {
    if (dir < 0) return;
    if (dir === (t.dir + 2) % 4) {
      // 180° 掉头：必须给足空间，否则原地卡住（倒退方向也应可行）
      t.dir = dir;
      return;
    }
    t.dir = dir;
  }

  /* ---------- 主循环 ---------- */
  _loop() {
    const frame = (ts) => {
      const dt = Math.min(0.05, this._last ? (ts - this._last) / 1000 : 0.016);
      this._last = ts;
      this.time += dt;
      if (this.state === 'play' || this.state === 'intro') this._update(dt);
      else if (this.state === 'clear') {
        this.stateT -= dt;
        if (this.stateT <= 0) this._advanceLevel();
      }
      if (this.bannerT > 0) this.bannerT -= dt;
      this._render();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  /* ---------- 每帧更新 ---------- */
  _update(dt) {
    if (this.state === 'intro') {
      this.stateT -= dt;
      if (this.stateT <= 0) this.state = 'play';
      this._updateParticles(dt);
      return;
    }
    if (this.state !== 'play') return;

    if (this.freeze > 0) this.freeze -= dt;
    this._spawnEnemies(dt);
    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._updateBullets(dt);
    this._updatePowerups(dt);
    this._updateParticles(dt);

    // 基地死亡动画
    if (!this.baseAlive) {
      this.baseDeathT -= dt;
      if (this.baseDeathT <= 0) this.loseGame();
    }

    // 过关判断
    if (this.rosterIdx >= this.roster.length && this.enemies.length === 0 && this.baseAlive) {
      this._levelCleared();
    }
  }

  _levelCleared() {
    const bonus = 300 + (LEVELS.length - this.level) * 250;
    this.score += bonus;
    this._saveHi();
    this.state = 'clear';
    this.stateT = 2.6;
    SFX.levelClear();
    this.banner = `过关！奖励 ${bonus} 分`;
    this.bannerT = 2.0;
  }

  _rebuildOver() { /* 覆盖层由 render 绘制 */ }

  _updateParticles(dt) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 3 * dt); p.vy *= (1 - 3 * dt);
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  /* ---------- 敌人生成 ---------- */
  _spawnEnemies(dt) {
    this.spawnT -= dt;
    while (this.spawnT <= 0 && this.rosterIdx < this.roster.length) {
      this.spawnT += this.spawnInterval;
      const active = this.enemies.filter(e => e.alive).length;
      if (active >= 4) break;
      const free = ENEMY_SPAWNS.filter(s => this._canPlace(s.x, s.y, null));
      if (!free.length) break;
      const s = free[(Math.random() * free.length) | 0];
      const e = createEnemy(this.roster[this.rosterIdx++], s.x, s.y);
      e.frozen = this.freeze > 0;
      this.enemies.push(e);
    }
  }

  /* ---------- 玩家 ---------- */
  _updatePlayer(dt) {
    const p = this.player;
    if (p.alive) {
      if (p.spawn > 0) p.spawn -= dt;
      if (p.shield > 0) p.shield -= dt;
      if (p.shootCd > 0) p.shootCd -= dt;

      const k = this.keys;
      let want = -1;
      const up = k['ArrowUp'] || k['KeyW'], dn = k['ArrowDown'] || k['KeyS'];
      const lf = k['ArrowLeft'] || k['KeyA'], rt = k['ArrowRight'] || k['KeyD'];
      if (up && !dn) want = 0;
      else if (dn && !up) want = 2;
      if (lf && !rt && !(up || dn)) want = 3;
      else if (rt && !lf && !(up || dn)) want = 1;

      if (want >= 0) {
        p.moving = true;
        if (want !== p.dir) this._turn(p, want);
      } else {
        p.moving = false;
      }
      if (p.moving && p.spawn <= 0) this._stepTank(p, dt);

      if (k['Space'] && p.spawn <= 0 && p.shootCd <= 0) {
        const max = p.power >= 1 ? 2 : 1;
        const active = this.bullets.filter(b => b.team === 'p').length;
        if (active < max) {
          this._fire(p, 'p', 1, max);
          p.shootCd = PLAYER_SHOOT_CD;
        }
      }
    } else {
      this.respawnT -= dt;
      if (this.respawnT <= 0) {
        // 出生点被敌人占据时稍后再试，避免卡住
        if (this._canPlace(PLAYER_X, PLAYER_Y, null)) {
          this.player = createPlayer();
          this.player.power = this._keepPower;
        } else {
          this.respawnT = 0.3;
        }
      }
    }
  }

  _fire(tank, team, mult, count = 1) {
    const speed = team === 'p'
      ? PLAYER_BULLET_SPEED * mult
      : tank.type === 1 ? ENEMY_BULLET_SPEED * 1.3 : ENEMY_BULLET_SPEED;
    const strong = team === 'p' ? tank.power >= MAX_POWER : tank.strong;
    const cx = tank.x + TANK / 2, cy = tank.y + TANK / 2;
    const fx = DIRS_X[tank.dir], fy = DIRS_Y[tank.dir];
    // 垂直方向的单位向量（用于双发偏移）
    const px = -fy, py = fx;
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : (i === 0 ? -7 : 7);
      const bx = cx + fx * 24 + px * off - 3;
      const by = cy + fy * 24 + py * off - 3;
      this.bullets.push(createBullet(bx, by, tank.dir, speed, team, strong));
    }
    if (team === 'p') SFX.shoot();
  }

  /* ---------- 敌人 AI ---------- */
  _updateEnemies(dt) {
    const frozen = this.freeze > 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      e.frozen = frozen;
      if (e.spawn > 0) { e.spawn -= dt; continue; }
      if (frozen) continue;

      e.aiTimer -= dt;
      if (e.aiTimer <= 0 || e.blocked) {
        e.aiTimer = 0.25 + Math.random() * 0.5;
        this._decide(e);
      }
      if (this._stepTank(e, dt)) this._decide(e);

      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = ENEMY_TYPES[e.type].fire[0] + Math.random() * (ENEMY_TYPES[e.type].fire[1] - ENEMY_TYPES[e.type].fire[0]);
        const enemyBullets = this.bullets.filter(b => b.team === 'e').length;
        if (enemyBullets < 4 && this.player.alive && this._lineOfSight(e)) this._fire(e, 'e', 1);
      }
    }
    this.enemies = this.enemies.filter(e => e.alive);
  }

  // 粗略的直线瞄准检测（同一行/列且中间无墙）
  _lineOfSight(e) {
    const p = this.player;
    if (p.spawn > 0) return false;
    const d = e.dir;
    if (d === 0 || d === 2) { // 上 / 下
      const cx = Math.floor((e.x + TANK / 2) / TILE);
      const pcx = Math.floor((p.x + TANK / 2) / TILE);
      if (cx !== pcx) return false;
      const step = d === 0 ? -1 : 1;
      const c = cx;
      const rowA = Math.floor((e.y + TANK) / TILE), rowB = Math.floor((p.y) / TILE);
      for (let r = rowA; r !== rowB && r >= 0 && r < ROWS; r += step) {
        if (this._cellSolid(r, c)) return false;
      }
      return true;
    } else {
      const cy = Math.floor((e.y + TANK / 2) / TILE);
      const pcy = Math.floor((p.y + TANK / 2) / TILE);
      if (cy !== pcy) return false;
      const step = d === 3 ? -1 : 1;
      const r = cy;
      const colA = Math.floor((e.x + TANK) / TILE), colB = Math.floor((p.x) / TILE);
      for (let c = colA; c !== colB && c >= 0 && c < COLS; c += step) {
        if (this._cellSolid(r, c)) return false;
      }
      return true;
    }
  }

  _decide(e) {
    const tcx = e.x + TANK / 2, tcy = e.y + TANK / 2;
    const roll = Math.random();
    let tx = BASE_C1 * TILE + TILE, ty = BASE_R1 * TILE + 4;   // 基地
    if (roll < 0.25 && this.player.alive && this.player.spawn <= 0) {
      tx = this.player.x + TANK / 2; ty = this.player.y + TANK / 2; // 追击玩家
    } else if (roll > 0.85) {
      tx = tcx + (Math.random() - 0.5) * 500; ty = tcy + (Math.random() - 0.5) * 500;
    }
    const dx = tx - tcx, dy = ty - tcy;
    const options = [];
    options.push(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0));
    options.push(2); // 向下倾向，逼近基地
    const horiz = dx > 0 ? 1 : 3;
    options.push(horiz);
    options.push((Math.random() * 4) | 0);
    for (const dir of options) {
      this._turn(e, dir);
      // 检查新朝向能否真正移动（前方 8px 无障碍）
      const dx8 = DIRS_X[dir] * 6, dy8 = DIRS_Y[dir] * 6;
      if (this._canPlace(e.x + dx8, e.y + dy8, e)) {
        e.blocked = false;
        return;
      }
    }
    e.moving = false; // 卡住原地待命
  }

  /* ---------- 子弹 ---------- */
  _updateBullets(dt) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      const dx = DIRS_X[b.dir] * b.speed * dt;
      const dy = DIRS_Y[b.dir] * b.speed * dt;
      b.x += dx; b.y += dy;

      // 出界
      if (b.x < 0 || b.y < 0 || b.x + b.size > FIELD || b.y + b.size > FIELD) { b.dead = true; continue; }

      // 命中坦克
      if (b.team === 'p') {
        for (const e of this.enemies) {
          if (!e.alive || e.spawn > 0) continue;
          if (this._rectOverlap({ x: b.x, y: b.y, w: b.size, h: b.size }, this._hitRect(e.x, e.y))) {
            b.dead = true;
            this._hitEnemy(e, b);
            break;
          }
        }
      } else if (this.player.alive && this.player.spawn <= 0 && this.player.shield <= 0) {
        if (this._rectOverlap({ x: b.x, y: b.y, w: b.size, h: b.size }, this._hitRect(this.player.x, this.player.y))) {
          b.dead = true;
          this._killPlayer();
        }
      }
      if (b.dead) continue;

      // 命中基地
      if (b.team === 'e' && this.baseAlive) {
        const base = { x: BASE_C1 * TILE, y: BASE_R1 * TILE, w: TANK, h: TANK };
        if (this._rectOverlap({ x: b.x, y: b.y, w: b.size, h: b.size }, base)) {
          b.dead = true;
          this._destroyBase();
          continue;
        }
      }

      // 命中墙体
      if (!b.dead) this._bulletVsTiles(b);
    }
    this.bullets = this.bullets.filter(b => !b.dead);
  }

  _bulletVsTiles(b) {
    const o = 1;
    const r0 = Math.floor((b.y + o) / TILE), r1 = Math.floor((b.y + b.size - o) / TILE);
    const c0 = Math.floor((b.x + o) / TILE), c1 = Math.floor((b.x + b.size - o) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || c < 0 || r >= ROWS || c >= COLS) continue;
        const bit = this.cells[r][c];
        if (bit & C_WATER) continue;          // 子弹可飞越水面
        if (bit & C_BRICK) {
          this._breakCell(r, c);
          spawnBurst(this.particles, c * TILE + 8, r * TILE + 8, false);
          SFX.brick();
          b.dead = true;
          return;
        }
        if (bit & C_STEEL) {
          if (b.strong) {
            this._breakCell(r, c);
            spawnBurst(this.particles, c * TILE + 8, r * TILE + 8, false);
            SFX.brick();
          } else {
            SFX.hitSteel();
            spawnBurst(this.particles, b.x + 3, b.y + 3, false);
          }
          b.dead = true;
          return;
        }
      }
    }
  }

  _hitEnemy(e, b) {
    e.hp -= 1;
    if (e.hp <= 0) {
      e.alive = false;
      this.score += e.score;
      this.killsThisLevel++;
      spawnBurst(this.particles, e.x + TANK / 2, e.y + TANK / 2, false);
      SFX.boom();
      this._maybeDrop(e);
    } else {
      spawnBurst(this.particles, e.x + TANK / 2, e.y + TANK / 2, false);
      SFX.hitSteel();
    }
  }

  _maybeDrop(e) {
    if (Math.random() > 0.16) return;
    const kinds = [];
    const w = [0.22, 0.18, 0.2, 0.2, 0.2];
    for (let i = 0; i < PU_COUNT; i++) for (let j = 0; j < Math.round(w[i] * 10); j++) kinds.push(i);
    const kind = kinds[(Math.random() * kinds.length) | 0];
    const x = Math.max(0, Math.min(FIELD - TANK, Math.round((e.x + TANK / 2) / TILE) * TILE - TILE));
    const y = Math.max(0, Math.min(FIELD - TANK, Math.round((e.y + TANK / 2) / TILE) * TILE - TILE));
    this.powerups.push(createPowerup(kind, x, y));
    SFX.power();
  }

  _killPlayer() {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    spawnBurst(this.particles, p.x + TANK / 2, p.y + TANK / 2, true);
    SFX.boom(true);
    this.bullets.forEach(b => { if (b.team === 'p') b.dead = true; });
    this.lives -= 1;
    this._keepPower = p.power;
    if (this.lives <= 0) {
      this.loseGame();
    } else {
      this.respawnT = 1.2;
    }
  }

  _destroyBase() {
    this.baseAlive = false;
    this.baseDeathT = 1.8;
    spawnBurst(this.particles, BASE_C1 * TILE + TILE, BASE_R1 * TILE + TILE, true);
    for (let i = 0; i < 6; i++) {
      spawnBurst(this.particles, BASE_C1 * TILE + TILE * 0.5 + Math.random() * 16, BASE_R1 * TILE + TILE, false);
    }
    SFX.boom(true);
    this._flash('基地被摧毁！');
  }

  /* ---------- 道具 ---------- */
  _updatePowerups(dt) {
    const p = this.player;
    for (const it of this.powerups) {
      it.t += dt;
      const dx = (it.x + TANK / 2) - (p.x + TANK / 2);
      const dy = (it.y + TANK / 2) - (p.y + TANK / 2);
      if (p.alive && Math.hypot(dx, dy) < 34) {
        it.dead = true;
        this._applyPower(it.kind);
      }
    }
    this.powerups = this.powerups.filter(i => !i.dead);
  }

  _applyPower(kind) {
    const p = this.player;
    switch (kind) {
      case PU_STAR: p.power = Math.min(p.power + 1, MAX_POWER); SFX.power(); this._flash('火力提升！'); break;
      case PU_LIFE: this.lives++; SFX.life(); this._flash('生命 +1'); break;
      case PU_SHIELD: p.shield = 8; SFX.shield(); this._flash('护盾启动'); break;
      case PU_BOMB: {
        SFX.boom(true);
        this._flash('清屏！');
        for (const e of this.enemies) {
          if (!e.alive) continue;
          e.alive = false;
          spawnBurst(this.particles, e.x + TANK / 2, e.y + TANK / 2, false);
        }
        this.enemies = this.enemies.filter(e => e.alive);
        break;
      }
      case PU_FREEZE: this.freeze = 6; SFX.freeze(); this._flash('敌人冻结'); break;
    }
  }

  /* ---------- 渲染 ---------- */
  _render() {
    const g = this.g;
    g.fillStyle = '#11141a';
    g.fillRect(0, 0, CV_W, CV_H);

    // 战场 + 实体
    g.drawImage(this.terrain, 0, 0);
    if (this.baseAlive) drawEagle(g, BASE_C1 * TILE, BASE_R1 * TILE, this.time);
    else {
      g.fillStyle = '#3a1616';
      g.fillRect(BASE_C1 * TILE, BASE_R1 * TILE, TANK, TANK);
    }

    for (const it of this.powerups) drawPowerup(g, it, this.time);
    for (const b of this.bullets) {
      g.fillStyle = b.team === 'p' ? '#ffe27a' : '#ff8a5a';
      g.fillRect(b.x, b.y, b.size, b.size);
      g.fillStyle = b.team === 'p' ? '#fff7d6' : '#ffd0b8';
      g.fillRect(b.x + 2, b.y + 2, 2, 2);
    }
    for (const e of this.enemies) if (e.alive) drawTank(g, e, this.time);
    if (this.player.alive) drawTank(g, this.player, this.time);
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.max);
      g.fillStyle = p.color;
      g.fillRect(p.x, p.y, p.size, p.size);
    }
    g.globalAlpha = 1;

    // 灌木覆盖层（画在坦克上方起遮蔽效果）
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (this.cells[r][c] & C_BUSH) g.drawImage(TILE_ART['G'], c * TILE, r * TILE);
      }
    }

    this._renderPanel(g);
    if (this.state === 'menu') this._renderMenu(g);
    else this._renderOverlays(g);
  }

  _renderPanel(g) {
    const x = FIELD + 10;
    g.fillStyle = '#20242c';
    g.fillRect(FIELD, 0, PANEL_W, CV_H);
    g.fillStyle = '#3a4150';
    g.fillRect(FIELD, 0, 1, CV_H);
    g.textBaseline = 'top';

    g.fillStyle = '#8b95a3';
    g.font = 'bold 11px sans-serif';
    g.fillText('分数', x, 14);
    g.fillStyle = '#ffe27a';
    g.font = 'bold 14px monospace';
    g.fillText(String(this.score).padStart(6, '0'), x, 28);

    g.fillStyle = '#8b95a3';
    g.font = 'bold 11px sans-serif';
    g.fillText('最高分', x, 52);
    g.fillStyle = '#9fd4ff';
    g.font = 'bold 13px monospace';
    g.fillText(String(Math.max(this.hi, this.score)).padStart(6, '0'), x, 66);

    g.fillStyle = '#8b95a3';
    g.font = 'bold 11px sans-serif';
    g.fillText('关卡', x, 90);
    g.fillStyle = '#e8edf4';
    g.font = 'bold 20px monospace';
    g.fillText(String(this.level + 1), x, 104);

    g.fillStyle = '#8b95a3';
    g.font = 'bold 11px sans-serif';
    g.fillText('火力', x, 134);
    g.font = '16px sans-serif';
    for (let i = 0; i <= MAX_POWER; i++) {
      g.fillStyle = i < this.player.power ? '#ffd23f' : '#454c58';
      g.fillText('★', x + i * 15, 148);
    }

    // 剩余敌人
    g.fillStyle = '#8b95a3';
    g.font = 'bold 11px sans-serif';
    g.fillText('敌人', x, 178);
    const remain = (this.roster.length - this.rosterIdx) + this.enemies.filter(e => e.alive).length;
    g.fillStyle = '#ff8a7a';
    g.font = 'bold 16px monospace';
    g.fillText(String(remain), x, 192);

    // 状态：冻结 / 护盾
    let yy = 224;
    g.font = 'bold 11px sans-serif';
    if (this.freeze > 0) {
      g.fillStyle = '#9be5ff';
      g.fillText('❄ 冻结', x, yy); yy += 18;
    }
    if (this.player.alive && this.player.shield > 0) {
      g.fillStyle = '#5cc9ff';
      g.fillText(`护盾 ${Math.ceil(this.player.shield)}`, x, yy); yy += 18;
    }

    // 生命
    g.fillStyle = '#8b95a3';
    g.fillText('生命', x, yy + 4);
    for (let i = 0; i < Math.max(0, this.lives); i++) {
      drawLifeIcon(g, x + i * 20, yy + 20, 16, PLAYER_COLOR);
    }

    g.fillStyle = '#5b6470';
    g.font = '10px sans-serif';
    g.fillText('M 音效', x, CV_H - 46);
    g.fillText('P 暂停', x, CV_H - 32);
    g.fillText('↑↓←→ 移动', x, CV_H - 18);
    g.fillText('空格 射击', x, CV_H - 4);
  }

  _overlay() {
    const g = this.g;
    g.fillStyle = 'rgba(0,0,0,0.62)';
    g.fillRect(0, 0, FIELD, CV_H);
  }

  _centerText(lines, y0, big = false) {
    const g = this.g;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let y = y0;
    const lineH = big ? 40 : 26;
    for (const ln of lines) {
      if (ln === '-') { y += 10; continue; }
      if (Array.isArray(ln)) {
        g.fillStyle = ln[1];
        g.font = ln[0];
        g.fillText(ln[2], FIELD / 2, y);
      } else {
        g.fillStyle = '#e8edf4';
        g.font = '16px "Microsoft YaHei", sans-serif';
        g.fillText(ln, FIELD / 2, y);
      }
      y += lineH;
    }
  }

  _renderMenu(g) {
    this._overlay();
    const b = Math.sin(this.time * 3) > -0.2;
    this._centerText([
      ['bold 40px monospace', '#ffd23f', 'TANK BATTLE'],
      ['bold 18px "Microsoft YaHei", sans-serif', '#e8edf4', '坦 克 大 战'],
      '-',
      '第 ' + LEVELS.length + ' 关  |  敌方坦克波次进攻',
      '守护基地（下方老鹰）',
      b ? ['bold 16px "Microsoft YaHei", sans-serif', '#fff', '按 Enter 开始'] : ['16px sans-serif', '#5b6470', '·'],
    ], 120, true);
    g.textAlign = 'left';
  }

  _renderOverlays(g) {
    g.textAlign = 'left';
    if (this.state === 'intro') {
      this._overlay();
      const t = Math.max(0, this.stateT);
      g.textAlign = 'center';
      g.fillStyle = '#ffd23f';
      g.font = 'bold 34px monospace';
      g.fillText(`STAGE ${this.level + 1}`, FIELD / 2, CV_H / 2 - 16);
      g.fillStyle = '#e8edf4';
      g.font = '16px "Microsoft YaHei", sans-serif';
      g.fillText(Math.ceil(t) > 0 ? '准备……' : '', FIELD / 2, CV_H / 2 + 18);
    } else if (this.state === 'pause') {
      this._overlay();
      this._centerText([['bold 26px sans-serif', '#fff', '已暂停'], ['14px sans-serif', '#8b95a3', '按 P 或 Enter 继续']], 150);
    } else if (this.state === 'clear') {
      this._overlay();
      this._centerText([['bold 26px "Microsoft YaHei", sans-serif', '#ffd23f', '关卡通过！'], '按 Enter 进入下一关'], 150);
    } else if (this.state === 'over') {
      this._overlay();
      this._centerText([
        ['bold 34px sans-serif', '#ff5a5f', 'GAME OVER'],
        this.score >= this.hi && this.score > 0 ? ['14px sans-serif', '#ffd23f', '新纪录！'] : ' ',
        '-',
        '本局得分  ' + this.score,
        '最高分    ' + this.hi,
        '-',
        ['bold 16px "Microsoft YaHei", sans-serif', '#fff', '按 Enter 再来一局'],
      ], 110, true);
    } else if (this.state === 'win') {
      this._overlay();
      this._centerText([
        ['bold 40px monospace', '#ffd23f', 'WIN!'],
        ['bold 20px "Microsoft YaHei", sans-serif', '#e8edf4', '全部关卡通关！'],
        '-',
        '本局得分  ' + this.score,
        ['bold 16px "Microsoft YaHei", sans-serif', '#fff', '按 Enter 重新开始'],
      ], 100, true);
    }

    // 顶部横幅（道具提示 / 信息）
    if (this.bannerT > 0 && this.state === 'play') {
      const a = Math.min(1, this.bannerT / 0.3);
      g.globalAlpha = a;
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 6, FIELD, 30);
      g.fillStyle = '#ffd23f';
      g.font = 'bold 16px "Microsoft YaHei", sans-serif';
      g.textAlign = 'center';
      g.fillText(this.banner, FIELD / 2, 21);
      g.textAlign = 'left';
      g.globalAlpha = 1;
    }

    if (this.muted && this.state === 'play') {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(0, CV_H - 26, 56, 20);
      g.fillStyle = '#fff';
      g.font = '12px sans-serif';
      g.fillText('已静音', 6, CV_H - 12);
    }
  }

  _flash(msg) {
    this.banner = msg;
    this.bannerT = 1.4;
  }
}

// 启动
new Game();
