import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import AuthModal from "./AuthModal";

const SignInLink = () => {
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  if (user) return null;

  return (
    <>
      <button
        onClick={() => setAuthOpen(true)}
        className="mt-4 text-center w-full"
        style={{
          color: "hsl(var(--muted-foreground))",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontWeight: 400,
          fontSize: 12,
        }}
      >
        Sign in to back up your work.
      </button>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

export default SignInLink;
