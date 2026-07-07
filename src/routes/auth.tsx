import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Factory } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/" });
  },
  component: AuthPage,
});

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Minimum 6 characters"),
});
type FormValues = z.infer<typeof schema>;

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left — quiet, plain. */}
      <div className="hidden lg:flex flex-col bg-secondary border-r border-border p-10">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded bg-primary text-primary-foreground flex items-center justify-center">
            <Factory className="h-4 w-4" />
          </div>
          <span className="text-[14px] font-semibold tracking-[-0.005em]">Traceability</span>
        </div>
        <div className="flex-1 flex flex-col justify-center max-w-sm">
          <h1 className="text-[20px] font-semibold tracking-[-0.01em] leading-snug">
            From raw material to finished product — every batch captured.
          </h1>
          <p className="mt-3 text-[13.5px] text-muted-foreground leading-relaxed">
            Track vendor sources, monitor wastage, plan production, and trace any finished unit back to its origin in seconds.
          </p>
          <ul className="mt-6 space-y-1.5 text-[13px] text-muted-foreground">
            <li>· Forward and backward batch traceability</li>
            <li>· FIFO allocation with automatic stock deductions</li>
            <li>· Wastage logging and threshold alerts</li>
            <li>· Recall cascades across part and production batches</li>
          </ul>
        </div>
        <div className="text-[11px] text-muted-foreground">© {new Date().getFullYear()} Traceability · v1.0</div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-[16px]">Sign in to your account</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={mode} onValueChange={(v) => setMode(v as "signin" | "signup")}>
              <TabsList className="grid w-full grid-cols-2 h-8">
                <TabsTrigger value="signin" className="text-[12.5px]">Sign in</TabsTrigger>
                <TabsTrigger value="signup" className="text-[12.5px]">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-4"><AuthForm mode="signin" /></TabsContent>
              <TabsContent value="signup" className="mt-4"><AuthForm mode="signup" /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function AuthForm({ mode }: { mode: "signin" | "signup" }) {
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });
  const [loading, setLoading] = useState(false);

  async function onSubmit(v: FormValues) {
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword(v);
        if (error) throw error;
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email: v.email,
          password: v.password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        toast.success("Check your inbox to confirm your email — or sign in if confirmations are disabled.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-[12px] text-muted-foreground">Email</Label>
        <Input type="email" {...form.register("email")} className="h-9 text-[13px]" placeholder="you@company.com" />
        {form.formState.errors.email && <p className="text-[11px] text-destructive">{form.formState.errors.email.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-[12px] text-muted-foreground">Password</Label>
        <Input type="password" {...form.register("password")} className="h-9 text-[13px]" placeholder="••••••••" />
        {form.formState.errors.password && <p className="text-[11px] text-destructive">{form.formState.errors.password.message}</p>}
      </div>
      <Button type="submit" className="w-full h-9 text-[13px]" disabled={loading}>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
    </form>
  );
}
