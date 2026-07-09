const root = document.getElementById('lotteryApp');
let activeGame = 'dlt';
let dltMode = 'predict';

const DATA = {
  dlt: { name: '大乐透', issue: '下一期', frontRange: 35, backRange: 12, frontPick: 5, backPick: 2, history: [] },
  pl3: { name: '排列三', issue: '下一期', digits: 3, history: [] },
  pl5: { name: '排列五', issue: '下一期', digits: 5, history: [] }
};

const OFFICIAL_HISTORY_API = 'https://webapi.sporttery.cn/gateway/lottery/getHistoryPageListV1.qry';
let lotterySyncState = 'loading';
let lotteryUpdatedAt = '';

async function syncOfficialLottery(force = false) {
  if (lotterySyncState === 'loading' && !force) return;
  lotterySyncState = 'loading';
  renderLottery();
  try {
    const games = [['dlt', '85'], ['pl3', '35'], ['pl5', '350133']];
    const results = await Promise.all(games.map(async ([key, gameNo]) => {
      const params = new URLSearchParams({ gameNo, provinceId: '0', pageSize: '10', isVerify: '1', termLimits: '0', pageNo: '1', _: String(Date.now()) });
      const res = await fetch(`${OFFICIAL_HISTORY_API}?${params}`, { cache: 'no-store', headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/javascript, */*; q=0.01' } });
      if (!res.ok) throw new Error(`${key} 官方接口 ${res.status}`);
      const payload = await res.json();
      if (String(payload.errorCode) !== '0' || !Array.isArray(payload.value?.list)) throw new Error(`${key} 官方数据异常`);
      return [key, payload.value.list];
    }));
    results.forEach(([key, rows]) => {
      DATA[key].history = rows.map(row => {
        const nums = String(row.lotteryDrawResult || '').trim().split(/\s+/).map(Number).filter(Number.isFinite);
        const base = { issue: row.lotteryDrawNum, date: String(row.lotteryDrawTime || '').slice(5, 10) };
        return key === 'dlt' ? { ...base, front: nums.slice(0, 5), back: nums.slice(5, 7) } : { ...base, nums };
      }).filter(row => key === 'dlt' ? row.front.length === 5 && row.back.length === 2 : row.nums.length === DATA[key].digits);
      DATA[key].issue = DATA[key].history[0]?.issue || '待更新';
    });
    lotteryUpdatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
    lotterySyncState = 'ready';
  } catch (error) {
    lotterySyncState = `error:${error.message}`;
  }
  renderLottery();
}

function analyzeDlt(data) {
  const frontScores = scorePool(data.history.map(x => x.front), data.frontRange);
  const backScores = scorePool(data.history.map(x => x.back), data.backRange, true);
  const front = frontScores.slice(0, 9).map(x => x.n);
  const back = backScores.slice(0, 4).map(x => x.n);
  const frontMain = stabilize(front.slice(0, 5), data.frontPick, 35);
  const backMain = bestBackPair(backScores);
  return { main: { front: frontMain, back: backMain }, frontBox: front, backBox: back, combos: [
    { name: '稳健单式', front: frontMain, back: backMain, note: '频率与时间衰减权重均衡，后区采用一奇一偶、小大分布。' },
    { name: '复式覆盖', front: stabilize(front.slice(0, 7), 7, 35), back, note: '前区 7 码、后区 4 码，网格化覆盖高分区间。' },
    { name: '胆拖思路', front: front.slice(0, 2), back: back.slice(0, 1), note: `前区胆码 ${front.slice(0, 2).join('、')}，后区胆码 ${back[0]}，拖码看高分候选。` }
  ], metrics: dltMetrics(data.history) };
}

function analyzeDigits(data) {
  const byPos = Array.from({ length: data.digits }, (_, pos) => scorePool(data.history.map(row => [row.nums[pos]]), 9).slice(0, 4).map(x => x.n));
  const main = byPos.map(list => list[0]);
  return { main, boxes: byPos, combos: [
    { name: '直选主线', nums: main, note: '每个位取频率、转移和近期权重综合第一。' },
    { name: '小复式', nums: byPos.map(x => x.slice(0, 2).join('/')), note: '每位 2 码，控制成本同时覆盖转移邻位。' },
    { name: '防线组合', nums: byPos.map((x, i) => x[(i + 1) % x.length]), note: '规避短期过热，保留均值回归方向。' }
  ], metrics: digitMetrics(data.history, data.digits) };
}

function scorePool(draws, max, back = false) {
  const n = max + 1, freq = Array(n).fill(0), lastGap = Array(n).fill(draws.length + 1), co = Array(n).fill(0), trans = Array(n).fill(0);
  draws.forEach((nums, idx) => {
    nums.forEach(num => { freq[num] += 1; lastGap[num] = Math.min(lastGap[num], idx + 1); nums.forEach(other => { if (other !== num) co[num] += 1; }); });
    const next = draws[idx - 1] || [];
    nums.forEach(num => next.forEach(v => { if (Math.abs(v - num) <= (back ? 2 : 5)) trans[v] += 1; }));
  });
  return Array.from({ length: max }, (_, i) => i + 1).map(num => {
    const f = freq[num] / draws.length;
    const decay = Math.exp(-Math.max(0, lastGap[num] - 1) / 4);
    const meanReturn = 1 / (1 + Math.abs(freq[num] - draws.length * (draws[0].length / max)));
    const entropy = 1 - Math.abs(0.5 - ((num % 2) ? 0.58 : 0.42));
    return { n: num, score: f * 35 + co[num] * 0.7 + trans[num] * 1.2 + decay * 18 + meanReturn * 12 + entropy * 6 };
  }).sort((a, b) => b.score - a.score);
}

function bestBackPair(scores) {
  const top = scores.slice(0, 8).map(x => x.n), pairs = [];
  for (let i = 0; i < top.length; i += 1) for (let j = i + 1; j < top.length; j += 1) {
    const a = top[i], b = top[j], oddEven = a % 2 !== b % 2 ? 8 : 0, smallBig = (a <= 6 && b > 6) || (b <= 6 && a > 6) ? 8 : 0;
    const spanScore = Math.max(0, 12 - Math.abs(Math.abs(a - b) - 4.33) * 2);
    pairs.push({ pair: [a, b].sort((x, y) => x - y), score: oddEven + smallBig + spanScore });
  }
  return pairs.sort((a, b) => b.score - a.score)[0].pair;
}

function stabilize(nums, count, max) { const unique = [...new Set(nums)].sort((a, b) => a - b); let cursor = 1; while (unique.length < count && cursor <= max) { if (!unique.includes(cursor)) unique.push(cursor); cursor += 1; } return unique.slice(0, count).sort((a, b) => a - b); }
function dltMetrics(history) { const latest = history[0], avgSpan = avg(history.map(x => Math.abs(x.back[1] - x.back[0]))), oddFront = latest.front.filter(x => x % 2).length; return [['样本', `近${history.length}期`, '含上一期和近期开奖'], ['前区奇偶', `${oddFront}:${5 - oddFront}`, '观察结构稳定性'], ['后区均跨', avgSpan.toFixed(2), '短跨度优先校验'], ['后区组合', '66种', '12选2全组合过滤']]; }
function digitMetrics(history, digits) { const sums = history.map(x => x.nums.reduce((a, b) => a + b, 0)); return [['样本', `近${history.length}期`, '含上一期和近期开奖'], ['和值均值', avg(sums).toFixed(1), '均值回归参考'], ['位数', `${digits}位`, '逐位马尔科夫转移'], ['热度', '分散', '避免追极端热号']]; }
function avg(rows) { return rows.reduce((a, b) => a + b, 0) / Math.max(1, rows.length); }
function pad(n) { return String(n).padStart(2, '0'); }

function renderLottery() {
  const data = DATA[activeGame];
  if (lotterySyncState === 'loading' || !data.history.length) {
    const failed = lotterySyncState.startsWith('error:');
    root.innerHTML = `<section class="lottery-hero"><h2>数字彩官方数据</h2><p>${failed ? safe(lotterySyncState.slice(6)) : '正在同步中国体育彩票官方最近10期开奖数据...'}</p>${failed ? '<button class="refresh" id="lotteryRetry">重新同步</button>' : ''}</section>`;
    const retry = document.getElementById('lotteryRetry'); if (retry) retry.onclick = () => syncOfficialLottery(true); return;
  }
  const analysis = activeGame === 'dlt' ? analyzeDlt(data) : analyzeDigits(data);
  const view = activeGame === 'dlt' ? dltView(data, analysis) : analysis;
  root.innerHTML = `<section class="lottery-hero"><h2>数字彩预测模型</h2><p>按基础频率、共现网络、一阶马尔科夫、组合熵和时间衰减五层评分。模型用于缩小观察范围，不代表确定结果。</p></section>
    <div class="lottery-tabs">${Object.entries(DATA).map(([key, item]) => `<button class="lottery-tab ${activeGame === key ? 'active' : ''}" data-game="${key}">${item.name}</button>`).join('')}</div>
    <section class="lottery-grid"><article class="lottery-card"><div class="lottery-card-head"><div><b>${data.name} 下一期建议</b><span>${activeGame === 'dlt' ? dltModeText(dltMode) : '基于上一期 + 近10期样本'}</span></div></div><div class="lottery-card-body">${activeGame === 'dlt' ? dltControls() : ''}${renderMain(data, view)}${renderMetrics(view.metrics)}</div></article><article class="lottery-card"><div class="lottery-card-head"><div><b>五层量化框架</b><span>Frequency / Co-occurrence / Markov / Entropy / Decay</span></div></div><div class="lottery-card-body"><div class="formula-stack">${formulaCards()}</div></div></article></section>
    <section class="lottery-card"><div class="lottery-card-head"><div><b>候选组合与打法</b><span>单式、复式、胆拖/防线</span></div></div><div class="lottery-card-body"><div class="lottery-combos">${view.combos.map(c => comboCard(data, c)).join('')}</div></div></section>
    <section class="lottery-card"><div class="lottery-card-head"><div><b>中国体育彩票官方开奖</b><span>最近10期 ｜ 同步于 ${safe(lotteryUpdatedAt)}</span></div></div><div class="history-table">${data.history.map(row => historyRow(data, row)).join('')}</div></section>
    <div class="lottery-note">提示：彩票开奖是随机事件，历史频率、遗漏、转移概率只能帮助筛选号码池，不能提高单注理论中奖概率。不要把“冷号必出”或“热号继续热”当作确定规律。</div>`;
  root.querySelectorAll('.lottery-tab').forEach(btn => btn.onclick = () => { activeGame = btn.dataset.game; renderLottery(); });
  root.querySelectorAll('.dlt-action').forEach(btn => btn.onclick = () => { dltMode = btn.dataset.mode; renderLottery(); });
}

function dltControls() { const rows = [['predict', '预测'], ['random1', '随机一注'], ['random5', '随机五注'], ['randomBox', '随机复式']]; return `<div class="dlt-actions">${rows.map(([key, label]) => `<button class="dlt-action ${dltMode === key ? 'active' : ''}" data-mode="${key}">${label}</button>`).join('')}</div>`; }
function dltModeText(mode) { return ({ predict: '基于上一期 + 近10期样本', random1: '随机生成 1 注标准单式', random5: '随机生成 5 注标准单式', randomBox: '随机生成 7+4 复式覆盖' })[mode] || '基于模型计算'; }
function dltView(data, analysis) {
  if (dltMode === 'predict') return analysis;
  if (dltMode === 'random1') { const one = randomDlt(); return { ...analysis, main: one, combos: [{ name: '随机一注', ...one, note: '完全随机生成，适合临时娱乐，不参与模型评分。' }] }; }
  if (dltMode === 'random5') { const rows = Array.from({ length: 5 }, () => randomDlt()); return { ...analysis, main: rows[0], combos: rows.map((row, index) => ({ name: `随机第 ${index + 1} 注`, ...row, note: '标准单式随机生成，前区 35 选 5，后区 12 选 2。' })) }; }
  const box = { front: randomPick(35, 7), back: randomPick(12, 4) };
  return { ...analysis, main: { front: box.front.slice(0, 5), back: box.back.slice(0, 2) }, combos: [{ name: '随机复式 7+4', ...box, note: '前区 7 码、后区 4 码，覆盖面更大，成本也会同步上升。' }] };
}
function randomDlt() { return { front: randomPick(35, 5), back: randomPick(12, 2) }; }
function randomPick(max, count) { const pool = Array.from({ length: max }, (_, i) => i + 1); for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } return pool.slice(0, count).sort((a, b) => a - b); }
function renderMain(data, analysis) { return data.frontPick ? `<div class="ball-row">${analysis.main.front.map(n => ball(n)).join('')}<span style="width:14px"></span>${analysis.main.back.map(n => ball(n, 'blue')).join('')}</div>` : `<div class="ball-row">${analysis.main.map(n => ball(n, 'gray')).join('')}</div>`; }
function renderMetrics(metrics) { return `<div class="lottery-metrics">${metrics.map(([a, b, c]) => `<div class="lottery-metric"><b>${safe(b)}</b><span>${safe(a)} · ${safe(c)}</span></div>`).join('')}</div>`; }
function formulaCards() { const rows = [['基础频率层', 'f(x)=number出现次数/N，先看近10期基础热度。'], ['共现网络层', 'P(x,y)=C(x,y)/C(x)，观察号码同框关系。'], ['一阶马尔科夫', 'P(Xt+1=j|Xt=i)，按上一期向下一期的转移邻域加权。'], ['组合熵', 'H=-Σp(x)logp(x)，控制奇偶、大小、和值、跨度结构。'], ['时间衰减', '近期权重更高，但过热会做均值回归降温。']]; return rows.map(([a, b]) => `<div class="formula-card"><b>${safe(a)}</b><span>${safe(b)}</span></div>`).join(''); }
function comboCard(data, combo) { const nums = data.frontPick ? `<div class="ball-row">${combo.front.map(n => ball(n)).join('')}<span style="width:14px"></span>${combo.back.map(n => ball(n, 'blue')).join('')}</div>` : `<div class="ball-row">${combo.nums.map(n => typeof n === 'number' ? ball(n, 'gray') : `<span class="ball gray" style="width:auto;border-radius:999px;padding:0 12px">${safe(n)}</span>`).join('')}</div>`; return `<div class="combo-card"><strong><span>${safe(combo.name)}</span><span>${safe(data.name)}</span></strong>${nums}<em>${safe(combo.note)}</em></div>`; }
function historyRow(data, row) { const nums = data.frontPick ? `${row.front.map(pad).join(' ')} + ${row.back.map(pad).join(' ')}` : row.nums.join(' '); return `<div class="history-row"><span>${safe(row.issue)}</span><b>${safe(nums)}</b><span>${safe(row.date)}</span></div>`; }
function ball(n, type = '') { return `<span class="ball ${type}">${pad(n)}</span>`; }
function safe(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.querySelectorAll('.product-tab').forEach(btn => { btn.onclick = () => { const product = btn.dataset.product; document.querySelectorAll('.product-tab').forEach(x => x.classList.toggle('active', x === btn)); document.querySelectorAll('.sports-view').forEach(x => x.hidden = product !== 'sports'); root.hidden = product !== 'lottery'; if (product === 'lottery') syncOfficialLottery(lotterySyncState !== 'ready'); }; });
syncOfficialLottery(true);
