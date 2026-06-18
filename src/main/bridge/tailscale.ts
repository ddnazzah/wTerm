import { execFile } from 'node:child_process'

/**
 * Candidate paths for the Tailscale CLI. On macOS the GUI app ships the binary
 * inside the bundle and it is often not on PATH, so we probe the well-known
 * location too.
 */
const CANDIDATES =
  process.platform === 'darwin'
    ? ['tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale']
    : process.platform === 'win32'
      ? ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe']
      : ['tailscale']

function run(bin: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout: 4000 }, (err, stdout) => {
      resolve(err ? null : stdout)
    })
  })
}

/**
 * Best-effort: derive the device's MagicDNS HTTPS origin (e.g.
 * `https://mac.tailnet-name.ts.net`). Returns null when Tailscale isn't
 * installed/running. The phone must reach the bridge over this HTTPS origin
 * (served via `tailscale serve`) so the PWA gets a secure context for service
 * workers + Web Push — a raw 100.x IP would not qualify.
 */
export async function getTailscaleOrigin(): Promise<string | null> {
  for (const bin of CANDIDATES) {
    const out = await run(bin, ['status', '--json'])
    if (!out) continue
    try {
      const status = JSON.parse(out) as { Self?: { DNSName?: string } }
      const dns = status.Self?.DNSName
      if (dns) return `https://${dns.replace(/\.$/, '')}`
    } catch {
      // try the next candidate
    }
  }
  return null
}
