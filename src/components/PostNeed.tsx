import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { href } from '../lib/router'
import { Icon } from './Icon'
import { BackLink, Button, ScreenTitle } from './ui'

/*
 * Demo only: "Submit" does not send anything yet (no API keys in the demo).
 * It shows a "Submitted" dialog; the real flow will hand the text to a partner for checking.
 */
export function PostNeed() {
  const { m } = useI18n()
  const [text, setText] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const dialogRef = useRef<HTMLDialogElement>(null)

  // A native modal <dialog>: focus is trapped inside it and Escape closes it.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (submitted && !dialog.open) dialog.showModal()
    if (!submitted && dialog.open) dialog.close()
  }, [submitted])

  function startOver() {
    setText('')
    setSubmitted(false)
  }

  return (
    <div className="flex flex-col gap-5 p-6">
      <BackLink href={href({ name: 'home' })}>{m.backHome}</BackLink>
      <ScreenTitle sub={m.post.intro}>{m.post.title}</ScreenTitle>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={7}
        placeholder={m.post.placeholder}
        aria-label={m.post.title}
        className="rounded-[14px] border border-line bg-card p-4 text-[17px] placeholder:text-faint focus:border-go focus:outline-none focus:ring-2 focus:ring-go/30"
      />
      <Button variant="secondary" onClick={() => setText(m.post.sample)} className="self-start">
        {m.post.useSample}
      </Button>
      <Button main variant="ask" icon="check" onClick={() => setSubmitted(true)} disabled={text.trim().length === 0}>
        {m.post.submit}
      </Button>

      <dialog
        ref={dialogRef}
        onClose={startOver}
        aria-labelledby="post-submitted-title"
        className="m-auto w-[min(92vw,440px)] rounded-[18px] bg-card p-6 text-ink backdrop:bg-black/40"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-go-soft text-go">
            <Icon name="check" size={30} />
          </span>
          <h3 id="post-submitted-title" className="text-[26px] font-bold">
            {m.post.submittedTitle}
          </h3>
          <p className="text-[17px] text-muted">{m.post.submittedBody}</p>
          <div className="mt-2 flex w-full flex-col gap-3">
            <Button main href={href({ name: 'home' })}>
              {m.post.done}
            </Button>
            <Button variant="secondary" onClick={startOver}>
              {m.post.postAnother}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  )
}
