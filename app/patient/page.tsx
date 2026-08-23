'use client'

import React, { useState, useEffect, useCallback } from 'react'
import PatientInfoCard from '@/components/patient/patient-info-card'
import AppointmentCalendarCard from '@/components/patient/appointment-calendar-card'
import AppointmentBookingFlow from '@/components/appointments/booking-flow'
import UpcomingAppointmentsTable from '@/components/patient/upcoming-appointments-table'
import BillingSummaryTable from '@/components/patient/billing-summary-table'
import SummaryStatsCard from '@/components/patient/summary-stats-card'
import SymptomIntakeForm from '@/components/symptoms/symptom-intake-form'
import AISummaryCard from '@/components/symptoms/ai-summary-card'
import PostVisitSummaryCard from '@/components/patient/post-visit-summary-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { getGreeting } from '@/utils/greeting'
import ErrorPage from '@/app/error'

function SkeletonLoader() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <div className="space-y-2">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-44 rounded-xl" />
        <div className="col-span-2 hidden gap-4 sm:grid md:grid-cols-2">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </section>

      <section className="space-y-3">
        <Skeleton className="h-6 w-52" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </section>
    </div>
  )
}

export default function PatientDashboard() {
  interface PatientProfile {
    blood_type: string
    emergency_contact_id: number | null
    users: {
      address: string
      last_name: string
      first_name: string
      national_id: number
      phone_number: string
      date_of_birth: string
    }
  }

  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(
    null,
  )
  const [appointments, setAppointments] = useState([])
  const [billing, setBilling] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // AI symptom intake — UI-only selection state
  const [selectedAppointmentId, setSelectedAppointmentId] = useState('')
  const [summaryKey, setSummaryKey] = useState(0)

  const fetchData = useCallback(async () => {
    try {
      const [patientResponse, appointmentsResponse, billingResponse] =
        await Promise.all([
          fetch('/api/patients/me'),
          fetch('/api/appointments'),
          fetch('/api/billing/patient/me'),
        ])

      if (!patientResponse.ok) {
        throw new Error('Failed to fetch patient profile')
      }
      if (!appointmentsResponse.ok) {
        throw new Error('Failed to fetch appointments')
      }

      const patientData = await patientResponse.json()
      const appointmentsData = await appointmentsResponse.json()
      const billingData = await billingResponse.json()

      if (patientData && patientData.success === false) {
        throw new Error(patientData.error?.message || 'Failed to fetch patient profile')
      }
      if (appointmentsData && appointmentsData.success === false) {
        throw new Error(appointmentsData.error?.message || 'Failed to fetch appointments')
      }
      if (billingData && billingData.success === false) {
        throw new Error(billingData.error?.message || 'Failed to fetch billing data')
      }

      const patientObj = patientData?.data ?? patientData
      const apptList = Array.isArray(appointmentsData)
        ? appointmentsData
        : Array.isArray(appointmentsData?.data?.appointments)
          ? appointmentsData.data.appointments
          : Array.isArray(appointmentsData?.appointments)
            ? appointmentsData.appointments
            : Array.isArray(appointmentsData?.data)
              ? appointmentsData.data
              : []

      const billList = Array.isArray(billingData)
        ? billingData
        : Array.isArray(billingData?.data?.billing)
          ? billingData.data.billing
          : Array.isArray(billingData?.data)
            ? billingData.data
            : Array.isArray(billingData?.billing)
              ? billingData.billing
              : []

      setPatientProfile(patientObj)
      setAppointments(apptList)
      setBilling(billList)
    } catch (err: any) {
      setError(err?.message || 'An error occurred while fetching data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <SkeletonLoader />
  }

  if (error) {
    return <ErrorPage error={new Error(error)} reset={fetchData} />
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-8 sm:px-6 lg:py-10">
      {/* Dashboard header */}
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          {getGreeting()}{' '}
          {patientProfile?.users
            ? `${patientProfile.users.first_name} ${patientProfile.users.last_name}`
            : 'there'}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Here is an overview of your care — appointments, symptoms, and
          billing in one place.
        </p>
      </header>

      {/* At-a-glance cards */}
      <section
        aria-label="Your overview"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <PatientInfoCard
          patientProfile={patientProfile}
          refreshData={fetchData}
        />
        <AppointmentCalendarCard appointments={appointments} />
        <section className="col-span-2 hidden gap-4 sm:grid md:grid-cols-2">
          <SummaryStatsCard appointments={appointments} billing={billing} />
        </section>
      </section>

      {/* Book an appointment — existing appointment-domain flow */}
      <section aria-labelledby="booking-heading" className="space-y-3">
        <div>
          <h2
            id="booking-heading"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Book an appointment
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a specialty and doctor, pick an available slot, and confirm.
            Your slot is held for 5 minutes while you complete the form.
          </p>
        </div>
        <AppointmentBookingFlow />
      </section>

      {/* AI symptom intake — existing symptoms-domain flow */}
      <section aria-labelledby="ai-intake-heading" className="space-y-3">
        <div>
          <h2
            id="ai-intake-heading"
            className="font-display text-lg font-semibold tracking-tight"
          >
            AI pre-visit intake
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select an appointment, describe your symptoms, and receive an
            AI-generated pre-visit summary for your doctor.
          </p>
        </div>

        {(() => {
          const apptList: any[] = Array.isArray(appointments)
            ? appointments
            : Array.isArray((appointments as any)?.appointments)
              ? (appointments as any).appointments
              : Array.isArray((appointments as any)?.data?.appointments)
                ? (appointments as any).data.appointments
                : []
          const patientId =
            (patientProfile as any)?.patient_id ??
            (patientProfile as any)?.data?.patient_id ??
            null
          const selected = apptList.find(
            (a) =>
              String(a.appointment_id ?? a.id) === selectedAppointmentId,
          )

          if (apptList.length === 0) {
            return (
              <EmptyState
                title="No appointments yet"
                description="Book an appointment above, then submit your symptoms here for an AI pre-visit summary."
              />
            )
          }

          return (
            <>
              <div className="max-w-md space-y-2">
                <Label htmlFor="ai-appointment">Appointment</Label>
                <Select
                  value={selectedAppointmentId}
                  onValueChange={setSelectedAppointmentId}
                >
                  <SelectTrigger id="ai-appointment" className="w-full">
                    <SelectValue placeholder="-- Select Appointment --" />
                  </SelectTrigger>
                  <SelectContent>
                    {apptList.map((a: any) => {
                      const id = String(a.appointment_id ?? a.id)
                      const date = a.visit_date
                        ? String(a.visit_date).slice(0, 10)
                        : ''
                      return (
                        <SelectItem key={id} value={id}>
                          #{id}
                          {date ? ` — ${date}` : ''}
                          {a.visit_status ? ` (${a.visit_status})` : ''}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selected && patientId ? (
                selected.status === 'COMPLETED' || selected.visit_status === 'Completed' ? (
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <AISummaryCard
                      key={`summary-${selectedAppointmentId}-${summaryKey}`}
                      appointment_id={selectedAppointmentId}
                    />
                    <PostVisitSummaryCard
                      key={`postvisit-${selectedAppointmentId}`}
                      appointment_id={selectedAppointmentId}
                    />
                  </div>
                ) : (
                  <div className="grid items-start gap-4 lg:grid-cols-2">
                    <SymptomIntakeForm
                      key={`intake-${selectedAppointmentId}`}
                      appointment_id={selectedAppointmentId}
                      patient_id={patientId}
                      onSuccess={() => setSummaryKey((k) => k + 1)}
                    />
                    <AISummaryCard
                      key={`summary-${selectedAppointmentId}-${summaryKey}`}
                      appointment_id={selectedAppointmentId}
                    />
                  </div>
                )
              ) : null}
            </>
          )
        })()}
      </section>

      {/* Appointments & billing */}
      <section aria-labelledby="records-heading" className="space-y-6">
        <div>
          <h2
            id="records-heading"
            className="sr-only"
          >
            Your records
          </h2>
          <UpcomingAppointmentsTable appointments={appointments} />
          <div className="mt-6">
            <BillingSummaryTable billing={billing} appointments={appointments} />
          </div>
        </div>
      </section>
    </div>
  )
}