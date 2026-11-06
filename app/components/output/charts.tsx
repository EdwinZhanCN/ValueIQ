import { useId } from "react";
import {
  confidence,
  labels,
  money,
  type ResultSample,
  type SensitivityPoint,
} from "./samples";

export function Chart({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="output-card output-chart">
      <h3>{title}</h3>
      <p className="output-muted">{description}</p>
      {children}
    </section>
  );
}

export function AdjustmentChart({
  result,
  currency = "USD",
}: {
  currency?: string;
  result: ResultSample["result"];
}) {
  const points = result.charts.waterfall;
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <Chart
      title="Value through each adjustment"
      description="Ordered levels supplied by the engine · undiscounted benefit over the selected horizon"
    >
      <div className="output-levels">
        {points.map((point) => (
          <div key={point.label}>
            <div>
              <span>{point.label}</span>
              <strong>{money(point.value, currency)}</strong>
            </div>
            <div className="output-bar-track">
              <div
                className="output-bar"
                style={{ width: `${(point.value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="output-caption">
        These are successive levels. Floating reduction bars require start/end
        values from the engine.
      </p>
    </Chart>
  );
}

export function ContributionChart({
  result,
  currency = "USD",
}: {
  currency?: string;
  result: ResultSample["result"];
}) {
  const points = result.charts.driver_contribution;
  const max = Math.max(1, ...points.map((point) => point.value));
  return (
    <Chart
      title="Benefits by driver"
      description="Adjusted, undiscounted benefit · classifications remain separate"
    >
      <div className="output-levels">
        {points.map((point) => {
          const driver = result.drivers.find(
            (driver) => driver.id === point.driver,
          );
          return (
            <div key={point.driver}>
              <div>
                <span>
                  {driver?.label ?? point.driver}
                  <small>{labels[driver?.label_class ?? ""]}</small>
                </span>
                <strong>
                  {money(point.value, currency)}
                  <small>
                    {driver ? confidence(driver.share_of_benefit) : ""} of
                    benefit
                  </small>
                </strong>
              </div>
              <div className="output-bar-track">
                <div
                  className={`output-bar output-bar-${driver?.label_class ?? "capacity_value"}`}
                  style={{ width: `${(point.value / max) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Chart>
  );
}

export function SensitivityChart({
  points,
  axisLabel,
  currency = "USD",
}: {
  currency?: string;
  points: SensitivityPoint[];
  axisLabel: string;
}) {
  const id = useId();
  const valid = points.flatMap((point) =>
    point.npv_hard === null || point.npv_capacity_inclusive === null
      ? []
      : [
          {
            ...point,
            npv_hard: point.npv_hard,
            npv_capacity_inclusive: point.npv_capacity_inclusive,
          },
        ],
  );
  const values = valid.flatMap((point) => [
    point.npv_hard,
    point.npv_capacity_inclusive,
  ]);
  const min = Math.min(0, ...values),
    max = Math.max(1, ...values);
  const xs = valid.map((point) => point.x),
    xmin = Math.min(...xs),
    xmax = Math.max(...xs);
  const x = (value: number) =>
    100 + ((value - xmin) / (xmax - xmin || 1)) * 620;
  const y = (value: number) => 235 - ((value - min) / (max - min)) * 190;
  return (
    <Chart title="NPV sensitivity" description={axisLabel}>
      <svg
        viewBox="0 0 780 290"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className="output-line-chart"
      >
        <title id={`${id}-title`}>Hard and capacity-inclusive NPV</title>
        <desc id={`${id}-desc`}>
          Two series from the supplied engine sensitivity data. Exact values are
          in the table below.
        </desc>
        {[min, 0, max].map((tick, index) => (
          <g key={index}>
            <line
              x1="100"
              x2="730"
              y1={y(tick)}
              y2={y(tick)}
              className="output-grid-line"
            />
            <text x="90" y={y(tick) + 4} textAnchor="end">
              {money(tick, currency)}
            </text>
          </g>
        ))}
        {(["npv_hard", "npv_capacity_inclusive"] as const).map((key) => (
          <g
            key={key}
            className={
              key === "npv_hard"
                ? "output-series-hard"
                : "output-series-capacity"
            }
          >
            <polyline
              fill="none"
              strokeWidth="3"
              points={valid
                .map((point) => `${x(point.x)},${y(point[key])}`)
                .join(" ")}
            />
            {valid.map((point) => (
              <circle key={point.x} cx={x(point.x)} cy={y(point[key])} r="4">
                <title>{`${axisLabel}: ${point.x}; ${key === "npv_hard" ? "Hard" : "Capacity-inclusive"} NPV: ${money(point[key], currency)}`}</title>
              </circle>
            ))}
          </g>
        ))}
        {valid.map((point) => (
          <text key={point.x} x={x(point.x)} y="263" textAnchor="middle">
            {point.x}
          </text>
        ))}
      </svg>
      <div className="output-legend">
        <span>
          <i className="output-dot-hard" />
          Hard savings
        </span>
        <span>
          <i className="output-dot-capacity" />
          Capacity-inclusive
        </span>
      </div>
      <div className="output-table-wrap">
        <table>
          <caption className="sr-only">Exact sensitivity values</caption>
          <thead>
            <tr>
              <th>{axisLabel}</th>
              <th>NPV · hard</th>
              <th>NPV · capacity-inclusive</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.x}>
                <td>{point.x}</td>
                <td>{money(point.npv_hard, currency)}</td>
                <td>{money(point.npv_capacity_inclusive, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Chart>
  );
}
