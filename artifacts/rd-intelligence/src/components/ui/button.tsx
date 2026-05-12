import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "glass"
  size?: "default" | "sm" | "lg" | "icon"
}

export function buttonVariants({
  variant = "default",
  size = "default",
}: {
  variant?: ButtonProps["variant"]
  size?: ButtonProps["size"]
} = {}) {
  const variants = {
    default: "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-primary/40 hover:-translate-y-0.5 border border-white/10",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-lg shadow-destructive/20 hover:shadow-destructive/40 hover:-translate-y-0.5",
    outline: "border border-input bg-transparent hover:bg-white/5 hover:text-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-white/5 hover:text-foreground",
    link: "text-primary underline-offset-4 hover:underline",
    glass: "glass-card hover:bg-white/10 text-foreground",
  };

  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3 text-xs",
    lg: "h-11 rounded-md px-8 text-base",
    icon: "h-10 w-10",
  };

  return `${variants[variant]} ${sizes[size]}`;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-xl font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95",
        buttonVariants({ variant, size }),
        className
      )}
      {...props}
    />
  )
)
Button.displayName = "Button"

export { Button }
