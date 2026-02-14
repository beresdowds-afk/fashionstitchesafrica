import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import VideoControls from "@/components/video-call/VideoControls";
import SessionTimer from "@/components/video-call/SessionTimer";
import MeasurementPanel from "@/components/video-call/MeasurementPanel";
import ChatPanel from "@/components/video-call/ChatPanel";
import AiMeasurementDetector from "@/components/video-call/AiMeasurementDetector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Video,
  Bot,
  User,
  Wifi,
  WifiOff,
  PanelRightOpen,
  PanelRightClose,
  Maximize,
  Minimize,
  MonitorUp,
  Circle,
} from "lucide-react";

const VideoCall = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const bookingId = params.get("bookingId") || "";
  const role = params.get("role") || "customer";

  const [booking, setBooking] = useState<any>(null);
  const [displayName, setDisplayName] = useState("User");
  const [loading, setLoading] = useState(true);
  const [callStarted, setCallStarted] = useState(false);
  const [isAiMode, setIsAiMode] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<"measurements" | "ai-detect" | "chat">("ai-detect");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Screen sharing
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const {
    localStream,
    remoteStream,
    connected,
    isMuted,
    isCameraOff,
    error,
    startCall,
    toggleMute,
    toggleCamera,
    endCall,
  } = useWebRTC({
    bookingId,
    userId: user?.id || "",
    isInitiator: role === "admin",
  });

  // Fetch booking
  useEffect(() => {
    if (!bookingId) return;
    const fetchData = async () => {
      const { data } = await supabase
        .from("ai_measurement_bookings")
        .select("*")
        .eq("id", bookingId)
        .single();
      setBooking(data);
      setLoading(false);
    };
    fetchData();
  }, [bookingId]);

  // Fetch display name
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profiles").select("display_name").eq("id", user.id).single()
      .then(({ data }) => { if (data?.display_name) setDisplayName(data.display_name); });
  }, [user?.id]);

  // Attach streams
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  const handleStartCall = async () => {
    await startCall();
    setCallStarted(true);
    if (role === "admin" && booking) {
      await supabase.from("ai_measurement_bookings").update({
        booking_status: "in_progress",
        started_at: new Date().toISOString(),
      }).eq("id", bookingId);
    }
  };

  const handleEndCall = async () => {
    // Stop recording if active
    if (isRecording) stopRecording();
    // Stop screen share
    if (isScreenSharing) stopScreenShare();

    endCall();
    if (role === "admin" && booking) {
      await supabase.from("ai_measurement_bookings").update({
        booking_status: "completed",
        ended_at: new Date().toISOString(),
      }).eq("id", bookingId);
    }
    toast({ title: "Call ended" });
    navigate(-1);
  };

  const handleSaveMeasurements = async (measurements: Record<string, string>) => {
    if (!bookingId) return;
    const { error: err } = await supabase
      .from("ai_measurement_bookings")
      .update({ measurements_captured: measurements })
      .eq("id", bookingId);
    if (err) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } else {
      toast({ title: "Measurements saved" });
    }
  };

  const handleAiMeasurementsDetected = (measurements: Record<string, string>) => {
    handleSaveMeasurements(measurements);
    setSidebarTab("measurements");
    toast({ title: "AI measurements applied", description: "Review and adjust in the Measurements panel." });
  };

  const handleNotesChange = async (notes: string) => {
    if (!bookingId) return;
    await supabase.from("ai_measurement_bookings").update({ session_notes: notes }).eq("id", bookingId);
  };

  // Screen sharing
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1920, height: 1080 },
        audio: false,
      });
      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      if (screenVideoRef.current) {
        screenVideoRef.current.srcObject = stream;
      }

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };
    } catch {
      toast({ title: "Screen sharing cancelled" });
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setIsScreenSharing(false);
  }, []);

  // Recording
  const startRecording = useCallback(() => {
    const stream = localStream;
    if (!stream) {
      toast({ title: "No stream to record", variant: "destructive" });
      return;
    }

    // Combine local + remote if available
    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d")!;

    const localVideo = localVideoRef.current;
    const remoteVideo = remoteVideoRef.current;

    // Simple: record local stream audio + video
    const combinedStream = new MediaStream();
    stream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
    stream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));

    if (remoteStream) {
      remoteStream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
    }

    try {
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp9,opus",
      });

      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `measurement-session-${bookingId}-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: "Recording saved", description: "Download started automatically." });
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      toast({ title: "Recording started" });
    } catch {
      toast({ title: "Recording not supported in this browser", variant: "destructive" });
    }
  }, [localStream, remoteStream, bookingId]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  if (!bookingId) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Invalid booking. No booking ID provided.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Pre-call lobby
  if (!callStarted) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-card rounded-2xl border border-border p-8 text-center space-y-6"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/15 flex items-center justify-center">
            <Video size={32} className="text-primary" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold mb-2">AI Measurement Session</h1>
            <p className="text-sm text-muted-foreground">
              {booking?.hours_booked || 1}h session · {booking?.session_type === "video_ai" ? "Video + AI Guidance" : booking?.session_type}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Bot size={12} /> AI-guided mode</span>
            <span>•</span>
            <span className="flex items-center gap-1"><User size={12} /> Staff can join</span>
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          <Button onClick={handleStartCall} className="w-full h-12 text-base" size="lg">
            <Video size={18} className="mr-2" /> Join Session
          </Button>
          <Button variant="ghost" className="text-xs text-muted-foreground" onClick={() => navigate(-1)}>
            Cancel & go back
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col text-foreground overflow-hidden" style={{ background: "hsl(0 0% 7%)" }}>
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-card/10 backdrop-blur border-b border-border/30">
        <div className="flex items-center gap-3">
          <Video size={16} className="text-primary" />
          <span className="font-heading text-sm font-semibold" style={{ color: "hsl(36 33% 96%)" }}>
            AI Measurement Session
          </span>
          <Badge variant="outline" className={`text-[10px] ${connected ? "border-secondary text-secondary" : "border-muted-foreground text-muted-foreground"}`}>
            {connected ? <><Wifi size={8} className="mr-1" /> Connected</> : <><WifiOff size={8} className="mr-1" /> Waiting...</>}
          </Badge>
          {isAiMode && (
            <Badge className="bg-primary/20 text-primary text-[10px]">
              <Bot size={8} className="mr-1" /> AI Mode
            </Badge>
          )}
          {isRecording && (
            <Badge className="bg-destructive/20 text-destructive text-[10px] animate-pulse">
              <Circle size={6} className="mr-1 fill-current" /> Recording
            </Badge>
          )}
          {isScreenSharing && (
            <Badge className="bg-secondary/20 text-secondary text-[10px]">
              <MonitorUp size={8} className="mr-1" /> Screen Share
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {booking && <SessionTimer hoursBooked={booking.hours_booked || 1} isActive={callStarted} />}
          <Button size="icon" variant="ghost" className="h-8 w-8" style={{ color: "hsl(36 33% 96%)" }} onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" style={{ color: "hsl(36 33% 96%)" }} onClick={() => setShowSidebar(!showSidebar)}>
            {showSidebar ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Area */}
        <div className="flex-1 relative flex items-center justify-center p-4">
          {/* Main Video / Screen Share */}
          <div className="relative w-full h-full rounded-2xl overflow-hidden bg-muted/10">
            {isScreenSharing ? (
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            ) : remoteStream ? (
              <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                  {isAiMode ? <Bot size={48} className="text-primary" /> : <User size={48} className="text-muted-foreground" />}
                </div>
                <p className="text-sm" style={{ color: "hsl(36 33% 96%)" }}>
                  {isAiMode ? "AI guidance active — position yourself in frame" : "Waiting for staff to join..."}
                </p>
              </div>
            )}
          </div>

          {/* Local Video (PiP) */}
          {localStream && (
            <div className="absolute bottom-6 right-6 w-48 h-36 rounded-xl overflow-hidden border-2 border-border/50 shadow-lg">
              <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
              {isCameraOff && (
                <div className="absolute inset-0 bg-muted flex items-center justify-center">
                  <User size={24} className="text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          {/* Controls overlay */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
            <VideoControls
              isMuted={isMuted}
              isCameraOff={isCameraOff}
              onToggleMute={toggleMute}
              onToggleCamera={toggleCamera}
              onEndCall={handleEndCall}
              onInviteHuman={() => {
                setIsAiMode(false);
                toast({ title: "Staff invitation sent", description: "Organization staff can now join this session." });
              }}
              isAiMode={isAiMode}
              isScreenSharing={isScreenSharing}
              onToggleScreenShare={isScreenSharing ? stopScreenShare : startScreenShare}
              isRecording={isRecording}
              onToggleRecording={isRecording ? stopRecording : startRecording}
            />
          </div>
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 360, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="border-l border-border/30 bg-card flex flex-col overflow-hidden"
            style={{ width: 360, minWidth: 360 }}
          >
            <div className="flex border-b border-border">
              {(["ai-detect", "measurements", "chat"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setSidebarTab(tab)}
                  className={`flex-1 py-3 text-xs font-medium transition-colors ${
                    sidebarTab === tab ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "ai-detect" ? "AI Detect" : tab === "measurements" ? "Manual" : "Chat / Notes"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-hidden">
              {sidebarTab === "ai-detect" ? (
                <AiMeasurementDetector
                  videoRef={localVideoRef}
                  bookingId={bookingId}
                  onMeasurementsDetected={handleAiMeasurementsDetected}
                  isActive={callStarted}
                />
              ) : sidebarTab === "measurements" ? (
                <MeasurementPanel
                  onSave={handleSaveMeasurements}
                  initialMeasurements={booking?.measurements_captured as Record<string, string> | undefined}
                />
              ) : (
                <ChatPanel
                  bookingId={bookingId}
                  userId={user?.id || ""}
                  userName={displayName}
                  onNotesChange={handleNotesChange}
                  initialNotes={booking?.session_notes || ""}
                />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default VideoCall;
