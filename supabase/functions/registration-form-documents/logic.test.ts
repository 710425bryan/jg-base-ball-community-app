import { describe, expect, it } from 'vitest'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import {
  detectRegistrationProfile,
  formatGregorianDate,
  formatRocDate,
  generateRegistrationDocument,
  inspectZipArchive,
  normalizeHandCode,
  type GenerateDocumentInput
} from './logic'

const decoder = { decode: (value: Uint8Array) => strFromU8(value) }
const xml = (value: string) => strToU8(value)

const contentTypes = (main: string, overrides = '') => xml(
  `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="${main}" ContentType="${main.startsWith('/xl') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'}"/>${overrides}</Types>`
)

const createExcelFixture = () => zipSync({
  '[Content_Types].xml': contentTypes('/xl/workbook.xml',
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'),
  'xl/workbook.xml': xml(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="選手資料" sheetId="1" r:id="rId1"/><sheet name="選手照片" sheetId="2" r:id="rId2"/></sheets></workbook>`),
  'xl/_rels/workbook.xml.rels': xml(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`),
  'xl/sharedStrings.xml': xml(`<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>肖像權暨個人資料同意書</t></si><si><t>出生年月日</t></si></sst>`),
  'xl/worksheets/sheet1.xml': xml(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><pageMargins left="0.2" right="0.2"/></worksheet>`),
  'xl/worksheets/sheet2.xml': xml(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/></worksheet>`)
})

const wordCell = (text = '') => `<w:tc><w:tcPr/><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`
const wordRow = (count: number, values: string[] = []) =>
  `<w:tr>${Array.from({ length: count }, (_, index) => wordCell(values[index] || '')).join('')}</w:tr>`

const createWordFixture = () => {
  const rows = [
    wordRow(4, ['隊名', '', '領隊', '']),
    wordRow(6, ['總教練', '', '教練', '', '教練', '']),
    wordRow(6, ['管理', '', '聯絡人', '', '手機', '']),
    wordRow(5, ['隊員：出生年月日背號：']),
    wordRow(5),
    wordRow(5, ['隊員：出生年月日背號：']),
    wordRow(5),
    wordRow(5, ['隊員：出生年月日背號：']),
    wordRow(5),
    wordRow(5, ['隊員：出生年月日背號：']),
    wordRow(5)
  ].join('')
  return zipSync({
    '[Content_Types].xml': contentTypes('/word/document.xml'),
    'word/document.xml': xml(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t>115年臺北市松山區主委盃幼兒軟式棒球錦標賽報名表</w:t></w:r></w:p><w:tbl>${rows}</w:tbl></w:body></w:document>`),
    'word/_rels/document.xml.rels': xml(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`)
  })
}

const input: GenerateDocumentInput = {
  fields: {
    team_name: '中港熊戰',
    leader_name: '領隊甲',
    head_coach_name: '總教練乙',
    manager_name: '管理丙',
    contact_name: '聯絡丁',
    contact_phone: '0912345678'
  },
  players: [{
    id: 'member-1',
    name: '小熊',
    jersey_number: '7',
    birth_date: '2015-06-18',
    national_id: 'A123456789',
    throwing_hand: '右投',
    batting_hand: '左打',
    school_name: '中港國小',
    grade: '五年級',
    portrait_auth: true,
    position: 'IF'
  }]
}
const png = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5f8AAAAASUVORK5CYII=',
  'base64'
))

describe('registration form OOXML logic', () => {
  it('detects the two known template profiles and rejects unknown packages', () => {
    expect(detectRegistrationProfile(createExcelFixture()).key).toBe('just_baseball_taipei')
    expect(detectRegistrationProfile(createWordFixture()).key).toBe('chairperson_cup_u9')
    expect(() => detectRegistrationProfile(zipSync({ 'hello.txt': xml('hello') }))).toThrow('尚未支援')
  })

  it('inspects central directory limits and rejects external relationships', () => {
    const fixture = createExcelFixture()
    expect(inspectZipArchive(fixture).entryCount).toBeGreaterThan(4)
    const files = unzipSync(fixture)
    files['xl/_rels/workbook.xml.rels'] = xml('<Relationships><Relationship TargetMode="External" Target="https://example.com"/></Relationships>')
    expect(() => detectRegistrationProfile(zipSync(files))).toThrow('外部關聯')
  })

  it('formats Gregorian/ROC dates and normalizes left/right hand values', () => {
    expect(formatGregorianDate('2015-06-18')).toBe('2015/06/18')
    expect(formatRocDate('2015-06-18')).toBe('104.06.18')
    expect(normalizeHandCode('右投')).toBe('R')
    expect(normalizeHandCode('左打')).toBe('L')
    expect(normalizeHandCode('左右開弓')).toBe('')
  })

  it('fills Excel cells while preserving unrelated print XML', () => {
    const output = generateRegistrationDocument(createExcelFixture(), 'just_baseball_taipei', input)
    const files = unzipSync(output)
    const playerSheet = decoder.decode(files['xl/worksheets/sheet1.xml'])
    const photoSheet = decoder.decode(files['xl/worksheets/sheet2.xml'])
    expect(playerSheet).toContain('r="E35"')
    expect(playerSheet).toContain('小熊')
    expect(playerSheet).toContain('2015/06/18')
    expect(playerSheet).toContain('A123456789')
    expect(playerSheet).toContain('<pageMargins')
    expect(photoSheet).toContain('背號：7')
    expect(photoSheet).toContain('姓名：小熊')
    expect(photoSheet).not.toContain('Photo')
  })

  it('fills Word table text and preserves the original title', () => {
    const output = generateRegistrationDocument(createWordFixture(), 'chairperson_cup_u9', input)
    const documentXml = decoder.decode(unzipSync(output)['word/document.xml'])
    expect(documentXml).toContain('主委盃幼兒軟式棒球錦標賽報名表')
    expect(documentXml).toContain('中港熊戰')
    expect(documentXml).toContain('隊員：小熊')
    expect(documentXml).toContain('104.06.18')
    expect(documentXml).toContain('背號：7')
  })

  it('adds contained photo relationships and drawing anchors without cropping', () => {
    const withPhoto: GenerateDocumentInput = {
      ...input,
      players: [{ ...input.players[0], avatar: { bytes: png, mimeType: 'image/png' } }]
    }
    const excelFiles = unzipSync(generateRegistrationDocument(
      createExcelFixture(),
      'just_baseball_taipei',
      withPhoto
    ))
    expect(Object.keys(excelFiles)).toContain('xl/media/registration_photo_1.png')
    expect(strFromU8(excelFiles['xl/drawings/registrationFormDrawing.xml'])).toContain('noChangeAspect="1"')
    expect(strFromU8(excelFiles['xl/drawings/registrationFormDrawing.xml'])).toContain('<xdr:oneCellAnchor>')

    const wordFiles = unzipSync(generateRegistrationDocument(
      createWordFixture(),
      'chairperson_cup_u9',
      withPhoto
    ))
    expect(Object.keys(wordFiles)).toContain('word/media/registration_photo_1.png')
    expect(strFromU8(wordFiles['word/document.xml'])).toContain('<wp:inline')
    expect(strFromU8(wordFiles['word/_rels/document.xml.rels'])).toContain('rIdRegistrationPhoto1')
  })
})
