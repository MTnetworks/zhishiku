<template>
  <div class="login-page" :class="{ 'bg-alt': useAltBg }">
    <div class="bg-switch">
      <a href="#" @click.prevent="useAltBg = !useAltBg">{{ useAltBg ? '切换到背景1' : '切换到背景2' }}</a>
    </div>
    <div class="status-bar" :class="statusClass">
      <span class="origin">后端：{{ serverOrigin }}</span>
      <span class="sep">·</span>
      <span class="state">状态：{{ healthText }}</span>
      <span v-if="errorText" class="err">（{{ errorText }}）</span>
      <el-link type="primary" @click="checkHealth" class="action">刷新</el-link>
    </div>
    <div class="login-shell">
      <div class="hero">
        <div class="hero-inner">
          <div class="brand">
            <div class="logo">ZSK</div>
            <div class="title">知识库平台</div>
          </div>
          <div class="slogan">高效协作 · 安全管理 · 即刻启用</div>
          <ul class="features">
            <li>文档编辑与预览</li>
            <li>分类与标签管理</li>
            <li>多人协同与权限控制</li>
            <li>网站收藏夹</li>
          </ul>
        </div>
      </div>
      <div class="form-col">
        <el-card class="box-card">
          <template #header>
            <div class="card-header">
              <span>登录你的账户</span>
            </div>
          </template>
          <el-form :model="form" label-width="0" @submit.prevent="onLogin" class="login-form">
            <el-form-item>
              <el-input v-model="form.username" placeholder="用户名" size="large" />
            </el-form-item>
            <el-form-item>
              <el-input v-model="form.password" type="password" placeholder="密码" size="large" show-password />
            </el-form-item>
            <div class="actions">
              <el-button type="primary" size="large" :loading="loading" native-type="submit" @click="onLogin" class="btn-primary">登录</el-button>
              <el-button size="large" :loading="loading" @click="onRegister" class="btn-secondary">注册并登录</el-button>
            </div>
            <div class="help">
              <el-link type="primary" @click="forgotVisible = true">忘记密码？</el-link>
            </div>
            <div class="sub-actions">
              <el-input v-model="form.name" placeholder="昵称（可选）" />
              <el-input v-model="form.email" placeholder="邮箱（可选，用于分享识别）" />
            </div>
            <div class="social">
              <div class="tip">社交登录（占位）</div>
              <div class="social-buttons">
                <el-button round plain @click="pendingSocial('GitHub')">GitHub</el-button>
                <el-button round plain @click="pendingSocial('Google')">Google</el-button>
                <el-button round plain @click="pendingSocial('微信')">微信</el-button>
              </div>
            </div>
          </el-form>
        </el-card>
      </div>
    </div>
    <el-dialog v-model="forgotVisible" title="找回密码" width="420px">
      <el-form :model="forgotForm" label-width="80px">
        <el-form-item label="用户名">
          <el-input v-model="forgotForm.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="forgotForm.email" placeholder="请输入绑定邮箱" />
        </el-form-item>
        <el-form-item label="新密码">
          <el-input v-model="forgotForm.newPassword" type="password" show-password placeholder="设置新密码" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="forgotVisible = false">取消</el-button>
        <el-button type="primary" @click="onResetByEmail">提交重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { api } from '../services/api.js'

const router = useRouter()
const form = reactive({ username: '', password: '', name: '', email: '' })
const loading = ref(false)
const forgotVisible = ref(false)
const forgotForm = reactive({ username: '', email: '', newPassword: '' })
const useAltBg = ref(false)

function pickOrigin(){
  const w = typeof window !== 'undefined' ? window : {}
  const z = w.ZSK || {}
  const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}
  return (w.ZSK_SERVER_ORIGIN || z.SERVER_ORIGIN || env.VITE_API_BASE || (w.location && w.location.origin) || 'http://localhost:3000')
}
const serverOrigin = ref(pickOrigin())
const health = ref('unknown')
const errorText = ref('')
const healthText = computed(() => health.value === 'ok' ? '正常' : (health.value === 'fail' ? '失败' : '未知'))
const statusClass = computed(() => health.value === 'ok' ? 'ok' : (health.value === 'fail' ? 'fail' : 'unknown'))

