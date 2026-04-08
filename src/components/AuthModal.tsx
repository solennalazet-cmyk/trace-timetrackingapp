import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { migrateAnonymousData } from "@/lib/migrate-anonymous";
import { toast } from "sonner";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onShowHowItWorks?: () => void;
}

const AuthModal = ({ open, onOpenChange, onShowHowItWorks }: AuthModalProps) => {
  const [tab, setTab] = useState<string>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);

  // Turnstile
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);

  // Sign up fields
  const [fullName, setFullName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showSignupPw, setShowSignupPw] = useState(false);

  // Log in fields
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPw, setShowLoginPw] = useState(false);

  // Forgot password
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const hasTurnstile = !!TURNSTILE_SITE_KEY;
  const isDarkMode = document.documentElement.classList.contains("dark");

  const resetFields = () => {
    setError("");
    setFullName("");
    setSignupEmail("");
    setSignupPassword("");
    setConfirmPassword("");
    setLoginEmail("");
    setLoginPassword("");
    setForgotEmail("");
    setForgotSent(false);
    setShowForgot(false);
    setTurnstileToken(null);
    setTurnstileError(false);
  };

  const resetTurnstile = () => {
    setTurnstileToken(null);
    turnstileRef.current?.reset();
  };

  const handleGoogleSSO = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setError("Something went wrong. Check your connection.");
    }
    setLoading(false);
  };

  const handleAppleSSO = async () => {
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      setError("Something went wrong. Check your connection.");
    }
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (signupPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (signupPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
        ...(hasTurnstile && turnstileToken ? { captchaToken: turnstileToken } : {}),
      },
    });

    resetTurnstile();

    if (authError) {
      if (authError.message.includes("captcha")) {
        setError("Security check failed. Please try again.");
      } else if (authError.message.includes("already registered")) {
        setError("An account with this email exists. Log in instead?");
      } else {
        setError(authError.message);
      }
      setLoading(false);
      return;
    }

    if (data.user) {
      await migrateAnonymousData(data.user.id);
      toast.success("Welcome to Trace. Your work has been saved.");
      resetFields();
      onOpenChange(false);
      onShowHowItWorks?.();
    }
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
      options: {
        ...(hasTurnstile && turnstileToken ? { captchaToken: turnstileToken } : {}),
      },
    });

    resetTurnstile();

    if (authError) {
      if (authError.message.includes("captcha")) {
        setError("Security check failed. Please try again.");
      } else {
        setError("Incorrect email or password.");
      }
      setLoading(false);
      return;
    }

    if (data.user) {
      await migrateAnonymousData(data.user.id);
      toast.success("Welcome back.");
      resetFields();
      onOpenChange(false);
    }
    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      forgotEmail,
      {
        redirectTo: `${window.location.origin}/reset-password`,
        ...(hasTurnstile && turnstileToken ? { captchaToken: turnstileToken } : {}),
      }
    );

    resetTurnstile();

    if (resetError) {
      if (resetError.message.includes("captcha")) {
        setError("Security check failed. Please try again.");
      } else {
        setError("Something went wrong. Check your connection.");
      }
    } else {
      setForgotSent(true);
    }
    setLoading(false);
  };

  const isSubmitDisabled = loading || (hasTurnstile && !turnstileToken);

  const renderTurnstile = () => {
    if (!hasTurnstile) return null;
    return (
      <div className="flex flex-col items-center gap-1">
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onSuccess={(token) => { setTurnstileToken(token); setTurnstileError(false); }}
          onExpire={() => setTurnstileToken(null)}
          onError={() => { setTurnstileToken(null); setTurnstileError(true); }}
          options={{ theme: isDarkMode ? "dark" : "light", size: "normal" }}
        />
        {turnstileError && (
          <p className="text-xs text-destructive">Security check unavailable. Please refresh.</p>
        )}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) resetFields();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-[380px] rounded-2xl p-0 overflow-hidden">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(""); setShowForgot(false); resetTurnstile(); }} className="w-full">
          <div className="px-6 pt-6">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
              <TabsTrigger value="login">Log In</TabsTrigger>
            </TabsList>
          </div>

          <div className="px-6 pb-6 pt-4">
            {/* Social SSO */}
            <div className="flex flex-col gap-2 mb-4">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGoogleSSO}
                disabled={loading}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleAppleSSO}
                disabled={loading}
              >
                <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Continue with Apple
              </Button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Sign Up Tab */}
            <TabsContent value="signup" className="mt-0">
              <form onSubmit={handleSignUp} className="space-y-3">
                <div>
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" className="h-10 rounded-xl" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="signupEmail">Email</Label>
                  <Input id="signupEmail" type="email" className="h-10 rounded-xl" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                </div>
                <div className="relative">
                  <Label htmlFor="signupPassword">Password</Label>
                  <div className="relative">
                    <Input id="signupPassword" type={showSignupPw ? "text" : "password"} className="h-10 rounded-xl" value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} required minLength={8} />
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowSignupPw(!showSignupPw)} aria-label="Toggle password visibility">
                      {showSignupPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input id="confirmPassword" type="password" className="h-10 rounded-xl" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
                </div>
                {renderTurnstile()}
                <Button type="submit" className="w-full rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90" disabled={isSubmitDisabled}>
                  {loading ? "Creating account…" : "Create account"}
                </Button>
              </form>
            </TabsContent>

            {/* Log In Tab */}
            <TabsContent value="login" className="mt-0">
              {showForgot ? (
                forgotSent ? (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-foreground">Check your email for a reset link.</p>
                    <button className="text-sm text-primary-foreground underline" onClick={() => { setShowForgot(false); setForgotSent(false); }}>
                      Back to Log In
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-3">
                    <div>
                      <Label htmlFor="forgotEmail">Email</Label>
                      <Input id="forgotEmail" type="email" className="h-10 rounded-xl" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
                    </div>
                    {renderTurnstile()}
                    <Button type="submit" className="w-full rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90" disabled={isSubmitDisabled}>
                      {loading ? "Sending…" : "Send reset link"}
                    </Button>
                    <button type="button" className="text-sm text-muted-foreground underline w-full text-center" onClick={() => setShowForgot(false)}>
                      Back to Log In
                    </button>
                  </form>
                )
              ) : (
                <form onSubmit={handleLogin} className="space-y-3">
                  <div>
                    <Label htmlFor="loginEmail">Email</Label>
                    <Input id="loginEmail" type="email" className="h-10 rounded-xl" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                  </div>
                  <div className="relative">
                    <Label htmlFor="loginPassword">Password</Label>
                    <div className="relative">
                      <Input id="loginPassword" type={showLoginPw ? "text" : "password"} className="h-10 rounded-xl" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} required />
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowLoginPw(!showLoginPw)} aria-label="Toggle password visibility">
                        {showLoginPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowForgot(true)}>
                    Forgot password?
                  </button>
                  {renderTurnstile()}
                  <Button type="submit" className="w-full rounded-[28px] h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90" disabled={isSubmitDisabled}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
