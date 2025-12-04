<template>
  <div class="doc-view" v-loading="loading">
    <div class="breadcrumb">
      <el-breadcrumb separator="/">
        <el-breadcrumb-item @click="toDashboard" style="cursor:pointer;">仪表板</el-breadcrumb-item>
        <el-breadcrumb-item @click="back" style="cursor:pointer;">文档管理</el-breadcrumb-item>
        <el-breadcrumb-item>
          {{ doc?.title || '查看' }}
          <span v-if="doc?.alias" class="alias">（{{ doc.alias }}）</span>
        </el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <el-card>
      <template #header>
        <div class="header">
          <div class="title">
            {{ doc?.title || '未找到文档' }}
            <span v-if="doc?.alias" class="alias">（{{ doc.alias }}）</span>
          </div>
          <div class="meta">
            <el-tag v-if="doc?.category" type="success" size="small">{{ doc.category }}</el-tag>
            <el-tag v-for="t in doc?.tags || []" :key="t" size="small">{{ t }}</el-tag>
            <span class="updated" v-if="doc?.updatedAt">更新：{{ formatTs(doc.updatedAt) }}</span>
          </div>
          <div class="actions">
            <el-button @click="back">返回列表</el-button>
            <el-button type="primary" @click="edit">编辑</el-button>
            <el-button @click="exportHtml" type="success">导出 HTML</el-button>
            <el-button @click="exportPdf" type="warning">导出 PDF</el-button>
          </div>
        </div>
      </template>

      <template v-if="availableTabs.length">
        <el-tabs v-model="tab" type="border-card">
          <el-tab-pane v-if="hasRich" label="富文本" name="rich">
            <div class="rich" v-html="richHtml"></div>
          </el-tab-pane>
          <el-tab-pane v-if="hasMd" label="Markdown" name="md">
            <div class="md" ref="mdRef" v-html="mdHtml"></div>
          </el-tab-pane>
          <el-tab-pane v-if="hasBlocks" label="块" name="blocks">
            <div class="blocks" @click="onBlocksClick">
              <div v-for="b in doc?.blocks || []" :key="b.key" class="block">
                <component :is="renderBlock(b)" :content="normalizeBlockContent(b)" />
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane v-if="hasCode" label="代码" name="code">
            <pre class="code"><code v-html="codeHtml"></code></pre>
          </el-tab-pane>
        </el-tabs>
      </template>
      <el-empty v-else description="暂无内容" />
    </el-card>
    <div v-if="lightbox.open" class="lightbox" @click.self="closeLightbox">
      <div class="lightbox-toolbar">
        <el-button size="small" @click="prevImg">上一张</el-button>
        <el-button size="small" @click="nextImg">下一张</el-button>
        <el-button size="small" @click="zoomIn">放大</el-button>
        <el-button size="small" @click="zoomOut">缩小</el-button>
        <el-button size="small" @click="resetZoom">重置</el-button>
        <el-button size="small" @click="closeLightbox">关闭</el-button>
      </div>
      <img :src="lightbox.images[lightbox.index]" :style="{ transform: `scale(${lightbox.scale})` }" @wheel.prevent="onWheelZoom" />
    </div>
  </div>
  
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useDocumentsStore } from '../store/documents.js'
import { marked } from 'marked'
import hljs from 'highlight.js'
// 让 Quill 在查看页也能正确渲染字体、字号、对齐等样式
/* Quill 样式已在全局 main.js 引入，这里无需重复加载 */

const route = useRoute()
const router = useRouter()
const store = useDocumentsStore()
const loading = ref(true)
const tab = ref('rich')
const doc = ref(null)
const mdRef = ref(null)
const lightbox = ref({ open:false, images:[], index:0, scale:1 })
function getOrigin(){
  const w = typeof window !== 'undefined' ? window : {}
  const z = w.ZSK || {}
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
  return (w.ZSK_SERVER_ORIGIN || z.SERVER_ORIGIN || env.VITE_API_BASE || 'http://localhost:3000')
}
function toAbsSrc(src){
  const s = String(src || '')
  if (!s) return s
  if (/^https?:\/\//i.test(s)) return s
  if (/^data:/i.test(s)) return s
  const m = s.match(/^https?:\/\/(?:localhost|127\.0\.0\.1)(:\d+)?(\/uploads\/.*)$/i)
  if (m) return `${getOrigin()}${m[2]}`
  if (s.startsWith('/uploads/')) return `${getOrigin()}${s}`
  if (s.startsWith('uploads/')) return `${getOrigin()}/${s}`
  return s
}
function rewriteImgSrc(html){
  const h = String(html || '')
  return h.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (m, p1) => m.replace(p1, toAbsSrc(p1)))
}

