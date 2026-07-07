import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WASTAGE_REASONS, fmtDate, fmtKg, fmtNum } from "@/lib/inventory/format";
import { audit } from "@/lib/inventory/audit";
import { cn } from "@/lib/utils";

const schema = z.object({
  quantity: z.coerce.number().positive(),
  raw_material_batch_id: z.string().uuid(),
  actual_usage_kg: z.coerce.number().min(0),
  wastage_reason: z.enum(["machine_issue", "operator_error", "material_defect", "setup_loss", "other"]),
  wastage_notes: z.string().optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

export function PartProduceDialog({ open, onOpenChange, part }: { open: boolean; onOpenChange: (o: boolean) => void; part: any | null }) {
  const [step, setStep] = useState(1);
  const qc = useQueryClient();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { quantity: 100, raw_material_batch_id: "", actual_usage_kg: 0, wastage_reason: "setup_loss", wastage_notes: "" },
  });

  const { data: rmBatches } = useQuery({
    queryKey: ["raw_materials", "for-part", part?.material_type],
    enabled: !!part && open,
    queryFn: async () => (await supabase.from("raw_materials").select("*, vendors(name)").eq("material_type", part.material_type).eq("is_blocked", false).gt("remaining_quantity_kg", 0).order("purchase_date")).data ?? [],
  });

  const values = form.watch();
  const expected = useMemo(() => Number(values.quantity || 0) * Number(part?.consumption_per_unit_kg || 0), [values.quantity, part]);
  const wastage = Number(values.actual_usage_kg || 0) - expected;
  const wastagePct = expected > 0 ? (wastage / expected) * 100 : 0;
  const selectedRm = rmBatches?.find((r: any) => r.id === values.raw_material_batch_id);

  const submit = useMutation({
    mutationFn: async (v: FormValues) => {
      const { data, error } = await supabase.from("part_batches").insert({
        batch_number: "",
        part_id: part.id,
        quantity: v.quantity,
        raw_material_batch_id: v.raw_material_batch_id,
        expected_usage_kg: expected,
        actual_usage_kg: v.actual_usage_kg,
        wastage_reason: v.wastage_reason,
        wastage_notes: v.wastage_notes || null,
      }).select("batch_number").single();
      if (error) throw error;
      return data.batch_number;
    },
    onSuccess: (batch) => {
      toast.success(`Part batch created: ${batch}`);
      qc.invalidateQueries();
      audit("create", "part_batch", batch);
      reset();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  function reset() { onOpenChange(false); setStep(1); form.reset(); }

  if (!part) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? undefined : reset())}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Produce {part.part_name}</DialogTitle>
          <div className="flex items-center gap-2 pt-2">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className={cn("h-1.5 flex-1 rounded-full", step >= n ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-1">Step {step} of 4</p>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="label-caps">Quantity to produce *</Label>
              <Input type="number" min={1} {...form.register("quantity")} className="mt-1" />
              <p className="text-xs text-muted-foreground mt-1">Expected raw material: {fmtKg(expected, 3)} ({fmtKg(part.consumption_per_unit_kg, 4)}/unit)</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={reset}>Cancel</Button>
              <Button onClick={() => setStep(2)} disabled={!(values.quantity > 0)}>Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <Label className="label-caps">Source raw material batch (FIFO) *</Label>
              <Select value={values.raw_material_batch_id} onValueChange={(v) => form.setValue("raw_material_batch_id", v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Choose batch" /></SelectTrigger>
                <SelectContent>
                  {(rmBatches ?? []).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.batch_number} · {r.vendors?.name} · {fmtKg(r.remaining_quantity_kg)} left · {fmtDate(r.purchase_date)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedRm && Number(selectedRm.remaining_quantity_kg) < expected && (
                <Alert className="mt-3" variant="destructive"><AlertDescription>Selected batch has only {fmtKg(selectedRm.remaining_quantity_kg)}, expected usage is {fmtKg(expected)}.</AlertDescription></Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => { form.setValue("actual_usage_kg", expected); setStep(3); }} disabled={!values.raw_material_batch_id}>Next</Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label className="label-caps">Actual usage (kg) *</Label>
              <Input type="number" step="0.001" {...form.register("actual_usage_kg")} className="mt-1" />
              <p className={cn("text-xs mt-1", wastage < 0 ? "text-warning" : wastagePct > 10 ? "text-destructive" : "text-muted-foreground")}>
                Wastage: {fmtKg(wastage, 3)} ({wastagePct.toFixed(2)}%)
              </p>
            </div>
            <div>
              <Label className="label-caps">Wastage reason *</Label>
              <Select value={values.wastage_reason} onValueChange={(v) => form.setValue("wastage_reason", v as any)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{WASTAGE_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-caps">Notes</Label>
              <Textarea rows={2} {...form.register("wastage_notes")} className="mt-1" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={() => setStep(4)} disabled={values.actual_usage_kg < 0}>Review</Button>
            </DialogFooter>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="border rounded-md p-4 space-y-2 text-sm">
              <Row label="Part" value={part.part_name} />
              <Row label="Quantity" value={fmtNum(values.quantity)} />
              <Row label="Raw material" value={selectedRm?.batch_number ?? "—"} />
              <Row label="Expected" value={fmtKg(expected, 3)} />
              <Row label="Actual" value={fmtKg(values.actual_usage_kg, 3)} />
              <Row label="Wastage" value={`${fmtKg(wastage, 3)} (${wastagePct.toFixed(2)}%)`} />
              <Row label="Reason" value={WASTAGE_REASONS.find((r) => r.value === values.wastage_reason)?.label ?? "—"} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <Button onClick={() => submit.mutate(values)} disabled={submit.isPending}>
                {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirm production
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
