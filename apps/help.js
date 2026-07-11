import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tplFile   = path.join(__dirname, '../resources/help/index.html')
const VERSION   = '2.0.0'

// 颜色按分组轮流使用
const COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff', '#56d364', '#ff7b72']

const HELP_GROUPS = [
  {
    group: '服务器',
    list: [
      { title: '#ngl服务器列表',                    desc: '列出所有服务器及在线状态' },
      { title: '#ngl添加服务器 <名> <host:port> <用户> <密码>', desc: '一行命令快速添加服务器' },
      { title: '#ngl删除服务器 <名>',               desc: '删除服务器（需二次确认）' },
      { title: '#ngl测试 <名>',                     desc: '测试 SSH 连通性及延迟' },
      { title: '#ngl修改服务器 <名> <key> <值>',    desc: '修改服务器任意配置项' },
    ]
  },
  {
    group: '部署与登录',
    list: [
      { title: '#ngl快速部署 <服务器> <QQ>',    desc: '一键：安装→配置→启动→发二维码' },
      { title: '#ngl创建账号 <服务器> <QQ>',    desc: '仅创建配置并启动（已安装时）' },
      { title: '#ngl重新扫码 <服务器> <QQ>',    desc: '重新获取登录二维码' },
    ]
  },
  {
    group: '服务管理',
    list: [
      { title: '#ngl状态',                        desc: '聚合显示所有服务器账号状态' },
      { title: '#ngl状态 <服务器> [QQ]',          desc: '查看指定服务器/账号状态' },
      { title: '#ngl启动 <服务器> <QQ>',          desc: '启动指定 QQ 实例' },
      { title: '#ngl停止 <服务器> <QQ>',          desc: '停止指定 QQ 实例' },
      { title: '#ngl重启 <服务器> <QQ>',          desc: '重启指定 QQ 实例' },
      { title: '#ngl日志 <服务器> <QQ>',          desc: '查看实时日志（60s 缓冲后回复）' },
      { title: '#ngl强制停止 <服务器> <QQ>',      desc: '强制 kill 进程' },
      { title: '#ngl更新 <服务器>',               desc: '更新 NapCat 到最新版本' },
    ]
  },
  {
    group: '配置管理',
    list: [
      { title: '#ngl查看配置 <服务器>',                        desc: '查看 napcat.json 全局配置' },
      { title: '#ngl修改配置 <服务器> <key> <值>',            desc: '修改全局配置，支持嵌套路径' },
      { title: '#ngl查看账号配置 <服务器> <QQ>',              desc: '查看账号专属配置' },
      { title: '#ngl修改账号配置 <服务器> <QQ> <key> <值>',   desc: '修改账号配置' },
      { title: '#ngl查看OB11 <服务器> <QQ>',                  desc: '查看 OneBot11 网络配置' },
      { title: '#ngl修改OB11 <服务器> <QQ> <key> <值>',       desc: '修改 OneBot11 网络配置' },
      { title: '#ngl查看WebUI <服务器>',                      desc: '查看 WebUI 配置（token 掩码）' },
      { title: '#ngl修改WebUI <服务器> <key> <值>',           desc: '修改 WebUI 配置' },
      { title: '#ngl账号列表',                                 desc: '聚合显示所有服务器账号及状态' },
      { title: '#ngl配置文件列表 <服务器>',                   desc: '列出配置目录文件' },
      { title: '#ngl配置目录 <服务器>',                       desc: '显示配置目录路径和 WebUI 端口' },
    ]
  },
  {
    group: '系统信息',
    list: [
      { title: '#ngl系统信息 <服务器>', desc: 'CPU / 内存 / 磁盘 / 负载 / 系统版本' },
      { title: '#ngl版本 <服务器>',    desc: 'NapCat 版本及安装路径' },
      { title: '#ngl进程 <服务器>',    desc: 'NapCat 进程列表' },
      { title: '#ngl端口 <服务器>',    desc: 'WebUI 和各账号 OB11 端口监听状态' },
      { title: '#ngl服务状态 <服务器>',desc: '综合状态：账号运行情况 + 所有端口' },
      { title: '#ngl日志文件 <服务器>',desc: '列出日志文件' },
    ]
  },
  {
    group: '安装',
    list: [
      { title: '#ngl安装 <服务器>',      desc: '在远程服务器安装 NapCat' },
      { title: '#ngl安装状态 <服务器>',  desc: '检查安装环境（系统/curl/screen/版本）' },
    ]
  },
  {
    group: '备份与恢复',
    list: [
      { title: '#ngl备份 <服务器>',                     desc: '备份配置目录为 tar.gz' },
      { title: '#ngl备份列表 <服务器>',                  desc: '列出现有备份文件' },
      { title: '#ngl恢复 <服务器> <文件名.tar.gz>',     desc: '恢复备份（原配置自动备份）' },
      { title: '#ngl删除备份 <服务器> <文件名.tar.gz>', desc: '删除备份文件' },
    ]
  },
  {
    group: '插件与同步',
    list: [
      { title: '#ngl插件列表 <服务器>',           desc: '列出 NapCat 插件（需 WebUI 运行）' },
      { title: '#ngl插件信息 <服务器> <ID>',      desc: '查看插件详情' },
      { title: '#ngl插件启用 <服务器> <ID>',      desc: '启用插件' },
      { title: '#ngl插件禁用 <服务器> <ID>',      desc: '禁用插件' },
      { title: '#ngl查看webui <服务器> [key]',    desc: 'WebUI 状态、地址、Token 及账号列表' },
      { title: '#ngl同步配置 <源服务器> <目标>',  desc: '将源服务器配置同步到目标服务器' },
    ]
  },
]

export class NglHelp extends plugin {
  constructor() {
    super({
      name: 'ngl-帮助',
      dsc: '图片帮助菜单',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl帮助$', fnc: 'renderHelp', permission: 'master' },
      ]
    })
  }

  async renderHelp(e) {
    if (!e.isMaster) return true
    try {
      // 注入颜色
      const groups = HELP_GROUPS.map((g, i) => ({
        ...g,
        color: COLORS[i % COLORS.length],
        idx: i,
      }))

      const img = await puppeteer.screenshot('ngl/help', {
        tplFile,
        saveId: 'help',
        helpGroups: groups,
        version: VERSION,
        imgType: 'jpeg',
        quality: 95,
      })

      if (img) {
        e.reply(img)
      } else {
        e.reply('图片生成失败，请检查 puppeteer 是否正常运行')
      }
    } catch (err) {
      logger.error('[ngl-help] 渲染失败:', err)
      e.reply(`帮助图片渲染失败: ${err.message}`)
    }
    return true
  }
}
