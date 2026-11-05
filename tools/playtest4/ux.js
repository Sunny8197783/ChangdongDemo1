// playtest4 section: ux (PLAN v4 §7.8 UX1–UX3, B). Owned by ux.
module.exports = async function ux(PT) {
  const pg = await PT.boot('&cls=mage&skills=preset:starter_mage', { w: 960, h: 540 });
  PT.check('boot', pg.ready, pg.params);
  PT.check('no console errors at boot', pg.errors().length === 0, pg.errors().slice(0, 6));
  await pg.close();
};
