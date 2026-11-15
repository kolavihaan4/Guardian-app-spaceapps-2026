import { useEffect, useState } from 'react'
import { DAY, isoDay } from './series'

/** Refresh at UTC midnight, and catch up after a background tab or sleeping device returns. */
export function useDailyDate() {
  const [today, setToday] = useState(() => isoDay(new Date()))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const sync = () => {
      clearTimeout(timer)
      const now = Date.now()
      setToday(isoDay(new Date(now)))
      timer = setTimeout(sync, DAY - (now % DAY) + 100)
    }
    const visible = () => { if (document.visibilityState === 'visible') sync() }
    sync()
    window.addEventListener('focus', sync)
    document.addEventListener('visibilitychange', visible)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('focus', sync)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [])
  return today
}
