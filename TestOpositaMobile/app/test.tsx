import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, FlatList, SafeAreaView, Modal, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from './config';
// 👇 1. Importamos el Hook
import { useTheme } from '../context/ThemeContext';
import { useGameFeedback } from '../hooks/useGameFeedback'; // Ajusta la ruta según donde lo creaste
import { useTaskManager } from '../context/TaskManagerContext'; //
import { useEnergy } from '../context/EnergyContext';
import { useSafeBack } from '../hooks/useSafeBack';

//  FUNCIÓN MAESTRA PARA EL CUADERNO DE MISIONES 
export const registrarProgresoMisiones = async (tipo: 'test' | 'reto' | 'oficial', xpGanada: number) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        const key = `@misiones_${hoy}`;
        const misionesStr = await AsyncStorage.getItem(key);
        
        //  SUSTITUYE ESTE BLOQUE EN test.tsx, reto.tsx y examen.tsx
        let misiones = {
            test: { actual: 0, meta: 1, xp: 20, titulo: "Haz un test rápido" },
            reto: { actual: 0, meta: 1, xp: 20, titulo: "Haz una fase en Modo Reto" }, // 👈 NUEVO
            oficial: { actual: 0, meta: 1, xp: 20, titulo: "Haz un Examen Oficial" }, // 👈 NUEVO
            xp: { actual: 0, meta: 200, xp: 50, titulo: "Gana 200 de Experiencia" } // 👈 NUEVO
        };

        if (misionesStr) misiones = JSON.parse(misionesStr);

        // Sumamos +1 a la misión del modo al que acabamos de jugar
        if (tipo && misiones[tipo]) misiones[tipo].actual += 1;
        // Sumamos la XP ganada a la barra general de progreso de XP
        if (xpGanada > 0) misiones.xp.actual += xpGanada;

        await AsyncStorage.setItem(key, JSON.stringify(misiones));
    } catch (e) {
        console.log("Error guardando misión", e);
    }
};
export default function ExamenScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const cursoId = params.cursoId ? parseInt(params.cursoId as string) : null;
  // Intenta leer 'cursoNombre', si no 'nombre' (por si acaso), si no "General"
  const cursoNombre = params.cursoNombre as string || "Mis Apuntes";
  // Sacamos colores
  const { colors, isDark } = useTheme();

  // ESTADOS GENERALES
  const [loading, setLoading] = useState(false);
  const [examData, setExamData] = useState<any[]>([]); 
  const [modoConfiguracion, setModoConfiguracion] = useState(true);
  const [xpGanada, setXpGanada] = useState(0);
  const [infoNivel, setInfoNivel] = useState<{subido: boolean, nuevo: number} | null>(null);

  // ESTADOS DE CONFIGURACIÓN
  const [misApuntes, setMisApuntes] = useState<any[]>([]);
  const [apunteSeleccionado, setApunteSeleccionado] = useState<number | null>(null);  
  const [cantidadPreguntas, setCantidadPreguntas] = useState(10);
  const [userId, setUserId] = useState<string | null>(null);
  // ESTADOS DEL EXAMEN
  const [indice, setIndice] = useState(0);
  const [puntuacion, setPuntuacion] = useState(0);
  const [respuestaSeleccionada, setRespuestaSeleccionada] = useState<number | null>(null);
  const [mostrarExplicacion, setMostrarExplicacion] = useState(false);
  const { feedbackAcierto, feedbackError, feedbackSeleccion } = useGameFeedback();
  const { tareasTest, limpiarTest, generarTestBackground, marcarLeido } = useTaskManager();
  const taskKey = cursoId ? cursoId.toString() : 'general';
  const estadoTarea = tareasTest[taskKey];
  const [subidaPendiente, setSubidaPendiente] = useState<{si: boolean, nivel: number | null}>({si: false, nivel: null});
  const [showVictoria, setShowVictoria] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  // NUEVOS ESTADOS PARA TESTS GUARDADOS
  const [testsExistentes, setTestsExistentes] = useState<any[]>([]);
 // --- ESTADOS PARA CARPETAS DE TESTS ---
  const [carpetasTests, setCarpetasTests] = useState<any[]>([]);
  const [carpetaExpandida, setCarpetaExpandida] = useState<number | null>(null);
  const [testActivoId, setTestActivoId] = useState<number | null>(null);
  // MODO FALLOS (banco de preguntas falladas)
  const [modoFallos, setModoFallos] = useState(false);
  const [fallosCount, setFallosCount] = useState(0);

  // ESTADOS PARA EL MODAL DE HISTORIAL
  const [modalHistorialVisible, setModalHistorialVisible] = useState(false);
  const [historialTestActivo, setHistorialTestActivo] = useState<any[]>([]);
  const [nombreTestHistorial, setNombreTestHistorial] = useState('');

  // --- ESTADOS PARA LA CORRECCIÓN VISUAL ---
  const [modalRevisionVisible, setModalRevisionVisible] = useState(false);
  const [preguntasRevision, setPreguntasRevision] = useState<any[]>([]);
  
  // Traemos la función de cobrar
  const { energia, consumirEnergia } = useEnergy();

  
  // 1. CARGA INTELIGENTE (Al entrar a la pantalla)
  useFocusEffect(
    useCallback(() => {
      marcarLeido(cursoId || 0, 'test');

      const iniciar = async () => {
        const id = await AsyncStorage.getItem('user_id');
        setUserId(id);

        // PRIORIDAD 1: Si venimos de un modo donde ya hay datos
        if (params.data) {
          try {
            const preguntasHome = JSON.parse(params.data as string);
            if (Array.isArray(preguntasHome) && preguntasHome.length > 0) {
                setModoFallos(false);
                iniciarExamenDirecto(preguntasHome);
                router.setParams({ data: '' });
                return; 
            }
          } catch (e) { console.log("Error datos home"); }
        } 
        
        // PRIORIDAD 2: ¿Terminó la IA un test en 2º plano? 
        // AHORA NO LO INICIAMOS, solo limpiamos la tarea para que no estorbe.
        else if (estadoTarea?.data) {
           limpiarTest(taskKey);
           setModoConfiguracion(true);
           cargarApuntes(); 
        }

        // PRIORIDAD 3: Pantalla limpia, mostramos configuración
        else if (examData.length === 0) {
            setModoConfiguracion(true);
            cargarApuntes(); 
        }
      };
      
      iniciar();
      
    }, [params.data, cursoId])
  );

  // 2. ESCUCHADOR ACTIVO (Por si la IA termina MIENTRAS estás mirando la pantalla)
  useEffect(() => {
      if (estadoTarea?.data) {
          // La IA ha terminado. Simplemente borramos la alerta del contexto.
          // El 'useEffect' de cargarCarpetas ya se encarga de que aparezca abajo mágicamente.
          limpiarTest(taskKey); 
      }
  }, [estadoTarea?.data]);
  // 3. FUNCIÓN AUXILIAR (Unifica la carga y evita condiciones de carrera)
  const iniciarExamenDirecto = (preguntas: any[]) => {
      setExamData(preguntas);
      setModoConfiguracion(false);
      resetExamState();

      // ⚠️ CLAVE: Retrasamos la limpieza del Contexto 150ms.
      // Si limpiamos instantáneamente, React choca al intentar dibujar y borrar a la vez.
      setTimeout(() => {
          limpiarTest(taskKey);
      }, 150);
  };
  // 4. CARGAR TESTS GUARDADOS DEL PDF SELECCIONADO
  //  Se actualiza cada vez que tocas un PDF distinto o cuando terminas de jugar y vuelves al menú
  useEffect(() => {
      if (apunteSeleccionado) {
          // Llamamos al nuevo endpoint que creamos en main.py
          api.get(`/tests-apunte/${apunteSeleccionado}`)
             .then(res => setTestsExistentes(res.data))
             .catch(e => console.log("Error cargando tests guardados", e));
      } else {
          setTestsExistentes([]);
      }
  }, [apunteSeleccionado, modoConfiguracion]); 
  
  const cargarApuntes = async () => { // Ya no recibe idUsuario
    try {
      // Rutas limpias y sin API_URL extra
      const url = cursoId ? `/apuntes-curso/${cursoId}` : `/apuntes`;
      
      const res = await api.get(url);
      
      // Filtrar solo los de Test Rápido
      const filtrados = res.data.filter((a: any) => a.categorias && a.categorias.includes('Test Rapido'));
      
      setMisApuntes(filtrados);
      if (filtrados.length > 0) setApunteSeleccionado(filtrados[0].id);
    } catch (e) { 
       console.log("Error cargando apuntes", e);
    }
  };
  
  // --- RECARGAR CARPETAS Aisladas por Curso ---
  const cargarCarpetas = useCallback(() => {
      if (userId && cursoId) {
          api.get(`/carpetas-tests/${cursoId}`)
             .then(res => setCarpetasTests(res.data))
             .catch(e => console.log("Error cargando carpetas", e));
          // Contador del banco de fallos
          api.get(`/fallos/${cursoId}`)
             .then(res => setFallosCount(res.data.total))
             .catch(() => {});
      }
  }, [userId, cursoId]);

  useEffect(() => {
      cargarCarpetas();
  }, [cargarCarpetas, estadoTarea?.data, modoConfiguracion]);

  // Jugar el Modo Fallos: carga las preguntas falladas del banco
  const jugarModoFallos = async () => {
      if (!cursoId) return Alert.alert("Modo Fallos", "Disponible dentro de un curso.");
      try {
          const res = await api.get(`/fallos/${cursoId}`);
          if (!res.data.total) {
              return Alert.alert("¡Sin fallos! 🎉", "No tienes preguntas falladas pendientes. ¡Sigue así!");
          }
          setModoFallos(true);
          setTestActivoId(null);
          iniciarExamenDirecto(res.data.preguntas);
      } catch {
          Alert.alert("Error", "No se pudo cargar el Modo Fallos.");
      }
  };
  
  const generarTestDesdeTab = async () => {
    if (!apunteSeleccionado) return Alert.alert("Ojo", "Selecciona un apunte primero");
    
    // 👇 1. Comprobamos si tiene saldo localmente
    if (energia < 1) {
        return Alert.alert("¡Sin Energía! ⚡", "No tienes rayos suficientes. Espera a que se recarguen o pásate a Premium (próximamente).");
    }

    // 👇 2. Le cobramos 1 rayo de verdad en el servidor
    const exito = await consumirEnergia();
    if (!exito) {
        return Alert.alert("Error", "No se ha podido procesar la energía.");
    }
    
    // 👇 3. Si ha pagado con éxito, le dejamos pasar
    generarTestBackground(cursoId || 0, apunteSeleccionado, cantidadPreguntas, cursoNombre);
  };

  const resetExamState = () => {
    setIndice(0);
    setPuntuacion(0);
    setRespuestaSeleccionada(null);
    setMostrarExplicacion(false);
    setShowVictoria(false);
    setShowLevelUp(false);
  };

  const responder = (idx: number) => {
    if (mostrarExplicacion) return;

    // Feedback táctil al pulsar
    feedbackSeleccion(); 

    setRespuestaSeleccionada(idx);
    setMostrarExplicacion(true);

    const nuevasPreguntas = [...examData];
    nuevasPreguntas[indice].seleccion_usuario = idx; 
    setExamData(nuevasPreguntas);

    const preg = examData[indice];
    const correcta = preg.Indice_correcta !== undefined ? preg.Indice_correcta : preg.respuesta_correcta;

    if (idx === correcta) {
    setPuntuacion(p => p + 1);
    feedbackAcierto(); 
    
    }
};
const siguiente = async () => {
    if (indice < examData.length - 1) {
        setIndice(i => i + 1);
        setRespuestaSeleccionada(null);
        setMostrarExplicacion(false);
    } else {
        const totalXP = puntuacion * 10;
        setXpGanada(totalXP);
        setShowVictoria(true);

        // AQUÍ LE AVISAMOS AL CUADERNO
        await registrarProgresoMisiones('test', totalXP);

        // === BANCO DE FALLOS ===
        const esCorrecta = (q: any) => {
            const c = q.Indice_correcta !== undefined ? q.Indice_correcta : q.respuesta_correcta;
            return q.seleccion_usuario === c;
        };
        if (modoFallos) {
            // En Modo Fallos: las acertadas salen del banco (dominadas)
            examData.filter(esCorrecta).forEach(q => {
                api.post('/superar-fallo', { curso_id: cursoId, pregunta: q }).catch(() => {});
            });
        } else {
            // En test normal: las falladas entran al banco
            const falladas = examData.filter(q => q.seleccion_usuario !== undefined && !esCorrecta(q));
            if (falladas.length > 0) {
                api.post('/registrar-fallos', { curso_id: cursoId, preguntas: falladas }).catch(() => {});
            }
        }
        
        if (userId) {
            // 1. Guardar historial: ¿Es un test guardado de la biblioteca o uno genérico?
            if (testActivoId) {
                // Guarda en la NUEVA tabla de historiales específicos
                api.post('/guardar-resultado-test', {
                    user_id: userId,
                    test_id: testActivoId,
                    aciertos: puntuacion,
                    total_preguntas: examData.length,
                    preguntas: examData // 👈 NUEVO: Le mandamos el test con nuestras marcas
                }).catch(e => console.log("Error guardando historial del test", e));
            } else {
                // Guarda en el historial general antiguo (por compatibilidad)
                api.post('/guardar-resultado', {
                    user_id: userId, 
                    curso_id: cursoId, 
                    aciertos: puntuacion,
                    total_preguntas: examData.length, 
                    preguntas: examData,
                    tipo: 'test_rapido', 
                    nombre_referencia: 'Test Rápido'
                }).catch(e => console.log("Error guardando historial general", e));
            }

            // 2. Sumar XP
            if (totalXP > 0) {
                try {
                    const resXp = await api.post(`/sumar-xp/${totalXP}`);
                    if (resXp.data.subido) {
                        setInfoNivel({ subido: true, nuevo: resXp.data.nuevo_nivel });
                    }
                } catch (e) { console.log("Error sumando XP", e); }
            }
        }
    }
};

