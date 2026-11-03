// Global per-frame VFX draw budget (CONTRACT §23): the ground (rings / domes / decals), beam and trail pools each
// have their own quality budget, but nothing capped their sum, so a busy fight could add 50+ calls on top of the
// scene. Every pool registers its entry array here; a pool may take a FREE entry only while the total of active
// entries is under the cap, otherwise it recycles its own oldest active entry (so the total stays bounded).
const pools = [];
const CAP = { high: 64, medium: 38, low: 24 };

export const FXB = {
  register(arr) { if (arr && !pools.includes(arr)) pools.push(arr); },
  total() {
    let n = 0;
    for (let i = 0; i < pools.length; i++) { const a = pools[i]; for (let k = 0; k < a.length; k++) if (a[k].active) n++; }
    return n;
  },
  cap(game) {
    const q = game?.settings?.values?.effectQuality || 'medium';
    const c = CAP[q] ?? CAP.medium;
    return Math.round(c * (game?.perfScale ?? 1));
  },
  /** True while one more pooled VFX entry may be activated. */
  room(game) { return FXB.total() < FXB.cap(game); },
};
