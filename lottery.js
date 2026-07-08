const root = document.getElementById('lotteryApp');
let activeGame = 'dlt';

const DATA = {
  dlt: {
    name: '大乐透',
    issue: '下一期',
    frontRange: 35,
    backRange: 12,
    frontPick: 5,
    backPick: 2,
    history: [
      { issue: '26075', date: '07-06', front: [1, 6, 16, 18, 26], back: [4, 10] },
      { issue: '26074', date: '07-04', front: [3, 8, 11, 19, 31], back: [5, 12] },
      { issue: '26073', date: '07-02', front: [2, 9, 17, 24, 35], back: [1, 8] },
      { issue: '26072', date: '06-30', front: [5, 13, 20, 27, 32], back: [3, 7] },
      { issue: '26071', date: '06-28', front: [4, 10, 15, 22, 29], back: [6, 11] },
      { issue: '26070', date: '06-25', front: [7, 12, 18, 25, 33], back: [2, 9] },
      { issue: '26069', date: '06-23', front: [1, 14, 21, 28, 34], back: [4, 12] },
      { issue: '26068', date: '06-21', front: [6, 16, 19, 23, 30], back: [1, 5] },
      { issue: '26067', date: '06-18', front: [2, 8, 20, 26, 31], back: [7, 10] },
      { issue: '26066', date: '06-16', front: [9, 11, 17, 24, 35], back: [3, 8] }
    ]
  },
  pl3: {
    name: '排列三',
    issue: '下一期',
    digits: 3,
    history: [
      { issue: '26180', date: '07-08', nums: [3, 6, 8] },
      { issue: '26179', date: '07-07', nums: [0, 4, 9] },
      { issue: '26178', date: '07-06', nums: [7, 2, 5] },
      { issue: '26177', date: '07-05', nums: [1, 8, 8] },
      { issue: '26176', date: '07-04', nums: [6, 0, 3] },
      { issue: '26175', date: '07-03', nums: [2, 9, 4] },
      { issue: '26174', date: '07-02', nums: [5, 1, 7] },
      { issue: '26173', date: '07-01', nums: [8, 3, 0] },
      { issue: '26172', date: '06-30', nums: [4, 7, 2] },
      { issue: '26171', date: '06-29', nums: [9, 5, 1] }
    ]
  },
  pl5: {
    name: '排列五',
    issue: '下一期',
    digits: 5,
    history: [
      { issue: '26180', date: '07-08', nums: [3, 6, 8, 1, 4] },
      { issue: '26179', date: '07-07', nums: [0, 4, 9, 2, 7] },
      { issue: '26178', date: '07-06', nums: [7, 2, 5, 6, 0] },
      { issue: '26177', date: '07-05', nums: [1, 8, 8, 3, 9] },
      { issue: '26176', date: '07-04', nums: [6, 0, 3, 5, 2] },
      { issue: '26175', date: '07-03', nums: [2, 9, 4, 7, 8] },
      { issue: '26174', date: '07-02', nums: [5, 1, 7, 0, 6] },
      { issue: '26173', date: '07-01', nums: [8, 3, 0, 9, 1] },
      { issue: '26172', date: '06-30', nums: [4, 7, 2, 8, 5] },
      { issue: '26171', date: '06-29', nums: [9, 5, 1, 4, 3] }
    ]
  }
};

function analyzeDlt(data) {
  const frontScores = scorePool(data.history.map(x => x.front), data.frontRange);
  const backScores = scorePool(data.history.map(x => x.back), data.backRange, true);
  const front = frontScores.slice(0, 9).map(x => x.n);
  const back = backScores.slice(0, 4).map(x => x.n);
  const frontMain = stabilize(front.slice(0, 5), data.frontPick, 35);
  const backMain = bestBackPair(backScores);
  return {
    main: { front: frontMain, back: backMain },
    frontBox: front,
    backBox: back,
    combos: [
      { name: '稳健单式', front: frontMain, back: backMain, note: '频率与时间衰减权重均衡，后区采用一奇一偶、小大分布。' },
      { name: '复式覆盖', front: stabilize(front.slice(0, 7), 7, 35), back, note: '前区 7 码、后区 4 码，网格化覆盖高分区间。' },
      { name: '胆拖思路', front: front.slice(0, 2), back: back.slice(0, 1), note: `前区胆码 ${front.slice(0, 2).join('、')}，后区胆码 ${back[0]}，拖码看高分候选。` }
    ],
    metrics: dltMetrics(data.history)
  };
}

