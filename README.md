# Fireworks AR

Augmented-reality fireworks in the browser. Open the site, allow the camera, tap to launch.
Built with Next.js, TypeScript, Three.js and Tailwind. It has no backend; camera frames stay on the device.

## Run

```bash
npm install
npm run dev          # http://localhost:3000 (desktop webcam)
npm run dev:https    # self-signed HTTPS, so phones on your LAN can use the camera
npm run build && npm start
```

Mobile browsers only allow the camera on HTTPS (or localhost). Deploy to Vercel as-is (`vercel deploy`); no environment variables are needed.

## Using it

| Action | Touch | Keyboard |
| --- | --- | --- |
| Launch | Tap | Space / Enter (launch area focused) |
| Continuous launch | Hold | hold Space |
| Grand finale | ✦ button | F |
| Photo / video | Shutter / camera button | P / R |
| Mute | Speaker button | M |
| Change effect | Carousel | ← → inside the carousel |

* **Sky mode**: rockets climb from below the view and burst where you tapped (80–125 m away).
* **World mode**: tap the ground or a wall. Without WebXR, a virtual ground plane 1.5 m below the phone is used, and a virtual wall when you tap above the horizon. On WebXR devices (Android Chrome with ARCore), the cube button starts an `immersive-ar` session with real surface hit-testing.
* **Motion tracking** (on by default): uses the gyroscope so fireworks stay fixed in space as you pan (3-DoF). On iOS the motion permission is requested on the first tap.

## Architecture (SRS §7.3)

| Module | File |
| --- | --- |
| Camera Manager | `src/camera/CameraManager.ts`, `CameraPermissions.ts` |
| AR Manager | `src/ar/ARManager.ts`, `OverlayManager.ts` (gyro overlay), `WebXRManager.ts` |
| Fireworks Engine | `src/engine/FireworksEngine.ts`, `ParticleSystem.ts`, `PhysicsEngine.ts`, `FireworkFactory.ts`, `shapes.ts` |
| Fireworks Controller | `src/engine/FireworksController.ts` (tap → launch plan, finale) |
| Rendering Engine | `src/engine/Renderer.ts` (FOV matching, adaptive quality) |
| Capture Manager | `src/capture/Compositor.ts`, `PhotoCapture.ts`, `VideoRecorder.ts` |
| UI Manager | `src/components/*` and the orchestrator `src/engine/Experience.ts` |
| Sound | `src/audio/SoundEngine.ts` (procedurally synthesised; no audio files) |

**Particles.** One pooled `THREE.Points` with typed arrays, at most 30k sparks plus 1.2k smoke. Dead particles are swap-removed, and per frame only the live range of each buffer is uploaded. The engine creates no per-particle objects. Trails are ember particles. Crackle and crossette effects come from death callbacks.

**Adding a firework.** Append an entry to `src/config/fireworks.ts`. Its carousel thumbnail is generated automatically.

**Capture.** Camera video plus the WebGL canvas are composited into a 2D canvas (`lighter` blend) right after each render. That canvas feeds `captureStream()` and then `MediaRecorder`, using MP4 where supported and WebM otherwise. Recordings are capped at 3 minutes and saved when the tab is hidden.

## Known limitations

* The real camera's field of view isn't exposed by browsers. It's estimated at about 66° across the long side, so gyro-anchored placement is approximate.
* WebXR `immersive-ar` only runs on supported Android devices. Photo and video are disabled during an XR session because browsers don't expose the camera pixels there.
* There is no bloom post-pass. The glow comes from the additive point shader and burst halos, which keeps it cheap on low-end phones.
* So far it has been tested only in desktop Chrome (headless, fake camera). Real-device testing on iOS Safari and Android Chrome (SRS §14) is still to do.
