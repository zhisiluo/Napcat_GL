import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROJECT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_CONFIG_PATH = path.resolve(PROJECT_ROOT, 'config', 'servers.json');
const DEFAULT_TEMPLATE_PATH = path.resolve(PROJECT_ROOT, 'default_config', 'servers.json');

function createEmptyConfig() {
  return {
    _schemaVersion: 1,
    defaultServer: '',
    servers: {},
  };
}

export function getConfigPath(customPath) {
  if (customPath === undefined || customPath === null) {
    return DEFAULT_CONFIG_PATH;
  }
  if (path.isAbsolute(customPath)) {
    return customPath;
  }
  return path.resolve(PROJECT_ROOT, customPath);
}

export function loadConfig(configPath) {
  const resolvedPath = getConfigPath(configPath);

  let raw;
  try {
    raw = fs.readFileSync(resolvedPath, { encoding: 'utf-8' });
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(`[INFO] [ngl:config] 配置文件不存在，自动创建: ${resolvedPath}`)
      const empty = createEmptyConfig()
      try {
        if (fs.existsSync(DEFAULT_TEMPLATE_PATH)) {
          const dir = path.dirname(resolvedPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.copyFileSync(DEFAULT_TEMPLATE_PATH, resolvedPath)
        } else {
          saveConfig(empty, resolvedPath)
        }
      } catch {  }
      return empty
    }
    console.log(`[WARN] [ngl:config] 读取配置文件失败: ${err.message}, 使用默认模板`)
    return createEmptyConfig()
  }
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
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.log(`[WARN] [ngl:config] 配置文件顶层并非对象, 使用默认模板`);
    return createEmptyConfig();
  }
  if (typeof parsed.servers !== 'object' || parsed.servers === null) {
    parsed.servers = {};
  }
  return migrateConfig(parsed);
}

export function saveConfig(data, configPath) {
  const resolvedPath = getConfigPath(configPath);
  const dir = path.dirname(resolvedPath);
  const tmpPath = path.join(dir, `.servers.json.tmp.${process.pid}`);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {
      throw new Error(`创建配置目录失败 ${dir}: ${err.message}`);
    }
  }
  const jsonStr = JSON.stringify(data, null, 2) + '\n';

  try {
    fs.writeFileSync(tmpPath, jsonStr, { mode: 0o600, encoding: 'utf-8' });
    fs.renameSync(tmpPath, resolvedPath);
    console.log(`[INFO] [ngl:config] 配置已保存: ${resolvedPath}`);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {
    }
    console.log(`[ERROR] [ngl:config] 保存配置失败: ${err.message}`);
    throw new Error(`写入配置文件失败 ${resolvedPath}: ${err.message}`);
  }
}

export function migrateConfig(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return createEmptyConfig();
  }
  const data = { ...raw };
  if (typeof data._schemaVersion !== 'number' || data._schemaVersion < 0 || Number.isNaN(data._schemaVersion)) {
    data._schemaVersion = 0;
  }
  if (typeof data.servers !== 'object' || data.servers === null) {
    data.servers = {};
  }

  if (data._schemaVersion < 1) {
    const entries = Object.entries(data.servers);

    for (const [name, server] of entries) {
      if (typeof server !== 'object' || server === null) {
        continue;
      }
      if (!('deployMode' in server) || server.deployMode === undefined || server.deployMode === null) {
        data.servers[name] = { ...server, deployMode: 'auto' };
      }
    }

    data._schemaVersion = 1;
    console.log(`[INFO] [ngl:config] 配置已从 v0 迁移至 v1 (${entries.length} 台服务器)`);
  }

  return data;
}

export function validateConfig(data) {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, message: '配置数据无效: 必须是一个对象' };
  }

  if (typeof data.servers !== 'object' || data.servers === null) {
    return { valid: false, message: '配置数据无效: servers 必须是一个对象' };
  }

  const serverNames = Object.keys(data.servers);
  if (serverNames.length === 0) {
    return { valid: true };
  }
  for (const name of serverNames) {
    const server = data.servers[name];

    if (typeof server !== 'object' || server === null) {
      return { valid: false, message: `服务器 "${name}" 配置无效: 必须是一个对象` };
    }
    if (typeof server.host !== 'string' || server.host.trim().length === 0) {
      return { valid: false, message: `服务器 "${name}" 配置无效: host 必须是非空字符串` };
    }
    if (server.host.length > 255) {
      return { valid: false, message: `服务器 "${name}" 配置无效: host 长度不能超过 255 个字符` };
    }
    if (typeof server.username !== 'string' || server.username.trim().length === 0) {
      return { valid: false, message: `服务器 "${name}" 配置无效: username 必须是非空字符串` };
    }
    if (typeof server.port !== 'number' || !Number.isInteger(server.port) || server.port  1 || server.port  65535) {
      return { valid: false, message: `服务器 "${name}" 配置无效: port 必须是 1-65535 之间的整数` };
    }
    const hasPassword = typeof server.password === 'string' && server.password.length > 0;
    const hasPrivateKey = typeof server.privateKey === 'string' && server.privateKey.length > 0;

    if (!hasPassword && !hasPrivateKey) {
      return { valid: false, message: `服务器 "${name}" 配置无效: 必须设置 password 或 privateKey` };
    }
  }

  return { valid: true };
}
