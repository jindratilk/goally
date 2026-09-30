import QRCode from 'qrcode'
import { Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { post, type Config, type Overview, type TunnelInfo } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Dot, Segmented } from './shared'

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

function RemoteAccess({ tunnel, readOnly }: { tunnel: TunnelInfo; readOnly: boolean }) {
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (tunnel.phoneUrl && canvas.current) QRCode.toCanvas(canvas.current, tunnel.phoneUrl, { width: 168, margin: 1, color: { dark: '#26251e', light: '#ffffff' } })
  }, [tunnel.phoneUrl, tunnel.status])
  const act = async (action: 'start' | 'stop' | 'rotate') => {
    setBusy(true)
    try {
      const r = await post<TunnelInfo>('/api/tunnel', { action })
      if (action === 'start') r.status === 'up' ? toast.success('Tunnel up', { description: r.hostname ?? '' }) : toast.error(r.error || 'Tunnel did not come up')
      if (action === 'rotate') toast.success('New private link', { description: 'Old phone links stop working' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  if (readOnly) return <p className="py-4 text-sm text-muted-foreground">You are viewing through the phone link. Manage it from your Mac.</p>
  const up = tunnel.status === 'up' || tunnel.status === 'starting'
  return (
    <div className="flex flex-col gap-4 py-4">
      <div className="flex items-center gap-3">
        <Dot tone={tunnel.status === 'up' ? 'success' : tunnel.status === 'starting' ? 'warning' : tunnel.status === 'error' ? 'danger' : 'neutral'} pulse={tunnel.status === 'starting'} />
        <span className="min-w-0 flex-1 truncate text-sm">
          {tunnel.status === 'up' ? tunnel.hostname : tunnel.status === 'starting' ? 'Opening tunnel…' : tunnel.status === 'error' ? tunnel.error : 'Off, only this Mac can see the board'}
        </span>
        <Button size="sm" variant={up ? 'outline' : 'default'} disabled={busy} onClick={() => act(up ? 'stop' : 'start')}>
          {busy ? <Loader2 className="animate-spin" /> : !up && <Smartphone />}
          {up ? 'Stop' : 'Start'}
        </Button>
      </div>
      {tunnel.status === 'up' && tunnel.phoneUrl && (
        <div className="flex flex-col items-center gap-4 rounded-lg bg-muted p-4 sm:flex-row sm:items-start">
          <canvas ref={canvas} className="rounded-md" />
          <div className="flex min-w-0 flex-col gap-3">
            <div className="text-sm font-medium">Scan with your phone</div>
            <code className="block font-mono text-xs break-all text-muted-foreground">{tunnel.phoneUrl}</code>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(tunnel.phoneUrl!)
                  toast.success('Private link copied')
                }}
              >
                <Copy /> Copy
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => act('rotate')}>
                <RefreshCw /> New key
              </Button>
            </div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Free trycloudflare.com tunnel, no account needed. The phone view is read-only and the address changes when the tunnel restarts.</p>
    </div>
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
        <Field label="Check interval">
          <Range value={cfg.supervisor.intervalMin} min={2} max={60} unit="min" disabled={ro} onCommit={(v) => save({ supervisor: { intervalMin: v } })} />
        </Field>
        <Field label="Also check when an agent finishes">
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

      <Section title="Phone access" description="Watch the board from anywhere through Cloudflare.">
        <RemoteAccess tunnel={overview.tunnel} readOnly={ro} />
      </Section>
    </div>
  )
}
