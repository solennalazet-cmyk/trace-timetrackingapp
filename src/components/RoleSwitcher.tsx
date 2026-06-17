import { useNavigate } from "react-router-dom";
import { Briefcase, HardHat } from "lucide-react";
import { useRole, AppRole } from "@/contexts/RoleContext";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "compact" | "full";
  className?: string;
}

const RoleSwitcher = ({ variant = "full", className }: Props) => {
  const { activeRole, availableRoles, setActiveRole } = useRole();
  const navigate = useNavigate();

  if (availableRoles.length < 2) return null;

  const handleSwitch = async (role: AppRole) => {
    if (role === activeRole) return;
    await setActiveRole(role);
    navigate(role === "employer" ? "/employer" : "/");
  };

  const options: { role: AppRole; label: string; icon: typeof Briefcase }[] = [
    { role: "worker", label: "Contractor", icon: HardHat },
    { role: "employer", label: "Employer", icon: Briefcase },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Switch role"
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded-full bg-muted/70 border border-border/60",
        className,
      )}
    >
      {options.map(({ role, label, icon: Icon }) => {
        const isActive = activeRole === role;
        return (
          <button
            key={role}
            role="radio"
            aria-checked={isActive}
            onClick={() => handleSwitch(role)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {variant === "full" && label}
          </button>
        );
      })}
    </div>
  );
};

export default RoleSwitcher;
