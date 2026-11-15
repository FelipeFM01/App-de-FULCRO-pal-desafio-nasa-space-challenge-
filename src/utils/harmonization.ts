import {
  AreaOfInterest,
  CalendarCell,
  FireCalendarData,
  HarmonizationSummary,
  HarmonizedHotspot,
  MonthlyBaseline,
  RawHotspot,
  SeriesMode,
  SeverityBand,
} from '../types/fire';

export const MONTH_SHORT_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

export const MONTH_FULL_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DEFAULT_MODIS_TO_VIIRS_FACTOR = 3.45;
const MIN_CALIBRATION_FACTOR = 2.0;
const MAX_CALIBRATION_FACTOR = 5.0;

/**
 * Computes day of year (1-366) from ISO YYYY-MM-DD string.
 */
export function getDayOfYear(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return 1;
  const start = Date.UTC(y, 0, 0);
  const current = Date.UTC(y, m - 1, d);
  return Math.max(1, Math.floor((current - start) / 86400000));
}

/**
 * Haversine distance between two coordinates in kilometers.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Infers probable ignition / fire driver from physical and land-cover parameters.
 */
export function inferProbableCause(params: {
  landCover?: string;
  frpMW: number;
  month: number;
  latitude: number;
  explicitCause?: string;
}): string {
  if (params.explicitCause && params.explicitCause.trim().length > 2) {
    return params.explicitCause.trim();
  }
  const lc = (params.landCover || '').toLowerCase();
  if (lc.includes('industrial') || lc.includes('extractivo')) {
    return 'Actividad industrial / quema controlada';
  }
  if (lc.includes('agrícola') || lc.includes('agricola')) {
    return 'Quema agrícola de rastrojos o pasturas';
  }
  if (lc.includes('interfaz') || lc.includes('urbano')) {
    return 'Incendio en interfaz urbano-forestal';
  }
  if (lc.includes('plantación') || lc.includes('plantacion')) {
    return params.frpMW >= 45
      ? 'Incendio forestal de alta propagación'
      : 'Quema de desechos silviculturales / negligencia';
  }
  if (lc.includes('bosque') || lc.includes('matorral')) {
    return params.frpMW >= 55
      ? 'Incendio forestal severo (propagación activa)'
      : 'Foco forestal / tormenta seca o ignición dispersa';
  }
  if (params.frpMW >= 60) {
    return 'Incendio forestal intenso';
  }
  if (params.frpMW <= 12) {
    return 'Quema agrícola o limpieza de terreno';
  }
  return 'Ignición en cobertura vegetal mixta';
}

