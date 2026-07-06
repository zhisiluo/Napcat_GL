/**
 * Napcat_GL - 配置文件管理
 *
 * 职责: 读写 config/servers.json, 格式迁移, 配置校验
 * 依赖: 无 (仅 Node.js 内置 fs/path/url)
 *
 * @author  Claude Code
 * @version 1.0.0
 * @since   2026-07-05
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ─── 路径解析 ───────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 项目根目录（Napcat_GL 根目录）。
 * 由本文件所在路径 `components/config.js` 向上两级得到。
 */
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * 默认配置文件路径: `<projectRoot>/config/servers.json`
 */
const DEFAULT_CONFIG_PATH = path.resolve(PROJECT_ROOT, 'config', 'servers.json');
const DEFAULT_TEMPLATE_PATH = path.resolve(PROJECT_ROOT, 'default_config', 'servers.json');

// ─── 内部工具 ───────────────────────────────────────────────────────────────

/**
 * 创建空的默认配置模板。
 * @returns {object}
 */
function createEmptyConfig() {
  return {
    _schemaVersion: 1,
    defaultServer: '',
    servers: {},
  };
}

// ─── 公开函数 ───────────────────────────────────────────────────────────────

/**
 * 解析配置文件路径。
 *
 * - 不传参 → 返回默认路径 `<projectRoot>/config/servers.json`
 * - 绝对路径 → 原样返回
 * - 相对路径 → 相对于项目根目录解析
 *
 * @param {string} [customPath] 自定义路径（可选）
 * @returns {string} 解析后的绝对路径
 */
export function getConfigPath(customPath) {
  if (customPath === undefined || customPath === null) {
    return DEFAULT_CONFIG_PATH;
  }
  if (path.isAbsolute(customPath)) {
    return customPath;
  }
  return path.resolve(PROJECT_ROOT, customPath);
}

/**
 * 读取配置文件。
 *
 * 1. 读取 `configPath` 指定的 JSON 文件（默认 `<projectRoot>/config/servers.json`）
 * 2. 若文件不存在或 JSON 解析失败，返回空模板 `{ _schemaVersion:1, defaultServer:'', servers:{} }`
 * 3. 读取成功后在返回前自动执行 migrateConfig()
 *
 * @param {string} [configPath] 配置文件路径（可选）
 * @returns {object} 解析后的配置对象
 */
