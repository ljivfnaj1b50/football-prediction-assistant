const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const round = (n, d = 1) => Number(n.toFixed(d));

function factorial(k) {
  let x = 1;
  for (let i = 2; i <= k; i++) x *= i;
  return x;
}

function poisson(lambda, k) {
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function noVigProbability(prices = {}) {
  if (!prices.home || !prices.draw || !prices.away) return null;
  const raw = { home: 1 / prices.home, draw: 1 / prices.draw, away: 1 / prices.away };
  const total = raw.home + raw.draw + raw.away;
  return { home: raw.home / total, draw: raw.draw / total, away: raw.away / total, margin: total - 1 };
}

function formStats(team = {}) {
  const rows = team.form || [];
  if (!rows.length) return { points: 1.35, gf: 1.25, ga: 1.25, winRate: 0.33, unbeaten: 0.55 };
  const points = rows.reduce((s, m) => s + (m.result === 'W' ? 3 : m.result === 'D' ? 1 : 0), 0) / rows.length;
  const wins = rows.filter(m => m.result === 'W').length / rows.length;
  const unbeaten = rows.filter(m => m.result !== 'L').length / rows.length;
  return {
    points,
    gf: rows.reduce((s, m) => s + Number(m.gf || 0), 0) / rows.length,
    ga: rows.reduce((s, m) => s + Number(m.ga || 0), 0) / rows.length,
    winRate: wins,
    unbeaten
  };
}

function restDays(team, kickoff) {
  if (!team?.lastPlayedAt || !kickoff) return null;
  return Math.max(0, (new Date(kickoff) - new Date(team.lastPlayedAt)) / 86400000);
}

function environmentRisk(weather = {}, venue = {}) {
  const temp = Number(weather.tempC ?? 22);
  const wind = Number(weather.windKph ?? 8);
  const humidity = Number(weather.humidity ?? 55);
  const rain = Number(weather.rainMm ?? 0);
  const altitude = Number(venue.altitudeM ?? 0);
  return clamp(
    (temp > 30 ? (temp - 30) * 0.035 : temp < 5 ? (5 - temp) * 0.03 : 0) +
    (wind > 28 ? (wind - 28) * 0.025 : 0) +
    (humidity > 78 ? 0.05 : 0) +
    Math.min(0.2, rain * 0.025) +
    (altitude > 900 ? Math.min(0.22, altitude / 6000) : 0),
    0,
    0.45
  );
}

function teamFriction(team = {}, match = {}) {
  const injuries = (team.injuries || []).reduce((s, p) => s + Number(p.impact || (p.role === 'starter' ? 0.08 : 0.03)), 0);
  const suspensions = (team.suspensions || []).reduce((s, p) => s + Number(p.impact || (p.role === 'starter' ? 0.07 : 0.03)), 0);
  const rd = restDays(team, match.kickoff);
  const rest = rd == null ? 0.03 : rd < 3 ? 0.12 : rd < 4 ? 0.06 : rd > 8 ? 0.03 : 0;
  const travel = Number(team.travelKm || 0) > 2500 ? 0.07 : Number(team.travelKm || 0) > 900 ? 0.035 : 0;
  const publicSignal = team.publicSentiment?.reliability
    ? clamp(-Number(team.publicSentiment.score || 0) * Number(team.publicSentiment.reliability || 0) * 0.06, -0.05, 0.08)
    : 0.02;
  return clamp(injuries + suspensions + rest + travel + publicSignal, -0.06, 0.36);
}

function expectedGoals(match) {
  const hf = formStats(match.home);
  const af = formStats(match.away);
  const rankDiff = clamp((Number(match.away?.rank || 60) - Number(match.home?.rank || 60)) / 80, -0.35, 0.35);
  const homeAdv = match.neutral ? 0 : 0.18;
  const env = environmentRisk(match.weather, match.venue);
  const homeDrag = teamFriction(match.home, match);
  const awayDrag = teamFriction(match.away, match);
  const tempo = Number(match.tactical?.tempo || 0);
  const press = Number(match.tactical?.press || 0);
  const knockout = /淘汰|决赛|final|knockout/i.test(match.stage || '') ? -0.1 : 0;
  let home = 1.18 + (hf.gf - af.ga) * 0.32 + rankDiff + homeAdv - homeDrag + awayDrag * 0.38 + tempo * 0.08 + press * 0.05 + knockout;
  let away = 1.06 + (af.gf - hf.ga) * 0.32 - rankDiff - homeAdv * 0.45 - awayDrag + homeDrag * 0.38 + tempo * 0.08 + press * 0.05 + knockout;
  home *= 1 - env * 0.42;
  away *= 1 - env * 0.42;
  return { home: clamp(home, 0.25, 3.35), away: clamp(away, 0.2, 3.2), env, homeDrag, awayDrag, hf, af };
}

function scoreMatrix(homeXg, awayXg) {
  let home = 0, draw = 0, away = 0;
  const totals = Array(8).fill(0);
  const scores = [];
  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const p = poisson(homeXg, h) * poisson(awayXg, a);
      if (h > a) home += p;
      else if (h === a) draw += p;
      else away += p;
      totals[Math.min(7, h + a)] += p;
      scores.push({ score: `${h}-${a}`, h, a, p });
    }
  }
  const mass = home + draw + away;
  return {
    prob: { home: home / mass, draw: draw / mass, away: away / mass },
    totals: totals.map(x => x / mass),
    scores: scores.sort((a, b) => b.p - a.p).slice(0, 8).map(s => ({ score: s.score, p: s.p / mass, h: s.h, a: s.a })),
  };
}

