/**
 * 校验服务器名称
 *
 * @param {*} name - 待校验的服务器名称
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateServerName(name) {
  if (name === null || name === undefined) {
    return { valid: false, message: '服务器名称不能为空' };
  }

  if (typeof name !== 'string') {
    return { valid: false, message: '服务器名称必须为字符串' };
  }

  if (name === '') {
    return { valid: false, message: '服务器名称不能为空' };
  }

  if (name.length > 20) {
    return { valid: false, message: '服务器名称不能超过20个字符' };
  }

  if (!/^(?!\d+$)[\p{L}\p{N}_-]{1,20}$/u.test(name)) {
    return {
      valid: false,
      message: '名称格式错误。支持中英文/数字/下划线/连字符, 最长20位, 不可纯数字'
    };
  }

  return { valid: true };
}

/**
 * 校验 QQ 号
 *
 * 接受字符串或数字类型；转换为字符串后以 /^\d{5,12}$/ 校验。
 *
 * @param {*} qq - 待校验的 QQ 号
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateQQ(qq) {
  if (qq === null || qq === undefined) {
    return { valid: false, message: 'QQ号不能为空' };
  }

  // 仅接受字符串或数字类型
  if (typeof qq !== 'string' && typeof qq !== 'number') {
    return { valid: false, message: 'QQ号格式无效' };
  }

  // 数字类型 → 转换为字符串
  if (typeof qq === 'number') {
    if (!Number.isInteger(qq) || qq <= 0) {
      return { valid: false, message: 'QQ号必须为正整数' };
    }

    // Number.toString() 对于大数可能转为科学计数法，但 QQ 号上限 12 位，安全
    qq = qq.toString();
  }

  // 空字符串
  if (qq === '') {
    return { valid: false, message: 'QQ号不能为空' };
  }

  if (!/^\d{5,12}$/.test(qq)) {
    if (qq.length < 5) {
      return { valid: false, message: 'QQ号不能少于5位数字' };
    }
    if (qq.length > 12) {
      return { valid: false, message: 'QQ号不能超过12位数字' };
    }
    return { valid: false, message: 'QQ号只能包含数字' };
  }

  return { valid: true };
}

/**
 * 校验主机地址 (host)
 *
 * 仅验证非空及长度，不验证 IP/DNS 格式。
 *
 * @param {*} host - 待校验的主机地址
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateHost(host) {
  if (host === null || host === undefined) {
    return { valid: false, message: '主机地址不能为空' };
  }

  if (typeof host !== 'string') {
    return { valid: false, message: '主机地址必须为字符串' };
  }

  if (host.trim() === '') {
    return { valid: false, message: '主机地址不能为空' };
  }

  if (host.length > 255) {
    return { valid: false, message: '主机地址不能超过255个字符' };
  }

  return { valid: true };
}

/**
 * 校验端口号
 *
 * 接受字符串或数字类型；必须为 1-65535 之间的整数。
 *
 * @param {*} port - 待校验的端口号
 * @returns {{ valid: boolean, message?: string }}
 */
export function validatePort(port) {
  if (port === null || port === undefined) {
    return { valid: false, message: '端口号不能为空' };
  }

  const type = typeof port;
  if (type !== 'string' && type !== 'number') {
    return { valid: false, message: '端口号必须为数字或数字字符串' };
  }

  const portNum = type === 'string' ? parseInt(port, 10) : port;

  if (!Number.isInteger(portNum) || isNaN(portNum)) {
    return { valid: false, message: '端口号必须为整数' };
  }

  if (portNum < 1 || portNum > 65535) {
    return { valid: false, message: '端口号必须在 1-65535 之间' };
  }

  return { valid: true };
}

