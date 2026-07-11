import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Client } from 'ssh2'

import { loadConfig, saveConfig } from './config.js'
import { validateServerName, validateHost, validatePort } from './validator.js'
import { assertQQ } from './utils.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const NO_COLOR = 'TERM=dumb NO_COLOR=1 '
const DEFAULT_CMD_TIMEOUT = 30000  
const stripAnsi = s => (s || '').replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')

class SSHClient {
  constructor(config) {
    this.config = config
    this.client = null
    this.isConnected = false
    this.currentLogStream = null
    this.sftp = null
    this.webuiToken = null
    this._connecting = null

    this.napcatBasePath = (config.napcatBasePath && config.napcatBasePath.trim())
      ? config.napcatBasePath
      : '/opt/QQ/resources/app/app_launcher/napcat'
    this.napcatConfigDir = (config.napcatConfigDir && config.napcatConfigDir.trim())
      ? config.napcatConfigDir
      : `${this.napcatBasePath}/config`
  }

  getConnectionInfo() {
    return {
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      connected: this.isConnected,
      authMethod: this.config.privateKey ? 'privateKey' : 'password'
    }
  }

  getConfigDir() {
    return this.napcatConfigDir
  }

  async connect() {
    if (this.isConnected) return true
    if (this._connecting) return this._connecting

    if (this.client) { try { this.client.end() } catch {} }
    return this._connecting = new Promise((resolve) => {
      this.client = new Client()

      this.client.on('ready', () => {
        this.isConnected = true
        this._connecting = null
        resolve(true)
      })

      this.client.on('error', (_err) => {
        this.isConnected = false
        this._connecting = null
        resolve(false)
      })

      this.client.on('end', () => {
        this.isConnected = false
      })

      const connectConfig = {
        host: this.config.host,
        port: this.config.port || 22,
        username: this.config.username,
        readyTimeout: this.config.connectTimeout || 10000,
        keepaliveInterval: this.config.keepaliveInterval || 60000
      }

      if (this.config.privateKey) {
        connectConfig.privateKey = this.config.privateKey
        if (this.config.passphrase) connectConfig.passphrase = this.config.passphrase
      } else {
        connectConfig.password = this.config.password
      }

      this.client.connect(connectConfig)
    })
  }

  async disconnect() {
    if (!this.isConnected || !this.client) return true
    if (this.sftp) {
      try { this.sftp.end() } catch {  }
      this.sftp = null
    }

    this.client.end()
    this.isConnected = false
    this.webuiToken = null
    return true
  }

  async executeCommand(command, timeoutMs) {
    if (!this.isConnected) {
      const connected = await this.connect()
      if (!connected) return { success: false, message: 'SSH 连接失败' }
    }

    if (command.includes('|')) {
      const b64 = Buffer.from(NO_COLOR + command, 'utf8').toString('base64')
      command = `echo '${b64}' | base64 -d | bash`
    } else {
      command = NO_COLOR + command
    }

    const timeout = timeoutMs || DEFAULT_CMD_TIMEOUT

    return new Promise((resolve) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          resolve({ success: false, message: `执行命令失败: ${err.message}`, error: err })
          return
        }

        let stdout = ''
        let stderr = ''
        let settled = false

        const timer = setTimeout(() => {
          if (!settled) {
            settled = true
            stream.close()
            resolve({ success: false, message: '命令执行超时', stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), code: -1 })
          }
        }, timeout)

        stream.on('data', (data) => { stdout += data.toString() })
        stream.stderr.on('data', (data) => { stderr += data.toString() })

