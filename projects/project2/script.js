let bgPhoto;
let conflictRows = [];
let countryBars = [];
let selectedBar = null;

// State 1 = false ("Overall number of deaths") -> 100% scale, centered
// State 2 = true  ("Deaths proportional to population") -> 130% scale (+30%), centered
let isState2 = false;
let stateBlend = 0; // 0 = 1.0x zoom, 1 = 1.3x zoom
let zoomStartBlend = 0;
let zoomTargetBlend = 0;
let zoomStartTimeMs = 0;
let isZooming = false;

const CSV_FILENAME = "Top 10 Countries by Conflict Death Rate (2023).csv";
const BG_IMAGE_FILENAME = "A_large_blank_world_map_with_oceans_marked_in_blue2.png";
const BG_MAX_ZOOM = 1.3; // +30% zoom towards the center in State 2
const ZOOM_DURATION_MS = 1500; // 1.5 seconds
const MAX_ZOOM_BLUR_PX = 3.5; // Gentle motion blur during zoom

const BG_COLOR = "#161A1D";
const TEXT_COLOR = "#FFFFFF";
const INACTIVE_TEXT_COLOR = "#858585";
const CARD_BG_COLOR = [22, 26, 29, 235];

// Fixed color assigned per country so each country always keeps its own color
const COUNTRY_COLORS = {
  "Ukraine": "#b37474",
  "Palestine": "#798b94",
  "Paestine": "#FDC358",
  "Sudan": "#9B8F77",
  "Mexico": "#947089",
  "Burkina Faso": "#a15c5c",
  "Somalia": "#858f6b",
  "Syria": "#baa986",
  "Mali": "#D8939B",
  "Israel": "#d3d3d3",
  "Israeil": "#D8D293",
  "Central African Republic": "#D6AFD1"
};

const FALLBACK_COLORS = [
  "#b37474", "#798b94", "#9B8F77", "#947089", "#a15c5c",
  "#858f6b", "#baa986", "#D8939B", "#d3d3d3", "#D6AFD1"
];

