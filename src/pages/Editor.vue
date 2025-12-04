<template>
  <div class="editor-page" v-loading="loading">
    <el-card>
      <template #header>
        <div class="header">
          <el-input v-model="title" placeholder="输入标题" class="title-input" />
          <el-input v-model="alias" placeholder="标题别名（字母、数字、短横线）" class="alias-input" />
          <el-select v-model="category" placeholder="选择或创建分类" class="category-select" filterable allow-create default-first-option>
            <el-option v-for="c in allCategories" :key="c" :label="c" :value="c" />
          </el-select>
          <el-select v-model="tags" multiple placeholder="添加标签" class="tags-select" filterable allow-create>
            <el-option v-for="t in allTags" :key="t" :label="t" :value="t" />
          </el-select>
          <div class="row-actions">
            <el-button type="primary" @click="save">保存</el-button>
            <span class="save-hint" v-if="lastSavedAt">已自动保存 {{ savedTimeLabel }}</span>
          </div>
        </div>
      </template>

      <el-tabs v-model="tab" type="border-card">
        <el-tab-pane label="富文本" name="rich">
          <div class="toolbar-row">
            <div class="toolbar" ref="quillToolbar"></div>
            <div class="toolbar-status">字数：{{ richCharCount }}</div>
          </div>
          <div class="rich" ref="quillContainer"></div>
        </el-tab-pane>
        <el-tab-pane label="Markdown" name="md">
          <div class="split">
            <textarea v-model="markdown" class="md-input" placeholder="在此输入 Markdown"></textarea>
            <div class="md-preview" v-html="mdHtml"></div>
          </div>
        </el-tab-pane>
        <el-tab-pane label="块编辑器" name="blocks">
          <div class="block-toolbar">
            <el-button size="small" @click="addBlock('paragraph')">段落</el-button>
            <el-button size="small" @click="addBlock('heading')">标题</el-button>
            <el-button size="small" @click="addBlock('quote')">引用</el-button>
            <el-button size="small" @click="addBlock('code')">代码块</el-button>
            <el-button size="small" @click="addBlock('image')">图片</el-button>
            <el-button size="small" @click="addBlock('todo')">待办</el-button>
            <el-button size="small" @click="addBlock('table')">表格</el-button>
          </div>
          <draggable v-model="blocks" item-key="key" class="blocks" handle=".drag">
            <template #item="{ element, index }">
              <div class="block">
                <div class="drag">⋮⋮</div>
                <component :is="blockComponent(element)" v-model="element.content" />
                <el-button text type="danger" @click="removeBlock(index)">删除</el-button>
              </div>
            </template>
          </draggable>
        </el-tab-pane>
        <el-tab-pane label="代码" name="code">
          <div class="code-toolbar">
            <div class="code-hint">当前语言：{{ displayLang }} ｜ </div>
            <el-select v-model="code.language" style="max-width:220px;">
              <el-option label="JavaScript" value="javascript" />
              <el-option label="TypeScript" value="typescript" />
              <el-option label="Python" value="python" />
              <el-option label="HTML" value="html" />
              <el-option label="CSS" value="css" />
              <el-option label="JSON" value="json" />
              <el-option label="Java" value="java" />
              <el-option label="Go" value="go" />
              <el-option label="C" value="c" />
              <el-option label="C++" value="cpp" />
              <el-option label="YAML" value="yaml" />
            </el-select>
            <div class="code-hint">当前主题：{{ themeLabel }} ｜</div>
            <el-select v-model="codeTheme" style="max-width:160px;">
              <el-option label="浅色" value="vs" />
              <el-option label="深色" value="vs-dark" />
            </el-select>
          </div>
          <div class="monaco" ref="monacoEl">
            <div v-show="codePlaceholderVisible && tab==='code'" :class="['code-placeholder', { hidden: !codePlaceholderVisible }]">请输入代码...</div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDocumentsStore } from '../store/documents.js'
import draggable from 'vuedraggable'
import { marked } from 'marked'
import hljs from 'highlight.js'
import { ElMessage } from 'element-plus'
import { api } from '../services/api.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

