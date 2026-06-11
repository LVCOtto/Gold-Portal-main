import { useRef, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, ExternalLink, Mail, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import lvcLogo from "@assets/logo.png";

const loginSchema = z.object({
  accountCode: z.string().min(1, "Account code is required"),
  email: z.string().email("Enter a valid email address"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { requestCustomerOtp, verifyCustomerOtp } = useAuth();
  const { toast } = useToast();
  const [codeSent, setCodeSent] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [loginCodeError, setLoginCodeError] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      accountCode: "",
      email: "",
    },
  });

  async function sendCode(data: LoginForm) {
    setIsSending(true);
    try {
      await requestCustomerOtp(data);
      setCodeSent(true);
      setLoginCode("");
      setLoginCodeError("");
      setTimeout(() => codeInputRef.current?.focus(), 0);
      toast({
        title: "Code sent",
        description: "Check your email for your customer login code.",
      });
    } catch (error) {
      toast({
        title: "Code not sent",
        description: error instanceof Error ? error.message : "Unable to send login code",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!/^\d{6}$/.test(loginCode)) {
      setLoginCodeError("Enter the 6 digit code");
      return;
    }

    setIsVerifying(true);
    try {
      await verifyCustomerOtp(loginCode);
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
            <h1 className="text-3xl font-bold text-foreground mb-2">Customer Portal</h1>
            <p className="text-muted-foreground">Track your jobs, quotes and orders</p>
          </div>
          
          <Card className="shadow-lg">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-xl">Sign In</CardTitle>
              <CardDescription>
                Enter your account code and approved email
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!codeSent ? (
              <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(sendCode)} className="space-y-5">
                  <FormField
                    control={loginForm.control}
                    name="accountCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Account Code</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="e.g., ACME001" 
                            {...field} 
                            className="h-11"
                            data-testid="input-account-code"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={loginForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input 
                            type="email" 
                            placeholder="name@example.com"
                            {...field} 
                            className="h-11"
                            data-testid="input-email"
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
                    data-testid="button-send-customer-code"
                  >
                    {isSending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                    Send Code
                  </Button>
                </form>
              </Form>
              ) : (
                <form onSubmit={verifyCode} className="space-y-5" autoComplete="off">
                  <div className="space-y-2">
                    <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="customer-login-otp">
                      Login Code
                    </label>
                    <Input
                      ref={codeInputRef}
                      id="customer-login-otp"
                      key="customer-login-otp"
                      name="customer-login-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder="000000"
                      maxLength={6}
                      value={loginCode}
                      onChange={(event) => {
                        setLoginCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                        setLoginCodeError("");
                      }}
                      onFocus={(event) => event.currentTarget.select()}
                      className="h-11 text-center text-lg tracking-[0.3em]"
                      disabled={isBusy}
                      data-testid="input-customer-otp"
                    />
                    {loginCodeError && <p className="text-sm font-medium text-destructive">{loginCodeError}</p>}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 text-base font-medium"
                    disabled={isBusy}
                    data-testid="button-customer-login"
                  >
                    {isVerifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                    Sign In
                  </Button>
                  <Button type="button" variant="outline" className="w-full" disabled={isBusy} onClick={loginForm.handleSubmit(sendCode)}>
                    Send New Code
                  </Button>
                </form>
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
