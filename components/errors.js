/**
 * Napcat_GL - 统一错误格式化
 */

/**
 * 将 Error / 普通对象格式化为统一的错误字符串。
 */
export function formatError(err) {
  if (!err) return '未知错误'
  const msg = err.message || String(err)
  return err.code ? `[${err.code}] ${msg}` : msg
}

/**
 * 解析 NapCat 命令执行结果，返回清晰的中文提示。
 * 识别常见错误类型并给出操作建议。
 *
 * @param {object} r       executeCommand / napcatStart 等的返回值
 * @param {string} qq      QQ 号（用于提示）
 * @param {string} server  服务器名（用于提示）
 * @returns {string}
 */
export function parseNapcatError(r, qq = '', server = '') {
  const raw = (r.stdout || r.stderr || r.message || '').trim()

  // 禁止多开
  if (/禁止多开|already running|多开/.test(raw)) {
    const pidMatch = raw.match(/PID:\s*(\d+),\s*QQ:\s*(\d+)/)
    return pidMatch
      ? `启动失败：NapCat 禁止多开，当前运行中: QQ ${pidMatch[2]}`
      : `启动失败：NapCat 禁止多开`
  }

  // 账号不存在 / 未配置
  if (/not found|不存在|未找到|no such/.test(raw)) {
    return `启动失败：账号 ${qq} 配置不存在\n→ 先创建: #ngl创建账号 ${server} ${qq}`
  }

  // 端口占用
  if (/address already in use|端口.*占用|EADDRINUSE/.test(raw)) {
    return `启动失败：端口被占用，请检查是否有残留进程\n→ 尝试强制停止: #ngl强制停止 ${server} ${qq}`
  }

  // 权限不足
  if (/permission denied|没有权限|EACCES/.test(raw)) {
    return `启动失败：权限不足\n→ 检查文件权限或以 root 运行`
  }

  // 通用
  return raw ? `启动失败：${raw}` : '启动失败：未知错误'
}
