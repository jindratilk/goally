import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Panel({
  code,
  title,
  aside,
  children,
  className,
  bodyClassName,
}: {
  code?: string
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('frame flex min-w-0 flex-col', className)}>
      <header className="flex items-center gap-3 border-b border-line-2 px-4 py-3 sm:px-5">
        {code && <span className="mono text-[10px] text-bp-ink/70">{code}</span>}
        <h2 className="label text-ink">{title}</h2>
        <div className="ml-auto flex items-center gap-2">{aside}</div>
      </header>
      <div className={cn('min-w-0 flex-1 p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

export function Note({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('hand text-[15px] leading-tight', className)}>{children}</span>
}

export function Dim({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="dim-h flex-1" />
      <span className="mono text-[10px] tracking-wider text-bp-ink/80">{label}</span>
      <div className="dim-h flex-1" />
    </div>
  )
}

export function Arrow({ className, d = 'M4 30 C 30 4, 60 4, 86 20' }: { className?: string; d?: string }) {
  return (
    <svg viewBox="0 0 90 36" className={cn('overflow-visible text-bp-ink/80', className)} fill="none" aria-hidden>
      <defs>
        <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </marker>
      </defs>
      <path d={d} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" markerEnd="url(#ah)" />
    </svg>
  )
}

const TONE: Record<string, string> = {
  go: 'text-go border-go/50',
  nogo: 'text-nogo border-nogo/50',
  warn: 'text-warn border-warn/50',
  info: 'text-bp-ink border-bp-ink/40',
  mute: 'text-ink-2 border-line',
  ink: 'text-ink border-ink/60',
}

export function Tag({ tone = 'mute', children, className }: { tone?: keyof typeof TONE; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-[3px] border px-1.5 text-[10px] font-bold uppercase leading-none tracking-[0.16em]', TONE[tone], className)}>
      {children}
    </span>
  )
}

export function Dot({ tone = 'mute', pulse }: { tone?: 'go' | 'nogo' | 'warn' | 'info' | 'mute' | 'ink'; pulse?: boolean }) {
  const c = { go: 'bg-go text-go', nogo: 'bg-nogo text-nogo', warn: 'bg-warn text-warn', info: 'bg-bp-ink text-bp-ink', mute: 'bg-ink-3 text-ink-3', ink: 'bg-ink text-ink' }[tone]
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', c, pulse && 'pulse-dot')} />
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'go' | 'nogo' | 'warn' }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 px-4 py-4 sm:px-5">
      <span className="label label-sm truncate">{label}</span>
      <span className={cn('display tabnum text-[28px] sm:text-[34px]', tone === 'go' && 'text-go', tone === 'nogo' && 'text-nogo', tone === 'warn' && 'text-warn')}>{value}</span>
      {sub && <span className="truncate text-[12px] text-ink-3">{sub}</span>}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="hatch flex min-h-20 items-center justify-center rounded-[3px] border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink-3">{children}</div>
}
