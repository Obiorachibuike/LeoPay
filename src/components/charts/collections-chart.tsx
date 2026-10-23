import { formatMoney } from "@/lib/money";

type Point = { date: string; collectedMinor: number; successfulCount: number };

/**
 * Server-rendered SVG area chart. No client JavaScript, theme-aware through CSS
 * variables, with an accessible table alternative for screen readers.
 */
export function CollectionsChart({
  data,
  currency,
  height = 200,
}: {
  data: Point[];
  currency: string;
  height?: number;
}) {
  const width = 720;
  const padding = { top: 16, right: 8, bottom: 24, left: 8 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.collectedMinor), 1);
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const points = data.map((d, i) => ({
    x: padding.left + i * step,
    y: padding.top + innerH - (d.collectedMinor / max) * innerH,
    ...d,
  }));

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${(padding.left + innerW).toFixed(1)},${padding.top + innerH} L${padding.left},${padding.top + innerH} Z`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[200px] w-full"
        role="img"
        aria-label={`Collections over ${data.length} days, total ${formatMoney(
          data.reduce((s, d) => s + d.collectedMinor, 0),
          currency,
        )}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {gridLines.map((g) => {
          const y = padding.top + innerH * g;
          return (
            <line
              key={g}
              x1={padding.left}
              x2={padding.left + innerW}
              y1={y}
              y2={y}
              stroke="var(--border)"
              strokeWidth="1"
              strokeDasharray={g === 1 ? "0" : "3 5"}
            />
          );
        })}
        {data.length > 0 ? <path d={area} fill="url(#chartFill)" /> : null}
        {data.length > 0 ? (
          <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        ) : null}
        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={p.x}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              fontSize="10"
              fill="var(--muted)"
            >
              {new Date(`${p.date}T12:00:00Z`).toLocaleDateString("en-NG", {
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              })}
            </text>
          ) : null,
        )}
        {points.length > 0 && points[points.length - 1]!.collectedMinor > 0 ? (
          <circle cx={points[points.length - 1]!.x} cy={points[points.length - 1]!.y} r="3.5" fill="var(--chart-1)" stroke="var(--surface)" strokeWidth="2" />
        ) : null}
      </svg>
      <figcaption className="sr-only">
        <table>
          <caption>Daily collections</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Collected</th>
              <th scope="col">Successful payments</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{d.date}</td>
                <td>{formatMoney(d.collectedMinor, currency)}</td>
                <td>{d.successfulCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  );
}

export function MiniBars({ data, currency }: { data: Point[]; currency: string }) {
  const max = Math.max(...data.map((d) => d.collectedMinor), 1);
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden>
      {data.slice(-24).map((d) => (
        <div
          key={d.date}
          title={`${d.date}: ${formatMoney(d.collectedMinor, currency)}`}
          className="flex-1 rounded-sm bg-accent/70"
          style={{ height: `${Math.max(4, (d.collectedMinor / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
