'use client';

import { useTheme as useNextTheme } from 'next-themes';

export type Theme = 'light' | 'dark';

export function useTheme() {
  const { theme, setTheme } = useNextTheme();

  const toggleTheme = () => {
    console.log('🎨 Theme toggle clicked, current theme:', theme);
    const newTheme = theme === 'light' ? 'dark' : 'light';
    console.log('🎨 Switching to theme:', newTheme);
    setTheme(newTheme);
  };

  return {
    theme: (theme as Theme) || 'light',
    toggleTheme,
    setTheme: (newTheme: Theme) => setTheme(newTheme),
  };
}
