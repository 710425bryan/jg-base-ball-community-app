export const UTF8_BOM = '\uFEFF'

const normalizeCsvValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join('、')
  return String(value)
}

export const escapeCsvCell = (value: unknown) => {
  const text = normalizeCsvValue(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const escaped = text.replace(/"/g, '""')

  return /[",\n]/.test(escaped) ? `"${escaped}"` : escaped
}

export const buildUtf8BomCsv = (rows: readonly (readonly unknown[])[]) =>
  UTF8_BOM + rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')

export const downloadUtf8BomCsv = (filename: string, rows: readonly (readonly unknown[])[]) => {
  const blob = new Blob([buildUtf8BomCsv(rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.style.visibility = 'hidden'

  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
