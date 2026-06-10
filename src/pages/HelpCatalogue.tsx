import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import CatalogueCartGuide from "@/components/help/CatalogueCartGuide";

const HelpCatalogue = () => {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 lg:px-8 flex items-center justify-between h-14">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft size={14} /> Back
            </Button>
          </Link>
          <h1 className="font-heading font-bold text-sm">Help · Catalogue & Cart</h1>
          <span className="w-16" />
        </div>
      </header>
      <main className="container mx-auto px-4 lg:px-8 py-8 max-w-3xl">
        <CatalogueCartGuide role={null as any} />
      </main>
    </div>
  );
};

export default HelpCatalogue;