import React, { useState } from 'react';
import { CalendarCell, FireCalendarData, SeriesMode } from '../types/fire';
import { MONTH_FULL_ES, MONTH_SHORT_ES } from '../utils/harmonization';

interface FireCalendarMatrixProps {
  calendar: FireCalendarData;
  selectedYear: number;
  selectedMonth: number | null;
  seriesMode: SeriesMode;
  onSelectCell: (year: number, month: number) => void;
  onSelectYear: (year: number) => void;
}

function getThermalCellStyle(value: number, maxVal: number): { bg: string; text: string } {
  if (value <= 0 || maxVal <= 0) {
    return { bg: '#f1f5f9', text: '#64748b' };
  }
  // Use perceptual square-root scaling so moderate fire seasons remain distinguishable from megafires
  const norm = Math.sqrt(value / maxVal);
  if (norm < 0.16) return { bg: '#fef3c7', text: '#78350f' };
  if (norm < 0.30) return { bg: '#fde68a', text: '#78350f' };
  if (norm < 0.44) return { bg: '#fdba74', text: '#7c2d12' };
  if (norm < 0.60) return { bg: '#fb923c', text: '#431407' };
  if (norm < 0.75) return { bg: '#ea580c', text: '#ffffff' };
  if (norm < 0.88) return { bg: '#c2410c', text: '#ffffff' };
  return { bg: '#991b1b', text: '#ffffff' };
}

