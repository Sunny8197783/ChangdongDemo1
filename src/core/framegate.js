// Frame cap gate (v4): an accumulator on the cap interval instead of "skip anything earlier than 1/cap − 2 ms".
// The old rule rounded every frame up to whole vsyncs: on a 144 Hz panel 2 vsyncs (13.9 ms) are < 14.67 ms, so
// it waited 3 (20.8 ms) = 48 fps; 165 Hz gave 55 fps. Here the deadline advances by exactly 1000/cap per rendered
// frame, so the vsync count alternates (144 Hz: 2,3,2,2,3,…) and the average is the cap. After a stall (deadline
// more than one interval behind) it resyncs to now, so it never renders a burst to catch up.
export function makeFrameGate() {
  let next = -Infinity;
  const gate = (now, cap) => {
    if (!(cap > 0)) { next = now; return true; }
    const iv = 1000 / cap;
    if (now < next - 1) return false;   // 1 ms tolerance for rAF timestamp jitter
    next += iv;
    if (next < now) next = now + iv;    // fell behind (stall, unfreeze, first frame): resync
    return true;
  };
  gate.reset = () => { next = -Infinity; };
  return gate;
}
