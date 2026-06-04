import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface Props {
  content: string
}

/**
 * Rendered, read-only view of a markdown document — used as the default mode for
 * READMEs and other `.md` files, with a toggle back to the raw CodeMirror editor.
 * Raw HTML in the source is NOT rendered (react-markdown escapes it), so opening
 * an untrusted repo's markdown can't execute scripts in the renderer.
 */
export function MarkdownPreview({ content }: Props) {
  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-6 text-[14px] leading-relaxed text-foreground/85 select-text [word-break:break-word]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  )
}

function openExternal(e: React.MouseEvent, href?: string): void {
  if (!href) return
  if (/^https?:\/\//i.test(href)) {
    e.preventDefault()
    void window.api.system.openExternal(href)
  }
}

const COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="mt-6 mb-3 border-b border-foreground/10 pb-2 text-[24px] font-semibold text-foreground first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-6 mb-3 border-b border-foreground/10 pb-1.5 text-[19px] font-semibold text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-5 mb-2 text-[16px] font-semibold text-foreground">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-4 mb-2 text-[14px] font-semibold text-foreground">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mt-4 mb-2 text-[13px] font-semibold text-foreground/90">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mt-4 mb-2 text-[12px] font-semibold uppercase tracking-wide text-foreground/60">
      {children}
    </h6>
  ),
  p: ({ children }) => <p className="my-3">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      onClick={(e) => openExternal(e, href)}
      className="text-sky-400 hover:underline"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => <ul className="my-3 list-disc pl-6 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal pl-6 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="marker:text-foreground/40">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="my-3 border-l-2 border-foreground/25 pl-4 text-foreground/65">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-5 border-foreground/10" />,
  img: ({ src, alt }) => (
    <img src={typeof src === 'string' ? src : undefined} alt={alt} className="my-3 max-w-full rounded-md" />
  ),
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-foreground/15 bg-foreground/5 px-3 py-1.5 text-left font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-foreground/15 px-3 py-1.5 align-top">{children}</td>
  ),
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-foreground/10 bg-foreground/[0.06] p-3 text-[12.5px] leading-relaxed font-mono">
      {children}
    </pre>
  ),
  code: ({ className, children }) => {
    const text = String(children ?? '')
    const isBlock = /language-/.test(className ?? '') || text.includes('\n')
    if (isBlock) return <code className={className}>{children}</code>
    return (
      <code className="rounded bg-foreground/10 px-1.5 py-0.5 text-[12.5px] font-mono">
        {children}
      </code>
    )
  },
}
