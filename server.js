'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./data/db');
const multer = require('multer');
const pdfParse = require('pdf-parse');

db.load();

// ───────────────────────────────────────
// PDF解析ヘルパー
// ───────────────────────────────────────

function toIsoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// PDFテキストの正規化（「202 6年」→「2026年」など）
function normalizePdfText(text) {
  return text.replace(/(\d{3})\s+(\d)(?=年)/g, '$1$2');
}

// 出願期間ラベル付近の日付範囲を抽出（ラベルから200文字以内・同行の「から」を使用）
function extractAppPeriod(text) {
  const idx = text.indexOf('出願期間');
  if (idx === -1) return { start: '', end: '' };
  const seg = text.slice(idx, idx + 200);
  const m = seg.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日.{0,40}から.{0,10}(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  if (!m) return { start: '', end: '' };
  return { start: toIsoDate(m[1], m[2], m[3]), end: toIsoDate(m[4], m[5], m[6]) };
}

// 合格者の発表日を抽出（最後の「合格者の発表」を使用して2次選抜に対応）
function extractResultDate(text) {
  const idx = text.lastIndexOf('合格者の発表');
  if (idx === -1) return null;
  const seg = text.slice(idx, idx + 150);
  const m = seg.match(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/);
  return m ? toIsoDate(m[1], m[2], m[3]) : null;
}

// 試験日を抽出（個別テスト・小論文・口頭試問から）
function extractExamDate(text) {
  const patterns = [
    /教科・科目に係る個別テスト\s+(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
    /小論文\s+(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
    /口頭試問の日時[\s\S]{0,20}(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return toIsoDate(m[1], m[2], m[3]);
  }
  return null;
}

// 募集人員ラベルの直後の数字を抽出
function extractQuota(text) {
  const m1 = text.match(/募集人員\s+(\d+)\s*人/);
  if (m1) return parseInt(m1[1], 10);
  // 一般選抜などで「XX名の定員」と記載される場合
  const m2 = text.match(/(\d+)名の定員/);
  if (m2) return parseInt(m2[1], 10);
  return null;
}

// 入学検定料を抽出
function extractFee(text) {
  const m = text.match(/(\d{1,3}(?:,\d{3})*|\d{4,6})\s*円/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

// 指定ラベルと次のラベルの間のテキストを抽出
function extractLabelContent(text, label) {
  const LABELS = ['出願資格', '選抜方法等', '出願期間', '教科・科目', '合格者の発表', '入学手続', 'その他', '募集人員', '実施学部'];
  const idx = text.indexOf(label);
  if (idx === -1) return '';
  const start = idx + label.length;
  let end = text.length;
  for (const l of LABELS) {
    if (l === label) continue;
    const i = text.indexOf(l, start + 1);
    if (i !== -1 && i < end) end = i;
  }
  return text.slice(start, end).trim().replace(/\s+/g, ' ').slice(0, 300);
}

function extractFaculty(text) {
  // 「実施学部」はラベルなので除外し、実際の学部名を取得する
  const matches = text.match(/([^\s　、。\n]+学部)/g) || [];
  const faculty = matches.find(f => !f.includes('実施'));
  return faculty || '';
}

// 構造化セクションからドラフトを生成
function buildDraftFromSection(sectionText, examType, examNameHint) {
  const faculty = extractFaculty(sectionText) || '';
  return {
    faculty,
    department: '',
    examType,
    examName: [faculty, examNameHint].filter(Boolean).join(' '),
    year: new Date().getFullYear() + 1,
    applicationPeriod: extractAppPeriod(sectionText),
    examDate: extractExamDate(sectionText),
    resultDate: extractResultDate(sectionText),
    quota: extractQuota(sectionText),
    examFee: extractFee(sectionText),
    eligibility: extractLabelContent(sectionText, '出願資格'),
    selectionMethod: extractLabelContent(sectionText, '選抜方法等'),
    subjects: [],
    notes: '',
    _rawText: sectionText.slice(0, 600),
  };
}

// フォールバック用（旧形式PDF対応）
function buildExamDraftHeuristic(sectionText) {
  const OLD_TYPES = ['総合型選抜','学校推薦型選抜（公募制）','学校推薦型選抜（指定校制）','学校推薦型選抜','一般選抜（前期日程）','一般選抜（後期日程）','一般選抜 前期','一般選抜 後期','一般選抜','共通テスト利用選抜'];
  const faculty = extractFaculty(sectionText);
  const deptM = sectionText.match(/([^\s　、。\n]+(?:学科|専攻|コース))/);
  const department = deptM ? deptM[1] : '';
  let examType = '';
  for (const t of OLD_TYPES) { if (sectionText.includes(t)) { examType = t; break; } }
  const dates = [];
  const re = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g;
  let m;
  while ((m = re.exec(sectionText)) !== null) dates.push(toIsoDate(m[1], m[2], m[3]));
  return {
    faculty, department, examType,
    examName: [faculty, department, examType].filter(Boolean).join(' '),
    year: new Date().getFullYear() + 1,
    applicationPeriod: { start: dates[0] || '', end: dates[1] || '' },
    examDate: dates[2] || null,
    resultDate: dates[3] || null,
    quota: extractQuota(sectionText),
    examFee: extractFee(sectionText),
    eligibility: '', selectionMethod: '', subjects: [], notes: '',
    _rawText: sectionText,
  };
}

// ローマ数字セクション構造を持つPDFの構造化解析
function parsePdfTextStructured(mainText) {
  const lines = mainText.split('\n').map(l => l.trim()).filter(Boolean);
  let currentMajorType = '';
  const MAJOR_MAP = { 'V': '一般選抜', 'VI': '学校推薦型選抜（公募制）', 'VII': '総合型選抜', 'VIII': '' };
  const ENTRY_PATTERNS = [
    { re: /^[１２３]\s+前期日程（昼間コース）$/, type: '一般選抜（前期日程）', label: '前期日程（昼間コース）' },
    { re: /^[１２３]\s+後期日程（昼間コース）$/, type: '一般選抜（後期日程）', label: '後期日程（昼間コース）' },
    { re: /^[１２３]\s+前期日程（夜間主コース）$/, type: '一般選抜（前期日程）', label: '前期日程（夜間主コース）' },
    { re: /^[１２３]－[１２３]\s+一般枠$/, dynamic: true, label: '一般枠' },
    { re: /^[１２３]－[１２３]\s+専門学科・総合学科枠$/, type: '学校推薦型選抜（公募制）', label: '専門学科・総合学科枠' },
    { re: /^[１２３]－[１２３]\s+理系枠$/, type: '総合型選抜', label: '理系枠' },
    { re: /^[１２３]\s+学校推薦型選抜（夜間主コース）$/, type: '学校推薦型選抜（公募制）', label: '学校推薦型選抜（夜間主コース）' },
    { re: /^[１２３]\s+社会人入試（夜間主コース）$/, type: '総合型選抜', label: '社会人入試（夜間主コース）' },
    { re: /^[１２３]\s+帰国子女入試（昼間コース）$/, type: '', label: '帰国子女入試（昼間コース）' },
    { re: /^[１２３]\s+私費外国人留学生入試（昼間コース）$/, type: '', label: '私費外国人留学生入試（昼間コース）' },
  ];
  const boundaries = [];
  lines.forEach((line, i) => {
    const mj = line.match(/^(V|VI|VII|VIII)\s+/);
    if (mj && MAJOR_MAP[mj[1]] !== undefined) currentMajorType = MAJOR_MAP[mj[1]];
    for (const p of ENTRY_PATTERNS) {
      if (p.re.test(line)) {
        boundaries.push({ lineIdx: i, examType: p.dynamic ? currentMajorType : p.type, label: p.label });
        break;
      }
    }
  });
  if (boundaries.length === 0) return null;
  return boundaries.map((b, idx) => {
    const end = (boundaries[idx + 1]?.lineIdx) ?? lines.length;
    return buildDraftFromSection(lines.slice(b.lineIdx, end).join('\n'), b.examType, b.label);
  });
}

// ヒューリスティック解析（旧形式PDFのフォールバック）
function parsePdfTextHeuristic(text) {
  const OLD_TYPES = ['総合型選抜','学校推薦型選抜（公募制）','学校推薦型選抜（指定校制）','学校推薦型選抜','一般選抜（前期日程）','一般選抜（後期日程）','一般選抜 前期','一般選抜 後期','一般選抜','共通テスト利用選抜'];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const boundaries = [];
  lines.forEach((line, i) => { if (OLD_TYPES.some(t => line.includes(t))) boundaries.push(i); });
  if (boundaries.length === 0) return [buildExamDraftHeuristic(text)];
  return boundaries.map((start, idx) => {
    const contextStart = Math.max(0, start - 5);
    const end = boundaries[idx + 1] || lines.length;
    return buildExamDraftHeuristic(lines.slice(contextStart, end).join('\n'));
  });
}

function parsePdfText(fullText) {
  const text = normalizePdfText(fullText);
  // ローマ数字セクション構造（V 一般選抜 → サブセクション）の検出
  const structuredStart = text.search(/V\s+一般選抜\s*\n[１２３]/);
  if (structuredStart !== -1) {
    const result = parsePdfTextStructured(text.slice(structuredStart));
    if (result && result.length > 0) return result;
  }
  return parsePdfTextHeuristic(text);
}

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('PDFファイルのみアップロードできます'));
    }
  },
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'exam-portal-local-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 },
}));