export const FireCalendarMatrix: React.FC<FireCalendarMatrixProps> = ({
  calendar,
  selectedYear,
  selectedMonth,
  seriesMode,
  onSelectCell,
  onSelectYear,
}) => {
  const [hoveredCell, setHoveredCell] = useState<CalendarCell | null>(null);

  const inspectedCell =
    hoveredCell ||
    (() => {
      const yIdx = calendar.years.indexOf(selectedYear);
      if (yIdx < 0) return null;
      const mIdx = selectedMonth ? selectedMonth - 1 : 1;
      return calendar.cells[yIdx]?.[mIdx] || null;
    })();

  // Display newest years at top so emergency managers immediately see recent conditions (2026 down to 2001)
  const reversedIndices = calendar.years.map((_, i) => i).reverse();

  return (
    <section
      id="calendario-actividad"
      aria-label="Calendario histórico de actividad de incendios"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col h-full"
    >
      {/* Header & Color Scale Legend */}
      <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Calendario de actividad de incendios{' '}
            {calendar.years.length > 0
              ? `(${calendar.years[0]}–${calendar.years[calendar.years.length - 1]})`
              : ''}
          </h2>
          <p className="text-xs text-slate-500">
            {seriesMode === 'harmonized'
              ? 'Focos equivalentes armonizados MODIS + VIIRS · clic en celda para filtrar mapa'
              : seriesMode === 'raw'
              ? 'Conteo bruto sin calibrar (MODIS 1 km + VIIRS 375 m) · clic en celda para filtrar mapa'
              : seriesMode === 'modis'
              ? 'Solo detecciones MODIS (1 km, Terra/Aqua) · clic en celda para filtrar mapa'
              : 'Solo detecciones VIIRS (375 m, Suomi NPP / NOAA-20 / 21) · clic en celda para filtrar mapa'}
          </p>
        </div>

        {/* Discrete Thermal Scale Legend */}
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-600 tabular-nums">
          <span>0</span>
          <div className="flex items-center gap-0.5" aria-hidden="true">
            {['#f1f5f9', '#fef3c7', '#fde68a', '#fdba74', '#fb923c', '#ea580c', '#c2410c', '#991b1b'].map(
              (c) => (
                <span
                  key={c}
                  className="w-3.5 h-3 rounded-[2px] border border-slate-200/70"
                  style={{ backgroundColor: c }}
                />
              )
            )}
          </div>
          <span>{calendar.maxCellValue.toLocaleString('es-ES')}</span>
        </div>
      </div>

      {/* Fixed-height Live Cell Inspector Bar (zero layout jump) */}
      <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/40 min-h-[38px] flex flex-wrap items-center justify-between gap-2 text-xs">
        {inspectedCell ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-slate-800">
              <span className="font-semibold">
                {MONTH_FULL_ES[inspectedCell.month - 1]} {inspectedCell.year}
              </span>
              <span aria-hidden="true" className="text-slate-300">|</span>
              <span className="font-mono tabular-nums font-semibold">
                {inspectedCell.harmonizedCount.toLocaleString('es-ES')}{' '}
                {seriesMode === 'harmonized'
                  ? 'focos eq.'
                  : seriesMode === 'modis'
                  ? 'focos MODIS'
                  : seriesMode === 'viirs'
                  ? 'focos VIIRS'
                  : 'focos'}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-600">
                Mediana: {inspectedCell.medianHistorical}
                {inspectedCell.anomalyPct !== null
                  ? ` (${inspectedCell.anomalyPct >= 0 ? '+' : ''}${inspectedCell.anomalyPct}%)`
                  : ''}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono tabular-nums text-slate-600">
                MODIS {inspectedCell.rawModisCount} / VIIRS {inspectedCell.rawViirsCount}
              </span>
            </div>
            <div className="text-slate-600">
              {inspectedCell.harmonizedCount > 0
                ? `${inspectedCell.dominantCause} · FRP máx ${inspectedCell.maxFrpMW} MW`
                : 'Sin focos activos registrados'}
            </div>
          </>
        ) : (
          <span className="text-slate-500">
            Pasa el cursor o selecciona una celda para inspeccionar detalles mensuales.
          </span>
        )}
      </div>

      {/* Matrix Grid */}
      <div className="p-3 overflow-x-auto flex-1">
        {calendar.years.length === 0 ? (
          <div className="h-full min-h-[240px] flex items-center justify-center text-sm text-slate-500 text-center px-4">
            No hay años disponibles para la combinación de sensor y región seleccionada.
          </div>
        ) : (
          <table className="w-full border-separate border-spacing-[2px] text-xs select-none">
          <thead>
            <tr>
              <th className="text-left font-mono font-semibold text-slate-500 px-1.5 py-1 w-12">
                Año
              </th>
              {MONTH_SHORT_ES.map((m) => (
                <th
                  key={m}
                  className="text-center font-medium text-slate-600 py-1 min-w-[36px]"
                >
                  {m}
                </th>
              ))}
              <th className="text-right font-mono font-semibold text-slate-500 pl-2 pr-1 py-1 w-14">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {reversedIndices.map((yIdx) => {
              const year = calendar.years[yIdx];
              const row = calendar.cells[yIdx];
              const total = calendar.yearTotals[yIdx].harmonizedTotal;
              const isSelectedYear = year === selectedYear;

              return (
                <tr key={year}>
                  <td className="pr-1">
                    <button
                      type="button"
                      onClick={() => onSelectYear(year)}
                      className={`w-full text-left font-mono tabular-nums px-1.5 py-0.5 rounded transition-colors ${
                        isSelectedYear
                          ? 'bg-slate-900 text-white font-semibold'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {year}
                    </button>
                  </td>
                  {row.map((cell) => {
                    const { bg, text } = getThermalCellStyle(
                      cell.harmonizedCount,
                      calendar.maxCellValue
                    );
                    const isSelectedCell =
                      year === selectedYear && selectedMonth === cell.month;
                    return (
                      <td key={cell.month} className="p-0">
                        <button
                          type="button"
                          onMouseEnter={() => setHoveredCell(cell)}
                          onFocus={() => setHoveredCell(cell)}
                          onClick={() => onSelectCell(year, cell.month)}
                          aria-label={`${MONTH_FULL_ES[cell.month - 1]} ${year}: ${
                            cell.harmonizedCount
                          } focos`}
                          style={{ backgroundColor: bg, color: text }}
                          className={`w-full h-6 rounded-[3px] font-mono text-[11px] tabular-nums flex items-center justify-center transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
                            isSelectedCell
                              ? 'ring-2 ring-slate-900 ring-offset-1 font-bold'
                              : 'hover:brightness-95'
                          }`}
                        >
                          {cell.harmonizedCount > 0 ? cell.harmonizedCount : '·'}
                        </button>
                      </td>
                    );
                  })}
                  <td className="text-right font-mono tabular-nums text-[11px] font-medium text-slate-700 pl-2 pr-1">
                    {total.toLocaleString('es-ES')}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td className="pt-2 pr-1 font-mono text-[11px] font-semibold text-slate-600">
                Mediana
              </td>
              {calendar.monthlyBaselines.map((b) => (
                <td
                  key={b.month}
                  className="pt-2 text-center font-mono text-[11px] font-semibold text-slate-700 tabular-nums"
                >
                  {b.median}
                </td>
              ))}
              <td className="pt-2 text-right font-mono text-[11px] font-semibold text-slate-700 pl-2 pr-1 tabular-nums">
                {calendar.monthlyBaselines
                  .reduce((acc, b) => acc + b.median, 0)
                  .toLocaleString('es-ES')}
              </td>
            </tr>
          </tfoot>
        </table>
        )}
      </div>
    </section>
  );
};
