import { defineStore } from 'pinia'
import { api } from '../services/api.js'
import { marked } from 'marked'
import hljs from 'highlight.js'

const STORAGE_KEY = 'zsk_documents_v1'

function nowTs() { return new Date().toISOString() }

function dayPrefix(){
  const d = new Date()
  const pad = (n) => String(n).padStart(2,'0')
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`
}
function nextSeq(docs){
  const prefix = dayPrefix()
  let max = 0
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
function genId(docs){ return `${dayPrefix()}${String(nextSeq(docs)).padStart(2,'0')}` }

export const useDocumentsStore = defineStore('documents', {
  state: () => ({
    docs: [],
    loaded: false,
    search: '',
    tagFilter: [],
    selectedIds: []
  }),
  getters: {
    allTags(state) {
      const set = new Set()
      state.docs.forEach(d => (d.tags || []).forEach(t => set.add(t)))
      return Array.from(set)
    },
    filtered(state) {
      let list = state.docs
      if (state.search) {
        const s = state.search.toLowerCase()
        list = list.filter(d =>
          d.title.toLowerCase().includes(s) ||
          (d.markdown || '').toLowerCase().includes(s)
        )
      }
      if (state.tagFilter && state.tagFilter.length) {
        // 支持手动输入的模糊匹配：每个筛选词需被文档某个标签包含
        list = list.filter(d => state.tagFilter.every(t => (d.tags || []).some(dt => String(dt).includes(t))))
      }
      return list.sort((a,b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''))
    },
    byId: (state) => (id) => state.docs.find(d => d.id === id)
  },
  actions: {
    async load() {
      if (this.loaded) return
      try {
        this.docs = await api.list()
      } catch {
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          this.docs = raw ? JSON.parse(raw) : []
        } catch { this.docs = [] }
      }
      this.loaded = true
    },
    persist() {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.docs)) } catch {}
    },
    async createDoc(payload = {}) {
      try {
        const doc = await api.create(payload)
        this.docs.unshift(doc)
        return doc
      } catch {
        const id = genId(this.docs)
        const doc = {
          id,
          title: payload.title || '未命名文档',
          alias: payload.alias || '',
          tags: payload.tags || [],
          richText: payload.richText || '',
          markdown: payload.markdown || '',
          blocks: payload.blocks || [],
          code: payload.code || { language: 'javascript', value: '' },
          createdAt: nowTs(),
          updatedAt: nowTs()
        }
        this.docs.unshift(doc)
        this.persist()
        return doc
      }
    },
    async updateDoc(id, patch) {
      const idx = this.docs.findIndex(d => d.id === id)
      if (idx === -1) return
      try {
        const updated = await api.update(id, patch)
        this.docs[idx] = updated
        return updated
      } catch {
        const updated = { ...this.docs[idx], ...patch, updatedAt: nowTs() }
        this.docs[idx] = updated
        this.persist()
        return updated
      }
    },
    async deleteDoc(id) {
      try { await api.remove(id) } catch {}
      this.docs = this.docs.filter(d => d.id !== id)
      this.persist()
    },
    async copyDoc(id) {
      try {
        const copy = await api.copy(id)
        this.docs.unshift(copy)
        return copy
      } catch {
        const doc = this.byId(id)
        if (!doc) return
        const copy = { ...doc, id: genId(this.docs), alias: '', title: doc.title + ' - 副本', createdAt: nowTs(), updatedAt: nowTs() }
        this.docs.unshift(copy)
        this.persist()
        return copy
      }
    },
    async batchDelete(ids) {
      try { await api.batchDelete(ids) } catch {}
      const set = new Set(ids)
      this.docs = this.docs.filter(d => !set.has(d.id))
      this.selectedIds = []
      this.persist()
    },
    exportDocs(ids) {
      const list = this.docs.filter(d => ids.includes(d.id))
      const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `documents_${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    },
    exportDocsHtml(ids) {
      const list = this.docs.filter(d => ids.includes(d.id))
      const items = list.map(d => {
        const title = d.title || ''
        const rich = d.richText || ''
        const md = marked.parse(d.markdown || '')
        const codeVal = d.code?.value || ''
        const codeLang = d.code?.language || 'plaintext'
        const code = codeVal ? hljs.highlight(codeVal, { language: codeLang }).value : ''
        const blocksHtml = (Array.isArray(d.blocks) ? d.blocks : []).map(b => {
          if (b.type === 'heading') return `<h3>${b.content || ''}</h3>`
          if (b.type === 'quote') return `<blockquote>${b.content || ''}</blockquote>`
          if (b.type === 'image') return `<figure class="zsk-image"><img src="${b.url || ''}" /></figure>`
          if (b.type === 'list') return `<ul>${((b.items || [])).map(i => `<li>${i}</li>`).join('')}</ul>`
          if (b.type === 'code') return `<pre><code>${b.content || ''}</code></pre>`
          return `<p>${b.content || ''}</p>`
        }).join('')
        const body = [rich, md, blocksHtml, code ? `<pre><code class="hljs">${code}</code></pre>` : ''].join('\n')
        return `<article><h1>${title}</h1>${body}</article>`
      }).join('\n<hr/>\n')
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>导出文档</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css" /></head><body>${items}</body></html>`
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `documents_${Date.now()}.html`
      a.click()
      URL.revokeObjectURL(url)
    },
    async exportDocsPdf(ids) {
      const list = this.docs.filter(d => ids.includes(d.id))
      const items = list.map(d => {
        const title = d.title || ''
        const rich = d.richText || ''
        const md = marked.parse(d.markdown || '')
        const codeVal = d.code?.value || ''
        const codeLang = d.code?.language || 'plaintext'
        const code = codeVal ? hljs.highlight(codeVal, { language: codeLang }).value : ''
        const blocksHtml = (Array.isArray(d.blocks) ? d.blocks : []).map(b => {
          if (b.type === 'heading') return `<h3>${b.content || ''}</h3>`
          if (b.type === 'quote') return `<blockquote>${b.content || ''}</blockquote>`
          if (b.type === 'image') return `<figure class="zsk-image"><img src="${b.url || ''}" /></figure>`
          if (b.type === 'list') return `<ul>${((b.items || [])).map(i => `<li>${i}</li>`).join('')}</ul>`
          if (b.type === 'code') return `<pre><code>${b.content || ''}</code></pre>`
          return `<p>${b.content || ''}</p>`
        }).join('')
        const body = [rich, md, blocksHtml, code ? `<pre><code class="hljs">${code}</code></pre>` : ''].join('\n')
        return `<article style="page-break-after:always"><h1>${title}</h1>${body}</article>`
      }).join('\n')
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>导出文档</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css" /><style>article{margin:24px auto; max-width:800px;} h1{font-size:20px;}</style></head><body>${items}</body></html>`
      const fn = `documents_${Date.now()}.pdf`
      if (window.ZSK && typeof window.ZSK.printToPDF === 'function') {
        await window.ZSK.printToPDF(html, fn)
        return
      }
      const w = window.open('', '_blank')
      if (!w) return
      w.document.open()
      w.document.write(html)
      w.document.close()
      w.focus()
      setTimeout(() => { try { w.print(); w.close() } catch {} }, 300)
    },
    async importFromJson(fileList) {
      try {
        const res = await api.importJson(fileList)
        await this.load()
        return res
      } catch {
        let seqBase = nextSeq(this.docs)
        const prefix = dayPrefix()
        const normalized = (fileList || []).map(d => ({
          id: `${prefix}${String(seqBase++).padStart(2,'0')}`,
          title: d.title || '导入文档',
          alias: d.alias || '',
          tags: d.tags || [], richText: d.richText || '', markdown: d.markdown || '',
          blocks: d.blocks || [], code: d.code || { language: 'javascript', value: '' },
          createdAt: nowTs(), updatedAt: nowTs()
        }))
        this.docs = [...normalized, ...this.docs]
        this.persist()
        return { count: normalized.length }
      }
    },
    async importMarkdown(title, markdown, tags=[]) {
      try {
        const doc = await api.importMarkdown(title, markdown, tags)
        this.docs.unshift(doc)
        return doc
      } catch {
        const doc = {
          id: genId(this.docs), title: title || '导入Markdown', tags,
          alias: '',
          richText: '', markdown, blocks: [], code: { language: 'markdown', value: markdown },
          createdAt: nowTs(), updatedAt: nowTs()
        }
        this.docs.unshift(doc)
        this.persist()
        return doc
      }
    }
  }
})