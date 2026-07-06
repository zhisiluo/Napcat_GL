import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError } from '../components/errors.js'

const INSTALL_URL = 'https://nclatest.znin.net/NapNeko/NapCat-Installer/main/script/install.sh'

export class NapcatInstall extends plugin {
  constructor() {
    super({
      name: 'ngl-远程安装',
      dsc: '远程安装 NapCat',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl安装\\s+(\\S+)$',     fnc: 'installNapCat', permission: 'master' },
        { reg: '^#ngl安装状态\\s+(\\S+)$',  fnc: 'checkInstall',  permission: 'master' },
      ]
    })
  }

  async installNapCat(e) {
    if (!e.isMaster) return true
    const server = (e.msg.match(/^#ngl安装\s+(\S+)$/) || [])[1]
    if (!server) { e.reply('用法: #ngl安装 服务器名'); return true }

    try {
      const client = await pool.get(server)
      const curlOk = await client.executeCommand('which curl >/dev/null 2>&1 && echo "YES" || echo "NO"')
      if (curlOk.stdout?.trim() !== 'YES') {
        e.reply(`[INS_NOCURL] ${server} 缺少 curl，请先安装 curl`)
        return true
      }
      const osCheck = await client.executeCommand('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'')
      const osName  = osCheck.success ? osCheck.stdout.trim() : 'unknown'
      if (/CentOS.*[78]/.test(osName)) {
        e.reply(`[INS_UNSUP_OS] ${osName} 不受支持。需要 Ubuntu 18+ / Debian 10+ / CentOS 9+`)
        return true
      }
      if (await client.isNapCatInstalled()) {
        e.reply(`NapCat 已安装在 ${server}\n路径: ${client.napcatBasePath}\n如需重装请先卸载`)
        return true
      }

      e.reply(`${server}: ${osName}，开始安装...`)
      await client.executeCommand(
        'apt install -y screen xvfb 2>/dev/null || yum install -y screen xorg-x11-server-Xvfb 2>/dev/null || true',
        60000
      )
      e.reply('正在下载并执行安装脚本（约1-2分钟）...')
      const installResult = await client.executeCommand(
        `curl -fsSL ${INSTALL_URL} -o /tmp/napcat_install.sh && bash /tmp/napcat_install.sh 2>&1`,
        120000
      )
      const verify = await client.executeCommand(
        `test -d "${client.napcatBasePath}/config" && echo "INSTALL_OK" || echo "INSTALL_FAIL"`
      )
      if (verify.stdout?.trim() !== 'INSTALL_OK') {
        const tail = (installResult.stdout || installResult.stderr || '').split('\n').slice(-20).join('\n')
        e.reply(`安装失败:\n${tail || '未知错误'}`)
        return true
      }
      const detectedPath = await client.detectNapCatPath()
      if (detectedPath) {
        try { await pool.updateConfig(server, 'napcatBasePath', detectedPath) } catch {}
      }

      const info = client.getConnectionInfo()
      e.reply([
        `${server} NapCat 安装完成!`,
        `系统: ${osName}`,
        `路径: ${detectedPath || client.napcatBasePath}`,
        `WebUI: http://${info.host}:6099/webui`,
        `下一步: #ngl快速部署 ${server} QQ号`,
      ].join('\n'))

    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async checkInstall(e) {
    if (!e.isMaster) return true
    const server = (e.msg.match(/^#ngl安装状态\s+(\S+)$/) || [])[1]
    if (!server) { e.reply('用法: #ngl安装状态 服务器名'); return true }

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

      e.reply(lines.join('\n'))
    } catch (err) { e.reply(formatError(err)) }
    return true
  }
}
