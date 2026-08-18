import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate'
import {
  DOMParser,
  XMLSerializer,
  type Document as XmlDocument,
  type Element as XmlElement,
  type Node as XmlNode
} from '@xmldom/xmldom'

export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
export const MAX_ZIP_ENTRIES = 500
export const MAX_AVATAR_BYTES = 1024 * 1024

const encoder = { encode: (value: string) => strToU8(value) }
const decoder = { decode: (value: Uint8Array) => strFromU8(value) }
const XMLNS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const RELNS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const OFFICE_RELNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const WORDNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export type RegistrationProfileKey = 'just_baseball_taipei' | 'chairperson_cup_u9'

export interface RegistrationProfile {
  key: RegistrationProfileKey
  version: 1
  label: string
  fileType: 'xlsx' | 'docx'
  maxPlayers: number
}

export const REGISTRATION_PROFILES: Record<RegistrationProfileKey, RegistrationProfile> = {
  just_baseball_taipei: {
    key: 'just_baseball_taipei',
    version: 1,
    label: '就是棒臺北',
    fileType: 'xlsx',
    maxPlayers: 30
  },
  chairperson_cup_u9: {
    key: 'chairperson_cup_u9',
    version: 1,
    label: '主委盃 U9',
    fileType: 'docx',
    maxPlayers: 20
  }
}

export interface StaffFields {
  team_name: string
  leader_name: string
  leader_phone?: string
  head_coach_name: string
  head_coach_phone?: string
  coach_1_name?: string
  coach_1_phone?: string
  coach_2_name?: string
  coach_2_phone?: string
  manager_name: string
  manager_phone?: string
  contact_name: string
  contact_phone: string
}

export interface DocumentPlayer {
  id: string
  name: string
  jersey_number: string
  birth_date: string
  national_id?: string
  throwing_hand?: string
  batting_hand?: string
  school_name?: string
  grade?: string
  portrait_auth?: boolean
  position?: 'P' | 'C' | 'IF' | 'OF' | ''
  avatar?: { bytes: Uint8Array; mimeType: 'image/png' | 'image/jpeg' }
}

export interface GenerateDocumentInput {
  fields: StaffFields
  players: DocumentPlayer[]
}

export interface ZipInspection {
  entryCount: number
  uncompressedBytes: number
  names: string[]
}

const readUInt16 = (bytes: Uint8Array, offset: number) => bytes[offset] | (bytes[offset + 1] << 8)
const readUInt32 = (bytes: Uint8Array, offset: number) => (
  (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
)
const readUInt32BigEndian = (bytes: Uint8Array, offset: number) => (
  (((bytes[offset] << 24) >>> 0) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
)

const isUnsafeZipPath = (name: string) => {
  const normalized = name.replace(/\\/g, '/')
  return normalized.startsWith('/') || /^[a-z]:\//i.test(normalized) || normalized.split('/').includes('..')
}

export const inspectZipArchive = (bytes: Uint8Array): ZipInspection => {
  if (bytes.byteLength < 4 || readUInt32(bytes, 0) !== 0x04034b50) {
    throw new Error('檔案不是有效的 OOXML ZIP')
  }

  let endOffset = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557); offset -= 1) {
    if (
      readUInt32(bytes, offset) === 0x06054b50 &&
      offset + 22 + readUInt16(bytes, offset + 20) === bytes.length
    ) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0) throw new Error('OOXML ZIP 找不到中央目錄')
  const declaredEntries = readUInt16(bytes, endOffset + 10)
  if (declaredEntries === 0xffff) throw new Error('不支援 ZIP64 範本')
  if (declaredEntries > MAX_ZIP_ENTRIES) throw new Error(`ZIP 項目不可超過 ${MAX_ZIP_ENTRIES} 個（偵測到 ${declaredEntries} 個；EOCD ${endOffset}/${bytes.length}）`)

  const names: string[] = []
  let uncompressedBytes = 0
  let offset = readUInt32(bytes, endOffset + 16)
  for (let entryIndex = 0; entryIndex < declaredEntries; entryIndex += 1) {
    if (offset > bytes.length - 46 || readUInt32(bytes, offset) !== 0x02014b50) {
      throw new Error('OOXML ZIP 中央目錄已損壞')
    }

    const size = readUInt32(bytes, offset + 24)
    const nameLength = readUInt16(bytes, offset + 28)
    const extraLength = readUInt16(bytes, offset + 30)
    const commentLength = readUInt16(bytes, offset + 32)
    const nameStart = offset + 46
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))

    if (!name || isUnsafeZipPath(name)) throw new Error('ZIP 包含不安全的檔案路徑')
    names.push(name)
    uncompressedBytes += size

    if (uncompressedBytes > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP 解壓後不可超過 50 MB')

    offset = nameStart + nameLength + extraLength + commentLength
  }

  if (names.length === 0) throw new Error('OOXML ZIP 沒有內容')
  return { entryCount: names.length, uncompressedBytes, names }
}

