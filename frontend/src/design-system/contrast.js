export const CONTRAST_PAIRS = [
  ['body text', '--color-text', '--color-canvas', 4.5],
  ['muted text', '--color-text-muted', '--color-surface', 4.5],
  ['subtle text', '--color-text-subtle', '--color-surface', 4.5],
  ['interactive text', '--color-primary', '--color-surface', 4.5],
  ['primary button', '--color-text-inverse', '--color-primary', 4.5],
  ['danger text', '--color-danger', '--color-danger-subtle', 4.5],
  ['warning text', '--color-warning', '--color-warning-subtle', 4.5],
  ['info text', '--color-info', '--color-info-subtle', 4.5],
  ['success text', '--color-success', '--color-success-subtle', 4.5],
  ['input boundary', '--color-border', '--color-surface', 3],
];

function toLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex.replace('#', '').match(/.{2}/g).map((channel) => parseInt(channel, 16));
    return 0.2126 * toLinear(channels[0]) + 0.7152 * toLinear(channels[1]) + 0.0722 * toLinear(channels[2]);
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

export const THEME_TOKENS = {
  light: {
    '--color-canvas': '#F5F7FB',
    '--color-surface': '#FFFFFF',
    '--color-text': '#0F172A',
    '--color-text-muted': '#475569',
    '--color-text-subtle': '#64748B',
    '--color-text-inverse': '#FFFFFF',
    '--color-primary': '#1D4ED8',
    '--color-primary-navy': '#1E3A8A',
    '--color-danger': '#B91C1C',
    '--color-danger-subtle': '#FEF2F2',
    '--color-warning': '#92400E',
    '--color-warning-subtle': '#FFFBEB',
    '--color-info': '#1D4ED8',
    '--color-info-subtle': '#EFF6FF',
    '--color-success': '#15803D',
    '--color-success-subtle': '#F0FDF4',
    '--color-border': '#64748B',
    '--color-border-subtle': '#CBD5E1',
  },
  dark: {
    '--color-canvas': '#0F172A',
    '--color-surface': '#1E293B',
    '--color-text': '#F1F5F9',
    '--color-text-muted': '#94A3B8',
    '--color-text-subtle': '#CBD5E1',
    '--color-text-inverse': '#0F172A',
    '--color-primary': '#60A5FA',
    '--color-primary-navy': '#3B82F6',
    '--color-danger': '#FCA5A5',
    '--color-danger-subtle': '#450A0A',
    '--color-warning': '#FCD34D',
    '--color-warning-subtle': '#451A03',
    '--color-info': '#60A5FA',
    '--color-info-subtle': '#1E3A5F',
    '--color-success': '#4ADE80',
    '--color-success-subtle': '#052E16',
    '--color-border': '#94A3B8',
    '--color-border-subtle': '#475569',
  },
};

export function checkContrastTokens() {
  const failures = [];
  for (const [theme, tokens] of Object.entries(THEME_TOKENS)) {
    for (const [label, foregroundToken, backgroundToken, minimum] of CONTRAST_PAIRS) {
      const ratio = contrastRatio(tokens[foregroundToken], tokens[backgroundToken]);
      if (ratio < minimum) failures.push({ theme, label, ratio, minimum });
    }
  }
  return failures;
}
