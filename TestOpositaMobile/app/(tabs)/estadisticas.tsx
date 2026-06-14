import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../api';
import { useTheme } from '../../context/ThemeContext';

const FILTROS = [
  { key: 'dia', label: 'Hoy' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
  { key: 'siempre', label: 'Todo' },
] as const;

const MODOS = [
  { key: 'tests', label: 'Tests', icon: 'flash' as const, color: '#FF9600', bg: '#FFF3E0' },
  { key: 'oficiales', label: 'Oficiales', icon: 'newspaper' as const, color: '#1CB0F6', bg: '#E3F4FD' },
  { key: 'retos', label: 'Retos', icon: 'trophy' as const, color: '#CE82FF', bg: '#F3E8FF' },
];

export default function EstadisticasScreen() {
  const { colors, isDark } = useTheme();
  const [filtroTiempo, setFiltroTiempo] = useState<'dia' | 'semana' | 'mes' | 'siempre'>('siempre');
  const [modalVisible, setModalVisible] = useState(false);
  const [modoDetalle, setModoDetalle] = useState<'tests' | 'oficiales' | 'retos' | null>(null);
  const [stats, setStats] = useState<any>({
    tests_completados: 0,
    examenes_completados: 0,
    fases_reto: 0,
    aciertos_totales: 0,
    fallos_totales: 0,
    precision: 0,
    detalles: null,
  });

  useFocusEffect(
    useCallback(() => { cargarEstadisticas(); }, [filtroTiempo])
  );

  const cargarEstadisticas = async () => {
    try {
      const res = await api.get(`/estadisticas-globales?periodo=${filtroTiempo}`);
      setStats(res.data);
    } catch {}
  };

  const precision = stats.precision ?? 0;
  const total = (stats.aciertos_totales ?? 0) + (stats.fallos_totales ?? 0);

  const modoInfo: Record<string, { count: number }> = {
    tests: { count: stats.tests_completados },
    oficiales: { count: stats.examenes_completados },
    retos: { count: stats.fases_reto },
  };

  const detalleModo = MODOS.find(m => m.key === modoDetalle);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>

        {/* ── FILTROS ── */}
        <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4, gap: 8 }}>
          {FILTROS.map(f => {
            const active = filtroTiempo === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={{
                  flex: 1,
                  paddingVertical: 9,
                  borderRadius: 14,
                  backgroundColor: active ? colors.tint : (isDark ? '#1E293B' : '#FFF'),
                  borderWidth: 1,
                  borderColor: active ? colors.tint : colors.border,
                  alignItems: 'center',
                }}
                onPress={() => setFiltroTiempo(f.key as any)}
              >
                <Text style={{ color: active ? '#FFF' : colors.subtext, fontWeight: active ? '700' : '500', fontSize: 13 }}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── RING DE PRECISIÓN ── */}
        <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
          <View style={{
            backgroundColor: isDark ? '#1E293B' : '#FFF',
            borderRadius: 24,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 24,
            alignItems: 'center',
          }}>
            <Text style={{ color: colors.subtext, fontSize: 13, fontWeight: '600', letterSpacing: 0.5, marginBottom: 16, textTransform: 'uppercase' }}>
              Precisión global
            </Text>

            {/* Ring SVG simulado con View anidados */}
            <View style={{ width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              {/* Pista exterior */}
              <View style={{
                position: 'absolute', width: 140, height: 140, borderRadius: 70,
                borderWidth: 14, borderColor: isDark ? '#334155' : '#F2F2F7',
              }} />
              {/* Arco de aciertos — simulado con overflow+rotación */}
              <View style={{
                position: 'absolute', width: 140, height: 140, borderRadius: 70,
                borderWidth: 14,
                borderColor: precision >= 50 ? colors.tint : '#FF4B4B',
                borderTopColor: 'transparent',
                borderRightColor: precision >= 25 ? (precision >= 50 ? colors.tint : '#FF4B4B') : 'transparent',
                transform: [{ rotate: '-45deg' }],
              }} />
              {/* Centro */}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 36, fontWeight: '800', color: precision >= 60 ? colors.tint : '#FF4B4B' }}>
                  {Math.round(precision)}%
                </Text>
                <Text style={{ color: colors.subtext, fontSize: 12 }}>{total} preguntas</Text>
              </View>
            </View>

            {/* Aciertos / Fallos */}
            <View style={{ flexDirection: 'row', gap: 24 }}>
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#58CC02' }} />
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>Aciertos</Text>
                </View>
                <Text style={{ color: '#58CC02', fontWeight: '800', fontSize: 22 }}>{stats.aciertos_totales}</Text>
              </View>
              <View style={{ width: 1, backgroundColor: colors.border }} />
              <View style={{ alignItems: 'center' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF4B4B' }} />
                  <Text style={{ color: colors.subtext, fontSize: 12 }}>Fallos</Text>
                </View>
                <Text style={{ color: '#FF4B4B', fontWeight: '800', fontSize: 22 }}>{stats.fallos_totales}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── MODOS JUGADOS ── */}
        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 }}>Modos jugados</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {MODOS.map(modo => (
              <TouchableOpacity
                key={modo.key}
                style={{
                  flex: 1,
                  backgroundColor: isDark ? '#1E293B' : '#FFF',
                  borderRadius: 20,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 16,
                  alignItems: 'center',
                }}
                onPress={() => { setModoDetalle(modo.key as any); setModalVisible(true); }}
              >
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: isDark ? modo.color + '22' : modo.bg, justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name={modo.icon} size={24} color={modo.color} />
                </View>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{modoInfo[modo.key].count}</Text>
                <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 2, textAlign: 'center' }}>{modo.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── BARRA DE PROGRESO VISUAL ── */}
        {total > 0 && (
          <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
            <View style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 12 }}>Distribución de respuestas</Text>
              <View style={{ flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: isDark ? '#334155' : '#F2F2F7' }}>
                <View style={{ flex: stats.aciertos_totales, backgroundColor: '#58CC02' }} />
                <View style={{ flex: stats.fallos_totales, backgroundColor: '#FF4B4B' }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ color: '#58CC02', fontSize: 12, fontWeight: '600' }}>✓ {stats.aciertos_totales} correctas</Text>
                <Text style={{ color: '#FF4B4B', fontSize: 12, fontWeight: '600' }}>{stats.fallos_totales} incorrectas ✗</Text>
              </View>
            </View>
          </View>
        )}

        {/* Estado vacío */}
        {total === 0 && (
          <View style={{ alignItems: 'center', marginTop: 40, paddingHorizontal: 40 }}>
            <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: isDark ? '#1E293B' : '#F2F2F7', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="bar-chart-outline" size={36} color={colors.subtext} />
            </View>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, textAlign: 'center' }}>Aún sin datos</Text>
            <Text style={{ color: colors.subtext, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
              Completa tu primer test para ver tus estadísticas aquí
            </Text>
          </View>
        )}

      </ScrollView>

      {/* ── MODAL DETALLE ── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, minHeight: '40%' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              {detalleModo && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: isDark ? detalleModo.color + '22' : detalleModo.bg, justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name={detalleModo.icon} size={22} color={detalleModo.color} />
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{detalleModo.label}</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => setModalVisible(false)} style={{ backgroundColor: isDark ? '#334155' : '#F2F2F7', padding: 8, borderRadius: 20 }}>
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {stats.detalles && modoDetalle && (
              <View style={{ gap: 10 }}>
                {(modoDetalle === 'tests' || modoDetalle === 'oficiales') && (
                  <>
                    {[
                      { label: 'Precisión', value: `${stats.detalles[modoDetalle]?.precision ?? 0}%`, color: colors.tint },
                      { label: 'Aciertos', value: `${stats.detalles[modoDetalle]?.aciertos ?? 0} ✅`, color: '#58CC02' },
                      { label: 'Fallos', value: `${stats.detalles[modoDetalle]?.fallos ?? 0} ❌`, color: '#FF4B4B' },
                    ].map(row => (
                      <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: isDark ? '#1E293B' : '#F8F8F8', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{row.label}</Text>
                        <Text style={{ color: row.color, fontWeight: '800', fontSize: 15 }}>{row.value}</Text>
                      </View>
                    ))}
                  </>
                )}
                {modoDetalle === 'retos' && (
                  <>
                    {[
                      { label: 'Fases superadas', value: `${stats.fases_reto} 🏆`, color: '#CE82FF' },
                      { label: 'Retos creados', value: `${stats.detalles.retos?.creados ?? 0} 📚`, color: colors.text },
                      { label: 'Completados 100%', value: `${stats.detalles.retos?.completados ?? 0} 🌟`, color: '#58CC02' },
                    ].map(row => (
                      <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: isDark ? '#1E293B' : '#F8F8F8', padding: 16, borderRadius: 16 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{row.label}</Text>
                        <Text style={{ color: row.color, fontWeight: '800', fontSize: 15 }}>{row.value}</Text>
                      </View>
                    ))}
                  </>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
