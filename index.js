/**
 * Napcat_GL - NapCat Global Load-balanced Manager
 *
 * 职责: 入口文件, 加载所有 app 模块, 打印启动信息
 * 依赖: 所有 apps/*.js 模块
 *
 * @author  Claude Code
 * @version 1.0.0
 * @since   2026-07-05
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ASCII logo
const ASCII_LOGO = `
███╗   ██╗ █████╗ ██████╗  ██████╗ █████╗ ████████╗   ██████╗ ██╗
████╗  ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗╚══██╔══╝   ██╔════╝ ██║
██╔██╗ ██║███████║██████╔╝██║     ███████║   ██║█████╗██║  ███╗██║
██║╚██╗██║██╔══██║██╔═══╝ ██║     ██╔══██║   ██║╚════╝██║   ██║██║
██║ ╚████║██║  ██║██║     ╚██████╗██║  ██║   ██║      ╚██████╔╝███████╗
╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝      ╚═════╝╚═╝  ╚═╝   ╚═╝       ╚═════╝ ╚═════╝
`

logger.mark(logger.green(ASCII_LOGO))

const startTime = process.hrtime()

// Plugin metadata (Yunzai framework reads this)
export const plugin = {
  name: 'napcat-gl',
  dsc: 'NapCat 全局负载均衡管理插件',
  event: 'message',
  priority: 5000,
  rule: []
}

// Scan and log apps directory
const appsDir = path.join(__dirname, 'apps')
let appCount = 0
try {
  const appFiles = fs.readdirSync(appsDir).filter(file => file.endsWith('.js'))
  appCount = appFiles.length
  for (const file of appFiles) {
    const appName = path.basename(file, '.js')
    logger.mark(logger.green(`[ngl] 加载子插件: ${appName}`))
  }
} catch (err) {
  logger.mark(logger.red(`[ngl] 加载 apps 目录失败: ${err.message}`))
}

// Import pool singleton to trigger ConnectionPool initialization
import pool from './components/sshpool.js'

// Show startup info
const endTime = process.hrtime(startTime)
const loadTime = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2)

logger.mark(logger.green('[ngl]------NapCat 全局管理器------'))
logger.mark(logger.green(`[ngl] NapCat GL 插件载入成功~`))
logger.mark(logger.green(`[ngl] 插件加载耗时: ${loadTime}ms`))
logger.mark(logger.green(`[ngl] 已加载 ${appCount} 个子插件`))

// Show loaded servers
const serverCount = Object.keys(pool._config?.servers || {}).length
const defaultServer = pool._config?.defaultServer || '(未设置)'
logger.mark(logger.green(`[ngl] 管理 ${serverCount} 台服务器, 默认: ${defaultServer}`))
logger.mark(logger.green('[ngl] 欢迎使用 NapCat 全局管理插件！'))
logger.mark(logger.green('[ngl]-------------------------------'))

// Re-export all app modules (static exports)
// Phase 2 apps:
export * from './apps/serveradmin.js'
export * from './apps/napcatmanager.js'
export * from './apps/napcatsystem.js'

// Phase 3 apps:
export * from './apps/napcatconfig.js'
export * from './apps/napcatplugin.js'
export * from './apps/napcatbackup.js'
export * from './apps/qqlogin.js'

// Phase 4 apps:
export * from './apps/accountmanager.js'
export * from './apps/napcatinstall.js'
export * from './apps/sync.js'
