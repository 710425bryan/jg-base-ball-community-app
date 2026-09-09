import type { Document, Element, Node } from '@xmldom/xmldom'
import type { GenerateDocumentInput } from './logic.ts'

const WORDNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const children = (node: Node, name: string) => Array.from(node.childNodes)
  .filter((child) => child.nodeType === 1 && child.namespaceURI === WORDNS && child.localName === name) as Element[]
const compactText = (node: Element) => Array.from(node.getElementsByTagNameNS(WORDNS, 't'))
  .map((text) => text.textContent || '').join('').replace(/\s/g, '')
const headers = ['背號', '姓名', '出生年月日', '身分證字號', '年級', '備註欄']

// Match the supplied second-edition form by both its labels and writable structure.
// A title alone must never authorize filling arbitrary cells in another Word file.
const templateRows = (document: Document) => {
  const body = document.getElementsByTagNameNS(WORDNS, 'body')[0]
  const tables = body ? children(body, 'tbl') : []
  if (tables.length !== 1) return null
  const rows = children(tables[0], 'tr')
  const grid = children(tables[0], 'tblGrid')[0]
  if (rows.length !== 18 || !grid || children(grid, 'gridCol').length !== 6) return null
  if (children(rows[0], 'tc').length !== 1 || children(rows[1], 'tc').length !== 1) return null
  if (compactText(rows[0]) !== '新北市第二屆眼鏡蛇盃全國親子棒球邀請賽報名表') return null
  const staff = children(children(rows[1], 'tc')[0], 'p')
  if (staff.length !== 4 || !compactText(staff[0]).startsWith('隊名：')
    || !/^領隊：.*總教練：.*聯絡人：/.test(compactText(staff[1]))
    || !/^教練：.*教練：.*管理：/.test(compactText(staff[2]))
    || !/^聯絡人電話：.*地址：/.test(compactText(staff[3]))) return null
  const headerCells = children(rows[2], 'tc')
  if (headerCells.length !== 6 || headers.some((header, index) => compactText(headerCells[index]) !== header)) return null
  if (rows.slice(3, 17).some((row) => {
    const cells = children(row, 'tc')
    return cells.length !== 6 || cells.some((cell) =>
      children(cell, 'p').length !== 1 || cell.getElementsByTagNameNS(WORDNS, 'gridSpan').length > 0
      || cell.getElementsByTagNameNS(WORDNS, 'vMerge').length > 0
      || !(Number(cell.getElementsByTagNameNS(WORDNS, 'tcW')[0]?.getAttributeNS(WORDNS, 'w')) >= 300))
  })) return null
  const footer = children(rows[17], 'tc')
  if (footer.length !== 2 || compactText(footer[0]) !== '備註'
    || compactText(footer[1]) !== '報名球員每隊至少10人，最多14人') return null
  return rows
}

export const isCobraWordTemplate = (document: Document) => templateRows(document) !== null

const textUnits = (value: string) => Array.from(value).reduce((sum, char) => sum + (/^[\x20-\x7e]$/.test(char) ? 0.65 : 1), 0)

const gradeLines = (value: string, width: number) => {
  if (textUnits(value) * 9 <= width) return [value]
  const match = /^(國小|國中|高中|幼稚園|幼兒園)(.+)$/.exec(value)
  return match ? [match[1], match[2]] : [value]
}

