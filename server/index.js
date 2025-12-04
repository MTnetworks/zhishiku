import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import morgan from 'morgan'
import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'
import AdmZipPkg from 'adm-zip'
const AdmZip = (AdmZipPkg && AdmZipPkg.default) ? AdmZipPkg.default : AdmZipPkg
if (!process.env.PRISMA_CLIENT_ENGINE_TYPE) process.env.PRISMA_CLIENT_ENGINE_TYPE = 'library'
let PrismaClient
try {
  const dir = process.env.PRISMA_CLIENT_DIR
  if (dir) {
    const url = pathToFileURL(path.join(dir, 'index.js')).href
    const mod = await import(url)
    PrismaClient = mod.PrismaClient || (mod.default && mod.default.PrismaClient)
    slog(`loaded prisma client from ${dir}`)
  }
} catch (e) {
  slog(`load prisma client from dir failed: ${e && e.message ? e.message : String(e)}`)
}
if (!PrismaClient) {
  const prismaPkg = await import('@prisma/client')
  PrismaClient = prismaPkg.PrismaClient || (prismaPkg.default && prismaPkg.default.PrismaClient)
  slog('loaded prisma client from @prisma/client')
}
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
function pickLanIP(){
  try {
    const nets = os.networkInterfaces()
    for (const k of Object.keys(nets)){
      for (const n of nets[k] || []){
        if (n && n.family === 'IPv4' && !n.internal) return n.address
      }
    }
  } catch {}
  return '127.0.0.1'
}
const SERVER_ORIGIN = (() => {
  const p = Number(process.env.PORT) || 3000
  if (process.env.SERVER_ORIGIN) return process.env.SERVER_ORIGIN
  const ip = pickLanIP()
  return `http://${ip}:${p}`
})()

function slog(msg){
  try {
    let dir = process.env.ZSK_LOG_DIR
    if (!dir) {
      dir = path.join(os.tmpdir(), 'zsk-logs')
      try { fs.mkdirSync(dir, { recursive: true }) } catch {}
    }
    const file = path.join(dir, 'server.log')
    const d = new Date()
    const off = -d.getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const abs = Math.abs(off)
    const hh = String(Math.floor(abs / 60)).padStart(2, '0')
    const mm = String(abs % 60).padStart(2, '0')
    const pad = (n) => String(n).padStart(2, '0')
    const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} GMT${sign}${hh}:${mm}`
    fs.appendFileSync(file, `[${local}] ${msg}\n`)
  } catch {}
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '500mb' }))
app.use(express.urlencoded({ extended: true, limit: '500mb' }))
// 日志增强：响应时间与文档ID
morgan.token('docId', (req) => req.params?.id || req.body?.id || '-')
app.use(morgan(':method :url :status :res[content-length] - :response-time ms docId=:docId'))


// 生成纯数字ID：时间戳 + 3位随机数，避免重复
function todayPrefix(){
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`
}
function nextSeq(docs){
  const prefix = todayPrefix()
  let max = 0;
  (docs || []).forEach(d => {
    const id = String(d.id || '')
    if (id.startsWith(prefix)){
      const tail = id.slice(prefix.length)
      const n = parseInt(tail, 10)
      if (!isNaN(n)) max = Math.max(max, n)
    }
  })
  return max + 1
}
function genIdWithDocs(docs){
  const seq = nextSeq(docs)
  return `${todayPrefix()}${String(seq).padStart(2,'0')}`
}
function nowTs() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const y = d.getFullYear()
  const m = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hh = pad(d.getHours())
  const mm = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
}

// Initialize Prisma (tolerate failure to allow server to start and report)
if (!process.env.PRISMA_CLIENT_ENGINE_TYPE) process.env.PRISMA_CLIENT_ENGINE_TYPE = 'binary'
let prisma = null
try {
  slog(`engine env: type=${process.env.PRISMA_CLIENT_ENGINE_TYPE || ''} lib=${process.env.PRISMA_QUERY_ENGINE_LIBRARY || ''} bin=${process.env.PRISMA_QUERY_ENGINE_BINARY || ''} clientDir=${process.env.PRISMA_CLIENT_DIR || ''}`)
  prisma = new PrismaClient()
  slog('prisma initialized')
} catch (e) {
  prisma = null
  slog(`prisma init failed: ${e && e.message ? e.message : String(e)}`)
}

