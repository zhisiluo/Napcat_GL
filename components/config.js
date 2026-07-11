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

function getConfigPath(customPath) {
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
      logger.info(`[ngl:config] 配置文件不存在，自动创建: ${resolvedPath}`)
      const empty = createEmptyConfig()
      try {
        if (fs.existsSync(DEFAULT_TEMPLATE_PATH)) {
          const dir = path.dirname(resolvedPath)
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
          fs.copyFileSync(DEFAULT_TEMPLATE_PATH, resolvedPath)
        } else {
          saveConfig(empty, resolvedPath)
        }
      } catch (err) { logger.warn(`[ngl:config] 自动创建配置文件失败: ${err.message}`) }
      return empty
    }
    logger.warn(`[ngl:config] 读取配置文件失败: ${err.message}, 使用默认模板`)
    return createEmptyConfig()
  }
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    logger.warn(`[ngl:config] 配置文件为空: ${resolvedPath}, 使用默认模板`);
    return createEmptyConfig();
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn(`[ngl:config] 配置文件 JSON 解析失败: ${err.message}, 使用默认模板`);
    return createEmptyConfig();
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    logger.warn(`[ngl:config] 配置文件顶层并非对象, 使用默认模板`);
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
    logger.info(`[ngl:config] 配置已保存: ${resolvedPath}`);
    return true;
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
    } catch (_) {
    }
    logger.error(`[ngl:config] 保存配置失败: ${err.message}`);
    throw new Error(`写入配置文件失败 ${resolvedPath}: ${err.message}`);
  }
}

function migrateConfig(raw) {
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
    logger.info(`[ngl:config] 配置已从 v0 迁移至 v1 (${entries.length} 台服务器)`);
  }

  return data;
}

