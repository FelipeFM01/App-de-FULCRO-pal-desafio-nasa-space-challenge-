import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { LoadedDatabaseFile, RawHotspot, SensorSource } from '../types/fire';
import {
  ColumnMapping,
  ParsedTabularPreview,
  generateSampleTemplateCSV,
  mapRowsToHotspots,
  parseDataBuffer,
  parseSpreadsheetFile,
} from '../utils/importer';

interface QueuedFileItem {
  id: string;
  buffer: ArrayBuffer;
  preview: ParsedTabularPreview;
  mapping: ColumnMapping;
  defaultSensor: 'auto' | SensorSource;
}

interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingFileCount: number;
  onImportFiles: (hotspots: RawHotspot[], files: LoadedDatabaseFile[]) => void;
}

export const DataUploadModal: React.FC<DataUploadModalProps> = ({
  isOpen,
  onClose,
  existingFileCount,
  onImportFiles,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [queue, setQueue] = useState<QueuedFileItem[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const activeItem = queue.find((item) => item.id === activeFileId) || queue[0] || null;

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setError(null);
    setIsLoading(true);
    const added: QueuedFileItem[] = [];
    const errors: string[] = [];

    for (const file of files) {
      try {
        const { preview, buffer } = await parseSpreadsheetFile(file);
        added.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          buffer,
          preview,
          mapping: preview.suggestedMapping,
          defaultSensor: preview.inferredDefaultSensor,
        });
      } catch (err) {
        errors.push(
          err instanceof Error
            ? err.message
            : `No se pudo leer "${file.name}". Verifica el formato.`
        );
      }
    }

    if (added.length > 0) {
      setQueue((prev) => [...prev, ...added]);
      setActiveFileId((prevId) => prevId || added[0].id);
    }

    if (errors.length > 0) {
      setError(errors.join(' '));
    }

    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (id: string) => {
    setQueue((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activeFileId === id) {
        setActiveFileId(next[0]?.id || null);
      }
      return next;
    });
  };

  const handleChangeSheet = (itemId: string, sheetSelection: string) => {
    setError(null);
    setQueue((prev) =>
      prev.map((item) => {
        if (item.id !== itemId) return item;
        try {
          const nextPreview = parseDataBuffer(item.buffer, item.preview.fileName, sheetSelection);
          return {
            ...item,
            preview: nextPreview,
            mapping: nextPreview.suggestedMapping,
          };
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo leer la hoja seleccionada.');
          return item;
        }
      })
    );
  };

  const updateItemMapping = (itemId: string, key: keyof ColumnMapping, value: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              mapping: {
                ...item.mapping,
                [key]: value || undefined,
              },
            }
          : item
      )
    );
  };

  const updateItemDefaultSensor = (itemId: string, sensor: 'auto' | SensorSource) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, defaultSensor: sensor } : item))
    );
  };

  const handleConfirmImport = () => {
    if (queue.length === 0) return;
    setError(null);

    const allHotspots: RawHotspot[] = [];
    const fileSummaries: LoadedDatabaseFile[] = [];
    let totalSkipped = 0;

    try {
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        if (!item.mapping.latitude || !item.mapping.longitude || !item.mapping.acqDate) {
          setActiveFileId(item.id);
          setError(
            `El archivo "${item.preview.fileName}" requiere asignar las columnas de Latitud, Longitud y Fecha.`
          );
          return;
        }

        const { hotspots, skippedCount } = mapRowsToHotspots(item.preview.rows, item.mapping, {
          sourceFile: item.preview.fileName,
          fileIndex: i + 1,
          defaultSensor: item.defaultSensor,
        });

        totalSkipped += skippedCount;

        if (hotspots.length === 0) {
          setActiveFileId(item.id);
          setError(
            `El archivo "${item.preview.fileName}" no generó filas válidas (${skippedCount} omitidas). Revisa las columnas asignadas.`
          );
          return;
        }

        let modisCount = 0;
        let viirsCount = 0;
        let minYear = 9999;
        let maxYear = 0;
        for (const h of hotspots) {
          if (h.sensor === 'MODIS') modisCount += 1;
          else viirsCount += 1;
          const y = Number(h.acqDate.slice(0, 4));
          if (y < minYear) minYear = y;
          if (y > maxYear) maxYear = y;
        }

        allHotspots.push(...hotspots);
        fileSummaries.push({
          id: item.id,
          fileName: item.preview.fileName,
          sheetNames: item.preview.sheetNames,
          rowCount: hotspots.length,
          modisCount,
          viirsCount,
          minYear: minYear <= maxYear ? minYear : null,
          maxYear: minYear <= maxYear ? maxYear : null,
        });
      }

      if (allHotspots.length === 0) {
        setError(`No se encontraron registros válidos (${totalSkipped} omitidos).`);
        return;
      }

      onImportFiles(allHotspots, fileSummaries);
      setQueue([]);
      setActiveFileId(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar los archivos.');
    }
  };

  const handleDownloadSample = () => {
    const csv = generateSampleTemplateCSV();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_focos_firms.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalQueuedRows = queue.reduce((acc, q) => acc + q.preview.rows.length, 0);
  const allMapped =
    queue.length > 0 &&
    queue.every((q) => Boolean(q.mapping.latitude && q.mapping.longitude && q.mapping.acqDate));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="upload-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-slate-700" aria-hidden="true" />
            <h2 id="upload-modal-title" className="text-sm font-semibold text-slate-900">
              Cargar múltiples archivos Excel / bases de datos de incendios
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar carga de datos"
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Replacement notice */}
          <div className="bg-sky-50 border border-sky-200 rounded-md px-3.5 py-2.5 text-xs text-sky-950 flex flex-wrap items-center justify-between gap-2">
            <span>
              <strong>Modo base exclusiva:</strong> al confirmar, se{' '}
              {existingFileCount > 0 ? 'eliminarán los archivos anteriores y se usarán' : 'usarán'}{' '}
              únicamente las bases de datos cargadas en esta lista.
            </span>
          </div>

          {/* Multi-file Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) {
                void handleFiles(e.dataTransfer.files);
              }
            }}
            className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-lg p-5 text-center bg-slate-50/70 transition-colors"
          >
            <Upload className="w-6 h-6 text-slate-500 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-slate-800">
              Arrastra uno o varios archivos Excel aquí, o selecciónalos desde tu equipo
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Compatible con múltiples libros Excel (.xlsx, .xls, .ods), CSV (.csv) y JSON / GeoJSON
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md">
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {queue.length > 0 ? 'Agregar más archivos Excel' : 'Seleccionar archivos'}
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".csv,.xlsx,.xls,.ods,.json,.geojson"
                  className="sr-only"
                  onChange={(e) => {
                    if (e.target.files?.length) {
                      void handleFiles(e.target.files);
                    }
                  }}
                />
              </label>

              <button
                type="button"
                onClick={handleDownloadSample}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Plantilla CSV</span>
              </button>
            </div>
          </div>

          {isLoading && (
            <p className="text-xs text-slate-600 font-medium">
              Analizando archivos seleccionados...
            </p>
          )}

          {error && (
            <p
              role="alert"
              className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2"
            >
              {error}
            </p>
          )}

          {/* Queued Files List + Active File Column Mapping */}
          {queue.length > 0 && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-semibold text-slate-900">
                  Archivos en este lote ({queue.length}) ·{' '}
                  <span className="font-mono text-slate-600">
                    {totalQueuedRows.toLocaleString('es-ES')} filas totales
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setQueue([]);
                    setActiveFileId(null);
                    setError(null);
                  }}
                  className="text-xs text-rose-700 hover:text-rose-900 font-medium hover:underline"
                >
                  Limpiar lista
                </button>
              </div>

              {/* File Queue Tabs / Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {queue.map((item) => {
                  const isActive = activeItem?.id === item.id;
                  const isReady = Boolean(
                    item.mapping.latitude && item.mapping.longitude && item.mapping.acqDate
                  );
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 p-2.5 rounded-md border text-xs transition-colors ${
                        isActive
                          ? 'border-sky-500 bg-sky-50/60'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveFileId(item.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2
                            className={`w-3.5 h-3.5 shrink-0 ${
                              isReady ? 'text-emerald-600' : 'text-amber-500'
                            }`}
                            aria-hidden="true"
                          />
                          <span className="font-semibold text-slate-900 truncate">
                            {item.preview.fileName}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {item.preview.rows.length.toLocaleString('es-ES')} filas ·{' '}
                          {item.preview.format.toUpperCase()}
                          {item.preview.sheetNames.length > 1
                            ? ` · ${item.preview.sheetNames.length} hojas`
                            : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(item.id)}
                        aria-label={`Quitar ${item.preview.fileName}`}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Active File Configuration & Column Mapping */}
              {activeItem && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs font-semibold text-slate-900">
                      Configuración de columnas: {activeItem.preview.fileName}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {activeItem.preview.sheetNames.length > 1 && (
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="sheet-select" className="text-slate-600 font-medium">
                            Hoja:
                          </label>
                          <select
                            id="sheet-select"
                            value={activeItem.preview.selectedSheet}
                            onChange={(e) => handleChangeSheet(activeItem.id, e.target.value)}
                            className="h-7 px-2 bg-white border border-slate-300 rounded text-xs"
                          >
                            <option value="__ALL__">
                              Todas las hojas ({activeItem.preview.sheetNames.length})
                            </option>
                            {activeItem.preview.sheetNames.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="flex items-center gap-1.5">
                        <label htmlFor="default-sensor-select" className="text-slate-600 font-medium">
                          Sensor por defecto:
                        </label>
                        <select
                          id="default-sensor-select"
                          value={activeItem.defaultSensor}
                          onChange={(e) =>
                            updateItemDefaultSensor(
                              activeItem.id,
                              e.target.value as 'auto' | SensorSource
                            )
                          }
                          className="h-7 px-2 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value="auto">Automático (por fila)</option>
                          <option value="MODIS">MODIS (1 km)</option>
                          <option value="VIIRS">VIIRS (375 m)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    {(
                      [
                        { key: 'latitude', label: 'Latitud *' },
                        { key: 'longitude', label: 'Longitud *' },
                        { key: 'acqDate', label: 'Fecha (acq_date) *' },
                        { key: 'region', label: 'Región / Zona (opcional)' },
                        { key: 'sensor', label: 'Sensor (MODIS/VIIRS)' },
                        { key: 'satellite', label: 'Satélite (opcional)' },
                        { key: 'frpMW', label: 'FRP (MW)' },
                        { key: 'landCover', label: 'Cobertura (opcional)' },
                        { key: 'probableCause', label: 'Causa (opcional)' },
                      ] as const
                    ).map((field) => (
                      <div key={field.key}>
                        <label
                          htmlFor={`map-${field.key}`}
                          className="block font-medium text-slate-700 mb-1"
                        >
                          {field.label}
                        </label>
                        <select
                          id={`map-${field.key}`}
                          value={(activeItem.mapping[field.key] as string) || ''}
                          onChange={(e) =>
                            updateItemMapping(activeItem.id, field.key, e.target.value)
                          }
                          className="w-full h-8 px-2 bg-white border border-slate-300 rounded text-xs"
                        >
                          <option value="">— No asignar —</option>
                          {activeItem.preview.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {queue.length > 0
              ? `${queue.length} archivo${queue.length === 1 ? '' : 's'} listo${
                  queue.length === 1 ? '' : 's'
                }`
              : 'Ningún archivo seleccionado'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!allMapped}
              onClick={handleConfirmImport}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-md"
            >
              Armonizar y usar solo estas bases
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
