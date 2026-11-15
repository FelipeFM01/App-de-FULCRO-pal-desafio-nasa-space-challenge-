import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFireCalendar,
  filterByAOI,
  harmonizeHotspots,
  isPointInPolygon,
  selectSeriesHotspots,
} from './harmonization';
import { RawHotspot } from '../types/fire';

test('harmonizeHotspots deduplicates co-located MODIS & VIIRS and calibrates MODIS-only points', () => {
  const raw: RawHotspot[] = [
    // Overlap year 2020: 10 MODIS vs 30 VIIRS at distinct sites -> empirical ratio ~3.0
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `m-2020-${i}`,
      latitude: -37.0 - i * 0.1,
      longitude: -72.0,
      acqDate: `2020-02-${String(i + 1).padStart(2, '0')}`,
      acqTime: '1400',
      sensor: 'MODIS' as const,
      satellite: 'Aqua',
      frpMW: 30,
      brightnessK: 330,
      confidence: 'high' as const,
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `v-2020-${i}`,
      latitude: -37.0 - i * 0.05,
      longitude: -72.5,
      acqDate: `2020-03-${String((i % 20) + 1).padStart(2, '0')}`,
      acqTime: '1415',
      sensor: 'VIIRS' as const,
      satellite: 'Suomi NPP',
      frpMW: 25,
      brightnessK: 325,
      confidence: 'high' as const,
    })),
    // Same day, same place (<1.2 km, <150 min) -> MODIS should be deduplicated
    {
      id: 'm-dup',
      latitude: -37.5,
      longitude: -72.2,
      acqDate: '2021-01-15',
      acqTime: '1400',
      sensor: 'MODIS',
      satellite: 'Aqua',
      frpMW: 40,
      brightnessK: 335,
      confidence: 'high',
    },
    {
      id: 'v-dup',
      latitude: -37.502,
      longitude: -72.203,
      acqDate: '2021-01-15',
      acqTime: '1430',
      sensor: 'VIIRS',
      satellite: 'NOAA-20',
      frpMW: 38,
      brightnessK: 332,
      confidence: 'high',
    },
    // Historical MODIS-only point in 2005
    {
      id: 'm-2005',
      latitude: -37.8,
      longitude: -72.4,
      acqDate: '2005-02-10',
      acqTime: '1430',
      sensor: 'MODIS',
      satellite: 'Terra',
      frpMW: 50,
      brightnessK: 340,
      confidence: 'high',
    },
  ];

  const { hotspots, summary } = harmonizeHotspots(raw);
  assert.equal(summary.dedupedRemovedCount, 1);
  assert.equal(summary.calibrationFactor, 3.0);
  const m2005 = hotspots.find((h) => h.id === 'm-2005');
  assert.ok(m2005);
  assert.equal(m2005.harmonizedWeight, 3.0);
  assert.equal(hotspots.some((h) => h.id === 'm-dup'), false);
  assert.equal(hotspots.some((h) => h.id === 'v-dup'), true);
});

test('filterByAOI handles bbox, circle, and polygon geometries accurately', () => {
  const { hotspots } = harmonizeHotspots([
    {
      id: 'inside',
      latitude: -37.5,
      longitude: -72.5,
      acqDate: '2023-02-01',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NOAA-20',
      frpMW: 45,
      brightnessK: 330,
      confidence: 'high',
    },
    {
      id: 'outside',
      latitude: -39.0,
      longitude: -74.0,
      acqDate: '2023-02-01',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NOAA-20',
      frpMW: 45,
      brightnessK: 330,
      confidence: 'high',
    },
  ]);

  const bboxFiltered = filterByAOI(hotspots, {
    type: 'bbox',
    minLat: -38.0,
    maxLat: -37.0,
    minLon: -73.0,
    maxLon: -72.0,
  });
  assert.equal(bboxFiltered.length, 1);
  assert.equal(bboxFiltered[0].id, 'inside');

  const circleFiltered = filterByAOI(hotspots, {
    type: 'circle',
    centerLat: -37.52,
    centerLon: -72.52,
    radiusKm: 15,
  });
  assert.equal(circleFiltered.length, 1);
  assert.equal(circleFiltered[0].id, 'inside');

  const poly: [number, number][] = [
    [-37.7, -72.7],
    [-37.7, -72.3],
    [-37.3, -72.3],
    [-37.3, -72.7],
  ];
  assert.equal(isPointInPolygon(-37.5, -72.5, poly), true);
  assert.equal(isPointInPolygon(-39.0, -74.0, poly), false);
});

