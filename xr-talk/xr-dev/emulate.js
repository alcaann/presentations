// WebXR emulation for working without the headset: an emulated Meta Quest 3 (headset + Touch
// controllers) replaces navigator.xr, so "Enter VR", sessionstart, the controllers' A/B/
// triggers/sticks and the app's XR code paths all run in desktop Chrome.
//
// A pipeline page opts in with one line at the top of its module script:
//   if (new URLSearchParams(location.search).has('emulate')) await import('../xr-dev/emulate.js');
// and is opened as  http://127.0.0.1:8798/<pipeline>/?emulate   (server at the repo root).
//   ?emulate        emulated Quest 3 + the DevUI overlay (move headset/controllers, press buttons,
//                   "play mode" = mouse look + keyboard-mapped controller buttons)
//   ?emulate&noui   no overlay (used by shots.mjs, which drives the controllers by script)
//
// IWER and @iwer/devui 2.7.0, MIT, Meta (github.com/meta-quest/immersive-web-emulation-runtime).
// The devui bundle's bare `import "iwer"` was rewritten to ./iwer.module.min.js when vendoring.
import { XRDevice, metaQuest3 } from './vendor/iwer.module.min.js';

const q = new URLSearchParams(location.search);
const xrDevice = new XRDevice(metaQuest3);
// Chrome on a desktop already has a (headset-less) navigator.xr; replace it
xrDevice.installRuntime({ forceInstall: true });
if (!q.has('noui')) {
  const { DevUI } = await import('./vendor/iwer-devui.module.min.js');
  xrDevice.installDevUI(DevUI);
}
// for the console and shots.mjs, e.g.  xrDevice.controllers.right.updateButtonValue('a-button', 1)
window.xrDevice = xrDevice;
