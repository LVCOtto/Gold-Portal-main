import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ExternalLink, Shield, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import lvcLogo from "@assets/logo.png";

const emailSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

const loginSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6 digit code"),
});

type EmailForm = z.infer<typeof emailSchema>;
type LoginForm = z.infer<typeof loginSchema>;

export default function AdminLoginPage() {
  const { requestAdminOtp, verifyAdminOtp } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<"email" | "code">("email");
  const [pendingEmail, setPendingEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const emailForm = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      code: "",
    },
  });

  async function sendCode(data: EmailForm) {
    setIsSending(true);
    try {
      await requestAdminOtp(data.email);
      setPendingEmail(data.email);
      setStep("code");
      form.reset({ code: "" });
      toast({
        title: "Code sent",
        description: `Check ${data.email} for your admin login code.`,
      });
    } catch (error) {
      toast({
        title: "Code not sent",
        description: error instanceof Error ? error.message : "Unable to send admin login code",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  }

  async function onSubmit(data: LoginForm) {
    setIsVerifying(true);
    try {
      await verifyAdminOtp(data.code);
    } catch (error) {
      toast({
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid login code",
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  }

  const isBusy = isSending || isVerifying;

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="flex items-center justify-between p-6 bg-background border-b">
        <a 
          href="https://lvcuk.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <img src={lvcLogo} alt="LVC UK" className="h-10" />
        </a>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-4">
              <Shield className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Admin Portal</h1>
            <p className="text-muted-foreground">Manage accounts and system settings</p>
          </div>
          
          <Card className="shadow-lg">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">{step === "email" ? "Admin Sign In" : "Enter Code"}</CardTitle>
              <CardDescription>
                {step === "email"
                  ? "Enter your admin email address to receive a login code"
                  : `Enter the 6-digit code sent to ${pendingEmail}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {step === "email" ? (
                <Form {...emailForm}>
                  <form onSubmit={emailForm.handleSubmit(sendCode)} className="space-y-5" autoComplete="on">
                    <FormField
                      control={emailForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                type="email"
                                autoComplete="email"
                                placeholder="you@example.com"
                                className="h-11 pl-9"
                                {...field}
                                data-testid="input-admin-email"
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full h-11 text-base font-medium"
                      disabled={isBusy}
                      data-testid="button-send-admin-code"
                    >
                      {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Send Code
                    </Button>
                  </form>
                </Form>
              ) : (
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Login Code</FormLabel>
                          <FormControl>
                            <Input
                              inputMode="numeric"
                              autoComplete="one-time-code"
                              placeholder="000000"
                              maxLength={6}
                              {...field}
                              onChange={(event) => field.onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
                              className="h-11 text-center text-lg tracking-[0.3em]"
                              data-testid="input-admin-otp"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full h-11 text-base font-medium"
                      disabled={isBusy}
                      data-testid="button-admin-login"
                    >
                      {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                      Sign In
                    </Button>
                    <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={() => setStep("email")}>
                      Use a Different Email
                    </Button>
                  </form>
                </Form>
              )}

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <Link href="/" className="hover:text-foreground transition-colors" data-testid="link-customer-login">
                  Customer Login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="py-6 px-6 border-t bg-background">
        <div className="max-w-md mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <p>LVC UK Ltd</p>
          <a 
            href="https://lvcuk.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            Visit our website
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
