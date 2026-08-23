'use client'

import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import type { CreateLeaveInput, LeaveType, LeaveStatus } from '../../lib/validation/appointment'

export default function DoctorLeaveForm({ doctorId }: { doctorId: number }) {
  const [form, setForm] = useState<CreateLeaveInput>({
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    leave_type: 'VACATION',
    status: 'PENDING',
    reason: '',
  })
  const [conflictPreview, setConflictPreview] = useState<{
    affectedSlots: number
    affectedAppointments: number
    affectedHolds: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    leave_id?: number
    affectedAppointments?: number
    affectedSlots?: number
  } | null>(null)

  // Recompute conflict preview each time start/end/doctor change
  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const res = await fetch(
          `/api/admin/doctors/${doctorId}/conflicts?start_date=${form.start_date}&end_date=${form.end_date}`,
        )
        const json = await res.json()
        if (!active) return
        if (json?.success) setConflictPreview(json.data)
      } catch {
        /* ignore */
      }
    })()
    return () => {
      active = false
    }
  }, [doctorId, form.start_date, form.end_date])

  const submit = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(`/api/admin/doctors/${doctorId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!json?.success) {
        setError(json?.error?.message ?? 'Failed')
        return
      }
      setResult({
        leave_id: json.data.leave?.leave_id,
        affectedAppointments: json.data.affectedAppointments,
        affectedSlots: json.data.affectedSlots,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Doctor Leave</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <Alert>
            <AlertDescription>
              Leave #{result.leave_id} created. Affected appointments:{' '}
              <Badge variant="outline">{result.affectedAppointments}</Badge>{' '}
              Affected slots/holds:{' '}
              <Badge variant="outline">{result.affectedSlots}</Badge>
            </AlertDescription>
          </Alert>
        )}
        {conflictPreview &&
          (conflictPreview.affectedAppointments > 0 ||
            conflictPreview.affectedSlots > 0 ||
            conflictPreview.affectedHolds > 0) && (
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Conflicts detected if applied:</strong>{' '}
                {conflictPreview.affectedSlots} slots blocked,{' '}
                {conflictPreview.affectedHolds} holds released,{' '}
                {conflictPreview.affectedAppointments} appointments will be
                marked for reschedule.
              </AlertDescription>
            </Alert>
          )}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div>
            <label className="text-xs font-medium">Start Date</label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium">End Date</label>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-medium">Type</label>
            <Select
              value={form.leave_type as LeaveType}
              onValueChange={(v) =>
                setForm({ ...form, leave_type: v as LeaveType })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['VACATION','SICK','PERSONAL','EMERGENCY','OTHER'] as LeaveType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Status</label>
            <Select
              value={form.status as LeaveStatus}
              onValueChange={(v) =>
                setForm({ ...form, status: v as LeaveStatus })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['PENDING','APPROVED','DENIED','CANCELLED'] as LeaveStatus[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={submit} loading={loading} className="w-full">
              Create Leave
            </Button>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium">Reason (optional)</label>
          <Textarea
            value={form.reason ?? ''}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            rows={2}
          />
        </div>
      </CardContent>
    </Card>
  )
}
