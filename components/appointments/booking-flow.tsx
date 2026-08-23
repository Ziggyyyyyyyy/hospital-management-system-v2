'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select'
import { Skeleton } from '../../components/ui/skeleton'
import { Badge } from '../../components/ui/badge'
import { Alert, AlertDescription } from '../../components/ui/alert'
import SlotGrid from './slot-grid'
import HoldCountdown from './hold-countdown'
import ConfirmBookingForm from './confirm-booking-form'
import { fetchDoctors, fetchSpecialties } from './appointments-api'
import type { DoctorT, SpecialtyT } from './appointments-types'

/**
 * Patient-facing appointment booking flow. Minimal UI to verify the
 * appointment-domain foundation. Plug into existing pages.
 */
export default function AppointmentBookingFlow() {
  const [specialties, setSpecialties] = useState<SpecialtyT[]>([])
  const [doctors, setDoctors] = useState<DoctorT[]>([])
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null)
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorT | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Hold state (populated after patient clicks an available slot)
  const [hold, setHold] = useState<{
    hold_token: string
    expires_at: string
    slot_id: number
    doctor_id: number
  } | null>(null)

  const [bookingResult, setBookingResult] = useState<{
    id?: number
    status?: string
  } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        setLoading(true)
        const [specs, docs] = await Promise.all([
          fetchSpecialties(),
          fetchDoctors(),
        ])
        setSpecialties(specs)
        setDoctors(docs)
      } catch (e: any) {
        setError(e?.message ?? 'Failed to load')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filteredDoctors = useMemo(() => {
    if (!selectedSpecialty) return doctors
    return doctors.filter((d) =>
      (d.doctor_specialties ?? []).some(
        (ds) => String(ds.specialty_id) === selectedSpecialty,
      ),
    )
  }, [doctors, selectedSpecialty])

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Book an Appointment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Book an Appointment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Specialty</label>
            <Select
              value={selectedSpecialty ?? 'all'}
              onValueChange={(v) => {
                setSelectedSpecialty(v === 'all' ? null : v)
                setSelectedDoctor(null)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All specialties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All specialties</SelectItem>
                {specialties.map((s) => (
                  <SelectItem
                    key={s.specialty_id}
                    value={String(s.specialty_id)}
                  >
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Doctor</label>
            <Select
              value={selectedDoctor ? String(selectedDoctor.staff_id) : undefined}
              onValueChange={(v) => {
                if (v === 'none') return
                const d = doctors.find(
                  (doc) => String(doc.staff_id) === v,
                )
                setSelectedDoctor(d ?? null)
                setHold(null)
                setBookingResult(null)
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a doctor" />
              </SelectTrigger>
              <SelectContent>
                {filteredDoctors.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No doctors available
                  </SelectItem>
                ) : (
                  filteredDoctors.map((d) => (
                    <SelectItem key={d.staff_id} value={String(d.staff_id)}>
                      {d.full_name || `Doctor #${d.staff_id}`}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {(d.doctor_specialties ?? [])
                          .map((ds: any) => ds.specialty?.name)
                          .filter(Boolean)
                          .join(', ')}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {selectedDoctor && (
          <div className="space-y-3 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Available Slots</h3>
              <Badge variant="outline">
                {hold ? 'Held' : selectedDoctor ? 'Selecting' : 'Idle'}
              </Badge>
            </div>

            {hold ? (
              <div className="space-y-4">
                <HoldCountdown
                  expiresAt={hold.expires_at}
                  onExpire={() => setHold(null)}
                />
                <ConfirmBookingForm
                  holdToken={hold.hold_token}
                  doctorId={hold.doctor_id}
                  onSuccess={(apptId, status) => {
                    setBookingResult({ id: apptId, status })
                    setHold(null)
                  }}
                  onInvalidHold={() => setHold(null)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setHold(null)}
                >
                  Release hold and pick another slot
                </Button>
              </div>
            ) : (
              <SlotGrid
                doctorId={selectedDoctor.staff_id}
                onSlotHeld={(h) => setHold(h)}
                onError={(msg) => setError(msg)}
              />
            )}

            {bookingResult && (
              <Alert>
                <AlertDescription>
                  Booking {bookingResult.status} — appointment ID:{' '}
                  <strong>{bookingResult.id}</strong>
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
