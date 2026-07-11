import plugin from '../../../lib/plugins/plugin.js'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tplFile   = path.join(__dirname, '../resources/help/index.html')
const VERSION   = '2.0.0'

const COLORS = ['#58a6ff', '#3fb950', '#f78166', '#d2a8ff', '#ffa657', '#79c0ff', '#56d364', '#ff7b72']

const HELP_GROUPS = [
  {
    group: '服务器',
    list: [
      { title: '#ngl服务器列表',                  desc: '列出所有服务器' },
      { title: '#ngl添加服务器 <名> <host> <用户> <密码>', desc: '添加服务器' },
      { title: '#ngl删除服务器 <名>',             desc: '删除服务器' },
      { title: '#ngl测试 <名>',                   desc: '测试 SSH 连通性' },
      { title: '#ngl修改服务器 <名> <key> <值>',  desc: '修改服务器配置' },
    ]
  },
  {
    group: '部署与登录',
    list: [
      { title: '#ngl快速部署 <服务器> <QQ>',  desc: '安装→配置→启动→二维码' },
      { title: '#ngl创建账号 <服务器> <QQ>',  desc: '创建配置并启动' },
      { title: '#ngl重新扫码 <服务器> <QQ>',  desc: '重新获取登录二维码' },
    ]
  },
  {
    group: '服务管理',
    list: [
      { title: '#ngl状态',                      desc: '所有服务器账号状态' },
      { title: '#ngl状态 <服务器> [QQ]',        desc: '指定服务器/账号状态' },
      { title: '#ngl启动 <服务器> <QQ>',        desc: '启动 QQ' },
      { title: '#ngl停止 <服务器> <QQ>',        desc: '停止 QQ' },
      { title: '#ngl重启 <服务器> <QQ>',        desc: '重启 QQ' },
      { title: '#ngl日志 <服务器> <QQ>',        desc: '实时日志' },
      { title: '#ngl强制停止 <服务器> <QQ>',    desc: '强制结束进程' },
      { title: '#ngl更新 <服务器>',             desc: '更新 NapCat' },
    ]
  },
  {
    group: '配置管理',
    list: [
      { title: '#ngl查看配置 <服务器>',                      desc: '全局配置' },
      { title: '#ngl修改配置 <服务器> <key> <值>',          desc: '修改全局配置（支持嵌套）' },
      { title: '#ngl查看账号配置 <服务器> <QQ>',            desc: '账号配置' },
      { title: '#ngl修改账号配置 <服务器> <QQ> <key> <值>', desc: '修改账号配置' },
      { title: '#ngl查看OB11 <服务器> <QQ>',                desc: 'OB11 网络配置' },
      { title: '#ngl修改OB11 <服务器> <QQ> <key> <值>',     desc: '修改 OB11 配置' },
      { title: '#ngl查看WebUI <服务器>',                    desc: 'WebUI 配置' },
      { title: '#ngl修改WebUI <服务器> <key> <值>',         desc: '修改 WebUI 配置' },
      { title: '#ngl账号列表',                               desc: '所有账号及运行状态' },
      { title: '#ngl配置文件列表 <服务器>',                 desc: '配置目录文件列表' },
      { title: '#ngl配置目录 <服务器>',                     desc: '配置路径与 WebUI 端口' },
    ]
  },
  {
    group: '系统信息',
    list: [
      { title: '#ngl系统信息 <服务器>', desc: 'CPU / 内存 / 磁盘 / 负载' },
      { title: '#ngl版本 <服务器>',    desc: 'NapCat 版本与路径' },
      { title: '#ngl进程 <服务器>',    desc: '进程列表' },
      { title: '#ngl端口 <服务器>',    desc: 'WebUI + OB11 端口状态' },
      { title: '#ngl服务状态 <服务器>',desc: '账号运行 + 端口综合' },
      { title: '#ngl日志文件 <服务器>',desc: '日志文件列表' },
    ]
  },
  {
    group: '安装',
    list: [
      { title: '#ngl安装 <服务器>',     desc: '远程安装 NapCat' },
      { title: '#ngl安装状态 <服务器>', desc: '检查安装环境' },
    ]
  },
  {
    group: '备份与恢复',
    list: [
      { title: '#ngl备份 <服务器>',             desc: '备份配置目录' },
      { title: '#ngl备份列表 <服务器>',          desc: '备份文件列表' },
      { title: '#ngl恢复 <服务器> <文件名>',    desc: '恢复备份' },
      { title: '#ngl删除备份 <服务器> <文件名>', desc: '删除备份' },
    ]
  },
  {
    group: '插件与同步',
    list: [
      { title: '#ngl插件列表 <服务器>',          desc: '插件列表（需 WebUI）' },
      { title: '#ngl插件信息 <服务器> <ID>',     desc: '插件详情' },
      { title: '#ngl插件启用 <服务器> <ID>',     desc: '启用插件' },
      { title: '#ngl插件禁用 <服务器> <ID>',     desc: '禁用插件' },
      { title: '#ngl查看webui <服务器> [key]',   desc: 'WebUI 状态/地址/Token' },
      { title: '#ngl同步配置 <源> <目标>',       desc: '同步配置到目标服务器' },
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
