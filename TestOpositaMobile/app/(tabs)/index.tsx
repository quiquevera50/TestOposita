import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Platform, Animated, ActivityIndicator} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import api from '../api';
import { useTheme } from '../../context/ThemeContext';
import { NivelBar } from '../../components/NivelBar';
import { EconomyBar } from '../../components/EconomyBar';
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
  // Estados PDF Upload
  const [showModalPDF, setShowModalPDF] = useState(false);
  const [pdfStep, setPdfStep] = useState<'curso' | 'archivo' | 'loading'>('curso');
  const [pdfCursoId, setPdfCursoId] = useState<number | null>(null);
  const [pdfCursoNuevo, setPdfCursoNuevo] = useState('');
  const [pdfArchivo, setPdfArchivo] = useState<any>(null);
  const [pdfCantidad, setPdfCantidad] = useState(10);
  const [pdfLoadingMsg, setPdfLoadingMsg] = useState('');
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

 const CURSO_COLORS = ['#FF9600','#1CB0F6','#CE82FF','#FF4B4B','#58CC02','#FF86D0','#00CFC1'];

  const abrirModalPDF = () => {
    setPdfStep('curso');
    setPdfCursoId(null);
    setPdfCursoNuevo('');
    setPdfArchivo(null);
    setPdfCantidad(10);
    setShowModalPDF(true);
  };

  const seleccionarPDF = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!result.canceled && result.assets?.length > 0) {
      setPdfArchivo(result.assets[0]);
    }
  };

  const subirPDFyGenerar = async () => {
    if (!pdfArchivo) return;
    const token = await AsyncStorage.getItem('userToken');
    setPdfStep('loading');

    try {
      // 1. Si nuevo curso, crearlo primero
      let cursoId = pdfCursoId;
      if (!cursoId) {
        const userId = parseInt(await AsyncStorage.getItem('user_id') || '0');
        const nombre = pdfCursoNuevo.trim() || pdfArchivo.name.replace('.pdf', '');
        setPdfLoadingMsg('Creando curso...');
        const resCurso = await api.post('/crear-curso', { user_id: userId, nombre });
        cursoId = resCurso.data.id;
        if (!cursoId) throw new Error('No se pudo crear el curso');
      }

      // 2. Subir PDF
      setPdfLoadingMsg('Subiendo PDF...');
      const formData = new FormData();
      formData.append('curso_id', String(cursoId));

      if (Platform.OS === 'web') {
        const response = await fetch(pdfArchivo.uri);
        const blob = await response.blob();
        formData.append('file', blob, pdfArchivo.name);
      } else {
        formData.append('file', { uri: pdfArchivo.uri, name: pdfArchivo.name, type: 'application/pdf' } as any);
      }

      const resSubida = await api.post('/subir-apunte', formData, {
        headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` },
      });
      const apunteId = resSubida.data.apunte_id;
      if (!apunteId) throw new Error('No se recibió apunte_id');

      // 3. Generar test con Gemini
      setPdfLoadingMsg(`Generando ${pdfCantidad} preguntas con IA...`);
      const resTest = await api.post(`/generar-test-biblioteca/${apunteId}?cantidad=${pdfCantidad}`);
      const preguntas = resTest.data.preguntas;
      if (!preguntas?.length) throw new Error('La IA no generó preguntas');

      setShowModalPDF(false);
      await cargarTodo();
      router.push({ pathname: '/test', params: { data: JSON.stringify(preguntas) } });

    } catch (e: any) {
      setShowModalPDF(false);
      Alert.alert('Error', e?.response?.data?.detail || e?.message || 'Error generando el test');
    }
  };

 return (
        <View style={{flex: 1, backgroundColor: colors.background}}>

        {/* ANIMACIONES FLOTANTES */}
        {animXP > 0 && (
            <Animated.View style={{ position: 'absolute', top: 120, alignSelf: 'center', zIndex: 1000, opacity: fadeAnim, transform: [{ translateY: floatY }] }}>
                <Text style={{ fontSize: 32, fontWeight: '800', color: '#CE82FF' }}>+{animXP} XP</Text>
            </Animated.View>
        )}
        {showAnimEnergia && (
            <Animated.View style={{ position: 'absolute', top: 70, right: 30, zIndex: 1000, opacity: fadeAnim, transform: [{ translateY: floatY }] }}>
                <Text style={{ fontSize: 40, fontWeight: '800', color: '#FF9600' }}>+1 ⚡</Text>
            </Animated.View>
        )}

        <ScrollView contentContainerStyle={{ paddingBottom: 110 }} showsVerticalScrollIndicator={false}>

            {/* ── BARRA DE ECONOMÍA ── */}
            <EconomyBar
                onPressRubies={() => router.push('/(tabs)/shop')}
                onPressVidas={() => Alert.alert('Vidas ❤️', 'Pierdes una vida por cada fallo. Se recargan solas con el tiempo o cámbialas por rubíes 💎 en la tienda.')}
            />

            {/* ── HERO BANNER ── */}
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.5 }} numberOfLines={1}>
                            Hola, {username} 👋
                        </Text>
                        <Text style={{ color: colors.subtext, fontSize: 14, marginTop: 2 }}>¿Qué estudiamos hoy?</Text>
                    </View>
                    {/* Misiones */}
                    <TouchableOpacity
                        style={{ backgroundColor: isDark ? '#1E293B' : '#FFF', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 10, marginLeft: 10 }}
                        onPress={() => { setShowMisiones(true); setCompletadasVistas(completadasActuales); }}
                    >
                        <Ionicons name="journal-outline" size={24} color={colors.tint} />
                        {mostrarPuntoRojo && (
                            <View style={{ position: 'absolute', top: -3, right: -3, width: 12, height: 12, backgroundColor: '#FF4B4B', borderRadius: 6, borderWidth: 2, borderColor: colors.background }} />
                        )}
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── STATS STRIP ── */}
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 14, gap: 10 }}>
                {/* Nivel */}
                <View style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#FFF', borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' }}>
                    <Text style={{ fontSize: 22 }}>🏆</Text>
                    <Text style={{ color: colors.tint, fontWeight: '800', fontSize: 18, marginTop: 2 }}>Nv. {miNivel}</Text>
                    <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 1 }}>{miXP} XP</Text>
                </View>
                {/* Misiones del día */}
                <TouchableOpacity
                    style={{ flex: 1, backgroundColor: isDark ? '#1E293B' : '#FFF', borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, alignItems: 'center' }}
                    onPress={() => { setShowMisiones(true); setCompletadasVistas(completadasActuales); }}
                >
                    <Text style={{ fontSize: 22 }}>🎯</Text>
                    <Text style={{ color: '#CE82FF', fontWeight: '800', fontSize: 18, marginTop: 2 }}>
                        {Object.values(misiones).filter((m: any) => m.actual >= m.meta).length}/{Object.keys(misiones).length}
                    </Text>
                    <Text style={{ color: colors.subtext, fontSize: 11, marginTop: 1 }}>Misiones</Text>
                </TouchableOpacity>
            </View>

            {/* ── BARRA DE NIVEL ── */}
            <View style={{ paddingHorizontal: 20 }}>
                <NivelBar nivel={miNivel} xpActual={miXP} />
            </View>

            {/* ── CABECERA CURSOS ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>Mis Cursos</Text>
                <TouchableOpacity onPress={() => setModoEdicionCursos(!modoEdicionCursos)} style={{ backgroundColor: modoEdicionCursos ? '#FF4B4B' : colors.tint, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 }}>
                    <Text style={{ color: '#FFF', fontWeight: '700', fontSize: 13 }}>{modoEdicionCursos ? 'Listo' : 'Editar'}</Text>
                </TouchableOpacity>
            </View>

            {/* ── GRID DE CURSOS ── */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 14, gap: 10 }}>
                {misCursos.map((curso, idx) => {
                    const hayAviso = novedades[curso.id]?.test || novedades[curso.id]?.reto || novedades[curso.id]?.oficial;
                    const cardColor = CURSO_COLORS[idx % CURSO_COLORS.length];
                    return (
                        <TouchableOpacity
                            key={curso.id}
                            style={{
                                width: '47%', borderRadius: 20, overflow: 'hidden', position: 'relative',
                                backgroundColor: cardColor, padding: 16, minHeight: 130,
                            }}
                            onPress={() => {
                                if (modoEdicionCursos || lockNav.current) return;
                                router.push({ pathname: '../curso/[id]', params: { id: curso.id, nombre: curso.nombre } });
                            }}
                            activeOpacity={modoEdicionCursos ? 1 : 0.85}
                        >
                            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
                                <Ionicons name={curso.icono || 'book'} size={26} color="white" />
                            </View>
                            <Text style={{ color: 'white', fontWeight: '800', fontSize: 15, marginBottom: 4 }} numberOfLines={2}>{curso.nombre}</Text>
                            <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 12 }}>{curso.total_apuntes || 0} temas</Text>

                            {hayAviso && !modoEdicionCursos && (
                                <View style={{ position: 'absolute', top: 10, right: 10, width: 14, height: 14, borderRadius: 7, backgroundColor: '#FF4B4B', borderWidth: 2, borderColor: cardColor }} />
                            )}
                            {modoEdicionCursos && (
                                <TouchableOpacity
                                    style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#FF4B4B', width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', zIndex: 20 }}
                                    onPress={() => confirmarBorrarCurso(curso.id, curso.nombre)}
                                >
                                    <Ionicons name="trash" size={14} color="white" />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    );
                })}

                {/* Card añadir nuevo curso */}
                {!modoEdicionCursos && (
                    <TouchableOpacity
                        style={{ width: '47%', borderRadius: 20, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed', minHeight: 130, justifyContent: 'center', alignItems: 'center', gap: 6 }}
                        onPress={() => setShowModalCurso(true)}
                    >
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.tint, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name="add" size={28} color="white" />
                        </View>
                        <Text style={{ color: colors.subtext, fontSize: 13, fontWeight: '600' }}>Nuevo Curso</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* ── CTA SUBIR PDF ── */}
            {!modoEdicionCursos && (
                <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
                    <TouchableOpacity
                        style={{ backgroundColor: colors.tint, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                        onPress={abrirModalPDF}
                    >
                        <Ionicons name="cloud-upload-outline" size={22} color="white" />
                        <Text style={{ color: 'white', fontWeight: '800', fontSize: 16 }}>Subir PDF y generar test</Text>
                    </TouchableOpacity>
                </View>
            )}

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

        {/* ========================================================= */}
        {/* MODAL SUBIR PDF Y GENERAR TEST */}
        {/* ========================================================= */}
        <Modal visible={showModalPDF} transparent animationType="slide">
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40 }}>

              {/* LOADING */}
              {pdfStep === 'loading' && (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <ActivityIndicator size="large" color={colors.tint} />
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 20 }}>{pdfLoadingMsg}</Text>
                  <Text style={{ color: colors.subtext, fontSize: 13, marginTop: 8 }}>Esto puede tardar unos segundos...</Text>
                </View>
              )}

              {/* PASO 1: SELECCIONAR CURSO */}
              {pdfStep === 'curso' && (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 }}>Subir PDF y generar test</Text>
                  <Text style={{ color: colors.subtext, fontSize: 14, marginBottom: 20 }}>Elige un curso o crea uno nuevo</Text>

                  {/* Cursos existentes */}
                  {misCursos.length > 0 && (
                    <ScrollView style={{ maxHeight: 180 }} showsVerticalScrollIndicator={false}>
                      {misCursos.map((c, i) => (
                        <TouchableOpacity key={c.id}
                          style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 8, backgroundColor: pdfCursoId === c.id ? colors.tint + '22' : (isDark ? '#1E293B' : '#F5F5F5'), borderWidth: 2, borderColor: pdfCursoId === c.id ? colors.tint : 'transparent' }}
                          onPress={() => { setPdfCursoId(c.id); setPdfCursoNuevo(''); }}
                        >
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: CURSO_COLORS[i % CURSO_COLORS.length], justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                            <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{c.nombre?.[0]?.toUpperCase()}</Text>
                          </View>
                          <Text style={{ color: colors.text, fontWeight: '600', flex: 1 }}>{c.nombre}</Text>
                          {pdfCursoId === c.id && <Ionicons name="checkmark-circle" size={22} color={colors.tint} />}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}

                  {/* Separador */}
                  <Text style={{ color: colors.subtext, fontSize: 12, textAlign: 'center', marginVertical: 10 }}>— o crea uno nuevo —</Text>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: pdfCursoNuevo ? colors.tint : colors.border, borderRadius: 14, padding: 14, color: colors.text, backgroundColor: isDark ? '#1E293B' : '#F5F5F5', fontSize: 15, marginBottom: 20 }}
                    placeholder="Ej: Constitución Española"
                    placeholderTextColor={colors.subtext}
                    value={pdfCursoNuevo}
                    onChangeText={t => { setPdfCursoNuevo(t); if (t) setPdfCursoId(null); }}
                  />

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={{ flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => setShowModalPDF(false)}>
                      <Text style={{ color: colors.subtext, fontWeight: '600' }}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 2, padding: 16, borderRadius: 16, backgroundColor: (pdfCursoId || pdfCursoNuevo.trim()) ? colors.tint : colors.border, alignItems: 'center' }}
                      onPress={() => (pdfCursoId || pdfCursoNuevo.trim()) && setPdfStep('archivo')}
                    >
                      <Text style={{ color: 'white', fontWeight: '800' }}>Siguiente →</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* PASO 2: SELECCIONAR PDF Y CANTIDAD */}
              {pdfStep === 'archivo' && (
                <>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: 6 }}>Selecciona el PDF</Text>
                  <Text style={{ color: colors.subtext, fontSize: 14, marginBottom: 20 }}>La IA leerá el PDF y generará preguntas</Text>

                  {/* Botón seleccionar PDF */}
                  <TouchableOpacity
                    style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: pdfArchivo ? colors.tint : colors.border, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 20 }}
                    onPress={seleccionarPDF}
                  >
                    <Ionicons name={pdfArchivo ? 'document-text' : 'cloud-upload-outline'} size={36} color={pdfArchivo ? colors.tint : colors.subtext} />
                    <Text style={{ color: pdfArchivo ? colors.tint : colors.subtext, fontWeight: '700', marginTop: 10, textAlign: 'center' }}>
                      {pdfArchivo ? pdfArchivo.name : 'Pulsa para seleccionar PDF'}
                    </Text>
                    {pdfArchivo && <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>{(pdfArchivo.size / 1024).toFixed(0)} KB</Text>}
                  </TouchableOpacity>

                  {/* Número de preguntas */}
                  <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 10 }}>¿Cuántas preguntas?</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                    {[10, 20, 30].map(n => (
                      <TouchableOpacity key={n} style={{ flex: 1, padding: 14, borderRadius: 14, backgroundColor: pdfCantidad === n ? colors.tint : (isDark ? '#1E293B' : '#F5F5F5'), alignItems: 'center', borderWidth: 2, borderColor: pdfCantidad === n ? colors.tint : 'transparent' }} onPress={() => setPdfCantidad(n)}>
                        <Text style={{ color: pdfCantidad === n ? 'white' : colors.text, fontWeight: '800', fontSize: 18 }}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity style={{ flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border, alignItems: 'center' }} onPress={() => setPdfStep('curso')}>
                      <Text style={{ color: colors.subtext, fontWeight: '600' }}>← Atrás</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 2, padding: 16, borderRadius: 16, backgroundColor: pdfArchivo ? colors.tint : colors.border, alignItems: 'center' }}
                      onPress={() => pdfArchivo && subirPDFyGenerar()}
                    >
                      <Text style={{ color: 'white', fontWeight: '800' }}>Generar test ✨</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

            </View>
          </View>
        </Modal>

    </View>
  );
}