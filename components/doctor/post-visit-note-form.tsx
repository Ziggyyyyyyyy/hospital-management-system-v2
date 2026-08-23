'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const noteSchema = z.object({
  appointment_id: z.union([z.string(), z.number()]),
  clinical_notes: z.string().min(1, 'Clinical notes are required'),
  diagnosis: z.string().optional(),
  follow_up_instr: z.string().optional(),
})

type NoteFormValues = z.infer<typeof noteSchema>

export default function PostVisitNoteForm({
  appointment_id,
  onSuccess,
}: {
  appointment_id: string | number
  onSuccess?: () => void
}) {
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NoteFormValues>({
    resolver: zodResolver(noteSchema),
    defaultValues: {
      appointment_id,
      clinical_notes: '',
      diagnosis: '',
      follow_up_instr: '',
    },
  })

  const onSubmit = async (values: NoteFormValues) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/post-visit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error ?? err?.message ?? 'Submission failed')
      }
      toast.success('Post-visit note saved successfully')
      onSuccess?.()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save post-visit note')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Post-Visit Note</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input type="hidden" {...register('appointment_id')} />

          <div className="space-y-2">
            <Label htmlFor="clinical_notes">
              Clinical Notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="clinical_notes"
              placeholder="Enter clinical notes from the visit..."
              className="min-h-32"
              {...register('clinical_notes')}
            />
            {errors.clinical_notes && (
              <p className="text-xs text-destructive">
                {errors.clinical_notes.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="diagnosis">Diagnosis</Label>
            <Input
              id="diagnosis"
              placeholder="Primary diagnosis (ICD-10 if applicable)"
              {...register('diagnosis')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="follow_up_instr">Follow-Up Instructions</Label>
            <Textarea
              id="follow_up_instr"
              placeholder="Medication schedule, follow-up steps, additional instructions..."
              className="min-h-24"
              {...register('follow_up_instr')}
            />
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Post-Visit Note'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
