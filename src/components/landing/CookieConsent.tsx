import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Cookie, X, Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { motion, AnimatePresence } from "framer-motion";

const COOKIE_KEY = "fsa_cookie_consent";

export type ConsentCategories = {
  essential: true;
  analytics: boolean;
  marketing: boolean;
  personalization: boolean;
};

export type StoredConsent = {
  level: "all" | "essential" | "custom";
  categories: ConsentCategories;
  date: string;
  version: number;
};

const CONSENT_VERSION = 1;

export const getStoredConsent = (): StoredConsent | null => {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed?.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

const dispatchConsent = (consent: StoredConsent) => {
  try {
    window.dispatchEvent(new CustomEvent("fsa:cookie-consent", { detail: consent }));
  } catch {/* noop */}
};

const CookieConsent = () => {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [personalization, setPersonalization] = useState(true);

  useEffect(() => {
    const consent = getStoredConsent();
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setAnalytics(consent.categories.analytics);
      setMarketing(consent.categories.marketing);
      setPersonalization(consent.categories.personalization);
      dispatchConsent(consent);
    }
  }, []);

  const persist = (level: StoredConsent["level"], cats: ConsentCategories) => {
    const payload: StoredConsent = {
      level,
      categories: cats,
      date: new Date().toISOString(),
      version: CONSENT_VERSION,
    };
    localStorage.setItem(COOKIE_KEY, JSON.stringify(payload));
    dispatchConsent(payload);
    setVisible(false);
  };

  const acceptAll = () =>
    persist("all", { essential: true, analytics: true, marketing: true, personalization: true });
  const essentialOnly = () =>
    persist("essential", { essential: true, analytics: false, marketing: false, personalization: false });
  const savePreferences = () =>
    persist("custom", { essential: true, analytics, marketing, personalization });

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-[60] rounded-xl border border-primary/20 bg-card/95 backdrop-blur-lg shadow-2xl p-5"
          role="dialog"
          aria-label="Cookie consent preferences"
        >
          <button
            onClick={() => setVisible(false)}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>

          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Cookie size={20} />
            </div>
            <div>
              <h4 className="font-heading font-semibold text-sm text-foreground">Your privacy choices</h4>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                We use cookies to power the platform, measure usage and personalize content. Choose which categories you allow — you can change this anytime.
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
                <div className="space-y-3 text-xs border-t border-border pt-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">Essential</div>
                      <p className="text-muted-foreground">Required for auth, security and core platform features.</p>
                    </div>
                    <span className="text-[10px] bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full shrink-0">Always on</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">Analytics</div>
                      <p className="text-muted-foreground">Anonymous usage stats so we can improve the product.</p>
                    </div>
                    <Switch checked={analytics} onCheckedChange={setAnalytics} aria-label="Analytics cookies" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">Marketing</div>
                      <p className="text-muted-foreground">Promotional campaigns and offer attribution.</p>
                    </div>
                    <Switch checked={marketing} onCheckedChange={setMarketing} aria-label="Marketing cookies" />
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-foreground">Personalization</div>
                      <p className="text-muted-foreground">Remember language, currency and dashboard preferences.</p>
                    </div>
                    <Switch checked={personalization} onCheckedChange={setPersonalization} aria-label="Personalization cookies" />
                  </div>
                  <Button size="sm" variant="hero" className="w-full text-xs h-8 mt-1" onClick={savePreferences}>
                    Save my preferences
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="hero" className="flex-1 text-xs h-8" onClick={acceptAll}>
              Accept All
            </Button>
            <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={essentialOnly}>
              Essential Only
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => setShowDetails(!showDetails)}
              aria-label="Toggle preferences"
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
