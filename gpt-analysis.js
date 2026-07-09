const https = require('https');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5.5';
const CACHE_MS = Number(process.env.GPT_ANALYSIS_TTL_MS || 30 * 60 * 1000);
const cache = new Map();

function requestOpenAI(payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = https.request({ hostname: 'api.openai.com', path: '/v1/responses', method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { return reject(new Error('GPT返回内容无法解析')); }
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(data?.error?.message || `GPT接口 ${res.statusCode}`));
        resolve(data);
      });
    });
    req.on('error', reject);
    req.setTimeout(90000, () => req.destroy(new Error('GPT分析超时')));
    req.end(body);
  });
}

function extractText(data) { return (data.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n').trim(); }
function extractSources(data) {
  const seen = new Set();
  return (data.output || []).flatMap(item => item.content || []).flatMap(item => item.annotations || []).map(item => ({ title: item.title || item.url || '资料来源', url: item.url || '' })).filter(item => item.url && !seen.has(item.url) && seen.add(item.url)).slice(0, 8);
}

async function analyzeWithGpt(match) {
  if (!OPENAI_API_KEY) return { ok: false, configured: false, message: '服务器尚未配置OPENAI_API_KEY，未生成任何模型分析。' };
  const key = `${match.id}:${match.kickoff}:${JSON.stringify(match.odds || {})}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.createdAt < CACHE_MS) return cached.value;
  const factualInput = {
    id: match.id, competition: match.competition, stage: match.stage, businessDate: match.businessDate,
    kickoff: match.kickoff, status: match.status, home: match.home?.name, away: match.away?.name,
    officialOdds: match.odds || {}, officialMatchNumber: match.jcNum || '', venue: match.venue || null,
    weather: match.weatherSource === 'live' ? match.weather : null,
    injuries: { home: match.home?.injuriesSource === 'verified' ? match.home.injuries : null, away: match.away?.injuriesSource === 'verified' ? match.away.injuries : null }
  };
  const data = await requestOpenAI({
    model: OPENAI_MODEL,
    reasoning: { effort: 'medium' },
    tools: [{ type: 'web_search' }],
    instructions: [
      '你是鲸喜体育的主分析模型。用自然、克制的中文分析足球赛事。',
      '必须以用户提供的中国体育彩票官方赛程和赔率为基线，并通过联网检索核验近期战绩、伤停、停赛、预计阵容、休息时间、赛程连续性、战术、天气等。',
      '只写能由输入或检索来源支持的事实。任何无法确认的信息必须明确写“暂无可靠公开信息”，严禁编造更衣室关系、私人关系、受注量、水位或伤停。',
      '输出结构：先写“GPT主分析”，再按“官方数据、基本面、阵容与体能、战术对位、市场与风险、结论”六段展开。',
      '结论必须区分事实、推断和不确定项；不要承诺盈利，不要把概率写成确定结果。'
    ].join('\n'),
    input: `请分析以下赛事。官方输入数据：\n${JSON.stringify(factualInput, null, 2)}`
  });
  const text = extractText(data);
  if (!text) throw new Error('GPT未返回分析正文');
  const value = { ok: true, configured: true, model: OPENAI_MODEL, text, sources: extractSources(data), generatedAt: new Date().toISOString() };
  cache.set(key, { createdAt: Date.now(), value });
  return value;
}

module.exports = { analyzeWithGpt, OPENAI_MODEL, gptConfigured: Boolean(OPENAI_API_KEY) };