async function tableExists(name) {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`)
    return Array.isArray(rows) && rows.length > 0
  } catch { return false }
}

async function ensureSchema() {
  try {
    if (!prisma) return false
    const ok = await tableExists('User')
    if (ok) { slog('schema ready'); return true }
    const migDir = path.join(__dirname, '..', 'prisma', 'migrations')
    if (!fs.existsSync(migDir)) { slog(`migrations dir missing ${migDir}`); return false }
    const entries = fs.readdirSync(migDir).filter(f => fs.existsSync(path.join(migDir, f, 'migration.sql'))).sort()
    // disable foreign keys during deploy to avoid order issues
    try { await prisma.$executeRawUnsafe('PRAGMA foreign_keys=OFF;') } catch {}
    for (const e of entries) {
      const sql = fs.readFileSync(path.join(migDir, e, 'migration.sql'), 'utf8')
      const parts = sql.split(/;\s*(\r?\n)+/).map(s => s.trim()).filter(Boolean)
      let applied = 0
      for (const stmt of parts) {
        try { await prisma.$executeRawUnsafe(stmt + ';'); applied++ } catch (err) { slog(`migration ${e} stmt failed: ${err && err.message ? err.message : String(err)}`) }
      }
      slog(`applied migration ${e} statements=${applied}`)
    }
    try { await prisma.$executeRawUnsafe('PRAGMA foreign_keys=ON;') } catch {}
    const ok2 = await tableExists('User')
    slog(`schema ensure result ${ok2}`)
    return ok2
  } catch (e) {
    slog(`ensure schema failed: ${e && e.message ? e.message : String(e)}`)
    return false
  }
}

await ensureSchema()

// Auth: JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

// Attach user from Authorization header
app.use(async (req, res, next) => {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(.+)$/)
  if (m) {
    try {
      const payload = jwt.verify(m[1], JWT_SECRET)
      if (payload && payload.id) {
        if (prisma) req.user = await prisma.user.findUnique({ where: { id: payload.id } })
      }
    } catch (e) {}
  }
  next()
})

function requireAuth(req, res, next){
  if (!req.user) return res.status(401).json({ message: 'unauthorized' })
  next()
}

// 将对象/数组安全地序列化为 JSON 字符串（SQLite 使用 String 存储）
function toJsonString(val, fallback) {
  try {
    const v = val === undefined ? fallback : val
    return JSON.stringify(v === undefined ? null : v)
  } catch (e) {
    return JSON.stringify(fallback === undefined ? null : fallback)
  }
}

// 解析可能的 JSON 字符串，失败则返回默认值
function parseJsonString(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback
  if (typeof str !== 'string') return str
  try {
    let v = JSON.parse(str)
    // 处理双重编码的字符串（例如 "[\"a\",\"b\"]"）
    if (typeof v === 'string') {
      try { v = JSON.parse(v) } catch {}
    }
    return v
  } catch (e) {
    return fallback
  }
}

function toClientDocument(row){
  if (!row) return row
  const parsedTags = parseJsonString(row.tags, [])
  let tags
  if (Array.isArray(parsedTags)) {
    tags = parsedTags
  } else if (typeof parsedTags === 'string') {
    // 去除可能的括号和引号残留，然后按分隔符拆分
    const cleaned = parsedTags.replace(/[\[\]"]/g, ' ').trim()
    tags = cleaned.split(/[\s,，,;；]+/).filter(Boolean)
  } else {
    tags = []
  }
  const parsedBlocks = parseJsonString(row.blocks, [])
  const blocks = Array.isArray(parsedBlocks) ? parsedBlocks : []
  const parsedCode = parseJsonString(row.code, { language: 'javascript', value: '' })
  const code = (parsedCode && typeof parsedCode === 'object') ? parsedCode : { language: 'javascript', value: '' }
  return { ...row, tags, blocks, code }
}

// 保存 base64 图片到本地并返回可访问URL
function ensureDir(p){ try { fs.mkdirSync(p, { recursive: true }) } catch {} }
function mimeToExt(mime){
  if (mime === 'image/png') return '.png'
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/gif') return '.gif'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/svg+xml') return '.svg'
  return ''
}
function uniqueName(ext=''){ return `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}` }

app.post('/api/upload-image', async (req, res) => {
  const { data, name='' } = req.body || {}
  if (!data || typeof data !== 'string') return res.status(400).json({ message: 'invalid image data' })
  const m = data.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!m) return res.status(400).json({ message: 'invalid data url' })
  const mime = m[1]
  const base64 = m[2]
  const extFromMime = mimeToExt(mime)
  const extFromName = (String(name).match(/\.(png|jpg|jpeg|gif|webp|svg)$/i) || [,''])[1]
  const ext = extFromMime || (extFromName ? `.${extFromName.toLowerCase()}` : '')
  const day = todayPrefix()
  const base = process.env.ZSK_UPLOADS_DIR || path.join(__dirname, 'uploads')
  const dir = path.join(base, day)
  ensureDir(dir)
  const filename = uniqueName(ext || '.png')
  const filePath = path.join(dir, filename)
  try {
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))
    const url = `${SERVER_ORIGIN}/uploads/${day}/${filename}`
    res.json({ url })
  } catch (e) {
    console.error('upload-image error:', e)
    res.status(500).json({ message: 'store image failed' })
  }
})

// ===== Auth Routes =====
app.post('/api/auth/register', async (req, res) => {
  const { username, password, name='', email=null } = req.body || {}
  if (!username || !password) return res.status(400).json({ message: 'username and password required' })
  const exists = await prisma.user.findUnique({ where: { username } })
  if (exists) return res.status(409).json({ message: 'username exists' })
  const hash = await bcrypt.hash(password, 10)
  const role = 'user'
  const user = await prisma.user.create({ data: { username, email, passwordHash: hash, name, role, createdAt: nowTs() } })
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } })
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return res.status(401).json({ message: 'invalid credentials' })
  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) return res.status(401).json({ message: 'invalid credentials' })
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } })
})

// 找回密码：通过用户名+邮箱重置密码（基础实现，便于测试环境使用）
app.post('/api/auth/reset-by-email', async (req, res) => {
  try {
    const { username, email, newPassword } = req.body || {}
    if (!username || !email || !newPassword) return res.status(400).json({ message: '缺少必要字段' })
    const user = await prisma.user.findUnique({ where: { username } })
    if (!user) return res.status(404).json({ message: '用户不存在' })
    if (!user.email || user.email.toLowerCase() !== String(email).toLowerCase()) {
      return res.status(400).json({ message: '邮箱不匹配或未绑定邮箱' })
    }
    const hash = await bcrypt.hash(String(newPassword), 10)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } })
    res.json({ ok: true })
  } catch (e) {
    console.error('reset-by-email error', e)
    res.status(500).json({ message: '重置失败' })
  }
})

// 忘记密码请求占位：可根据用户名或邮箱记录请求，后续接入邮件服务
app.post('/api/auth/forgot', async (req, res) => {
  const { identifier } = req.body || {}
  if (!identifier) return res.status(400).json({ message: '缺少标识' })
  try {
    const byName = await prisma.user.findUnique({ where: { username: String(identifier) } })
    let byEmail = null
    try { byEmail = await prisma.user.findUnique({ where: { email: String(identifier) } }) } catch {}
    if (!byName && !byEmail) return res.status(404).json({ message: '未找到用户' })
    res.json({ ok: true, message: '请求已接收（占位）' })
  } catch (e) {
    console.error('forgot error', e)
    res.status(500).json({ message: '请求失败' })
  }
})

app.get('/api/auth/me', requireAuth, async (req, res) => {
  const u = req.user
  res.json({ id: u.id, username: u.username, name: u.name, role: u.role })
})

app.get('/api/docs', requireAuth, async (req, res) => {
  const rows = await prisma.document.findMany({
    where: {
      OR: [
        { ownerId: req.user.id },
        { accesses: { some: { userId: req.user.id } } }
      ]
    },
    orderBy: { createdAt: 'desc' }
  })
  const docs = rows.map(toClientDocument)
  res.json(docs)
})

app.post('/api/docs', requireAuth, async (req, res) => {
  const payload = req.body || {}
  const today = todayPrefix()
  const todayDocs = await prisma.document.findMany({ where: { id: { startsWith: today } } })
  const doc = {
    id: genIdWithDocs(todayDocs),
    title: payload.title || '未命名文档',
    category: payload.category || '',
    alias: payload.alias || '',
    tags: toJsonString(Array.isArray(payload.tags) ? payload.tags : [], []),
    richText: payload.richText || '',
    markdown: payload.markdown || '',
    blocks: toJsonString(Array.isArray(payload.blocks) ? payload.blocks : [], []),
    code: toJsonString(payload.code || { language: 'javascript', value: '' }, { language: 'javascript', value: '' }),
    ownerId: req.user.id,
    createdAt: nowTs(),
    updatedAt: nowTs()
  }
  const created = await prisma.document.create({ data: doc })
  res.json(toClientDocument(created))
})

app.put('/api/docs/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  try {
    const doc = await prisma.document.findUnique({ where: { id }, include: { accesses: true } })
    const canWrite = doc && (doc.ownerId === req.user.id || doc.accesses.some(a => a.userId === req.user.id && a.level === 'write'))
    if (!canWrite) return res.status(403).json({ message: 'forbidden' })
    const body = req.body || {}
    const data = { updatedAt: nowTs() }
    if ('title' in body) data.title = body.title || ''
    if ('category' in body) data.category = body.category || ''
    if ('alias' in body) data.alias = body.alias || ''
    if ('tags' in body) data.tags = toJsonString(Array.isArray(body.tags) ? body.tags : body.tags, [])
    if ('richText' in body) data.richText = body.richText || ''
    if ('markdown' in body) data.markdown = body.markdown || ''
    if ('blocks' in body) data.blocks = toJsonString(Array.isArray(body.blocks) ? body.blocks : body.blocks, [])
    if ('code' in body) data.code = toJsonString(body.code, { language: 'javascript', value: '' })
    const updated = await prisma.document.update({ where: { id }, data })
    res.json(toClientDocument(updated))
  } catch (e) {
    res.status(404).json({ message: 'not found' })
  }
})

app.delete('/api/docs/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const doc = await prisma.document.findUnique({ where: { id } })
  if (!doc) return res.json({ ok: true })
  if (doc.ownerId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' })
  await prisma.document.delete({ where: { id } }).catch(() => {})
  res.json({ ok: true })
})

app.post('/api/docs/copy/:id', requireAuth, async (req, res) => {
  const id = req.params.id
  const doc = await prisma.document.findUnique({ where: { id } })
  if (!doc) return res.status(404).json({ message: 'not found' })
  if (doc.ownerId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' })
  const today = todayPrefix()
  const todayDocs = await prisma.document.findMany({ where: { id: { startsWith: today } } })
  const copy = { ...doc, id: genIdWithDocs(todayDocs), alias: '', title: doc.title + ' - 副本', createdAt: nowTs(), updatedAt: nowTs() }
  const created = await prisma.document.create({ data: copy })
  res.json(toClientDocument(created))
})

app.post('/api/docs/batch-delete', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : []
  // Only delete owned documents unless admin
  const ownedIds = await prisma.document.findMany({ where: { id: { in: ids }, ownerId: req.user.id }, select: { id: true } })
  const idsToDelete = (req.user.role === 'admin') ? ids : ownedIds.map(d => d.id)
  await prisma.document.deleteMany({ where: { id: { in: idsToDelete } } })
  res.json({ ok: true })
})

app.post('/api/docs/import', requireAuth, async (req, res) => {
  const payload = req.body
  if (Array.isArray(payload)) {
    const existing = await prisma.document.findMany({ select: { id: true } })
    let seqBase = nextSeq(existing)
    const prefix = todayPrefix()
    const normalized = payload.map(d => ({
      id: `${prefix}${String(seqBase++).padStart(2,'0')}`,
      title: d.title || '导入文档',
      category: d.category || '',
      alias: d.alias || '',
      tags: toJsonString(Array.isArray(d.tags) ? d.tags : d.tags, []),
      richText: d.richText || '',
      markdown: d.markdown || '',
      blocks: toJsonString(Array.isArray(d.blocks) ? d.blocks : d.blocks, []),
      code: toJsonString(d.code || { language: 'javascript', value: '' }, { language: 'javascript', value: '' }),
      ownerId: req.user.id,
      createdAt: nowTs(),
      updatedAt: nowTs()
    }))
    await prisma.document.createMany({ data: normalized })
    return res.json({ count: normalized.length })
  }
  if (payload && typeof payload === 'object' && payload.markdown) {
    const existing = await prisma.document.findMany({ select: { id: true } })
    const doc = {
      id: genIdWithDocs(existing), title: payload.title || '导入Markdown', tags: toJsonString(Array.isArray(payload.tags) ? payload.tags : payload.tags, []),
      category: payload.category || '',
      alias: payload.alias || '',
      richText: '', markdown: payload.markdown, blocks: toJsonString([], []), code: toJsonString({ language: 'markdown', value: payload.markdown }, { language: 'markdown', value: payload.markdown }),
      ownerId: req.user.id,
      createdAt: nowTs(), updatedAt: nowTs()
    }
    const created = await prisma.document.create({ data: doc })
    return res.json(toClientDocument(created))
  }
  res.status(400).json({ message: 'invalid import payload' })
})

// Share document with a collaborator
app.post('/api/docs/:id/share', requireAuth, async (req, res) => {
  const id = req.params.id
  const { userEmail=null, userName=null, level='read' } = req.body || {}
  const doc = await prisma.document.findUnique({ where: { id } })
  if (!doc) return res.status(404).json({ message: 'not found' })
  if (doc.ownerId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' })
  let user = null
  if (userEmail) user = await prisma.user.findUnique({ where: { email: userEmail } }).catch(() => null)
  if (!user && userName) user = await prisma.user.findUnique({ where: { username: userName } }).catch(() => null)
  if (!user) return res.status(404).json({ message: 'user not found' })
  await prisma.documentAccess.upsert({
    where: { docId_userId: { docId: id, userId: user.id } },
    update: { level },
    create: { docId: id, userId: user.id, level }
  })
  res.json({ ok: true })
})

// 认领旧文档：将没有 ownerId 的文档归属到当前用户
app.post('/api/docs/claim-legacy', requireAuth, async (req, res) => {
  const updated = await prisma.document.updateMany({ where: { ownerId: null }, data: { ownerId: req.user.id } })
  res.json({ count: updated.count })
})

// 删除所有旧文档：移除没有所有者的历史测试数据
app.post('/api/docs/delete-legacy', requireAuth, async (req, res) => {
  const result = await prisma.document.deleteMany({ where: { ownerId: null } })
  res.json({ deleted: result.count })
})

// 获取所有分类（去重、过滤空）
// 分类管理
app.get('/api/categories', async (req, res) => {
  const docs = await prisma.document.findMany({ select: { category: true } })
  const cats = await prisma.category.findMany({ select: { name: true } })
  const set = new Set(cats.map(c => c.name))
  docs.forEach(d => { if (d.category && typeof d.category === 'string') set.add(d.category) })
  res.json(Array.from(set).filter(Boolean).sort())
})
app.post('/api/categories', async (req, res) => {
  const name = (req.body?.name || '').trim()
  if (!name) return res.status(400).json({ message: 'invalid category name' })
  const exists = await prisma.category.findUnique({ where: { name } })
  if (exists) return res.status(409).json({ message: 'category exists' })
  await prisma.category.create({ data: { name } })
  const cats = await prisma.category.findMany({ select: { name: true } })
  res.json({ ok: true, categories: cats.map(c => c.name) })
})
app.put('/api/categories/rename', async (req, res) => {
  const from = (req.body?.from || '').trim()
  const to = (req.body?.to || '').trim()
  if (!from || !to) return res.status(400).json({ message: 'invalid rename payload' })
  const catFrom = await prisma.category.findUnique({ where: { name: from } })
  if (!catFrom) return res.status(404).json({ message: 'category not found' })
  const catTo = await prisma.category.findUnique({ where: { name: to } })
  if (catTo) return res.status(409).json({ message: 'target category exists' })
  await prisma.$transaction([
    prisma.category.update({ where: { name: from }, data: { name: to } }),
    prisma.document.updateMany({ where: { category: from }, data: { category: to, updatedAt: nowTs() } })
  ])
  const cats = await prisma.category.findMany({ select: { name: true } })
  const updatedCount = await prisma.document.count({ where: { category: to } })
  res.json({ ok: true, updated: updatedCount, categories: cats.map(c => c.name) })
})
app.delete('/api/categories/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name || '')
  const moveTo = (req.query.moveTo || '').trim()
  if (!name) return res.status(400).json({ message: 'invalid category name' })
  await prisma.category.delete({ where: { name } }).catch(() => {})
  await prisma.document.updateMany({ where: { category: name }, data: { category: moveTo || '', updatedAt: nowTs() } })
  if (moveTo) {
    const exists = await prisma.category.findUnique({ where: { name: moveTo } })
    if (!exists) await prisma.category.create({ data: { name: moveTo } })
  }
  const cats = await prisma.category.findMany({ select: { name: true } })
  const updatedCount = await prisma.document.count({ where: { category: moveTo || '' } })
  res.json({ ok: true, updated: updatedCount, categories: cats.map(c => c.name) })
})

// 书签 API
app.get('/api/bookmarks', async (req, res) => {
  const rows = await prisma.bookmark.findMany({ orderBy: { createdAt: 'desc' } })
  const list = rows.map(b => ({ ...b, tags: parseJsonString(b.tags, []) }))
  res.json(list)
})
app.post('/api/bookmarks', async (req, res) => {
  const { url, title='', group='', tags=[] } = req.body || {}
  if (!url || typeof url !== 'string') return res.status(400).json({ message: 'invalid url' })
  const key = String(url).trim().toLowerCase()
  const exists = await prisma.bookmark.findFirst({ where: { url: key } })
  if (exists) return res.status(409).json({ message: 'bookmark exists' })
  const today = todayPrefix()
  const todayMarks = await prisma.bookmark.findMany({ where: { id: { startsWith: today } } })
  const item = { id: genIdWithDocs(todayMarks), url, title, group, tags: toJsonString(Array.isArray(tags) ? tags : tags, []), createdAt: nowTs() }
  const created = await prisma.bookmark.create({ data: item })
  res.json({ ...created, tags: parseJsonString(created.tags, []) })
})
app.put('/api/bookmarks/:id', async (req, res) => {
  const id = req.params.id
  const { title='', group='', tags, url } = req.body || {}
  const data = {
    title,
    group,
    updatedAt: nowTs()
  }
  if (url !== undefined) {
    const newUrl = String(url || '').trim()
    if (!newUrl) return res.status(400).json({ message: 'invalid url' })
    // 若更改了网址，检查是否与其它书签重复
    const current = await prisma.bookmark.findUnique({ where: { id } }).catch(() => null)
    if (!current) return res.status(404).json({ message: 'bookmark not found' })
    if (newUrl !== current.url) {
      const dup = await prisma.bookmark.findFirst({ where: { url: newUrl } })
      if (dup && dup.id !== id) return res.status(409).json({ message: 'bookmark exists' })
    }
    data.url = newUrl
  }
  if (tags !== undefined) {
    data.tags = toJsonString(Array.isArray(tags) ? tags : tags, [])
  }
  const updated = await prisma.bookmark.update({ where: { id }, data }).catch(() => null)
  if (!updated) return res.status(404).json({ message: 'bookmark not found' })
  res.json({ ...updated, tags: parseJsonString(updated.tags, []) })
})
app.delete('/api/bookmarks/:id', async (req, res) => {
  const id = req.params.id
  await prisma.bookmark.delete({ where: { id } }).catch(() => {})
  res.json({ ok: true })
})

// 书签导出
app.get('/api/bookmarks/export', async (req, res) => {
  const rows = await prisma.bookmark.findMany({ orderBy: { createdAt: 'desc' } })
  const list = rows.map(b => ({ ...b, tags: parseJsonString(b.tags, []) }))
  res.json(list)
})

// 批量导入书签：数组 [{ url, title?, group?, tags? }]
app.post('/api/bookmarks/import', async (req, res) => {
  const payload = req.body
  if (!Array.isArray(payload)) return res.status(400).json({ message: 'invalid import payload' })
  const existList = await prisma.bookmark.findMany({ select: { url: true, id: true } })
  const lowerSet = new Set(existList.map(b => String(b.url || '').trim().toLowerCase()))
  let added = 0
  const prefix = todayPrefix()
  const todayMarks = await prisma.bookmark.findMany({ where: { id: { startsWith: prefix } } })
  let seqBase = nextSeq(todayMarks)
  const normalized = []
  for (const it of payload) {
    const url = (it?.url || '').trim()
    if (!url) continue
    const key = url.toLowerCase()
    if (lowerSet.has(key)) continue
    lowerSet.add(key)
    added++
    normalized.push({
      id: `${prefix}${String(seqBase++).padStart(2,'0')}`,
      url,
      title: (it?.title || ''),
      group: (it?.group || ''),
      tags: toJsonString(Array.isArray(it?.tags) ? it.tags : it.tags, []),
      createdAt: nowTs()
    })
  }
  if (normalized.length) await prisma.bookmark.createMany({ data: normalized })
  res.json({ count: added })
})

const port = process.env.PORT || 3000
const HOST = process.env.ZSK_LISTEN_HOST || '0.0.0.0'
// 错误处理（兜底）
app.use((err, req, res, next) => {
  console.error('API error:', err)
  res.status(500).json({ message: 'internal server error' })
})

app.use('/uploads', express.static(process.env.ZSK_UPLOADS_DIR || path.join(__dirname, 'uploads')))
app.get('/api/health', async (req, res) => {
  let prismaOk = false
  try { if (prisma) { prismaOk = await tableExists('User') } } catch (e) { prismaOk = false }
  const payload = {
    ok: true,
    prismaOk,
    port,
    origin: SERVER_ORIGIN,
    db: process.env.DATABASE_URL || '',
    uploads: process.env.ZSK_UPLOADS_DIR || ''
  }
  slog(`health ${JSON.stringify(payload)}`)
  res.json(payload)
})
app.use('/api', (req, res, next) => {
  if (!prisma) { res.status(503).json({ ok: false, error: 'prisma not initialized' }); return }
  tableExists('User').then(ok => { if (!ok) { res.status(503).json({ ok: false, error: 'database not initialized' }); return } next() }).catch(() => { res.status(503).json({ ok: false, error: 'database check failed' }) })
})
// 前端静态站点：如果存在 dist-web，则作为根路径提供静态资源
try {
  const distDir = path.join(__dirname, '..', 'dist-web')
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir))
    // SPA 回退：排除 API 与上传路径，其余路径返回 index.html
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next()
      const indexPath = path.join(distDir, 'index.html')
      try { if (fs.existsSync(indexPath)) return res.sendFile(indexPath) } catch {}
      next()
    })
  }
} catch {}
function listenWithFallback(){
  try {
    const srv = app.listen(port, HOST, () => {
      const msg = `API server listening on http://${HOST}:${port} db=${process.env.DATABASE_URL || ''} uploads=${process.env.ZSK_UPLOADS_DIR || ''}`
      console.log(msg)
      slog(msg)
    })
    srv.on('error', (e) => {
      const msg = `listen error on ${HOST}:${port} ${e && e.message ? e.message : e}`
      console.error(msg)
      slog(msg)
      // keep silent if host binding fails
    })
  } catch (e) {
    const m = `listen throw ${e && e.message ? e.message : e}`
    console.error(m)
    slog(m)
  }
}
listenWithFallback()
process.on('uncaughtException', (e) => { slog(`uncaught ${e && e.message ? e.message : e}`) })

