'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const db = require('./data/db');

db.load();

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
// SPA フォールバック
// ───────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n✅ サーバー起動: http://localhost:${PORT}`);
  console.log(`   ログイン情報: admin@ouka-univ.jp / password123\n`);
});
