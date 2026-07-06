export function renderTable(header, rows) {
  const allRows = [header, ...rows]
  const widths = header.map((_, i) =>
    Math.max(...allRows.map(r => String(r[i] ?? '').length))
  )
  const pad = row => row.map((v, i) => String(v ?? '').padEnd(widths[i])).join(' | ')
  const sep = widths.map(w => '-'.repeat(w)).join('-|-')
  return [pad(header), sep, ...rows.map(pad)].join('\n')
}
