import React, { useCallback, useMemo, useState } from 'react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import {
  AreaOfInterest,
  LoadedDatabaseFile,
  RawHotspot,
  SeriesMode,
} from './types/fire';
import {
  buildFireCalendar,
  filterByAOI,
  harmonizeHotspots,
  selectSeriesHotspots,
} from './utils/harmonization';
import {
  buildRegionOptions,
  enrichHotspotRegions,
  filterHotspotsByRegionId,
} from './utils/regionLookup';
import { detectRecurrentBurnAreas } from './utils/recurrence';
import { buildHotspotsCSV } from './utils/importer';
import { TopHeader } from './components/TopHeader';
import {
  DrawToolMode,
  OperationalToolbar,
} from './components/OperationalToolbar';
import { EmergencyIntelligenceStrip } from './components/EmergencyIntelligenceStrip';
import { FireMap } from './components/FireMap';
import { FireCalendarMatrix } from './components/FireCalendarMatrix';
import { RecurrentAreasPanel } from './components/RecurrentAreasPanel';
import { SeasonalComparisonChart } from './components/SeasonalComparisonChart';
import { HotspotDetailTable } from './components/HotspotDetailTable';
import { CoordinatesModal } from './components/CoordinatesModal';
import { DataUploadModal } from './components/DataUploadModal';

