import { createRouter, createWebHashHistory } from 'vue-router'
import { api } from '../services/api.js'

const Dashboard = () => import('../pages/Dashboard.vue')
const DocumentsList = () => import('../pages/DocumentsList.vue')
const Editor = () => import('../pages/Editor.vue')
const DocumentView = () => import('../pages/DocumentView.vue')
const Categories = () => import('../pages/Categories.vue')
const Bookmarks = () => import('../pages/Bookmarks.vue')
const SystemSettings = () => import('../pages/SystemSettings.vue')
const Login = () => import('../pages/Login.vue')

const routes = [
  {
    path: '/',
    name: 'dashboard',
    component: Dashboard,
    meta: { title: '仪表板', requireAuth: true }
  },
  {
    path: '/documents',
    name: 'documents',
    component: DocumentsList,
    meta: { title: '文档列表', requireAuth: true }
  },
  {
    path: '/editor/:id?',
    name: 'editor',
    component: Editor,
    meta: { title: '编辑文档', requireAuth: true }
  }
  ,
  {
    path: '/view/:id',
    name: 'view',
    component: DocumentView,
    meta: { title: '查看文档', requireAuth: true }
  }
  ,
  {
    path: '/categories',
    name: 'categories',
    component: Categories,
    meta: { title: '分类管理', requireAuth: true }
  }
  ,
  {
    path: '/bookmarks',
    name: 'bookmarks',
    component: Bookmarks,
    meta: { title: '网站收藏夹', requireAuth: true }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SystemSettings,
    meta: { title: '系统设置', requireAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: Login,
    meta: { title: '登录' }
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.beforeEach(async (to, from, next) => {
  if (to.meta?.title) document.title = `ZSK - ${to.meta.title}`
  const token = localStorage.getItem('token')
  if (!token && to.path !== '/login') {
    return next({ path: '/login', query: { redirect: to.fullPath } })
  }
  // 校验 token 有效性，避免无效 token 仍可访问内容
  if (token && to.path !== '/login') {
    try {
      await api.me()
    } catch (e) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      return next({ path: '/login', query: { redirect: to.fullPath } })
    }
  }
  next()
})

export default router