const parseXml = (value: Uint8Array | string) => {
  const xml = typeof value === 'string' ? value : decoder.decode(value)
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (!document || document.getElementsByTagName('parsererror').length) throw new Error('範本 XML 已損壞')
  return document
}

const serializeXml = (document: XmlDocument) => encoder.encode(new XMLSerializer().serializeToString(document))
const textEntry = (files: Record<string, Uint8Array>, name: string) => decoder.decode(files[name] || new Uint8Array())
const elementChildren = (node: XmlNode) => Array.from(node.childNodes)
  .filter((child) => child.nodeType === 1) as XmlElement[]

const validatePackageSafety = (files: Record<string, Uint8Array>) => {
  for (const [name, bytes] of Object.entries(files)) {
    const lowered = name.toLowerCase()
    if (
      lowered.includes('vbaproject') ||
      lowered.includes('/embeddings/') ||
      lowered.includes('/oleobject') ||
      lowered.endsWith('.bin') && !lowered.includes('printersettings')
    ) {
      throw new Error('範本包含巨集或嵌入物件，無法使用')
    }
    if (lowered.endsWith('.rels') && /TargetMode\s*=\s*["']External["']/i.test(decoder.decode(bytes))) {
      throw new Error('範本包含外部關聯，無法使用')
    }
  }
}

export const unzipOoxml = (bytes: Uint8Array) => {
  if (bytes.byteLength > MAX_TEMPLATE_BYTES) throw new Error('範本檔案不可超過 10 MB')
  inspectZipArchive(bytes)
  const files = unzipSync(bytes)
  validatePackageSafety(files)
  return files
}

export const detectRegistrationProfile = (bytes: Uint8Array): RegistrationProfile => {
  const files = unzipOoxml(bytes)
  const contentTypes = textEntry(files, '[Content_Types].xml')

  if (files['xl/workbook.xml'] && /spreadsheetml\.sheet\.main\+xml/.test(contentTypes)) {
    const workbook = textEntry(files, 'xl/workbook.xml')
    const sharedText = files['xl/sharedStrings.xml']
      ? parseXml(files['xl/sharedStrings.xml']).documentElement.textContent || ''
      : ''
    if (
      workbook.includes('選手資料') &&
      workbook.includes('選手照片') &&
      sharedText.includes('肖像權') &&
      sharedText.includes('出生年月日')
    ) {
      return REGISTRATION_PROFILES.just_baseball_taipei
    }
  }

  if (files['word/document.xml'] && /wordprocessingml\.document\.main\+xml/.test(contentTypes)) {
    const documentText = parseXml(files['word/document.xml']).documentElement.textContent || ''
    if (documentText.includes('主委盃幼兒軟式棒球錦標賽報名表') && documentText.includes('出生年月日')) {
      return REGISTRATION_PROFILES.chairperson_cup_u9
    }
  }

  throw new Error('尚未支援此報名表版型')
}

export const formatRocDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return ''
  const rocYear = Number(match[1]) - 1911
  return rocYear > 0 ? `${rocYear}.${match[2]}.${match[3]}` : ''
}

export const formatGregorianDate = (value: string) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return match ? `${match[1]}/${match[2]}/${match[3]}` : ''
}

export const normalizeHandCode = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase()
  if ((normalized.includes('左') && normalized.includes('右')) || normalized.includes('開弓')) return ''
  if (normalized === 'r' || normalized.includes('右')) return 'R'
  if (normalized === 'l' || normalized.includes('左')) return 'L'
  return ''
}

const relationshipTarget = (baseName: string, target: string) => {
  const baseParts = baseName.replace(/\\/g, '/').split('/')
  baseParts.pop()
  for (const part of target.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') baseParts.pop()
    else baseParts.push(part)
  }
  return baseParts.join('/')
}

