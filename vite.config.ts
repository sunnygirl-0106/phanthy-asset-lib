/**
 * Vite 配置文件。
 * - 插件 react() 让 Vite 认识 .tsx / JSX 语法。
 * - test 段是给 vitest 用的：globals: true 让我们在测试里可以直接写
 *   describe / it / expect，不用每个文件手动 import。
 *   environment: 'node' 表示逻辑内核的测试跑在纯 Node 环境即可（不需要浏览器 DOM）。
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // 部署到 GitHub Pages 项目页时，静态资源位于 /asset-lib-demo/ 子路径下。
  // 本地 dev / preview 用根路径 '/'，CI 构建时通过环境变量切到子路径。
  base: process.env.GITHUB_PAGES === 'true' ? '/asset-lib-demo/' : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
})
