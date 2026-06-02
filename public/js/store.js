'use strict';

window.ExamApp = window.ExamApp || {};

window.ExamApp.store = {
  _user: null,
  _university: null,

  getCurrentUser() { return this._user; },
  getUniversity() { return this._university; },

  async _fetch(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      this._user = null;
      window.ExamApp.router.navigate('/login');
      throw new Error('Unauthorized');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'APIエラー');
    }
    return res.json();
  },

  async checkSession() {
    try {
      const data = await this._fetch('/api/auth/status');
      this._user = data.user;
      this._university = data.university;
      return true;
    } catch {
      return false;
    }
  },

  async login(email, password) {
    try {
      const data = await this._fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      this._user = data.user;
      this._university = data.university;
      return true;
    } catch {
      return false;
    }
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    this._user = null;
    this._university = null;
  },

  async getStats() {
    return this._fetch('/api/stats');
  },

  async getExams(filter, query) {
    const params = new URLSearchParams();
    if (filter && filter !== 'all') params.set('status', filter);
    if (query) params.set('q', query);
    return this._fetch('/api/exams?' + params.toString());
  },

  async getExam(id) {
    return this._fetch('/api/exams/' + id);
  },

  async getUrgentExams() {
    return this._fetch('/api/exams/urgent');
  },

  async confirmExam(examId) {
    return this._fetch('/api/exams/' + examId + '/confirm', { method: 'POST' });
  },

  async editExam(examId, fields) {
    return this._fetch('/api/exams/' + examId, {
      method: 'PUT',
      body: JSON.stringify(fields),
    });
  },

  async getNotifications() {
    return this._fetch('/api/notifications');
  },

  async getUnreadNotificationCount() {
    const notifs = await this.getNotifications().catch(() => []);
    return notifs.filter(n => !n.read).length;
  },

  async getHistory(type) {
    const params = new URLSearchParams();
    if (type && type !== 'all') params.set('type', type);
    return this._fetch('/api/history?' + params.toString());
  },

  async bulkSaveExams(exams) {
    return this._fetch('/api/exams/bulk', {
      method: 'POST',
      body: JSON.stringify({ exams }),
    });
  },
};
