const $ = id => document.getElementById(id);

function setStatus(text) {
  $('summaryBox').textContent = text;
}

async function loadData() {
  try {
    const res = await fetch('/api/matches', { cache: 'no-store' });
    if (!res.ok) throw new Error('API 未启动，尝试读取静态数据');
    const data = await res.json();
    $('jsonEditor').value = JSON.stringify(data, null, 2);
    renderSummary(data, '已从服务器 API 读取');
  } catch (err) {
    const res = await fetch('./data/matches.json?ts=' + Date.now(), { cache: 'no-store' });
    const data = await res.json();
    $('jsonEditor').value = JSON.stringify(data, null, 2);
    renderSummary(data, 'API 未启动，已从静态数据读取');
  }
}

function readEditor() {
  return JSON.parse($('jsonEditor').value);
}

function validate(data) {
  if (!data || typeof data !== 'object') return '数据必须是对象';
  if (!Array.isArray(data.matches)) return 'matches 必须是数组';
  for (const item of data.matches) {
    if (!item.id) return '每场比赛必须有 id';
    if (!item.home?.name || !item.away?.name) return `${item.id || '某场比赛'} 缺少球队名称`;
    if (!item.kickoff) return `${item.id} 缺少开球时间 kickoff`;
    if (!item.venue) return `${item.id} 缺少球场 venue`;
    if (!item.weather) return `${item.id} 缺少天气 weather`;
    item.home.form = item.home.form || [];
    item.away.form = item.away.form || [];
    item.home.injuries = item.home.injuries || [];
    item.away.injuries = item.away.injuries || [];
    item.home.suspensions = item.home.suspensions || [];
    item.away.suspensions = item.away.suspensions || [];
  }
  return '';
}

function renderSummary(data, prefix = '状态') {
  const matches = data.matches || [];
  const lines = [];
  lines.push(`${prefix}`);
  lines.push(`模式：${data.mode || '未设置'}`);
  lines.push(`更新时间：${data.updatedAt || '未设置'}`);
  lines.push(`赛事数量：${matches.length}`);
  lines.push('');
  matches.forEach((m, i) => {
    lines.push(`${i + 1}. ${m.home?.name || '-'} vs ${m.away?.name || '-'}｜${m.kickoff || '-'}`);
  });
  setStatus(lines.join('\n'));
}

function formatEditor() {
  try {
    const data = readEditor();
    $('jsonEditor').value = JSON.stringify(data, null, 2);
    renderSummary(data, '格式化成功');
  } catch (err) {
    setStatus('JSON 格式错误：' + err.message);
  }
}

function validateEditor() {
  try {
    const data = readEditor();
    const err = validate(data);
    if (err) return setStatus('校验失败：' + err);
    renderSummary(data, '校验通过');
  } catch (err) {
    setStatus('JSON 格式错误：' + err.message);
  }
}

async function saveData() {
  try {
    const token = $('tokenInput').value.trim();
    if (!token) return setStatus('请先输入后台口令。');
    const data = readEditor();
    const err = validate(data);
    if (err) return setStatus('校验失败：' + err);
    const res = await fetch('/api/matches', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(data)
    });
    const result = await res.json();
    if (!res.ok || !result.ok) return setStatus('保存失败：' + (result.message || res.status));
    setStatus(`保存成功\n更新时间：${result.updatedAt}\n赛事数量：${result.count}\n请回到前台点击“自动刷新数据”。`);
  } catch (err) {
    setStatus('保存异常：' + err.message);
  }
}

$('loadBtn').onclick = loadData;
$('validateBtn').onclick = validateEditor;
$('formatBtn').onclick = formatEditor;
$('saveBtn').onclick = saveData;
$('backBtn').onclick = () => location.href = './?phase1';
loadData();
