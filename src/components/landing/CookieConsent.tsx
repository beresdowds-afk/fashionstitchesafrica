import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X, Settings2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const COOKIE_KEY = "fsa_cookie_consent";

type ConsentLevel = "all" | "essential" | null;

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = (level: ConsentLevel) => {
    localStorage.setItem(COOKIE_KEY, JSON.stringify({ level, date: new Date().toISOString() }));
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-[60] rounded-xl border border-primary/20 bg-card/95 backdrop-blur-lg shadow-2xl p-5"
        >
          <button
            onClick={() => setVisible(false)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Cookie size={20} />
            </div>
            <div>
              <h4 className="font-heading font-semibold text-sm text-foreground">We use cookies</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We use cookies to enhance your experience, analyze traffic, and personalize content.
              </p>
            </div>
          </div>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden mb-3"
              >
                <div className="space-y-2 text-xs text-muted-foreground border-t border-border pt-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">Essential</span>
                    <span className="text-[10px] bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full">Always on</span>
                  </div>
                  <p>Required for the platform to function properly.</p>
                  <div className="flex items-center justify-between pt-1">
                    <span className="font-medium text-foreground">Analytics & Marketing</span>
                    <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">Optional</span>
                  </div>
                  <p>Help us understand usage and improve our services.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="hero" className="flex-1 text-xs h-8" onClick={() => accept("all")}>
              Accept All
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => accept("essential")}>
              Essential Only
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowDetails(!showDetails)}
            >
              <Settings2 size={14} />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;
