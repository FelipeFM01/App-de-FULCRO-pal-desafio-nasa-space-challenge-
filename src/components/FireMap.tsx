import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { feature } from 'topojson-client';
import countries50m from 'world-atlas/countries-50m.json';
import {
  AreaOfInterest,
  HarmonizedHotspot,
  RecurrentBurnArea,
  SeriesMode,
} from '../types/fire';
import { DrawToolMode } from './OperationalToolbar';

type MapBaseStyle = 'vector' | 'topo' | 'osm' | 'satellite';

interface FireMapProps {
  center: [number, number];
  zoom: number;
  regionBounds?: [[number, number], [number, number]] | null;
  fitBoundsKey?: string;
  hotspots: HarmonizedHotspot[];
  aoi: AreaOfInterest | null;
  onChangeAOI: (aoi: AreaOfInterest | null) => void;
  drawMode: DrawToolMode;
  onChangeDrawMode: (mode: DrawToolMode) => void;
  showRecurrentAreas: boolean;
  recurrentAreas: RecurrentBurnArea[];
  selectedRecurrentId: string | null;
  onSelectRecurrentArea: (areaId: string | null) => void;
  seriesMode: SeriesMode;
}

const REGIONAL_LANDMARKS = [
  { name: 'Concepción', lat: -36.827, lon: -73.05 },
  { name: 'Santa Juana', lat: -37.175, lon: -72.938 },
  { name: 'Los Ángeles', lat: -37.469, lon: -72.353 },
  { name: 'Mulchén', lat: -37.719, lon: -72.241 },
  { name: 'Angol', lat: -37.798, lon: -72.708 },
  { name: 'Temuco', lat: -38.736, lon: -72.59 },
  { name: 'Porto Velho', lat: -8.761, lon: -63.904 },
  { name: 'Ariquemes', lat: -9.913, lon: -63.041 },
  { name: 'Ji-Paraná', lat: -10.885, lon: -61.951 },
  { name: 'Paradise / Chico', lat: 39.759, lon: -121.621 },
  { name: 'Quincy', lat: 39.937, lon: -120.947 },
  { name: 'Oroville', lat: 39.514, lon: -121.556 },
];

const COUNTRY_LABELS: { name: string; lat: number; lon: number }[] = [
  { name: 'CHILE', lat: -35.6, lon: -71.8 },
  { name: 'ARGENTINA', lat: -37.5, lon: -65.5 },
  { name: 'BRASIL', lat: -10.5, lon: -53.0 },
  { name: 'BOLIVIA', lat: -16.5, lon: -64.5 },
  { name: 'PERÚ', lat: -9.5, lon: -75.0 },
  { name: 'PARAGUAY', lat: -23.4, lon: -58.0 },
  { name: 'URUGUAY', lat: -32.8, lon: -56.0 },
  { name: 'COLOMBIA', lat: 4.0, lon: -73.0 },
  { name: 'VENEZUELA', lat: 7.0, lon: -66.0 },
  { name: 'ECUADOR', lat: -1.5, lon: -78.5 },
  { name: 'ESTADOS UNIDOS', lat: 39.5, lon: -101.0 },
  { name: 'MÉXICO', lat: 23.5, lon: -102.0 },
  { name: 'CANADÁ', lat: 56.0, lon: -106.0 },
  { name: 'ESPAÑA', lat: 40.2, lon: -3.7 },
  { name: 'PORTUGAL', lat: 39.6, lon: -8.0 },
  { name: 'FRANCIA', lat: 46.6, lon: 2.2 },
  { name: 'AUSTRALIA', lat: -25.0, lon: 134.0 },
];

const COUNTRY_PALETTE = ['#efeae0', '#e5ebd9', '#eae6df', '#e3e8ed', '#f1e7dc'];

function getCountryFillColor(idOrName: string | number | undefined): string {
  const s = String(idOrName ?? '0');
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) | 0;
  }
  return COUNTRY_PALETTE[Math.abs(hash) % COUNTRY_PALETTE.length];
}

function buildCountriesGeoJson() {
  const topo = countries50m as any;
  return feature(topo, topo.objects.countries) as unknown as GeoJSON.FeatureCollection;
}

