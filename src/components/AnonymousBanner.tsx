import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface AnonymousBannerProps {
  onSignIn: () => void;
}

const AnonymousBanner = ({ onSignIn }: AnonymousBannerProps) => {
  const { user } = useAuth();

  if (user) return null;

  return (
    <button
      onClick={onSignIn}
      className="w-full px-4 py-2 text-center text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
    >
      Sign in to back up your work. ›
    </button>
  );
};

export default AnonymousBanner;
