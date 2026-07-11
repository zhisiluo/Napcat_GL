import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError } from '../components/errors.js'
import { INSTALL_URL, DEP_INSTALL_CMD, OS_CHECK_CMD, filterInstallOutput } from '../components/utils.js'

export class NapcatInstall extends plugin {
  constructor() {
    super({
      name: 'ngl-远程安装',
      dsc: '远程安装 NapCat',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl安装\\s+(\\S+)',     fnc: 'installNapCat', permission: 'master' },
        { reg: '^#ngl安装状态\\s+(\\S+)',  fnc: 'checkInstall',  permission: 'master' },
      ]
    })
  }

  async installNapCat(e) {
    if (!e.isMaster) return true
    const server = (e.msg.match(/^#ngl安装\s+(\S+)/) || [])[1]
    if (!server) { this.reply('用法: #ngl安装 服务器名'); return true }

    try {
      const client = await pool.get(server)
      const curlOk = await client.executeCommand('which curl >/dev/null 2>&1 && echo "YES" || echo "NO"')
      if (curlOk.stdout?.trim() !== 'YES') {
        this.reply(`[INS_NOCURL] ${server} 缺少 curl，请先安装 curl`)
        return true
      }
      const osCheck = await client.executeCommand(OS_CHECK_CMD)
      const osName  = osCheck.success ? osCheck.stdout.trim() : 'unknown'
      if (/CentOS.*[78]/.test(osName)) {
        this.reply(`[INS_UNSUP_OS] ${osName} 不受支持。需要 Ubuntu 18+ / Debian 10+ / CentOS 9+`)
        return true
      }
      if (await client.isNapCatInstalled()) {
        this.reply(`NapCat 已安装在 ${server}\n路径: ${client.napcatBasePath}\n如需重装请先卸载`)
        return true
      }

      this.reply(`${server}: ${osName}，开始安装...`)
      await client.executeCommand(DEP_INSTALL_CMD, 60000)
      this.reply('正在下载并执行安装脚本（约1-2分钟）...')
      const installResult = await client.executeCommand(
        `curl -fsSL ${INSTALL_URL} -o /tmp/napcat_install.sh && bash /tmp/napcat_install.sh 2>&1`,
        300000
      )
      const verify = await client.executeCommand(
        `test -d "${client.napcatBasePath}/config" && echo "INSTALL_OK" || echo "INSTALL_FAIL"`
      )
      if (verify.stdout?.trim() !== 'INSTALL_OK') {
        const lines = filterInstallOutput(installResult.stdout || installResult.stderr || '')
        this.reply(`安装失败:\n${lines || '未知错误'}`)
        return true
      }
      const detectedPath = await client.detectNapCatPath()
      if (detectedPath) {
        try { await pool.updateConfig(server, 'napcatBasePath', detectedPath) } catch (err) { logger.warn(`[ngl] 保存检测路径失败: ${err.message}`) }
      }

      const info = client.getConnectionInfo()
      this.reply([
        `${server} NapCat 安装完成!`,
        `系统: ${osName}`,
        `路径: ${detectedPath || client.napcatBasePath}`,
        `WebUI: http://${info.host}:${await client.getWebUIPort()}/webui`,
        `下一步: #ngl快速部署 ${server} QQ号`,
      ].join('\n'))

    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async checkInstall(e) {
    if (!e.isMaster) return true
    const server = (e.msg.match(/^#ngl安装状态\s+(\S+)/) || [])[1]
    if (!server) { this.reply('用法: #ngl安装状态 服务器名'); return true }

    try {
      const client = await pool.get(server)
      const [installed, screenCheck, curlCheck, osCheck] = await Promise.all([
        client.isNapCatInstalled(),
        client.executeCommand('which screen >/dev/null 2>&1 && echo "YES" || echo "NO"'),
        client.executeCommand('which curl >/dev/null 2>&1 && echo "YES" || echo "NO"'),
        client.executeCommand('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\''),
      ])

      const osName = osCheck.success ? osCheck.stdout.trim() : 'unknown'
      const lines  = [
        `${server} 安装状态:`,
        `OS:     ${osName}`,
        `NapCat: ${installed ? '已安装' : '未安装'}`,
        `curl:   ${curlCheck.stdout?.trim() === 'YES' ? '可用' : '缺失'}`,
        `screen: ${screenCheck.stdout?.trim() === 'YES' ? '可用' : '缺失'}`,
      ]

      if (installed) {
        const ver = await client.getNapCatVersion()
        lines.push(`版本:   ${ver.success ? ver.version : '未知'}`)
        lines.push(`路径:   ${client.napcatBasePath}`)
      }

      this.reply(lines.join('\n'))
    } catch (err) { this.reply(formatError(err)) }
    return true
  }
}
