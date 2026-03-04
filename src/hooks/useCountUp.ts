import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0)
  const startTime = useRef<number | null>(null)
  const startValue = useRef(0)
  const raf = useRef<number | null>(null)

  useEffect(() => {
    startValue.current = 0
    startTime.current = null

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(startValue.current + (target - startValue.current) * eased))
      if (progress < 1) raf.current = requestAnimationFrame(animate)
    }

    raf.current = requestAnimationFrame(animate)
    return () => { if (raf.current) cancelAnimationFrame(raf.current) }
  }, [target, duration])

  return value
}
