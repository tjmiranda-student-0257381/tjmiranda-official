/* ==========================================
   Health Tracker — tjmiranda.com / My Apps
   Author: TJ Miranda

   Everything is stored in the visitor's own browser (localStorage).
   There is no server and no database: nothing is uploaded anywhere.
   Backups are plain JSON files the visitor downloads and keeps, and
   records can be copied into the visitor's own Google Sheet.
   ========================================== */
(() => {
  "use strict";

  const KEY = "tjm.health.v1";
  const APP_ID = "tjmiranda-health-tracker";
  const KG_TO_LB = 2.2046226218;

  let state = null;
  let storageBlocked = false;

  /* ---------- Storage ---------- */
  function migrate(data) {
    if (!data || typeof data !== "object" || !data.profile) return null;
    // Version 2 dropped the food/drink/medication log; old saves still load.
    return {
      version: 2,
      profile: data.profile,
      readings: Array.isArray(data.readings) ? data.readings : [],
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(KEY);
      return raw ? migrate(JSON.parse(raw)) : null;
    } catch (err) {
      storageBlocked = true;
      return null;
    }
  }

  function saveState() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      storageBlocked = true;
      say("This browser blocked saving to your device. Private windows and “block site data” settings can cause this.", true);
      return false;
    }
  }

  function blankState() {
    return { version: 2, profile: null, readings: [] };
  }

  /* ---------- Helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const num = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function localInputValue(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* A date input gives "YYYY-MM-DD". Passing that to new Date() reads it as UTC
     midnight, which shows as the day before in negative time zones — so build a
     local date instead. */
  function parseDateOnly(value) {
    if (!value) return null;
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function whenToIso(value) {
    const d = value ? new Date(value) : new Date();
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  }

  function formatWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function formatDateOnly(value) {
    const d = parseDateOnly(value);
    return d ? d.toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
  }

  /* Spreadsheet-friendly stamp: YYYY-MM-DD HH:MM in local time */
  function sheetWhen(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function ageFrom(dob) {
    const born = parseDateOnly(dob);
    if (!born) return null;
    const now = new Date();
    let age = now.getFullYear() - born.getFullYear();
    const m = now.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
    return age >= 0 && age < 130 ? age : null;
  }

  /* ---------- Calculations (exposed for testing) ---------- */
  function heightInches(profile) {
    if (!profile) return null;
    const inches = (Number(profile.heightFt) || 0) * 12 + (Number(profile.heightIn) || 0);
    return inches > 0 ? inches : null;
  }

  function toPounds(weight, unit) {
    const w = num(weight);
    if (w === null) return null;
    return unit === "kg" ? w * KG_TO_LB : w;
  }

  function calcBmi(weight, unit, inches) {
    const lb = toPounds(weight, unit);
    if (lb === null || !inches) return null;
    return (703 * lb) / (inches * inches);
  }

  function bmiCategory(bmi) {
    if (bmi === null || !Number.isFinite(bmi)) return null;
    if (bmi < 18.5) return { label: "Underweight", tone: "warn" };
    if (bmi < 25) return { label: "Normal", tone: "good" };
    if (bmi < 30) return { label: "Overweight", tone: "warn" };
    return { label: "Obese", tone: "bad" };
  }

  function sugarCategory(mgdl, context) {
    const v = num(mgdl);
    if (v === null) return null;
    if (v < 70) return { label: "Low", tone: "bad" };
    if (context === "fasting") {
      if (v < 100) return { label: "Normal", tone: "good" };
      if (v < 126) return { label: "Pre-Diabetic", tone: "warn" };
      return { label: "Diabetic", tone: "bad" };
    }
    // 2 hours after eating, or a random reading
    if (v < 140) return { label: "Normal", tone: "good" };
    if (v < 200) return { label: "Pre-Diabetic", tone: "warn" };
    return { label: "Diabetic", tone: "bad" };
  }

  function bpCategory(systolic, diastolic) {
    const s = num(systolic);
    const d = num(diastolic);
    if (s === null || d === null) return null;
    if (s > 180 || d > 120) return { label: "Hypertensive Crisis", tone: "bad" };
    if (s >= 140 || d >= 90) return { label: "High (Stage 2)", tone: "bad" };
    if (s >= 130 || d >= 80) return { label: "High (Stage 1)", tone: "warn" };
    if (s < 90 || d < 60) return { label: "Low", tone: "warn" };
    if (s >= 120) return { label: "Elevated", tone: "warn" };
    return { label: "Normal", tone: "good" };
  }

  function hrCategory(bpm) {
    const v = num(bpm);
    if (v === null) return null;
    if (v < 60) return { label: "Low", tone: "warn" };
    if (v <= 100) return { label: "Normal", tone: "good" };
    return { label: "High", tone: "warn" };
  }

  const SUGAR_CONTEXT_LABEL = {
    fasting: "fasting",
    after: "2 hrs after eating",
    random: "random",
  };

  /* ---------- Small DOM builders ---------- */
  function badge(category) {
    if (!category) return null;
    const span = document.createElement("span");
    span.className = `badge badge--${category.tone}`;
    span.textContent = category.label;
    return span;
  }

  function metricCard(label, value, unit, category) {
    const card = document.createElement("div");
    card.className = "metric";

    const head = document.createElement("span");
    head.className = "metric-label";
    head.textContent = label;
    card.appendChild(head);

    const val = document.createElement("strong");
    val.className = "metric-value";
    val.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
    if (unit && value !== null && value !== undefined && value !== "") {
      const u = document.createElement("span");
      u.className = "metric-unit";
      u.textContent = ` ${unit}`;
      val.appendChild(u);
    }
    card.appendChild(val);

    const tag = badge(category);
    if (tag) card.appendChild(tag);
    return card;
  }

  function say(message, isError) {
    const box = $("app-status");
    if (!box) return;
    box.textContent = message;
    box.classList.toggle("is-error", Boolean(isError));
    box.hidden = false;
    window.clearTimeout(say.timer);
    say.timer = window.setTimeout(() => {
      box.hidden = true;
    }, 6000);
  }

  /* ---------- Records ---------- */
  function readingFrom(fields) {
    const inches = heightInches(state.profile);
    const weight = num(fields.weight);
    const bmi = weight === null ? null : calcBmi(weight, fields.weightUnit, inches);
    return {
      id: newId(),
      at: fields.at,
      createdAt: new Date().toISOString(),
      weight,
      weightUnit: fields.weightUnit || "lb",
      bmi: bmi === null ? null : Math.round(bmi * 10) / 10,
      sugar: num(fields.sugar),
      sugarContext: fields.sugarContext || "fasting",
      systolic: num(fields.systolic),
      diastolic: num(fields.diastolic),
      heartRate: num(fields.heartRate),
      notes: (fields.notes || "").trim(),
    };
  }

  function hasVitals(reading) {
    return (
      reading.weight !== null ||
      reading.sugar !== null ||
      reading.systolic !== null ||
      reading.diastolic !== null ||
      reading.heartRate !== null
    );
  }

  /* Newest first. The date field only stores minutes, so entries saved within the
     same minute are ordered by when they were actually added. */
  function byNewest(a, b) {
    const diff = new Date(b.at) - new Date(a.at);
    if (diff !== 0) return diff;
    return new Date(b.createdAt || b.at) - new Date(a.createdAt || a.at);
  }

  function sortedReadings() {
    return [...state.readings].sort(byNewest);
  }

  const latestReading = () => sortedReadings()[0] || null;

  /* ---------- Rendering ---------- */
  function renderAll() {
    if (!state || !state.profile) {
      $("setup-panel").hidden = false;
      $("app-panel").hidden = true;
      return;
    }
    $("setup-panel").hidden = true;
    $("app-panel").hidden = false;
    renderDashboard();
    renderHistory();
  }

  function renderDashboard() {
    const p = state.profile;
    const age = ageFrom(p.dob);
    const summary = $("profile-summary");
    summary.innerHTML = "";

    const rows = [
      ["Name", p.fullName],
      ["Date of birth", formatDateOnly(p.dob)],
      ["Age", age === null ? "—" : `${age} years`],
      ["Height", `${p.heightFt}' ${p.heightIn}"`],
      ["Records saved", `${state.readings.length} health ${state.readings.length === 1 ? "record" : "records"}`],
    ];
    for (const [label, value] of rows) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value || "—";
      summary.append(dt, dd);
    }

    const latest = latestReading();
    const metrics = $("latest-metrics");
    metrics.innerHTML = "";
    const stamp = $("latest-stamp");

    if (!latest) {
      stamp.textContent = "No health records yet. Use “Add Record” to save your first one.";
      $("weight-trend").hidden = true;
      return;
    }

    stamp.textContent = `Last recorded ${formatWhen(latest.at)}`;
    const inches = heightInches(p);
    const bmi = latest.bmi !== null && latest.bmi !== undefined ? latest.bmi : calcBmi(latest.weight, latest.weightUnit, inches);
    const bmiValue = bmi === null ? null : (Math.round(bmi * 10) / 10).toFixed(1);

    metrics.appendChild(metricCard("BMI", bmiValue, "", bmiCategory(bmi)));
    metrics.appendChild(metricCard("Weight", latest.weight, latest.weightUnit, null));
    metrics.appendChild(
      metricCard(
        `Blood sugar (${SUGAR_CONTEXT_LABEL[latest.sugarContext] || "fasting"})`,
        latest.sugar,
        "mg/dL",
        sugarCategory(latest.sugar, latest.sugarContext)
      )
    );
    metrics.appendChild(
      metricCard(
        "Blood pressure",
        latest.systolic && latest.diastolic ? `${latest.systolic}/${latest.diastolic}` : null,
        "mmHg",
        bpCategory(latest.systolic, latest.diastolic)
      )
    );
    metrics.appendChild(metricCard("Heart rate", latest.heartRate, "bpm", hrCategory(latest.heartRate)));

    const previous = sortedReadings()[1];
    const trend = $("weight-trend");
    if (previous && latest.weight !== null && previous.weight !== null && latest.weightUnit === previous.weightUnit) {
      const diff = latest.weight - previous.weight;
      const rounded = Math.round(Math.abs(diff) * 10) / 10;
      trend.textContent =
        diff === 0
          ? `Weight unchanged since ${formatWhen(previous.at)}.`
          : `Weight ${diff > 0 ? "up" : "down"} ${rounded} ${latest.weightUnit} since ${formatWhen(previous.at)}.`;
      trend.hidden = false;
    } else {
      trend.hidden = true;
    }
  }

  function renderHistory() {
    const body = $("vitals-rows");
    body.innerHTML = "";
    const readings = sortedReadings();
    $("vitals-empty").hidden = readings.length > 0;
    $("vitals-table-wrap").hidden = readings.length === 0;

    for (const r of readings) {
      const tr = document.createElement("tr");
      const cells = [
        formatWhen(r.at),
        r.weight === null ? "—" : `${r.weight} ${r.weightUnit}`,
        r.bmi === null || r.bmi === undefined ? "—" : String(r.bmi),
        r.sugar === null ? "—" : `${r.sugar} (${SUGAR_CONTEXT_LABEL[r.sugarContext] || "fasting"})`,
        r.systolic && r.diastolic ? `${r.systolic}/${r.diastolic}` : "—",
        r.heartRate === null ? "—" : String(r.heartRate),
      ];
      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }

      const tags = document.createElement("td");
      for (const cat of [bmiCategory(r.bmi), sugarCategory(r.sugar, r.sugarContext), bpCategory(r.systolic, r.diastolic)]) {
        const tag = badge(cat);
        if (tag) tags.appendChild(tag);
      }
      if (!tags.childNodes.length) tags.textContent = "—";
      tr.appendChild(tags);

      if (r.notes) tr.title = r.notes;

      const actions = document.createElement("td");
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn--ghost btn--small";
      del.textContent = "Delete";
      del.dataset.deleteReading = r.id;
      actions.appendChild(del);
      tr.appendChild(actions);

      body.appendChild(tr);
    }
  }

  function updateBmiPreview(prefix) {
    const target = $(`${prefix}-bmi`);
    if (!target) return;
    const profile = state && state.profile ? state.profile : {
      heightFt: $("height-ft") ? $("height-ft").value : 0,
      heightIn: $("height-in") ? $("height-in").value : 0,
    };
    const inches = heightInches(profile);
    const weightField = prefix === "setup" ? $("weight") : $("r-weight");
    const unitField = prefix === "setup" ? $("weight-unit") : $("r-weight-unit");
    const bmi = calcBmi(weightField.value, unitField.value, inches);
    const cat = bmiCategory(bmi);
    if (bmi === null || !cat) {
      target.textContent = "Fill in your height and weight to see your BMI.";
      target.className = "bmi-preview";
      return;
    }
    target.textContent = `BMI ${(Math.round(bmi * 10) / 10).toFixed(1)} — ${cat.label}`;
    target.className = `bmi-preview bmi-preview--${cat.tone}`;
  }

  /* ---------- Table output: CSV, TSV (Google Sheets), backup ---------- */
  const COLUMNS = [
    "Date and time", "Weight", "Unit", "BMI", "BMI category", "Blood sugar (mg/dL)", "Sugar reading type",
    "Sugar category", "Systolic", "Diastolic", "Blood pressure category", "Heart rate (bpm)", "Heart rate category", "Notes",
  ];

  function rowsForExport() {
    return sortedReadings().map((r) => {
      const bmiCat = bmiCategory(r.bmi);
      const sugarCat = sugarCategory(r.sugar, r.sugarContext);
      const bpCat = bpCategory(r.systolic, r.diastolic);
      const hrCat = hrCategory(r.heartRate);
      return [
        sheetWhen(r.at), r.weight, r.weightUnit, r.bmi, bmiCat ? bmiCat.label : "",
        r.sugar, SUGAR_CONTEXT_LABEL[r.sugarContext] || "", sugarCat ? sugarCat.label : "",
        r.systolic, r.diastolic, bpCat ? bpCat.label : "", r.heartRate, hrCat ? hrCat.label : "", r.notes,
      ].map((v) => (v === null || v === undefined ? "" : String(v)));
    });
  }

  const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;

  function vitalsCsv() {
    return [COLUMNS.map(csvCell).join(","), ...rowsForExport().map((row) => row.map(csvCell).join(","))].join("\r\n");
  }

  /* Tab separated, so it pastes straight into a spreadsheet */
  function vitalsTsv() {
    const clean = (v) => String(v).replace(/[\t\r\n]+/g, " ").trim();
    return [COLUMNS.join("\t"), ...rowsForExport().map((row) => row.map(clean).join("\t"))].join("\n");
  }

  function exportData() {
    return JSON.stringify({ app: APP_ID, version: 2, exportedAt: new Date().toISOString(), data: state }, null, 2);
  }

  function importData(json, mode) {
    let parsed;
    try {
      parsed = typeof json === "string" ? JSON.parse(json) : json;
    } catch (err) {
      return { ok: false, error: "That file is not a valid backup (it could not be read as JSON)." };
    }
    const raw = parsed && parsed.data ? parsed.data : parsed;
    const data = migrate(raw);
    if (!data) {
      return { ok: false, error: "That file does not look like a Health Tracker backup." };
    }

    if (mode === "merge" && state && state.profile) {
      const seen = new Set(state.readings.map((r) => r.id));
      let added = 0;
      for (const r of data.readings) {
        if (!seen.has(r.id)) {
          state.readings.push(r);
          added += 1;
        }
      }
      saveState();
      return { ok: true, added };
    }

    state = data;
    saveState();
    return { ok: true, replaced: true };
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      /* fall through to the manual copy box */
    }
    return false;
  }

  const stampedName = (base, ext) => `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;

  /* ---------- Tabs ---------- */
  function setupTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const show = (tab) => {
      for (const t of tabs) {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        t.tabIndex = selected ? 0 : -1;
        $(t.getAttribute("aria-controls")).hidden = !selected;
      }
    };
    for (const tab of tabs) {
      tab.addEventListener("click", () => show(tab));
      tab.addEventListener("keydown", (e) => {
        const i = tabs.indexOf(tab);
        let next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (next) {
          e.preventDefault();
          show(next);
          next.focus();
        }
      });
    }
    return show;
  }

  /* ---------- Add Record: now or a past reading ---------- */
  function whenMode() {
    const checked = document.querySelector('input[name="when-mode"]:checked');
    return checked ? checked.value : "now";
  }

  function applyWhenMode() {
    const past = whenMode() === "past";
    $("when-wrap").hidden = !past;
    if (past && !$("r-when").value) $("r-when").value = localInputValue();
  }

  function usePastMode() {
    const radio = document.querySelector('input[name="when-mode"][value="past"]');
    if (radio) {
      radio.checked = true;
      applyWhenMode();
      $("r-when").focus();
    }
  }

  /* ---------- Wiring ---------- */
  function init() {
    state = loadState() || blankState();

    if (storageBlocked) {
      const warn = $("storage-warning");
      if (warn) warn.hidden = false;
    }

    const showTab = setupTabs();
    $("setup-when").value = localInputValue();

    for (const id of ["weight", "weight-unit", "height-ft", "height-in"]) {
      const field = $(id);
      if (field) field.addEventListener("input", () => updateBmiPreview("setup"));
    }
    for (const id of ["r-weight", "r-weight-unit"]) {
      const field = $(id);
      if (field) field.addEventListener("input", () => updateBmiPreview("record"));
    }
    for (const radio of document.querySelectorAll('input[name="when-mode"]')) {
      radio.addEventListener("change", applyWhenMode);
    }

    /* Setup */
    $("setup-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const at = whenToIso($("setup-when").value);
      state = blankState();
      state.profile = {
        fullName: $("full-name").value.trim(),
        dob: $("dob").value,
        heightFt: Number($("height-ft").value) || 0,
        heightIn: Number($("height-in").value) || 0,
        weightUnit: $("weight-unit").value,
        createdAt: new Date().toISOString(),
      };

      const reading = readingFrom({
        at,
        weight: $("weight").value,
        weightUnit: $("weight-unit").value,
        sugar: $("sugar").value,
        sugarContext: $("sugar-context").value,
        systolic: $("systolic").value,
        diastolic: $("diastolic").value,
        heartRate: $("heart-rate").value,
        notes: "First record (setup)",
      });
      if (hasVitals(reading)) state.readings.push(reading);

      if (saveState()) {
        renderAll();
        showTab($("tab-btn-dashboard"));
        say("Setup saved on this device.");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    /* Add health record — now, or a past reading */
    $("record-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const at = whenMode() === "past" ? whenToIso($("r-when").value) : new Date().toISOString();
      const reading = readingFrom({
        at,
        weight: $("r-weight").value,
        weightUnit: $("r-weight-unit").value,
        sugar: $("r-sugar").value,
        sugarContext: $("r-sugar-context").value,
        systolic: $("r-systolic").value,
        diastolic: $("r-diastolic").value,
        heartRate: $("r-heart-rate").value,
        notes: $("r-notes").value,
      });
      if (!hasVitals(reading)) {
        say("Enter at least one measurement before saving.", true);
        return;
      }
      const wasPast = whenMode() === "past";
      state.readings.push(reading);
      if (saveState()) {
        $("record-form").reset();
        applyWhenMode();
        updateBmiPreview("record");
        renderAll();
        say(wasPast ? "Past reading saved. Add another if you have more." : "Health record saved.");
      }
    });

    /* Edit profile */
    $("profile-form").addEventListener("submit", (e) => {
      e.preventDefault();
      state.profile.fullName = $("p-full-name").value.trim() || state.profile.fullName;
      state.profile.dob = $("p-dob").value || state.profile.dob;
      state.profile.heightFt = Number($("p-height-ft").value) || 0;
      state.profile.heightIn = Number($("p-height-in").value) || 0;
      if (saveState()) {
        renderAll();
        say("Profile updated.");
      }
    });

    $("profile-edit").addEventListener("toggle", () => {
      if (!$("profile-edit").open || !state.profile) return;
      $("p-full-name").value = state.profile.fullName || "";
      $("p-dob").value = state.profile.dob || "";
      $("p-height-ft").value = state.profile.heightFt || 0;
      $("p-height-in").value = state.profile.heightIn || 0;
    });

    /* Deletes and shortcuts */
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      if (target.dataset.deleteReading) {
        if (!window.confirm("Delete this health record? This cannot be undone.")) return;
        state.readings = state.readings.filter((r) => r.id !== target.dataset.deleteReading);
        saveState();
        renderAll();
        say("Health record deleted.");
      }

      if (target.dataset.goTab) {
        const tab = $(target.dataset.goTab);
        if (tab) {
          tab.click();
          tab.focus();
        }
        if (target.dataset.past) usePastMode();
      }
    });

    /* Backup, CSV, Google Sheets */
    $("download-backup").addEventListener("click", () => {
      download(stampedName("health-tracker-backup", "json"), exportData(), "application/json");
      say("Backup file downloaded. Keep it somewhere safe.");
    });

    $("export-vitals-csv").addEventListener("click", () => {
      download(stampedName("health-records", "csv"), vitalsCsv(), "text/csv");
      say("Health records exported as CSV.");
    });

    $("copy-sheets").addEventListener("click", async () => {
      if (!state.readings.length) {
        say("There are no records to copy yet.", true);
        return;
      }
      const text = vitalsTsv();
      const copied = await copyToClipboard(text);
      if (copied) {
        $("copy-fallback").hidden = true;
        say(`${state.readings.length} ${state.readings.length === 1 ? "record" : "records"} copied. Open your Google Sheet, click cell A1, and paste.`);
      } else {
        $("copy-fallback").hidden = false;
        $("copy-area").value = text;
        $("copy-area").focus();
        $("copy-area").select();
        say("Your browser blocked the copy — select the text below and copy it yourself.", true);
      }
    });

    $("restore-file").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const mode = document.querySelector('input[name="restore-mode"]:checked').value;
        if (mode === "replace" && !window.confirm("Replace everything currently saved on this device with the backup?")) {
          $("restore-file").value = "";
          return;
        }
        const result = importData(String(reader.result), mode);
        $("restore-file").value = "";
        if (!result.ok) {
          say(result.error, true);
          return;
        }
        renderAll();
        say(result.replaced ? "Backup restored." : `Backup merged: ${result.added} new ${result.added === 1 ? "record" : "records"} added.`);
      };
      reader.onerror = () => say("That file could not be read.", true);
      reader.readAsText(file);
    });

    $("erase-data").addEventListener("click", () => {
      if (!window.confirm("Erase all Health Tracker data from this device? Download a backup first if you want to keep it.")) return;
      if (!window.confirm("Last check — this permanently deletes your profile and health records on this device.")) return;
      try {
        window.localStorage.removeItem(KEY);
      } catch (err) {
        /* nothing else to do */
      }
      state = blankState();
      $("setup-form").reset();
      $("setup-when").value = localInputValue();
      renderAll();
      say("All data erased from this device.");
    });

    renderAll();
    updateBmiPreview("setup");
    applyWhenMode();
    if (state.profile) showTab($("tab-btn-dashboard"));
  }

  /* Exposed so the calculations can be checked from the console or a test run */
  window.HealthTracker = {
    calcBmi,
    bmiCategory,
    sugarCategory,
    bpCategory,
    hrCategory,
    heightInches,
    ageFrom,
    formatDateOnly,
    vitalsTsv,
    vitalsCsv,
    exportData,
    importData,
    getState: () => state,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