// ───────────────────────────────────────
// ミドルウェア: リクエストにユーザーをセット
// ───────────────────────────────────────
app.use((req, res, next) => {
  if (req.session.userId) {
    const data = db.get();
    req.currentUser = data.users.find(u => u.id === req.session.userId) || null;
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.currentUser) return res.status(401).json({ error: '認証が必要です' });
  next();
}

function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

// ───────────────────────────────────────
// 認証
// ───────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const data = db.get();
  const user = data.users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ error: 'メールアドレスまたはパスワードが正しくありません' });
  req.session.userId = user.id;
  res.json({ user: safeUser(user), university: data.university });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/auth/status', (req, res) => {
  if (!req.currentUser) return res.status(401).json({ error: 'Not logged in' });
  const data = db.get();
  res.json({ user: safeUser(req.currentUser), university: data.university });
});

// ───────────────────────────────────────
// 統計
// ───────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  const { exams } = db.get();
  res.json({
    total: exams.length,
    confirmed: exams.filter(e => e.status === 'confirmed').length,
    pending:   exams.filter(e => e.status === 'pending').length,
    needs_correction: exams.filter(e => e.status === 'needs_correction').length,
    attention: exams.filter(e => e.status === 'needs_correction').length,
  });
});

// ───────────────────────────────────────
// 入試情報
// ───────────────────────────────────────
app.get('/api/exams', requireAuth, (req, res) => {
  const { status, q } = req.query;
  let exams = db.get().exams;
  if (status && status !== 'all') exams = exams.filter(e => e.status === status);
  if (q) {
    const lq = q.toLowerCase();
    exams = exams.filter(e =>
      e.examName.toLowerCase().includes(lq) ||
      e.faculty.toLowerCase().includes(lq) ||
      e.department.toLowerCase().includes(lq) ||
      e.examType.toLowerCase().includes(lq)
    );
  }
  res.json(exams);
});

