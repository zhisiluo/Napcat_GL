const QUERY_ACTIONS = new Set([
  '状态',
  '概览',
  '账号列表',
  '服务器列表',
  '系统信息',
  '版本',
  '进程',
  '端口',
  '查看配置',
  '查看账号配置',
  '查看WebUI',
  '插件列表',
  '插件信息',
  '备份列表',
  '配置文件列表',
  '配置目录',
  '扫码',
  '帮助',
  '测试',
]);

function getServerNames(pool) {
  try {
    return pool.serverNames;
  } catch {
    return [];
  }
}

export function parseCommand(msg, pool) {
  const result = {
    action: '',
    server: undefined,
    params: [],
    error: undefined,
  };
  if (!msg || typeof msg !== 'string') {
    result.error = '不是有效的 #ngl 命令';
    return result;
  }
  const trimmed = msg.trim();
  const nglRegex = /^#ngl\s*/i;
  if (!nglRegex.test(trimmed)) {
    result.error = '不是有效的 #ngl 命令';
    return result;
  }

  const rest = trimmed.replace(nglRegex, '');
  const tokens = rest.split(/\s+/).filter(t => t.length > 0);
  if (tokens.length === 0) {
    result.error = '不是有效的 #ngl 命令';
    return result;
  }

  result.action = tokens[0];
  if (tokens.length >= 2) {
    const second = tokens[1];
    if (second === 'all') {
      if (QUERY_ACTIONS.has(result.action)) {
        result.server = 'all';
        result.params = tokens.slice(2);
      } else {
        result.server = undefined;
        result.params = [];
        result.error = '操作类命令不支持对所有服务器执行';
      }
      return result;
    }
    const serverNames = getServerNames(pool);
    if (serverNames.includes(second)) {
      result.server = second;
      result.params = tokens.slice(2);
      return result;
    }
    if (/^\d{5,12}$/.test(second)) {
      result.server = undefined;
      result.params = tokens.slice(1);
      return result;
    }
    result.server = undefined;
    result.params = tokens.slice(1);
    return result;
  }
  result.params = [];
  return result;
}
