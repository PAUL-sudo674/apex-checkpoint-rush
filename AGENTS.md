<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Vehicle rules and tunable SI constants remain in `src/game/sim.ts`: +Z forward, world velocity, force/mass acceleration, bicycle yaw with inertia and friction-limited grip. The scene uses its bounded fixed-step clock and interpolated poses so handling is testable independently of rendering; HUD speed derives from velocity magnitude and gears from signed forward speed.
- Keyboard bindings are centralized in `src/game/input.ts`; keyboard and captured touch inputs merge before simulation so simultaneous inputs and key release remain consistent.
- The steering wheel sends a normalized analog steer value to simulation; digital steering takes priority, and wheel animation/recentering is independent of rendering performance.
- Driving effects use bounded instanced pools updated by the scene stepper; CSS semantic colors are resolved for new Three.js materials so effects remain theme-adherent.
- Procedural audio uses one gesture-created AudioContext and a master limiter; all voices respect mute and page visibility to avoid clipping and background sound.
- Development checks use `?race`, `window.__game.state`, `.start()`, `.pause()`, `.setInput(values)`, `.sim(seconds)`, `.audio`, and `[data-scene-ready]`; hooks are development-only to keep production gameplay intact.
