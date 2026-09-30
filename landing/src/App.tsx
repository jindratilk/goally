import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CheckCircle2, ClipboardCopy, Radar } from 'lucide-react'
import { GITHUB_URL, INSTALL_PROMPT } from './install'

function LogoMark({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeOpacity=".3" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12l6-6" strokeLinecap="round" />
    </svg>
  )
}

function GitHubIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  )
}

function syncCopy(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.setAttribute('aria-hidden', 'true')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    ta.style.top = '0'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

async function copyText(text: string): Promise<boolean> {
  // Prefer sync copy first so the user-gesture context is not lost after await.
  if (syncCopy(text)) return true
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* fall through */
  }
  return syncCopy(text)
}

type Col = 'todo' | 'progress' | 'testing' | 'launched'
type DemoTask = {
  id: string
  title: string
  col: Col
  proof?: string
  live?: boolean
}

const COLUMNS: { key: Col; label: string }[] = [
  { key: 'todo', label: 'To-do' },
  { key: 'progress', label: 'In progress' },
  { key: 'testing', label: 'Testing' },
  { key: 'launched', label: 'Launched' },
]

const PROOFS = ['tests passed', 'commit', 'screenshot', 'deploy'] as const

const SEEDS: DemoTask[] = [
  { id: 'CT-1', title: 'Audit & split goal', col: 'launched', proof: 'commit' },
  { id: 'CT-2', title: 'Wire MCP tools', col: 'testing' },
  { id: 'CT-3', title: 'Board columns', col: 'progress', live: true },
  { id: 'CT-4', title: 'Phone tunnel QR', col: 'todo' },
]

function advance(tasks: DemoTask[]): DemoTask[] {
  const next = tasks.map((t) => ({ ...t }))
  const mover = next.find((t) => t.col === 'testing') ?? next.find((t) => t.col === 'progress') ?? next.find((t) => t.col === 'todo')
  if (!mover) {
    return SEEDS.map((t) => ({ ...t }))
  }
  for (const t of next) t.live = false
  if (mover.col === 'todo') {
    mover.col = 'progress'
    mover.live = true
    mover.proof = undefined
  } else if (mover.col === 'progress') {
    mover.col = 'testing'
    mover.proof = undefined
  } else if (mover.col === 'testing') {
    mover.col = 'launched'
    mover.proof = PROOFS[Math.floor(Math.random() * PROOFS.length)]
  }
  const idle = next.find((t) => t.col === 'todo')
  if (mover.col === 'launched' && idle) {
    idle.col = 'progress'
    idle.live = true
  }
  if (next.every((t) => t.col === 'launched')) {
    return SEEDS.map((t) => ({ ...t }))
  }
  return next
}

function ProgressRing({ ratio, eta }: { ratio: number; eta: string }) {
  const r = 9
  const c = 2 * Math.PI * r
  const complete = ratio >= 1
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" className="size-5 -rotate-90" aria-hidden>
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
      <span className={`text-xs tabnum ${complete ? 'text-success' : 'text-muted-foreground'}`}>{eta}</span>
    </div>
  )
}

