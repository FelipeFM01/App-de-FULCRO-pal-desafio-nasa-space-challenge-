import { HarmonizedHotspot, RecurrentBurnArea } from '../types/fire';
import { MONTH_SHORT_ES } from './harmonization';

interface GridCell {
  key: string;
  gx: number;
  gy: number;
  points: HarmonizedHotspot[];
}

/**
 * Andrew's Monotone Chain 2D Convex Hull algorithm over [lat, lon] points.
 * Returns polygon vertices in counter-clockwise order.
 */
export function computeConvexHull(points: [number, number][]): [number, number][] {
  if (points.length === 0) return [];
  const uniqueMap = new Map<string, [number, number]>();
  for (const p of points) {
    uniqueMap.set(`${p[0].toFixed(5)},${p[1].toFixed(5)}`, p);
  }
  const unique = Array.from(uniqueMap.values());

  if (unique.length === 1) {
    const [lat, lon] = unique[0];
    const dLat = 0.0055;
    const dLon = 0.0065;
    return [
      [lat - dLat, lon - dLon],
      [lat - dLat, lon + dLon],
      [lat + dLat, lon + dLon],
      [lat + dLat, lon - dLon],
    ];
  }

  if (unique.length === 2) {
    const [p1, p2] = unique;
    const pad = 0.0045;
    const minLat = Math.min(p1[0], p2[0]) - pad;
    const maxLat = Math.max(p1[0], p2[0]) + pad;
    const minLon = Math.min(p1[1], p2[1]) - pad;
    const maxLon = Math.max(p1[1], p2[1]) + pad;
    return [
      [minLat, minLon],
      [minLat, maxLon],
      [maxLat, maxLon],
      [maxLat, minLon],
    ];
  }

  const sorted = [...unique].sort((a, b) => (a[1] !== b[1] ? a[1] - b[1] : a[0] - b[0]));

  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);

  // Slightly expand hull outward from centroid (~375m VIIRS pixel footprint buffer)
  // so perimeter encompasses the actual thermal pixel extent rather than cutting point centers
  let cLat = 0;
  let cLon = 0;
  for (const [lat, lon] of hull) {
    cLat += lat;
    cLon += lon;
  }
  cLat /= hull.length;
  cLon /= hull.length;

  return hull.map(([lat, lon]) => {
    const dLat = lat - cLat;
    const dLon = lon - cLon;
    const len = Math.hypot(dLat, dLon) || 1;
    const pad = 0.0028; // ~310m pixel half-width
    return [
      Number((lat + (dLat / len) * pad).toFixed(5)),
      Number((lon + (dLon / len) * pad).toFixed(5)),
    ];
  });
}

/**
 * Estimates polygon area in km^2 using local equirectangular projection + Shoelace formula.
 */
export function computePolygonAreaKm2(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0.25;
  let meanLat = 0;
  for (const [lat] of polygon) meanLat += lat;
  meanLat /= polygon.length;

  const kmPerDegLat = 111.32;
  const kmPerDegLon = 111.32 * Math.cos((meanLat * Math.PI) / 180);

  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    const x1 = polygon[i][1] * kmPerDegLon;
    const y1 = polygon[i][0] * kmPerDegLat;
    const x2 = polygon[j][1] * kmPerDegLon;
    const y2 = polygon[j][0] * kmPerDegLat;
    area += x1 * y2 - x2 * y1;
  }
  return Math.max(0.14, Number((Math.abs(area) / 2).toFixed(2)));
}

/**
 * Counts distinct fire episodes separated by at least `gapDays` (default 14 days).
 */
function extractFireEpisodes(sortedHotspots: HarmonizedHotspot[], gapDays = 14): {
  episodes: { startDate: string; endDate: string; peakDate: string; count: number; maxFrp: number }[];
} {
  if (sortedHotspots.length === 0) return { episodes: [] };
  const episodes: {
    startDate: string;
    endDate: string;
    peakDate: string;
    count: number;
    maxFrp: number;
  }[] = [];

  let currentStart = sortedHotspots[0].acqDate;
  let currentEnd = sortedHotspots[0].acqDate;
  let peakDate = sortedHotspots[0].acqDate;
  let maxFrp = sortedHotspots[0].harmonizedFrpMW;
  let count = 1;

  for (let i = 1; i < sortedHotspots.length; i++) {
    const prevMs = Date.parse(currentEnd);
    const currMs = Date.parse(sortedHotspots[i].acqDate);
    const diffDays = (currMs - prevMs) / 86400000;

    if (diffDays <= gapDays) {
      currentEnd = sortedHotspots[i].acqDate;
      count += 1;
      if (sortedHotspots[i].harmonizedFrpMW > maxFrp) {
        maxFrp = sortedHotspots[i].harmonizedFrpMW;
        peakDate = sortedHotspots[i].acqDate;
      }
    } else {
      episodes.push({ startDate: currentStart, endDate: currentEnd, peakDate, count, maxFrp });
      currentStart = sortedHotspots[i].acqDate;
      currentEnd = sortedHotspots[i].acqDate;
      peakDate = sortedHotspots[i].acqDate;
      maxFrp = sortedHotspots[i].harmonizedFrpMW;
      count = 1;
    }
  }

  episodes.push({ startDate: currentStart, endDate: currentEnd, peakDate, count, maxFrp });
  return { episodes };
}