onMounted(async () => {
  await store.load()
  const key = route.params.id
  doc.value = store.byId(key) || (store.docs || []).find(d => d.alias === key)
  if (!doc.value) {
    try { await store.load(); doc.value = store.byId(key) || (store.docs || []).find(d => d.alias === key) } catch {}
  }
  loading.value = false
  await nextTick()
  // 默认切换到第一个有内容的页签
  const first = availableTabs.value[0]
  if (first) tab.value = first
  // Markdown 图片轻量放大：事件委托
  if (mdRef.value){
    mdRef.value.addEventListener('click', (e) => {
      const target = e.target
      if (target && target.tagName === 'IMG'){
        openLightbox(target.src)
      }
    })
  }
})

const mdHtml = computed(() => rewriteImgSrc(marked.parse(doc.value?.markdown || '')))
const richHtml = computed(() => rewriteImgSrc(doc.value?.richText || ''))
const codeHtml = computed(() => hljs.highlight(doc.value?.code?.value || '', { language: doc.value?.code?.language || 'plaintext' }).value)

function stripHtml(html){
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}
const hasRich = computed(() => {
  const rich = doc.value?.richText || ''
  const text = stripHtml(rich)
  const hasImg = /<img\s/i.test(rich) || /<figure[^>]*zsk-image/i.test(rich)
  return !!(text || hasImg)
})
const hasMd = computed(() => !!(doc.value?.markdown || '').trim())
const hasBlocks = computed(() => Array.isArray(doc.value?.blocks) && doc.value.blocks.length > 0)
const hasCode = computed(() => !!(doc.value?.code?.value || '').trim())
const availableTabs = computed(() => {
  const list = []
  if (hasRich.value) list.push('rich')
  if (hasMd.value) list.push('md')
  if (hasBlocks.value) list.push('blocks')
  if (hasCode.value) list.push('code')
  return list
})

function back(){ router.push('/documents') }
function toDashboard(){ router.push('/') }
function edit(){ if (doc.value) router.push(`/editor/${doc.value.id}`) }

function renderBlock(b){
  switch(b.type){
    case 'heading': return { props:['content'], template:`<h3>{{ content }}</h3>` }
    case 'quote': return { props:['content'], template:`<blockquote>{{ content }}</blockquote>` }
    case 'code': return { props:['content'], template:`<ol class='code-lines'><li v-for='(line,i) in content.split("\\n")' :key='i'>{{ line }}</li></ol>` }
    case 'image': return { props:['content'], template:`<figure class="zsk-image" :class="'align-' + ((content && content.align) || 'center')"><img :src="(content && content.url)" :style="(content && content.width ? ('width:' + content.width) : '')" /><figcaption v-if="content && content.caption">{{ content.caption }}</figcaption></figure>` }
    case 'todo': return { props:['content'], template:`<ul><li v-for="(it,i) in content" :key="i"><el-checkbox :model-value="!!it.done" disabled /> {{ it.text }}</li></ul>` }
    case 'table': return { props:['content'], template:`<table class='zsk-table'><tr v-for="(r,ri) in content.rows" :key="ri"><td v-for="(c,ci) in content.cols" :key="ci">{{ content.data?.[ri]?.[ci] || '' }}</td></tr></table>` }
    default: return { props:['content'], template:`<p>{{ content }}</p>` }
  }
}

function normalizeBlockContent(b){
  if (!b) return ''
  if (b.type === 'image'){
    const c = (b.content && typeof b.content === 'object') ? b.content : { url: b.content || '' }
    const u = toAbsSrc(c.url || '')
    return { ...c, url: u }
  }
  return b.content
}

