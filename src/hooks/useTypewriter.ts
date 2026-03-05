import {useEffect, useRef, useState} from 'react'

/**
 * Animazione typewriter: scrive `text` carattere per carattere.
 * @param text     testo da animare
 * @param speed    millisecondi per carattere (default 40ms)
 * @param startDelay  ritardo iniziale prima di partire (default 0ms)
 */
export function useTypewriter(text: string, speed = 40, startDelay = 0): string {
  const [displayed, setDisplayed] = useState('')
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDisplayed('')
    if (!text) return
    let i = 0

    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        i++
        setDisplayed(text.slice(0, i))
        if (i >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current)
        }
      }, speed)
    }, startDelay)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [text, speed, startDelay])

  return displayed
}
