import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
    } else {
      toast.success("Password updated successfully.");
      navigate("/");
    }
    setLoading(false);
  };

  return (
    <div className="gradient-bg min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-[380px] bg-card rounded-2xl p-6 shadow-lg">
        <h1 className="font-mono text-xl font-bold text-timer-display mb-4">Reset Password</h1>
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input id="newPassword" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password visibility">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div>
            <Label htmlFor="confirmNew">Confirm Password</Label>
            <div className="relative">
              <Input id="confirmNew" type={showConfirm ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowConfirm(!showConfirm)} aria-label="Toggle confirm password visibility">
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full bg-primary text-primary-foreground" disabled={loading}>
            {loading ? "Updating…" : "Update Password"}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
