import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export const CURRENCY = "₹";

export function fmtCurrency(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return `${CURRENCY}${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function fmtKg(n: number | string | null | undefined, digits = 2) {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return `${(v || 0).toLocaleString("en-IN", { maximumFractionDigits: digits })} kg`;
}

export function fmtNum(n: number | string | null | undefined) {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return (v || 0).toLocaleString("en-IN");
}

export function fmtDate(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "dd MMM yyyy");
}

export function fmtDateTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? parseISO(d) : d;
  return format(date, "dd MMM yyyy, HH:mm");
}

export function timeAgo(d: string | Date) {
  const date = typeof d === "string" ? parseISO(d) : d;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

export const MATERIAL_TYPES = ["PC", "POM", "PP", "TPE"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const WASTAGE_REASONS = [
  { value: "machine_issue", label: "Machine Issue" },
  { value: "operator_error", label: "Operator Error" },
  { value: "material_defect", label: "Material Defect" },
  { value: "setup_loss", label: "Setup Loss" },
  { value: "other", label: "Other" },
] as const;

export function wastageReasonLabel(v: string | null | undefined) {
  return WASTAGE_REASONS.find((r) => r.value === v)?.label ?? v ?? "—";
}

export function materialColorClass(m: string) {
  switch (m) {
    case "PC":  return "bg-blue-100 text-blue-800 border-blue-200";
    case "POM": return "bg-purple-100 text-purple-800 border-purple-200";
    case "PP":  return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "TPE": return "bg-amber-100 text-amber-800 border-amber-200";
    default: return "bg-muted text-muted-foreground border-border";
  }
}
