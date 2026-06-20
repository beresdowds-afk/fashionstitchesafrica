import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type ShowcaseVariant = "infinite-scroll" | "popup" | "fade" | "fly";
export type ShowcaseSpeed = "slow" | "medium" | "fast";

export interface ShowcaseItem {
  id: string;
  name: string;
  image_url?: string | null;
  price?: number | string | null;
  currency?: string | null;
}

interface Props {
  items: ShowcaseItem[];
  variant?: ShowcaseVariant;
  speed?: ShowcaseSpeed;
  className?: string;
}

const SPEED_MS: Record<ShowcaseSpeed, number> = {
  slow: 5000,
  medium: 3000,
  fast: 1600,
};
const MARQUEE_DURATION: Record<ShowcaseSpeed, string> = {
  slow: "60s",
  medium: "35s",
  fast: "18s",
};

function Card({ item }: { item: ShowcaseItem }) {
  return (
    <div className="w-44 sm:w-56 shrink-0 rounded-lg overflow-hidden border border-border/60 bg-card shadow-sm">
      <div className="aspect-square bg-muted overflow-hidden">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="p-2.5">
        <div className="text-sm font-medium truncate">{item.name}</div>
        {item.price != null && (
          <div className="text-xs text-muted-foreground">
            {item.currency ?? ""} {typeof item.price === "number" ? item.price.toLocaleString() : item.price}
          </div>
        )}
      </div>
    </div>
  );
}

export default function FeaturedShowcase({
  items,
  variant = "infinite-scroll",
  speed = "medium",
  className,
}: Props) {
  if (!items || items.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground py-8 text-center", className)}>
        No featured products yet.
      </div>
    );
  }

  if (variant === "infinite-scroll") {
    const doubled = [...items, ...items];
    return (
      <div className={cn("overflow-hidden relative", className)}>
        <div
          className="flex gap-4 w-max"
          style={{
            animation: `featured-marquee ${MARQUEE_DURATION[speed]} linear infinite`,
          }}
        >
          {doubled.map((it, i) => (<Card key={`${it.id}-${i}`} item={it} />))}
        </div>
        <style>{`
          @keyframes featured-marquee {
            from { transform: translateX(0); }
            to { transform: translateX(-50%); }
          }
        `}</style>
      </div>
    );
  }

  // Rotating variants: popup, fade, fly
  return <RotatingShowcase items={items} variant={variant} speed={speed} className={className} />;
}

function RotatingShowcase({
  items, variant, speed, className,
}: { items: ShowcaseItem[]; variant: Exclude<ShowcaseVariant, "infinite-scroll">; speed: ShowcaseSpeed; className?: string }) {
  const [index, setIndex] = useState(0);
  const intervalMs = SPEED_MS[speed];

  useEffect(() => {
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), intervalMs);
    return () => clearInterval(t);
  }, [items.length, intervalMs]);

  const current = items[index];
  const animClass = useMemo(() => {
    switch (variant) {
      case "popup": return "animate-scale-in";
      case "fade": return "animate-fade-in";
      case "fly": return "animate-slide-in-right";
      default: return "animate-fade-in";
    }
  }, [variant]);

  return (
    <div className={cn("relative flex items-center justify-center min-h-[280px] py-6", className)}>
      <div key={`${current.id}-${index}`} className={cn("transition-all", animClass)}>
        <Card item={current} />
      </div>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {items.map((_, i) => (
          <span
            key={i}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i === index ? "bg-primary w-4" : "bg-muted-foreground/40"
            )}
          />
        ))}
      </div>
    </div>
  );
}