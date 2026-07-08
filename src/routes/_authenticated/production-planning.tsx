import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Save, Loader2, AlertTriangle, CheckCircle2, PackagePlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { fmtDate, fmtKg, fmtNum } from "@/lib/inventory/format";
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

  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await supabase.from("products").select("id,product_name,product_code").eq("is_active", true).order("product_name")).data ?? [],
  });

  const { data: plans } = useQuery({
    queryKey: ["production_plans"],
    staleTime: 30_000,
    queryFn: async () => (await supabase.from("production_plans").select("id,plan_number,planned_quantity,planned_date,status,products(product_name)").order("created_at", { ascending: false }).limit(50)).data ?? [],
  });

  const generate = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Pick a product");

      // 1. BOM rows
      const { data: bom, error: bomErr } = await supabase
        .from("product_bom")
        .select("part_id, quantity_required, parts(id, part_name, material_type, consumption_per_unit_kg)")
        .eq("product_id", productId);
      if (bomErr) throw bomErr;
      if (!bom || bom.length === 0) throw new Error("Product has no BOM");

      // 2. Per-batch rollup via RPC (single round trip, real per-batch remaining).
      const partIds = bom.map((b: any) => b.part_id);
      const { data: availRows, error: availErr } = await supabase.rpc("get_part_availability", { p_part_ids: partIds });
      if (availErr) throw availErr;
      const availById = new Map(((availRows ?? []) as any[]).map((a) => [a.part_id, a]));

      // 3. Part requirements
      const partReqs: PartReq[] = bom.map((row: any) => {
        const a = availById.get(row.part_id);
        const required = qty * Number(row.quantity_required);
        const available = Number(a?.available ?? 0);
        return {
          part_id: row.part_id,
          part_name: row.parts?.part_name ?? a?.part_name ?? "—",
          required,
          available,
          shortage: Math.max(0, required - available),
        };
      });

      // 4. Raw material rollup — only for parts with shortage.
      const rmNeeded = new Map<string, number>();
      partReqs.forEach((r) => {
        if (r.shortage <= 0) return;
        const p = (bom as any[]).find((b) => b.part_id === r.part_id)?.parts;
        const mt = p?.material_type;
        const kg = r.shortage * Number(p?.consumption_per_unit_kg ?? 0);
        rmNeeded.set(mt, (rmNeeded.get(mt) ?? 0) + kg);
      });

      // 5. Available raw material across active batches.
      const { data: rms } = await supabase
        .from("raw_materials")
        .select("material_type, remaining_quantity_kg")
        .eq("is_blocked", false);
      const rmAvail = new Map<string, number>();
      (rms ?? []).forEach((r: any) => rmAvail.set(r.material_type, (rmAvail.get(r.material_type) ?? 0) + Number(r.remaining_quantity_kg)));

      const rmReqs: RmReq[] = Array.from(rmNeeded.entries()).map(([mt, required_kg]) => ({
        material_type: mt,
        required_kg: Number(required_kg.toFixed(3)),
        available_kg: Number((rmAvail.get(mt) ?? 0).toFixed(3)),
        shortage_kg: Math.max(0, required_kg - (rmAvail.get(mt) ?? 0)),
      })).filter((r) => r.required_kg > 0);

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

  const ready = plan && plan.parts.every((p) => p.shortage === 0) && plan.rm.every((r) => r.shortage_kg === 0);
  const shortedParts = plan?.parts.filter((p) => p.shortage > 0) ?? [];
  const shortedRm = plan?.rm.filter((r) => r.shortage_kg > 0) ?? [];

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
          <Button onClick={() => generate.mutate()} disabled={!productId || generate.isPending}>
            {generate.isPending && <Loader2 className="h-4 w-4 animate-spin" />} <CalendarClock className="h-4 w-4" /> Generate Plan
          </Button>
        </CardContent>
      </Card>

      {plan && (
        <>
          {ready ? (
            <Alert className="mb-4 border-success/40 bg-success/10 text-success-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle className="text-foreground">Ready to produce</AlertTitle>
              <AlertDescription>All parts and raw materials are on hand for {fmtNum(qty)} units.</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Not ready — shopping list</AlertTitle>
              <AlertDescription className="space-y-3">
                {shortedParts.length > 0 && (
                  <div>
                    <div className="font-medium mt-1">Manufacture these parts:</div>
                    <ul className="list-disc pl-6 text-xs mt-1">
                      {shortedParts.map((p) => (
                        <li key={p.part_id}>
                          {p.part_name}: {fmtNum(p.shortage)} short
                        </li>
                      ))}
                    </ul>
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link to="/parts"><PackagePlus className="h-3 w-3" /> Open Parts</Link>
                    </Button>
                  </div>
                )}
                {shortedRm.length > 0 && (
                  <div>
                    <div className="font-medium mt-1">Procure these raw materials:</div>
                    <ul className="list-disc pl-6 text-xs mt-1">
                      {shortedRm.map((r) => (
                        <li key={r.material_type}>
                          {r.material_type}: {fmtKg(r.shortage_kg)} short
                        </li>
                      ))}
                    </ul>
                    <Button asChild size="sm" variant="outline" className="mt-2">
                      <Link to="/raw-materials"><PackagePlus className="h-3 w-3" /> Open Raw materials</Link>
                    </Button>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid md:grid-cols-2 gap-4 mb-6">
            <Card>
              <CardHeader><CardTitle>Parts requirements</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow><TableHead>Part</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Shortage</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {plan.parts.map((p) => (
                      <TableRow key={p.part_id} className={p.shortage > 0 ? "bg-destructive/10" : ""}>
                        <TableCell className="font-medium">{p.part_name}</TableCell>
                        <TableCell className="text-right num">{fmtNum(p.required)}</TableCell>
                        <TableCell className="text-right num">{fmtNum(p.available)}</TableCell>
                        <TableCell className={p.shortage > 0 ? "text-right num text-destructive font-semibold" : "text-right num text-muted-foreground"}>{p.shortage > 0 ? fmtNum(p.shortage) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Raw material requirements</CardTitle></CardHeader>
              <CardContent>
                {plan.rm.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No raw material shortfalls.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow><TableHead>Material</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Shortage</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {plan.rm.map((r) => (
                        <TableRow key={r.material_type} className={r.shortage_kg > 0 ? "bg-destructive/10" : ""}>
                          <TableCell className="font-medium">{r.material_type}</TableCell>
                          <TableCell className="text-right num">{fmtKg(r.required_kg)}</TableCell>
                          <TableCell className="text-right num">{fmtKg(r.available_kg)}</TableCell>
                          <TableCell className={r.shortage_kg > 0 ? "text-right num text-destructive font-semibold" : "text-right num text-muted-foreground"}>{r.shortage_kg > 0 ? fmtKg(r.shortage_kg) : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
          <div className="flex flex-wrap gap-2 mb-6">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} <Save className="h-4 w-4" /> Save Plan
            </Button>
          </div>
        </>
      )}

      <Card>
        <CardHeader><CardTitle>Recent plans</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(plans ?? []).length === 0 ? <p className="p-6 text-sm text-muted-foreground">No plans yet.</p> : (
            <Table>
              <TableHeader><TableRow><TableHead>Plan</TableHead><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead>Planned</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {plans?.map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.plan_number}</TableCell>
                    <TableCell>{p.products?.product_name}</TableCell>
                    <TableCell className="text-right num">{fmtNum(p.planned_quantity)}</TableCell>
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