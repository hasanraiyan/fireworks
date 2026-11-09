"use client";

import { CloseIcon, CubeIcon, FlashIcon, FlashOffIcon, MuteIcon, SettingsIcon, SoundIcon, SparkIcon, SwitchCameraIcon, VideoIcon } from "./Icons";

export function IconButton({
  label, onClick, children, active, disabled, className = "",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`glass flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-black/55 active:scale-95 disabled:opacity-35 ${
        active ? "!bg-amber-300 !text-black" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

interface TopProps {
  onClose: () => void;
  soundOn: boolean;
  onSound: () => void;
  torchSupported: boolean;
  torchOn: boolean;
  onTorch: () => void;
  onSettings: () => void;
}

export function TopBar(p: TopProps) {
  return (
    <div className="flex items-start justify-between gap-2">
      <IconButton label="Close camera" onClick={p.onClose}>
        <CloseIcon width={20} height={20} />
      </IconButton>
      <div className="pt-2.5 text-[11px] font-bold uppercase tracking-[0.28em] text-white/80 drop-shadow">
        Fireworks <span className="text-amber-300">AR</span>
      </div>
      <div className="flex gap-2">
        {p.torchSupported && (
          <IconButton label={p.torchOn ? "Turn flash off" : "Turn flash on"} onClick={p.onTorch} active={p.torchOn}>
            {p.torchOn ? <FlashIcon width={20} height={20} /> : <FlashOffIcon width={20} height={20} />}
          </IconButton>
        )}
        <IconButton label={p.soundOn ? "Mute sound" : "Unmute sound"} onClick={p.onSound}>
          {p.soundOn ? <SoundIcon width={20} height={20} /> : <MuteIcon width={20} height={20} />}
        </IconButton>
        <IconButton label="Settings" onClick={p.onSettings}>
          <SettingsIcon width={20} height={20} />
        </IconButton>
      </div>
    </div>
  );
}

interface BottomProps {
  onFinale: () => void;
  onPhoto: () => void;
  onRecord: () => void;
  recording: boolean;
  recordingSupported: boolean;
  captureDisabled: boolean;
  multipleCameras: boolean;
  onSwitchCamera: () => void;
  xrAvailable: boolean;
  xrActive: boolean;
  onXR: () => void;
}

export function CaptureRow(p: BottomProps) {
  return (
    <div className="flex items-center justify-center gap-5">
      <div className="flex w-[104px] justify-end gap-2">
        {p.xrAvailable || p.xrActive ? (
          <IconButton label={p.xrActive ? "Exit AR tracking" : "Start AR surface tracking"} onClick={p.onXR} active={p.xrActive}>
            <CubeIcon width={20} height={20} />
          </IconButton>
        ) : null}
        <IconButton label="Grand finale" onClick={p.onFinale}>
          <SparkIcon width={20} height={20} />
        </IconButton>
      </div>

      <button
        type="button"
        aria-label="Take photo"
        title="Take photo"
        onClick={p.onPhoto}
        disabled={p.captureDisabled || p.recording}
        className="relative h-[74px] w-[74px] rounded-full border-4 border-white/95 bg-white/25 shadow-xl transition active:scale-95 disabled:opacity-40"
      >
        <span className="absolute inset-[6px] rounded-full bg-white" />
      </button>

      <div className="flex w-[104px] gap-2">
        <IconButton
          label={p.recording ? "Stop recording" : p.recordingSupported ? "Record video" : "Video recording not supported"}
          onClick={p.onRecord}
          disabled={!p.recordingSupported || p.captureDisabled}
          className={p.recording ? "!bg-red-600" : ""}
        >
          {p.recording ? <span className="h-4 w-4 rounded-sm bg-white" /> : <VideoIcon width={20} height={20} />}
        </IconButton>
        {p.multipleCameras && (
          <IconButton label="Switch camera" onClick={p.onSwitchCamera} disabled={p.recording}>
            <SwitchCameraIcon width={20} height={20} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