async function checkHealth(){
  errorText.value = ''
  const url = `${serverOrigin.value}/api/health`
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    if (data && data.ok) {
      health.value = 'ok'
      if (data.origin) {
        window.ZSK_SERVER_ORIGIN = data.origin
        serverOrigin.value = data.origin
      }
      return
    }
    health.value = 'fail'
    errorText.value = '后端未就绪'
  } catch (e) {
    const clientLocal = typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    const isLocalhost = url.startsWith('http://localhost:')
    if (clientLocal && isLocalhost) {
      try {
        const alt = url.replace('http://localhost', 'http://127.0.0.1')
        const res2 = await fetch(alt)
        if (!res2.ok) throw new Error(await res2.text())
        const data2 = await res2.json()
        if (data2 && data2.ok) { health.value = 'ok'; return }
      } catch {}
    }
    if (clientLocal) {
      try {
        for (let p = 3000; p <= 3020; p++) {
          const test = `http://127.0.0.1:${p}/api/health`
          try {
            const r = await fetch(test)
            if (r.ok) {
              const d = await r.json()
              if (d && d.ok) {
                const found = `http://127.0.0.1:${p}`
                window.ZSK_SERVER_ORIGIN = found
                serverOrigin.value = found
                health.value = 'ok'
                return
              }
            }
          } catch {}
        }
      } catch {}
    }
    health.value = 'fail'
    const msg = e && e.message ? String(e.message) : 'Failed to fetch'
    errorText.value = msg
  }
}

onMounted(() => {
  const saved = localStorage.getItem('bgAlt')
  useAltBg.value = saved === '1'
})
watch(useAltBg, (v) => {
  localStorage.setItem('bgAlt', v ? '1' : '0')
})

function zhAuthError(e){
  let raw
  const data = e?.response?.data
  if (data) {
    if (typeof data === 'string') {
      try { const obj = JSON.parse(data); raw = obj?.message || data } catch { raw = data }
    } else if (typeof data === 'object') {
      raw = data.message || JSON.stringify(data)
    }
  }
  if (!raw) {
    const msg = e?.message
    if (typeof msg === 'string') {
      try { const obj = JSON.parse(msg); raw = obj?.message || msg } catch { raw = msg }
    } else if (typeof e === 'string') {
      raw = e
    }
  }
  const s = String(raw || '').toLowerCase()
  const pairs = [
    ['invalid credentials', '用户名或密码错误'],
    ['user exists', '用户名已被占用'],
    ['missing fields', '请填写完整信息'],
    ['invalid email', '邮箱格式不正确'],
    ['not found', '用户不存在'],
    ['unauthorized', '未授权或会话已过期'],
    ['forbidden', '权限不足'],
    ['network', '网络异常，请稍后重试'],
  ]
  for (const [key, value] of pairs) {
    if (s.includes(key)) return value
  }
  return raw ? `请求失败（${raw}）` : '请求失败，请稍后重试'
}

onMounted(async () => {
  serverOrigin.value = pickOrigin()
  setInterval(() => { const o = pickOrigin(); if (o !== serverOrigin.value) serverOrigin.value = o }, 2000)
  checkHealth()
  setInterval(checkHealth, 5000)
  const token = localStorage.getItem('token')
  if (token) {
    try {
      await api.me()
      router.replace('/documents')
    } catch {}
  }
})

async function onLogin(){
  if (!form.username || !form.password) return ElMessage.warning('请输入用户名和密码')
  loading.value = true
  try {
    const { token, user } = await api.login(form.username, form.password)
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    window.dispatchEvent(new Event('auth-changed'))
    ElMessage.success('登录成功')
    router.replace('/documents')
  } catch (e) {
    ElMessage.error('登录失败：' + zhAuthError(e))
  } finally {
    loading.value = false
  }
}

