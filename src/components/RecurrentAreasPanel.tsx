import React from 'react';
import { MapPin } from 'lucide-react';
import { RecurrentBurnArea } from '../types/fire';

interface RecurrentAreasPanelProps {
  areas: RecurrentBurnArea[];
  showRecurrentAreas: boolean;
  onToggleRecurrentAreas: () => void;
  selectedAreaId: string | null;
  onSelectArea: (areaId: string) => void;
}

export const RecurrentAreasPanel: React.FC<RecurrentAreasPanelProps> = ({
  areas,
  showRecurrentAreas,
  onToggleRecurrentAreas,
  selectedAreaId,
  onSelectArea,
}) => {
  const [showAll, setShowAll] = React.useState(false);
  const visibleAreas = showAll ? areas : areas.slice(0, 12);

  return (
    <section
      id="areas-recurrentes"
      aria-label="Áreas con incendios recurrentes"
      className="bg-white border border-slate-200 rounded-lg overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Áreas exactas de incendio recurrente ({areas.length})
          </h2>
          <p className="text-xs text-slate-500">
            Agrupación espacial de perímetros con múltiples episodios, intervalo de retorno, causa y fechas aproximadas
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleRecurrentAreas}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors whitespace-nowrap shrink-0 ${
            showRecurrentAreas
              ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700'
              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
          }`}
        >
          {showRecurrentAreas ? 'Ocultar perímetros en mapa' : 'Destacar perímetros en mapa'}
        </button>
      </div>

      {areas.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          No se detectaron áreas con recurrencia multi-episodio dentro del área de interés o filtro actual.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium bg-slate-50/40">
                  <th className="py-2.5 px-4">Área y ubicación exacta</th>
                  <th className="py-2.5 px-3">Recurrencia e intervalo</th>
                  <th className="py-2.5 px-3">Causa aproximada</th>
                  <th className="py-2.5 px-3">Fechas aproximadas</th>
                  <th className="py-2.5 px-3 text-right">Superficie / FRP máx</th>
                  <th className="py-2.5 px-4 text-right">Mapa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleAreas.map((area, idx) => {
                const isSelected = area.id === selectedAreaId;
                const levelTextClass =
                  area.recurrenceLevel === 'Crónica'
                    ? 'text-rose-700 font-semibold'
                    : area.recurrenceLevel === 'Frecuente'
                    ? 'text-orange-700 font-semibold'
                    : 'text-amber-700 font-medium';

                return (
                  <tr
                    key={area.id}
                    className={`transition-colors ${
                      isSelected ? 'bg-rose-50/70' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4 align-top">
                      <div className="font-semibold text-slate-900">
                        #{idx + 1} · {area.label.replace(/^Área #\d+\s*/, '')}
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 tabular-nums mt-0.5">
                        {area.centroidLat.toFixed(4)}°, {area.centroidLon.toFixed(4)}°
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top">
                      <div className={levelTextClass}>
                        {area.recurrenceLevel} · {area.eventCount} episodios
                      </div>
                      <div className="font-mono text-[11px] text-slate-600 tabular-nums mt-0.5">
                        {area.distinctYears.length} años ({area.yearsSpan})
                        {area.avgReturnYears !== null && ` · cada ~${area.avgReturnYears} años`}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top max-w-[280px]">
                      <div className="font-medium text-slate-900">{area.approximateCause}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                        {area.causeRationale}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top max-w-[240px]">
                      <div className="font-medium text-slate-800">{area.approximateDates}</div>
                      <div className="font-mono text-[11px] text-slate-500 mt-0.5">
                        Eventos: {area.sampleDates.join(' · ')}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="text-slate-900 font-medium">
                        {area.areaHa.toLocaleString('es-ES')} ha
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {area.maxFrpMW} MW máx
                      </div>
                    </td>

                    <td className="py-3 px-4 align-top text-right">
                      <button
                        type="button"
                        onClick={() => onSelectArea(area.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded transition-colors whitespace-nowrap"
                      >
                        <MapPin className="w-3 h-3" aria-hidden="true" />
                        <span>Ubicar</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              </tbody>
            </table>
          </div>
          {areas.length > 12 && (
            <div className="px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600 bg-slate-50/40">
              <span>
                Mostrando {visibleAreas.length} de {areas.length} áreas detectadas
              </span>
              <button
                type="button"
                onClick={() => setShowAll((prev) => !prev)}
                className="font-medium text-sky-700 hover:text-sky-900 hover:underline"
              >
                {showAll ? 'Mostrar solo las 12 principales' : `Ver todas (${areas.length})`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};