export function loadConfig(configPath) {
  const resolvedPath = getConfigPath(configPath);

  let raw;
  try {
    raw = fs.readFileSync(resolvedPath, { encoding: 'utf-8' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[INFO] [ngl:config] 配置文件不存在，自动创建: ${resolvedPath}`)
      // 从 default_config/ 复制模板
      const empty = createEmptyConfig()
      try {
        if (fs.existsSync(DEFAULT_TEMPLATE_PATH)) {
          const dir = path.dirname(resolvedPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.copyFileSync(DEFAULT_TEMPLATE_PATH, resolvedPath)
        } else {
          saveConfig(empty, resolvedPath)
        }
      } catch { /* 创建失败不影响启动 */ }
      return empty
    }
    console.log(`[WARN] [ngl:config] 读取配置文件失败: ${err.message}, 使用默认模板`)
    return createEmptyConfig()
  }

  // 空文件处理
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    console.log(`[WARN] [ngl:config] 配置文件为空: ${resolvedPath}, 使用默认模板`);
    return createEmptyConfig();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.log(`[WARN] [ngl:config] 配置文件 JSON 解析失败: ${err.message}, 使用默认模板`);
    return createEmptyConfig();
  }

  // 确保 parsed 是对象
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.log(`[WARN] [ngl:config] 配置文件顶层并非对象, 使用默认模板`);
    return createEmptyConfig();
  }

  // 确保 servers 字段存在且为对象
  if (typeof parsed.servers !== 'object' || parsed.servers === null) {
    parsed.servers = {};
  }

  // 执行格式迁移
  return migrateConfig(parsed);
}

/**
 * 原子写入配置文件。
 *
 * 流程:
 *   1. 先写入临时文件 `<dirname>/.servers.json.tmp.<pid>`
 *   2. fs.renameSync()  重命名（POSIX 原子操作）
 *   3. 临时文件权限 600（仅 owner 可读写）
 *
 * 若写入或重命名失败，自动清理临时文件并抛出异常。
 *
 * @param {object} data         要写入的配置对象
 * @param {string} [configPath] 配置文件路径（可选）
 * @returns {boolean}           写入成功返回 true
 * @throws {Error}              写入失败时抛出，message 包含原因
 */
export function saveConfig(data, configPath) {
  const resolvedPath = getConfigPath(configPath);
  const dir = path.dirname(resolvedPath);
  const tmpPath = path.join(dir, `.servers.json.tmp.${process.pid}`);

  // 确保目标目录存在
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      throw new Error(`创建配置目录失败 ${dir}: ${err.message}`);
    }
  }

  // 序列化 JSON（美化的 2 空格缩进，末尾换行）
  const jsonStr = JSON.stringify(data, null, 2) + '\n';

  try {
    // 写入临时文件，权限 600
    fs.writeFileSync(tmpPath, jsonStr, { mode: 0o600, encoding: 'utf-8' });
    // 原子重命名
    fs.renameSync(tmpPath, resolvedPath);
    console.log(`[INFO] [ngl:config] 配置已保存: ${resolvedPath}`);
    return true;
  } catch (err) {
    // 清理临时文件
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {
      // 清理失败不影响主错误抛出
    }
    console.log(`[ERROR] [ngl:config] 保存配置失败: ${err.message}`);
    throw new Error(`写入配置文件失败 ${resolvedPath}: ${err.message}`);
  }
}

/**
 * 配置格式迁移。
 *
 * 根据 `_schemaVersion` 逐版本执行迁移，支持未来扩展。
 * 迁移后对象中的 `_schemaVersion` 始终为最新版本。
 *
 * 当前迁移历史:
 *   v0 → v1: 为每个没有 `deployMode` 的 server 添加 `deployMode: 'auto'`
 *
 * @param {*} raw 原始解析数据（可能为 null / undefined / 非对象）
 * @returns {object} 迁移后的配置对象
 */
export function migrateConfig(raw) {
  // 防御: null / undefined / 非对象
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return createEmptyConfig();
  }

  // 浅拷贝，避免修改入参
  const data = { ...raw };

  // 规范化 _schemaVersion: 缺失 / 非数字 / 负数 → 0
  if (typeof data._schemaVersion !== 'number' || data._schemaVersion < 0 || Number.isNaN(data._schemaVersion)) {
    data._schemaVersion = 0;
  }

  // 规范化 servers: 非对象 → 空对象
  if (typeof data.servers !== 'object' || data.servers === null) {
    data.servers = {};
  }

  // ── v0 → v1 ──────────────────────────────────────────────────────────
  if (data._schemaVersion < 1) {
    const entries = Object.entries(data.servers);

    for (const [name, server] of entries) {
      // 跳过无效 server 条目
      if (typeof server !== 'object' || server === null) {
        continue;
      }

      // 仅当 deployMode 缺失或为 undefined 时补充
      if (!('deployMode' in server) || server.deployMode === undefined || server.deployMode === null) {
        data.servers[name] = { ...server, deployMode: 'auto' };
      }
    }

    data._schemaVersion = 1;
    console.log(`[INFO] [ngl:config] 配置已从 v0 迁移至 v1 (${entries.length} 台服务器)`);
  }

  // ── 未来版本迁移示例 ─────────────────────────────────────────────────
  // if (data._schemaVersion < 2) {
  //   // v1 → v2: ...
  //   data._schemaVersion = 2;
  // }

  return data;
}

/**
 * 校验配置数据完整性。
 *
 * 检查项:
 *   - `data.servers` 是对象
 *   - 每个 server 的 `host` 是非空字符串
 *   - 每个 server 的 `username` 是非空字符串
 *   - 每个 server 的 `port` 是 1-65535 之间的整数
 *   - 每个 server 必须设置 `password` 或 `privateKey`（至少一个非空字符串）
 *
 * @param {*} data 待校验的配置对象
 * @returns {{ valid: boolean, message?: string }}
 *   - `{ valid: true }`                                校验通过
 *   - `{ valid: false, message: '<原因>' }`            校验失败
 */
export function validateConfig(data) {
  // 顶层校验
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, message: '配置数据无效: 必须是一个对象' };
  }

  if (typeof data.servers !== 'object' || data.servers === null) {
    return { valid: false, message: '配置数据无效: servers 必须是一个对象' };
  }

  const serverNames = Object.keys(data.servers);

  // 空 servers 视为合法（尚未添加任何服务器）
  if (serverNames.length === 0) {
    return { valid: true };
  }

  // 逐服务器校验
  for (const name of serverNames) {
    const server = data.servers[name];

    if (typeof server !== 'object' || server === null) {
      return { valid: false, message: `服务器 "${name}" 配置无效: 必须是一个对象` };
    }

    // host: 非空字符串
    if (typeof server.host !== 'string' || server.host.trim().length === 0) {
      return { valid: false, message: `服务器 "${name}" 配置无效: host 必须是非空字符串` };
    }

    // host: 最大长度 255（防御性限制）
    if (server.host.length > 255) {
      return { valid: false, message: `服务器 "${name}" 配置无效: host 长度不能超过 255 个字符` };
    }

    // username: 非空字符串
    if (typeof server.username !== 'string' || server.username.trim().length === 0) {
      return { valid: false, message: `服务器 "${name}" 配置无效: username 必须是非空字符串` };
    }

    // port: 1-65535 之间的整数
    if (typeof server.port !== 'number' || !Number.isInteger(server.port) || server.port < 1 || server.port > 65535) {
      return { valid: false, message: `服务器 "${name}" 配置无效: port 必须是 1-65535 之间的整数` };
    }

    // 认证方式: 至少存在 password 或 privateKey（非空字符串）
    const hasPassword = typeof server.password === 'string' && server.password.length > 0;
    const hasPrivateKey = typeof server.privateKey === 'string' && server.privateKey.length > 0;

    if (!hasPassword && !hasPrivateKey) {
      return { valid: false, message: `服务器 "${name}" 配置无效: 必须设置 password 或 privateKey` };
    }
  }

  return { valid: true };
}