app.get('/api/exams/urgent', requireAuth, (req, res) => {
  const exams = db.get().exams.filter(e =>
    e.status === 'pending' || e.status === 'needs_correction'
  );
  res.json(exams);
});

app.get('/api/exams/:id', requireAuth, (req, res) => {
  const exam = db.get().exams.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: '入試情報が見つかりません' });
  res.json(exam);
});

// 確認申請
app.post('/api/exams/:id/confirm', requireAuth, (req, res) => {
  const data = db.get();
  const exam = data.exams.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: '入試情報が見つかりません' });

  exam.status = 'confirmed';
  exam.confirmedAt = new Date().toISOString();
  exam.confirmedBy = req.currentUser.name;
  exam.correctionRequest = null;

  data.confirmHistory.unshift({
    id: 'h' + Date.now(),
    type: 'confirm',
    examId: exam.id,
    examName: exam.examName,
    faculty: exam.faculty,
    department: exam.department,
    performedBy: req.currentUser.name,
    performedAt: new Date().toISOString(),
    note: null,
  });

  db.save();
  res.json(exam);
});

// 内容修正
app.put('/api/exams/:id', requireAuth, (req, res) => {
  const data = db.get();
  const exam = data.exams.find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ error: '入試情報が見つかりません' });

  const allowed = ['applicationPeriod', 'examDate', 'resultDate', 'quota', 'examFee',
                   'eligibility', 'selectionMethod', 'subjects', 'notes'];
  allowed.forEach(key => {
    if (req.body[key] !== undefined) exam[key] = req.body[key];
  });

  exam.status = 'pending';
  exam.confirmedAt = null;
  exam.confirmedBy = null;
  exam.updatedAt = new Date().toISOString().slice(0, 10);

  data.confirmHistory.unshift({
    id: 'h' + Date.now(),
    type: 'edit',
    examId: exam.id,
    examName: exam.examName,
    faculty: exam.faculty,
    department: exam.department,
    performedBy: req.currentUser.name,
    performedAt: new Date().toISOString(),
    note: '内容を修正しました。再申請が必要です。',
  });

  db.save();
  res.json(exam);
});

