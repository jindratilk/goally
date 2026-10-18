import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { DIRECTOR_LABELS, post, type Config, type DirectorProvider, type Overview } from '@/lib/api'
import { useTheme, type Theme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Segmented } from './shared'

function Field({ label, hint, children, wide }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'flex flex-col gap-3 py-4' : 'flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6'}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className={wide ? '' : 'shrink-0'}>{children}</div>
    </div>
  )
}

function Range({ label, value, min, max, unit, onCommit, disabled }: { label: string; value: number; min: number; max: number; unit?: string; onCommit: (v: number) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div className="flex w-full items-center gap-3 sm:w-64">
      <Slider aria-label={label} className="flex-1" min={min} max={max} value={v} disabled={disabled} onValueChange={(x) => setV(Array.isArray(x) ? x[0] : x)} onValueCommitted={(x) => onCommit(Array.isArray(x) ? x[0] : x)} />
      <span className="w-14 text-right text-sm font-medium tabnum">
        {v}
        {unit && <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>}
      </span>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="divide-y">{children}</CardContent>
    </Card>
  )
}

export function SettingsView({ overview, onSaved }: { overview: Overview; onSaved: () => void | Promise<void> }) {
  const cfg = overview.config
  const [saving, setSaving] = useState(false)
  const { theme, setTheme } = useTheme()
  const ro = overview.remote || saving
  const provider = cfg.supervisor.provider || 'grok'
  const label = DIRECTOR_LABELS[provider]
  const selected = overview.supervisor.providers?.find((p) => p.provider === provider)
  const save = async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      await post<{ config: Config }>('/api/settings', patch)
      toast.success('Saved')
      await onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Section title="Appearance" description="Choose how Goally looks on this device.">
        <div role="group" aria-label="Color theme" className="grid grid-cols-3 gap-2 py-4 sm:gap-3">
          {([{ value: 'system', label: 'System', icon: Monitor }, { value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }] as const).map((option) => (
            <button key={option.value} aria-pressed={theme === option.value} onClick={() => setTheme(option.value as Theme)} className={cn('group rounded-lg border p-1.5 text-left transition-colors sm:p-2', theme === option.value ? 'border-foreground/60 bg-foreground/5' : 'border-border hover:border-foreground/30 hover:bg-muted/50')}>
              <div aria-hidden="true" className="appearance-preview flex h-16 overflow-hidden rounded-md border border-foreground/10 sm:h-20" data-appearance={option.value}>
                <div className="w-1/4 border-r border-[var(--preview-line)] bg-[var(--preview-sidebar)] p-2">
                  <div className="mb-2 h-1 w-3 rounded-full bg-[var(--preview-ink)]" />
                  <div className="h-1 rounded-full bg-[var(--preview-line)]" />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  <div className="h-1 w-1/2 rounded-full bg-[var(--preview-ink)]" />
                  <div className="flex flex-1 gap-1.5">
                    <div className="flex-1 rounded-sm border border-[var(--preview-line)] bg-[var(--preview-card)]" />
                    <div className="flex-1 rounded-sm border border-[var(--preview-line)] bg-[var(--preview-card)]" />
                  </div>
                </div>
              </div>
              <span className="flex items-center gap-1.5 px-0.5 pt-2 pb-0.5 text-xs font-medium sm:px-1">
                <option.icon className="size-3.5 text-muted-foreground" />{option.label}
                {theme === option.value && <Check className="ml-auto size-3.5" />}
              </span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Agents" description="Hooks enforce these on the next event.">
        <Field label="Max parallel agents" hint="Extra launches are denied until a slot frees up.">
          <Range label="Max parallel agents" value={cfg.maxParallelAgents} min={1} max={12} disabled={ro} onCommit={(v) => save({ maxParallelAgents: v })} />
        </Field>
      </Section>

      <Section title="Goal Director" description="An independent reviewer that checks the plan, progress and proof.">
        <Field label="Provider" hint="Changes apply to the next check. Switching providers resets the model to its default." wide>
          <div role="group" aria-label="Goal Director provider" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.entries(DIRECTOR_LABELS) as [DirectorProvider, string][]).map(([value, name]) => {
              const found = overview.supervisor.providers?.find((p) => p.provider === value)?.available
              return <button key={value} disabled={ro} aria-pressed={provider === value} onClick={() => provider !== value && save({ supervisor: { provider: value } })} className={cn('flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50', provider === value ? 'border-foreground/60 bg-foreground/5' : 'border-border hover:border-foreground/30 hover:bg-muted/50')}>
                <span className="flex w-full items-center gap-2 text-sm font-medium">{name}{provider === value && <Check className="ml-auto size-3.5" />}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={cn('size-1.5 rounded-full', found ? 'bg-success' : 'bg-subtle')} />{found ? 'CLI found' : 'Not available'}</span>
              </button>
            })}
          </div>
          <p className={cn('mt-3 break-words text-xs', selected?.available ? 'text-muted-foreground' : 'text-warning')}>
            {selected?.available ? `${label} is installed. Uses your CLI sign-in.` : selected?.setup || `Install ${label} to run checks.`}
          </p>
        </Field>
        <Field label="Enabled">
          <Switch aria-label="Enable Goal Director" checked={cfg.supervisor.enabled} disabled={ro} onCheckedChange={(v) => save({ supervisor: { enabled: v } })} />
        </Field>
        <Field label="Review interval" hint={`${label} reads the board and code, and reports only when something needs attention.`}>
          <Range label="Review interval" value={cfg.supervisor.intervalMin} min={2} max={60} unit="min" disabled={ro} onCommit={(v) => save({ supervisor: { intervalMin: v } })} />
        </Field>
        <Field label="Also check when a task finishes">
          <Switch aria-label="Also check when a task finishes" checked={cfg.supervisor.triggerOnAgentStop} disabled={ro} onCheckedChange={(v) => save({ supervisor: { triggerOnAgentStop: v } })} />
        </Field>
        <Field label="Intervention" hint="On: Goal Director writes into the main chat. Off: findings only appear on the board.">
          <Switch aria-label="Intervention" checked={cfg.intervention === 'message'} disabled={ro} onCheckedChange={(v) => save({ intervention: v ? 'message' : 'observe' })} />
        </Field>
        <Field label="Reasoning effort">
          <Segmented label="Reasoning effort" value={(cfg.supervisor.effort || 'medium') as 'low' | 'medium' | 'high'} disabled={ro} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} onChange={(v) => save({ supervisor: { effort: v } })} />
        </Field>
        <Field label="Model" hint={`Leave empty to use your ${label} default.`}>
          <Input aria-label="Goal Director model" key={`${provider}:${cfg.supervisor.model}`} defaultValue={cfg.supervisor.model} disabled={ro} placeholder="default" onBlur={(e) => !ro && e.target.value.trim() !== cfg.supervisor.model && save({ supervisor: { model: e.target.value.trim() } })} className="h-8 w-full font-mono text-xs sm:w-56" />
        </Field>
      </Section>

      <Section title="Delivery to main chat">
        <Field label="Desktop Bridge" hint={overview.bridge.available ? `Connected · ${overview.bridge.threads} threads visible` : overview.bridge.reason}>
          <Segmented label="Desktop Bridge" value={cfg.delivery.bridge} disabled={ro} options={[{ value: 'auto', label: 'Auto' }, { value: 'off', label: 'Hooks only' }]} onChange={(v) => save({ delivery: { bridge: v } })} />
        </Field>
        <Field label="Interrupt on high severity" hint={`Sends with --force, at most once every ${cfg.delivery.forceCooldownMin} min.`}>
          <Switch aria-label="Interrupt on high severity" checked={cfg.delivery.forceOnHigh} disabled={ro} onCheckedChange={(v) => save({ delivery: { forceOnHigh: v } })} />
        </Field>
      </Section>
    </div>
  )
}
