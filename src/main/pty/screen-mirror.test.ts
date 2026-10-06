import { describe, expect, test } from 'vitest'
import { Terminal } from '@xterm/headless'
import { ScreenMirror } from './screen-mirror'

const WIDE = 100
const NARROW = 40
const ROWS = 24

/** The visible text of a terminal's buffer, trailing blanks removed. */
function readLines(term: Terminal): string[] {
  const buf = term.buffer.active
  const out: string[] = []
  for (let i = 0; i < buf.length; i++) {
    out.push(buf.getLine(i)?.translateToString(true) ?? '')
  }
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

function writeTo(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, resolve))
}

/** Render a stream the way a client would, at its own width. */
async function render(data: string, cols: number): Promise<string[]> {
  const term = new Terminal({ cols, rows: ROWS, scrollback: 5000, allowProposedApi: true })
  await writeTo(term, data)
  const lines = readLines(term)
  term.dispose()
  return lines
}

/** What the source terminal looks like once reflowed to the client's width. */
async function reflowed(data: string, from: number, to: number): Promise<string[]> {
  const term = new Terminal({ cols: from, rows: ROWS, scrollback: 5000, allowProposedApi: true })
  await writeTo(term, data)
  term.resize(to, ROWS)
  const lines = readLines(term)
  term.dispose()
  return lines
}

async function snapshotOf(data: string, from: number, to: number): Promise<string> {
  const mirror = new ScreenMirror(from, ROWS)
  mirror.write(data)
  const snap = await mirror.snapshot(to, ROWS)
  mirror.dispose()
  return snap
}

describe('ScreenMirror', () => {
  test('hands a narrow client the same grid the wide session reflows to', async () => {
    // Arrange — a paragraph long enough to wrap at 100 columns.
    const data = 'The tunnel above works the same way for someone else. '.repeat(6)

    // Act
    const snapshot = await snapshotOf(data, WIDE, NARROW)

    // Assert
    expect(await render(snapshot, NARROW)).toEqual(await reflowed(data, WIDE, NARROW))
  })

  test('keeps text that a raw replay would clamp to the right edge', async () => {
    // Arrange — absolute cursor addressing past a phone's width is what stacks
    // single characters down the right edge of the screen.
    const data = '\x1b[2J\x1b[H' + 'left margin' + '\x1b[1;61H' + 'FAR-RIGHT'

    // Act
    const viaMirror = await render(await snapshotOf(data, WIDE, NARROW), NARROW)
    const viaRawBytes = await render(data, NARROW)

    // Assert — the mirror matches the real reflow; replaying the bytes does not.
    expect(viaMirror).toEqual(await reflowed(data, WIDE, NARROW))
    expect(viaRawBytes).not.toEqual(viaMirror)
  })

  test('preserves scrollback written before the client connected', async () => {
    // Arrange
    const data = Array.from({ length: 60 }, (_, i) => `line ${i} of history`).join('\r\n')

    // Act
    const text = (await render(await snapshotOf(data, WIDE, NARROW), NARROW)).join('\n')

    // Assert — the first line is well above a 24-row screen.
    expect(text).toContain('line 0 of history')
    expect(text).toContain('line 59 of history')
  })

  test('serialises writes, so a snapshot never races the data before it', async () => {
    // Arrange
    const mirror = new ScreenMirror(WIDE, ROWS)

    // Act — no awaiting between writes, exactly as the pty data handler does.
    mirror.write('first\r\n')
    mirror.write('second\r\n')
    mirror.write('third')
    const snapshot = await mirror.snapshot(NARROW, ROWS)
    mirror.dispose()

    // Assert
    const text = (await render(snapshot, NARROW)).join('\n')
    expect(text).toContain('first')
    expect(text).toContain('second')
    expect(text).toContain('third')
  })

  test('is a no-op when asked to resize to the size it already has', async () => {
    // Arrange
    const mirror = new ScreenMirror(NARROW, ROWS)
    mirror.write('kept')

    // Act
    mirror.resize(NARROW, ROWS)
    const snapshot = await mirror.snapshot(NARROW, ROWS)
    mirror.dispose()

    // Assert
    expect((await render(snapshot, NARROW)).join('\n')).toContain('kept')
  })
})