export const FireMap: React.FC<FireMapProps> = ({
  center,
  zoom,
  regionBounds,
  fitBoundsKey,
  hotspots,
  aoi,
  onChangeAOI,
  drawMode,
  onChangeDrawMode,
  showRecurrentAreas,
  recurrentAreas,
  selectedRecurrentId,
  onSelectRecurrentArea,
  seriesMode,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const hotspotLayerRef = useRef<L.LayerGroup | null>(null);
  const aoiLayerRef = useRef<L.LayerGroup | null>(null);
  const recurrentLayerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  const [baseStyle, setBaseStyle] = useState<MapBaseStyle>('topo');
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [polygonDraft, setPolygonDraft] = useState<[number, number][]>([]);
  const rectStartRef = useRef<L.LatLng | null>(null);
  const rectPreviewRef = useRef<L.Rectangle | null>(null);

  const drawModeRef = useRef(drawMode);
  drawModeRef.current = drawMode;
  const onChangeAOIRef = useRef(onChangeAOI);
  onChangeAOIRef.current = onChangeAOI;
  const onChangeDrawModeRef = useRef(onChangeDrawMode);
  onChangeDrawModeRef.current = onChangeDrawMode;
  const polygonDraftRef = useRef(polygonDraft);
  polygonDraftRef.current = polygonDraft;

  // Initialize Leaflet map with built-in World Countries GeoJSON + graticule + live tiles
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      minZoom: 2,
      maxZoom: 17,
      zoomControl: true,
      preferCanvas: true,
      doubleClickZoom: false,
      worldCopyJump: true,
    });

    // Dedicated vector pane for guaranteed offline/fallback countries, borders, and oceans
    const vectorPane = map.createPane('countriesVectorPane');
    vectorPane.style.zIndex = '180';

    const labelsPane = map.createPane('countryLabelsPane');
    labelsPane.style.zIndex = '250';
    labelsPane.style.pointerEvents = 'none';

    const geojson = buildCountriesGeoJson();
    const vectorRenderer = L.canvas({ pane: 'countriesVectorPane', padding: 0.5 });

    L.geoJSON(geojson, {
      pane: 'countriesVectorPane',
      style: (feat) => ({
        color: '#64748b',
        weight: 1.2,
        opacity: 0.9,
        fillColor: getCountryFillColor(feat?.id ?? (feat?.properties as any)?.name),
        fillOpacity: 1,
      }),
      onEachFeature: (feat, layer) => {
        const name = (feat.properties as any)?.name;
        if (name) {
          layer.bindTooltip(String(name), { sticky: true, direction: 'top' });
        }
      },
    }).addTo(map);

    // Geographic graticule (latitude / longitude lines every 5 degrees)
    const graticuleGroup = L.layerGroup([], { pane: 'countriesVectorPane' }).addTo(map);
    for (let lat = -75; lat <= 75; lat += 10) {
      L.polyline(
        [
          [lat, -180],
          [lat, 180],
        ],
        {
          pane: 'countriesVectorPane',
          renderer: vectorRenderer,
          color: lat === 0 ? '#94a3b8' : '#cbd5e1',
          weight: lat === 0 ? 1 : 0.6,
          dashArray: lat === 0 ? undefined : '4, 4',
          interactive: false,
        }
      ).addTo(graticuleGroup);
    }
    for (let lon = -170; lon <= 170; lon += 10) {
      L.polyline(
        [
          [-80, lon],
          [80, lon],
        ],
        {
          pane: 'countriesVectorPane',
          renderer: vectorRenderer,
          color: lon === 0 ? '#94a3b8' : '#cbd5e1',
          weight: lon === 0 ? 1 : 0.6,
          dashArray: lon === 0 ? undefined : '4, 4',
          interactive: false,
        }
      ).addTo(graticuleGroup);
    }

    // Subtle country labels visible when inspecting countries/continents
    const countryLabelsLayer = L.layerGroup().addTo(map);
    for (const cl of COUNTRY_LABELS) {
      L.marker([cl.lat, cl.lon], {
        pane: 'countryLabelsPane',
        interactive: false,
        icon: L.divIcon({
          className: '',
          html: `<div style="font-family:'Plus Jakarta Sans',sans-serif;font-size:10px;font-weight:700;letter-spacing:0.12em;color:#334155;text-shadow:0 1px 2px rgba(255,255,255,0.95);white-space:nowrap;pointer-events:none;text-align:center;">${cl.name}</div>`,
          iconSize: [120, 16],
          iconAnchor: [60, 8],
        }),
      }).addTo(countryLabelsLayer);
    }

    // Regional city landmarks (shown at regional zoom >= 7)
    const landmarksLayer = L.layerGroup().addTo(map);
    for (const lm of REGIONAL_LANDMARKS) {
      L.circleMarker([lm.lat, lm.lon], {
        radius: 3,
        color: '#334155',
        fillColor: '#ffffff',
        fillOpacity: 1,
        weight: 1.5,
      })
        .bindTooltip(lm.name, {
          permanent: true,
          direction: 'right',
          offset: [6, 0],
          className:
            'bg-white/90 text-slate-800 text-[10px] font-medium border-slate-300 px-1.5 py-0.5',
        })
        .addTo(landmarksLayer);
    }

    const syncZoomLabels = () => {
      const z = map.getZoom();
      if (z >= 7) {
        if (!map.hasLayer(landmarksLayer)) landmarksLayer.addTo(map);
      } else {
        if (map.hasLayer(landmarksLayer)) map.removeLayer(landmarksLayer);
      }
    };
    syncZoomLabels();
    map.on('zoomend', syncZoomLabels);

    const hotspotLayer = L.layerGroup().addTo(map);
    const recurrentLayer = L.layerGroup().addTo(map);
    const aoiLayer = L.layerGroup().addTo(map);

    mapRef.current = map;
    hotspotLayerRef.current = hotspotLayer;
    recurrentLayerRef.current = recurrentLayer;
    aoiLayerRef.current = aoiLayer;
    (map as any)._countryLabelsLayer = countryLabelsLayer;

    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      setCursorCoords({ lat: e.latlng.lat, lon: e.latlng.lng });

      if (drawModeRef.current === 'rectangle' && rectStartRef.current) {
        const bounds = L.latLngBounds(rectStartRef.current, e.latlng);
        if (rectPreviewRef.current) {
          rectPreviewRef.current.setBounds(bounds);
        } else {
          rectPreviewRef.current = L.rectangle(bounds, {
            color: '#0284c7',
            weight: 2,
            dashArray: '5, 5',
            fillColor: '#0284c7',
            fillOpacity: 0.12,
          }).addTo(aoiLayer);
        }
      }
    });

    map.on('mousedown', (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current === 'rectangle') {
        map.dragging.disable();
        rectStartRef.current = e.latlng;
      }
    });

    map.on('mouseup', (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current === 'rectangle' && rectStartRef.current) {
        const start = rectStartRef.current;
        rectStartRef.current = null;
        map.dragging.enable();

        if (rectPreviewRef.current) {
          aoiLayer.removeLayer(rectPreviewRef.current);
          rectPreviewRef.current = null;
        }

        const minLat = Math.min(start.lat, e.latlng.lat);
        const maxLat = Math.max(start.lat, e.latlng.lat);
        const minLon = Math.min(start.lng, e.latlng.lng);
        const maxLon = Math.max(start.lng, e.latlng.lng);

        if (Math.abs(maxLat - minLat) > 0.01 && Math.abs(maxLon - minLon) > 0.01) {
          onChangeAOIRef.current({
            type: 'bbox',
            minLat: Number(minLat.toFixed(4)),
            maxLat: Number(maxLat.toFixed(4)),
            minLon: Number(minLon.toFixed(4)),
            maxLon: Number(maxLon.toFixed(4)),
            label: 'Área rectangular dibujada',
          });
          onChangeDrawModeRef.current('pan');
        }
      }
    });

    map.on('click', (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current === 'polygon') {
        const nextPt: [number, number] = [
          Number(e.latlng.lat.toFixed(5)),
          Number(e.latlng.lng.toFixed(5)),
        ];
        setPolygonDraft((prev) => [...prev, nextPt]);
      }
    });

    map.on('dblclick', () => {
      if (drawModeRef.current === 'polygon' && polygonDraftRef.current.length >= 3) {
        onChangeAOIRef.current({
          type: 'polygon',
          points: polygonDraftRef.current,
          label: `Polígono (${polygonDraftRef.current.length} vértices)`,
        });
        setPolygonDraft([]);
        onChangeDrawModeRef.current('pan');
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Manage base tile layer (Esri Topo / OpenStreetMap / Esri Satellite / Vector Countries)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    let layer: L.TileLayer | null = null;
    if (baseStyle === 'topo') {
      layer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '© Esri World Topo',
          maxZoom: 17,
        }
      );
    } else if (baseStyle === 'osm') {
      layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 18,
      });
    } else if (baseStyle === 'satellite') {
      layer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: '© Esri World Imagery',
          maxZoom: 17,
        }
      );
    }

    if (layer) {
      // Hide errored tiles gracefully so countriesVectorPane shows beneath
      layer.on('tileerror', (ev: any) => {
        if (ev?.tile) {
          ev.tile.style.display = 'none';
        }
      });
      layer.setZIndex(200);
      layer.addTo(map);
      tileLayerRef.current = layer;
    }

    const clLayer: L.LayerGroup | undefined = (map as any)._countryLabelsLayer;
    if (clLayer) {
      if (baseStyle === 'vector' || baseStyle === 'satellite') {
        if (!map.hasLayer(clLayer)) clLayer.addTo(map);
      } else {
        if (map.hasLayer(clLayer)) map.removeLayer(clLayer);
      }
    }
  }, [baseStyle]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (drawMode !== 'polygon') {
      setPolygonDraft([]);
    }
    if (drawMode === 'pan') {
      map.dragging.enable();
    }
  }, [drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (regionBounds) {
      map.fitBounds(regionBounds, { padding: [24, 24], maxZoom: 11, animate: true });
    } else {
      map.setView(center, zoom, { animate: true });
    }
  }, [fitBoundsKey]);

  // Render AOI overlay & draft polygon
  useEffect(() => {
    const layer = aoiLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (aoi) {
      if (aoi.type === 'bbox') {
        const bounds: L.LatLngBoundsExpression = [
          [aoi.minLat, aoi.minLon],
          [aoi.maxLat, aoi.maxLon],
        ];
        L.rectangle(bounds, {
          color: '#0284c7',
          weight: 2,
          dashArray: '6, 4',
          fillColor: '#0284c7',
          fillOpacity: 0.08,
        }).addTo(layer);
        map.fitBounds(bounds, { padding: [28, 28], maxZoom: 11 });
      } else if (aoi.type === 'circle') {
        const circle = L.circle([aoi.centerLat, aoi.centerLon], {
          radius: aoi.radiusKm * 1000,
          color: '#0284c7',
          weight: 2,
          dashArray: '6, 4',
          fillColor: '#0284c7',
          fillOpacity: 0.08,
        }).addTo(layer);
        map.fitBounds(circle.getBounds(), { padding: [28, 28], maxZoom: 11 });
      } else if (aoi.type === 'polygon' && aoi.points.length >= 3) {
        const poly = L.polygon(aoi.points, {
          color: '#0284c7',
          weight: 2,
          dashArray: '6, 4',
          fillColor: '#0284c7',
          fillOpacity: 0.08,
        }).addTo(layer);
        map.fitBounds(poly.getBounds(), { padding: [28, 28], maxZoom: 11 });
      }
    }

    if (polygonDraft.length > 0) {
      L.polyline(polygonDraft, {
        color: '#0284c7',
        weight: 2,
        dashArray: '4, 4',
      }).addTo(layer);
      for (const pt of polygonDraft) {
        L.circleMarker(pt, {
          radius: 4,
          color: '#0284c7',
          fillColor: '#ffffff',
          fillOpacity: 1,
          weight: 2,
        }).addTo(layer);
      }
    }
  }, [aoi, polygonDraft]);

  const visibleHotspots = useMemo(() => {
    if (hotspots.length <= 2200) return hotspots;
    const step = Math.ceil(hotspots.length / 2200);
    return hotspots.filter((_, i) => i % step === 0);
  }, [hotspots]);

  useEffect(() => {
    const layer = hotspotLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    const canvasRenderer = L.canvas({ padding: 0.5 });

    for (const h of visibleHotspots) {
      let color = '#ea580c';
      if (seriesMode === 'raw') {
        color = h.sensor === 'MODIS' ? '#2563eb' : '#ea580c';
      } else if (seriesMode === 'modis') {
        if (h.harmonizedFrpMW >= 80) color = '#1e3a8a';
        else if (h.harmonizedFrpMW >= 45) color = '#1d4ed8';
        else if (h.harmonizedFrpMW >= 20) color = '#2563eb';
        else color = '#60a5fa';
      } else {
        if (h.harmonizedFrpMW >= 80) color = '#991b1b';
        else if (h.harmonizedFrpMW >= 45) color = '#dc2626';
        else if (h.harmonizedFrpMW >= 20) color = '#ea580c';
        else color = '#f59e0b';
      }

      const radius = showRecurrentAreas
        ? 2.8
        : Math.min(7, Math.max(3, 2.5 + Math.sqrt(h.harmonizedFrpMW) * 0.35));

      const marker = L.circleMarker([h.latitude, h.longitude], {
        renderer: canvasRenderer,
        radius,
        color,
        fillColor: color,
        fillOpacity: showRecurrentAreas ? 0.35 : 0.78,
        weight: 0.8,
      });

      marker.bindTooltip(
        `<div class="text-xs space-y-0.5">
          <div class="font-semibold">${h.acqDate} · ${h.sensor} (${h.satellite})</div>
          <div class="font-mono">${h.latitude.toFixed(4)}°, ${h.longitude.toFixed(4)}°</div>
          <div>FRP: <span class="font-mono font-semibold">${h.harmonizedFrpMW} MW</span> · Peso eq.: ${h.harmonizedWeight}</div>
          <div class="text-slate-600">${h.resolvedCause}</div>
        </div>`,
        { sticky: true }
      );
      marker.addTo(layer);
    }
  }, [visibleHotspots, seriesMode, showRecurrentAreas]);

  useEffect(() => {
    const layer = recurrentLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map) return;
    layer.clearLayers();

    if (!showRecurrentAreas) return;

    recurrentAreas.forEach((area, index) => {
      const isSelected = area.id === selectedRecurrentId;
      const strokeColor =
        area.recurrenceLevel === 'Crónica'
          ? '#b91c1c'
          : area.recurrenceLevel === 'Frecuente'
          ? '#c2410c'
          : '#b45309';

      const fillColor =
        area.recurrenceLevel === 'Crónica'
          ? '#ef4444'
          : area.recurrenceLevel === 'Frecuente'
          ? '#f97316'
          : '#f59e0b';

      const polygon = L.polygon(area.hullPolygon, {
        color: isSelected ? '#0f172a' : strokeColor,
        weight: isSelected ? 3 : 2,
        fillColor,
        fillOpacity: isSelected ? 0.42 : 0.26,
      });

      polygon.bindTooltip(
        `<div class="text-xs max-w-[260px] space-y-1">
          <div class="font-semibold text-slate-900">${area.label} · ${area.recurrenceLevel}</div>
          <div class="font-mono text-rose-700 font-semibold">${area.eventCount} episodios en ${area.distinctYears.length} años (${area.yearsSpan})</div>
          <div><strong>Causa aprox.:</strong> ${area.approximateCause}</div>
          <div><strong>Fechas aprox.:</strong> ${area.approximateDates}</div>
          <div class="text-slate-500 font-mono">Área: ${area.areaHa.toLocaleString('es-ES')} ha · FRP máx: ${area.maxFrpMW} MW</div>
        </div>`,
        { sticky: true }
      );

      polygon.on('click', () => {
        onSelectRecurrentArea(area.id);
      });

      polygon.addTo(layer);

      const badgeIcon = L.divIcon({
        className: '',
        html: `<div style="background:${
          isSelected ? '#0f172a' : strokeColor
        };color:#fff;font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;width:22px;height:22px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 2px 6px rgba(15,23,42,0.3);">${
          index + 1
        }</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const centroidMarker = L.marker([area.centroidLat, area.centroidLon], {
        icon: badgeIcon,
      });
      centroidMarker.on('click', () => {
        onSelectRecurrentArea(area.id);
      });
      centroidMarker.addTo(layer);

      if (isSelected) {
        map.flyTo([area.centroidLat, area.centroidLon], Math.max(map.getZoom(), 11), {
          duration: 0.5,
        });
      }
    });
  }, [showRecurrentAreas, recurrentAreas, selectedRecurrentId, onSelectRecurrentArea]);

  const finishPolygonDraft = () => {
    if (polygonDraft.length >= 3) {
      onChangeAOI({
        type: 'polygon',
        points: polygonDraft,
        label: `Polígono (${polygonDraft.length} vértices)`,
      });
    }
    setPolygonDraft([]);
    onChangeDrawMode('pan');
  };

  const handleGlobalZoom = () => {
    mapRef.current?.setView([-18, -64], 3, { animate: true });
  };

  const handleResetView = () => {
    if (regionBounds) {
      mapRef.current?.fitBounds(regionBounds, { padding: [24, 24], maxZoom: 11, animate: true });
    } else {
      mapRef.current?.setView(center, zoom, { animate: true });
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col h-full min-h-[460px]">
      <div className="px-4 py-2.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/60">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            Mapa interactivo de focos y área de interés
          </h2>
          <span className="text-xs font-mono text-slate-500 tabular-nums whitespace-nowrap">
            {hotspots.length.toLocaleString('es-ES')} registros
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGlobalZoom}
            className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded whitespace-nowrap"
          >
            Vista países
          </button>
          <button
            type="button"
            onClick={handleResetView}
            className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded whitespace-nowrap"
          >
            Centrar zona
          </button>
          <select
            aria-label="Estilo de mapa base"
            value={baseStyle}
            onChange={(e) => setBaseStyle(e.target.value as MapBaseStyle)}
            className="h-7 px-2 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
          >
            <option value="topo">Mapa topográfico</option>
            <option value="osm">OpenStreetMap</option>
            <option value="satellite">Satélite</option>
            <option value="vector">Vector países</option>
          </select>
        </div>
      </div>

      <div className="relative flex-1 min-h-[400px]">
        <div
          ref={containerRef}
          data-testid="fire-map-canvas"
          className={`w-full h-full min-h-[400px] ${
            drawMode !== 'pan' ? 'cursor-crosshair' : ''
          }`}
        />

        {drawMode !== 'pan' && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[450] bg-slate-900 text-white text-xs px-3.5 py-2 rounded-md shadow-md flex items-center gap-3">
            <span>
              {drawMode === 'rectangle'
                ? 'Haz clic y arrastra sobre el mapa para delimitar el rectángulo AOI'
                : `Haz clic para marcar vértices (${polygonDraft.length}) · doble clic para cerrar`}
            </span>
            {drawMode === 'polygon' && polygonDraft.length >= 3 && (
              <button
                type="button"
                onClick={finishPolygonDraft}
                className="px-2 py-0.5 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded"
              >
                Cerrar polígono
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setPolygonDraft([]);
                onChangeDrawMode('pan');
              }}
              className="text-slate-300 hover:text-white underline"
            >
              Cancelar
            </button>
          </div>
        )}

        <div className="absolute bottom-3 left-3 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200 rounded px-2.5 py-1 text-[11px] font-mono tabular-nums text-slate-700 pointer-events-none">
          {cursorCoords
            ? `${cursorCoords.lat.toFixed(4)}°, ${cursorCoords.lon.toFixed(4)}°`
            : `${center[0].toFixed(4)}°, ${center[1].toFixed(4)}°`}
        </div>

        <div className="absolute bottom-3 right-3 z-[400] bg-white/95 backdrop-blur-xs border border-slate-200 rounded px-2.5 py-1.5 text-[11px] text-slate-700 flex flex-wrap items-center gap-3">
          {seriesMode === 'raw' ? (
            <>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                MODIS (1 km)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
                VIIRS (375 m)
              </span>
            </>
          ) : seriesMode === 'modis' ? (
            <>
              <span className="font-medium text-blue-800">Solo MODIS (1 km):</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 inline-block" />
                &lt;20 MW
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                20–45 MW
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-900 inline-block" />
                &gt;45 MW
              </span>
            </>
          ) : (
            <>
              {seriesMode === 'viirs' && (
                <span className="font-medium text-orange-800">Solo VIIRS (375 m):</span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                FRP &lt;20 MW
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
                20–45 MW
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-700 inline-block" />
                &gt;45 MW
              </span>
            </>
          )}
          {showRecurrentAreas && (
            <span className="inline-flex items-center gap-1.5 border-l border-slate-200 pl-2.5 font-medium text-rose-800">
              <span className="w-2.5 h-2.5 border border-rose-700 bg-rose-500/30 inline-block" />
              Perímetros recurrentes
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