function marketSignal(match, marketProb) {
  const move = match.market?.oddsMove || {};
  const publicPct = match.market?.publicBetPct || {};
  const volumeIndex = Number(match.market?.volumeIndex || 0);
  const homeHot = Number(publicPct.home || 0) > 62 || Number(move.home || 0) < -0.08;
  const awayHot = Number(publicPct.away || 0) > 62 || Number(move.away || 0) < -0.08;
  const drawHot = Number(publicPct.draw || 0) > 40 || Number(move.draw || 0) < -0.08;
  const heat = clamp((homeHot || awayHot || drawHot ? 0.18 : 0) + (volumeIndex > 80 ? 0.08 : volumeIndex > 55 ? 0.04 : 0), 0, 0.35);
  return {
    heat,
    hotSide: homeHot ? '主队热' : awayHot ? '客队热' : drawHot ? '平局热' : '热度不明显',
    hasVolume: Boolean(publicPct.home || publicPct.away || publicPct.draw || volumeIndex),
    margin: marketProb?.margin ?? null,
  };
}

function riskLabel(score) {
  if (score >= 0.7) return { key: 'avoid', label: '避开', text: '信号冲突过大，不适合强行判断' };
  if (score >= 0.52) return { key: 'high', label: '高风险', text: '临场变量多，只适合观察' };
  if (score >= 0.32) return { key: 'medium', label: '中风险', text: '可以观察，但冷门风险不能忽略' };
  return { key: 'low', label: '低风险', text: '结构较清晰，但仍非确定结果' };
}

function totalMarkets(totals) {
  const p = (idxs) => idxs.reduce((s, i) => s + (totals[i] || 0), 0);
  const bands = [
    { key: '0-1', label: '0/1球', p: p([0, 1]) },
    { key: '2-3', label: '2/3球', p: p([2, 3]) },
    { key: '4-6', label: '4/5/6球', p: p([4, 5, 6]) },
    { key: '7+', label: '7+球', p: p([7]) }
  ].sort((a, b) => b.p - a.p);
  return {
    exact: totals.map((x, i) => ({ label: i === 7 ? '7+' : String(i), p: round(x * 100) })),
    bands: bands.map(x => ({ ...x, p: round(x.p * 100) })),
    over25: round(p([3, 4, 5, 6, 7]) * 100),
    under25: round(p([0, 1, 2]) * 100),
    over35: round(p([4, 5, 6, 7]) * 100),
    under35: round(p([0, 1, 2, 3]) * 100),
  };
}

function doubleChance(prob) {
  return [
    { key: 'home_draw', label: '主不败', p: prob.home + prob.draw },
    { key: 'draw_away', label: '客不败', p: prob.draw + prob.away },
    { key: 'home_away', label: '分胜负', p: prob.home + prob.away },
  ].sort((a, b) => b.p - a.p).map(x => ({ ...x, p: round(x.p * 100) }));
}

function makeScheme(match, pick, risk, totals, scores, confidence) {
  const topBand = totals.bands[0];
  const topScore = scores[0];
  const level = risk.key === 'low' ? '主推' : risk.key === 'medium' ? '谨慎' : risk.key === 'high' ? '观察' : '放弃';
  const primary = risk.key === 'avoid'
    ? '不建议强行做方向，等待临场数据'
    : `${pick.label}｜总进球 ${topBand.label}｜参考比分 ${topScore.score}`;
  const backup = risk.key === 'low'
    ? `防线：${totals.bands[1]?.label || '-'}，比分防 ${scores[1]?.score || '-'}`
    : `只做轻量参考，重点看临场阵容和水位变化`;
  return { level, primary, backup, confidence, text: `${level}：${primary}` };
}

