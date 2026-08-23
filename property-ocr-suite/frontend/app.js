/* ==================================================================
   Property Brochure OCR — review screen

   Talks to the FastAPI backend in ../backend. Nothing here calls an
   LLM directly — this file only renders whatever the backend already
   extracted, and lets a human tick/edit/fill the rest before saving.
   =================================================================== */

// ---- Configure these two for your deployment ----
const API_BASE = "http://localhost:8000";
const SERVICE_KEY = ""; // must match SERVICE_API_KEY in backend/.env if you set one
// ---------------------------------------------------

const state = {
  jobId: null,
  extraction: null,
  activeConfigTab: "4 BHK",
};

const CONFIG_TABS = ["4 BHK", "5 BHK", "Penthouse", "Duplex"];
// Floor-plan sheets label units "Unit - A" without repeating the BHK
// count, so a strict bhk_type filter would hide those layouts entirely.
// They land here instead of vanishing.
const UNLABELLED_TAB = "BHK not stated";

const IMAGE_SLOT_DEFS = [
  { key: "cover", label: "Cover image" },
  { key: "living_room", label: "Living room" },
  { key: "master_bedroom", label: "Master bedroom" },
  { key: "pool", label: "Pool" },
  { key: "clubhouse", label: "Clubhouse" },
];

// section key -> [{ key, label, example, type?, span2? }]
const FIELD_CONFIGS = {
  basics: [
    { key: "property_name", label: "Property name", example: "e.g. Ikebana" },
    { key: "developer", label: "Developer", example: "e.g. Gala" },
    { key: "category", label: "Category", example: "Apartment" },
    { key: "status", label: "Status", example: "e.g. Near Possession" },
    { key: "possession", label: "Possession", example: "e.g. 9 Months or RTMI" },
    { key: "possession_confirmed_as_of", label: "Possession confirmed as of", example: "dd-mm-yyyy" },
    { key: "location", label: "Location", example: "e.g. Sindhu Bhavan Road" },
    { key: "city", label: "City", example: "Ahmedabad" },
    { key: "state", label: "State", example: "Gujarat" },
    { key: "tagline", label: "Tagline", example: "Shown under the property name" },
    { key: "website", label: "Website", example: "e.g. www.ikebana.com" },
    { key: "expert_note", label: "Expert note", example: "Visible on the public website", type: "textarea", span2: true },
  ],
  project_structure: [
    { key: "plot_size", label: "Plot size", example: "e.g. 5400 sq ft" },
    { key: "available_bhk_types", label: "Available BHK types", example: "e.g. 4, 5, 6 BHK" },
    { key: "total_towers", label: "Total towers", example: "e.g. 3" },
    { key: "total_floors", label: "Total floors", example: "e.g. 24" },
    { key: "units_per_floor", label: "Units per floor", example: "e.g. 4" },
    { key: "total_units", label: "Total units", example: "e.g. 96" },
  ],
  rera: [
    { key: "rera_id", label: "RERA ID", example: "e.g. PR/GJ/AHMEDABAD/..." },
    { key: "rera_link", label: "RERA link", example: "https://gujrera.gujarat.gov.in/..." },
    { key: "proposed_start_date", label: "Proposed start date (RERA)", example: "e.g. Jan 2025" },
    { key: "registered_completion_date", label: "Registered completion date (RERA)", example: "e.g. May 2030" },
    { key: "construction_progress", label: "Construction progress (RERA)", example: "e.g. 53.7% as of Jul 2026" },
  ],
  construction_amenities: [
    { key: "parking_levels", label: "Parking levels", example: "e.g. 2" },
    { key: "podium_structure", label: "Podium structure", example: "e.g. 2-Level Podium" },
    { key: "lifts_per_tower", label: "Lifts per tower", example: "e.g. 3" },
    { key: "open_space", label: "Open space", example: "e.g. 70% Open Area" },
    { key: "geyser_heat_pump", label: "Geyser / heat pump provided", example: "e.g. Yes – instant geyser" },
    { key: "vrv_ac_provided", label: "VRV / AC provided", example: "e.g. Yes, all bedrooms" },
    { key: "window_glasses", label: "Window glasses", example: "e.g. Double-glazed soundproof" },
    { key: "bath_sanitary_fittings", label: "Bath & sanitary fittings", example: "e.g. Kohler, Jaguar" },
    { key: "flooring", label: "Flooring", example: "e.g. Italian marble" },
    { key: "density_units_per_acre", label: "Density (units per acre)", example: "e.g. 18" },
    { key: "construction_quality", label: "Construction quality", example: "e.g. RCC framed structure" },
    { key: "internal_ceiling_height", label: "Internal ceiling height", example: "e.g. 10 ft" },
    { key: "clubhouse_size", label: "Clubhouse size", example: "e.g. 15,000 sq ft" },
  ],
  developer: [
    { key: "experience_years", label: "Experience (years)", example: "e.g. 25" },
    { key: "total_delivered_projects", label: "Total delivered projects", example: "e.g. 40" },
    { key: "ongoing_projects", label: "Ongoing projects", example: "e.g. 6" },
    { key: "background", label: "Background", example: "", type: "textarea", span2: true },
  ],
};

