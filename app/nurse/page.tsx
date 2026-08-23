'use client'

import React, { useState, useEffect } from 'react'
import { PatientDetailsDialog } from '@/components/nurse/patient-details-dialog'
import AssignedPatientsTable from '@/components/nurse/assigned-patients-table'
import NurseInfoCard from '@/components/nurse/nurse-info'
import { getGreeting } from '@/utils/greeting'

export default function NurseDashboard() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState<any>(null)
  const [nurseName, setNurseName] = useState<string>('')

  useEffect(() => {
    fetch('/api/staff/me')
      .then((res) => {
        if (res.ok) return res.json()
        return { users: { first_name: 'Nurse' } }
      })
      .then((data) => {
        setNurseName(data.users?.first_name || 'Nurse')
      })
      .catch(() => {})
  }, [])

  const handleRowClick = (patient: any) => {
    setSelectedPatient(patient)
    setDialogOpen(true)
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:py-10">
      <header className="space-y-1" role="banner">
        <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl flex items-center gap-2">
          {getGreeting()} {nurseName}!
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Monitor your assigned inpatient roster, patient medical history, room assignments, and vital care records.
        </p>
      </header>

      <section
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        aria-label="Nurse workspace"
      >
        <div className="lg:col-span-2 space-y-6">
          <AssignedPatientsTable onRowClick={handleRowClick} />
        </div>
        <aside className="space-y-6">
          <NurseInfoCard />
        </aside>
      </section>

      <PatientDetailsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        patient={selectedPatient}
      />
    </div>
  )
}