const replaceParagraph = (paragraph: Element, lines: string[], width: number, label: string, compactLines = false) => {
  const document = paragraph.ownerDocument!
  let paragraphProperties = children(paragraph, 'pPr')[0]
  const originalRun = children(paragraph, 'r')[0]
  const runProperties = (originalRun && children(originalRun, 'rPr')[0])
    || (paragraphProperties && children(paragraphProperties, 'rPr')[0])
  const longestLine = Math.max(1, ...lines.map(textUnits))
  const fontSize = Math.min(compactLines && lines.length > 1 ? 10 : 12, Math.floor(width / longestLine * 2) / 2)
  if (fontSize < 9) throw new Error(`${label}文字過長，請縮短後再產生報名表`)
  if (compactLines && lines.length > 1) {
    if (!paragraphProperties) {
      paragraphProperties = document.createElementNS(WORDNS, 'w:pPr')
      paragraph.insertBefore(paragraphProperties, paragraph.firstChild)
    }
    // Two 11pt lines fit the original 25pt minimum row. Disable the document's
    // 19pt line grid here so wrapping does not enlarge every player row.
    for (const [name, attributes] of Object.entries({
      snapToGrid: { val: '0' },
      spacing: { before: '0', after: '0', line: String((fontSize + 1) * 20), lineRule: 'exact' }
    })) {
      children(paragraphProperties, name).forEach((node) => paragraphProperties.removeChild(node))
      const property = document.createElementNS(WORDNS, `w:${name}`)
      for (const [key, value] of Object.entries(attributes)) property.setAttributeNS(WORDNS, `w:${key}`, value)
      paragraphProperties.insertBefore(property, children(paragraphProperties, 'rPr')[0] || null)
    }
  }
  Array.from(paragraph.childNodes).filter((node) => node !== paragraphProperties)
    .forEach((node) => paragraph.removeChild(node))
  lines.forEach((line, index) => {
    const run = document.createElementNS(WORDNS, 'w:r')
    const properties = (runProperties?.cloneNode(true) as Element | undefined) || document.createElementNS(WORDNS, 'w:rPr')
    for (const name of ['sz', 'szCs']) {
      children(properties, name).forEach((node) => properties.removeChild(node))
      const size = document.createElementNS(WORDNS, `w:${name}`)
      size.setAttributeNS(WORDNS, 'w:val', String(fontSize * 2))
      properties.appendChild(size)
    }
    run.appendChild(properties)
    if (index > 0) run.appendChild(document.createElementNS(WORDNS, 'w:br'))
    const text = document.createElementNS(WORDNS, 'w:t')
    text.setAttribute('xml:space', 'preserve')
    text.textContent = line
    run.appendChild(text)
    paragraph.appendChild(run)
  })
}

const cellWidth = (cell: Element) => {
  const width = Number(cell.getElementsByTagNameNS(WORDNS, 'tcW')[0]?.getAttributeNS(WORDNS, 'w'))
  if (!width || width < 300) throw new Error('眼鏡蛇盃 Word 欄寬不符')
  // Original Word cell padding plus a small font-metric allowance.
  return width / 20 - 14
}

export const fillCobraWord = (document: Document, input: GenerateDocumentInput) => {
  const rows = templateRows(document)
  if (!rows) throw new Error('眼鏡蛇盃 Word 報名表格結構不符')
  const fields = input.fields
  if (!fields.address?.trim()) throw new Error('地址為必填')
  const staffCell = children(rows[1], 'tc')[0]
  const staffParagraphs = children(staffCell, 'p')
  const staffLines = [
    [`隊  名：${fields.team_name}`],
    [`領  隊：${fields.leader_name}    總教練：${fields.head_coach_name}    聯絡人：${fields.contact_name}`],
    [`教  練：${fields.coach_1_name || ''}    教  練：${fields.coach_2_name || ''}    管  理：${fields.manager_name}`],
    [`聯絡人電話：${fields.contact_phone}`, `地  址：${fields.address}`]
  ]
  staffParagraphs.forEach((paragraph, index) =>
    replaceParagraph(paragraph, staffLines[index], cellWidth(staffCell), '隊職員資料'))

  rows.slice(3, 17).forEach((row, index) => {
    const player = input.players[index]
    if (player && (!player.name?.trim() || !player.jersey_number?.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(player.birth_date) || !player.national_id?.trim() || !player.grade?.trim())) {
      throw new Error(`第 ${index + 1} 位球員缺少姓名、背號、生日、身分證或年級`)
    }
    const values = player ? [player.jersey_number, player.name, player.birth_date.replace(/-/g, '/'),
      player.national_id!, player.grade!, player.notes || ''] : Array<string>(6).fill('')
    children(row, 'tc').forEach((cell, column) => {
      const width = cellWidth(cell)
      const lines = column === 4 ? gradeLines(values[column], width) : [values[column]]
      replaceParagraph(children(cell, 'p')[0], lines, width, `第 ${index + 1} 位球員${headers[column]}`, column === 4)
    })
  })
}
