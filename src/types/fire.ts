export type SensorSource = 'MODIS' | 'VIIRS';

export type SeriesMode = 'harmonized' | 'raw' | 'modis' | 'viirs';

export type LandCoverType =
  | 'Bosque nativo'
  | 'Plantación forestal'
  | 'Matorral y pastizal'
  | 'Agrícola'
  | 'Interfaz urbano-forestal'
  | 'Industrial / extractivo';

export interface RawHotspot {
  id: string;
  latitude: number;
  longitude: number;
  acqDate: string; // ISO YYYY-MM-DD
  acqTime: string; // HHMM or HH:MM
  sensor: SensorSource;
  satellite: string;
  frpMW: number; // Fire Radiative Power in Megawatts
  brightnessK: number; // Brightness temperature in Kelvin
  confidence: 'low' | 'nominal' | 'high';
  landCover?: LandCoverType | string;
  probableCause?: string;
  region?: string;
  sourceFile?: string;
}

export interface HarmonizedHotspot extends RawHotspot {
  year: number;
  month: number; // 1..12
  dayOfYear: number;
  harmonizedWeight: number; // Calibrated VIIRS-375m equivalent activity weight (or 1 in raw/single-sensor modes)
  harmonizedFrpMW: number; // Cross-sensor normalized radiative power (MW)
  deduped: boolean; // True if kept after cross-sensor co-location deduplication
  resolvedCause: string;
  resolvedLandCover: string;
  resolvedRegion: string;
  resolvedCountry?: string;
}

export interface HarmonizationSummary {
  calibrationFactor: number; // Empirical MODIS -> VIIRS-eq scaling factor
  overlapYears: number[];
  rawModisCount: number;
  rawViirsCount: number;
  dedupedRemovedCount: number;
  totalHarmonizedEquivalent: number;
}

export interface LoadedDatabaseFile {
  id: string;
  fileName: string;
  sheetNames: string[];
  rowCount: number;
  modisCount: number;
  viirsCount: number;
  minYear: number | null;
  maxYear: number | null;
}

export interface RegionOption {
  id: string; // 'all' | 'region:<name>' | 'country:<name>' | 'chile-region:<name>' | 'file:<name>'
  label: string;
  group: 'all' | 'region' | 'chile-region' | 'country' | 'file';
  count: number;
}

export type AreaOfInterest =
  | {
      type: 'bbox';
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
      label?: string;
    }
  | {
      type: 'polygon';
      points: [number, number][]; // [lat, lon][]
      label?: string;
    }
  | {
      type: 'circle';
      centerLat: number;
      centerLon: number;
      radiusKm: number;
      label?: string;
    };

export type SeverityBand = 'none' | 'low' | 'normal' | 'elevated' | 'high' | 'critical';

export interface CalendarCell {
  year: number;
  month: number; // 1..12
  harmonizedCount: number;
  rawModisCount: number;
  rawViirsCount: number;
  totalFrpMW: number;
  maxFrpMW: number;
  meanFrpMW: number;
  medianHistorical: number;
  p75Historical: number;
  p90Historical: number;
  anomalyPct: number | null;
  severity: SeverityBand;
  dominantCause: string;
}

export interface MonthlyBaseline {
  month: number; // 1..12
  median: number;
  p25: number;
  p75: number;
  p90: number;
  mean: number;
  maxYear: number;
  maxValue: number;
}

export interface FireCalendarData {
  years: number[];
  cells: CalendarCell[][]; // [yearIdx][monthIdx 0..11]
  yearTotals: { year: number; harmonizedTotal: number; rawTotal: number; maxFrpMW: number }[];
  monthlyBaselines: MonthlyBaseline[];
  maxCellValue: number;
}

export interface RecurrentBurnArea {
  id: string;
  label: string;
  centroidLat: number;
  centroidLon: number;
  hullPolygon: [number, number][]; // [lat, lon][]
  areaKm2: number;
  areaHa: number;
  eventCount: number; // Distinct fire episodes (>= 14 days apart)
  distinctYears: number[];
  yearsSpan: string;
  avgReturnYears: number | null;
  recurrenceLevel: 'Ocasional' | 'Frecuente' | 'Crónica';
  approximateCause: string;
  causeRationale: string;
  approximateDates: string;
  peakSeasonMonths: string;
  lastEventDate: string;
  firstEventDate: string;
  avgFrpMW: number;
  maxFrpMW: number;
  hotspotCount: number;
  harmonizedTotal: number;
  sampleDates: string[];
}
