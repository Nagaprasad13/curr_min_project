import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { checkContrastTokens, contrastRatio, CONTRAST_PAIRS, THEME_TOKENS } from '../design-system/contrast';
import DesignSystemPage from '../design-system/DesignSystemPage';

afterEach(cleanup);

describe('design system quality', () => {
  it('passes every declared WCAG AA token-pair threshold in both themes', () => {
    expect(checkContrastTokens()).toEqual([]);
    for (const theme of Object.values(THEME_TOKENS)) {
      for (const [, fg, bg, minimum] of CONTRAST_PAIRS) {
        expect(contrastRatio(theme[fg], theme[bg])).toBeGreaterThanOrEqual(minimum);
      }
    }
  });

  it.each(['light', 'dark'])('renders the component gallery accessibly in %s theme', async (theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = render(<DesignSystemPage />);
    expect(screen.getByRole('heading', { name: 'Design system' })).toBeInTheDocument();
    const results = await axe.run(container, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map(({ id, help }) => ({ id, help }))).toEqual([]);
  });
});
