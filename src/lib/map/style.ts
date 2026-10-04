import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'

/**
 * Our own map style, after Apple Maps: soft warm land, clear blue water, green parks, yellow motorways,
 * white streets, 3D buildings, hillshade and terrain, a globe when zoomed out, and sky at the horizon.
 * Vector tiles: OpenFreeMap (OpenStreetMap data, OpenMapTiles schema). Terrain: AWS Terrain Tiles.
 */

export type Theme = 'light' | 'dark'
export type MapLang = 'th' | 'en' | 'zh'

const PALETTE = {
  light: {
    land: '#f5f3ee',
    wood: '#d3eac4',
    grass: '#e1f0d2',
    park: '#c9e7b5',
    farmland: '#f0eedf',
    sand: '#f3ead2',
    residential: '#efebe3',
    commercial: '#f4e9e9',
    industrial: '#ece9f2',
    hospital: '#fbe3e3',
    school: '#f6efd9',
    water: '#a6d4f5',
    waterLine: '#8cc6ef',
    motorway: '#fcd36f',
    motorwayCasing: '#e8b44a',
    trunk: '#fde8a6',
    trunkCasing: '#e3c46f',
    street: '#ffffff',
    streetCasing: '#ddd8cf',
    path: '#cfc8bb',
    rail: '#c9c4d6',
    building: '#e7e1d6',
    buildingTop: '#ece7de',
    border: '#a99fbf',
    province: '#c6bfd6',
    label: '#2c2c2e',
    labelSoft: '#6e6e73',
    halo: '#ffffff',
    waterLabel: '#3c84c4',
    hillShadow: '#5a4e3a',
    hillHighlight: '#ffffff',
    sky: '#9fcbf2',
    horizon: '#e9f2fb',
  },
  dark: {
    land: '#1b1c20',
    wood: '#1d2a20',
    grass: '#1f2a21',
    park: '#20321f',
    farmland: '#212226',
    sand: '#2a2822',
    residential: '#202125',
    commercial: '#26212a',
    industrial: '#22222b',
    hospital: '#2d1f22',
    school: '#29261d',
    water: '#123a5f',
    waterLine: '#1a4a75',
    motorway: '#8a6a24',
    motorwayCasing: '#5e4718',
    trunk: '#5c4d2a',
    trunkCasing: '#3d331c',
    street: '#3a3b41',
    streetCasing: '#26272b',
    path: '#4a4a50',
    rail: '#4a4560',
    building: '#2e2f35',
    buildingTop: '#36373e',
    border: '#7d7393',
    province: '#4d475e',
    label: '#ececf0',
    labelSoft: '#a1a1a8',
    halo: '#111114',
    waterLabel: '#7fb7e6',
    hillShadow: '#000000',
    hillHighlight: '#8a8a8a',
    sky: '#0b1426',
    horizon: '#24324a',
  },
}

const name = (lang: MapLang): ExpressionSpecification =>
  lang === 'th'
    ? ['coalesce', ['get', 'name:th'], ['get', 'name']]
    : lang === 'zh'
      ? ['coalesce', ['get', 'name:zh'], ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
      : ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]

const zoomed = (stops: [number, number][]): ExpressionSpecification => [
  'interpolate',
  ['exponential', 1.5],
  ['zoom'],
  ...stops.flat(),
]

export const TERRAIN_SOURCE = 'terrain-dem'
export const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'

