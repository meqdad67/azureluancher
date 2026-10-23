/** RAM planning for the game process. Pure (no electron) so it can be tested with plain node. */
const STEP = 256;
const FIXED_XMS_MIN_TOTAL = 8192; // -Xms = -Xmx only on machines with >= 8 GB

/** Highest heap we allow: always leave ~2 GB for Windows + the launcher, but never below 1.5 GB. */
function heapCap(totalMB) {
  return Math.max(1536, Math.floor((totalMB - 2048) / STEP) * STEP);
}

/** setting: 'auto' | true | false. Auto = machines under 6 GB. */
function isLow(totalMB, setting) {
  if (setting === true || setting === 'on') return true;
  if (setting === false || setting === 'off') return false;
  return totalMB < 6144;
}

function plan({ totalMB, want, minWant, lowSetting, useFast }) {
  const cap = heapCap(totalMB);
  const wanted = want && want > 0 ? want : 2048;
  const maxRam = Math.min(wanted, cap);
  const low = isLow(totalMB, lowSetting);
  const fixedXms = !!useFast && !low && totalMB >= FIXED_XMS_MIN_TOTAL;
  const minRam = fixedXms ? maxRam : Math.min(Math.max(256, minWant || 512), maxRam);
  return { maxRam, minRam, cap, low, capped: maxRam < wanted, fixedXms };
}

module.exports = { heapCap, isLow, plan };