        stream.on('close', (code) => {
          if (!settled) {
            settled = true
            clearTimeout(timer)
            resolve({ success: code === 0, stdout: stripAnsi(stdout), stderr: stripAnsi(stderr), code })
          }
        })
      })
    })
  }

  getLogStream(qq, callback, errorCallback, endCallback) {
    if (!this.isConnected) {
      this.connect().then(connected => {
        if (!connected) {
          if (errorCallback) errorCallback('SSH 连接失败')
          return
        }
        this._createLogStream(qq, callback, errorCallback, endCallback)
      })
    } else {
      this._createLogStream(qq, callback, errorCallback, endCallback)
    }
  }

  _createLogStream(qq, callback, errorCallback, endCallback) {
    this.client.exec(`${NO_COLOR}napcat log ${qq}`, (err, stream) => {
      if (err) {
        if (errorCallback) errorCallback(`执行命令失败: ${err.message}`)
        return
      }
      this.currentLogStream = stream
      stream.on('data', (data) => { if (callback) callback(stripAnsi(data.toString())) })
      stream.stderr.on('data', (data) => { if (errorCallback) errorCallback(stripAnsi(data.toString())) })
      stream.on('close', (code) => {
        this.currentLogStream = null
        if (endCallback) endCallback(code)
      })
    })
  }

  stopLogStream() {
    if (this.currentLogStream) {
      this.currentLogStream.write('\x03')
      return true
    }
    return false
  }

  async napcatStatus(qq = '') {
    const command = qq ? `napcat status ${qq}` : 'napcat status'
    return this.executeCommand(command)
  }

  async checkLoginStatus(qq) {
    assertQQ(qq)
    // 1. 通过 WebUI API 检测 (最可靠)
    try {
      const apiR = await this.webuiApiPost('/api/QQLogin/CheckLoginStatus')
      if (apiR.success && apiR.data) {
        const d = apiR.data.data || apiR.data
        if (d.isLogin === true) return { status: 'online' }
        if (d.isOffline === true) return { status: 'offline', message: d.loginError || 'QQ已离线' }
        if (d.qrcodeurl) return { status: 'waiting_qr' }
        return { status: 'waiting_qr' }
      }
    } catch {}
    // 2. 回退: 进程存活时间判断
    const proc = await this.executeCommand(
      `ps -o etimes= -p $(ps aux | grep -v grep | grep -E "napcat|qq.*-q ${qq}|xvfb.*-q ${qq}" | awk '{print $2}' | head -1) 2>/dev/null || echo "0"`
    )
    if (proc.success) {
      const seconds = parseInt(proc.stdout.trim()) || 0
      if (seconds > 300) return { status: 'online' }
      if (seconds > 0)   return { status: 'waiting_qr' }
    }
    const running = await this.isNapCatRunning(qq)
    if (!running.running) return { status: 'offline' }
    return { status: 'waiting_qr' }
  }

  async napcatStart(qq) {
    if (!qq) return { success: false, message: '请指定要启动的 QQ 号' }
    return this.executeCommand(`napcat start ${qq}`)
  }

  async napcatStop(qq = '') {
    const command = qq ? `napcat stop ${qq}` : 'napcat stop'
    return this.executeCommand(command)
  }

  async napcatRestart(qq) {
    if (!qq) return { success: false, message: '请指定要重启的 QQ 号' }
    return this.executeCommand(`napcat restart ${qq}`)
  }

  async napcatUpdate() {
    return this.executeCommand('napcat update')
  }

  async napcatKill(qq = '') {
    if (qq) assertQQ(qq)
    const cmd = qq
      ? `pkill -f "napcat.*${qq}" 2>/dev/null || (ps aux | grep "napcat.*${qq}" | grep -v grep | awk '{print $2}' | xargs -r kill 2>/dev/null)`
      : `pkill -f "napcat" 2>/dev/null || (ps aux | grep napcat | grep -v grep | awk '{print $2}' | xargs -r kill 2>/dev/null)`
    const result = await this.executeCommand(`${cmd} && echo "KILL_OK" || echo "KILL_FAIL"`)
    return { success: !!(result.stdout && result.stdout.includes('KILL_OK')), message: result.stdout || result.stderr || result.message || '' }
  }

  async startInstance(qq) {
    assertQQ(qq)
    const mode = await this.detectProcessMode()
    if (mode === 'wrapper') return this.napcatStart(qq)
    if (mode === 'docker')  return this.executeCommand(`docker start napcat_${qq}`)
    if (mode === 'screen')  return this.executeCommand(`screen -dmS napcat_${qq} bash -c "xvfb-run -a qq --no-sandbox -q ${qq}"`)
    return this.executeCommand(`nohup xvfb-run -a qq --no-sandbox -q ${qq} > /dev/null 2>&1 &`, 10000)
  }

  async stopInstance(qq) {
    assertQQ(qq)
    const mode = await this.detectProcessMode()
    if (mode === 'wrapper') return this.napcatStop(qq)
    if (mode === 'docker')  return this.executeCommand(`docker stop napcat_${qq}`)
    return this.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}"`)
  }

  async restartInstance(qq) {
    assertQQ(qq)
    const mode = await this.detectProcessMode()
    if (mode === 'wrapper') return this.napcatRestart(qq)
    if (mode === 'docker')  return this.executeCommand(`docker restart napcat_${qq}`)
    await this.executeCommand(`pkill -f "xvfb-run.*qq.*-q ${qq}"`)
    return this.executeCommand(`nohup xvfb-run -a qq --no-sandbox -q ${qq} > /dev/null 2>&1 &`, 10000)
  }

  async isNapCatInstalled() {
    const check = await this.executeCommand(
      'command -v napcat >/dev/null 2>&1' +
      ` || test -d "${this.napcatBasePath}" 2>/dev/null` +
      ' || test -d /opt/QQ 2>/dev/null' +
      ' || test -f /opt/QQ/qq 2>/dev/null' +
      '; echo $?'
    )
    return check.success && check.stdout.trim() === '0'
  }

  async isNapCatRunning(qq) {
    const result = await this.executeCommand(`ps aux | grep -i "napcat" | grep -w "${qq}" | grep -v grep | wc -l`)
    if (result.success) {
      const count = parseInt(result.stdout.trim()) || 0
      return { success: true, running: count > 0, count }
    }
    return { success: false, running: false }
  }

  async getSFTP() {
    if (!this.isConnected) {
      const connected = await this.connect()
      if (!connected) throw new Error('SSH 连接失败，无法创建 SFTP 连接')
    }

    if (this.sftp) return this.sftp

    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) return reject(new Error(`创建 SFTP 连接失败: ${err.message}`))
        this.sftp = sftp
        resolve(this.sftp)
      })
    })
  }

  async downloadFile(remotePath, localPath) {
    try {
      const sftp = await this.getSFTP()
      return new Promise((resolve, reject) => {
        const readStream = sftp.createReadStream(remotePath)
        const writeStream = fs.createWriteStream(localPath)
        const cleanup = () => { try { readStream.destroy(); writeStream.close() } catch {} }
        readStream.on('error', (err) => { cleanup(); reject(new Error(`读取远程文件失败: ${err.message}`)) })
        writeStream.on('error', (err) => { cleanup(); reject(new Error(`写入本地文件失败: ${err.message}`)) })
        writeStream.on('finish', () => resolve({ success: true, message: '文件下载成功', localPath }))
        readStream.pipe(writeStream)
      })
    } catch (error) {
      return { success: false, message: `文件下载失败: ${error.message}`, error }
    }
  }

  async uploadFile(localPath, remotePath) {
    try {
      const sftp = await this.getSFTP()
      return new Promise((resolve, reject) => {
        const readStream  = fs.createReadStream(localPath)
        const writeStream = sftp.createWriteStream(remotePath)
        const cleanup = () => { try { readStream.destroy(); writeStream.close() } catch {} }
        readStream.on('error',  err => { cleanup(); reject(new Error(`读取本地文件失败: ${err.message}`)) })
        writeStream.on('error', err => { cleanup(); reject(new Error(`写入远程文件失败: ${err.message}`)) })
        writeStream.on('close', ()  => resolve({ success: true, remotePath }))
        readStream.pipe(writeStream)
      })
    } catch (error) {
      return { success: false, message: `文件上传失败: ${error.message}`, error }
    }
  }

  async fileExists(remotePath) {
    try {
      const sftp = await this.getSFTP()
      return new Promise((resolve) => {
        sftp.stat(remotePath, (err) => resolve(!err))
      })
    } catch (error) {
      return false
    }
  }

  async getQQQRCode(localSavePath, qq = '') {
    const paths = [
      `${this.napcatBasePath}/qq_${qq}/cache/qrcode.png`,
      `${this.napcatConfigDir}/qq_${qq}/cache/qrcode.png`,
      `${this.napcatBasePath}/cache/qrcode.png`,
      '/tmp/napcat/qrcode.png',
    ]
    let remotePath = ''
    for (const p of paths) {
      if (await this.fileExists(p)) { remotePath = p; break }
    }
    if (!remotePath) {
      return { success: false, message: '未找到二维码文件，请确认 NapCat 已生成登录二维码' }
    }
    if (!fs.existsSync(path.dirname(localSavePath))) fs.mkdirSync(path.dirname(localSavePath), { recursive: true })
    const dl = await this.downloadFile(remotePath, localSavePath)
    return { ...dl, remotePath }
  }

  async readFile(remotePath) {
    const result = await this.executeCommand(`cat "${remotePath}" 2>/dev/null`)
    if (result.success && result.stdout) {
      return { success: true, content: result.stdout, path: remotePath }
    }
    return { success: false, message: result.stderr || '文件不存在或无法读取', path: remotePath }
  }

  async readJSON(remotePath) {
    const result = await this.readFile(remotePath)
    if (!result.success) return result
    try {
      let data
      try {
        data = JSON.parse(result.content)
      } catch {
        let cleaned = result.content
          .replace(/^\s*\/\/.*$/gm, '')
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .replace(/,\s*([}\]])/g, '$1')
        data = JSON.parse(cleaned)
      }
      return { success: true, data, path: remotePath }
    } catch (e) {
      return { success: false, message: `JSON 解析失败: ${e.message}`, raw: result.content, path: remotePath }
    }
  }

  async writeFile(remotePath, content) {
    const b64 = Buffer.from(content, 'utf8').toString('base64')
    const result = await this.executeCommand(
      `echo '${b64}' | base64 -d > "${remotePath}" 2>&1 && echo "WRITE_OK" || echo "WRITE_FAIL"`
    )
    if (result.success && result.stdout.includes('WRITE_OK')) {
      return { success: true, path: remotePath }
    }
    return { success: false, message: result.stderr || result.stdout || '写入失败', path: remotePath }
  }

  async writeJSON(remotePath, data) {
    return this.writeFile(remotePath, JSON.stringify(data, null, 2))
  }

  async listDirectory(remotePath) {
    const result = await this.executeCommand(`ls -lah "${remotePath}" 2>&1`)
    if (result.success) return { success: true, listing: result.stdout, path: remotePath }
    return { success: false, message: result.stderr || '目录不存在或无法访问', path: remotePath }
  }

  async pathExists(remotePath) {
    const result = await this.executeCommand(`test -e "${remotePath}" 2>/dev/null && echo "YES" || echo "NO"`)
    return result.success && result.stdout.trim() === 'YES'
  }

  async deletePath(remotePath, recursive = false) {
    const flag = recursive ? '-rf' : '-f'
    const result = await this.executeCommand(`rm ${flag} "${remotePath}" 2>&1 && echo "DELETE_OK" || echo "DELETE_FAIL"`)
    return { success: result.success && result.stdout.includes('DELETE_OK'), message: result.stderr || result.stdout }
  }

  async getSystemInfo() {
    const result = await this.executeCommand(
      `echo "CPU%:$(top -bn1 2>/dev/null | grep '%Cpu' | head -1 | awk '{print $2}')"` + ';' +
      `echo "MEM:$(free -h 2>/dev/null | grep Mem | awk '{print $3"/"$2}')"` + ';' +
      `echo "SWAP:$(free -h 2>/dev/null | grep Swap | awk '{print $3"/"$2}')"` + ';' +
      `echo "DISK:$(df -h / 2>/dev/null | tail -1 | awk '{print $3"/"$2" "$5}')"` + ';' +
      `echo "UPTIME:$(uptime -p 2>/dev/null | sed 's/^up //')"` + ';' +
      `echo "LOAD:$(cat /proc/loadavg 2>/dev/null | awk '{print $1,$2,$3}')"` + ';' +
      `echo "OS:$(cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"')"`
    )
    if (!result.success) return { success: false, message: result.stderr || '获取系统信息失败' }

    const info = {}
    for (const line of result.stdout.trim().split('\n')) {
      const idx = line.indexOf(':')
      if (idx > 0) info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
    }
    return { success: true, info }
  }

  async getNapCatVersion() {
    let result = await this.executeCommand(
      `find ${this.napcatBasePath}/plugins -maxdepth 2 -name "package.json" 2>/dev/null ` +
      `| xargs grep -l '"napcat"' 2>/dev/null | head -1 ` +
      `| xargs grep -oE '"version"\\s*:\\s*"[^"]+"' 2>/dev/null | grep -oE '[0-9]+\\.[0-9]+[^"]*' | head -1`
    )
    if (result.success && result.stdout.trim()) return { success: true, version: result.stdout.trim() }
    result = await this.executeCommand(
      `cat ${this.napcatBasePath}/qqnt.json 2>/dev/null ` +
      `| grep -oE '"linuxVersion"\\s*:\\s*"[^"]+"' | grep -oE '[0-9][^"]+' | head -1`
    )
    if (result.success && result.stdout.trim()) return { success: true, version: `NapCat@QQ-${result.stdout.trim()}` }
    result = await this.executeCommand(
      `cat ${this.napcatBasePath}/package.json 2>/dev/null ` +
      `| grep -oE '"version"\\s*:\\s*"[^"]+"' | grep -oE '[0-9][^"]+' | head -1`
    )
    if (result.success && result.stdout.trim()) return { success: true, version: result.stdout.trim() }

    return { success: false, message: '无法获取版本信息' }
  }

  async getNapCatProcesses() {
    const result = await this.executeCommand('ps aux 2>/dev/null | grep -i napcat | grep -v grep || echo "NO_PROCESS"')
    if (result.success) {
      const raw = result.stdout.trim()
      if (raw.includes('NO_PROCESS') || !raw) return { success: true, running: false, processes: [] }
      const processes = raw.split('\n').map(line => {
        const cols = line.trim().split(/\s+/)
        if (cols.length < 11) return null
        return {
          user: cols[0], pid: cols[1], cpu: cols[2], mem: cols[3],
          vsz: cols[4], rss: cols[5], tty: cols[6], stat: cols[7],
          start: cols[8], time: cols[9], command: cols.slice(10).join(' ')
        }
      }).filter(Boolean)
      return { success: true, running: processes.length > 0, processes }
    }
    return { success: false, message: '获取进程信息失败' }
  }

  async getPortStatus(port) {
    const result = await this.executeCommand(`ss -tlnp 2>/dev/null | grep ":${port}" || echo "PORT_NOT_LISTENING"`)
    const stdout = result.stdout || ''
    return { success: true, listening: result.success && !stdout.includes('PORT_NOT_LISTENING'), detail: stdout.trim() }
  }

  async _detectConfigDirs() {
    if (this._detectedDirs) return this._detectedDirs
    this._detectedDirs = []

    const cmdline = await this.executeCommand(
      `ps aux | grep -i napcat | grep -v grep | head -5`
    )
    if (cmdline.success && cmdline.stdout.trim()) {
      const configMatch = cmdline.stdout.match(/(?:--config|-c)\s+(\S+)/)
      if (configMatch) {
        const configPath = configMatch[1].replace(/"/g, '')
        this._detectedDirs.push(configPath, `${configPath}/config`)
      }
      const pids = cmdline.stdout.match(/^\S+\s+(\d+)/gm)
      if (pids) {
        for (const line of pids) {
          const pid = line.trim().split(/\s+/)[1]
          if (!pid) continue
          let cwd = await this.executeCommand(`readlink /proc/${pid}/cwd 2>/dev/null || ls -l /proc/${pid}/cwd 2>/dev/null | awk '{print $NF}'`)
          if (!cwd.success || !cwd.stdout.trim()) {
            cwd = await this.executeCommand(`pwdx ${pid} 2>/dev/null | awk '{print $2}'`)
          }
          if (cwd.success && cwd.stdout.trim()) {
            const dir = cwd.stdout.trim()
            this._detectedDirs.push(dir, `${dir}/config`)
          }
        }
      }
    }

    const svc = await this.executeCommand(
      `systemctl show napcat 2>/dev/null | grep WorkingDirectory | cut -d= -f2`
    )
    if (svc.success && svc.stdout.trim()) {
      const dir = svc.stdout.trim()
      this._detectedDirs.push(dir, `${dir}/config`)
    }
    const found = await this.executeCommand(
      `find /opt /home /root /etc /var -maxdepth 6 \\( -name "webui.json" -o -name "napcat.json" \\) 2>/dev/null | head -5`
    )
    if (found.success && found.stdout.trim()) {
      for (const f of found.stdout.trim().split('\n')) {
        if (f) this._detectedDirs.push(f.substring(0, f.lastIndexOf('/')))
      }
    }

    this._detectedDirs.push(
      this.napcatConfigDir,
      '/opt/QQ/resources/app/app_launcher/napcat/config',
      '/root/.config/napcat',
      '/etc/napcat'
    )
    this._detectedDirs = [...new Set(this._detectedDirs)].filter(Boolean)
    return this._detectedDirs
  }

  _clearDetectedDirs() { this._detectedDirs = null }

  async _findConfig(name) {
    for (const dir of await this._detectConfigDirs()) {
      const r = await this.readJSON(`${dir}/${name}`)
      if (r.success) return r
    }
    for (const f of await this._findFile(name)) {
      const r = await this.readJSON(f)
      if (r.success) return r
    }
    return { success: false, message: `未找到 ${name}` }
  }

  async _writeConfig(foundPath, fallbackPath, data) {
    const p = foundPath || fallbackPath
    return this.writeJSON(p, data)
  }

  async readNapCatGlobalConfig() { return this._findConfig('napcat.json') }
  async writeNapCatGlobalConfig(config, foundPath) { return this._writeConfig(foundPath, `${this.napcatConfigDir}/napcat.json`, config) }
  async readWebUIConfig() { return this._findConfig('webui.json') }
  async writeWebUIConfig(config, foundPath) { return this._writeConfig(foundPath, `${this.napcatConfigDir}/webui.json`, config) }

  async readOB11Config(uin) {
    for (const name of [`onebot11_${uin}.json`, `napcat_${uin}.json`]) {
      const r = await this._findConfig(name)
      if (r.success) return r
    }
    return { success: false, message: `未找到 QQ ${uin} 的配置文件` }
  }

  async writeOB11Config(uin, config, foundPath) { return this._writeConfig(foundPath, `${this.napcatConfigDir}/onebot11_${uin}.json`, config) }

  async _findFile(filename) {
    const r = await this.executeCommand(
      `find /opt /home /root /etc /var -maxdepth 6 -name "${filename}" -type f 2>/dev/null | head -3`
    )
    return r.success && r.stdout.trim() ? r.stdout.trim().split('\n') : []
  }

  async readNapCatAccountConfig(uin) { return this._findConfig(`napcat_${uin}.json`) }
  async writeNapCatAccountConfig(uin, config, foundPath) { return this._writeConfig(foundPath, `${this.napcatConfigDir}/napcat_${uin}.json`, config) }

  async listNapCatAccounts() {
    const result = await this.executeCommand('napcat status 2>/dev/null')
    if (result.success && result.stdout) {
      const qqs = (result.stdout.match(/QQ\s+(\d{5,12})/g) || [])
        .map(s => s.replace(/QQ\s+/, ''))
      const accounts = [...new Set(qqs)]
      if (accounts.length) return { success: true, accounts }
    }
    for (const dir of await this._detectConfigDirs()) {
      const ls = await this.executeCommand(`ls "${dir}"/napcat_*.json 2>/dev/null | sed 's/.*napcat_//' | sed 's/.json//' || echo ""`)
      if (ls.success && ls.stdout.trim()) {
        return { success: true, accounts: ls.stdout.trim().split('\n').filter(a => a) }
      }
    }
    return { success: true, accounts: [] }
  }

  async listConfigFiles() {
    for (const dir of await this._detectConfigDirs()) {
      const r = await this.executeCommand(`ls -lah "${dir}"/ 2>/dev/null`)
      if (r.success && r.stdout.trim()) return { success: true, listing: r.stdout }
    }
    return { success: false, message: '无法列出配置目录' }
  }

  
  async getWebUIPort() {
    const r = await this.readWebUIConfig()
    if (r.success && r.data?.port) return r.data.port
    return this.config.webuiPort || 6099
  }

  
  async getOB11Ports(uin) {
    const r = await this.readOB11Config(uin)
    if (!r.success || !r.data) return []
    const servers = r.data?.network?.httpServers || []
    return servers
      .filter(s => s.enable !== false && s.port)
      .map(s => s.port)
  }

  async getWebUIToken() {
    if (this.webuiToken) return this.webuiToken
    const result = await this.readWebUIConfig()
    if (result.success && result.data && result.data.token) {
      this.webuiToken = result.data.token
      return this.webuiToken
    }
    return null
  }

  clearWebUIToken() { this.webuiToken = null }

  async webuiApiCall(method, apiPath, data = null) {
    const token = await this.getWebUIToken()
    const webuiPort = this.config.webuiPort || 6099
    const authHeader = token ? `-H "Authorization: Bearer ${token}"` : ''
    const baseUrl = `http://127.0.0.1:${webuiPort}`

    let curlCmd
    if (method === 'GET') {
      curlCmd = `curl -s -X GET "${baseUrl}${apiPath}" ${authHeader} 2>&1`
    } else if (method === 'DELETE') {
      curlCmd = `curl -s -X DELETE "${baseUrl}${apiPath}" ${authHeader} 2>&1`
    } else if (method === 'POST' || method === 'PUT') {
      const json = data ? JSON.stringify(data) : '{}'
      const b64 = Buffer.from(json).toString('base64')
      curlCmd = `echo '${b64}' | base64 -d | curl -s -X ${method} "${baseUrl}${apiPath}" ${authHeader} -H "Content-Type: application/json" -d @- 2>&1`
    } else {
      return { success: false, message: `不支持的 HTTP 方法: ${method}` }
    }

    const result = await this.executeCommand(curlCmd)
    if (result.stdout) {
      try {
        return { success: true, data: JSON.parse(result.stdout) }
      } catch {
        return { success: true, data: result.stdout }
      }
    }
    return { success: false, message: result.stderr || 'WebUI API 无响应（WebUI 可能未运行）' }
  }

  async webuiApiGet(apiPath) { return this.webuiApiCall('GET', apiPath) }
  async webuiApiPost(apiPath, data) { return this.webuiApiCall('POST', apiPath, data) }

  async backupConfigDir(backupName = '') {
    const timestamp = backupName || new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').substring(0, 19)
    const backupFileName = `napcat_config_backup_${timestamp}.tar.gz`
    const backupDir = `${this.napcatConfigDir}/../backups`

    const script = `mkdir -p "${backupDir}" && cd "${this.napcatConfigDir}/.." && tar -czf "${backupDir}/${backupFileName}" config/ 2>&1 && echo "BACKUP_OK:${backupFileName}" || echo "BACKUP_FAIL"`
    const result = await this.executeCommand(script)
    if (result.success && result.stdout.includes('BACKUP_OK')) {
      return { success: true, backupFile: backupFileName, backupPath: `${backupDir}/${backupFileName}` }
    }
    return { success: false, message: result.stderr || result.stdout || '备份失败' }
  }

  async listBackups() {
    const backupDir = `${this.napcatConfigDir}/../backups`
    const result = await this.executeCommand(`ls -laht "${backupDir}"/napcat_config_backup_*.tar.gz 2>/dev/null || echo "NO_BACKUPS"`)
    if (result.success && !result.stdout.includes('NO_BACKUPS')) {
      return { success: true, listing: result.stdout }
    }
    return { success: true, listing: '没有找到备份文件', backups: [] }
  }

  async restoreConfigDir(backupFileName) {
    const backupDir = `${this.napcatConfigDir}/../backups`
    const backupPath = `${backupDir}/${backupFileName}`

    const exists = await this.pathExists(backupPath)
    if (!exists) return { success: false, message: `备份文件不存在: ${backupFileName}` }

    const script = `cd "${this.napcatConfigDir}/.." && cp -r config/ "config_backup_before_restore_$(date +%s)/" 2>/dev/null; cd "${this.napcatConfigDir}/.." && tar -xzf "${backupPath}" 2>&1 && echo "RESTORE_OK" || echo "RESTORE_FAIL"`
    const result = await this.executeCommand(script)
    if (result.success && result.stdout.includes('RESTORE_OK')) {
      return { success: true, message: '配置已恢复，原配置已自动备份' }
    }
    return { success: false, message: result.stderr || result.stdout || '恢复失败' }
  }

  async listLogFiles() {
    const logsDir = `${this.napcatBasePath}/logs`
    const result = await this.executeCommand(`ls -laht "${logsDir}"/ 2>/dev/null | head -30 || echo "NO_LOGS"`)
    if (result.success && !result.stdout.includes('NO_LOGS')) return { success: true, listing: result.stdout }
    return { success: true, listing: '没有找到日志文件' }
  }

  async detectNapCatPath() {
    if (this.napcatBasePath) {
      const ok = await this.executeCommand(`test -d "${this.napcatBasePath}" && echo "YES" || echo "NO"`)
      if (ok.stdout.trim() === 'YES') return this.napcatBasePath
    }
    const officialPath = '/opt/QQ/resources/app/app_launcher/napcat'
    const ok2 = await this.executeCommand(`test -d "${officialPath}" && echo "YES" || echo "NO"`)
    if (ok2.stdout.trim() === 'YES') return officialPath
    const result = await this.executeCommand(
      `find /opt /home /root /etc /var -maxdepth 9 -name "napcat" -type d 2>/dev/null | grep -v node_modules | head -3`
    )
    if (result.success && result.stdout.trim()) {
      return result.stdout.trim().split('\n').filter(Boolean)[0]
    }

    return null
  }

  async detectProcessMode() {
    let result = await this.executeCommand('command -v napcat >/dev/null 2>&1 && napcat help 2>&1 | grep -c "start\\|stop" || echo "0"')
    if (result.success && (parseInt(result.stdout.trim()) || 0) >= 2) return 'wrapper'
    result = await this.executeCommand('docker ps 2>/dev/null | grep -i napcat | wc -l')
    if (result.success && (parseInt(result.stdout.trim()) || 0) > 0) return 'docker'
    result = await this.executeCommand('command -v screen >/dev/null 2>&1 && command -v xvfb-run >/dev/null 2>&1 && echo "YES" || echo "NO"')
    if (result.success && result.stdout.trim() === 'YES') return 'screen'

    return 'unknown'
  }
}

