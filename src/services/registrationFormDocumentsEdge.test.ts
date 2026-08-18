import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('../../supabase/functions/registration-form-documents/index.ts', import.meta.url),
  'utf8'
)
const denoConfig = JSON.parse(readFileSync(
  new URL('../../supabase/functions/registration-form-documents/deno.json', import.meta.url),
  'utf8'
))

describe('registration-form-documents Edge Function boundary', () => {
  it('keeps pinned OOXML dependencies isolated to this function', () => {
    expect(denoConfig.imports).toEqual({
      '@xmldom/xmldom': 'npm:@xmldom/xmldom@0.9.11',
      fflate: 'npm:fflate@0.8.2'
    })
  })

  it('keeps the user-facing filename out of the Storage object key', () => {
    const uploadSection = source.slice(source.indexOf('const handleUpload'), source.indexOf('const parseJson'))
    expect(uploadSection).toContain("const originalFileNameField = form.get('original_file_name')")
    expect(uploadSection).toContain('const extension = profile.fileType')
    expect(uploadSection).not.toContain("const extension = file.name.split('.')")
    expect(uploadSection).toContain('const storagePath = `${userId}/${crypto.randomUUID()}/template.${extension}`')
    expect(uploadSection).toContain('original_file_name: originalFileName')
    expect(uploadSection).not.toContain('}/${originalFileName}`')
  })

  it('requires registration creation and players edit before generation', () => {
    const generateSection = source.slice(source.indexOf('const handleGenerate'), source.indexOf('serve(async'))
    expect(generateSection).toContain("assertPermission(userClient, 'registration_forms', 'CREATE')")
    expect(generateSection).toContain("assertPermission(userClient, 'players', 'EDIT')")
    expect(source).toContain("userClient.rpc('list_team_members_for_edit')")
    expect(source).not.toContain(".from('team_members')")
  })

  it('does not store generated output and returns no-store binary headers', () => {
    const generateSection = source.slice(source.indexOf('const handleGenerate'), source.indexOf('serve(async'))
    expect(generateSection).toContain("'Cache-Control': 'no-store, max-age=0'")
    expect(generateSection).toContain("'Content-Disposition'")
    expect(generateSection).not.toContain(".from('registration-forms').upload")
    expect(generateSection).toContain("from('registration_form_generation_logs').insert")
  })

  it('requires an event-template link and writes only event metadata to the generation log', () => {
    const eventSection = source.slice(source.indexOf('const getEventForTemplate'), source.indexOf('const handleDelete'))
    const generateSection = source.slice(source.indexOf('const handleGenerate'), source.indexOf('serve(async'))
    expect(eventSection).toContain("from('registration_form_events')")
    expect(eventSection).toContain("from('registration_form_event_templates')")
    expect(eventSection).toContain(".eq('template_id', templateId)")
    expect(generateSection).toContain("requireString(payload?.event_id, '賽事報名')")
    expect(generateSection).toContain('event_id: event.id')
    expect(generateSection).toContain('event_name_snapshot: event.name')
    expect(generateSection).not.toContain('member_ids:')
  })

  it('keeps name, portrait authorization and avatar outside the allowed override fields', () => {
    const playerSection = source.slice(source.indexOf('const buildDocumentPlayers'), source.indexOf('const handleGenerate'))
    expect(playerSection).toContain('name: String(member.name')
    expect(playerSection).toContain('portrait_auth: member.portrait_auth === true')
    expect(playerSection).toContain('avatar: await loadAvatar(member)')
    expect(playerSection).not.toContain('override.name')
    expect(playerSection).not.toContain('override.portrait_auth')
    expect(playerSection).not.toContain('override.avatar')
  })

  it('keeps the Excel position override optional during server validation', () => {
    const validationSection = source.slice(source.indexOf('const validatePlayers'), source.indexOf('const avatarStoragePath'))
    expect(validationSection).not.toContain('!player.position')
    expect(validationSection).not.toContain('或守位')
  })
})
