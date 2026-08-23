import * as React from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps extends React.ComponentProps<'div'> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center',
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
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
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export { EmptyState }