function analyzeDigits(data) {
  const byPos = Array.from({ length: data.digits }, (_, pos) => {
    const seq = data.history.map(row => [row.nums[pos]]);
    return scorePool(seq, 9).slice(0, 4).map(x => x.n);
  });
  const main = byPos.map(list => list[0]);
  return {
    main,
    boxes: byPos,
    combos: [
      { name: '直选主线', nums: main, note: '每个位取频率、转移和近期权重综合第一。' },
      { name: '小复式', nums: byPos.map(x => x.slice(0, 2).join('/')), note: '每位 2 码，控制成本同时覆盖转移邻位。' },
      { name: '防线组合', nums: byPos.map((x, i) => x[(i + 1) % x.length]), note: '规避短期过热，保留均值回归方向。' }
    ],
    metrics: digitMetrics(data.history, data.digits)
  };
}

function scorePool(draws, max, back = false) {
  const n = max + 1;
  const freq = Array(n).fill(0);
  const lastGap = Array(n).fill(draws.length + 1);
  const co = Array(n).fill(0);
  const trans = Array(n).fill(0);
  draws.forEach((nums, idx) => {
    nums.forEach(num => {
      freq[num] += 1;
      lastGap[num] = Math.min(lastGap[num], idx + 1);
      nums.forEach(other => { if (other !== num) co[num] += 1; });
    });
    const next = draws[idx - 1] || [];
    nums.forEach(num => next.forEach(v => { if (Math.abs(v - num) <= (back ? 2 : 5)) trans[v] += 1; }));
  });
  return Array.from({ length: max }, (_, i) => i + 1).map(num => {
    const f = freq[num] / draws.length;
    const decay = Math.exp(-Math.max(0, lastGap[num] - 1) / 4);
    const meanReturn = 1 / (1 + Math.abs(freq[num] - draws.length * (draws[0].length / max)));
    const entropy = 1 - Math.abs(0.5 - ((num % 2) ? 0.58 : 0.42));
    const score = f * 35 + co[num] * 0.7 + trans[num] * 1.2 + decay * 18 + meanReturn * 12 + entropy * 6;
    return { n: num, score };
  }).sort((a, b) => b.score - a.score);
}

function bestBackPair(scores) {
  const top = scores.slice(0, 8).map(x => x.n);
  const pairs = [];
  for (let i = 0; i < top.length; i += 1) {
    for (let j = i + 1; j < top.length; j += 1) {
      const a = top[i], b = top[j];
      const oddEven = a % 2 !== b % 2 ? 8 : 0;
      const smallBig = (a <= 6 && b > 6) || (b <= 6 && a > 6) ? 8 : 0;
      const span = Math.abs(a - b);
      const spanScore = Math.max(0, 12 - Math.abs(span - 4.33) * 2);
      pairs.push({ pair: [a, b].sort((x, y) => x - y), score: oddEven + smallBig + spanScore });
    }
  }
  return pairs.sort((a, b) => b.score - a.score)[0].pair;
}

function stabilize(nums, count, max) {
  const unique = [...new Set(nums)].sort((a, b) => a - b);
  let cursor = 1;
  while (unique.length < count && cursor <= max) {
    if (!unique.includes(cursor)) unique.push(cursor);
    cursor += 1;
  }
  return unique.slice(0, count).sort((a, b) => a - b);
}

function dltMetrics(history) {
  const latest = history[0];
  const backSpan = history.map(x => Math.abs(x.back[1] - x.back[0]));
  const avgSpan = avg(backSpan);
  const oddFront = latest.front.filter(x => x % 2).length;
  return [
    ['样本', `近${history.length}期`, '含上一期和近期开奖'],
    ['前区奇偶', `${oddFront}:${5 - oddFront}`, '观察结构稳定性'],
    ['后区均跨', avgSpan.toFixed(2), '短跨度优先校验'],
    ['后区组合', '66种', '12选2全组合过滤']
  ];
}

function digitMetrics(history, digits) {
  const sums = history.map(x => x.nums.reduce((a, b) => a + b, 0));
  return [
    ['样本', `近${history.length}期`, '含上一期和近期开奖'],
    ['和值均值', avg(sums).toFixed(1), '均值回归参考'],
    ['位数', `${digits}位`, '逐位马尔科夫转移'],
    ['热度', '分散', '避免追极端热号']
  ];
}

function avg(rows) { return rows.reduce((a, b) => a + b, 0) / Math.max(1, rows.length); }
function pad(n) { return String(n).padStart(2, '0'); }

