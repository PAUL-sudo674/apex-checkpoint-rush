import { defineTool } from "@lovable.dev/mcp-js";
import { C } from "@/game/sim";
import { TRACK, CHECKPOINTS, HALF } from "@/game/track";

export default defineTool({
  name: "get_game_info",
  title: "Get game info",
  description: "Describe Apex Street Racer: track length, laps, checkpoints, top speed and controls.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const pts = TRACK.pts;
    const lengthM = Math.round(pts[pts.length - 1]?.d ?? 0);
    const info = {
      title: "Apex Street Racer",
      trackLengthMeters: lengthM,
      roadWidthMeters: HALF * 2,
      laps: C.LAPS,
      checkpointsPerLap: CHECKPOINTS.length,
      topSpeedKmh: Math.round(C.MAX * 3.6),
      controls: {
        keyboard: "W/Up accelerate, S/Down brake/reverse, A/D or Left/Right steer, X drift, Shift/Space nitro, P/Esc pause, R restart, Enter start",
        touch: "Drag the lower-left steering wheel; use gas, brake, drift and nitro on the right in landscape",
      },
      notes: "Best times are stored only in each player's browser.",
    };
    return {
      content: [{ type: "text", text: `Apex Street Racer: ${C.LAPS} laps of a ${lengthM} m night circuit, ${CHECKPOINTS.length} checkpoints per lap, top speed ${info.topSpeedKmh} km/h. Controls: ${info.controls.keyboard}.` }],
      structuredContent: info,
    };
  },
});
