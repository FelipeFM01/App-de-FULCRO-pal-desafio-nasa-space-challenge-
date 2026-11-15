import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { HarmonizedHotspot } from '../types/fire';

interface HotspotDetailTableProps {
  hotspots: HarmonizedHotspot[];
}

export const HotspotDetailTable: React.FC<HotspotDetailTableProps> = ({ hotspots }) => {
  const [query, setQuery] = useState('');
  const [sensorFilter, setSensorFilter] = useState<'ALL' | 'MODIS' | 'VIIRS'>('ALL');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return hotspots
      .filter((h) => {
        if (sensorFilter !== 'ALL' && h.sensor !== sensorFilter) return false;
        if (!q) return true;
        return (
          h.acqDate.includes(q) ||
          h.resolvedCause.toLowerCase().includes(q) ||
          h.resolvedLandCover.toLowerCase().includes(q) ||
          h.satellite.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.acqDate > b.acqDate ? -1 : a.acqDate < b.acqDate ? 1 : b.harmonizedFrpMW - a.harmonizedFrpMW));
  }, [hotspots, query, sensorFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const rows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  return (
    <section
      aria-label="Registro de focos de calor"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Registro de focos filtrados ({filtered.length.toLocaleString('es-ES')})
          </h2>
          <p className="text-xs text-slate-500">
            Ordenados por fecha más reciente · listos para despacho operativo y descarga CSV
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Buscar fecha, causa o satélite..."
              aria-label="Buscar en registro de focos"
              className="h-8 pl-8 pr-3 text-xs bg-white border border-slate-200 rounded-md w-56 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-600"
            />
          </div>

          <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-md">
            {(['ALL', 'VIIRS', 'MODIS'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setSensorFilter(s);
                  setPage(0);
                }}
                className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors ${
                  sensorFilter === s
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {s === 'ALL' ? 'Todos' : s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500 font-medium bg-slate-50/40">
              <th className="py-2 px-4">Fecha / Hora</th>
              <th className="py-2 px-3">Coordenadas</th>
              <th className="py-2 px-3">Sensor / Satélite</th>
              <th className="py-2 px-3 text-right">Peso arm.</th>
              <th className="py-2 px-3 text-right">FRP (MW)</th>
              <th className="py-2 px-3">Cobertura</th>
              <th className="py-2 px-4">Causa probable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No hay registros que coincidan con el filtro aplicado.
                </td>
              </tr>
            ) : (
              rows.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="py-2 px-4 font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {h.acqDate} <span className="text-slate-400">{h.acqTime}</span>
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                    <div>{h.latitude.toFixed(4)}°, {h.longitude.toFixed(4)}°</div>
                    {h.resolvedRegion && (
                      <div className="font-sans text-[11px] text-slate-500">{h.resolvedRegion}</div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-slate-700 whitespace-nowrap">
                    {h.sensor} · {h.satellite}
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-right text-slate-800">
                    {h.harmonizedWeight.toFixed(2)}
                  </td>
                  <td className="py-2 px-3 font-mono tabular-nums text-right font-medium text-slate-900">
                    {h.harmonizedFrpMW.toFixed(1)}
                  </td>
                  <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                    {h.resolvedLandCover}
                  </td>
                  <td className="py-2 px-4 text-slate-700">{h.resolvedCause}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <span className="font-mono tabular-nums">
            Página {safePage + 1} de {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-2.5 py-1 border border-slate-200 rounded bg-white hover:bg-slate-50 disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
