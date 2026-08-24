import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { formatGregorianDate, type GenerateDocumentInput } from './logic.ts'

export const COBRA_CUP_PDF_PROFILE_KEY = 'cobra_cup_u9_pdf' as const
export const COBRA_CUP_TEMPLATE_SHA256 = 'a25dbfa7c561c7f320557602b29a46fd43944821f9847e70ca2ece5fe882a8c3'
export const REGISTRATION_PDF_FONT_URL =
  'https://raw.githubusercontent.com/justfont/open-huninn-font/98d53b3dac1730889edf548359c326c53624fa80/font/jf-openhuninn-2.1.ttf'
export const REGISTRATION_PDF_FONT_SHA256 = '9d5bf4932d31fe94c18cd8cfddc98bc1b14ce10f4e354c682179db290a99c825'

const MAX_PDF_FONT_BYTES = 6 * 1024 * 1024
const A4_WIDTH = 595.32
const A4_HEIGHT = 841.92
const FORM_PAGE_INDEX = 5
const black = rgb(0, 0, 0)
const white = rgb(1, 1, 1)

const playerRows = [
  { bottom: 591.34, height: 25.08 },
  { bottom: 564.67, height: 26.19 },
  { bottom: 537.07, height: 27.12 },
  { bottom: 510.31, height: 26.28 },
  { bottom: 483.91, height: 25.92 },
  { bottom: 456.43, height: 27 },
  { bottom: 429.91, height: 26.04 },
  { bottom: 403.03, height: 26.4 },
  { bottom: 375.64, height: 26.91 },
  { bottom: 348.64, height: 26.52 },
  { bottom: 322.6, height: 25.56 },
  { bottom: 295.84, height: 26.28 },
  { bottom: 268.36, height: 27 },
  { bottom: 241.6, height: 26.28 }
] as const

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes))
  .map((value) => value.toString(16).padStart(2, '0'))
  .join('')

export const sha256Hex = async (bytes: Uint8Array) => hex(await crypto.subtle.digest('SHA-256', bytes))

export const isPdfDocument = (bytes: Uint8Array) => (
  bytes.length >= 5
  && bytes[0] === 0x25
  && bytes[1] === 0x50
  && bytes[2] === 0x44
  && bytes[3] === 0x46
  && bytes[4] === 0x2d
)

export const detectRegistrationPdfProfile = async (
  bytes: Uint8Array,
  digest: (value: Uint8Array) => Promise<string> = sha256Hex
) => {
  if (!isPdfDocument(bytes)) throw new Error('PDF 檔案標頭無效')
  if (await digest(bytes) !== COBRA_CUP_TEMPLATE_SHA256) {
    throw new Error('尚未支援此 PDF 報名表版型')
  }
  return COBRA_CUP_PDF_PROFILE_KEY
}

const assertCobraCupLayout = (pdf: PDFDocument) => {
  if (pdf.getPageCount() !== 6) throw new Error('眼鏡蛇盃 PDF 範本頁數不符')
  const page = pdf.getPage(FORM_PAGE_INDEX)
  const { width, height } = page.getSize()
  if (Math.abs(width - A4_WIDTH) > 1 || Math.abs(height - A4_HEIGHT) > 1) {
    throw new Error('眼鏡蛇盃 PDF 報名表頁面尺寸不符')
  }
  return page
}

const fitTextSize = (font: PDFFont, text: string, maxWidth: number, preferred: number, minimum: number, label: string) => {
  let size = preferred
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.25
  if (font.widthOfTextAtSize(text, size) > maxWidth) throw new Error(`${label}內容過長，請縮短後重試`)
  return size
}

const drawLeft = (
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  label: string,
  preferred = 10,
  minimum = 7
) => {
  const value = String(text || '').trim()
  if (!value) return
  const size = fitTextSize(font, value, maxWidth, preferred, minimum, label)
  page.drawText(value, { x, y, size, font, color: black })
}

