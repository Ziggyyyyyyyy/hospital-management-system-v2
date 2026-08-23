'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
  CardFooter,
} from '@/components/ui/card'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, User, Clock, ChevronRight } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface AppointmentsTableProps {
  onRowClick: (record: any) => void
}

const AppointmentsTable: React.FC<AppointmentsTableProps> = ({
  onRowClick,
}) => {
  const [appointments, setAppointments] = useState<any[]>([])
  const [isLoading, setLoading] = useState(true)
  const [visibleAppointments, setVisibleAppointments] = useState(5)
  const [initialRowsShown, setInitialRowsShown] = useState(true)

  useEffect(() => {
    fetch('/api/appointments')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        setAppointments(Array.isArray(data) ? data : data?.appointments || [])
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const loadMoreAppointments = () => {
    setVisibleAppointments((prev) => prev + 5)
    setInitialRowsShown(false)
  }

  const showLessAppointments = () => {
    setVisibleAppointments(5)
    setInitialRowsShown(true)
  }

  const getStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase()
    switch (s) {
      case 'COMPLETED':
        return (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
            Completed
          </Badge>
        )
      case 'CANCELLED':
      case 'CANCELED':
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            Cancelled
          </Badge>
        )
      case 'CONFIRMED':
      case 'SCHEDULED':
        return (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            Confirmed
          </Badge>
        )
      case 'HELD':
        return (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
            Held
          </Badge>
        )
      case 'DOCTOR_LEAVE_CONFLICT':
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            Leave Conflict
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
            {status || 'Scheduled'}
          </Badge>
        )
    }
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Not scheduled'
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return dateString
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Patient Consultation Queue
            </CardTitle>
            <CardDescription className="text-xs">
              Click on any row to open patient clinical details and write post-visit notes
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs font-normal">
            {appointments.length} Total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Patient Name</TableHead>
                <TableHead>Symptoms / Reason</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {appointments && appointments.length > 0 ? (
                appointments.slice(0, visibleAppointments).map((record, i) => {
                  const patientName =
                    record.patients?.users?.first_name || record.patient_name
                      ? `${record.patients?.users?.first_name || ''} ${record.patients?.users?.last_name || ''}`.trim() || record.patient_name
                      : `Patient #${record.patient_id || record.record_id || i + 1}`

                  const visitDate = record.visit_date || record.start_time || record.created_at

                  return (
                    <TableRow
                      key={record.appointment_id || record.record_id || i}
                      onClick={() => onRowClick(record)}
                      className="cursor-pointer hover:bg-muted/60 transition-colors group"
                    >
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{patientName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground text-xs">
                        {record.symptoms || record.reason_for_visit || 'General Consultation'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3" />
                          <span>{formatDate(visitDate)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(record.status || record.visit_status)}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform group-hover:translate-x-0.5" />
                      </TableCell>
                    </TableRow>
                  )
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                    No scheduled appointments found in your queue.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {appointments && appointments.length > 5 && (
        <CardFooter className="flex justify-center gap-3 py-3 border-t border-border bg-muted/20">
          {appointments.length > visibleAppointments && (
            <Button onClick={loadMoreAppointments} variant="ghost" size="sm" className="text-xs">
              Load More
            </Button>
          )}
          {!initialRowsShown && (
            <Button onClick={showLessAppointments} variant="ghost" size="sm" className="text-xs">
              Show Less
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

export default AppointmentsTable
