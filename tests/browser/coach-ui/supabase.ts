// The dedicated fixture aliases every Supabase import to this module.
// Unexpected calls fail locally; no key, real session or remote project exists.
export const supabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only' } }, error: null }) },
  rpc: async (name: string) => { throw new Error(`Unexpected live API call in fixture: ${name}`) }
}
