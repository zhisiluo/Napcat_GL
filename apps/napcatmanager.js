import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { parseCommand } from '../components/parser.js'
import { renderTable } from '../components/table.js'
import { formatError, parseNapcatError } from '../components/errors.js'

export class NapcatManager extends plugin {
  constructor() {
    super({
      name: 'ngl-服务管理',
      dsc: '管理远程 NapCat 服务',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl状态$|^#ngl状态\\s+(\\S+)(\\s+(\\d+))?', fnc: 'napcatStatus', permission: 'master' },
        { reg: '^#ngl(启动|停止|重启|日志)\\s+(\\S+)\\s+(\\d+)', fnc: 'napcatAction', permission: 'master' },
        { reg: '^#ngl强制停止\\s+(\\S+)\\s+(\\d+)', fnc: 'napcatKill', permission: 'master' },
        { reg: '^#ngl更新\\s+(\\S+)', fnc: 'napcatUpdate', permission: 'master' },
      ]
    })
  }

  async napcatStatus(e) {
    if (!e.isMaster) return true
    const parsed = parseCommand(e.msg, pool)
    try {
      if (!parsed.server) {
        const servers = await pool.list()
        if (!servers.length) { this.reply('暂无服务器'); return true }
        const rows = servers.map(s => [
          s.name,
          s.connected ? '在线' : (s.error || '离线'),
          String(s.instances),
          (s.accounts || []).join(' ') || '-',
        ])
        this.reply(renderTable(['服务器', '状态', '实例', '账号'], rows))
      } else if (parsed.server === 'all') {
        const servers = await pool.list()
        const online = servers.filter(s => s.connected)
        if (!online.length) { this.reply('暂无在线服务器'); return true }
        const rows = online.map(s => [s.name, String(s.instances), (s.accounts || []).join(' ') || '-'])
        this.reply(renderTable(['名称', '实例', '账号'], rows))
      } else {
        const client = await pool.get(parsed.server)
        const qq = parsed.params[0]
        const r = await client.napcatStatus(qq)
        this.reply(r.success ? (r.stdout || '无运行中的实例') : (r.stdout || r.stderr || r.message || '查询失败'))
      }
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async napcatAction(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl(启动|停止|重启|日志)\s+(\S+)\s+(\d+)/)
    if (!m) { this.reply('用法: #ngl启动|停止|重启|日志 服务器名 QQ'); return true }
    const [, action, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      if (action === '日志') return this._handleLog(e, client, qq)
      const actionMap = { '启动': 'startInstance', '停止': 'stopInstance', '重启': 'restartInstance' }
      const method = actionMap[action]
      if (!method) { this.reply(`不支持的操作: ${action}`); return true }
      const r = await client[method](qq)
      this.reply(r && r.success ? `QQ ${qq} ${action}: ${r.stdout || '完成'}` : parseNapcatError(r, qq, serverName))
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async napcatKill(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl强制停止\s+(\S+)\s+(\d+)/)
    if (!m) { this.reply('用法: #ngl强制停止 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const r = await client.napcatKill(qq)
      this.reply(r.success ? `QQ ${qq} 已强制终止` : parseNapcatError(r, qq, serverName))
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async napcatUpdate(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl更新\s+(\S+)/)
    if (!m) { this.reply('用法: #ngl更新 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const mode = await client.detectProcessMode()
      const r = mode === 'docker'
        ? await client.executeCommand('docker pull mlikiowa/napcat-docker:latest 2>&1')
        : await client.napcatUpdate()
      this.reply(r.success ? `更新完成:\n${r.stdout}` : (r.stdout || r.stderr || r.message || '更新失败'))
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async _handleLog(e, client, qq) {
    const TIMEOUT = 60000
    let buf = [], stopped = false
    const cleanup = () => { if (stopped) return; stopped = true; client.stopLogStream() }
    const timer = setTimeout(() => {
      if (stopped) return
      cleanup()
      const lines = buf.join('').split('\n').filter(l => l.trim()).slice(-100)
      this.reply(lines.join('\n') || `QQ ${qq} 无日志`)
    }, TIMEOUT)
    try {
      client.getLogStream(qq,
        d => buf.push(d),
        err => { cleanup(); clearTimeout(timer); this.reply(`日志错误: ${err}`) },
        () => { if (!stopped) { cleanup(); clearTimeout(timer); const lines = buf.join('').split('\n').filter(l => l.trim()).slice(-100); this.reply(lines.join('\n') || `QQ ${qq} 无日志`) } }
      )
    } catch (err) {
      clearTimeout(timer)
      try { cleanup() } catch {}
      this.reply(formatError(err))
    }
    return true
  }
}
