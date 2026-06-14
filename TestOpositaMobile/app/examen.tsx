import React, { useState, useCallback, useRef, useEffect} from 'react';
// 👇 Importaciones corregidas para evitar errores de Modal y FlatList
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, SafeAreaView, Modal, FlatList, Platform} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { Ionicons } from '@expo/vector-icons';
import { API_URL } from './config';
import { useTheme } from '../context/ThemeContext';
import { useTaskManager } from '../context/TaskManagerContext';
import { useGameFeedback } from '../hooks/useGameFeedback';
import { useEnergy } from '../context/EnergyContext';
import { useSafeBack } from '../hooks/useSafeBack';

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
export default function OficialScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { colors, isDark } = useTheme();
    const { tareasOficial, analizarExamenBackground, marcarLeido } = useTaskManager();

    const cursoId = params.cursoId ? parseInt(params.cursoId as string) : null;
    const cursoNombre = params.cursoNombre as string || "Mis Apuntes";
    const volver = useSafeBack(cursoId ? { pathname: '/curso/[id]', params: { id: String(cursoId), nombre: cursoNombre } } : '/(tabs)');
    const taskKey = cursoId ? cursoId.toString() : 'general';
    const estadoTarea = tareasOficial?.[taskKey];

    // --- ESTADOS NAVEGACIÓN ---
    const [vista, setVista] = useState<'lista' | 'juego'>('lista');
    const [userId, setUserId] = useState<string | null>(null);

    // --- ESTADOS VISTA LISTA ---
    const [apuntesPorAnalizar, setApuntesPorAnalizar] = useState<any[]>([]); // 👈 Nueva lista 1
    const [apuntesListos, setApuntesListos] = useState<any[]>([]);           // 👈 Nueva lista 2
    const [misApuntes, setMisApuntes] = useState<any[]>([]);
    const [historialOficial, setHistorialOficial] = useState<any[]>([]); 
    const [seleccionado, setSeleccionado] = useState<number | null>(null);
    const [loadingLista, setLoadingLista] = useState(false);

    // --- ESTADOS VISTA JUEGO ---
    const [sesionId, setSesionId] = useState<number | null>(null);
    const [nombreExamen, setNombreExamen] = useState("");
    const [preguntas, setPreguntas] = useState<any[]>([]);
    const [indice, setIndice] = useState(0);
    const [respuestas, setRespuestas] = useState<Record<number, number>>({});
    const [showPanel, setShowPanel] = useState(false);  
    const [procesandoIA, setProcesandoIA] = useState(false);
    const { feedbackAcierto, feedbackSeleccion } = useGameFeedback();
    const prevLoadingRef = useRef(false);
    const { energia, consumirEnergia } = useEnergy();
    // --- ESTADOS RESULTADOS FINALES ---
    const [showVictoria, setShowVictoria] = useState(false);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const [datosVictoria, setDatosVictoria] = useState({ aciertos: 0, total: 0, xp: 0 });
    const [subidaPendiente, setSubidaPendiente] = useState<{si: boolean, nivel: number | null}>({si: false, nivel: null});

    // 1. CARGA INICIAL
    useFocusEffect(
        useCallback(() => {
            if (cursoId) {
                marcarLeido(cursoId, 'oficial');
                cargarDatosIniciales();
            }
        }, [cursoId])
    );
    useEffect(() => {
        const isCurrentlyLoading = estadoTarea?.loading || false;

        // Si ANTES estaba cargando, y AHORA ya no está cargando -> ¡La IA terminó!
        if (prevLoadingRef.current === true && isCurrentlyLoading === false) {
            console.log("✅ IA terminó en segundo plano. Autorecargando lista...");
            cargarDatosIniciales();
        }

        // Actualizamos nuestra memoria para el próximo cambio
        prevLoadingRef.current = isCurrentlyLoading;
    }, [estadoTarea?.loading]);
    
    const cargarDatosIniciales = async () => {
        setLoadingLista(true);
        const uId = await AsyncStorage.getItem('user_id');
        setUserId(uId);
        try {
            // 1. Cargar PDFs de la base de datos
            const url = cursoId ? `/apuntes-curso/${cursoId}` : `/apuntes`;
            const resApuntes = await api.get(url);
            
            const filtrados = resApuntes.data.filter((a: any) => a.categorias && a.categorias.includes('Examen Oficial'));
            
            // 2. Preguntar a Python por el estado de TODOS los PDFs (limpio)
            const statusPromises = filtrados.map((a: any) => api.get(`/estado-examen-oficial/${a.id}`));
            const statuses = await Promise.all(statusPromises);

            const porAnalizar: any[] = [];
            const listos: any[] = [];

            // 3. Separarlos en listas y purgar los fallidos
            for (let i = 0; i < filtrados.length; i++) {
                const apunte = filtrados[i];
                const check = statuses[i].data;

                if (check.listo && check.exito !== false) {
                    listos.push(apunte); // ✅ APTO y analizado con éxito
                } else if (check.listo === true && check.exito === false) {
                    // ❌ FALLIDO (NO APTO): Le quitamos la etiqueta en el servidor 
                    api.post(`/quitar-categoria/${apunte.id}`, { categoria: 'Examen Oficial' })
                       .catch(e => console.log("Error purgando categoría", e));
                    
                    // Al NO meterlo en 'porAnalizar', el PDF desaparece de la pantalla inmediatamente.
                } else {
                    porAnalizar.push(apunte); // ⏳ Aún no analizado o está cargando ahora mismo
                }
            }

            setApuntesPorAnalizar(porAnalizar);
            setApuntesListos(listos);

            // 4. Cargar Historial Oficial
            if (uId) {
                const resHistorial = await api.get(`/historial-oficial`);
                setHistorialOficial(resHistorial.data);
            }
        } catch (e) {
            console.log("Error cargando datos");
        } finally {
            setLoadingLista(false);
        }
    };

    

    const cargarJuegoDirecto = async (apunteId: number) => {
        setLoadingLista(true);
        try {
            const resSesion = await api.get(`/iniciar-sesion-oficial/${apunteId}`);
            setSesionId(resSesion.data.sesionId);
            setPreguntas(resSesion.data.preguntas);
            setIndice(resSesion.data.indice_actual);
            setRespuestas(resSesion.data.respuestas_usuario);
            setNombreExamen(resSesion.data.nombre_examen);
            
            setVista('juego'); 
        } catch (e: any) {
            console.log("Error al cargar la sesión de juego", e);
            if (Platform.OS === 'web') {
                window.alert("❌ Error cargando el examen. Revisa la consola.");
            } else {
                Alert.alert("Error", "No se pudo cargar el examen.");
            }
        } finally {
            setLoadingLista(false);
        }
    };
    
    // LÓGICA DE ANÁLISIS MEJORADA (BLOQUEO + POLLING + PEAJE ENERGÍA)
    // 🛡️ 1. FUNCIÓN PRINCIPAL (Aviso de seguridad)
    const iniciarAnalisis = async () => {
        // Bloqueo de seguridad inicial
        if (!seleccionado || estadoTarea?.loading || loadingLista || !userId) return;
        
        // Comprobación de energía local
        if (energia < 1) {
            if (Platform.OS === 'web') {
                window.alert("¡Sin Energía! ⚡\nNo tienes rayos suficientes. Espera a que se recarguen.");
                return;
            } else {
                return Alert.alert("¡Sin Energía! ⚡", "No tienes rayos suficientes. Espera a que se recarguen.");
            }
        }

        // Pop-up de advertencia compatible con WEB y MÓVIL
        if (Platform.OS === 'web') {
            const confirmar = window.confirm("⚠️ ¡CUIDADO!\n\nAsegúrate de que el archivo es realmente un EXAMEN. \n\nSi el archivo no tiene estructura de preguntas y respuestas, la IA fallará y perderás 1 energía igualmente.\n\n¿Quieres continuar?");
            if (confirmar) {
                ejecutarAnalisisReal();
            }
        } else {
            Alert.alert(
                "⚠️ ¡CUIDADO!",
                "Asegúrate de que el archivo es realmente un EXAMEN. \n\nSi el archivo no tiene estructura de preguntas y respuestas, la IA fallará y perderás 1 energía igualmente.",
                [
                    { text: "Cancelar", style: "cancel" },
                    { 
                        text: "Entiendo, Analizar", 
                        onPress: () => ejecutarAnalisisReal() // Si confirma, vamos al lío
                    }
                ]
            );
        }
    };

    // 🧠 2. FUNCIÓN DE EJECUCIÓN (Lógica técnica)
    const ejecutarAnalisisReal = async () => {
        // 👇 SOLUCIÓN: Le decimos a TypeScript que corte aquí si es nulo
        if (!seleccionado) return;

        setLoadingLista(true); 

        try {
            // Paso A: ¿Ya existe el examen?
            const check = await api.get(`/estado-examen-oficial/${seleccionado}`);

            if (check.data.listo && check.data.exito !== false) {
                // Ya estaba listo, entramos gratis
                await cargarJuegoDirecto(seleccionado); 
            } else {
                // Paso B: Cobro de energía en el servidor
                const exito = await consumirEnergia(); 
                if (!exito) {
                    setLoadingLista(false); 
                    return Alert.alert("Error", "No se ha podido procesar la energía."); 
                }

                // Paso C: Activación de la IA
                const apunte = apuntesPorAnalizar.find(a => a.id === seleccionado); 
                analizarExamenBackground(cursoId || 0, seleccionado, apunte?.nombre || "Examen Oficial"); 
                
                setSeleccionado(null); 
            }
        } catch (error) {
            console.log("Fallo al conectar con el servidor."); 
            Alert.alert("Error", "No se pudo conectar con el servidor.");
        } finally {
            setLoadingLista(false); 
        }
    };
    // --- FUNCIONES DEL JUEGO ---
    const marcarRespuesta = (opcionIdx: number) => {
        // 1. Si ya hay una respuesta guardada para este índice, bloqueamos el clic
        if (respuestas[indice] !== undefined) return;

        // 2. Feedback táctil
        feedbackSeleccion();

        // 3. Guardamos la respuesta
        const nuevasRespuestas = { ...respuestas, [indice]: opcionIdx };
        setRespuestas(nuevasRespuestas);
        
        // 4. Comprobamos si es correcta para el sonido de acierto
        const preguntaActual = preguntas[indice];
        const correctaIdx = preguntaActual.Indice_correcta !== undefined ? preguntaActual.Indice_correcta : preguntaActual.respuesta_correcta;
        if (opcionIdx === correctaIdx) {
            feedbackAcierto();
        }
        
        // 5. Auto-guardado silencioso
        if (sesionId) {
            api.post(`/guardar-progreso-oficial`, {
                sesionId: sesionId,
                indice: indice,
                respuestas: nuevasRespuestas
            }).catch(e => console.log("Error auto-guardado"));
        }
    };

    const abandonarJuego = () => {
        // Al darle a la pausa, vuelve al menú sin perder nada
        setVista('lista');
        cargarDatosIniciales(); // Refresca por si acaso
    };

    

   const entregarAlServidor = async () => {
        if (!sesionId || !userId) return;
        
        setProcesandoIA(true); 

        try {
            // 1. Enviamos a corregir
            const res = await api.post(`/entregar-examen-oficial`, {
                sesionId: sesionId,
                user_id: userId
            });
            
            const { aciertos, total } = res.data;
            const xpGanada = aciertos * 10;
            //  AQUÍ LE AVISAMOS AL CUADERNO 
            await registrarProgresoMisiones('oficial', xpGanada);
            // 2. Sumamos la XP y vemos si sube de nivel
            let subioNivel = false;
            let nuevoNivel = 1;
            
            try {
                const resXp = await api.post(`/sumar-xp/${xpGanada}`);
                if (resXp.data.subido) {
                    subioNivel = true;
                    nuevoNivel = resXp.data.nuevo_nivel;
                }
            } catch (errorXp) {
                console.log("Error al sumar XP", errorXp);
            }

            // 3. 👇 LA MAGIA: Guardamos los datos y encendemos nuestro Modal unificado
            setDatosVictoria({ aciertos, total, xp: xpGanada });
            setSubidaPendiente({ si: subioNivel, nivel: subioNivel ? nuevoNivel : null });
            
            setShowVictoria(true);
            
        } catch (error) {
            Alert.alert("Error", "Hubo un problema al corregir tu examen.");
        } finally {
            setProcesandoIA(false);
        }
    };
    // ==========================================
    // RENDERIZADO: VISTA 1 (LISTA / MENÚ)
    // ==========================================
    if (vista === 'lista') {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background }}>
                {/* CABECERA OFICIAL */}
                <View style={[styles.header, { backgroundColor: colors.card }]}>
                    <TouchableOpacity onPress={volver} style={{padding: 5}}>
                        <Ionicons name="arrow-back" size={24} color={colors.text} />
                    </TouchableOpacity>
                    
                    <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                        {cursoNombre}
                    </Text>

                    {/* 👇 AÑADE ESTO A LA DERECHA 👇 */}
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
                    
                    {/* CAJA INFORMATIVA SUPERIOR */}
                    <View style={[styles.infoBox, { backgroundColor: isDark ? '#1e293b' : '#eff6ff' }]}>
                        <Text style={{ fontSize: 30 }}>📝</Text>
                        <View style={{ flex: 1, marginLeft: 15 }}>
                            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 15 }}>Simulacros Reales</Text>
                            <Text style={{ color: colors.subtext, fontSize: 12 }}>Convierte PDFs en exámenes largos interactivos.</Text>
                        </View>
                    </View>

                    {/* AVISO DE TAREA EN SEGUNDO PLANO */}
                    {estadoTarea?.loading && (
                        <View style={[styles.loadingTask, { backgroundColor: colors.card, borderColor: colors.tint }]}>
                            <ActivityIndicator size="small" color={colors.tint} />
                            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>Procesando en 2º plano...</Text>
                        </View>
                    )}

                    {/* ============================================== */}
                    {/* SECCIÓN 1: PDFs POR ANALIZAR */}
                    {/* ============================================== */}
                    <Text style={[styles.label, { color: colors.text }]}>1. Analizar PDF Nuevo:</Text>
                    
                    {loadingLista ? (
                        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 20 }} />
                    ) : apuntesPorAnalizar.length === 0 ? (
                        <Text style={styles.emptyText}>No hay PDFs pendientes de analizar.</Text>
                    ) : (
                        apuntesPorAnalizar.map((item) => (
                            <TouchableOpacity
                                key={item.id}
                                style={[styles.apunteCard, { backgroundColor: colors.card, borderColor: seleccionado === item.id ? colors.tint : colors.border }]}
                                onPress={() => setSeleccionado(item.id)}
                            >
                                <Ionicons name="document-text" size={24} color={seleccionado === item.id ? colors.tint : colors.icon} />
                                <Text style={[styles.apunteNombre, { color: colors.text }]} numberOfLines={1}>{item.nombre}</Text>
                                {seleccionado === item.id && <Ionicons name="checkmark-circle" size={22} color={colors.tint} />}
                            </TouchableOpacity>
                        ))
                    )}
                    {/* Botón de Analizar (Solo sale si hay PDFs por analizar) */}
                    {apuntesPorAnalizar.length > 0 && (
                        <TouchableOpacity
                            style={[styles.btnPrincipal, { 
                                backgroundColor: (seleccionado && !estadoTarea?.loading && !loadingLista) ? colors.tint : colors.border, 
                                paddingVertical: 12 
                            }]}
                            onPress={iniciarAnalisis}
                            disabled={!seleccionado || estadoTarea?.loading || loadingLista} 
                        >
                            {loadingLista ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <>
                                    <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>Extraer Preguntas (IA)</Text>
                                    
                                    {/* 👇 PÍLDORA DE COSTE DE ENERGÍA 👇 */}
                                    <View style={{ 
                                        flexDirection: 'row', alignItems: 'center', 
                                        backgroundColor: 'rgba(0,0,0,0.15)',
                                        paddingHorizontal: 12, paddingVertical: 4, 
                                        borderRadius: 10, marginTop: 6 
                                    }}>
                                        <Text style={{fontSize: 14}}>⚡</Text>
                                        <Text style={{color:'white', fontWeight:'bold', fontSize: 13, marginLeft: 4}}>x1</Text>
                                    </View>
                                </>
                            )}
                        </TouchableOpacity>
                    )}

                    {/* ============================================== */}
                    {/* SECCIÓN 2: EXÁMENES LISTOS */}
                    {/* ============================================== */}
                    <View style={{ marginTop: 40 }}>
                        <Text style={[styles.label, { color: colors.text }]}>2. Exámenes Listos:</Text>
                        {apuntesListos.length === 0 ? (
                            <Text style={styles.emptyText}>Aún no tienes exámenes procesados.</Text>
                        ) : (
                            apuntesListos.map((item) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[styles.apunteCard, { 
                                        backgroundColor: isDark ? 'rgba(34, 197, 94, 0.1)' : '#f0fdf4', 
                                        borderColor: colors.success 
                                    }]}
                                    // ¡Al tocar, entra directo a jugar sin preguntar!
                                    onPress={() => cargarJuegoDirecto(item.id)} 
                                >
                                    <View style={{width: 40, height: 40, borderRadius: 20, backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center'}}>
                                        <Ionicons name="play" size={20} color="white" style={{marginLeft: 3}}/>
                                    </View>
                                    <Text style={[styles.apunteNombre, { color: colors.text, fontWeight: 'bold' }]} numberOfLines={1}>{item.nombre}</Text>
                                    <Ionicons name="chevron-forward" size={24} color={colors.success} />
                                </TouchableOpacity>
                            ))
                        )}
                    </View>

                    {/* ============================================== */}
                    {/* SECCIÓN 3: HISTORIAL OFICIAL */}
                    {/* ============================================== */}
                    <View style={{ marginTop: 40 }}>
                        <Text style={[styles.label, { color: colors.text }]}>Tu Historial Oficial:</Text>
                        {historialOficial.length === 0 ? (
                            <Text style={{color: colors.subtext, fontStyle: 'italic'}}>Aún no has completado ningún examen oficial.</Text>
                        ) : (
                            historialOficial.map((item) => (
                                <View key={item.id} style={[styles.historialCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                                    <View>
                                        <Text style={{ color: colors.text, fontWeight: 'bold' }}>{item.nombre_examen}</Text>
                                        <Text style={{ color: colors.subtext, fontSize: 12 }}>{item.fecha}</Text>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ color: colors.tint, fontWeight: 'bold' }}>{item.aciertos}/{item.total}</Text>
                                        <Text style={{ color: colors.success, fontSize: 11 }}>Completado</Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </View>
                    
                </ScrollView>
                
            </View>
        );
    }

    // ==========================================
    // RENDERIZADO: VISTA 2 (JUEGO DE EXAMEN LARGO)
    // ==========================================
    if (vista === 'juego') {
        const preguntaActual = preguntas[indice];
        if (!preguntaActual) return <ActivityIndicator style={{flex:1}} color={colors.tint} />;

        // Variables para la lógica interactiva
        const yaRespondida = respuestas[indice] !== undefined;
        const seleccionUsuario = respuestas[indice];
        const correctaIdx = preguntaActual.Indice_correcta !== undefined ? preguntaActual.Indice_correcta : preguntaActual.respuesta_correcta;

        return (
           <View style={{ flex: 1, backgroundColor: colors.background }}>
                {/* CABECERA JUEGO */}
                <View style={[styles.header, { backgroundColor: colors.card }]}>
                    <TouchableOpacity onPress={abandonarJuego} style={{ flex: 1, alignItems: 'flex-start' }}>
                        <Ionicons name="pause-circle" size={32} color={colors.tint} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.selectorBtn, { backgroundColor: isDark ? '#333' : '#f1f5f9' }]} onPress={() => setShowPanel(true)}>
                        <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 15 }}>
                            Pregunta {indice + 1} / {preguntas.length}
                        </Text>
                        <Ionicons name="grid-outline" size={20} color={colors.tint} />
                    </TouchableOpacity>

                    {/* Espacio vacío para equilibrar la cabecera y mantener el centro */}
                    <View style={{ flex: 1 }} />
                </View>

                {/* PREGUNTA, OPCIONES Y EXPLICACIÓN */}
                <ScrollView contentContainerStyle={{ padding: 20 }}>
                    <Text style={[styles.pregunta, { color: colors.text }]}>{preguntaActual.Pregunta}</Text>

                    {preguntaActual.Opciones.map((op: string, idx: number) => {
                        // Lógica de colores adaptativa igual que en examen.tsx
                        let bg = colors.card;
                        let bc = colors.border;
                        let tc = colors.text;

                        if (yaRespondida) {
                            if (idx === correctaIdx) { 
                                bg = isDark ? 'rgba(34, 197, 94, 0.2)' : '#dcfce7'; 
                                bc = colors.success; 
                            } 
                            else if (idx === seleccionUsuario) { 
                                bg = isDark ? 'rgba(239, 68, 68, 0.2)' : '#fee2e2'; 
                                bc = colors.error; 
                            }
                        }

                        return (
                            <TouchableOpacity
                                key={idx}
                                style={[styles.opcion, { backgroundColor: bg, borderColor: bc, borderWidth: 2 }]}
                                onPress={() => marcarRespuesta(idx)}
                                disabled={yaRespondida} // Bloquea el botón si ya respondió
                            >
                                <Text style={{ color: tc, flex: 1, fontSize: 16 }}>{op}</Text>
                            </TouchableOpacity>
                        );
                    })}

                    {/* CAJA DE EXPLICACIÓN (Solo sale cuando respondes) */}
                    {yaRespondida && (
                        <View style={[
                            styles.explicacionBox, 
                            { 
                                backgroundColor: isDark ? '#431407' : '#fff7ed', 
                                borderColor: isDark ? '#7c2d12' : '#ffedd5',
                                marginTop: 20, padding: 20, borderRadius: 16, borderWidth: 1
                            }
                        ]}>
                            <Text style={{fontWeight:'bold', color: isDark ? '#fbbf24' : '#b45309', marginBottom:5}}>Explicación:</Text>
                            <Text style={{color: colors.text, marginBottom:15}}>
                                {preguntaActual.Explicacion || "Respuesta correcta guardada."}
                            </Text>
                            
                            {indice < preguntas.length - 1 ? (
                                <TouchableOpacity 
                                    style={{ padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: colors.text }} 
                                    onPress={() => setIndice(indice + 1)}
                                >
                                    <Text style={{color: colors.background, fontWeight:'bold'}}>Siguiente 👉</Text>
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity 
                                    style={{ padding: 16, borderRadius: 12, alignItems: 'center', backgroundColor: colors.success }} 
                                    onPress={entregarAlServidor}
                                >
                                    <Text style={{color: 'white', fontWeight:'bold'}}>Finalizar Examen 🏆</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </ScrollView>

                {/* MODAL GRID (LOS NÚMEROS) */}
                <Modal visible={showPanel} animationType="slide">
                    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
                        <View style={styles.modalHeader}>
                            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text }}>Índice de Preguntas</Text>
                            <TouchableOpacity onPress={() => setShowPanel(false)}>
                                <Ionicons name="close" size={30} color={colors.text} />
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={preguntas}
                            numColumns={5}
                            keyExtractor={(_, i) => i.toString()}
                            renderItem={({ index }) => {
                                // Colores en la cuadrícula para ver qué has fallado/acertado
                                let boxBg = colors.card;
                                let boxText = colors.text;
                                if (respuestas[index] !== undefined) {
                                    const esCorrecta = respuestas[index] === (preguntas[index].Indice_correcta ?? preguntas[index].respuesta_correcta);
                                    boxBg = esCorrecta ? colors.success : colors.error;
                                    boxText = 'white';
                                }
                                return (
                                    <TouchableOpacity 
                                        style={[styles.numBox, { backgroundColor: boxBg, borderColor: colors.border }]}
                                        onPress={() => { setIndice(index); setShowPanel(false); }}
                                    >
                                        <Text style={{ color: boxText, fontWeight: 'bold' }}>{index + 1}</Text>
                                    </TouchableOpacity>
                                )
                            }}
                        />
                    </SafeAreaView>
                </Modal>
                {/* 👇 MODAL DE VICTORIA UNIFICADO (EXAMEN OFICIAL - MODO PRÁCTICA) 👇 */}
                <Modal visible={showVictoria} transparent animationType="fade">
                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' }}>
                        <View style={{ backgroundColor: colors.card, width: '85%', padding: 30, borderRadius: 25, alignItems: 'center', borderWidth: 1, borderColor: colors.border, elevation: 10 }}>
                            
                            {/* 1. Icono Principal (Siempre positivo al ser práctica) */}
                            <Ionicons 
                                name="trophy" 
                                size={80} 
                                color="#FFD700" 
                                style={{ marginBottom: 10 }} 
                            />
                            
                            <Text style={{ fontSize: 26, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 15 }}>
                                ¡Examen Completado!
                            </Text>

                            {/* 2. Estilo Minimalista (Aciertos | XP) */}
                            <View style={{flexDirection:'row', gap: 20, marginBottom: 25, alignItems: 'center', justifyContent: 'center', width: '100%'}}>
                                <View style={{alignItems:'center', flex: 1}}>
                                    <Text style={{fontSize:16, color: colors.subtext}}>Aciertos</Text>
                                    <Text style={{fontSize:28, fontWeight:'bold', color: colors.text}}>
                                        {datosVictoria.aciertos}/{datosVictoria.total}
                                    </Text>
                                </View>
                                
                                <View style={{width: 1, height: '80%', backgroundColor: colors.border}} />
                                
                                <View style={{alignItems:'center', flex: 1}}>
                                    <Text style={{fontSize:16, color: colors.subtext}}>Experiencia</Text>
                                    <Text style={{fontSize:28, fontWeight:'bold', color: '#8b5cf6'}}>
                                        +{datosVictoria.xp} XP
                                    </Text>
                                </View>
                            </View>

                            {/* 3. Botón Continuar */}
                            <TouchableOpacity 
                                style={{ backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 30, borderRadius: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: 10 }}
                                onPress={() => {
                                    setShowVictoria(false); 
                                    if (subidaPendiente.si) {
                                        // Si hay nivel, cohete 🚀
                                        setTimeout(() => { setShowLevelUp(true); }, 300);
                                    } else {
                                        // Si no, volvemos al menú y recargamos
                                        setTimeout(() => { 
                                            setVista('lista'); 
                                            cargarDatosIniciales(); 
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
                                Has alcanzado el Nivel {subidaPendiente.nivel}
                            </Text>

                            <TouchableOpacity 
                                style={{ marginTop: 50, backgroundColor: colors.tint, paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30 }}
                                onPress={() => {
                                    setShowLevelUp(false);
                                    setSubidaPendiente({ si: false, nivel: null }); 
                                    
                                    // Ya no vamos al Home. Volvemos a la lista de exámenes oficiales
                                    setTimeout(() => { 
                                        setVista('lista'); 
                                        cargarDatosIniciales(); 
                                    }, 100);
                                }}
                            >
                                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 18 }}>CONTINUAR MISIÓN</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </View>
        );
    }

    return null;
}

const styles = StyleSheet.create({
    // Estilos Generales
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
  },
    // Estilos Vista Lista
    infoBox: { flexDirection: 'row', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 25 },
    loadingTask: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 15, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderStyle: 'dashed' },
    label: { fontSize: 16, fontWeight: 'bold', marginBottom: 15 },
    apunteCard: { flexDirection: 'row', padding: 18, borderRadius: 15, marginBottom: 12, alignItems: 'center', borderWidth: 2 },
    apunteNombre: { flex: 1, marginLeft: 12, fontSize: 15 },
    emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 20, fontStyle: 'italic' },
    btnPrincipal: { marginTop: 20, padding: 18, borderRadius: 15, alignItems: 'center', elevation: 2 },
    historialCard: { flexDirection: 'row', justifyContent: 'space-between', padding: 15, borderRadius: 12, marginBottom: 10, borderWidth: 1 },

    // Estilos Vista Juego
    selectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.05)', padding: 8, borderRadius: 10 },
    pregunta: { fontSize: 22, fontWeight: 'bold', marginBottom: 30, lineHeight: 30 },
    opcion: { flexDirection: 'row', alignItems: 'center', padding: 18, borderRadius: 15, marginBottom: 12, borderWidth: 2 },
    circle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#ddd', marginRight: 15 },
    footer: { flexDirection: 'row', justifyContent: 'space-around', padding: 20, borderTopWidth: 1 },
    navBtn: { backgroundColor: '#333', padding: 15, borderRadius: 50, width: 60, alignItems: 'center' },
    explicacionBox: { marginTop: 25, padding: 20, borderRadius: 16, borderWidth: 1 },
    // Estilos Modal Grid
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, alignItems: 'center' },
    numBox: { flex: 1, height: 50, margin: 5, borderRadius: 10, justifyContent: 'center', alignItems: 'center', borderWidth: 1 }
});