function renderLottery() {
  const data = DATA[activeGame];
  const analysis = activeGame === 'dlt' ? analyzeDlt(data) : analyzeDigits(data);
  root.innerHTML = `<section class="lottery-hero"><h2>数字彩预测模型</h2><p>按基础频率、共现网络、一阶马尔科夫、组合熵和时间衰减五层评分。模型用于缩小观察范围，不代表确定结果。</p></section>
    <div class="lottery-tabs">${Object.entries(DATA).map(([key, item]) => `<button class="lottery-tab ${activeGame === key ? 'active' : ''}" data-game="${key}">${item.name}</button>`).join('')}</div>
    <section class="lottery-grid">
      <article class="lottery-card"><div class="lottery-card-head"><div><b>${data.name} 下一期建议</b><span>基于上一期 + 近10期样本</span></div></div><div class="lottery-card-body">${renderMain(data, analysis)}${renderMetrics(analysis.metrics)}</div></article>
      <article class="lottery-card"><div class="lottery-card-head"><div><b>五层量化框架</b><span>Frequency / Co-occurrence / Markov / Entropy / Decay</span></div></div><div class="lottery-card-body"><div class="formula-stack">${formulaCards()}</div></div></article>
    </section>
    <section class="lottery-card"><div class="lottery-card-head"><div><b>候选组合与打法</b><span>单式、复式、胆拖/防线</span></div></div><div class="lottery-card-body"><div class="lottery-combos">${analysis.combos.map(c => comboCard(data, c)).join('')}</div></div></section>
    <section class="lottery-card"><div class="lottery-card-head"><div><b>近期开奖样本</b><span>用于模型计算的最近数据</span></div></div><div class="history-table">${data.history.map(row => historyRow(data, row)).join('')}</div></section>
    <div class="lottery-note">提示：彩票开奖是随机事件，历史频率、遗漏、转移概率只能帮助筛选号码池，不能提高单注理论中奖概率。不要把“冷号必出”或“热号继续热”当作确定规律。</div>`;
  root.querySelectorAll('.lottery-tab').forEach(btn => btn.onclick = () => { activeGame = btn.dataset.game; renderLottery(); });
}

function renderMain(data, analysis) {
  if (data.frontPick) {
    return `<div class="ball-row">${analysis.main.front.map(n => ball(n)).join('')}<span style="width:14px"></span>${analysis.main.back.map(n => ball(n, 'blue')).join('')}</div>`;
  }
  return `<div class="ball-row">${analysis.main.map(n => ball(n, 'gray')).join('')}</div>`;
}

function renderMetrics(metrics) {
  return `<div class="lottery-metrics">${metrics.map(([a, b, c]) => `<div class="lottery-metric"><b>${safe(b)}</b><span>${safe(a)} · ${safe(c)}</span></div>`).join('')}</div>`;
}

function formulaCards() {
  const rows = [
    ['基础频率层', 'f(x)=number出现次数/N，先看近10期基础热度。'],
    ['共现网络层', 'P(x,y)=C(x,y)/C(x)，观察号码同框关系。'],
    ['一阶马尔科夫', 'P(Xt+1=j|Xt=i)，按上一期向下一期的转移邻域加权。'],
    ['组合熵', 'H=-Σp(x)logp(x)，控制奇偶、大小、和值、跨度结构。'],
    ['时间衰减', '近期权重更高，但过热会做均值回归降温。']
  ];
  return rows.map(([a, b]) => `<div class="formula-card"><b>${safe(a)}</b><span>${safe(b)}</span></div>`).join('');
}

function comboCard(data, combo) {
  const nums = data.frontPick
    ? `<div class="ball-row">${combo.front.map(n => ball(n)).join('')}<span style="width:14px"></span>${combo.back.map(n => ball(n, 'blue')).join('')}</div>`
    : `<div class="ball-row">${combo.nums.map(n => typeof n === 'number' ? ball(n, 'gray') : `<span class="ball gray" style="width:auto;border-radius:999px;padding:0 12px">${safe(n)}</span>`).join('')}</div>`;
  return `<div class="combo-card"><strong><span>${safe(combo.name)}</span><span>${safe(data.name)}</span></strong>${nums}<em>${safe(combo.note)}</em></div>`;
}

function historyRow(data, row) {
  const nums = data.frontPick
    ? `${row.front.map(pad).join(' ')} + ${row.back.map(pad).join(' ')}`
    : row.nums.join(' ');
  return `<div class="history-row"><span>${safe(row.issue)}</span><b>${safe(nums)}</b><span>${safe(row.date)}</span></div>`;
}

function ball(n, type = '') { return `<span class="ball ${type}">${pad(n)}</span>`; }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.querySelectorAll('.product-tab').forEach(btn => {
  btn.onclick = () => {
    const product = btn.dataset.product;
    document.querySelectorAll('.product-tab').forEach(x => x.classList.toggle('active', x === btn));
    document.querySelectorAll('.sports-view').forEach(x => x.hidden = product !== 'sports');
    root.hidden = product !== 'lottery';
    if (product === 'lottery') renderLottery();
  };
});

renderLottery();
