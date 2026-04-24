export interface Weights {
  conflict: number;
  disaster: number;
  food:     number;
  seismic:  number;
}

export const DEFAULT_WEIGHTS: Weights = {
  conflict: 35,
  disaster: 25,
  food:     25,
  seismic:  15,
};

export const WEIGHT_DIMS: {
  key:   keyof Weights;
  label: string;
  icon:  string;
  color: string;
  desc:  string;
}[] = [
  {
    key:   'conflict',
    label: 'Armed Conflict',
    icon:  '⚔️',
    color: '#dc2626',
    desc:  'Wars & terrorism (UCDP + GTD)',
  },
  {
    key:   'disaster',
    label: 'Natural Disaster',
    icon:  '🌪️',
    color: '#ea580c',
    desc:  'Floods, storms, drought (INFORM 2026)',
  },
  {
    key:   'food',
    label: 'Food Security',
    icon:  '🌾',
    color: '#ca8a04',
    desc:  'Undernourishment (World Bank)',
  },
  {
    key:   'seismic',
    label: 'Seismic Activity',
    icon:  '🔴',
    color: '#7c3aed',
    desc:  'Earthquakes M4.5+ (USGS real-time)',
  },
];
