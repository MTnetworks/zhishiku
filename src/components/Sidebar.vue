<template>
  <aside class="sidebar" :class="{ collapsed }">
    <div class="brand">知识库管理系统</div>
    <el-menu :default-active="active" class="menu" :collapse="collapsed" router>
      <el-menu-item index="/">
        <el-icon><DataAnalysis /></el-icon>
        <span>仪表板</span>
      </el-menu-item>
      <el-menu-item index="/documents">
        <el-icon><Document /></el-icon>
        <span>文档列表</span>
      </el-menu-item>
      <el-menu-item index="/editor">
        <el-icon><EditPen /></el-icon>
        <span>新建文档</span>
      </el-menu-item>
      <el-menu-item index="/categories">
        <el-icon><Document /></el-icon>
        <span>分类管理</span>
      </el-menu-item>
      <el-menu-item index="/bookmarks">
        <el-icon><Link /></el-icon>
        <span>网站收藏夹</span>
      </el-menu-item>
      <el-menu-item index="/settings">
        <el-icon><Setting /></el-icon>
        <span>系统设置</span>
      </el-menu-item>
    </el-menu>
    <div class="collapse-toggle">
      <el-button text size="small" @click="$emit('toggle')">
        {{ collapsed ? '展开' : '折叠' }}
      </el-button>
    </div>
  </aside>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { DataAnalysis, Document, EditPen, Link, Setting } from '@element-plus/icons-vue'
const props = defineProps({ collapsed: Boolean })
const route = useRoute()
const active = route.path
</script>

<style scoped>
.sidebar {
  grid-column: 1 / 2;
  grid-row: 1 / 3;
  border-right: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  display: flex;
  flex-direction: column;
  box-shadow: 0 0 0 1px var(--el-border-color) inset;
}
.brand {
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 400;
  letter-spacing: 5px;
  font-size: 25px;
}
.menu { flex: 1; }
.menu :deep(.el-menu-item) { height: 42px; line-height: 42px; gap: 8px; }
.menu :deep(.el-menu-item.is-active) { border-left: 3px solid var(--el-color-primary); background: var(--el-fill-color-light); }
.menu :deep(.el-menu-item:hover) { background: var(--el-fill-color-light); }
.collapse-toggle { padding: 8px; text-align: center; }
.collapsed .brand { font-size: 12px; }
</style>