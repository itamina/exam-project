'use strict';

window.ExamApp = window.ExamApp || {};

(function () {
  const routes = {
    '': 'dashboard',
    '/': 'dashboard',
    '/login': 'login',
    '/dashboard': 'dashboard',
    '/exams': 'examList',
    '/exams/': 'examDetail',
    '/history': 'history',
  };

  function parseHash(hash) {
    const path = hash.replace(/^#/, '') || '/';
    if (path.startsWith('/exams/') && path.length > '/exams/'.length) {
      const id = path.replace('/exams/', '');
      return { page: 'examDetail', params: { id } };
    }
    const page = routes[path] || 'dashboard';
    return { page, params: {} };
  }

  function navigate(path) {
    window.location.hash = path;
  }

  async function handleRouteChange() {
    const hash = window.location.hash;
    const { page, params } = parseHash(hash);
    const store = window.ExamApp.store;
    const pages = window.ExamApp.pages;
    const appEl = document.getElementById('app');

    if (page !== 'login' && !store.getCurrentUser()) {
      navigate('/login');
      return;
    }
    if (page === 'login' && store.getCurrentUser()) {
      navigate('/dashboard');
      return;
    }

    if (page === 'login') {
      appEl.innerHTML = '';
      await pages.login.render(appEl);
      return;
    }

    await renderLayout(appEl, page, params);
  }

  async function renderLayout(appEl, page, params) {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const pages = window.ExamApp.pages;
    const university = store.getUniversity();
    const user = store.getCurrentUser();

    const [stats, unread] = await Promise.all([
      store.getStats(),
      store.getUnreadNotificationCount(),
    ]);

    const daysLeft = utils.daysUntil(university.confirmDeadline);

    const navItems = [
      { label: 'ダッシュボード', page: 'dashboard', href: '#/dashboard', icon: 'home' },
      { label: '入試情報一覧', page: 'examList', href: '#/exams', icon: 'list', badge: stats.pending },
      { label: '確認履歴', page: 'history', href: '#/history', icon: 'clock' },
    ];

    appEl.innerHTML = `
      <div class="app-layout">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            <div class="sidebar-brand-icon">🏫</div>
            <div class="sidebar-brand-name">${utils.escapeHtml(university.name)}</div>
            <div class="sidebar-brand-sub">入試情報確認システム</div>
          </div>
          <nav class="sidebar-nav">
            ${navItems.map(item => `
              <a class="sidebar-nav-item${page === item.page ? ' active' : ''}" href="${item.href}">
                <span class="sidebar-nav-icon">${utils.icons[item.icon]}</span>
                <span>${item.label}</span>
                ${item.badge ? `<span class="sidebar-nav-badge">${item.badge}</span>` : ''}
              </a>
            `).join('')}
          </nav>
          <div class="sidebar-footer">
            <div class="sidebar-user">
              <div class="sidebar-avatar">${user.name.charAt(0)}</div>
              <div>
                <div class="sidebar-user-name">${utils.escapeHtml(user.name)}</div>
                <div class="sidebar-user-role">${utils.escapeHtml(user.role)}</div>
              </div>
            </div>
            <button class="sidebar-logout-btn" id="logout-btn">
              ${utils.icons.logout} ログアウト
            </button>
          </div>
        </aside>

        <div class="main-wrapper">
          <header class="header">
            <div class="header-title">入試情報確認システム</div>
            <div class="header-right">
              ${daysLeft > 0 ? `
                <div class="header-deadline">
                  📅 確認期限まで残り<strong style="margin:0 4px">${daysLeft}</strong>日
                </div>
              ` : `
                <div class="header-deadline" style="background:#FEE2E2;color:#991B1B;border-color:#FECACA">
                  ⚠ 確認期限を過ぎています
                </div>
              `}
              <button class="header-notice-btn" title="お知らせ" id="notice-btn">
                ${utils.icons.bell}
                ${unread > 0 ? `<span class="header-badge">${unread}</span>` : ''}
              </button>
            </div>
          </header>

          <div class="page-content" id="page-content">
          </div>
        </div>
      </div>
    `;

    document.getElementById('logout-btn').addEventListener('click', async () => {
      await store.logout();
      navigate('/login');
    });

    document.getElementById('notice-btn').addEventListener('click', () => {
      showNoticesPanel();
    });

    const contentEl = document.getElementById('page-content');
    if (pages[page]) {
      await pages[page].render(contentEl, params);
    }
  }

  async function showNoticesPanel() {
    const store = window.ExamApp.store;
    const utils = window.ExamApp.utils;
    const notices = await store.getNotifications().catch(() => []);
    const typeClass = { returned: 'danger', deadline: 'warn', info: 'info' };

    utils.openModal(`
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <span class="modal-title">${utils.icons.bell} &nbsp;お知らせ</span>
          <button class="modal-close" id="modal-close-btn">${utils.icons.x}</button>
        </div>
        <div class="modal-body" style="padding:0">
          ${notices.length === 0 ? `
            <div class="empty-state" style="padding:32px">
              <div>お知らせはありません</div>
            </div>
          ` : notices.map(n => `
            <div class="notice-item">
              <div class="notice-dot ${typeClass[n.type] || ''}"></div>
              <div class="notice-content">
                <div class="notice-text"><strong>${n.type === 'returned' ? '↩ ' : ''}${utils.escapeHtml(n.title)}</strong><br>${utils.escapeHtml(n.body)}</div>
                <div class="notice-date">${utils.formatDate(n.date)}</div>
              </div>
              ${!n.read ? '<span style="color:#2563EB;font-size:10px;font-weight:700;flex-shrink:0">NEW</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `);

    document.getElementById('modal-close-btn').addEventListener('click', () => utils.closeModal());
  }

  window.addEventListener('hashchange', () => handleRouteChange());

  window.ExamApp.router = { navigate, handleRouteChange };
})();
