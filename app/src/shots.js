// Shot presets: named compositions for the Vice Poster editor. Each shot
// picks the hero palette and the three panel moods shown under it, plus the
// tag printed on each panel. The renderer (cover.js) reads only these
// fields, so a new shot is just one more entry here.

export const SHOTS = [
  {
    id: 'boulevard',
    label: 'Boulevard',
    palette: 'dusk',
    panels: ['dusk', 'neon', 'dawn'],
    panelTags: ['BOULEVARD', 'NEON NIGHT', 'GOLDEN HOUR'],
    caption: 'VICE CITY',
    subtitle: 'WELCOME TO LEONIDA',
  },
  {
    id: 'pier',
    label: 'Pier Sunset',
    palette: 'dawn',
    panels: ['dawn', 'dusk', 'neon'],
    panelTags: ['GOLDEN HOUR', 'BOULEVARD', 'NEON NIGHT'],
    caption: 'PIER SUNSET',
    subtitle: 'OCEAN DRIVE',
  },
  {
    id: 'neon',
    label: 'Neon Night',
    palette: 'neon',
    panels: ['neon', 'dusk', 'dawn'],
    panelTags: ['NEON NIGHT', 'BOULEVARD', 'GOLDEN HOUR'],
    caption: 'NEON NIGHT',
    subtitle: 'THE CITY NEVER SLEEPS',
  },
  {
    id: 'downtown',
    label: 'Downtown',
    palette: 'dusk',
    panels: ['dusk', 'dawn', 'neon'],
    panelTags: ['DOWNTOWN', 'GOLDEN HOUR', 'NEON NIGHT'],
    caption: 'DOWNTOWN',
    subtitle: 'VICE CITY STORIES',
  },
];

export const DEFAULT_SHOT_ID = 'boulevard';

export function shotById(id) {
  return SHOTS.find((s) => s.id === id) ?? SHOTS[0];
}
