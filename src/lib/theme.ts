/**
 * Theme resolution for server-rendered output — currently the invitation PDF.
 *
 * This is a deliberately minimal mirror of the client's src/lib/theme.ts: only
 * the four colours the PDF template actually draws with, and only the preset
 * table needed to resolve them. The full token set, contrast helpers and CSS
 * serialisation live on the client and have no business here.
 *
 * Keep the preset ids and colour values in step with
 * wedding-client-frontend/src/lib/theme.ts. If they drift, a couple's
 * downloadable PDF stops matching the web invitation they picked.
 */

export interface PdfThemeColors {
  primary: string;
  primaryLight: string;
  text: string;
  card: string;
}

const PRESETS: Record<string, PdfThemeColors> = {
  'classic-gold': { primary: '#D4AF37', primaryLight: '#E6D5B8', text: '#333230', card: '#FFFFFF' },
  'blush-rose':   { primary: '#B76E79', primaryLight: '#EBC7CB', text: '#3A2C2E', card: '#FFFFFF' },
  'emerald':      { primary: '#1F7A5C', primaryLight: '#A8D5C2', text: '#1E2B26', card: '#FFFFFF' },
  'dusty-blue':   { primary: '#4A6D8C', primaryLight: '#BCD0DE', text: '#24313B', card: '#FFFFFF' },
  'terracotta':   { primary: '#C1663F', primaryLight: '#EFC9AF', text: '#3A2A21', card: '#FFFFFF' },
  'sage':         { primary: '#6E8B5E', primaryLight: '#CBD9BE', text: '#2B3226', card: '#FFFFFF' },
  'plum':         { primary: '#6D3B6B', primaryLight: '#D4B8D2', text: '#2E2130', card: '#FFFFFF' },
  'midnight':     { primary: '#C8A96B', primaryLight: '#E5D2AE', text: '#F0EDE6', card: '#232732' },
};

const DEFAULT_PRESET = PRESETS['classic-gold'];

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function hex(value: unknown): string | null {
  return typeof value === 'string' && HEX_RE.test(value.trim()) ? value.trim() : null;
}

export interface ThemeSource {
  themePreset?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  textColor?: string | null;
  cardColor?: string | null;
}

/**
 * Resolve a wedding record to the four colours the PDF needs. Each field falls
 * back to the named preset, and an unknown or missing preset falls back to
 * Classic Gold — matching how the web invitation resolves, so a wedding that
 * has never opened the Style tab produces the PDF it always did.
 */
export function resolvePdfTheme(wedding: ThemeSource | null | undefined): PdfThemeColors {
  const preset = (wedding?.themePreset && PRESETS[wedding.themePreset]) || DEFAULT_PRESET;
  return {
    primary: hex(wedding?.primaryColor) || preset.primary,
    primaryLight: hex(wedding?.accentColor) || preset.primaryLight,
    text: hex(wedding?.textColor) || preset.text,
    card: hex(wedding?.cardColor) || preset.card,
  };
}
