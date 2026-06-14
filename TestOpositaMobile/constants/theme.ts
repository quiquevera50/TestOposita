import { Platform } from 'react-native';

const green = '#58CC02';
const greenDark = '#58CC02';

export const Colors = {
  light: {
    text: '#1C1C1E',
    subtext: '#8E8E93',
    background: '#F2F2F7',
    card: '#FFFFFF',
    tint: green,
    border: '#E5E5EA',
    icon: '#8E8E93',
    inputBg: '#FFFFFF',
    success: '#58CC02',
    error: '#FF4B4B',
    xp: '#CE82FF',
    streak: '#FF9600',
    tabIconDefault: '#8E8E93',
    tabIconSelected: green,
  },
  dark: {
    text: '#F8FAFC',
    subtext: '#8E8E93',
    background: '#0F172A',
    card: '#1E293B',
    tint: greenDark,
    border: '#334155',
    icon: '#64748B',
    inputBg: '#1E293B',
    success: '#58CC02',
    error: '#FF4B4B',
    xp: '#CE82FF',
    streak: '#FF9600',
    tabIconDefault: '#64748B',
    tabIconSelected: greenDark,
  },
};

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
