'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Alert, AlertDescription } from '../ui/alert'
import SlotGrid from './slot-grid'
import HoldCountdown from './hold-countdown'
import { rescheduleAppointment } from './appointments-api'
import type { AppointmentT } from './appointments-types'

export default function RescheduleDialog({
  open,
  appointment,
  onClose,
  onDone,
}: {
  open: boolean
  appointment: AppointmentT
  onClose: () => void
  onDone: () => void
}) {
  const [hold, setHold] = useState<{
    hold_token: string
    expires_at: string
    slot_id: number
    doctor_id: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      setHold(null)
      setError(null)
    }
  }, [open])

  const submit = async () => {
    if (!hold) return
    try {
      setSubmitting(true)
      setError(null)
      await rescheduleAppointment({
        id: appointment.appointment_id,
        new_slot_id: hold.slot_id,
        new_hold_token: hold.hold_token,
      })
      onDone()
    } catch (e: any) {
      setError(e?.message ?? 'Reschedule failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reschedule Appointment #{appointment.appointment_id}</DialogTitle>
          <DialogDescription>
            Pick a new slot. Once confirmed, the old appointment is cancelled
            and replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {hold ? (
            <div className="space-y-3">
              <HoldCountdown
                expiresAt={hold.expires_at}
                onExpire={() => setHold(null)}
              />
              <p className="text-sm text-muted-foreground">
                New slot id: <strong>{hold.slot_id}</strong>. Click confirm to
                reschedule.
              </p>
            </div>
          ) : (
            <SlotGrid
              doctorId={appointment.doctor_id}
              onSlotHeld={(h) => setHold(h)}
              onError={(msg) => setError(msg)}
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!hold || submitting} loading={submitting}>
            Confirm Reschedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
