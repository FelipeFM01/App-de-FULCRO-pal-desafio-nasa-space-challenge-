import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import {
  autoDetectColumnMapping,
  buildHotspotsCSV,
  generateSampleTemplateCSV,
  inferSensorFromFileName,
  mapRowsToHotspots,
  parseDataBuffer,
} from './importer';
import { harmonizeHotspots } from './harmonization';

test('autoDetectColumnMapping and parseDataBuffer handle CSV and Excel workbooks', () => {
  const csv = generateSampleTemplateCSV();
  const csvBuf = new TextEncoder().encode(csv).buffer;
  const parsedCsv = parseDataBuffer(csvBuf, 'incendios_firms.csv');
  assert.equal(parsedCsv.format, 'csv');
  assert.equal(parsedCsv.rows.length, 5);
  assert.equal(parsedCsv.suggestedMapping.latitude, 'latitude');
  assert.equal(parsedCsv.suggestedMapping.acqDate, 'acq_date');

  const { hotspots, skippedCount } = mapRowsToHotspots(parsedCsv.rows, parsedCsv.suggestedMapping);
  assert.equal(skippedCount, 0);
  assert.equal(hotspots.length, 5);

  // Test Excel (.xlsx) buffer parsing with Spanish headers
  const ws = XLSX.utils.json_to_sheet([
    {
      Latitud: -37.5,
      Longitud: -72.4,
      Fecha: '15/02/2023',
      Sensor: 'VIIRS',
      Potencia: 85.4,
      Causa: 'Incendio forestal',
    },
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Focos');
  const xlsxUint8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

  const parsedXlsx = parseDataBuffer(xlsxUint8, 'focos_chile.xlsx');
  assert.equal(parsedXlsx.format, 'excel');
  const mapping = autoDetectColumnMapping(parsedXlsx.headers);
  assert.equal(mapping.latitude, 'Latitud');
  assert.equal(mapping.longitude, 'Longitud');
  assert.equal(mapping.acqDate, 'Fecha');

  const mappedXlsx = mapRowsToHotspots(parsedXlsx.rows, mapping);
  assert.equal(mappedXlsx.hotspots.length, 1);
  assert.equal(mappedXlsx.hotspots[0].acqDate, '2023-02-15');
  assert.equal(mappedXlsx.hotspots[0].probableCause, 'Incendio forestal');

  const { hotspots: harm } = harmonizeHotspots(mappedXlsx.hotspots);
  const outCsv = buildHotspotsCSV(harm);
  assert.match(outCsv, /2023-02-15/);
  assert.match(outCsv, /Incendio forestal/);

  // Test multi-sheet Excel with Región column and filename sensor inference
  assert.equal(inferSensorFromFileName('focos_viirs_2023.xlsx'), 'VIIRS');
  assert.equal(inferSensorFromFileName('historico_modis.xlsx'), 'MODIS');

  const wbMulti = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wbMulti,
    XLSX.utils.json_to_sheet([
      { Lat: -37.2, Lon: -72.8, Fecha: '2021-01-10', Región: 'Biobío', FRP: 50 },
    ]),
    '2021'
  );
  XLSX.utils.book_append_sheet(
    wbMulti,
    XLSX.utils.json_to_sheet([
      { Lat: -38.5, Lon: -72.6, Fecha: '2022-02-14', Región: 'La Araucanía', FRP: 32 },
    ]),
    '2022'
  );
  const multiBuf = XLSX.write(wbMulti, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const parsedMulti = parseDataBuffer(multiBuf, 'focos_viirs_regiones.xlsx');
  assert.equal(parsedMulti.sheetNames.length, 2);
  assert.equal(parsedMulti.rows.length, 2);
  assert.equal(parsedMulti.suggestedMapping.region, 'Región');

  const mappedMulti = mapRowsToHotspots(parsedMulti.rows, parsedMulti.suggestedMapping, {
    sourceFile: parsedMulti.fileName,
    fileIndex: 1,
    defaultSensor: parsedMulti.inferredDefaultSensor,
  });
  assert.equal(mappedMulti.hotspots.length, 2);
  assert.equal(mappedMulti.hotspots[0].sensor, 'VIIRS');
  assert.equal(mappedMulti.hotspots[0].region, 'Biobío');
  assert.equal(mappedMulti.hotspots[1].region, 'La Araucanía');
  assert.equal(mappedMulti.hotspots[0].sourceFile, 'focos_viirs_regiones.xlsx');
});