const route = useRoute()
const router = useRouter()
const store = useDocumentsStore()
const loading = ref(true)
const currentId = ref(route.params.id)
const lastSavedAt = ref('')
const savedTimeLabel = computed(() => {
  if (!lastSavedAt.value) return ''
  const d = new Date(lastSavedAt.value)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
})

const title = ref('未命名文档')
const alias = ref('')
const category = ref('')
const tags = ref([])
const allTags = computed(() => store.allTags)
const apiCategories = ref([])
const allCategories = computed(() => {
  const fromDocs = Array.from(new Set((store.docs || []).map(d => d.category).filter(Boolean)))
  const merged = Array.from(new Set([...(apiCategories.value || []), ...fromDocs]))
  return merged.filter(Boolean).sort()
})
const tab = ref('rich')

// 富文本（Quill）
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
const quillContainer = ref(null)
const quillToolbar = ref(null)
let quill
const richText = ref('')
const richCharCount = computed(() => stripHtml(richText.value).length)

// Markdown（Marked）
marked.setOptions({
  highlight: (code, lang) => {
    try { return hljs.highlight(code, { language: lang || 'plaintext' }).value } catch { return code }
  }
})
const markdown = ref('')
const mdHtml = computed(() => marked.parse(markdown.value || ''))

// 块编辑器（vuedraggable）
const blocks = ref([])
function addBlock(type){
  const key = Math.random().toString(36).slice(2)
  if (type === 'image') {
    blocks.value.push({ key, type, content: { url: '', width: '', align: 'center', caption: '' } })
  } else {
    blocks.value.push({ key, type, content: '' })
  }
}
function removeBlock(index){ blocks.value.splice(index, 1) }
function blockComponent(b){
  switch(b.type){
    case 'heading': return HeadingBlock
    case 'quote': return QuoteBlock
    case 'code': return CodeBlock
    case 'image': return ImageBlock
    case 'todo': return TodoBlock
    case 'table': return TableBlock
    default: return ParagraphBlock
  }
}

// 代码编辑器（Monaco）
let monaco
const monacoEl = ref(null)
const code = ref({ language: 'javascript', value: '' })
const codeTheme = ref('vs')
let monacoEditor
const codePlaceholderVisible = ref(true)

// 初始化文档数据
onMounted(async () => {
  store.load()
  // 加载后端分类列表（包含未在文档中使用的分类）
  try { apiCategories.value = await api.categories() } catch {}
  const doc = currentId.value ? store.byId(currentId.value) : null
  if (doc) {
    title.value = doc.title
    alias.value = doc.alias || ''
    category.value = doc.category || ''
    tags.value = doc.tags || []
    richText.value = doc.richText || ''
    markdown.value = doc.markdown || ''
    blocks.value = Array.isArray(doc.blocks) ? doc.blocks : []
    code.value = doc.code || { language: 'javascript', value: '' }
  } else if (currentId.value) {
    // 路由参数存在但找不到对应文档（例如 /editor/new 或无效ID）
    // 视为新建文档场景，清空 currentId 以确保保存走“创建”分支
    currentId.value = undefined
  }
  await nextTick()

  // init Quill
  quillToolbar.value.innerHTML = `
    <span class="ql-formats">
      <select class="ql-font">
        <option selected>默认</option>
        <option value="serif">衬线</option>
        <option value="monospace">等宽</option>
      </select>
      <select class="ql-size">
        <option value="small">小</option>
        <option selected>常规</option>
        <option value="large">大</option>
        <option value="huge">特大</option>
      </select>
    </span>
    <span class="ql-formats">
      <select class="ql-header">
        <option selected>正文</option>
        <option value="1">标题 1</option>
        <option value="2">标题 2</option>
        <option value="3">标题 3</option>
      </select>
      <button class="ql-bold"></button>
      <button class="ql-italic"></button>
      <button class="ql-underline"></button>
      <button class="ql-strike"></button>
    </span>
    <span class="ql-formats">
      <button class="ql-list" value="ordered"></button>
      <button class="ql-list" value="bullet"></button>
      <button class="ql-indent" value="-1"></button>
      <button class="ql-indent" value="+1"></button>
      <select class="ql-align"></select>
    </span>
    <span class="ql-formats">
      <button class="ql-blockquote"></button>
      <button class="ql-code-block"></button>
      <button class="ql-link"></button>
      <button class="ql-image"></button>
      <button class="ql-video"></button>
    </span>
    <span class="ql-formats">
      <select class="ql-color"></select>
      <select class="ql-background"></select>
      <button class="ql-clean"></button>
    </span>`
  quill = new Quill(quillContainer.value, { theme: 'snow', modules: { toolbar: { container: quillToolbar.value, handlers: { image: onQuillImage } }, history: { delay: 1000, maxStack: 200, userOnly: true } } })
  quill.root.innerHTML = richText.value || ''
  quill.on('text-change', () => {
    richText.value = quill.root.innerHTML
  })

  // 支持从剪贴板直接粘贴图片
  quill.root.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items || []
    for (const it of items){
      if (it && it.type && it.type.indexOf('image') !== -1){
        const file = it.getAsFile()
        if (!file) continue
        const reader = new FileReader()
        reader.onload = async () => {
          const range = quill.getSelection(true) || { index: quill.getLength() }
          try {
            const res = await api.uploadImage(reader.result, file.name)
            const html = buildFigureHTML({ url: res.url, width: '', align: 'center', caption: '' })
            quill.clipboard.dangerouslyPasteHTML(range.index, html)
          } catch (err){ ElMessage.error('图片上传失败：' + err.message) }
        }
        reader.readAsDataURL(file)
        e.preventDefault()
        break
      }
    }
  })

  // Monaco 延迟加载：仅在首次切换到“代码”页签时初始化
  if (tab.value === 'code') await initMonaco()

  loading.value = false
})

