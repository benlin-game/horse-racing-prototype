// ── RTP 模擬：1000 場全押（每格 1000 籌碼）──
const CFG = {
  RTP_WIN:      0.93,
  RTP_PLACE:    0.94,
  RTP_QUINELLA: 0.90,
};

const TRUE_PROB_WEIGHTS = [30, 22, 16, 12, 9, 7, 4]; // sum = 100
const BET_AMOUNT = 1000;
const RACES = 1000;

// ── Harville helpers ──
function calcPlaceProb(horses, target) {
  const n  = horses.length;
  const p  = horses.map(h => h.tp);
  const ti = horses.indexOf(target);
  let prob = p[ti];
  for (let j = 0; j < n; j++) {
    if (j === ti) continue;
    prob += p[j] * p[ti] / (1 - p[j]);
  }
  for (let j = 0; j < n; j++) {
    if (j === ti) continue;
    for (let k = 0; k < n; k++) {
      if (k === ti || k === j) continue;
      const denom = 1 - p[j] - p[k];
      if (denom <= 0) continue;
      prob += p[j] * (p[k] / (1 - p[j])) * (p[ti] / denom);
    }
  }
  return Math.min(prob, 0.999);
}

function calcQuinellaProb(ha, hb) {
  const pi = ha.tp, pj = hb.tp;
  return pi * pj / (1 - pi) + pj * pi / (1 - pj);
}

// ── 產生馬匹（含賠率）──
function pickHorses() {
  const weights = [...TRUE_PROB_WEIGHTS].sort(() => Math.random() - 0.5);
  const wSum    = weights.reduce((a, b) => a + b, 0);
  const horses  = weights.map((w, i) => {
    const tp    = w / wSum;
    const noise = 0.98 + Math.random() * 0.04;
    return { pos: i + 1, tp, winOdds: +(1/tp * CFG.RTP_WIN * noise).toFixed(1), placeOdds: 0 };
  });
  horses.forEach(h => {
    const pp    = calcPlaceProb(horses, h);
    const noise = 0.98 + Math.random() * 0.04;
    h.placeOdds = +(1/pp * CFG.RTP_PLACE * noise).toFixed(1);
  });
  return horses;
}

// ── 跑馬（Harville 序列抽樣）──
function simulateRace(horses) {
  const rem = horses.map(h => ({ h, p: h.tp }));
  const order = [];
  while (rem.length) {
    const tot = rem.reduce((s, x) => s + x.p, 0);
    let r = Math.random() * tot, cum = 0;
    for (let i = 0; i < rem.length; i++) {
      cum += rem[i].p;
      if (r <= cum || i === rem.length - 1) {
        order.push(rem[i].h);
        rem.splice(i, 1);
        break;
      }
    }
  }
  return order; // order[0]=1st, [1]=2nd, [2]=3rd
}

// ── 主模擬 ──
let totalWagered = 0;
let totalPayout  = 0;

let totalWageredWin = 0, totalPayoutWin = 0;
let totalWageredPl  = 0, totalPayoutPl  = 0;
let totalWageredQ   = 0, totalPayoutQ   = 0;

for (let race = 0; race < RACES; race++) {
  const horses = pickHorses();
  const order  = simulateRace(horses);
  const first  = order[0], second = order[1], third = order[2];

  // WIN：押全部 7 匹
  for (const h of horses) {
    totalWagered += BET_AMOUNT;
    totalWageredWin += BET_AMOUNT;
    if (h.pos === first.pos) {
      const pay = BET_AMOUNT * h.winOdds;
      totalPayout += pay;
      totalPayoutWin += pay;
    }
  }

  // PLACE：押全部 7 匹
  const top3 = new Set([first.pos, second.pos, third.pos]);
  for (const h of horses) {
    totalWagered += BET_AMOUNT;
    totalWageredPl += BET_AMOUNT;
    if (top3.has(h.pos)) {
      const pay = BET_AMOUNT * h.placeOdds;
      totalPayout += pay;
      totalPayoutPl += pay;
    }
  }

  // QUINELLA：押全部 21 組
  for (let i = 0; i < horses.length; i++) {
    for (let j = i + 1; j < horses.length; j++) {
      const ha = horses[i], hb = horses[j];
      const qOdds = +(1 / calcQuinellaProb(ha, hb) * CFG.RTP_QUINELLA).toFixed(1);
      totalWagered += BET_AMOUNT;
      totalWageredQ += BET_AMOUNT;
      const top2 = new Set([first.pos, second.pos]);
      if (top2.has(ha.pos) && top2.has(hb.pos)) {
        const pay = BET_AMOUNT * qOdds;
        totalPayout += pay;
        totalPayoutQ += pay;
      }
    }
  }
}

// ── 結果輸出 ──
const fmt = (n) => n.toFixed(2) + '%';
const overallRTP = totalPayout / totalWagered * 100;
const winRTP     = totalPayoutWin / totalWageredWin * 100;
const plRTP      = totalPayoutPl  / totalWageredPl  * 100;
const qRTP       = totalPayoutQ   / totalWageredQ   * 100;

const perRaceBet   = (7 + 7 + 21) * BET_AMOUNT;
const totalBetChip = totalWagered;
const totalNetChip = totalPayout - totalWagered;

console.log('═══════════════════════════════════════');
console.log(`  RTP 模擬報告  ${RACES} 場 × 全押 ${BET_AMOUNT} 籌碼`);
console.log('═══════════════════════════════════════');
console.log(`每場下注格數：35 格（WIN×7 + PLACE×7 + QUINELLA×21）`);
console.log(`每場下注總額：${perRaceBet.toLocaleString()} 籌碼`);
console.log('───────────────────────────────────────');
console.log(`總投注：  ${totalBetChip.toLocaleString()} 籌碼`);
console.log(`總派彩：  ${Math.round(totalPayout).toLocaleString()} 籌碼`);
console.log(`淨盈虧：  ${Math.round(totalNetChip).toLocaleString()} 籌碼`);
console.log('───────────────────────────────────────');
console.log(`整體 RTP：   ${fmt(overallRTP)}  （目標：91-93%）`);
console.log(`獨贏 RTP：   ${fmt(winRTP)}  （設定：93%）`);
console.log(`位置 RTP：   ${fmt(plRTP)}  （設定：94%）`);
console.log(`連贏 RTP：   ${fmt(qRTP)}  （設定：90%）`);
console.log('═══════════════════════════════════════');
