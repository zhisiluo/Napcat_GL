const TIMEOUT_MS = 120_000

class ConfirmStore {
  constructor() {
    this._pending = new Map()
  }

  /**
   * 发起确认请求。
   * Bot 会提示用户发送 #ngl确认 来执行，或忽略取消。
   */
  request(e, { message, onConfirm, onCancel, timeout = TIMEOUT_MS }) {
    const uid = e.user_id
    this._cancel(uid)

    const timer = setTimeout(() => {
      this._pending.delete(uid)
      if (typeof onCancel === 'function') onCancel('timeout')
    }, timeout)

    this._pending.set(uid, { onConfirm, onCancel, timer })
    e.reply(`${message}\n\n发送 #ngl确认 执行，忽略则自动取消（2分钟超时）`)
  }

  /**
   * 处理 #ngl确认 命令。
   * @returns {boolean} true = 已处理，false = 无待确认操作
   */
  async confirm(e) {
    const uid = e.user_id
    const entry = this._pending.get(uid)
    if (!entry) return false

    clearTimeout(entry.timer)
    this._pending.delete(uid)

    try {
      await entry.onConfirm()
    } catch (err) {
      e.reply(`操作失败: ${err.message}`)
    }
    return true
  }

  hasPending(userId) {
    return this._pending.has(userId)
  }

  _cancel(uid) {
    const entry = this._pending.get(uid)
    if (entry) {
      clearTimeout(entry.timer)
      this._pending.delete(uid)
    }
  }
}

export default new ConfirmStore()