const drawCentered = (
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  bottom: number,
  width: number,
  height: number,
  label: string,
  preferred = 9,
  minimum = 6.5
) => {
  const value = String(text || '').trim()
  if (!value) return
  const size = fitTextSize(font, value, width - 5, preferred, minimum, label)
  const textWidth = font.widthOfTextAtSize(value, size)
  const y = bottom + Math.max(2, (height - size) / 2 + 1)
  page.drawText(value, { x: x + (width - textWidth) / 2, y, size, font, color: black })
}

export const fillCobraCupPdfPage = (
  page: PDFPage,
  font: PDFFont,
  input: GenerateDocumentInput
) => {
  const { fields, players } = input
  drawLeft(page, font, fields.team_name, 114.5, 725.4, 420, '隊名', 10.5)
  drawLeft(page, font, fields.leader_name, 114.5, 707.4, 53, '領隊')
  drawLeft(page, font, fields.head_coach_name, 226.5, 707.4, 46, '總教練')
  drawLeft(page, font, fields.contact_name, 331.5, 707.4, 204, '聯絡人')
  drawLeft(page, font, fields.coach_1_name || '', 114.5, 689.4, 53, '教練一')
  drawLeft(page, font, fields.coach_2_name || '', 226.5, 689.4, 46, '教練二')
  drawLeft(page, font, fields.manager_name, 331.5, 689.4, 204, '管理')
  drawLeft(page, font, fields.contact_phone, 149.5, 671.4, 386, '聯絡人電話')
  drawLeft(page, font, fields.address || '', 114.5, 653.4, 421, '地址')

  players.forEach((player, index) => {
    const row = playerRows[index]
    if (!row) return
    page.drawRectangle({
      x: 57.5,
      y: row.bottom + 0.7,
      width: 41.1,
      height: row.height - 1.4,
      color: white
    })
    const prefix = `第 ${index + 1} 位球員`
    drawCentered(page, font, player.jersey_number, 57.5, row.bottom, 41.1, row.height, `${prefix}背號`)
    drawCentered(page, font, player.name, 99.6, row.bottom, 64.3, row.height, `${prefix}姓名`)
    drawCentered(page, font, formatGregorianDate(player.birth_date), 164.9, row.bottom, 103.8, row.height, `${prefix}生日`, 8.5)
    drawCentered(page, font, player.national_id || '', 269.7, row.bottom, 111.8, row.height, `${prefix}身分證`, 8.5)
    drawCentered(page, font, player.grade || '', 382.5, row.bottom, 44, row.height, `${prefix}年級`, 8.5)
    drawCentered(page, font, player.notes || '', 427.5, row.bottom, 110.5, row.height, `${prefix}備註`, 8.5)
  })
}

export const fillCobraCupPdfDocument = async (
  templateBytes: Uint8Array,
  input: GenerateDocumentInput,
  fontBytes: Uint8Array
) => {
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: false, updateMetadata: false })
  const page = assertCobraCupLayout(pdf)
  pdf.registerFontkit(fontkit)
  const font = await pdf.embedFont(fontBytes, { subset: false })
  fillCobraCupPdfPage(page, font, input)
  return pdf.save({ useObjectStreams: false })
}

let pdfFontPromise: Promise<Uint8Array> | null = null

const fetchRegistrationPdfFont = async () => {
  const response = await fetch(REGISTRATION_PDF_FONT_URL)
  if (!response.ok) throw new Error('無法載入 PDF 中文字型')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength < 100_000 || bytes.byteLength > MAX_PDF_FONT_BYTES) {
    throw new Error('PDF 中文字型大小不符')
  }
  if (await sha256Hex(bytes) !== REGISTRATION_PDF_FONT_SHA256) {
    throw new Error('PDF 中文字型完整性驗證失敗')
  }
  return bytes
}

export const loadRegistrationPdfFont = () => {
  if (!pdfFontPromise) {
    pdfFontPromise = fetchRegistrationPdfFont().catch((error) => {
      pdfFontPromise = null
      throw error
    })
  }
  return pdfFontPromise
}

export const generateRegistrationPdfDocument = async (
  templateBytes: Uint8Array,
  input: GenerateDocumentInput
) => {
  await detectRegistrationPdfProfile(templateBytes)
  return fillCobraCupPdfDocument(templateBytes, input, await loadRegistrationPdfFont())
}
