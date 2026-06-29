import { ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

/**
 * Client-side equivalent of the platform's auth middleware spec:
 *   - /site/*                        → PUBLIC (tenant websites)
 *   - Auth surfaces (/auth, /reset-password) → PUBLIC so users can sign in
 *   - A small set of marketing / install entry points → PUBLIC
 *   - EVERYTHING ELSE                → PRIVATE (auth required)
 *
 * Unauthenticated visitors hitting a private route are redirected to /auth
 * with `?redirect=<original>` so we can return them after sign-in.
 */

const PUBLIC_PREFIXES = [
  "/site/",            // tenant public websites
  "/auth",             // sign-in / sign-up
  "/reset-password",
  "/install",          // PWA install entry
  "/admin-install",
  "/legal",
  "/fysora-ecosystem",
  "/docs/api",
  "/api-docs",
  "/preview/template/",
  "/demo-org",
  "/platform-tour",
  "/landing",
  "/features",
  "/pricing",
  "/about",
  "/help/",
  "/browse",
  "/platform-catalogue",
];

const isPublicPath = (pathname: string) => {
  if (pathname === "/") return true; // root redirects to /platform-catalogue
  return PUBLIC_PREFIXES.some(
    p => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`) || pathname === p,
  );
};

interface Props {
  children: ReactNode;
}

const RouteAuthGuard = ({ children }: Props) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  const publicRoute = isPublicPath(location.pathname);

  useEffect(() => {
    if (!loading && !user && !publicRoute) {
      // eslint-disable-next-line no-console
      console.info(`[auth-guard] blocked private route ${location.pathname} — redirecting to /auth`);
    }
  }, [loading, user, publicRoute, location.pathname]);

  if (publicRoute) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?redirect=${redirect}`} replace />;
  }

  return <>{children}</>;
};

export default RouteAuthGuard;