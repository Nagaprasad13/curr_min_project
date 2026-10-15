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
    '--color-canvas': '#f4f8f5',
    '--color-surface': '#ffffff',
    '--color-text': '#17251e',
    '--color-text-muted': '#4b5d53',
    '--color-text-subtle': '#52645a',
    '--color-text-inverse': '#ffffff',
    '--color-primary': '#006b4f',
    '--color-danger': '#a9251b',
    '--color-danger-subtle': '#fff0ee',
    '--color-warning': '#754900',
    '--color-warning-subtle': '#fff5d9',
    '--color-info': '#075985',
    '--color-info-subtle': '#e8f5fc',
    '--color-success': '#006b4f',
    '--color-success-subtle': '#e1f3eb',
    '--color-border': '#61756a',
  },
  dark: {
    '--color-canvas': '#101813',
    '--color-surface': '#18231c',
    '--color-text': '#f1f7f3',
    '--color-text-muted': '#cad8ce',
    '--color-text-subtle': '#d5e1d9',
    '--color-text-inverse': '#102017',
    '--color-primary': '#70dfb5',
    '--color-danger': '#ff9387',
    '--color-danger-subtle': '#482521',
    '--color-warning': '#f4cf74',
    '--color-warning-subtle': '#463817',
    '--color-info': '#8ed4f5',
    '--color-info-subtle': '#173648',
    '--color-success': '#70dfb5',
    '--color-success-subtle': '#203d30',
    '--color-border': '#9cad9f',
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
