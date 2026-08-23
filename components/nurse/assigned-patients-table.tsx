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
import { BedIcon, Users, Calendar, ChevronRight, User } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface AssignedPatientsTableProps {
  onRowClick: (patient: any) => void
}

const AssignedPatientsTable: React.FC<AssignedPatientsTableProps> = ({
  onRowClick,
}) => {
  const [admissions, setAdmissions] = useState<any[]>([])
  const [isLoading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [visiblePatients, setVisiblePatients] = useState(5)
  const [initialRowsShown, setInitialRowsShown] = useState(true)

  useEffect(() => {
    fetch('/api/admission')
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! Status: ${res.status}`)
        }
        return res.json()
      })
      .then((responseData) => {
        const admissionsData = Array.isArray(responseData)
          ? responseData
          : responseData.data || []
        setAdmissions(admissionsData)
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Failed to fetch assigned patients')
        setLoading(false)
      })
  }, [])

  const loadMorePatients = () => {
    setVisiblePatients((prev) => prev + 5)
    setInitialRowsShown(false)
  }

  const showLessPatients = () => {
    setVisiblePatients(5)
    setInitialRowsShown(true)
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-12 w-full rounded-md" />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-destructive text-sm">
          Failed to load assigned patients: {error}
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
              <Users className="h-4 w-4 text-primary" />
              Inpatient Care Roster
            </CardTitle>
            <CardDescription className="text-xs">
              Patients currently assigned to your clinical ward and care
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs font-normal">
            {admissions.length} Assigned
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
                <TableHead>Room & Ward</TableHead>
                <TableHead>Admission Date</TableHead>
                <TableHead>Blood Type</TableHead>
                <TableHead className="w-10 text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admissions.length > 0 ? (
                admissions.slice(0, visiblePatients).map((admission, i) => {
                  const patientUser = admission.patients?.users
                  const patientName = patientUser?.first_name
                    ? `${patientUser.first_name} ${patientUser.last_name || ''}`.trim()
                    : `Patient #${admission.patient_id}`

                  return (
                    <TableRow
                      key={admission.admission_id || i}
                      className="cursor-pointer hover:bg-muted/60 transition-colors group"
                      onClick={() =>
                        onRowClick({
                          patient_id: admission.patient_id,
                          admission: admission,
                        })
                      }
                    >
                      <TableCell className="text-center font-mono text-xs text-muted-foreground">
                        {i + 1}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{patientName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BedIcon className="h-3.5 w-3.5 text-primary" />
                          <span className="font-medium text-foreground">Room {admission.room_id || 'N/A'}</span>
                          <span>•</span>
                          <span>{admission.rooms?.departments?.name || admission.rooms?.room_type || 'General'}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3 w-3" />
                          <span>
                            {admission.admission_date
                              ? new Date(admission.admission_date).toLocaleDateString()
                              : 'Not recorded'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs font-mono">
                          {admission.patients?.blood_type || 'Unknown'}
                        </Badge>
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
                    No patients currently assigned to your care.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      {admissions.length > 5 && (
        <CardFooter className="flex justify-center gap-3 py-3 border-t border-border bg-muted/20">
          {admissions.length > visiblePatients && (
            <Button onClick={loadMorePatients} variant="ghost" size="sm" className="text-xs">
              Load More
            </Button>
          )}
          {!initialRowsShown && (
            <Button onClick={showLessPatients} variant="ghost" size="sm" className="text-xs">
              Show Less
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  )
}

export default AssignedPatientsTable
