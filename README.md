# Napcat_GL

NapCat 多服务器远程管理插件，基于 [TRSS-Yunzai](https://github.com/TimeRainStarSky/Yunzai)。

通过 SSH 连接到多台远程服务器，统一管理多个 NapCat 实例，支持账号创建、配置修改、备份恢复等全套操作。

---

## 功能特性

- **多服务器管理**：同时管理多台服务器，支持随时切换默认服务器
- **一键部署**：`#ngl快速部署` 自动检测安装 → 创建配置 → 启动进程 → 发送二维码，全程自动
- **自适应检测**：自动识别 wrapper / screen / docker 三种部署模式，端口从配置文件动态读取，不依赖固定值
- **完整 NapCat 管理**：状态查询、启停重启、日志、更新、配置修改、备份恢复、插件管理
- **重复账号处理**：同一 QQ 重新部署时，自动停止旧进程并复用现有配置，无需手动清理
- **清晰报错**：智能解析 NapCat 错误信息（如禁止多开），给出可读提示而非原始输出

---

## 安装

**直连 GitHub：**
```bash
git clone https://github.com/zhisiluo/Napcat_GL.git ./plugins/Napcat_GL-plugin/
cd plugins/Napcat_GL-plugin && pnpm install
```

**国内加速（访问 GitHub 慢时使用）：**
```bash
git clone https://gh.llkk.cc/https://github.com/zhisiluo/Napcat_GL.git ./plugins/Napcat_GL-plugin/
cd plugins/Napcat_GL-plugin && pnpm install
```

安装完成后重启 Yunzai 即可。

---

## 快速开始

1. 私聊 Bot，发送 `#ngl添加服务器`，按4步引导填写服务器信息
2. 发送 `#ngl快速部署 <服务器名> <QQ号>`，Bot 会自动完成全套部署并发送扫码图

---

## 命令一览

所有命令均需 master 权限。

### 服务器管理

| 命令 | 说明 |
|------|------|
| `#ngl服务器列表` | 列出所有服务器及状态 |
| `#ngl添加服务器` | 交互式4步向导添加服务器（私聊） |
| `#ngl添加服务器 <名> <host:port> <用户> <密码>` | 一行命令快速添加 |
| `#ngl删除服务器 <服务器名>` | 删除服务器（需二次确认） |
| `#ngl切换 <服务器名>` | 设置默认服务器 |
| `#ngl测试 <服务器名>` | 测试 SSH 连通性及延迟 |
| `#ngl修改服务器 <服务器名> <key> <value>` | 修改服务器配置项 |

### 账号与登录

| 命令 | 说明 |
|------|------|
| `#ngl快速部署 <服务器名> <QQ>` | **一键全流程**：安装→配置→启动→发二维码 |
| `#ngl创建账号 <服务器名> <QQ>` | 仅创建配置并启动（NapCat 已安装时使用） |
| `#ngl扫码 <服务器名>` | 获取当前登录二维码 |

### 服务管理

| 命令 | 说明 |
|------|------|
| `#ngl状态` | 聚合显示所有服务器账号状态 |
| `#ngl状态 <服务器名> [QQ]` | 查看指定服务器状态 |
| `#ngl启动 <服务器名> <QQ>` | 启动指定 QQ |
| `#ngl停止 <服务器名> <QQ>` | 停止指定 QQ |
| `#ngl重启 <服务器名> <QQ>` | 重启指定 QQ |
| `#ngl日志 <服务器名> <QQ>` | 查看实时日志（60秒缓冲后回复） |
| `#ngl强制停止 <服务器名> <QQ>` | 强制 kill 进程（需确认） |
| `#ngl更新 <服务器名>` | 更新 NapCat |

### 配置管理

| 命令 | 说明 |
|------|------|
| `#ngl查看配置 <服务器名>` | 查看 napcat.json 全局配置 |
| `#ngl修改配置 <服务器名> <key> <value>` | 修改全局配置，支持 `a.b.c` 嵌套路径 |
| `#ngl查看账号配置 <服务器名> <QQ>` | 查看账号专属配置 |
| `#ngl修改账号配置 <服务器名> <QQ> <key> <value>` | 修改账号配置 |
| `#ngl查看OB11 <服务器名> <QQ>` | 查看 OneBot11 网络配置 |
| `#ngl修改OB11 <服务器名> <QQ> <key> <value>` | 修改 OneBot11 网络配置 |
| `#ngl查看WebUI <服务器名>` | 查看 WebUI 配置（token 掩码） |
| `#ngl修改WebUI <服务器名> <key> <value>` | 修改 WebUI 配置 |
| `#ngl账号列表` | 聚合显示所有服务器账号及运行状态 |
| `#ngl配置文件列表 <服务器名>` | 列出配置目录文件 |
| `#ngl配置目录 <服务器名>` | 显示配置目录路径和 WebUI 端口 |

### 系统信息

| 命令 | 说明 |
|------|------|
| `#ngl系统信息 <服务器名>` | CPU / 内存 / 磁盘 / 负载 / 系统版本 |
| `#ngl版本 <服务器名>` | NapCat 版本及安装路径 |
| `#ngl进程 <服务器名>` | NapCat 进程列表 |
| `#ngl端口 <服务器名>` | WebUI 和各账号 OB11 端口监听状态（自适应） |
| `#ngl服务状态 <服务器名>` | 综合状态：账号运行情况 + 所有端口 |
| `#ngl日志文件 <服务器名>` | 列出日志文件 |

### 安装

| 命令 | 说明 |
|------|------|
| `#ngl安装 <服务器名>` | 在远程服务器安装 NapCat |
| `#ngl安装状态 <服务器名>` | 检查安装环境（系统/curl/screen/版本） |

### 备份与恢复

| 命令 | 说明 |
|------|------|
| `#ngl备份 <服务器名>` | 备份配置目录为 tar.gz |
| `#ngl备份列表 <服务器名>` | 列出现有备份 |
| `#ngl恢复 <服务器名> <文件名.tar.gz>` | 恢复备份（原配置自动备份，需确认） |
| `#ngl删除备份 <服务器名> <文件名.tar.gz>` | 删除备份（需确认） |

### 插件管理

| 命令 | 说明 |
|------|------|
| `#ngl插件列表 <服务器名>` | 列出 NapCat 插件（需 WebUI 运行） |
| `#ngl插件信息 <服务器名> <插件ID>` | 查看插件详情 |
| `#ngl插件启用 <服务器名> <插件ID>` | 启用插件 |
| `#ngl插件禁用 <服务器名> <插件ID>` | 禁用插件 |
| `#ngl查看webui <服务器名>` | 查看 WebUI 状态、地址、Token 及账号列表 |
| `#ngl查看webui <服务器名> key` | 只显示 WebUI Token |

### 配置同步

| 命令 | 说明 |
|------|------|
| `#ngl同步配置 <源服务器> <目标服务器>` | 将源服务器配置同步到目标服务器 |

### 帮助

| 命令 | 说明 |
|------|------|
| `#ngl帮助 [分类]` | 查看命令列表，分类：服务器/服务/系统/配置/账号/插件/备份/其他 |
| `#ngl<分类>` | 快捷方式，如 `#ngl服务器`、`#ngl配置` |

---

## 配置文件

服务器信息存储在 `config/servers.json`，首次添加服务器后自动创建。

```json
{
  "_schemaVersion": 1,
  "defaultServer": "my-server",
  "servers": {
    "my-server": {
      "host": "1.2.3.4",
      "port": 22,
      "username": "root",
      "password": "your-password",
      "deployMode": "auto",
      "napcatBasePath": "/opt/QQ/resources/app/app_launcher/napcat",
      "napcatConfigDir": "/opt/QQ/resources/app/app_launcher/napcat/config",
      "webuiPort": 6099,
      "maxInstances": 5,
      "tags": []
    }
  }
}
```

> **注意**：`servers.json` 包含 SSH 密码，请勿提交到公开仓库。

---

## 支持的部署模式

插件自动检测远程服务器的 NapCat 部署方式：

| 模式 | 说明 |
|------|------|
| `wrapper` | NapCat 官方 CLI 脚本（`napcat start/stop`），**推荐** |
| `screen` | xvfb + screen 方式运行 |
| `docker` | Docker 容器管理（检测 napcat 相关容器） |
| `unknown` | 降级使用 nohup 直接启动 |

> wrapper 模式默认**禁止多开**，一台服务器同时只能运行一个 QQ 实例。如需多账号，建议使用 screen 模式。

---

## 许可证

MIT
