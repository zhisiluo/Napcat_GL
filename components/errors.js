export function formatError(err) {
  if (!err) return '未知错误'
  const msg = err.message || String(err)
  return err.code ? `[${err.code}] ${msg}` : msg
}

export function parseNapcatError(r, qq = '', server = '') {
  if (!r) return '启动失败：未知错误'
  const raw = (r.stdout || r.stderr || r.message || '').trim()
  if (/禁止多开|already running|多开/.test(raw)) {
    const pidMatch = raw.match(/PID:\s*(\d+),\s*QQ:\s*(\d+)/)
    return pidMatch
      ? `启动失败：NapCat 禁止多开，当前运行中: QQ ${pidMatch[2]}`
      : `启动失败：NapCat 禁止多开`
  }
  if (/not found|不存在|未找到|no such/.test(raw)) {
    return `启动失败：账号 ${qq} 配置不存在\n→ 先创建: #ngl创建账号 ${server} ${qq}`
  }
  if (/address already in use|端口.*占用|EADDRINUSE/.test(raw)) {
    return `启动失败：端口被占用，请检查是否有残留进程\n→ 尝试强制停止: #ngl强制停止 ${server} ${qq}`
  }
  if (/permission denied|没有权限|EACCES/.test(raw)) {
    return `启动失败：权限不足\n→ 检查文件权限或以 root 运行`
  }
  return raw ? `启动失败：${raw}` : '启动失败：未知错误'
}
