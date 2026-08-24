import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  COBRA_CUP_PDF_PROFILE_KEY,
  COBRA_CUP_TEMPLATE_SHA256,
  detectRegistrationPdfProfile,
  fillCobraCupPdfPage,
  isPdfDocument,
  sha256Hex
} from './pdfLogic'
import type { GenerateDocumentInput } from './logic'

const input: GenerateDocumentInput = {
  fields: {
    team_name: 'Team Bears',
    leader_name: 'Leader',
    head_coach_name: 'Coach',
    coach_1_name: 'Coach A',
    coach_2_name: 'Coach B',
    manager_name: 'Manager',
    contact_name: 'Contact',
    contact_phone: '0912345678',
    address: 'New Taipei City'
  },
  players: [{
    id: 'member-1',
    name: 'Player',
    jersey_number: '7',
    birth_date: '2018-01-02',
    national_id: 'A123456789',
    grade: 'G1',
    notes: 'OK'
  }]
}

describe('registration form PDF logic', () => {
  it('recognizes PDF headers and only accepts the pinned Cobra Cup fingerprint', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 fixture')
    expect(isPdfDocument(bytes)).toBe(true)
    await expect(detectRegistrationPdfProfile(bytes, async () => COBRA_CUP_TEMPLATE_SHA256))
      .resolves.toBe(COBRA_CUP_PDF_PROFILE_KEY)
    await expect(detectRegistrationPdfProfile(bytes, async () => '0'.repeat(64)))
      .rejects.toThrow('尚未支援此 PDF')
    expect(isPdfDocument(new TextEncoder().encode('not a pdf'))).toBe(false)
  })

  it('provides a stable SHA-256 helper', async () => {
    await expect(sha256Hex(new TextEncoder().encode('abc')))
      .resolves.toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('writes staff and player overlays to the sixth A4 page', async () => {
    const pdf = await PDFDocument.create()
    for (let index = 0; index < 6; index += 1) pdf.addPage([595.32, 841.92])
    const page = pdf.getPage(5)
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    fillCobraCupPdfPage(page, font, input)
    const output = await pdf.save({ useObjectStreams: false })
    expect(isPdfDocument(output)).toBe(true)
    expect((await PDFDocument.load(output)).getPageCount()).toBe(6)
    expect(output.byteLength).toBeGreaterThan(2000)
  })

  it('rejects values that cannot fit inside the fixed PDF cells', async () => {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.32, 841.92])
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    const invalid: GenerateDocumentInput = {
      ...input,
      players: [{ ...input.players[0], name: 'X'.repeat(200) }]
    }
    expect(() => fillCobraCupPdfPage(page, font, invalid)).toThrow('姓名內容過長')
  })
})
