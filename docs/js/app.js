'use strict';

(function () {
  async function init() {
    await window.ExamApp.store.checkSession();
    const hash = window.location.hash;
    if (!hash || hash === '#' || hash === '#/') {
      const user = window.ExamApp.store.getCurrentUser();
      window.location.hash = user ? '/dashboard' : '/login';
    }
    await window.ExamApp.router.handleRouteChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
