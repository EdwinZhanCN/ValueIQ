/** Research export for the exact PR #123 fixture. No financial calculations. */
export async function renderEngineReport({
  PDFDocument,
  rgb,
  fontkit,
  fonts,
  data,
}) {
  if (data.kind !== "result" || data.meta.contract_version !== "1") {
    throw new Error(
      "This exporter accepts only a version 1 result, never a gap list.",
    );
  }
  const { meta, result } = data;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const glyphs = new Map([
    [regular, new Set(regular.getCharacterSet())],
    [bold, new Set(bold.getCharacterSet())],
  ]);
  doc.setTitle(
    `ValueIQ · pre-funding report${meta.mode === "stub" ? " · STUB" : ""}`,
  );
  doc.setAuthor("ValueIQ");
  const C = {
    ink: rgb(0.09, 0.18, 0.22),
    muted: rgb(0.37, 0.44, 0.48),
    teal: rgb(0.03, 0.49, 0.45),
    blue: rgb(0.25, 0.41, 0.72),
    pale: rgb(0.95, 0.97, 0.98),
    soft: rgb(0.92, 0.96, 0.95),
    rule: rgb(0.86, 0.9, 0.91),
    white: rgb(1, 1, 1),
  };
  const W = 595.28,
    H = 841.89,
    M = 40,
    CW = W - 2 * M,
    BOTTOM = H - 67;
  const pages = [],
    layout = [];
  let page, y, group;
  const withCase = (source, replacement) =>
    /^[A-Z]/.test(source)
      ? replacement.replace(/^./, (character) => character.toUpperCase())
      : replacement;
  const plainLanguage = (value) =>
    String(value)
      .replace(/weakest links?/gi, (match) =>
        withCase(
          match,
          match.toLowerCase().endsWith("s")
            ? "least-supported inputs"
            : "least-supported input",
        ),
      )
      .replace(/evidence haircuts/gi, (match) =>
        withCase(match, "evidence discounts"),
      )
      .replace(/evidence haircut/gi, (match) =>
        withCase(match, "evidence discount"),
      )
      .replace(/haircuts/gi, (match) => withCase(match, "evidence discounts"))
      .replace(/haircut/gi, (match) => withCase(match, "evidence discount"))
      .replace(/recapture_pct/gi, "freed time used productively")
      .replace(/\brecapture\b/gi, "productive use of freed time")
      .replace(/\bfloors\b/gi, "minimum confidence levels we require")
      .replace(/\bfloor\b/gi, "minimum confidence we require")
      .replace(/\btiers\b/gi, "evidence levels")
      .replace(/\btier\b/gi, "evidence level");
  const inputLabel = (id) =>
    ({
      recapture_pct: "Freed time used productively (%)",
      discount_rate_pct: "Discount rate (%)",
    })[id] ??
    String(id)
      .replaceAll("_pct", " percentage")
      .replaceAll("_", " ")
      .replace(/^./, (character) => character.toUpperCase());
  const specified = (value) =>
    !String(value).trim().toLowerCase().startsWith("not specified");
  const text = (s, x, top, size = 9, font = regular, color = C.ink) => {
    const value = plainLanguage(s);
    if (
      [...value].some(
        (character) => !glyphs.get(font).has(character.codePointAt(0)),
      )
    )
      throw new Error("Report font does not support the supplied text");
    page.drawText(value, { x, y: H - top - size, size, font, color });
  };
  const right = (s, x, top, size = 9, font = regular, color = C.ink) =>
    text(
      s,
      x - font.widthOfTextAtSize(String(s), size),
      top,
      size,
      font,
      color,
    );
  const rect = (x, top, width, height, color) =>
    page.drawRectangle({ x, y: H - top - height, width, height, color });
  const line = (x1, t1, x2, t2, color = C.rule, width = 0.6) =>
    page.drawLine({
      start: { x: x1, y: H - t1 },
      end: { x: x2, y: H - t2 },
      color,
      thickness: width,
    });
  const mark = (kind, top, height) => {
    if (top < 90 || top + height > BOTTOM + 0.1)
      throw new Error(`Overflow: ${kind}`);
    layout.push({ page: pages.length, kind, top, bottom: top + height });
  };
  const wrap = (value, width, size = 9, font = regular) => {
    const lines = [];
    let current = "";
    for (const word of plainLanguage(value).replaceAll("−", "-").split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      for (const char of word) {
        if (font.widthOfTextAtSize(current + char, size) > width) {
          lines.push(current);
          current = "";
        }
        current += char;
      }
    }
    lines.push(current);
    return lines;
  };
  const newPage = (title) => {
    group = title;
    page = doc.addPage([W, H]);
    pages.push(page);
    rect(0, 0, W, 5, C.teal);
    text("ValueIQ", M, 25, 19, bold);
    text("PRE-FUNDING ESTIMATE", M, 53, 7, regular, C.muted);
    rect(W - M - 147, 30, 147, 22, C.soft);
    text(
      meta.mode === "stub" ? "STUB · ENGINE SAMPLE" : "PRE-FUNDING ESTIMATE",
      W - M - 137,
      36,
      8,
      bold,
      C.teal,
    );
    line(M, 76, W - M, 76);
    y = 98;
  };
  const ensure = (height) => {
    if (y + height > BOTTOM) newPage(group);
  };
  const para = (value, size = 9, color = C.ink) => {
    const lines = wrap(value, CW, size);
    ensure(lines.length * 14 + 10);
    mark("paragraph", y, lines.length * 14);
    lines.forEach((s, i) => text(s, M, y + i * 14, size, regular, color));
    y += lines.length * 14 + 12;
  };
  const section = (n, title, subtitle = "", keep = 65) => {
    const lines = wrap(title, CW - 34, 16, bold),
      subs = subtitle ? wrap(subtitle, CW - 34, 8.5) : [];
    const height = lines.length * 22 + subs.length * 13 + 16;
    ensure(height + keep);
    mark("section", y, height);
    rect(M, y + 1, 23, 23, C.soft);
    text(String(n).padStart(2, "0"), M + 5, y + 6, 8, bold, C.teal);
    lines.forEach((s, i) => text(s, M + 34, y + i * 22, 16, bold));
    subs.forEach((s, i) =>
      text(
        s,
        M + 34,
        y + lines.length * 22 + 2 + i * 13,
        8.5,
        regular,
        C.muted,
      ),
    );
    y += height;
  };
  const note = (title, value) => {
    const lines = wrap(value, CW - 26, 8.5);
    const height = 35 + lines.length * 13;
    ensure(height + 12);
    mark("note", y, height);
    rect(M, y, CW, height, C.soft);
    text(title, M + 13, y + 10, 9, bold, C.teal);
    lines.forEach((s, i) => text(s, M + 13, y + 28 + i * 13, 8.5));
    y += height + 16;
  };
  const table = (headers, widths, rows, title = "") => {
    const fs = 7.8,
      pad = 7,
      lh = 11.5;
    const prepared = (row, font = regular) =>
      row.map((s, i) => wrap(s, CW * widths[i] - 2 * pad, fs, font));
    const header = prepared(headers, bold),
      hh = Math.max(...header.map((c) => c.length)) * lh + 2 * pad;
    const draw = (cells, height, isHeader, index) => {
      mark(isHeader ? "table-header" : "table-row", y, height);
      rect(
        M,
        y,
        CW,
        height,
        isHeader ? C.soft : index % 2 === 0 ? C.pale : C.white,
      );
      let x = M;
      cells.forEach((lines, i) => {
        lines.forEach((s, j) =>
          text(
            s,
            x + pad,
            y + pad + j * lh,
            fs,
            isHeader ? bold : regular,
            isHeader ? C.teal : C.ink,
          ),
        );
        x += CW * widths[i];
      });
      line(M, y + height, W - M, y + height);
      y += height;
    };
    const first = rows[0]
      ? Math.max(...prepared(rows[0]).map((c) => c.length)) * lh + 2 * pad
      : 0;
    ensure(hh + first + (title ? 24 : 0));
    if (title) {
      text(title, M, y, 10, bold);
      y += 24;
    }
    draw(header, hh, true, 0);
    rows.forEach((row, i) => {
      const cells = prepared(row),
        height = Math.max(...cells.map((c) => c.length)) * lh + 2 * pad;
      if (height > BOTTOM - 150 - hh) throw new Error("Row too tall");
      if (y + height > BOTTOM) {
        newPage(group);
        text(`${title || group} · continued`, M, y, 11, bold);
        y += 27;
        draw(header, hh, true, 0);
      }
      draw(cells, height, false, i);
    });
    y += 17;
  };
  const money = (n) =>
    n === null
      ? "Not available"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: meta.currency,
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);
  const pct = (n) =>
    n === null
      ? "Not available"
      : `${new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`;
  const ratio = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "percent",
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(n);
  const ratioWhole = (n) =>
    new Intl.NumberFormat("en-US", {
      style: "percent",
      maximumFractionDigits: 0,
    }).format(n);
  const label = (s) =>
    ({
      hard_savings: "Hard savings",
      capacity_value: "Capacity value",
      avoided_loss: "Expected avoided loss",
      time_savings: "Time savings",
      data_quality: "Data quality",
      risk_reduction: "Risk reduction",
      decision_speed: "Decision speed",
    })[s] ?? s;
  const tiers = (counts) =>
    Object.entries(counts)
      .map(([tier, n]) => `${n} ${tier}`)
      .join(" · ");
  const confidenceSummary = (value, counts) => {
    const evidence = Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([level, count]) => `${count} ${level}`)
      .join(", ");
    return `Confidence ${ratioWhole(value)}, based on ${evidence || "the documented evidence"} inputs.`;
  };
  const bars = (title, points) => {
    const height = 72 + points.length * 47;
    ensure(height + 12);
    mark("chart", y, height);
    const top = y;
    rect(M, top, CW, height, C.pale);
    text(title, M + 14, top + 13, 11, bold);
    const max = Math.max(1, ...points.map((p) => p.value));
    points.forEach((p, i) => {
      const yy = top + 43 + i * 47;
      text(p.label, M + 14, yy, 8.5);
      right(money(p.value), W - M - 14, yy, 8.5, bold);
      rect(M + 14, yy + 18, CW - 28, 7, C.rule);
      rect(M + 14, yy + 18, (p.value / max) * (CW - 28), 7, C.blue);
    });
    y += height + 18;
  };

  newPage("Executive summary");
  text("THE VALUE, WITH ITS EVIDENCE.", M, y, 10, bold, C.teal);
  y += 28;
  text(
    meta.mode === "stub" ? "Sample engine report" : "Project value report",
    M,
    y,
    26,
    bold,
  );
  y += 44;
  section(
    1,
    "Executive summary",
    `${meta.horizon_years} years · ${meta.currency} · discount rate ${pct(meta.discount_rate_pct)}`,
  );
  table(
    ["Measure", "Hard savings", "Capacity-inclusive"],
    [0.4, 0.28, 0.32],
    [
      [
        "Net present value",
        money(result.headline.npv.hard),
        money(result.headline.npv.capacity_inclusive),
      ],
      [
        "ROI · undiscounted",
        pct(result.headline.roi.undiscounted.hard),
        pct(result.headline.roi.undiscounted.capacity_inclusive),
      ],
      [
        "ROI · NPV / PV of costs",
        pct(result.headline.roi.pv.hard),
        pct(result.headline.roi.pv.capacity_inclusive),
      ],
      [
        "Payback",
        result.headline.payback.hard.text,
        result.headline.payback.capacity_inclusive.text,
      ],
      [
        "Benefits · present value",
        "All included drivers",
        money(result.headline.benefits_pv),
      ],
      [
        "Costs · present value",
        "All cost lines",
        money(result.headline.costs_pv),
      ],
    ],
  );
  note(
    confidenceSummary(result.confidence.project.confidence, meta.tier_counts),
    `${result.confidence.band_note} Minimum confidence required: ${ratio(result.confidence.project.floor)}. ${result.confidence.project.capped_by ? `Capped by ${label(result.confidence.project.capped_by)}.` : ""}`,
  );
  para(result.narrative.summary);
  note(
    meta.mode === "stub"
      ? "STUB · sample assessment data"
      : "Pre-funding estimate",
    "This report renders the stored engine output for the recorded run. The exporter formats supplied values and does not recompute financial metrics. Refer to the recorded evidence before making a funding decision.",
  );

  newPage("Context and benefits");
  section(2, "Context and assumptions");
  para(
    `Run ${meta.run_id}. Expected scenario. Generated ${meta.generated_at}. Contract ${meta.contract_version}; formula ${meta.formula_version}; settings ${meta.settings_version}.`,
  );
  const inputs = result.drivers.flatMap((driver) =>
    driver.steps.flatMap((step) =>
      step.inputs.map((input) => [
        input.id,
        input.label,
        String(input.value),
        step.ref,
      ]),
    ),
  );
  if (inputs.length)
    table(
      ["Input", "Label", "Value", "Step"],
      [0.28, 0.34, 0.25, 0.13],
      inputs,
    );
  else
    note(
      "Input snapshot not supplied",
      "The stored step input arrays are empty. Source formulas and source types are preserved below; missing entered inputs and project context have not been invented.",
    );
  table(
    ["Accepted proxy", "Value", "Source / tier"],
    [0.26, 0.14, 0.6],
    result.proxies_used.map((p) => [
      inputLabel(p.input_id),
      String(p.value),
      `${p.source} · ${p.tier}`,
    ]),
  );
  section(3, "Benefits by driver", "Adjusted values over the selected horizon");
  table(
    ["Driver / class", "Haircut", "Confidence", "Total", "PV"],
    [0.34, 0.12, 0.14, 0.2, 0.2],
    result.drivers.map((d) => [
      `${d.label} · ${label(d.label_class)} · ${d.included ? "included" : "excluded"}`,
      pct(d.haircut_pct),
      ratio(d.confidence),
      money(d.total),
      money(d.pv),
    ]),
  );
  bars(
    "Driver contribution · horizon totals",
    result.charts.driver_contribution.map((p) => ({
      label: result.drivers.find((d) => d.id === p.driver)?.label ?? p.driver,
      value: p.value,
    })),
  );

  for (const driver of result.drivers) {
    newPage(driver.label);
    section(
      3,
      `${driver.label} · show the math`,
      `${label(driver.label_class)} · haircut ${pct(driver.haircut_pct)} · confidence ${ratio(driver.confidence)}`,
    );
    para(tiers(driver.tier_counts), 8.5, C.muted);
    table(
      [
        "Ref",
        "Step / formula / source",
        ...driver.annual.map((a) => `Year ${a.year}`),
        "Horizon total",
      ],
      [0.07, 0.33, 0.15, 0.15, 0.15, 0.15],
      driver.steps.map((s) => [
        s.ref,
        `${s.order}. ${s.label}\n${s.formula}\nSource: ${s.source_type}; tier: ${s.evidence_tier ?? "calculated"}`,
        ...s.by_year.map(money),
        money(s.value),
      ]),
    );
    note("What makes this vary", driver.risk_factors.join(" "));
    para(
      `How measured: ${specified(driver.measured_by) ? driver.measured_by : "Measurement method to confirm"}`,
    );
    const narrative = result.narrative.by_driver[driver.id];
    if (narrative) para(narrative);
  }
  newPage("Costs and unquantified benefits");
  section(
    4,
    "Costs and uplift",
    `PV ${money(result.costs.total_pv)} · delay ${result.costs.delay_months} months`,
  );
  table(
    ["Ref / cost", "Basis", "Base", "Uplift", "Adjusted"],
    [0.38, 0.13, 0.18, 0.12, 0.19],
    result.costs.lines.map((c) => [
      `${c.ref} · ${c.label}`,
      c.basis,
      money(c.base),
      pct(c.uplift_pct),
      money(c.adjusted),
    ]),
  );
  section(5, "Unquantified benefits and flexibility");
  table(
    ["Benefit", "Reason", "What to add"],
    [0.2, 0.35, 0.45],
    result.unquantified.map((u) => [label(u.target), u.reason, u.raise_with]),
  );
  result.flexibility.forEach((s) => para(s));

  newPage("Financial summary");
  section(
    6,
    "Financial summary",
    "Undiscounted flows; net and cumulative are capacity-inclusive.",
  );
  table(
    [
      "Period",
      "Hard benefit",
      "Capacity / avoided loss",
      "Cost",
      "Net inclusive",
      "Cumulative inclusive",
    ],
    [0.1, 0.17, 0.2, 0.17, 0.18, 0.18],
    result.cash_flows.map((c) => [
      c.year === 0 ? "Time zero" : `Year ${c.year}`,
      money(c.benefits_hard),
      money(c.benefits_capacity),
      money(c.costs),
      money(c.net),
      money(c.cumulative),
    ]),
  );
  note(
    "Financial basis",
    "Capacity value and expected avoided loss are distinct from documented hard savings. The net and cumulative figures include these benefits; they do not establish a cash reduction.",
  );
  bars("Adjustment stages · supplied horizon levels", result.charts.waterfall);

  newPage("Scenarios and sensitivity");
  section(7, "Scenarios and sensitivity");
  table(
    [
      "Scenario / assumptions",
      "NPV hard",
      "NPV inclusive",
      "ROI · PV-based inclusive",
    ],
    [0.4, 0.2, 0.21, 0.19],
    Object.entries(result.scenarios).map(([name, s]) => [
      `${name}: ${s.what_moved}`,
      money(s.npv_hard),
      money(s.npv_capacity_inclusive),
      pct(s.roi_pv_capacity_inclusive),
    ]),
  );
  const points = result.charts.sensitivity.filter(
    (point) => point.npv_hard !== null && point.npv_capacity_inclusive !== null,
  );
  const height = 220;
  ensure(height + 14);
  mark("chart", y, height);
  const top = y;
  rect(M, top, CW, height, C.pale);
  text("NPV sensitivity · discount rate", M + 14, top + 13, 11, bold);
  text(
    "Teal: hard savings · blue: capacity-inclusive",
    M + 14,
    top + 33,
    8,
    regular,
    C.muted,
  );
  const lo = Math.min(0, ...points.map((p) => p.npv_hard)),
    hi = Math.max(1, ...points.map((p) => p.npv_capacity_inclusive));
  const px = (i) => M + 90 + (i * (CW - 125)) / (points.length - 1 || 1),
    py = (v) => top + 176 - ((v - lo) / (hi - lo)) * 114;
  line(M + 90, py(0), W - M - 25, py(0));
  for (const [key, color] of [
    ["npv_hard", C.teal],
    ["npv_capacity_inclusive", C.blue],
  ])
    points.forEach((p, i) => {
      if (i)
        line(px(i - 1), py(points[i - 1][key]), px(i), py(p[key]), color, 2);
      page.drawCircle({ x: px(i), y: H - py(p[key]), size: 2.8, color });
    });
  [lo, 0, hi].forEach((v) =>
    right(money(v), M + 82, py(v) - 4, 7.5, regular, C.muted),
  );
  points.forEach((p, i) =>
    text(String(p.x), px(i) - 5, top + 189, 8, regular, C.muted),
  );
  y += height + 17;
  table(
    [
      result.sensitivity.x_labels.discount_rate,
      "NPV hard",
      "NPV capacity-inclusive",
    ],
    [0.25, 0.35, 0.4],
    result.charts.sensitivity.map((p) => [
      String(p.x),
      money(p.npv_hard),
      money(p.npv_capacity_inclusive),
    ]),
  );

  newPage("Risks and measurement");
  section(8, "Risks of doing nothing vs proceeding");
  table(
    ["Decision", "Risks"],
    [0.22, 0.78],
    [
      ...result.doing_nothing_risks.map((s) => ["Doing nothing", s]),
      ...result.proceeding_risks.map((s) => ["Proceeding", s]),
    ],
  );
  section(9, "Measurement plan");
  table(
    ["Driver / metric", "Baseline / source", "Owner", "Frequency"],
    [0.35, 0.35, 0.17, 0.13],
    Object.entries(result.measurement_plan).map(([id, p]) => [
      `${result.drivers.find((d) => d.id === id)?.label ?? id}: ${specified(p.metric) ? p.metric : "Measurement details to confirm"}`,
      specified(p.baseline)
        ? `${p.baseline}${specified(p.baseline_source) ? `; ${p.baseline_source}` : ""}`
        : "",
      specified(p.owner) ? p.owner : "",
      specified(p.frequency) ? p.frequency : "",
    ]),
  );

  newPage("Appendix and audit trail");
  section(10, "Appendix and audit trail");
  table(
    ["Field", "Recorded value"],
    [0.28, 0.72],
    [
      ["Run", meta.run_id],
      ["Mode", meta.mode],
      ["Contract", meta.contract_version],
      ["Formula", meta.formula_version],
      ["Settings", meta.settings_version],
      ["Generated", meta.generated_at],
      ["Evidence tiers", tiers(meta.tier_counts)],
      [
        "Narrative references",
        "References such as A4, B3 and D1–D3 refer to the step and cost tables in this report.",
      ],
    ],
  );
  table(
    ["Engine integrity check", "Status"],
    [0.75, 0.25],
    result.confidence.integrity.checks.map((c) => [
      c.name,
      c.passed ? "Passed" : "Not passed",
    ]),
  );
  if (result.warnings.length)
    result.warnings.forEach((w) => para(`${w.code}: ${w.message}`));
  else para("No engine warnings were recorded.", 8.5, C.muted);
  if (result.overrides.length)
    result.overrides.forEach((o) =>
      para(
        `${o.path}: computed ${money(o.computed_value)}; override ${money(o.override_value)}; ${o.reason}; ${o.author}; ${o.at}`,
      ),
    );
  else para("No overrides were recorded.", 8.5, C.muted);
  pages.forEach((p, i) => {
    page = p;
    line(M, H - 50, W - M, H - 50);
    text(
      meta.mode === "stub"
        ? "STUB · SAMPLE ENGINE OUTPUT · NOT A LIVE ASSESSMENT"
        : "PRE-FUNDING ESTIMATE · RECORDED ENGINE OUTPUT",
      M,
      H - 43,
      6.5,
      regular,
      C.muted,
    );
    text(
      `${meta.run_id} · engine-sample-template-1`,
      M,
      H - 30,
      6.5,
      regular,
      C.muted,
    );
    right(`${i + 1} / ${pages.length}`, W - M, H - 37, 8, bold, C.muted);
  });
  return { bytes: await doc.save(), pages: pages.length, layout };
}
export const renderEngineSample = renderEngineReport;