test('buildFireCalendar calculates monthly medians and anomaly percentages', () => {
  const raw: RawHotspot[] = [
    // 2020 Feb: 2 VIIRS = 2
    {
      id: 'a1',
      latitude: -37.5,
      longitude: -72.5,
      acqDate: '2020-02-10',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 20,
      brightnessK: 320,
      confidence: 'high',
    },
    {
      id: 'a2',
      latitude: -37.5,
      longitude: -72.5,
      acqDate: '2020-02-12',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 20,
      brightnessK: 320,
      confidence: 'high',
    },
    // 2021 Feb: 2 VIIRS = 2
    {
      id: 'b1',
      latitude: -37.5,
      longitude: -72.5,
      acqDate: '2021-02-10',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 20,
      brightnessK: 320,
      confidence: 'high',
    },
    {
      id: 'b2',
      latitude: -37.5,
      longitude: -72.5,
      acqDate: '2021-02-11',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 20,
      brightnessK: 320,
      confidence: 'high',
    },
    // 2022 Feb: 6 VIIRS = 6 (anomaly +200% over median 2)
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `c${i}`,
      latitude: -37.5,
      longitude: -72.5,
      acqDate: `2022-02-${String(i + 1).padStart(2, '0')}`,
      acqTime: '1400',
      sensor: 'VIIRS' as const,
      satellite: 'NPP',
      frpMW: 70,
      brightnessK: 350,
      confidence: 'high' as const,
    })),
  ];

  const { hotspots } = harmonizeHotspots(raw);
  const cal = buildFireCalendar(hotspots, 2020, 2022, 'harmonized');
  assert.equal(cal.years.length, 3);
  // Feb is index 1
  const febBaseline = cal.monthlyBaselines[1];
  assert.equal(febBaseline.median, 2);
  const feb2022 = cal.cells[2][1];
  assert.equal(feb2022.harmonizedCount, 6);
  assert.equal(feb2022.anomalyPct, 200);
});

test('selectSeriesHotspots isolates MODIS-only and VIIRS-only records without losing co-located MODIS detections', () => {
  const raw: RawHotspot[] = [
    {
      id: 'm1',
      latitude: -37.5,
      longitude: -72.2,
      acqDate: '2022-02-10',
      acqTime: '1400',
      sensor: 'MODIS',
      satellite: 'Aqua',
      frpMW: 40,
      brightnessK: 335,
      confidence: 'high',
    },
    {
      id: 'v1',
      latitude: -37.501,
      longitude: -72.201,
      acqDate: '2022-02-10',
      acqTime: '1415',
      sensor: 'VIIRS',
      satellite: 'NOAA-20',
      frpMW: 38,
      brightnessK: 332,
      confidence: 'high',
    },
  ];

  const { hotspots: harmonized } = harmonizeHotspots(raw);
  // In harmonized mode, co-located MODIS m1 is deduplicated in favor of VIIRS v1
  assert.equal(harmonized.length, 1);
  assert.equal(harmonized[0].id, 'v1');

  // In 'modis' mode, m1 MUST be preserved with weight 1
  const modisOnly = selectSeriesHotspots(raw, harmonized, 'modis');
  assert.equal(modisOnly.length, 1);
  assert.equal(modisOnly[0].id, 'm1');
  assert.equal(modisOnly[0].harmonizedWeight, 1);

  // In 'viirs' mode, only v1 is returned
  const viirsOnly = selectSeriesHotspots(raw, harmonized, 'viirs');
  assert.equal(viirsOnly.length, 1);
  assert.equal(viirsOnly[0].id, 'v1');

  // In 'raw' mode, both m1 and v1 are returned uncalibrated
  const rawCombined = selectSeriesHotspots(raw, harmonized, 'raw');
  assert.equal(rawCombined.length, 2);
});

