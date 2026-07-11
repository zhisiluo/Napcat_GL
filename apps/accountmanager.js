import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { formatError, parseNapcatError } from '../components/errors.js'
import { sleep, cleanTempFile, INSTALL_URL, DEP_INSTALL_CMD, OS_CHECK_CMD, filterInstallOutput } from '../components/utils.js'
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
        { reg: '^#ngl快速部署\\s+(\\S+)\\s+(\\d+)', fnc: 'quickDeploy',   permission: 'master' },
        { reg: '^#ngl创建账号\\s+(\\S+)\\s+(\\d+)', fnc: 'createAccount', permission: 'master' },
        { reg: '^#ngl重新扫码\\s+(\\S+)\\s+(\\d+)', fnc: 'reQRCode',      permission: 'master' },
      ]
    })
  }

  async quickDeploy(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl快速部署\s+(\S+)\s+(\d+)/)
    if (!m) { this.reply('用法: #ngl快速部署 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const installed = await this._ensureInstalled(e, client, serverName)
      if (!installed) return true
      const started = await this._ensureAccountStarted(e, client, serverName, qq)
      if (!started) return true
      this.reply('正在等待二维码...')
      await sleep(4000)
      await this._sendQRCode(e, client, qq, serverName)
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async createAccount(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl创建账号\s+(\S+)\s+(\d+)/)
    if (!m) { this.reply('用法: #ngl创建账号 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const alreadyOnline = await this._checkAlreadyOnline(e, client, qq, serverName)
      if (alreadyOnline) return true
      const started = await this._ensureAccountStarted(e, client, serverName, qq)
      if (!started) return true
      this.reply('正在等待二维码...')
      await sleep(4000)
      await this._sendQRCode(e, client, qq, serverName)
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async _checkAlreadyOnline(e, client, qq, serverName) {
    const running = await client.isNapCatRunning(qq)
    if (!running.running) return false
    const status = await client.checkLoginStatus(qq).catch(() => ({ status: 'error' }))
    if (status.status === 'online') {
      this.reply(`QQ ${qq} 已在 ${serverName} 登录，无需重新扫码`)
      return true
    }
    return false
  }

  async reQRCode(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl重新扫码\s+(\S+)\s+(\d+)/)
    if (!m) { this.reply('用法: #ngl重新扫码 服务器名 QQ'); return true }
    const [, serverName, qq] = m
    try {
      const client = await pool.get(serverName)
      const alreadyOnline = await this._checkAlreadyOnline(e, client, qq, serverName)
      if (alreadyOnline) return true
      const tmpFile = path.join(os.tmpdir(), `napcat_gl_qr_${Date.now()}.png`)

      let r = await client.getQQQRCode(tmpFile, qq)

      if (!r.success) {
        this.reply('未检测到二维码，正在重启进程重新生成...')
        await client.stopInstance(qq)
        await sleep(2000)
        const startR = await client.startInstance(qq)
        if (!startR.success) {
          this.reply(parseNapcatError(startR, qq, serverName))
          return true
        }

        this.reply('正在等待新二维码生成...')
        let got = false
        for (let i = 0; i < 10; i++) {
          await sleep(2000)
          r = await client.getQQQRCode(tmpFile, qq)
          if (r.success) { got = true; break }
        }
        if (!got) {
          this.reply('未能获取到新二维码，请检查 NapCat 是否正常运行')
          return true
        }
      }

      try {
        const buf = fs.readFileSync(tmpFile)
        this.reply(segment.image(buf))
        this.reply(`QQ ${qq} 新二维码已发送，请扫码（3分钟内有效）`)
      } finally {
        cleanTempFile(tmpFile)
      }
      this._monitorLogin(e, client, qq, serverName)
    } catch (err) { this.reply(formatError(err)) }
    return true
  }

  async _ensureInstalled(e, client, serverName) {
    if (await client.isNapCatInstalled()) return true

    this.reply(`${serverName} 未安装 NapCat，正在自动安装（约1-2分钟）...`)
    const osCheck = await client.executeCommand(OS_CHECK_CMD)
    const osName = osCheck.success ? osCheck.stdout.trim() : 'unknown'
    if (/CentOS.*[78]/.test(osName)) {
      this.reply(`不支持的系统: ${osName}（需要 Ubuntu 18+ / Debian 10+ / CentOS 9+）`)
      return false
    }
    await client.executeCommand(DEP_INSTALL_CMD, 60000)
    const ir = await client.executeCommand(
      `curl -fsSL ${INSTALL_URL} -o /tmp/napcat_install.sh && bash /tmp/napcat_install.sh 2>&1`,
      300000
    )

    if (!(await client.isNapCatInstalled())) {
      const lines = filterInstallOutput(ir.stdout || ir.stderr || '')
      this.reply(`自动安装失败:\n${lines || '未知错误'}`)
      return false
    }
    const detected = await client.detectNapCatPath()
    if (detected) {
      client.napcatBasePath = detected
      client.napcatConfigDir = `${detected}/config`
      client._clearDetectedDirs()
    }
    this.reply(`${serverName} NapCat 安装完成`)
    return true
  }

  async _ensureAccountStarted(e, client, serverName, qq) {
    const accounts = await client.listNapCatAccounts()
    const alreadyExists = accounts.success && (accounts.accounts || []).includes(qq)

    if (alreadyExists) {
      const running = await client.isNapCatRunning(qq)
      if (running.running) {
        this.reply(`QQ ${qq} 正在运行，停止旧进程（保留配置）...`)
        await client.stopInstance(qq)
        for (let i = 0; i < 5; i++) {
          await sleep(1000)
          if (!(await client.isNapCatRunning(qq)).running) break
        }
      } else {
        this.reply(`QQ ${qq} 已配置（未运行），复用现有配置启动...`)
      }
    } else {
      const globalCfg = await client.readNapCatGlobalConfig()
      const baseConfig = (globalCfg.success && globalCfg.data) ? globalCfg.data : {}
      const writeResult = await client.writeNapCatAccountConfig(qq, { ...baseConfig, fileLog: true, consoleLog: true })
      if (!writeResult.success) {
        this.reply(`创建配置文件失败: ${writeResult.message}`)
        return false
      }
      try {
        const ob11 = await client.readOB11Config(qq)
        if (ob11.success) await client.writeOB11Config(qq, ob11.data)
      } catch (err) { logger.warn(`[ngl] 复制OB11配置失败: ${err.message}`) }
    }

    const startR = await client.startInstance(qq)
    if (!startR.success) {
      this.reply(parseNapcatError(startR, qq, serverName))
      return false
    }

    return true
  }

  async _sendQRCode(e, client, qq, serverName) {
    const tmpFile = path.join(os.tmpdir(), `napcat_gl_qr_${Date.now()}.png`)
    try {
      let r
      for (let i = 0; i < 8; i++) {
        await sleep(i === 0 ? 0 : 2000)
        r = await client.getQQQRCode(tmpFile, qq)
        if (r.success) break
      }
      if (r.success) {
        const buf = fs.readFileSync(tmpFile)
        this.reply(segment.image(buf))
        this.reply(`QQ ${qq} 已在 ${serverName} 启动，请扫码登录（3分钟内有效）`)
        this._monitorLogin(e, client, qq, serverName)
      } else {
        this.reply(`QQ ${qq} 已启动，但二维码获取失败: ${r.message}\n请稍后发: #ngl重新扫码 ${serverName} ${qq}`)
      }
    } finally {
      cleanTempFile(tmpFile)
    }
  }

  async _monitorLogin(e, client, qq, serverName) {
    const reply = msg => { try { e.reply(msg) } catch {} }
    const maxPolls = Math.floor(LOGIN_TIMEOUT / POLL_INTERVAL)

    for (let i = 0; i < maxPolls; i++) {
      if (i > 0) await sleep(POLL_INTERVAL)

      try {
        const status = await client.checkLoginStatus(qq)
        logger.info(`[ngl] QQ ${qq} poll ${i+1}/${maxPolls}: status=${status.status} ${status.message||''}`)

        if (status.status === 'online') {
          reply(`QQ ${qq} 登录成功`)
          return
        }
        if (status.status === 'login_failed') {
          reply(`QQ ${qq} 登录失败: ${status.message}`)
          return
        }
        if (status.status === 'offline') {
          reply(`QQ ${qq} 进程已退出\n请尝试重新启动: #ngl启动 ${serverName} ${qq}`)
          return
        }
      } catch (err) {
        logger.warn(`[ngl] QQ ${qq} 轮询异常: ${err.message}`)
      }
    }

    reply(`QQ ${qq} 扫码超时（3分钟），请发:\n#ngl重新扫码 ${serverName} ${qq}`)
  }
}
