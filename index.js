import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
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
export const plugin = {
  name: 'napcat-gl',
  dsc: 'NapCat 全局负载均衡管理插件',
  event: 'message',
  priority: 5000,
  rule: []
}
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
import pool from './components/sshpool.js'
const endTime = process.hrtime(startTime)
const loadTime = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2)

logger.mark(logger.green('[ngl]------NapCat 全局管理器------'))
logger.mark(logger.green(`[ngl] NapCat GL 插件载入成功~`))
logger.mark(logger.green(`[ngl] 插件加载耗时: ${loadTime}ms`))
logger.mark(logger.green(`[ngl] 已加载 ${appCount} 个子插件`))
const serverCount = pool.serverCount
logger.mark(logger.green(`[ngl] 管理 ${serverCount} 台服务器`))
logger.mark(logger.green('[ngl] 欢迎使用 NapCat 全局管理插件！'))
logger.mark(logger.green('[ngl]-------------------------------'))
export * from './apps/serveradmin.js'
export * from './apps/napcatmanager.js'
export * from './apps/napcatsystem.js'
export * from './apps/napcatconfig.js'
export * from './apps/napcatplugin.js'
export * from './apps/napcatbackup.js'
export * from './apps/accountmanager.js'
export * from './apps/napcatinstall.js'
export * from './apps/sync.js'
export * from './apps/help.js'
export * from './apps/update.js'
