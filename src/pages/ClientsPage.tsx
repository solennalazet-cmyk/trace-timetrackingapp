import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";

const ClientsPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <Users className="w-12 h-12 text-muted-foreground opacity-40" />
      <p className="text-muted-foreground text-sm text-center">No clients yet.<br />Add a client to organize your work.</p>
      <Button variant="outline" size="sm">Add Client</Button>
    </div>
  );
};

export default ClientsPage;
