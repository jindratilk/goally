import QRCode from 'qrcode'
import { Copy, Loader2, RefreshCw, Smartphone } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { post, type TunnelInfo } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dot } from './shared'

/** Sidebar item. Hover (or keyboard focus) opens a popover with the QR code and tunnel controls. */
export function PhoneAccess({ tunnel }: { tunnel: TunnelInfo }) {
  const [busy, setBusy] = useState(false)
  const canvas = useRef<HTMLCanvasElement>(null)
  const up = tunnel.status === 'up'
  const starting = tunnel.status === 'starting'
  const on = up || starting

  useEffect(() => {
    if (up && tunnel.phoneUrl && canvas.current) QRCode.toCanvas(canvas.current, tunnel.phoneUrl, { width: 176, margin: 1, color: { dark: '#26251e', light: '#ffffff' } })
  }, [up, tunnel.phoneUrl])

  const act = async (action: 'start' | 'stop' | 'rotate') => {
    setBusy(true)
    try {
      const r = await post<TunnelInfo>('/api/tunnel', { action })
      if (action === 'start') r.status === 'up' ? toast.success('Tunnel up') : toast.error(r.error || 'Tunnel did not come up')
      if (action === 'rotate') toast.success('New private link', { description: 'Old phone links stop working' })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="group/phone relative">
      <button className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/5 focus-visible:text-foreground">
        <Smartphone className="size-4" />
        <span className="flex-1 text-left">Phone access</span>
        <Dot tone={up ? 'success' : starting ? 'warning' : tunnel.status === 'error' ? 'danger' : 'neutral'} pulse={starting} />
      </button>
      <div className="invisible absolute bottom-0 left-full z-50 pl-3 opacity-0 transition-opacity group-focus-within/phone:visible group-focus-within/phone:opacity-100 group-hover/phone:visible group-hover/phone:opacity-100">
        <div className="w-64 rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Phone access</div>
              <div className="truncate text-xs text-muted-foreground">
                {up ? tunnel.hostname : starting ? 'Opening tunnel…' : tunnel.status === 'error' ? tunnel.error : 'Off, only this Mac sees the board'}
              </div>
            </div>
            <Button size="sm" variant={on ? 'outline' : 'default'} disabled={busy} onClick={() => act(on ? 'stop' : 'start')}>
              {busy && <Loader2 className="animate-spin" />}
              {on ? 'Stop' : 'Start'}
            </Button>
          </div>
          {up && tunnel.phoneUrl && (
            <div className="mt-3 flex flex-col items-center gap-3">
              <canvas ref={canvas} className={cn('rounded-lg ring-1 ring-foreground/10')} />
              <div className="text-xs text-muted-foreground">Scan with your phone. Read-only view.</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(tunnel.phoneUrl!)
                    toast.success('Private link copied')
                  }}
                >
                  <Copy /> Copy link
                </Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => act('rotate')}>
                  <RefreshCw /> New key
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
