"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CapturedMedia, Mode, Settings } from "@/types";
import { Experience, type ExperienceState } from "@/engine/Experience";
import { loadSettings, saveSettings } from "@/config/settings";
import { CameraView } from "./CameraView";
import { CaptureRow, TopBar } from "./CameraControls";
import { FireworkSelector } from "./FireworkSelector";
import { ModeSelector } from "./ModeSelector";
import { SettingsPanel } from "./SettingsPanel";
import { RecordingIndicator } from "./RecordingIndicator";
import { PermissionScreen } from "./PermissionScreen";
import { MediaPreview } from "./MediaPreview";
import { FIREWORKS, RANDOM_ID } from "@/config/fireworks";

const IDLE_FADE_MS = 4500;
const SELECT_KEY = "fireworks-ar:selected";
const MODE_KEY = "fireworks-ar:mode";

function readLocal(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, v: string) {
  try {
    window.localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}

export default function FireworksApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const expRef = useRef<Experience | null>(null);

  const [state, setState] = useState<ExperienceState | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mode, setMode] = useState<Mode>("sky");
  const [selected, setSelected] = useState<string>("peony");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [media, setMedia] = useState<CapturedMedia | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [launched, setLaunched] = useState(false);
  const [idle, setIdle] = useState(false);
  const [flash, setFlash] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ---------------------------------------------------------------- startup
  useEffect(() => {
    const root = rootRef.current, video = videoRef.current, canvas = canvasRef.current;
    if (!root || !video || !canvas) return;

    const s = loadSettings();
    const initialMode = (readLocal(MODE_KEY) as Mode) || "sky";
    const sel = readLocal(SELECT_KEY);
    const initialSel = sel && (sel === RANDOM_ID || FIREWORKS.some((f) => f.id === sel)) ? sel : "peony";

    let exp: Experience;
    try {
      exp = new Experience(video, canvas, root);
    } catch {
      setState({
        camera: "idle", webgl: false, arMode: "overlay", xrSupported: false, tracking: false,
        torchSupported: false, torchOn: false, multipleCameras: false, facing: "environment",
        recordingSupported: false, recording: false, recordSeconds: 0, qualityLevel: 0, throttled: 0,
      });
      return;
    }
    expRef.current = exp;
    exp.onState = (st) => setState(st);
    exp.onToast = showToast;
    exp.onRecordingSaved = (m) => m && setMedia(m);
    exp.applySettings(s);
    exp.setMode(initialMode);
    exp.setSelected(initialSel);
    setSettings(s);
    setMode(initialMode);
    setSelected(initialSel);
    setState(exp.state);

    if (exp.state.webgl) {
      exp.start();
      void exp.startCamera();
    }

    // WebXR DOM overlay: taps on controls must not also launch fireworks.
    const blockXRSelect = (e: Event) => {
      if ((e.target as HTMLElement)?.closest?.("[data-ui]")) e.preventDefault();
    };
    root.addEventListener("beforexrselect", blockXRSelect);

    return () => {
      root.removeEventListener("beforexrselect", blockXRSelect);
      exp.dispose();
      expRef.current = null;
    };
  }, [showToast]);

  // Stop the camera if the page is being unloaded / navigated away.
  useEffect(() => {
    const stop = () => expRef.current?.close();
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, []);

  // Free blob memory when a preview is dismissed.
  useEffect(() => {
    if (!media) return;
    const url = media.url;
    return () => URL.revokeObjectURL(url);
  }, [media]);

  // Throttle feedback (particle budget reached).
  const throttled = state?.throttled ?? 0;
  useEffect(() => {
    if (throttled > 0 && throttled % 6 === 1) showToast("Easy there — letting the sky clear a little");
  }, [throttled, showToast]);

  // ------------------------------------------------------------ idle fading
  const poke = useCallback(() => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_FADE_MS);
  }, []);
  useEffect(() => {
    poke();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [poke]);

  // --------------------------------------------------------------- actions
  const updateSettings = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
    expRef.current?.applySettings(s);
  }, []);

  const changeMode = (m: Mode) => {
    setMode(m);
    writeLocal(MODE_KEY, m);
    expRef.current?.setMode(m);
    if (m === "world" && state && !state.xrSupported) {
      showToast("Surface tracking unavailable — tap the ground or a wall to place fireworks");
    }
  };

  const select = (id: string) => {
    setSelected(id);
    writeLocal(SELECT_KEY, id);
    expRef.current?.setSelected(id);
  };

  const takePhoto = async () => {
    const exp = expRef.current;
    if (!exp) return;
    try {
      const m = await exp.takePhoto();
      if (settings?.flash !== "reduced") {
        setFlash(true);
        setTimeout(() => setFlash(false), 160);
      }
      setMedia(m);
    } catch (e) {
      showToast((e as Error)?.message || "Couldn’t capture the photo");
    }
  };

  const toggleRecord = async () => {
    const exp = expRef.current;
    if (!exp) return;
    if (exp.state.recording) {
      await exp.stopRecording();
    } else {
      try {
        exp.startRecording();
      } catch (e) {
        showToast((e as Error)?.message || "Recording couldn’t start");
      }
    }
  };

  const switchCamera = async () => {
    const exp = expRef.current;
    if (!exp || !settings) return;
    await exp.switchCamera();
    const s = { ...settings, facing: exp.camera.facing };
    setSettings(s);
    saveSettings(s);
  };

  const toggleSound = () => settings && updateSettings({ ...settings, sound: !settings.sound });

  const closeExperience = () => {
    expRef.current?.close();
    setSettingsOpen(false);
  };

  const retryCamera = () => void expRef.current?.startCamera();
  const continueWithout = () => expRef.current?.continueWithoutCamera();

  const toggleXR = async () => {
    const exp = expRef.current;
    if (!exp) return;
    if (exp.state.arMode === "webxr") await exp.exitXR();
    else {
      if (mode !== "world") changeMode("world");
      await exp.enterXR();
    }
  };

  // --------------------------------------------------------------- input
  const onPointerDown = (e: React.PointerEvent) => {
    poke();
    if (e.button > 0) return;
    expRef.current?.pointerDown(e.pointerId, e.clientX, e.clientY);
    if (!launched) setLaunched(true);
  };
  const onPointerMove = (e: React.PointerEvent) => expRef.current?.pointerMove(e.pointerId, e.clientX, e.clientY);
  const onPointerUp = (e: React.PointerEvent) => expRef.current?.pointerUp(e.pointerId);

  const onLaunchKey = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      poke();
      expRef.current?.launchRandomPosition();
      if (!launched) setLaunched(true);
    }
  };

  // Global shortcuts (desktop): F finale, P photo, R record, M mute.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (settingsOpen || media || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key.toLowerCase();
      if (k === "f") expRef.current?.finale();
      else if (k === "p") void takePhoto();
      else if (k === "r") void toggleRecord();
      else if (k === "m") toggleSound();
      else return;
      poke();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ---------------------------------------------------------------- render
  const cam = state?.camera ?? "idle";
  const camActive = cam === "active";
  const xrActive = state?.arMode === "webxr";
  const showBlocking = !state?.webgl || ["denied", "insecure", "unavailable", "stopped"].includes(cam);
  const loading = !!state?.webgl && (cam === "idle" || cam === "requesting");
  const live = camActive || cam === "none" || xrActive;
  const fade = idle && !settingsOpen && !state?.recording;

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden bg-black text-white" onPointerDownCapture={poke}>
      <CameraView
        videoRef={videoRef}
        canvasRef={canvasRef}
        mirror={state?.facing === "user"}
        showVideo={camActive && !xrActive}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onLaunchKey}
      />

      {/* Shutter flash */}
      <div className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-150 ${flash ? "opacity-70" : "opacity-0"}`} />

      {loading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4" role="status">
          <div className="loader" aria-hidden />
          <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/85">
            Fireworks <span className="text-amber-300">AR</span>
          </div>
          {cam === "requesting" && <div className="text-xs text-white/60">Allow camera access to begin</div>}
        </div>
      )}

      {showBlocking && state && (
        <PermissionScreen status={cam} webgl={state.webgl} onRetry={retryCamera} onContinue={continueWithout} />
      )}

      {live && (
        <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between">
          {/* Top */}
          <div
            className={`pt-[max(0.75rem,env(safe-area-inset-top))] px-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] transition-opacity duration-700 ${fade ? "opacity-35" : "opacity-100"}`}
          >
            <div data-ui className="pointer-events-auto">
              <TopBar
                onClose={closeExperience}
                soundOn={!!settings?.sound}
                onSound={toggleSound}
                torchSupported={!!state?.torchSupported}
                torchOn={!!state?.torchOn}
                onTorch={() => void expRef.current?.toggleTorch()}
                onSettings={() => setSettingsOpen(true)}
              />
            </div>
            <div className="mt-3 flex flex-col items-center gap-2">
              {state?.recording ? (
                <RecordingIndicator seconds={state.recordSeconds} />
              ) : (
                <div data-ui className="pointer-events-auto">
                  <ModeSelector mode={mode} onChange={changeMode} />
                </div>
              )}
              {mode === "world" && !xrActive && (
                <div className="rounded-full bg-black/40 px-3 py-1 text-[10.5px] text-white/75">
                  {state?.xrSupported ? "Tap the cube for surface tracking" : "Screen placement · tracking unavailable"}
                </div>
              )}
              {xrActive && (
                <div className="rounded-full bg-black/40 px-3 py-1 text-[10.5px] text-white/80">
                  Move your phone to find a surface, then tap
                </div>
              )}
            </div>
          </div>

          {/* Hint */}
          {!launched && (
            <div className="pointer-events-none flex justify-center px-6 text-center">
              <span className="hint rounded-full bg-black/35 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm">
                {mode === "sky" ? "Point at the sky and tap anywhere" : "Tap the ground or a wall"} · hold for more
              </span>
            </div>
          )}

          {/* Bottom */}
          <div
            className={`flex flex-col gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-700 ${fade ? "opacity-35" : "opacity-100"}`}
          >
            <div data-ui className="pointer-events-auto">
              <FireworkSelector selected={selected} onSelect={select} />
            </div>
            <div data-ui className="pointer-events-auto">
              <CaptureRow
                onFinale={() => expRef.current?.finale()}
                onPhoto={() => void takePhoto()}
                onRecord={() => void toggleRecord()}
                recording={!!state?.recording}
                recordingSupported={!!state?.recordingSupported}
                captureDisabled={xrActive}
                multipleCameras={!!state?.multipleCameras && camActive}
                onSwitchCamera={() => void switchCamera()}
                xrAvailable={!!state?.xrSupported && mode === "world"}
                xrActive={xrActive}
                onXR={() => void toggleXR()}
              />
            </div>
          </div>
        </div>
      )}

      {settings && state && (
        <div data-ui>
          <SettingsPanel
            open={settingsOpen}
            settings={settings}
            onChange={updateSettings}
            onClose={() => setSettingsOpen(false)}
            torchSupported={state.torchSupported}
            torchOn={state.torchOn}
            onTorch={() => void expRef.current?.toggleTorch()}
            multipleCameras={state.multipleCameras}
            recordingSupported={state.recordingSupported}
            trackingActive={state.tracking}
          />
        </div>
      )}

      {media && (
        <div data-ui>
          <MediaPreview media={media} onDone={() => setMedia(null)} onToast={showToast} />
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+7.5rem)] z-50 flex justify-center px-6">
          <div role="status" aria-live="polite" className="glass-strong rounded-full px-4 py-2 text-center text-xs text-white">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
