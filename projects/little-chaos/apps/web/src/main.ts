import "./styles.css";
import { Capture, supportedVideoType } from "./capture.ts";
import {
  captions,
  createForm,
  createWord,
  FORM_NAMES,
  type FormName,
  normalizeWord,
  type PaletteName,
  palettes,
  readState,
  writeState,
} from "./forms.ts";
import { ParticleRenderer } from "./renderer.ts";

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) {
    throw new Error(`Missing interface element: ${selector}`);
  }
  return found;
}

const state = readState(window.location.search);
const canvas = element<HTMLCanvasElement>("#universe");
const app = element("#app");
const toast = element("#toast");
const recordButton = element<HTMLButtonElement>("#record");
const recordLabel = element("#record-label");
const pauseButton = element<HTMLButtonElement>("#pause");
const focusButton = element<HTMLButtonElement>("#focus");
const tripButton = element<HTMLButtonElement>("#tour");
const dialog = element<HTMLDialogElement>("#word-dialog");
const wordInput = element<HTMLInputElement>("#word-input");
const energyInput = element<HTMLInputElement>("#energy");
const chaosFill = element("#chaos-fill");
let toastTimeout = 0;

function notify(message: string) {
  window.clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.add("visible");
  toastTimeout = window.setTimeout(() => toast.classList.remove("visible"), 4000);
}

