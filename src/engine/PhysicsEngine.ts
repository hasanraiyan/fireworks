/**
 * Physics helpers for the particle pools. Integration is done in place on
 * typed arrays (no per-particle objects) so thousands of sparks cost almost
 * nothing to the garbage collector.
 */

/** Semi-implicit Euler with exponential air resistance and gravity. */
export function integrate(
  pos: Float32Array,
  vel: Float32Array,
  drag: Float32Array,
  grav: Float32Array,
  count: number,
  dt: number,
  windX: number,
): void {
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    const damp = Math.exp(-drag[i] * dt);
    let vx = vel[i3] * damp;
    let vy = vel[i3 + 1] * damp;
    let vz = vel[i3 + 2] * damp;
    vy -= grav[i] * dt;
    // Wind only matters once a particle has slowed down (smoke, embers).
    vx += windX * dt * (1 - damp) * 4;
    vel[i3] = vx;
    vel[i3 + 1] = vy;
    vel[i3 + 2] = vz;
    pos[i3] += vx * dt;
    pos[i3 + 1] += vy * dt;
    pos[i3 + 2] += vz * dt;
  }
}

/** Burst speed that makes stars coast to roughly `radius` under `drag`. */
export function burstSpeed(radius: number, drag: number): number {
  // With v' = -k v the asymptotic travel distance is v0 / k.
  return radius * drag;
}

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);
