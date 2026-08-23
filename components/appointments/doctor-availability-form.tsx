'use client'

import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Alert, AlertDescription } from '../ui/alert'
import type { DoctorAvailabilityRow } from '../../lib/appointments/availability-service'
import type { CreateAvailabilityInput } from '../../lib/validation/appointment'

const DOW = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

export default function DoctorAvailabilityForm({
  doctorId,
  initialRows = [],
  refresh,
}: {
  doctorId: number
  initialRows?: DoctorAvailabilityRow[]
  refresh?: () => Promise<void>
}) {
  const [rows, setRows] = useState<DoctorAvailabilityRow[]>(initialRows)
  const [form, setForm] = useState<CreateAvailabilityInput>({
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
    slot_duration_minutes: 30,
    active: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = async () => {
    try {
      const res = await fetch(`/api/doctors/${doctorId}/availability`)
      const json = await res.json()
      if (json?.success) setRows(json.data ?? [])
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load()
  }, [doctorId])

  const submit = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/admin/doctors/${doctorId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json?.success) {
        setError(json?.error?.message ?? 'Failed')
        return
      }
      setToast('Availability added')
      setTimeout(() => setToast(null), 3000)
      await load()
      await refresh?.()
    } finally {
      setLoading(false)
    }
  }

  const remove = async (id: number) => {
    try {
      await fetch(`/api/admin/doctors/${doctorId}/availability/${id}`, {
        method: 'DELETE',
      })
      await load()
      await refresh?.()
    } catch (e: any) {
      setError(e?.message ?? 'Delete failed')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Doctor Availability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {toast && (
          <Alert>
            <AlertDescription>{toast}</AlertDescription>
          </Alert>
        )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs font-medium">Day</label>
            <Select
              value={String(form.day_of_week)}
              onValueChange={(v) =>
                setForm({ ...form, day_of_week: Number(v) })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOW.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Start</label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm({ ...form, start_time: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium">End</label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm({ ...form, end_time: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Slot (min)</label>
            <Input
              type="number"
              min={5}
              max={480}
              value={form.slot_duration_minutes}
              onChange={(e) =>
                setForm({
                  ...form,
                  slot_duration_minutes: Number(e.target.value),
                })
              }
            />
          </div>
          <div className="flex items-end">
            <Button onClick={submit} loading={loading} className="w-full">
              Add Pattern
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="text-sm">
                <strong>{DOW[r.day_of_week]}</strong> {r.start_time.slice(0, 5)}–
                {r.end_time.slice(0, 5)} • {r.slot_duration_minutes} min slots
                {!r.active && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (inactive)
                  </span>
                )}
                {r.valid_from && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    valid_from {r.valid_from}
                  </span>
                )}
                {r.valid_until && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    valid_until {r.valid_until}
                  </span>
                )}
              </div>
              <Button size="sm" variant="destructive" onClick={() => remove(r.id)}>
                Remove
              </Button>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No availability patterns yet. Add at least one so slots can be
              generated for this doctor.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
