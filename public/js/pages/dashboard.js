'use strict';

window.ExamApp = window.ExamApp || {};
window.ExamApp.pages = window.ExamApp.pages || {};

window.ExamApp.pages.dashboard = {
  async render(container) {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const navigate = window.ExamApp.router.navigate;

    const user = store.getCurrentUser();
    const university = store.getUniversity();

    const [stats, notifications, pendingExams, attentionExams] = await Promise.all([
      store.getStats(),
      store.getNotifications().catch(() => []),
      store.getExams('pending', ''),
      store.getExams('needs_correction', ''),
    ]);

    const daysLeft = utils.daysUntil(university.confirmDeadline);
    const progressPct = Math.max(0, Math.min(100, Math.round((stats.confirmed / stats.total) * 100)));
    const deadlineClass = daysLeft <= 14 ? 'urgent' : '';

    const pendingSlice = pendingExams.slice(0, 4);
    const attentionSlice = attentionExams.slice(0, 3);

    container.innerHTML = `
      <div class="welcome-banner">
        <div class="welcome-greeting">ようこそ、${utils.escapeHtml(user.name)} 様</div>
        <div class="welcome-school">${utils.escapeHtml(university.name)} ／ ${utils.escapeHtml(user.role)}</div>
      </div>

      ${stats.attention > 0 ? `
        <div class="alert alert-danger" style="margin-bottom:16px">
          <div class="alert-icon" style="font-size:18px">↩</div>
          <div>
            <div class="alert-title">運営より差し戻しがあります</div>
            <div class="alert-body">
              ${stats.needs_correction}件の入試情報が差し戻されています。内容をご確認・修正の上、再申請してください。
              <span class="link" id="go-attention-link" style="margin-left:8px">確認する →</span>
            </div>
          </div>
        </div>
      ` : stats.pending > 0 ? `
        <div class="alert alert-warning" style="margin-bottom:16px">
          <div class="alert-icon">${utils.icons.alert}</div>
          <div>
            <div class="alert-title">未申請の入試情報があります</div>
            <div class="alert-body">
              ${stats.pending}件の入試情報が未申請です。申請期限（${utils.formatDate(university.confirmDeadline)}）までにご確認・申請をお願いします。
            </div>
          </div>
        </div>
      ` : `
        <div class="alert alert-success" style="margin-bottom:16px">
          <div class="alert-icon">${utils.icons.check}</div>
          <div>
            <div class="alert-title">すべての入試情報が申請済みです</div>
            <div class="alert-body">運営にて審査・公開を行います。内容の変更がある場合は各情報から修正・再申請してください。</div>
          </div>
        </div>
      `}

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">入試情報 合計</div>
          <div><span class="stat-value total">${stats.total}</span><span class="stat-suffix"> 件</span></div>
          <div class="stat-sub">${utils.escapeHtml(university.name)} 全入試</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">✓ 申請済み</div>
          <div><span class="stat-value confirmed">${stats.confirmed}</span><span class="stat-suffix"> 件</span></div>
          <div class="stat-sub">進捗 ${progressPct}%</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">◎ 未申請</div>
          <div><span class="stat-value pending">${stats.pending}</span><span class="stat-suffix"> 件</span></div>
          <div class="stat-sub">確認・申請が必要</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">↩ 差し戻し</div>
          <div><span class="stat-value attention">${stats.attention}</span><span class="stat-suffix"> 件</span></div>
          <div class="stat-sub">修正・再申請が必要</div>
        </div>
      </div>

      <div class="dashboard-grid">
        <div>
          <div class="card">
            <div class="card-header">
              <span class="card-title">◎ 未申請の入試情報</span>
              <a class="link" href="#/exams">一覧を見る →</a>
            </div>
            ${pendingSlice.length === 0 ? `
              <div class="empty-state" style="padding:32px 24px">
                <div class="empty-state-title" style="font-size:13px">未申請の情報はありません</div>
              </div>
            ` : `
              <ul class="pending-list" id="pending-list">
                ${pendingSlice.map(exam => `
                  <li class="pending-item" data-exam-id="${exam.id}">
                    <div class="pending-item-info">
                      <div class="pending-item-name">${utils.escapeHtml(exam.examName)}</div>
                      <div class="pending-item-meta">${utils.escapeHtml(exam.faculty)} / ${utils.escapeHtml(exam.department)} ・ 募集${exam.quota}名</div>
                    </div>
                    <div class="pending-item-actions">
                      ${utils.badgeHtml(exam.status)}
                    </div>
                  </li>
                `).join('')}
                ${stats.pending > 4 ? `
                  <li style="padding:12px 20px;text-align:center">
                    <a class="link" href="#/exams">他 ${stats.pending - 4}件を見る →</a>
                  </li>
                ` : ''}
              </ul>
            `}

            ${attentionSlice.length > 0 ? `
              <div class="card-header" style="border-top:1px solid var(--border)">
                <span class="card-title">↩ 差し戻し</span>
              </div>
              <ul class="pending-list">
                ${attentionSlice.map(exam => `
                  <li class="pending-item" data-exam-id="${exam.id}">
                    <div class="pending-item-info">
                      <div class="pending-item-name">${utils.escapeHtml(exam.examName)}</div>
                      <div class="pending-item-meta">${utils.escapeHtml(exam.faculty)} / ${utils.escapeHtml(exam.department)}</div>
                    </div>
                    <div class="pending-item-actions">
                      ${utils.badgeHtml(exam.status)}
                    </div>
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>
        </div>

        <div>
          <div class="deadline-widget">
            <div class="deadline-label">📅 確認期限</div>
            <div class="deadline-date">${utils.formatDate(university.confirmDeadline)}</div>
            <div class="deadline-remaining ${deadlineClass}">
              ${daysLeft > 0 ? `残り ${daysLeft} 日` : '期限を超過しています'}
            </div>
            <div class="deadline-progress" style="margin-top:16px">
              <div class="deadline-progress-bar" style="width:${progressPct}%;background:${progressPct === 100 ? 'var(--success)' : daysLeft <= 14 ? 'var(--danger)' : 'var(--warning)'}"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:6px">
              <span>確認済み ${stats.confirmed}件</span>
              <span>${progressPct}%</span>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">📢 お知らせ</span>
            </div>
            <ul class="notice-list">
              ${notifications.map(n => `
                <li class="notice-item">
                  <div class="notice-dot ${n.type === 'returned' ? 'danger' : n.type === 'deadline' ? 'warn' : ''}"></div>
                  <div class="notice-content">
                    <div class="notice-text"><strong>${utils.escapeHtml(n.title)}</strong></div>
                    <div class="notice-text" style="font-weight:normal;margin-top:2px">${utils.escapeHtml(n.body)}</div>
                    <div class="notice-date">${utils.formatDate(n.date)}</div>
                  </div>
                  ${!n.read ? '<span style="color:var(--info);font-size:10px;font-weight:700;flex-shrink:0">NEW</span>' : ''}
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('.pending-item[data-exam-id]').forEach(item => {
      item.addEventListener('click', () => {
        navigate('/exams/' + item.dataset.examId);
      });
    });

    const attnLink = document.getElementById('go-attention-link');
    if (attnLink) {
      attnLink.addEventListener('click', () => navigate('/exams'));
    }
  },
};
