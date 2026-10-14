import * as React from "react";
import { cn } from "@/lib/utils";

const styles = {
  info: "border-blue-200 bg-blue-50 text-blue-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
  success: "border-green-200 bg-green-50 text-green-900",
};

export function Alert({ variant = "info", className, title, children, ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: keyof typeof styles; title?: string }) {
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("rounded-md border px-4 py-3 text-sm", styles[variant], className)} {...props}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : undefined}>{children}</div>}
    </div>
  );
}
