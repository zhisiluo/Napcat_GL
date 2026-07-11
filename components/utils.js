export const sleep = ms => new Promise(r => setTimeout(r, ms))

export function assertQQ(qq) {
  if (!/^\d{5,12}$/.test(String(qq))) throw new Error(`非法 QQ 号: ${qq}`)
  return String(qq)
}