function requireAdmin(req, res, next){
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ message: 'forbidden' })
  next()
}

function resolveDbPath(){
  const url = process.env.DATABASE_URL || ''
  if (url.startsWith('file:')) {
    const p = url.slice(5)
    if (path.isAbsolute(p)) return p
    return path.join(__dirname, '..', p)
  }
  if (url) return url
  return path.join(__dirname, '..', 'prisma', 'dev.db')
}

app.get('/api/admin/backup', requireAuth, async (req, res) => {
  try {
    const dbPath = resolveDbPath()
    const uploadsDir = process.env.ZSK_UPLOADS_DIR || path.join(__dirname, 'uploads')
    const zip = new AdmZip()
    try {
      if (dbPath && fs.existsSync(dbPath)) {
        const tmpDir = path.join(process.env.ZSK_LOG_DIR || path.join(__dirname, 'tmp'))
        try { fs.mkdirSync(tmpDir, { recursive: true }) } catch {}
        const tmpDb = path.join(tmpDir, `backup-${Date.now()}.db`)
        let added = false
        try {
          await prisma.$executeRawUnsafe(`VACUUM INTO '${tmpDb.replace(/'/g, "''")}'`)
          if (fs.existsSync(tmpDb)) { zip.addLocalFile(tmpDb, 'db', 'dev.db'); added = true }
        } catch {}
        if (!added) {
          try {
            const buf = fs.readFileSync(dbPath)
            zip.addFile(path.posix.join('db','dev.db'), buf)
            added = true
          } catch {}
        }
        if (!added) {
          try { fs.copyFileSync(dbPath, tmpDb); if (fs.existsSync(tmpDb)) { zip.addLocalFile(tmpDb, 'db', 'dev.db'); added = true } } catch {}
        }
        try { if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb) } catch {}
        if (!added) slog('add db to zip failed: no method succeeded')
      }
    } catch (e) { slog(`add db to zip failed: ${e && e.message ? e.message : String(e)}`) }
    try { if (fs.existsSync(uploadsDir)) zip.addLocalFolder(uploadsDir, 'uploads') } catch (e) { slog(`add uploads to zip failed: ${e && e.message ? e.message : String(e)}`) }
    const buf = zip.toBuffer()
    const d = new Date()
    const pad = (n) => String(n).padStart(2,'0')
    const name = `zsk-backup-${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.zip`
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`)
    res.end(buf)
  } catch (e) {
    console.error('backup error:', e)
    res.status(500).json({ message: 'backup failed' })
  }
})

app.post('/api/admin/restore', requireAuth, async (req, res) => {
  try {
    const { zipBase64 } = req.body || {}
    if (!zipBase64 || typeof zipBase64 !== 'string') return res.status(400).json({ message: 'invalid payload' })
    const buf = Buffer.from(zipBase64, 'base64')
    const zip = new AdmZip(buf)
    const dbPath = resolveDbPath()
    const uploadsDir = process.env.ZSK_UPLOADS_DIR || path.join(__dirname, 'uploads')
    try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }) } catch {}
    try { fs.mkdirSync(uploadsDir, { recursive: true }) } catch {}
    const entries = zip.getEntries()
    for (const e of entries) {
      const name = e.entryName
      if (name === 'db/dev.db' || name.startsWith('db/')) {
        fs.writeFileSync(dbPath, e.getData())
      } else if (name.startsWith('uploads/')) {
        const rel = name.slice('uploads/'.length)
        const out = path.join(uploadsDir, rel)
        const dir = path.dirname(out)
        try { fs.mkdirSync(dir, { recursive: true }) } catch {}
        if (!name.endsWith('/')) fs.writeFileSync(out, e.getData())
      }
    }
    res.json({ ok: true, restartRecommended: true })
  } catch (e) {
    console.error('restore error:', e)
    res.status(500).json({ message: 'restore failed' })
  }
})

app.post('/api/admin/bootstrap', requireAuth, async (req, res) => {
  try {
    const exists = await prisma.user.findFirst({ where: { role: 'admin' } })
    if (exists) return res.status(409).json({ message: 'admin exists' })
    await prisma.user.update({ where: { id: req.user.id }, data: { role: 'admin' } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ message: 'bootstrap failed' })
  }
})
process.on('unhandledRejection', (e) => { slog(`unhandled ${e && e.message ? e.message : e}`) })
