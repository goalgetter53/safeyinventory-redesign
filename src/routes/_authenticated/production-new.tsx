import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { fmtKg, fmtNum, fmtDate } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/production-new")({
  component: NewProductionWizard,
});

type BatchAvail = { part_batch_id: string; batch_number: string; quantity: number; remaining: number; created_at: string };
type PartAvail = { part_id: string; part_name: string; available: number; batches: BatchAvail[] };
type Allocation = { part_batch_id: string; batch_number: string; quantity: number };
type PartPlan = { part_id: string; part_name: string; required: number; available: number; allocations: Allocation[]; consumption_per_unit_kg: number };

const TOTAL_STEPS = 5;

function NewProductionWizard() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [productId, setProductId] = useState<string>("");
  const [qty, setQty] = useState<number>(100);
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState<PartPlan[]>([]);
  const [partAvail, setPartAvail] = useState<PartAvail[]>([]);
  const [producePart, setProducePart] = useState<any | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successBatch, setSuccessBatch] = useState<string | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products", "active"],
    staleTime: 5 * 60_000,
    queryFn: async () => (await supabase.from("products").select("id,product_name,product_code").eq("is_active", true).order("product_name")).data ?? [],
  });

  const productName = products?.find((p: any) => p.id === productId)?.product_name;

  // canNext for each step
  const canNext = useMemo(() => {
    if (step === 1) return !!productId && qty > 0;
    if (step === 2) return plan.length > 0 && plan.every((p) => p.required <= p.available);
    if (step === 3) return plan.every((p) => p.allocations.reduce((s, a) => s + a.quantity, 0) >= p.required);
    if (step === 4) return true;
    return true;
  }, [step, productId, qty, plan]);

  const calculate = useMutation({
    mutationFn: async () => {
      if (!productId) throw new Error("Pick a product");
      const { data: bom, error: bomErr } = await supabase.from("product_bom").select("part_id, quantity_required, parts(id, part_name, consumption_per_unit_kg)").eq("product_id", productId);
      if (bomErr) throw bomErr;
      if (!bom || bom.length === 0) throw new Error("This product has no BOM. Edit it first.");

      const partIds = bom.map((b: any) => b.part_id);
      const { data: availRows, error: availErr } = await supabase.rpc("get_part_availability", { p_part_ids: partIds });
      if (availErr) throw availErr;
      const avail = (availRows ?? []) as PartAvail[];
      setPartAvail(avail);

      return bom.map((row: any): PartPlan => {
        const a = avail.find((x) => x.part_id === row.part_id);
        const required = qty * Number(row.quantity_required);
        const available = Number(a?.available ?? 0);
        return {
          part_id: row.part_id,
          part_name: row.parts?.part_name ?? a?.part_name ?? "—",
          required,
          available,
          allocations: [],
          consumption_per_unit_kg: Number(row.parts?.consumption_per_unit_kg ?? 0),
        };
      });
    },
    onSuccess: (data) => { setPlan(data); setStep(2); },
    onError: (e: any) => toast.error(e.message ?? "Calculation failed"),
  });

  const expectedRawTotal = useMemo(() => plan.reduce((s, p) => s + p.required * p.consumption_per_unit_kg, 0), [plan]);

  const setAllocation = (partIdx: number, batchIdx: number, qty: number) => {
    setPlan((prev) => {
      const next = [...prev];
      const p = { ...next[partIdx] };
      const a = [...p.allocations];
      a[batchIdx] = { ...a[batchIdx], quantity: Math.max(0, qty) };
      p.allocations = a;
      next[partIdx] = p;
      return next;
    });
  };

  const autoAllocateFifo = (partIdx: number) => {
    const p = plan[partIdx];
    const a = partAvail.find((x) => x.part_id === p.part_id);
    if (!a) return;
    const batches = a.batches.filter((b) => b.remaining > 0).sort((x, y) => x.created_at.localeCompare(y.created_at));
    let remaining = p.required;
    const allocs: Allocation[] = [];
    for (const b of batches) {
      const take = Math.min(remaining, b.remaining);
      if (take > 0) { allocs.push({ part_batch_id: b.part_batch_id, batch_number: b.batch_number, quantity: take }); remaining -= take; }
      if (remaining <= 0) break;
    }
    setPlan((prev) => {
      const next = [...prev];
      next[partIdx] = { ...next[partIdx], allocations: allocs };
      return next;
    });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const picks = plan.flatMap((p) => p.allocations.map((a) => ({ part_batch_id: a.part_batch_id, quantity_used: a.quantity })));
      const { data, error } = await supabase.rpc("commit_production", {
        p_product_id: productId,
        p_quantity_produced: qty,
        p_production_date: date,
        p_expected_raw_kg: expectedRawTotal,
        p_actual_raw_kg: expectedRawTotal,
        p_notes: notes || null,
        p_picks: picks,
      });
      if (error) throw error;
      return (data as any).batch_number as string;
    },
    onSuccess: (batch) => {
      toast.success(`Production complete: ${batch}`);
      audit("create", "production_batch", batch);
      qc.invalidateQueries({ queryKey: ["production_batches"] });
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      setSuccessBatch(batch);
      setConfirmOpen(false);
    },
    onError: (e: any) => { toast.error(e.message ?? "Production failed"); setConfirmOpen(false); },
  });

  const hasShortage = plan.some((p) => p.required > p.available);

  return (
    <div>
      <PageHeader
        title="New Production"
        subtitle={`Step ${step} of ${TOTAL_STEPS}`}
        actions={<Button asChild variant="outline"><Link to="/production"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>}
      />

      <div className="flex gap-2 mb-6">
        {Array.from({ length: TOTAL_STEPS }, (_, n) => n + 1).map((n) => (
          <div key={n} className={cn("h-1.5 flex-1 rounded-full", step >= n ? "bg-primary" : "bg-muted")} />
        ))}
      </div>

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle>Select product & quantity</CardTitle></CardHeader>
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
            <Button size="lg" onClick={() => calculate.mutate()} disabled={!productId || qty <= 0 || calculate.isPending}>
              {calculate.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Calculate requirements
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Availability check</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>Part</TableHead><TableHead className="text-right">Required</TableHead><TableHead className="text-right">Available</TableHead><TableHead className="text-right">Shortage</TableHead></TableRow></TableHeader>
              <TableBody>
                {plan.map((p) => {
                  const shortage = Math.max(0, p.required - p.available);
                  return (
                    <TableRow key={p.part_id} className={shortage > 0 ? "bg-destructive/10" : ""}>
                      <TableCell className="font-medium">{p.part_name}</TableCell>
                      <TableCell className="text-right num">{fmtNum(p.required)}</TableCell>
                      <TableCell className="text-right num">{fmtNum(p.available)}</TableCell>
                      <TableCell className={cn("text-right num", shortage > 0 && "text-destructive font-semibold")}>
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
                <AlertTitle className="text-foreground">Ready to produce — all parts available.</AlertTitle>
              </Alert>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={hasShortage}>Next: pick batches</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Pick part batches</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Allocate quantity from each available batch. Sum per part must meet requirement.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            {plan.map((p, idx) => {
              const a = partAvail.find((x) => x.part_id === p.part_id);
              const allocated = p.allocations.reduce((s, x) => s + x.quantity, 0);
              const shortfall = p.required - allocated;
              const eligibleBatches = (a?.batches ?? []).filter((b) => b.remaining > 0);
              return (
                <div key={p.part_id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="font-medium">{p.part_name}</div>
                      <div className="text-xs text-muted-foreground">{fmtNum(p.required)} required · {fmtNum(allocated)} allocated</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {shortfall > 0 && <span className="text-xs text-destructive">Short {fmtNum(shortfall)}</span>}
                      <Button size="sm" variant="outline" onClick={() => autoAllocateFifo(idx)}>Auto (FIFO)</Button>
                    </div>
                  </div>
                  {eligibleBatches.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-2">No batches available.</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead className="text-right w-40">Allocate</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {eligibleBatches.map((b) => {
                          const allocIdx = p.allocations.findIndex((x) => x.part_batch_id === b.part_batch_id);
                          const val = allocIdx >= 0 ? p.allocations[allocIdx].quantity : 0;
                          return (
                            <TableRow key={b.part_batch_id}>
                              <TableCell className="font-medium">{b.batch_number}</TableCell>
                              <TableCell className="text-right num">{fmtNum(b.remaining)}</TableCell>
                              <TableCell className="text-right">
                                <Input
                                  type="number"
                                  min={0}
                                  max={b.remaining}
                                  step={1}
                                  value={val}
                                  onChange={(e) => {
                                    const q = Math.max(0, Math.min(b.remaining, Number(e.target.value)));
                                    setPlan((prev) => {
                                      const next = [...prev];
                                      const cp = { ...next[idx] };
                                      const ca = [...cp.allocations];
                                      if (allocIdx >= 0) ca[allocIdx] = { ...ca[allocIdx], quantity: q };
                                      else ca.push({ part_batch_id: b.part_batch_id, batch_number: b.batch_number, quantity: q });
                                      cp.allocations = ca;
                                      next[idx] = cp;
                                      return next;
                                    });
                                  }}
                                  className="h-8 text-right num w-32 inline-block"
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)} disabled={!canNext}>Next: date & notes</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader><CardTitle>Date & notes</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-xl">
            <div>
              <Label className="label-caps">Production date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="label-caps">Notes</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={() => setStep(5)}>Next: confirm</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 5 && (
        <Card>
          <CardHeader><CardTitle>Confirm production</CardTitle></CardHeader>
          <CardContent className="space-y-4 max-w-2xl">
            <div className="border rounded-md p-4 text-sm space-y-1">
              <div><span className="text-muted-foreground">Product:</span> <strong>{productName}</strong></div>
              <div><span className="text-muted-foreground">Quantity:</span> <strong>{fmtNum(qty)}</strong></div>
              <div><span className="text-muted-foreground">Date:</span> <strong>{fmtDate(date)}</strong></div>
              <div><span className="text-muted-foreground">Expected raw material:</span> <strong>{fmtKg(expectedRawTotal)}</strong></div>
              <div className="pt-2"><span className="text-muted-foreground">Part allocations:</span>
                <ul className="list-disc pl-6 mt-1">
                  {plan.map((p) => (
                    <li key={p.part_id}>{p.part_name}: {p.allocations.map((a) => `${a.batch_number} (${fmtNum(a.quantity)})`).join(", ")}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
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
              This will deduct part batches and create production batch for {fmtNum(qty)} × {productName}. Proceed?
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
            <div className="text-muted-foreground">Part batches decremented atomically; production_parts recorded for traceability.</div>
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