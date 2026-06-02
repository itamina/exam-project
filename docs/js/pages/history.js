'use strict';

window.ExamApp = window.ExamApp || {};
window.ExamApp.pages = window.ExamApp.pages || {};

window.ExamApp.pages.history = {
  filterType: 'all',
  _history: [],

  async render(container) {
    this._container = container;
    this._history = await window.ExamApp.store.getHistory().catch(() => []);
    this._renderInner();
  },

  _renderInner() {
    const utils = window.ExamApp.utils;
    const navigate = window.ExamApp.router.navigate;
    const container = this._container;

    const allHistory = this._history;
    let history = allHistory;
    if (this.filterType !== 'all') {
      history = history.filter(h => h.type === this.filterType);
    }

    const confirmCount = allHistory.filter(h => h.type === 'confirm').length;
    const editCount = allHistory.filter(h => h.type === 'edit').length;
    const returnedCount = allHistory.filter(h => h.type === 'returned').length;

    const actionLabel = (type) => {
      if (type === 'confirm') return `<span style="color:var(--success)">✓ 確認申請しました</span>`;
      if (type === 'edit') return `<span style="color:var(--info)">✎ 内容を修正しました</span>`;
      if (type === 'returned') return `<span style="color:var(--danger)">↩ 運営より差し戻し</span>`;
      return `<span>${type}</span>`;
    };

    const dotClass = (type) => {
      if (type === 'confirm') return 'history-dot-confirm';
      if (type === 'returned') return 'history-dot-correction';
      return 'history-dot-update';
    };

    const noteStyle = (type) => type === 'returned'
      ? 'background:var(--danger-50);border-left:3px solid var(--danger)'
      : 'background:var(--info-50);border-left:3px solid var(--info)';

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">操作履歴</div>
        <div class="page-subtitle">入試情報の申請・修正・差し戻しの操作ログ</div>
      </div>

      <div class="card">
        <div class="card-header" style="flex-wrap:wrap;gap:12px">
          <div class="filter-tabs" style="margin:0;background:transparent;padding:0;gap:8px">
            <button class="filter-tab${this.filterType === 'all' ? ' active' : ''}" data-filter="all">
              すべて <span class="filter-tab-count">${allHistory.length}</span>
            </button>
            <button class="filter-tab${this.filterType === 'confirm' ? ' active' : ''}" data-filter="confirm">
              申請のみ <span class="filter-tab-count">${confirmCount}</span>
            </button>
            <button class="filter-tab${this.filterType === 'edit' ? ' active' : ''}" data-filter="edit">
              修正のみ <span class="filter-tab-count">${editCount}</span>
            </button>
            <button class="filter-tab${this.filterType === 'returned' ? ' active' : ''}" data-filter="returned">
              差し戻しのみ <span class="filter-tab-count">${returnedCount}</span>
            </button>
          </div>
          <button class="export-btn" id="export-csv-btn">
            ${utils.icons.download} CSV出力
          </button>
        </div>

        ${history.length === 0 ? `
          <div class="empty-state" style="padding:48px 24px">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">履歴がありません</div>
            <div class="empty-state-desc">入試情報を申請すると、ここに履歴が記録されます</div>
          </div>
        ` : `
          <div style="padding:0">
            ${history.map(h => `
              <div class="history-entry">
                <div class="history-dot ${dotClass(h.type)}"></div>
                <div class="history-content">
                  <div class="history-action">${actionLabel(h.type)}</div>
                  <div class="history-exam-name" data-exam-id="${h.examId}">${utils.escapeHtml(h.examName)}</div>
                  <div class="history-detail">${utils.escapeHtml(h.faculty)} / ${utils.escapeHtml(h.department)}</div>
                  ${h.note ? `
                    <div class="history-detail" style="margin-top:6px;padding:8px 10px;border-radius:var(--radius-sm);${noteStyle(h.type)}">
                      ${utils.escapeHtml(h.note)}
                    </div>
                  ` : ''}
                  <div class="history-detail" style="margin-top:4px">担当: ${utils.escapeHtml(h.performedBy)}</div>
                </div>
                <div class="history-time">${utils.formatDateTime(h.performedAt)}</div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:20px">
        <div class="stat-card">
          <div class="stat-label">総操作件数</div>
          <div><span class="stat-value total">${allHistory.length}</span><span class="stat-suffix"> 件</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">✓ 申請件数</div>
          <div><span class="stat-value confirmed">${confirmCount}</span><span class="stat-suffix"> 件</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">✎ 修正件数</div>
          <div><span class="stat-value pending">${editCount}</span><span class="stat-suffix"> 件</span></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">↩ 差し戻し件数</div>
          <div><span class="stat-value attention">${returnedCount}</span><span class="stat-suffix"> 件</span></div>
        </div>
      </div>
    `;

    container.querySelectorAll('.filter-tab[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.filterType = btn.dataset.filter;
        this._renderInner();
      });
    });

    container.querySelectorAll('.history-exam-name[data-exam-id]').forEach(el => {
      el.addEventListener('click', () => navigate('/exams/' + el.dataset.examId));
    });

    document.getElementById('export-csv-btn').addEventListener('click', () => {
      this._exportCSV(allHistory, utils);
    });
  },

  _exportCSV(history, utils) {
    const typeLabel = { confirm: '確認申請', edit: '内容修正', returned: '差し戻し（運営より）' };
    const headers = ['操作日時', '入試名', '学部', '学科', 'アクション', '担当者', '内容'];
    const rows = history.map(h => [
      utils.formatDateTime(h.performedAt),
      h.examName,
      h.faculty,
      h.department,
      typeLabel[h.type] || h.type,
      h.performedBy,
      h.note || '',
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const bom = '﻿';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `操作履歴_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    utils.showToast('CSVをダウンロードしました', 'success');
  },
};
