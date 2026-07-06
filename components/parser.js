/**
 * Napcat_GL - 命令解析器
 *
 * 职责: 统一解析 #ngl 命令格式, 提取 action/server/params
 * 依赖: ./sshpool.js (仅用于获取有效服务器名列表)
 *
 * @author  Claude Code
 * @version 1.0.0
 * @since   2026-07-05
 */

// QUERY_ACTIONS: actions that allow server="all"
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

/**
 * Get list of valid server names from the pool's config
 * @param {object} pool - ConnectionPool instance
 * @returns {string[]}
 */
function getServerNames(pool) {
  try {
    return Object.keys(pool._config?.servers || {});
  } catch {
    return [];
  }
}

/**
 * Parse a #ngl command message
 *
 * @param {string} msg - The raw message from e.msg
 * @param {object} pool - ConnectionPool instance (to check valid server names)
 * @returns {{ action: string, server?: string, params: string[], error?: string }}
 */
export function parseCommand(msg, pool) {
  // Default return structure
  const result = {
    action: '',
    server: undefined,
    params: [],
    error: undefined,
  };

  // Defensive: handle null/undefined/non-string msg
  if (!msg || typeof msg !== 'string') {
    result.error = '不是有效的 #ngl 命令';
    return result;
  }

  // Step 1: Extract #ngl prefix (case-insensitive)
  const trimmed = msg.trim();
  const nglRegex = /^#ngl\s*/i;
  if (!nglRegex.test(trimmed)) {
    result.error = '不是有效的 #ngl 命令';
    return result;
  }

  const rest = trimmed.replace(nglRegex, '');

  // Step 2: Split remaining string by whitespace, filter empty strings
  const tokens = rest.split(/\s+/).filter(t => t.length > 0);

  // Step 3: Action is tokens[0]
  if (tokens.length === 0) {
    result.error = '不是有效的 #ngl 命令';
    return result;
  }

  result.action = tokens[0];

  // Step 4: Server detection (tokens[1])
  if (tokens.length >= 2) {
    const second = tokens[1];

    // Check for "all"
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

    // Get valid server names from pool
    const serverNames = getServerNames(pool);

    // Check if second token matches a valid server name
    if (serverNames.includes(second)) {
      result.server = second;
      result.params = tokens.slice(2);
      return result;
    }

    // Check if second token is QQ-like (purely numeric, 5-12 digits)
    if (/^\d{5,12}$/.test(second)) {
      result.server = undefined;
      result.params = tokens.slice(1);
      return result;
    }

    // Otherwise, second token is neither a server name nor a QQ number,
    // so treat it as a parameter (server stays undefined)
    result.server = undefined;
    result.params = tokens.slice(1);
    return result;
  }

  // No second token — just action, no params
  result.params = [];
  return result;
}
