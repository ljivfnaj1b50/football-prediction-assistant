const dimensions = [
  { key: "strength", name: "实力", hint: "排名、阵容、主教练、上一轮表现" },
  { key: "attackDefense", name: "攻防", hint: "进球/失球、压迫/低位、防线质量" },
  { key: "marketValue", name: "身价", hint: "总身价、旅欧球员、核心射手" },
  { key: "history", name: "历史", hint: "交锋、世界杯经验，低权重" },
  { key: "environment", name: "环境", hint: "海拔、主客、赛程、旅行消耗" },
  { key: "weather", name: "天气", hint: "温度、雨、湿度、风" },
  { key: "referee", name: "裁判", hint: "红黄牌、点球尺度，未知记0" },
  { key: "motivation", name: "战意", hint: "淘汰赛压力、保守/刷球动机" },
];

const defaultScores = {
  strength: 2,
  attackDefense: 1,
  marketValue: 2,
  history: 1,
  environment: 0,
  weather: 0,
  referee: 0,
  motivation: 1,
};

const $ = (id) => document.getElementById(id);

function renderDimensions(scores = defaultScores) {
  const box = $("dimensionList");
  box.innerHTML = "";
  dimensions.forEach(d => {
    const row = document.createElement("div");
    row.className = "dimension-row";
    row.innerHTML = `
      <div><strong>${d.name}</strong><br><small>${d.hint}</small></div>
      <input type="range" min="-5" max="5" step="1" value="${scores[d.key] ?? 0}" data-key="${d.key}" />
      <div class="score-pill" id="pill-${d.key}">${scores[d.key] ?? 0}</div>
    `;
    box.appendChild(row);
  });

  box.querySelectorAll("input[type=range]").forEach(input => {
    input.addEventListener("input", () => {
      $("pill-" + input.dataset.key).textContent = input.value;
    });
  });
}

