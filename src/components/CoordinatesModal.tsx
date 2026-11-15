import React, { useState } from 'react';
import { X } from 'lucide-react';
import { AreaOfInterest } from '../types/fire';

interface CoordinatesModalProps {
  isOpen: boolean;
  defaultCenter: [number, number];
  onClose: () => void;
  onApplyAOI: (aoi: AreaOfInterest) => void;
}

export const CoordinatesModal: React.FC<CoordinatesModalProps> = ({
  isOpen,
  defaultCenter,
  onClose,
  onApplyAOI,
}) => {
  const [mode, setMode] = useState<'circle' | 'bbox'>('circle');
  const [centerLat, setCenterLat] = useState(String(defaultCenter[0]));
  const [centerLon, setCenterLon] = useState(String(defaultCenter[1]));
  const [radiusKm, setRadiusKm] = useState('35');

  const [minLat, setMinLat] = useState(String((defaultCenter[0] - 0.35).toFixed(3)));
  const [maxLat, setMaxLat] = useState(String((defaultCenter[0] + 0.35).toFixed(3)));
  const [minLon, setMinLon] = useState(String((defaultCenter[1] - 0.35).toFixed(3)));
  const [maxLon, setMaxLon] = useState(String((defaultCenter[1] + 0.35).toFixed(3)));
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'circle') {
      const lat = Number(centerLat);
      const lon = Number(centerLon);
      const rad = Number(radiusKm);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        setError('La latitud debe estar entre -90 y 90 grados.');
        return;
      }
      if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
        setError('La longitud debe estar entre -180 y 180 grados.');
        return;
      }
      if (!Number.isFinite(rad) || rad <= 0 || rad > 1000) {
        setError('El radio debe ser mayor a 0 y menor a 1000 km.');
        return;
      }
      onApplyAOI({
        type: 'circle',
        centerLat: lat,
        centerLon: lon,
        radiusKm: rad,
        label: `Centro ${lat.toFixed(3)}°, ${lon.toFixed(3)}° (${rad} km)`,
      });
      onClose();
      return;
    }

    const nMinLat = Number(minLat);
    const nMaxLat = Number(maxLat);
    const nMinLon = Number(minLon);
    const nMaxLon = Number(maxLon);
    if (
      !Number.isFinite(nMinLat) ||
      !Number.isFinite(nMaxLat) ||
      !Number.isFinite(nMinLon) ||
      !Number.isFinite(nMaxLon) ||
      nMinLat < -90 ||
      nMaxLat > 90 ||
      nMinLon < -180 ||
      nMaxLon > 180
    ) {
      setError('Ingresa coordenadas geográficas válidas.');
      return;
    }
    if (nMinLat >= nMaxLat || nMinLon >= nMaxLon) {
      setError('Las coordenadas mínimas deben ser menores que las máximas.');
      return;
    }
    onApplyAOI({
      type: 'bbox',
      minLat: nMinLat,
      maxLat: nMaxLat,
      minLon: nMinLon,
      maxLon: nMaxLon,
      label: `Cuadrante [${nMinLat.toFixed(2)}°, ${nMaxLat.toFixed(2)}°]`,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coords-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
          <h2 id="coords-modal-title" className="text-sm font-semibold text-slate-900">
            Definir área de interés por coordenadas
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana de coordenadas"
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="inline-flex w-full p-1 bg-slate-100 rounded-md border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setMode('circle');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                mode === 'circle' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Centro y radio (km)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('bbox');
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded transition-colors ${
                mode === 'bbox' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Rectángulo (Lat / Lon)
            </button>
          </div>

          {mode === 'circle' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="aoi-center-lat" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitud
                </label>
                <input
                  id="aoi-center-lat"
                  type="number"
                  step="any"
                  required
                  value={centerLat}
                  onChange={(e) => setCenterLat(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                />
              </div>
              <div>
                <label htmlFor="aoi-center-lon" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitud
                </label>
                <input
                  id="aoi-center-lon"
                  type="number"
                  step="any"
                  required
                  value={centerLon}
                  onChange={(e) => setCenterLon(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                />
              </div>
              <div>
                <label htmlFor="aoi-radius-km" className="block text-xs font-medium text-slate-700 mb-1">
                  Radio (km)
                </label>
                <input
                  id="aoi-radius-km"
                  type="number"
                  step="any"
                  min="1"
                  required
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="aoi-min-lat" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitud mínima
                </label>
                <input
                  id="aoi-min-lat"
                  type="number"
                  step="any"
                  required
                  value={minLat}
                  onChange={(e) => setMinLat(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="aoi-max-lat" className="block text-xs font-medium text-slate-700 mb-1">
                  Latitud máxima
                </label>
                <input
                  id="aoi-max-lat"
                  type="number"
                  step="any"
                  required
                  value={maxLat}
                  onChange={(e) => setMaxLat(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="aoi-min-lon" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitud mínima
                </label>
                <input
                  id="aoi-min-lon"
                  type="number"
                  step="any"
                  required
                  value={minLon}
                  onChange={(e) => setMinLon(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
              <div>
                <label htmlFor="aoi-max-lon" className="block text-xs font-medium text-slate-700 mb-1">
                  Longitud máxima
                </label>
                <input
                  id="aoi-max-lon"
                  type="number"
                  step="any"
                  required
                  value={maxLon}
                  onChange={(e) => setMaxLon(e.target.value)}
                  className="w-full h-9 px-2.5 text-xs font-mono border border-slate-300 rounded-md"
                />
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md"
            >
              Aplicar área
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
