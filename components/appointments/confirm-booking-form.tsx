'use client'

import { useState } from 'react'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Input } from '../ui/input'
import { Alert, AlertDescription } from '../ui/alert'
import { confirmBooking } from './appointments-api'

export default function ConfirmBookingForm({
  holdToken,
  doctorId,
  onSuccess,
  onInvalidHold,
}: {
  holdToken: string
  doctorId: number
  onSuccess: (appointmentId: number, status: string) => void
  onInvalidHold: () => void
}) {
  const [reason, setReason] = useState('')
  const [timezone] = useState(
    typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onConfirm() {
    try {
      setLoading(true)
      setError(null)
      const res = await confirmBooking({
        hold_token: holdToken,
        reason_for_visit: reason || undefined,
        timezone,
      })
      onSuccess(Number(res.appointment_id), res.status)
    } catch (e: any) {
      const code: string = e?.code ?? 'INTERNAL_ERROR'
      setError(`${code}: ${e?.message ?? 'Failed'}`)
      if (
        code === 'SLOT_HOLD_EXPIRED' ||
        code === 'INVALID_HOLD' ||
        code === 'HOLD_NOT_OWNED'
      ) {
        setTimeout(onInvalidHold, 1000)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">Reason for visit (optional)</label>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="E.g. Annual checkup, persistent headache"
          rows={3}
        />
        <Input type="hidden" readOnly value={timezone} />
        <p className="text-xs text-muted-foreground">Timezone: {timezone}</p>
      </div>
      <Button onClick={onConfirm} loading={loading} className="w-full">
        Confirm Appointment
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
