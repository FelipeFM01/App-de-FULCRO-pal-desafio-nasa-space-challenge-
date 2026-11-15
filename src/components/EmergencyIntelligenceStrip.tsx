import React from 'react';
import {
  FireCalendarData,
  HarmonizationSummary,
  HarmonizedHotspot,
  RecurrentBurnArea,
  SeriesMode,
} from '../types/fire';
import { MONTH_FULL_ES, MONTH_SHORT_ES } from '../utils/harmonization';

interface EmergencyIntelligenceStripProps {
  calendar: FireCalendarData;
  hotspots: HarmonizedHotspot[];
  selectedYear: number;
  selectedMonth: number | null;
  seriesMode: SeriesMode;
  recurrentAreas: RecurrentBurnArea[];
  harmonizationSummary: HarmonizationSummary;
  onHighlightRecurrent: () => void;
}

export const EmergencyIntelligenceStrip: React.FC<EmergencyIntelligenceStripProps> = ({
  calendar,
  hotspots,
  selectedYear,
  selectedMonth,
  seriesMode,
  recurrentAreas,
  harmonizationSummary,
  onHighlightRecurrent,
}) => {
  const yearIndex = calendar.years.indexOf(selectedYear);
  const yearRow = yearIndex >= 0 ? calendar.cells[yearIndex] : null;

  // Determine active comparison: selected month or peak month of selected year
  let focusMonth = selectedMonth;
  if (!focusMonth && yearRow) {
    let bestMonth = 1;
    let bestVal = -1;
    for (const cell of yearRow) {
      if (cell.harmonizedCount > bestVal) {
        bestVal = cell.harmonizedCount;
        bestMonth = cell.month;
      }
    }
    focusMonth = bestMonth;
  }

  const focusCell =
    yearRow && focusMonth ? yearRow[focusMonth - 1] : null;

  const yearTotalObj =
    yearIndex >= 0 ? calendar.yearTotals[yearIndex] : { harmonizedTotal: 0, rawTotal: 0, maxFrpMW: 0 };

  // Historical seasonal window (top 3 months by median)
  const topSeasonMonths = [...calendar.monthlyBaselines]
    .sort((a, b) => b.median - a.median)
    .slice(0, 3)
    .map((m) => m.month)
    .sort((a, b) => a - b);

  // Compute FRP metrics for filtered hotspots (or selected year)
  const scopedHotspots = hotspots.filter(
    (h) => h.year === selectedYear && (!selectedMonth || h.month === selectedMonth)
  );
  const frpList = scopedHotspots.map((h) => h.harmonizedFrpMW);
  const maxFrp = frpList.length > 0 ? Math.max(...frpList) : 0;
  const meanFrp =
    frpList.length > 0 ? frpList.reduce((a, b) => a + b, 0) / frpList.length : 0;

  // Severity label (text-first, never hue-only)
  const anomaly = focusCell?.anomalyPct;
  let severityText = '● Normal';
  let severityClass = 'text-emerald-700';
  if (focusCell?.severity === 'critical') {
    severityText = '◆ Crítico';
    severityClass = 'text-rose-700';
  } else if (focusCell?.severity === 'high') {
    severityText = '▲ Alto';
    severityClass = 'text-orange-700';
  } else if (focusCell?.severity === 'elevated') {
    severityText = '▲ Elevado';
    severityClass = 'text-amber-700';
  }

  const chronicCount = recurrentAreas.filter((a) => a.recurrenceLevel === 'Crónica').length;
  const shortestReturn = recurrentAreas
    .map((a) => a.avgReturnYears)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b)[0];

  return (
    <section
      aria-label="Indicadores operativos y científicos"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {/* Block 1: Anomaly vs Historical Median */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">
            {selectedMonth
              ? `${MONTH_FULL_ES[selectedMonth - 1]} ${selectedYear} vs. mediana`
              : `Pico ${focusMonth ? MONTH_SHORT_ES[focusMonth - 1] : ''} ${selectedYear} vs. mediana`}
          </span>
          <span className={`text-xs font-semibold whitespace-nowrap ${severityClass}`}>
            {severityText}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold text-slate-900 tabular-nums">
            {focusCell ? focusCell.harmonizedCount.toLocaleString('es-ES') : '0'}
          </span>
          <span className="text-xs font-mono text-slate-500">
            {seriesMode === 'harmonized'
              ? 'focos eq.'
              : seriesMode === 'modis'
              ? 'focos MODIS'
              : seriesMode === 'viirs'
              ? 'focos VIIRS'
              : 'focos'}
          </span>
        </div>
        <div className="text-xs text-slate-600 font-mono tabular-nums flex items-center gap-2">
          <span>Mediana hist.: {focusCell ? focusCell.medianHistorical : 0}</span>
          <span aria-hidden="true">·</span>
          <span
            className={
              anomaly !== null && anomaly !== undefined && anomaly > 25
                ? 'text-rose-700 font-semibold'
                : 'text-slate-600'
            }
          >
            {anomaly === null || anomaly === undefined
              ? 'Sin línea base'
              : `${anomaly >= 0 ? '+' : ''}${anomaly}%`}
          </span>
        </div>
      </div>

      {/* Block 2: Thermal Radiative Power (Firefighters & Suppression) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">
            Intensidad radiativa (FRP {selectedYear})
          </span>
          <span className="text-xs text-slate-500 whitespace-nowrap">Control en línea</span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold text-slate-900 tabular-nums">
            {maxFrp.toFixed(1)}
          </span>
          <span className="text-xs font-mono text-slate-500">MW máx</span>
        </div>
        <div className="text-xs text-slate-600 font-mono tabular-nums flex items-center gap-2">
          <span>Media: {meanFrp.toFixed(1)} MW</span>
          <span aria-hidden="true">·</span>
          <span>
            {maxFrp >= 80
              ? 'Comportamiento extremo'
              : maxFrp >= 40
              ? 'Propagación vigorosa'
              : 'Combustión moderada'}
          </span>
        </div>
      </div>

      {/* Block 3: Critical Seasonal Window & Annual Total */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Ventana estacional crítica</span>
          <span className="text-xs font-mono text-slate-500 tabular-nums">
            {calendar.years[0]}–{calendar.years[calendar.years.length - 1]}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-display font-semibold text-slate-900">
            {topSeasonMonths.map((m) => MONTH_SHORT_ES[m - 1]).join(' · ')}
          </span>
        </div>
        <div className="text-xs text-slate-600 font-mono tabular-nums flex items-center gap-2">
          <span>
            Acum. {selectedYear}: {yearTotalObj.harmonizedTotal.toLocaleString('es-ES')}{' '}
            {seriesMode === 'harmonized' ? 'eq.' : 'focos'}
          </span>
          <span aria-hidden="true">·</span>
          <span>Factor ×{harmonizationSummary.calibrationFactor.toFixed(2)}</span>
        </div>
      </div>

      {/* Block 4: Chronic Recurrent Burn Areas */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Áreas con incendios recurrentes</span>
          <button
            type="button"
            onClick={onHighlightRecurrent}
            className="text-xs font-semibold text-sky-700 hover:text-sky-900 hover:underline whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 rounded"
          >
            Ver en mapa
          </button>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-semibold text-slate-900 tabular-nums">
            {recurrentAreas.length}
          </span>
          <span className="text-xs font-mono text-slate-500">
            zonas ({chronicCount} crónicas)
          </span>
        </div>
        <div className="text-xs text-slate-600 font-mono tabular-nums flex items-center gap-2">
          <span>
            Retorno mín.: {shortestReturn !== undefined ? `cada ~${shortestReturn} años` : '—'}
          </span>
        </div>
      </div>
    </section>
  );
};
