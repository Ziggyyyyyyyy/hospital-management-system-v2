'use client'
import React, { useState, useEffect } from 'react'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import {
  User2,
  Phone,
  BadgeCheck,
  Calendar,
  Building2,
  GraduationCap,
  Briefcase,
  StickyNote,
} from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'

interface DoctorInfoCardProps {
  type?: 'name'
}

const DoctorInfoCard: React.FC<DoctorInfoCardProps> = ({ type }) => {
  const [doctor, setDoctor] = useState<any>(null)
  const [isLoading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch('/api/staff/me')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load staff')
        return res.json()
      })
      .then((data) => {
        setDoctor(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))

    const savedNotes = typeof window !== 'undefined' ? localStorage.getItem('doctorNotes') : null
    if (savedNotes) {
      setNotes(savedNotes)
    }
  }, [])

  useEffect(() => {
    if (notes !== undefined && typeof window !== 'undefined') {
      localStorage.setItem('doctorNotes', notes)
    }
  }, [notes])

  if (isLoading) {
    if (type === 'name') return <Skeleton className="inline-block h-8 w-32" />
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-24 w-full rounded-md" />
        </CardContent>
      </Card>
    )
  }

  if (!doctor) {
    if (type === 'name') return <span>Doctor</span>
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No profile data available
        </CardContent>
      </Card>
    )
  }

  if (type === 'name') {
    return <span>{doctor.users?.first_name ? `Dr. ${doctor.users.first_name} ${doctor.users.last_name || ''}`.trim() : 'Doctor'}</span>
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <User2 className="h-4 w-4 text-primary" />
          Doctor Profile
        </CardTitle>
        <CardDescription className="text-xs">
          Staff credentials and department
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <User2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground">
              Dr. {doctor.users?.first_name} {doctor.users?.last_name}
            </span>
          </div>
          {doctor.users?.phone_number && (
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0" />
              <span>{doctor.users.phone_number}</span>
            </div>
          )}
          {doctor.users?.date_of_birth && (
            <div className="flex items-center gap-2.5 text-muted-foreground">
              <Calendar className="h-4 w-4 shrink-0" />
              <span>{new Date(doctor.users.date_of_birth).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <BadgeCheck className="h-3.5 w-3.5" /> Staff ID:
            </span>
            <span className="font-mono font-medium">{doctor.staff_id}</span>
          </div>
          {doctor.license_number && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5" /> License:
              </span>
              <span className="font-medium">{doctor.license_number}</span>
            </div>
          )}
          {doctor.departments?.name && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5" /> Department:
              </span>
              <span className="font-medium text-primary">{doctor.departments.name}</span>
            </div>
          )}
          {doctor.date_hired && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Briefcase className="h-3.5 w-3.5" /> Joined:
              </span>
              <span className="font-medium">{new Date(doctor.date_hired).toLocaleDateString()}</span>
            </div>
          )}
        </div>

        {/* Notes Section */}
        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <StickyNote className="h-3.5 w-3.5" />
            <span>Personal Quick Notes</span>
          </div>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Write clinical reminders or personal notes..."
            className="min-h-[90px] w-full text-xs resize-none bg-muted/30 focus-visible:bg-background"
          />
        </div>
      </CardContent>
    </Card>
  )
}

export default DoctorInfoCard
