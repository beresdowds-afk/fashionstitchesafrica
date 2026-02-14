import { Button } from "@/components/ui/button";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Users, MonitorUp, MonitorOff, Circle, CircleStop } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface VideoControlsProps {
  isMuted: boolean;
  isCameraOff: boolean;
  onToggleMute: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onInviteHuman?: () => void;
  isAiMode: boolean;
  isScreenSharing?: boolean;
  onToggleScreenShare?: () => void;
  isRecording?: boolean;
  onToggleRecording?: () => void;
}

const VideoControls = ({
  isMuted,
  isCameraOff,
  onToggleMute,
  onToggleCamera,
  onEndCall,
  onInviteHuman,
  isAiMode,
  isScreenSharing,
  onToggleScreenShare,
  isRecording,
  onToggleRecording,
}: VideoControlsProps) => {
  return (
    <div className="flex items-center justify-center gap-3 py-3 px-4 bg-card/80 backdrop-blur-md rounded-2xl border border-border shadow-lg">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant={isMuted ? "destructive" : "outline"} className="h-12 w-12 rounded-full" onClick={onToggleMute}>
            {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant={isCameraOff ? "destructive" : "outline"} className="h-12 w-12 rounded-full" onClick={onToggleCamera}>
            {isCameraOff ? <VideoOff size={20} /> : <Video size={20} />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isCameraOff ? "Turn camera on" : "Turn camera off"}</TooltipContent>
      </Tooltip>

      {/* Screen Share */}
      {onToggleScreenShare && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={isScreenSharing ? "secondary" : "outline"}
              className="h-12 w-12 rounded-full"
              onClick={onToggleScreenShare}
            >
              {isScreenSharing ? <MonitorOff size={20} /> : <MonitorUp size={20} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isScreenSharing ? "Stop sharing" : "Share screen"}</TooltipContent>
        </Tooltip>
      )}

      {/* Recording */}
      {onToggleRecording && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={isRecording ? "destructive" : "outline"}
              className={`h-12 w-12 rounded-full ${isRecording ? "animate-pulse" : ""}`}
              onClick={onToggleRecording}
            >
              {isRecording ? <CircleStop size={20} /> : <Circle size={20} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isRecording ? "Stop recording" : "Start recording"}</TooltipContent>
        </Tooltip>
      )}

      {isAiMode && onInviteHuman && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="secondary" className="h-12 w-12 rounded-full" onClick={onInviteHuman}>
              <Users size={20} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Invite staff to join</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="destructive" className="h-12 w-12 rounded-full" onClick={onEndCall}>
            <PhoneOff size={20} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>End call</TooltipContent>
      </Tooltip>
    </div>
  );
};

export default VideoControls;
