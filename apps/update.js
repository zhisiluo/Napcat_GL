import plugin from '../../../lib/plugins/plugin.js'
import { update as Update } from '../../other/update.js'

const PLUGIN_NAME = 'Napcat_GL-plugin'

export class NglUpdate extends plugin {
  constructor() {
    super({
      name: 'ngl-插件更新',
      dsc: '更新 NapCat GL 插件',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#ngl插件(强制)?更新$', fnc: 'update', permission: 'master' },
      ]
    })
  }

  async update(e) {
    if (!e.isMaster) return true
    e.msg = `#${e.msg.includes('强制') ? '强制' : ''}更新${PLUGIN_NAME}`
    const up = new Update(e)
    up.e = e
    return up.update()
  }
}
