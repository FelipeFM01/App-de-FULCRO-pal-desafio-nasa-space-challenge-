import { feature } from 'topojson-client';
import countries50m from 'world-atlas/countries-50m.json';
import { HarmonizedHotspot, RegionOption } from '../types/fire';

interface CountryPolygonEntry {
  name: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  rings: number[][][]; // array of polygon exterior/interior rings in [lon, lat]
}

const COUNTRY_NAME_ES: Record<string, string> = {
  Chile: 'Chile',
  Argentina: 'Argentina',
  Brazil: 'Brasil',
  Bolivia: 'Bolivia',
  Peru: 'Perú',
  Paraguay: 'Paraguay',
  Uruguay: 'Uruguay',
  Colombia: 'Colombia',
  Venezuela: 'Venezuela',
  Ecuador: 'Ecuador',
  'United States of America': 'Estados Unidos',
  Mexico: 'México',
  Canada: 'Canadá',
  Spain: 'España',
  Portugal: 'Portugal',
  France: 'Francia',
  Italy: 'Italia',
  Greece: 'Grecia',
  Australia: 'Australia',
  Indonesia: 'Indonesia',
  Russia: 'Rusia',
};

// Official Chilean regions ordered North -> South by approximate latitude spans
const CHILE_REGION_BANDS: { name: string; maxLat: number; minLat: number }[] = [
  { name: 'Arica y Parinacota', maxLat: -17.45, minLat: -19.15 },
  { name: 'Tarapacá', maxLat: -19.15, minLat: -21.62 },
  { name: 'Antofagasta', maxLat: -21.62, minLat: -26.05 },
  { name: 'Atacama', maxLat: -26.05, minLat: -29.25 },
  { name: 'Coquimbo', maxLat: -29.25, minLat: -32.28 },
  { name: 'Valparaíso', maxLat: -32.28, minLat: -33.65 },
  { name: 'Metropolitana de Santiago', maxLat: -33.0, minLat: -34.28 },
  { name: "O'Higgins", maxLat: -33.85, minLat: -35.0 },
  { name: 'Maule', maxLat: -34.8, minLat: -36.55 },
  { name: 'Ñuble', maxLat: -36.05, minLat: -37.2 },
  { name: 'Biobío', maxLat: -36.55, minLat: -38.48 },
  { name: 'La Araucanía', maxLat: -37.6, minLat: -39.62 },
  { name: 'Los Ríos', maxLat: -39.3, minLat: -40.68 },
  { name: 'Los Lagos', maxLat: -40.25, minLat: -44.05 },
  { name: 'Aysén', maxLat: -43.65, minLat: -49.25 },
  { name: 'Magallanes', maxLat: -48.6, minLat: -56.1 },
];

let cachedCountries: CountryPolygonEntry[] | null = null;

function getCountriesIndex(): CountryPolygonEntry[] {
  if (cachedCountries) return cachedCountries;
  const topo = countries50m as any;
  const fc = feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
  const entries: CountryPolygonEntry[] = [];

  for (const feat of fc.features) {
    const rawName = String((feat.properties as any)?.name || '');
    if (!rawName || !feat.geometry) continue;
    const name = COUNTRY_NAME_ES[rawName] || rawName;

    const addPolygonRings = (rings: number[][][]) => {
      if (!rings.length || !rings[0].length) return;
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      for (const [lon, lat] of rings[0]) {
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      }
      entries.push({ name, minLat, maxLat, minLon, maxLon, rings });
    };

    if (feat.geometry.type === 'Polygon') {
      addPolygonRings(feat.geometry.coordinates as number[][][]);
    } else if (feat.geometry.type === 'MultiPolygon') {
      for (const poly of feat.geometry.coordinates as number[][][][]) {
        addPolygonRings(poly);
      }
    }
  }

  cachedCountries = entries;
  return entries;
}

function pointInLonLatRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function detectCountryForPoint(lat: number, lon: number): string | undefined {
  const index = getCountriesIndex();
  for (const entry of index) {
    if (lat < entry.minLat || lat > entry.maxLat || lon < entry.minLon || lon > entry.maxLon) {
      continue;
    }
    if (pointInLonLatRing(lat, lon, entry.rings[0])) {
      let inHole = false;
      for (let h = 1; h < entry.rings.length; h++) {
        if (pointInLonLatRing(lat, lon, entry.rings[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return entry.name;
    }
  }
  return undefined;
}

export function detectChileSubregion(lat: number, lon: number): string | undefined {
  if (lat > -17.4 || lat < -56.2 || lon < -76.5 || lon > -66.0) return undefined;
  // Special handling for Metropolitana vs Valparaíso (same latitude, RM is inland east of -70.95)
  if (lat <= -32.95 && lat >= -34.25 && lon > -71.05) {
    return 'Metropolitana de Santiago';
  }
  for (const band of CHILE_REGION_BANDS) {
    if (lat <= band.maxLat && lat >= band.minLat) {
      return band.name;
    }
  }
  return undefined;
}

/**
 * Enriches hotspots with spatial country & specific region tags when explicit region column is absent.
 */
export function enrichHotspotRegions(hotspots: HarmonizedHotspot[]): HarmonizedHotspot[] {
  if (hotspots.length === 0) return hotspots;
  // Quantize coordinates to ~5km grid to avoid repeating polygon checks on nearby points
  const countryCache = new Map<string, string | undefined>();

  return hotspots.map((h) => {
    const cacheKey = `${h.latitude.toFixed(2)},${h.longitude.toFixed(2)}`;
    let country = h.resolvedCountry;
    if (!country) {
      if (countryCache.has(cacheKey)) {
        country = countryCache.get(cacheKey);
      } else {
        country = detectCountryForPoint(h.latitude, h.longitude);
        countryCache.set(cacheKey, country);
      }
    }

    const explicitRegion = h.region?.trim();
    let resolvedRegion = explicitRegion || '';
    if (!resolvedRegion) {
      if (country === 'Chile') {
        const chileReg = detectChileSubregion(h.latitude, h.longitude);
        resolvedRegion = chileReg ? `Región de ${chileReg}` : 'Chile';
      } else if (country) {
        resolvedRegion = country;
      } else {
        resolvedRegion = 'Sin región asignada';
      }
    }

    return {
      ...h,
      resolvedCountry: country,
      resolvedRegion,
    };
  });
}

/**
 * Builds specific RegionOption entries from the loaded hotspots.
 */
export function buildRegionOptions(hotspots: HarmonizedHotspot[]): RegionOption[] {
  if (hotspots.length === 0) return [];

  const options: RegionOption[] = [
    {
      id: 'all',
      label: `Todas las regiones (${hotspots.length.toLocaleString('es-ES')} focos)`,
      group: 'all',
      count: hotspots.length,
    },
  ];

  const explicitRegions = new Map<string, number>();
  const chileSubregions = new Map<string, number>();
  const countries = new Map<string, number>();
  const files = new Map<string, number>();

  for (const h of hotspots) {
    if (h.region && h.region.trim()) {
      const r = h.region.trim();
      explicitRegions.set(r, (explicitRegions.get(r) || 0) + 1);
    } else if (h.resolvedCountry === 'Chile') {
      const sub = detectChileSubregion(h.latitude, h.longitude);
      if (sub) {
        const label = `Región de ${sub}`;
        chileSubregions.set(label, (chileSubregions.get(label) || 0) + 1);
      }
    }

    if (h.resolvedCountry) {
      countries.set(h.resolvedCountry, (countries.get(h.resolvedCountry) || 0) + 1);
    }

    if (h.sourceFile) {
      files.set(h.sourceFile, (files.get(h.sourceFile) || 0) + 1);
    }
  }

  // 1. Explicit regions from Excel column
  const sortedExplicit = Array.from(explicitRegions.entries()).sort((a, b) =>
    a[0].localeCompare(b[0], 'es')
  );
  for (const [name, count] of sortedExplicit) {
    options.push({
      id: `region:${name}`,
      label: `${name} (${count.toLocaleString('es-ES')})`,
      group: 'region',
      count,
    });
  }

  // 2. Chilean administrative regions detected spatially (when no explicit region column)
  if (chileSubregions.size > 0) {
    const order = CHILE_REGION_BANDS.map((b) => `Región de ${b.name}`);
    const sortedChile = Array.from(chileSubregions.entries()).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
    for (const [name, count] of sortedChile) {
      options.push({
        id: `chile-region:${name}`,
        label: `${name} (${count.toLocaleString('es-ES')})`,
        group: 'chile-region',
        count,
      });
    }
  }

  // 3. Countries detected spatially (useful when multi-country or no region column)
  const sortedCountries = Array.from(countries.entries()).sort((a, b) => b[1] - a[1]);
  for (const [name, count] of sortedCountries) {
    // Avoid duplicate entry if explicit region has the exact same single name
    if (explicitRegions.has(name) && countries.size === 1) continue;
    options.push({
      id: `country:${name}`,
      label: `${name} (${count.toLocaleString('es-ES')})`,
      group: 'country',
      count,
    });
  }

  // 4. Individual Excel / CSV files when >1 file is loaded
  if (files.size > 1) {
    const sortedFiles = Array.from(files.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], 'es')
    );
    for (const [fileName, count] of sortedFiles) {
      options.push({
        id: `file:${fileName}`,
        label: `Archivo: ${fileName} (${count.toLocaleString('es-ES')})`,
        group: 'file',
        count,
      });
    }
  }

  return options;
}

export function filterHotspotsByRegionId(
  hotspots: HarmonizedHotspot[],
  regionId: string
): HarmonizedHotspot[] {
  if (!regionId || regionId === 'all') return hotspots;

  if (regionId.startsWith('region:')) {
    const target = regionId.slice('region:'.length);
    return hotspots.filter((h) => h.region?.trim() === target);
  }
  if (regionId.startsWith('chile-region:')) {
    const target = regionId.slice('chile-region:'.length);
    return hotspots.filter((h) => {
      if (h.resolvedCountry !== 'Chile') return false;
      const sub = detectChileSubregion(h.latitude, h.longitude);
      return sub ? `Región de ${sub}` === target : false;
    });
  }
  if (regionId.startsWith('country:')) {
    const target = regionId.slice('country:'.length);
    return hotspots.filter((h) => h.resolvedCountry === target);
  }
  if (regionId.startsWith('file:')) {
    const target = regionId.slice('file:'.length);
    return hotspots.filter((h) => h.sourceFile === target);
  }

  return hotspots;
}
