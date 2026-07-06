/**
 * Napcat_GL - 扫码登录
 *
 * 简化说明: 统一错误处理用 formatError
 */

import plugin from '../../../lib/plugins/plugin.js'
import pool from '../components/sshpool.js'
import { parseCommand } from '../components/parser.js'
import { formatError } from '../components/errors.js'
import { segment } from 'oicq'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export class QQLogin extends plugin {
  constructor() {
    super({
      name: 'ngl-扫码登录',
      dsc: '获取 NapCat 登录二维码',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl扫码\\s+(\\S+)$', fnc: 'getQRCode', permission: 'master' },
      ]
    })
  }

  async getQRCode(e) {
    if (!e.isMaster) return true
    const m = e.msg.match(/^#ngl扫码\s+(\S+)$/)
    if (!m) { e.reply('用法: #ngl扫码 <服务器名>'); return true }

    let localPath = ''
    try {
      const client = await pool.get(m[1])
      const tmpDir = os.tmpdir()
      localPath = path.join(tmpDir, `napcat_gl_qrcode_${Date.now()}.png`)

      const r = await client.getQQQRCode(localPath)
      if (!r.success) { e.reply(r.message); return true }

      const buf = fs.readFileSync(localPath)
      e.reply(segment.image(buf))
      fs.unlinkSync(localPath)
    } catch (err) {
      if (localPath) { try { fs.unlinkSync(localPath) } catch {} }
      e.reply(formatError(err))
    }
    return true
  }
}
