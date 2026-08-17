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
    setTok(d.token);
    return d;
  },
  adminLogin: async (idNumber, code, password) => {
    if (code !== undefined && password !== undefined) {
      return req('/auth/admin-login', { method: 'POST', body: JSON.stringify({ idNumber, code, password }) });
    }
    const pw = idNumber;
    const d = await req('/auth/admin-login', { method: 'POST', body: JSON.stringify({ password: pw }) });
    setTok(d.token); return true;
  },
  logout: clearTok,
  checkIdentity: (idNumber, code) => req('/auth/check-identity', { method: 'POST', body: JSON.stringify({ idNumber, code }) }),
  loginAsFarmer: (idNumber, code) => req('/auth/farmer-login', { method: 'POST', body: JSON.stringify({ idNumber, code }) }),
  loginAsAdmin: (idNumber, code, password) => req('/auth/admin-login', { method: 'POST', body: JSON.stringify({ idNumber, code, password }) }),
};

// ── Public ─────────────────────────────────────────────────────
export const publicAPI = {
  getSettings: () => req('/settings/public'),
};

// ── Farmer ─────────────────────────────────────────────────────
export const farmerAPI = {
  getMyData: () => req('/farmer/my-data'),
  getNotes: () => req('/farmer/notes'),
  addNote: n => req('/farmer/notes', { method: 'POST', body: JSON.stringify(n) }),
  deleteNote: id => req(`/farmer/notes/${id}`, { method: 'DELETE' }),
};