function buildHtml(){
  const title = (doc.value?.title || '')
  const rich = (doc.value?.richText || '')
  const md = marked.parse(doc.value?.markdown || '')
  const code = hljs.highlight(doc.value?.code?.value || '', { language: doc.value?.code?.language || 'plaintext' }).value
  const blocksHtml = (doc.value?.blocks || []).map(b => {
    if (b.type === 'heading') return `<h3>${(b.content || '')}</h3>`
    if (b.type === 'quote') return `<blockquote>${(b.content || '')}</blockquote>`
    if (b.type === 'image') {
      const c = b.content || {}
      const cls = ['zsk-image', c.align && `align-${c.align}`].filter(Boolean).join(' ')
      const imgStyle = c.width ? `style=\"width:${String(c.width)};\"` : ''
      const cap = c.caption ? `<figcaption>${String(c.caption)}</figcaption>` : ''
      return `<figure class=\"${cls}\"><img src=\"${toAbsSrc(String(c.url || ''))}\" ${imgStyle} />${cap}</figure>`
    }
    if (b.type === 'list') return `<ul>${((b.items || [])).map(i => `<li>${i}</li>`).join('')}</ul>`
    if (b.type === 'code') return `<pre><code>${(b.content || '')}</code></pre>`
    return `<p>${(b.content || '')}</p>`
  }).join('')
  const body = [rich, md, blocksHtml, code ? `<pre><code class="hljs">${code}</code></pre>` : ''].join('\n')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css" /></head><body><h1>${title}</h1>${body}</body></html>`
  return html
}

function exportHtml(){
  const html = buildHtml()
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${doc.value?.title || 'document'}.html`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPdf(){
  const html = buildHtml()
  const fn = (doc.value?.title || 'document').replace(/[\\/:*?"<>|]+/g,'_')
  if (window.ZSK && typeof window.ZSK.printToPDF === 'function') {
    try {
      const res = await window.ZSK.printToPDF(html, `${fn}.pdf`)
      if (res && res.ok) ElMessage.success('已导出 PDF')
      else ElMessage.error('导出 PDF 取消或失败')
    } catch (e) {
      ElMessage.error('导出 PDF 失败')
    }
    return
  }
  const w = window.open('', '_blank')
  if (!w) return
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => { try { w.print(); w.close() } catch {} }, 300)
}

function formatTs(ts){
  if (!ts) return '—'
  if (typeof ts === 'string' && ts.includes('T')){
    const d = new Date(ts)
    if (isNaN(d.getTime())) return ts
    const pad = (n) => String(n).padStart(2, '0')
    const y = d.getFullYear()
    const m = pad(d.getMonth() + 1)
    const day = pad(d.getDate())
    const hh = pad(d.getHours())
    const mm = pad(d.getMinutes())
    const ss = pad(d.getSeconds())
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`
  }
  return ts
}
</script>