// ---------------- helpers ----------------

function blankField() {
  return { value: null, found: false, confidence: 0, source_file: null, source_page: null, evidence: null, verified: false };
}

/** Same shape as the backend's PropertyExtraction defaults — used
 * when the user has no brochure at all and wants to fill the form
 * from scratch. Every field starts blank, exactly like a field OCR
 * couldn't find. */
function emptyExtraction() {
  const secFromKeys = (keys) => Object.fromEntries(keys.map((k) => [k, blankField()]));
  return {
    basics: secFromKeys(FIELD_CONFIGS.basics.map((f) => f.key)),
    project_structure: secFromKeys(FIELD_CONFIGS.project_structure.map((f) => f.key)),
    rera: secFromKeys(FIELD_CONFIGS.rera.map((f) => f.key)),
    construction_amenities: secFromKeys(FIELD_CONFIGS.construction_amenities.map((f) => f.key)),
    developer: { ...secFromKeys(FIELD_CONFIGS.developer.map((f) => f.key)), notable_delivered_projects: [] },
    configurations: [],
    amenities: [],
    highlights: [],
    image_candidates: [],
    images: { cover: null, living_room: null, master_bedroom: null, pool: null, clubhouse: null },
    source_files: [],
    warnings: [],
  };
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return node;
}

function apiHeaders(json = true) {
  const h = {};
  if (SERVICE_KEY) h["X-Service-Key"] = SERVICE_KEY;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

function showToast(msg, isError = false) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  t.className = "toast" + (isError ? " error" : "");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { t.hidden = true; }, 3200);
}

// ---------------- scalar field rendering ----------------

function renderScalarField(sectionObj, conf) {
  const field = sectionObj[conf.key] || blankField();
  const isBlank = !field.found;
  const row = el("div", {
    class: "field-row " + (isBlank ? "blank" : "extracted" + (field.verified ? " verified" : "")) + (conf.span2 ? " span-2" : ""),
  });

  const labelRow = el("div", { class: "field-label-row" }, [
    el("span", { class: "field-label" }, conf.label),
    conf.example ? el("span", { class: "field-example" }, isBlank ? conf.example : "") : null,
  ]);
  row.appendChild(labelRow);

  const isTextarea = conf.type === "textarea";
  const input = el(isTextarea ? "textarea" : "input", {
    type: isTextarea ? null : "text",
    placeholder: conf.example || "",
    value: isTextarea ? null : (field.value || ""),
  });
  if (isTextarea) input.value = field.value || "";

  const inputRow = el("div", { class: "field-input-row" });
  let checkbox = null;
  if (!isBlank) {
    checkbox = el("input", { type: "checkbox", class: "verify-check", title: "Mark as verified" });
    checkbox.checked = !!field.verified;
    checkbox.addEventListener("change", () => {
      field.verified = checkbox.checked;
      row.classList.toggle("verified", checkbox.checked);
      updateProgress();
    });
    inputRow.appendChild(checkbox);
  }

  input.addEventListener("input", () => {
    field.value = input.value;
    field.found = input.value.trim().length > 0;
    if (field.found && checkbox) {
      // Typing over an extracted value IS the confirm/correct action —
      // no reason to make the human also click the checkbox separately.
      field.verified = true;
      checkbox.checked = true;
    }
    sectionObj[conf.key] = field;
    row.className = "field-row " + (field.found ? "extracted" + (field.verified ? " verified" : "") : "blank") + (conf.span2 ? " span-2" : "");
    updateProgress();
  });

  inputRow.appendChild(input);
  if (!isBlank) {
    const confPct = Math.round((field.confidence || 0) * 100);
    const chip = el("span", {
      class: "chip",
      title: field.evidence ? `"${field.evidence}" — ${field.source_file || ""}` : "",
    }, `p.${field.source_page ?? "?"} · ${confPct}%`);
    inputRow.appendChild(chip);
  }
  row.appendChild(inputRow);
  return row;
}

function renderSection(containerId, sectionObj, fields) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  fields.forEach((conf) => container.appendChild(renderScalarField(sectionObj, conf)));
}