// ── Admin ──────────────────────────────────────────────────────
export const adminAPI = {
  // farmers
  getFarmers: () => req('/admin/farmers'),
  createFarmer: d => req('/admin/farmers', { method: 'POST', body: JSON.stringify(d) }),
  getFarmerCode: id => req(`/admin/farmers/${id}/code`),
  updateFarmer: (id, d) => req(`/admin/farmers/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteFarmer: id => req(`/admin/farmers/${id}`, { method: 'DELETE' }),
  // lands
  getLands: () => req('/admin/lands'),
  getRegions: () => req('/admin/regions'),
  getLandsByFarmer: farmerId => req(`/admin/lands?farmerId=${farmerId}`),
  createLand: d => req('/admin/lands', { method: 'POST', body: JSON.stringify(d) }),
  updateLand: (id, d) => req(`/admin/lands/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteLand: id => req(`/admin/lands/${id}`, { method: 'DELETE' }),
  cleanDuplicateLands: () => req('/admin/clean-duplicate-lands', { method: 'POST' }),
  // readings
  getReadings: p => req('/admin/readings' + (p ? '?' + new URLSearchParams(p) : '')),
  createReading: d => req('/admin/readings', { method: 'POST', body: JSON.stringify(d) }),
  updateReading: (id, d) => req(`/admin/readings/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteReading: id => req(`/admin/readings/${id}`, { method: 'DELETE' }),
  // prices
  getPrices: () => req('/admin/prices'),
  updatePrices: d => req('/admin/prices', { method: 'POST', body: JSON.stringify(d) }),
  // settings
  getAnnouncement: () => req('/admin/announcement'),
  updateAnnouncement: t => req('/admin/announcement', { method: 'POST', body: JSON.stringify({ text: t }) }),
  updateAdminPass: p => req('/admin/admin-password', { method: 'POST', body: JSON.stringify({ password: p }) }),
  updateVideo: (u, t) => req('/admin/video', { method: 'POST', body: JSON.stringify({ url: u, title: t }) }),
  // gallery
  getGallery: () => req('/admin/gallery'),
  updateGallery: imgs => req('/admin/gallery', { method: 'PUT', body: JSON.stringify({ images: imgs }) }),
  uploadImage: file => upload('/admin/upload-image', file),
  deleteImage: path => req('/admin/image', { method: 'DELETE', body: JSON.stringify({ path }) }),
  // reports
  getReport: p => req('/admin/report' + (p ? '?' + new URLSearchParams(p) : '')),
  // sync GPS
  syncGPS: () => req('/admin/sync-gps', { method: 'POST' }),
  // ✅ استيراد قراءات من Excel
  previewReadingsImport: d => req('/admin/preview-readings-import', { method: 'POST', body: JSON.stringify(d) }),
  applyReadingsImport:   d => req('/admin/apply-readings-import',   { method: 'POST', body: JSON.stringify(d) }),
  // ✅ مشاريع
  getProjects:          ()           => req('/admin/projects'),
  createProject:        d            => req('/admin/projects', { method: 'POST', body: JSON.stringify(d) }),
  updateProject:        (id, d)      => req(`/admin/projects/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteProject:        id           => req(`/admin/projects/${id}`, { method: 'DELETE' }),
  addProjectMember:     (id, d)      => req(`/admin/projects/${id}/members`, { method: 'POST', body: JSON.stringify(d) }),
  updateProjectMember:  (id, mid, d) => req(`/admin/projects/${id}/members/${mid}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteProjectMember:  (id, mid)    => req(`/admin/projects/${id}/members/${mid}`, { method: 'DELETE' }),
  addProjectPayment:    (id, mid, d) => req(`/admin/projects/${id}/members/${mid}/payments`, { method: 'POST', body: JSON.stringify(d) }),
  // ✅ تعديل دفعة موجودة (بدل حذف/إعادة إنشاء) — يحافظ على الـ id والبيانات المرتبطة بها
  updateProjectPayment: (id, mid, pid, d) => req(`/admin/projects/${id}/members/${mid}/payments/${pid}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteProjectPayment: (id, mid, pid) => req(`/admin/projects/${id}/members/${mid}/payments/${pid}`, { method: 'DELETE' }),
};

// ── Regions API ────────────────────────────────────────────────
export const regionsAPI = {
  getRegions: () => req('/admin/regions'),
  createRegion: d => req('/admin/regions', { method: 'POST', body: JSON.stringify(d) }),
  updateRegion: (id, d) => req(`/admin/regions/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  deleteRegion: id => req(`/admin/regions/${id}`, { method: 'DELETE' }),
};

// ── Reading actions ────────────────────────────────────────────
// ✅ الآن يأخذ periodIndex — تبديل حالة الدفع لفترة محددة، مو للسطر كامل
export const togglePaid = (id, periodIndex) => req(`/admin/readings/${id}/paid/${periodIndex}`, { method: 'POST' });
export const toggleExtraStatus = id => req(`/admin/readings/${id}/extra-status`, { method: 'POST' });
export const updateNote = (id, note) => req(`/admin/readings/${id}/note`, { method: 'POST', body: JSON.stringify({ note }) });

// ── Privileged Users API ───────────────────────────────────────
export const privilegedAPI = {
  getAll: () => req('/admin/privileged'),
  add: d => req('/admin/privileged', { method: 'POST', body: JSON.stringify(d) }),
  update: (id, d) => req(`/admin/privileged/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  remove: id => req(`/admin/privileged/${id}`, { method: 'DELETE' }),
};

// ── Tasks API (المهام والاستفسارات) ────────────────────────────
export const tasksAPI = {
  getAll:          params => req('/tasks' + (params ? '?' + new URLSearchParams(params) : '')),
  getPendingCount: () => req('/tasks/pending-count'),
  create:          d  => req('/tasks', { method: 'POST', body: JSON.stringify(d) }),
  markDone:        id => req(`/tasks/${id}/done`,   { method: 'PUT' }),
  reopen:          id => req(`/tasks/${id}/reopen`, { method: 'PUT' }),
  uploadImage:     file => upload('/tasks/upload-image', file),
};

// ── Push Notifications API (إشعارات الهاتف) ────────────────────
export const pushAPI = {
  subscribe:   subscription => req('/push/subscribe',   { method: 'POST', body: JSON.stringify({ subscription }) }),
  unsubscribe: endpoint     => req('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) }),
};

// ── Payments API ───────────────────────────────────────────────
export const paymentsAPI = {
  getAll: year => req(`/payments${year ? '?year=' + year : ''}`),
  getSummary: () => req('/payments/summary'),
  create: d => req('/payments', { method: 'POST', body: JSON.stringify(d) }),
  update: (id, d) => req(`/payments/${id}`, { method: 'PUT', body: JSON.stringify(d) }),
  delete: id => req(`/payments/${id}`, { method: 'DELETE' }),
};