class ConnectionPool {
  constructor(configPath) {
    this._configPath = configPath || path.resolve(__dirname, '../config/servers.json')
    this._clients = new Map()
    this._connecting = new Map()

    try {
      this._config = loadConfig(this._configPath) || { _schemaVersion: 1, defaultServer: '', servers: {} }
    } catch (err) {
      logger.error(`[ngl:pool] servers.json 加载失败:`, err.message)
      this._config = { _schemaVersion: 1, defaultServer: '', servers: {} }
    }
  }

  hasServer(name)       { return !!this._config.servers?.[name] }
  getServerConfig(name) { return this._config.servers?.[name] ?? null }
  get serverCount()     { return Object.keys(this._config.servers || {}).length }
  get serverNames()     { return Object.keys(this._config.servers || {}) }

  async get(name) {
    if (name === 'all') name = undefined
    if (!name) {
      name = this._config.defaultServer
      if (!name) {
        const err = new Error('未设置默认服务器')
        err.code = 'SRV_NOTFOUND'
        throw err
      }
    }

    const cached = this._clients.get(name)
    if (cached) return cached

    const connecting = this._connecting.get(name)
    if (connecting) return connecting

    const promise = (async () => {
      const serverConfig = this._config.servers[name]
      if (!serverConfig) {
        const err = new Error(`服务器 ${name} 不存在`)
        err.code = 'SRV_NOTFOUND'
        throw err
      }

      if (serverConfig.disabled) {
        const err = new Error(`服务器 ${name} 已禁用`)
        err.code = 'SRV_DISABLED'
        throw err
      }

      const client = new SSHClient(serverConfig)
      const connected = await client.connect()
      if (!connected) {
        const err = new Error(`服务器 ${name} 连接失败`)
        err.code = 'SRV_OFFLINE'
        throw err
      }

      if (!serverConfig.napcatBasePath || !serverConfig.napcatBasePath.trim()) {
        const detected = await client.detectNapCatPath()
        if (detected) {
          client.napcatBasePath = detected
          client.napcatConfigDir = `${detected}/config`
          this._config.servers[name].napcatBasePath = detected
          this._config.servers[name].napcatConfigDir = `${detected}/config`
          try { saveConfig(this._config, this._configPath) } catch (err) { logger.warn(`[ngl:pool] 保存检测路径失败: ${err.message}`) }
        }
      }

      this._clients.set(name, client)
      return client
    })()

    this._connecting.set(name, promise)
    try {
      return await promise
    } finally {
      this._connecting.delete(name)
    }
  }

