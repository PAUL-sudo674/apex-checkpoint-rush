import { createFileRoute } from "@tanstack/react-router";
import Game from "@/game/Game";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Apex Street Racer — Night Circuit Racing" },
      { name: "description", content: "Race a 3-lap night street circuit in your browser. Hit every checkpoint and set the fastest time." },
      { property: "og:title", content: "Apex Street Racer" },
      { property: "og:description", content: "A playable 3D browser street racing game." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Game,
});
