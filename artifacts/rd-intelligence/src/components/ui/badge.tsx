import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-primary/20 text-primary-foreground border border-primary/30",
    secondary: "border-transparent bg-secondary/20 text-secondary-foreground border border-secondary/30",
    destructive: "border-transparent bg-destructive/20 text-destructive border border-destructive/30",
    outline: "text-foreground border-white/20",
    success: "border-transparent bg-green-500/20 text-green-400 border border-green-500/30",
    warning: "border-transparent bg-yellow-500/20 text-yellow-400 border border-yellow-500/30",
    info: "border-transparent bg-blue-500/20 text-blue-400 border border-blue-500/30",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
