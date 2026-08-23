import { AlertCircle, CheckCircle2, Info } from 'lucide-react'

export type Message =
  | { success: string }
  | { error: string }
  | { message: string }

export function FormMessage({ message }: { message: Message }) {
  return (
    <div className="flex flex-col gap-2 w-full max-w-md text-sm">
      {'success' in message && (
        <div className="flex items-start gap-2 rounded-md border border-success/25 bg-success-surface px-3 py-2 text-success">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
          <span>{message.success}</span>
        </div>
      )}
      {'error' in message && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive/5 px-3 py-2 text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{message.error}</span>
        </div>
      )}
      {'message' in message && (
        <div className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{message.message}</span>
        </div>
      )}
    </div>
  )
}