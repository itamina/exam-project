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
const PDF_EXAM_TYPES = [
  '総合型選抜',
  '学校推薦型選抜（公募制）',
  '学校推薦型選抜（指定校制）',
  '学校推薦型選抜',
  '一般選抜（前期日程）',
  '一般選抜（後期日程）',
  '一般選抜 前期',
  '一般選抜 後期',
  '一般選抜',
  '共通テスト利用選抜',
];

function toIsoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function pdfExtractDates(text) {
  const re = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/g;
  const dates = [];
  let m;
  while ((m = re.exec(text)) !== null) dates.push(toIsoDate(m[1], m[2], m[3]));
  return dates;
}

function pdfExtractFee(text) {
  const m = text.match(/(\d{1,3}(?:,\d{3})*|\d{4,6})\s*円/);
  return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
}

function pdfExtractQuota(text) {
  const m = text.match(/(\d+)\s*名/);
  return m ? parseInt(m[1], 10) : null;
}

function pdfExtractFaculty(text) {
  const m = text.match(/([^\s　、。\n]+学部)/);
  return m ? m[1] : '';
}

function pdfExtractDepartment(text) {
  const m = text.match(/([^\s　、。\n]+(?:学科|専攻|コース))/);
  return m ? m[1] : '';
}

function pdfExtractExamType(text) {
  for (const type of PDF_EXAM_TYPES) {
    if (text.includes(type)) return type;
  }
  return '';
}

function buildExamDraft(sectionText) {
  const dates = pdfExtractDates(sectionText);
  const faculty = pdfExtractFaculty(sectionText);
  const department = pdfExtractDepartment(sectionText);
  const examType = pdfExtractExamType(sectionText);
  return {
    faculty,
    department,
    examType,
    examName: [faculty, department, examType].filter(Boolean).join(' '),
    year: new Date().getFullYear() + 1,
    applicationPeriod: { start: dates[0] || '', end: dates[1] || '' },
    examDate: dates[2] || null,
    resultDate: dates[3] || null,
    quota: pdfExtractQuota(sectionText),
    examFee: pdfExtractFee(sectionText),
    eligibility: '',
    selectionMethod: '',
    subjects: [],
    notes: '',
    _rawText: sectionText,
  };
}

function parsePdfText(fullText) {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  const boundaries = [];
  lines.forEach((line, i) => {
    if (PDF_EXAM_TYPES.some(t => line.includes(t))) boundaries.push(i);
  });
  if (boundaries.length === 0) return [buildExamDraft(fullText)];
  return boundaries.map((start, idx) => {
    const contextStart = Math.max(0, start - 5);
    const end = boundaries[idx + 1] || lines.length;
    return buildExamDraft(lines.slice(contextStart, end).join('\n'));
  });
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
