const $ = id => document.getElementById(id);

function status(text) { $('statusBox').textContent = text; }
function escapeHtml(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function loadBackups() {
  try {
    const res = await fetch('/api/backups', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.message || '读取失败');
    renderBackups(data.backups || []);
    status(`已读取备份：${(data.backups || []).length} 个`);
  } catch (err) {
    status('读取备份失败：' + err.message);
  }
}

function renderBackups(rows) {
  if (!rows.length) {
    $('backupList').innerHTML = '<div class="backup-item"><div><strong>暂无备份</strong><span>保存一次赛事数据后会自动生成备份。</span></div></div>';
    return;
  }
  $('backupList').innerHTML = rows.map(row => `
    <div class="backup-item">
      <div>
        <strong>${escapeHtml(row.name)}</strong>
        <span>${escapeHtml(row.file)}</span>
      </div>
      <button class="danger-btn" data-name="${escapeHtml(row.name)}">恢复这个备份</button>
    </div>
  `).join('');
  document.querySelectorAll('[data-name]').forEach(btn => {
    btn.onclick = () => restoreBackup(btn.dataset.name);
  });
}

async function restoreBackup(name) {
  const token = $('tokenInput').value.trim();
  if (!token) return status('请先输入后台口令。');
  if (!confirm(`确认恢复备份：${name}？当前数据会先自动备份。`)) return;
  try {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ name })
    });
    const result = await res.json();
    if (!res.ok || !result.ok) return status('恢复失败：' + (result.message || res.status));
    status(`恢复成功\n备份：${result.restored}\n赛事数量：${result.count}\n前台数据已同步。`);
    loadBackups();
  } catch (err) {
    status('恢复异常：' + err.message);
  }
}

$('loadBtn').onclick = loadBackups;
$('formBtn').onclick = () => location.href = './admin-form.html?form2';
$('frontBtn').onclick = () => location.href = './?phase2';
loadBackups();
