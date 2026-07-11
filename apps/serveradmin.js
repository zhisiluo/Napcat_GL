import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { parseCommand } from '../components/parser.js'
import { renderTable } from '../components/table.js'
import { formatError } from '../components/errors.js'

export class ServerAdmin extends plugin {
  constructor() {
    super({
      name: 'ngl-服务器管理',
      dsc: '管理远程服务器',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl服务器列表$', fnc: 'listServers', permission: 'master' },
        { reg: '^#ngl添加服务器\\s+\\S+\\s+\\S+\\s+\\S+\\s+\\S', fnc: 'addServer', permission: 'master' },
        { reg: '^#ngl删除服务器\\s+(\\S+)$', fnc: 'deleteServer', permission: 'master' },
        { reg: '^#ngl测试\\s+(\\S+)$', fnc: 'testServer', permission: 'master' },
        { reg: '^#ngl修改服务器\\s+(\\S+)\\s+(\\S+)\\s+(.+)$', fnc: 'editServer', permission: 'master' },
      ]
    })
  }

  async listServers(e) {
    if (!e.isMaster) return true
    try {
      const servers = await pool.list()
      if (!servers.length) { e.reply('暂无服务器，使用 #ngl添加服务器 添加'); return true }
      const rows = servers.map(s => {
        const cfg = pool.getServerConfig(s.name)
        return [
          s.name,
          s.connected ? '在线' : (cfg?.disabled ? '已禁用' : '离线'),
          String(s.instances || 0),
          cfg ? `${cfg.host}:${cfg.port}` : '-',
          (cfg?.tags || []).join(',') || '-',
        ]
      })
      e.reply(renderTable(['服务器', '状态', '实例', '地址', '标签'], rows))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async addServer(e) {
    if (!e.isMaster) return true
    const tokens = e.msg.trim().split(/\s+/)
    if (tokens.length < 5) { e.reply('用法: #ngl添加服务器 名称 host:port 用户名 密码'); return true }
    const [, name, hostport, username, ...rest] = tokens
    const secret = rest.join(' ')
    const colonIdx = hostport.lastIndexOf(':')
    const host = colonIdx > 0 ? hostport.slice(0, colonIdx) : hostport
    const port = colonIdx > 0 ? parseInt(hostport.slice(colonIdx + 1), 10) || 22 : 22
    const isPrivateKey = secret.includes('-----BEGIN') || secret.length > 120
    try {
      e.reply('正在验证连接...')
      const result = await pool.add(name, {
        host, port, username,
        password: isPrivateKey ? '' : secret,
        privateKey: isPrivateKey ? secret : '',
      })
      e.reply(result.success ? `服务器 ${name} 已添加` : `添加失败: [${result.code}] ${result.message}`)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async deleteServer(e) {
    if (!e.isMaster) return true
    const name = (e.msg.match(/^#ngl删除服务器\s+(\S+)$/) || [])[1]
    if (!pool.hasServer(name)) { e.reply(`服务器 ${name} 不存在`); return true }
    try {
      const r = await pool.remove(name)
      e.reply(r.success ? `服务器 ${name} 已删除` : `删除失败: [${r.code}] ${r.message}`)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async testServer(e) {
    if (!e.isMaster) return true
    const parsed = parseCommand(e.msg, pool)
    try {
      const start = Date.now()
      const client = await pool.get(parsed.server)
      const r = await client.executeCommand('echo ok')
      const latency = Date.now() - start
      const info = client.getConnectionInfo()
      if (r.success) {
        e.reply([
          `${parsed.server || info.host} 连接正常`,
          `延迟: ${latency}ms`,
          `主机: ${info.host}:${info.port}`,
          `用户: ${info.username}`,
        ].join('\n'))
      } else {
        e.reply(`连接异常: ${r.message}`)
      }
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async editServer(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl修改服务器\s+(\S+)\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl修改服务器 名称 key value'); return true }
    const [, name, key, value] = m
    if (!pool.hasServer(name)) { e.reply(`服务器 ${name} 不存在`); return true }
    const displayValue = key.toLowerCase().includes('password') ? '****' : value
    try {
      const r = await pool.updateConfig(name, key, value)
      e.reply(r.success ? `已修改 ${name}.${key} = ${displayValue}` : `修改失败: [${r.code}] ${r.message}`)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }
}
