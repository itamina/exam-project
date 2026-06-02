'use strict';

window.ExamApp = window.ExamApp || {};
window.ExamApp.pages = window.ExamApp.pages || {};

window.ExamApp.pages.examDetail = {
  async render(container, params) {
    this._container = container;
    this._examId = params.id;
    await this._renderInner();
  },

  async _renderInner() {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const navigate = window.ExamApp.router.navigate;
    const container = this._container;

    let exam, allHistory;
    try {
      [exam, allHistory] = await Promise.all([
        store.getExam(this._examId),
        store.getHistory(),
      ]);
    } catch {
      exam = null;
      allHistory = [];
    }

    if (!exam) {
      container.innerHTML = `
        <div class="empty-state" style="padding:80px 24px">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-title">入試情報が見つかりません</div>
          <button class="btn btn-secondary" style="margin-top:16px" id="back-btn">← 一覧に戻る</button>
        </div>
      `;
      document.getElementById('back-btn').addEventListener('click', () => navigate('/exams'));
      return;
    }

    const historyForExam = allHistory.filter(h => h.examId === exam.id);

    container.innerHTML = `
      <div class="breadcrumb">
        <span class="breadcrumb-link" id="bc-dashboard">ダッシュボード</span>
        <span class="breadcrumb-sep">${utils.icons.chevronRight}</span>
        <span class="breadcrumb-link" id="bc-list">入試情報一覧</span>
        <span class="breadcrumb-sep">${utils.icons.chevronRight}</span>
        <span class="breadcrumb-current">${utils.escapeHtml(exam.examName)}</span>
      </div>

      <div class="detail-header">
        <div class="detail-title-section">
          <div class="detail-title">${utils.escapeHtml(exam.examName)}</div>
          <div class="detail-meta">
            ${utils.badgeHtml(exam.status)}
            <div class="detail-meta-item">${utils.icons.calendar} 最終更新: ${utils.formatDate(exam.updatedAt)}</div>
            <div class="detail-meta-item">${utils.icons.user} ${exam.year}年度入試</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0">
          <button class="btn btn-secondary" id="edit-btn">
            ${utils.icons.edit} 修正する
          </button>
          <button class="btn btn-secondary" id="back-to-list-btn">
            ${utils.icons.arrowLeft} 一覧に戻る
          </button>
        </div>
      </div>

      ${exam.status === 'needs_correction' && exam.correctionRequest ? `
        <div class="alert alert-danger" style="margin-bottom:20px">
          <div class="alert-icon" style="font-size:18px">↩</div>
          <div>
            <div class="alert-title">運営より差し戻しがあります</div>
            <div class="alert-body" style="margin-top:6px">
              ${utils.escapeHtml(exam.correctionRequest.content)}<br>
              <span style="font-size:11px;color:#991B1B;margin-top:6px;display:inline-block">
                差し戻し日時: ${utils.formatDateTime(exam.correctionRequest.requestedAt)} ／ ${utils.escapeHtml(exam.correctionRequest.requestedBy)}
              </span>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="card" style="margin-bottom:20px">
        <div class="card-header">
          <span class="card-title">入試情報詳細</span>
          <span class="tag">${utils.escapeHtml(exam.examType)}</span>
        </div>

        <div style="border-radius:0 0 var(--radius-lg) var(--radius-lg);overflow:hidden">
          <div style="display:grid;grid-template-columns:1fr 1fr">
            ${this._cell('学部', exam.faculty)}
            ${this._cell('学科', exam.department)}
            ${this._cell('入試種別', exam.examType)}
            ${this._cell('募集人員', exam.quota + '名')}
            ${this._cell('出願期間', utils.formatDate(exam.applicationPeriod.start) + '　〜　' + utils.formatDate(exam.applicationPeriod.end))}
            ${this._cell('試験日', exam.examDate ? utils.formatDate(exam.examDate) : '独自試験なし（書類・共通テスト）')}
            ${this._cell('合格発表日', utils.formatDate(exam.resultDate))}
            ${this._cell('検定料', utils.formatCurrency(exam.examFee))}
          </div>
          ${this._fullRow('出願資格', utils.escapeHtml(exam.eligibility).replace(/\n/g, '<br>'))}
          ${this._fullRow('選考方法', utils.escapeHtml(exam.selectionMethod).replace(/\n/g, '<br>'))}
          ${exam.subjects && exam.subjects.length > 0
            ? this._fullRow('試験科目・提出書類', exam.subjects.map((s, i) =>
                `<span style="display:flex;align-items:baseline;gap:6px;margin-bottom:3px">
                  <span style="background:var(--gray-200);color:var(--text-secondary);font-size:10px;font-weight:700;padding:1px 5px;border-radius:3px;flex-shrink:0">${i + 1}</span>
                  ${utils.escapeHtml(s)}
                </span>`).join(''))
            : ''}
          ${exam.notes ? this._fullRow('備考・注意事項', utils.escapeHtml(exam.notes).replace(/\n/g, '<br>')) : ''}
        </div>
      </div>

      <div class="confirm-box ${exam.status === 'confirmed' ? 'is-confirmed' : exam.status === 'needs_correction' ? 'is-needs-correction' : ''}" id="confirm-box">
        <div class="confirm-box-header">
          <span style="font-size:16px">${exam.status === 'confirmed' ? '✅' : exam.status === 'needs_correction' ? '↩' : '📋'}</span>
          <span class="confirm-box-title">確認・申請</span>
          ${utils.badgeHtml(exam.status)}
        </div>
        <div class="confirm-box-body" id="confirm-box-body">
          ${this._confirmBoxHtml(exam, utils)}
        </div>
      </div>

      ${historyForExam.length > 0 ? `
        <div class="card" style="margin-top:20px">
          <div class="card-header">
            <span class="card-title">${utils.icons.clock} &nbsp;操作履歴</span>
          </div>
          <div style="padding:0">
            ${historyForExam.map(h => `
              <div class="history-entry">
                <div class="history-dot ${h.type === 'confirm' ? 'history-dot-confirm' : h.type === 'returned' ? 'history-dot-correction' : 'history-dot-update'}"></div>
                <div class="history-content">
                  <div class="history-action">
                    ${h.type === 'confirm' ? '<span style="color:var(--success)">✓ 確認申請しました</span>'
                      : h.type === 'returned' ? '<span style="color:var(--danger)">↩ 運営より差し戻し</span>'
                      : '<span style="color:var(--info)">✎ 内容を修正しました</span>'}
                  </div>
                  ${h.note ? `<div class="history-detail" style="margin-top:4px">${utils.escapeHtml(h.note)}</div>` : ''}
                  <div class="history-detail">${utils.escapeHtml(h.performedBy)}</div>
                </div>
                <div class="history-time">${utils.formatDateTime(h.performedAt)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    document.getElementById('bc-dashboard').addEventListener('click', () => navigate('/dashboard'));
    document.getElementById('bc-list').addEventListener('click', () => navigate('/exams'));
    document.getElementById('back-to-list-btn').addEventListener('click', () => navigate('/exams'));
    document.getElementById('edit-btn').addEventListener('click', () => this._openEditModal(exam.id));

    this._attachConfirmEvents(exam);
  },

  _cell(label, value) {
    const u = window.ExamApp.utils;
    return `
      <div style="padding:14px 16px 14px 20px;font-size:12.5px;font-weight:600;color:var(--text-secondary);background:var(--gray-50);border-bottom:1px solid var(--border);border-right:1px solid var(--border);display:flex;align-items:center">
        ${u.escapeHtml(label)}
      </div>
      <div style="padding:14px 20px;font-size:13.5px;color:var(--text);background:var(--surface);border-bottom:1px solid var(--border)">
        ${u.escapeHtml(String(value))}
      </div>
    `;
  },

  _fullRow(label, valueHtml) {
    const u = window.ExamApp.utils;
    return `
      <div style="display:flex;border-bottom:1px solid var(--border)">
        <div style="padding:14px 16px 14px 20px;font-size:12.5px;font-weight:600;color:var(--text-secondary);background:var(--gray-50);border-right:1px solid var(--border);width:180px;flex-shrink:0;display:flex;align-items:flex-start;padding-top:16px">
          ${u.escapeHtml(label)}
        </div>
        <div style="flex:1;padding:14px 20px;font-size:13.5px;color:var(--text);background:var(--surface);line-height:1.8">
          ${valueHtml}
        </div>
      </div>
    `;
  },

  _confirmBoxHtml(exam, utils) {
    if (exam.status === 'confirmed') {
      return `
        <div class="confirmed-info">
          <div class="confirmed-info-row">
            <span class="confirmed-info-label">申請日時</span>
            <span class="confirmed-info-value">${utils.formatDateTime(exam.confirmedAt)}</span>
          </div>
          <div class="confirmed-info-row">
            <span class="confirmed-info-label">申請者</span>
            <span class="confirmed-info-value">${utils.escapeHtml(exam.confirmedBy)}</span>
          </div>
        </div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
          確認申請済みです。運営にて審査・公開を行います。<br>
          内容を修正する場合は「修正する」ボタンから編集してください。修正後は再申請が必要です。
        </div>
      `;
    }

    const isDiff = exam.status === 'needs_correction';
    return `
      <div style="font-size:13.5px;color:var(--text-secondary);margin-bottom:20px">
        ${isDiff
          ? '運営からの差し戻しがあります。内容を確認・修正の上、再度「確認して申請する」ボタンを押してください。'
          : '内容に誤りがなければ「確認して申請する」ボタンを押してください。申請後、運営にて審査・公開を行います。'
        }
      </div>
      <label class="confirm-checkbox-label">
        <input type="checkbox" class="confirm-checkbox" id="confirm-check" />
        上記の入試情報の内容に誤りがないことを確認しました。
      </label>
      <div class="confirm-actions">
        <button class="btn btn-success btn-lg" id="confirm-btn" disabled>
          ${utils.icons.check} 確認して申請する
        </button>
      </div>
    `;
  },

  _attachConfirmEvents(exam) {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;

    const check = document.getElementById('confirm-check');
    const confirmBtn = document.getElementById('confirm-btn');

    if (check && confirmBtn) {
      check.addEventListener('change', () => { confirmBtn.disabled = !check.checked; });
      confirmBtn.addEventListener('click', async () => {
        confirmBtn.disabled = true;
        await store.confirmExam(exam.id);
        utils.showToast('確認申請しました', 'success');
        await this._renderInner();
      });
    }
  },

  async _openEditModal(examId) {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const exam = await store.getExam(examId).catch(() => null);
    if (!exam) return;

    const subjectsText = (exam.subjects || []).join('\n');

    utils.openModal(`
      <div class="modal" style="max-width:640px;max-height:90vh;overflow-y:auto">
        <div class="modal-header" style="position:sticky;top:0;background:white;z-index:1">
          <span class="modal-title">${utils.icons.edit} &nbsp;入試情報を修正する</span>
          <button class="modal-close" id="modal-close-btn">${utils.icons.x}</button>
        </div>
        <div class="modal-body">
          <div style="background:var(--gray-50);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;margin-bottom:20px;font-size:13px">
            <strong>対象:</strong> ${utils.escapeHtml(exam.examName)}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 16px">
            <div class="form-group">
              <label class="form-label">出願開始日</label>
              <input class="form-input" type="date" id="f-app-start" value="${exam.applicationPeriod.start}" />
            </div>
            <div class="form-group">
              <label class="form-label">出願終了日</label>
              <input class="form-input" type="date" id="f-app-end" value="${exam.applicationPeriod.end}" />
            </div>
            <div class="form-group">
              <label class="form-label">試験日 <span style="font-size:11px;color:var(--text-muted)">（試験なしの場合は空欄）</span></label>
              <input class="form-input" type="date" id="f-exam-date" value="${exam.examDate || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label">合格発表日</label>
              <input class="form-input" type="date" id="f-result-date" value="${exam.resultDate}" />
            </div>
            <div class="form-group">
              <label class="form-label">募集人員（名）</label>
              <input class="form-input" type="number" id="f-quota" value="${exam.quota}" min="1" />
            </div>
            <div class="form-group">
              <label class="form-label">検定料（円）</label>
              <input class="form-input" type="number" id="f-fee" value="${exam.examFee}" min="0" step="1000" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">出願資格 <span class="form-required">*</span></label>
            <textarea class="form-textarea" id="f-eligibility" rows="3">${utils.escapeHtml(exam.eligibility)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">選考方法 <span class="form-required">*</span></label>
            <textarea class="form-textarea" id="f-selection" rows="3">${utils.escapeHtml(exam.selectionMethod)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">試験科目・提出書類</label>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px">1行につき1項目を入力してください</div>
            <textarea class="form-textarea" id="f-subjects" rows="4">${utils.escapeHtml(subjectsText)}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">備考・注意事項</label>
            <textarea class="form-textarea" id="f-notes" rows="3">${utils.escapeHtml(exam.notes || '')}</textarea>
          </div>
          <div id="edit-error" style="font-size:12px;color:var(--danger);display:none;margin-top:-8px">必須項目を入力してください</div>
        </div>
        <div class="modal-footer" style="position:sticky;bottom:0;background:white;z-index:1">
          <button class="btn btn-secondary" id="modal-cancel-btn">キャンセル</button>
          <button class="btn btn-primary" id="modal-save-btn">
            ${utils.icons.check} 修正を保存する
          </button>
        </div>
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', () => utils.closeModal());
    document.getElementById('modal-cancel-btn').addEventListener('click', () => utils.closeModal());

    document.getElementById('modal-save-btn').addEventListener('click', async () => {
      const eligibility = document.getElementById('f-eligibility').value.trim();
      const selectionMethod = document.getElementById('f-selection').value.trim();
      const errorEl = document.getElementById('edit-error');

      if (!eligibility || !selectionMethod) {
        errorEl.style.display = 'block';
        return;
      }
      errorEl.style.display = 'none';

      const saveBtn = document.getElementById('modal-save-btn');
      saveBtn.disabled = true;

      const subjectsRaw = document.getElementById('f-subjects').value;
      const subjects = subjectsRaw.split('\n').map(s => s.trim()).filter(Boolean);
      const examDateVal = document.getElementById('f-exam-date').value;

      await store.editExam(examId, {
        applicationPeriod: {
          start: document.getElementById('f-app-start').value,
          end: document.getElementById('f-app-end').value,
        },
        examDate: examDateVal || null,
        resultDate: document.getElementById('f-result-date').value,
        quota: parseInt(document.getElementById('f-quota').value, 10) || exam.quota,
        examFee: parseInt(document.getElementById('f-fee').value, 10) || exam.examFee,
        eligibility,
        selectionMethod,
        subjects,
        notes: document.getElementById('f-notes').value.trim(),
      });

      utils.closeModal();
      utils.showToast('修正を保存しました。内容を確認して申請してください。', 'info');
      await this._renderInner();
    });
  },
};
