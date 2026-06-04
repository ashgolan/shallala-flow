const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const tok = () => localStorage.getItem('shl_token');
const setTok = t => localStorage.setItem('shl_token', t);
const clearTok = () => {
  localStorage.removeItem('shl_token');
  localStorage.removeItem('shl_farmer');
  localStorage.removeItem('shl_admin');
};

const req = async (path, opts = {}) => {
  const t = tok();
  const headers = { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...opts.headers };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.expired) { clearTok(); window.location.reload(); }
    throw new Error(data.error || `خطأ ${res.status}`);
  }
  return data;
};

const upload = async (path, file) => {
  const t = tok();
  const fd = new FormData(); fd.append('image', file);
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
};

// ── Auth ───────────────────────────────────────────────────────
export const authAPI = {
  farmerLogin: async (idNumber, code) => {
    const d = await req('/auth/farmer-login', { method: 'POST', body: JSON.stringify({ idNumber, code }) });
    setTok(d.token); return d.farmer;
  },
  adminLogin: async (idNumber, code, password) => {
    // إذا أُعطي idNumber وcode → نظام الدخول الذكي الجديد
    if (code !== undefined && password !== undefined) {
      return req('/auth/admin-login', { method:'POST', body:JSON.stringify({ idNumber, code, password }) });
    }
    // الطريقة القديمة: adminLogin(password) فقط
    const pw = idNumber; // idNumber هنا هو الـ password
    const d = await req('/auth/admin-login', { method: 'POST', body: JSON.stringify({ password: pw }) });
    setTok(d.token); return true;
  },
  logout: clearTok,
  // Smart login
  checkIdentity: (idNumber, code) => req('/auth/check-identity', { method:'POST', body:JSON.stringify({ idNumber, code }) }),
  loginAsFarmer: (idNumber, code) => req('/auth/farmer-login',   { method:'POST', body:JSON.stringify({ idNumber, code }) }),
  loginAsAdmin:  (idNumber, code, password) => req('/auth/admin-login', { method:'POST', body:JSON.stringify({ idNumber, code, password }) }),
};

// ── Public ─────────────────────────────────────────────────────
export const publicAPI = {
  getSettings: () => req('/settings/public'),
};

// ── Farmer ─────────────────────────────────────────────────────
// ── Auth API ─────────────────────────────────────────────────


export const farmerAPI = {
  getMyData:   () => req('/farmer/my-data'),
  getNotes:    () => req('/farmer/notes'),
  addNote:   n => req('/farmer/notes', { method: 'POST', body: JSON.stringify(n) }),
  deleteNote: id => req(`/farmer/notes/${id}`, { method: 'DELETE' }),
};

// ── Admin ──────────────────────────────────────────────────────
export const adminAPI = {
  // farmers
  getFarmers:    ()       => req('/admin/farmers'),
  createFarmer:  d        => req('/admin/farmers', { method: 'POST', body: JSON.stringify(d) }),
  getFarmerCode: id       => req(`/admin/farmers/${id}/code`),
  updateFarmer:  (id, d)  => req(`/admin/farmers/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteFarmer:  id       => req(`/admin/farmers/${id}`, { method: 'DELETE' }),
  // lands
  getLands:      ()           => req('/admin/lands'),
  getRegions:    ()           => req('/admin/regions'),
  getLandsByFarmer: farmerId  => req(`/admin/lands?farmerId=${farmerId}`),
  createLand:    d           => req('/admin/lands',         { method: 'POST',   body: JSON.stringify(d) }),
  updateLand:    (id, d)  => req(`/admin/lands/${id}`,   { method: 'PUT',    body: JSON.stringify(d) }),
  deleteLand:    id       => req(`/admin/lands/${id}`,   { method: 'DELETE' }),
  // readings
  getReadings:   p        => req('/admin/readings' + (p ? '?' + new URLSearchParams(p) : '')),
  createReading: d        => req('/admin/readings', { method: 'POST', body: JSON.stringify(d) }),
  updateReading: (id, d)  => req(`/admin/readings/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteReading: id       => req(`/admin/readings/${id}`, { method: 'DELETE' }),
  // prices
  getPrices:     ()       => req('/admin/prices'),
  updatePrices:  d        => req('/admin/prices', { method: 'POST', body: JSON.stringify(d) }),
  // settings
  getAnnouncement:    ()  => req('/admin/announcement'),
  updateAnnouncement: t   => req('/admin/announcement', { method: 'POST', body: JSON.stringify({ text: t }) }),
  updateAdminPass:    p   => req('/admin/admin-password', { method: 'POST', body: JSON.stringify({ password: p }) }),
  updateVideo:   (u, t)   => req('/admin/video', { method: 'POST', body: JSON.stringify({ url: u, title: t }) }),
  // gallery
  getGallery:    ()       => req('/admin/gallery'),
  updateGallery: imgs     => req('/admin/gallery', { method: 'PUT', body: JSON.stringify({ images: imgs }) }),
  uploadImage:   file     => upload('/admin/upload-image', file),
  deleteImage:   path     => req('/admin/image', { method: 'DELETE', body: JSON.stringify({ path }) }),
  // reports
  getReport:     p        => req('/admin/report' + (p ? '?' + new URLSearchParams(p) : '')),
};

// تمت الإضافة — Regions API
export const regionsAPI = {
  getRegions:   ()      => req('/admin/regions'),
  createRegion: d       => req('/admin/regions',              { method:'POST',   body:JSON.stringify(d) }),
  updateRegion: (id, d) => req(`/admin/regions/${id}`,        { method:'PUT',    body:JSON.stringify(d) }),
  deleteRegion: id      => req(`/admin/regions/${id}`,        { method:'DELETE' }),
};

// Payment status toggle
export const togglePaid        = id => req(`/admin/readings/${id}/paid`,         { method: 'POST' });
// Extra status cycle
export const toggleExtraStatus = id => req(`/admin/readings/${id}/extra-status`, { method: 'POST' });
// Update reading note
export const updateNote        = (id, note) => req(`/admin/readings/${id}/note`,  { method: 'POST', body: JSON.stringify({ note }) });

// ── Privileged Users API ─────────────────────────────────────
export const privilegedAPI = {
  getAll:  ()       => req('/admin/privileged'),
  add:     d        => req('/admin/privileged',        { method:'POST',   body:JSON.stringify(d) }),
  update:  (id, d)  => req('/admin/privileged/'+id,    { method:'PUT',    body:JSON.stringify(d) }),
  remove:  id       => req('/admin/privileged/'+id,    { method:'DELETE' }),
};

// ── Payments API ─────────────────────────────────────────────
export const paymentsAPI = {
  getAll:     (year) => req(`/payments${year ? '?year='+year : ''}`),
  getSummary: ()     => req('/payments/summary'),
  create:     d      => req('/payments',     { method:'POST',   body:JSON.stringify(d) }),
  update:     (id,d) => req(`/payments/${id}`, { method:'PUT',    body:JSON.stringify(d) }),
  delete:     id     => req(`/payments/${id}`, { method:'DELETE' }),
};
