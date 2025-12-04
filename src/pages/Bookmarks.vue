<template>
  <div class="bookmarks-page" v-loading="loading">
    <el-card>
      <template #header>
        <div class="header">
          <div class="title">网站收藏夹</div>
          <div class="tools">
            <el-input v-model="q" placeholder="快速搜索（标题/网址）" class="search" clearable />
            <el-select v-model="filterGroup" class="group" placeholder="分组筛选" clearable filterable allow-create>
              <el-option v-for="g in store.allGroups" :key="g" :label="g" :value="g" />
            </el-select>
            <el-select v-model="filterTags" class="tags" multiple placeholder="标签筛选" clearable filterable allow-create>
              <el-option v-for="t in store.allTags" :key="t" :label="t" :value="t" />
            </el-select>
            <div class="count">共 {{ filtered.length }} 个</div>
          </div>
        </div>
      </template>

      <div class="form-row">
        <el-input v-model="url" placeholder="输入网址，例如 https://example.com" class="url-input" />
        <el-input v-model="title" placeholder="可选：备注/标题" class="title-input" />
        <el-select v-model="group" class="group-input" placeholder="可选：分组" clearable filterable allow-create>
          <el-option v-for="g in store.allGroups" :key="g" :label="g" :value="g" />
        </el-select>
        <el-select v-model="tags" class="tags-input" multiple placeholder="可选：标签" clearable filterable allow-create>
          <el-option v-for="t in store.allTags" :key="t" :label="t" :value="t" />
        </el-select>
        <el-button type="primary" @click="add" :disabled="!isValidUrl(url)">添加</el-button>
        <el-button @click="triggerImport">导入</el-button>
        <el-button @click="doExport">导出</el-button>
        <input ref="fileInput" type="file" accept="application/json" style="display:none" @change="onImportChange" />
      </div>

      <el-table :data="filtered" v-if="filtered.length" border>
        <el-table-column label="标题" min-width="200">
          <template #default="{ row }">
            <a :href="row.url" target="_blank" rel="noopener" class="link">{{ row.title || row.url }}</a>
          </template>
        </el-table-column>
        <el-table-column label="网址" min-width="260" prop="url" />
        <el-table-column label="分组" min-width="120">
          <template #default="{ row }">
            <el-tag v-if="row.group" type="info">{{ row.group }}</el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="标签" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="t in (row.tags||[])" :key="t" class="tag-chip">{{ t }}</el-tag>
            <span v-if="!(row.tags||[]).length">-</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ fmt(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button text @click="openEdit(row)">编辑</el-button>
            <el-button text type="danger" @click="remove(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="暂无收藏" />

      <!-- 编辑弹窗 -->
      <el-dialog v-model="editVisible" title="编辑收藏" width="520px">
        <div style="display:grid; grid-template-columns: 1fr; gap: 12px;">
          <el-input v-model="editTitle" placeholder="备注/标题" />
          <el-input v-model="editUrl" placeholder="网址" />
          <el-select v-model="editGroup" placeholder="分组" clearable filterable allow-create>
            <el-option v-for="g in store.allGroups" :key="g" :label="g" :value="g" />
          </el-select>
          <el-select v-model="editTags" multiple placeholder="标签" clearable filterable allow-create>
            <el-option v-for="t in store.allTags" :key="t" :label="t" :value="t" />
          </el-select>
        </div>
        <template #footer>
          <el-button @click="editVisible=false">取消</el-button>
          <el-button type="primary" @click="saveEdit">保存</el-button>
        </template>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { useBookmarksStore } from '../store/bookmarks.js'

const store = useBookmarksStore()
const loading = ref(true)
const url = ref('')
const title = ref('')
const group = ref('')
const tags = ref([])
const q = ref('')
const filterGroup = ref('')
const filterTags = ref([])
const fileInput = ref(null)

// 编辑弹窗
const editVisible = ref(false)
const editRow = ref(null)
const editTitle = ref('')
const editGroup = ref('')
const editTags = ref([])
const editUrl = ref('')
function openEdit(row){
  editRow.value = row
  editTitle.value = row.title || ''
  editGroup.value = row.group || ''
  editTags.value = Array.isArray(row.tags) ? [...row.tags] : []
  editUrl.value = row.url || ''
  editVisible.value = true
}
async function saveEdit(){
  const id = editRow.value?.id
  if (!id) { editVisible.value = false; return }
  const newUrl = String(editUrl.value||'').trim()
  if (!isValidUrl(newUrl)) { ElMessage.error('请输入合法网址'); return }
  const patch = { url: newUrl, title: (editTitle.value||'').trim(), group: (editGroup.value||'').trim(), tags: editTags.value }
  const updated = await store.update(id, patch)
  if (updated) ElMessage.success('已保存')
  editVisible.value = false
}

function isValidUrl(u){
  try { const x = new URL(u); return !!x.protocol && !!x.host } catch { return false }
}
async function add(){
  if (!isValidUrl(url.value)) return
  const exists = (store.bookmarks || []).some(b => String(b.url||'').trim().toLowerCase() === String(url.value).trim().toLowerCase())
  if (exists) { ElMessage.warning('该网址已存在'); return }
  const created = await store.add({ url: url.value.trim(), title: (title.value||'').trim(), group: (group.value||'').trim(), tags: tags.value })
  if (created?.duplicate) { ElMessage.warning('该网址已存在'); return }
  url.value = ''
  title.value = ''
  group.value = ''
  tags.value = []
}
function remove(id){ store.remove(id) }

function fmt(ts){
  if (!ts) return ''
  if (typeof ts === 'string' && ts.includes('T')) {
    const d = new Date(ts)
    const pad = (n)=>String(n).padStart(2,'0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  // 已是 'YYYY-MM-DD HH:mm:ss' 或类似，裁剪到分钟
  if (typeof ts === 'string' && ts.length >= 16) return ts.slice(0,16)
  try {
    const d = new Date(ts)
    const pad = (n)=>String(n).padStart(2,'0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch { return String(ts) }
}

const filtered = computed(() => {
  const qx = String(q.value || '').trim().toLowerCase()
  const tg = filterTags.value || []
  const gg = String(filterGroup.value || '').trim()
  return (store.bookmarks || []).filter(b => {
    if (qx && !(String(b.title||'').toLowerCase().includes(qx) || String(b.url||'').toLowerCase().includes(qx))) return false
    if (gg && String(b.group||'') !== gg) return false
    if (tg.length && !tg.every(t => (b.tags||[]).includes(t))) return false
    return true
  })
})

// 已移除站点图标与站内预览功能

function triggerImport(){ fileInput.value?.click() }
async function onImportChange(e){
  const file = e.target.files && e.target.files[0]
  if (!file) return
  const text = await file.text()
  let data = []
  try { data = JSON.parse(text) } catch { ElMessage.error('JSON 解析失败'); return }
  const res = await store.import(data)
  ElMessage.success(`导入完成，新增 ${res?.count ?? 0} 条`)
  e.target.value = ''
}
async function doExport(){
  const list = await store.export()
  const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bookmarks_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

onMounted(async () => { await store.load(); loading.value = false })
</script>

<style scoped>
.bookmarks-page { padding: 8px }
.header { display: flex; align-items: center; justify-content: space-between }
.title { font-size: 18px; font-weight: 500 }
.tools { display: grid; grid-template-columns: 2fr 180px 240px auto; gap: 8px; align-items: center }
.count { color: var(--el-text-color-secondary); text-align: right }
.form-row { display: grid; grid-template-columns: 1fr 1fr 160px 240px auto auto auto; gap: 12px; margin-bottom: 16px }
.url-input, .title-input { width: 100% }
.group-input, .tags-input { width: 100% }
.link { color: var(--el-color-primary) }
.search { width: 100% }
.tag-chip { margin-right: 6px }
</style>