// ---------------- chip lists (amenities / highlights / notable projects) ----------------

function renderChipList(containerId, list, onRemove) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  if (list.length === 0) {
    container.appendChild(el("div", { class: "empty-note" }, "None added yet."));
    return;
  }
  list.forEach((field, idx) => {
    const chip = el("div", {
      class: "list-chip " + (field.found && field.source_file ? (field.verified ? "verified" : "extracted") : ""),
    });
    if (field.source_file) {
      const cb = el("input", { type: "checkbox" });
      cb.checked = !!field.verified;
      cb.addEventListener("change", () => {
        field.verified = cb.checked;
        chip.classList.toggle("verified", cb.checked);
        chip.classList.toggle("extracted", !cb.checked);
      });
      chip.appendChild(cb);
    }
    const textInput = el("input", { class: "chip-text", type: "text", value: field.value || "" });
    textInput.style.width = Math.max(60, (field.value || "").length * 7) + "px";
    textInput.addEventListener("input", () => { field.value = textInput.value; });
    chip.appendChild(textInput);
    const removeBtn = el("button", { type: "button", class: "btn-icon", title: "Remove" }, "×");
    removeBtn.addEventListener("click", () => onRemove(idx));
    chip.appendChild(removeBtn);
    container.appendChild(chip);
  });
}

/** Wires an "add" input+button to a getter for the live list, and a
 * render function to call after every add/remove. getList/renderFn
 * are called lazily (on click), so this can be wired once at load
 * time even though state.extraction doesn't exist until an
 * extraction (or blank form) has been started. */
function wireAddRow(inputId, btnId, getList, renderFn) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const add = () => {
    if (!state.extraction) return;
    const val = input.value.trim();
    if (!val) return;
    getList().push({ value: val, found: true, confidence: 0, source_file: null, source_page: null, evidence: null, verified: true });
    input.value = "";
    renderFn();
  };
  btn.addEventListener("click", add);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(); } });
}

/** Returns a render function for a removable chip list, bound to a
 * getter so it always reads/mutates the current state.extraction. */
function makeListRenderer(containerId, getList) {
  function render() {
    renderChipList(containerId, getList(), (idx) => {
      getList().splice(idx, 1);
      render();
    });
  }
  return render;
}

const renderNotableProjects = makeListRenderer("notableProjects", () => state.extraction.developer.notable_delivered_projects);
const renderAmenitiesList = makeListRenderer("amenitiesList", () => state.extraction.amenities);
const renderHighlightsList = makeListRenderer("highlightsList", () => state.extraction.highlights);

wireAddRow("notableProjectInput", "addNotableProject", () => state.extraction.developer.notable_delivered_projects, renderNotableProjects);
wireAddRow("amenityInput", "addAmenity", () => state.extraction.amenities, renderAmenitiesList);
wireAddRow("highlightInput", "addHighlight", () => state.extraction.highlights, renderHighlightsList);

// ---------------- configurations ----------------

function variantBhk(variant) {
  return (variant.bhk_type.value || "").trim();
}

/** Tabs = the standard set, plus any BHK type actually found in the
 * brochure, plus an "Unlabelled" bucket if some layouts came through
 * without a BHK type (typical of floor-plan sheets). */
function configTabsForState() {
  const tabs = [...CONFIG_TABS];
  let hasUnlabelled = false;
  state.extraction.configurations.forEach((v) => {
    const t = variantBhk(v);
    if (!t) { hasUnlabelled = true; return; }
    if (!tabs.some((x) => x.toLowerCase() === t.toLowerCase())) tabs.push(t);
  });
  if (hasUnlabelled) tabs.push(UNLABELLED_TAB);
  return tabs;
}

function variantsForTab(tab) {
  return state.extraction.configurations.filter((v) =>
    tab === UNLABELLED_TAB
      ? !variantBhk(v)
      : variantBhk(v).toLowerCase() === tab.toLowerCase()
  );
}

function renderConfigTabs(tabs) {
  const container = document.getElementById("configTabs");
  container.innerHTML = "";
  tabs.forEach((tab) => {
    const count = variantsForTab(tab).length;
    const btn = el("button", {
      type: "button",
      class: "config-tab" + (state.activeConfigTab === tab ? " active" : ""),
    }, [
      tab,
      count ? el("span", { class: "tab-count" }, String(count)) : null,
    ]);
    btn.addEventListener("click", () => { state.activeConfigTab = tab; renderConfigurations(); });
    container.appendChild(btn);
  });
}

/** One room row: name + verbatim printed size, both editable and both
 * carrying their own provenance chip so a wrong size can be traced
 * back to the exact plan page it was read off. */
