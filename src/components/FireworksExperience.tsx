"use client";

import dynamic from "next/dynamic";

// Camera, WebGL and WebXR are browser-only: never render on the server.
const FireworksApp = dynamic(() => import("./FireworksApp"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-black">
      <div className="loader" aria-hidden />
      <div className="text-xs font-bold uppercase tracking-[0.3em] text-white/85">
        Fireworks <span className="text-amber-300">AR</span>
      </div>
    </div>
  ),
});

export default function FireworksExperience() {
  return <FireworksApp />;
}