  async add(name, config) {
    const nameCheck = validateServerName(name)
    if (!nameCheck.valid) {
      return { success: false, code: 'INV_SRVNAME', message: nameCheck.message }
    }
    if (this._config.servers[name]) {
      return { success: false, code: 'SRV_DUPNAME', message: `服务器 ${name} 已存在` }
    }
    if (!config.host) {
      return { success: false, code: 'INV_PARAM', message: 'host 不能为空' }
    }
    const hostCheck = validateHost(config.host)
    if (!hostCheck.valid) {
      return { success: false, code: 'INV_PARAM', message: `host 无效: ${hostCheck.message}` }
    }
    if (!config.username) {
      return { success: false, code: 'INV_PARAM', message: 'username 不能为空' }
    }
    if (!config.password && !config.privateKey) {
      return { success: false, code: 'INV_PARAM', message: 'password 和 privateKey 至少提供一个' }
    }
    const portCheck = validatePort(config.port || 22)
    if (!portCheck.valid) {
      return { success: false, code: 'INV_PARAM', message: `port 无效: ${portCheck.message}` }
    }
    const serverConfig = {
      host: config.host,
      port: config.port || 22,
      username: config.username,
      password: config.password || '',
      privateKey: config.privateKey || '',
      passphrase: config.passphrase || '',
      deployMode: config.deployMode || 'auto',
      napcatBasePath: config.napcatBasePath || '',
      napcatConfigDir: config.napcatConfigDir || '',
      webuiPort: config.webuiPort || 6099,
      ob11HttpPort: config.ob11HttpPort || 3000,
      ob11WsPort: config.ob11WsPort || 3001,
      maxInstances: config.maxInstances || 5,
      tags: config.tags || [],
      connectTimeout: config.connectTimeout || 10000,
      keepaliveInterval: config.keepaliveInterval || 60000,
      disabled: false
    }
    const testClient = new SSHClient(serverConfig)
    const connected = await testClient.connect()
    if (!connected) {
      return { success: false, code: 'SRV_OFFLINE', message: `连接 ${name} 失败: 无法建立 SSH 连接` }
    }
    const detectedPath = await testClient.detectNapCatPath()
    if (detectedPath) {
      serverConfig.napcatBasePath = detectedPath
      serverConfig.napcatConfigDir = `${detectedPath}/config`
    }
    this._config.servers[name] = serverConfig
    if (!this._config.defaultServer) {
      this._config.defaultServer = name
    }

    try {
      saveConfig(this._config, this._configPath)
    } catch (err) {
      delete this._config.servers[name]
      if (this._config.defaultServer === name) this._config.defaultServer = ''
      await testClient.disconnect()
      return { success: false, code: 'CFG_WRITERR', message: `保存配置失败: ${err.message}` }
    }
    await testClient.disconnect()

    return { success: true, message: `服务器 ${name} 已添加` }
  }

