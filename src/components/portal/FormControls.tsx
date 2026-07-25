import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared portal form primitives. `Input`/`Textarea`/`Select` forward refs and
 *  spread native props, so they drop straight into react-hook-form `register()`
 *  as well as plain controlled inputs. Used by the property form, the admin
 *  login, and the developer/submission dialogs so every field looks the same. */
export const controlClass =
  "w-full rounded-lg border border-[var(--rule-strong)] bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-champagne focus:ring-2 focus:ring-champagne/30 disabled:opacity-60";

export function Field({
  label,
  error,
  hint,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className={cn("block", className)}>
      <span className="mb-1.5 block font-label text-[10px] font-semibold tracking-luxury text-muted-foreground uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(controlClass, className)} {...props} />
  ),
);
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlClass, className)} {...props} />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select ref={ref} className={cn(controlClass, className)} {...props} />
  ),
);
Select.displayName = "Select";
