import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Save, Loader2, AlertTriangle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtKg, fmtNum, MATERIAL_TYPES } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/production-planning")({
  component: PlanningPage,
});

type PartReq = { part_id: string; part_name: string; required: number; available: number; shortage: number };
type RmReq = { material_type: string; required_kg: number; available_kg: number; shortage_kg: number };

function PlanningPage() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(100);
  const [date, setDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [plan, setPlan] = useState<{ parts: PartReq[]; rm: RmReq[] } | null>(null);

  const { data: products } = useQuery({ queryKey: ["products", "active"], staleTime: 5 * 60_000, queryFn: async () => (await supabase.from("products").select("id,product_name,product_code").eq("is_active", true).order("product_name")).data ?? [] });
  const { data: plans } = useQuery({
    queryKey: ["production_plans"],
    staleTime: 30_000,
    queryFn: async () => (await supabase.from("production_plans").select("id,plan_number,planned_quantity,planned_date,status,products(product_name)").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Pick a product");
      const [{ data: bom }, { data: parts }, { data: rms }] = await Promise.all([
        supabase.from("product_bom").select("*, parts(*)").eq("product_id", productId),
        supabase.from("parts").select("*"),
        supabase.from("raw_materials").select("material_type, remaining_quantity_kg").eq("is_blocked", false),
      ]);
      if (!bom || bom.length === 0) throw new Error("Product has no BOM");
      const partsById = new Map((parts ?? []).map((p: any) => [p.id, p]));
      const partReqs: PartReq[] = bom.map((row: any) => {
        const p: any = partsById.get(row.part_id);
        const required = qty * Number(row.quantity_required);
        const available = Number(p?.current_stock ?? 0);
        return { part_id: row.part_id, part_name: p?.part_name, required, available, shortage: Math.max(0, required - available) };
      });
      const rmNeeds = new Map<string, number>();
      partReqs.forEach((r) => {
        const p: any = partsById.get(r.part_id);
        const mt = p?.material_type;
        const kg = r.shortage * Number(p?.consumption_per_unit_kg ?? 0);
        rmNeeds.set(mt, (rmNeeds.get(mt) ?? 0) + kg);
      });
      const rmAvail = new Map<string, number>();
      (rms ?? []).forEach((r: any) => rmAvail.set(r.material_type, (rmAvail.get(r.material_type) ?? 0) + Number(r.remaining_quantity_kg)));
      const rmReqs: RmReq[] = MATERIAL_TYPES.map((mt) => {
        const required = rmNeeds.get(mt) ?? 0;
        const available = rmAvail.get(mt) ?? 0;
        return { material_type: mt, required_kg: required, available_kg: available, shortage_kg: Math.max(0, required - available) };
      }).filter((r) => r.required_kg > 0);
      return { parts: partReqs, rm: rmReqs };
    },
    onSuccess: (data) => setPlan(data),
    onError: (e: any) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error("Generate a plan first");
      const { error } = await supabase.from("production_plans").insert({
        plan_number: "",
        product_id: productId,
        planned_quantity: qty,
        planned_date: date,
        required_parts: plan.parts as any,
        required_raw_materials: plan.rm as any,
        status: "planned",
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Plan saved"); audit("create", "production_plan"); qc.invalidateQueries({ queryKey: ["production_plans"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div>
      <PageHeader title="Production Planning" subtitle="Forecast requirements before production" />

      <Card className="mb-6">
        <CardHeader><CardTitle>Generate a plan</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="label-caps">Product</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Product" /></SelectTrigger>
                <SelectContent>{products?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.product_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-caps">Quantity</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="label-caps">Planned date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <Button onClick={() => generate.mutate()} disabled={generate.isPending}><CalendarClock className="h-4 w-4" /> Generate Plan</Button>
        </CardContent>
      </Card>

      {plan && (
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <Card>
            <CardHeader><CardTitle>Parts requirements</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Required</TableHead><TableHead>Available</TableHead><TableHead>Shortage</TableHead></TableRow></TableHeader>
                <TableBody>
                  {plan.parts.map((p) => (
                    <TableRow key={p.part_id} className={p.shortage > 0 ? "bg-destructive/10" : ""}>
                      <TableCell className="font-medium">{p.part_name}</TableCell>
                      <TableCell>{fmtNum(p.required)}</TableCell>
                      <TableCell>{fmtNum(p.available)}</TableCell>
                      <TableCell className={p.shortage > 0 ? "text-destructive font-semibold" : ""}>{p.shortage > 0 ? fmtNum(p.shortage) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Raw material requirements</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Required</TableHead><TableHead>Available</TableHead><TableHead>Shortage</TableHead></TableRow></TableHeader>
                <TableBody>
                  {plan.rm.map((r) => (
                    <TableRow key={r.material_type} className={r.shortage_kg > 0 ? "bg-destructive/10" : ""}>
                      <TableCell className="font-medium">{r.material_type}</TableCell>
                      <TableCell>{fmtKg(r.required_kg)}</TableCell>
                      <TableCell>{fmtKg(r.available_kg)}</TableCell>
                      <TableCell className={r.shortage_kg > 0 ? "text-destructive font-semibold" : ""}>{r.shortage_kg > 0 ? fmtKg(r.shortage_kg) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4" /> Save Plan</Button>
          </div>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Recent plans</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(plans ?? []).length === 0 ? <p className="p-6 text-sm text-muted-foreground">No plans yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Planned</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {plans?.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.plan_number}</TableCell>
                    <TableCell>{p.products?.product_name}</TableCell>
                    <TableCell>{fmtNum(p.planned_quantity)}</TableCell>
                    <TableCell>{fmtDate(p.planned_date)}</TableCell>
                    <TableCell><Badge variant="secondary">{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
