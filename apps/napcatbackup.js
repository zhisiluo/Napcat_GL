import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError } from '../components/errors.js'

export class NapcatBackup extends plugin {
  constructor() {
    super({
      name: 'ngl-备份管理',
      dsc: '管理 NapCat 配置备份',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl备份\\s+(\\S+)',                                          fnc: 'createBackup',  permission: 'master' },
        { reg: '^#ngl备份列表\\s+(\\S+)',                                       fnc: 'listBackups',   permission: 'master' },
        { reg: '^#ngl恢复\\s+(\\S+)\\s+([\\w.\\-]+\\.tar\\.gz)',               fnc: 'restoreBackup', permission: 'master' },
        { reg: '^#ngl删除备份\\s+(\\S+)\\s+([\\w.\\-]+\\.tar\\.gz)',           fnc: 'deleteBackup',  permission: 'master' },
      ]
    })
  }

  async createBackup(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl备份\s+(\S+)/)
    if (!m) { this.reply('用法: #ngl备份 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.backupConfigDir()
      this.reply(r.success ? `备份成功: ${r.backupFile}` : `备份失败: ${r.message}`)
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async listBackups(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl备份列表\s+(\S+)/)
    if (!m) { this.reply('用法: #ngl备份列表 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.listBackups()
      this.reply(r.success ? (r.listing || '无备份文件') : `获取失败: ${r.message}`)
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async restoreBackup(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl恢复\s+(\S+)\s+([\w.\-]+\.tar\.gz)/)
    if (!m) { this.reply('用法: #ngl恢复 服务器名 文件名.tar.gz'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.restoreConfigDir(m[2])
      this.reply(r.success ? `配置已从 ${m[2]} 恢复（原配置已自动备份）` : (r.stdout || r.message || '恢复失败'))
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async deleteBackup(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl删除备份\s+(\S+)\s+([\w.\-]+\.tar\.gz)/)
    if (!m) { this.reply('用法: #ngl删除备份 服务器名 文件名.tar.gz'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.deletePath(`${client.napcatConfigDir}/../backups/${m[2]}`)
      this.reply(r.success ? `备份 ${m[2]} 已删除` : (r.stdout || r.message || '删除失败'))
    } catch (err) { this.reply(formatError(err)) }
    return true
  }
}
