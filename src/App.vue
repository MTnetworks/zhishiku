<template>
  <div v-if="showChrome" class="layout" :class="{ collapsed: isCollapsed }">
    <Sidebar :collapsed="isCollapsed" @toggle="toggleSidebar" />
    <div class="main">
      <TopBar :collapsed="isCollapsed" @toggle="toggleSidebar" />
      <div class="content">
        <router-view />
      </div>
    </div>
  </div>
  <div v-else class="login-only">
    <router-view />
  </div>
  
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from './components/Sidebar.vue'
import TopBar from './components/TopBar.vue'
import { api } from './services/api.js'

const isCollapsed = ref(false)
const toggleSidebar = () => { isCollapsed.value = !isCollapsed.value }
const route = useRoute()
const loggedIn = ref(!!localStorage.getItem('token'))

onMounted(async () => {
  // 首屏校验，避免本地残留无效 token 导致误显示内容
  if (loggedIn.value) {
    try { await api.me() }
    catch { localStorage.removeItem('token'); localStorage.removeItem('user'); loggedIn.value = false }
  }
})

// 同页登录/退出事件
window.addEventListener('auth-changed', () => { loggedIn.value = !!localStorage.getItem('token') })
// 跨页（同源不同标签）事件
window.addEventListener('storage', () => { loggedIn.value = !!localStorage.getItem('token') })

const showChrome = computed(() => loggedIn.value && route.path !== '/login')
</script>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  grid-template-rows: 60px 1fr;
  height: 100vh;
}
.layout.collapsed {
  grid-template-columns: 72px 1fr;
}
.main {
  grid-column: 2 / 3;
  grid-row: 1 / 3;
  display: grid;
  grid-template-rows: 60px 1fr;
}
.content {
  overflow: auto;
  padding: 16px;
  background: var(--el-bg-color);
}
.login-only { min-height: 100vh; }
</style>