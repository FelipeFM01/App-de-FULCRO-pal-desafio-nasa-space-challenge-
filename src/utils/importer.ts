import * as XLSX from 'xlsx';
import { HarmonizedHotspot, RawHotspot, SensorSource } from '../types/fire';

export interface ColumnMapping {
  latitude: string;
  longitude: string;
  acqDate: string;
  acqTime?: string;
  sensor?: string;
  satellite?: string;
  frpMW?: string;
  brightnessK?: string;
  confidence?: string;
  landCover?: string;
  probableCause?: string;
  region?: string;
}

export interface ParsedTabularPreview {
  fileName: string;
  headers: string[];
  rows: Record<string, unknown>[];
  suggestedMapping: ColumnMapping;
  format: 'csv' | 'excel' | 'json';
  sheetNames: string[];
  selectedSheet: string;
  inferredDefaultSensor: 'auto' | SensorSource;
}

const COLUMN_SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  latitude: ['latitude', 'lat', 'latitud', 'y', 'coord_y', 'lat_dd'],
  longitude: ['longitude', 'lon', 'lng', 'longitud', 'x', 'coord_x', 'lon_dd'],
  acqDate: ['acq_date', 'date', 'fecha', 'acqdate', 'timestamp', 'fecha_evento', 'observation_date', 'fecha_foco'],
  acqTime: ['acq_time', 'time', 'hora', 'acqtime'],
  sensor: ['instrument', 'sensor', 'fuente', 'source'],
  satellite: ['satellite', 'satelite', 'sat'],
  frpMW: ['frp', 'frp_mw', 'power', 'potencia', 'radiative_power'],
  brightnessK: ['brightness', 'bright_ti4', 'bright_t31', 'temp', 'temperatura', 'brightness_k'],
  confidence: ['confidence', 'confianza', 'conf'],
  landCover: ['landcover', 'land_cover', 'cobertura', 'biome', 'uso_suelo'],
  probableCause: ['cause', 'causa', 'probable_cause', 'origen', 'driver'],
  region: [
    'region',
    'región',
    'nom_reg',
    'nombre_region',
    'reg',
    'estado',
    'state',
    'provincia',
    'province',
    'comuna',
    'commune',
    'municipio',
    'municipality',
    'departamento',
    'department',
    'zona',
    'zone',
    'sector',
    'localidad',
    'distrito',
    'admin1',
    'admin2',
    'pais',
    'país',
    'country',
    'area_estudio',
    'cuenca',
  ],
};

export function inferSensorFromFileName(fileName: string): 'auto' | SensorSource {
  const lower = fileName.toLowerCase();
  const hasViirs =
    lower.includes('viirs') ||
    lower.includes('vnp') ||
    lower.includes('vj1') ||
    lower.includes('suomi') ||
    lower.includes('noaa');
  const hasModis =
    lower.includes('modis') ||
    lower.includes('mcd') ||
    lower.includes('myd') ||
    lower.includes('mod14') ||
    lower.includes('terra') ||
    lower.includes('aqua');

  if (hasViirs && !hasModis) return 'VIIRS';
  if (hasModis && !hasViirs) return 'MODIS';
  return 'auto';
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => ({
    original: h,
    norm: h
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s-]+/g, '_'),
  }));

  const findMatch = (keys: string[]): string | undefined => {
    for (const candidate of keys) {
      const cleanCand = candidate
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const exact = normalized.find((n) => n.norm === cleanCand);
      if (exact) return exact.original;
    }
    for (const candidate of keys) {
      const cleanCand = candidate
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const partial = normalized.find((n) => n.norm.includes(cleanCand));
      if (partial) return partial.original;
    }
    return undefined;
  };

  return {
    latitude: findMatch(COLUMN_SYNONYMS.latitude) || '',
    longitude: findMatch(COLUMN_SYNONYMS.longitude) || '',
    acqDate: findMatch(COLUMN_SYNONYMS.acqDate) || '',
    acqTime: findMatch(COLUMN_SYNONYMS.acqTime),
    sensor: findMatch(COLUMN_SYNONYMS.sensor),
    satellite: findMatch(COLUMN_SYNONYMS.satellite),
    frpMW: findMatch(COLUMN_SYNONYMS.frpMW),
    brightnessK: findMatch(COLUMN_SYNONYMS.brightnessK),
    confidence: findMatch(COLUMN_SYNONYMS.confidence),
    landCover: findMatch(COLUMN_SYNONYMS.landCover),
    probableCause: findMatch(COLUMN_SYNONYMS.probableCause),
    region: findMatch(COLUMN_SYNONYMS.region),
  };
}