function formatDateApproxEs(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m) return isoDate;
  const mLabel = MONTH_SHORT_ES[m - 1]?.toLowerCase() || '';
  return d ? `~${d} ${mLabel} ${y}` : `${mLabel} ${y}`;
}

function synthesizeCauseAndRationale(
  points: HarmonizedHotspot[],
  episodesCount: number,
  distinctYearsCount: number,
  avgReturnYears: number | null,
  peakMonths: number[]
): { cause: string; rationale: string } {
  const causeCounts = new Map<string, number>();
  const landCounts = new Map<string, number>();
  let totalFrp = 0;
  let maxFrp = 0;

  for (const p of points) {
    causeCounts.set(p.resolvedCause, (causeCounts.get(p.resolvedCause) || 0) + p.harmonizedWeight);
    landCounts.set(p.resolvedLandCover, (landCounts.get(p.resolvedLandCover) || 0) + 1);
    totalFrp += p.harmonizedFrpMW;
    if (p.harmonizedFrpMW > maxFrp) maxFrp = p.harmonizedFrpMW;
  }

  let topCause = 'Ignición recurrente en vegetación';
  let topCauseW = -1;
  for (const [c, w] of causeCounts.entries()) {
    if (w > topCauseW) {
      topCauseW = w;
      topCause = c;
    }
  }

  let topLand = 'Cobertura mixta';
  let topLandCount = -1;
  for (const [l, c] of landCounts.entries()) {
    if (c > topLandCount) {
      topLandCount = c;
      topLand = l;
    }
  }

  const meanFrp = totalFrp / Math.max(1, points.length);
  const monthNames = peakMonths.map((m) => MONTH_SHORT_ES[m - 1]).join('–');

  if (topLand.toLowerCase().includes('industrial') || topCause.toLowerCase().includes('industrial')) {
    return {
      cause: 'Actividad industrial / quema de residuos controlada',
      rationale: `Focos persistentes sobre suelo ${topLand.toLowerCase()} con FRP medio de ${meanFrp.toFixed(1)} MW y ${episodesCount} episodios registrados.`,
    };
  }

  if (avgReturnYears !== null && avgReturnYears <= 2.3 && meanFrp < 32 && distinctYearsCount >= 3) {
    return {
      cause: 'Quema agrícola estacional o manejo de rastrojos',
      rationale: `Recurrencia casi anual (cada ~${avgReturnYears.toFixed(1)} años) concentrada en ${monthNames} sobre ${topLand.toLowerCase()} con baja-media intensidad térmica (${meanFrp.toFixed(1)} MW).`,
    };
  }

  if (maxFrp >= 65 || meanFrp >= 38) {
    return {
      cause: topLand.toLowerCase().includes('interfaz')
        ? 'Incendio recurrente en interfaz urbano-forestal'
        : 'Incendio forestal recurrente de alta intensidad',
      rationale: `Picos de FRP de hasta ${maxFrp.toFixed(0)} MW en ${topLand.toLowerCase()} durante la ventana seca (${monthNames}); ${distinctYearsCount} años afectados.`,
    };
  }

  return {
    cause: topCause,
    rationale: `Patrón repetitivo en ${topLand.toLowerCase()} (${episodesCount} episodios en ${distinctYearsCount} años; ventana ${monthNames}).`,
  };
}

/**
 * Detects exact spatial clusters of burned areas and quantifies how often fires
 * recur in the same location, along with approximate cause and dates.
 */
