import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import * as webpush from 'https://esm.sh/web-push@3.6.7'
import { createCoachLeaveWorkerHandler, normalizeCoachLeavePushSubscription, processCoachLeaveOutbox, sendCoachLeavePush, type CoachLeaveDelivery } from './logic.ts'

const secret = Deno.env.get('COACH_LEAVE_OUTBOX_SECRET') || ''
const publicKey = Deno.env.get('VAPID_PUBLIC_KEY') || ''
const privateKey = Deno.env.get('VAPID_PRIVATE_KEY') || ''
const subject = Deno.env.get('VAPID_SUBJECT') || 'mailto:team@example.com'
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { autoRefreshToken: false, persistSession: false }
})
const send = (delivery: CoachLeaveDelivery) => sendCoachLeavePush(delivery,
  (subscription, payload) => webpush.sendNotification(normalizeCoachLeavePushSubscription(subscription), payload),
  async (subscriptionId, userId) => {
    const { error: deleteError } = await db.from('web_push_subscriptions').delete()
      .eq('id', subscriptionId).eq('user_id', userId)
    if (deleteError) throw deleteError
  }
)
serve(createCoachLeaveWorkerHandler({
  secret,
  vapidConfigured: Boolean(publicKey && privateKey),
  process: async input => {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    return processCoachLeaveOutbox(db, send, input)
  },
  onError: () => console.error('Coach leave Outbox processing failed')
}))
