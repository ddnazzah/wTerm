import { useEffect } from 'react'
import { useSettings, DEFAULTS } from '@renderer/state/settings'
import { THEMES, useTheme } from '@renderer/lib/theme'

interface Props {
  open: boolean
  onClose: () => void
}

export function SettingsModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden
      />
      <div
        role="dialog"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[82vh] overflow-y-auto rounded-2xl border border-foreground/15 bg-background shadow-2xl"
      >
        <header className="flex items-center justify-between px-8 py-5 border-b border-accent/14">
          <h2 className="text-lg font-semibold text-foreground tracking-tight">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex items-center justify-center w-8 h-8 rounded-md text-foreground/55 hover:text-foreground hover:bg-foreground/10"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="px-8 py-7 space-y-10">
          <ThemeSection />
          <EditorSection />
          <FormattingSection />
        </div>
      </div>
    </div>
  )
}

function ThemeSection() {
  const { theme, setTheme } = useTheme()
  return (
    <Section title="Theme">
      <SelectField
        label="Color theme"
        value={theme}
        onChange={(v) => setTheme(v as (typeof THEMES)[number]['id'])}
        options={THEMES.map((t) => ({ value: t.id, label: t.label }))}
      />
    </Section>
  )
}

function EditorSection() {
  const settings = useSettings((s) => s.editor)
  const update = useSettings((s) => s.updateEditor)
  const reset = useSettings((s) => s.resetEditor)

  return (
    <Section title="Editor" actionLabel="Reset" onAction={reset}>
      <NumberField
        label="Font size"
        value={settings.fontSize}
        min={9}
        max={28}
        step={1}
        unit="px"
        onChange={(v) => update({ fontSize: v })}
      />
      <TextField
        label="Font family"
        value={settings.fontFamily}
        placeholder={DEFAULTS.fontFamily}
        onChange={(v) => update({ fontFamily: v || DEFAULTS.fontFamily })}
      />
      <NumberField
        label="Tab size"
        value={settings.tabSize}
        min={1}
        max={8}
        step={1}
        onChange={(v) => update({ tabSize: v })}
      />
      <BoolField
        label="Insert spaces"
        value={settings.insertSpaces}
        onChange={(v) => update({ insertSpaces: v })}
      />
      <BoolField
        label="Word wrap"
        value={settings.wordWrap}
        onChange={(v) => update({ wordWrap: v })}
      />
      <BoolField
        label="Line numbers"
        value={settings.lineNumbers}
        onChange={(v) => update({ lineNumbers: v })}
      />
    </Section>
  )
}

function FormattingSection() {
  const formatOnSave = useSettings((s) => s.editor.formatOnSave)
  const update = useSettings((s) => s.updateEditor)
  return (
    <Section title="Formatting">
      <BoolField
        label="Format on save"
        value={formatOnSave}
        onChange={(v: boolean) => update({ formatOnSave: v })}
      />
      <p className="text-[12px] leading-relaxed text-foreground/55">
        Uses Prettier for JavaScript, TypeScript, JSON, CSS, HTML, Markdown, and YAML. Use{' '}
        <kbd className="px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/80 text-[11px]">⌘⇧F</kbd> to
        format the active file on demand.
      </p>
    </Section>
  )
}

// ---- primitives ----

function Section({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string
  children: React.ReactNode
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] uppercase tracking-[0.12em] text-foreground/50 font-semibold">
          {title}
        </h3>
        {actionLabel && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="text-[11px] text-foreground/50 hover:text-foreground"
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[13px] text-foreground/80 flex-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)))
        }}
        className="w-24 bg-foreground/5 text-[13px] px-2.5 py-1.5 rounded-md outline-none focus:bg-foreground/10 text-right tabular-nums"
      />
      {unit && <span className="text-[12px] text-foreground/45 w-6">{unit}</span>}
    </div>
  )
}

function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-[13px] text-foreground/80">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-foreground/5 text-[13px] px-2.5 py-1.5 rounded-md outline-none focus:bg-foreground/10 font-mono"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[13px] text-foreground/80 flex-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none bg-foreground/5 text-[13px] pl-3 pr-8 py-1.5 rounded-md outline-none focus:bg-foreground/10 hover:bg-foreground/10 transition-colors cursor-pointer min-w-[160px]"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-foreground/55"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </div>
  )
}

function BoolField({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-[13px] text-foreground/80">{label}</span>
      <span
        role="switch"
        aria-checked={value}
        tabIndex={0}
        onClick={() => onChange(!value)}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            onChange(!value)
          }
        }}
        className={[
          'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
          value ? 'bg-foreground/80' : 'bg-foreground/15',
        ].join(' ')}
      >
        <span
          className={[
            'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-background transition-transform',
            value ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
    </label>
  )
}
