import QRCode from 'qrcode'
import { Copy, RefreshCw, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { Config, Overview, TunnelInfo } from '@/lib/api'
import { post } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Dot, Note } from './blueprint'

type Patch = Record<string, unknown>

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-line-2 py-4">
      <div className="flex items-center gap-3">
        <span className="label text-ink">{label}</span>
        <div className="ml-auto flex items-center gap-2">{children}</div>
      </div>
      {hint && <p className="text-[12px] leading-snug text-ink-3">{hint}</p>}
    </div>
  )
}

function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-[4px] border border-line p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn('rounded-[3px] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-40', value === o.value ? 'bg-ink text-black' : 'text-ink-2 hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Range({ value, min, max, step = 1, unit, onCommit, disabled }: { value: number; min: number; max: number; step?: number; unit?: string; onCommit: (v: number) => void; disabled?: boolean }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <div className="flex w-full items-center gap-4">
      <Slider
        className="flex-1 [&_[data-slot=slider-range]]:bg-ink [&_[data-slot=slider-thumb]]:rounded-[2px] [&_[data-slot=slider-thumb]]:border-ink [&_[data-slot=slider-track]]:bg-line"
        min={min}
        max={max}
        step={step}
        value={v}
        disabled={disabled}
        onValueChange={(x) => setV(Array.isArray(x) ? x[0] : x)}
        onValueCommitted={(x) => onCommit(Array.isArray(x) ? x[0] : x)}
      />
      <span className="display tabnum w-16 text-right text-[22px]">
        {v}
        {unit && <span className="ml-0.5 text-[11px] text-ink-3">{unit}</span>}
      </span>
    </div>
  )
}