const findWorkbookSheetPath = (files: Record<string, Uint8Array>, sheetName: string) => {
  const workbook = parseXml(files['xl/workbook.xml'])
  const rels = parseXml(files['xl/_rels/workbook.xml.rels'])
  const sheet = Array.from(workbook.getElementsByTagNameNS(XMLNS, 'sheet'))
    .find((node) => node.getAttribute('name') === sheetName)
  const relationshipId = sheet?.getAttributeNS(OFFICE_RELNS, 'id') || sheet?.getAttribute('r:id')
  const relationship = Array.from(rels.getElementsByTagNameNS(RELNS, 'Relationship'))
    .find((node) => node.getAttribute('Id') === relationshipId)
  const target = relationship?.getAttribute('Target')
  if (!target) throw new Error(`找不到工作表：${sheetName}`)
  return relationshipTarget('xl/workbook.xml', target)
}

const columnNumber = (reference: string) => {
  let value = 0
  for (const char of reference.replace(/\d/g, '').toUpperCase()) value = value * 26 + char.charCodeAt(0) - 64
  return value
}

const setSpreadsheetCell = (document: XmlDocument, reference: string, value: string | boolean) => {
  const rowNumber = Number(reference.match(/\d+/)?.[0] || 0)
  const sheetData = document.getElementsByTagNameNS(XMLNS, 'sheetData')[0]
  if (!sheetData || !rowNumber) throw new Error(`無法寫入儲存格 ${reference}`)
  let row = Array.from(sheetData.getElementsByTagNameNS(XMLNS, 'row'))
    .find((node) => Number(node.getAttribute('r')) === rowNumber)
  if (!row) {
    row = document.createElementNS(XMLNS, 'row')
    row.setAttribute('r', String(rowNumber))
    sheetData.appendChild(row)
  }

  let cell = elementChildren(row).find((node) => node.getAttribute('r') === reference)
  if (!cell) {
    cell = document.createElementNS(XMLNS, 'c')
    cell.setAttribute('r', reference)
    const targetColumn = columnNumber(reference)
    const next = elementChildren(row).find((node) => columnNumber(node.getAttribute('r') || '') > targetColumn)
    row.insertBefore(cell, next || null)
  }

  while (cell.firstChild) cell.removeChild(cell.firstChild)
  if (typeof value === 'boolean') {
    cell.setAttribute('t', 'b')
    const node = document.createElementNS(XMLNS, 'v')
    node.textContent = value ? '1' : '0'
    cell.appendChild(node)
  } else {
    cell.setAttribute('t', 'inlineStr')
    const inline = document.createElementNS(XMLNS, 'is')
    const text = document.createElementNS(XMLNS, 't')
    text.setAttribute('xml:space', 'preserve')
    text.textContent = value
    inline.appendChild(text)
    cell.appendChild(inline)
  }
}

const ensureContentType = (files: Record<string, Uint8Array>, extension: 'png' | 'jpeg', contentType: string) => {
  const document = parseXml(files['[Content_Types].xml'])
  const typesNs = 'http://schemas.openxmlformats.org/package/2006/content-types'
  const exists = Array.from(document.getElementsByTagNameNS(typesNs, 'Default'))
    .some((node) => node.getAttribute('Extension') === extension)
  if (!exists) {
    const node = document.createElementNS(typesNs, 'Default')
    node.setAttribute('Extension', extension)
    node.setAttribute('ContentType', contentType)
    document.documentElement.appendChild(node)
    files['[Content_Types].xml'] = serializeXml(document)
  }
}

const imageDimensions = (bytes: Uint8Array, mimeType: string) => {
  if (mimeType === 'image/png' && bytes.length >= 24) {
    return { width: readUInt32BigEndian(bytes, 16), height: readUInt32BigEndian(bytes, 20) }
  }
  if (mimeType === 'image/jpeg') {
    for (let offset = 2; offset < bytes.length - 9;) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      const marker = bytes[offset + 1]
      const length = (bytes[offset + 2] << 8) + bytes[offset + 3]
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: (bytes[offset + 5] << 8) + bytes[offset + 6], width: (bytes[offset + 7] << 8) + bytes[offset + 8] }
      }
      offset += Math.max(2, length + 2)
    }
  }
  return { width: 1, height: 1 }
}

const containedSize = (bytes: Uint8Array, mimeType: string, maxWidthPx: number, maxHeightPx: number) => {
  const size = imageDimensions(bytes, mimeType)
  const scale = Math.min(maxWidthPx / size.width, maxHeightPx / size.height)
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }
}

