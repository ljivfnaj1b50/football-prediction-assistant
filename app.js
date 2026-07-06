const $ = (id) => document.getElementById(id);

function safeSet(id, html) {
  const node = $(id);
  if (node) node.innerHTML = html;
}

safeSet('sourceStatus', '<div class="status-card"><strong>V2 框架</strong><p>页面已升级，后续接入自动数据源。</p><span class="status-pill status-demo">准备中</span></div>');
if ($('lastUpdated')) $('lastUpdated').textContent = 'V2 页面已加载';
safeSet('matchList', '<article class="match-card active"><div class="teams">V2 自动分析框架</div><div class="meta">等待数据源配置。</div></article>');
safeSet('matchDetail', '<div class="detail-header"><div><div class="detail-title">鲸喜足球模型 V2</div><div class="kickoff">自动数据源框架准备中</div></div><span class="badge medium">V2</span></div><div class="edge-box"><strong>说明：</strong>已从手动录入结构升级为自动化框架，完整模型代码包请使用本次提供的压缩包。</div>');