function parseMinutesOfDay(acqTime: string): number {
  const digits = acqTime.replace(/\D/g, '').padStart(4, '0');
  const h = Number(digits.slice(0, 2));
  const m = Number(digits.slice(2, 4));
  return (Number.isFinite(h) ? h : 12) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Harmonizes heterogeneous MODIS (1 km) and VIIRS (375 m) active-fire records
 * into a single cross-calibrated time series:
 * 1. Estimates empirical overlap ratio k = VIIRS / MODIS during overlapping years (2012+).
 * 2. Deduplicates co-located MODIS & VIIRS detections on the same day within ~1.2 km
 *    and ±120 minutes, retaining the higher-resolution VIIRS detection when both exist.
 * 3. Scales MODIS-only detections by k so pre-2012 history is directly comparable
 *    to modern VIIRS records without sensor-transition step artifacts.
 */
export function harmonizeHotspots(raw: RawHotspot[]): {
  hotspots: HarmonizedHotspot[];
  summary: HarmonizationSummary;
} {
  if (raw.length === 0) {
    return {
      hotspots: [],
      summary: {
        calibrationFactor: DEFAULT_MODIS_TO_VIIRS_FACTOR,
        overlapYears: [],
        rawModisCount: 0,
        rawViirsCount: 0,
        dedupedRemovedCount: 0,
        totalHarmonizedEquivalent: 0,
      },
    };
  }

  let rawModisCount = 0;
  let rawViirsCount = 0;
  const modisByYear = new Map<number, number>();
  const viirsByYear = new Map<number, number>();

  for (const r of raw) {
    const year = Number(r.acqDate.slice(0, 4));
    if (r.sensor === 'MODIS') {
      rawModisCount += 1;
      modisByYear.set(year, (modisByYear.get(year) || 0) + 1);
    } else {
      rawViirsCount += 1;
      viirsByYear.set(year, (viirsByYear.get(year) || 0) + 1);
    }
  }

  // Find overlap years where both MODIS and VIIRS have meaningful detections
  const overlapYears: number[] = [];
  let overlapModis = 0;
  let overlapViirs = 0;
  for (const [y, mCount] of modisByYear.entries()) {
    const vCount = viirsByYear.get(y) || 0;
    if (mCount >= 5 && vCount >= 5) {
      overlapYears.push(y);
      overlapModis += mCount;
      overlapViirs += vCount;
    }
  }
  overlapYears.sort((a, b) => a - b);

  let calibrationFactor = DEFAULT_MODIS_TO_VIIRS_FACTOR;
  if (overlapModis >= 8 && overlapViirs >= 10) {
    const ratio = overlapViirs / overlapModis;
    calibrationFactor = Number(
      Math.min(MAX_CALIBRATION_FACTOR, Math.max(MIN_CALIBRATION_FACTOR, ratio)).toFixed(2)
    );
  }

  // Group by date for spatial-temporal cross-sensor deduplication
  const byDate = new Map<string, RawHotspot[]>();
  for (const item of raw) {
    const list = byDate.get(item.acqDate);
    if (list) list.push(item);
    else byDate.set(item.acqDate, [item]);
  }

  const harmonized: HarmonizedHotspot[] = [];
  let dedupedRemovedCount = 0;

  for (const [, dayItems] of byDate.entries()) {
    const viirsItems = dayItems.filter((d) => d.sensor === 'VIIRS');
    const modisItems = dayItems.filter((d) => d.sensor === 'MODIS');

    for (const v of viirsItems) {
      const year = Number(v.acqDate.slice(0, 4));
      const month = Number(v.acqDate.slice(5, 7));
      harmonized.push({
        ...v,
        year,
        month,
        dayOfYear: getDayOfYear(v.acqDate),
        harmonizedWeight: 1,
        harmonizedFrpMW: Number(v.frpMW.toFixed(1)),
        deduped: true,
        resolvedLandCover: v.landCover || 'Cobertura mixta',
        resolvedRegion: v.region?.trim() || '',
        resolvedCause: inferProbableCause({
          landCover: v.landCover,
          frpMW: v.frpMW,
          month,
          latitude: v.latitude,
          explicitCause: v.probableCause,
        }),
      });
    }

    for (const m of modisItems) {
      const mMin = parseMinutesOfDay(m.acqTime);
      // Check if a VIIRS hotspot already detected this same active fire cluster
      const hasColocatedViirs = viirsItems.some((v) => {
        if (Math.abs(v.latitude - m.latitude) > 0.015 || Math.abs(v.longitude - m.longitude) > 0.015) {
          return false;
        }
        const distKm = haversineKm(m.latitude, m.longitude, v.latitude, v.longitude);
        const vMin = parseMinutesOfDay(v.acqTime);
        return distKm <= 1.2 && Math.abs(vMin - mMin) <= 150;
      });

      if (hasColocatedViirs) {
        dedupedRemovedCount += 1;
        continue;
      }

      const year = Number(m.acqDate.slice(0, 4));
      const month = Number(m.acqDate.slice(5, 7));
      // MODIS 1km pixels aggregate sub-pixel thermal energy; normalize FRP gently
      const normalizedFrp = Number((m.frpMW * 0.88).toFixed(1));
      harmonized.push({
        ...m,
        year,
        month,
        dayOfYear: getDayOfYear(m.acqDate),
        harmonizedWeight: calibrationFactor,
        harmonizedFrpMW: normalizedFrp,
        deduped: true,
        resolvedLandCover: m.landCover || 'Cobertura mixta',
        resolvedRegion: m.region?.trim() || '',
        resolvedCause: inferProbableCause({
          landCover: m.landCover,
          frpMW: normalizedFrp,
          month,
          latitude: m.latitude,
          explicitCause: m.probableCause,
        }),
      });
    }
  }

  harmonized.sort((a, b) => (a.acqDate < b.acqDate ? -1 : a.acqDate > b.acqDate ? 1 : 0));

  const totalHarmonizedEquivalent = Number(
    harmonized.reduce((acc, h) => acc + h.harmonizedWeight, 0).toFixed(1)
  );

  return {
    hotspots: harmonized,
    summary: {
      calibrationFactor,
      overlapYears,
      rawModisCount,
      rawViirsCount,
      dedupedRemovedCount,
      totalHarmonizedEquivalent,
    },
  };
}

/**
 * Selects hotspots matching the requested sensor series mode:
 * - 'harmonized': cross-calibrated & co-location deduplicated MODIS + VIIRS
 * - 'raw': uncalibrated combined MODIS + VIIRS detections (weight = 1)
 * - 'modis': strictly MODIS detections (including those that overlapped with VIIRS)
 * - 'viirs': strictly VIIRS detections
 */
export function selectSeriesHotspots(
  raw: RawHotspot[],
  harmonizedAll: HarmonizedHotspot[],
  mode: SeriesMode
): HarmonizedHotspot[] {
  if (mode === 'harmonized') return harmonizedAll;

  const filteredRaw =
    mode === 'modis'
      ? raw.filter((r) => r.sensor === 'MODIS')
      : mode === 'viirs'
      ? raw.filter((r) => r.sensor === 'VIIRS')
      : raw;

  return filteredRaw
    .map((r) => {
      const year = Number(r.acqDate.slice(0, 4));
      const month = Number(r.acqDate.slice(5, 7));
      return {
        ...r,
        year,
        month,
        dayOfYear: getDayOfYear(r.acqDate),
        harmonizedWeight: 1,
        harmonizedFrpMW: Number(r.frpMW.toFixed(1)),
        deduped: false,
        resolvedLandCover: r.landCover || 'Cobertura mixta',
        resolvedRegion: r.region?.trim() || '',
        resolvedCause: inferProbableCause({
          landCover: r.landCover,
          frpMW: r.frpMW,
          month,
          latitude: r.latitude,
          explicitCause: r.probableCause,
        }),
      };
    })
    .sort((a, b) => (a.acqDate < b.acqDate ? -1 : a.acqDate > b.acqDate ? 1 : 0));
}

/**
 * Ray-casting point-in-polygon check for [lat, lon] vertices.
 */
export function isPointInPolygon(lat: number, lon: number, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0];
    const xi = polygon[i][1];
    const yj = polygon[j][0];
    const xj = polygon[j][1];

    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Filters hotspots inside a drawn or coordinate-defined Area of Interest (AOI).
 */
export function filterByAOI<T extends { latitude: number; longitude: number }>(
  hotspots: T[],
  aoi: AreaOfInterest | null
): T[] {
  if (!aoi) return hotspots;

  if (aoi.type === 'bbox') {
    const minLat = Math.min(aoi.minLat, aoi.maxLat);
    const maxLat = Math.max(aoi.minLat, aoi.maxLat);
    const minLon = Math.min(aoi.minLon, aoi.maxLon);
    const maxLon = Math.max(aoi.minLon, aoi.maxLon);
    return hotspots.filter(
      (h) => h.latitude >= minLat && h.latitude <= maxLat && h.longitude >= minLon && h.longitude <= maxLon
    );
  }

  if (aoi.type === 'circle') {
    return hotspots.filter(
      (h) => haversineKm(aoi.centerLat, aoi.centerLon, h.latitude, h.longitude) <= aoi.radiusKm
    );
  }

  return hotspots.filter((h) => isPointInPolygon(h.latitude, h.longitude, aoi.points));
}

export function quantile(sortedAsc: number[], q: number): number {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sortedAsc[base + 1] !== undefined) {
    return sortedAsc[base] + rest * (sortedAsc[base + 1] - sortedAsc[base]);
  }
  return sortedAsc[base];
}

