import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/inventory/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { audit } from "@/lib/inventory/audit";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data,
  });
  const [state, setState] = useState({ factory_name: "", currency_symbol: "₹", wastage_alert_threshold: 10, low_stock_raw_threshold: 50 });
  useEffect(() => { if (data) setState({ factory_name: data.factory_name, currency_symbol: data.currency_symbol, wastage_alert_threshold: Number(data.wastage_alert_threshold), low_stock_raw_threshold: Number(data.low_stock_raw_threshold) }); }, [data]);

  const save = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("app_settings").update(state).eq("id", 1); if (error) throw error; },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["app_settings"] }); audit("update", "app_settings"); },
    onError: (e: any) => toast.error(e.message ?? "Save failed"),
  });

  return (
    <div>
      <PageHeader title="Settings" subtitle="Factory-wide configuration" />
      <Card className="max-w-2xl">
        <CardHeader><CardTitle>General</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div><Label className="label-caps">Factory name</Label><Input value={state.factory_name} onChange={(e) => setState({ ...state, factory_name: e.target.value })} className="mt-1" /></div>
          <div><Label className="label-caps">Currency symbol</Label><Input value={state.currency_symbol} onChange={(e) => setState({ ...state, currency_symbol: e.target.value })} className="mt-1 w-24" /></div>
          <div><Label className="label-caps">Wastage alert threshold (%)</Label><Input type="number" step="0.1" value={state.wastage_alert_threshold} onChange={(e) => setState({ ...state, wastage_alert_threshold: Number(e.target.value) })} className="mt-1 w-32" /></div>
          <div><Label className="label-caps">Low stock raw material threshold (kg)</Label><Input type="number" step="0.1" value={state.low_stock_raw_threshold} onChange={(e) => setState({ ...state, low_stock_raw_threshold: Number(e.target.value) })} className="mt-1 w-32" /></div>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</Button>
        </CardContent>
      </Card>
    </div>
  );
}
