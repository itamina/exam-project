'use strict';

window.ExamApp = window.ExamApp || {};
window.ExamApp.pages = window.ExamApp.pages || {};

window.ExamApp.pages.pdfImport = {
  _drafts: [],
  _container: null,

  async render(container) {
    this._container = container;
    this._drafts = [];
    this._renderUploadStage();
  },

  _renderUploadStage() {
    this._container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">PDF一括取込</h1>
          <p class="page-sub">入試要項PDFをアップロードすると、入試方式ごとに自動でデータを作成します。</p>
        </div>
      </div>
      <div class="card" style="max-width:560px;margin:32px auto">
        <div class="card-body" style="padding:40px;text-align:center">
          <div id="drop-zone" style="border:2px dashed #CBD5E1;border-radius:12px;padding:48px 24px;cursor:pointer;transition:border-color .15s,background .15s">
            <div style="font-size:48px;margin-bottom:16px">📄</div>
            <div style="font-size:16px;font-weight:600;color:#1E293B;margin-bottom:8px">PDFをドラッグ＆ドロップ</div>
            <div style="font-size:13px;color:#64748B;margin-bottom:20px">または</div>
            <label class="btn btn-primary" style="cursor:pointer">
              ファイルを選択
              <input type="file" id="pdf-input" accept=".pdf,application/pdf" style="display:none">
            </label>
            <div style="font-size:11px;color:#94A3B8;margin-top:16px">PDF形式・最大10MB</div>
          </div>
          <div id="upload-error" style="display:none;color:#DC2626;font-size:13px;margin-top:16px;text-align:left;background:#FEF2F2;border:1px solid #FECACA;border-radius:6px;padding:10px 14px"></div>
        </div>
      </div>
    `;
    this._bindUploadEvents();
  },

  _bindUploadEvents() {
    const dropZone = document.getElementById('drop-zone');
    const input = document.getElementById('pdf-input');

    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.style.borderColor = '#2563EB';
      dropZone.style.background = '#EFF6FF';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#CBD5E1';
      dropZone.style.background = '';
    });
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.style.borderColor = '#CBD5E1';
      dropZone.style.background = '';
      const file = e.dataTransfer.files[0];
      if (file) this._handleFile(file);
    });
    input.addEventListener('change', () => {
      if (input.files[0]) this._handleFile(input.files[0]);
    });
  },

  _renderProcessing() {
    this._container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">PDF一括取込</h1>
      </div>
      <div style="text-align:center;padding:80px 24px">
        <div style="font-size:48px;margin-bottom:16px">⏳</div>
        <div style="font-size:16px;font-weight:600;color:#1E293B">PDF解析中...</div>
        <div style="font-size:13px;color:#64748B;margin-top:8px">しばらくお待ちください</div>
      </div>
    `;
  },

  async _handleFile(file) {
    if (!file.type.includes('pdf') && !file.name.endsWith('.pdf')) {
      this._showUploadError('PDFファイルを選択してください');
      return;
    }

    this._renderProcessing();

    const formData = new FormData();
    formData.append('pdf', file);

    try {
      const res = await fetch('/api/exams/import/upload', { method: 'POST', body: formData });
      if (res.status === 401) { window.ExamApp.router.navigate('/login'); return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'エラーが発生しました');

      this._drafts = data.drafts.map((d, i) => ({ ...d, _draftId: i }));
      this._renderReviewStage(data.pageCount);
    } catch (err) {
      this._renderUploadStage();
      this._showUploadError(err.message);
    }
  },

  _showUploadError(msg) {
    const el = document.getElementById('upload-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
  },

  _renderReviewStage(pageCount) {
    const count = this._drafts.length;
    this._container.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">PDF一括取込 — 確認・編集</h1>
          <p class="page-sub">${count}件の入試方式を検出しました（${pageCount}ページ）。内容を確認・修正してから保存してください。</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn btn-secondary" id="btn-cancel">やり直す</button>
          <button class="btn btn-primary" id="btn-save">保存する（${count}件）</button>
        </div>
      </div>
      <div id="drafts-list">
        ${this._drafts.map((d, i) => this._cardHtml(d, i)).join('')}
      </div>
      <div style="margin-top:16px;display:flex;gap:8px;justify-content:space-between;align-items:center">
        <button class="btn btn-secondary" id="btn-add">＋ 入試方式を追加</button>
        <div style="display:flex;gap:8px;align-items:center">
          <div id="save-error" style="display:none;color:#DC2626;font-size:13px"></div>
          <button class="btn btn-primary" id="btn-save-bottom">保存する（<span id="save-count">${count}</span>件）</button>
        </div>
      </div>
    `;
    this._bindReviewEvents();
  },

  _cardHtml(draft, index) {
    const utils = window.ExamApp.utils;
    const v = s => utils.escapeHtml(String(s || ''));
    const EXAM_TYPES = [
      '総合型選抜', '学校推薦型選抜（公募制）', '学校推薦型選抜（指定校制）',
      '学校推薦型選抜', '一般選抜（前期日程）', '一般選抜（後期日程）',
      '一般選抜 前期', '一般選抜 後期', '一般選抜', '共通テスト利用選抜',
    ];
    const ap = draft.applicationPeriod || {};

    return `
      <div class="card" style="margin-bottom:16px" data-idx="${index}">
        <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-weight:700">入試方式 ${index + 1}</span>
          <button class="btn btn-sm draft-del" data-idx="${index}" style="background:#FEE2E2;color:#DC2626;border:none;font-size:12px;padding:4px 10px;border-radius:6px;cursor:pointer">削除</button>
        </div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group">
              <label class="form-label">学部</label>
              <input class="form-input df" data-idx="${index}" data-f="faculty" value="${v(draft.faculty)}" placeholder="例：文学部">
            </div>
            <div class="form-group">
              <label class="form-label">学科・専攻</label>
              <input class="form-input df" data-idx="${index}" data-f="department" value="${v(draft.department)}" placeholder="例：国文学科">
            </div>
            <div class="form-group">
              <label class="form-label">入試種別</label>
              <select class="form-input df" data-idx="${index}" data-f="examType">
                <option value="">選択してください</option>
                ${EXAM_TYPES.map(t => `<option value="${t}"${draft.examType === t ? ' selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">年度</label>
              <input class="form-input df" data-idx="${index}" data-f="year" type="number" value="${draft.year || ''}" min="2020" max="2035">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">入試名称</label>
            <input class="form-input df draft-name" data-idx="${index}" data-f="examName" value="${v(draft.examName)}" placeholder="例：文学部 国文学科 総合型選抜 I期">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group">
              <label class="form-label">出願開始</label>
              <input class="form-input df" data-idx="${index}" data-f="applicationPeriod.start" type="date" value="${v(ap.start)}">
            </div>
            <div class="form-group">
              <label class="form-label">出願締切</label>
              <input class="form-input df" data-idx="${index}" data-f="applicationPeriod.end" type="date" value="${v(ap.end)}">
            </div>
            <div class="form-group">
              <label class="form-label">試験日</label>
              <input class="form-input df" data-idx="${index}" data-f="examDate" type="date" value="${v(draft.examDate)}">
            </div>
            <div class="form-group">
              <label class="form-label">合格発表日</label>
              <input class="form-input df" data-idx="${index}" data-f="resultDate" type="date" value="${v(draft.resultDate)}">
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
            <div class="form-group">
              <label class="form-label">募集人員（名）</label>
              <input class="form-input df" data-idx="${index}" data-f="quota" type="number" value="${draft.quota != null ? draft.quota : ''}" min="0">
            </div>
            <div class="form-group">
              <label class="form-label">入学検定料（円）</label>
              <input class="form-input df" data-idx="${index}" data-f="examFee" type="number" value="${draft.examFee != null ? draft.examFee : ''}" min="0">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">出願資格</label>
            <textarea class="form-input df" data-idx="${index}" data-f="eligibility" rows="2" style="resize:vertical">${v(draft.eligibility)}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">選考方法</label>
            <textarea class="form-input df" data-idx="${index}" data-f="selectionMethod" rows="2" style="resize:vertical">${v(draft.selectionMethod)}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">試験科目（1行1科目）</label>
            <textarea class="form-input df" data-idx="${index}" data-f="subjects" rows="3" style="resize:vertical;font-size:12px">${(draft.subjects || []).join('\n')}</textarea>
          </div>
          <div class="form-group" style="margin-bottom:12px">
            <label class="form-label">備考</label>
            <textarea class="form-input df" data-idx="${index}" data-f="notes" rows="2" style="resize:vertical">${v(draft.notes)}</textarea>
          </div>
          ${draft._rawText ? `
            <details style="margin-top:4px">
              <summary style="font-size:12px;color:#64748B;cursor:pointer;user-select:none">PDFから抽出したテキストを表示</summary>
              <pre style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:6px;padding:12px;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:200px;overflow-y:auto;margin-top:8px">${v(draft._rawText)}</pre>
            </details>
          ` : ''}
        </div>
      </div>
    `;
  },

  _bindReviewEvents() {
    const con = this._container;

    con.addEventListener('input', e => {
      const el = e.target;
      if (!el.classList.contains('df')) return;
      const idx = parseInt(el.dataset.idx, 10);
      const f = el.dataset.f;
      let val = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value;

      if (f.startsWith('applicationPeriod.')) {
        this._drafts[idx].applicationPeriod[f.split('.')[1]] = val;
      } else if (f === 'subjects') {
        this._drafts[idx].subjects = val.split('\n').map(s => s.trim()).filter(Boolean);
      } else {
        this._drafts[idx][f] = val;
      }

      // Auto-update examName when faculty/dept/type change, unless user has edited it
      if (['faculty', 'department', 'examType'].includes(f)) {
        const d = this._drafts[idx];
        const nameEl = con.querySelector(`.draft-name[data-idx="${idx}"]`);
        if (nameEl && !nameEl._userEdited) {
          const auto = [d.faculty, d.department, d.examType].filter(Boolean).join(' ');
          nameEl.value = auto;
          d.examName = auto;
        }
      }
    });

    con.addEventListener('focus', e => {
      if (e.target.classList.contains('draft-name')) e.target._userEdited = true;
    }, true);

    con.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;

      if (btn.classList.contains('draft-del')) {
        const idx = parseInt(btn.dataset.idx, 10);
        this._drafts.splice(idx, 1);
        this._rerenderCards();
        return;
      }

      if (btn.id === 'btn-cancel') {
        this._drafts = [];
        this._renderUploadStage();
        return;
      }

      if (btn.id === 'btn-add') {
        this._drafts.push({
          faculty: '', department: '', examType: '',
          examName: '', year: new Date().getFullYear() + 1,
          applicationPeriod: { start: '', end: '' },
          examDate: null, resultDate: null, quota: null, examFee: null,
          eligibility: '', selectionMethod: '', subjects: [], notes: '',
        });
        this._rerenderCards();
        const cards = this._container.querySelectorAll('[data-idx]');
        cards[cards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (btn.id === 'btn-save' || btn.id === 'btn-save-bottom') {
        this._save();
      }
    });
  },

  _rerenderCards() {
    const list = document.getElementById('drafts-list');
    if (list) list.innerHTML = this._drafts.map((d, i) => this._cardHtml(d, i)).join('');
    const count = this._drafts.length;
    const countEl = document.getElementById('save-count');
    if (countEl) countEl.textContent = count;
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.textContent = `保存する（${count}件）`;
  },

  async _save() {
    const errEl = document.getElementById('save-error');

    if (this._drafts.length === 0) {
      errEl.textContent = '保存する入試方式がありません';
      errEl.style.display = 'block';
      return;
    }

    const invalid = this._drafts.filter(d => !d.faculty || !d.examType);
    if (invalid.length > 0) {
      errEl.textContent = `${invalid.length}件の入試方式に「学部」または「入試種別」が未入力です`;
      errEl.style.display = 'block';
      return;
    }
    errEl.style.display = 'none';

    const exams = this._drafts.map(({ _rawText, _draftId, ...rest }) => rest);

    try {
      const created = await window.ExamApp.store.bulkSaveExams(exams);
      window.ExamApp.utils.showToast(`${created.length}件の入試情報を保存しました`, 'success');
      window.ExamApp.router.navigate('/exams');
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  },
};