export function mapStyle(theme: Theme, lang: MapLang): StyleSpecification {
  const c = PALETTE[theme]
  const roads = (classes: string[]): ExpressionSpecification => ['match', ['get', 'class'], classes, true, false]
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': c.land } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'osm',
      'source-layer': 'landcover',
      paint: {
        'fill-color': ['match', ['get', 'class'], 'wood', c.wood, 'grass', c.grass, 'farmland', c.farmland, 'sand', c.sand, 'wetland', c.grass, c.grass],
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 10, 1],
      },
    },
    {
      id: 'landuse',
      type: 'fill',
      source: 'osm',
      'source-layer': 'landuse',
      minzoom: 9,
      paint: {
        'fill-color': [
          'match',
          ['get', 'class'],
          ['residential', 'suburb', 'neighbourhood'], c.residential,
          ['commercial', 'retail'], c.commercial,
          ['industrial', 'railway', 'garages'], c.industrial,
          'hospital', c.hospital,
          ['school', 'university', 'college', 'kindergarten'], c.school,
          ['cemetery', 'pitch', 'playground', 'stadium'], c.grass,
          c.residential,
        ],
      },
    },
    { id: 'park', type: 'fill', source: 'osm', 'source-layer': 'park', paint: { 'fill-color': c.park, 'fill-opacity': 0.9 } },
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'hillshade-dem',
      paint: {
        'hillshade-shadow-color': c.hillShadow,
        'hillshade-highlight-color': c.hillHighlight,
        'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 5, 0.35, 12, 0.2],
        'hillshade-illumination-anchor': 'viewport',
      },
    },
    { id: 'water', type: 'fill', source: 'osm', 'source-layer': 'water', paint: { 'fill-color': c.water } },
    {
      id: 'waterway',
      type: 'line',
      source: 'osm',
      'source-layer': 'waterway',
      paint: {
        'line-color': c.waterLine,
        // One zoom curve, with the river/stream difference inside each stop (MapLibre allows only one zoom expression).
        'line-width': [
          'interpolate',
          ['exponential', 1.5],
          ['zoom'],
          8, ['match', ['get', 'class'], 'river', 1, 0.2],
          14, ['match', ['get', 'class'], 'river', 5, 1.2],
          18, ['match', ['get', 'class'], 'river', 14, 4],
        ],
      },
    },
    {
      id: 'boundary-province',
      type: 'line',
      source: 'osm',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.province, 'line-width': zoomed([[5, 0.6], [12, 1.6]]), 'line-dasharray': [3, 2] },
    },
    {
      id: 'boundary-country',
      type: 'line',
      source: 'osm',
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.border, 'line-width': zoomed([[3, 1], [10, 2.5]]) },
    },
    // Roads: casing under fill, minor first.
    {
      id: 'road-minor-casing',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 12,
      filter: roads(['minor', 'service', 'tertiary', 'secondary']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.streetCasing, 'line-width': zoomed([[12, 1.5], [18, 22]]) },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 11,
      filter: roads(['minor', 'service', 'tertiary', 'secondary']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.street, 'line-width': zoomed([[11, 0.6], [18, 19]]) },
    },
    {
      id: 'road-path',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 14,
      filter: roads(['path', 'track']),
      paint: { 'line-color': c.path, 'line-width': zoomed([[14, 0.6], [18, 2.5]]), 'line-dasharray': [2, 1.5] },
    },
    {
      id: 'rail',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 9,
      filter: roads(['rail', 'transit']),
      paint: { 'line-color': c.rail, 'line-width': zoomed([[9, 0.8], [16, 3]]) },
    },
    {
      id: 'road-major-casing',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 6,
      filter: roads(['primary', 'trunk', 'motorway']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], 'motorway', c.motorwayCasing, c.trunkCasing],
        'line-width': zoomed([[6, 0.8], [10, 3], [18, 30]]),
      },
    },
    {
      id: 'road-major',
      type: 'line',
      source: 'osm',
      'source-layer': 'transportation',
      minzoom: 5,
      filter: roads(['primary', 'trunk', 'motorway']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['match', ['get', 'class'], 'motorway', c.motorway, c.trunk],
        'line-width': zoomed([[5, 0.6], [10, 2.2], [18, 26]]),
      },
    },
    {
      id: 'buildings',
      type: 'fill-extrusion',
      source: 'osm',
      'source-layer': 'building',
      minzoom: 14,
      paint: {
        'fill-extrusion-color': ['interpolate', ['linear'], ['coalesce', ['get', 'render_height'], 6], 0, c.building, 40, c.buildingTop],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, ['coalesce', ['get', 'render_height'], 6]],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    // Labels
    {
      id: 'water-name',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'water_name',
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-placement': 'point' },
      paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'waterway-name',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'waterway',
      minzoom: 12,
      filter: ['==', ['get', 'class'], 'river'],
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'symbol-placement': 'line' },
      paint: { 'text-color': c.waterLabel, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'road-name',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'symbol-placement': 'line' },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place-minor',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      minzoom: 10,
      filter: ['match', ['get', 'class'], ['village', 'suburb', 'hamlet', 'neighbourhood', 'quarter'], true, false],
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Regular'], 'text-size': zoomed([[10, 11], [16, 14]]) },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place-town',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      minzoom: 7,
      filter: ['==', ['get', 'class'], 'town'],
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Regular'], 'text-size': zoomed([[7, 11], [14, 16]]) },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    },
    {
      id: 'place-city',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      minzoom: 4,
      filter: ['==', ['get', 'class'], 'city'],
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Bold'], 'text-size': zoomed([[4, 11], [12, 20]]) },
      paint: { 'text-color': c.label, 'text-halo-color': c.halo, 'text-halo-width': 1.8 },
    },
    {
      id: 'place-country',
      type: 'symbol',
      source: 'osm',
      'source-layer': 'place',
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'country'],
      layout: { 'text-field': name(lang), 'text-font': ['Noto Sans Bold'], 'text-size': 14, 'text-transform': 'uppercase', 'text-letter-spacing': 0.1 },
      paint: { 'text-color': c.labelSoft, 'text-halo-color': c.halo, 'text-halo-width': 1.5 },
    },
  ]

  return {
    version: 8,
    name: `jaidee-${theme}`,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    projection: { type: 'globe' },
    sky: {
      'sky-color': c.sky,
      'horizon-color': c.horizon,
      'fog-color': c.horizon,
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.85,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.6, 9, 0],
    },
    sources: {
      osm: {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
      'hillshade-dem': {
        type: 'raster-dem',
        tiles: [TERRAIN_TILES],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 12,
      },
      [TERRAIN_SOURCE]: {
        type: 'raster-dem',
        tiles: [TERRAIN_TILES],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 12,
        attribution: '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Terrain Tiles</a>',
      },
    },
    terrain: { source: TERRAIN_SOURCE, exaggeration: 1.3 },
    layers,
  }
}
