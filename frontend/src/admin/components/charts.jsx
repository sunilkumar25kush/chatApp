import { formatDay, formatNumber } from '../utils/format';

const WIDTH = 640;
const HEIGHT = 220;
const PAD_X = 36;
const PAD_Y = 22;

const buildPath = (series, maxValue, plotWidth, plotHeight) => {
  if (!series.length) return '';
  return series.map((point, index) => {
    const x = PAD_X + (series.length === 1 ? plotWidth / 2 : (index / (series.length - 1)) * plotWidth);
    const y = PAD_Y + plotHeight - (point.value / maxValue) * plotHeight;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
};

const buildArea = (series, maxValue, plotWidth, plotHeight) => {
  const line = buildPath(series, maxValue, plotWidth, plotHeight);
  if (!line) return '';
  const firstX = PAD_X;
  const lastX = PAD_X + plotWidth;
  const baseline = PAD_Y + plotHeight;
  return `${line} L${lastX.toFixed(2)},${baseline.toFixed(2)} L${firstX.toFixed(2)},${baseline.toFixed(2)} Z`;
};

const pointPosition = (point, index, count, maxValue, plotWidth, plotHeight) => {
  const x = PAD_X + (count === 1 ? plotWidth / 2 : (index / (count - 1)) * plotWidth);
  const y = PAD_Y + plotHeight - (point.value / maxValue) * plotHeight;
  return { x, y };
};

/**
 * Multi-series line/area chart. Series format:
 * [{ label, color, values: [{ date, value }] }]
 */
export function LineChart({ series = [], height = 230, showLegend = true }) {
  const safeSeries = series.filter((item) => Array.isArray(item.values));
  const pointCount = Math.max(0, ...safeSeries.map((item) => item.values.length));
  if (!pointCount) {
    return <div className="admin-empty" style={{ padding: 32 }}><p>No chart data for this period.</p></div>;
  }

  const maxValue = Math.max(1, ...safeSeries.flatMap((item) => item.values.map((point) => Number(point.value) || 0)));
  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_Y * 2;
  const labelsSource = safeSeries[0].values;
  const labelStep = Math.max(1, Math.ceil(pointCount / 6));

  return (
    <div>
      <div className="admin-chart" style={{ minHeight: height }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Trend chart">
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = PAD_Y + plotHeight - ratio * plotHeight;
            return (
              <g key={ratio}>
                <line className="admin-chart__grid" x1={PAD_X} y1={y} x2={PAD_X + plotWidth} y2={y} />
                <text className="admin-chart__axis" x={PAD_X - 7} y={y + 3} textAnchor="end">
                  {formatNumber(Math.round(maxValue * ratio))}
                </text>
              </g>
            );
          })}

          {safeSeries.map((item, index) => {
            const color = item.color || (index === 0 ? 'var(--a-primary)' : 'var(--a-info)');
            return (
              <g key={item.label || index}>
                {index === 0 ? (
                  <path
                    className="admin-chart__area"
                    d={buildArea(item.values, maxValue, plotWidth, plotHeight)}
                    style={{ fill: color, opacity: 0.13 }}
                  />
                ) : null}
                <path
                  className="admin-chart__line"
                  d={buildPath(item.values, maxValue, plotWidth, plotHeight)}
                  style={{ stroke: color }}
                />
                {item.values.map((point, pointIndex) => {
                  const { x, y } = pointPosition(point, pointIndex, item.values.length, maxValue, plotWidth, plotHeight);
                  return (
                    <circle key={point.date || pointIndex} cx={x} cy={y} r={2.2} fill={color}>
                      <title>{`${formatDay(point.date)}: ${formatNumber(point.value)}`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}

          {labelsSource.map((point, index) => {
            if (index % labelStep !== 0 && index !== labelsSource.length - 1) return null;
            const x = PAD_X + (labelsSource.length === 1 ? plotWidth / 2 : (index / (labelsSource.length - 1)) * plotWidth);
            return (
              <text key={point.date || index} className="admin-chart__axis" x={x} y={HEIGHT - 4} textAnchor="middle">
                {formatDay(point.date)}
              </text>
            );
          })}
        </svg>
      </div>
      {showLegend && safeSeries.length > 1 ? (
        <div className="admin-chart-legend admin-mt">
          {safeSeries.map((item, index) => (
            <span className="admin-chart-legend__item" key={item.label || index}>
              <span className="admin-chart-legend__swatch" style={{ background: item.color || (index === 0 ? 'var(--a-primary)' : 'var(--a-info)') }} />
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function BarList({ items = [], emptyLabel = 'No data yet' }) {
  if (!items.length) {
    return <div className="admin-empty" style={{ padding: 26 }}><p>{emptyLabel}</p></div>;
  }
  const max = Math.max(1, ...items.map((item) => Number(item.value) || 0));
  return (
    <div>
      {items.map((item, index) => (
        <div className="admin-bar-row" key={`${item.label}-${index}`}>
          <span className="admin-truncate" title={item.label}>{item.label}</span>
          <span className="admin-bar-track">
            <span
              className="admin-bar-fill"
              style={{ width: `${Math.max((Number(item.value) || 0) / max * 100, 2)}%`, background: item.color || 'var(--a-primary)' }}
            />
          </span>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(item.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function DonutChart({ segments = [], centerLabel = 'Total', size = 128 }) {
  const total = segments.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="admin-donut">
      <div className="admin-donut__ring" style={{ width: size, height: size, flexBasis: size }}>
        <svg viewBox="0 0 128 128" width={size} height={size} role="img" aria-label="Distribution chart">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="var(--a-surface-3)" strokeWidth="14" />
          {total > 0 ? segments.map((segment, index) => {
            const value = Number(segment.value) || 0;
            const length = (value / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={segment.label || index}
                cx="64"
                cy="64"
                r={radius}
                fill="none"
                stroke={segment.color || 'var(--a-primary)'}
                strokeWidth="14"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                transform="rotate(-90 64 64)"
              >
                <title>{`${segment.label}: ${formatNumber(value)}`}</title>
              </circle>
            );
            offset += length;
            return circle;
          }) : null}
        </svg>
        <div className="admin-donut__center">
          <strong>{formatNumber(total)}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <div style={{ flex: '1 1 150px', minWidth: 0 }}>
        {segments.length ? segments.map((segment, index) => (
          <div className="admin-health-row" key={segment.label || index}>
            <span className="admin-row" style={{ gap: 7 }}>
              <span className="admin-chart-legend__swatch" style={{ background: segment.color || 'var(--a-primary)' }} />
              {segment.label}
            </span>
            <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(segment.value)}</strong>
          </div>
        )) : <span className="admin-text-muted">No data</span>}
      </div>
    </div>
  );
}
