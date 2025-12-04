import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 引入 Element Plus 暗色主题 CSS 变量，配合 html.dark 切换
import 'element-plus/theme-chalk/dark/css-vars.css'
import router from './router/index.js'
import App from './App.vue'
import './styles/main.scss'
import 'highlight.js/styles/github-dark.css'
// 全局引入 Quill 样式，确保查看页与编辑页富文本样式一致
import 'quill/dist/quill.snow.css'

const app = createApp(App)
app.use(router)
app.use(createPinia())
app.use(ElementPlus)
app.mount('#app')

// 初始化主题（浅色/深色），从本地存储读取并应用
const initialTheme = localStorage.getItem('theme') || 'light'
if (initialTheme === 'dark') {
  document.documentElement.classList.add('dark')
} else {
  document.documentElement.classList.remove('dark')
}