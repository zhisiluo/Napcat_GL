import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError } from '../components/errors.js'
import { segment } from 'oicq'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export class ConfigSync extends plugin {
  constructor() {
    super({
      name: 'ngl-配置同步',
      dsc: '服务器间同步 NapCat 配置',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl同步配置\\s+(\\S+)\\s+(\\S+)$', fnc: 'syncConfig', permission: 'master' },
      ]
    })
  }

  async syncConfig(e) {
    if (!e.isMaster) return true
    const match = e.msg.match(/^#ngl同步配置\s+(\S+)\s+(\S+)$/)
    if (!match) { e.reply('用法: #ngl同步配置 <源服务器> <目标服务器>'); return true }

    const [, src, dst] = match
    if (src === dst) { e.reply('源服务器和目标服务器不能相同'); return true }

    let localPath = ''
    try {
      e.reply(`正在从 ${src} 同步配置到 ${dst}...`)

      const [srcClient, dstClient] = await Promise.all([pool.get(src), pool.get(dst)])
      const tarName     = `napcat_sync_${Date.now()}.tar.gz`
      const srcTmpPath  = `/tmp/${tarName}`
      const tarResult   = await srcClient.executeCommand(
        `cd "${srcClient.napcatConfigDir}/.." && tar -czf "${srcTmpPath}" config/ 2>&1 && echo "TAR_OK" || echo "TAR_FAIL"`
      )
      if (!tarResult.stdout?.includes('TAR_OK')) {
        e.reply(`打包源配置失败: ${tarResult.stderr || tarResult.stdout}`)
        return true
      }
      localPath = path.join(os.tmpdir(), tarName)
      const dl = await srcClient.downloadFile(srcTmpPath, localPath)
      if (!dl.success) {
        e.reply(`下载配置失败: ${dl.message}`)
        await srcClient.deletePath(srcTmpPath)
        return true
      }
      const dstTmpPath = `/tmp/${tarName}`
      const ul = await dstClient.uploadFile(localPath, dstTmpPath)
      if (!ul.success) {
        e.reply(`上传配置到目标失败: ${ul.message}`)
        fs.unlinkSync(localPath)
        await srcClient.deletePath(srcTmpPath)
        return true
      }
      const restore = await dstClient.executeCommand(
        `cd "${dstClient.napcatConfigDir}/.." && cp -r config/ "config_backup_before_sync_$(date +%s)" 2>/dev/null; ` +
        `tar -xzf "${dstTmpPath}" 2>&1 && echo "RESTORE_OK" || echo "RESTORE_FAIL"`,
        30000
      )
      if (!restore.stdout?.includes('RESTORE_OK')) {
        e.reply(`恢复配置失败: ${restore.stderr || restore.stdout}\n目标服务器原配置已自动备份`)
        fs.unlinkSync(localPath)
        await srcClient.deletePath(srcTmpPath)
        await dstClient.deletePath(dstTmpPath)
        return true
      }
      try {
        const mode = await dstClient.detectProcessMode()
        if (mode === 'wrapper') await dstClient.executeCommand('napcat restart 2>&1 || true', 30000)
      } catch {  }
      fs.unlinkSync(localPath)
      await srcClient.deletePath(srcTmpPath)
      await dstClient.deletePath(dstTmpPath)

      e.reply([
        `配置同步完成!`,
        `源:   ${src}`,
        `目标: ${dst}`,
        `目标 NapCat 已尝试重启，请用 #ngl状态 ${dst} 确认`,
      ].join('\n'))

    } catch (err) {
      if (localPath) { try { fs.unlinkSync(localPath) } catch {} }
      e.reply(`同步失败: ${formatError(err)}`)
    }
    return true
  }
}