const addSpreadsheetPhotos = (
  files: Record<string, Uint8Array>,
  sheetPath: string,
  players: DocumentPlayer[]
) => {
  const photos = players.map((player, index) => ({ player, index })).filter(({ player }) => player.avatar)
  if (!photos.length) return

  const drawingPath = 'xl/drawings/registrationFormDrawing.xml'
  const drawingRelsPath = 'xl/drawings/_rels/registrationFormDrawing.xml.rels'
  const worksheetRelsPath = `${sheetPath.slice(0, sheetPath.lastIndexOf('/'))}/_rels/${sheetPath.split('/').pop()}.rels`
  const sheet = parseXml(files[sheetPath])
  const worksheetRels = files[worksheetRelsPath]
    ? parseXml(files[worksheetRelsPath])
    : parseXml('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>')
  const drawingRelId = 'rIdRegistrationFormDrawing'
  const relationship = worksheetRels.createElementNS(RELNS, 'Relationship')
  relationship.setAttribute('Id', drawingRelId)
  relationship.setAttribute('Type', `${OFFICE_RELNS}/drawing`)
  relationship.setAttribute('Target', '../drawings/registrationFormDrawing.xml')
  worksheetRels.documentElement.appendChild(relationship)
  files[worksheetRelsPath] = serializeXml(worksheetRels)

  const drawingNode = sheet.createElementNS(XMLNS, 'drawing')
  drawingNode.setAttributeNS(OFFICE_RELNS, 'r:id', drawingRelId)
  sheet.documentElement.appendChild(drawingNode)
  files[sheetPath] = serializeXml(sheet)

  const anchors: string[] = []
  const relationships: string[] = []
  photos.forEach(({ player, index }, photoIndex) => {
    const avatar = player.avatar!
    const extension = avatar.mimeType === 'image/png' ? 'png' : 'jpeg'
    const mediaName = `registration_photo_${index + 1}.${extension}`
    files[`xl/media/${mediaName}`] = avatar.bytes
    ensureContentType(files, extension, avatar.mimeType)
    const relId = `rId${photoIndex + 1}`
    relationships.push(`<Relationship Id="${relId}" Type="${OFFICE_RELNS}/image" Target="../media/${mediaName}"/>`)

    const col = 2 + index % 5
    const row = 4 + Math.floor(index / 5) * 3
    const fitted = containedSize(avatar.bytes, avatar.mimeType, 174, 150)
    const colOffset = Math.round((174 - fitted.width) / 2) * 9525
    const rowOffset = Math.round((150 - fitted.height) / 2) * 9525
    anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>${colOffset}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOffset}</xdr:rowOff></xdr:from><xdr:ext cx="${fitted.width * 9525}" cy="${fitted.height * 9525}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${photoIndex + 1}" name="球員照片 ${index + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fitted.width * 9525}" cy="${fitted.height * 9525}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`)
  })

  files[drawingPath] = encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${OFFICE_RELNS}">${anchors.join('')}</xdr:wsDr>`)
  files[drawingRelsPath] = encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${RELNS}">${relationships.join('')}</Relationships>`)

  const contentTypes = parseXml(files['[Content_Types].xml'])
  const typesNs = 'http://schemas.openxmlformats.org/package/2006/content-types'
  const override = contentTypes.createElementNS(typesNs, 'Override')
  override.setAttribute('PartName', '/xl/drawings/registrationFormDrawing.xml')
  override.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.drawing+xml')
  contentTypes.documentElement.appendChild(override)
  files['[Content_Types].xml'] = serializeXml(contentTypes)
}

