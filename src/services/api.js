function getOrigin(){
  const w = typeof window !== 'undefined' ? window : {}
  const z = w.ZSK || {}
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
  return (
    w.ZSK_SERVER_ORIGIN ||
    z.SERVER_ORIGIN ||
    env.VITE_API_BASE ||
    (w.location && w.location.origin) ||
    'http://localhost:3000'
  )
}
function getBase(){ return `${getOrigin()}/api` }

async function req(url, options = {}) {
  const token = localStorage.getItem('token')
  const baseHeaders = { 'Content-Type': 'application/json' }
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
  try {
    const res = await fetch(url, { headers: { ...baseHeaders, ...authHeaders }, ...options })
    if (!res.ok) throw new Error(await res.text())
    return await res.json()
  } catch (e) {
    const isLocalhost = typeof url === 'string' && url.startsWith('http://localhost:')
    const isClientLocal = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    if (isLocalhost && isClientLocal) {
      const alt = url.replace('http://localhost', 'http://127.0.0.1')
      try {
        const res2 = await fetch(alt, { headers: { ...baseHeaders, ...authHeaders }, ...options })
        if (!res2.ok) throw new Error(await res2.text())
        return await res2.json()
      } catch {}
    }
    throw e
  }
}

export const api = {
  // Auth
  register: (username, password, name='', email=null) => req(`${getBase()}/auth/register`, { method: 'POST', body: JSON.stringify({ username, password, name, email }) }),
  login: (username, password) => req(`${getBase()}/auth/login`, { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => req(`${getBase()}/auth/me`),
  resetByEmail: (username, email, newPassword) => req(`${getBase()}/auth/reset-by-email`, { method: 'POST', body: JSON.stringify({ username, email, newPassword }) }),
  forgot: (identifier) => req(`${getBase()}/auth/forgot`, { method: 'POST', body: JSON.stringify({ identifier }) }),
  list: () => req(`${getBase()}/docs`),
  create: (payload) => req(`${getBase()}/docs`, { method: 'POST', body: JSON.stringify(payload) }),
  update: (id, payload) => req(`${getBase()}/docs/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  remove: (id) => req(`${getBase()}/docs/${id}`, { method: 'DELETE' }),
  copy: (id) => req(`${getBase()}/docs/copy/${id}`, { method: 'POST' }),
  batchDelete: (ids) => req(`${getBase()}/docs/batch-delete`, { method: 'POST', body: JSON.stringify({ ids }) }),
  importJson: (list) => req(`${getBase()}/docs/import`, { method: 'POST', body: JSON.stringify(list) }),
  importMarkdown: (title, markdown, tags=[], category='') => req(`${getBase()}/docs/import`, { method: 'POST', body: JSON.stringify({ title, markdown, tags, category }) }),
  share: (id, userIdentifier, level='read') => {
    const body = typeof userIdentifier === 'string' && userIdentifier.includes('@')
      ? { userEmail: userIdentifier, level }
      : { userName: userIdentifier, level }
    return req(`${getBase()}/docs/${id}/share`, { method: 'POST', body: JSON.stringify(body) })
  },
  claimLegacy: () => req(`${getBase()}/docs/claim-legacy`, { method: 'POST' }),
  deleteLegacy: () => req(`${getBase()}/docs/delete-legacy`, { method: 'POST' }),
  categories: () => req(`${getBase()}/categories`),
  createCategory: (name) => req(`${getBase()}/categories`, { method: 'POST', body: JSON.stringify({ name }) }),
  renameCategory: (from, to) => req(`${getBase()}/categories/rename`, { method: 'PUT', body: JSON.stringify({ from, to }) }),
  deleteCategory: (name, moveTo='') => req(`${getBase()}/categories/${encodeURIComponent(name)}?moveTo=${encodeURIComponent(moveTo)}`, { method: 'DELETE' }),
  // Bookmarks
  bookmarksList: () => req(`${getBase()}/bookmarks`),
  bookmarksCreate: (payload) => req(`${getBase()}/bookmarks`, { method: 'POST', body: JSON.stringify(payload) }),
  bookmarksUpdate: (id, payload) => req(`${getBase()}/bookmarks/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  bookmarksDelete: (id) => req(`${getBase()}/bookmarks/${id}`, { method: 'DELETE' }),
  bookmarksExport: () => req(`${getBase()}/bookmarks/export`),
  bookmarksImport: (list) => req(`${getBase()}/bookmarks/import`, { method: 'POST', body: JSON.stringify(list) }),
  // Uploads
  uploadImage: (dataUrl, name='') => req(`${getBase()}/upload-image`, { method: 'POST', body: JSON.stringify({ data: dataUrl, name }) })
  ,
  // Admin: backup & restore
  backupDownload: async () => {
    const token = localStorage.getItem('token')
    const res = await fetch(`${getBase()}/admin/backup`, { headers: { Authorization: token ? `Bearer ${token}` : '' } })
    if (!res.ok) throw new Error(await res.text())
    const blob = await res.blob()
    return blob
  },
  restoreImport: async (zipBase64) => req(`${getBase()}/admin/restore`, { method: 'POST', body: JSON.stringify({ zipBase64 }) })
}
