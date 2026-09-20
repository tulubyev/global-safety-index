export interface Weights {
  conflict: number;
  disaster: number;
  food:     number;
  seismic:  number;
  pandemic: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  conflict: 30,
  disaster: 20,
  food:     20,
  seismic:  10,
  pandemic: 20,
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
    desc:  'Undernourishment (World Bank)',
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
