'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { Alert, AlertDescription } from '../ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { holdSlot, fetchSlots } from './appointments-api'
import type { SlotT } from './appointments-types'

function nextNDaysDefault(n = 21): { from: string; to: string } {
  const from = new Date()
  from.setHours(0, 0, 0, 0)
  const to = new Date(from)
  to.setDate(to.getDate() + n)
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  }
}

export default function SlotGrid({
  doctorId,
  onSlotHeld,
  onError,
}: {
  doctorId: number
  onSlotHeld: (h: {
    hold_token: string
    expires_at: string
    slot_id: number
    doctor_id: number
  }) => void
  onError: (msg: string) => void
}) {
  const [date, setDate] = useState<string>(() => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t.toISOString().slice(0, 10)
  })
  const [slots, setSlots] = useState<SlotT[]>([])
  const [loading, setLoading] = useState(true)
  const [holding, setHolding] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetchSlots({
          doctor_id: doctorId,
          date_from: date,
          date_to: date,
        })
        if (!active) return
        setSlots(res.slots)
      } catch (e: any) {
        if (!active) return
        onError(e?.message ?? 'Failed to load slots')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [doctorId, date, onError])

  const groupedByDay = useMemo(() => {
    const m = new Map<string, SlotT[]>()
    for (const s of slots) {
      const k = s.start_time.slice(0, 10)
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return Array.from(m.entries())
  }, [slots])

  const dayOptions = useMemo(() => {
    const { from, to } = nextNDaysDefault(21)
    const out: string[] = []
    const cur = new Date(from)
    const end = new Date(to)
    while (cur <= end) {
      out.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [])

  const onHold = async (slot: SlotT) => {
    try {
      setHolding(slot.slot_id)
      const res = await holdSlot({
        doctor_id: slot.doctor_id,
        slot_id: slot.slot_id,
      })
      onSlotHeld({
        hold_token: String(res.hold_token),
        expires_at: res.expires_at,
        slot_id: Number(res.slot_id),
        doctor_id: slot.doctor_id,
      })
    } catch (e: any) {
      onError(e?.message ?? 'Slot is no longer available')
    } finally {
      setHolding(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    )
  }

  if (slots.length === 0) {
    return (
      <div className="space-y-3">
        <Select value={date} onValueChange={setDate}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a date" />
          </SelectTrigger>
          <SelectContent>
            {dayOptions.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Alert>
          <AlertDescription>
            No available slots on this date. Try another day, or verify that
            this doctor has availability rules configured by an admin.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Select value={date} onValueChange={setDate}>
        <SelectTrigger>
          <SelectValue placeholder="Pick a date" />
        </SelectTrigger>
        <SelectContent>
          {dayOptions.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {groupedByDay.map(([day, items]) => (
        <div key={day} className="space-y-2">
          <div className="text-sm font-semibold">{day}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {items.map((s) => {
              const t1 = s.start_time.slice(11, 16)
              const t2 = s.end_time.slice(11, 16)
              const disabled =
                s.status !== 'AVAILABLE' || holding === s.slot_id
              return (
                <Button
                  key={s.slot_id}
                  variant={s.status === 'AVAILABLE' ? 'outline' : 'secondary'}
                  disabled={disabled}
                  loading={holding === s.slot_id}
                  onClick={() => onHold(s)}
                  className="flex-col items-start h-auto py-3"
                >
                  <div className="text-sm font-medium">
                    {t1} → {t2}
                  </div>
                  <div className="mt-1">
                    <Badge
                      variant={
                        s.status === 'AVAILABLE'
                          ? 'default'
                          : s.status === 'BOOKED'
                          ? 'destructive'
                          : 'outline'
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                </Button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