function renderRoomRow(variant, room, onRemove) {
  const row = el("div", { class: "room-row" });

  const nameInput = el("input", {
    type: "text",
    class: "room-name-input",
    placeholder: "e.g. Master Bedroom",
    value: room.room_name.value || "",
  });
  nameInput.addEventListener("input", () => {
    room.room_name.value = nameInput.value;
    room.room_name.found = nameInput.value.trim().length > 0;
    room.room_name.verified = true;
    updateProgress();
  });

  const dimInput = el("input", {
    type: "text",
    class: "room-dim-input",
    placeholder: `e.g. 11'9" X 14'0"`,
    value: room.dimension.value || "",
  });
  dimInput.addEventListener("input", () => {
    room.dimension.value = dimInput.value;
    room.dimension.found = dimInput.value.trim().length > 0;
    room.dimension.verified = true;
    updateProgress();
  });

  const src = room.dimension.found ? room.dimension : room.room_name;
  if (src.found && src.source_page) {
    row.classList.add("extracted");
    const cb = el("input", { type: "checkbox", class: "verify-check", title: "Mark as verified" });
    cb.checked = !!(room.room_name.verified && room.dimension.verified);
    cb.addEventListener("change", () => {
      room.room_name.verified = cb.checked;
      room.dimension.verified = cb.checked;
      row.classList.toggle("verified", cb.checked);
      updateProgress();
    });
    row.appendChild(cb);
    row.classList.toggle("verified", cb.checked);
  }

  row.appendChild(nameInput);
  row.appendChild(dimInput);

  if (src.found && src.source_page) {
    // A size the backend couldn't find printed on that page gets its
    // confidence knocked down — surface that here so the human checks
    // it rather than ticking straight past.
    const shaky = (src.confidence || 0) < 0.5;
    if (shaky) row.classList.add("suspect");
    row.appendChild(el("span", {
      class: "chip" + (shaky ? " chip-suspect" : ""),
      title: shaky
        ? `Doesn't match any size printed on page ${src.source_page} — verify against the plan`
        : (src.evidence ? `"${src.evidence}" — ${src.source_file || ""}` : ""),
    }, shaky ? `p.${src.source_page} ⚠` : `p.${src.source_page}`));
  }

  const removeBtn = el("button", { type: "button", class: "btn-icon", title: "Remove room" }, "×");
  removeBtn.addEventListener("click", onRemove);
  row.appendChild(removeBtn);
  return row;
}

/** Rooms come off the plan in drawing order, which reads as a jumble.
 * Grouping them the way someone actually walks a flat — living spaces,
 * then bedrooms, then bathrooms, then utility, then outdoor — is what
 * turns a list of 18 strings into something you can size up at a glance. */
const ROOM_GROUPS = [
  { key: "living", label: "Living spaces", match: /DRAWING|LIVING|DINING|FOYER|VESTIBULE|WAITING|PASSAGE|LOBBY|LOUNGE|STUDY|POOJA/i },
  { key: "bedrooms", label: "Bedrooms", match: /BED\s*ROOM|MASTER/i },
  { key: "bathrooms", label: "Bathrooms & dressing", match: /TOILET|BATH|DRESS|W\.?C\.?/i },
  { key: "utility", label: "Kitchen & utility", match: /KITCHEN|WASH|STORE|UTILITY|SERVANT|MAID/i },
  { key: "outdoor", label: "Balcony & outdoor", match: /BALCONY|TERRACE|DECK|GARDEN|VERANDA/i },
];

function groupRooms(rooms) {
  const groups = ROOM_GROUPS.map((g) => ({ ...g, rooms: [] }));
  const other = { key: "other", label: "Other", rooms: [] };
  rooms.forEach((room) => {
    const name = String(room.room_name.value || "");
    // Bedrooms first: "TOILET/DRESS" must not be counted as a bedroom,
    // and a bedroom's own attached toilet belongs under bathrooms.
    const hit = groups.find((g) => g.match.test(name));
    (hit || other).rooms.push(room);
  });
  return [...groups, other].filter((g) => g.rooms.length > 0);
}

function roomSummary(rooms) {
  const counts = {};
  rooms.forEach((room) => {
    const name = String(room.room_name.value || "");
    const g = ROOM_GROUPS.find((x) => x.match.test(name));
    if (!g) return;
    counts[g.key] = (counts[g.key] || 0) + 1;
  });
  const parts = [];
  if (counts.bedrooms) parts.push(`${counts.bedrooms} bedroom${counts.bedrooms > 1 ? "s" : ""}`);
  if (counts.bathrooms) parts.push(`${counts.bathrooms} bath/dress`);
  if (counts.outdoor) parts.push(`${counts.outdoor} balcon${counts.outdoor > 1 ? "ies" : "y"}`);
  return parts.join(" · ");
}

