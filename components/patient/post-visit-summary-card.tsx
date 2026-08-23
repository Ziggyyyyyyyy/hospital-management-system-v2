'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

type Status = 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'PENDING'

interface PostvisitSummary {
  status: Status
  visit_explanation?: string
  medication_sched?: string
  follow_up_steps?: string
  instructions?: string
  error?: string
}

export default function PostVisitSummaryCard({
  appointment_id,
}: {
  appointment_id: string | number
}) {
  const [data, setData] = useState<PostvisitSummary | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSummary = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/ai/postvisit/${appointment_id}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? 'Failed to fetch summary')
      }
      const json = await res.json()
      setData(json)
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load post-visit summary')
      setData({ status: 'FAILED', error: e?.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSummary()
  }, [appointment_id])

  const statusVariant = (s: Status) => {
    switch (s) {
      case 'COMPLETED':
        return 'success'
      case 'PROCESSING':
        return 'secondary'
      case 'FAILED':
        return 'destructive'
      default:
        return 'outline'
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Post-Visit Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Post-Visit Summary</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(data?.status ?? 'PENDING')}>
            {data?.status ?? 'PENDING'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={fetchSummary}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {data?.visit_explanation && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Visit Explanation</div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.visit_explanation}
            </p>
          </div>
        )}

        {data?.medication_sched && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Medication Schedule</div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.medication_sched}
            </p>
          </div>
        )}

        {data?.follow_up_steps && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Follow-Up Steps</div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.follow_up_steps}
            </p>
          </div>
        )}

        {data?.instructions && (
          <div className="space-y-1">
            <div className="text-sm font-medium">Instructions</div>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {data.instructions}
            </p>
          </div>
        )}

        {data?.status === 'FAILED' && !data?.visit_explanation && (
          <p className="text-sm text-muted-foreground">
            {data.error ?? 'Summary not available.'}
          </p>
        )}

        {data?.status === 'PROCESSING' && (
          <p className="text-sm text-muted-foreground">
            Your post-visit summary is being generated. Check back shortly.
          </p>
        )}

        {data?.status === 'PENDING' && (
          <p className="text-sm text-muted-foreground">
            Post-visit summary will be available after your appointment is
            completed.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
