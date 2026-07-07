const $ = id => document.getElementById(id);

function show(text) {
  $('statusBox').textContent = text;
}
function token() { return $('tokenInput').value.trim(); }

async function checkHealth() {
  try {
    const t = token();
    const headers = t ? { 'x-admin-token': t } : {};
    const healthRes = await fetch('/api/health', { cache: 'no-store', headers });
    const health = await healthRes.json();

    let matchesCount = '输入口令后可查看';
    let backupsCount = health.backups ?? '输入口令后可查看';
    let dataFile = health.dataFile || '输入口令后可查看';

    if (t) {
      const [backupsRes, matchesRes] = await Promise.all([
        fetch('/api/backups', { cache: 'no-store', headers }),
        fetch('/api/matches', { cache: 'no-store', headers })
      ]);
      const backups = await backupsRes.json();
      const matches = await matchesRes.json();
      if (backupsRes.ok && backups.ok) backupsCount = (backups.backups || []).length;
      if (matchesRes.ok && matches.matches) matchesCount = matches.matches.length;
    }

    show([
      '服务状态：' + (health.ok ? '正常' : '异常'),
      '安全状态：' + (health.secured ? '已收口' : '待确认'),
      '服务名称：' + (health.service || '-'),
      '当前时间：' + (health.time || '-'),
      '赛事数量：' + matchesCount,
      '备份数量：' + backupsCount,
      '项目数据：' + dataFile,
      '前台数据：' + (health.publicDataFile || '-')
    ].join('\n'));
  } catch (err) {
    show('服务检查失败：' + err.message);
  }
}

$('healthBtn').onclick = checkHealth;
$('frontBtn').onclick = () => location.href = './?phase2';
checkHealth();
