import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ExternalLink, Wrench, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import lvcLogo from "@assets/logo.png";

const loginSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Enter the 6 digit code"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function WorkshopLoginPage() {
  const { requestWorkshopOtp, verifyWorkshopOtp } = useAuth();
  const { toast } = useToast();
  const [codeSent, setCodeSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      code: "",
    },
  });

  async function sendCode() {
    setIsSending(true);
    try {
      await requestWorkshopOtp();
      setCodeSent(true);
      form.reset({ code: "" });
      toast({
        title: "Code sent",
        description: "Check the configured workshop inbox for your login code.",
      });
    } catch (error) {
      toast({
        title: "Code not sent",
        description: error instanceof Error ? error.message : "Unable to send workshop login code",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  }

  async function onSubmit(data: LoginForm) {
    setIsVerifying(true);
    try {
      await verifyWorkshopOtp(data.code);
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
      <header className="flex items-center justify-between border-b bg-background p-6">
        <a href="https://lvcuk.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src={lvcLogo} alt="LVC UK" className="h-10" />
        </a>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Wrench className="h-7 w-7 text-primary" />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-foreground">Workshop T-Card System</h1>
            <p className="text-muted-foreground">Access the workshop board only</p>
          </div>

          <Card className="shadow-lg">
            <CardHeader className="pb-4 text-center">
              <CardTitle className="text-xl">Workshop Sign In</CardTitle>
              <CardDescription>Email code to the configured workshop inbox</CardDescription>
            </CardHeader>
            <CardContent>
              {!codeSent ? (
                <Button type="button" className="h-11 w-full text-base font-medium" disabled={isBusy} onClick={sendCode} data-testid="button-send-workshop-code">
                  {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                  Send Code
                </Button>
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
                              data-testid="input-workshop-otp"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button type="submit" className="h-11 w-full text-base font-medium" disabled={isBusy} data-testid="button-workshop-login">
                      {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                      Sign In
                    </Button>
                    <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={sendCode}>
                      Send New Code
                    </Button>
                  </form>
                </Form>
              )}

              <div className="mt-6 text-center text-sm text-muted-foreground">
                <Link href="/admin/login" className="hover:text-foreground transition-colors" data-testid="link-admin-login">
                  Admin Login
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="border-t bg-background px-6 py-6">
        <div className="mx-auto flex max-w-md flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <p>LVC UK Ltd</p>
          <a href="https://lvcuk.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
            Visit our website
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </footer>
    </div>
  );
}