function renderRooms(variant, card) {
  const block = el("div", { class: "room-block" });
  const summary = roomSummary(variant.rooms);
  block.appendChild(el("div", { class: "room-block-head" }, [
    el("h4", {}, "Room dimensions"),
    el("span", { class: "muted-count" },
      summary ? `${summary} · ${variant.rooms.length} rooms total` : `${variant.rooms.length} rooms`),
  ]));

  if (variant.rooms.length === 0) {
    block.appendChild(el("div", { class: "empty-note" },
      "No room sizes found on the plan for this layout — add them manually if the brochure shows them."));
  } else {
    groupRooms(variant.rooms).forEach((group) => {
      block.appendChild(el("div", { class: "room-group-label" }, [
        group.label,
        el("span", { class: "muted-count" }, ` ${group.rooms.length}`),
      ]));
      const list = el("div", { class: "room-list" });
      list.appendChild(el("div", { class: "room-row room-row-head" }, [
        el("span", {}, "Room"),
        el("span", {}, "Size (as printed on plan)"),
      ]));
      group.rooms.forEach((room) => {
        list.appendChild(renderRoomRow(variant, room, () => {
          const i = variant.rooms.indexOf(room);
          if (i > -1) variant.rooms.splice(i, 1);
          renderConfigurations();
        }));
      });
      block.appendChild(list);
    });
  }

  const addRoomBtn = el("button", { type: "button", class: "btn btn-ghost btn-small" }, "+ Add room");
  addRoomBtn.addEventListener("click", () => {
    variant.rooms.push({
      room_name: { ...blankField(), verified: true },
      dimension: { ...blankField(), verified: true },
    });
    renderConfigurations();
  });
  block.appendChild(addRoomBtn);
  card.appendChild(block);
}

function renderConfigurations() {
  const tabs = configTabsForState();
  // Keep the active tab meaningful: if the current one is empty but
  // some other tab actually has layouts, land the human on those.
  if (!tabs.includes(state.activeConfigTab) || variantsForTab(state.activeConfigTab).length === 0) {
    const firstWithVariants = tabs.find((t) => variantsForTab(t).length > 0);
    if (firstWithVariants) state.activeConfigTab = firstWithVariants;
  }
  renderConfigTabs(tabs);

  const container = document.getElementById("configVariants");
  container.innerHTML = "";
  const variants = variantsForTab(state.activeConfigTab);

  if (variants.length === 0) {
    container.appendChild(el("div", { class: "empty-note" },
      `This property doesn't offer ${state.activeConfigTab}. Add a variant if it does.`));
    return;
  }

  variants.forEach((variant) => {
    const card = el("div", { class: "variant-card" });
    const head = el("div", { class: "variant-card-head" }, [
      el("div", { class: "variant-title" }, [
        el("strong", {}, variant.variant_label.value || "Variant"),
        variant.bhk_type.value
          ? el("span", { class: "variant-bhk" + (variant.bhk_type.derived ? " derived" : "") },
              variant.bhk_type.derived ? `${variant.bhk_type.value} (counted)` : variant.bhk_type.value)
          : null,
        variant.floor_range.value
          ? el("span", { class: "variant-floors" }, `Floors ${variant.floor_range.value}`)
          : null,
      ]),
      (() => {
        const removeBtn = el("button", { type: "button", class: "btn-icon", title: "Remove variant" }, "Remove");
        removeBtn.addEventListener("click", () => {
          const globalIdx = state.extraction.configurations.indexOf(variant);
          if (globalIdx > -1) state.extraction.configurations.splice(globalIdx, 1);
          renderConfigurations();
        });
        return removeBtn;
      })(),
    ]);
    card.appendChild(head);

    const grid = el("div", { class: "variant-grid" });
    const rowFields = [
      { key: "variant_label", label: "Variant", example: "e.g. Unit A" },
      { key: "floor_range", label: "Floor series", example: "e.g. 101 to 1101" },
      { key: "bhk_type", label: "BHK type", example: "e.g. 4 BHK" },
      { key: "carpet_area", label: "Carpet area", example: "e.g. 2400 sq ft" },
      { key: "built_up_area", label: "Built-up area", example: "e.g. 2800 sq ft" },
      { key: "price", label: "Price", example: "e.g. 45000000" },
    ];
    rowFields.forEach((conf) => grid.appendChild(renderScalarField(variant, conf)));
    card.appendChild(grid);

    renderRooms(variant, card);
    container.appendChild(card);
  });
}

