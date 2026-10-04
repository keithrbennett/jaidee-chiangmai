import { Fragment, type ReactNode } from 'react'

/**
 * The little markdown น้องใจดี writes: paragraphs, "- " bullets, "1. " lists, **bold**, [links](https://…),
 * bare https links, and hotline numbers turned into tap-to-call. Built as React nodes, never as HTML.
 */
const HOTLINES = '1784|1669|191|199|1300|1460|1182|1860|1362|1129|1130|1323|1422|1155'
const INLINE = new RegExp(`(\\*\\*[^*]+\\*\\*|\\[[^\\]]+\\]\\(https?:\\/\\/[^)\\s]+\\)|https?:\\/\\/[^\\s)]+|\\b(?:${HOTLINES})\\b)`, 'g')

function inline(text: string, key = ''): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}${i}`
    if (!part) return null
    if (part.startsWith('**') && part.endsWith('**')) return <b key={k}>{inline(part.slice(2, -2), `${k}b`)}</b>
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
    if (link) return <a key={k} href={link[2]} target="_blank" rel="noreferrer" className="font-semibold text-link underline-offset-2 hover:underline">{link[1]}</a>
    if (/^https?:\/\//.test(part)) return <a key={k} href={part} target="_blank" rel="noreferrer" className="break-all font-semibold text-link">{part.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>
    if (new RegExp(`^(?:${HOTLINES})$`).test(part)) return <a key={k} href={`tel:${part}`} className="font-semibold text-link">{part}</a>
    return <Fragment key={k}>{part}</Fragment>
  })
}

export function Rich({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/)
  return (
    <>
      {blocks.map((block, b) => {
        const lines = block.split('\n').filter((l) => l.trim())
        const bullet = (l: string) => /^\s*([-•*]|\d+[.)])\s+/.test(l)
        if (lines.length && lines.every(bullet)) {
          const ordered = /^\s*\d/.test(lines[0])
          const items = lines.map((l, i) => <li key={i}>{inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ''), `${b}-${i}-`)}</li>)
          return ordered ? (
            <ol key={b} className="my-1.5 list-decimal space-y-1 pl-5">{items}</ol>
          ) : (
            <ul key={b} className="my-1.5 list-disc space-y-1 pl-5 marker:text-faint">{items}</ul>
          )
        }
        // A lead-in line followed by bullets.
        const firstBullet = lines.findIndex(bullet)
        if (firstBullet > 0 && lines.slice(firstBullet).every(bullet)) {
          return (
            <div key={b} className="my-1.5">
              <p>{inline(lines.slice(0, firstBullet).join(' '), `${b}p`)}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 marker:text-faint">
                {lines.slice(firstBullet).map((l, i) => (
                  <li key={i}>{inline(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ''), `${b}-${i}-`)}</li>
                ))}
              </ul>
            </div>
          )
        }
        return (
          <p key={b} className="my-1.5 first:mt-0 last:mb-0">
            {lines.map((l, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {inline(l, `${b}-${i}-`)}
              </Fragment>
            ))}
          </p>
        )
      })}
    </>
  )
}