/**
 * 校验备份文件名
 *
 * 格式: [\w.\-]+.tar.gz；额外检查路径分隔符与命令注入字符。
 *
 * @param {*} name - 待校验的备份文件名
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateBackupFile(name) {
  if (name === null || name === undefined) {
    return { valid: false, message: '备份文件名不能为空' };
  }

  if (typeof name !== 'string') {
    return { valid: false, message: '备份文件名必须为字符串' };
  }

  if (name === '') {
    return { valid: false, message: '备份文件名不能为空' };
  }

  if (name.includes('/') || name.includes('\\')) {
    return { valid: false, message: '备份文件名不能包含路径分隔符' };
  }

  const dangerous = [';', '|', '&', '$', '`', '(', ')', '{', '}', '<', '>', "'", '"', '\n', '\r', '\t'];
  for (const ch of dangerous) {
    if (name.includes(ch)) {
      return { valid: false, message: '备份文件名包含不安全的字符' };
    }
  }

  if (!/^[\w.\-]+\.tar\.gz$/.test(name)) {
    return { valid: false, message: '备份文件名必须为 .tar.gz 格式，且只能包含字母、数字、下划线、点和连字符' };
  }

  return { valid: true };
}

/**
 * 校验配置键名 (config key)
 *
 * 格式: 字母开头，后可跟字母、数字、下划线、点。
 *
 * @param {*} key - 待校验的配置键名
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateConfigKey(key) {
  if (key === null || key === undefined) {
    return { valid: false, message: '配置键名不能为空' };
  }

  if (typeof key !== 'string') {
    return { valid: false, message: '配置键名必须为字符串' };
  }

  if (key === '') {
    return { valid: false, message: '配置键名不能为空' };
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(key)) {
    return { valid: false, message: '配置键名必须以字母开头，且只能包含字母、数字、下划线和点' };
  }

  return { valid: true };
}

/**
 * 聚合校验服务器配置对象
 *
 * 检查项:
 *   - host / username 必填且非空
 *   - password / privateKey 至少提供一个
 *   - port（可选）1-65535
 *   - deployMode（可选）枚举值
 *   - maxInstances（可选）正整数
 *
 * @param {*} config - 服务器配置对象
 * @returns {{ valid: boolean, message?: string }}
 */
export function validateServerConfig(config) {
  if (config === null || config === undefined) {
    return { valid: false, message: '服务器配置不能为空' };
  }

  if (typeof config !== 'object' || Array.isArray(config)) {
    return { valid: false, message: '服务器配置必须为对象' };
  }

  // host —— 必填且非空
  if (!('host' in config) || config.host === null || config.host === undefined) {
    return { valid: false, message: '主机地址 (host) 为必填项' };
  }
  if (typeof config.host !== 'string' || config.host.trim() === '') {
    return { valid: false, message: '主机地址 (host) 不能为空' };
  }

  // username —— 必填且非空
  if (!('username' in config) || config.username === null || config.username === undefined) {
    return { valid: false, message: '用户名 (username) 为必填项' };
  }
  if (typeof config.username !== 'string' || config.username.trim() === '') {
    return { valid: false, message: '用户名 (username) 不能为空' };
  }

  // password / privateKey —— 至少提供一个
  const hasPassword = typeof config.password === 'string' && config.password.trim() !== '';
  const hasPrivateKey = typeof config.privateKey === 'string' && config.privateKey.trim() !== '';
  if (!hasPassword && !hasPrivateKey) {
    return { valid: false, message: '密码 (password) 和密钥 (privateKey) 必须至少提供一个' };
  }

  // port（可选）—— 如提供则必须 1-65535
  if ('port' in config && config.port !== null && config.port !== undefined) {
    const portResult = validatePort(config.port);
    if (!portResult.valid) {
      return { valid: false, message: `端口号无效: ${portResult.message}` };
    }
  }

  // deployMode（可选）—— 枚举值
  if ('deployMode' in config && config.deployMode !== null && config.deployMode !== undefined) {
    const validModes = ['wrapper', 'screen', 'docker', 'auto'];
    if (!validModes.includes(config.deployMode)) {
      return {
        valid: false,
        message: '部署模式 (deployMode) 必须为以下之一: wrapper, screen, docker, auto'
      };
    }
  }

  // maxInstances（可选）—— 正整数
  if ('maxInstances' in config && config.maxInstances !== null && config.maxInstances !== undefined) {
    const val = config.maxInstances;
    const num = typeof val === 'string' ? parseInt(val, 10) : val;

    if (!Number.isInteger(num) || num < 1) {
      return { valid: false, message: '最大实例数 (maxInstances) 必须为正整数' };
    }
  }

  return { valid: true };
}
