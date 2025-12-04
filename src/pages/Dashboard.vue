<template>
  <div class="dashboard">
    <el-row :gutter="16" class="stats">
      <el-col :sm="12" :md="8" :lg="6">
        <el-card class="stat">
          <div class="stat-title">文档总数</div>
          <div class="stat-value">{{ docs.length }}</div>
        </el-card>
      </el-col>
      <el-col :sm="12" :md="8" :lg="6">
        <el-card class="stat">
          <div class="stat-title">标签数量</div>
          <div class="stat-value">{{ tags.length }}</div>
        </el-card>
      </el-col>
      <el-col :sm="12" :md="8" :lg="6">
        <el-card class="stat">
          <div class="stat-title">最近更新</div>
          <div class="stat-value">{{ lastUpdated }}</div>
        </el-card>
      </el-col>
    </el-row>

  <el-card class="quick" style="margin-top:16px;">
    <template #header>
      <div class="card-header">快速操作</div>
    </template>
    <el-button type="primary" @click="goCreate">新建文档</el-button>
    <el-button @click="goDocs">查看文档列表</el-button>
  </el-card>

  

    <el-card class="recent" style="margin-top:16px;">
      <template #header>
        <div class="card-header">最近文档</div>
      </template>
      <el-table :data="recentDocs" size="small" empty-text="暂无文档">
        <el-table-column prop="title" label="标题" />
        <el-table-column prop="updatedAt" label="更新时间" width="180">
          <template #default="{ row }">
            <span>{{ formatTs(row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button link @click="edit(row.id)">编辑</el-button>
            <el-button link type="danger" @click="remove(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDocumentsStore } from '../store/documents.js'
import { api } from '../services/api.js'
const router = useRouter()
const store = useDocumentsStore()
onMounted(() => store.load())
const docs = computed(() => store.docs)
const tags = computed(() => store.allTags)
const lastUpdated = computed(() => formatTs(docs.value[0]?.updatedAt) || '—')
const recentDocs = computed(() => docs.value.slice(0, 5))
onMounted(async () => { try { await api.me() } catch {} })

function goCreate(){ router.push('/editor') }
function goDocs(){ router.push('/documents') }
function edit(id){ router.push(`/editor/${id}`) }
function remove(id){ store.deleteDoc(id) }

 


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
.stat { text-align: center; }
.stat-title { font-size: 24px; color: var(--el-text-color-secondary); }
.stat-value { font-size: 34px; font-weight: 700; }
.card-header { font-weight: 600; }
.quick, .recent { width: 90%; margin: 0; }
.stats { width: 121%; }
</style>