document.getElementById("addVariantBtn").addEventListener("click", () => {
  const isUnlabelled = state.activeConfigTab === UNLABELLED_TAB;
  state.extraction.configurations.push({
    bhk_type: isUnlabelled
      ? blankField()
      : { ...blankField(), value: state.activeConfigTab, found: true, verified: true },
    variant_label: blankField(),
    floor_range: blankField(),
    carpet_area: blankField(),
    built_up_area: blankField(),
    price: blankField(),
    rooms: [],
  });
  renderConfigurations();
});

// ---------------- images ----------------

function renderImageSlots() {
  const container = document.getElementById("imageSlots");
  container.innerHTML = "";
  IMAGE_SLOT_DEFS.forEach((slot) => {
    const url = state.extraction.images[slot.key];
    const box = el("div", { class: "image-slot" });
    const preview = el("div", { class: "image-slot-preview" }, url ? el("img", { src: resolveImageUrl(url) }) : "No image");
    box.appendChild(preview);
    const body = el("div", { class: "image-slot-body" });
    body.appendChild(el("span", { class: "field-label" }, slot.label));
    const urlInput = el("input", { type: "text", placeholder: "…or paste an image URL", value: url || "" });
    urlInput.addEventListener("change", () => {
      state.extraction.images[slot.key] = urlInput.value.trim() || null;
      renderImageSlots();
    });
    body.appendChild(urlInput);
    const actions = el("div", { class: "image-slot-actions" });
    const uploadInput = el("input", { type: "file", accept: "image/*", hidden: true });
    uploadInput.addEventListener("change", () => {
      if (uploadInput.files[0]) {
        // Local-preview only (data URL). Wire this to a real upload
        // endpoint if you want these persisted server-side.
        const reader = new FileReader();
        reader.onload = () => {
          state.extraction.images[slot.key] = reader.result;
          renderImageSlots();
        };
        reader.readAsDataURL(uploadInput.files[0]);
      }
    });
    const uploadBtn = el("button", { type: "button", class: "btn btn-ghost" }, "Upload");
    uploadBtn.addEventListener("click", () => uploadInput.click());
    actions.appendChild(uploadBtn);
    actions.appendChild(uploadInput);
    body.appendChild(actions);
    box.appendChild(body);
    container.appendChild(box);
  });
}

function resolveImageUrl(url) {
  if (!url) return url;
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  return API_BASE + url;
}

function renderImageCandidates() {
  const candidates = state.extraction.image_candidates || [];
  document.getElementById("candidateCount").textContent = `(${candidates.length})`;
  const container = document.getElementById("imageCandidates");
  container.innerHTML = "";
  document.getElementById("imageCandidatesBlock").hidden = candidates.length === 0;

  candidates.forEach((cand) => {
    const thumb = el("div", { class: "candidate-thumb" }, [
      el("img", { src: resolveImageUrl(cand.image_path) }),
      el("div", { class: "cand-label" }, `p.${cand.source_page}`),
    ]);
    thumb.addEventListener("click", () => {
      const slotKey = prompt(
        "Assign to which slot?\n" + IMAGE_SLOT_DEFS.map((s, i) => `${i + 1}. ${s.label}`).join("\n") +
        "\n\nType a number:"
      );
      const idx = parseInt(slotKey, 10) - 1;
      if (idx >= 0 && idx < IMAGE_SLOT_DEFS.length) {
        state.extraction.images[IMAGE_SLOT_DEFS[idx].key] = cand.image_path;
        renderImageSlots();
      }
    });
    container.appendChild(thumb);
  });
}

// ---------------- progress + rail ----------------

function updateProgress() {
  const flat = flattenFields(state.extraction);
  const foundCount = flat.filter((f) => f.found).length;
  const verifiedCount = flat.filter((f) => f.found && f.verified).length;
  document.getElementById("reviewProgress").innerHTML =
    foundCount === 0
      ? "No fields extracted yet — fill in manually below."
      : `<strong>${verifiedCount}</strong> of <strong>${foundCount}</strong> extracted fields verified`;
  document.getElementById("statusPill").textContent =
    state.jobId ? `job ${state.jobId} · ${foundCount} fields extracted` : "";
}

function flattenFields(extraction) {
  const out = [];
  const sections = [extraction.basics, extraction.project_structure, extraction.rera, extraction.construction_amenities];
  sections.forEach((s) => Object.values(s).forEach((f) => out.push(f)));
  ["experience_years", "total_delivered_projects", "ongoing_projects", "background"].forEach((k) =>
    out.push(extraction.developer[k])
  );
  out.push(...extraction.developer.notable_delivered_projects);
  out.push(...extraction.amenities, ...extraction.highlights);
  extraction.configurations.forEach((v) => {
    out.push(v.bhk_type, v.variant_label, v.floor_range, v.carpet_area, v.built_up_area, v.price);
    (v.rooms || []).forEach((r) => out.push(r.room_name, r.dimension));
  });
  return out.filter(Boolean);
}

