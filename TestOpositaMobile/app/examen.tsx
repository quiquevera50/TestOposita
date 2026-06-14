import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { useTheme } from '../context/ThemeContext';
import { useEconomy } from '../context/EconomyContext';
import { useGameFeedback } from '../hooks/useGameFeedback';
import { useSafeBack } from '../hooks/useSafeBack';
import { registrarProgresoMisiones } from './test';

// ==========================================
// 📝 EXAMEN OFICIAL — Simulacro mixto cronometrado
// Mezcla preguntas del temario (PDF) + tus fallos. Penalización 4 fallos = -1 acierto.
// ==========================================

const correctaDe = (q: any) => (q.Indice_correcta !== undefined ? q.Indice_correcta : q.respuesta_correcta);
const enunciadoDe = (q: any) => q.Pregunta || q.pregunta || '';
const opcionesDe = (q: any) => q.Opciones || q.opciones || [];

function formatT(seg: number) {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ExamenOficialScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const cursoId = params.cursoId ? parseInt(params.cursoId as string) : null;
  const cursoNombre = (params.cursoNombre as string) || 'Mis Apuntes';
  const { colors, isDark } = useTheme();
  const { consumirVida, ganarRubies, fetchEconomia } = useEconomy();
  const { feedbackSeleccion, feedbackVictoria } = useGameFeedback();
  const volver = useSafeBack(cursoId ? { pathname: '/curso/[id]', params: { id: String(cursoId), nombre: cursoNombre } } : '/(tabs)');

  const [vista, setVista] = useState<'config' | 'cargando' | 'juego' | 'resultado'>('config');
  const [apuntes, setApuntes] = useState<any[]>([]);
  const [apunteSel, setApunteSel] = useState<any>(null);
  const [fallosCount, setFallosCount] = useState(0);
  const [total, setTotal] = useState(20);
  const [pctFallos, setPctFallos] = useState(0); // 0 / 30 / 50
  const [cargandoMsg, setCargandoMsg] = useState('');

  // Juego
  const [preguntas, setPreguntas] = useState<any[]>([]);
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<number, number>>({});
  const [segundos, setSegundos] = useState(0);

  // Resultado
  const [res, setRes] = useState<any>(null);

  useFocusEffect(useCallback(() => { cargar(); }, [cursoId]));

  const cargar = async () => {
    try {
      const url = cursoId ? `/apuntes-curso/${cursoId}` : '/apuntes';
      const r = await api.get(url);
      setApuntes(r.data);
      if (r.data.length === 1) setApunteSel(r.data[0]);
      if (cursoId) {
        const f = await api.get(`/fallos/${cursoId}`);
        setFallosCount(f.data.total);
      }
    } catch {}
  };

  // ⏱️ Cronómetro
  useEffect(() => {
    if (vista !== 'juego') return;
    const t = setInterval(() => setSegundos(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [vista]);

  const empezar = async () => {
    if (!apunteSel) return Alert.alert('Examen', 'Selecciona un PDF primero.');
    const exito = await consumirVida();
    if (!exito) return Alert.alert('¡Sin vidas! ❤️', 'Espera a que se recarguen o consigue más en la tienda.');

    setVista('cargando');
    try {
      const nFallos = Math.min(Math.round((total * pctFallos) / 100), fallosCount);
      const nPdf = total - nFallos;

      let banco: any[] = [];
      if (nFallos > 0 && cursoId) {
        setCargandoMsg('Recuperando tus fallos...');
        const f = await api.get(`/fallos/${cursoId}`);
        banco = [...f.data.preguntas].sort(() => Math.random() - 0.5).slice(0, nFallos);
      }

      let frescas: any[] = [];
      if (nPdf > 0) {
        setCargandoMsg(`Generando ${nPdf} preguntas del temario...`);
        const g = await api.post(`/generar-test-biblioteca/${apunteSel.id}`, null, { params: { cantidad: nPdf } });
        frescas = g.data.preguntas || [];
      }

      const todas = [...frescas, ...banco].sort(() => Math.random() - 0.5);
      if (todas.length === 0) throw new Error('No se generaron preguntas');

      setPreguntas(todas);
      setRespuestas({});
      setIndice(0);
      setSegundos(0);
      setVista('juego');
    } catch (e: any) {
      setVista('config');
      Alert.alert('Error', e?.response?.data?.detail || 'No se pudo crear el examen. Inténtalo de nuevo.');
    }
  };

  const responder = (idx: number) => {
    feedbackSeleccion();
    setRespuestas(prev => ({ ...prev, [indice]: idx }));
  };

  const entregar = async () => {
    const hacer = async () => {
      let aciertos = 0, fallos = 0;
      const falladas: any[] = [];
      preguntas.forEach((q, i) => {
        const r = respuestas[i];
        if (r === undefined) return; // sin contestar
        if (r === correctaDe(q)) aciertos++;
        else { fallos++; falladas.push(q); }
      });
      const sinContestar = preguntas.length - aciertos - fallos;
      const penalizacion = fallos / 4; // 4 fallos = -1 acierto
      const neto = Math.max(0, aciertos - penalizacion);
      const nota = Math.round((neto / preguntas.length) * 100) / 10; // sobre 10
      const xp = aciertos * 10;

      setRes({ aciertos, fallos, sinContestar, penalizacion, nota, xp, total: preguntas.length });
      setVista('resultado');
      feedbackVictoria();

      // Persistencia: fallos al banco, XP, misiones, rubíes
      try {
        if (cursoId && falladas.length) await api.post('/registrar-fallos', { curso_id: cursoId, preguntas: falladas });
        if (xp > 0) await api.post(`/sumar-xp/${xp}`);
        await registrarProgresoMisiones('oficial', xp);
        const rubies = nota >= 5 ? 15 : 5;
        await ganarRubies(rubies);
        setRes((prev: any) => ({ ...prev, rubies }));
        fetchEconomia();
      } catch {}
    };
    if (Platform.OS === 'web') {
      if (window.confirm('¿Entregar el examen? Se corregirá con penalización.')) hacer();
    } else {
      Alert.alert('Entregar examen', '¿Seguro? Se corregirá con penalización (4 fallos = -1).', [
        { text: 'Seguir', style: 'cancel' },
        { text: 'Entregar', onPress: hacer },
      ]);
    }
  };

  // ===== RENDER =====
  const Header = ({ titulo, onClose }: { titulo: string; onClose?: () => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: colors.card }}>
      <TouchableOpacity onPress={onClose || volver} style={{ padding: 5 }}>
        <Ionicons name={onClose ? 'close' : 'arrow-back'} size={26} color={onClose ? colors.error : colors.text} />
      </TouchableOpacity>
      <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1, textAlign: 'center', marginRight: 30 }} numberOfLines={1}>{titulo}</Text>
    </View>
  );

  // --- CONFIG ---
  if (vista === 'config') {
    const nFallos = Math.min(Math.round((total * pctFallos) / 100), fallosCount);
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header titulo={`Examen · ${cursoNombre}`} />
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff7ed', padding: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 22 }}>
            <Text style={{ fontSize: 28 }}>📝</Text>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>Simulacro de Examen</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>Cronometrado y con penalización: 4 fallos restan 1 acierto.</Text>
            </View>
          </View>

          {/* PDF */}
          {apuntes.length > 1 && (
            <>
              <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 10 }}>PDF base</Text>
              {apuntes.map(a => (
                <TouchableOpacity key={a.id}
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 8, backgroundColor: apunteSel?.id === a.id ? colors.tint + '22' : colors.card, borderWidth: 2, borderColor: apunteSel?.id === a.id ? colors.tint : colors.border }}
                  onPress={() => setApunteSel(a)}>
                  <Ionicons name="document-text" size={22} color={colors.tint} />
                  <Text style={{ color: colors.text, fontWeight: '600', flex: 1, marginLeft: 10 }} numberOfLines={1}>{a.nombre}</Text>
                  {apunteSel?.id === a.id && <Ionicons name="checkmark-circle" size={22} color={colors.tint} />}
                </TouchableOpacity>
              ))}
            </>
          )}

          {apuntes.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Ionicons name="document-outline" size={44} color={colors.subtext} />
              <Text style={{ color: colors.subtext, marginTop: 12, textAlign: 'center' }}>Sube un PDF en este curso para hacer un examen.</Text>
            </View>
          ) : (
            <>
              {/* Nº preguntas */}
              <Text style={{ color: colors.text, fontWeight: '800', marginTop: 10, marginBottom: 10 }}>Número de preguntas</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 22 }}>
                {[20, 40, 60].map(n => {
                  const a = total === n;
                  return (
                    <TouchableOpacity key={n} style={{ flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: a ? colors.tint : colors.card, borderWidth: 2, borderColor: a ? colors.tint : colors.border }} onPress={() => setTotal(n)}>
                      <Text style={{ color: a ? '#fff' : colors.text, fontWeight: '800', fontSize: 18 }}>{n}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Mezcla con fallos */}
              <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 4 }}>Mezcla con tus fallos</Text>
              <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 10 }}>
                {fallosCount > 0 ? `Tienes ${fallosCount} fallos disponibles para repasar en el examen.` : 'No tienes fallos guardados todavía.'}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                {[{ l: 'Solo temario', v: 0 }, { l: '30% fallos', v: 30 }, { l: '50% fallos', v: 50 }].map(opt => {
                  const a = pctFallos === opt.v;
                  const dis = opt.v > 0 && fallosCount === 0;
                  return (
                    <TouchableOpacity key={opt.v} disabled={dis}
                      style={{ flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: 'center', backgroundColor: a ? '#FF4B4B' : colors.card, borderWidth: 2, borderColor: a ? '#FF4B4B' : colors.border, opacity: dis ? 0.4 : 1 }}
                      onPress={() => setPctFallos(opt.v)}>
                      <Text style={{ color: a ? '#fff' : colors.text, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>{opt.l}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {pctFallos > 0 && (
                <Text style={{ color: colors.subtext, fontSize: 12, marginBottom: 18 }}>
                  Este examen tendrá {total - nFallos} del temario + {nFallos} de tus fallos.
                </Text>
              )}

              <TouchableOpacity
                style={{ backgroundColor: colors.tint, borderRadius: 16, padding: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, borderBottomWidth: 4, borderBottomColor: '#46A302', marginTop: 8 }}
                onPress={empezar} disabled={!apunteSel}>
                <Ionicons name="timer-outline" size={22} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 17 }}>Empezar examen</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                  <Ionicons name="heart" size={13} color="#fff" /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 12, marginLeft: 3 }}>x1</Text>
                </View>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // --- CARGANDO ---
  if (vista === 'cargando') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
        <ActivityIndicator size="large" color={colors.tint} />
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 20, textAlign: 'center' }}>{cargandoMsg || 'Preparando examen...'}</Text>
        <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 8 }}>Esto puede tardar unos segundos</Text>
      </View>
    );
  }

  // --- JUEGO ---
  if (vista === 'juego') {
    const q = preguntas[indice];
    const opciones = opcionesDe(q);
    const respondidas = Object.keys(respuestas).length;
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Cabecera con cronómetro */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 20, backgroundColor: colors.card }}>
          <TouchableOpacity onPress={() => {
            if (Platform.OS === 'web') { if (window.confirm('¿Salir del examen? Perderás el progreso.')) setVista('config'); }
            else Alert.alert('¿Salir?', 'Perderás el progreso del examen.', [{ text: 'Seguir', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: () => setVista('config') }]);
          }} style={{ padding: 4 }}>
            <Ionicons name="close" size={26} color={colors.error} />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? '#334155' : '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }}>
            <Ionicons name="time-outline" size={16} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: '800' }}>{formatT(segundos)}</Text>
          </View>
          <Text style={{ color: colors.subtext, fontWeight: '700' }}>{respondidas}/{preguntas.length}</Text>
        </View>

        {/* Progreso */}
        <View style={{ height: 12, backgroundColor: isDark ? '#1e293b' : '#e5e7eb' }}>
          <View style={{ height: '100%', width: `${Math.round(((indice + 1) / preguntas.length) * 100)}%`, backgroundColor: colors.tint }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <Text style={{ color: colors.tint, fontWeight: '800', fontSize: 13, marginBottom: 10 }}>PREGUNTA {indice + 1} DE {preguntas.length}</Text>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '700', lineHeight: 27, marginBottom: 22 }}>{enunciadoDe(q)}</Text>

          {opciones.map((op: string, idx: number) => {
            const sel = respuestas[indice] === idx;
            return (
              <TouchableOpacity key={idx}
                style={{ padding: 16, borderRadius: 14, marginBottom: 12, borderWidth: 2, backgroundColor: sel ? colors.tint + '22' : colors.card, borderColor: sel ? colors.tint : colors.border, flexDirection: 'row', alignItems: 'center', gap: 12 }}
                onPress={() => responder(idx)}>
                <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: sel ? colors.tint : colors.border, backgroundColor: sel ? colors.tint : 'transparent', justifyContent: 'center', alignItems: 'center' }}>
                  {sel && <Ionicons name="checkmark" size={16} color="#fff" />}
                </View>
                <Text style={{ color: colors.text, fontSize: 15, flex: 1 }}>{op}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Navegación */}
        <View style={{ flexDirection: 'row', padding: 16, gap: 10, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          <TouchableOpacity disabled={indice === 0} style={{ flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border, opacity: indice === 0 ? 0.4 : 1 }} onPress={() => setIndice(i => i - 1)}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>← Anterior</Text>
          </TouchableOpacity>
          {indice < preguntas.length - 1 ? (
            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: colors.tint }} onPress={() => setIndice(i => i + 1)}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Siguiente →</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={{ flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', backgroundColor: '#FF4B4B' }} onPress={entregar}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Entregar ✓</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  // --- RESULTADO ---
  if (vista === 'resultado' && res) {
    const aprobado = res.nota >= 5;
    const colorNota = res.nota >= 5 ? '#58CC02' : '#FF4B4B';
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Header titulo="Resultado del examen" />
        <ScrollView contentContainerStyle={{ padding: 24, alignItems: 'center' }}>
          <Text style={{ fontSize: 64, marginTop: 10 }}>{aprobado ? '🎉' : '📚'}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 6 }}>{aprobado ? '¡Aprobado!' : '¡Casi! A repasar'}</Text>

          {/* Nota grande */}
          <View style={{ width: 140, height: 140, borderRadius: 70, borderWidth: 12, borderColor: colorNota, justifyContent: 'center', alignItems: 'center', marginVertical: 24 }}>
            <Text style={{ fontSize: 44, fontWeight: '800', color: colorNota }}>{res.nota.toFixed(1)}</Text>
            <Text style={{ fontSize: 12, color: colors.subtext }}>nota /10</Text>
          </View>

          {/* Desglose */}
          <View style={{ width: '100%', backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 12 }}>
            {[
              { l: 'Aciertos', v: res.aciertos, c: '#58CC02', icon: 'checkmark-circle' },
              { l: 'Fallos', v: res.fallos, c: '#FF4B4B', icon: 'close-circle' },
              { l: 'Sin contestar', v: res.sinContestar, c: colors.subtext, icon: 'remove-circle' },
              { l: 'Penalización', v: `-${res.penalizacion.toFixed(2)}`, c: '#FF9600', icon: 'trending-down' },
              { l: 'Tiempo', v: formatT(segundos), c: colors.text, icon: 'time' },
            ].map(row => (
              <View key={row.l} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name={row.icon as any} size={18} color={row.c} />
                  <Text style={{ color: colors.text, fontSize: 15 }}>{row.l}</Text>
                </View>
                <Text style={{ color: row.c, fontWeight: '800', fontSize: 16 }}>{row.v}</Text>
              </View>
            ))}
          </View>

          {/* Recompensas */}
          <View style={{ flexDirection: 'row', gap: 30, marginTop: 20 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#CE82FF' }}>+{res.xp}</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>XP</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#FF3B6B' }}>+{res.rubies || 0}</Text>
              <Text style={{ color: colors.subtext, fontSize: 12 }}>💎</Text>
            </View>
          </View>

          {res.fallos > 0 && (
            <Text style={{ color: colors.subtext, fontSize: 13, textAlign: 'center', marginTop: 16 }}>
              Tus {res.fallos} fallos se guardaron. ¡Practícalos ahora!
            </Text>
          )}

          {/* 🔥 PRACTICAR LOS FALLOS DEL EXAMEN */}
          {res.fallos > 0 && (
            <TouchableOpacity
              style={{ backgroundColor: '#FF4B4B', borderRadius: 16, padding: 16, alignItems: 'center', width: '100%', marginTop: 18, borderBottomWidth: 4, borderBottomColor: '#C53030', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
              onPress={() => router.replace({ pathname: '/test', params: { cursoId: String(cursoId), cursoNombre, modoFallos: '1' } })}
            >
              <Ionicons name="flame" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Practicar mis {res.fallos} fallos</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={{ backgroundColor: colors.tint, borderRadius: 16, padding: 16, alignItems: 'center', width: '100%', marginTop: 12, borderBottomWidth: 4, borderBottomColor: '#46A302' }} onPress={() => { setRes(null); setVista('config'); }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Volver a exámenes</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return null;
}
