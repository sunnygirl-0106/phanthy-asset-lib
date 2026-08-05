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
  // 部署到 GitHub Pages 项目页时，静态资源位于 /<仓库名>/ 子路径下。
  // base 从 CI 的 GITHUB_REPOSITORY（owner/repo）自动取仓库名——这样同一份代码
  // 推到不同仓库（asset-lib-demo / phanthy-asset-lib）都能拿到正确子路径，不用手改。
  // 本地 dev / preview 用根路径 '/'。
  base:
    process.env.GITHUB_PAGES === 'true'
      ? `/${(process.env.GITHUB_REPOSITORY ?? 'sunnygirl-0106/asset-lib-demo').split('/')[1]}/`
      : '/',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
  },
})
