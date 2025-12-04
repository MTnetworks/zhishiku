<template>
  <div class="categories-page" v-loading="loading">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>分类管理</span>
          <div class="actions">
            <el-input v-model="newName" placeholder="新增分类" style="max-width:220px;" />
            <el-button type="primary" @click="create">新增</el-button>
            <el-button @click="back">返回列表</el-button>
          </div>
        </div>
      </template>

      <div class="toolbar">
        <el-input v-model="search" placeholder="搜索分类" clearable style="max-width:280px;" />
      </div>

      <el-table :data="filtered" style="width:100%" empty-text="暂无分类">
        <el-table-column label="分类" min-width="200">
          <template #default="{ row }">
            <div class="cat-cell">
              <el-tag type="success">{{ row.name }}</el-tag>
              <el-link type="primary" class="count" @click="viewDocs(row.name)">文档数：{{ row.count }}</el-link>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="360">
          <template #default="{ row }">
            <el-button link @click="openRename(row.name)">重命名</el-button>
            <el-button link type="danger" @click="openDelete(row.name)">删除</el-button>
            <el-button link type="primary" @click="viewDocs(row.name)">查看该分类文档</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog v-model="renameDialog.visible" title="重命名分类" width="420px">
        <div style="display:flex; gap:8px; align-items:center;">
          <el-tag type="info">{{ renameDialog.from }}</el-tag>
          <span>→</span>
          <el-input v-model="renameDialog.to" placeholder="新名称" />
        </div>
        <template #footer>
          <el-button @click="renameDialog.visible=false">取消</el-button>
          <el-button type="primary" @click="doRename">确定</el-button>
        </template>
      </el-dialog>

      <el-dialog v-model="deleteDialog.visible" title="删除分类" width="480px">
        <div style="display:flex; flex-direction:column; gap:12px;">
          <div>删除分类：<el-tag type="danger">{{ deleteDialog.name }}</el-tag></div>
          <div style="display:flex; gap:8px; align-items:center;">
            <span>将该分类下的文档批量移动到：</span>
            <el-select v-model="deleteDialog.moveTo" placeholder="留空则清空分类" clearable filterable style="min-width:220px;">
              <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
            </el-select>
          </div>
        </div>
        <template #footer>
          <el-button @click="deleteDialog.visible=false">取消</el-button>
          <el-button type="danger" @click="doDelete">删除</el-button>
        </template>
      </el-dialog>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../services/api.js'
import { useDocumentsStore } from '../store/documents.js'
import { ElMessage } from 'element-plus'

const router = useRouter()
const store = useDocumentsStore()
const loading = ref(true)
const categories = ref([])
const newName = ref('')
const search = ref('')

const renameDialog = ref({ visible:false, from:'', to:'' })
const deleteDialog = ref({ visible:false, name:'', moveTo:'' })

onMounted(async () => {
  await store.load()
  await loadCategories()
  loading.value = false
})

async function loadCategories(){
  try {
    const list = await api.categories()
    categories.value = Array.isArray(list) ? list : []
  } catch {}
}

const counts = computed(() => {
  const map = new Map()
  ;(store.docs || []).forEach(d => {
    const c = (d.category || '').trim()
    if (!c) return
    map.set(c, (map.get(c) || 0) + 1)
  })
  return map
})

const rows = computed(() => {
  return (categories.value || []).map(name => ({ name, count: counts.value.get(name) || 0 }))
})
const filtered = computed(() => {
  const q = (search.value || '').trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.name.toLowerCase().includes(q))
})

function back(){ router.push('/documents') }

async function create(){
  const name = (newName.value || '').trim()
  if (!name) { ElMessage.warning('请输入分类名称'); return }
  try {
    await api.createCategory(name)
    ElMessage.success('已新增分类')
    newName.value = ''
    await loadCategories()
  } catch (e) {
    ElMessage.error('新增失败：' + (e.message || ''))
  }
}

function openRename(from){ renameDialog.value = { visible:true, from, to:'' } }
async function doRename(){
  const { from, to } = renameDialog.value
  const name = (to || '').trim()
  if (!name) { ElMessage.warning('请输入新名称'); return }
  try {
    const res = await api.renameCategory(from, name)
    ElMessage.success(`已重命名，更新文档 ${res.updated || 0} 条`)
    renameDialog.value.visible = false
    await Promise.all([loadCategories(), store.load()])
  } catch (e) { ElMessage.error('重命名失败：' + (e.message || '')) }
}

function openDelete(name){ deleteDialog.value = { visible:true, name, moveTo:'' } }
async function doDelete(){
  const { name, moveTo } = deleteDialog.value
  try {
    const res = await api.deleteCategory(name, moveTo || '')
    ElMessage.success(`已删除，更新文档 ${res.updated || 0} 条`)
    deleteDialog.value.visible = false
    await Promise.all([loadCategories(), store.load()])
  } catch (e) { ElMessage.error('删除失败：' + (e.message || '')) }
}

function viewDocs(name){
  router.push(`/documents?category=${encodeURIComponent(name)}`)
}
</script>

<style scoped>
.categories-page { width: 90%; }
.card-header { display:flex; align-items:center; justify-content: space-between; }
.actions { display:flex; gap: 8px; align-items:center; }
.toolbar { display:flex; gap: 8px; margin-bottom: 8px; }
.cat-cell { display:flex; gap: 12px; align-items:center; }
.count { color: var(--el-text-color-secondary); font-size: 12px; }
</style>