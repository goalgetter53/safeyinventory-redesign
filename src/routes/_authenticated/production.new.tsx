import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle2, AlertTriangle, PackagePlus } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { PartProduceDialog } from "@/components/inventory/part-produce-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { fmtKg, fmtNum, WASTAGE_REASONS, fmtDate } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/production/new")({
  component: NewProductionWizard,
});

type Allocation = { part_batch_id: string; batch_number: string; quantity: number };
type PartPlan = { part_id: string; part_name: string; required: number; available: number; allocations: Allocation[]; consumption_per_unit_kg: number };

function NewProductionWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<number>(100);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<PartPlan[]>([]);
  const [extraRmId, setExtraRmId] = useState<string>("none");
  const [actualExtraKg, setActualExtraKg] = useState<number>(0);
  const [wasteReason, setWasteReason] = useState<string>("setup_loss");
  const [wasteNotes, setWasteNotes] = useState("");
  const [producePart, setProducePart] = useState<any | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successBatch, setSuccessBatch] = useState<string | null>(null);

  const { data: products } = useQuery({ queryKey: ["products", "active"], queryFn: async () => (await supabase.from("products").select("*").eq("is_active", true).order("product_name")).data ?? [] });
  const { data: rms } = useQuery({ queryKey: ["raw_materials", "active"], queryFn: async () => (await supabase.from("raw_materials").select("id, batch_number, material_type, remaining_quantity_kg, vendors(name)").eq("is_blocked", false).gt("remaining_quantity_kg", 0).order("purchase_date")).data ?? [] });

  const expectedRawTotal = useMemo(() => plan.reduce((s, p) => s + p.required * p.consumption_per_unit_kg, 0), [plan]);

  const calculate = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Pick a product");
      const [{ data: bom }, { data: partsData }, { data: batches }] = await Promise.all([
        supabase.from("product_bom").select("*, parts(*)").eq("product_id", productId),
        supabase.from("parts").select("*"),
        supabase.from("part_batches").select("id, batch_number, part_id, quantity, created_at").eq("is_blocked", false).order("created_at"),
      ]);
      if (!bom || bom.length === 0) throw new Error("This product has no BOM. Edit it first.");
      const partsById = new Map((partsData ?? []).map((p: any) => [p.id, p]));
      const batchesByPart = new Map<string, any[]>();
      (batches ?? []).forEach((b: any) => { const arr = batchesByPart.get(b.part_id) ?? []; arr.push(b); batchesByPart.set(b.part_id, arr); });

      // consumed units per batch already tallied via parts.current_stock, but we need per-batch remaining for FIFO allocation. Approximate: use parts.current_stock proportionally; but the simpler correct approach is to allocate by production_batch_parts joined against batches. For MVP, use batch.quantity minus what junction says was used.
      const { data: used } = await supabase.from("production_batch_parts").select("part_batch_id, quantity_used");
      const usedByBatch = new Map<string, number>();
      (used ?? []).forEach((u: any) => usedByBatch.set(u.part_batch_id, (usedByBatch.get(u.part_batch_id) ?? 0) + Number(u.quantity_used)));

      return bom.map((row: any): PartPlan => {
        const p: any = partsById.get(row.part_id);
        const required = qty * Number(row.quantity_required);
        const available = Number(p?.current_stock ?? 0);
        const partBatches = batchesByPart.get(row.part_id) ?? [];
        // FIFO allocate
        let remaining = Math.min(required, available);
        const allocations: Allocation[] = [];
        for (const b of partBatches) {
          const batchRemaining = Number(b.quantity) - (usedByBatch.get(b.id) ?? 0);
          if (batchRemaining <= 0) continue;
          const take = Math.min(remaining, batchRemaining);
          if (take > 0) { allocations.push({ part_batch_id: b.id, batch_number: b.batch_number, quantity: take }); remaining -= take; }
          if (remaining <= 0) break;
        }
        return { part_id: row.part_id, part_name: p?.part_name ?? "", required, available, allocations, consumption_per_unit_kg: Number(p?.consumption_per_unit_kg ?? 0) };
      });
    },
    onSuccess: (data) => { setPlan(data); setStep(2); },
    onError: (e: any) => toast.error(e.message ?? "Calculation failed"),
  });

  const hasShortage = plan.some((p) => p.required > p.available);

  const submit = useMutation({
    mutationFn: async () => {
      const expected = expectedRawTotal;
      const actual = actualExtraKg > 0 ? expected + Math.max(0, actualExtraKg - 0) : expected;
      const insertPayload: any = {
        batch_number: "",
        product_id: productId,
        quantity_produced: qty,
        expected_raw_material_kg: expected,
        actual_raw_material_kg: actualExtraKg > 0 ? actualExtraKg : expected,
        production_date: date,
        status: "completed",
        notes: notes || null,
        wastage_reason: (actualExtraKg > expected) ? wasteReason : null,
        wastage_notes: wasteNotes || null,
        extra_raw_material_batch_id: extraRmId !== "none" ? extraRmId : null,
      };
      const { data: batch, error } = await supabase.from("production_batches").insert(insertPayload).select("id, batch_number").single();
      if (error) throw error;

      const junction = plan.flatMap((p) => p.allocations.map((a) => ({ production_batch_id: batch.id, part_batch_id: a.part_batch_id, quantity_used: a.quantity })));
      if (junction.length > 0) {
        const { error: jerr } = await supabase.from("production_batch_parts").insert(junction);
        if (jerr) throw jerr;
      }
      return batch.batch_number;
    },
    onSuccess: (batch) => { toast.success(`Production complete: ${batch}`); audit("create", "production_batch", batch); setSuccessBatch(batch); setConfirmOpen(false); },
    onError: (e: any) => { toast.error(e.message ?? "Production failed"); setConfirmOpen(false); },
  });

  const productName = products?.find((p: any) => p.id === productId)?.product_name;

  return (
    <div>
      <PageHeader
        title="New Production"
        subtitle={`Step ${step} of 4`}
        actions={<Button asChild variant="outline"><Link to="/production"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>}
      />

      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4].map((n) => <div key={n} className={cn("h-1.5 flex-1 rounded-full", step >= n ? "bg-primary" : "bg-muted")} />)}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Select product</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-xl">
            <div>
              <Label className="label-caps">Product *</Label>
              <Select value={productId} onValueChange={setProductId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a product" /></SelectTrigger>
                <SelectContent>{products?.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.product_name} ({p.product_code})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-caps">Quantity to produce *</Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1" />
            </div>
            <div>
              <Label className="label-caps">Production date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="label-caps">Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
            </div>
            <Button size="lg" onClick={() => calculate.mutate()} disabled={!productId || qty <= 0 || calculate.isPending}>
              {calculate.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Calculate requirements
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Requirements summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead>Required</TableHead><TableHead>Available</TableHead><TableHead>Shortage</TableHead></TableRow></TableHeader>
              <TableBody>
                {plan.map((p) => {
                  const shortage = Math.max(0, p.required - p.available);
                  return (
                    <TableRow key={p.part_id} className={shortage > 0 ? "bg-destructive/10" : ""}>
                      <TableCell className="font-medium">{p.part_name}</TableCell>
                      <TableCell>{fmtNum(p.required)}</TableCell>
                      <TableCell>{fmtNum(p.available)}</TableCell>
                      <TableCell className={shortage > 0 ? "text-destructive font-semibold" : ""}>
                        {shortage > 0 ? <><AlertTriangle className="h-4 w-4 inline" /> {fmtNum(shortage)}</> : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className="text-sm">Total expected raw material: <strong>{fmtKg(expectedRawTotal)}</strong></div>

            {hasShortage ? (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Insufficient parts available</AlertTitle>
                <AlertDescription className="space-y-2">
                  {plan.filter((p) => p.required > p.available).map((p) => (
                    <div key={p.part_id}>Required: {fmtNum(p.required)} {p.part_name}, Available: {fmtNum(p.available)}, Shortage: {fmtNum(p.required - p.available)}</div>
                  ))}
                  <div className="flex gap-2 mt-2">
                    {plan.filter((p) => p.required > p.available).map((p) => (
                      <Button key={p.part_id} size="sm" variant="outline" onClick={() => setProducePart({ id: p.part_id, part_name: p.part_name, consumption_per_unit_kg: p.consumption_per_unit_kg, material_type: null })}>
                        <PackagePlus className="h-3 w-3" /> Produce {p.part_name}
                      </Button>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => calculate.mutate()}>Re-check</Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-success/40 bg-success/10 text-success-foreground">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle className="text-foreground">All parts available.</AlertTitle>
              </Alert>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={hasShortage}>Next: allocate batches</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Part batch allocation (FIFO)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {plan.map((p) => (
              <div key={p.part_id}>
                <div className="font-medium">{p.part_name} — {fmtNum(p.required)} required</div>
                <ul className="mt-2 space-y-1 text-sm">
                  {p.allocations.length === 0 ? <li className="text-muted-foreground">No allocations</li> :
                    p.allocations.map((a) => <li key={a.part_batch_id} className="flex justify-between border rounded-md p-2"><span>{a.batch_number}</span><span>{fmtNum(a.quantity)}</span></li>)}
                </ul>
              </div>
            ))}
            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)}>Next: final entry</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>Final production entry</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <div className="border rounded-md p-4 text-sm space-y-1">
              <div><span className="text-muted-foreground">Product:</span> <strong>{productName}</strong></div>
              <div><span className="text-muted-foreground">Quantity:</span> <strong>{fmtNum(qty)}</strong></div>
              <div><span className="text-muted-foreground">Date:</span> <strong>{fmtDate(date)}</strong></div>
              <div><span className="text-muted-foreground">Expected raw material (from parts):</span> <strong>{fmtKg(expectedRawTotal)}</strong></div>
            </div>

            <div>
              <div className="label-caps">Additional raw material consumption (optional)</div>
              <p className="text-xs text-muted-foreground mb-2">For consumables like glue or labels beyond the parts consumed.</p>
              <div className="grid grid-cols-2 gap-3">
                <Select value={extraRmId} onValueChange={setExtraRmId}>
                  <SelectTrigger><SelectValue placeholder="No extra raw material" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {rms?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.batch_number} · {r.material_type} · {fmtKg(r.remaining_quantity_kg)} left</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" step="0.001" min={0} value={actualExtraKg} onChange={(e) => setActualExtraKg(Number(e.target.value))} placeholder="Actual kg used" />
              </div>
            </div>

            {actualExtraKg > 0 && (
              <>
                <div>
                  <Label className="label-caps">Wastage reason</Label>
                  <Select value={wasteReason} onValueChange={setWasteReason}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{WASTAGE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-caps">Wastage notes</Label>
                  <Textarea rows={2} value={wasteNotes} onChange={(e) => setWasteNotes(e.target.value)} className="mt-1" />
                </div>
              </>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={() => setConfirmOpen(true)}>Complete production</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete production?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deduct part stock and create production batch for {fmtNum(qty)} × {productName}. Proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!successBatch} onOpenChange={(o) => { if (!o) navigate({ to: "/production" }); }}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-6 w-6 text-success" /> Production complete</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <div>New batch: <strong>{successBatch}</strong></div>
            <div className="text-muted-foreground">Stock deducted, wastage logged, alerts raised if applicable.</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSuccessBatch(null); setStep(1); setProductId(""); setPlan([]); }}>Start Another</Button>
            <Button onClick={() => navigate({ to: "/production" })}>View Details</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PartProduceDialog open={!!producePart} onOpenChange={(o) => { if (!o) { setProducePart(null); calculate.mutate(); } }} part={producePart} />
    </div>
  );
}