function normalizeDateValue(val: unknown): string | null {
  if (val === null || val === undefined) return null;

  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }

  // Excel serial date number (1899-12-30 epoch accounts for Excel 1900 leap-year bug)
  if (typeof val === 'number' && val > 20000 && val < 70000) {
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(val) * 86400000;
    const d = new Date(utcMs);
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  const str = String(val).trim();
  if (!str) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const a = Number(dmyMatch[1]);
    const b = Number(dmyMatch[2]);
    const day = b > 12 ? b : a;
    const month = b > 12 ? a : b;
    return `${dmyMatch[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const ts = Date.parse(str);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeSensor(
  sensorVal: unknown,
  satVal: unknown,
  defaultSensor: 'auto' | SensorSource = 'auto'
): SensorSource {
  const combined = `${String(sensorVal || '')} ${String(satVal || '')}`.trim().toUpperCase();
  if (combined) {
    if (
      combined.includes('VIIRS') ||
      combined.includes('NPP') ||
      combined.includes('NOAA-20') ||
      combined.includes('NOAA-21') ||
      combined.includes('NOAA20') ||
      combined.includes('NOAA21') ||
      combined.includes('J1') ||
      combined.includes('J2') ||
      combined.includes('VNP') ||
      combined.includes('VJ1')
    ) {
      return 'VIIRS';
    }
    if (
      combined.includes('MODIS') ||
      combined.includes('TERRA') ||
      combined.includes('AQUA') ||
      combined.includes('MCD') ||
      combined.includes('MYD') ||
      combined.includes('MOD')
    ) {
      return 'MODIS';
    }
  }
  if (defaultSensor !== 'auto') {
    return defaultSensor;
  }
  return 'MODIS';
}

function normalizeConfidence(val: unknown): 'low' | 'nominal' | 'high' {
  if (typeof val === 'number') {
    if (val >= 75) return 'high';
    if (val >= 40) return 'nominal';
    return 'low';
  }
  const s = String(val || '').trim().toLowerCase();
  if (s === 'h' || s === 'high' || s === 'alta') return 'high';
  if (s === 'l' || s === 'low' || s === 'baja') return 'low';
  const num = Number(s);
  if (!Number.isNaN(num) && s !== '') {
    if (num >= 75) return 'high';
    if (num >= 40) return 'nominal';
    return 'low';
  }
  return 'nominal';
}

export interface MapRowsOptions {
  sourceFile?: string;
  fileIndex?: number;
  defaultSensor?: 'auto' | SensorSource;
}

export function mapRowsToHotspots(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  options?: MapRowsOptions
): { hotspots: RawHotspot[]; skippedCount: number } {
  if (!mapping.latitude || !mapping.longitude || !mapping.acqDate) {
    throw new Error('Debes asignar al menos las columnas de Latitud, Longitud y Fecha.');
  }

  const hotspots: RawHotspot[] = [];
  let skippedCount = 0;
  const filePrefix = options?.fileIndex !== undefined ? `f${options.fileIndex}-` : '';
  const defaultSensor = options?.defaultSensor ?? 'auto';

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const lat = Number(String(row[mapping.latitude] ?? '').replace(',', '.'));
    const lon = Number(String(row[mapping.longitude] ?? '').replace(',', '.'));
    const acqDate = normalizeDateValue(row[mapping.acqDate]);

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180 ||
      !acqDate
    ) {
      skippedCount += 1;
      continue;
    }

    const sensorRaw = mapping.sensor ? row[mapping.sensor] : undefined;
    const satRaw = mapping.satellite ? row[mapping.satellite] : undefined;
    const sensor = normalizeSensor(sensorRaw, satRaw, defaultSensor);

    const frpRaw = mapping.frpMW
      ? Number(String(row[mapping.frpMW] ?? '').replace(',', '.'))
      : NaN;
    const frpMW = Number.isFinite(frpRaw) && frpRaw >= 0 ? frpRaw : sensor === 'VIIRS' ? 18.5 : 26.0;

    const brightRaw = mapping.brightnessK
      ? Number(String(row[mapping.brightnessK] ?? '').replace(',', '.'))
      : NaN;
    const brightnessK = Number.isFinite(brightRaw) && brightRaw > 200 ? brightRaw : 328.0;

    const acqTimeRaw = mapping.acqTime ? String(row[mapping.acqTime] ?? '1430') : '1430';
    const acqTime = acqTimeRaw.replace(/\D/g, '').padStart(4, '0').slice(0, 4) || '1430';

    const regionVal =
      mapping.region && row[mapping.region] !== undefined && row[mapping.region] !== null
        ? String(row[mapping.region]).trim()
        : '';

    hotspots.push({
      id: `imp-${filePrefix}${i + 1}-${acqDate}`,
      latitude: Number(lat.toFixed(5)),
      longitude: Number(lon.toFixed(5)),
      acqDate,
      acqTime,
      sensor,
      satellite: satRaw && String(satRaw).trim() ? String(satRaw).trim() : sensor === 'VIIRS' ? 'Suomi NPP' : 'Aqua',
      frpMW: Number(frpMW.toFixed(1)),
      brightnessK: Number(brightnessK.toFixed(1)),
      confidence: normalizeConfidence(mapping.confidence ? row[mapping.confidence] : 'nominal'),
      landCover: mapping.landCover && row[mapping.landCover] ? String(row[mapping.landCover]).trim() : undefined,
      probableCause:
        mapping.probableCause && row[mapping.probableCause]
          ? String(row[mapping.probableCause]).trim()
          : undefined,
      region: regionVal || undefined,
      sourceFile: options?.sourceFile,
    });
  }

  return { hotspots, skippedCount };
}

/**
 * Parses an ArrayBuffer + filename from CSV, Excel (.xlsx/.xls/.ods), or JSON/GeoJSON.
 * For multi-sheet Excel workbooks, `sheetSelection` can be `'__ALL__'` (default) or a specific sheet name.
 */
export function parseDataBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  sheetSelection: string = '__ALL__'
): ParsedTabularPreview {
  const lower = fileName.toLowerCase();
  const inferredDefaultSensor = inferSensorFromFileName(fileName);

  if (lower.endsWith('.json') || lower.endsWith('.geojson')) {
    const text = new TextDecoder('utf-8').decode(buffer);
    const parsed = JSON.parse(text);

    let rows: Record<string, unknown>[] = [];
    if (Array.isArray(parsed)) {
      rows = parsed;
    } else if (parsed && parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
      rows = parsed.features.map((f: any) => {
        const coords = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates : [];
        return {
          longitude: coords[0],
          latitude: coords[1],
          ...(f.properties || {}),
        };
      });
    } else {
      throw new Error('Formato JSON no reconocido. Use un arreglo de objetos o GeoJSON FeatureCollection.');
    }

    const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
    return {
      fileName,
      headers,
      rows,
      suggestedMapping: autoDetectColumnMapping(headers),
      format: 'json',
      sheetNames: ['JSON'],
      selectedSheet: 'JSON',
      inferredDefaultSensor,
    };
  }

  // Excel (.xlsx / .xls / .ods) and CSV handled cleanly via SheetJS
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error(`El archivo "${fileName}" no contiene hojas de datos válidas.`);
  }

  const targetSheets =
    sheetSelection === '__ALL__' || !sheetNames.includes(sheetSelection)
      ? sheetNames
      : [sheetSelection];

  let combinedRows: Record<string, unknown>[] = [];
  const headerSet = new Set<string>();

  for (const sName of targetSheets) {
    const sheet = workbook.Sheets[sName];
    if (!sheet) continue;
    const sheetRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    if (sheetRows.length === 0) continue;
    for (const h of Object.keys(sheetRows[0])) {
      headerSet.add(h);
    }
    combinedRows = combinedRows.concat(sheetRows);
  }

  if (combinedRows.length === 0) {
    throw new Error(`La tabla importada en "${fileName}" está vacía.`);
  }

  const headers = Array.from(headerSet);
  const selectedSheet =
    sheetNames.length === 1
      ? sheetNames[0]
      : sheetSelection === '__ALL__'
      ? '__ALL__'
      : targetSheets[0];

  return {
    fileName,
    headers,
    rows: combinedRows,
    suggestedMapping: autoDetectColumnMapping(headers),
    format: lower.endsWith('.csv') ? 'csv' : 'excel',
    sheetNames,
    selectedSheet,
    inferredDefaultSensor,
  };
}

export async function parseSpreadsheetFile(file: File): Promise<{
  preview: ParsedTabularPreview;
  buffer: ArrayBuffer;
}> {
  const buffer = await file.arrayBuffer();
  const preview = parseDataBuffer(buffer, file.name, '__ALL__');
  return { preview, buffer };
}

/**
 * Generates CSV string from harmonized hotspots for download.
 */
export function buildHotspotsCSV(hotspots: HarmonizedHotspot[]): string {
  const headers = [
    'id',
    'acq_date',
    'acq_time',
    'latitude',
    'longitude',
    'region',
    'sensor_origen',
    'satellite',
    'harmonized_weight_viirs_eq',
    'frp_mw_harmonized',
    'brightness_k',
    'confidence',
    'land_cover',
    'probable_cause',
    'source_file',
  ];

  const escapeCsv = (v: unknown) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [headers.join(',')];
  for (const h of hotspots) {
    lines.push(
      [
        h.id,
        h.acqDate,
        h.acqTime,
        h.latitude,
        h.longitude,
        h.resolvedRegion || h.region || '',
        h.sensor,
        h.satellite,
        h.harmonizedWeight,
        h.harmonizedFrpMW,
        h.brightnessK,
        h.confidence,
        h.resolvedLandCover,
        h.resolvedCause,
        h.sourceFile || '',
      ]
        .map(escapeCsv)
        .join(',')
    );
  }
  return '\uFEFF' + lines.join('\n');
}

export function generateSampleTemplateCSV(): string {
  const rows = [
    'latitude,longitude,acq_date,acq_time,instrument,satellite,frp,brightness,confidence,region,landcover,cause',
    '-37.4682,-72.3521,2017-01-26,1430,MODIS,Aqua,94.5,352.4,high,Biobío,Plantación forestal,Incendio forestal de alta propagación',
    '-37.4710,-72.3490,2017-01-26,1445,VIIRS,Suomi NPP,88.2,349.8,high,Biobío,Plantación forestal,Incendio forestal de alta propagación',
    '-37.5120,-72.4105,2023-02-04,1510,VIIRS,NOAA-20,118.4,361.2,high,Biobío,Interfaz urbano-forestal,Incendio en interfaz urbano-forestal',
    '-38.0610,-72.8420,2024-03-12,1320,VIIRS,NOAA-20,14.2,318.5,nominal,La Araucanía,Agrícola,Quema agrícola de rastrojos o pasturas',
    '-38.0625,-72.8405,2025-03-18,1340,VIIRS,NOAA-21,16.8,321.1,nominal,La Araucanía,Agrícola,Quema agrícola de rastrojos o pasturas',
  ];
  return rows.join('\n');
}
