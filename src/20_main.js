// Entry point: boot the modules and start the default match (autoplay) unless ?auto=0.
(function (HPO) {
  'use strict';
  const q = new URLSearchParams(location.search);
  HPO.cfg.mobile = (window.matchMedia && matchMedia('(pointer:coarse)').matches) || innerWidth < 700;
  HPO.query = q;
  function go() {
    const tod = q.get('tod') || 'day', venue = q.get('venue') || 'classicBlue';
    HPO.boot({ container: document.getElementById('stage') || document.body, tod: tod, venue: venue });
    const R = HPO.mod.render;
    if (R && R.setPixelSize) R.setPixelSize(+q.get('px') || (HPO.cfg.mobile ? 3 : 2));
    if (q.get('cam') && R) R.setCameraMode(q.get('cam'));
    if (q.get('auto') !== '0' && HPO.mod.match) {
      HPO.mod.match.start({ format: q.get('format') || 'quick', scoring: q.get('scoring') || 'golden', type: q.get('type') || 'M', venue: venue, seed: +q.get('seed') || 7, fast: q.get('fast') === '1' });
      HPO.mod.match.setSpeed(+q.get('speed') || 1);
    }
    HPO.BUS.emit('match:new', { config: HPO.mod.match && HPO.mod.match.cfg });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})(HPO);
