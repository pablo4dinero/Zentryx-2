import { useToast } from "@/hooks/use-toast"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  // Use the project's theme provider — the previous import from
  // "next-themes" returned undefined (no provider in the tree), so the
  // light-mode overrides never fired and toasts kept rendering with the
  // dark background in light mode.
  const { theme } = useTheme()
  const isLight = theme === "light"

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isDestructive = props.variant === "destructive"
        const lightClass = isLight && !isDestructive
          ? "bg-white border-slate-200 text-slate-900 shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
          : undefined
        return (
          <Toast key={id} {...props} className={lightClass}>
            <div className="grid gap-1">
              {title && (
                <ToastTitle className={isLight && !isDestructive ? "font-semibold text-slate-900" : undefined}>
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className={cn(
                  isLight && !isDestructive && "text-slate-600",
                )}>
                  {description}
                </ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
