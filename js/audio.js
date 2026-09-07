/* ============================================================
 * 音效：WebAudio 实时合成，无需任何音频文件
 * ============================================================ */
const SFX = (() => {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // 简单振荡器音
  function tone(freq, dur, type = 'square', vol = 0.25, slide = 0) {
    const c = ensure();
    if (!c || muted) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start();
    o.stop(c.currentTime + dur + 0.02);
  }

  // 噪声爆音（爆炸、碎砖）
  function noise(dur, vol = 0.4, low = 200) {
    const c = ensure();
    if (!c || muted) return;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = low;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; },
    shoot() { tone(880, 0.08, 'square', 0.12, -500); },
    hitSteel() { tone(2200, 0.05, 'square', 0.1); tone(1400, 0.06, 'square', 0.08); },
    brick() { noise(0.12, 0.25, 900); },
    boom(big = false) { noise(big ? 0.5 : 0.28, big ? 0.6 : 0.4, big ? 300 : 500); },
    power() { tone(523, 0.09, 'square', 0.18); setTimeout(() => tone(784, 0.09, 'square', 0.18), 80); setTimeout(() => tone(1046, 0.16, 'square', 0.2), 160); },
    shield() { tone(400, 0.3, 'sine', 0.2, 500); },
    freeze() { tone(1200, 0.1, 'triangle', 0.2, -300); setTimeout(() => tone(900, 0.12, 'triangle', 0.2, -200), 90); },
    life() { tone(660, 0.1, 'triangle', 0.2); setTimeout(() => tone(990, 0.16, 'triangle', 0.22), 100); },
    levelClear() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'triangle', 0.22), i * 110)); },
    gameOver() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.28, 'sawtooth', 0.18), i * 180)); },
    start() { [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.18), i * 90)); },
  };
})();
