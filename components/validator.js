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

