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
        { reg: '^#ngl状态$|^#ngl状态\\s+(\\S+)(\\s+(\\d+))?$', fnc: 'napcatStatus', permission: 'master' },
        { reg: '^#ngl(启动|停止|重启|日志)\\s+(\\S+\\s+)?(\\d+)$', fnc: 'napcatAction', permission: 'master' },
        { reg: '^#ngl强制停止\\s+(\\S+\\s+)?(\\d+)$', fnc: 'napcatKill', permission: 'master' },
        { reg: '^#ngl更新\\s+(\\S+)$', fnc: 'napcatUpdate', permission: 'master' },
        { reg: '^#ngl帮助$|^#ngl帮助\\s+(.+)$', fnc: 'nglHelp', permission: 'master' },
        { reg: '^#ngl(服务器|服务|系统|配置|账号|插件|备份|其他)$', fnc: 'nglCategory', permission: 'master' },
      ]
    })
  }

  async napcatStatus(e) {
    if (!e.isMaster) return true
    const parsed = parseCommand(e.msg, pool)

    try {
      if (!parsed.server) {
        // 无 server → 聚合全部服务器
        const servers = await pool.list()
        if (!servers.length) { e.reply('暂无服务器'); return true }
        const rows = servers.map(s => [
          s.name,
          s.connected ? '在线' : (s.error || '离线'),
          String(s.instances),
          (s.accounts || []).join(' ') || '-',
        ])
        e.reply(renderTable(['服务器', '状态', '实例', '账号'], rows))
      } else if (parsed.server === 'all') {
        const servers = await pool.list()
        const online = servers.filter(s => s.connected)
        if (!online.length) { e.reply('暂无在线服务器'); return true }
        const rows = online.map(s => [s.name, String(s.instances), (s.accounts || []).join(' ') || '-'])
        e.reply(renderTable(['名称', '实例', '账号'], rows))
      } else {
        const client = await pool.get(parsed.server)
        const qq = parsed.params[0]
        const r = await client.napcatStatus(qq)
        e.reply(r.success ? (r.stdout || '无运行中的实例') : (r.stdout || r.stderr || r.message || '查询失败'))
      }
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async napcatAction(e) {
    if (!e.isMaster) return true
    const actionMatch = e.msg.match(/^#ngl(启动|停止|重启|日志)/)
    if (!actionMatch) { e.reply('用法: #ngl<启动|停止|重启|日志> [服务器名] <QQ>'); return true }
    const action = actionMatch[1]
    const parsed = parseCommand(e.msg, pool)

    const qq = parsed.params[parsed.params.length - 1]
    if (!qq || !/^\d{5,12}$/.test(qq)) {
      e.reply(`用法: #ngl${action} [服务器名] <QQ>`)
      return true
    }

    try {
      const client = await pool.get(parsed.server)
      if (action === '日志') return this._handleLog(e, client, qq)

      const mode = await client.detectProcessMode()
      const r = await this._doAction(client, action, mode, qq)
      e.reply(r && r.success ? `QQ ${qq} ${action}: ${r.stdout || '完成'}` : parseNapcatError(r, qq, parsed.server || pool._config?.defaultServer))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async _doAction(client, action, mode, qq) {
    if (action === '启动') {
      if (mode === 'wrapper') return client.napcatStart(qq)
      if (mode === 'docker')  return client.executeCommand(`docker start napcat_${qq} 2>&1`)
      if (mode === 'screen')  return client.executeCommand(`screen -dmS napcat_${qq} bash -c "xvfb-run -a qq --no-sandbox -q ${qq}" 2>&1`)
      return client.executeCommand(`nohup xvfb-run -a qq --no-sandbox -q ${qq} > /dev/null 2>&1 &`, 10000)
    }
    if (action === '停止') {
      if (mode === 'wrapper') return client.napcatStop(qq)
      if (mode === 'docker')  return client.executeCommand(`docker stop napcat_${qq} 2>&1`)
      return client.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}" 2>&1`)
    }
    if (action === '重启') {
      if (mode === 'wrapper') return client.napcatRestart(qq)
      if (mode === 'docker')  return client.executeCommand(`docker restart napcat_${qq} 2>&1`)
      await client.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}" 2>&1`)
      return client.executeCommand(`nohup xvfb-run -a qq --no-sandbox -q ${qq} > /dev/null 2>&1 &`, 10000)
    }
    return { success: false, message: `未知操作: ${action}` }
  }

  async napcatKill(e) {
    if (!e.isMaster) return true
    const parsed = parseCommand(e.msg, pool)
    const qq = parsed.params[parsed.params.length - 1]
    if (!qq) { e.reply('用法: #ngl强制停止 [服务器名] <QQ>'); return true }
    try {
      const client = await pool.get(parsed.server)
      const mode = await client.detectProcessMode()
      let r
      if (mode === 'wrapper') r = await client.napcatKill(qq)
      else if (mode === 'docker') r = await client.executeCommand(`docker stop napcat_${qq} 2>&1`)
      else r = await client.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}" 2>&1`)
      e.reply(r.success ? `QQ ${qq} 已强制终止` : parseNapcatError(r, qq, parsed.server))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async napcatUpdate(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl更新\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl更新 <服务器名>'); return true }
    try {
      const client = await pool.get(m[1])
      const mode = await client.detectProcessMode()
      const r = mode === 'docker'
        ? await client.executeCommand('docker pull mlikiowa/napcat-docker:latest 2>&1')
        : await client.napcatUpdate()
      e.reply(r.success ? `更新完成:\n${r.stdout}` : (r.stdout || r.stderr || r.message || '更新失败'))
    } catch (err) { e.reply(formatError(err)) }
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
      e.reply(lines.join('\n') || `QQ ${qq} 无日志`)
    }, TIMEOUT)

    try {
      client.getLogStream(qq,
        d => buf.push(d),
        err => { cleanup(); clearTimeout(timer); e.reply(`日志错误: ${err}`) },
        () => { if (!stopped) { cleanup(); clearTimeout(timer); const lines = buf.join('').split('\n').filter(l => l.trim()).slice(-100); e.reply(lines.join('\n') || `QQ ${qq} 无日志`) } }
      )
    } catch (err) {
      clearTimeout(timer)
      try { cleanup() } catch {}
      e.reply(formatError(err))
    }
    return true
  }

  _helpPages = {
    '服务器': ['服务器管理', '#ngl服务器列表', '#ngl添加服务器', '#ngl删除服务器', '#ngl切换', '#ngl测试', '#ngl修改服务器'],
    '服务':   ['服务管理', '#ngl状态', '#ngl启动', '#ngl停止', '#ngl重启', '#ngl日志', '#ngl强制停止', '#ngl更新'],
    '系统':   ['系统信息', '#ngl系统信息', '#ngl版本', '#ngl进程', '#ngl端口', '#ngl服务状态', '#ngl日志文件'],
    '配置':   ['配置管理', '#ngl查看配置', '#ngl修改配置', '#ngl查看WebUI', '#ngl修改WebUI',
               '#ngl账号列表', '#ngl查看账号配置', '#ngl修改账号配置',
               '#ngl查看OB11 QQ', '#ngl修改OB11 QQ key val',
               '#ngl配置文件列表', '#ngl配置目录'],
    '账号':   ['账号与登录', '#ngl快速部署 [server] QQ', '#ngl创建账号 [server] QQ', '#ngl扫码'],
    '插件':   ['插件管理', '#ngl插件列表', '#ngl插件信息', '#ngl插件启用', '#ngl插件禁用',
               '#ngl查看webui <服务器名>', '#ngl查看webui <服务器名> key'],
    '备份':   ['备份管理', '#ngl备份', '#ngl备份列表', '#ngl恢复', '#ngl删除备份'],
    '其他':   ['其他', '#ngl安装', '#ngl安装状态', '#ngl同步配置'],
  }

  async nglCategory(e) {
    if (!e.isMaster) return true
    const cat = (e.msg.match(/^#ngl(.+)$/) || [])[1]
    if (cat && this._helpPages[cat]) e.reply(this._helpPages[cat].join('\n'))
    return true
  }

  async nglHelp(e) {
    if (!e.isMaster) return true
    const match = e.msg.match(/^#ngl帮助\s+(.+)$/)
    const cat = match ? match[1] : ''
    if (cat && this._helpPages[cat]) { e.reply(this._helpPages[cat].join('\n')); return true }
    e.reply('#ngl帮助 服务器 | 服务 | 系统 | 配置 | 账号 | 插件 | 备份 | 其他')
    return true
  }
}