function MiniBoard() {
  const reduce = useReducedMotion()
  const [tasks, setTasks] = useState<DemoTask[]>(() => SEEDS.map((t) => ({ ...t })))
  const [noteVisible, setNoteVisible] = useState(true)

  useEffect(() => {
    if (reduce) return
    const id = window.setInterval(() => {
      setTasks((prev) => advance(prev))
      setNoteVisible((v) => !v || Math.random() > 0.35)
    }, 2800)
    return () => window.clearInterval(id)
  }, [reduce])

  const launched = tasks.filter((t) => t.col === 'launched').length
  const ratio = launched / tasks.length
  const left = Math.max(1, Math.round((1 - ratio) * 8))

  return (
    <div className="board-enter relative mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none">
      <div className="relative rotate-[1.2deg] overflow-hidden rounded-2xl bg-card shadow-[0_20px_50px_-24px_rgba(38,37,30,0.35)] ring-1 ring-foreground/10">
        <div className="flex items-center gap-3 border-b border-foreground/8 bg-muted/50 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2 text-sm font-medium tracking-tight">
            <LogoMark className="size-4" />
            <span>Ship CSV export</span>
          </div>
          <div className="ml-auto">
            <ProgressRing ratio={ratio} eta={ratio >= 1 ? 'Done' : `~${left} min left`} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 bg-muted/70 p-2 sm:grid-cols-4 sm:gap-2 sm:p-2.5">
          {COLUMNS.map((col) => {
            const list = tasks.filter((t) => t.col === col.key)
            return (
              <div key={col.key} className="flex min-h-[140px] flex-col gap-1.5 rounded-xl bg-muted/80 p-1.5 sm:min-h-[180px]">
                <div className="flex items-center gap-1.5 px-1 py-0.5 text-[10px] font-medium text-muted-foreground sm:text-[11px]">
                  {col.label}
                  <span className="tabnum text-subtle">{list.length}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  <AnimatePresence mode="popLayout">
                    {list.map((task) => (
                      <motion.div
                        key={task.id}
                        layout={!reduce}
                        layoutId={reduce ? undefined : task.id}
                        transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                        className="flex flex-col gap-1 rounded-lg bg-card p-2 shadow-xs ring-1 ring-foreground/10"
                      >
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="font-mono">{task.id}</span>
                          <span className="ml-auto flex items-center gap-1">
                            {task.live && (
                              <span className="relative inline-flex size-1.5">
                                <span className="live-dot absolute inset-0 rounded-full bg-foreground opacity-60" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-foreground" />
                              </span>
                            )}
                            {task.col === 'launched' && <CheckCircle2 className="size-3 text-success" />}
                          </span>
                        </div>
                        <div className="text-[11px] leading-snug font-medium sm:text-xs">{task.title}</div>
                        {task.proof && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
                            <CheckCircle2 className="size-2.5" />
                            {task.proof}
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {noteVisible && (
          <motion.div
            key="director"
            initial={reduce ? false : { x: 16, y: 0 }}
            animate={{ x: 0, y: 0 }}
            exit={reduce ? undefined : { x: 12 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute -right-1 -bottom-3 z-10 max-w-[240px] -rotate-2 sm:-right-4 sm:bottom-6 sm:max-w-[260px]"
          >
            <div className="rounded-xl bg-card p-3 shadow-[0_12px_32px_-16px_rgba(38,37,30,0.45)] ring-1 ring-foreground/10">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-warning uppercase">
                <Radar className="size-3" />
                Goal Director
              </div>
              <p className="text-xs leading-snug text-foreground">CT-2 has no test after last edit</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function CopyInstallButton() {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copied = state === 'copied'

  const onCopy = useCallback(async () => {
    const ok = await copyText(INSTALL_PROMPT)
    setState(ok ? 'copied' : 'failed')
    window.setTimeout(() => setState('idle'), 2000)
  }, [])

  return (
    <button
      type="button"
      onClick={onCopy}
      data-copied={copied ? 'true' : 'false'}
      aria-label={copied ? 'Copied install instructions' : 'Copy install instructions for agents'}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background shadow-sm transition-[transform,background-color] hover:bg-foreground/90 active:scale-[0.98] focus-visible:outline-offset-2"
    >
      {copied ? <Check className="size-4" aria-hidden /> : <ClipboardCopy className="size-4" aria-hidden />}
      {copied ? 'Copied' : state === 'failed' ? 'Copy blocked, try again' : 'Copy install instructions for agents'}
    </button>
  )
}

export default function App() {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, color-mix(in oklab, #f54e00 6%, transparent), transparent 60%), radial-gradient(ellipse 60% 40% at 90% 20%, color-mix(in oklab, #1f8a65 5%, transparent), transparent 50%)',
        }}
      />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <a href="/" className="flex items-center gap-2.5 rounded-md text-foreground" aria-label="Goally home">
          <LogoMark />
          <span className="text-sm font-semibold tracking-tight">Goally</span>
        </a>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm text-muted-foreground ring-1 ring-foreground/10 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <GitHubIcon className="size-4" />
          GitHub
        </a>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 px-5 pb-16 pt-6 sm:px-8 lg:flex-row lg:items-center lg:gap-14 lg:pb-20 lg:pt-4">
        <div className="flex max-w-xl flex-col gap-7 lg:shrink-0">
          <div className="flex flex-col gap-4">
            <h1 className="text-[2.35rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.35rem]">
              Give Cursor a big goal.
              <br />
              Watch it get done.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              Goally splits the work, runs parallel subagents, and only counts a task done with proof.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <CopyInstallButton />
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-transparent px-5 text-sm font-medium text-foreground ring-1 ring-foreground/15 transition-colors hover:bg-foreground/5"
            >
              <GitHubIcon className="size-4" />
              View on GitHub
            </a>
          </div>
        </div>

        <div className="min-w-0 flex-1 pb-8 lg:pb-0">
          <MiniBoard />
        </div>
      </main>

      <footer className="relative z-10 px-5 pb-6 text-center text-xs text-subtle sm:px-8">
        Built for the Cursor hackathon
      </footer>
    </div>
  )
}
