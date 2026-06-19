/**
 * Cliente API - manejo de peticiones HTTP con JWT
 */
const API_BASE = '/api';

const Auth = {
  get token() { return localStorage.getItem('token'); },
  set token(v) { v ? localStorage.setItem('token', v) : localStorage.removeItem('token'); },
  get user() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  },
  set user(v) { v ? localStorage.setItem('user', JSON.stringify(v)) : localStorage.removeItem('user'); },
  get empresas() {
    const e = localStorage.getItem('empresas');
    return e ? JSON.parse(e) : [];
  },
  set empresas(v) { localStorage.setItem('empresas', JSON.stringify(v || [])); },
  get empresaId() { return localStorage.getItem('empresa_id'); },
  set empresaId(v) { v ? localStorage.setItem('empresa_id', v) : localStorage.removeItem('empresa_id'); },
  get empresaActual() {
    const id = this.empresaId;
    return this.empresas.find(e => String(e.id) === String(id));
  },
  logout() {
    localStorage.clear();
    window.location.href = '/index.html';
  },
  requireAuth() {
    if (!this.token) {
      window.location.href = '/index.html';
      return false;
    }
    return true;
  }
};

const API = {
  async request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (Auth.token) headers['Authorization'] = `Bearer ${Auth.token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      Auth.logout();
      throw new Error('Sesión expirada');
    }
    if (!res.ok) throw new Error(data.message || 'Error de red');
    return data;
  },
  get(url)        { return this.request('GET', url); },
  post(url, body) { return this.request('POST', url, body); },
  put(url, body)  { return this.request('PUT', url, body); },
  del(url)        { return this.request('DELETE', url); }
};

// Helpers UI
function showAlert(container, message, type = 'error') {
  const el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) return;
  el.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => { el.innerHTML = ''; }, 5000);
}

function fmtMoney(value, currency = 'PEN') {
  const symbols = { MXN: '$', COP: '$', PEN: 'S/', CLP: '$', USD: '$' };
  const num = Number(value || 0);
  return `${symbols[currency] || ''} ${num.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function fmtDateTime(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('es-PE');
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function paisBadge(codigo) {
  const colors = { MX: '#16a34a', CO: '#2563eb', PE: '#dc2626', CL: '#0891b2', EC: '#ca8a04' };
  return `<span class="badge" style="background:${colors[codigo] || '#64748b'}; color:white;">${codigo}</span>`;
}
