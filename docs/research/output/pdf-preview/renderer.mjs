/** Research-only PDF layout. This is not the engine's RunOutput contract.
 * Libraries/fonts are injected so the preview adds no application dependency.
 * All financial values and labels are supplied; arithmetic below is geometry.
 */
export async function renderPreview({
  PDFDocument,
  rgb,
  fontkit,
  fonts,
  data,
  stress = false,
}) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fonts.regular, { subset: true });
  const bold = await doc.embedFont(fonts.bold, { subset: true });
  const supported = new Map([
    [regular, new Set(regular.getCharacterSet())],
    [bold, new Set(bold.getCharacterSet())],
  ]);
  doc.setTitle(`${data.subtitle} · ${data.title} · STUB`);
  doc.setAuthor("ValueIQ · layout preview");
  const color = (hex) =>
    rgb(...hex.match(/\w\w/g).map((n) => parseInt(n, 16) / 255));
  const C = {
    ink: color("182F38"),
    muted: color("60717A"),
    teal: color("087E72"),
    blue: color("4168B7"),
    orange: color("B56C35"),
    rule: color("DDE5E8"),
    pale: color("F4F7F8"),
    soft: color("EBF5F2"),
    white: rgb(1, 1, 1),
  };
  const W = 595.28,
    H = 841.89,
    M = 44,
    CW = W - M * 2,
    BOTTOM = H - 70;
  const pages = [];
  const layout = [];
  let page, y, group;
  const text = (value, x, top, size = 10, font = regular, fill = C.ink) => {
    for (const character of String(value)) {
      if (!supported.get(font).has(character.codePointAt(0))) {
        throw new Error(
          `The selected font cannot render ${JSON.stringify(character)}`,
        );
      }
    }
    page.drawText(String(value), {
      x,
      y: H - top - size,
      size,
      font,
      color: fill,
    });
  };
  const right = (value, x, top, size = 10, font = regular, fill = C.ink) =>
    text(
      value,
      x - font.widthOfTextAtSize(String(value), size),
      top,
      size,
      font,
      fill,
    );
  const rect = (x, top, width, height, fill, border) => {
    page.drawRectangle({
      x,
      y: H - top - height,
      width,
      height,
      ...(fill ? { color: fill } : {}),
      ...(border ? { borderColor: border, borderWidth: 0.6 } : {}),
    });
  };
  const line = (x1, t1, x2, t2, fill = C.rule, thickness = 0.6) =>
    page.drawLine({
      start: { x: x1, y: H - t1 },
      end: { x: x2, y: H - t2 },
      color: fill,
      thickness,
    });
  const mark = (kind, top, height) => {
    if (top < 90 || top + height > BOTTOM + 0.1)
      throw new Error(`Layout overflow: ${kind} on page ${pages.length}`);
    layout.push({ page: pages.length, kind, top, bottom: top + height });
  };
  const wrap = (value, width, size = 10, font = regular) => {
    const out = [];
    for (const paragraph of String(value).split("\n")) {
      let current = "";
      for (const word of paragraph.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          current = candidate;
          continue;
        }
        if (current) out.push(current);
        current = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(current + char, size) > width) {
            out.push(current);
            current = "";
          }
          current += char;
        }
      }
      out.push(current);
    }
    return out;
  };
  const newPage = (title) => {
    group = title;
    page = doc.addPage([W, H]);
    pages.push(page);
    rect(0, 0, W, 5, C.teal);
    text("ValueIQ", M, 26, 19, bold);
    text("PRE-FUNDING BUSINESS CASE", M, 54, 7.5, regular, C.muted);
    rect(W - M - 146, 29, 146, 23, C.soft);
    text("STUB · LAYOUT PREVIEW", W - M - 136, 35, 8, bold, C.teal);
    line(M, 77, W - M, 77);
    y = 98;
  };
  const ensure = (height) => {
    if (y + height > BOTTOM) newPage(group);
  };
  const paragraph = (value, options = {}) => {
    const size = options.size ?? 10;
    const leading = size * 1.5;
    const lines = wrap(
      value,
      options.width ?? CW,
      size,
      options.bold ? bold : regular,
    );
    if (lines.length * leading < 180) ensure(lines.length * leading + 10);
    for (const value of lines) {
      ensure(leading);
      mark("paragraph", y, leading);
      text(
        value,
        M,
        y,
        size,
        options.bold ? bold : regular,
        options.muted ? C.muted : C.ink,
      );
      y += leading;
    }
    y += 10;
  };
  const section = (number, title, subtitle = "", keep = 70) => {
    const titleLines = wrap(title, CW - 35, 17, bold);
    const subLines = subtitle ? wrap(subtitle, CW - 35, 9) : [];
    const height = titleLines.length * 23 + subLines.length * 14 + 15;
    ensure(height + keep);
    mark("section", y, height);
    rect(M, y + 1, 23, 23, C.soft);
    text(String(number).padStart(2, "0"), M + 5, y + 6, 8, bold, C.teal);
    titleLines.forEach((s, i) => text(s, M + 35, y + i * 23, 17, bold));
    subLines.forEach((s, i) =>
      text(
        s,
        M + 35,
        y + titleLines.length * 23 + i * 14 + 2,
        9,
        regular,
        C.muted,
      ),
    );
    y += height;
  };
  const note = (title, value) => {
    const lines = wrap(value, CW - 28, 9);
    const height = 33 + lines.length * 14;
    ensure(height + 12);
    mark("note", y, height);
    rect(M, y, CW, height, C.soft);
    rect(M, y, 3, height, C.teal);
    text(title, M + 14, y + 10, 9, bold, C.teal);
    lines.forEach((s, i) => text(s, M + 14, y + 27 + i * 14, 9));
    y += height + 15;
  };
  const table = (columns, rows, title = "") => {
    const pad = 9,
      fs = 8.5,
      leading = 12.5;
    const widths = columns.map((c) => c.width * CW);
    const cells = (row, header = false) =>
      row.map((v, i) =>
        wrap(v, widths[i] - pad * 2, fs, header ? bold : regular),
      );
    const header = cells(
      columns.map((c) => c.label),
      true,
    );
    const hh = Math.max(...header.map((a) => a.length)) * leading + pad * 2;
    const draw = (row, prepared, height, isHeader, index) => {
      mark(isHeader ? "table-header" : "table-row", y, height);
      rect(
        M,
        y,
        CW,
        height,
        isHeader ? C.soft : index % 2 === 0 ? C.pale : C.white,
      );
      let x = M;
      prepared.forEach((lines, i) => {
        lines.forEach((value, j) => {
          const f = isHeader ? bold : regular;
          const fill = isHeader ? C.teal : C.ink;
          if (columns[i].right)
            right(
              value,
              x + widths[i] - pad,
              y + pad + j * leading,
              fs,
              f,
              fill,
            );
          else text(value, x + pad, y + pad + j * leading, fs, f, fill);
        });
        x += widths[i];
      });
      line(M, y + height, W - M, y + height);
      y += height;
    };
    const first = rows.length
      ? Math.max(...cells(rows[0]).map((a) => a.length)) * leading + pad * 2
      : 0;
    ensure(hh + first + (title ? 25 : 0));
    if (title) {
      text(title, M, y, 10, bold);
      y += 25;
    }
    draw(null, header, hh, true, 0);
    rows.forEach((row, index) => {
      const prepared = cells(row);
      const height =
        Math.max(...prepared.map((a) => a.length)) * leading + pad * 2;
      if (height > BOTTOM - 150 - hh)
        throw new Error("Table row too tall for a page");
      if (y + height > BOTTOM) {
        newPage(group);
        text(`${title || group} · continued`, M, y, 11, bold);
        y += 27;
        draw(null, header, hh, true, 0);
      }
      draw(row, prepared, height, false, index);
    });
    y += 17;
  };
  const chart = (title, subtitle, height, draw) => {
    ensure(height + 12);
    mark("chart", y, height);
    const top = y;
    rect(M, top, CW, height, C.white, C.rule);
    text(title, M + 16, top + 13, 11, bold);
    text(subtitle, M + 16, top + 32, 8, regular, C.muted);
    draw({ x: M + 16, top: top + 58, width: CW - 32, height: height - 86 });
    y = top + height + 17;
  };
  const key = (x, top, label, fill) => {
    rect(x, top + 2, 7, 7, fill);
    text(label, x + 12, top, 7.5, regular, C.muted);
  };
  const moneyColumn = (label, width) => ({ label, width, right: true });

  newPage("Executive summary");
  text(data.subtitle.toUpperCase(), M, y, 9, bold, C.teal);
  y += 24;
  for (const s of wrap(data.title, CW, 27, bold)) {
    text(s, M, y, 27, bold);
    y += 35;
  }
  text(
    `Prepared for layout review · ${data.date}`,
    M,
    y + 2,
    9,
    regular,
    C.muted,
  );
  y += 34;
  section(
    1,
    "Executive summary",
    "Hard savings and capacity value remain separate.",
    210,
  );
  const cardW = (CW - 14) / 2;
  data.cards.forEach((card, i) => {
    const x = M + (i % 2) * (cardW + 14),
      top = y + Math.floor(i / 2) * 98;
    const fill =
      C[
        card.tone === "capacity"
          ? "blue"
          : card.tone === "cost"
            ? "orange"
            : "teal"
      ];
    mark("metric-card", top, 86);
    rect(x, top, cardW, 86, C.pale);
    rect(x, top, 3, 86, fill);
    text(card.label, x + 13, top + 11, 8.5, bold, C.muted);
    text(card.value, x + 13, top + 29, 22, bold, fill);
    text(card.note, x + 13, top + 64, 7.4, regular, C.muted);
  });
  y += 201;
  paragraph(data.summary, { size: 10 });
  table(
    [
      { label: "Metric", width: 0.4 },
      { label: "Hard savings", width: 0.28, right: true },
      { label: "Capacity-inclusive", width: 0.32, right: true },
    ],
    data.metrics,
  );
  note("Evidence status · not evaluated", data.notice);

  newPage("Context and benefits");
  section(
    2,
    "Context and assumptions",
    "One-year horizon · USD · discount rate 10.0%",
  );
  paragraph(
    "The proposed workflow reduces time spent on administration and onboarding. All inputs below belong to this synthetic layout fixture; no project evidence has been attached.",
  );
  table(
    [
      { label: "Ref", width: 0.09 },
      { label: "Input", width: 0.36 },
      { label: "Entered value", width: 0.25, right: true },
      { label: "Source", width: 0.3 },
    ],
    data.inputs,
  );
  section(3, "Benefits by driver", "Annual adjusted value · capacity only");
  table(
    [
      { label: "Ref", width: 0.09 },
      { label: "Driver", width: 0.36 },
      { label: "Classification", width: 0.28 },
      moneyColumn("Year 1", 0.27),
    ],
    data.benefits,
  );
  note(
    "Confidence and backing",
    "No tier counts or confidence score are asserted in this preview. A production report must display the engine's backing summary and confidence alongside these values.",
  );
  paragraph(
    "Benefit risks: adoption may take longer than planned, and freed time may not be redeployed. Time capacity must not be described as a budget reduction.",
    { muted: true },
  );

  newPage("Benefit adjustments");
  section(
    3,
    "Benefit adjustments",
    "Ordered steps · supplied values · annual capacity in USD",
  );
  chart(
    "Waterfall · gross to adjusted value",
    "Blue = total capacity value · amber = reduction",
    220,
    ({ x, top, width, height }) => {
      const left = x + 43,
        pw = width - 53,
        base = top + height - 20,
        ph = height - 25;
      const py = (v) => base - (v / data.waterfall.max) * ph;
      data.waterfall.ticks.forEach((t) => {
        line(left, py(t.value), left + pw, py(t.value));
        right(t.label, left - 7, py(t.value) - 4, 7.5, regular, C.muted);
      });
      const slot = pw / data.waterfall.bars.length;
      data.waterfall.bars.forEach((b, i) => {
        const bx = left + i * slot + 12,
          bw = slot - 24;
        const bt = py(Math.max(b.start, b.end)),
          bh = Math.abs(py(b.start) - py(b.end));
        rect(
          bx,
          bt,
          bw,
          Math.max(bh, 1),
          b.kind === "total" ? C.blue : C.orange,
        );
        if (i < data.waterfall.bars.length - 1)
          line(
            bx + bw,
            py(b.end),
            left + (i + 1) * slot + 12,
            py(b.end),
            C.muted,
          );
        const labelWidth = regular.widthOfTextAtSize(b.display, 7.5);
        text(b.display, bx + bw / 2 - labelWidth / 2, bt - 14, 7.5, bold);
        const lw = regular.widthOfTextAtSize(b.label, 7.5);
        text(b.label, bx + bw / 2 - lw / 2, base + 8, 7.5, regular, C.muted);
      });
    },
  );
  table(
    [
      { label: "Ref", width: 0.09 },
      { label: "Step", width: 0.23 },
      { label: "Formula / basis", width: 0.41 },
      moneyColumn("Output", 0.27),
    ],
    data.steps,
  );
  chart(
    "Driver contribution",
    "Year 1 · adjusted capacity value · total $20,000.00",
    157,
    ({ x, top, width }) => {
      data.contribution.forEach((b, i) => {
        const yy = top + i * 40;
        text(b.label, x, yy, 9);
        rect(x + 145, yy + 1, width - 243, 13, C.pale);
        rect(
          x + 145,
          yy + 1,
          (b.value / data.contributionTotal) * (width - 243),
          13,
          C.blue,
        );
        right(b.display, x + width, yy - 1, 9, bold, C.blue);
      });
    },
  );

  newPage("Costs and cash flow");
  section(
    4,
    "Costs",
    "Cost uplift is shown explicitly; figures are supplied by the fixture.",
  );
  table(
    [
      { label: "Ref", width: 0.08 },
      { label: "Cost line", width: 0.23 },
      { label: "Timing", width: 0.15 },
      moneyColumn("Base", 0.19),
      moneyColumn("Uplift", 0.14),
      moneyColumn("Adjusted", 0.21),
    ],
    data.costs,
  );
  section(5, "Unquantified benefits and flexibility");
  table(
    [
      { label: "Benefit", width: 0.3 },
      { label: "Treatment", width: 0.23 },
      { label: "What to add", width: 0.47 },
    ],
    data.unquantified,
  );
  note(
    "Cost evidence and timing",
    "The implementation line illustrates an uplift applied to an initial estimate. Both the base and adjusted amounts are supplied by the fixture. A real report must retain each cost's evidence, timing and source reference.",
  );
  paragraph(
    "Unquantified benefits and flexibility are retained for discussion and measurement planning. Neither is silently assigned a dollar value or added to the financial headline.",
    { muted: true },
  );
  newPage("Financial summary");
  section(
    6,
    "Financial summary",
    "Undiscounted cash flow · capacity is shown separately from cash savings.",
  );
  chart(
    "Cash-flow profile",
    "USD · costs appear below zero",
    260,
    ({ x, top, width, height }) => {
      const left = x + 44,
        pw = width - 55,
        ph = height - 31,
        baseTop = top + 2;
      const py = (v) =>
        baseTop +
        ((data.cashFlow.max - v) / (data.cashFlow.max - data.cashFlow.min)) *
          ph;
      data.cashFlow.ticks.forEach((t) => {
        line(left, py(t.value), left + pw, py(t.value));
        right(t.label, left - 7, py(t.value) - 4, 7.5, regular, C.muted);
      });
      data.cashFlow.periods.forEach((p, i) => {
        const center = left + (pw * (i + 0.5)) / data.cashFlow.periods.length;
        [
          [p.hard, C.teal],
          [p.capacity, C.blue],
          [p.cost, C.orange],
        ].forEach(([value, fill], j) => {
          const ty = Math.min(py(0), py(value));
          rect(
            center - 38 + j * 27,
            ty,
            22,
            Math.max(1, Math.abs(py(value) - py(0))),
            fill,
          );
        });
        text(p.label, center - 24, baseTop + ph + 6, 8, regular, C.muted);
      });
      key(x, top + height + 4, "Hard savings", C.teal);
      key(x + 105, top + height + 4, "Capacity value", C.blue);
      key(x + 220, top + height + 4, "Costs", C.orange);
    },
  );
  table(
    [
      { label: "Period", width: 0.16 },
      moneyColumn("Hard benefit", 0.2),
      moneyColumn("Capacity", 0.21),
      moneyColumn("Cost", 0.2),
      moneyColumn("Net incl. capacity", 0.23),
    ],
    data.cashFlow.rows,
  );
  note(
    "Basis and discount rate",
    "Cash-flow bars show undiscounted period values. NPV uses the supplied 10.0% discount rate and one-year horizon. Capacity-inclusive metrics are distinct from documented cash savings.",
  );

  newPage("Scenarios and sensitivity");
  section(
    7,
    "Scenarios and sensitivity",
    "Illustrative scenarios vary adoption; the other fixture assumptions stay fixed.",
  );
  table(
    [
      { label: "Scenario", width: 0.24 },
      moneyColumn("Adoption", 0.15),
      moneyColumn("Annual capacity", 0.21),
      moneyColumn("NPV incl. capacity", 0.22),
      moneyColumn("PV ROI incl. capacity", 0.18),
    ],
    data.scenarios,
  );
  chart(
    "NPV across discount rates",
    "Blue = capacity-inclusive · teal = hard savings · one-year horizon",
    220,
    ({ x, top, width, height }) => {
      const left = x + 45,
        pw = width - 65,
        ph = height - 29;
      const py = (v) =>
        top +
        ((data.sensitivity.max - v) /
          (data.sensitivity.max - data.sensitivity.min)) *
          ph;
      const px = (i) => left + (i * pw) / (data.sensitivity.points.length - 1);
      data.sensitivity.ticks.forEach((t) => {
        line(left, py(t.value), left + pw, py(t.value));
        right(t.label, left - 7, py(t.value) - 4, 7.5, regular, C.muted);
      });
      for (const [series, fill] of [
        ["capacity", C.blue],
        ["hard", C.teal],
      ]) {
        data.sensitivity.points.forEach((p, i, all) => {
          if (i)
            line(
              px(i - 1),
              py(all[i - 1][series]),
              px(i),
              py(p[series]),
              fill,
              2,
            );
          page.drawCircle({
            x: px(i),
            y: H - py(p[series]),
            size: 3.2,
            color: fill,
          });
        });
      }
      data.sensitivity.points.forEach((p, i) =>
        text(p.rate, px(i) - 9, top + ph + 9, 8, regular, C.muted),
      );
    },
  );
  table(
    [
      { label: "Discount rate", width: 0.24 },
      moneyColumn("NPV · hard", 0.32),
      moneyColumn("NPV · capacity-inclusive", 0.44),
    ],
    data.sensitivity.points.map((p) => [p.rate, p.hardDisplay, p.display]),
  );

  newPage("Risks and measurement");
  section(8, "Risks of doing nothing vs proceeding");
  table(
    [
      { label: "Decision", width: 0.22 },
      { label: "Risk", width: 0.37 },
      { label: "Response / next step", width: 0.41 },
    ],
    data.risks,
  );
  section(
    9,
    "Measurement plan",
    "Baselines and owners remain visibly unspecified until evidence is supplied.",
  );
  table(
    [
      { label: "Driver", width: 0.2 },
      { label: "Baseline", width: 0.18 },
      { label: "How to measure", width: 0.32 },
      { label: "Owner", width: 0.15 },
      { label: "Frequency", width: 0.15 },
    ],
    data.measurement,
  );
  note(
    "Before a funding decision",
    "Assign a measurement owner, capture a baseline and confirm how released capacity will be used. A documented spending reduction is required before capacity can be classified as hard savings.",
  );

  newPage("Appendix and audit trail");
  section(
    10,
    "Appendix · formulas and audit trail",
    "References stay with their source values and definitions.",
  );
  const audit = stress
    ? [
        ...data.audit,
        ...Array.from({ length: 90 }, (_, i) => [
          `T${i + 1}`,
          "Pagination stress row",
          i === 40
            ? "A deliberately long explanation checks wrapping, repeated column headers and row boundaries. ".repeat(
                7,
              )
            : "Synthetic row for layout verification only; not assessment evidence.",
        ]),
      ]
    : data.audit;
  table(
    [
      { label: "Ref", width: 0.13 },
      { label: "Item", width: 0.28 },
      { label: "Definition / source", width: 0.59 },
    ],
    audit,
    "Reference ledger",
  );
  note("Report status", data.notice);

  pages.forEach((p, i) => {
    page = p;
    line(M, H - 51, W - M, H - 51);
    text(
      "ILLUSTRATIVE DATA · CONFIDENCE NOT EVALUATED",
      M,
      H - 44,
      6.6,
      regular,
      C.muted,
    );
    text(`${data.run} · uniform-preview-2`, M, H - 31, 6.6, regular, C.muted);
    right(
      `${String(i + 1).padStart(2, "0")} / ${String(pages.length).padStart(2, "0")}`,
      W - M,
      H - 37,
      8,
      bold,
      C.muted,
    );
  });
  return { bytes: await doc.save(), pages: pages.length, layout };
}
