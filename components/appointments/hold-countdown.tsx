'use client'

import { useEffect, useState } from 'react'
import { Progress } from '../ui/progress'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'

export default function HoldCountdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string
  onExpire: () => void
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const end = new Date(expiresAt).getTime()
  const remaining = Math.max(0, end - now)
  const totalSeconds = 5 * 60 * 1000 // default hold = 5m for progress bar
  const percent = Math.min(100, (remaining / totalSeconds) * 100)
  useEffect(() => {
    if (remaining <= 0) onExpire()
  }, [remaining, onExpire])
  const mins = Math.floor(remaining / 60000)
  const secs = Math.floor((remaining % 60000) / 1000)
    .toString()
    .padStart(2, '0')
  const variant = remaining < 60000 ? 'destructive' : remaining < 2 * 60000 ? 'outline' : 'default'
  return (
    <Alert>
      <AlertDescription className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">Slot held temporarily</div>
          <Badge variant={variant as any}>
            {mins}:{secs} remaining
          </Badge>
        </div>
        <Progress value={100 - percent} className="h-2" />
        <div className="text-xs text-muted-foreground">
          If you do not confirm your booking before this timer reaches 0, the
          slot is released back to the public pool and other patients can take
          it. The expiry of the hold is enforced by the server, not by this
          countdown.
        </div>
      </AlertDescription>
    </Alert>
  )
}
