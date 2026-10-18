import { createContext, useContext } from 'react'

export type Theme = 'system' | 'light' | 'dark'
export const STORAGE_KEY = 'goally-theme'
export const MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function storedTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark') return value
  } catch { /* Appearance still works when storage is unavailable. */ }
  return 'system'
}

export const ThemeContext = createContext<{ theme: Theme; resolvedTheme: 'light' | 'dark'; setTheme: (theme: Theme) => void } | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme requires ThemeProvider')
  return context
}
