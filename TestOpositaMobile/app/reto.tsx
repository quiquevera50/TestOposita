import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Modal, FlatList, SafeAreaView, TextInput, KeyboardAvoidingView, Platform, Animated, Easing} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import api from './api';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient'; 
import { API_URL } from './config';
import { useTheme } from '../context/ThemeContext';
import { useGameFeedback } from '../hooks/useGameFeedback'; // Ajusta la ruta según donde lo creaste
import { useTaskManager } from '../context/TaskManagerContext';
import { useEnergy } from '../context/EnergyContext';
import { useEconomy } from '../context/EconomyContext';
import { useSafeBack } from '../hooks/useSafeBack';
import { Confetti } from '../components/Confetti';

// 🃏 Opción que se desintegra al eliminarla con el comodín 50/50
function OpcionAnimada({ op, eliminada, disabled, onPress, contStyle, textStyle }: any) {
  const anim = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (eliminada) {
      Animated.sequence([
        Animated.timing(anim, { toValue: 1.05, duration: 90, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 420, easing: Easing.in(Easing.back(1.6)), useNativeDriver: true }),
      ]).start();
    } else {
      anim.setValue(1);
    }
  }, [eliminada]);
  const opacity = eliminada ? anim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) : 1;
  return (
    <Animated.View style={{ transform: [{ scale: eliminada ? anim : 1 }], opacity }}>
      <TouchableOpacity disabled={disabled} onPress={onPress} style={contStyle}>
        <Text style={textStyle}>{op}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ⭐ Estrella que aparece con rebote (para la pantalla de victoria)
function EstrellaPop({ activa, delay }: { activa: boolean; delay: number }) {
  const scale = React.useRef(new Animated.Value(activa ? 0 : 1)).current;
  React.useEffect(() => {
    if (activa) {
      Animated.spring(scale, { toValue: 1, delay, friction: 4, tension: 120, useNativeDriver: true }).start();
    }
  }, [activa]);
  return (
    <Animated.View style={{ transform: [{ scale: activa ? scale : 1 }] }}>
      <Ionicons name="star" size={44} color={activa ? '#FFC800' : '#3a3a3a'} />
    </Animated.View>
  );
}
//  FUNCIÓN MAESTRA PARA EL CUADERNO DE MISIONES 
export const registrarProgresoMisiones = async (tipo: 'test' | 'reto' | 'oficial', xpGanada: number) => {
    try {
        const hoy = new Date().toISOString().split('T')[0];
        const key = `@misiones_${hoy}`;
        const misionesStr = await AsyncStorage.getItem(key);
        
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
export default function EntrenarScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  // Intenta leer 'cursoNombre', si no 'nombre' (por si acaso), si no "General"
  const cursoId = params.cursoId ? parseInt(params.cursoId as string) : null;
  const cursoNombre = params.cursoNombre as string || "Mis Apuntes";
  //MODO OSCURO
  const { colors, isDark } = useTheme();

  // ESTADOS DE NAVEGACIÓN
  const [vista, setVista] = useState<'lista' | 'mapa' | 'fases' | 'juego'>('lista');
  const [loading, setLoading] = useState(false);
  const [cargandoModal, setCargandoModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const { energia, consumirEnergia } = useEnergy();
  // ESTADOS DE DATOS
  const [misRetos, setMisRetos] = useState<any[]>([]);
  const [retoActual, setRetoActual] = useState<any>(null); 
  const [modalSeleccion, setModalSeleccion] = useState(false);
  const [misApuntes, setMisApuntes] = useState<any[]>([]);
  // --- ESTADOS DE DIFICULTAD (SIMPLIFICADO) ---
  // Fijamos el aprobado en 5. Eliminamos los estados del menú desplegable.
   
  const [subidaPendiente, setSubidaPendiente] = useState<{si: boolean, nivel: number | null}>({si: false, nivel: null});

  // ESTADOS DEL JUEGO
  const [nivelSeleccionado, setNivelSeleccionado] = useState<number | null>(null); // 👈 NUEVO: Saber qué nivel abrimos
  const [faseMaxLocal, setFaseMaxLocal] = useState<1 | 2 | 3 | 4>(1);
  const [faseActual, setFaseActual] = useState<1 | 2 | 3>(1);
  const [preguntasNivel, setPreguntasNivel] = useState<any>({ fase_1: [], fase_2: [], fase_3: [] });
  const [showIntermedio, setShowIntermedio] = useState(false);
  const [indicePregunta, setIndicePregunta] = useState(0);
  const [puntuacionFase, setPuntuacionFase] = useState(0);   // Aciertos solo de esta fase
  const [xpGanadaFase, setXpGanadaFase] = useState(0);
  const [puntuacion, setPuntuacion] = useState(0);
  const [showVictoria, setShowVictoria] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const { feedbackAcierto, feedbackError, feedbackSeleccion, feedbackComodin, feedbackVictoria } = useGameFeedback();
  const { ganarRubies, guardarEstrellas } = useEconomy();
  //  NUEVOS ESTADOS PARA EL MODO REPASO
  const [preguntasFalladas, setPreguntasFalladas] = useState<any[]>([]); // La bolsa de errores
  const [listaRepaso, setListaRepaso] = useState<any[]>([]); // La ronda de repaso activa
  const [modoRepaso, setModoRepaso] = useState(false); // ¿Estamos en ronda normal o de repaso?
  const [showTransicionErrores, setShowTransicionErrores] = useState(false); // Modal intermedio
  // 🎮 MECÁNICAS DE JUEGO (racha, comodines, desintegración)
  const [rachaJuego, setRachaJuego] = useState(0);          // Aciertos seguidos
  const [comodines, setComodines] = useState(0);            // 50/50 disponibles
  const [opcionesEliminadas, setOpcionesEliminadas] = useState<number[]>([]); // Opciones quitadas por comodín
  const [showComodinGanado, setShowComodinGanado] = useState(false);
  const [rubiesGanadosFase, setRubiesGanadosFase] = useState(0);
  // ⭐ ESTRELLAS POR NIVEL
  const [estrellasNivel, setEstrellasNivel] = useState<Record<string, number>>({}); // {numero_nivel: estrellas}
  const [estrellasGanadas, setEstrellasGanadas] = useState(0); // Estrellas del nivel recién completado
  const fallosNivelRef = React.useRef(0); // Fallos acumulados en el nivel en curso
    // 🌟 ANIMACIÓN DE LATIDO PARA EL MAPA
  const pulseAnim = React.useRef(new Animated.Value(1)).current;
  
  React.useEffect(() => {
      if (vista === 'mapa') {
          Animated.loop(
              Animated.sequence([
                  Animated.timing(pulseAnim, { toValue: 1.15, duration: 1000, useNativeDriver: true }),
                  Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true })
              ])
          ).start();
      }
  }, [vista]);
  // Estados de Respuesta
  const [respuestaSeleccionada, setRespuestaSeleccionada] = useState<number | null>(null); // Para Test
  const [textoRespuesta, setTextoRespuesta] = useState(''); // Para Huecos/Abierta
  const [mostrarExplicacion, setMostrarExplicacion] = useState(false);
  const [esCorrectaAbierta, setEsCorrectaAbierta] = useState<boolean | null>(null); // Para saber si la respuesta abierta fue correcta o no

  // ESTADOS EJECUCION EN 2º PLANO
  const { tareasReto, crearRetoBackground, limpiarReto, marcarLeido } = useTaskManager();
  const taskKey = cursoId ? cursoId.toString() : 'general';
  const estadoReto = tareasReto[taskKey];

// Estado para modo edición en la lista de retos
  const [modoEdicion, setModoEdicion] = useState(false);

  // Sincronizar retoActual cuando se actualiza la lista misRetos
  React.useEffect(() => {
    if (retoActual && misRetos.length > 0) {
        const retoActualizado = misRetos.find(r => r.id === retoActual.id);
        // 👇 CAMBIO CRÍTICO: Usamos > en lugar de !==
        if (retoActualizado && retoActualizado.nivel_actual > retoActual.nivel_actual) {
            setRetoActual(retoActualizado);
        }
    }

    if (estadoReto?.data === true) { 
        if (userId) refrescarListaRetos();
        limpiarReto(taskKey);
        Alert.alert("¡Reto Listo!", "Tu nuevo plan de estudios ya está disponible.");
    }
  }, [misRetos, estadoReto]);

  // 1. CARGA INICIAL
  useFocusEffect(
    useCallback(() => {
      marcarLeido(cursoId || 0, 'reto');
      cargarUsuarioYRetos();
    }, [])
  );

const cargarUsuarioYRetos = async () => {
    const id = await AsyncStorage.getItem('user_id');
    if (id) {
        setUserId(id); // Lo guardamos por si lo usas en el TaskManager u otros sitios
    }
    // Llamamos a refrescar sin pasar el ID
    refrescarListaRetos(); 
  };

  const refrescarListaRetos = async () => { // Ya no le pasamos el id del usuario
      try {
            // Operador ternario: ¿Hay cursoId? Entonces ruta de curso. Si no, ruta personal.
            const url = cursoId ? `/retos-curso/${cursoId}` : `/mis-retos`;
    
            const res = await api.get(url);
            setMisRetos(res.data);
      } catch (e) {
          console.log("Error cargando retos", e);
      }
  };

     // 2. CREAR RETO
  const abrirModalCrear = async () => {
      setCargandoModal(true); // 👈 Usamos la nueva variable
      try {
          // Rutas limpias: el backend sabe quién eres. Solo le pasamos cursoId si existe.
          const url = cursoId ? `/apuntes-curso/${cursoId}` : `/apuntes`;

          const res = await api.get(url);
          
          // Filtrar solo los de Modo Reto
          const filtrados = res.data.filter((a: any) => a.categorias && a.categorias.includes('Modo Reto'));
          
          setMisApuntes(filtrados);
          if (filtrados.length === 0) {
              Alert.alert("Sin apuntes", "Sube un PDF y márcalo como 'Modo Reto' en la Biblioteca.");
          } else {
              setModalSeleccion(true);
          }
      } catch (e) {
          Alert.alert("Error", "No se pudo cargar la biblioteca.");
      } finally {
          setCargandoModal(false); // 👈 Apagamos la nueva variable
      }
  };
  

 const crearRetoDesdeApunte = async (apunteId: number) => {
      //  1. Barrera de Seguridad
      if (energia < 1) {
          return Alert.alert("¡Sin Energía! ⚡", "No tienes rayos suficientes para crear un nuevo plan de estudio.");
      }

      //  2. Cobro en el servidor
      const exito = await consumirEnergia();
      if (!exito) {
          return Alert.alert("Error", "No se ha podido procesar la energía.");
      }

      setModalSeleccion(false);
      
      // 3. Lanzamos la tarea
      if (userId) {
          crearRetoBackground(cursoId || 0, apunteId, userId, cursoNombre);
      }
      
      // Feedback inmediato
      Alert.alert("Trabajando en ello 🧠", "La IA está creando tu reto. Te hemos cobrado 1⚡, por lo que la Fase 1 ya la tienes pagada y será gratis.");
  };

  const volver = useSafeBack(cursoId ? { pathname: '/curso/[id]', params: { id: String(cursoId), nombre: cursoNombre } } : '/(tabs)');
  
  // ENTRAR EN RETO
  const abrirMapaReto = async (reto: any) => {
      // ✅ CORRECCIÓN: Guardamos el objeto entero (con nivel_actual, completado, etc.)
      setRetoActual(reto);
      setVista('mapa');
      // Cargar estrellas guardadas de cada nivel
      try {
          const res = await api.get(`/estrellas-reto/${reto.id}`);
          setEstrellasNivel(res.data || {});
      } catch { setEstrellasNivel({}); }
  };

  
  // 4. ABRIR EL SUB-MAPA DE FASES
  const abrirSubMapa = async (indice: number) => {
      setLoading(true);
      try {
          setRetoActual((prev: any) => ({ ...prev, nivelJugado: indice })); 
          
          const res = await api.post(`/cargar-nivel/${retoActual.id}/${indice}`);
          let data = res.data.preguntas;

          if (data) {
              if (Array.isArray(data)) {
                  setPreguntasNivel({ fase_1: data, fase_2: [], fase_3: [] });
              } else {
                  setPreguntasNivel(data);
              }
              
              setNivelSeleccionado(indice);
              
              // 👇 MEMORIA DE FASES RESTAURADA 👇
              const nivelYaSuperado = indice < retoActual.nivel_actual;
              if (nivelYaSuperado) {
                  setFaseMaxLocal(4); 
              } else {
                  // Leemos la memoria del teléfono para ver tu progreso exacto hoy
                  const progresoFase = await AsyncStorage.getItem(`@fase_${retoActual.id}_${indice}`);
                  setFaseMaxLocal(progresoFase ? parseInt(progresoFase) as 1|2|3|4 : 1);
              }
              setVista('fases');  
          } else {
              Alert.alert("Ups", "Este nivel parece vacío.");
          }
      } catch (error) {
          Alert.alert("Error", "No se pudo cargar el nivel.");
      } finally {
          setLoading(false);
      }
  };

  // 5. INICIAR UNA FASE CONCRETA DESDE EL SUB-MAPA
  const iniciarFase = async (numFase: 1 | 2 | 3) => {
      
      //  LA MAGIA DE LA ECONOMÍA: La Fase 1 del Nivel 1 es gratis
      // (Porque la pagó al crear el reto)
      const esPrimeraFaseGratis = (retoActual.nivelJugado === 0 && numFase === 1);

      if (!esPrimeraFaseGratis) {
          if (energia < 1) {
              return Alert.alert("¡Descansa un poco! ⚡", "Necesitas 1 rayo para jugar esta fase. Espera a que se recarguen o pásate a Premium.");
          }
          const exito = await consumirEnergia();
          if (!exito) return Alert.alert("Error", "No se ha podido procesar la energía.");
      }

      setFaseActual(numFase);
      setIndicePregunta(0);
      setPuntuacionFase(0);

      // Limpiamos los estados de repaso
      setPreguntasFalladas([]);
      setListaRepaso([]);
      setModoRepaso(false);

      setRubiesGanadosFase(0);
      // Racha, comodines y contador de fallos SOLO se reinician al empezar el nivel (fase 1).
      // Así los comodines ganados se conservan entre fases y son útiles.
      if (numFase === 1) {
          setRachaJuego(0);
          setComodines(0);
          fallosNivelRef.current = 0;
      }

      resetEstadoPregunta();
      setVista('juego');
  };
  // --- FUNCIÓN PARA ELIMINAR RETO ---
 const confirmarEliminarReto = (idReto: number) => {
    if (Platform.OS === 'web') {
        const seguro = window.confirm("¿Estás seguro? Perderás todo el progreso de este curso.");
        if (seguro) {
            api.delete(`/retos/${idReto}`)
               .then(() => { if (userId) refrescarListaRetos(); })
               .catch(() => window.alert("No se pudo eliminar el reto."));
        }
    } else {
        Alert.alert(
          "Eliminar Reto",
          "¿Estás seguro? Perderás todo el progreso de este curso.",
          [
            { text: "Cancelar", style: "cancel" },
            { 
              text: "Eliminar", 
              style: "destructive", 
              onPress: async () => {
                try {
                  await api.delete(`/retos/${idReto}`);
                  if (userId) refrescarListaRetos();
                } catch (error) {
                  Alert.alert("Error", "No se pudo eliminar el reto.");
                }
              }
            }
          ]
        );
    }
  };
  const resetEstadoPregunta = () => {
      setRespuestaSeleccionada(null);
      setTextoRespuesta('');
      setMostrarExplicacion(false);
      setEsCorrectaAbierta(null);
      setOpcionesEliminadas([]);
  };


 // --- LÓGICA DE RESPUESTA ---
  
// A. Tipo Test
  const responderTest = (idx: number) => {
      if (mostrarExplicacion) return;
      
      feedbackSeleccion();
      setRespuestaSeleccionada(idx);
      setMostrarExplicacion(true);
      
      // Dependiendo del modo, leemos de la lista normal o de la de repaso
      const preguntasActuales = modoRepaso ? listaRepaso : (preguntasNivel[`fase_${faseActual}`] || []);
      const preg = preguntasActuales[indicePregunta];
      
      if (idx === preg.respuesta_correcta) {
          setPuntuacionFase(p => p + 1);
          feedbackAcierto();
          // 🔥 Racha: cada 5 aciertos seguidos → comodín 50/50
          setRachaJuego(prev => {
              const nueva = prev + 1;
              if (nueva > 0 && nueva % 5 === 0) {
                  setComodines(c => c + 1);
                  setShowComodinGanado(true);
                  feedbackComodin();
                  setTimeout(() => setShowComodinGanado(false), 1800);
              }
              return nueva;
          });
      } else {
          feedbackError();
          setRachaJuego(0); // Se rompe la racha
          fallosNivelRef.current += 1; // Para el cálculo de estrellas del nivel
          //  ¡Al saco de errores para luego
          setPreguntasFalladas(prev => [...prev, preg]);
      }
  };

  // 🃏 Usar comodín 50/50: elimina 2 opciones incorrectas
  const usarComodin = () => {
      if (comodines <= 0 || mostrarExplicacion || opcionesEliminadas.length > 0) return;
      const preguntasActuales = modoRepaso ? listaRepaso : (preguntasNivel[`fase_${faseActual}`] || []);
      const preg = preguntasActuales[indicePregunta];
      if (!preg) return;
      const incorrectas = preg.opciones
          .map((_: any, i: number) => i)
          .filter((i: number) => i !== preg.respuesta_correcta);
      // Barajar y quitar 2 (o las que haya si son menos)
      const aEliminar = incorrectas.sort(() => Math.random() - 0.5).slice(0, Math.min(2, incorrectas.length));
      setOpcionesEliminadas(aEliminar);
      setComodines(c => c - 1);
      feedbackComodin();
  };

  // B. Tipo Texto (Huecos / Abierta)
  const comprobarTexto = () => {
      if (mostrarExplicacion) return;
      if (!textoRespuesta.trim()) {
          Alert.alert("Escribe algo", "No puedes dejar la respuesta vacía.");
          return;
      }

      setMostrarExplicacion(true);
      
      const preguntasActuales = modoRepaso ? listaRepaso : (preguntasNivel[`fase_${faseActual}`] || []);
      const preg = preguntasActuales[indicePregunta];
      
      const respuestaUsuario = textoRespuesta.trim().toLowerCase();
      const respuestaCorrecta = (preg.respuesta_correcta || preg.respuesta_modelo || "").toString().toLowerCase();

      let esCorrecto = false;
      if (preg.tipo === 'huecos') {
          esCorrecto = (respuestaUsuario === respuestaCorrecta);
      } else {
          esCorrecto = (respuestaUsuario.length > 3);
      }

      if (esCorrecto) {
          setPuntuacionFase(p => p + 1);
          setEsCorrectaAbierta(true);
          feedbackAcierto();
          setRachaJuego(prev => {
              const nueva = prev + 1;
              if (nueva > 0 && nueva % 5 === 0) {
                  setComodines(c => c + 1);
                  setShowComodinGanado(true);
                  feedbackComodin();
                  setTimeout(() => setShowComodinGanado(false), 1800);
              }
              return nueva;
          });
      } else {
          setEsCorrectaAbierta(false);
          feedbackError();
          setRachaJuego(0);
          fallosNivelRef.current += 1;
          // 👇 ¡Al saco de errores para luego!
          setPreguntasFalladas(prev => [...prev, preg]);
      }
  };

const siguientePregunta = async () => {
    setRespuestaSeleccionada(null);
    setTextoRespuesta('');
    setMostrarExplicacion(false);
    setEsCorrectaAbierta(null);
    setOpcionesEliminadas([]);

    const preguntasActuales = modoRepaso ? listaRepaso : (preguntasNivel[`fase_${faseActual}`] || []);

    if (indicePregunta < preguntasActuales.length - 1) {
        setIndicePregunta(p => p + 1);
    } else {
        // --- HEMOS LLEGADO AL FINAL DE LA RONDA ACTUAL ---
        if (preguntasFalladas.length > 0) {
            // AÚN HAY ERRORES: Activamos la pantalla de transición
            setShowTransicionErrores(true);
        } else {
            // ¡0 ERRORES! FASE COMPLETADA DE VERDAD
            setLoading(true);
            let xpRecibida = 50; //  XP FIJA POR FASE
            let xpParaMisiones = 50; // Para la misión de ganar XP
            try {
                const res = await api.post(`/completar-fase/${retoActual.id}/${retoActual.nivelJugado}/${faseActual}`, {
                    aciertos: 5, // Engañamos al backend mandando 5 para no restar puntos
                    nota_corte: 0
                });
                
                if (res.data.subido) {
                    setSubidaPendiente({ si: true, nivel: res.data.nuevo_nivel });
                }

                if (faseActual === 3 && retoActual.nivelJugado === retoActual.nivel_actual) {
                    setRetoActual((prev: any) => ({ ...prev, nivel_actual: prev.nivel_actual + 1 }));
                    await AsyncStorage.setItem(`@fase_${retoActual.id}_${retoActual.nivelJugado}`, '4');
                    xpParaMisiones += 100;
                    refrescarListaRetos(); 
                }
                await registrarProgresoMisiones('reto', xpParaMisiones);

                // 💎 Recompensa en rubíes: +10 por fase, +20 extra al cerrar el nivel (fase 3)
                let rubies = 10;
                if (faseActual === 3 && retoActual.nivelJugado === retoActual.nivel_actual) rubies += 20;
                setRubiesGanadosFase(rubies);
                ganarRubies(rubies);

                // ⭐ ESTRELLAS DEL NIVEL (al completar la fase 3)
                if (faseActual === 3) {
                    const f = fallosNivelRef.current;
                    const estrellas = f <= 1 ? 3 : f <= 4 ? 2 : 1;
                    setEstrellasGanadas(estrellas);
                    const nivIdx = retoActual.nivelJugado;
                    setEstrellasNivel(prev => ({ ...prev, [String(nivIdx)]: Math.max(prev[String(nivIdx)] || 0, estrellas) }));
                    guardarEstrellas(retoActual.id, nivIdx, estrellas);
                } else {
                    setEstrellasGanadas(0);
                }
            } catch (e) {
                console.log("Error servidor");
            } finally {
                setLoading(false);
            }

            setXpGanadaFase(xpRecibida);

            if (faseActual < 3) {
                feedbackVictoria();
                setShowIntermedio(true);
            } else {
                feedbackVictoria();
                setShowVictoria(true);
            }
        }
    }
  };
  const avanzarFase = async () => {
      setShowIntermedio(false);
      
      // Guardar progreso intermedio en el disco duro
      if (faseActual < 3) {
          const siguienteFase = (faseActual + 1) as 1 | 2 | 3;
          if (siguienteFase > faseMaxLocal && faseMaxLocal !== 4) {
              setFaseMaxLocal(siguienteFase);
              await AsyncStorage.setItem(`@fase_${retoActual.id}_${retoActual.nivelJugado}`, siguienteFase.toString());
          }
      }

      if (subidaPendiente.si) {
          setTimeout(() => {
              setShowLevelUp(true);
          }, 300); 
      } else {
          if (faseActual < 3) {
              // Ya no usamos setFaseMaxLocal aquí porque lo hicimos arriba
              setVista('fases'); 
          }
      }
  };

  // --- RENDERIZADO ---

  if (loading) {
      return (
          // 👇 CAMBIO 1: SafeAreaView para respetar el "notch" y la barra de estado
          <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
              
              {/* 👇 CAMBIO 2: Botón de salida de emergencia */}
              <TouchableOpacity 
                  onPress={() => setLoading(false)} 
                  style={{ position: 'absolute', top: 50, left: 20, zIndex: 10, padding: 10 }}
              >
                  <Ionicons name="arrow-back" size={30} color={colors.text} />
              </TouchableOpacity>

              <View style={[styles.center, { flex: 1 }]}>
                  <ActivityIndicator size="large" color={colors.tint} />
                  
                  <Text style={{marginTop: 20, fontSize: 18, fontWeight: 'bold', color: colors.text}}>
                      Creando tu plan de estudio... 🚀
                  </Text>
                  
                  <Text style={{marginTop: 10, color: colors.subtext, textAlign: 'center', paddingHorizontal: 40, lineHeight: 22}}>
                      La IA está diseñando las preguntas. Puede tardar unos segundos.
                  </Text>
              </View>
          </SafeAreaView>
      );
  }

// 1. LISTA
  if (vista === 'lista') {
      return (
          //  Fondo dinámico
          <View style={[styles.container, { backgroundColor: colors.background }]}>
              
              {/* CABECERA CON FLECHA Y TÍTULO ALINEADOS */}
                <View style={[styles.header, { backgroundColor: colors.card }]}>
                {/* 1. Botón Atrás */}
                <TouchableOpacity onPress={volver} style={{padding: 5}}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                
                {/* 2. Título Central */}
                <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                    {cursoNombre}
                </Text>
                
                {/* 3. CONTENEDOR DERECHO: ENERGÍA + EDITAR */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ 
                        flexDirection: 'row', alignItems: 'center', 
                        backgroundColor: isDark ? '#334155' : '#eef2ff',
                        paddingHorizontal: 8, paddingVertical: 4, 
                        borderRadius: 12, borderWidth: 1, borderColor: colors.border
                    }}>
                        <Text style={{ fontSize: 14 }}>⚡</Text>
                        <Text style={{ fontWeight: 'bold', color: colors.text, marginLeft: 3, fontSize: 12 }}>
                            {energia}
                        </Text>
                    </View>

                    <TouchableOpacity 
                        style={{ padding: 5 }}
                        onPress={() => setModoEdicion(!modoEdicion)} 
                    >
                        <Text style={{ color: modoEdicion ? colors.error : colors.tint, fontWeight: 'bold' }}>
                            {modoEdicion ? 'OK' : 'Editar'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
              {/* 👇 AVISO VISUAL DE CARGA EN SEGUNDO PLANO 👇 */}
              {estadoReto?.loading && (
                  <View style={{
                      flexDirection:'row', 
                      padding:15, 
                      backgroundColor: colors.card, 
                      marginHorizontal:20, 
                      marginTop: 20, 
                      marginBottom: 10,
                      borderRadius:12, 
                      alignItems:'center', 
                      gap:15,
                      borderWidth: 1,
                      borderColor: colors.border
                  }}>
                      <ActivityIndicator size="small" color={colors.tint} />
                      <View style={{flex:1}}>
                          <Text style={{color:colors.text, fontWeight:'bold', fontSize:14}}>
                              Diseñando reto... 🤖
                          </Text>
                          <Text style={{color:colors.subtext, fontSize:12}}>
                              Puedes salir o entrar en otros menús.
                          </Text>
                      </View>
                  </View>
              )}
              <FlatList
                  data={misRetos}
                  keyExtractor={(item) => item.id.toString()}
                  contentContainerStyle={{padding: 20}}
                  // 👇 Texto vacío adaptado
                  
                  ListEmptyComponent={
                    
                    <Text style={{textAlign:'center', marginTop:50, color: colors.subtext}}>
                        No tienes retos. Crea uno abajo 👇
                    </Text>
                  }
                  renderItem={({item}) => (
                      <TouchableOpacity 
                        style={styles.retoCard} 
                        onPress={() => !modoEdicion && abrirMapaReto(item)}
                        activeOpacity={modoEdicion ? 1 : 0.7}
                      >
                          {/* El gradiente se mantiene igual porque queda bien en ambos modos */}
                          <LinearGradient colors={['#4c669f', '#3b5998']} style={styles.cardGradient}>
                              
                              <Ionicons name="map" size={30} color="white" />
                              
                              <View style={{flex:1, paddingRight: 10, paddingLeft: 10}}> 
                                  <Text style={styles.cardTitle} numberOfLines={1}>{item.nombre_reto}</Text>
                                  <Text style={styles.cardSubtitle}>Nivel actual: {item.nivel_actual + 1}</Text>
                              </View>
                              
                              {modoEdicion ? (
                                  <TouchableOpacity 
                                    style={{ backgroundColor: '#ef4444', padding: 10, borderRadius: 20 }} 
                                    onPress={() => confirmarEliminarReto(item.id)}
                                  >
                                    <Ionicons name="trash" size={24} color="white" />
                                  </TouchableOpacity>
                              ) : (
                                  <Ionicons name="play-circle" size={40} color="white" style={{opacity: 0.8}} />
                              )}

                          </LinearGradient>
                      </TouchableOpacity>
                  )}
              />
              
              {!modoEdicion && (
                  // 👇 Botón flotante usa el color del tema (tint)
                  <TouchableOpacity style={[styles.fab, { backgroundColor: colors.tint }]} onPress={abrirModalCrear}>
                      <Ionicons name="add" size={30} color="white" />
                  </TouchableOpacity>
              )}
              
              <Modal visible={modalSeleccion} animationType="slide" transparent>
                  <View style={styles.modalOverlay}>
                      {/* 👇 Modal con fondo de tarjeta y texto correcto */}
                      <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
                          <Text style={[styles.modalTitle, { color: colors.text }]}>Elige PDF base:</Text>
                          
                          <FlatList
                              data={misApuntes}
                              keyExtractor={i => i.id.toString()}
                              renderItem={({item}) => (
                                  <TouchableOpacity 
                                    style={[styles.itemApunte, { borderColor: colors.border, justifyContent: 'space-between' }]} 
                                    onPress={() => crearRetoDesdeApunte(item.id)}
                                  >
                                      <View style={{flexDirection: 'row', alignItems: 'center', flex: 1}}>
                                          <Ionicons name="document-text" size={24} color={colors.tint}/>
                                          <Text style={{marginLeft:10, color: colors.text, flex: 1}} numberOfLines={1}>{item.nombre}</Text>
                                      </View>
                                      
                                      {/* 👇 PÍLDORA DE COSTE EN LA LISTA 👇 */}
                                      <View style={{
                                          flexDirection: 'row', alignItems: 'center',
                                          backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#f1f5f9',
                                          paddingHorizontal: 8, paddingVertical: 4,
                                          borderRadius: 10
                                      }}>
                                          <Text style={{fontSize: 12}}>⚡</Text>
                                          <Text style={{color: colors.text, fontWeight:'bold', fontSize: 12, marginLeft: 2}}>x1</Text>
                                      </View>
                                  </TouchableOpacity>
                              )}
                          />
                          
                          <TouchableOpacity onPress={() => setModalSeleccion(false)} style={{marginTop:20}}>
                              <Text style={{color: colors.error}}>Cancelar</Text>
                          </TouchableOpacity>
                      </View>
                  </View>
              </Modal>
          </View>
      );
  }

  // VISTA 2: MAPA
  if (vista === 'mapa') {
      let nivelesReales: string[] = [];
      try {
          if (retoActual?.contenido_json) {
              nivelesReales = typeof retoActual.contenido_json === 'string'
                  ? JSON.parse(retoActual.contenido_json)
                  : retoActual.contenido_json;
          }
      } catch (e) { console.log("Error leyendo mapa:", e); }

      return (
          <View style={{flex: 1, backgroundColor: colors.background}}>
              
             {/* Cabecera Flotante del Mapa */}
              <View style={[styles.headerMapa, { backgroundColor: colors.card }]}>
                  <TouchableOpacity onPress={volver}>
                         <Ionicons name="arrow-back" size={24} color={colors.text} />
                 </TouchableOpacity>
                  
                  <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                      {retoActual?.nombre_reto}
                  </Text>
                  
                  {/* 👇 PÍLDORA DE ENERGÍA EN EL MAPA 👇 */}
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
             {/* 🗺️ EL NUEVO MAPA ESTILO DUOLINGO MEJORADO 🗺️ */}
              <ScrollView contentContainerStyle={{ alignItems: 'center', paddingTop: 50, paddingBottom: 150 }}>
                  {nivelesReales.map((tituloNivel, index) => {
                      const estaDesbloqueado = index <= (retoActual?.nivel_actual || 0);
                      const esElActual = index === retoActual?.nivel_actual;
                      const completado = index < (retoActual?.nivel_actual || 0);

                      // 🐍 Hacemos la curva un poco más ancha para que se vea más espectacular
                      const amplitud = 70;
                      const offsetX = Math.sin(index) * amplitud;

                      return (
                          <View key={index} style={{ alignItems: 'center', width: '100%' }}>

                              {/* 🔗 EL CAMINO (MIGAS DE PAN MATEMÁTICAS) */}
                              {index > 0 && (
                                  <View style={{ height: 60, justifyContent: 'space-evenly', alignItems: 'center', marginVertical: -5, zIndex: 1, width: '100%' }}>
                                      {/* Generamos 3 puntos intermedios que siguen exactamente la curva del seno */}
                                      {[0.25, 0.5, 0.75].map((step, dotIdx) => (
                                          <View key={dotIdx} style={{
                                              width: 14, height: 14, borderRadius: 7,
                                              backgroundColor: estaDesbloqueado ? colors.tint : colors.border,
                                              transform: [{ translateX: Math.sin(index - 1 + step) * amplitud }]
                                          }} />
                                      ))}
                                  </View>
                              )}

                              {/* 👑 EL NODO ANIMADO Y SU ETIQUETA JUNTOS */}
                              <Animated.View style={{
                                  transform: [
                                      { translateX: offsetX },
                                      { scale: esElActual ? pulseAnim : 1 } // Solo late el actual
                                  ],
                                  zIndex: 2,
                                  justifyContent: 'center', 
                                  alignItems: 'center'
                              }}>
                                  
                                  {/* ⭐ Estrellas ganadas (encima del nodo completado) */}
                                  {completado && (
                                      <View style={{ flexDirection: 'row', position: 'absolute', top: -16, zIndex: 5, gap: 2, backgroundColor: isDark ? '#1e293b' : 'white', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                                          {[1, 2, 3].map(s => (
                                              <Ionicons key={s} name="star" size={13} color={(estrellasNivel[String(index)] || 0) >= s ? '#FFC800' : (isDark ? '#334155' : '#e5e7eb')} />
                                          ))}
                                      </View>
                                  )}

                                  {/* El Botón */}
                                  <TouchableOpacity
                                      style={{
                                          width: 80, height: 80, borderRadius: 40,
                                          backgroundColor: estaDesbloqueado ? colors.tint : colors.card,
                                          justifyContent: 'center', alignItems: 'center',
                                          borderWidth: 3,
                                          borderColor: estaDesbloqueado ? 'rgba(0,0,0,0.1)' : colors.border,
                                          borderBottomWidth: estaDesbloqueado ? 8 : 4,
                                          shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5
                                      }}
                                      onPress={() => estaDesbloqueado && abrirSubMapa(index)}
                                      disabled={!estaDesbloqueado}
                                      activeOpacity={0.8}
                                  >
                                      {completado ? (
                                          <Ionicons name="checkmark" size={38} color="white" />
                                      ) : esElActual ? (
                                          <Ionicons name="play" size={35} color="white" style={{marginLeft: 5}} />
                                      ) : (
                                          <Ionicons name="lock-closed" size={30} color={colors.icon} />
                                      )}
                                  </TouchableOpacity>

                                  {/* 🏷️ Etiqueta Flotante ajustada magnéticamente */}
                                  <View style={{
                                      position: 'absolute',
                                      // Magia CSS: Si el nodo se va a la derecha, anclamos la etiqueta a su Izquierda.
                                      [offsetX > 0 ? 'right' : 'left']: '115%', 
                                      backgroundColor: isDark ? '#1e293b' : 'white',
                                      paddingHorizontal: 12, paddingVertical: 6,
                                      borderRadius: 15,
                                      elevation: 2, borderWidth: 1, borderColor: colors.border,
                                      opacity: estaDesbloqueado ? 1 : 0.5,
                                      width: 85, // Ancho fijo para que quede uniforme
                                      alignItems: 'center'
                                  }}>
                                      <Text style={{ color: estaDesbloqueado ? colors.text : colors.subtext, fontWeight: 'bold', fontSize: 13 }}>
                                          Nivel {index + 1}
                                      </Text>
                                  </View>

                              </Animated.View>

                          </View>
                      );
                  })}
              </ScrollView>
          </View>
      );
  }
  // ==========================================
  // VISTA 2.5: SUB-MAPA DE FASES (EL ZOOM DEL NIVEL) 🚀
  // ==========================================
  if (vista === 'fases') {
      const configFases = [
          { id: 1, titulo: "Fácil", desc: "10 preguntas", icono: "leaf" },
          { id: 2, titulo: "Medio", desc: "10 preguntas", icono: "flash" },
          { id: 3, titulo: "Difícil", desc: "10 preguntas", icono: "trophy" }
      ];

      return (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
              
              {/* CABECERA */}
              <View style={[styles.headerMapa, { backgroundColor: colors.card, borderBottomWidth: 1, borderColor: colors.border }]}>
                  <TouchableOpacity onPress={() => setVista('mapa')}>
                      <Ionicons name="arrow-back" size={28} color={colors.text} />
                  </TouchableOpacity>
                  
                  <View style={{alignItems: 'center'}}>
                    <Text style={{ color: colors.tint, fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase' }}>Progreso del Nivel</Text>
                    <Text style={{ color: colors.text, fontSize: 20, fontWeight: 'bold' }}>
                        Nivel {nivelSeleccionado !== null ? nivelSeleccionado + 1 : ''}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#334155' : '#eef2ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 15, borderWidth: 1, borderColor: colors.border }}>
                        <Text style={{ fontSize: 16 }}>⚡</Text>
                        <Text style={{ fontWeight: 'bold', color: colors.text, marginLeft: 4, fontSize: 13 }}>{energia}</Text>
                  </View>
              </View>

              {/* CONTENEDOR CENTRALIZADO Y ALINEADO */}
              <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: 60, alignItems: 'center' }}>
                  
                  {configFases.map((fase, index) => {
                      const estaDesbloqueada = fase.id <= faseMaxLocal;
                      const esLaActual = fase.id === faseMaxLocal;
                      const estaCompletada = fase.id < faseMaxLocal;
                      const esGratis = (retoActual.nivelJugado === 0 && fase.id === 1);

                      // 1. CURVA SUAVE: Nodos ligeramente a la izquierda y derecha
                      // Esto asegura que la línea los conecte matemáticamente por el centro
                      const offsetX = index % 2 === 0 ? -25 : 25; 

                      return (
                          <View key={fase.id} style={{ alignItems: 'center', width: '100%', zIndex: estaCompletada || esLaActual ? 2 : 1 }}>
                              
                              <View style={{ transform: [{ translateX: offsetX }], alignItems: 'center' }}>
                                  
                                  {/* EL NODO */}
                                  <TouchableOpacity 
                                      style={{
                                          width: 90, height: 90, borderRadius: 45, 
                                          backgroundColor: estaCompletada ? colors.success : (esLaActual ? colors.tint : colors.card),
                                          justifyContent: 'center', alignItems: 'center',
                                          borderWidth: esLaActual ? 6 : 4,
                                          borderColor: esLaActual ? (isDark ? 'white' : 'rgba(0,0,0,0.1)') : colors.border,
                                          elevation: esLaActual ? 10 : 2,
                                          shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 5
                                      }}
                                      disabled={!estaDesbloqueada}
                                      onPress={() => iniciarFase(fase.id as 1|2|3)}
                                  >
                                      <Ionicons name={estaCompletada ? "checkmark-circle" : fase.icono as any} size={45} color={estaDesbloqueada ? "white" : colors.icon} />
                                  </TouchableOpacity>

                                  {/* 👇 TEXTO SIEMPRE A LA DERECHA 👇 */}
                                  <View style={{
                                      position: 'absolute',
                                      left: 110, // Distancia fija hacia la derecha
                                      top: 15,
                                      width: 180, // Ancho extra para que no se corte el texto
                                  }}>
                                      <Text style={{fontWeight: 'bold', color: colors.text, fontSize: 16}}>{fase.titulo}</Text>
                                      <Text style={{color: colors.subtext, fontSize: 12, marginBottom: 5}}>{fase.desc}</Text>
                                      
                                      {esGratis ? (
                                          <View style={{ alignSelf: 'flex-start', backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: colors.success }}>
                                              <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.success }}>🎁 GRATIS</Text>
                                          </View>
                                      ) : !estaCompletada && (
                                          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
                                              <Text style={{ fontSize: 10 }}>⚡</Text>
                                              <Text style={{ fontSize: 10, fontWeight: 'bold', color: colors.text, marginLeft: 2 }}>x1</Text>
                                          </View>
                                      )}
                                  </View>
                              </View>
                                {/* 2. LÍNEA CONECTORA (MIGAS DE PAN ESTILO MAPA) */}
                              {index < 2 && (
                                  <View style={{
                                      height: 70, // Espacio limpio entre los nodos
                                      width: '100%',
                                      justifyContent: 'space-evenly', // Reparte los puntos sin solapar
                                      alignItems: 'center',
                                      zIndex: 0,
                                      marginVertical: 5 // Un pequeño respiro para que no toque los círculos
                                  }}>
                                      {[0.25, 0.5, 0.75].map((step, dotIdx) => {
                                          // La matemática para que los puntos viajen en diagonal 
                                          // desde el centro de un nodo al centro del siguiente
                                          const startX = index % 2 === 0 ? -25 : 25;
                                          const endX = index % 2 === 0 ? 25 : -25;
                                          const currentX = startX + (endX - startX) * step;

                                          return (
                                              <View key={dotIdx} style={{
                                                  width: 14, height: 14, borderRadius: 7, // Mismo tamaño que en el mapa
                                                  backgroundColor: estaCompletada ? colors.success : colors.border,
                                                  transform: [{ translateX: currentX }]
                                              }} />
                                          );
                                      })}
                                  </View>
                              )}

                          </View>
                      );
                  })}
              </ScrollView>
          </View>
      );
  }
  // VISTA 3: JUEGO 
  if (vista === 'juego') {
      const faseKey = `fase_${faseActual}`;
      
      // Leemos de la lista correspondiente
      const preguntasActuales = modoRepaso ? listaRepaso : (preguntasNivel[`fase_${faseActual}`] || []);
      const pregunta = preguntasActuales[indicePregunta];
      
      if (!pregunta) return <ActivityIndicator style={{flex:1}} color={colors.tint} />;
      const esVF = pregunta.tipo === 'verdadero_falso';
      const esHuecos = pregunta.tipo === 'huecos';

      return (
          // 👇 Fondo dinámico (SafeArea)
          <SafeAreaView style={{flex:1, backgroundColor: colors.background}}> 
              <ScrollView contentContainerStyle={styles.juegoContainer}>
                  
                  {/* CABECERA */}
                  <View style={styles.headerJuego}>
                      {/* Botón Salir */}
                      <TouchableOpacity 
                        onPress={() => {
                            if (Platform.OS === 'web') {
                                const salir = window.confirm("¿Salir del nivel? Perderás el progreso actual.");
                                if (salir) setVista('fases');
                            } else {
                                Alert.alert("¿Salir del nivel?", "Perderás el progreso actual.", [
                                    { text: "Seguir", style: "cancel" },
                                    { text: "Salir", style: "destructive", onPress: () => setVista('fases') }
                                ]);
                            }
                        }} 
                        style={{marginRight: 10, padding: 5, zIndex: 50}}
                      >
                          <Ionicons name="close" size={30} color={colors.error} />
                      </TouchableOpacity>
                      {/* Fase */}
                      <Text style={{color: colors.tint, fontWeight: 'bold'}}>Fase {faseActual}/3</Text>
                      {/* Contador Adaptativo */}
                      <Text style={{color: colors.subtext, flex:1, textAlign:'center', marginTop: 5}}>
                          {modoRepaso ? "Repaso " : ""}{indicePregunta + 1} / {preguntasActuales.length}
                      </Text>

                      {/* Racha + Puntos */}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                          {rachaJuego > 1 && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FF9600', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, gap: 3 }}>
                                  <Ionicons name="flame" size={14} color="#fff" />
                                  <Text style={{ color: 'white', fontWeight: '800' }}>{rachaJuego}</Text>
                              </View>
                          )}
                          <View style={styles.badgePuntos}>
                              <Text style={{ color: 'white', fontWeight: 'bold' }}>⭐ {puntuacionFase}</Text>
                          </View>
                      </View>
                  </View>

                  {/* 🟢 BARRA DE PROGRESO DEL NIVEL (siempre visible) */}
                  <View style={{ height: 14, backgroundColor: isDark ? '#1e293b' : '#e5e7eb', borderRadius: 7, marginBottom: 18, overflow: 'hidden' }}>
                      <View style={{
                          height: '100%',
                          width: `${Math.round(((indicePregunta + (mostrarExplicacion ? 1 : 0)) / Math.max(1, preguntasActuales.length)) * 100)}%`,
                          backgroundColor: modoRepaso ? '#FF9600' : colors.tint,
                          borderRadius: 7,
                      }} />
                  </View>

                  {/* ETIQUETA TIPO + COMODÍN */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <View style={[styles.badgeTipo, { marginBottom: 0 }, esVF && {backgroundColor: colors.success}, esHuecos && {backgroundColor: '#8b5cf6'}]}>
                          <Text style={{color:'white', fontWeight:'bold', textTransform:'uppercase'}}>
                              {esVF ? "Verdadero / Falso" : (esHuecos ? "Completa la frase" : "Test")}
                          </Text>
                      </View>

                      {/* 🃏 COMODÍN 50/50 (solo en tipo test) */}
                      {!esVF && !esHuecos && (
                          <TouchableOpacity
                              onPress={usarComodin}
                              disabled={comodines <= 0 || mostrarExplicacion || opcionesEliminadas.length > 0}
                              style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 5,
                                  backgroundColor: (comodines > 0 && !mostrarExplicacion && opcionesEliminadas.length === 0) ? '#CE82FF' : (isDark ? '#334155' : '#e5e7eb'),
                                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12,
                              }}
                          >
                              <Text style={{ fontSize: 14 }}>🃏</Text>
                              <Text style={{ color: (comodines > 0 && opcionesEliminadas.length === 0) ? '#fff' : colors.subtext, fontWeight: '800', fontSize: 13 }}>50/50 · {comodines}</Text>
                          </TouchableOpacity>
                      )}
                  </View>

                  {/* PREGUNTA (Color dinámico) */}
                  <Text style={[styles.preguntaTexto, { color: colors.text }]}>{pregunta.pregunta}</Text>

                  {/* OPCIONES */}
                  <View style={esVF ? styles.gridVF : undefined}> 
                      {pregunta.opciones.map((op: string, idx: number) => {
                          
                          // 👇 LÓGICA DE COLORES AVANZADA
                          // 1. Base: Usamos el color de la tarjeta y texto del tema
                          let backgroundColor = colors.card;
                          let borderColor = colors.border;
                          let textColor = colors.text;

                          if (mostrarExplicacion) {
                              if (idx === pregunta.respuesta_correcta) {
                                  // Verde: Pastel para Claro, Transparente para Oscuro
                                  backgroundColor = isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'; 
                                  borderColor = colors.success; 
                              } else if (idx === respuestaSeleccionada) {
                                  // Rojo: Pastel para Claro, Transparente para Oscuro
                                  backgroundColor = isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'; 
                                  borderColor = colors.error;
                              }
                          } else if (idx === respuestaSeleccionada) {
                              // Azul: Pastel para Claro, Transparente para Oscuro
                              backgroundColor = isDark ? 'rgba(0, 122, 255, 0.2)' : '#f0f9ff';
                              borderColor = colors.tint;
                          }

                          // Borde especial para V/F en estado neutral
                          if (esVF && !mostrarExplicacion && idx !== respuestaSeleccionada) {
                              if (op.toLowerCase() === 'verdadero') borderColor = colors.success;
                              if (op.toLowerCase() === 'falso') borderColor = colors.error;
                          }

                          // 🃏 Opción desintegrada por el comodín 50/50
                          const eliminada = opcionesEliminadas.includes(idx);

                          return (
                              <OpcionAnimada
                                  key={idx}
                                  op={op}
                                  eliminada={eliminada}
                                  disabled={mostrarExplicacion || eliminada}
                                  onPress={() => responderTest(idx)}
                                  contStyle={[
                                      styles.opcionBtn,
                                      { backgroundColor, borderColor },
                                      esVF && styles.btnVF,
                                      esHuecos && styles.btnHueco,
                                  ]}
                                  textStyle={[
                                      styles.textoOpcion,
                                      { color: textColor },
                                      esVF && { fontWeight: 'bold', fontSize: 18 },
                                  ]}
                              />
                          );
                      })}
                  </View>

                  {/* EXPLICACIÓN */}
                  {mostrarExplicacion && (
                      <View style={[
                          styles.explicacionBox,
                          // Adaptamos el fondo de la caja: Naranja claro vs Marrón oscuro
                          { 
                              backgroundColor: isDark ? '#431407' : '#fff7ed', 
                              borderColor: isDark ? '#7c2d12' : '#ffedd5' 
                          }
                      ]}>
                          <View style={{flexDirection:'row', gap:10, marginBottom:5}}>
                              <Ionicons name="bulb" size={24} color="#f59e0b" />
                              <Text style={{fontWeight:'bold', fontSize:16, color: isDark ? '#fbbf24' : '#b45309'}}>
                                  Explicación
                              </Text>
                          </View>
                          
                          <Text style={{lineHeight:20, color: colors.text}}>
                              {pregunta.explicacion}
                          </Text>
                          
                          {/* Botón Siguiente con alto contraste */}
                          <TouchableOpacity 
                            style={[styles.nextBtn, { backgroundColor: colors.text }]} 
                            onPress={siguientePregunta}
                          >
                              {/* Texto del botón en color inverso (fondo) */}
                              <Text style={{color: colors.background, fontWeight:'bold', fontSize:16}}>
                                  Siguiente 👉
                              </Text>
                          </TouchableOpacity>
                      </View>
                  )}
              {/* ... (fin del ScrollView del juego) ... */}
            </ScrollView>

          {/* 🃏 AVISO COMODÍN GANADO (toast flotante) */}
            {showComodinGanado && (
                <View style={{ position: 'absolute', top: 100, left: 0, right: 0, alignItems: 'center', zIndex: 100 }}>
                    <View style={{ backgroundColor: '#CE82FF', paddingVertical: 12, paddingHorizontal: 22, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}>
                        <Text style={{ fontSize: 22 }}>🃏</Text>
                        <View>
                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>¡Racha de 5! +1 comodín</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12 }}>Úsalo para eliminar 2 opciones</Text>
                        </View>
                    </View>
                </View>
            )}

          {/* 👇 1. MODAL DE TRANSICIÓN A ERRORES (LA ANIMACIÓN) 👇 */}
            <Modal visible={showTransicionErrores} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ alignItems: 'center', padding: 30 }}>
                        <Text style={{ fontSize: 70, marginBottom: 20 }}>📝</Text>
                        <Text style={{ fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center', marginBottom: 15 }}>
                            ¡Ahora vamos con los errores!
                        </Text>
                        <Text style={{ fontSize: 18, color: '#d1d5db', textAlign: 'center', marginBottom: 40 }}>
                            Tienes {preguntasFalladas.length} {preguntasFalladas.length === 1 ? 'pregunta' : 'preguntas'} por corregir.
                        </Text>
                        
                        <TouchableOpacity 
                            style={{ backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30 }}
                            onPress={() => {
                                setShowTransicionErrores(false);
                                setModoRepaso(true);
                                setListaRepaso(preguntasFalladas); // Convertimos la bolsa en la nueva lista
                                setPreguntasFalladas([]); // Vaciamos la bolsa por si vuelves a fallar
                                setIndicePregunta(0);
                                resetEstadoPregunta();
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>REPASAR FALLOS 👉</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* 👇 2. MODAL INTERMEDIO (SOLO XP) 👇 */}
            <Modal visible={showIntermedio} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ backgroundColor: colors.card, width: '85%', padding: 30, borderRadius: 25, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 10 }}>
                        <Text style={{ fontSize: 50, marginBottom: 10 }}>{faseActual === 1 ? '⚖️' : '🔥'}</Text>
                        <Text style={{ fontSize: 26, fontWeight: 'bold', color: colors.text, textAlign: 'center' }}>
                            ¡Fase {faseActual} Superada!
                        </Text>

                        <View style={{flexDirection:'row', gap: 30, marginVertical: 30}}>
                            <View style={{alignItems: 'center'}}>
                                <Text style={{fontSize:14, color: colors.subtext}}>Experiencia</Text>
                                <Text style={{fontSize:34, fontWeight:'bold', color: '#8b5cf6'}}>+{xpGanadaFase}</Text>
                                <Text style={{fontSize:12, color: colors.subtext}}>XP</Text>
                            </View>
                            <View style={{alignItems: 'center'}}>
                                <Text style={{fontSize:14, color: colors.subtext}}>Rubíes</Text>
                                <Text style={{fontSize:34, fontWeight:'bold', color: '#FF3B6B'}}>+{rubiesGanadosFase}</Text>
                                <Text style={{fontSize:12, color: colors.subtext}}>💎</Text>
                            </View>
                        </View>

                        <Text style={{ color: colors.subtext, textAlign: 'center', marginBottom: 25, fontSize: 14 }}>
                            {faseActual === 1 ? "La IA ha terminado de preparar la Fase 2." : "Fase Final lista. ¡A por todas!"}
                        </Text>

                        <TouchableOpacity style={{ backgroundColor: colors.tint, paddingVertical: 15, width: '100%', borderRadius: 15, alignItems: 'center' }} onPress={avanzarFase}>
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>Siguiente Fase 👉</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

           {/* 👇 3. MODAL DE VICTORIA (SOLO XP + BONO) 👇 */}
            <Modal visible={showVictoria} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }}>
                    {showVictoria && <Confetti count={50} />}
                    <View style={{ backgroundColor: colors.card, width: '85%', padding: 30, borderRadius: 25, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 10 }}>
                        <Ionicons name="trophy" size={70} color="#FFD700" style={{ marginBottom: 6 }} />
                        <Text style={{ fontSize: 24, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 12 }}>
                            ¡Nivel Completado!
                        </Text>

                        {/* ⭐ ESTRELLAS GANADAS (animadas con rebote) */}
                        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                            {[1, 2, 3].map(s => (
                                <EstrellaPop key={s} activa={estrellasGanadas >= s} delay={s * 250} />
                            ))}
                        </View>

                        <View style={{flexDirection:'row', gap: 30, marginVertical: 20}}>
                            <View style={{alignItems: 'center'}}>
                                <Text style={{fontSize:14, color: colors.subtext}}>Experiencia</Text>
                                <Text style={{fontSize:34, fontWeight:'bold', color: '#8b5cf6'}}>+{xpGanadaFase + 100}</Text>
                                <Text style={{fontSize:12, color: colors.subtext}}>XP</Text>
                            </View>
                            <View style={{alignItems: 'center'}}>
                                <Text style={{fontSize:14, color: colors.subtext}}>Rubíes</Text>
                                <Text style={{fontSize:34, fontWeight:'bold', color: '#FF3B6B'}}>+{rubiesGanadosFase}</Text>
                                <Text style={{fontSize:12, color: colors.subtext}}>💎</Text>
                            </View>
                        </View>

                        <Text style={{ color: colors.success, fontWeight: 'bold', marginBottom: 25, fontSize: 14, textAlign: 'center' }}>
                             ✨ ¡Incluye +100 XP por acabar el nivel!
                        </Text>

                        <TouchableOpacity 
                            style={{ backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 10 }}
                            onPress={() => {
                                setShowVictoria(false); 
                                if (subidaPendiente.si) setTimeout(() => { setShowLevelUp(true); }, 300);
                                else setTimeout(() => { setVista('mapa'); }, 100);
                            }}
                        >
                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Continuar</Text>
                            <Ionicons name="arrow-forward-circle" size={24} color="#fff" />
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            {/*  MODAL ANIMACIÓN COHETE (SUBIDA DE NIVEL EN MITAD DEL JUEGO) 🚀 👇 */}
            <Modal visible={showLevelUp} transparent animationType="fade">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 100, marginBottom: 20 }}>🚀</Text>
                        
                        <Text style={{ fontSize: 32, fontWeight: 'bold', color: 'white', textAlign: 'center' }}>
                            ¡DESPEGUE COMPLETADO!
                        </Text>
                        <Text style={{ fontSize: 20, color: '#fbbf24', marginTop: 10 }}>
                            Has alcanzado el Nivel {subidaPendiente.nivel}
                        </Text>

                        <TouchableOpacity 
                            style={{ marginTop: 50, backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30 }}
                            onPress={() => {
                                // 1. Ocultamos el cohete
                                setShowLevelUp(false);
                                // 2. Reseteamos la memoria
                                setSubidaPendiente({ si: false, nivel: null }); 
                                
                                // 3. Le llevamos a donde le tocaba ir
                                if (faseActual < 3) {
                                    setFaseMaxLocal((faseActual + 1) as 1 | 2 | 3);
                                    setVista('fases'); 
                                } else {
                                    setTimeout(() => { setVista('mapa'); }, 100);
                                }
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>CONTINUAR MISIÓN</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

  return null;
}

const styles = StyleSheet.create({
  // --- GENERAL Y HOME ---
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { paddingHorizontal: 20, 
      paddingTop: 50, // Espacio para Notch
      paddingBottom: 15,
      flexDirection: 'row', 
      alignItems: 'center', 
      justifyContent: 'space-between', 
      elevation: 4, 
      zIndex: 10,},
  headerTitle: { 
      fontSize: 20, 
      fontWeight: 'bold', 
      flex: 1, 
      textAlign: 'center', 
      marginHorizontal: 10 
  },
  titulo: { fontSize: 28, fontWeight: 'bold' },
  subtitulo: { fontSize: 14, color: 'gray' },
  retoCard: { marginBottom: 15, borderRadius: 15, overflow: 'hidden', elevation: 3 },
  cardGradient: { flexDirection: 'row', padding: 20, alignItems: 'center', gap: 15 },
  cardTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', flex: 1 },
  cardSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 14 },
  fab: { position: 'absolute', bottom: 30, right: 30, width: 60, height: 60, borderRadius: 30, backgroundColor: '#007AFF', justifyContent: 'center', alignItems: 'center', elevation: 5 },

  // --- MODAL CREAR ---
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: 'white', borderRadius: 20, padding: 20, maxHeight: '60%' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  itemApunte: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#eee' },

  // --- NUEVO MAPA Y CABECERA FLOTANTE ---
  headerMapa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: 'white', elevation: 4, zIndex: 10 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: 50, backgroundColor: 'white' },
  btnAtras: { padding: 5 },

  // NODOS DEL MAPA (ESTILO CANDY)
  mapContainer: { alignItems: 'center', paddingTop: 30, paddingBottom: 50 },
  levelNode: { width: 70, height: 70, borderRadius: 35, justifyContent: 'center', alignItems: 'center', elevation: 5, zIndex: 2, borderWidth: 4, borderColor: 'white' },
  levelUnlocked: { backgroundColor: '#FFD700' },
  levelCurrent: { backgroundColor: '#007AFF', width: 90, height: 90, borderRadius: 45, borderColor: '#cce5ff' },
  levelLocked: { backgroundColor: '#e5e7eb', borderColor: '#f3f4f6' },
  pathLine: { width: 6, height: 50, backgroundColor: '#e5e7eb', marginVertical: -5, zIndex: 1 },
  labelContainer: { backgroundColor:'rgba(255,255,255,0.8)', paddingHorizontal:8, borderRadius:10, marginTop:5, marginBottom: 15 },
  levelLabel: { fontSize: 14, color: '#999' },

  // --- JUEGO ---
  juegoContainer: { padding: 20, paddingBottom: 50 },
  headerJuego: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, alignItems: 'center' },
  badgePuntos: { backgroundColor: '#007AFF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  badgeTipo: { alignSelf: 'flex-start', backgroundColor: '#6366f1', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
  preguntaTexto: { fontSize: 20, fontWeight: 'bold', marginBottom: 25, color: '#333', lineHeight: 28 },
  
  // Tipos de Pregunta
  gridVF: { flexDirection: 'row', gap: 15, justifyContent: 'center' },
  btnVF: { flex: 1, alignItems: 'center', paddingVertical: 30, justifyContent: 'center' },
  btnHueco: { borderRadius: 25, paddingVertical: 12, marginHorizontal: 5 },
  
  // Opciones y Botones
  opcionBtn: { backgroundColor: 'white', padding: 18, borderRadius: 12, marginBottom: 12, borderWidth: 2, borderColor: '#ddd' },
  textoOpcion: { fontSize: 16, color: '#333' },
  explicacionBox: { marginTop: 25, padding: 20, backgroundColor: '#fff7ed', borderRadius: 16, borderWidth: 1, borderColor: '#ffedd5' },
  nextBtn: { marginTop: 20, backgroundColor: '#1f2937', padding: 16, borderRadius: 12, alignItems: 'center' },
  
  // Otros
  btnEliminarCard: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(255,0,0,0.3)', padding: 5, borderRadius: 8, zIndex: 10 }
  
});