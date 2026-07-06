/**
 * Napcat_GL - 插件管理
 *
 * 简化说明: 统一错误处理用 formatError
 */

import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { parseCommand } from '../components/parser.js'
import { renderTable } from '../components/table.js'
import { formatError } from '../components/errors.js'

export class NapcatPlugin extends plugin {
  constructor() {
    super({
      name: 'ngl-插件管理',
      dsc: '管理 NapCat 插件',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl插件列表\\s+(\\S+)$',                fnc: 'listPlugins',   permission: 'master' },
        { reg: '^#ngl插件信息\\s+(\\S+)\\s+(.+)$',       fnc: 'pluginInfo',    permission: 'master' },
        { reg: '^#ngl插件启用\\s+(\\S+)\\s+(.+)$',       fnc: 'enablePlugin',  permission: 'master' },
        { reg: '^#ngl插件禁用\\s+(\\S+)\\s+(.+)$',       fnc: 'disablePlugin', permission: 'master' },
        // #ngl查看webui <服务器名> [key]  —— key 表示只显示 token
        { reg: '^#ngl查看webui\\s+(\\S+)(\\s+key)?$',     fnc: 'checkWebUI',    permission: 'master' },
      ]
    })
  }

  async listPlugins(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl插件列表\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl插件列表 <服务器名>'); return true }
    try {
      const client = await pool.get(m[1])
      const apiResult = await client.webuiApiGet('/api/Plugin')
      if (apiResult.success) {
        const plugins = Array.isArray(apiResult.data) ? apiResult.data : (apiResult.data?.plugins || [])
        if (!plugins.length) { e.reply('暂无插件'); return true }
        e.reply(renderTable(['状态','名称','版本'], plugins.map(p => [
          p.enabled !== false ? '启用' : '禁用',
          p.name || p.id || 'unknown',
          p.version || '-',
        ])))
        return true
      }
      const dirs = await client._detectConfigDirs()
      for (const dir of dirs) {
        const ls = await client.executeCommand(`ls -d "${dir}/plugins"/*/ 2>/dev/null || echo ""`)
        if (ls.success && ls.stdout.trim()) {
          const plugins = ls.stdout.trim().split('\n').map(p => p.split('/').filter(Boolean).pop())
          e.reply(`插件目录 (降级):\n${plugins.map(p => '  ' + p).join('\n')}`)
          return true
        }
      }
      e.reply('无法获取插件列表')
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async pluginInfo(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl插件信息\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl插件信息 <服务器名> <插件ID>'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.webuiApiGet(`/api/Plugin/${m[2]}`)
      e.reply(r.success ? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data, null, 2)) : (r.message || '获取失败'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async enablePlugin(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl插件启用\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl插件启用 <服务器名> <插件ID>'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.webuiApiPost(`/api/Plugin/${m[2]}/enable`)
      e.reply(r.success ? `插件 ${m[2]} 已启用` : (r.message || '启用失败'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async disablePlugin(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl插件禁用\s+(\S+)\s+(.+)$/)
    if (!m) { e.reply('用法: #ngl插件禁用 <服务器名> <插件ID>'); return true }
    try {
      const client = await pool.get(m[1])
      const r = await client.webuiApiPost(`/api/Plugin/${m[2]}/disable`)
      e.reply(r.success ? `插件 ${m[2]} 已禁用` : (r.message || '禁用失败'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  // #ngl查看webui <服务器名> [key]
  // key 参数：只显示 Token，不显示其他信息
  async checkWebUI(e) {
    if (!e.isMaster) return true

    // 服务器名必须明确指定
    const match = e.msg.match(/^#ngl查看webui\s+(\S+)(\s+key)?$/)
    if (!match) { e.reply('用法: #ngl查看webui <服务器名> [key]'); return true }

    const serverName = match[1]
    const keyOnly    = !!match[2]

    try {
      const client = await pool.get(serverName)
      const info   = client.getConnectionInfo()

      // 动态读取 WebUI 端口
      const wCfg = await client.readWebUIConfig()
      const port  = wCfg.success ? (wCfg.data?.port || 6099) : 6099
      const token = wCfg.success ? wCfg.data?.token : null

      // 只要 key 时直接返回
      if (keyOnly) {
        e.reply(token ? `${serverName} WebUI Token:\n${token}` : `${serverName} WebUI Token 未配置`)
        return true
      }

      // 检查端口是否监听
      const portSt = await client.getPortStatus(port)

      if (!portSt.listening) {
        e.reply(`${serverName} WebUI 未运行\n端口 ${port} 未监听`)
        return true
      }

      // 账号列表 + 每个账号运行状态
      const accounts = await client.listNapCatAccounts()
      const accs = accounts.success ? (accounts.accounts || []) : []
      const accLines = []
      for (const acc of accs) {
        const st = await client.isNapCatRunning(acc)
        accLines.push(`  ${st.running ? '运行中' : '已停止'}  QQ ${acc}`)
      }

      e.reply([
        `${serverName} WebUI 运行中`,
        `地址:  http://${info.host}:${port}/webui`,
        `Token: ${token || '(未配置)'}`,
        '',
        `账号 (${accs.length}):`,
        ...(accLines.length ? accLines : ['  无账号']),
      ].join('\n'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }
}
