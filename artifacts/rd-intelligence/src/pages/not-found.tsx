import { Link } from "wouter";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center glass-panel p-12 rounded-3xl max-w-md w-full">
        <FlaskConical className="w-16 h-16 text-primary mx-auto mb-6 opacity-80 animate-pulse" />
        <h1 className="text-5xl font-bold font-display text-foreground mb-2">404</h1>
        <p className="text-xl text-muted-foreground mb-8">Experiment Not Found</p>
        <Link href="/">
          <Button size="lg" className="w-full">Return to Lab</Button>
        </Link>
      </div>
    </div>
  );
}
