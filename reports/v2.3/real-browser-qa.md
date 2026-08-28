# V2.3 Real Chromium QA Notes

## Scope and evidence boundary

This record covers the V2.3 audit instance at `http://localhost:5173/?v23qa=1` and `?v23capture=1`. It is deliberately limited to what was visible in a real Chromium run. It does not infer a ship, hit, wake, or asset outcome that did not enter the observed camera frame.

| Check | Observed result | Evidence status |
|---|---|---|
| M05 task boot | The mission reached `RUNNING` with the WebGL canvas, existing HUD, night sky, and player silhouette rendered. | Observed in Chromium |
| Local GLB fallback safety | No task-start crash or missing-world failure appeared after the V2.3 model pipeline was synchronized to the audit copy. | Observed in Chromium; individual distant ship silhouette was not obtained |
| HUD quiet state | The initial M05 safe/no-contact state used the reduced-opacity world-first layout. | Observed in Chromium |
| F12 capture implementation | The new code is a display-only class toggle followed by canvas export. Direct automated synthetic F12/Q keyboard actions navigated the automation viewport to `about:blank`; this is recorded as an automation-tool limitation, not attributed to the game. | Code-reviewed; direct browser-key validation blocked |
| Periscope and combat shots | Not collected during this pass after the browser automation state changed to blank. | Not asserted |

## Honest limitations

The real Chromium automation environment repeatedly changed to `about:blank` after non-navigation key injection. Therefore, the final report must not claim a direct visual screenshot of V2.3 F12 capture, a GLB ship in the live camera frame, a torpedo hit, or a depth-charge plume from this run. Automated tests and production build remain the acceptance evidence for these integration paths; player-hardware capture remains a release sign-off item.
