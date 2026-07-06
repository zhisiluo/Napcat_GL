/**
 * Napcat_GL - 表格渲染工具
 *
 * 替换5处重复的等宽列表格代码
 *
 * @author  Claude Code
 * @version 1.0.0
 */

/**
 * 渲染纯文本等宽表格
 *
 * @param {string[]} header  列标题数组
 * @param {Array<string[]>} rows  每行数据（每项与 header 等长的字符串数组）
 * @returns {string}  可直接 reply 的多行字符串
 *
 * @example
 * renderTable(['名称', '状态'], [['server1', '在线'], ['server2', '离线']])
 */
export function renderTable(header, rows) {
  const allRows = [header, ...rows]
  const widths = header.map((_, i) =>
    Math.max(...allRows.map(r => String(r[i] ?? '').length))
  )
  const pad = row => row.map((v, i) => String(v ?? '').padEnd(widths[i])).join(' | ')
  const sep = widths.map(w => '-'.repeat(w)).join('-|-')
  return [pad(header), sep, ...rows.map(pad)].join('\n')
}
