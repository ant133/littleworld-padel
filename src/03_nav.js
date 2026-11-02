// Navigation: bounds, teammate separation, door paths. The court is open ground, so paths are mostly straight lines.
(function (HPO) {
  'use strict';
  const U = HPO.util;
  const DOORS = [{ x: 0, z: 5 }, { x: 0, z: -5 }];

  HPO.mod.nav = {
    CELL: 0.25, DOORS: DOORS,
    // movement box for a player on side sign sx (x sign of own half); `outside` widens it for door retrievals
    bounds(sx, outside) {
      if (outside) return { xmin: -13, xmax: 13, zmin: -8, zmax: 8 };
      return sx < 0 ? { xmin: -9.55, xmax: -0.55, zmin: -4.6, zmax: 4.6 } : { xmin: 0.55, xmax: 9.55, zmin: -4.6, zmax: 4.6 };
    },
    clamp(p, b) { p.x = U.clamp(p.x, b.xmin, b.xmax); p.z = U.clamp(p.z, b.zmin, b.zmax); return p; },
    // repulsion from a neighbour closer than minDist (1.2 m default); returns an acceleration-direction vector
    separation(p, q, minDist) {
      const md = minDist || 1.2, dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz);
      if (d >= md) return { x: 0, z: 0 };
      if (d < 1e-4) return { x: 0, z: 1 };
      const k = (md - d) / md;
      return { x: dx / d * k, z: dz / d * k };
    },
    // waypoints from inside the court to outside through the nearest door and back
    doorPath(from, to) {
      let best = null, bd = 1e9;
      DOORS.forEach(function (d) { const c = Math.hypot(from.x - d.x, from.z - d.z) + Math.hypot(to.x - d.x, to.z - d.z); if (c < bd) { bd = c; best = d; } });
      const sz = best.z > 0 ? 1 : -1;
      return [{ x: best.x, z: sz * 4.5 }, { x: best.x, z: sz * 5.8 }, { x: to.x, z: to.z }];
    },
    // time to cover distance d starting at speed vp (towards target) with accel a, cap vmax
    timeTo(d, vp, vmax, a) {
      if (d <= 0) return 0;
      const v0 = Math.max(0, Math.min(vp, vmax));
      const dAcc = (vmax * vmax - v0 * v0) / (2 * a);
      if (d <= dAcc) return (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a;
      return (vmax - v0) / a + (d - dAcc) / vmax;
    }
  };
})(HPO);
