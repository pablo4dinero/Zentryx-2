import { useToast } from "@/hooks/use-toast"
import { useTheme } from "next-themes"
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
  const { theme } = useTheme()
  const isLight = theme === "light"

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const isDestructive = props.variant === "destructive"
        const lightClass = isLight && !isDestructive ? "bg-white border-slate-200 text-black shadow-md" : undefined
        return (
          <Toast key={id} {...props} className={lightClass}>
            <div className="grid gap-1">
              {title && (
                <ToastTitle className={isLight && !isDestructive ? "font-bold text-black" : undefined}>
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className={isLight && !isDestructive ? "text-black/70" : undefined}>
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
