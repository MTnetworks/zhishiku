<template>
  <header class="topbar">
    <div class="left">
      <el-button text @click="$emit('toggle')">
        <el-icon><i class="el-icon-menu"></i></el-icon>
      </el-button>
      <el-breadcrumb separator="/">
        <el-breadcrumb-item v-for="(bc,i) in breadcrumbs" :key="i">{{ bc }}</el-breadcrumb-item>
      </el-breadcrumb>
    </div>
    <div class="right">
      <el-button type="primary" @click="goCreate">新建文档</el-button>
      <div class="theme-switch">
        <el-switch v-model="isDark" inline-prompt :active-icon="Moon" :inactive-icon="Sunny" :active-text="'深色'" :inactive-text="'浅色'" />
      </div>
      <el-dropdown>
        <span class="el-dropdown-link">
          快捷操作<i class="el-icon-arrow-down el-icon--right"></i>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="goDocs">文档列表</el-dropdown-item>
            <el-dropdown-item @click="goDashboard">仪表板</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <div class="user-box">
        <el-avatar size="small">{{ userInitial }}</el-avatar>
        <el-dropdown>
          <span class="el-dropdown-link">{{ userName || '未登录' }}</span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-if="!loggedIn" @click="goLogin">登录</el-dropdown-item>
              <el-dropdown-item v-else @click="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </header>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Moon, Sunny } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
const route = useRoute()
const router = useRouter()
const breadcrumbs = computed(() => {
  const parts = route.path.split('/').filter(Boolean)
  if (!parts.length) return ['仪表板']
  return parts
})
function goCreate(){ router.push('/editor') }
function goDocs(){ router.push('/documents') }
function goDashboard(){ router.push('/') }
function goLogin(){ router.push('/login') }
function logout(){
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.dispatchEvent(new Event('auth-changed'))
  ElMessage.success('已退出');
  router.replace('/login')
}

// 主题切换（浅色/深色）
const isDark = ref(document.documentElement.classList.contains('dark') || localStorage.getItem('theme') === 'dark')
watch(isDark, (v) => {
  const el = document.documentElement
  if (v) { el.classList.add('dark'); localStorage.setItem('theme', 'dark') }
  else { el.classList.remove('dark'); localStorage.setItem('theme', 'light') }
})

// 用户信息（并入主脚本）
const user = ref(null)
const loggedIn = computed(() => !!localStorage.getItem('token'))
const userName = computed(() => (user.value && (user.value.name || user.value.email || user.value.username)) || '')
const userInitial = computed(() => (userName.value || 'U').slice(0,1).toUpperCase())
try { user.value = JSON.parse(localStorage.getItem('user')||'null') } catch {}
window.addEventListener('auth-changed', () => {
  try { user.value = JSON.parse(localStorage.getItem('user')||'null') } catch {}
})
watch(() => localStorage.getItem('user'), () => {
  try { user.value = JSON.parse(localStorage.getItem('user')||'null') } catch {}
})
</script>

<style scoped>
.topbar {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}
.left, .right { display: flex; align-items: center; gap: 12px; }
.theme-switch { display:flex; align-items:center; }
.user-box { display:flex; align-items:center; gap:6px; }
</style>