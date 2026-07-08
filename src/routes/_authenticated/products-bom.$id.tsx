import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Plus, X, Save, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { fmtKg } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/products-bom/$id")({
  component: BomEditor,
});

function BomEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: product } = useQuery({
    queryKey: ["products", id],
    queryFn: async () => (await supabase.from("products").select("*, product_bom(part_id, quantity_required, parts(part_name, material_type, consumption_per_unit_kg))").eq("id", id).single()).data,
  });
  const { data: parts } = useQuery({
    queryKey: ["parts"],
    queryFn: async () => (await supabase.from("parts").select("*").order("part_name")).data ?? [],
  });

  const [bom, setBom] = useState<Array<{ part_id: string; quantity_required: number }>>([]);
  useEffect(() => {
    if (product?.product_bom) setBom(product.product_bom.map((b: any) => ({ part_id: b.part_id, quantity_required: Number(b.quantity_required) })));
  }, [product?.id]);

  const partById = new Map((parts ?? []).map((p: any) => [p.id, p]));
  const available = (parts ?? []).filter((p: any) => !bom.some((b) => b.part_id === p.id));

  const save = useMutation({
    mutationFn: async () => {
      if (bom.length === 0) throw new Error("Add at least one part to the BOM.");
      const { error: delErr } = await supabase.from("product_bom").delete().eq("product_id", id);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("product_bom").insert(bom.map((b) => ({ ...b, product_id: id })));
      if (insErr) throw insErr;
    },
    onSuccess: () => { toast.success("BOM saved"); qc.invalidateQueries({ queryKey: ["products"] }); audit("update", "product_bom", id); navigate({ to: "/products" }); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <div>
      <PageHeader
        title={`BOM · ${product?.product_name ?? "…"}`}
        subtitle="Define the parts required to build one unit of this product"
        actions={
          <>
            <Button asChild variant="outline"><Link to="/products"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save BOM</Button>
          </>
        }
      />

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="label-caps mb-3">Available parts</div>
            {available.length === 0 ? <p className="text-sm text-muted-foreground">All parts already in BOM.</p> :
              <ul className="space-y-1">
                {available.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between border rounded-md p-2 hover:bg-accent">
                    <div>
                      <div className="text-sm font-medium">{p.part_name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2"><MaterialBadge material={p.material_type} /> {fmtKg(p.consumption_per_unit_kg, 4)}/unit</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setBom((b) => [...b, { part_id: p.id, quantity_required: 1 }])}><Plus className="h-3 w-3" /> Add</Button>
                  </li>
                ))}
              </ul>
            }
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="label-caps mb-3">Bill of Materials</div>
            {bom.length === 0 ? <p className="text-sm text-muted-foreground">Add parts from the left.</p> :
              <ul className="space-y-2">
                {bom.map((row, idx) => {
                  const p: any = partById.get(row.part_id);
                  return (
                    <li key={row.part_id} className="flex items-center gap-2 border rounded-md p-2">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{p?.part_name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2"><MaterialBadge material={p?.material_type ?? ""} /></div>
                      </div>
                      <Input type="number" min={1} value={row.quantity_required} onChange={(e) => setBom((prev) => prev.map((r, i) => i === idx ? { ...r, quantity_required: Number(e.target.value) } : r))} className="w-20" />
                      <Button size="icon" variant="ghost" onClick={() => setBom((prev) => prev.filter((_, i) => i !== idx))}><X className="h-4 w-4" /></Button>
                    </li>
                  );
                })}
              </ul>
            }
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