export function detectRecurrentBurnAreas(
  hotspots: HarmonizedHotspot[],
  options?: {
    gridDegrees?: number; // ~0.020 deg ≈ 2.2 km
    minHotspots?: number;
    minEpisodes?: number;
    minDistinctYears?: number;
  }
): RecurrentBurnArea[] {
  if (hotspots.length === 0) return [];

  const isLargeDataset = hotspots.length >= 250;
  const gridDeg = options?.gridDegrees ?? 0.02;
  const minHotspots = options?.minHotspots ?? (isLargeDataset ? 8 : 3);
  const minEpisodes = options?.minEpisodes ?? (isLargeDataset ? 3 : 2);
  const minDistinctYears = options?.minDistinctYears ?? (isLargeDataset ? 3 : 2);

  const gridMap = new Map<string, GridCell>();
  for (const h of hotspots) {
    const gx = Math.floor(h.longitude / gridDeg);
    const gy = Math.floor(h.latitude / gridDeg);
    const key = `${gx}:${gy}`;
    let cell = gridMap.get(key);
    if (!cell) {
      cell = { key, gx, gy, points: [] };
      gridMap.set(key, cell);
    }
    cell.points.push(h);
  }

  // 8-neighbor connected components across occupied cells
  const visited = new Set<string>();
  const clusters: HarmonizedHotspot[][] = [];

  for (const [key, startCell] of gridMap.entries()) {
    if (visited.has(key)) continue;
    visited.add(key);

    const queue: GridCell[] = [startCell];
    const clusterPoints: HarmonizedHotspot[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterPoints.push(...current.points);

      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nKey = `${current.gx + dx}:${current.gy + dy}`;
          if (!visited.has(nKey) && gridMap.has(nKey)) {
            visited.add(nKey);
            queue.push(gridMap.get(nKey)!);
          }
        }
      }
    }

    if (clusterPoints.length >= minHotspots) {
      clusters.push(clusterPoints);
    }
  }

  const areas: RecurrentBurnArea[] = [];

  for (let idx = 0; idx < clusters.length; idx++) {
    const pts = [...clusters[idx]].sort((a, b) =>
      a.acqDate < b.acqDate ? -1 : a.acqDate > b.acqDate ? 1 : 0
    );

    const { episodes } = extractFireEpisodes(pts, 14);
    const distinctYears = Array.from(new Set(pts.map((p) => p.year))).sort((a, b) => a - b);

    if (episodes.length < minEpisodes || distinctYears.length < minDistinctYears) {
      continue;
    }

    let sumLat = 0;
    let sumLon = 0;
    let totalFrp = 0;
    let maxFrp = 0;
    let harmTotal = 0;
    const monthCounts = new Map<number, number>();
    const rawCoords: [number, number][] = [];

    for (const p of pts) {
      sumLat += p.latitude;
      sumLon += p.longitude;
      totalFrp += p.harmonizedFrpMW;
      if (p.harmonizedFrpMW > maxFrp) maxFrp = p.harmonizedFrpMW;
      harmTotal += p.harmonizedWeight;
      monthCounts.set(p.month, (monthCounts.get(p.month) || 0) + 1);
      rawCoords.push([p.latitude, p.longitude]);
    }

    const centroidLat = Number((sumLat / pts.length).toFixed(4));
    const centroidLon = Number((sumLon / pts.length).toFixed(4));
    const hullPolygon = computeConvexHull(rawCoords);
    const areaKm2 = computePolygonAreaKm2(hullPolygon);
    const areaHa = Math.round(areaKm2 * 100);

    const firstYear = distinctYears[0];
    const lastYear = distinctYears[distinctYears.length - 1];
    const spanYears = lastYear - firstYear;
    const avgReturnYears =
      distinctYears.length >= 2 && spanYears >= 1
        ? Number((spanYears / (distinctYears.length - 1)).toFixed(1))
        : null;

    const recurrenceLevel: 'Ocasional' | 'Frecuente' | 'Crónica' =
      distinctYears.length >= 7 || episodes.length >= 9
        ? 'Crónica'
        : distinctYears.length >= 4 || episodes.length >= 5
        ? 'Frecuente'
        : 'Ocasional';

    // Top 1-2 peak months
    const sortedMonths = Array.from(monthCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([m]) => m)
      .sort((a, b) => a - b);

    const peakSeasonMonths = sortedMonths.map((m) => MONTH_SHORT_ES[m - 1]).join('–');

    const { cause, rationale } = synthesizeCauseAndRationale(
      pts,
      episodes.length,
      distinctYears.length,
      avgReturnYears,
      sortedMonths
    );

    const lastEpisode = episodes[episodes.length - 1];
    const firstEpisode = episodes[0];
    const recentSampleDates = episodes
      .slice(-4)
      .reverse()
      .map((e) => formatDateApproxEs(e.peakDate));

    const approximateDates = `Ventana ${peakSeasonMonths} · Último: ${formatDateApproxEs(
      lastEpisode.peakDate
    )}`;

    areas.push({
      id: `area-${idx + 1}`,
      label: `Zona ${centroidLat.toFixed(2)}°, ${centroidLon.toFixed(2)}°`,
      centroidLat,
      centroidLon,
      hullPolygon,
      areaKm2,
      areaHa,
      eventCount: episodes.length,
      distinctYears,
      yearsSpan: firstYear === lastYear ? `${firstYear}` : `${firstYear}–${lastYear}`,
      avgReturnYears,
      recurrenceLevel,
      approximateCause: cause,
      causeRationale: rationale,
      approximateDates,
      peakSeasonMonths,
      lastEventDate: lastEpisode.peakDate,
      firstEventDate: firstEpisode.startDate,
      avgFrpMW: Number((totalFrp / pts.length).toFixed(1)),
      maxFrpMW: Number(maxFrp.toFixed(1)),
      hotspotCount: pts.length,
      harmonizedTotal: Math.round(harmTotal),
      sampleDates: recentSampleDates,
    });
  }

  // Sort by distinct years & event count descending, then harmonized total
  areas.sort((a, b) => {
    if (b.distinctYears.length !== a.distinctYears.length) {
      return b.distinctYears.length - a.distinctYears.length;
    }
    if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount;
    return b.harmonizedTotal - a.harmonizedTotal;
  });

  return areas.map((area, index) => ({
    ...area,
    id: `zona-${index + 1}`,
    label: `Área #${index + 1} (${area.centroidLat.toFixed(3)}°, ${area.centroidLon.toFixed(3)}°)`,
  }));
}
