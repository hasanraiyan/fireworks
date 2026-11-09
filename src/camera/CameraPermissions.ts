import type { CameraStatus } from "@/types";

export function cameraSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/** Map a getUserMedia error to a user-facing status. */
export function classifyCameraError(err: unknown): CameraStatus {
  if (typeof window !== "undefined" && !window.isSecureContext) return "insecure";
  const name = (err as { name?: string })?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
    default:
      return "unavailable";
  }
}

/** Best-effort read of the current permission state (not supported everywhere). */
export async function queryCameraPermission(): Promise<PermissionState | "unknown"> {
  try {
    const res = await navigator.permissions?.query({ name: "camera" as PermissionName });
    return res?.state ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Platform-specific instructions for re-enabling a denied camera. */
export function permissionHelp(): string[] {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iPhone|iPad|iPod/.test(ua)) {
    return [
      "Tap the “aA” icon in Safari’s address bar, then Website Settings.",
      "Set Camera to Allow, then tap Try again.",
      "Or open Settings → Safari → Camera and choose Allow.",
    ];
  }
  if (/Android/.test(ua)) {
    return [
      "Tap the lock or settings icon next to the address bar.",
      "Open Permissions and allow Camera.",
      "Then tap Try again.",
    ];
  }
  return [
    "Click the camera or lock icon in the address bar.",
    "Allow camera access for this site.",
    "Then click Try again.",
  ];
}