// Para jugar un test que ya estaba guardado en la base de datos
  const jugarTestGuardado = (test: any) => {
      setModoFallos(false);
      setTestActivoId(test.id);
      try {
          const preguntas = typeof test.contenido_json === 'string' 
              ? JSON.parse(test.contenido_json) 
              : test.contenido_json;
          iniciarExamenDirecto(preguntas);
      } catch (e) {
          Alert.alert("Error", "No se pudo leer el test");
      }
  };
  // Abrir modal y cargar historial de ESE test
  const abrirHistorialTest = async (test: any, apunteNombre: string) => {
      setNombreTestHistorial(`${test.nombre} - ${apunteNombre}`);
      try {
          const res = await api.get(`/historial-test/${test.id}`);
          setHistorialTestActivo(res.data);
          setModalHistorialVisible(true);
      } catch (error) { Alert.alert("Error", "No se pudo cargar el historial."); }
  };
const abandonarExamen = () => {
      if (Platform.OS === 'web') {
          const salir = window.confirm("¿Seguro que quieres abandonar el examen? Se perderá el progreso.");
          if (salir) {
              setExamData([]);
              setModoConfiguracion(true);
              volver(); 
          }
      } else {
          Alert.alert("Abandonar Examen", "¿Seguro? Se perderá el progreso.", [
              { text: "Seguir", style: "cancel" },
              { text: "Salir", style: "destructive", onPress: () => {
                  setExamData([]);
                  setModoConfiguracion(true);
                  volver(); 
              }}
          ]);
    }
};
// PARA VOLVER
const volver = useSafeBack(cursoId ? { pathname: '/curso/[id]', params: { id: String(cursoId), nombre: cursoNombre } } : '/(tabs)');
// Función que recicla la lógica de historial.tsx
// Función que recicla la lógica de historial.tsx
const abrirRevision = (intento: any) => {
    try {
        const pregs = typeof intento.preguntas_json === 'string' ? JSON.parse(intento.preguntas_json) : intento.preguntas_json;
        setPreguntasRevision(pregs || []);
        
        // 1. Cerramos el historial primero
        setModalHistorialVisible(false); 
        
        // 2. Le damos tiempo a React a cerrar uno antes de abrir el otro
        setTimeout(() => {
            setModalRevisionVisible(true);
        }, 300);
        
    } catch (e) {
        Alert.alert("Error", "No se pudieron cargar los detalles.");
    }
};
// --- RENDERIZADO ---
// VISTA A: CONFIGURACIÓN
  if (modoConfiguracion) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        
        {/* CABECERA EXAMEN */}
        <View style={[styles.header, { backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={volver} style={{padding: 5}}>
                <Ionicons name="arrow-back" size={24} color={colors.text} />
            </TouchableOpacity>
            
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                {cursoNombre}
            </Text>

            {/* 👇 SUSTITUYE EL View VACÍO POR ESTO 👇 */}
            <View style={{ 
                flexDirection: 'row', alignItems: 'center', 
                backgroundColor: isDark ? '#334155' : '#eef2ff',
                paddingHorizontal: 10, paddingVertical: 5, 
                borderRadius: 15, borderWidth: 1, borderColor: colors.border
            }}>
                <Text style={{ fontSize: 16 }}>⚡</Text>
                <Text style={{ fontWeight: 'bold', color: colors.text, marginLeft: 4, fontSize: 13 }}>
                    {energia}
                </Text>
            </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20 }}>
            
            {/* CAJA INFORMATIVA */}
            <View style={{ backgroundColor: isDark ? '#1e293b' : '#fff7ed', padding: 20, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 30 }}>⚡</Text>
                <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 15 }}>Test</Text>
                    <Text style={{ color: colors.subtext, fontSize: 12 }}>Genera simulacros y repásalos en tu biblioteca abajo.</Text>
                </View>
            </View>

            {/* TARJETA MODO FALLOS */}
            <TouchableOpacity
                onPress={jugarModoFallos}
                disabled={fallosCount === 0}
                activeOpacity={0.85}
                style={{
                    flexDirection: 'row', alignItems: 'center', gap: 14,
                    backgroundColor: fallosCount > 0 ? '#FF4B4B' : colors.card,
                    borderRadius: 16, padding: 16, marginBottom: 25,
                    borderWidth: 1, borderColor: fallosCount > 0 ? '#FF4B4B' : colors.border,
                    borderBottomWidth: 4, borderBottomColor: fallosCount > 0 ? '#C53030' : (isDark ? '#0F172A' : '#E5E5EA'),
                }}
            >
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: fallosCount > 0 ? 'rgba(255,255,255,0.2)' : (isDark ? '#334155' : '#F2F2F7'), justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="flame" size={24} color={fallosCount > 0 ? '#FFF' : colors.subtext} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: fallosCount > 0 ? '#FFF' : colors.text, fontWeight: '800', fontSize: 16 }}>Modo Fallos</Text>
                    <Text style={{ color: fallosCount > 0 ? 'rgba(255,255,255,0.85)' : colors.subtext, fontSize: 12 }}>
                        {fallosCount > 0 ? `${fallosCount} preguntas por dominar` : 'Sin fallos pendientes ¡bien!'}
                    </Text>
                </View>
                {fallosCount > 0 && (
                    <View style={{ backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>{fallosCount}</Text>
                    </View>
                )}
            </TouchableOpacity>

           {/* ============================================== */}
            {/* SECCIÓN 1: GENERAR NUEVO TEST */}
            {/* ============================================== */}
            <Text style={[styles.label, { color: colors.text }]}>1. Selecciona un Apunte para generar test:</Text>
            
            {/* LISTA DE PDFS (Fija y con scroll interno si hay muchos) */}
            <View style={{ maxHeight: 220, marginBottom: 15 }}>
                <ScrollView nestedScrollEnabled={true}>
                    {misApuntes.length === 0 ? (
                        <Text style={{color: colors.subtext, fontStyle:'italic', textAlign:'center', marginTop:10}}>Sube un PDF primero.</Text>
                    ) : (
                        misApuntes.map((apunte) => {
                            const esSeleccionado = apunteSeleccionado === apunte.id;
                            return (
                                <TouchableOpacity
                                    key={apunte.id}
                                    style={[
                                        styles.itemApunte,
                                        { backgroundColor: colors.card, borderWidth: 2, borderColor: esSeleccionado ? colors.tint : colors.border }
                                    ]}
                                    onPress={() => setApunteSeleccionado(apunte.id)}
                                >
                                    <Ionicons name="document-text" size={24} color={esSeleccionado ? colors.tint : colors.icon} />
                                    <Text style={{ color: colors.text, fontWeight: esSeleccionado ? 'bold' : 'normal', flex: 1, marginLeft: 10 }}>{apunte.nombre}</Text>
                                    {esSeleccionado && <Ionicons name="checkmark-circle" size={22} color={colors.tint} />}
                                </TouchableOpacity>
                            );
                        })
                    )}
                </ScrollView>
            </View>

            {/* CONTROLES DE GENERACIÓN (Fijos debajo de la lista entera) */}
            {apunteSeleccionado && (
                <View style={{ padding: 15, backgroundColor: isDark ? '#1e293b' : '#f8fafc', borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.border }}>
                    <Text style={{ color: colors.text, fontWeight: 'bold', marginBottom: 10 }}>Modo de test</Text>
                    <View style={styles.cantidadRow}>
                        {[
                            { label: 'Rápido', sub: '10 preg.', num: 10 },
                            { label: 'Bloque', sub: '20 preg.', num: 20 },
                            { label: 'Medio', sub: '30 preg.', num: 30 },
                            { label: 'Todo', sub: 'el PDF', num: 0 },
                        ].map(modo => {
                            const activo = cantidadPreguntas === modo.num;
                            return (
                                <TouchableOpacity
                                    key={modo.num}
                                    style={[{ flex: 1, marginHorizontal: 3, borderRadius: 14, borderWidth: 1, paddingVertical: 11, alignItems: 'center', backgroundColor: colors.card, borderColor: colors.border }, activo && { backgroundColor: colors.tint, borderColor: colors.tint }]}
                                    onPress={() => setCantidadPreguntas(modo.num)}
                                >
                                    <Text style={[{ color: colors.text, fontWeight: '800', fontSize: 13 }, activo && { color: 'white' }]}>{modo.label}</Text>
                                    <Text style={[{ color: colors.subtext, fontSize: 10, marginTop: 1 }, activo && { color: 'rgba(255,255,255,0.85)' }]}>{modo.sub}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {estadoTarea?.loading ? (
                        <View style={[styles.btnStart, { backgroundColor: colors.border, flexDirection:'row', gap: 10, justifyContent: 'center' }]}>
                            <ActivityIndicator color={colors.text} />
                            <Text style={{color: colors.text, fontWeight:'bold'}}>Generando test...</Text>
                        </View>
                    ) : (
                        <TouchableOpacity 
                            onPress={generarTestDesdeTab} 
                            style={[styles.btnStart, { backgroundColor: colors.tint, paddingVertical: 12 }]}
                        >
                            <Text style={{color:'white', fontWeight:'bold', fontSize: 18}}>¡Crear Test!</Text>
                            
                            {/* 👇 PÍLDORA DE COSTE DE ENERGÍA 👇 */}
                            <View style={{ 
                                flexDirection: 'row', alignItems: 'center', 
                                backgroundColor: 'rgba(0,0,0,0.15)', // Fondo oscuro semitransparente
                                paddingHorizontal: 12, paddingVertical: 4, 
                                borderRadius: 10, marginTop: 6 
                            }}>
                                <Text style={{fontSize: 14}}>⚡</Text>
                                <Text style={{color:'white', fontWeight:'bold', fontSize: 13, marginLeft: 4}}>x1</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                </View>
            )}
            {/* ============================================== */}
            {/* SECCIÓN 2: BIBLIOTECA DE TESTS (CARPETAS) */}
            {/* ============================================== */}
            <View style={{ marginTop: 35, borderTopWidth: 1, borderColor: colors.border, paddingTop: 25 }}>
                <Text style={[styles.label, { color: colors.text }]}>2. Tu Biblioteca de Tests:</Text>
                
                {carpetasTests.length === 0 ? (
                    <Text style={{color: colors.subtext, fontStyle:'italic', textAlign:'center', marginTop:10}}>Aún no has generado ningún test.</Text>
                ) : (
                    carpetasTests.map(carpeta => {
                        const estaAbierta = carpetaExpandida === carpeta.apunte_id;

                        return (
                            <View key={carpeta.apunte_id} style={{ marginBottom: 10 }}>
                                {/* EL BOTÓN DE LA CARPETA (NOMBRE DEL PDF) */}
                                <TouchableOpacity 
                                    onPress={() => setCarpetaExpandida(estaAbierta ? null : carpeta.apunte_id)}
                                    style={{ 
                                        flexDirection: 'row', alignItems: 'center', padding: 15, 
                                        backgroundColor: estaAbierta ? colors.card : (isDark ? '#1e293b' : '#f1f5f9'), 
                                        borderRadius: 12, borderWidth: 1, borderColor: estaAbierta ? colors.tint : colors.border 
                                    }}
                                >
                                    <Ionicons name={estaAbierta ? "folder-open" : "folder"} size={26} color={colors.tint} />
                                    <View style={{ flex: 1, marginLeft: 10 }}>
                                        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>{carpeta.apunte_nombre}</Text>
                                        <Text style={{ color: colors.subtext, fontSize: 12 }}>{carpeta.tests.length} tests guardados</Text>
                                    </View>
                                    <Ionicons name={estaAbierta ? "chevron-up" : "chevron-down"} size={24} color={colors.subtext} />
                                </TouchableOpacity>

                                {/* LOS TESTS DENTRO DE LA CARPETA */}
                                {estaAbierta && (
                                    <View style={{ paddingLeft: 20, paddingTop: 10 }}>
                                        {carpeta.tests.map((test: any) => (
                                            <View key={test.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: colors.card, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                                                <View>
                                                    <Text style={{ color: colors.text, fontWeight: 'bold' }}>{test.nombre}</Text>
                                                    <Text style={{ color: colors.subtext, fontSize: 12 }}>{test.cantidad_preguntas} preguntas</Text>
                                                </View>
                                                
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                    {/* 🔥 AQUÍ PASAMOS EL NOMBRE DEL PDF PARA EL HISTORIAL */}
                                                    <TouchableOpacity onPress={() => abrirHistorialTest(test, carpeta.apunte_nombre)} style={{ padding: 8 }}>
                                                        <Ionicons name="time-outline" size={24} color={colors.subtext} />
                                                    </TouchableOpacity>
                                                    
                                                    <TouchableOpacity onPress={() => jugarTestGuardado(test)} style={{ backgroundColor: colors.tint, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8 }}>
                                                        <Text style={{ color: 'white', fontWeight: 'bold' }}>Jugar</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
            </View>

            <View style={{height: 100}} /> 
        </ScrollView>

        {/* MODAL DEL HISTORIAL ESPECÍFICO (Se queda igual, ya usa nombreTestHistorial actualizado) */}
        <Modal visible={modalHistorialVisible} transparent animationType="slide">
            {/* ... Tu código del Modal del historial que tenías ... */}
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, maxHeight: '80%', minHeight: '50%' }}>
                    
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                        <View style={{ flex: 1, paddingRight: 15 }}>
                            <Text style={{ fontSize: 22, fontWeight: 'bold', color: colors.text }}>Tus Notas</Text>
                            <Text style={{ color: colors.tint, fontWeight: 'bold', marginTop: 5 }} numberOfLines={2}>
                                {nombreTestHistorial}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={() => setModalHistorialVisible(false)} style={{ backgroundColor: colors.card, padding: 8, borderRadius: 20 }}>
                            <Ionicons name="close" size={28} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    {historialTestActivo.length === 0 ? (
                        <View style={{ alignItems: 'center', marginTop: 50 }}>
                            <Ionicons name="document-text-outline" size={60} color={colors.border} />
                            <Text style={{ color: colors.subtext, marginTop: 10 }}>Aún no has jugado a este test.</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={historialTestActivo}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={({ item }) => (
                                <View style={{ flexDirection: 'row', backgroundColor: colors.card, padding: 15, borderRadius: 15, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>Nota: {item.total_preguntas > 0 ? ((item.aciertos / item.total_preguntas) * 10).toFixed(1) : 0} / 10</Text>
                                        <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 2 }}>{new Date(item.fecha).toLocaleDateString()}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={{ color: item.aciertos >= (item.total_preguntas / 2) ? colors.success : colors.error, fontWeight: 'bold', fontSize: 16 }}>{item.aciertos}/{item.total_preguntas}</Text>
                                            <Text style={{ color: colors.subtext, fontSize: 10 }}>Aciertos</Text>
                                        </View>
                                        <TouchableOpacity onPress={() => abrirRevision(item)}>
                                            <Text style={{color: colors.tint, fontWeight: 'bold', fontSize: 13, marginTop: 8}}>Ver fallos 👉</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        />
                    )}
                </View>
            </View>
        </Modal>
        {/* MODAL DE REVISIÓN DE FALLOS (Basado en historial.tsx) */}
        <Modal visible={modalRevisionVisible} animationType="slide">
            <SafeAreaView style={{flex: 1, backgroundColor: colors.background}}>
                
                {/* Cabecera Modal */}
                <View style={[styles.header, { backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border, paddingTop: 40 }]}>
                    <TouchableOpacity onPress={() => setModalRevisionVisible(false)} style={{padding: 5}}>
                        <Ionicons name="close" size={28} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: colors.text }]}>Corrección</Text>
                    <View style={{width: 38}} />
                </View>
                
                <ScrollView contentContainerStyle={{padding: 20}}>
                    {preguntasRevision.length === 0 ? (
                        <Text style={{textAlign:'center', marginTop:20, color: colors.subtext}}>Detalles no disponibles.</Text>
                    ) : (
                        preguntasRevision.map((preg: any, index: number) => {
                            const enunciado = preg.Pregunta || preg.pregunta;
                            const opciones = preg.Opciones || preg.opciones || [];
                            const explicacion = preg.Explicacion || preg.explicacion;
                            const correctaIdx = preg.Indice_correcta !== undefined ? preg.Indice_correcta : preg.respuesta_correcta;
                            
                            // Recuperamos lo que marcó el usuario
                            const seleccionUsuario = preg.seleccion_usuario; 

                            return (
                                <View key={index} style={{ backgroundColor: colors.card, borderColor: colors.border, padding: 20, borderRadius: 16, marginBottom: 20, borderWidth: 1 }}>
                                    <Text style={{ fontSize: 12, marginBottom: 5, fontWeight: 'bold', color: colors.subtext }}>Pregunta {index + 1}</Text>
                                    <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 15, color: colors.text }}>{enunciado}</Text>
                                    
                                    {/* Opciones */}
                                    {opciones.map((op: string, idx: number) => {
                                        const esLaCorrecta = idx === correctaIdx;
                                        const esElFallo = idx === seleccionUsuario && !esLaCorrecta;

                                        let bg = colors.background; 
                                        let border = colors.border;
                                        let textColor = colors.text;

                                        if (esLaCorrecta) {
                                            bg = isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'; 
                                            border = colors.success;
                                        } else if (esElFallo) {
                                            bg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2';
                                            border = colors.error;
                                        }

                                        return (
                                            <View key={idx} style={{ backgroundColor: bg, borderColor: border, padding: 12, borderRadius: 8, marginBottom: 5, borderWidth: 1 }}>
                                                <Text style={[
                                                    { fontSize: 14, color: textColor },
                                                    esLaCorrecta && {fontWeight: 'bold', color: colors.success},
                                                    esElFallo && {color: colors.error}
                                                ]}>
                                                    {esLaCorrecta ? '✅ ' : (esElFallo ? '❌ ' : '⚪ ')} {op}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                    
                                    <View style={{ marginTop: 15, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.border }}>
                                        <Text style={{fontWeight: 'bold', color: isDark ? '#fbbf24' : '#d97706', marginBottom: 5}}>💡 Explicación:</Text>
                                        <Text style={{color: colors.subtext, fontSize: 14, lineHeight: 20}}>{explicacion}</Text>
                                    </View>
                                </View>
                            );
                        })
                    )}
                    <View style={{height: 50}}/>
                </ScrollView>
            </SafeAreaView>
        </Modal>
      </View>
    );
  }
  // VISTA B: EL EXAMEN (JUGANDO)
  const pregunta = examData[indice];
  const opciones = pregunta.Opciones || pregunta.opciones;
  const enunciado = pregunta.Pregunta || pregunta.pregunta;
  const explicacion = pregunta.Explicacion || pregunta.explicacion;
  const correctaIdx = pregunta.Indice_correcta !== undefined ? pregunta.Indice_correcta : pregunta.respuesta_correcta;
  return (
    <SafeAreaView style={{flex:1, backgroundColor: colors.background}}>
      <ScrollView contentContainerStyle={{padding: 20}}>
        
        {/* 👇👇 CABECERA DEL JUEGO CORREGIDA 👇👇 */}
        <View style={styles.headerJuego}>
            {/* Flecha para ABANDONAR */}
            <TouchableOpacity onPress={abandonarExamen} style={{padding: 5}}>
                 <Ionicons name="arrow-back" size={30} color={colors.text} />
            </TouchableOpacity>
            
            <Text style={{color: colors.subtext, textAlign:'center', marginTop: 5}}>
                Pregunta {indice + 1} / {examData.length}
            </Text>

            <View style={[styles.badgePuntos, { backgroundColor: colors.tint }]}>
                <Text style={{color:'white', fontWeight:'bold'}}>✅ {puntuacion}</Text>
            </View>
        </View>
        {/* 👆👆 FIN CABECERA 👆👆 */}

        {/* PREGUNTA */}
        <Text style={[styles.preguntaTexto, { color: colors.text }]}>{enunciado}</Text>

        {/* OPCIONES */}
        {opciones.map((op: string, idx: number) => {
            // Lógica de colores adaptativa
            let bg = colors.card;
            let bc = colors.border;
            let tc = colors.text;
            
            if (mostrarExplicacion) {
                if (idx === correctaIdx) { 
                    bg = isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'; 
                    bc = colors.success; 
                } 
                else if (idx === respuestaSeleccionada) { 
                    bg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'; 
                    bc = colors.error; 
                }
            } else if (idx === respuestaSeleccionada) { 
                bg = isDark ? 'rgba(0, 122, 255, 0.2)' : '#f0f9ff';
                bc = colors.tint; 
            }

            return (
                <TouchableOpacity 
                    key={idx} 
                    style={[styles.opcionBtn, { backgroundColor: bg, borderColor: bc }]} 
                    onPress={() => responder(idx)}
                    disabled={mostrarExplicacion}
                >
                    <Text style={[styles.textoOpcion, { color: tc }]}>{op}</Text>
                </TouchableOpacity>
            )
        })}

        {/* EXPLICACIÓN */}
        {mostrarExplicacion && (
            <View style={[
                styles.explicacionBox, 
                { 
                    backgroundColor: isDark ? '#431407' : '#fff7ed', 
                    borderColor: isDark ? '#7c2d12' : '#ffedd5' 
                }
            ]}>
                <Text style={{fontWeight:'bold', color: isDark ? '#fbbf24' : '#b45309', marginBottom:5}}>Explicación:</Text>
                <Text style={{color: colors.text, marginBottom:15}}>{explicacion}</Text>
                
                <TouchableOpacity style={[styles.nextBtn, { backgroundColor: colors.text }]} onPress={siguiente}>
                    <Text style={{color: colors.background, fontWeight:'bold'}}>Siguiente 👉</Text>
                </TouchableOpacity>
            </View>
        )}
        {/* 👇 MODAL DE VICTORIA UNIFICADO (TEST RÁPIDO) 👇 */}
        <Modal visible={showVictoria} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: colors.card, width: '85%', padding: 30, borderRadius: 25, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 10 }}>
                    
                    <Ionicons 
                        name="trophy" 
                        size={80} 
                        color="#FFD700" 
                        style={{ marginBottom: 10 }} 
                    />
                    
                    <Text style={{ fontSize: 26, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 15 }}>
                        ¡Test Finalizado!
                    </Text>

                    {/* Estilo Minimalista (Aciertos | XP) */}
                    <View style={{flexDirection:'row', gap: 20, marginBottom: 25, alignItems: 'center', justifyContent: 'center', width: '100%'}}>
                        <View style={{alignItems:'center', flex: 1}}>
                            <Text style={{fontSize:16, color: colors.subtext}}>Aciertos</Text>
                            <Text style={{fontSize:28, fontWeight:'bold', color: colors.text}}>
                                {puntuacion}/{examData.length}
                            </Text>
                        </View>
                        
                        <View style={{width: 1, height: '80%', backgroundColor: colors.border}} />
                        
                        <View style={{alignItems:'center', flex: 1}}>
                            <Text style={{fontSize:16, color: colors.subtext}}>Experiencia</Text>
                            <Text style={{fontSize:28, fontWeight:'bold', color: '#8b5cf6'}}>
                                +{xpGanada} XP
                            </Text>
                        </View>
                    </View>

                    <TouchableOpacity 
                        style={{ backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 10 }}
                        onPress={() => {
                            setShowVictoria(false); 
                            
                            if (infoNivel?.subido) {
                                // Si sube de nivel, sacamos el cohete 🚀
                                setTimeout(() => { setShowLevelUp(true); }, 300);
                            } else {
                                // Si no, reseteamos la pantalla y volvemos al menú
                                setTimeout(() => { 
                                    setExamData([]);
                                    setModoConfiguracion(true);
                                    
                                }, 100);
                            }
                        }}
                    >
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Continuar</Text>
                        <Ionicons name="arrow-forward-circle" size={24} color="#fff" />
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>

        {/* 👇 MODAL ANIMACIÓN COHETE (SUBIDA DE NIVEL) 🚀 👇 */}
        <Modal visible={showLevelUp} transparent animationType="fade">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 100, marginBottom: 20 }}>🚀</Text>
                    
                    <Text style={{ fontSize: 32, fontWeight: 'bold', color: 'white', textAlign: 'center' }}>
                        ¡DESPEGUE COMPLETADO!
                    </Text>
                    <Text style={{ fontSize: 20, color: '#fbbf24', marginTop: 10 }}>
                        Has alcanzado el Nivel {infoNivel?.nuevo}
                    </Text>

                    <TouchableOpacity 
                        style={{ marginTop: 50, backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30 }}
                       onPress={() => {
                            setShowLevelUp(false);
                            setInfoNivel(null); 
                            
                            // Ya no vamos al Home. Reseteamos y volvemos al menú del Test
                            setTimeout(() => { 
                                setExamData([]);
                                setModoConfiguracion(true);
                                 
                            }, 100);
                        }}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>CONTINUAR MISIÓN</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1},
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  titulo: { fontSize: 28, fontWeight: 'bold' },
  subtitulo: { fontSize: 16 },
  
  cardConfig: { padding: 20, borderRadius: 20, elevation: 3 },
  label: { fontSize: 16, fontWeight: 'bold', marginTop: 15, marginBottom: 10 },
  itemApunte: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 5 },
  textApunte: { marginLeft: 10 },
  
  cantidadRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  btnCantidad: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  txtCantidad: { fontWeight: 'bold' },
  
  btnStart: { padding: 15, borderRadius: 15, alignItems: 'center', marginTop: 10 },

  headerJuego: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop:20 },
  badgePuntos: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  preguntaTexto: { fontSize: 20, fontWeight: 'bold', marginBottom: 25, lineHeight: 28 },
  opcionBtn: { padding: 18, borderRadius: 12, marginBottom: 12, borderWidth: 2 },
  textoOpcion: { fontSize: 16 },
  explicacionBox: { marginTop: 25, padding: 20, borderRadius: 16, borderWidth: 1 },
  nextBtn: { padding: 16, borderRadius: 12, alignItems: 'center' },
  header: { 
      paddingHorizontal: 20, 
      paddingTop: 50, // Espacio para la barra de estado
      paddingBottom: 15,
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      elevation: 4, // Sombra Android
      zIndex: 10,
  },
  headerTitle: { 
      fontSize: 20, 
      fontWeight: 'bold', 
      flex: 1, 
      textAlign: 'center', 
      marginHorizontal: 10 
  }
});