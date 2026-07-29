/**
 * 返回 public/ 下资源在当前部署环境中的真实 URL。
 *
 * GitHub Pages 的项目页会挂在仓库名子路径下；不能直接写 `/assets/...`，
 * 否则浏览器会从域名根目录请求资源。
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}
