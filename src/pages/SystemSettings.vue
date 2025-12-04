<template>
  <div class="settings">
    <el-card class="system">
      <template #header>
        <div class="card-header">系统设置</div>
      </template>
      <div class="sys-row">
        <el-button type="primary" @click="backup">系统数据备份（数据库+附件）</el-button>
        <span class="desc">下载为 ZIP</span>
      </div>
      <div class="sys-row">
        <el-upload :show-file-list="false" :on-change="onImportFile" accept=".zip">
          <el-button>导入系统数据（ZIP）</el-button>
        </el-upload>
        <span class="desc">导入后建议重启应用</span>
      </div>
      
    </el-card>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { api } from '../services/api.js'
import { ElMessage } from 'element-plus'
import { useDocumentsStore } from '../store/documents.js'
import { useBookmarksStore } from '../store/bookmarks.js'

onMounted(async () => {
  try { await api.me() } catch {}
})

async function backup(){
  try {
    const blob = await api.backupDownload()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `zsk-backup-${Date.now()}.zip`
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    ElMessage.error('备份失败')
  }
}

async function onImportFile(file){
  try {
    const f = file?.raw || file
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const dataUrl = reader.result || ''
        const m = String(dataUrl).match(/^data:.*;base64,(.+)$/)
        const base64 = m ? m[1] : ''
        const res = await api.restoreImport(base64)
        if (res?.ok) {
          ElMessage.success('导入成功，正在重启后端服务以应用数据')
          if (window.ZSK && typeof window.ZSK.restartServer === 'function') {
            await window.ZSK.restartServer()
          }
          try {
            const docs = useDocumentsStore()
            const bms = useBookmarksStore()
            docs.loaded = false
            bms.loaded = false
            await api.me().catch(() => {})
            await docs.load().catch(() => {})
            await bms.load().catch(() => {})
            ElMessage.success('后端已重启，数据已刷新')
          } catch {}
        } else {
          ElMessage.error('导入失败')
        }
      } catch {
        ElMessage.error('导入失败')
      }
    }
    reader.onerror = () => { ElMessage.error('读取文件失败') }
    reader.readAsDataURL(f)
  } catch {
    ElMessage.error('导入失败')
  }
}


</script>

<style scoped>
.card-header { font-weight: 600; }
.system { width: 90%; margin: 0; }
.sys-row { display:flex; align-items:center; gap:12px; margin:10px 0; }
.desc { color: var(--el-text-color-secondary); }
</style>