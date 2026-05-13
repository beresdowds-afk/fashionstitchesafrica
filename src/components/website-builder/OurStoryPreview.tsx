import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, Sparkles } from "lucide-react";

export interface OurStoryPreviewOfficer {
  id: string;
  full_name: string;
  title: string;
  photo_url?: string | null;
  is_public?: boolean;
}

export interface OurStoryPreviewProps {
  open: boolean;
  onClose: () => void;
  orgName: string;
  logoUrl?: string | null;
  ourStory?: string | null;
  visionStatement?: string | null;
  missionStatement?: string | null;
  officers: OurStoryPreviewOfficer[];
  brandColor: string;
  accentColor: string;
  fontHeading?: string;
  /** when true, render inside a parent container instead of fullscreen overlay */
  inline?: boolean;
}

/**
 * Single source of truth for the Our Story modal content.
 * Used by:
 *  - Native organization websites (OrgWebsite.tsx)
 *  - Admin live preview (OrgBrandingPanel)
 *  - Static export parity check (visual reference; PublishWebsiteButton mirrors HTML)
 */
const OurStoryPreview = (props: OurStoryPreviewProps) => {
  const {
    open, onClose, orgName, logoUrl, ourStory, visionStatement, missionStatement,
    officers, brandColor, accentColor, fontHeading = "Inter", inline = false,
  } = props;

  const visibleOfficers = officers.filter(o => o.is_public !== false);
  const story = (ourStory || "").trim();

  const Card = (
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative w-full max-w-3xl max-h-[88vh] overflow-y-auto bg-card text-foreground rounded-xl border border-border shadow-2xl"
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted z-10"
      >
        <X size={18} />
      </button>
      <div className="p-6 sm:p-8 md:p-12 space-y-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${orgName} logo`}
              className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 object-contain rounded-full border mb-4"
              style={{ borderColor: `${accentColor}55`, background: `${brandColor}08` }}
            />
          ) : (
            <div
              className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 flex items-center justify-center rounded-full mb-4 text-3xl font-light"
              style={{ background: `${brandColor}12`, color: accentColor }}
            >
              {orgName.charAt(0)}
            </div>
          )}
          <div className="flex items-center gap-3 mb-3 justify-center">
            <div className="h-px w-8 sm:w-10" style={{ background: accentColor }} />
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: accentColor }}>Our Story</span>
            <div className="h-px w-8 sm:w-10" style={{ background: accentColor }} />
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl" style={{ fontFamily: `'${fontHeading}'` }}>
            {orgName}
          </h2>
          {story ? (
            <div className="text-sm sm:text-base md:text-lg leading-relaxed whitespace-pre-line mt-5 sm:mt-6 text-left text-muted-foreground">
              {story}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground/70 italic mt-6">
              Add an "Our Story" narrative to populate this section.
            </p>
          )}
        </div>

        {/* Vision & Mission */}
        {(visionStatement || missionStatement) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {visionStatement && (
              <div className="p-4 sm:p-6 border rounded-lg" style={{ borderColor: `${accentColor}33`, background: `${brandColor}06` }}>
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Eye size={14} style={{ color: accentColor }} />
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: accentColor }}>Our Vision</span>
                </div>
                <p className="text-xs sm:text-sm md:text-base leading-relaxed text-muted-foreground">{visionStatement}</p>
              </div>
            )}
            {missionStatement && (
              <div className="p-4 sm:p-6 border rounded-lg" style={{ borderColor: `${brandColor}33`, background: `${accentColor}06` }}>
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Sparkles size={14} style={{ color: brandColor }} />
                  <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: brandColor }}>Our Mission</span>
                </div>
                <p className="text-xs sm:text-sm md:text-base leading-relaxed text-muted-foreground">{missionStatement}</p>
              </div>
            )}
          </div>
        )}

        {/* Our Team */}
        {visibleOfficers.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-5 sm:mb-6 justify-center">
              <div className="h-px w-6 sm:w-8" style={{ background: brandColor }} />
              <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.25em]" style={{ color: brandColor }}>Our Team</span>
              <div className="h-px w-6 sm:w-8" style={{ background: brandColor }} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
              {visibleOfficers.map((officer) => (
                <div key={officer.id} className="text-center">
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full overflow-hidden mb-2 sm:mb-3 border" style={{ borderColor: `${accentColor}40` }}>
                    {officer.photo_url ? (
                      <img src={officer.photo_url} alt={officer.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ background: `${brandColor}12` }}>
                        <span className="text-base sm:text-lg font-light text-muted-foreground">
                          {officer.full_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="font-medium text-xs sm:text-sm" style={{ fontFamily: `'${fontHeading}'` }}>{officer.full_name}</p>
                  <p className="text-[10px] sm:text-[11px] mt-0.5" style={{ color: accentColor }}>{officer.title}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (inline) {
    return open ? <div className="w-full">{Card}</div> : null;
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-label={`Our story — ${orgName}`}
        >
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="w-full flex justify-center"
          >
            {Card}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OurStoryPreview;