<style scoped>
/* 恢复为全宽显示，避免固定最大宽度限制 */
.doc-view :deep(.el-card) { margin: 0 auto; }
.breadcrumb { margin-bottom: 8px; }
.header { display:grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; }
.title { font-size: 20px; font-weight: 700; letter-spacing: 0.3px; }
.alias { margin-left: 8px; font-size: 12px; font-weight: 400; color: var(--el-text-color-secondary); }
.meta { display:flex; gap: 6px; align-items:center; color: var(--el-text-color-secondary); }
.updated { margin-left: 8px; font-size: 12px; }
.actions { display:flex; gap: 8px; }
.rich, .md { padding: 12px; border:1px solid var(--el-border-color); background: var(--el-color-info-light-9); border-radius: 6px; }
.rich :deep(p) { line-height: 1.7; margin: 8px 0; }
/* 显式支持 Quill 字号与字体类，以确保查看页与编辑器一致 */
.rich :deep(.ql-size-small) { font-size: 0.75em; }
.rich :deep(.ql-size-large) { font-size: 1.5em; }
.rich :deep(.ql-size-huge) { font-size: 2.5em; }
.rich :deep(.ql-font-serif) { font-family: Georgia, "Times New Roman", serif; }
.rich :deep(.ql-font-monospace) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
/* Quill 对齐与缩进样式 */
.rich :deep(.ql-align-center) { text-align: center; }
.rich :deep(.ql-align-right) { text-align: right; }
.rich :deep(.ql-align-justify) { text-align: justify; }
.rich :deep(.ql-indent-1) { padding-left: 3em; }
.rich :deep(.ql-indent-2) { padding-left: 6em; }
.rich :deep(.ql-indent-3) { padding-left: 9em; }
.rich :deep(.ql-indent-4) { padding-left: 12em; }
.rich :deep(.ql-indent-5) { padding-left: 15em; }
.blocks { display:flex; flex-direction: column; gap: 8px; }
.block { border:1px dashed var(--el-border-color); padding: 8px; border-radius: 6px; }
.code { padding: 10px; border:1px solid var(--el-border-color); background: #0f172a; color: #e2e8f0; overflow:auto; border-radius: 6px; }

/* Markdown 样式优化 */
.md :deep(h1), .md :deep(h2), .md :deep(h3) { margin: 10px 0 6px; font-weight: 700; }
.md :deep(p) { line-height: 1.7; margin: 8px 0; }
.md :deep(ul), .md :deep(ol) { padding-left: 20px; }
.md :deep(blockquote) { border-left: 3px solid var(--el-border-color); margin: 8px 0; padding-left: 10px; color: var(--el-text-color-secondary); }
.md :deep(img) { max-width: 100%; border-radius: 6px; }
/* 图片尺寸保护，避免溢出浏览器视窗 */
.rich :deep(img) { max-width: 100%; height: auto; }
.rich :deep(.zsk-image img) { max-width: 100%; height: auto; }
.blocks :deep(img) { max-width: 100%; height: auto; }
.blocks :deep(.zsk-image img) { max-width: 100%; height: auto; }

/* 块页签微样式 */
.blocks :deep(blockquote) { background: var(--el-fill-color-light); border-left: 3px solid var(--el-color-primary); padding-left: 10px; }
.code-lines { counter-reset: line; list-style: none; padding-left: 0; margin: 0; background: #0f172a; color: #e2e8f0; border-radius: 6px; }
.code-lines li { counter-increment: line; display:flex; gap: 10px; }
.code-lines li::before { content: counter(line); display:inline-block; width: 2em; text-align: right; color: #64748b; padding-right: 6px; border-right: 1px solid #334155; }

/* 轻量 Lightbox */
.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index: 1000; flex-direction: column; gap: 12px; }
.lightbox img { max-width: 90%; max-height: 80%; box-shadow: 0 8px 24px rgba(0,0,0,0.6); border-radius: 8px; transition: transform .2s ease; }
.lightbox-toolbar { display:flex; gap: 8px; }
/* 图片（figure）显示：尺寸、对齐、标题，与编辑器保持一致 */
.rich :deep(.zsk-image) { display:block; }
.rich :deep(.zsk-image.align-center) { margin-left:auto; margin-right:auto; }
.rich :deep(.zsk-image.align-right) { margin-left:auto; }
.rich :deep(.zsk-image figcaption) { font-size:12px; color: var(--el-text-color-secondary); text-align:center; margin-top:4px; }
</style>
function collectImages(){
  const imgs = []
  const richImgs = Array.from(document.querySelectorAll('.rich img'))
  richImgs.forEach(img => imgs.push(img.src))
  const mdImgs = mdRef.value ? Array.from(mdRef.value.querySelectorAll('img')) : []
  mdImgs.forEach(img => imgs.push(img.src))
  const blockImgs = Array.from(document.querySelectorAll('.blocks img'))
  blockImgs.forEach(img => imgs.push(img.src))
  return imgs
}
function openLightbox(src){
  const images = collectImages()
  const idx = Math.max(0, images.indexOf(src))
  lightbox.value = { open:true, images, index: idx, scale: 1 }
}
function closeLightbox(){ lightbox.value.open = false }
function prevImg(){ if (!lightbox.value.open) return; lightbox.value.index = (lightbox.value.index - 1 + lightbox.value.images.length) % lightbox.value.images.length }
function nextImg(){ if (!lightbox.value.open) return; lightbox.value.index = (lightbox.value.index + 1) % lightbox.value.images.length }
function zoomIn(){ lightbox.value.scale = Math.min(lightbox.value.scale + 0.1, 4) }
function zoomOut(){ lightbox.value.scale = Math.max(lightbox.value.scale - 0.1, 0.2) }
function resetZoom(){ lightbox.value.scale = 1 }
function onWheelZoom(e){ if (e.deltaY < 0) zoomIn(); else zoomOut() }