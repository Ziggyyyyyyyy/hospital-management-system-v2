'use client'

import { useEffect, useState } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog'
import { Alert, AlertDescription } from '../ui/alert'
import { cancelAppointment, fetchMyAppointments } from './appointments-api'
import RescheduleDialog from './reschedule-dialog'
import type { AppointmentT } from './appointments-types'

export default function MyAppointments() {
  const [list, setList] = useState<AppointmentT[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<AppointmentT | null>(null)
  const [rescheduleTarget, setRescheduleTarget] = useState<AppointmentT | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await fetchMyAppointments()
      setList(data)
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load appointments')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])

  const confirmCancel = async () => {
    if (!cancelTarget) return
    try {
      await cancelAppointment({
        id: cancelTarget.appointment_id,
        reason: 'PATIENT_REQUEST',
      })
      setToast(`Cancelled appointment #${cancelTarget.appointment_id}`)
      setCancelTarget(null)
      await load()
    } catch (e: any) {
      setToast(`Error: ${e?.message ?? 'Cancellation failed'}`)
    } finally {
      setTimeout(() => setToast(null), 4000)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Appointments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My Appointments</CardTitle>
        <Button size="sm" variant="ghost" onClick={load}>
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {toast && (
          <Alert>
            <AlertDescription>{toast}</AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {list.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            You have no appointments yet. Use the booking flow above to create
            one.
          </div>
        )}
        {list.map((a) => {
          const slotStart = a.slot
            ? a.slot.start_time
            : a.confirmed_at ?? a.created_at
          return (
            <div
              key={a.appointment_id}
              className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <div className="text-sm font-medium">
                  Appointment #{a.appointment_id}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(slotStart).toLocaleString()}
                  {a.reason_for_visit ? ` • ${a.reason_for_visit}` : ''}
                  {a.reschedule_count ? ` • rescheduled ${a.reschedule_count}x` : ''}
                </div>
                <Badge
                  variant={
                    a.status === 'CONFIRMED'
                      ? 'default'
                      : a.status === 'COMPLETED'
                      ? 'secondary'
                      : a.status === 'CANCELLED'
                      ? 'outline'
                      : a.status === 'DOCTOR_LEAVE_CONFLICT'
                      ? 'destructive'
                      : 'outline'
                  }
                >
                  {a.status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {(a.status === 'CONFIRMED' || a.status === 'DOCTOR_LEAVE_CONFLICT' || a.status === 'RESCHEDULE_REQUIRED') && (
                  <Button size="sm" onClick={() => setRescheduleTarget(a)}>
                    Reschedule
                  </Button>
                )}
                {(a.status === 'CONFIRMED' ||
                  a.status === 'HELD' ||
                  a.status === 'DOCTOR_LEAVE_CONFLICT' ||
                  a.status === 'RESCHEDULE_REQUIRED') && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setCancelTarget(a)}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </CardContent>

      <AlertDialog open={!!cancelTarget} onOpenChange={(v) => !v && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will cancel appointment #{cancelTarget?.appointment_id}. The
              slot will be released back to available for other patients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep appointment</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCancel}>
              Yes, cancel it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {rescheduleTarget && (
        <RescheduleDialog
          open
          appointment={rescheduleTarget}
          onClose={() => setRescheduleTarget(null)}
          onDone={() => {
            setRescheduleTarget(null)
            load()
          }}
        />
      )}
    </Card>
  )
}
