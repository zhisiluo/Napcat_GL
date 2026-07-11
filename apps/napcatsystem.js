import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { renderTable } from '../components/table.js'
import { formatError } from '../components/errors.js'

export class NapcatSystem extends plugin {
  constructor() {
    super({
      name: 'ngl-系统信息',
      dsc: '查看服务器系统信息',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl系统信息\\s+(\\S+)$',   fnc: 'systemInfo',     permission: 'master' },
        { reg: '^#ngl版本\\s+(\\S+)$',       fnc: 'versionInfo',    permission: 'master' },
        { reg: '^#ngl进程\\s+(\\S+)$',       fnc: 'processInfo',    permission: 'master' },
        { reg: '^#ngl服务状态\\s+(\\S+)$',   fnc: 'serviceStatus',  permission: 'master' },
        { reg: '^#ngl日志文件\\s+(\\S+)$',   fnc: 'listLogFiles',   permission: 'master' },
      ]
    })
  }

  async systemInfo(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl系统信息\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl系统信息 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.getSystemInfo()
      if (!r.success) { e.reply(r.message); return true }
      const i = r.info
      const rows = [
        ['CPU',   `${i['CPU%'] || i.CPU || '-'}%`],
        ['MEM',   i.MEM    || '-'],
        ['SWAP',  i.SWAP   || '-'],
        ['DISK',  i.DISK   || '-'],
        ['LOAD',  i.LOAD   || '-'],
        ['OS',    i.OS     || '-'],
        ['UP',    i.UPTIME || '-'],
      ]
      e.reply(renderTable(['项目', '值'], rows))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async versionInfo(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl版本\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl版本 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const [ver, installed] = await Promise.all([
        client.getNapCatVersion(),
        client.isNapCatInstalled(),
      ])
      e.reply([
        `服务器: ${m[1]}`,
        `安装: ${installed ? '是' : '否'}`,
        `版本: ${ver.success ? ver.version : '未知'}`,
        `路径: ${client.napcatBasePath}`,
        `配置: ${client.getConfigDir()}`,
      ].join('\n'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async processInfo(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl进程\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl进程 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.getNapCatProcesses()
      if (!r.success || !r.running) { e.reply(r.message || '无 NapCat 进程'); return true }
      const rows = r.processes.map(p => [
        p.pid,
        `${p.cpu}%`,
        `${p.mem}%`,
        p.command.length > 40 ? p.command.slice(0, 40) + '...' : p.command,
      ])
      e.reply(renderTable(['PID', 'CPU', 'MEM', '命令'], rows))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async serviceStatus(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl服务状态\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl服务状态 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const [accounts, processes] = await Promise.all([
        client.listNapCatAccounts(),
        client.getNapCatProcesses(),
      ])
      const accs = accounts.success ? (accounts.accounts || []) : []
      const lines = ['NapCat 服务状态']

      for (const acc of accs) {
        const running = processes.processes?.some(p => new RegExp(`\\b${acc}\\b`).test(p.command))
        lines.push(`  QQ ${acc}  ${running ? '运行中' : '已停止'}`)
      }
      if (!accs.length) lines.push('  无账号')

      const wp = await client.getWebUIPort()
      const webuiSt = await client.getPortStatus(wp)
      lines.push(`WebUI (${wp}): ${webuiSt.listening ? '监听中' : '未监听'}`)

      for (const acc of accs) {
        const ports = await client.getOB11Ports(acc)
        for (const p of ports) {
          const st = await client.getPortStatus(p)
          lines.push(`QQ ${acc} OB11 (${p}): ${st.listening ? '监听中' : '未监听'}`)
        }
      }

      e.reply(lines.join('\n'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async listLogFiles(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl日志文件\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl日志文件 服务器名'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.listLogFiles()
      if (!r.success) { e.reply(r.message); return true }
      const lines = r.listing.split('\n')
        .filter(l => l.trim() && !l.startsWith('total'))
        .map(l => { const p = l.trim().split(/\s+/); return p.length >= 9 ? `${p[4].padEnd(6)}  ${p.slice(7).join(' ')}` : l })
      e.reply(lines.length ? `日志文件:\n${lines.join('\n')}` : '无日志文件')
    } catch (err) { e.reply(formatError(err)) }
    return true
  }
}
