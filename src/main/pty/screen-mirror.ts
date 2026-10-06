import { Terminal } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'

/**
 * A headless copy of what a PTY has drawn, kept so a client can be handed a
 * snapshot authored for *its* width.
 *
 * The raw byte log cannot do this. Those bytes encode the geometry of the
 * terminal that produced them — hard wraps at the old column count, and
 * absolute cursor moves to columns a narrower client does not have, which clamp
 * to its last column and stack characters down the right edge. Replaying them
 * into a phone shreds everything written before the phone connected.
 *
 * Holding the cells instead makes the width a rendering decision rather than
 * something baked into history: resize this terminal and xterm reflows the
 * buffer properly, then the serializer emits a stream that reproduces that
 * grid. It is the same trick a multiplexer uses to show one session on two
 * screens.
 */

/** Scrollback kept per session, matching the renderer's own terminal. */
const SCROLLBACK = 5000

export class ScreenMirror {
  private readonly term: Terminal
  private readonly serializer: SerializeAddon
  /**
   * xterm parses writes asynchronously, so a snapshot taken right after a write
   * can miss it. Chaining keeps order and gives `snapshot` something to await.
   */
  private drained: Promise<void> = Promise.resolve()

  constructor(cols: number, rows: number) {
    this.term = new Terminal({ cols, rows, scrollback: SCROLLBACK, allowProposedApi: true })
    this.serializer = new SerializeAddon()
    this.term.loadAddon(this.serializer)
  }

  write(data: string): void {
    this.drained = this.drained.then(
      () =>
        new Promise<void>((resolve) => {
          this.term.write(data, resolve)
        })
    )
  }

  /** Follow the PTY, so the mirror always holds what the program actually drew. */
  resize(cols: number, rows: number): void {
    if (cols === this.term.cols && rows === this.term.rows) return
    this.term.resize(Math.max(1, Math.floor(cols)), Math.max(1, Math.floor(rows)))
  }

  /**
   * A stream that reproduces this screen at `cols` x `rows`.
   *
   * Resizing before serializing is the whole point: xterm rewraps its own
   * buffer, so the client receives history already laid out for its width.
   */
  async snapshot(cols: number, rows: number): Promise<string> {
    await this.drained
    this.resize(cols, rows)
    return this.serializer.serialize({ scrollback: SCROLLBACK })
  }

  dispose(): void {
    this.serializer.dispose()
    this.term.dispose()
  }
}