export default function App() {
  const [rawDataset, setRawDataset] = useState<RawHotspot[]>([]);
  const [loadedFiles, setLoadedFiles] = useState<LoadedDatabaseFile[]>([]);

  const [selectedRegionId, setSelectedRegionId] = useState<string>('all');
  const [aoi, setAoi] = useState<AreaOfInterest | null>(null);
  const [drawMode, setDrawMode] = useState<DrawToolMode>('pan');
  const [seriesMode, setSeriesMode] = useState<SeriesMode>('harmonized');

  const [yearRangeStart, setYearRangeStart] = useState<number | null>(null);
  const [yearRangeEnd, setYearRangeEnd] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [isFocalYearFilterActive, setIsFocalYearFilterActive] = useState<boolean>(false);

  const [showRecurrentAreas, setShowRecurrentAreas] = useState<boolean>(false);
  const [selectedRecurrentId, setSelectedRecurrentId] = useState<string | null>(null);

  const [isCoordsModalOpen, setIsCoordsModalOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);

  const hasLoadedData = rawDataset.length > 0;

  // 1. Cross-sensor MODIS + VIIRS harmonization on loaded databases
  const { hotspots: harmonizedAll, summary: harmonizationSummary } = useMemo(
    () => harmonizeHotspots(rawDataset),
    [rawDataset]
  );

  // 2. Select active series mode: Harmonized (MODIS+VIIRS) | Raw (M+V) | Solo MODIS | Solo VIIRS
  const seriesHotspotsRaw = useMemo(
    () => selectSeriesHotspots(rawDataset, harmonizedAll, seriesMode),
    [rawDataset, harmonizedAll, seriesMode]
  );

  // 3. Enrich with spatial country / Chilean subregion when explicit Excel region column is absent
  const enrichedHotspots = useMemo(
    () => enrichHotspotRegions(seriesHotspotsRaw),
    [seriesHotspotsRaw]
  );

  // 4. Build specific Region options from loaded data
  const regionOptions = useMemo(
    () => buildRegionOptions(enrichedHotspots),
    [enrichedHotspots]
  );

  const effectiveRegionId = useMemo(() => {
    if (regionOptions.some((opt) => opt.id === selectedRegionId)) {
      return selectedRegionId;
    }
    return 'all';
  }, [regionOptions, selectedRegionId]);

  // 5. Filter by selected specific region
  const regionHotspots = useMemo(
    () => filterHotspotsByRegionId(enrichedHotspots, effectiveRegionId),
    [enrichedHotspots, effectiveRegionId]
  );

  // 6. Spatial filter by AOI (drawn rectangle/polygon or entered coordinates)
  const aoiHotspots = useMemo(
    () => filterByAOI(regionHotspots, aoi),
    [regionHotspots, aoi]
  );

  // 7. Determine continuous available year span for current sensor/region selection
  const availableYears = useMemo(() => {
    const source = regionHotspots.length > 0 ? regionHotspots : enrichedHotspots;
    if (source.length === 0) return [];
    let minY = 9999;
    let maxY = 0;
    for (const h of source) {
      if (h.year < minY) minY = h.year;
      if (h.year > maxY) maxY = h.year;
    }
    if (minY > maxY) return [];
    const years: number[] = [];
    for (let y = minY; y <= maxY; y++) years.push(y);
    return years;
  }, [regionHotspots, enrichedHotspots]);

  const minAvailYear = availableYears[0] ?? 2001;
  const maxAvailYear = availableYears[availableYears.length - 1] ?? 2026;

  // Clamp selected year range inside availableYears
  const effectiveRangeStart = useMemo(() => {
    if (availableYears.length === 0) return 2001;
    if (yearRangeStart === null) return minAvailYear;
    return Math.max(minAvailYear, Math.min(maxAvailYear, yearRangeStart));
  }, [availableYears.length, yearRangeStart, minAvailYear, maxAvailYear]);

  const effectiveRangeEnd = useMemo(() => {
    if (availableYears.length === 0) return 2026;
    if (yearRangeEnd === null) return maxAvailYear;
    return Math.max(effectiveRangeStart, Math.min(maxAvailYear, yearRangeEnd));
  }, [availableYears.length, yearRangeEnd, effectiveRangeStart, maxAvailYear]);

  // Clamp focal year within [effectiveRangeStart, effectiveRangeEnd]
  const effectiveSelectedYear = useMemo(() => {
    if (selectedYear >= effectiveRangeStart && selectedYear <= effectiveRangeEnd) {
      return selectedYear;
    }
    return effectiveRangeEnd;
  }, [selectedYear, effectiveRangeStart, effectiveRangeEnd]);

  // 8. Filter AOI hotspots to selected Year Range
  const rangeHotspots = useMemo(
    () =>
      aoiHotspots.filter(
        (h) => h.year >= effectiveRangeStart && h.year <= effectiveRangeEnd
      ),
    [aoiHotspots, effectiveRangeStart, effectiveRangeEnd]
  );

  // 9. Fire Activity Calendar Matrix over selected year range
  const calendarData = useMemo(() => {
    if (availableYears.length === 0) {
      return buildFireCalendar([], 2026, 2025, seriesMode);
    }
    return buildFireCalendar(
      rangeHotspots,
      effectiveRangeStart,
      effectiveRangeEnd,
      seriesMode
    );
  }, [
    availableYears.length,
    rangeHotspots,
    effectiveRangeStart,
    effectiveRangeEnd,
    seriesMode,
  ]);

  // 10. Spatial Recurrence Clustering within selected region, AOI, sensor, and year range
  const recurrentAreas = useMemo(
    () => detectRecurrentBurnAreas(rangeHotspots),
    [rangeHotspots]
  );

  // 11. Scoped hotspots for Map & Detail Table
  const scopedHotspots = useMemo(() => {
    if (!isFocalYearFilterActive && selectedMonth === null) {
      return rangeHotspots;
    }
    return rangeHotspots.filter(
      (h) =>
        h.year === effectiveSelectedYear &&
        (selectedMonth === null || h.month === selectedMonth)
    );
  }, [
    rangeHotspots,
    isFocalYearFilterActive,
    effectiveSelectedYear,
    selectedMonth,
  ]);

  // Compute dynamic map center & bounding box from selected region's hotspots
  const { mapCenter, regionBounds } = useMemo<{
    mapCenter: [number, number];
    regionBounds: [[number, number], [number, number]] | null;
  }>(() => {
    const pts = regionHotspots.length > 0 ? regionHotspots : enrichedHotspots;
    if (pts.length === 0) {
      return { mapCenter: [-36.5, -71.8], regionBounds: null };
    }
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    let sumLat = 0;
    let sumLon = 0;
    for (const h of pts) {
      if (h.latitude < minLat) minLat = h.latitude;
      if (h.latitude > maxLat) maxLat = h.latitude;
      if (h.longitude < minLon) minLon = h.longitude;
      if (h.longitude > maxLon) maxLon = h.longitude;
      sumLat += h.latitude;
      sumLon += h.longitude;
    }
    const padLat = Math.max(0.08, (maxLat - minLat) * 0.08);
    const padLon = Math.max(0.08, (maxLon - minLon) * 0.08);
    return {
      mapCenter: [sumLat / pts.length, sumLon / pts.length],
      regionBounds: [
        [minLat - padLat, minLon - padLon],
        [maxLat + padLat, maxLon + padLon],
      ],
    };
  }, [regionHotspots, enrichedHotspots]);

  const fitBoundsKey = useMemo(
    () => `${effectiveRegionId}-${loadedFiles.map((f) => f.id).join(',')}`,
    [effectiveRegionId, loadedFiles]
  );

  const activeRegionLabel = useMemo(() => {
    if (!hasLoadedData) return 'Sin bases de datos cargadas';
    const found = regionOptions.find((r) => r.id === effectiveRegionId);
    return found ? found.label : 'Todas las regiones';
  }, [hasLoadedData, regionOptions, effectiveRegionId]);

  const handleSelectRegion = useCallback((regionId: string) => {
    setSelectedRegionId(regionId);
    setAoi(null);
    setSelectedMonth(null);
    setIsFocalYearFilterActive(false);
    setSelectedRecurrentId(null);
    setDrawMode('pan');
  }, []);

  const handleChangeYearRange = useCallback((start: number, end: number) => {
    setYearRangeStart(start);
    setYearRangeEnd(end);
    setSelectedMonth(null);
    setIsFocalYearFilterActive(false);
    setSelectedYear((prev) => (prev >= start && prev <= end ? prev : end));
  }, []);

  const handleSelectCell = useCallback(
    (year: number, month: number) => {
      if (year === effectiveSelectedYear && selectedMonth === month && isFocalYearFilterActive) {
        setSelectedMonth(null);
        setIsFocalYearFilterActive(false);
      } else {
        setSelectedYear(year);
        setSelectedMonth(month);
        setIsFocalYearFilterActive(true);
      }
    },
    [effectiveSelectedYear, selectedMonth, isFocalYearFilterActive]
  );

  const handleSelectFocalYear = useCallback((year: number) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    setIsFocalYearFilterActive(true);
  }, []);

  const handleToggleRecurrentAreas = useCallback(() => {
    setShowRecurrentAreas((prev) => {
      const next = !prev;
      if (!next) setSelectedRecurrentId(null);
      return next;
    });
  }, []);

  const handleLocateRecurrentArea = useCallback((areaId: string) => {
    setShowRecurrentAreas(true);
    setSelectedRecurrentId(areaId);
    document
      .getElementById('mapa-calendario')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  // Replaces ALL previous files/databases and uses ONLY the newly uploaded batch
  const handleImportFiles = useCallback(
    (imported: RawHotspot[], files: LoadedDatabaseFile[]) => {
      setRawDataset(imported);
      setLoadedFiles(files);
      setSelectedRegionId('all');
      setAoi(null);
      setSelectedMonth(null);
      setIsFocalYearFilterActive(false);
      setSelectedRecurrentId(null);
      setDrawMode('pan');

      let minY = 9999;
      let maxY = 0;
      for (const r of imported) {
        const y = Number(r.acqDate.slice(0, 4));
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      if (minY <= maxY) {
        setYearRangeStart(minY);
        setYearRangeEnd(maxY);
        setSelectedYear(maxY);
      } else {
        setYearRangeStart(null);
        setYearRangeEnd(null);
      }
    },
    []
  );

  const handleClearDatabases = useCallback(() => {
    setRawDataset([]);
    setLoadedFiles([]);
    setSelectedRegionId('all');
    setAoi(null);
    setSelectedMonth(null);
    setIsFocalYearFilterActive(false);
    setSelectedRecurrentId(null);
    setYearRangeStart(null);
    setYearRangeEnd(null);
    setDrawMode('pan');
    setShowRecurrentAreas(false);
  }, []);

  const handleExportCSV = useCallback(() => {
    const target = scopedHotspots.length > 0 ? scopedHotspots : rangeHotspots;
    if (target.length === 0) return;
    const csv = buildHotspotsCSV(target);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const suffix = selectedMonth
      ? `${effectiveSelectedYear}-${String(selectedMonth).padStart(2, '0')}`
      : isFocalYearFilterActive
      ? `${effectiveSelectedYear}`
      : `${effectiveRangeStart}-${effectiveRangeEnd}`;
    a.download = `pyrocal_focos_${seriesMode}_${suffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [
    scopedHotspots,
    rangeHotspots,
    selectedMonth,
    isFocalYearFilterActive,
    effectiveSelectedYear,
    effectiveRangeStart,
    effectiveRangeEnd,
    seriesMode,
  ]);

  return (
    <div id="inicio" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <TopHeader onExportCSV={handleExportCSV} filteredCount={rangeHotspots.length} />

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Context heading & active databases summary */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900">
              Calendario armonizado de actividad de incendios
            </h1>
            <p className="text-sm text-slate-600 mt-0.5">
              {hasLoadedData
                ? `${activeRegionLabel}${aoi?.label ? ` · AOI: ${aoi.label}` : ''}`
                : 'Carga tus archivos Excel / CSV MODIS y VIIRS para iniciar el análisis'}
            </p>
          </div>

          {hasLoadedData && (
            <div className="text-xs font-mono text-slate-500 tabular-nums">
              Rango {effectiveRangeStart}–{effectiveRangeEnd} ·{' '}
              {rangeHotspots.length.toLocaleString('es-ES')} focos activos
            </div>
          )}
        </div>

        {/* Workspace Operational Toolbar */}
        <OperationalToolbar
          regionOptions={regionOptions}
          selectedRegionId={effectiveRegionId}
          onSelectRegion={handleSelectRegion}
          availableYears={availableYears}
          yearRangeStart={effectiveRangeStart}
          yearRangeEnd={effectiveRangeEnd}
          onChangeYearRange={handleChangeYearRange}
          selectedYear={effectiveSelectedYear}
          onSelectYear={handleSelectFocalYear}
          isFocalYearFilterActive={isFocalYearFilterActive}
          onClearFocalFilter={() => setIsFocalYearFilterActive(false)}
          seriesMode={seriesMode}
          onChangeSeriesMode={setSeriesMode}
          drawMode={drawMode}
          onChangeDrawMode={setDrawMode}
          onOpenCoordinatesModal={() => setIsCoordsModalOpen(true)}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          hasLoadedData={hasLoadedData}
          onClearDatabases={handleClearDatabases}
          showRecurrentAreas={showRecurrentAreas}
          onToggleRecurrentAreas={handleToggleRecurrentAreas}
          recurrentCount={recurrentAreas.length}
          aoi={aoi}
          onResetAOI={() => setAoi(null)}
          selectedMonth={selectedMonth}
          onClearMonth={() => setSelectedMonth(null)}
        />

        {/* Loaded Databases Bar OR Onboarding Empty State */}
        {!hasLoadedData ? (
          <section
            aria-label="Carga inicial de bases de datos Excel"
            className="bg-white border-2 border-dashed border-slate-300 rounded-lg p-8 sm:p-10 text-center space-y-4"
          >
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" aria-hidden="true" />
            </div>
            <div className="max-w-xl mx-auto space-y-1.5">
              <h2 className="font-display text-lg font-semibold text-slate-900">
                Usa únicamente tus propias bases de datos Excel / CSV
              </h2>
              <p className="text-sm text-slate-600">
                Las bases de ejemplo anteriores fueron eliminadas. Selecciona uno o varios archivos
                Excel (por ejemplo, MODIS y VIIRS por separado o por región) para construir el
                calendario, filtrar regiones específicas, elegir rangos de años y detectar áreas
                recurrentes.
              </p>
            </div>
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors"
              >
                <Upload className="w-4 h-4" aria-hidden="true" />
                <span>Cargar archivos Excel (MODIS / VIIRS)</span>
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* Active Uploaded Databases Banner */}
            <div className="bg-white border border-slate-200 rounded-lg px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-slate-700">
                <FileSpreadsheet className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                <span className="font-semibold text-slate-900">
                  Bases activas ({loadedFiles.length}):
                </span>
                {loadedFiles.map((f, idx) => (
                  <span key={f.id} className="font-mono text-slate-600">
                    {idx > 0 && <span className="mr-2 text-slate-300">·</span>}
                    <strong className="text-slate-800">{f.fileName}</strong> (
                    {f.rowCount.toLocaleString('es-ES')} filas
                    {f.modisCount > 0 && f.viirsCount > 0
                      ? `: ${f.modisCount} MODIS, ${f.viirsCount} VIIRS`
                      : f.modisCount > 0
                      ? ': MODIS'
                      : ': VIIRS'}
                    )
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(true)}
                className="text-sky-700 hover:text-sky-900 font-medium hover:underline whitespace-nowrap"
              >
                Reemplazar archivos
              </button>
            </div>

            {/* Empty Filtered State Banner */}
            {rangeHotspots.length === 0 && (
              <div
                role="status"
                className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="text-sm text-amber-950">
                  No hay focos registrados para la combinación actual de región, sensor (
                  {seriesMode === 'modis'
                    ? 'Solo MODIS'
                    : seriesMode === 'viirs'
                    ? 'Solo VIIRS'
                    : seriesMode === 'raw'
                    ? 'Bruta'
                    : 'Armonizada'}
                  ), rango de años ({effectiveRangeStart}–{effectiveRangeEnd}) y AOI.
                </div>
                <div className="flex items-center gap-2">
                  {aoi && (
                    <button
                      type="button"
                      onClick={() => setAoi(null)}
                      className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-md"
                    >
                      Restablecer AOI
                    </button>
                  )}
                  {effectiveRegionId !== 'all' && (
                    <button
                      type="button"
                      onClick={() => handleSelectRegion('all')}
                      className="px-3 py-1.5 text-xs font-semibold text-amber-950 bg-white border border-amber-300 hover:bg-amber-100 rounded-md"
                    >
                      Ver todas las regiones
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Operational KPI Readout Strip */}
            <EmergencyIntelligenceStrip
              calendar={calendarData}
              hotspots={rangeHotspots}
              selectedYear={effectiveSelectedYear}
              selectedMonth={selectedMonth}
              seriesMode={seriesMode}
              recurrentAreas={recurrentAreas}
              harmonizationSummary={harmonizationSummary}
              onHighlightRecurrent={() => {
                setShowRecurrentAreas(true);
                document
                  .getElementById('areas-recurrentes')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />

            {/* Primary Split Console: Interactive Map + Harmonized Fire Activity Calendar */}
            <div
              id="mapa-calendario"
              className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch"
            >
              <div className="lg:col-span-5">
                <FireMap
                  center={mapCenter}
                  zoom={7}
                  regionBounds={regionBounds}
                  fitBoundsKey={fitBoundsKey}
                  hotspots={scopedHotspots}
                  aoi={aoi}
                  onChangeAOI={setAoi}
                  drawMode={drawMode}
                  onChangeDrawMode={setDrawMode}
                  showRecurrentAreas={showRecurrentAreas}
                  recurrentAreas={recurrentAreas}
                  selectedRecurrentId={selectedRecurrentId}
                  onSelectRecurrentArea={setSelectedRecurrentId}
                  seriesMode={seriesMode}
                />
              </div>

              <div className="lg:col-span-7">
                <FireCalendarMatrix
                  calendar={calendarData}
                  selectedYear={effectiveSelectedYear}
                  selectedMonth={selectedMonth}
                  seriesMode={seriesMode}
                  onSelectCell={handleSelectCell}
                  onSelectYear={handleSelectFocalYear}
                />
              </div>
            </div>

            {/* Recurrent Burn Areas Breakdown (with cause, dates & frequency) */}
            <RecurrentAreasPanel
              areas={recurrentAreas}
              showRecurrentAreas={showRecurrentAreas}
              onToggleRecurrentAreas={handleToggleRecurrentAreas}
              selectedAreaId={selectedRecurrentId}
              onSelectArea={handleLocateRecurrentArea}
            />

            {/* Seasonal Comparison Chart & Sensor Harmonization Audit */}
            <SeasonalComparisonChart
              calendar={calendarData}
              selectedYear={effectiveSelectedYear}
              harmonizationSummary={harmonizationSummary}
              seriesMode={seriesMode}
            />

            {/* Filtered Hotspots Operational Table */}
            <HotspotDetailTable hotspots={scopedHotspots} />
          </>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white mt-8">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            PyroCal · Calendario armonizado de focos activos MODIS (1 km) y VIIRS (375 m)
          </span>
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={rangeHotspots.length === 0}
            className="text-slate-700 hover:text-slate-900 font-medium hover:underline disabled:opacity-40"
          >
            Descargar CSV de la selección actual
          </button>
        </div>
      </footer>

      <CoordinatesModal
        isOpen={isCoordsModalOpen}
        defaultCenter={mapCenter}
        onClose={() => setIsCoordsModalOpen(false)}
        onApplyAOI={(nextAoi) => {
          setAoi(nextAoi);
          setDrawMode('pan');
        }}
      />

      <DataUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        existingFileCount={loadedFiles.length}
        onImportFiles={handleImportFiles}
      />
    </div>
  );
}
