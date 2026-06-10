import { useLocation } from "react-router-dom";
import { ReactNode, Suspense, lazy } from "react";
import Navbar from "@/components/landing/Navbar";
import Footer from "@/components/landing/Footer";

// Lazy-load the featured strip so landing pages stay fast
const FeaturedCatalogueStrip = lazy(() => import("@/components/catalogue/FeaturedCatalogueStrip"));

// Routes where the persistent landing chrome (Navbar/Footer) should NOT render —
// these are native or non-native website / portal-style surfaces that bring
// their own shell.
const isExcludedPath = (pathname: string) => {
  if (pathname.startsWith("/site/")) return true; // native org websites
  if (pathname === "/demo-org") return true; // non-native / demo website preview
  if (pathname === "/video-call") return true; // fullscreen WebRTC
  return false;
};

interface Props {
  children: ReactNode;
}

const PersistentChrome = ({ children }: Props) => {
  const { pathname } = useLocation();
  if (isExcludedPath(pathname)) return <>{children}</>;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <Suspense fallback={null}>
        <FeaturedCatalogueStrip />
      </Suspense>
      <div className="flex-1 pt-16">{children}</div>
      <Footer />
    </div>
  );
};

export default PersistentChrome;
