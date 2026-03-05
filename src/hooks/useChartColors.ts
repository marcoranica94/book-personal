import {useUIStore} from '@/stores/uiStore'

export function useChartColors() {
  const theme = useUIStore((s) => s.theme)
  const dark = theme === 'dark'
  return {
    axis:            dark ? '#475569' : '#94A3B8',
    grid:            dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    tooltip:         dark ? '#1A1A26' : '#FFFFFF',
    tooltipBorder:   dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)',
    track:           dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
    productivityLow: dark ? '#1E3A4A' : '#E0F2FE',
  }
}