async function onRegister(){
  if (!form.username || !form.password) return ElMessage.warning('请输入用户名和密码')
  loading.value = true
  try {
    const { token, user } = await api.register(form.username, form.password, form.name, form.email || null)
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))
    window.dispatchEvent(new Event('auth-changed'))
    ElMessage.success('注册并登录成功')
    router.replace('/documents')
  } catch (e) {
    ElMessage.error('注册失败：' + zhAuthError(e))
  } finally {
    loading.value = false
  }
}

function pendingSocial(name){
  ElMessage.info(`${name} 登录暂未开通`)
}

async function onResetByEmail(){
  const { username, email, newPassword } = forgotForm
  if (!username || !email || !newPassword) return ElMessage.warning('请填写用户名、邮箱和新密码')
  try {
    await api.resetByEmail(username, email, newPassword)
    ElMessage.success('密码已重置，请使用新密码登录')
    forgotVisible.value = false
  } catch (e) {
    ElMessage.error('重置失败：' + zhAuthError(e))
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  /* 更现代化背景：淡雅图片 + 轻动效遮罩 */
  background-image: url('/src/styles/zsk.png');
  background-size: cover;
  background-position: center;
  position: relative;
}
.login-page.bg-alt {
  /* 科技简约风  https://images.unsplash.com/photo-1504384308090-c894fdcc538d?q=80&w=1600&auto=format&fit=crop */
  /* 科技简约风  https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D */
  background-image: url('https://images.unsplash.com/photo-1522071820081-009f0129c71c?q=80&w=1600&auto=format&fit=crop');
}
.bg-switch {
  position: absolute; top: 12px; right: 12px; z-index: 5;
}
.bg-switch a { color: #fff; text-decoration: underline; opacity: 0.85; }
.bg-switch a:hover { opacity: 1; }
.status-bar { position: absolute; top: 12px; left: 12px; z-index: 6; display:flex; gap:8px; align-items:center; padding:6px 10px; border-radius:8px; backdrop-filter: saturate(180%) blur(4px); font-size: 13px; }
.status-bar.ok { background: rgba(103, 194, 58, 0.25); color:#fff; }
.status-bar.fail { background: rgba(245, 108, 108, 0.35); color:#fff; }
.status-bar.unknown { background: rgba(255, 255, 255, 0.25); color:#fff; }
.status-bar .sep { opacity: 0.8 }
.status-bar .err { opacity: 0.9 }
.status-bar .action { margin-left: 4px }
.login-page::before {
  content: "";
  position: absolute; inset: 0;
  background: radial-gradient(1200px 600px at 10% 10%, rgba(255,255,255,0.35), rgba(255,255,255,0) 60%),
              radial-gradient(1000px 500px at 90% 90%, rgba(255,255,255,0.25), rgba(255,255,255,0) 60%),
              rgba(0,0,0,0.25);
  pointer-events: none;
}
.login-shell { position: relative; z-index: 1; display:grid; grid-template-columns: 1.2fr 1fr; min-height: 100vh; }
.hero { display:flex; align-items:center; justify-content:center; padding: 48px; }
.hero-inner { color:#fff; max-width: 560px; }
.brand { display:flex; align-items:center; gap: 12px; margin-bottom: 12px; }
.logo { width: 42px; height: 42px; border-radius: 10px; background: #409EFF; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; }
.title { font-size: 20px; font-weight: 700; opacity: 0.95; }
.slogan { font-size: 28px; font-weight: 700; margin-top: 8px; }
.features { margin-top: 16px; opacity: 0.9; }
.features li { line-height: 1.8; }
.form-col { display:flex; align-items:center; justify-content:center; }
.box-card { width: 480px; border-radius: 16px; }
.login-form { padding-top: 8px; }
.actions { display:flex; gap: 12px; margin-top: 8px; }
.sub-actions { display:flex; gap: 12px; margin-top: 12px; }
.social { margin-top: 16px; }
.social .tip { color: var(--el-text-color-secondary); margin-bottom: 8px; }
.social-buttons { display:flex; gap: 8px; }
.btn-primary { flex:1; }
.btn-secondary { flex:1; }
.help { margin-top: 8px; }
</style>