function RemoteAccess({ tunnel, readOnly }: { tunnel: TunnelInfo; readOnly: boolean }) {
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (tunnel.phoneUrl && canvas.current) QRCode.toCanvas(canvas.current, tunnel.phoneUrl, { width: 184, margin: 1, color: { dark: '#000000', light: '#f0f0fa' } })
  }, [tunnel.phoneUrl])
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
  if (readOnly) return <p className="text-[13px] text-ink-2">You are viewing through the remote link. Manage it from your Mac.</p>
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Dot tone={tunnel.status === 'up' ? 'go' : tunnel.status === 'starting' ? 'warn' : tunnel.status === 'error' ? 'nogo' : 'mute'} pulse={tunnel.status === 'starting'} />
        <span className="text-[13px] text-ink-2">
          {tunnel.status === 'up' ? tunnel.hostname : tunnel.status === 'starting' ? 'Opening Cloudflare Quick Tunnel…' : tunnel.status === 'error' ? tunnel.error : 'Off · board is only on this Mac'}
        </span>
        <div className="ml-auto">
          {tunnel.status === 'up' || tunnel.status === 'starting' ? (
            <button className="btn-x sm danger" disabled={busy} onClick={() => act('stop')}>
              Stop
            </button>
          ) : (
            <button className="btn-x sm solid" disabled={busy} onClick={() => act('start')}>
              <Smartphone className="size-3" /> {busy ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>
      </div>
      {tunnel.status === 'up' && tunnel.phoneUrl && (
        <div className="flex flex-col items-center gap-4 rounded-[4px] border border-line p-4 sm:flex-row sm:items-start">
          <canvas ref={canvas} className="rounded-[3px]" />
          <div className="flex min-w-0 flex-col gap-3">
            <Note>scan with your phone — read-only board</Note>
            <code className="mono block break-all text-[11px] text-ink-2">{tunnel.phoneUrl}</code>
            <div className="flex gap-2">
              <button
                className="btn-x sm"
                onClick={() => {
                  navigator.clipboard.writeText(tunnel.phoneUrl!)
                  toast.success('Private link copied')
                }}
              >
                <Copy className="size-3" /> Copy
              </button>
              <button className="btn-x sm" disabled={busy} onClick={() => act('rotate')}>
                <RefreshCw className="size-3" /> New key
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-[12px] leading-snug text-ink-3">Free trycloudflare.com tunnel, no account. The link carries a private key; the phone view is read-only and the URL changes when the tunnel restarts.</p>
    </div>
  )
}

export function SettingsSheet({ open, onOpenChange, overview, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; overview: Overview; onSaved: () => void }) {
  const cfg = overview.config
  const readOnly = overview.remote
  const save = async (patch: Patch) => {
    try {
      await post<{ config: Config }>('/api/settings', patch)
      onSaved()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full border-line bg-black/95 p-0 sm:max-w-[500px]">
        <div className="thin-scroll flex h-full flex-col overflow-y-auto">
          <SheetHeader className="border-b border-line-2 p-5 pr-12">
            <SheetTitle className="display text-[26px]">Flight rules</SheetTitle>
            <SheetDescription className="text-ink-3">{readOnly ? 'Read-only over remote access.' : 'Saved instantly. Hooks and the director pick changes up on the next event.'}</SheetDescription>
          </SheetHeader>
          <div className="px-5 pb-10">
            <h3 className="label mt-6 text-bp-ink">Agents</h3>
            <Field label="Max parallel agents" hint="Extra subagent launches are denied until a slot frees up.">
              <span />
            </Field>
            <div className="-mt-2 border-b border-line-2 pb-4">
              <Range value={cfg.maxParallelAgents} min={1} max={12} disabled={readOnly} onCommit={(v) => save({ maxParallelAgents: v })} />
            </div>
            <Field label="Full builds" hint="What happens when an agent runs npm run build, xcodebuild and friends.">
              <Segmented
                value={cfg.fullBuild.policy}
                disabled={readOnly}
                options={[
                  { value: 'allow', label: 'Allow' },
                  { value: 'warn', label: 'Warn' },
                  { value: 'block', label: 'Block' },
                ]}
                onChange={(v) => save({ fullBuild: { policy: v } })}
              />
            </Field>
            <Field label="Stop loop limit" hint="How many times the manager gets sent back to work when it stops with a NO-GO poll.">
              <span />
            </Field>
            <div className="-mt-2 border-b border-line-2 pb-4">
              <Range value={cfg.stopLoopLimit} min={0} max={10} disabled={readOnly} onCommit={(v) => save({ stopLoopLimit: v })} />
            </div>

            <h3 className="label mt-8 text-bp-ink">Flight Director · Grok Build</h3>
            <Field label="Enabled" hint={overview.supervisor.available ? `Using ${overview.supervisor.bin}` : 'grok CLI not found. Install Grok Build and run grok login.'}>
              <Switch checked={cfg.supervisor.enabled} disabled={readOnly} onCheckedChange={(v) => save({ supervisor: { enabled: v } })} />
            </Field>
            <Field label="Check interval">
              <span />
            </Field>
            <div className="-mt-2 border-b border-line-2 pb-4">
              <Range value={cfg.supervisor.intervalMin} min={2} max={60} unit="min" disabled={readOnly} onCommit={(v) => save({ supervisor: { intervalMin: v } })} />
            </div>
            <Field label="Also check when an agent lands">
              <Switch checked={cfg.supervisor.triggerOnAgentStop} disabled={readOnly} onCheckedChange={(v) => save({ supervisor: { triggerOnAgentStop: v } })} />
            </Field>
            <Field label="Intervention" hint="Observe only logs findings. Message writes into the MAIN chat. Block also denies flagged full builds and new launches for cards with an open high finding.">
              <Segmented
                value={cfg.intervention}
                disabled={readOnly}
                options={[
                  { value: 'observe', label: 'Observe' },
                  { value: 'message', label: 'Message' },
                  { value: 'block', label: 'Block' },
                ]}
                onChange={(v) => save({ intervention: v })}
              />
            </Field>
            <Field label="Reasoning effort">
              <Segmented
                value={(cfg.supervisor.effort || 'medium') as 'low' | 'medium' | 'high'}
                disabled={readOnly}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Med' },
                  { value: 'high', label: 'High' },
                ]}
                onChange={(v) => save({ supervisor: { effort: v } })}
              />
            </Field>
            <Field label="Model" hint="Empty uses your Grok Build default.">
              <input
                defaultValue={cfg.supervisor.model}
                disabled={readOnly}
                placeholder="default"
                onBlur={(e) => e.target.value !== cfg.supervisor.model && save({ supervisor: { model: e.target.value.trim() } })}
                className="mono h-8 w-44 rounded-[4px] border border-line bg-transparent px-2 text-[12px] outline-none focus:border-ink/60"
              />
            </Field>

            <h3 className="label mt-8 text-bp-ink">Delivery to MAIN</h3>
            <Field label="Desktop Bridge" hint={overview.bridge.available ? `Connected · ${overview.bridge.threads} desktop threads visible` : overview.bridge.reason}>
              <Segmented
                value={cfg.delivery.bridge}
                disabled={readOnly}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'off', label: 'Hooks only' },
                ]}
                onChange={(v) => save({ delivery: { bridge: v } })}
              />
            </Field>
            <Field label="Interrupt on high severity" hint="High findings use send --force, at most once per cooldown.">
              <Switch checked={cfg.delivery.forceOnHigh} disabled={readOnly} onCheckedChange={(v) => save({ delivery: { forceOnHigh: v } })} />
            </Field>

            <h3 className="label mt-8 text-bp-ink">Remote access · phone</h3>
            <div className="py-4">
              <RemoteAccess tunnel={overview.tunnel} readOnly={readOnly} />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
