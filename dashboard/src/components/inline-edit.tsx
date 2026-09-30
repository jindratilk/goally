import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Text input that saves on Enter or blur and cancels on Escape. */
export function InlineEdit({ value, onSave, onDone, className }: { value: string; onSave: (v: string) => void; onDone: () => void; className?: string }) {
  const [text, setText] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  const finished = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (save: boolean) => {
    if (finished.current) return
    finished.current = true
    const next = text.trim()
    if (save && next && next !== value) onSave(next)
    onDone()
  }
  return (
    <input
      ref={ref}
      value={text}
      maxLength={120}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn('h-7 min-w-0 rounded-md border border-ring/60 bg-card px-2 text-sm outline-none ring-3 ring-ring/20', className)}
    />
  )
}