// ───────────────────────────────────────
// お知らせ
// ───────────────────────────────────────
app.get('/api/notifications', requireAuth, (req, res) => {
  res.json(db.get().notifications);
});

// ───────────────────────────────────────
// 操作履歴
// ───────────────────────────────────────
app.get('/api/history', requireAuth, (req, res) => {
  const { type } = req.query;
  let history = db.get().confirmHistory;
  if (type && type !== 'all') history = history.filter(h => h.type === type);
  res.json(history);
});

// ───────────────────────────────────────
// PDF一括取込
// ───────────────────────────────────────
app.post('/api/exams/import/upload', requireAuth, (req, res, next) => {
  pdfUpload.single('pdf')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: 'ファイルサイズが大きすぎます（最大10MB）' });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
    const parsed = await pdfParse(req.file.buffer);
    const text = parsed.text || '';
    if (text.trim().length < 20) {
      return res.status(422).json({ error: 'PDFからテキストを抽出できませんでした。スキャンされたPDFには対応していません。' });
    }
    const drafts = parsePdfText(text);
    res.json({ drafts, pageCount: parsed.numpages });
  } catch (err) {
    res.status(500).json({ error: 'PDF解析に失敗しました: ' + err.message });
  }
});

app.post('/api/exams/bulk', requireAuth, (req, res) => {
  const { exams } = req.body || {};
  if (!Array.isArray(exams) || exams.length === 0) {
    return res.status(400).json({ error: '入試情報がありません' });
  }
  const data = db.get();
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const created = exams.map(exam => {
    const id = 'e' + Date.now() + Math.floor(Math.random() * 10000);
    const entry = {
      id,
      faculty: exam.faculty || '',
      department: exam.department || '',
      examType: exam.examType || '',
      examName: exam.examName || [exam.faculty, exam.department, exam.examType].filter(Boolean).join(' '),
      year: Number(exam.year) || new Date().getFullYear() + 1,
      applicationPeriod: exam.applicationPeriod || { start: '', end: '' },
      examDate: exam.examDate || null,
      resultDate: exam.resultDate || null,
      quota: exam.quota != null ? Number(exam.quota) : null,
      examFee: exam.examFee != null ? Number(exam.examFee) : null,
      eligibility: exam.eligibility || '',
      selectionMethod: exam.selectionMethod || '',
      subjects: Array.isArray(exam.subjects) ? exam.subjects : [],
      notes: exam.notes || '',
      status: 'pending',
      confirmedAt: null,
      confirmedBy: null,
      correctionRequest: null,
      updatedAt: today,
      updateNote: null,
    };
    data.exams.push(entry);
    data.confirmHistory.unshift({
      id: 'h' + Date.now() + Math.floor(Math.random() * 10000),
      type: 'import',
      examId: id,
      examName: entry.examName,
      faculty: entry.faculty,
      department: entry.department,
      performedBy: req.currentUser.name,
      performedAt: now,
      note: 'PDF一括取込により追加されました。',
    });
    return entry;
  });
  db.save();
  res.json(created);
});

// ───────────────────────────────────────
// SPA フォールバック
// ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ サーバー起動: http://localhost:${PORT}`);
  console.log(`   ログイン情報: admin@ouka-univ.jp / password123\n`);
});
