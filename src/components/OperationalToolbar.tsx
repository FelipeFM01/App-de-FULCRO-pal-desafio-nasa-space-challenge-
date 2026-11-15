import React from 'react';
import {
  Crosshair,
  Flame,
  Pentagon,
  RotateCcw,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { AreaOfInterest, RegionOption, SeriesMode } from '../types/fire';

export type DrawToolMode = 'pan' | 'rectangle' | 'polygon';

interface OperationalToolbarProps {
  regionOptions: RegionOption[];
  selectedRegionId: string;
  onSelectRegion: (regionId: string) => void;
  availableYears: number[];
  yearRangeStart: number;
  yearRangeEnd: number;
  onChangeYearRange: (start: number, end: number) => void;
  selectedYear: number;
  onSelectYear: (year: number) => void;
  isFocalYearFilterActive: boolean;
  onClearFocalFilter: () => void;
  seriesMode: SeriesMode;
  onChangeSeriesMode: (mode: SeriesMode) => void;
  drawMode: DrawToolMode;
  onChangeDrawMode: (mode: DrawToolMode) => void;
  onOpenCoordinatesModal: () => void;
  onOpenUploadModal: () => void;
  hasLoadedData: boolean;
  onClearDatabases: () => void;
  showRecurrentAreas: boolean;
  onToggleRecurrentAreas: () => void;
  recurrentCount: number;
  aoi: AreaOfInterest | null;
  onResetAOI: () => void;
  selectedMonth: number | null;
  onClearMonth: () => void;
}

export const OperationalToolbar: React.FC<OperationalToolbarProps> = ({
  regionOptions,
  selectedRegionId,
  onSelectRegion,
  availableYears,
  yearRangeStart,
  yearRangeEnd,
  onChangeYearRange,
  selectedYear,
  onSelectYear,
  isFocalYearFilterActive,
  onClearFocalFilter,
  seriesMode,
  onChangeSeriesMode,
  drawMode,
  onChangeDrawMode,
  onOpenCoordinatesModal,
  onOpenUploadModal,
  hasLoadedData,
  onClearDatabases,
  showRecurrentAreas,
  onToggleRecurrentAreas,
  recurrentCount,
  aoi,
  onResetAOI,
  selectedMonth,
  onClearMonth,
}) => {
  const minAvail = availableYears[0] ?? yearRangeStart;
  const maxAvail = availableYears[availableYears.length - 1] ?? yearRangeEnd;
  const isCustomYearRange =
    availableYears.length > 1 && (yearRangeStart > minAvail || yearRangeEnd < maxAvail);

  const yearsInRange = availableYears.filter(
    (y) => y >= yearRangeStart && y <= yearRangeEnd
  );

  const allOption = regionOptions.find((r) => r.group === 'all');
  const explicitRegions = regionOptions.filter((r) => r.group === 'region');
  const chileRegions = regionOptions.filter((r) => r.group === 'chile-region');
  const countryOptions = regionOptions.filter((r) => r.group === 'country');
  const fileOptions = regionOptions.filter((r) => r.group === 'file');

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col gap-3">
      {/* Row 1: Specific Region, Year Range, Focal Year, Sensor Series Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Specific Region Dropdown */}
          <div className="flex items-center gap-2">
            <label
              htmlFor="region-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Región
            </label>
            <select
              id="region-select"
              value={selectedRegionId}
              disabled={!hasLoadedData || regionOptions.length === 0}
              onChange={(e) => onSelectRegion(e.target.value)}
              className="h-9 px-3 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md max-w-[260px] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {!hasLoadedData || regionOptions.length === 0 ? (
                <option value="all">Carga archivos Excel para elegir región</option>
              ) : (
                <>
                  {allOption && (
                    <option value={allOption.id}>{allOption.label}</option>
                  )}
                  {explicitRegions.length > 0 && (
                    <optgroup label="Regiones específicas (columna)">
                      {explicitRegions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {chileRegions.length > 0 && (
                    <optgroup label="Regiones administrativas (Chile)">
                      {chileRegions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {countryOptions.length > 0 && (
                    <optgroup label="Por país detectado">
                      {countryOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {fileOptions.length > 0 && (
                    <optgroup label="Por archivo Excel">
                      {fileOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
          </div>

          {/* Year Range Selector (Desde - Hasta) */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="year-range-start"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Rango años
            </label>
            <select
              id="year-range-start"
              aria-label="Año inicio del rango"
              value={yearRangeStart}
              disabled={!hasLoadedData || availableYears.length === 0}
              onChange={(e) => {
                const nextStart = Number(e.target.value);
                onChangeYearRange(nextStart, Math.max(nextStart, yearRangeEnd));
              }}
              className="h-9 px-2 text-xs font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md tabular-nums disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {availableYears.length === 0 ? (
                <option value={yearRangeStart}>—</option>
              ) : (
                availableYears.map((y) => (
                  <option key={y} value={y} disabled={y > yearRangeEnd}>
                    {y}
                  </option>
                ))
              )}
            </select>
            <span className="text-xs text-slate-400">–</span>
            <select
              id="year-range-end"
              aria-label="Año fin del rango"
              value={yearRangeEnd}
              disabled={!hasLoadedData || availableYears.length === 0}
              onChange={(e) => {
                const nextEnd = Number(e.target.value);
                onChangeYearRange(Math.min(yearRangeStart, nextEnd), nextEnd);
              }}
              className="h-9 px-2 text-xs font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md tabular-nums disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {availableYears.length === 0 ? (
                <option value={yearRangeEnd}>—</option>
              ) : (
                availableYears.map((y) => (
                  <option key={y} value={y} disabled={y < yearRangeStart}>
                    {y}
                  </option>
                ))
              )}
            </select>

            {isCustomYearRange && (
              <button
                type="button"
                onClick={() => onChangeYearRange(minAvail, maxAvail)}
                className="h-9 px-2.5 text-[11px] font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md whitespace-nowrap"
                title="Restablecer al período completo"
              >
                Todo
              </button>
            )}
          </div>

          {/* Focal Year Selector (within selected range) */}
          <div className="flex items-center gap-1.5">
            <label
              htmlFor="year-select"
              className="text-xs font-medium text-slate-600 whitespace-nowrap"
            >
              Año focal
            </label>
            <select
              id="year-select"
              value={selectedYear}
              disabled={!hasLoadedData || yearsInRange.length === 0}
              onChange={(e) => onSelectYear(Number(e.target.value))}
              className="h-9 px-2.5 text-xs font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-md tabular-nums disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            >
              {yearsInRange.length === 0 ? (
                <option value={selectedYear}>—</option>
              ) : (
                [...yearsInRange].reverse().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))
              )}
            </select>
          </div>

          {(isFocalYearFilterActive || selectedMonth !== null) && (
            <button
              type="button"
              onClick={() => {
                onClearMonth();
                onClearFocalFilter();
              }}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <span>
                {selectedMonth !== null
                  ? `Mapa: ${String(selectedMonth).padStart(2, '0')}/${selectedYear}`
                  : `Mapa: solo ${selectedYear}`}
              </span>
              <span aria-hidden="true">×</span>
            </button>
          )}
        </div>

        {/* Sensor Series Mode: Harmonized (MODIS+VIIRS) | Raw (M+V) | Solo MODIS | Solo VIIRS */}
        <div
          role="group"
          aria-label="Modo de serie temporal y sensor"
          className="inline-flex flex-wrap items-center p-1 bg-slate-100 rounded-md border border-slate-200 gap-0.5"
        >
          {(
            [
              { id: 'harmonized', label: 'Armonizada (MODIS + VIIRS)' },
              { id: 'raw', label: 'Bruta (M+V)' },
              { id: 'modis', label: 'Solo MODIS' },
              { id: 'viirs', label: 'Solo VIIRS' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              aria-pressed={seriesMode === opt.id}
              onClick={() => onChangeSeriesMode(opt.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                seriesMode === opt.id
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-100" />

      {/* Row 2: Interactive Map AOI, Highlight Recurrent Areas button, Multi-Excel Data Upload */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasLoadedData}
            onClick={() => onChangeDrawMode(drawMode === 'rectangle' ? 'pan' : 'rectangle')}
            aria-pressed={drawMode === 'rectangle'}
            className={`h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
              drawMode === 'rectangle'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Square className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Dibujar rectángulo</span>
          </button>

          <button
            type="button"
            disabled={!hasLoadedData}
            onClick={() => onChangeDrawMode(drawMode === 'polygon' ? 'pan' : 'polygon')}
            aria-pressed={drawMode === 'polygon'}
            className={`h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600 ${
              drawMode === 'polygon'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Pentagon className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Dibujar polígono</span>
          </button>

          <button
            type="button"
            disabled={!hasLoadedData}
            onClick={onOpenCoordinatesModal}
            className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Coordenadas (Lat/Lon)</span>
          </button>

          <button
            type="button"
            disabled={!hasLoadedData}
            onClick={onToggleRecurrentAreas}
            aria-pressed={showRecurrentAreas}
            className={`h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 ${
              showRecurrentAreas
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
            }`}
          >
            <Flame className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Destacar áreas recurrentes ({recurrentCount})</span>
          </button>

          {aoi && (
            <button
              type="button"
              onClick={onResetAOI}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Restablecer AOI</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {hasLoadedData && (
            <button
              type="button"
              onClick={onClearDatabases}
              className="h-9 inline-flex items-center gap-1.5 px-3 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              title="Eliminar bases de datos cargadas"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Vaciar bases</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenUploadModal}
            className="h-9 inline-flex items-center gap-1.5 px-3.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            <Upload className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Cargar archivos Excel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
