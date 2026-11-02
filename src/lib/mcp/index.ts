import { defineMcp } from "@lovable.dev/mcp-js";
import getGameInfo from "./tools/get-game-info";

export default defineMcp({
  name: "apex-street-racer",
  title: "Apex Street Racer",
  version: "0.1.0",
  instructions: "Public info about the Apex Street Racer browser racing game: track, laps, checkpoints, top speed and controls.",
  tools: [getGameInfo],
});
