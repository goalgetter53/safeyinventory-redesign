import { cn } from "@/lib/utils";
import { materialColorClass } from "@/lib/inventory/format";

export function MaterialBadge({ material, className }: { material: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium", materialColorClass(material), className)}>
      {material}
    </span>
  );
}
