import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError } from '../components/errors.js'
import { cleanTempFile } from '../components/utils.js'
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
        { reg: '^#ngl同步配置\\s+(\\S+)\\s+(\\S+)', fnc: 'syncConfig', permission: 'master' },
      ]
    })
  }

  async syncConfig(e) {
    if (!e.isMaster) return true
    const match = e.msg.match(/^#ngl同步配置\s+(\S+)\s+(\S+)/)
    if (!match) { this.reply('用法: #ngl同步配置 源服务器 目标服务器'); return true }

    const [, src, dst] = match
    if (src === dst) { this.reply('源服务器和目标服务器不能相同'); return true }

    let localPath = ''
    let srcClient = null, dstClient = null
    let srcTmpPath = '', dstTmpPath = ''
    try {
      this.reply(`正在从 ${src} 同步配置到 ${dst}...`)

      ;[srcClient, dstClient] = await Promise.all([pool.get(src), pool.get(dst)])
      const tarName = `napcat_sync_${Date.now()}.tar.gz`
      srcTmpPath = `/tmp/${tarName}`
      const srcConfigName = srcClient.napcatConfigDir.split('/').filter(Boolean).pop() || 'config'
      const tarResult = await srcClient.executeCommand(
        `tar -czf "${srcTmpPath}" -C "${srcClient.napcatConfigDir}/.." "${srcConfigName}" 2>&1 && echo "TAR_OK" || echo "TAR_FAIL"`
      )
      if (!tarResult.stdout?.includes('TAR_OK')) {
        this.reply(`打包源配置失败: ${tarResult.stderr || tarResult.stdout}`)
        await srcClient.deletePath(srcTmpPath); srcTmpPath = ''
        return true
      }
      localPath = path.join(os.tmpdir(), tarName)
      const dl = await srcClient.downloadFile(srcTmpPath, localPath)
      if (!dl.success) {
        this.reply(`下载配置失败: ${dl.message}`)
        await srcClient.deletePath(srcTmpPath); srcTmpPath = ''
        return true
      }
      dstTmpPath = `/tmp/${tarName}`
      const ul = await dstClient.uploadFile(localPath, dstTmpPath)
      if (!ul.success) {
        this.reply(`上传配置到目标失败: ${ul.message}`)
        fs.unlinkSync(localPath); localPath = ''
        await srcClient.deletePath(srcTmpPath); srcTmpPath = ''
        return true
      }
      const dstConfigName = dstClient.napcatConfigDir.split('/').filter(Boolean).pop() || 'config'
      const restore = await dstClient.executeCommand(
        `cd "${dstClient.napcatConfigDir}/.." && cp -r "${dstConfigName}/" "${dstConfigName}_backup_before_sync_$(date +%s)" 2>/dev/null; ` +
        `tar -xzf "${dstTmpPath}" -C "${dstClient.napcatConfigDir}/.." 2>&1 && echo "RESTORE_OK" || echo "RESTORE_FAIL"`,
        30000
      )
      if (!restore.stdout?.includes('RESTORE_OK')) {
        this.reply(`恢复配置失败: ${restore.stderr || restore.stdout}\n目标服务器原配置已自动备份`)
        fs.unlinkSync(localPath); localPath = ''
        await srcClient.deletePath(srcTmpPath); srcTmpPath = ''
        await dstClient.deletePath(dstTmpPath); dstTmpPath = ''
        return true
      }
      let mode = 'unknown'
      try {
        mode = await dstClient.detectProcessMode()
        if (mode === 'wrapper') await dstClient.executeCommand('napcat restart 2>&1 || true', 30000)
      } catch (err) { logger.warn(`[ngl] 同步后重启失败: ${err.message}`) }
      cleanTempFile(localPath); localPath = ''
      await srcClient.deletePath(srcTmpPath); srcTmpPath = ''
      await dstClient.deletePath(dstTmpPath); dstTmpPath = ''

      const restartMsg = mode === 'wrapper' ? '目标 NapCat 已尝试重启' : `目标 NapCat 未自动重启 (模式: ${mode})，请手动重启`
      this.reply([
        `配置同步完成!`,
        `源:   ${src}`,
        `目标: ${dst}`,
        `${restartMsg}，请用 #ngl状态 ${dst} 确认`,
      ].join('\n'))

    } catch (err) {
      if (localPath) cleanTempFile(localPath)
      if (srcClient && srcTmpPath) await srcClient.deletePath(srcTmpPath).catch(() => {})
      if (dstClient && dstTmpPath) await dstClient.deletePath(dstTmpPath).catch(() => {})
      this.reply(formatError(err))
    }
    return true
  }
}
