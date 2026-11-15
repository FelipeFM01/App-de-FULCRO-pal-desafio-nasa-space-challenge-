import React, { useState } from 'react';
import { FireCalendarData, HarmonizationSummary, SeriesMode } from '../types/fire';
import { MONTH_FULL_ES, MONTH_SHORT_ES } from '../utils/harmonization';

interface SeasonalComparisonChartProps {
  calendar: FireCalendarData;
  selectedYear: number;
  harmonizationSummary: HarmonizationSummary;
  seriesMode: SeriesMode;
}

export const SeasonalComparisonChart: React.FC<SeasonalComparisonChartProps> = ({
  calendar,
  selectedYear,
  harmonizationSummary,
  seriesMode,
}) => {
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const yearIndex = calendar.years.indexOf(selectedYear);
  const yearRow = yearIndex >= 0 ? calendar.cells[yearIndex] : [];

  const medians = calendar.monthlyBaselines.map((b) => b.median);
  const p25s = calendar.monthlyBaselines.map((b) => b.p25);
  const p75s = calendar.monthlyBaselines.map((b) => b.p75);
  const yearValues = Array.from({ length: 12 }, (_, idx) =>
    yearRow[idx] ? yearRow[idx].harmonizedCount : 0
  );

  const maxY = Math.max(
    10,
    ...p75s,
    ...medians,
    ...yearValues
  );

  const width = 680;
  const height = 240;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 30;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xForMonth = (mIdx: number) => padLeft + (mIdx / 11) * plotW;
  const yForVal = (v: number) => padTop + plotH - (v / maxY) * plotH;

  const buildPolyline = (vals: number[]) =>
    vals.map((v, i) => `${xForMonth(i).toFixed(1)},${yForVal(v).toFixed(1)}`).join(' ');

  const iqrPath = (() => {
    const upper = p75s
      .map((v, i) => `${i === 0 ? 'M' : 'L'} ${xForMonth(i).toFixed(1)} ${yForVal(v).toFixed(1)}`)
      .join(' ');
    const lower = [...p25s]
      .reverse()
      .map((v, revI) => {
        const i = 11 - revI;
        return `L ${xForMonth(i).toFixed(1)} ${yForVal(v).toFixed(1)}`;
      })
      .join(' ');
    return `${upper} ${lower} Z`;
  })();

  const activeIdx = hoverMonth !== null ? hoverMonth - 1 : null;
  const yTicks = [0, Math.round(maxY * 0.33), Math.round(maxY * 0.66), maxY];

  return (
    <section
      id="estacionalidad"
      aria-label="Perfil estacional y armonización de sensores"
      className="grid grid-cols-1 lg:grid-cols-12 gap-4"
    >
      {/* Left: SVG Dual-Curve Seasonal Profile */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Perfil estacional: {selectedYear} vs. mediana histórica (
              {calendar.years[0]}–{calendar.years[calendar.years.length - 1]})
            </h2>
            <p className="text-xs text-slate-500">
              Comparación mensual de focos con banda intercuartílica P25–P75
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-rose-600 inline-block" />
              Año {selectedYear}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-4 h-0.5 border-t-2 border-dashed border-slate-500 inline-block" />
              Mediana histórica
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-2.5 bg-slate-200 inline-block rounded-[2px]" />
              Rango P25–P75
            </span>
          </div>
        </div>

        {/* Fixed readout strip for hovered month */}
        <div className="h-6 flex items-center text-xs font-mono tabular-nums text-slate-700">
          {activeIdx !== null ? (
            <div className="flex items-center gap-3">
              <span className="font-semibold text-slate-900">
                {MONTH_FULL_ES[activeIdx]}
              </span>
              <span>
                {selectedYear}: <strong className="text-rose-700">{yearValues[activeIdx]}</strong>
              </span>
              <span>Mediana: {medians[activeIdx]}</span>
              <span className="text-slate-500">
                P25–P75: {p25s[activeIdx]}–{p75s[activeIdx]}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-sans">
              Pasa el cursor sobre el gráfico para inspeccionar valores mensuales exactos.
            </span>
          )}
        </div>

        <div className="w-full overflow-x-auto">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto min-w-[460px]"
            role="img"
            aria-label={`Gráfico estacional comparando ${selectedYear} con la mediana histórica`}
            onMouseLeave={() => setHoverMonth(null)}
          >
            {/* Horizontal grid lines */}
            {yTicks.map((tick) => {
              const y = yForVal(tick);
              return (
                <g key={tick}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748b"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* P25-P75 shaded interquartile band */}
            <path d={iqrPath} fill="#cbd5e1" fillOpacity="0.38" />

            {/* Historical Median dashed line */}
            <polyline
              fill="none"
              stroke="#475569"
              strokeWidth="2"
              strokeDasharray="5 4"
              points={buildPolyline(medians)}
            />

            {/* Selected Year solid line */}
            <polyline
              fill="none"
              stroke="#dc2626"
              strokeWidth="2.5"
              points={buildPolyline(yearValues)}
            />

            {/* Interactive vertical crosshair and points */}
            {activeIdx !== null && (
              <line
                x1={xForMonth(activeIdx)}
                y1={padTop}
                x2={xForMonth(activeIdx)}
                y2={height - padBottom}
                stroke="#94a3b8"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
            )}

            {yearValues.map((val, idx) => (
              <g key={idx}>
                <circle
                  cx={xForMonth(idx)}
                  cy={yForVal(medians[idx])}
                  r={activeIdx === idx ? 4 : 2.5}
                  fill="#475569"
                />
                <circle
                  cx={xForMonth(idx)}
                  cy={yForVal(val)}
                  r={activeIdx === idx ? 5 : 3.2}
                  fill="#dc2626"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <text
                  x={xForMonth(idx)}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill={activeIdx === idx ? '#0f172a' : '#64748b'}
                  fontWeight={activeIdx === idx ? '600' : '400'}
                >
                  {MONTH_SHORT_ES[idx]}
                </text>
                {/* Invisible hover column */}
                <rect
                  x={xForMonth(idx) - plotW / 24}
                  y={padTop}
                  width={plotW / 12}
                  height={plotH + padBottom}
                  fill="transparent"
                  onMouseEnter={() => setHoverMonth(idx + 1)}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Right: Cross-Sensor Harmonization Calibration Summary */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">
            Calibración intersensor MODIS ↔ VIIRS
          </h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            {seriesMode === 'harmonized'
              ? 'La serie temporal unifica detecciones MODIS (1 km, Terra/Aqua) con VIIRS (375 m, Suomi NPP/NOAA-20/21) eliminando el salto instrumental desde 2012.'
              : seriesMode === 'raw'
              ? 'Mostrando conteos brutos MODIS + VIIRS sin ajuste de resolución espacial ni deduplicación intersensor.'
              : seriesMode === 'modis'
              ? 'Mostrando exclusivamente registros MODIS (1 km, Terra/Aqua), conservando todas sus detecciones originales.'
              : 'Mostrando exclusivamente registros VIIRS (375 m, Suomi NPP / NOAA-20 / NOAA-21) sin aporte MODIS.'}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs border-t border-slate-100 pt-3">
          <div>
            <dt className="text-slate-500">Factor MODIS → VIIRS eq.</dt>
            <dd className="text-base font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
              ×{harmonizationSummary.calibrationFactor.toFixed(2)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Duplicados fusionados</dt>
            <dd className="text-base font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
              {harmonizationSummary.dedupedRemovedCount.toLocaleString('es-ES')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Registros MODIS brutos</dt>
            <dd className="text-sm font-mono font-medium text-slate-800 tabular-nums mt-0.5">
              {harmonizationSummary.rawModisCount.toLocaleString('es-ES')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Registros VIIRS brutos</dt>
            <dd className="text-sm font-mono font-medium text-slate-800 tabular-nums mt-0.5">
              {harmonizationSummary.rawViirsCount.toLocaleString('es-ES')}
            </dd>
          </div>
        </dl>

        <div className="text-[11px] text-slate-500 border-t border-slate-100 pt-2.5 font-mono tabular-nums">
          Años de solapamiento calibrados:{' '}
          {harmonizationSummary.overlapYears.length > 0
            ? `${harmonizationSummary.overlapYears[0]}–${
                harmonizationSummary.overlapYears[
                  harmonizationSummary.overlapYears.length - 1
                ]
              }`
            : 'Factor regional estándar'}
        </div>
      </div>
    </section>
  );
};