// 快捷键：Ctrl/Cmd + S 保存
function onKeydown(e){
  if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 's'){
    e.preventDefault()
    save(true)
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// 同步 Monaco 语言与主题
watch(() => code.value.language, (lang) => {
  if (monaco && monacoEditor) monaco.editor.setModelLanguage(monacoEditor.getModel(), lang)
})
watch(codeTheme, (t) => {
  if (monaco) monaco.editor.setTheme(t)
})

// 当切换到“代码”页签时再初始化 Monaco
watch(tab, async (t) => {
  if (t === 'code' && !monacoEditor) {
    await nextTick()
    await initMonaco()
  }
})

// 内容判定与快照
function stripHtml(html){
  const text = (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return text
}
function escapeHtml(s=''){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;')
}
function buildFigureHTML({ url='', width='', align='center', caption='' }){
  const cls = ['zsk-image', align && `align-${align}`].filter(Boolean).join(' ')
  const imgStyle = width ? `style=\"width:${escapeHtml(width)};\"` : ''
  const cap = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''
  return `<figure class=\"${cls}\"><img src=\"${escapeHtml(url)}\" ${imgStyle} />${cap}</figure>`
}
function hasContent(){
  const rich = stripHtml(richText.value).length > 0
  const md = (markdown.value || '').trim().length > 0
  const blk = Array.isArray(blocks.value) && blocks.value.length > 0
  const codeNonEmpty = (code.value?.value || '').trim().length > 0
  return rich || md || blk || codeNonEmpty
}
function contentSnapshot(){
  return JSON.stringify({
    title: (title.value || '').trim(),
    alias: (alias.value || '').trim(),
    category: (category.value || '').trim(),
    tags: (tags.value || []).slice().sort(),
    richText: stripHtml(richText.value || ''),
    markdown: (markdown.value || '').trim(),
    blocksLen: Array.isArray(blocks.value) ? blocks.value.length : 0,
    code: (code.value?.value || '').trim()
  })
}
let lastSnap = contentSnapshot()
// 自动保存（去抖 + 非空校验 + 变更判断）
let timer
watch([category, tags, richText, markdown, blocks, code], () => {
  clearTimeout(timer)
  timer = setTimeout(autoSave, 1200)
})

function autoSave(){
  const snap = contentSnapshot()
  if (snap === lastSnap) return
  if (!hasContent()) return
  save(false)
  lastSnap = snap
}

function isValidAlias(a){ return !a || /^[a-zA-Z0-9-]+$/.test(a) }
function isAliasTaken(a){ if (!a) return false; const k = currentId.value; return (store.docs || []).some(d => d.alias === a && d.id !== k) }
function save(manual = true){
  if (!currentId.value && !manual) {
    return
  }
  const payload = {
    title: title.value,
    alias: undefined,
    category: (category.value || '').trim(),
    tags: tags.value,
    richText: richText.value,
    markdown: markdown.value,
    blocks: blocks.value,
    code: code.value
  }
  const a = (alias.value || '').trim()
  const valid = isValidAlias(a)
  const taken = isAliasTaken(a)
  if (a) {
    if (!valid) { if (manual) ElMessage.error('别名格式无效（仅字母、数字与短横线）'); return }
    if (taken) { if (manual) ElMessage.error('别名已被占用'); return }
    payload.alias = a
  } else {
    payload.alias = undefined
  }
  if (!currentId.value){
    if (!hasContent() && !manual) return
    // 首次保存时创建文档
    store.createDoc(payload).then((doc) => {
      currentId.value = doc.id
      // 新建文档手动保存后跳转到文档列表
      if (manual) router.push({ name: 'documents' })
      lastSavedAt.value = new Date()
      if (manual) ElMessage.success('已保存')
    })
    return
  }
  // 更新已存在文档
  store.updateDoc(currentId.value, payload)
  lastSavedAt.value = new Date()
  if (manual) ElMessage.success('已保存')
  // 编辑文档手动保存后跳转到文档列表
  if (manual) router.push({ name: 'documents' })
}

async function initMonaco(){
  self.MonacoEnvironment = {
    getWorker(moduleId, label){
      if (label === 'json') return new JsonWorker()
      if (label === 'css') return new CssWorker()
      if (label === 'html') return new HtmlWorker()
      if (label === 'typescript' || label === 'javascript') return new TsWorker()
      return new EditorWorker()
    }
  }
  const m = await import('monaco-editor')
  monaco = m
  monacoEditor = monaco.editor.create(monacoEl.value, {
    value: code.value.value || '',
    language: code.value.language || 'javascript',
    theme: codeTheme.value,
    automaticLayout: true,
    minimap: { enabled: false }
  })
  monacoEditor.onDidChangeModelContent(() => {
    code.value.value = monacoEditor.getValue()
    codePlaceholderVisible.value = !code.value.value
  })
  monacoEditor.onDidFocusEditorText(() => { codePlaceholderVisible.value = false })
  monacoEditor.onDidBlurEditorText(() => { codePlaceholderVisible.value = !code.value.value })
}

function insertImage(){
  try {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file || !quill) { ElMessage.error('插入失败'); return }
      const reader = new FileReader()
      reader.onload = () => {
        const range = quill.getSelection(true) || { index: quill.getLength() }
        try {
          quill.insertEmbed(range.index, 'image', reader.result)
        } catch {
          quill.clipboard.dangerouslyPasteHTML(range.index, `<img src="${reader.result}" />`)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  } catch { ElMessage.error('插入失败') }
}

// 替换 Quill 工具栏的图片处理器，支持 URL 与本地文件
async function onQuillImage(){
  try {
    const range = quill.getSelection(true) || { index: quill.getLength() }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file || !quill) {
        // 未选择文件时，允许用户快速输入URL作为后备
        const url = (window.prompt('输入图片URL（可留空取消）') || '').trim()
        if (url) {
          const html = buildFigureHTML({ url, width: '', align: 'center', caption: '' })
          quill.clipboard.dangerouslyPasteHTML(range.index, html)
        }
        return
      }
      const reader = new FileReader()
      reader.onload = async () => {
        try {
          const res = await api.uploadImage(reader.result, file.name)
          const html = buildFigureHTML({ url: res.url, width: '', align: 'center', caption: '' })
          quill.clipboard.dangerouslyPasteHTML(range.index, html)
        } catch (e){
          ElMessage.error('图片上传失败：' + e.message)
        }
      }
      reader.readAsDataURL(file)
    }
    input.click()
  } catch { ElMessage.error('插入失败') }
}

// 基础块组件（简化 Notion 风格）
const ParagraphBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<el-input type="textarea" :model-value="modelValue" @update:model-value="$emit('update:modelValue',$event)" placeholder='段落...' />`
}
const HeadingBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<el-input :model-value="modelValue" @update:model-value="$emit('update:modelValue',$event)" placeholder='标题...' />`
}
const QuoteBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<el-input type="textarea" :model-value="modelValue" @update:model-value="$emit('update:modelValue',$event)" placeholder='引用...' />`
}
const CodeBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: `<el-input type="textarea" :model-value="modelValue" @update:model-value="$emit('update:modelValue',$event)" placeholder='代码块...' />`
}
const ImageBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  methods: {
    update(field, val){
      const next = Object.assign({}, this.modelValue || { url:'', width:'', align:'center', caption:'' })
      next[field] = val
      this.$emit('update:modelValue', next)
    },
    pick(){
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*'
      input.onchange = () => {
        const file = input.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = async () => {
          try { const res = await api.uploadImage(reader.result, file.name); this.update('url', res.url) }
          catch(e){ ElMessage.error('图片上传失败：' + e.message) }
        }
        reader.readAsDataURL(file)
      }
      input.click()
    }
  },
  template: `<div>
    <div style="display:grid; grid-template-columns: 1fr auto; gap:6px; align-items:center;">
      <el-input :model-value="(modelValue&&modelValue.url)||''" @update:model-value="update('url',$event)" placeholder='图片URL（上传后自动填充）' />
      <el-button size="small" @click="pick">上传本地图片</el-button>
    </div>
    <div style="display:grid; grid-template-columns: 160px 140px 1fr; gap:6px; margin-top:6px;">
      <el-input :model-value="(modelValue&&modelValue.width)||''" @update:model-value="update('width',$event)" placeholder='宽度：如 400px 或 60%' />
      <el-select :model-value="(modelValue&&modelValue.align)||'center'" @update:model-value="update('align',$event)">
        <el-option label="居左" value="left" />
        <el-option label="居中" value="center" />
        <el-option label="居右" value="right" />
      </el-select>
      <el-input :model-value="(modelValue&&modelValue.caption)||''" @update:model-value="update('caption',$event)" placeholder='标题/说明（可选）' />
    </div>
    <figure v-if="modelValue && modelValue.url" class="zsk-image" :class="'align-' + ((modelValue.align)||'center')" style="margin-top:6px;">
      <img :src="modelValue.url" :style="(modelValue.width?('width:'+modelValue.width):'')" />
      <figcaption v-if="modelValue.caption">{{ modelValue.caption }}</figcaption>
    </figure>
  </div>`
}
const TodoBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  data(){ return { items: (this.modelValue || []).map(t => ({ text: t.text, done: !!t.done })) } },
  watch: { items: { deep: true, handler(){ this.$emit('update:modelValue', this.items) } } },
  template: `<div>
    <div v-for="(it, i) in items" :key="i" style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
      <el-checkbox v-model="it.done" />
      <el-input v-model="it.text" placeholder='待办...' />
      <el-button text type="danger" @click="items.splice(i,1)">删</el-button>
    </div>
    <el-button size="small" @click="items.push({ text:'', done:false })">添加待办</el-button>
  </div>`
}
const TableBlock = {
  props: ['modelValue'],
  emits: ['update:modelValue'],
  data(){ return { rows: this.modelValue?.rows || 2, cols: this.modelValue?.cols || 2, data: this.modelValue?.data || Array.from({length:2},()=>Array.from({length:2},()=>'')) } },
  watch: { data: { deep: true, handler(){ this.$emit('update:modelValue', { rows: this.rows, cols: this.cols, data: this.data }) } } },
  methods: {
    resize(){ this.data = Array.from({length:this.rows},()=>Array.from({length:this.cols},()=>'')) }
  },
  template: `<div>
    <div style="display:flex; gap:8px; margin-bottom:6px;">
      <el-input-number v-model="rows" :min="1" :max="10" @change="resize" />
      <el-input-number v-model="cols" :min="1" :max="10" @change="resize" />
    </div>
    <table class="zsk-table">
      <tr v-for="(r,ri) in rows" :key="ri">
        <td v-for="(c,ci) in cols" :key="ci"><input v-model="data[ri][ci]" /></td>
      </tr>
    </table>
  </div>`
}
</script>

<style scoped>
.editor-page { width: 90%; }
.header { display:flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.header-grid { display:flex; flex-direction: column; gap: 8px; }
.row { display:flex; gap: 8px; align-items: center; }
.row1 { align-items: center; }
.row-actions { display:flex; gap: 8px; align-items:center; margin-left:auto; }
.title-input { flex: 1; }
.row2 { display:grid; grid-template-columns: 1fr 1fr 2fr; gap: 8px; }
.alias-input, .category-select, .tags-select { width: auto; max-width: 240px; }
.save-hint { margin-left: auto; color: var(--el-text-color-secondary); font-size: 12px; }
.toolbar-row { display:flex; gap: 8px; align-items:center; border:1px solid var(--el-border-color); border-bottom: none; position: sticky; top: 0; background: var(--el-color-white); z-index: 2; padding: 1px 1px; }
.toolbar { border: none; }
.toolbar-status { margin-left:auto; display:flex; align-items:center; font-size: 12px; color: var(--el-text-color-secondary); }
.rich { height: 320px; border:1px solid var(--el-border-color); }
.rich { position: relative; overflow: visible; }
/* 解决 Quill 插入链接/视频时的输入框被裁剪问题 */
.rich :deep(.ql-container) { overflow: visible; }
.rich :deep(.ql-tooltip) { z-index: 1003; transform: translateX(200px); }
.toolbar { border:1px solid var(--el-border-color); border-bottom: none; position: sticky; top: 0; background: var(--el-color-white); z-index: 2; }
.split { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.md-input { width:100%; height: 360px; resize: vertical; }
.md-preview { padding: 8px; border:1px solid var(--el-border-color); overflow:auto; }
.block-toolbar { display:flex; gap: 6px; margin-bottom: 8px; }
.blocks { display:flex; flex-direction: column; gap: 8px; }
.block { display:flex; gap: 8px; align-items: flex-start; border:1px dashed var(--el-border-color); padding: 8px; }
.drag { cursor: grab; color: var(--el-text-color-secondary); }
.code-toolbar { display:flex; gap: 8px; margin-bottom: 8px; }
.monaco { height: 420px; border:1px solid var(--el-border-color); position: relative; }
.code-placeholder { position: absolute; top: 8px; left: 12px; color: var(--el-text-color-secondary); transition: opacity .2s ease; pointer-events: none; }
.code-placeholder.hidden { opacity: 0; }
.zsk-table { border-collapse: collapse; width: 100%; }
.zsk-table td { border: 1px solid var(--el-border-color); padding: 4px; }
.zsk-table input { width: 100%; border: none; outline: none; background: transparent; }
/* 图片显示样式（富文本与块编辑器通用） */
.rich .zsk-image, .blocks .zsk-image { display:block; }
.rich .zsk-image.align-center, .blocks .zsk-image.align-center { margin-left:auto; margin-right:auto; }
.rich .zsk-image.align-right, .blocks .zsk-image.align-right { margin-left:auto; }
.rich .zsk-image figcaption, .blocks .zsk-image figcaption { font-size:12px; color: var(--el-text-color-secondary); text-align:center; margin-top:4px; }

/* 局部覆盖：避免 Element Plus 容器裁剪 Quill 的提示层 */
.editor-page :deep(.el-card__body) { overflow: visible; }
.editor-page :deep(.el-tabs__content) { overflow: visible; }
.editor-page :deep(.el-tab-pane) { overflow: visible; }
.editor-page :deep(.el-card) { overflow: visible; }
</style>
const langMap = {
  javascript: 'JavaScript', typescript: 'TypeScript', html: 'HTML', css: 'CSS', json: 'JSON', python: 'Python', plaintext: 'Plain'
}
const displayLang = computed(() => langMap[code.value.language] || code.value.language || '—')
const themeLabel = computed(() => codeTheme.value === 'vs-dark' ? '深色' : '浅色')