// SILENT DEPTH — boot entry (stub; replaced by ui-engineer with full shell)
// Headless-first: the engine in src/gameplay|sonar|ai|combat|missions|world
// must NEVER import DOM. This file is the only DOM bridge, together with
// src/rendering and src/ui.
import './style.css'

const root = document.getElementById('app')!
const boot = document.createElement('div')
boot.id = 'boot'
boot.innerHTML = `<h1>SILENT DEPTH 深海猎手</h1><p>booting…</p>`
root.appendChild(boot)
console.log('[silent-depth] boot stub ok')
