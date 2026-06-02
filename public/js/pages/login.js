'use strict';

window.ExamApp = window.ExamApp || {};
window.ExamApp.pages = window.ExamApp.pages || {};

window.ExamApp.pages.login = {
  async render(container) {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;

    container.innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-card-header">
            <div class="login-logo">🏫</div>
            <div class="login-system-name">入試情報確認システム</div>
            <div class="login-system-sub">クライアント担当者専用ポータル</div>
          </div>
          <div class="login-card-body">
            <div class="login-error" id="login-error">
              メールアドレスまたはパスワードが正しくありません。
            </div>

            <form id="login-form" novalidate>
              <div class="form-group">
                <label class="form-label" for="email">メールアドレス</label>
                <input
                  class="form-input"
                  type="email"
                  id="email"
                  name="email"
                  placeholder="example@university.jp"
                  value="admin@ouka-univ.jp"
                  autocomplete="email"
                  required
                />
              </div>
              <div class="form-group">
                <label class="form-label" for="password">パスワード</label>
                <input
                  class="form-input"
                  type="password"
                  id="password"
                  name="password"
                  placeholder="パスワードを入力"
                  value="password123"
                  autocomplete="current-password"
                  required
                />
              </div>
              <button type="submit" class="btn btn-primary w-full btn-lg" style="width:100%;justify-content:center;margin-top:4px" id="login-btn">
                ログイン
              </button>
            </form>

            <div class="login-demo-box">
              <div class="login-demo-title">デモ用ログイン情報</div>
              <div class="login-demo-item">
                <span class="login-demo-key">メール:</span>
                <span>admin@ouka-univ.jp</span>
              </div>
              <div class="login-demo-item">
                <span class="login-demo-key">パスワード:</span>
                <span>password123</span>
              </div>
            </div>

            <p style="text-align:center;font-size:11px;color:#94A3B8;margin-top:16px">
              ログイン情報はシステム管理者にお問い合わせください
            </p>
          </div>
        </div>
      </div>
    `;

    const form = document.getElementById('login-form');
    const errorEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;

      btn.textContent = 'ログイン中...';
      btn.disabled = true;

      const ok = await store.login(email, password);
      if (ok) {
        window.ExamApp.router.navigate('/dashboard');
      } else {
        errorEl.style.display = 'block';
        btn.textContent = 'ログイン';
        btn.disabled = false;
      }
    });
  },
};
