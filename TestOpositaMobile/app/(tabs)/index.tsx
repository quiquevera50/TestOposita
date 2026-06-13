import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Platform, Animated} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api';
import { useTheme } from '../../context/ThemeContext';
import { NivelBar } from '../../components/NivelBar';
import { useTaskManager } from '../../context/TaskManagerContext';
import { useEnergy } from '../../context/EnergyContext';

export default function HomeScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();

  // Estados Usuario
  const [username, setUsername] = useState('Opositor');
  const [miNivel, setMiNivel] = useState(1);
  const [miXP, setMiXP] = useState(0); 
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [nuevoNivelLogrado, setNuevoNivelLogrado] = useState(1);      
  // Estados Cursos
  const [misCursos, setMisCursos] = useState<any[]>([]);
  const [showModalCurso, setShowModalCurso] = useState(false);
  const [nuevoCursoNombre, setNuevoCursoNombre] = useState('');
  const { novedades } = useTaskManager();
  const lockNav = useRef(false);
  const [modoEdicionCursos, setModoEdicionCursos] = useState(false);
  //  ESTADOS MISIONES DIARIAS 
  const [showMisiones, setShowMisiones] = useState(false);
  const [completadasVistas, setCompletadasVistas] = useState(0);
  const [misiones, setMisiones] = useState<any>({
      test: { actual: 0, meta: 1, xp: 20, titulo: "Haz un test rápido", reclamada: false },
      reto: { actual: 0, meta: 1, xp: 20, titulo: "Haz una fase en Modo Reto", reclamada: false },
      oficial: { actual: 0, meta: 1, xp: 20, titulo: "Haz un Examen Oficial", reclamada: false },
      xp: { actual: 0, meta: 200, xp: 50, titulo: "Gana 200 de Experiencia", reclamada: false }
  });

  // 👇 ESTADOS PARA LA ANIMACIÓN FLOTANTE 👇
  const [animXP, setAnimXP] = useState(0);
  const [showAnimEnergia, setShowAnimEnergia] = useState(false);
  const floatY = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  
  const ejecutarAnimacion = (xp: number, energiaExtra: boolean) => {
      setAnimXP(xp);
      setShowAnimEnergia(energiaExtra);
      floatY.setValue(0);
      fadeAnim.setValue(1);

      Animated.parallel([
          Animated.timing(floatY, { toValue: -80, duration: 1500, useNativeDriver: true }),
          Animated.timing(fadeAnim, { toValue: 0, duration: 1500, useNativeDriver: true })
      ]).start(() => {
          setAnimXP(0);
          setShowAnimEnergia(false);
      });
  };
  // Calculamos si hay misiones completadas Y NO RECLAMADAS que el usuario aún no ha visto
  const completadasActuales = Object.values(misiones).filter((m: any) => m.actual >= m.meta && !m.reclamada).length;
  const mostrarPuntoRojo = completadasActuales > completadasVistas;
  // Traemos la energía del contexto Global
  const { energia, segundosRestantes } = useEnergy();

  // --- TEMPORIZADOR PARA MEDIANOCHE ---
  const [tiempoRestante, setTiempoRestante] = useState("");

  useEffect(() => {
      const calcularTiempo = () => {
          const ahora = new Date();
          const medianoche = new Date(ahora);
          medianoche.setHours(24, 0, 0, 0); // Fijamos la hora a las 00:00 del día siguiente
          
          const diffMs = medianoche.getTime() - ahora.getTime();
          const horas = Math.floor(diffMs / (1000 * 60 * 60));
          const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          setTiempoRestante(`Se reinician en ${horas} horas y ${minutos} min`);
      };

      calcularTiempo(); // Calculamos al instante
      const intervalo = setInterval(calcularTiempo, 60000); // Actualizamos cada minuto
      
      return () => clearInterval(intervalo);
  }, []);
  // Helper para pintar el reloj bonito (Ej: 14:05)
  const formatTime = (secs: number) => {
      if (energia >= 5) return "MAX";
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };
  useFocusEffect(
    useCallback(() => {
      cargarTodo();
      cargarMisionesLocales(); // Cargamos el progreso del cuaderno
    }, [])
  );

  const cargarTodo = async () => {
    const userId = await AsyncStorage.getItem('user_id');
    const name = await AsyncStorage.getItem('username');
    if(name) setUsername(name);

    if (userId) {
      try {
        const [resProgreso, resCursos] = await Promise.all([
          api.get(`/progreso`),
          api.get(`/cursos`)
        ]);

        setMiNivel(resProgreso.data.nivel);
        setMiXP(resProgreso.data.xp);
        setMisCursos(resCursos.data);

      } catch (error: any) {
        console.log("⚠️ Peticiones de inicio detenidas (posible sesión expirada o 401).");
      }
    }
  };

  // --- LÓGICA DE MISIONES ---
  const reclamarRecompensa = async (key: string, xp: number) => {
      try {
          // 1. Sumamos la XP en el servidor general
          const res = await api.post(`/sumar-xp/${xp}`);
          
          // 2. Marcamos la misión como reclamada
          const nuevasMisiones = {
              ...misiones,
              [key]: { ...misiones[key], reclamada: true }
          };
          setMisiones(nuevasMisiones);

          // 3. Guardamos en el disco duro
          const hoy = new Date().toISOString().split('T')[0];
          await AsyncStorage.setItem(`@misiones_${hoy}`, JSON.stringify(nuevasMisiones));

          // 4. Recargamos la barra de nivel superior
          cargarTodo();
          
          // 5. 🎁 COMPROBAMOS SI HEMOS HECHO EL PLENO (LAS 4) 🎁
          const todasReclamadas = Object.values(nuevasMisiones).every((m: any) => m.reclamada);
          
          if (todasReclamadas) {
              // Damos 1 de energía extra de regalo (superando el límite de 5 si hace falta)
              await api.post('/comprar-energia/1'); 
              ejecutarAnimacion(xp, true); // Animamos XP + Energía
              Alert.alert("¡PLENO DIARIO! 🏆", "¡Has completado todas las misiones de hoy! Te llevas +1 ⚡ de recompensa.");
          } else {
              ejecutarAnimacion(xp, false); // Solo animamos la XP
          }

          // 6. Si sube de nivel
          if (res.data.subido) {
              setNuevoNivelLogrado(res.data.nuevo_nivel);
              setTimeout(() => { setShowLevelUp(true); }, 1000); // Retraso para que se vea la XP flotando
          }
      } catch (error) {
          Alert.alert("Error", "No se pudo reclamar la recompensa.");
      }
  }; 

  const cargarMisionesLocales = async () => {
      const hoy = new Date().toISOString().split('T')[0];
      const misionesGuardadas = await AsyncStorage.getItem(`@misiones_${hoy}`);
      
      if (misionesGuardadas) {
          const misionesParseadas = JSON.parse(misionesGuardadas);
          
          // 🔥 FORZAMOS LOS NUEVOS VALORES EN LA MEMORIA DEL TELÉFONO 🔥
          misionesParseadas.reto.meta = 1;
          misionesParseadas.reto.xp = 20;
          misionesParseadas.reto.titulo = "Haz una fase en Modo Reto";
          
          misionesParseadas.oficial.meta = 1;
          misionesParseadas.oficial.xp = 20;
          misionesParseadas.oficial.titulo = "Haz un Examen Oficial";
          
          misionesParseadas.xp.meta = 200;
          misionesParseadas.xp.xp = 50;
          
          setMisiones(misionesParseadas);
      } else {
          setMisiones((prev: any) => ({
              test: { ...prev.test, actual: 0, reclamada: false },
              reto: { ...prev.reto, actual: 0, reclamada: false },
              oficial: { ...prev.oficial, actual: 0, reclamada: false },
              xp: { ...prev.xp, actual: 0, reclamada: false }
          }));
      }
  };
  // --- FUNCIÓN PARA CREAR CURSO --- //
  const crearCurso = async () => {
      if(!nuevoCursoNombre.trim()) return;
      const userId = await AsyncStorage.getItem('user_id');
      try { 
          await api.post(`/crear-curso`, {
              user_id: userId,
              nombre: nuevoCursoNombre,
              icono: 'book', 
              color: '#4f46e5'
          });
          setShowModalCurso(false);
          setNuevoCursoNombre('');
          cargarTodo(); 
      } catch(e) {
          Alert.alert("Error", "No se pudo crear el curso");
      }
  };

  // --- FUNCIÓN PARA BORRAR CURSO ---
 const confirmarBorrarCurso = (cursoId: number, cursoNombre: string) => {
    lockNav.current = true; // 🔒 CERRAMOS EL CANDADO
    setTimeout(() => lockNav.current = false, 1000); // 🔓 LO ABRIMOS 1 SEGUNDO DESPUÉS

    if (Platform.OS === 'web') {
        const seguro = window.confirm(`¿Estás seguro de que quieres borrar el curso "${cursoNombre}" y todos sus apuntes y exámenes? Esta acción no se puede deshacer.`);
        if (seguro) {
            api.delete(`/cursos/${cursoId}`)
                .then(() => {
                    cargarTodo();
                    window.alert("El curso se ha eliminado correctamente.");
                })
                .catch(() => {
                    window.alert("No se pudo borrar el curso. Inténtalo de nuevo.");
                });
        }
    } else {
        // Alerta nativa para móviles (iOS / Android)
        Alert.alert(
          "Eliminar Curso",
          `¿Estás seguro de que quieres borrar el curso "${cursoNombre}" y todos sus apuntes y exámenes? Esta acción no se puede deshacer.`,
          [
            { text: "Cancelar", style: "cancel" },
            { 
              text: "Sí, borrar", 
              style: "destructive", 
              onPress: async () => {
                try {
                  await api.delete(`/cursos/${cursoId}`);
                  cargarTodo();
                  Alert.alert("Éxito", "El curso se ha eliminado correctamente.");
                } catch (error) {
                  Alert.alert("Error", "No se pudo borrar el curso. Inténtalo de nuevo.");
                }
              }
            }
          ]
        );
    }
  };

  const styles = StyleSheet.create({
    header: { flexDirection: 'row', justifyContent:'space-between', alignItems:'center', marginBottom: 20, marginTop: 30 },
    greeting: { fontSize: 24, fontWeight: 'bold' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 15 },
    cursoCard: { width: '47%', padding: 15, borderRadius: 16, alignItems: 'center', marginBottom: 5, elevation: 2 },
    iconBox: { width: 60, height: 60, borderRadius: 30, justifyContent:'center', alignItems:'center', marginBottom: 10 },
    cursoTitle: { fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 5 },
    modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'center', alignItems:'center' },
    modalContent: { width: '80%', padding: 20, borderRadius: 20, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight:'bold', marginBottom: 15 },
    input: { borderWidth: 1, padding: 10, borderRadius: 10, fontSize: 16 },
  });

 return (
        <View style={{flex: 1, backgroundColor: colors.background}}>
        
        {/* 👇 ANIMACIONES FLOTANTES (MAGIA VISUAL) 👇 */}
        {animXP > 0 && (
            <Animated.View style={{ position: 'absolute', top: 120, alignSelf: 'center', zIndex: 1000, opacity: fadeAnim, transform: [{ translateY: floatY }] }}>
                <Text style={{ fontSize: 32, fontWeight: 'bold', color: '#8b5cf6', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 5 }}>
                    +{animXP} XP
                </Text>
            </Animated.View>
        )}
        {showAnimEnergia && (
            <Animated.View style={{ position: 'absolute', top: 70, right: 30, zIndex: 1000, opacity: fadeAnim, transform: [{ translateY: floatY }] }}>
                <Text style={{ fontSize: 40, fontWeight: 'bold', color: '#f59e0b', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: {width: 1, height: 1}, textShadowRadius: 5 }}>
                    +1 ⚡
                </Text>
            </Animated.View>
        )}
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
            
            {/* CABECERA PERFIL + ENERGÍA + CUADERNO */}
        <View style={styles.header}>
            <View style={{flex: 1}}>
                <Text style={[styles.greeting, { color: colors.text }]} numberOfLines={1}>
                    Hola, {username} 👋
                </Text>
                <Text style={{color: colors.subtext}}>¿Qué estudiamos hoy?</Text>
            </View>
            
            <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                {/* 👇 LA PÍLDORA DE ENERGÍA 👇 */}
                <TouchableOpacity 
                    style={{
                        flexDirection: 'row', alignItems: 'center', 
                        backgroundColor: isDark ? '#334155' : '#eef2ff',
                        paddingHorizontal: 12, paddingVertical: 8, 
                        borderRadius: 20, borderWidth: 1, borderColor: colors.border
                    }}
                    onPress={() => Alert.alert("Energía ⚡", "Gastas 1 rayo por cada test o fase de reto. Se recarga 1 cada hora.\n\n¡Tienda Premium próximamente!")}
                >
                    <Text style={{fontSize: 20, marginRight: 5}}>⚡</Text>
                    <View style={{alignItems: 'center'}}>
                        <Text style={{fontWeight: 'bold', color: colors.text, fontSize: 14}}>
                            {energia} / 5
                        </Text>
                        {energia < 5 && (
                            <Text style={{fontSize: 10, color: colors.tint, fontWeight: 'bold'}}>
                                {formatTime(segundosRestantes)}
                            </Text>
                        )}
                    </View>
                </TouchableOpacity>

                {/* BOTÓN DEL CUADERNO (Intacto) */}
                <TouchableOpacity 
                    style={{
                        backgroundColor: isDark ? '#1e293b' : '#f1f5f9',
                        padding: 12, borderRadius: 15, elevation: 2, borderWidth: 1, borderColor: colors.border
                    }}
                    onPress={() => {
                        setShowMisiones(true);
                        setCompletadasVistas(completadasActuales);
                    }}
                >
                    <Ionicons name="journal" size={28} color={colors.tint} />
                    {mostrarPuntoRojo && (
                        <View style={{position:'absolute', top:-2, right:-2, width:12, height:12, backgroundColor:'#ef4444', borderRadius:6, borderWidth:2, borderColor: colors.background}} />
                    )}
                </TouchableOpacity>
            </View>
        </View>

            {/* BARRA DE NIVEL */}
            <NivelBar nivel={miNivel} xpActual={miXP} />

            {/* TÍTULO CURSOS */}
            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop: 20, marginBottom: 15}}>
                <Text style={{fontSize: 20, fontWeight: 'bold', color: colors.text}}>Mis Cursos 📚</Text>
                
                <TouchableOpacity 
                    style={{ padding: 5 }}
                    onPress={() => setModoEdicionCursos(!modoEdicionCursos)} 
                >
                    <Text style={{ color: modoEdicionCursos ? colors.error : colors.tint, fontWeight: 'bold', fontSize: 16 }}>
                        {modoEdicionCursos ? 'OK' : 'Editar'}
                    </Text>
                </TouchableOpacity>
            </View>

           {/* LISTA DE CURSOS (GRID) */}
            <View style={styles.grid}>
                {misCursos.map((curso) => {
                    const hayAviso = novedades[curso.id]?.test || novedades[curso.id]?.reto || novedades[curso.id]?.oficial;

                    return (
                        <TouchableOpacity 
                            key={curso.id}
                            style={[styles.cursoCard, { backgroundColor: colors.card, position: 'relative' }]}
                            onPress={() => {
                                // 🛡️ Si estamos editando O el candado está cerrado, no entramos al curso
                                if (modoEdicionCursos || lockNav.current) return; 
                                
                                router.push({
                                    pathname: "../curso/[id]",
                                    params: { id: curso.id, nombre: curso.nombre }
                                });
                            }}
                            activeOpacity={modoEdicionCursos ? 1 : 0.7}
                        >
                            <View style={[styles.iconBox, {backgroundColor: isDark ? '#333' : '#eef2ff'}]}>
                                <Ionicons name={curso.icono || 'book'} size={32} color={colors.tint} />
                            </View>
                            <Text style={[styles.cursoTitle, {color: colors.text}]} numberOfLines={2}>
                                {curso.nombre}
                            </Text>
                            <Text style={{color: colors.subtext, fontSize: 12}}>
                                {curso.total_apuntes || 0} temas
                            </Text>

                            {/* Aviso de Novedades (Solo si no estamos editando) */}
                            {hayAviso && !modoEdicionCursos && (
                                <View style={{
                                    position: 'absolute', top: 10, right: 10, width: 14, height: 14,
                                    borderRadius: 7, backgroundColor: '#ef4444', borderWidth: 2,
                                    borderColor: colors.card, zIndex: 10
                                }} />
                            )}

                            {/* Botón de Eliminar (Solo en Modo Edición) */}
                            {modoEdicionCursos && (
                                <TouchableOpacity 
                                    style={{
                                        position: 'absolute', top: -8, right: -8, 
                                        backgroundColor: '#ef4444', width: 32, height: 32, 
                                        borderRadius: 16, justifyContent: 'center', alignItems: 'center',
                                        zIndex: 20, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3
                                    }}
                                    onPress={() => confirmarBorrarCurso(curso.id, curso.nombre)}
                                >
                                    <Ionicons name="trash" size={16} color="white" />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* Tarjeta Vacía para añadir (Se oculta al editar para no estorbar) */}
                {!modoEdicionCursos && (
                    <TouchableOpacity 
                        style={[styles.cursoCard, { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' }]}
                        onPress={() => setShowModalCurso(true)}
                    >
                        <Ionicons name="add" size={40} color={colors.subtext} />
                        <Text style={{color: colors.subtext, marginTop: 5}}>Nuevo Curso</Text>
                    </TouchableOpacity>
                )}
            </View>
        </ScrollView>

        {/* ========================================================= */}
        {/* MODAL MISIONES DIARIAS (EL CUADERNO) */}
        {/* ========================================================= */}
        <Modal visible={showMisiones} transparent animationType="slide">
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                <View style={{ 
                    backgroundColor: colors.background, width: '100%', height: '70%', 
                    borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, elevation: 10 
                }}>
                    
                    {/* Cabecera del Cuaderno */}
                    <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom: 25}}>
                        <View>
                            <Text style={{fontSize: 24, fontWeight:'bold', color: colors.text}}>Misiones Diarias 📅</Text>
                            {/* 👇 Contador Dinámico de Medianoche 👇 */}
                            <Text style={{color: colors.tint, marginTop: 5, fontWeight: 'bold'}}>{tiempoRestante}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setShowMisiones(false)} style={{backgroundColor: colors.card, padding: 8, borderRadius: 20}}>
                            <Ionicons name="close" size={28} color={colors.text} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        
                        {/* 🌟 LA MISIÓN ESPECIAL DORADA 🌟 */}
                        {(() => {
                            const totalMisiones = Object.keys(misiones).length;
                            const misionesCompletadas = Object.values(misiones).filter((m: any) => m.actual >= m.meta).length;
                            const plenoReclamado = Object.values(misiones).every((m: any) => m.reclamada);

                            return (
                                <View style={{ 
                                    backgroundColor: isDark ? '#422006' : '#fef3c7', // Fondo dorado claro/oscuro
                                    padding: 18, borderRadius: 20, marginBottom: 25, 
                                    borderWidth: 2, borderColor: '#fbbf24', // Borde dorado fuerte
                                    flexDirection: 'row', alignItems: 'center', gap: 15
                                }}>
                                    <View style={{
                                        width: 50, height: 50, borderRadius: 25, justifyContent:'center', alignItems:'center',
                                        backgroundColor: plenoReclamado ? '#f59e0b' : (isDark ? '#78350f' : '#fde68a')
                                    }}>
                                        <Ionicons name="star" size={26} color={plenoReclamado ? "white" : "#d97706"} />
                                    </View>

                                    <View style={{flex: 1}}>
                                        <Text style={{fontSize: 18, fontWeight:'bold', color: isDark ? '#fcd34d' : '#92400e'}}>Completa las misiones diarias</Text>
                                        <Text style={{color: '#d97706', fontWeight:'bold', fontSize: 13, marginTop: 4}}>
                                            🎁 Recompensa: +1 ⚡
                                        </Text>
                                    </View>

                                    {plenoReclamado ? (
                                        <Text style={{fontWeight:'bold', color: '#d97706', fontSize: 14}}>
                                            OBTENIDA ✅
                                        </Text>
                                    ) : (
                                        <Text style={{fontWeight:'bold', color: isDark ? '#fcd34d' : '#92400e', fontSize: 18}}>
                                            {misionesCompletadas} / {totalMisiones}
                                        </Text>
                                    )}
                                </View>
                            );
                        })()}

                        {/* Lista de Misiones Normales*/}
                        {Object.entries(misiones)
                            .sort((a: any, b: any) => a[1].xp - b[1].xp) // ORDENAMOS: 20 XP primero, 50 XP después
                            .map(([key, mision]: [string, any]) => {
                                const completada = mision.actual >= mision.meta;
                                const progresoPorcentaje = Math.min((mision.actual / mision.meta) * 100, 100);

                                return (
                                    <View key={key} style={{ 
                                        backgroundColor: colors.card, padding: 18, borderRadius: 20, 
                                        marginBottom: 15, borderWidth: 1, borderColor: mision.reclamada ? colors.success : (completada ? colors.tint : colors.border) 
                                    }}>
                                        <View style={{flexDirection:'row', alignItems:'center', gap: 15}}>
                                            
                                            <View style={{
                                                width: 50, height: 50, borderRadius: 25, justifyContent:'center', alignItems:'center',
                                                backgroundColor: mision.reclamada ? (isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7') : (isDark ? '#333' : '#f1f5f9')
                                            }}>
                                                <Ionicons 
                                                    name={mision.reclamada ? "checkmark-done" : (completada ? "gift" : "trophy-outline")} 
                                                    size={26} 
                                                    color={mision.reclamada ? colors.success : (completada ? colors.tint : colors.icon)} 
                                                />
                                            </View>

                                            <View style={{flex: 1}}>
                                                <Text style={{fontSize: 16, fontWeight:'bold', color: colors.text}}>{mision.titulo}</Text>
                                                <Text style={{color: '#8b5cf6', fontWeight:'bold', fontSize: 13, marginTop: 4}}>
                                                    +{mision.xp} XP
                                                </Text>
                                            </View>

                                            {!completada ? (
                                                <Text style={{fontWeight:'bold', color: colors.subtext, fontSize: 16}}>
                                                    {Math.min(mision.actual, mision.meta)} / {mision.meta}
                                                </Text>
                                            ) : !mision.reclamada ? (
                                                <TouchableOpacity 
                                                    style={{backgroundColor: colors.tint, paddingHorizontal: 15, paddingVertical: 8, borderRadius: 12, elevation: 3}}
                                                    onPress={() => reclamarRecompensa(key, mision.xp)}
                                                >
                                                    <Text style={{color: 'white', fontWeight: 'bold', fontSize: 12}}>RECLAMAR</Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <Text style={{fontWeight:'bold', color: colors.success, fontSize: 14}}>
                                                    COMPLETADA ✅
                                                </Text>
                                            )}
                                        </View>

                                        {!completada && (
                                            <View style={{height: 8, backgroundColor: colors.border, borderRadius: 4, marginTop: 15, overflow: 'hidden'}}>
                                                <View style={{height: '100%', width: `${progresoPorcentaje}%`, backgroundColor: colors.tint}} />
                                            </View>
                                        )}
                                    </View>
                                );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>

        {/* MODAL CREAR CURSO ORIGINAL */}
        <Modal visible={showModalCurso} transparent animationType="fade">
            <View style={styles.modalOverlay}>
                <View style={[styles.modalContent, {backgroundColor: colors.card}]}>
                    <Text style={[styles.modalTitle, {color: colors.text}]}>Nuevo Curso</Text>
                    <TextInput style={[styles.input, {color: colors.text, borderColor: colors.border}]} placeholder="Ej: Constitución, Inglés..." placeholderTextColor={colors.subtext} value={nuevoCursoNombre} onChangeText={setNuevoCursoNombre} />
                    <View style={{flexDirection:'row', justifyContent:'flex-end', gap: 15, marginTop: 20}}>
                        <TouchableOpacity onPress={() => setShowModalCurso(false)}>
                            <Text style={{color: colors.error, fontSize: 16}}>Cancelar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={crearCurso}>
                            <Text style={{color: colors.tint, fontWeight:'bold', fontSize: 16}}>Crear</Text>
                        </TouchableOpacity>
                    </View>
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
                        Has alcanzado el Nivel {nuevoNivelLogrado}
                    </Text>

                    <TouchableOpacity 
                        style={{ 
                            marginTop: 50, 
                            backgroundColor: colors.tint, 
                            paddingVertical: 15, 
                            paddingHorizontal: 40, 
                            borderRadius: 30 
                        }}
                        onPress={() => {
                            setShowLevelUp(false);
                            // Cerramos el cuaderno de misiones automáticamente para ver la nueva barra de nivel
                            setShowMisiones(false); 
                        }}
                    >
                        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>¡A POR MÁS!</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    </View> 
  );
}