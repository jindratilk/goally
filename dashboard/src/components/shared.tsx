import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { TaskStatus } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'active'

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  neutral: 'text-muted-foreground',
  active: 'text-foreground',
}
const TONE_BG: Record<Tone, string> = {
  success: 'bg-success/10 text-success',
  danger: 'bg-danger/10 text-danger',
  warning: 'bg-warning/10 text-warning',
  neutral: 'bg-muted text-muted-foreground',
  active: 'bg-foreground text-background',
}
const TONE_DOT: Record<Tone, string> = {
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  neutral: 'bg-subtle',
  active: 'bg-foreground',
}

export const TASK_META: Record<TaskStatus, { label: string; tone: Tone }> = {
  todo: { label: 'To-do', tone: 'neutral' },
  running: { label: 'In progress', tone: 'active' },
  review: { label: 'Testing', tone: 'warning' },
  blocked: { label: 'Blocked', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  done: { label: 'Launched', tone: 'success' },
}

export function Pill({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium', TONE_BG[tone], className)}>{children}</span>
}

export function Dot({ tone = 'neutral', pulse }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', TONE_DOT[tone])} />}
      <span className={cn('relative inline-flex size-2 rounded-full', TONE_DOT[tone])} />
    </span>
  )
}

export function TaskBadge({ status }: { status: TaskStatus }) {
  const m = TASK_META[status]
  return (
    <Pill tone={m.tone}>
      {status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-background" />}
      {m.label}
    </Pill>
  )
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Kpi({ icon: Icon, label, value, sub, tone, children }: { icon: LucideIcon; label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; children?: ReactNode }) {
  return (
    <Card size="sm" className="gap-2">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs font-medium">{label}</span>
        </div>
        <div className={cn('text-2xl font-semibold tracking-tight tabnum', tone && TONE_TEXT[tone])}>{value}</div>
        {children}
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center">
      <Icon className="size-5 text-subtle" />
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted-foreground">{children}</div>}
    </div>
  )
}

export function FadeIn({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ y: 6 }} animate={{ y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }} className={className}>
      {children}
    </motion.div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string; count?: number }[]
  onChange: (v: T) => void
  disabled?: boolean
}) {
  return (
    <div className="inline-flex h-8 max-w-full items-center overflow-x-auto rounded-lg bg-muted p-0.5 [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            'relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-50',
            value === o.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join('')}`} className="absolute inset-0 rounded-md bg-card shadow-sm ring-1 ring-foreground/10" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          <span className="relative">{o.label}</span>
          {o.count != null && <span className="relative text-[10px] text-subtle tabnum">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
