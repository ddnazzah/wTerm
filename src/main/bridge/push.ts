import webpush from 'web-push'
import type { NotifyPayload } from '@shared/types'
import { addSubscription, getSecrets, removeSubscription } from './secrets'

let configured = false

/**
 * Configure web-push with the persisted VAPID keypair. Idempotent. The `mailto:`
 * subject is required by the spec; push services use it to contact the sender
 * about misbehaving requests. It is not user-visible.
 */
async function ensureConfigured(): Promise<void> {
  if (configured) return
  const { vapidPublicKey, vapidPrivateKey } = await getSecrets()
  webpush.setVapidDetails('mailto:wterm@localhost', vapidPublicKey, vapidPrivateKey)
  configured = true
}

export async function getVapidPublicKey(): Promise<string> {
  const { vapidPublicKey } = await getSecrets()
  return vapidPublicKey
}

export async function registerSubscription(sub: unknown): Promise<void> {
  // The PWA sends a standard PushSubscription JSON; trust the shape loosely and
  // let web-push validate on send.
  if (sub && typeof sub === 'object' && 'endpoint' in sub) {
    await addSubscription(sub as webpush.PushSubscription)
  }
}

/**
 * Send a Web Push to every registered phone. Subscriptions the push service
 * reports as gone (404/410) are pruned. Fire-and-forget from the caller's view.
 */
export async function pushToSubscribers(payload: NotifyPayload): Promise<void> {
  await ensureConfigured()
  const { subscriptions } = await getSecrets()
  if (subscriptions.length === 0) return

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    projectId: payload.projectId,
    terminalId: payload.terminalId,
  })

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(sub, body)
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) {
          await removeSubscription(sub.endpoint)
        } else {
          console.error('[bridge] push send failed:', status ?? err)
        }
      }
    })
  )
}