function classifySeverity(count: number, median: number, p75: number, p90: number): SeverityBand {
  if (count <= 0) return 'none';
  if (p90 > 0 && count >= Math.max(p90 * 1.15, median * 2.2)) return 'critical';
  if (p75 > 0 && count >= Math.max(p75, median * 1.45)) return 'high';
  if (median > 0 && count > median * 1.1) return 'elevated';
  if (median > 0 && count < median * 0.4) return 'low';
  return 'normal';
}

/**
 * Builds the Year x Month Harmonized Fire Activity Calendar matrix,
 * including historical medians, interquartile spreads, and anomaly percentages.
 */
export function buildFireCalendar(
  hotspots: HarmonizedHotspot[],
  startYear: number,
  endYear: number,
  mode: SeriesMode = 'harmonized'
): FireCalendarData {
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }

  interface Bucket {
    harmonizedWeight: number;
    rawModis: number;
    rawViirs: number;
    totalFrp: number;
    maxFrp: number;
    pointCount: number;
    causeCounts: Map<string, number>;
  }

  const buckets = new Map<string, Bucket>();

  for (const h of hotspots) {
    if (h.year < startYear || h.year > endYear) continue;
    const key = `${h.year}-${h.month}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        harmonizedWeight: 0,
        rawModis: 0,
        rawViirs: 0,
        totalFrp: 0,
        maxFrp: 0,
        pointCount: 0,
        causeCounts: new Map<string, number>(),
      };
      buckets.set(key, b);
    }
    b.harmonizedWeight += mode === 'harmonized' ? h.harmonizedWeight : 1;
    if (h.sensor === 'MODIS') b.rawModis += 1;
    else b.rawViirs += 1;
    b.totalFrp += h.harmonizedFrpMW;
    if (h.harmonizedFrpMW > b.maxFrp) b.maxFrp = h.harmonizedFrpMW;
    b.pointCount += 1;
    b.causeCounts.set(h.resolvedCause, (b.causeCounts.get(h.resolvedCause) || 0) + h.harmonizedWeight);
  }

  // Monthly baseline distribution across all years
  const monthlyBaselines: MonthlyBaseline[] = [];
  for (let m = 1; m <= 12; m++) {
    const vals: number[] = [];
    let maxVal = 0;
    let maxYear = startYear;
    for (const y of years) {
      const b = buckets.get(`${y}-${m}`);
      const val = b ? Math.round(b.harmonizedWeight) : 0;
      vals.push(val);
      if (val >= maxVal) {
        maxVal = val;
        maxYear = y;
      }
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    monthlyBaselines.push({
      month: m,
      median: Math.round(quantile(sorted, 0.5)),
      p25: Math.round(quantile(sorted, 0.25)),
      p75: Math.round(quantile(sorted, 0.75)),
      p90: Math.round(quantile(sorted, 0.9)),
      mean: Number(mean.toFixed(1)),
      maxYear,
      maxValue: maxVal,
    });
  }

  let maxCellValue = 0;
  const cells: CalendarCell[][] = [];
  const yearTotals: { year: number; harmonizedTotal: number; rawTotal: number; maxFrpMW: number }[] = [];

  for (const y of years) {
    const row: CalendarCell[] = [];
    let yearHarm = 0;
    let yearRaw = 0;
    let yearMaxFrp = 0;

    for (let m = 1; m <= 12; m++) {
      const b = buckets.get(`${y}-${m}`);
      const baseline = monthlyBaselines[m - 1];
      const count = b ? Math.round(b.harmonizedWeight) : 0;
      const rawTotal = b ? b.rawModis + b.rawViirs : 0;

      if (count > maxCellValue) maxCellValue = count;
      yearHarm += count;
      yearRaw += rawTotal;
      if (b && b.maxFrp > yearMaxFrp) yearMaxFrp = b.maxFrp;

      let dominantCause = 'Sin actividad registrada';
      if (b && b.causeCounts.size > 0) {
        let topWeight = -1;
        for (const [cause, w] of b.causeCounts.entries()) {
          if (w > topWeight) {
            topWeight = w;
            dominantCause = cause;
          }
        }
      }

      const anomalyPct =
        baseline.median > 0
          ? Math.round(((count - baseline.median) / baseline.median) * 100)
          : count > 0
          ? 100
          : null;

      row.push({
        year: y,
        month: m,
        harmonizedCount: count,
        rawModisCount: b ? b.rawModis : 0,
        rawViirsCount: b ? b.rawViirs : 0,
        totalFrpMW: b ? Math.round(b.totalFrp) : 0,
        maxFrpMW: b ? Number(b.maxFrp.toFixed(1)) : 0,
        meanFrpMW: b && b.pointCount > 0 ? Number((b.totalFrp / b.pointCount).toFixed(1)) : 0,
        medianHistorical: baseline.median,
        p75Historical: baseline.p75,
        p90Historical: baseline.p90,
        anomalyPct,
        severity: classifySeverity(count, baseline.median, baseline.p75, baseline.p90),
        dominantCause,
      });
    }
    cells.push(row);
    yearTotals.push({
      year: y,
      harmonizedTotal: yearHarm,
      rawTotal: yearRaw,
      maxFrpMW: Number(yearMaxFrp.toFixed(1)),
    });
  }

  return {
    years,
    cells,
    yearTotals,
    monthlyBaselines,
    maxCellValue,
  };
}