function collectMatch() {
  const scores = {};
  document.querySelectorAll("#dimensionList input[type=range]").forEach(input => {
    scores[input.dataset.key] = Number(input.value);
  });
  return {
    homeTeam: $("homeTeam").value.trim(),
    awayTeam: $("awayTeam").value.trim(),
    stage: $("stage").value.trim(),
    kickoff: $("kickoff").value.trim(),
    venue: $("venue").value.trim(),
    weatherText: $("weather").value.trim(),
    scores,
    createdAt: new Date().toISOString(),
  };
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function analyze(match) {
  const s = match.scores;
  const total =
    s.strength * 1.25 +
    s.attackDefense * 1.25 +
    s.marketValue * 0.85 +
    s.history * 0.35 +
    s.environment * 0.75 +
    s.weather * 0.55 +
    s.referee * 0.35 +
    s.motivation * 0.9;

  const drawSignals = [
    Math.abs(total) <= 2.2,
    s.attackDefense <= 0,
    s.environment < 0,
    s.weather < 0,
    s.motivation <= 0,
    s.referee < 0,
  ].filter(Boolean).length;

  let home = clamp(38 + total * 4.2, 8, 78);
  let away = clamp(30 - total * 3.2, 8, 70);
  let draw = clamp(100 - home - away, 18, 42);

  if (drawSignals >= 2) {
    draw = Math.max(draw, 30);
    const rem = 100 - draw;
    const ratio = home / (home + away);
    home = rem * ratio;
    away = rem * (1 - ratio);
  }

  home = Math.round(home);
  away = Math.round(away);
  draw = 100 - home - away;

  const pressure = s.attackDefense + s.strength + s.motivation;
  const chaos = Math.abs(s.referee) + Math.max(0, s.marketValue) + Math.max(0, s.attackDefense);
  let totalGoalsMain = [];
  let totalGoalsRisk = [];

  if (pressure >= 6 && chaos >= 4) {
    totalGoalsMain = [2, 3, 4];
    totalGoalsRisk = [5];
  } else if (drawSignals >= 3 || s.environment < -1 || s.weather < -1) {
    totalGoalsMain = [0, 1, 2];
    totalGoalsRisk = [3];
  } else {
    totalGoalsMain = [1, 2, 3];
    totalGoalsRisk = [4];
  }

  const mostLikelyScore = getScoreline(home, draw, away, totalGoalsMain, match);
  const coldRisk = away >= 25 || draw >= 30 ? "中" : "低";
  const direction = home > away && home > draw ? `${match.homeTeam}胜` : away > home && away > draw ? `${match.awayTeam}胜` : "平局优先";

  return { total, home, draw, away, drawSignals, totalGoalsMain, totalGoalsRisk, mostLikelyScore, coldRisk, direction };
}

function getScoreline(home, draw, away, goals, match) {
  if (draw >= 32) {
    if (goals.includes(2)) return "1-1";
    return goals.includes(0) ? "0-0" : "1-1";
  }
  if (home >= away) {
    if (goals.includes(3)) return "2-1";
    if (goals.includes(2)) return "2-0";
    return "1-0";
  }
  if (goals.includes(3)) return "1-2";
  if (goals.includes(2)) return "0-2";
  return "0-1";
}

function renderAnalysis() {
  const match = collectMatch();
  const a = analyze(match);

  $("summaryCards").innerHTML = `
    <div class="card"><div>主胜</div><div class="num">${a.home}%</div></div>
    <div class="card"><div>平局</div><div class="num">${a.draw}%</div></div>
    <div class="card"><div>客胜</div><div class="num">${a.away}%</div></div>
  `;

  const bigWarn = a.totalGoalsMain.includes(4) ? "中" : "低";
  $("recommendation").textContent =
`比赛：${match.homeTeam} vs ${match.awayTeam}
阶段/时间/球场：${match.stage}｜${match.kickoff}｜${match.venue}

主结论：${a.direction}
最可能比分：${a.mostLikelyScore}
总进球主推：${a.totalGoalsMain.join(" / ")}球
风险补防：${a.totalGoalsRisk.join(" / ")}球
冷门指数：${a.coldRisk}
大胜预警：${bigWarn}

折损/平局提示：${a.drawSignals >= 2 ? `触发${a.drawSignals}项折损信号，平局权重已上调。` : "未明显触发，按常规模型处理。"}

八维总分：${a.total.toFixed(2)}
执行纪律：主票只围绕总进球主推区间；补票只防一个最大漏洞；不建议无限扩票。`;

  return { match, analysis: a };
}

function generatePlan() {
  const { match, analysis } = renderAnalysis();
  const budget = Number($("budget").value || 100);
  const risk = $("riskLevel").value;

  let mainPct = risk === "steady" ? 0.85 : risk === "high" ? 0.65 : 0.75;
  let mainMoney = Math.floor((budget * mainPct) / 2) * 2;
  let backupMoney = budget - mainMoney;

  const main = analysis.totalGoalsMain.join("/");
  const riskGoals = analysis.totalGoalsRisk.join("/");

  $("ticketPlan").textContent =
`最终执行版，以这一版为准：

主票：${mainMoney}元
${match.homeTeam} vs ${match.awayTeam}：总进球 ${main}球
用途：主攻方向，优先保证思路统一。

补票：${backupMoney}元
${match.homeTeam} vs ${match.awayTeam}：总进球 ${riskGoals}球
用途：只防一个最大漏洞，不继续扩。

不建议买：
比分重仓、过多容错、临场情绪补票。

说明：
这是单场方案。多场串关时，应把每场的“主推总进球区间”组合后再按预算计算注数。`;
}

function saveRecord() {
  const payload = renderAnalysis();
  const records = JSON.parse(localStorage.getItem("jxx-football-records") || "[]");
  records.unshift(payload);
  localStorage.setItem("jxx-football-records", JSON.stringify(records.slice(0, 50)));
  renderHistory();
}

function renderHistory() {
  const records = JSON.parse(localStorage.getItem("jxx-football-records") || "[]");
  $("historyList").innerHTML = records.length ? records.map((r, i) => `
    <div class="history-item">
      <strong>${r.match.homeTeam} vs ${r.match.awayTeam}</strong><br>
      <small>${new Date(r.match.createdAt).toLocaleString()}</small><br>
      方向：${r.analysis.direction}｜比分：${r.analysis.mostLikelyScore}｜总进球：${r.analysis.totalGoalsMain.join("/")}
    </div>
  `).join("") : `<p>暂无记录。分析后点“保存记录”。</p>`;
}

function reviewMatch() {
  const { match, analysis } = renderAnalysis();
  const hg = Number($("homeGoals").value);
  const ag = Number($("awayGoals").value);
  const tg = hg + ag;
  const totalHit = analysis.totalGoalsMain.includes(tg);
  const riskHit = analysis.totalGoalsRisk.includes(tg);
  const score = `${hg}-${ag}`;
  const exact = score === analysis.mostLikelyScore;

  $("reviewBox").textContent =
`赛后复盘：${match.homeTeam} ${score} ${match.awayTeam}

总进球：${tg}球
主推区间：${analysis.totalGoalsMain.join("/")}球
结果：${totalHit ? "主推命中" : riskHit ? "补防命中" : "未命中"}

比分预测：${analysis.mostLikelyScore}
比分结果：${exact ? "精准命中" : "未命中"}

模型复盘：
${totalHit ? "总进球节奏判断正确，可以保留该场模型权重。" : "总进球偏离，需检查球星爆点、红牌点球、落后方压上、天气/海拔权重是否失衡。"}

下一场修正：
1. 如果顶级射手或红牌风险明显，不要把总进球压得太窄。
2. 如果淘汰赛双方都保守，可增加0球/1球低位防线。
3. 主票只定一个方向，补票只防一个漏洞。`;
}

function seed() {
  $("homeTeam").value = "墨西哥";
  $("awayTeam").value = "英格兰";
  $("stage").value = "世界杯淘汰赛";
  $("kickoff").value = "今晚";
  $("venue").value = "阿兹特克球场/墨西哥城";
  $("weather").value = "高原，主场强压，偏低节奏";
  renderDimensions({
    strength: -2,
    attackDefense: -1,
    marketValue: -3,
    history: -1,
    environment: 3,
    weather: 1,
    referee: 0,
    motivation: 1,
  });
  renderAnalysis();
}

$("analyzeBtn").addEventListener("click", renderAnalysis);
$("planBtn").addEventListener("click", generatePlan);
$("saveBtn").addEventListener("click", saveRecord);
$("clearBtn").addEventListener("click", () => {
  localStorage.removeItem("jxx-football-records");
  renderHistory();
});
$("reviewBtn").addEventListener("click", reviewMatch);
$("seedBtn").addEventListener("click", seed);

renderDimensions();
renderAnalysis();
renderHistory();
