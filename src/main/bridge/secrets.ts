import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { dirname, join } from 'node:path'
import webpush from 'web-push'

/**
 * All bridge secrets live in one encrypted-at-rest blob, mirroring the GitHub
 * auth store (`src/main/github/auth.ts`): the sensitive JSON is encrypted via
 * `safeStorage` and base64'd onto disk, with a plaintext-base64 fallback for
 * platforms where OS encryption is unavailable.
 */
export interface BridgeSecrets {
  /** long bearer token a paired phone stores and presents on every connection */
  token: string
  /** short, human-typeable pairing code shown on the desktop */
  code: string
  /** VAPID keypair for Web Push (generated once, reused across restarts) */
  vapidPublicKey: string
  vapidPrivateKey: string
  /** push subscriptions registered by paired phones */
  subscriptions: webpush.PushSubscription[]
}

interface DiskBlob {
  version: 1
  /** base64 of safeStorage-encrypted JSON {@link BridgeSecrets} */
  enc: string | null
}

const FILE_VERSION: 1 = 1
let cache: BridgeSecrets | null = null
let loaded = false

function filePath(): string {
  return join(app.getPath('userData'), 'bridge.json')
}

function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

function generateCode(): string {
  // Six digits, zero-padded — easy to read off the screen and type on a phone.
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

function freshSecrets(): BridgeSecrets {
  const keys = webpush.generateVAPIDKeys()
  return {
    token: generateToken(),
    code: generateCode(),
    vapidPublicKey: keys.publicKey,
    vapidPrivateKey: keys.privateKey,
    subscriptions: [],
  }
}

function decode(enc: string): BridgeSecrets | null {
  try {
    const buf = Buffer.from(enc, 'base64')
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(buf)
      : buf.toString('utf-8')
    return JSON.parse(json) as BridgeSecrets
  } catch (err) {
    console.error('[bridge] failed to decrypt secrets:', err)
    return null
  }
}

function encode(secrets: BridgeSecrets): string {
  const json = JSON.stringify(secrets)
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json).toString('base64')
  }
  return Buffer.from(json, 'utf-8').toString('base64')
}

async function ensureLoaded(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as Partial<DiskBlob>
    if (parsed?.version === FILE_VERSION && parsed.enc) {
      cache = decode(parsed.enc)
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[bridge] failed to load secrets file:', err)
    }
  }
  if (!cache) {
    cache = freshSecrets()
    await persist()
  }
}

async function persist(): Promise<void> {
  if (!cache) return
  const target = filePath()
  const tmp = `${target}.tmp`
  const blob: DiskBlob = { version: FILE_VERSION, enc: encode(cache) }
  await fs.mkdir(dirname(target), { recursive: true }).catch(() => {})
  await fs.writeFile(tmp, JSON.stringify(blob, null, 2), 'utf-8')
  await fs.rename(tmp, target)
}

export async function getSecrets(): Promise<BridgeSecrets> {
  await ensureLoaded()
  return cache!
}

/** Verify a presented bearer token against the stored one (constant-ish compare). */
export async function verifyToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false
  const { token: expected } = await getSecrets()
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Rotate the pairing code + token, invalidating previously-paired phones. */
export async function regeneratePairing(): Promise<BridgeSecrets> {
  await ensureLoaded()
  cache!.token = generateToken()
  cache!.code = generateCode()
  await persist()
  return cache!
}

export async function addSubscription(sub: webpush.PushSubscription): Promise<void> {
  await ensureLoaded()
  const exists = cache!.subscriptions.some((s) => s.endpoint === sub.endpoint)
  if (!exists) {
    cache!.subscriptions.push(sub)
    await persist()
  }
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await ensureLoaded()
  const before = cache!.subscriptions.length
  cache!.subscriptions = cache!.subscriptions.filter((s) => s.endpoint !== endpoint)
  if (cache!.subscriptions.length !== before) await persist()
}
