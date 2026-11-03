import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetClientSettingsForTests } from '../services/userSettings';
import { APPEARANCE_STORAGE_KEY } from '../utils/appearanceTheme';

import { useAppearanceSettings } from './useAppearanceSettings';

const setMatchMedia = (initialMatches: boolean) => {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.add(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      if (type === 'change' && typeof listener === 'function') {
        listeners.delete(listener as (event: MediaQueryListEvent) => void);
      }
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn(() => mediaQueryList),
  });

  return {
    setMatches(nextMatches: boolean) {
      matches = nextMatches;
      const event = {
        matches: nextMatches,
        media: mediaQueryList.media,
      } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
};

describe('useAppearanceSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('theme', () => {
    beforeEach(() => {
      document.documentElement.removeAttribute('data-color-vision');
      document.documentElement.removeAttribute('data-theme');
      document.documentElement.removeAttribute('style');
      document.body.removeAttribute('style');
    });

    it('updates syntax highlighting theme when auto theme follows OS changes', async () => {
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({
          theme: 'auto',
          syntaxTheme: 'vsDark',
        }),
      );
      const matchMedia = setMatchMedia(true);

      const { result } = renderHook(() => useAppearanceSettings());

      await waitFor(() => {
        expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
        expect(result.current.settings.syntaxTheme).toBe('vsDark');
      });

      act(() => {
        matchMedia.setMatches(false);
      });

      await waitFor(() => {
        expect(document.documentElement.getAttribute('data-theme')).toBe('light');
        expect(result.current.settings.syntaxTheme).toBe('github');
      });

      expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toMatchObject({
        theme: 'auto',
        syntaxTheme: 'github',
      });
    });

    it('applies the selected font to --mono-font-family', () => {
      setMatchMedia(false);

      const { result } = renderHook(() => useAppearanceSettings());
      const menlo = 'Menlo, Monaco, "Courier New", monospace';

      act(() => {
        result.current.updateSettings({
          ...result.current.settings,
          fontFamily: menlo,
        });
      });

      expect(document.documentElement.style.getPropertyValue('--mono-font-family')).toBe(menlo);
    });
  });

  describe('legacy editor storage', () => {
    it('discards browser-stored editor commands', () => {
      setMatchMedia(false);
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({
          theme: 'dark',
          editor: { id: 'custom', command: 'untrusted', argsTemplate: '%file' },
        }),
      );

      const { result } = renderHook(() => useAppearanceSettings());

      expect(result.current.settings).not.toHaveProperty('editor');
    });
  });

  describe('settings normalization', () => {
    beforeEach(() => {
      setMatchMedia(false);
    });

    it('falls back to the default font when fontFamily is unknown', () => {
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({
          theme: 'dark',
          fontFamily: 'Comic Sans MS, cursive',
        }),
      );

      const { result } = renderHook(() => useAppearanceSettings());

      expect(result.current.settings.fontFamily).toMatch(/^ui-monospace/);
    });

    it('turns on approval animations that saved settings predate', () => {
      localStorage.setItem(
        APPEARANCE_STORAGE_KEY,
        JSON.stringify({
          theme: 'dark',
          approvalAnimations: { confetti: false, streamers: true, sparkles: true },
        }),
      );

      const { result } = renderHook(() => useAppearanceSettings());

      expect(result.current.settings.approvalAnimations).toEqual({
        confetti: false,
        streamers: true,
        sparkles: true,
        fireworks: true,
        spirals: true,
        lasers: true,
        disco: true,
      });
    });
  });

  describe('server-persisted settings', () => {
    beforeEach(() => {
      setMatchMedia(false);
      resetClientSettingsForTests();
    });

    it('hydrates settings from the server config and caches them locally', async () => {
      (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/user-settings')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              version: 1,
              client: { appearance: { theme: 'light', fontSize: 16 } },
            }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      const { result } = renderHook(() => useAppearanceSettings());

      await waitFor(() => {
        expect(result.current.settings.theme).toBe('light');
        expect(result.current.settings.fontSize).toBe(16);
      });

      expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) ?? '{}')).toMatchObject({
        theme: 'light',
        fontSize: 16,
      });
    });

    it('seeds the server from localStorage when the server has no appearance settings', async () => {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify({ theme: 'light' }));

      const putBodies: any[] = [];
      (global.fetch as any).mockImplementation((url: string, init?: RequestInit) => {
        if (url.includes('/api/user-settings') && init?.method === 'PUT') {
          putBodies.push(JSON.parse(String(init.body)));
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url.includes('/api/user-settings')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ version: 1, client: {} }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      renderHook(() => useAppearanceSettings());

      await waitFor(() => {
        expect(putBodies.length).toBeGreaterThan(0);
      });
      expect(putBodies[0].client.appearance).toMatchObject({ theme: 'light' });
    });
  });
});
