(function () {
  "use strict";

  const SCALE = 6;

  const searchInput = document.getElementById("search");
  const classListEl = document.getElementById("class-list");
  const emptyState = document.getElementById("empty-state");
  const editor = document.getElementById("editor");
  const editorTitle = document.getElementById("editor-title");
  const canvas = document.getElementById("preview");
  const ctx = canvas.getContext("2d");
  const swatchesEl = document.getElementById("swatches");
  const activeSlotNum = document.getElementById("active-slot-num");
  const activeColorHex = document.getElementById("active-color-hex");
  const activeR = document.getElementById("active-r");
  const activeG = document.getElementById("active-g");
  const activeB = document.getElementById("active-b");
  const activeColorSwatch = document.getElementById("active-color-swatch");
  const resetBtn = document.getElementById("reset-btn");
  const downloadBtn = document.getElementById("download-btn");
  const hexOutput = document.getElementById("hex-output");
  const copyBtn = document.getElementById("copy-btn");

  let manifest = [];
  let current = null; // the loaded still, plus a live-editable "palette" array
  let activeSlot = 0;

  function quantizeChannel(v) {
    // 8-bit-per-channel -> GBA 5-bit levels, snapped back to 8-bit for
    // display -- matches scripts/portrait/agbpal_colors.py's quantize(),
    // so the preview is exactly what will ship in-game.
    const five = Math.round(v / 8);
    return Math.max(0, Math.min(31, five)) * 8;
  }

  function quantizeColor([r, g, b]) {
    return [quantizeChannel(r), quantizeChannel(g), quantizeChannel(b)];
  }

  function rgbToHex([r, g, b]) {
    return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  async function loadManifest() {
    const res = await fetch("manifest.json");
    manifest = await res.json();
    renderClassList(manifest);
  }

  function renderClassList(items) {
    classListEl.innerHTML = "";
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = item.name;
      li.dataset.id = item.id;
      li.dataset.file = item.file;
      if (current && current.classId === item.id) li.classList.add("selected");
      li.addEventListener("click", () => selectClass(item));
      classListEl.appendChild(li);
    }
  }

  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q ? manifest.filter((m) => m.name.toLowerCase().includes(q)) : manifest;
    renderClassList(filtered);
  });

  async function selectClass(item) {
    const res = await fetch(item.file);
    const still = await res.json();

    current = {
      classId: still.classId,
      className: still.className,
      anim: still.anim,
      name: still.name,
      width: still.width,
      height: still.height,
      indices: still.indices,
      originalPalette: still.palette.map((c) => c.slice()),
      palette: still.palette.map((c) => quantizeColor(c)),
    };
    activeSlot = 0;

    emptyState.hidden = true;
    editor.hidden = false;
    editorTitle.textContent = still.name;

    document.querySelectorAll("#class-list li").forEach((li) => {
      li.classList.toggle("selected", Number(li.dataset.id) === item.id);
    });

    setupCanvas();
    renderSwatches();
    updateActiveColorEditor();
    drawPreview();
    updateHexOutput();
  }

  function setupCanvas() {
    canvas.width = current.width * SCALE;
    canvas.height = current.height * SCALE;
  }

  function drawPreview() {
    const { width, height, indices, palette } = current;
    const imgData = ctx.createImageData(width, height);
    for (let i = 0; i < indices.length; i++) {
      const [r, g, b] = palette[indices[i]];
      imgData.data[i * 4 + 0] = r;
      imgData.data[i * 4 + 1] = g;
      imgData.data[i * 4 + 2] = b;
      imgData.data[i * 4 + 3] = indices[i] === 0 ? 0 : 255; // index 0 is always transparent on GBA
    }
    // Draw at native size to an offscreen canvas, then scale up with
    // pixelated rendering (canvas smoothing would blur a tiny sprite).
    const off = document.createElement("canvas");
    off.width = width;
    off.height = height;
    off.getContext("2d").putImageData(imgData, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function renderSwatches() {
    swatchesEl.innerHTML = "";
    current.palette.forEach((color, i) => {
      const wrap = document.createElement("div");
      wrap.className = "swatch";

      const input = document.createElement("input");
      input.type = "color";
      input.value = rgbToHex(color);
      input.dataset.slot = i;
      if (i === activeSlot) input.classList.add("active");
      // The native color-picker popup is positioned by the browser/OS and
      // can land on top of the sprite preview -- so this input updates
      // the palette live same as before, but the always-visible slider/
      // hex editor above is the primary way to see changes while editing.
      input.addEventListener("input", () => applyColorToSlot(i, hexToRgb(input.value)));
      input.addEventListener("focus", () => setActiveSlot(i));

      const label = document.createElement("span");
      label.textContent = i;

      wrap.appendChild(input);
      wrap.appendChild(label);
      swatchesEl.appendChild(wrap);
    });
  }

  function applyColorToSlot(slot, rgb888) {
    const quantized = quantizeColor(rgb888);
    current.palette[slot] = quantized;
    const swatchInput = swatchesEl.querySelector(`input[data-slot="${slot}"]`);
    if (swatchInput) swatchInput.value = rgbToHex(quantized);
    if (slot === activeSlot) updateActiveColorEditor();
    drawPreview();
    updateHexOutput();
  }

  function updateActiveColorEditor() {
    const [r, g, b] = current.palette[activeSlot];
    activeSlotNum.textContent = activeSlot;
    activeColorHex.value = rgbToHex([r, g, b]);
    activeR.value = r;
    activeG.value = g;
    activeB.value = b;
    activeColorSwatch.style.background = rgbToHex([r, g, b]);
  }

  function onActiveSlidersChange() {
    applyColorToSlot(activeSlot, [Number(activeR.value), Number(activeG.value), Number(activeB.value)]);
  }

  [activeR, activeG, activeB].forEach((el) => el.addEventListener("input", onActiveSlidersChange));

  activeColorHex.addEventListener("change", () => {
    const hex = activeColorHex.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
      applyColorToSlot(activeSlot, hexToRgb(hex));
    } else {
      updateActiveColorEditor(); // invalid input, revert display
    }
  });

  function setActiveSlot(slot) {
    activeSlot = slot;
    document.querySelectorAll(".swatch input").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.slot) === slot);
    });
    updateActiveColorEditor();
  }

  canvas.addEventListener("click", (evt) => {
    if (!current) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((evt.clientX - rect.left) / rect.width) * current.width);
    const y = Math.floor(((evt.clientY - rect.top) / rect.height) * current.height);
    if (x < 0 || y < 0 || x >= current.width || y >= current.height) return;
    const idx = current.indices[y * current.width + x];
    setActiveSlot(idx); // eyedrop only selects the slot -- no native popup forced open
  });

  resetBtn.addEventListener("click", () => {
    if (!current) return;
    current.palette = current.originalPalette.map((c) => quantizeColor(c));
    renderSwatches();
    updateActiveColorEditor();
    drawPreview();
    updateHexOutput();
  });

  function updateHexOutput() {
    hexOutput.value = current.palette.map(rgbToHex).join(", ");
  }

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(hexOutput.value);
      copyBtn.textContent = "Copied!";
      setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
    } catch (e) {
      hexOutput.select();
      document.execCommand("copy");
    }
  });

  downloadBtn.addEventListener("click", () => {
    if (!current) return;
    const payload = {
      classId: current.classId,
      className: current.className,
      name: current.name,
      anim: current.anim,
      original_palette: current.originalPalette,
      edited_palette: current.palette,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${current.className.toLowerCase()}_edited_palette.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  loadManifest();
})();
