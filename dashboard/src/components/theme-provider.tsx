import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { MEDIA_QUERY, STORAGE_KEY, ThemeContext, storedTheme, type Theme } from '@/lib/theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<Theme>(storedTheme)
  const [systemDark, setSystemDark] = useState(() => matchMedia(MEDIA_QUERY).matches)
  const resolvedTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const media = matchMedia(MEDIA_QUERY)
    const onChange = () => setSystemDark(media.matches)
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) updateTheme(storedTheme())
    }
    onChange()
    media.addEventListener('change', onChange)
    window.addEventListener('storage', onStorage)
    return () => {
      media.removeEventListener('change', onChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = resolvedTheme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#191a17' : '#f7f7f4')
  }, [theme, resolvedTheme])

  const setTheme = (value: Theme) => {
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* Keep the in-memory preference. */ }
    updateTheme(value)
  }

  return <ThemeContext value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext>
}
