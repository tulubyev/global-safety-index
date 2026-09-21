export interface Weights {
  conflict: number;
  crime:    number;
  road:     number;
  disaster: number;
  food:     number;
  seismic:  number;
  pandemic: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  conflict: 20,
  crime:    18,
  road:     12,
  disaster: 14,
  food:     12,
  seismic:  9,
  pandemic: 15,
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
    desc:  'Fatalities from armed conflict (UCDP GED)',
  },
  {
    key:   'crime',
    label: 'Violent Crime',
    icon:  '🔫',
    color: '#be123c',
    desc:  'Homicide rate per 100k (UNODC)',
  },
  {
    key:   'road',
    label: 'Road Safety',
    icon:  '🚗',
    color: '#c2410c',
    desc:  'Traffic deaths per 100k (WHO)',
  },
  {
    key:   'disaster',
    label: 'Natural Disaster',
    icon:  '🌪️',
    color: '#ea580c',
    desc:  'Floods, storms, drought (INFORM + ReliefWeb)',
  },
  {
    key:   'food',
    label: 'Food Security',
    icon:  '🌾',
    color: '#ca8a04',
    desc:  'Food insecurity, FIES (FAO)',
  },
  {
    key:   'seismic',
    label: 'Seismic Activity',
    icon:  '🔴',
    color: '#7c3aed',
    desc:  'Earthquake hazard (INFORM + USGS M4.5+)',
  },
  {
    key:   'pandemic',
    label: 'Pandemic Risk',
    icon:  '🦠',
    color: '#0891b2',
    desc:  'Outbreaks & epidemics (INFORM + WHO + ReliefWeb)',
  },
];