const fillExcel = (files: Record<string, Uint8Array>, input: GenerateDocumentInput) => {
  const dataPath = findWorkbookSheetPath(files, '選手資料')
  const photosPath = findWorkbookSheetPath(files, '選手照片')
  const dataSheet = parseXml(files[dataPath])
  const photoSheet = parseXml(files[photosPath])
  const fields = input.fields

  const staff: Record<string, string> = {
    F4: fields.team_name,
    F6: fields.leader_name, I6: fields.leader_phone || '',
    F7: fields.head_coach_name, I7: fields.head_coach_phone || '',
    F8: fields.coach_1_name || '', I8: fields.coach_1_phone || '',
    F9: fields.coach_2_name || '', I9: fields.coach_2_phone || '',
    F10: fields.manager_name, I10: fields.manager_phone || '',
    F11: fields.contact_name, I11: fields.contact_phone,
  }
  Object.entries(staff).forEach(([cell, value]) => setSpreadsheetCell(dataSheet, cell, value))
  setSpreadsheetCell(photoSheet, 'C4', `隊名：${fields.team_name}`)

  for (let index = 0; index < 30; index += 1) {
    const player = input.players[index]
    const row = 35 + index
    setSpreadsheetCell(dataSheet, `D${row}`, player?.jersey_number || '')
    setSpreadsheetCell(dataSheet, `E${row}`, player?.name || '')
    setSpreadsheetCell(dataSheet, `F${row}`, player?.position || '')
    setSpreadsheetCell(dataSheet, `G${row}`, player ? formatGregorianDate(player.birth_date) : '')
    setSpreadsheetCell(dataSheet, `H${row}`, player?.national_id || '')
    setSpreadsheetCell(dataSheet, `I${row}`, player ? normalizeHandCode(player.throwing_hand || '') : '')
    setSpreadsheetCell(dataSheet, `J${row}`, player ? normalizeHandCode(player.batting_hand || '') : '')
    setSpreadsheetCell(dataSheet, `K${row}`, player?.school_name || '')
    setSpreadsheetCell(dataSheet, `L${row}`, player?.grade || '')
    setSpreadsheetCell(dataSheet, `M${row}`, Boolean(player?.portrait_auth))

    const col = String.fromCharCode(67 + index % 5)
    const baseRow = 5 + Math.floor(index / 5) * 3
    setSpreadsheetCell(photoSheet, `${col}${baseRow}`, '')
    setSpreadsheetCell(photoSheet, `${col}${baseRow + 1}`, player ? `背號：${player.jersey_number}` : '背號：')
    setSpreadsheetCell(photoSheet, `${col}${baseRow + 2}`, player ? `姓名：${player.name}` : '姓名：')
  }

  files[dataPath] = serializeXml(dataSheet)
  files[photosPath] = serializeXml(photoSheet)
  addSpreadsheetPhotos(files, photosPath, input.players)
}

const directCells = (row: XmlElement) => elementChildren(row).filter((node) => node.localName === 'tc')

const replaceWordCellText = (cell: XmlElement, lines: string[]) => {
  const document = cell.ownerDocument!
  const tcPr = elementChildren(cell).find((node) => node.localName === 'tcPr')
  while (cell.firstChild) cell.removeChild(cell.firstChild)
  if (tcPr) cell.appendChild(tcPr)

  const outputLines = lines.length ? lines : ['']
  outputLines.forEach((line) => {
    const paragraph = document.createElementNS(WORDNS, 'w:p')
    const paragraphProperties = document.createElementNS(WORDNS, 'w:pPr')
    const justify = document.createElementNS(WORDNS, 'w:jc')
    justify.setAttributeNS(WORDNS, 'w:val', 'left')
    paragraphProperties.appendChild(justify)
    paragraph.appendChild(paragraphProperties)
    const run = document.createElementNS(WORDNS, 'w:r')
    const runProperties = document.createElementNS(WORDNS, 'w:rPr')
    const fonts = document.createElementNS(WORDNS, 'w:rFonts')
    fonts.setAttributeNS(WORDNS, 'w:ascii', 'DFKai-SB')
    fonts.setAttributeNS(WORDNS, 'w:eastAsia', '標楷體')
    const size = document.createElementNS(WORDNS, 'w:sz')
    size.setAttributeNS(WORDNS, 'w:val', '24')
    runProperties.appendChild(fonts)
    runProperties.appendChild(size)
    const text = document.createElementNS(WORDNS, 'w:t')
    text.textContent = line
    run.appendChild(runProperties)
    run.appendChild(text)
    paragraph.appendChild(run)
    cell.appendChild(paragraph)
  })
}

