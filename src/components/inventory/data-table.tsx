import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  empty,
  loading,
  className,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("border border-border rounded-md overflow-hidden bg-card", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-foreground/[0.02]">
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "text-left px-4 h-9 eyebrow",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {columns.map((c, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-3 bg-foreground/[0.04] rounded-sm animate-pulse" style={{ width: `${50 + (j * 13) % 40}%` }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : (rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-muted-foreground text-[13px]">
                  {empty ?? "Nothing here yet."}
                </td>
              </tr>
            ) : (
              rows!.map((r) => (
                <tr
                  key={r.id}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn(
                    "border-b border-border last:border-b-0 row-rule",
                    onRowClick && "cursor-pointer",
                  )}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        "px-4 py-3 align-middle",
                        c.align === "right" && "text-right",
                        c.align === "center" && "text-center",
                        c.className,
                      )}
                    >
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function TableToolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mb-4">{children}</div>;
}

export function StatPill({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "alert" | "ok" }) {
  return (
    <div className="flex items-baseline gap-2 border border-border rounded-md px-3 h-9 bg-card">
      <span className="eyebrow">{label}</span>
      <span className={cn(
        "mono text-[12px]",
        tone === "alert" && "text-accent",
        tone === "ok" && "text-success",
      )}>{value}</span>
    </div>
  );
}
