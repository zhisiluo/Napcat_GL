import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError, parseNapcatError } from '../components/errors.js'
import { segment } from 'oicq'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const POLL_INTERVAL = 8000
const LOGIN_TIMEOUT = 3 * 60 * 1000

export class AccountManager extends plugin {
  constructor() {
    super({
      name: 'ngl-账号管理',
      dsc: '创建 QQ 账号',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl快速部署\\s+(\\S+)\\s+(\\d+)$', fnc: 'quickDeploy',   permission: 'master' },
        { reg: '^#ngl创建账号\\s+(\\S+)\\s+(\\d+)$', fnc: 'createAccount', permission: 'master' },
        { reg: '^#ngl重新扫码\\s+(\\S+)\\s+(\\d+)$', fnc: 'reQRCode',      permission: 'master' },
      ]
    })
  }

  async quickDeploy(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl快速部署\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl快速部署 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const installed = await this._ensureInstalled(e, client, serverName)
      if (!installed) return true
      const started = await this._ensureAccountStarted(e, client, serverName, qq)
      if (!started) return true
      e.reply('正在等待二维码...')
      await new Promise(r => setTimeout(r, 4000))
      await this._sendQRCode(e, client, qq, serverName)
    } catch (err) { e.reply(`快速部署失败: ${formatError(err)}`) }
    return true
  }

  async createAccount(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl创建账号\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl创建账号 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const started = await this._ensureAccountStarted(e, client, serverName, qq)
      if (!started) return true
      e.reply('正在等待二维码...')
      await new Promise(r => setTimeout(r, 4000))
      await this._sendQRCode(e, client, qq, serverName)
    } catch (err) { e.reply(`创建失败: ${formatError(err)}`) }
    return true
  }

  async reQRCode(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl重新扫码\s+(\S+)\s+(\d+)$/)
    if (!m) { e.reply('用法: #ngl重新扫码 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const tmpFile = path.join(os.tmpdir(), `napcat_gl_qr_${Date.now()}.png`)

      let r = await client.getQQQRCode(tmpFile)

      if (!r.success) {

        e.reply('未检测到二维码，正在重启进程重新生成...')
        const mode = await client.detectProcessMode()
        if (mode === 'wrapper') {
          await client.napcatStop(qq)
          await new Promise(res => setTimeout(res, 2000))
          const startR = await client.napcatStart(qq)
          if (!startR.success) {
            e.reply(`重启失败: ${parseNapcatError(startR, qq, serverName)}`)
            return true
          }
        } else if (mode === 'screen') {
          await client.executeCommand(`pkill -f "napcat_${qq}" 2>/dev/null || true`)
          await new Promise(res => setTimeout(res, 1000))
          await client.executeCommand(`screen -dmS napcat_${qq} bash -c "xvfb-run -a qq --no-sandbox -q ${qq}"`)
        } else {
          await client.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}" 2>/dev/null || true`)
          await new Promise(res => setTimeout(res, 1000))
          await client.executeCommand(`nohup xvfb-run -a qq --no-sandbox -q ${qq} > /dev/null 2>&1 &`, 10000)
        }

        e.reply('正在等待新二维码生成...')
        let got = false
        for (let i = 0; i < 10; i++) {
          await new Promise(res => setTimeout(res, 2000))
          r = await client.getQQQRCode(tmpFile)
          if (r.success) { got = true; break }
        }
        if (!got) {
          e.reply('未能获取到新二维码，请检查 NapCat 是否正常运行')
          return true
        }
      }

      try {
        const buf = fs.readFileSync(tmpFile)
        e.reply(segment.image(buf))
        e.reply(`QQ ${qq} 新二维码已发送，请扫码（3分钟内有效）`)
      } finally {
        try { fs.unlinkSync(tmpFile) } catch {}
      }
      this._monitorLogin(e, client, qq, serverName)
    } catch (err) { e.reply(formatError(err)) }
    return true
  }

  async _ensureInstalled(e, client, serverName) {
    if (await client.isNapCatInstalled()) return true

    e.reply(`${serverName} 未安装 NapCat，正在自动安装（约1-2分钟）...`)
    const osCheck = await client.executeCommand('cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'')
    const osName = osCheck.success ? osCheck.stdout.trim() : 'unknown'
    if (/CentOS.*[78]/.test(osName)) {
      e.reply(`不支持的系统: ${osName}（需要 Ubuntu 18+ / Debian 10+ / CentOS 9+）`)
      return false
    }
    await client.executeCommand('apt install -y screen xvfb 2>/dev/null || yum install -y screen xorg-x11-server-Xvfb 2>/dev/null || true', 60000)
    const ir = await client.executeCommand(
      'curl -fsSL https://nclatest.znin.net/NapNeko/NapCat-Installer/main/script/install.sh -o /tmp/napcat_install.sh && bash /tmp/napcat_install.sh 2>&1',
      300000
    )

    if (!(await client.isNapCatInstalled())) {
      const lines = (ir.stdout || ir.stderr || '').split('\n')
        .filter(l => {
          const t = l.trim()
          if (!t) return false
          if (/^\s*[\d.]+\s*%/.test(t)) return false
          if (/^[O=#\s]+$/.test(t)) return false
          if (/测速:/.test(t)) return false
          return true
        })
        .slice(-8)
        .join('\n')
      e.reply(`自动安装失败:\n${lines || '未知错误'}`)
      return false
    }
    const detected = await client.detectNapCatPath()
    if (detected) {
      client.napcatBasePath = detected
      client.napcatConfigDir = `${detected}/config`
      client._clearDetectedDirs()
    }
    e.reply(`${serverName} NapCat 安装完成`)
    return true
  }

  async _ensureAccountStarted(e, client, serverName, qq) {
    const accounts    = await client.listNapCatAccounts()
    const alreadyExists = accounts.success && (accounts.accounts || []).includes(qq)

    if (alreadyExists) {
      const running = await client.isNapCatRunning(qq)
      if (running.running) {
        e.reply(`QQ ${qq} 正在运行，停止旧进程（保留配置）...`)
        const mode = await client.detectProcessMode()
        if (mode === 'wrapper')      await client.napcatStop(qq)
        else if (mode === 'docker')  await client.executeCommand(`docker stop napcat_${qq} 2>/dev/null || true`)
        else                         await client.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}" 2>/dev/null || true`)
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 1000))
          if (!(await client.isNapCatRunning(qq)).running) break
        }
      } else {
        e.reply(`QQ ${qq} 已配置（未运行），复用现有配置启动...`)
      }
    } else {
      const globalCfg  = await client.readNapCatGlobalConfig()
      const baseConfig = (globalCfg.success && globalCfg.data) ? globalCfg.data : {}
      const writeResult = await client.writeNapCatAccountConfig(qq, { ...baseConfig, fileLog: true, consoleLog: true })
      if (!writeResult.success) {
        e.reply(`创建配置文件失败: ${writeResult.message}`)
        return false
      }
      try {
        const ob11 = await client.readOB11Config('')
        if (ob11.success) await client.writeOB11Config(qq, ob11.data)
      } catch {}
    }
    const mode = await client.detectProcessMode()
    if (mode === 'wrapper') {
      const r = await client.napcatStart(qq)
      if (!r.success) {
        e.reply(parseNapcatError(r, qq, serverName))
        return false
      }
    } else if (mode === 'screen') {
      await client.executeCommand(`screen -dmS napcat_${qq} bash -c "xvfb-run -a qq --no-sandbox -q ${qq}"`)
    } else if (mode === 'docker') {
      e.reply(`配置已就绪。Docker 模式请手动启动: docker start napcat_${qq}`)
      return false
    } else {
      await client.executeCommand(`nohup xvfb-run -a qq --no-sandbox -q ${qq} > /dev/null 2>&1 &`, 10000)
    }

    return true
  }

  async _sendQRCode(e, client, qq, serverName) {
    const tmpFile = path.join(os.tmpdir(), `napcat_gl_qr_${Date.now()}.png`)
    try {
      const r = await client.getQQQRCode(tmpFile)
      if (r.success) {
        const buf = fs.readFileSync(tmpFile)
        e.reply(segment.image(buf))
        e.reply(`QQ ${qq} 已在 ${serverName} 启动，请扫码登录（3分钟内有效）`)

        this._monitorLogin(e, client, qq, serverName)
      } else {
        e.reply(`QQ ${qq} 已启动，但二维码获取失败: ${r.message}\n请稍后发: #ngl重新扫码 ${serverName} ${qq}`)
      }
    } finally {
      try { fs.unlinkSync(tmpFile) } catch {}
    }
  }

  
  _monitorLogin(e, client, qq, serverName) {
    let done = false
    let polls = 0
    let startMtime = null
    const maxPolls = Math.floor(LOGIN_TIMEOUT / POLL_INTERVAL)

    const qrPath = `${client.napcatBasePath}/cache/qrcode.png`

    const finish = (msg) => {
      if (done) return
      done = true
      clearInterval(timer)
      e.reply(msg)
    }

    client.executeCommand(`stat -c %Y "${qrPath}" 2>/dev/null || echo 0`)
      .then(r => { startMtime = (r.stdout || '').trim() || '0' })
      .catch(() => { startMtime = '0' })

    const timer = setInterval(async () => {
      if (done) { clearInterval(timer); return }
      polls++
      if (polls > maxPolls) {
        finish(`QQ ${qq} 扫码超时（3分钟），请发:\n#ngl重新扫码 ${serverName} ${qq}`)
        return
      }
      try {
        const qrExists = await client.fileExists(qrPath)
        if (!qrExists) {
          finish(`QQ ${qq} 登录成功`)
          return
        }

        if (startMtime && startMtime !== '0') {
          const r = await client.executeCommand(`stat -c %Y "${qrPath}" 2>/dev/null || echo 0`)
          const cur = (r.stdout || '').trim()
          if (cur && cur !== '0' && cur !== startMtime) {
            startMtime = cur
            const tmpFile = path.join(os.tmpdir(), `napcat_gl_qr_refresh_${Date.now()}.png`)
            try {
              const qrR = await client.getQQQRCode(tmpFile)
              if (qrR.success) {
                const buf = fs.readFileSync(tmpFile)
                e.reply(segment.image(buf))
                e.reply(`QQ ${qq} 二维码已刷新，请重新扫码（3分钟内有效）`)
              }
            } finally {
              try { fs.unlinkSync(tmpFile) } catch {}
            }
            return
          }
        }

        const running = await client.isNapCatRunning(qq)
        if (!running.running) {
          finish(`QQ ${qq} 进程已退出，请检查后重试`)
        }
      } catch {

      }
    }, POLL_INTERVAL)
  }
}