  async remove(name) {
    if (!this._config.servers[name]) {
      return { success: false, code: 'SRV_NOTFOUND', message: `服务器 ${name} 不存在` }
    }
    const client = this._clients.get(name)
    if (client) {
      await client.disconnect()
      this._clients.delete(name)
    }
    const backupServer = this._config.servers[name]
    const backupDefault = this._config.defaultServer
    delete this._config.servers[name]
    if (this._config.defaultServer === name) this._config.defaultServer = ''

    try {
      saveConfig(this._config, this._configPath)
    } catch (err) {
      this._config.servers[name] = backupServer
      this._config.defaultServer = backupDefault
      return { success: false, code: 'CFG_WRITERR', message: `保存配置失败: ${err.message}` }
    }

    return { success: true }
  }

  async updateConfig(name, key, value) {
    if (!this._config.servers[name]) {
      return { success: false, code: 'SRV_NOTFOUND', message: `服务器 ${name} 不存在` }
    }

    if (key === 'name') {
      return { success: false, code: 'INV_PARAM', message: '服务器名称不可修改' }
    }
    const numericKeys = ['port', 'webuiPort', 'ob11HttpPort', 'ob11WsPort', 'connectTimeout', 'keepaliveInterval', 'maxInstances']
    if (numericKeys.includes(key)) {
      value = parseInt(value)
      if (isNaN(value)) {
        return { success: false, code: 'INV_PARAM', message: `${key} 必须为数字` }
      }
    }

    this._config.servers[name][key] = value

    try {
      saveConfig(this._config, this._configPath)
    } catch (err) {
      return { success: false, code: 'CFG_WRITERR', message: `保存配置失败: ${err.message}` }
    }

    return { success: true, message: `已修改 ${name} 的 ${key}` }
  }

