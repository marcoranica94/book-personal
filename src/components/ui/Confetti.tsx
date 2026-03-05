import {useEffect, useRef, useState} from 'react'
import {motion} from 'framer-motion'

const COLORS = ['#7C3AED', '#06B6D4', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6', '#34D399']

interface Particle {
  id: number
  color: string
  angle: number
  distance: number
  size: number
  rotation: number
  shape: 'circle' | 'rect'
}

function makeParticles(count: number): Particle[] {
  return Array.from({length: count}, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length],
    angle: (360 / count) * i + (Math.random() * 30 - 15),
    distance: 80 + Math.random() * 120,
    size: 5 + Math.random() * 5,
    rotation: Math.random() * 540 - 270,
    shape: Math.random() > 0.5 ? 'circle' : 'rect',
  }))
}

interface ConfettiProps {
  /** Trigger: incrementa per sparare un burst */
  trigger: number
  /** Origine % del viewport (default centro schermo) */
  originX?: number
  originY?: number
  count?: number
}

export default function Confetti({trigger, originX = 50, originY = 50, count = 38}: ConfettiProps) {
  const [particles, setParticles] = useState<Particle[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevTrigger = useRef(0)

  useEffect(() => {
    if (trigger === 0 || trigger === prevTrigger.current) return
    prevTrigger.current = trigger

    setParticles(makeParticles(count))
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setParticles([]), 1800)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [trigger, count])

  if (particles.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden">
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance

        return (
          <motion.div
            key={p.id}
            initial={{
              opacity: 1,
              x: `calc(${originX}vw - ${p.size / 2}px)`,
              y: `calc(${originY}vh - ${p.size / 2}px)`,
              rotate: 0,
              scale: 1,
            }}
            animate={{
              opacity: 0,
              x: `calc(${originX}vw - ${p.size / 2}px + ${tx}px)`,
              y: `calc(${originY}vh - ${p.size / 2}px + ${ty + 60}px)`,
              rotate: p.rotation,
              scale: 0.3,
            }}
            transition={{duration: 1.4, ease: [0.25, 0.46, 0.45, 0.94]}}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.shape === 'circle' ? '50%' : '2px',
            }}
          />
        )
      })}
    </div>
  )
}
