<template>
  <div class="documents">
    <el-card>
      <template #header>
        <div class="card-header">文档管理</div>
      </template>
      <div class="toolbar">
        <el-input v-model="store.search" placeholder="搜索标题或内容" clearable style="max-width:320px;" />
        <el-select v-model="store.tagFilter" multiple collapse-tags placeholder="标签筛选" style="max-width:200px;" filterable allow-create>
          <el-option v-for="t in tags" :key="t" :label="t" :value="t" />
        </el-select>
        <el-select v-model="categoryFilter" placeholder="分类筛选" clearable style="max-width:200px;" filterable allow-create>
          <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
        </el-select>
        <el-button type="primary" @click="create">新建文档</el-button>
        <el-button @click="gotoCategories">管理分类</el-button>
        <el-button :disabled="!hasSelection" @click="batchDelete" type="danger">批量删除</el-button>
        <el-dropdown :disabled="!hasSelection">
          <el-button>批量导出</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="batchExportJson">JSON</el-dropdown-item>
              <el-dropdown-item @click="batchExportHtml">HTML</el-dropdown-item>
              <el-dropdown-item @click="batchExportPdf">PDF</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-upload :show-file-list="false" accept=".json" :on-change="onImportJson">
          <el-button>导入 JSON</el-button>
        </el-upload>
        <el-upload :show-file-list="false" accept=".md,.markdown,.txt" :on-change="onImportMarkdown">
          <el-button>导入 Markdown</el-button>
        </el-upload>
      </div>
      <el-table :data="paged" @selection-change="onSel" style="width:100%" empty-text="暂无文档" row-key="id" size="small" class="tight-table">
        <el-table-column type="selection" width="48" />
        <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip align="left">
          <template #default="{ row }">
            <div class="title-cell">
              <el-link type="primary" @click="view(row.alias || row.id)">{{ row.title }}</el-link>
              <el-tag v-if="isPinned(row)" type="warning" size="small" effect="dark" class="status-tag">
                <el-icon :size="12"><StarFilled /></el-icon>
                <span style="margin-left:2px;">置顶</span>
              </el-tag>
              <el-tag v-if="isDraft(row)" type="info" size="small" effect="dark" class="status-tag">
                <el-icon :size="12"><EditPen /></el-icon>
                <span style="margin-left:2px;">草稿</span>
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="分类" width="120">
          <template #default="{ row }">
            <span>{{ row.category || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="alias" label="别名" width="160">
          <template #default="{ row }">
            <span>{{ row.alias || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="tags" label="标签" min-width="160">
          <template #default="{ row }">
            <span v-if="!(row.tags && row.tags.length)">—</span>
            <template v-else>
              <el-tag v-for="t in (row.tags || []).slice(0,1)" :key="t" type="info" effect="plain" size="small" class="tag-chip">
                <el-icon :size="12"><PriceTag /></el-icon>
                <span style="margin-left:2px;">{{ t }}</span>
              </el-tag>
              <el-popover v-if="(row.tags || []).length > 1" trigger="hover" placement="top" width="240">
                <template #reference>
                  <el-tag type="info" effect="dark" size="small" class="tag-chip more-tag">+{{ (row.tags || []).length - 1 }}</el-tag>
                </template>
                <div class="tag-popover">
                  <el-tag v-for="t in row.tags" :key="t" type="info" effect="plain" size="small" class="tag-chip">
                    <el-icon :size="12"><PriceTag /></el-icon>
                    <span style="margin-left:2px;">{{ t }}</span>
                  </el-tag>
                </div>
              </el-popover>
            </template>
          </template>
        </el-table-column>
        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">
            <span>{{ formatTs(row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-tooltip content="查看" placement="top"><el-button link @click="view(row.alias || row.id)">查看</el-button></el-tooltip>
            <el-tooltip content="编辑" placement="top"><el-button link @click="edit(row.id)">编辑</el-button></el-tooltip>
            <el-tooltip content="复制" placement="top"><el-button link @click="copy(row.id)">复制</el-button></el-tooltip>
            <el-tooltip content="删除" placement="top"><el-button link type="danger" @click="remove(row.id)">删除</el-button></el-tooltip>
          </template>
        </el-table-column>
      </el-table>
      <div class="pager">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 15, 20, 50]"
          :total="list.length"
          layout="prev, pager, next, jumper, sizes, total"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDocumentsStore } from '../store/documents.js'
import { ElMessage } from 'element-plus'
import { StarFilled, EditPen, PriceTag } from '@element-plus/icons-vue'
const route = useRoute()
const router = useRouter()
const store = useDocumentsStore()
onMounted(() => {
  store.load()
  categoryFilter.value = (route.query?.category || '')
})
watch(() => route.query?.category, (c) => { categoryFilter.value = c || '' })
const categoryFilter = ref('')
const categories = computed(() => Array.from(new Set((store.docs || []).map(d => d.category).filter(Boolean))).sort())
const list = computed(() => {
  const l = store.filtered || []
  const cf = (categoryFilter.value || '').trim()
  if (!cf) return l
  return l.filter(d => (d.category || '').includes(cf))
})
const pageSize = ref(15)
const currentPage = ref(1)
const paged = computed(() => {
  const l = list.value || []
  const start = (currentPage.value - 1) * pageSize.value
  return l.slice(start, start + pageSize.value)
})
// 搜索或标签筛选变化时重置到第一页
watch([() => store.search, () => store.tagFilter, categoryFilter], () => { currentPage.value = 1 })
const tags = computed(() => store.allTags)
const hasSelection = computed(() => store.selectedIds.length > 0)
// 规避 el-upload 的 on-change 多次触发导致重复导入
const processedKeys = new Set()
function fileKey(file){
  const raw = file.raw || {}
  const name = file.name || raw.name || 'unknown'
  const size = raw.size ?? file.size ?? 0
  const lm = raw.lastModified ?? 0
  return `${name}:${size}:${lm}`
}

async function create(){
  const doc = await store.createDoc()
  router.push(`/editor/${doc.id}`)
}
function edit(id){ router.push(`/editor/${id}`) }
function view(id){ router.push(`/view/${id}`) }
async function copy(id){ const copy = await store.copyDoc(id); router.push(`/editor/${copy.id}`) }
function remove(id){ store.deleteDoc(id) }
function onSel(rows){ store.selectedIds = rows.map(r => r.id) }
function batchDelete(){ store.batchDelete(store.selectedIds) }
function batchExportJson(){ store.exportDocs(store.selectedIds) }
function batchExportHtml(){ store.exportDocsHtml(store.selectedIds) }
function batchExportPdf(){ store.exportDocsPdf(store.selectedIds) }
function gotoCategories(){ router.push('/categories') }
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

function parseToDate(ts){
  if (!ts) return null
  if (typeof ts === 'string' && ts.includes('T')){
    const d = new Date(ts)
    return isNaN(d.getTime()) ? null : d
  }
  // 兼容 YYYY-MM-DD HH:mm:ss，本地时间
  if (typeof ts === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)){
    const d = new Date(ts.replace(' ', 'T'))
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function timeAgo(ts){
  const d = parseToDate(ts)
  if (!d) return formatTs(ts)
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}秒前`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}小时前`
  const day = Math.floor(hour / 24)
  if (day < 7) return `${day}天前`
  return formatTs(ts)
}

function isDraft(row){
  const emptyRich = !row.richText || row.richText.trim() === ''
  const emptyMd = !row.markdown || row.markdown.trim() === ''
  const emptyBlocks = !row.blocks || row.blocks.length === 0
  const emptyCode = !row.code || !row.code.value || row.code.value.trim() === ''
  return emptyRich && emptyMd && emptyBlocks && emptyCode
}
function isPinned(row){
  const tags = row.tags || []
  return tags.includes('top') || tags.includes('置顶')
}
async function onImportJson(file){
  const key = fileKey(file)
  if (processedKeys.has(key)) return
  processedKeys.add(key)
  const raw = await file.raw.text()
  try {
    const list = JSON.parse(raw)
    const res = await store.importFromJson(list)
    ElMessage.success(`导入完成，共 ${res.count || 0} 条`)
  } catch { ElMessage.error('JSON 解析失败') }
}
async function onImportMarkdown(file){
  const key = fileKey(file)
  if (processedKeys.has(key)) return
  processedKeys.add(key)
  const raw = await file.raw.text()
  const doc = await store.importMarkdown(file.name.replace(/\.[^.]+$/, ''), raw)
  ElMessage.success(`已导入 Markdown：${doc.title}`)
}
</script>

<style scoped>
.toolbar { display:flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.card-header { font-weight: 200; }
.title-cell { display:flex; align-items:center; gap: 12px; }
.status-tag { padding-left: 4px; padding-right: 4px; }
.tag-chip { margin: 0 4px 4px 0; display:inline-flex; align-items:center; }
.more-tag { cursor: pointer; }
.tag-popover { display:flex; flex-wrap:wrap; gap: 4px; }
.pager { margin-top: 8px; }
.documents { width: 90%; }
/* 表格紧凑样式：减少单元格左右内边距 */
.tight-table :deep(.el-table__cell) { padding: 6px 8px; }
.tight-table :deep(.el-table__header .cell) { padding: 6px 8px; }
</style>