  async list() {
    const entries = Object.entries(this._config.servers)
    if (entries.length === 0) return []

    const results = await Promise.allSettled(
      entries.map(async ([name, serverConfig]) => {
        const status = {
          name,
          connected: false,
          instances: 0,
          accounts: []
        }

        let client = this._clients.get(name)
        if (!client || !client.isConnected) {
          if (serverConfig.disabled) {
            status.error = 'disabled'
            return status
          }
          try {
            const tempClient = new SSHClient(serverConfig)
            let timer
            const timeout = new Promise((_, reject) =>
              timer = setTimeout(() => reject(new Error('连接超时')), 5000)
            )
            let connected = false
            try {
              connected = await Promise.race([tempClient.connect(), timeout])
            } finally { clearTimeout(timer) }
            if (!connected) {
              await tempClient.disconnect()
              status.error = 'SSH 连接失败'
              return status
            }
            client = tempClient
            this._clients.set(name, tempClient)
          } catch (e) {
            status.error = e.message
            return status
          }
        }

        status.connected = true
        try {
          const napcatStatus = await client.listNapCatAccounts()
          if (napcatStatus.success) {
            status.accounts = napcatStatus.accounts || []
            status.instances = status.accounts.length
          }
        } catch (e) {
          status.error = e.message
        }

        return status
      })
    )

    return results.map(r => r.status === 'fulfilled' ? r.value : { name: 'unknown', connected: false, instances: 0, accounts: [], error: r.reason?.message || 'unknown error' })
  }

}

const pool = new ConnectionPool()
export default pool
