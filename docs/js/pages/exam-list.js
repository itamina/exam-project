'use strict';

window.ExamApp = window.ExamApp || {};
window.ExamApp.pages = window.ExamApp.pages || {};

window.ExamApp.pages.examList = {
  currentFilter: 'all',
  searchQuery: '',

  async render(container, params) {
    this._container = container;
    await this._renderInner();
  },

  async _renderInner() {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const navigate = window.ExamApp.router.navigate;
    const container = this._container;

    const [stats, exams] = await Promise.all([
      store.getStats(),
      store.getExams(this.currentFilter === 'all' ? null : this.currentFilter, this.searchQuery),
    ]);

    const university = store.getUniversity();

    const tabs = [
      { key: 'all', label: 'すべて', count: stats.total },
      { key: 'pending', label: '未申請', count: stats.pending },
      { key: 'confirmed', label: '申請済み', count: stats.confirmed },
      { key: 'needs_correction', label: '差し戻し', count: stats.needs_correction },
    ];

    container.innerHTML = `
      <div class="page-header">
        <div class="page-title">入試情報一覧</div>
        <div class="page-subtitle">${utils.escapeHtml(university.name)} 2025年度 入試情報</div>
      </div>

      <div class="filter-tabs" id="filter-tabs">
        ${tabs.map(tab => `
          <button class="filter-tab${this.currentFilter === tab.key ? ' active' : ''}" data-tab="${tab.key}">
            ${tab.label}
            <span class="filter-tab-count">${tab.count}</span>
          </button>
        `).join('')}
      </div>

      <div class="toolbar">
        <div class="search-box">
          <span class="search-box-icon">${utils.icons.search}</span>
          <input
            class="search-input"
            type="text"
            id="exam-search"
            placeholder="入試名・学部・学科・入試種別で検索..."
            value="${utils.escapeHtml(this.searchQuery)}"
          />
        </div>
        <div style="font-size:12px;color:var(--text-secondary)">${exams.length}件表示</div>
      </div>

      <div class="table-wrapper">
        ${exams.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon">🔍</div>
            <div class="empty-state-title">該当する入試情報がありません</div>
            <div class="empty-state-desc">絞り込み条件を変更してください</div>
          </div>
        ` : `
          <table class="data-table">
            <thead>
              <tr>
                <th style="min-width:160px">学部 / 学科</th>
                <th style="min-width:220px">入試名</th>
                <th style="min-width:160px">出願期間</th>
                <th style="width:60px;text-align:center">定員</th>
                <th style="min-width:110px;text-align:center">ステータス</th>
                <th style="min-width:140px;text-align:center">アクション</th>
              </tr>
            </thead>
            <tbody id="exam-table-body">
              ${exams.map(exam => this._renderRow(exam, utils)).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;

    document.getElementById('filter-tabs').querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentFilter = btn.dataset.tab;
        this._renderInner();
      });
    });

    const searchInput = document.getElementById('exam-search');
    if (searchInput) {
      let timer;
      searchInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          this.searchQuery = searchInput.value;
          this._renderInner();
        }, 250);
      });
    }

    container.querySelectorAll('[data-go-exam]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        navigate('/exams/' + el.dataset.goExam);
      });
    });

    container.querySelectorAll('[data-quick-confirm]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const examId = btn.dataset.quickConfirm;
        this._quickConfirm(examId);
      });
    });
  },

  _renderRow(exam, utils) {
    const isActionable = exam.status === 'pending';
    return `
      <tr data-go-exam="${exam.id}">
        <td>
          <div class="table-faculty">${utils.escapeHtml(exam.faculty)}</div>
          <div style="font-weight:600;font-size:13px">${utils.escapeHtml(exam.department)}</div>
        </td>
        <td>
          <div class="table-exam-name">${utils.escapeHtml(exam.examName)}</div>
          <div class="table-faculty">${utils.escapeHtml(exam.examType)}</div>
        </td>
        <td>
          <div class="table-date">${utils.formatDate(exam.applicationPeriod.start)}</div>
          <div style="font-size:11px;color:var(--text-muted)">〜 ${utils.formatDate(exam.applicationPeriod.end)}</div>
        </td>
        <td style="text-align:center">
          <span class="table-quota">${exam.quota}<span style="font-size:11px;font-weight:normal;color:var(--text-secondary)">名</span></span>
        </td>
        <td style="text-align:center">
          ${utils.badgeHtml(exam.status)}
        </td>
        <td style="text-align:center">
          <div style="display:flex;gap:6px;justify-content:center;align-items:center">
            ${isActionable ? `
              <button class="btn btn-success btn-sm" data-quick-confirm="${exam.id}" title="確認する">
                ${utils.icons.check} 確認
              </button>
            ` : ''}
            <button class="btn btn-secondary btn-sm" data-go-exam="${exam.id}">
              詳細
            </button>
          </div>
        </td>
      </tr>
    `;
  },

  async _quickConfirm(examId) {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const exam = await store.getExam(examId).catch(() => null);
    if (!exam) return;

    utils.openModal(`
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${utils.icons.check} &nbsp;入試情報の確認</span>
          <button class="modal-close" id="modal-close-btn">${utils.icons.x}</button>
        </div>
        <div class="modal-body">
          <div class="alert alert-info" style="margin-bottom:16px">
            <div class="alert-icon">${utils.icons.info}</div>
            <div>
              <div class="alert-title">以下の入試情報を確認済みにします</div>
              <div class="alert-body">${utils.escapeHtml(exam.examName)}</div>
            </div>
          </div>
          <label class="confirm-checkbox-label" id="confirm-checkbox-wrap">
            <input type="checkbox" class="confirm-checkbox" id="quick-confirm-check" />
            上記の入試情報の内容に誤りがないことを確認しました。
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel-btn">キャンセル</button>
          <button class="btn btn-success" id="modal-confirm-btn" disabled>
            ${utils.icons.check} 確認する
          </button>
        </div>
      </div>
    `);

    const check = document.getElementById('quick-confirm-check');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    check.addEventListener('change', () => { confirmBtn.disabled = !check.checked; });
    document.getElementById('modal-close-btn').addEventListener('click', () => utils.closeModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => utils.closeModal());
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      await store.confirmExam(examId);
      utils.closeModal();
      utils.showToast('確認済みにしました', 'success');
      await this._renderInner();
    });
  },
};