export function analyzeMatch(match) {
  const xg = expectedGoals(match);
  const model = scoreMatrix(xg.home, xg.away);
  const marketProb = noVigProbability(match.odds?.h2h);
  const market = marketSignal(match, marketProb);
  const missing =
    (match.odds?.h2h ? 0 : 0.16) +
    (match.home?.form?.length >= 5 ? 0 : 0.1) +
    (match.away?.form?.length >= 5 ? 0 : 0.1) +
    (match.weather ? 0 : 0.05) +
    (match.home?.injuries ? 0 : 0.06) +
    (match.away?.injuries ? 0 : 0.06) +
    (market.hasVolume ? 0 : 0.08);
  const uncertainty = clamp(missing + xg.env * 0.25 + market.heat * 0.35 + Math.abs(xg.homeDrag - xg.awayDrag) * 0.22, 0, 0.88);
  const marketWeight = marketProb ? clamp(0.58 - uncertainty * 0.35, 0.36, 0.64) : 0;
  const blended = marketProb
    ? {
        home: marketProb.home * marketWeight + model.prob.home * (1 - marketWeight),
        draw: marketProb.draw * marketWeight + model.prob.draw * (1 - marketWeight),
        away: marketProb.away * marketWeight + model.prob.away * (1 - marketWeight),
      }
    : model.prob;
  const picks = [
    { key: 'home', label: `${match.home?.name || '主队'}胜`, p: blended.home },
    { key: 'draw', label: '平局', p: blended.draw },
    { key: 'away', label: `${match.away?.name || '客队'}胜`, p: blended.away },
  ].sort((a, b) => b.p - a.p);
  const contradiction = marketProb
    ? Math.abs(model.prob.home - marketProb.home) + Math.abs(model.prob.draw - marketProb.draw) + Math.abs(model.prob.away - marketProb.away)
    : 0.12;
  const riskScore = clamp(uncertainty * 0.62 + contradiction * 0.42 + market.heat * 0.55, 0, 1);
  const risk = riskLabel(riskScore);
  const totals = totalMarkets(model.totals);
  const edge = marketProb
    ? { home: blended.home - marketProb.home, draw: blended.draw - marketProb.draw, away: blended.away - marketProb.away }
    : { home: 0, draw: 0, away: 0 };
  const scores = model.scores.map(s => ({ score: s.score, p: round(s.p * 100) }));
  const confidence = round((1 - riskScore) * 100);
  const explanation = [];
  explanation.push(`${match.home?.name}近况：场均进球${round(xg.hf.gf, 2)}，场均失球${round(xg.hf.ga, 2)}，不败率${round(xg.hf.unbeaten * 100)}%。`);
  explanation.push(`${match.away?.name}近况：场均进球${round(xg.af.gf, 2)}，场均失球${round(xg.af.ga, 2)}，不败率${round(xg.af.unbeaten * 100)}%。`);
  if (xg.homeDrag > 0.1) explanation.push(`${match.home?.name}人员/疲劳折损偏高，方向需要降权。`);
  if (xg.awayDrag > 0.1) explanation.push(`${match.away?.name}人员/疲劳折损偏高，方向需要降权。`);
  if (xg.env > 0.14) explanation.push('天气、海拔或场地环境可能压低比赛节奏，总进球方向需要保守。');
  if (market.hasVolume) explanation.push(`市场热度：${market.hotSide}，热度越集中越要防反向波动。`);
  if (!marketProb) explanation.push('当前缺少外部水位概率，模型以基本面、历史状态、人员和环境为主。');

  const probabilities = { home: round(blended.home * 100), draw: round(blended.draw * 100), away: round(blended.away * 100) };
  const markets = {
    winDrawLose: picks.map(x => ({ key: x.key, label: x.label, p: round(x.p * 100) })),
    doubleChance: doubleChance(blended),
    totalGoals: totals,
    scores,
  };
  const scheme = makeScheme(match, markets.winDrawLose[0], risk, totals, scores, confidence);

  return {
    id: match.id,
    match,
    xg: { home: round(xg.home, 2), away: round(xg.away, 2) },
    probabilities,
    modelProbabilities: { home: round(model.prob.home * 100), draw: round(model.prob.draw * 100), away: round(model.prob.away * 100) },
    marketProbabilities: marketProb ? { home: round(marketProb.home * 100), draw: round(marketProb.draw * 100), away: round(marketProb.away * 100), margin: round(marketProb.margin * 100, 2) } : null,
    edge: { home: round(edge.home * 100), draw: round(edge.draw * 100), away: round(edge.away * 100) },
    direction: { key: markets.winDrawLose[0].key, label: markets.winDrawLose[0].label, p: markets.winDrawLose[0].p },
    goals: { main: totals.bands.slice(0, 2).map(x => x.label), backup: totals.bands.slice(2, 4).map(x => x.label) },
    scores,
    markets,
    scheme,
    market,
    risk,
    riskScore: round(riskScore, 2),
    confidence,
    factors: { environment: round(xg.env * 100), homeDrag: round(xg.homeDrag * 100), awayDrag: round(xg.awayDrag * 100), uncertainty: round(uncertainty * 100) },
    explanation,
  };
}

export function rankAnalyses(list, sortBy = 'confidence') {
  const riskOrder = { low: 1, medium: 2, high: 3, avoid: 4 };
  return [...list].sort((a, b) => {
    if (sortBy === 'kickoff') return new Date(a.match.kickoff) - new Date(b.match.kickoff);
    if (sortBy === 'edge') return Math.max(Math.abs(b.edge.home), Math.abs(b.edge.draw), Math.abs(b.edge.away)) - Math.max(Math.abs(a.edge.home), Math.abs(a.edge.draw), Math.abs(a.edge.away));
    if (sortBy === 'risk') return riskOrder[a.risk.key] - riskOrder[b.risk.key];
    return b.confidence - a.confidence;
  });
}
