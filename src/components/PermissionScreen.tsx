"use client";

import type { CameraStatus } from "@/types";
import { permissionHelp } from "@/camera/CameraPermissions";

interface Props {
  status: CameraStatus;
  webgl: boolean;
  onRetry: () => void;
  onContinue: () => void;
}

/** Shown in place of the live feed when the camera can't be used. */
export function PermissionScreen({ status, webgl, onRetry, onContinue }: Props) {
  if (!webgl) {
    return (
      <Panel title="Your browser can’t show fireworks">
        <p>This experience needs WebGL graphics, which seem to be turned off or unsupported.</p>
        <p className="mt-2">Try a recent version of Chrome, Safari or Edge, and make sure hardware acceleration is on.</p>
      </Panel>
    );
  }

  if (status === "denied") {
    return (
      <Panel title="Camera access is off">
        <p>Fireworks AR shows fireworks over your camera view. To turn the camera back on:</p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-left">
          {permissionHelp().map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <Actions onRetry={onRetry} onContinue={onContinue} />
      </Panel>
    );
  }

  if (status === "insecure") {
    return (
      <Panel title="Secure connection needed">
        <p>Browsers only allow the camera on HTTPS pages. Open this site using an https:// address.</p>
        <Actions onContinue={onContinue} />
      </Panel>
    );
  }

  if (status === "unavailable") {
    return (
      <Panel title="No camera found">
        <p>We couldn’t start a camera. It may be in use by another app, or this device may not have one.</p>
        <Actions onRetry={onRetry} onContinue={onContinue} />
      </Panel>
    );
  }

  if (status === "stopped") {
    return (
      <Panel title="Camera closed">
        <p>The camera is off. Nothing is recording.</p>
        <Actions onRetry={onRetry} retryLabel="Open camera" onContinue={onContinue} />
      </Panel>
    );
  }

  return null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ui absolute inset-0 z-30 flex items-center justify-center p-6">
      <div role="alertdialog" aria-label={title} className="glass-strong w-full max-w-sm rounded-3xl p-6 text-center text-sm leading-relaxed text-white/85">
        <h2 className="mb-3 text-lg font-semibold text-white">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Actions({ onRetry, onContinue, retryLabel = "Try again" }: { onRetry?: () => void; onContinue: () => void; retryLabel?: string }) {
  return (
    <div className="mt-5 flex flex-col gap-2">
      {onRetry && (
        <button onClick={onRetry} className="rounded-full bg-white px-4 py-2.5 font-semibold text-black">
          {retryLabel}
        </button>
      )}
      <button onClick={onContinue} className="rounded-full bg-white/10 px-4 py-2.5 font-medium text-white">
        Continue without camera
      </button>
    </div>
  );
}
