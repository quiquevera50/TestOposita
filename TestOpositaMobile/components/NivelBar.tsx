import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface NivelBarProps {
  nivel: number;
  xpActual: number;
}

export const NivelBar = ({ nivel, xpActual }: NivelBarProps) => {
  const { colors, isDark } = useTheme();

  const xpParaSiguiente = Math.floor(nivel * 100 * 1.2);
  const porcentaje = Math.min(100, Math.max(0, (xpActual / xpParaSiguiente) * 100));

  let rango = 'Aspirante Novato';
  let emoji = '🌱';
  if (nivel >= 5)  { rango = 'Interino en Prácticas'; emoji = '📚'; }
  if (nivel >= 10) { rango = 'Funcionario de Carrera'; emoji = '🏛️'; }
  if (nivel >= 20) { rango = 'Jefe de Sección'; emoji = '⭐'; }
  if (nivel >= 50) { rango = 'Ministro Supremo'; emoji = '👑'; }

  return (
    <View style={[styles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.tint }]}>
          <Text style={styles.badgeNum}>{nivel}</Text>
        </View>

        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <Text style={{ fontSize: 11, marginRight: 4 }}>{emoji}</Text>
            <Text style={[styles.rango, { color: colors.text }]}>{rango}</Text>
          </View>
          <View style={[styles.barBg, { backgroundColor: isDark ? '#334155' : '#E5E5EA' }]}>
            <View style={[styles.barFill, { width: `${porcentaje}%`, backgroundColor: colors.tint }]} />
          </View>
        </View>

        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 13 }}>{Math.round(porcentaje)}%</Text>
          <Text style={{ color: colors.subtext, fontSize: 11 }}>{xpActual} XP</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeNum: { color: 'white', fontWeight: '800', fontSize: 18 },
  rango: { fontWeight: '700', fontSize: 14 },
  barBg: { height: 10, borderRadius: 10, overflow: 'hidden', marginTop: 6 },
  barFill: { height: '100%', borderRadius: 10 },
});