function buildRail() {
  const sections = [
    ["section-basics", "Basics"],
    ["section-structure", "Project Structure"],
    ["section-rera", "RERA & Approvals"],
    ["section-construction", "Construction & Amenities"],
    ["section-developer", "Developer"],
    ["section-configurations", "Configurations"],
    ["section-images", "Images"],
    ["section-amenities", "Amenities"],
    ["section-highlights", "Highlights"],
  ];
  const rail = document.getElementById("rail");
  rail.innerHTML = "";
  sections.forEach(([id, label]) => {
    const a = el("a", { href: `#${id}` }, label);
    a.addEventListener("click", (e) => {
      e.preventDefault();
      document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" });
    });
    rail.appendChild(a);
  });
}

// ---------------- master render ----------------

function renderAll() {
  const ex = state.extraction;
  renderSection("fields-basics", ex.basics, FIELD_CONFIGS.basics);
  renderSection("fields-structure", ex.project_structure, FIELD_CONFIGS.project_structure);
  renderSection("fields-rera", ex.rera, FIELD_CONFIGS.rera);
  renderSection("fields-construction", ex.construction_amenities, FIELD_CONFIGS.construction_amenities);
  renderSection("fields-developer", ex.developer, FIELD_CONFIGS.developer);
  renderNotableProjects();
  renderConfigurations();
  renderImageSlots();
  renderImageCandidates();
  renderAmenitiesList();
  renderHighlightsList();
  updateProgress();
  document.getElementById("propertyForm").hidden = false;
}

// ---------------- upload + extract ----------------

let selectedFiles = [];

function refreshFileList() {
  const listEl = document.getElementById("fileList");
  listEl.textContent = selectedFiles.length
    ? selectedFiles.map((f) => f.name).join(", ")
    : "No files selected";
  document.getElementById("extractBtn").disabled = selectedFiles.length === 0;
}

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
dropzone.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  selectedFiles = Array.from(fileInput.files);
  refreshFileList();
});
["dragover", "dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.toggle("dragover", evt === "dragover");
  });
});
dropzone.addEventListener("drop", (e) => {
  selectedFiles = Array.from(e.dataTransfer.files).filter((f) => f.type === "application/pdf");
  refreshFileList();
});

document.getElementById("skipBtn").addEventListener("click", () => {
  state.jobId = "manual-" + Math.random().toString(16).slice(2, 10);
  state.extraction = emptyExtraction();
  document.getElementById("warnings").hidden = true;
  buildRail();
  renderAll();
  showToast("Blank form ready — fill in the fields below.");
  document.getElementById("propertyForm").scrollIntoView({ behavior: "smooth" });
});

// ---------------- extraction progress ----------------

const progressWrap = document.getElementById("progressWrap");
const progressFill = document.getElementById("progressFill");
const progressLabel = document.getElementById("progressLabel");

function setProgressUI(progress) {
  const total = progress.batches_total || 0;
  const done = progress.batches_done || 0;
  if (total === 0) {
    // Still rendering PDF pages to images server-side — we don't know
    // the batch count yet, so show motion rather than a stuck 0%.
    progressFill.classList.add("indeterminate");
    progressFill.style.width = "";
    progressLabel.textContent = "Reading brochure pages…";
    return;
  }
  progressFill.classList.remove("indeterminate");
  const pct = Math.round((done / total) * 100);
  progressFill.style.width = pct + "%";
  const pageNote = progress.current_pages && progress.current_pages.length
    ? ` (pages ${progress.current_pages.join(", ")}${progress.current_file ? ` — ${progress.current_file}` : ""})`
    : "";
  progressLabel.textContent = done >= total
    ? "Finishing up…"
    : `Extracting batch ${done + 1} of ${total}${pageNote}`;
}

/** Thrown by pollUntilDone when the user hits Stop — distinct from a
 * real failure so the UI can show a neutral "stopped" message instead
 * of an error toast. */
class ExtractionCancelled extends Error {}

let activePoll = false; // is there a job currently being polled — lets Stop know it has something to cancel

/** Polls the progress endpoint until the job reaches a terminal
 * state. Resolves on "done", rejects on "error" or user-cancel — the
 * long pole here is the vision-LLM call itself (tens of seconds per
 * batch), so this is the only way to show real motion instead of a
 * button stuck on "Extracting…" with no feedback. */
