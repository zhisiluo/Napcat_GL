import fs from 'node:fs'

export const sleep = ms => new Promise(r => setTimeout(r, ms))

export function assertQQ(qq) {
  if (!/^\d{5,12}$/.test(String(qq))) throw new Error(`非法 QQ 号: ${qq}`)
  return String(qq)
}

export function cleanTempFile(filePath) {
  try { fs.unlinkSync(filePath) } catch {}
}

export const INSTALL_URL = 'https://nclatest.znin.net/NapNeko/NapCat-Installer/main/script/install.sh'

export const DEP_INSTALL_CMD = 'apt install -y screen xvfb 2>/dev/null || yum install -y screen xorg-x11-server-Xvfb 2>/dev/null || true'

export const OS_CHECK_CMD = `cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d '"'`

export const DEFAULT_WEBUI_PORT = 6099
export const DEFAULT_SSH_PORT = 22

export function filterInstallOutput(output) {
  return (output || '').split('\n')
    .filter(l => {
      const t = l.trim()
      if (!t) return false
      if (/^\s*[\d.]+\s*%/.test(t)) return false
      if (/^[O=#\s]+$/.test(t)) return false
      if (/测速:/.test(t)) return false
      return true
    })
    .slice(-8)
    .join('\n')
}
