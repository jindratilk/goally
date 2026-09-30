import { Clock } from 'lucide-react'
import type { Mission } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** The Goal Director's latest estimate counted down since it was made; before its first check, the pace so far. */
export function etaMs(m: Mission, now: number) {
  const { done, total } = m.verdict
  if (total === 0 || done >= total) return 0
  if (m.eta) return Math.max(60000, m.eta.minutes * 60000 - (now - m.eta.at))
  if (done === 0) return null
  return (((m.endedAt ?? now) - m.startedAt) / done) * (total - done)
}

function humanEta(ms: number | null) {
  if (ms === null) return 'Estimating…'
  if (ms === 0) return 'Done'
  const min = Math.max(1, Math.round(ms / 60000))
  if (min < 60) return `~${min} min left`
  const h = Math.floor(min / 60)
  return `~${h} h ${min % 60} min left`
}

export function GoalProgress({ mission, now }: { mission: Mission; now: number }) {
  const { done, total } = mission.verdict
  const ratio = total ? done / total : 0
  const complete = total > 0 && done >= total
  const remaining = Math.round((1 - ratio) * 100)
  const r = 9
  const c = 2 * Math.PI * r
  return (
    <TooltipProvider>
      <div className="flex shrink-0 items-center gap-2.5">
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-default rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${remaining}% remaining`} />}>
            <svg viewBox="0 0 24 24" className="size-6 -rotate-90">
              <circle cx="12" cy="12" r={r} fill="none" stroke="var(--input)" strokeWidth="3" />
              <circle
                cx="12"
                cy="12"
                r={r}
                fill="none"
                stroke={complete ? 'var(--success)' : 'var(--foreground)'}
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - ratio)}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {complete ? 'Goal reached' : `${remaining}% remaining`} · {done} of {total} tasks launched
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<span tabIndex={0} className={cn('hidden cursor-default items-center gap-1.5 rounded-md text-sm tabnum outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex', complete ? 'text-success' : 'text-muted-foreground')} />}>
            <Clock className="size-3.5" />
            {humanEta(etaMs(mission, now))}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-72">
            {complete ? 'Every task is proven' : mission.eta ? `Goal Director estimate · ${mission.eta.reason || 'from pace and remaining work'}` : 'From the pace so far, until the Goal Director weighs in'}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
