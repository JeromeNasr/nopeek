import { createContext } from 'react'

export const THEME_STORAGE_KEY = 'nopeek-theme'

export const ThemeContext = createContext({
  theme: 'dark',
  toggleTheme: () => {},
})
