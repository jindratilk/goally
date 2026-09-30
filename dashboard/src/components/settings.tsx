import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { post, type Config, type Overview } from '@/lib/api'
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

function Range({ value, min, max, unit, onCommit, disabled }: { value: number; min: number; max: number; unit?: string; onCommit: (v: number) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div className="flex w-full items-center gap-3 sm:w-64">
      <Slider className="flex-1" min={min} max={max} value={v} disabled={disabled} onValueChange={(x) => setV(Array.isArray(x) ? x[0] : x)} onValueCommitted={(x) => onCommit(Array.isArray(x) ? x[0] : x)} />
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

export function SettingsView({ overview, onSaved }: { overview: Overview; onSaved: () => void }) {
  const cfg = overview.config
  const ro = overview.remote
  const save = async (patch: Record<string, unknown>) => {
    try {
      await post<{ config: Config }>('/api/settings', patch)
      toast.success('Saved')
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Section title="Agents" description="Hooks enforce these on the next event.">
        <Field label="Max parallel agents" hint="Extra launches are denied until a slot frees up.">
          <Range value={cfg.maxParallelAgents} min={1} max={12} disabled={ro} onCommit={(v) => save({ maxParallelAgents: v })} />
        </Field>
      </Section>

      <Section title="Goal Director" description={overview.supervisor.available ? `Grok Build · ${overview.supervisor.bin}` : 'grok CLI not found. Install Grok Build and run grok login.'}>
        <Field label="Enabled">
          <Switch checked={cfg.supervisor.enabled} disabled={ro} onCheckedChange={(v) => save({ supervisor: { enabled: v } })} />
        </Field>
        <Field label="Deep research every" hint="Grok Build wakes up, reads the board and the code, and writes to the main chat only when something is off.">
          <Range value={cfg.supervisor.intervalMin} min={2} max={60} unit="min" disabled={ro} onCommit={(v) => save({ supervisor: { intervalMin: v } })} />
        </Field>
        <Field label="Also check when a task finishes">
          <Switch checked={cfg.supervisor.triggerOnAgentStop} disabled={ro} onCheckedChange={(v) => save({ supervisor: { triggerOnAgentStop: v } })} />
        </Field>
        <Field label="Intervention" hint="On: Goal Director writes into the main chat. Off: findings only appear on the board.">
          <Switch checked={cfg.intervention === 'message'} disabled={ro} onCheckedChange={(v) => save({ intervention: v ? 'message' : 'observe' })} />
        </Field>
        <Field label="Reasoning effort">
          <Segmented value={(cfg.supervisor.effort || 'medium') as 'low' | 'medium' | 'high'} disabled={ro} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} onChange={(v) => save({ supervisor: { effort: v } })} />
        </Field>
        <Field label="Model" hint="Empty uses your Grok Build default.">
          <Input key={cfg.supervisor.model} defaultValue={cfg.supervisor.model} disabled={ro} placeholder="default" onBlur={(e) => e.target.value.trim() !== cfg.supervisor.model && save({ supervisor: { model: e.target.value.trim() } })} className="h-8 w-full font-mono text-xs sm:w-56" />
        </Field>
      </Section>

      <Section title="Delivery to main chat">
        <Field label="Desktop Bridge" hint={overview.bridge.available ? `Connected · ${overview.bridge.threads} threads visible` : overview.bridge.reason}>
          <Segmented value={cfg.delivery.bridge} disabled={ro} options={[{ value: 'auto', label: 'Auto' }, { value: 'off', label: 'Hooks only' }]} onChange={(v) => save({ delivery: { bridge: v } })} />
        </Field>
        <Field label="Interrupt on high severity" hint={`Sends with --force, at most once every ${cfg.delivery.forceCooldownMin} min.`}>
          <Switch checked={cfg.delivery.forceOnHigh} disabled={ro} onCheckedChange={(v) => save({ delivery: { forceOnHigh: v } })} />
        </Field>
      </Section>
    </div>
  )
}
