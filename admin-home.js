const $ = id => document.getElementById(id);

function show(text) {
  $('statusBox').textContent = text;
}

async function checkHealth() {
  try {
    const [healthRes, backupsRes, matchesRes] = await Promise.all([
      fetch('/api/health', { cache: 'no-store' }),
      fetch('/api/backups', { cache: 'no-store' }),
      fetch('/api/matches', { cache: 'no-store' })
    ]);
    const health = await healthRes.json();
    const backups = await backupsRes.json();
    const matches = await matchesRes.json();
    show([
      '服务状态：' + (health.ok ? '正常' : '异常'),
      '服务名称：' + (health.service || '-'),
      '当前时间：' + (health.time || '-'),
      '赛事数量：' + ((matches.matches || []).length),
      '备份数量：' + ((backups.backups || []).length),
      '项目数据：' + (health.dataFile || '-'),
      '前台数据：' + (health.publicDataFile || '-')
    ].join('\n'));
  } catch (err) {
    show('服务检查失败：' + err.message);
  }
}

$('healthBtn').onclick = checkHealth;
$('frontBtn').onclick = () => location.href = './?phase2';
checkHealth();
