import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  subtitle,
  meta,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] leading-tight">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {(description || subtitle || meta) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          {(description || subtitle) && <p className="text-[13px] text-muted-foreground max-w-2xl">{description ?? subtitle}</p>}
          {meta && <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">{meta}</div>}
        </div>
      )}
    </div>
  );
}

export function StatInline({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "alert" | "ok" }) {
  return (
    <div className="flex items-center gap-1.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("num font-medium", tone === "alert" && "text-destructive", tone === "ok" && "text-success")}>{value}</span>
    </div>
  );
}