function start() {
  const initial = state.form === "word" ? createWord(state.word) : createForm(state.form);
  const renderer = new ParticleRenderer(canvas, initial);
  const capture = new Capture(renderer);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  renderer.paused = reducedMotion.matches;
  let trip = false;
  let tripElapsed = 0;
  let tripIndex = Math.max(0, FORM_NAMES.indexOf(state.form));
  let previousTime = performance.now();
  let recordChaos: number | undefined;
  let pointerDown = false;
  let spaceDown = false;
  let focusMode = false;

  function updateUrl() {
    history.replaceState(null, "", `${window.location.pathname}?${writeState(state)}`);
  }

  function updatePause() {
    pauseButton.setAttribute("aria-pressed", String(renderer.paused));
    pauseButton.setAttribute(
      "aria-label",
      renderer.paused ? "Resume animation" : "Pause animation",
    );
    pauseButton.innerHTML = renderer.paused ? "▷ <span>Resume</span>" : "Ⅱ <span>Pause</span>";
  }

  function setFocus(focused: boolean) {
    focusMode = focused;
    renderer.focused = focused;
    app.classList.toggle("focus-mode", focused);
    focusButton.setAttribute("aria-pressed", String(focused));
    for (const selector of [".topbar", ".intro", ".side-controls", ".control-deck", ".footer"]) {
      element(selector).inert = focused;
    }
    if (focused) {
      element<HTMLButtonElement>("#exit-focus").focus();
    } else {
      focusButton.focus();
    }
  }

  function setTrip(enabled: boolean) {
    trip = enabled;
    tripElapsed = 0;
    tripIndex = FORM_NAMES.indexOf(state.form);
    tripButton.setAttribute("aria-pressed", String(enabled));
    tripButton.innerHTML = enabled ? "Ⅱ <span>End trip</span>" : "▷ <span>Take a trip</span>";
    if (enabled) {
      renderer.paused = false;
      updatePause();
      notify("A new form every 6 seconds. Sit back for a moment.");
    }
  }

  function selectForm(form: FormName, automatic = false) {
    try {
      renderer.setForm(form === "word" ? createWord(state.word) : createForm(form));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Try a different word.");
      return;
    }
    state.form = form;
    document.querySelectorAll<HTMLButtonElement>("[data-shape]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset["shape"] === form));
    });
    const [number, name] = captions[form];
    element("#specimen-number").textContent = `FIG. ${number}`;
    element("#specimen-name").textContent = form === "word" ? state.word : name;
    element("#specimen-caption").textContent =
      `${form === "word" ? "YOUR THOUGHT" : form.toUpperCase()} · 32,000 POINTS IN SPACE`;
    if (!automatic && trip) {
      setTrip(false);
    }
    updateUrl();
  }

  function selectPalette(palette: PaletteName) {
    state.palette = palette;
    renderer.setPalette(palette);
    document.documentElement.style.setProperty("--accent", palettes[palette].accent);
    document.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset["palette"] === palette));
    });
    updateUrl();
  }

  function updateEnergy() {
    renderer.energy = state.energy / 100;
    energyInput.value = String(state.energy);
    energyInput.style.background = `linear-gradient(to right, var(--accent) ${state.energy}%, #ffffff1c ${state.energy}%)`;
    element<HTMLOutputElement>("#energy-value").value = `${state.energy}%`;
    updateUrl();
  }

  function scatter() {
    renderer.scattering = pointerDown || spaceDown;
    document.body.classList.toggle("scattering", renderer.scattering);
  }

  function release() {
    pointerDown = false;
    spaceDown = false;
    scatter();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || capture.recording) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    renderer.setPointer(event.clientX, event.clientY);
    pointerDown = true;
    if (renderer.paused) {
      notify("Animation is paused. Press Resume to play.");
    }
    scatter();
  });
  canvas.addEventListener("pointermove", (event) =>
    renderer.setPointer(event.clientX, event.clientY),
  );
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  window.addEventListener("blur", release);
  document.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || dialog.open || capture.recording) {
      return;
    }
    if (event.code === "Space" && (event.target === canvas || event.target === document.body)) {
      event.preventDefault();
      spaceDown = true;
      scatter();
    }
    if (event.key === "Escape" && focusMode) {
      setFocus(false);
    }
  });
  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spaceDown = false;
      scatter();
    }
  });

  document.querySelectorAll<HTMLButtonElement>("[data-shape]").forEach((button) => {
    button.addEventListener("click", () => {
      const form = button.dataset["shape"] as FormName;
      if (form === "word") {
        wordInput.value = state.word;
        dialog.showModal();
        wordInput.select();
      } else {
        selectForm(form);
      }
    });
  });
  element("#word-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const word = normalizeWord(wordInput.value);
    if (!word) {
      wordInput.setCustomValidity("Give your particles a word to hold.");
      wordInput.reportValidity();
      return;
    }
    try {
      createWord(word);
    } catch {
      notify("Try a word with visible letters or symbols.");
      return;
    }
    state.word = word;
    selectForm("word");
    dialog.close();
  });
  wordInput.addEventListener("input", () => wordInput.setCustomValidity(""));
  element("#close-dialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom
      ) {
        dialog.close();
      }
    }
  });
  document.querySelectorAll<HTMLButtonElement>("[data-palette]").forEach((button) => {
    button.addEventListener("click", () => selectPalette(button.dataset["palette"] as PaletteName));
  });
  energyInput.addEventListener("input", () => {
    state.energy = Number(energyInput.value);
    updateEnergy();
  });
  pauseButton.addEventListener("click", () => {
    renderer.paused = !renderer.paused;
    updatePause();
  });
  tripButton.addEventListener("click", () => setTrip(!trip));
  focusButton.addEventListener("click", () => setFocus(true));
  element("#exit-focus").addEventListener("click", () => setFocus(false));
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches && !capture.recording) {
      renderer.paused = true;
      updatePause();
    }
  });

  function finishRecording() {
    recordChaos = undefined;
    renderer.scattering = false;
    app.classList.remove("recording");
    recordLabel.textContent = "Record 8s";
    document
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")
      .forEach((button) => {
        button.disabled = false;
      });
    renderer.focused = focusMode;
    updatePause();
  }
  capture.onProgress = (remaining) => {
    recordLabel.textContent = `${Math.ceil(remaining)}s remaining`;
  };
  capture.onComplete = () => {
    finishRecording();
    notify("Your little universe is ready to post.");
  };
  capture.onError = (message) => {
    finishRecording();
    notify(message);
  };
  recordButton.addEventListener("click", () => {
    try {
      setTrip(false);
      release();
      capture.start();
      app.classList.add("recording");
      document
        .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")
        .forEach((button) => {
          button.disabled = true;
        });
      notify("Recording a little chaos. Your 8-second clip saves automatically.");
    } catch (error) {
      finishRecording();
      notify(error instanceof Error ? error.message : "Couldn't start recording.");
    }
  });
  if (!supportedVideoType()) {
    recordButton.disabled = true;
    recordButton.title = "Video export isn't supported in this browser. Save an image instead.";
    recordLabel.textContent = "Video unavailable";
  }
  element("#snapshot").addEventListener("click", async () => {
    try {
      await capture.snapshot();
      notify("A little piece of the universe, saved.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Couldn't save your image.");
    }
  });
  element("#share").addEventListener("click", async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Little Chaos — Order is optional.",
          text: "I made you a tiny universe. Go ahead. Break it.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        notify("Link copied. Your form, colors, and word come with it.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        notify("Copy the address in your browser to share this universe.");
      }
    }
  });

  document.addEventListener("visibilitychange", () => {
    previousTime = performance.now();
    if (document.hidden) {
      release();
      if (capture.recording) {
        capture.cancel();
        finishRecording();
        notify("Recording stopped when you left the tab. Try again when you're ready.");
      }
    }
  });
  renderer.onContextLost = () => {
    if (capture.recording) {
      capture.cancel();
      finishRecording();
    }
    element("#fallback").hidden = false;
  };
  renderer.onContextRestored = () => {
    element("#fallback").hidden = true;
  };
  selectForm(state.form);
  selectPalette(state.palette);
  updateEnergy();
  updatePause();
  document.documentElement.dataset["ready"] = "true";

  function frame(now: number) {
    const dt = Math.min((now - previousTime) / 1000, 0.1);
    previousTime = now;
    if (!document.hidden) {
      if (trip && !renderer.paused) {
        tripElapsed += dt;
        if (tripElapsed >= 6) {
          tripElapsed = 0;
          tripIndex = (tripIndex + 1) % FORM_NAMES.length;
          selectForm(FORM_NAMES[tripIndex] ?? "saturn", true);
        }
      }
      const chaos = renderer.render(dt, recordChaos);
      chaosFill.style.width = `${3 + chaos * 97}%`;
      recordChaos = capture.tick(dt);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

try {
  start();
} catch (error) {
  console.error(error);
  element("#fallback").hidden = false;
  document
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>("button, input")
    .forEach((button) => {
      button.disabled = true;
    });
}
