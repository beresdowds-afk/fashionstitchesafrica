import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Scan, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface AiMeasurementDetectorProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  bookingId: string;
  onMeasurementsDetected: (measurements: Record<string, string>) => void;
  isActive: boolean;
}

interface DetectedMeasurement {
  label: string;
  value: string;
  confidence: number;
}

const MEASUREMENT_PROMPTS = [
  "Stand facing the camera with arms slightly away from your body",
  "Turn to your left side, keeping your posture straight",
  "Raise your arms to shoulder height, palms facing down",
  "Stand naturally with arms at your sides for final capture",
];

const AiMeasurementDetector = ({
  videoRef,
  bookingId,
  onMeasurementsDetected,
  isActive,
}: AiMeasurementDetectorProps) => {
  const [detecting, setDetecting] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [detectedMeasurements, setDetectedMeasurements] = useState<DetectedMeasurement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Return as data URL (JPEG quality 0.8)
    return canvas.toDataURL("image/jpeg", 0.8);
  }, [videoRef]);

  const analyzeFrame = useCallback(async () => {
    setDetecting(true);
    setError(null);

    try {
      const frameData = captureFrame();
      if (!frameData) {
        setError("Could not capture video frame. Ensure camera is on.");
        setDetecting(false);
        return;
      }

      // Call AI via edge function
      const { data, error: fnError } = await supabase.functions.invoke("ai-measure-detect", {
        body: {
          image: frameData,
          step: currentStep,
          prompt: MEASUREMENT_PROMPTS[currentStep],
          booking_id: bookingId,
        },
      });

      if (fnError) throw fnError;

      if (data?.measurements && Array.isArray(data.measurements)) {
        const newMeasurements: DetectedMeasurement[] = data.measurements.map((m: any) => ({
          label: m.label,
          value: `${m.value} ${m.unit || "in"}`,
          confidence: m.confidence || 0.8,
        }));

        setDetectedMeasurements((prev) => {
          const merged = [...prev];
          newMeasurements.forEach((nm) => {
            const existingIdx = merged.findIndex((m) => m.label === nm.label);
            if (existingIdx >= 0) {
              // Keep higher confidence
              if (nm.confidence > merged[existingIdx].confidence) {
                merged[existingIdx] = nm;
              }
            } else {
              merged.push(nm);
            }
          });
          return merged;
        });

        if (currentStep < MEASUREMENT_PROMPTS.length - 1) {
          setCurrentStep((s) => s + 1);
        }
      }
    } catch (err: any) {
      setError(err.message || "AI detection failed. Try again.");
    } finally {
      setDetecting(false);
    }
  }, [captureFrame, currentStep, bookingId]);

  const handleApplyMeasurements = () => {
    const result: Record<string, string> = {};
    detectedMeasurements.forEach((m) => {
      result[m.label] = m.value;
    });
    onMeasurementsDetected(result);
  };

  const handleReset = () => {
    setDetectedMeasurements([]);
    setCurrentStep(0);
    setError(null);
  };

  if (!isActive) return null;

  return (
    <div className="flex flex-col h-full">
      <canvas ref={canvasRef} className="hidden" />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-primary" />
          <h3 className="font-heading font-semibold text-sm">AI Body Detection</h3>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Step {currentStep + 1}/{MEASUREMENT_PROMPTS.length}
        </Badge>
      </div>

      {/* Current prompt */}
      <div className="px-4 py-3 bg-primary/5 border-b border-border">
        <p className="text-xs text-foreground font-medium mb-1">Position Guide:</p>
        <p className="text-xs text-muted-foreground">{MEASUREMENT_PROMPTS[currentStep]}</p>
      </div>

      {/* Capture button */}
      <div className="px-4 py-3 border-b border-border">
        <Button
          onClick={analyzeFrame}
          disabled={detecting}
          className="w-full gap-2"
          size="sm"
        >
          {detecting ? (
            <><Loader2 size={14} className="animate-spin" /> Analyzing...</>
          ) : (
            <><Scan size={14} /> Capture & Analyze</>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mt-3 p-2 rounded-lg bg-destructive/10 text-destructive text-xs flex items-start gap-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Detected measurements */}
      <ScrollArea className="flex-1 p-4">
        {detectedMeasurements.length === 0 ? (
          <div className="text-center py-8">
            <Bot size={32} className="mx-auto text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">
              Position yourself in frame and click "Capture & Analyze" to detect measurements.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {detectedMeasurements.map((m, i) => (
              <div
                key={`${m.label}-${i}`}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    size={12}
                    className={m.confidence > 0.7 ? "text-secondary" : "text-primary"}
                  />
                  <span className="text-xs font-medium">{m.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{m.value}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {Math.round(m.confidence * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Actions */}
      {detectedMeasurements.length > 0 && (
        <div className="p-4 border-t border-border space-y-2">
          <Button onClick={handleApplyMeasurements} className="w-full" size="sm">
            Apply {detectedMeasurements.length} Measurements
          </Button>
          <Button onClick={handleReset} variant="ghost" className="w-full text-xs" size="sm">
            Reset & Start Over
          </Button>
        </div>
      )}
    </div>
  );
};

export default AiMeasurementDetector;
