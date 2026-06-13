// TestOpositaMobile/constants/theme.ts
import { Platform } from 'react-native';

const tintColorLight = '#007AFF';
const tintColorDark = '#3B82F6';

export const Colors = {
  light: {
    text: '#1f2937',        // Gris oscuro elegante
    subtext: '#6b7280',     // Gris medio para subtítulos
    background: '#f3f4f6',  // Fondo gris suave
    card: '#ffffff',        // Tarjetas blancas
    tint: tintColorLight,
    border: '#e5e7eb',      // Bordes sutiles
    icon: '#4b5563',
    inputBg: '#ffffff',     // Fondo de inputs
    success: '#10b981',     // Verde semáforo
    error: '#ef4444',       // Rojo semáforo
    
    // Mantenemos estos dos para que no se rompa la barra de navegación (Tabs)
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#f9fafb',        // Blanco roto (menos agresivo)
    subtext: '#9ca3af',
    background: '#111827',  // "Gray 900" (Gris espacial profundo)
    card: '#1f2937',        // "Gray 800" (Para diferenciar tarjetas del fondo)
    tint: tintColorDark,
    border: '#374151',      // Bordes oscuros
    icon: '#9ca3af',
    inputBg: '#374151',
    success: '#34d399',     // Verde brillante para fondo oscuro
    error: '#f87171',       // Rojo pastel para fondo oscuro
    
    // Mantenemos estos dos para los Tabs
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// Mantenemos tu configuración original de fuentes tal cual estaba
export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});