function pollUntilDone(jobId, { intervalMs = 1200 } = {}) {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/properties/${jobId}/progress`, { headers: apiHeaders(false) });
        if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
        const progress = await resp.json();
        setProgressUI(progress);
        if (progress.status === "done") return resolve();
        if (progress.status === "error") return reject(new Error(progress.error || "extraction failed"));
        if (progress.status === "cancelled") return reject(new ExtractionCancelled());
        setTimeout(tick, intervalMs);
      } catch (err) {
        reject(err);
      }
    };
    tick();
  });
}

const stopExtractBtn = document.getElementById("stopExtractBtn");

stopExtractBtn.addEventListener("click", async () => {
  if (!state.jobId || !activePoll) return;
  stopExtractBtn.disabled = true;
  stopExtractBtn.textContent = "Stopping…";
  progressLabel.textContent = "Stopping…";
  try {
    await fetch(`${API_BASE}/api/properties/${state.jobId}/cancel`, {
      method: "POST",
      headers: apiHeaders(false),
    });
  } catch (err) {
    console.error(err);
  }
  // Let the poll loop's own "cancelled" status check settle the promise
  // rather than racing it here — the server is the source of truth.
});

document.getElementById("extractBtn").addEventListener("click", async () => {
  const btn = document.getElementById("extractBtn");
  btn.disabled = true;
  btn.textContent = "Extracting…";
  progressWrap.hidden = false;
  stopExtractBtn.hidden = false;
  stopExtractBtn.disabled = false;
  stopExtractBtn.textContent = "Stop";
  setProgressUI({ batches_total: 0 });
  const formData = new FormData();
  selectedFiles.forEach((f) => formData.append("files", f));

  try {
    const startResp = await fetch(`${API_BASE}/api/properties/extract`, {
      method: "POST",
      headers: apiHeaders(false),
      body: formData,
    });
    if (!startResp.ok) throw new Error(`Server returned ${startResp.status}`);
    const { job_id } = await startResp.json();
    state.jobId = job_id;

    activePoll = true;
    await pollUntilDone(job_id);

    const resultResp = await fetch(`${API_BASE}/api/properties/${job_id}`, { headers: apiHeaders(false) });
    if (!resultResp.ok) throw new Error(`Server returned ${resultResp.status}`);
    const data = await resultResp.json();
    state.extraction = data.extraction;

    const warnings = data.extraction.warnings || [];
    const warnBox = document.getElementById("warnings");
    if (warnings.length) {
      warnBox.hidden = false;
      warnBox.innerHTML = "Some pages couldn't be read automatically — check these fields manually:" +
        "<ul>" + warnings.map((w) => `<li>${w}</li>`).join("") + "</ul>";
    } else {
      warnBox.hidden = true;
    }

    buildRail();
    renderAll();
    showToast("Extraction complete — review the fields below.");
    document.getElementById("propertyForm").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    if (err instanceof ExtractionCancelled) {
      showToast("Extraction stopped.");
    } else {
      console.error(err);
      showToast("Extraction failed: " + err.message, true);
    }
  } finally {
    activePoll = false;
    btn.disabled = false;
    btn.textContent = "Extract from brochure";
    progressWrap.hidden = true;
    stopExtractBtn.hidden = true;
  }
});

// ---------------- create / save ----------------

document.getElementById("propertyForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.jobId) {
    showToast("Extract a brochure first.", true);
    return;
  }
  const btn = document.getElementById("createBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const resp = await fetch(`${API_BASE}/api/properties/${state.jobId}`, {
      method: "PATCH",
      headers: apiHeaders(true),
      body: JSON.stringify({ extraction: state.extraction }),
    });
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    showToast("Property saved.");
  } catch (err) {
    console.error(err);
    showToast("Save failed: " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create property";
  }
});

// Deep-link support: open index.html?job=<id> to resume reviewing a
// job that was already extracted (e.g. a link shared by a teammate).
(async function resumeJobFromUrl() {
  const jobId = new URLSearchParams(window.location.search).get("job");
  if (!jobId) return;
  try {
    const resp = await fetch(`${API_BASE}/api/properties/${jobId}`, { headers: apiHeaders(false) });
    if (!resp.ok) throw new Error(`Server returned ${resp.status}`);
    const data = await resp.json();
    state.jobId = data.job_id;
    state.extraction = data.extraction;
    buildRail();
    renderAll();
    showToast(`Resumed job ${jobId}.`);
  } catch (err) {
    console.error(err);
    showToast(`Couldn't load job ${jobId}: ${err.message}`, true);
  }
})();
