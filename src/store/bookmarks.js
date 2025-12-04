import { defineStore } from 'pinia'
import { api } from '../services/api.js'

const STORAGE_KEY = 'zsk_bookmarks_v1'

function nowTs(){
  const d = new Date()
  const pad = (n) => String(n).padStart(2,'0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function dayPrefix(){ const d = new Date(); const pad = (n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` }
function nextSeq(items){ const prefix = dayPrefix(); let max = 0; (items||[]).forEach(b=>{ const id = String(b.id||''); if (id.startsWith(prefix)){ const n = parseInt(id.slice(prefix.length),10); if(!isNaN(n)) max = Math.max(max, n) } }); return max+1 }
function genId(items){ return `${dayPrefix()}${String(nextSeq(items)).padStart(2,'0')}` }

export const useBookmarksStore = defineStore('bookmarks', {
  state: () => ({ bookmarks: [], loaded: false }),
  getters: {
    count(state){ return Array.isArray(state.bookmarks) ? state.bookmarks.length : 0 },
    allGroups(state){
      const arr = Array.isArray(state.bookmarks) ? state.bookmarks : []
      const set = new Set(arr.map(b => b && b.group).filter(Boolean))
      return Array.from(set).sort()
    },
    allTags(state){
      const arr = Array.isArray(state.bookmarks) ? state.bookmarks : []
      const set = new Set()
      for (const b of arr){
        const tags = Array.isArray(b?.tags) ? b.tags : []
        for (const t of tags){ if (t) set.add(t) }
      }
      return Array.from(set).sort()
    }
  },
  actions: {
    async load(){
      if (this.loaded) return
      try { this.bookmarks = await api.bookmarksList() } 
      catch {
        try { const raw = localStorage.getItem(STORAGE_KEY); this.bookmarks = raw ? JSON.parse(raw) : [] } catch { this.bookmarks = [] }
      }
      this.loaded = true
    },
    persist(){ try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.bookmarks)) } catch {} },
    async add({ url, title='', group='', tags=[] }){
      const key = String(url || '').trim().toLowerCase()
      const dup = (this.bookmarks || []).some(b => String(b.url || '').trim().toLowerCase() === key)
      const payload = { url, title, group, tags }
      try {
        const created = await api.bookmarksCreate(payload)
        this.bookmarks.unshift(created)
        return created
      } catch (e) {
        if (dup) return { duplicate: true }
        const created = { id: genId(this.bookmarks), url, title, group, tags: Array.isArray(tags)?tags:[], createdAt: nowTs() }
        this.bookmarks.unshift(created)
        this.persist()
        return created
      }
    },
    async remove(id){
      try { await api.bookmarksDelete(id) } catch {}
      this.bookmarks = (this.bookmarks || []).filter(b => b.id !== id)
      this.persist()
    },
    async update(id, patch){
      const idx = (this.bookmarks || []).findIndex(b => b.id === id)
      if (idx === -1) return
      try {
        const updated = await api.bookmarksUpdate(id, patch)
        this.bookmarks[idx] = updated
        return updated
      } catch {
        const updated = { ...this.bookmarks[idx], ...patch }
        this.bookmarks[idx] = updated
        this.persist()
        return updated
      }
    },
    async import(list){
      try {
        await api.bookmarksImport(Array.isArray(list) ? list : [])
        this.bookmarks = await api.bookmarksList()
      } catch {
        const arr = Array.isArray(list) ? list : []
        const prefixSet = new Set((this.bookmarks || []).map(b => String(b.url || '').trim().toLowerCase()))
        const toAdd = []
        let temp = [...(this.bookmarks || [])]
        for (const it of arr){
          const url = (it?.url || '').trim()
          if (!url) continue
          const key = url.toLowerCase()
          if (prefixSet.has(key)) continue
          prefixSet.add(key)
          toAdd.push({ id: genId(temp), url, title: it?.title || '', group: it?.group || '', tags: Array.isArray(it?.tags)?it.tags:[], createdAt: nowTs() })
          temp.unshift(toAdd[toAdd.length-1])
        }
        this.bookmarks = [...toAdd, ...(this.bookmarks || [])]
        this.persist()
        return { count: toAdd.length }
      }
    },
    async export(){
      try { return await api.bookmarksExport() } catch { return (this.bookmarks || []) }
    }
  }
})