function getCountryColor(countryName, index = 0) {
  const cleanName = (countryName || "").trim();
  return COUNTRY_COLORS[cleanName] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function getToggleBounds() {
  const w = 52;
  const h = 24;
  const x = width / 2 - w / 2;
  const y = 78; // Directly underneath the top headline
  return { x, y, w, h };
}

function getChartBounds() {
  const chartW = min(width - 120, 960);
  const chartLeft = (width - chartW) / 2;
  const maxLabelLen = countryBars.length
    ? max(...countryBars.map((b) => (b.label || "").length))
    : 24;
  // Reserve enough headroom above the tallest bar for the 60-degree connector + 45-degree country label
  const labelHeadroom = 20 + maxLabelLen * 5.2 + 24;
  const chartTop = max(165, 110 + labelHeadroom);
  const chartBottom = height - 76;
  const chartH = max(140, chartBottom - chartTop);
  return { chartLeft, chartTop, chartW, chartH, chartBottom };
}

// Cubic ease-in-out ("easy ease") for smooth acceleration and deceleration
function easeInOutCubic(t) {
  const clamped = constrain(t, 0, 1);
  return clamped < 0.5
    ? 4 * clamped * clamped * clamped
    : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

function triggerZoomToState(targetIsState2) {
  isState2 = targetIsState2;
  zoomStartBlend = stateBlend;
  zoomTargetBlend = isState2 ? 1.0 : 0.0;
  zoomStartTimeMs = millis();
  isZooming = true;
}

function updateStateBlend() {
  if (!isZooming) {
    stateBlend = zoomTargetBlend;
    return 0;
  }

  const elapsed = millis() - zoomStartTimeMs;
  const rawT = constrain(elapsed / ZOOM_DURATION_MS, 0, 1);
  const easedT = easeInOutCubic(rawT);

  // Derivative of easeInOutCubic peaks at 1.5 at t = 0.5, giving a smooth curve for gentle motion blur
  const speedFactor = rawT < 0.5
    ? 12 * rawT * rawT
    : 12 * Math.pow(-2 * rawT + 2, 2) / 4;

  stateBlend = lerp(zoomStartBlend, zoomTargetBlend, easedT);

  if (rawT >= 1) {
    stateBlend = zoomTargetBlend;
    isZooming = false;
    return 0;
  }

  return constrain(speedFactor / 1.5, 0, 1);
}

function setFontWeightStyle(isBold) {
  if (drawingContext && "fontVariationSettings" in drawingContext) {
    drawingContext.fontVariationSettings = isBold ? '"wght" 700' : '"wght" 400';
  }
  textStyle(isBold ? BOLD : NORMAL);
}

function drawCoverBackground(img, blend, motionIntensity = 0) {
  background(BG_COLOR);

  if (!img || !img.width || !img.height) return;

  // Base cover scale fills the viewport proportionally at 100% (blend = 0),
  // then zooms +30% towards the center up to 130% (blend = 1)
  const baseScale = max(width / img.width, height / img.height);
  const zoomScale = lerp(1.0, BG_MAX_ZOOM, blend);
  const drawW = img.width * baseScale * zoomScale;
  const drawH = img.height * baseScale * zoomScale;

  // Always centered in the canvas frame
  const drawX = (width - drawW) / 2;
  const drawY = (height - drawH) / 2;

  const blurPx = (motionIntensity * MAX_ZOOM_BLUR_PX).toFixed(2);

  push();
  if (motionIntensity > 0.01) {
    drawingContext.filter = `blur(${blurPx}px)`;
  } else {
    drawingContext.filter = "none";
  }

  // Expand slightly around the center during blur so blurred edges never show a border
  const pad = motionIntensity > 0.01 ? Math.ceil(parseFloat(blurPx) * 2) : 0;
  image(img, drawX - pad, drawY - pad, drawW + pad * 2, drawH + pad * 2);
  drawingContext.filter = "none";

  // Subtle dark tint so white text and horizontal-line bars remain crisp over the map
  noStroke();
  fill(22, 26, 29, 118);
  rect(0, 0, width, height);
  pop();
}

async function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont("Manrope");

  try {
    bgPhoto = await loadImage(encodeURI(BG_IMAGE_FILENAME));
  } catch (err) {
    console.error("Background image load failed:", err);
  }

  try {
    const res = await fetch(encodeURI(CSV_FILENAME));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csvText = await res.text();
    conflictRows = parseCsv(csvText);
    countryBars = buildCountryBars(conflictRows);
    console.log("CSV loaded. Rows:", conflictRows.length, "Bars:", countryBars.length);
  } catch (err) {
    console.error("CSV load failed:", err);
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function getBarRect(bar, index, totalCount, chart) {
  const slotW = chart.chartW / max(1, totalCount);
  const baseBarW = min(68, slotW * 0.62);
  const eased = bar.easedExpand || 0;
  const scaleW = lerp(1.0, 1.15, eased);
  const scaleH = lerp(1.0, 1.06, eased);

  const w = baseBarW * scaleW;
  const h = max(3, (bar.currentHeight || 0) * scaleH);
  const centerX = chart.chartLeft + (index + 0.5) * slotW;
  const x = centerX - w / 2;
  const y = chart.chartBottom - h;

  return { x, y, w, h, centerX, baselineY: chart.chartBottom };
}

function drawHorizontalLineBar(barRect, barColor, alphaScale = 1.0) {
  const lineThickness = 3;
  const lineStep = 6; // 3px stroke + 3px open space between lines
  const col = color(barColor);
  col.setAlpha(round(255 * alphaScale));

  push();
  stroke(col);
  strokeWeight(lineThickness);
  strokeCap(SQUARE);

  // Draw horizontal strokes upward from just above the baseline to the top of the bar
  for (let ly = barRect.baselineY - 2; ly >= barRect.y; ly -= lineStep) {
    line(barRect.x, ly, barRect.x + barRect.w, ly);
  }
  pop();
}

function drawBarConnectorAndLabel(bar, barRect, barColor, alphaScale = 1.0) {
  const verticalOffset = 20; // 20px above the top of each bar
  const connectorAngle = radians(60); // 60-degree angle upward-right from bar top-center
  const labelAngle = radians(-45); // 45-degree upward tilt

  // Start point: centre top of each bar
  const x1 = barRect.centerX;
  const y1 = barRect.y;

  // End point: 20px vertically above the bar along a 60-degree line,
  // meeting the centre-left start of the country name
  const dy = verticalOffset;
  const dx = dy / Math.tan(connectorAngle);
  const x2 = x1 + dx;
  const y2 = y1 - dy;

  const lineCol = color(barColor);
  lineCol.setAlpha(round(255 * alphaScale));

  const txtCol = color(TEXT_COLOR);
  txtCol.setAlpha(round(255 * alphaScale));

  // Short 2px connector line
  push();
  stroke(lineCol);
  strokeWeight(2);
  strokeCap(ROUND);
  line(x1, y1, x2, y2);
  pop();

  // Country name positioned at the centre-left of the start of the word, tilted at 45 degrees
  push();
  translate(x2 + 3, y2 - 2);
  rotate(labelAngle);
  noStroke();
  fill(txtCol);
  textAlign(LEFT, CENTER);
  textSize(12);
  text(bar.label, 0, 0);
  pop();
}

function isOverToggleHitArea() {
  const tgl = getToggleBounds();
  const inSwitch =
    mouseX >= tgl.x &&
    mouseX <= tgl.x + tgl.w &&
    mouseY >= tgl.y &&
    mouseY <= tgl.y + tgl.h;

  const knobY = tgl.y + tgl.h / 2;
  const inLabelBand = Math.abs(mouseY - knobY) <= 14;
  const inLeftLabel = inLabelBand && mouseX >= tgl.x - 210 && mouseX < tgl.x;
  const inRightLabel = inLabelBand && mouseX > tgl.x + tgl.w && mouseX <= tgl.x + tgl.w + 255;

  return { inSwitch, inLeftLabel, inRightLabel };
}

function updateHoverCursor(chart) {
  const { inSwitch, inLeftLabel, inRightLabel } = isOverToggleHitArea();
  if (inSwitch || inLeftLabel || inRightLabel) {
    cursor(HAND);
    return;
  }

  for (let i = countryBars.length - 1; i >= 0; i--) {
    const b = countryBars[i];
    const r = getBarRect(b, i, countryBars.length, chart);
    if (
      mouseX >= r.x &&
      mouseX <= r.x + r.w &&
      mouseY >= r.y &&
      mouseY <= r.baselineY
    ) {
      cursor(HAND);
      return;
    }
  }

  cursor(ARROW);
}

function mousePressed() {
  const { inSwitch, inLeftLabel, inRightLabel } = isOverToggleHitArea();
  if (inSwitch) {
    triggerZoomToState(!isState2);
    return;
  }
  if (inLeftLabel && isState2) {
    triggerZoomToState(false);
    return;
  }
  if (inRightLabel && !isState2) {
    triggerZoomToState(true);
    return;
  }

  if (!countryBars || countryBars.length === 0) return;

  const chart = getChartBounds();
  let hit = null;

  for (let i = countryBars.length - 1; i >= 0; i--) {
    const b = countryBars[i];
    const r = getBarRect(b, i, countryBars.length, chart);
    if (
      mouseX >= r.x &&
      mouseX <= r.x + r.w &&
      mouseY >= r.y &&
      mouseY <= r.baselineY
    ) {
      hit = b;
      break;
    }
  }

  if (hit) {
    selectedBar = selectedBar === hit ? null : hit;
  } else {
    selectedBar = null;
  }
}

function draw() {
  const motionIntensity = updateStateBlend();

  drawCoverBackground(bgPhoto, stateBlend, motionIntensity);

  // Title text at the top in white
  setFontWeightStyle(false);
  fill(TEXT_COLOR);
  noStroke();
  textAlign(CENTER, TOP);
  textSize(min(32, max(20, width * 0.026)));
  text("2023 Armed Conflict Death Toll: 10 Deadliest Countries", width / 2, 28);

  drawStateToggle(stateBlend);

  const chart = getChartBounds();
  updateHoverCursor(chart);

  // Baseline axis for the bar chart
  push();
  stroke(TEXT_COLOR);
  strokeWeight(2);
  line(chart.chartLeft, chart.chartBottom, chart.chartLeft + chart.chartW, chart.chartBottom);
  pop();

  // Smoothly transition bar heights and "easy ease" expansion
  const easeSpeed = 0.08;
  for (let b of countryBars) {
    const h1 = (b.norm1 || 0) * chart.chartH;
    const h2 = (b.norm2 || 0) * chart.chartH;
    const targetHeight = lerp(h1, h2, stateBlend);

    const targetExpand = b === selectedBar ? 1.0 : 0.0;
    b.expandProgress = lerp(b.expandProgress ?? 0.0, targetExpand, easeSpeed);
    if (Math.abs(targetExpand - b.expandProgress) < 0.001) {
      b.expandProgress = targetExpand;
    }

    b.easedExpand = easeInOutCubic(b.expandProgress);
    b.currentHeight = lerp(b.currentHeight ?? h1, targetHeight, 0.16);
  }

  // Draw horizontal-line bars, 60-degree connectors, and 45-degree country labels
  for (let i = 0; i < countryBars.length; i++) {
    const b = countryBars[i];
    const r = getBarRect(b, i, countryBars.length, chart);
    const barColor = b.color || getCountryColor(b.label, i);
    const alphaScale = selectedBar && selectedBar !== b ? 0.42 : 1.0;

    drawHorizontalLineBar(r, barColor, alphaScale);
    drawBarConnectorAndLabel(b, r, barColor, alphaScale);
  }

  // Detail card above the selected bar
  if (selectedBar) {
    const idx = countryBars.indexOf(selectedBar);
    const r = getBarRect(selectedBar, idx, countryBars.length, chart);
    drawBarDetailCard(selectedBar, r);
  }

  // Source text in white at the bottom of the window
  push();
  noStroke();
  fill(TEXT_COLOR);
  textAlign(CENTER, BOTTOM);
  textSize(16);
  text("Source: ourworldindata.org", width / 2, height - 30);
  pop();
}

function drawStateToggle(blend) {
  const { x, y, w, h } = getToggleBounds();
  const radius = h / 2;
  const knobR = h - 8;
  const knobMinX = x + 4 + knobR / 2;
  const knobMaxX = x + w - 4 - knobR / 2;
  const knobX = lerp(knobMinX, knobMaxX, blend);
  const knobY = y + h / 2;

  push();
  // Labels flanking the toggle switch
  noStroke();
  textSize(16);
  textAlign(RIGHT, CENTER);
  fill(blend < 0.5 ? TEXT_COLOR : INACTIVE_TEXT_COLOR);
  text("Overall number of deaths", x - 12, knobY);

  textAlign(LEFT, CENTER);
  fill(blend >= 0.5 ? TEXT_COLOR : INACTIVE_TEXT_COLOR);
  text("Deaths proportional to population", x + w + 12, knobY);

  // Warm yellow glow when State 2 is active (blended smoothly)
  if (blend > 0.01) {
    drawingContext.save();
    drawingContext.shadowColor = `rgba(255, 210, 60, ${0.95 * blend})`;
    drawingContext.shadowBlur = 20 * blend;
    noFill();
    stroke(TEXT_COLOR);
    strokeWeight(2);
    rect(x, y, w, h, radius);
    circle(knobX, knobY, knobR);
    drawingContext.restore();
  }

  // Toggle track & knob: no fill, 2px white stroke
  noFill();
  stroke(TEXT_COLOR);
  drawingContext.strokeStyle = TEXT_COLOR;
  strokeWeight(2);
  rect(x, y, w, h, radius);
  circle(knobX, knobY, knobR);
  pop();
}

function drawBarDetailCard(b, barRect) {
  const titleText = b.label;

  let rows;
  if (isState2) {
    const rawPct = !isNaN(b.pctPopNum) ? b.pctPopNum : parseFloat(b.pctPopRaw);
    const formattedPct = isNaN(rawPct) ? "N/A" : `${rawPct.toFixed(2)}%`;
    rows = [
      { text: titleText, size: 24, bold: false },
      { text: "Deaths per population:", size: 14, bold: false },
      { text: formattedPct, size: 16, bold: true }
    ];
  } else {
    rows = [
      { text: titleText, size: 24, bold: false },
      { text: "Est. Deaths (2023):", size: 14, bold: false },
      { text: formatNumber(b.deaths), size: 16, bold: true }
    ];
  }

  push();
  const lineGap = 8;
  const padding = 10;
  const cornerRadius = 20;

  let maxLineWidth = 0;
  let totalTextHeight = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    setFontWeightStyle(row.bold);
    textSize(row.size);
    maxLineWidth = Math.max(maxLineWidth, textWidth(row.text));
    totalTextHeight += row.size;
    if (i < rows.length - 1) {
      totalTextHeight += lineGap;
    }
  }

  const boxW = maxLineWidth + padding * 2;
  const boxH = totalTextHeight + padding * 2;

  let boxLeft = constrain(barRect.centerX - boxW / 2, 12, width - boxW - 12);
  let boxTop = barRect.y - 10 - boxH;
  const minTopY = 116;
  if (boxTop < minTopY) {
    boxTop = minTopY;
  }

  // Responsive semi-transparent rounded dark background with white text
  noStroke();
  fill(CARD_BG_COLOR[0], CARD_BG_COLOR[1], CARD_BG_COLOR[2], CARD_BG_COLOR[3]);
  rect(boxLeft, boxTop, boxW, boxH, cornerRadius);

  fill(TEXT_COLOR);
  textAlign(LEFT, TOP);

  let currentY = boxTop + padding;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    setFontWeightStyle(row.bold);
    textSize(row.size);
    text(row.text, boxLeft + padding, currentY);
    currentY += row.size + lineGap;
  }

  setFontWeightStyle(false);
  pop();
}

function formatNumber(val) {
  const num = parseFloat(val);
  if (isNaN(num)) return val || "N/A";
  return Math.round(num).toLocaleString();
}

function buildCountryBars(rows) {
  if (!rows || rows.length === 0) return [];

  const parsed = rows.map((r, idx) => {
    const label = (r["Country"] || Object.values(r)[0] || `Country ${idx + 1}`).trim();
    const code = (r["Code"] || "").trim();

    // State 1 value: Column G ("Estimated Conflict Deaths 2023")
    let deaths = parseFloat(r["Estimated Conflict Deaths 2023"]);
    const rateNum = parseFloat(r["Death Rate per 100k"]);
    const popNum = parseFloat(r["Population 2023"]);
    if (isNaN(deaths) && !isNaN(rateNum) && !isNaN(popNum)) {
      deaths = (rateNum / 100000) * popNum;
    }

    // State 2 value: Column H ("Conflict Deaths (% of Population)")
    let pctPopNum = parseFloat(r["Conflict Deaths (% of Population)"]);
    if (isNaN(pctPopNum) && !isNaN(rateNum)) {
      pctPopNum = (rateNum / 100000) * 100;
    }

    return {
      id: `${label}__${idx}`,
      label,
      code,
      deaths: isNaN(deaths) ? 0 : deaths,
      pctPopNum: isNaN(pctPopNum) ? 0 : pctPopNum,
      pctPopRaw: r["Conflict Deaths (% of Population)"] || "",
      rate100k: r["Death Rate per 100k"] || "",
      pop: r["Population 2023"] || "",
      color: getCountryColor(label, idx),
      expandProgress: 0.0,
      easedExpand: 0.0
    };
  });

  const maxDeaths = Math.max(1, ...parsed.map((d) => d.deaths));
  const maxPctPop = Math.max(0.000001, ...parsed.map((d) => d.pctPopNum));

  return parsed
    .sort((a, b) => b.deaths - a.deaths)
    .map((d) => ({
      ...d,
      norm1: d.deaths / maxDeaths,
      norm2: d.pctPopNum / maxPctPop,
      currentHeight: 0
    }));
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = {};
    headers.forEach((header, idx) => {
      row[header] = values[idx] ?? "";
    });
    return row;
  });
}