const addWordPhoto = (
  cell: XmlElement,
  avatar: NonNullable<DocumentPlayer['avatar']>,
  relationshipId: string,
  drawingId: number
) => {
  replaceWordCellText(cell, [])
  elementChildren(cell)
    .filter((node) => node.localName !== 'tcPr')
    .forEach((node) => cell.removeChild(node))
  const cellProperties = elementChildren(cell).find((node) => node.localName === 'tcPr')
  if (cellProperties) {
    let verticalAlign = elementChildren(cellProperties).find((node) => node.localName === 'vAlign')
    if (!verticalAlign) {
      verticalAlign = cell.ownerDocument!.createElementNS(WORDNS, 'w:vAlign')
      cellProperties.appendChild(verticalAlign)
    }
    verticalAlign.setAttributeNS(WORDNS, 'w:val', 'center')
  }
  const fitted = containedSize(avatar.bytes, avatar.mimeType, 115, 110)
  const cx = fitted.width * 9525
  const cy = fitted.height * 9525
  const document = cell.ownerDocument!
  const wrapper = parseXml(`<w:p xmlns:w="${WORDNS}" xmlns:r="${OFFICE_RELNS}" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${drawingId}" name="球員照片 ${drawingId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${drawingId}" name="球員照片 ${drawingId}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`)
  cell.appendChild(document.importNode(wrapper.documentElement, true))
}

const fillWord = (files: Record<string, Uint8Array>, input: GenerateDocumentInput) => {
  const document = parseXml(files['word/document.xml'])
  const table = document.getElementsByTagNameNS(WORDNS, 'tbl')[0]
  const rows = table ? elementChildren(table).filter((node) => node.localName === 'tr') : []
  if (rows.length < 11) throw new Error('Word 報名表格結構不符')
  const fields = input.fields
  const staffRows = [directCells(rows[0]), directCells(rows[1]), directCells(rows[2])]
  replaceWordCellText(staffRows[0][1], [fields.team_name])
  replaceWordCellText(staffRows[0][3], [fields.leader_name])
  replaceWordCellText(staffRows[1][1], [fields.head_coach_name])
  replaceWordCellText(staffRows[1][3], [fields.coach_1_name || ''])
  replaceWordCellText(staffRows[1][5], [fields.coach_2_name || ''])
  replaceWordCellText(staffRows[2][1], [fields.manager_name])
  replaceWordCellText(staffRows[2][3], [fields.contact_name])
  replaceWordCellText(staffRows[2][5], [fields.contact_phone])

  const relsPath = 'word/_rels/document.xml.rels'
  const rels = parseXml(files[relsPath])
  let relationIndex = 1

  for (let index = 0; index < 20; index += 1) {
    const group = Math.floor(index / 5)
    const position = index % 5
    const playerCell = directCells(rows[3 + group * 2])[position]
    const photoCell = directCells(rows[4 + group * 2])[position]
    const player = input.players[index]
    replaceWordCellText(playerCell, player
      ? [`隊員：${player.name}`, formatRocDate(player.birth_date), `背號：${player.jersey_number}`]
      : ['隊員：', '出生年月日：', '背號：'])
    replaceWordCellText(photoCell, [])

    if (player?.avatar) {
      const extension = player.avatar.mimeType === 'image/png' ? 'png' : 'jpeg'
      const mediaName = `registration_photo_${index + 1}.${extension}`
      const relationId = `rIdRegistrationPhoto${relationIndex}`
      files[`word/media/${mediaName}`] = player.avatar.bytes
      ensureContentType(files, extension, player.avatar.mimeType)
      const relationship = rels.createElementNS(RELNS, 'Relationship')
      relationship.setAttribute('Id', relationId)
      relationship.setAttribute('Type', `${OFFICE_RELNS}/image`)
      relationship.setAttribute('Target', `media/${mediaName}`)
      rels.documentElement.appendChild(relationship)
      addWordPhoto(photoCell, player.avatar, relationId, 1000 + relationIndex)
      relationIndex += 1
    }
  }

  files['word/document.xml'] = serializeXml(document)
  files[relsPath] = serializeXml(rels)
}

export const generateRegistrationDocument = (
  templateBytes: Uint8Array,
  profileKey: RegistrationProfileKey,
  input: GenerateDocumentInput
) => {
  const detected = detectRegistrationProfile(templateBytes)
  if (detected.key !== profileKey) throw new Error('範本 metadata 與檔案版型不一致')
  if (input.players.length < 1 || input.players.length > detected.maxPlayers) {
    throw new Error(`球員人數須為 1 至 ${detected.maxPlayers} 人`)
  }

  const files = unzipOoxml(templateBytes)
  if (profileKey === 'just_baseball_taipei') fillExcel(files, input)
  else fillWord(files, input)
  return zipSync(files as Zippable, { level: 1 })
}
