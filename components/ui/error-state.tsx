import * as React from 'react'
import { AlertTriangle } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ErrorStateProps extends React.ComponentProps<'div'> {
  title?: string
  description?: string
  onRetry?: () => void
  retryLabel?: string
}

function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  className,
  ...props
}: ErrorStateProps) {
  return (
    <div
      data-slot="error-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      <div className="flex size-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="font-display text-sm font-semibold text-foreground">
          {title}
        </p>
        {description && (
          <p className="max-w-sm text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      )}
    </div>
  )
}

export { ErrorState }