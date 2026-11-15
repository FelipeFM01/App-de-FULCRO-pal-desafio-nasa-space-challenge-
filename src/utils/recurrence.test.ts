import test from 'node:test';
import assert from 'node:assert/strict';
import { harmonizeHotspots } from './harmonization';
import { computeConvexHull, detectRecurrentBurnAreas } from './recurrence';
import { RawHotspot } from '../types/fire';

test('computeConvexHull returns valid CCW hull covering outer points', () => {
  const hull = computeConvexHull([
    [-37.5, -72.5], // interior
    [-37.54, -72.50],
    [-37.50, -72.46],
    [-37.46, -72.50],
    [-37.50, -72.54],
  ]);
  assert.equal(hull.length, 4);
});

test('detectRecurrentBurnAreas identifies multi-year clusters with return interval, cause, and dates', () => {
  const raw: RawHotspot[] = [
    // Cluster 1: burns in 2018, 2020, 2022, 2024 (4 episodes) at same agricultural spot
    {
      id: 'r1',
      latitude: -37.821,
      longitude: -72.341,
      acqDate: '2018-03-10',
      acqTime: '1400',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 18,
      brightnessK: 320,
      confidence: 'nominal',
      landCover: 'Agrícola',
    },
    {
      id: 'r2',
      latitude: -37.822,
      longitude: -72.342,
      acqDate: '2020-03-14',
      acqTime: '1410',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 16,
      brightnessK: 318,
      confidence: 'nominal',
      landCover: 'Agrícola',
    },
    {
      id: 'r3',
      latitude: -37.820,
      longitude: -72.340,
      acqDate: '2022-03-18',
      acqTime: '1405',
      sensor: 'VIIRS',
      satellite: 'NOAA-20',
      frpMW: 19,
      brightnessK: 322,
      confidence: 'high',
      landCover: 'Agrícola',
    },
    {
      id: 'r4',
      latitude: -37.823,
      longitude: -72.343,
      acqDate: '2024-03-20',
      acqTime: '1420',
      sensor: 'VIIRS',
      satellite: 'NOAA-20',
      frpMW: 17,
      brightnessK: 319,
      confidence: 'high',
      landCover: 'Agrícola',
    },
    // Isolated single event elsewhere -> should NOT be flagged as recurrent
    {
      id: 'iso1',
      latitude: -36.9,
      longitude: -71.8,
      acqDate: '2021-01-05',
      acqTime: '1500',
      sensor: 'VIIRS',
      satellite: 'NPP',
      frpMW: 30,
      brightnessK: 325,
      confidence: 'nominal',
    },
  ];

  const { hotspots } = harmonizeHotspots(raw);
  const areas = detectRecurrentBurnAreas(hotspots);
  assert.equal(areas.length, 1);
  assert.equal(areas[0].eventCount, 4);
  assert.equal(areas[0].distinctYears.length, 4);
  assert.equal(areas[0].avgReturnYears, 2.0);
  assert.match(areas[0].approximateCause, /agrícola/i);
  assert.match(areas[0].approximateDates, /Mar/);
  assert.ok(areas[0].hullPolygon.length >= 4);
});
