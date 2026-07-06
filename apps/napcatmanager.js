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
        { reg: '^#ngl(启动|停止|重启|日志)\\s+(\\S+)\\s+(\\d+)$', fnc: 'napcatAction', permission: 'master' },
        { reg: '^#ngl强制停止\\s+(\\S+)\\s+(\\d+)$', fnc: 'napcatKill', permission: 'master' },
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
    const m = e.msg.match(/^#ngl(启动|停止|重启|日志)\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl启动|停止|重启|日志 服务器名 QQ'); return true }
    const [, action, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      if (action === '日志') return this._handleLog(e, client, qq)
      const mode = await client.detectProcessMode()
      const r = await this._doAction(client, action, mode, qq)
      e.reply(r && r.success ? `QQ ${qq} ${action}: ${r.stdout || '完成'}` : parseNapcatError(r, qq, serverName))
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
    const m = e.msg.match(/^#ngl强制停止\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl强制停止 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const mode = await client.detectProcessMode()
      let r
      if (mode === 'wrapper') r = await client.napcatKill(qq)
      else if (mode === 'docker') r = await client.executeCommand(`docker stop napcat_${qq} 2>&1`)
      else r = await client.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}" 2>&1`)
      e.reply(r.success ? `QQ ${qq} 已强制终止` : parseNapcatError(r, qq, serverName))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async napcatUpdate(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl更新\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl更新 服务器名'); return true }
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
    '服务器': [
      '#ngl服务器列表',
      '#ngl添加服务器 名称 host:port 用户名 密码',
      '#ngl删除服务器 名称',
      '#ngl切换 名称',
      '#ngl测试 名称',
      '#ngl修改服务器 名称 key value',
    ],
    '服务': [
      '#ngl状态',
      '#ngl状态 服务器名',
      '#ngl启动 服务器名 QQ',
      '#ngl停止 服务器名 QQ',
      '#ngl重启 服务器名 QQ',
      '#ngl日志 服务器名 QQ',
      '#ngl强制停止 服务器名 QQ',
      '#ngl更新 服务器名',
    ],
    '系统': [
      '#ngl系统信息 服务器名',
      '#ngl版本 服务器名',
      '#ngl进程 服务器名',
      '#ngl端口 服务器名',
      '#ngl服务状态 服务器名',
      '#ngl日志文件 服务器名',
    ],
    '配置': [
      '#ngl查看配置 服务器名',
      '#ngl修改配置 服务器名 key value',
      '#ngl查看WebUI 服务器名',
      '#ngl修改WebUI 服务器名 key value',
      '#ngl账号列表',
      '#ngl查看账号配置 服务器名 QQ',
      '#ngl修改账号配置 服务器名 QQ key value',
      '#ngl查看OB11 服务器名 QQ',
      '#ngl修改OB11 服务器名 QQ key value',
      '#ngl配置文件列表 服务器名',
      '#ngl配置目录 服务器名',
    ],
    '账号': [
      '#ngl快速部署 服务器名 QQ',
      '#ngl创建账号 服务器名 QQ',
      '#ngl扫码 服务器名',
    ],
    '插件': [
      '#ngl插件列表 服务器名',
      '#ngl插件信息 服务器名 插件ID',
      '#ngl插件启用 服务器名 插件ID',
      '#ngl插件禁用 服务器名 插件ID',
      '#ngl查看webui 服务器名',
      '#ngl查看webui 服务器名 key',
    ],
    '备份': [
      '#ngl备份 服务器名',
      '#ngl备份列表 服务器名',
      '#ngl恢复 服务器名 文件名.tar.gz',
      '#ngl删除备份 服务器名 文件名.tar.gz',
    ],
    '其他': [
      '#ngl安装 服务器名',
      '#ngl安装状态 服务器名',
      '#ngl同步配置 源服务器 目标服务器',
    ],
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
