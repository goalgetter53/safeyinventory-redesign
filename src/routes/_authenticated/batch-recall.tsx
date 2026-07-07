import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ShieldAlert, Download, AlertTriangle, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { MaterialBadge } from "@/components/inventory/material-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtKg, fmtNum } from "@/lib/inventory/format";
import { downloadCsv } from "@/lib/inventory/csv";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/batch-recall")({
  component: BatchRecallPage,
});

function BatchRecallPage() {
  const qc = useQueryClient();
  const [rmId, setRmId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [recallDate, setRecallDate] = useState(new Date().toISOString().slice(0, 10));
  const [confirmText, setConfirmText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: rms } = useQuery({
    queryKey: ["raw_materials", "for-recall"],
    queryFn: async () => (await supabase.from("raw_materials").select("*, vendors(name)").eq("is_blocked", false).order("purchase_date", { ascending: false })).data ?? [],
  });

  const { data: trace, refetch: refetchTrace } = useQuery({
    queryKey: ["recall-trace", rmId],
    enabled: false,
    queryFn: async () => {
      const pbs = (await supabase.from("part_batches").select("*, parts(part_name), production_batch_parts(production_batches(id,batch_number,products(product_name),quantity_produced,production_date,status))").eq("raw_material_batch_id", rmId)).data ?? [];
      const prodSet = new Map<string, any>();
      pbs.forEach((pb: any) => (pb.production_batch_parts ?? []).forEach((pbp: any) => prodSet.set(pbp.production_batches?.id, pbp.production_batches)));
      return { pbs, productions: Array.from(prodSet.values()).filter(Boolean) };
    },
  });

  const { data: history } = useQuery({
    queryKey: ["recall-history"],
    queryFn: async () => (await supabase.from("raw_materials").select("*, vendors(name)").eq("is_blocked", true).order("updated_at", { ascending: false })).data ?? [],
  });

  const recall = useMutation({
    mutationFn: async () => {
      // updating is_blocked triggers cascade to part_batches + production_batches + alert
      const { error } = await supabase.from("raw_materials").update({ is_blocked: true, notes: reason ? `[RECALLED ${recallDate}] ${reason}` : `[RECALLED ${recallDate}]` }).eq("id", rmId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Recall processed — cascade applied"); qc.invalidateQueries(); audit("recall", "raw_material", rmId); setConfirmOpen(false); setConfirmText(""); setRmId(""); setReason(""); },
    onError: (e: any) => { toast.error(e.message ?? "Recall failed"); setConfirmOpen(false); },
  });

  const rm = rms?.find((r: any) => r.id === rmId);

  function exportAffected() {
    if (!trace) return;
    const rows = [
      ...trace.pbs.map((pb: any) => ({ kind: "part_batch", batch: pb.batch_number, part: pb.parts?.part_name, quantity: pb.quantity, date: fmtDate(pb.created_at) })),
      ...trace.productions.map((p: any) => ({ kind: "production_batch", batch: p.batch_number, product: p.products?.product_name, quantity: p.quantity_produced, date: fmtDate(p.production_date), status: p.status })),
    ];
    downloadCsv("recall_affected.csv", rows);
  }

  return (
    <div>
      <PageHeader title="Batch Recall" subtitle="Trace and quarantine defective raw materials and downstream products" />

      <Alert className="mb-6 border-warning/40 bg-warning/10">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Use with caution</AlertTitle>
        <AlertDescription>Recall marks the raw material as blocked and cascades to every affected part batch and production batch.</AlertDescription>
      </Alert>

      <Card className="mb-6">
        <CardHeader><CardTitle>Initiate recall</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="label-caps">Raw material batch</Label>
              <Select value={rmId} onValueChange={setRmId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select batch" /></SelectTrigger>
                <SelectContent>{rms?.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.batch_number} · {r.material_type} · {r.vendors?.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-caps">Recall date</Label>
              <Input type="date" value={recallDate} onChange={(e) => setRecallDate(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="label-caps">Recall reason *</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" />
          </div>
          <Button onClick={() => refetchTrace()} disabled={!rmId}><ShieldAlert className="h-4 w-4" /> Trace Affected Products</Button>
        </CardContent>
      </Card>

      {trace && rm && (
        <Card className="mb-6">
          <CardHeader><CardTitle>Trace results</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Raw material" value={rm.batch_number} />
              <Stat label="Affected part batches" value={String(trace.pbs.length)} />
              <Stat label="Affected production" value={String(trace.productions.length)} />
              <Stat label="Total affected units" value={fmtNum(trace.productions.reduce((s: number, p: any) => s + Number(p.quantity_produced), 0))} />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="label-caps mb-2">Part batches</div>
                {trace.pbs.length === 0 ? <p className="text-sm text-muted-foreground">None</p> :
                  <Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Part</TableHead><TableHead>Qty</TableHead></TableRow></TableHeader><TableBody>{trace.pbs.map((pb: any) => <TableRow key={pb.id}><TableCell>{pb.batch_number}</TableCell><TableCell>{pb.parts?.part_name}</TableCell><TableCell>{fmtNum(pb.quantity)}</TableCell></TableRow>)}</TableBody></Table>}
              </div>
              <div>
                <div className="label-caps mb-2">Production batches</div>
                {trace.productions.length === 0 ? <p className="text-sm text-muted-foreground">None</p> :
                  <Table><TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Product</TableHead><TableHead>Qty</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{trace.productions.map((p: any) => <TableRow key={p.id}><TableCell>{p.batch_number}</TableCell><TableCell>{p.products?.product_name}</TableCell><TableCell>{fmtNum(p.quantity_produced)}</TableCell><TableCell><Badge variant={p.status === "recalled" ? "destructive" : "secondary"}>{p.status}</Badge></TableCell></TableRow>)}</TableBody></Table>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-3 border-t">
              <Button variant="destructive" onClick={() => setConfirmOpen(true)}><ShieldAlert className="h-4 w-4" /> Mark All Affected as Recalled</Button>
              <Button variant="outline" onClick={exportAffected}><Download className="h-4 w-4" /> Export list</Button>
              <Button variant="ghost" onClick={() => toast.info("Notification queued (placeholder)")}>Notify team</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Recall history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(history ?? []).length === 0 ? <p className="p-6 text-sm text-muted-foreground">No recalls yet.</p> :
            <Table>
              <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Material</TableHead><TableHead>Vendor</TableHead><TableHead>Notes</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>
                {history?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.batch_number}</TableCell>
                    <TableCell><MaterialBadge material={r.material_type} /></TableCell>
                    <TableCell>{r.vendors?.name}</TableCell>
                    <TableCell className="text-xs truncate max-w-md">{r.notes}</TableCell>
                    <TableCell className="text-xs">{fmtDate(r.updated_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm recall</AlertDialogTitle>
            <AlertDialogDescription>
              This blocks the raw material and cascades to {trace?.pbs.length ?? 0} part batches and {trace?.productions.length ?? 0} production batches. Type <strong>RECALL</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RECALL" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => recall.mutate()} disabled={confirmText !== "RECALL" || recall.isPending} className="bg-destructive text-destructive-foreground">
              {recall.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Recall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="border rounded-md p-3"><div className="label-caps">{label}</div><div className="text-lg font-semibold mt-0.5">{value}</div></div>;
}
