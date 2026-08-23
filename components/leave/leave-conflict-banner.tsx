'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import type { AppointmentT } from '@/components/appointments/appointments-types'

export default function LeaveConflictBanner({
  appointment,
  onReschedule,
}: {
  appointment: AppointmentT | null | undefined
  onReschedule: (appointment: AppointmentT) => void
}) {
  const [open, setOpen] = useState(false)

  if (!appointment || appointment.status !== 'DOCTOR_LEAVE_CONFLICT') {
    return null
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <div
        role="alert"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-destructive/50 bg-destructive/10 p-4"
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">Schedule Change</Badge>
            <span className="text-sm font-medium">
              Appointment #{appointment.appointment_id}
            </span>
          </div>
          <p className="text-sm text-foreground">
            Your appointment has been affected by a schedule change. Please
            reschedule.
          </p>
        </div>
        <AlertDialogTrigger asChild>
          <Button size="sm">Reschedule</Button>
        </AlertDialogTrigger>
      </div>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reschedule Appointment?</AlertDialogTitle>
          <AlertDialogDescription>
            Your doctor has updated their availability, affecting this
            appointment. You&apos;ll be taken to the reschedule flow to pick a
            new slot.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false)
              onReschedule(appointment)
            }}
          >
            Proceed to Reschedule
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
