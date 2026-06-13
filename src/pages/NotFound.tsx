import { useLocation, useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo } from "react";

// Common mistyped/legacy paths → canonical app routes.
const REDIRECT_MAP: Record<string, string> = {
  "/auth/reset-password": "/reset-password",
  "/auth/login": "/auth",
  "/auth/signup": "/auth",
  "/login": "/auth",
  "/signup": "/auth",
  "/register": "/auth",
  "/registrations": "/super-admin?tab=registrations",
  "/admin": "/super-admin",
  "/home": "/",
  "/catalogue": "/platform-catalogue",
};

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const redirectTo = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (REDIRECT_MAP[path]) return REDIRECT_MAP[path] + (location.search || "");
    // Anything pointing at the Supabase edge-functions surface is not an SPA route.
    if (path.startsWith("/functions/")) return null;
    return null;
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (redirectTo) {
      navigate(redirectTo, { replace: true });
      return;
    }
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname, redirectTo, navigate]);

  if (redirectTo) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center max-w-md px-6">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-2 text-xl text-muted-foreground">Page not found</p>
        <p className="mb-6 text-sm text-muted-foreground/80 break-all">
          <code className="font-mono">{location.pathname}</code> isn't a page on this site.
        </p>
        <div className="flex items-center justify-center gap-3 text-sm">
          <Link to="/" className="text-primary underline hover:text-primary/90">Home</Link>
          <Link to="/platform-catalogue" className="text-primary underline hover:text-primary/90">Catalogue</Link>
          <Link to="/auth" className="text-primary underline hover:text-primary/90">Sign in</Link>
        </div>
      </div>
      </div>
  );
};

export default NotFound;
