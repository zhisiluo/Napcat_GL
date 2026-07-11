import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { renderTable } from '../components/table.js'
import { formatError } from '../components/errors.js'

export class NapcatConfig extends plugin {
  constructor() {
    super({
      name: 'ngl-配置管理',
      dsc: '管理远程 NapCat 配置文件',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl查看配置\\s+(\\S+)$',                                              fnc: 'viewGlobalConfig',   permission: 'master' },
        { reg: '^#ngl修改配置\\s+(\\S+)\\s+(\\S+)\\s+(.+)$',                           fnc: 'editGlobalConfig',   permission: 'master' },
        { reg: '^#ngl账号列表$',                                                        fnc: 'listAllAccounts',    permission: 'master' },
        { reg: '^#ngl查看账号配置\\s+(\\S+)\\s+(\\d+)$',                               fnc: 'viewAccountConfig',  permission: 'master' },
        { reg: '^#ngl修改账号配置\\s+(\\S+)\\s+(\\d+)\\s+(\\S+)\\s+(.+)$',            fnc: 'editAccountConfig',  permission: 'master' },
        { reg: '^#ngl查看OB11\\s+(\\S+)\\s+(\\d+)$',                                  fnc: 'viewOB11Config',     permission: 'master' },
        { reg: '^#ngl修改OB11\\s+(\\S+)\\s+(\\d+)\\s+(\\S+)\\s+(.+)$',               fnc: 'editOB11Config',     permission: 'master' },
        { reg: '^#ngl查看WebUI\\s+(\\S+)$',                                            fnc: 'viewWebUI',          permission: 'master' },
        { reg: '^#ngl修改WebUI\\s+(\\S+)\\s+(\\S+)\\s+(.+)$',                         fnc: 'editWebUI',          permission: 'master' },
        { reg: '^#ngl配置文件列表\\s+(\\S+)$',                                         fnc: 'listConfigFiles',    permission: 'master' },
        { reg: '^#ngl配置目录\\s+(\\S+)$',                                             fnc: 'showConfigDir',      permission: 'master' },
      ]
    })
  }

  
  setNested(obj, keyPath, value) {
    const keys = keyPath.split('.')
    for (const k of keys) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        throw new Error(`非法配置键: ${k}`)
      }
    }
    let cur = obj
    for (let i = 0; i < keys.length - 1; i++) {
      if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {}
      cur = cur[keys[i]]
    }
    const last = keys[keys.length - 1]
    const old  = cur[last]
    let v = value
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1)
    } else if (v === 'true') v = true
    else if (v === 'false') v = false
    else if (v === 'null') v = null
    else if (/^-?\d+(\.\d+)?$/.test(v)) v = Number(v)
    cur[last] = v
    return { obj, old, newValue: v }
  }

  async viewGlobalConfig(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl查看配置\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl查看配置 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.readNapCatGlobalConfig()
      e.reply(r.success ? JSON.stringify(r.data, null, 2) : r.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async editGlobalConfig(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl修改配置\s+(\S+)\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl修改配置 服务器名 key value'); return true }
    const [, serverName, key, value] = m
    try {
      const client = await pool.get(serverName)
      const r = await client.readNapCatGlobalConfig()
      if (!r.success) { e.reply(r.message); return true }
      const { obj, old, newValue: n } = this.setNested(r.data, key, value)
      const w = await client.writeNapCatGlobalConfig(obj, r.path)
      e.reply(w.success ? `${key}: ${JSON.stringify(old)} → ${JSON.stringify(n)}` : w.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async listAllAccounts(e) {
    if (!e.isMaster) return true
    try {
      const servers = await pool.list()
      if (!servers.length) { e.reply('暂无服务器'); return true }
      const online = servers.filter(s => s.connected)
      if (!online.length) { e.reply('暂无在线服务器'); return true }

      const rows = []
      for (const s of online) {
        try {
          const client = await pool.get(s.name)
          const r = await client.listNapCatAccounts()
          if (r.success && r.accounts.length) {
            for (const acc of r.accounts) {
              const st = await client.isNapCatRunning(acc)
              rows.push([s.name, acc, st.running ? '运行中' : '已停止'])
            }
          } else {
            rows.push([s.name, '-', '无账号'])
          }
        } catch (err) {
          rows.push([s.name, '-', err.message])
        }
      }
      e.reply(renderTable(['服务器', 'QQ', '状态'], rows))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async viewAccountConfig(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl查看账号配置\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl查看账号配置 服务器名 QQ'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.readNapCatAccountConfig(m[2])
      e.reply(r.success ? JSON.stringify(r.data, null, 2) : r.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async viewWebUI(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl查看WebUI\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl查看WebUI 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.readWebUIConfig()
      if (!r.success) { e.reply(r.message); return true }
      const d = { ...r.data }
      if (d.token) d.token = d.token.length > 8 ? d.token.slice(0,4)+'****'+d.token.slice(-4) : '****'
      e.reply(JSON.stringify(d, null, 2))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async editWebUI(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl修改WebUI\s+(\S+)\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl修改WebUI 服务器名 key value'); return true }
    const [, serverName, key, value] = m
    if (['token','totpSecret'].includes(key)) { e.reply(`${key} 为敏感字段，请手动编辑`); return true }
    try {
      const client = await pool.get(serverName)
      const r = await client.readWebUIConfig()
      if (!r.success) { e.reply(r.message); return true }
      const { obj, old, newValue: n } = this.setNested(r.data, key, value)
      const w = await client.writeWebUIConfig(obj, r.path)
      client.clearWebUIToken()
      e.reply(w.success ? `WebUI ${key}: ${JSON.stringify(old)} → ${JSON.stringify(n)}` : w.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async editAccountConfig(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl修改账号配置\s+(\S+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl修改账号配置 服务器名 QQ key value'); return true }
    const [, serverName, qq, key, value] = m
    try {
      const client = await pool.get(serverName)
      const r = await client.readNapCatAccountConfig(qq)
      if (!r.success) { e.reply(r.message); return true }
      const { obj, old, newValue: n } = this.setNested(r.data, key, value)
      const w = await client.writeNapCatAccountConfig(qq, obj, r.path)
      e.reply(w.success ? `QQ ${qq} ${key}: ${JSON.stringify(old)} → ${JSON.stringify(n)}` : w.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async viewOB11Config(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl查看OB11\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl查看OB11 服务器名 QQ'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.readOB11Config(m[2])
      e.reply(r.success ? JSON.stringify(r.data, null, 2) : r.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }
  async editOB11Config(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl修改OB11\s+(\S+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl修改OB11 服务器名 QQ key value'); return true }
    const [, serverName, qq, key, value] = m
    try {
      const client = await pool.get(serverName)
      const r = await client.readOB11Config(qq)
      if (!r.success) { e.reply(r.message); return true }
      const { obj, old, newValue: n } = this.setNested(r.data, key, value)
      const w = await client.writeOB11Config(qq, obj, r.path)
      e.reply(w.success ? `QQ ${qq} OB11 ${key}: ${JSON.stringify(old)} → ${JSON.stringify(n)}` : w.message)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async listConfigFiles(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl配置文件列表\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl配置文件列表 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.listConfigFiles()
      if (!r.success) { e.reply(r.message); return true }
      const lines = r.listing.split('\n')
        .filter(l => l.trim() && !l.startsWith('total'))
        .map(l => { const p = l.trim().split(/\s+/); return p.length >= 9 ? `${p[4].padEnd(6)} ${p[5]} ${p[6]} ${p[7].padEnd(5)} ${p.slice(8).join(' ')}` : l })
      e.reply(lines.length ? `配置目录:\n${lines.join('\n')}` : '配置目录为空')
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async showConfigDir(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl配置目录\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl配置目录 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const wp = await client.getWebUIPort()
      e.reply(`配置: ${client.getConfigDir()}\nWebUI 端口: ${wp}`)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }
}
