import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, MessageSquare, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useCommsAuth } from "@/lib/comms-auth";
import { ThemeToggle } from "@/components/theme-toggle";

const emailSchema = z.object({ email: z.string().email("Enter a valid email address") });
const codeSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

type EmailForm = z.infer<typeof emailSchema>;
type CodeForm = z.infer<typeof codeSchema>;

export default function CommsLoginPage() {
  const { requestOtp, verifyOtp } = useCommsAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "code">("email");
  const [pendingEmail, setPendingEmail] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const codeForm = useForm<CodeForm>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: "" },
  });

  async function onEmailSubmit(data: EmailForm) {
    setIsBusy(true);
    try {
      await requestOtp(data.email);
      setPendingEmail(data.email);
      setStep("code");
      codeForm.reset({ code: "" });
      toast({ title: "Code sent", description: `Check ${data.email} for your login code.` });
    } catch (err) {
      toast({ title: "Could not send code", description: err instanceof Error ? err.message : "Please try again", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  async function onCodeSubmit(data: CodeForm) {
    setIsBusy(true);
    try {
      await verifyOtp(data.code);
    } catch (err) {
      toast({ title: "Login failed", description: err instanceof Error ? err.message : "Invalid code", variant: "destructive" });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="flex items-center justify-between p-6 bg-background border-b">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span>Comms Portal</span>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
              <MessageSquare className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Comms Portal</h1>
            <p className="text-muted-foreground">Operator-only — automated job communications</p>
          </div>

          <Card className="shadow-lg">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">
                {step === "email" ? "Sign In" : "Enter Code"}
              </CardTitle>
              <CardDescription>
                {step === "email"
                  ? "Enter your operator email to receive a login code"
                  : `Enter the 6-digit code sent to ${pendingEmail}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === "email" ? (
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email address</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input type="email" placeholder="you@example.com" className="pl-9" {...field} />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={isBusy}>
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Send login code
                    </Button>
                  </form>
                </Form>
              ) : (
                <Form {...codeForm}>
                  <form onSubmit={codeForm.handleSubmit(onCodeSubmit)} className="space-y-4">
                    <FormField
                      control={codeForm.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Login code</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="123456"
                                className="pl-9 text-center text-xl tracking-[0.5em] font-mono"
                                {...field}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={isBusy}>
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Verify code
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full text-sm"
                      onClick={() => setStep("email")}
                      disabled={isBusy}
                    >
                      Use a different email
                    </Button>
                  </form>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
