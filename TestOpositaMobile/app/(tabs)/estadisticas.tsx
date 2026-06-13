import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from '../api'; 
import { useTheme } from '../../context/ThemeContext'; 

export default function EstadisticasScreen() {
    const { colors, isDark } = useTheme();
    const [loading, setLoading] = useState(true);
    
    // 👇 ESTADOS PARA EL FILTRO DE TIEMPO 👇
    const [filtroTiempo, setFiltroTiempo] = useState<'dia' | 'semana' | 'mes' | 'siempre'>('siempre');
    
    // ESTADOS PARA EL MODAL
    const [modalVisible, setModalVisible] = useState(false);
    const [modoDetalle, setModoDetalle] = useState<'tests' | 'oficiales' | 'retos' | null>(null);

    const [stats, setStats] = useState<any>({
        tests_completados: 0,
        examenes_completados: 0,
        fases_reto: 0,
        aciertos_totales: 0,
        fallos_totales: 0,
        precision: 0,
        detalles: null 
    });

    const abrirDetalles = (modo: 'tests' | 'oficiales' | 'retos') => {
        setModoDetalle(modo);
        setModalVisible(true);
    };

    // Al añadir 'filtroTiempo' como dependencia, esto se recargará automáticamente cada vez que toques un filtro distinto
    useFocusEffect(
        useCallback(() => {
            cargarEstadisticas();
        }, [filtroTiempo]) 
    );

    const cargarEstadisticas = async () => {
        setLoading(true);
        try {
            // Pasamos el filtro por parámetro a la URL
            const res = await api.get(`/estadisticas-globales?periodo=${filtroTiempo}`);
            setStats(res.data);
        } catch (error) {
            console.log("Error cargando estadísticas", error);
        } finally {
            setLoading(false);
        }
    };

    // COMPONENTE: BOTONES DE FILTRO
    const renderFiltros = () => (
        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 15, marginBottom: 5, paddingHorizontal: 20, gap: 10 }}>
            {['dia', 'semana', 'mes', 'siempre'].map((f) => {
                const isSelected = filtroTiempo === f;
                const labels = { dia: '1 Día', semana: '1 Sem', mes: '1 Mes', siempre: 'Siempre' };
                return (
                    <TouchableOpacity
                        key={f}
                        style={{
                            paddingVertical: 8,
                            paddingHorizontal: 16,
                            borderRadius: 20,
                            backgroundColor: isSelected ? colors.tint : (isDark ? '#1e293b' : '#f1f5f9'),
                            borderWidth: 1,
                            borderColor: isSelected ? colors.tint : colors.border
                        }}
                        onPress={() => setFiltroTiempo(f as any)}
                    >
                        <Text style={{
                            color: isSelected ? '#fff' : colors.text,
                            fontWeight: isSelected ? 'bold' : 'normal',
                            fontSize: 13
                        }}>
                            {labels[f as keyof typeof labels]}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    if (loading && !stats.detalles) {
        return (
            <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.tint} />
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* CABECERA */}
            <View style={[styles.header, { backgroundColor: colors.card }]}>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Tus Estadísticas 📊</Text>
            </View>

            {/* 👇 RENDERIZAMOS EL FILTRO AQUÍ 👇 */}
            {renderFiltros()}

            {loading ? (
                <View style={{ marginTop: 50 }}><ActivityIndicator size="large" color={colors.tint} /></View>
            ) : (
                <View style={{ padding: 20 }}>
                    
                   {/* 🎯 TARJETA PRINCIPAL: PRECISIÓN (ACIERTOS VS FALLOS) */}
                    <View style={[styles.mainCard, { backgroundColor: isDark ? '#1e293b' : 'white', borderColor: colors.border }]}>
                        {/* 1. Texto cabecera más pequeño y con menos margen */}
                        <Text style={{ color: colors.subtext, fontSize: 14, fontWeight: 'bold', marginBottom: 10, textAlign: 'center' }}>
                            PRECISIÓN GLOBAL
                        </Text>
                        
                        {/* 2. El número del % menos gigante y con menos margen inferior */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                            <Text style={{ fontSize: 36, fontWeight: 'bold', color: colors.tint }}>{stats.precision}%</Text>
                        </View>

                        {/* 3. Barra un poco más fina (de 12 a 8) */}
                        <View style={{ height: 8, backgroundColor: colors.error, borderRadius: 4, flexDirection: 'row', overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${stats.precision}%`, backgroundColor: colors.success }} />
                        </View>

                        {/* 4. Números de abajo ligeramente más pequeños y juntos */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ color: colors.success, fontSize: 18, fontWeight: 'bold' }}>{stats.aciertos_totales}</Text>
                                <Text style={{ color: colors.subtext, fontSize: 11 }}>Aciertos ✅</Text>
                            </View>
                            <View style={{ alignItems: 'center' }}>
                                <Text style={{ color: colors.error, fontSize: 18, fontWeight: 'bold' }}>{stats.fallos_totales}</Text>
                                <Text style={{ color: colors.subtext, fontSize: 11 }}>Fallos ❌</Text>
                            </View>
                        </View>
                    </View>

                    {/* 🏆 GRID DE MODOS DE JUEGO */}
                    <Text style={{ fontSize: 18, fontWeight: 'bold', color: colors.text, marginTop: 25, marginBottom: 15 }}>Modos Jugados</Text>
                    
                    <View style={styles.grid}>
                        <TouchableOpacity onPress={() => abrirDetalles('tests')} style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={[styles.iconContainer, { backgroundColor: '#ffedd5' }]}>
                                <Ionicons name="flash" size={22} color="#ea580c" />
                            </View>
                            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 10 }}>{stats.tests_completados}</Text>
                            <Text style={{ color: colors.subtext, fontSize: 11, textAlign: 'center' }}>Tests</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => abrirDetalles('oficiales')} style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={[styles.iconContainer, { backgroundColor: '#fce7f3' }]}>
                                <Ionicons name="newspaper" size={22} color="#db2777" />
                            </View>
                            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 10 }}>{stats.examenes_completados}</Text>
                            <Text style={{ color: colors.subtext, fontSize: 11, textAlign: 'center' }}>Oficiales</Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={() => abrirDetalles('retos')} style={[styles.statBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                            <View style={[styles.iconContainer, { backgroundColor: '#e0e7ff' }]}>
                                <Ionicons name="trophy" size={22} color="#4f46e5" />
                            </View>
                            <Text style={{ fontSize: 20, fontWeight: 'bold', color: colors.text, marginTop: 10 }}>{stats.fases_reto}</Text>
                            <Text style={{ color: colors.subtext, fontSize: 11, textAlign: 'center' }}>Retos</Text>
                        </TouchableOpacity>
                    </View>

                </View>
            )}

            {/* 👇 MODAL DETALLES ESPECÍFICOS 👇 */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
                    <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, minHeight: '40%' }}>
                        
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: modoDetalle === 'tests' ? '#ffedd5' : modoDetalle === 'oficiales' ? '#fce7f3' : '#e0e7ff', justifyContent: 'center', alignItems: 'center' }}>
                                    <Ionicons name={modoDetalle === 'tests' ? 'flash' : modoDetalle === 'oficiales' ? 'newspaper' : 'trophy'} size={24} color={modoDetalle === 'tests' ? '#ea580c' : modoDetalle === 'oficiales' ? '#db2777' : '#4f46e5'} />
                                </View>
                                <Text style={{ fontSize: 22, fontWeight: 'bold', color: colors.text }}>
                                    {modoDetalle === 'tests' ? 'Tests Rápidos' : modoDetalle === 'oficiales' ? 'Exámenes Oficiales' : 'Modo Reto'}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={{ backgroundColor: colors.card, padding: 8, borderRadius: 20 }}>
                                <Ionicons name="close" size={24} color={colors.text} />
                            </TouchableOpacity>
                        </View>

                        {stats.detalles && (
                            <View style={{ gap: 15 }}>
                                {(modoDetalle === 'tests' || modoDetalle === 'oficiales') && (
                                    <>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>Precisión de Acierto</Text>
                                            <Text style={{ color: colors.tint, fontWeight: 'bold', fontSize: 18 }}>{stats.detalles[modoDetalle].precision}%</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.text, fontSize: 16 }}>Aciertos Totales</Text>
                                            <Text style={{ color: colors.success, fontWeight: 'bold', fontSize: 16 }}>{stats.detalles[modoDetalle].aciertos} ✅</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.text, fontSize: 16 }}>Fallos Totales</Text>
                                            <Text style={{ color: colors.error, fontWeight: 'bold', fontSize: 16 }}>{stats.detalles[modoDetalle].fallos} ❌</Text>
                                        </View>
                                    </>
                                )}

                                {modoDetalle === 'retos' && (
                                    <>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>Fases Superadas</Text>
                                            <Text style={{ color: colors.tint, fontWeight: 'bold', fontSize: 18 }}>{stats.fases_reto} 🏆</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.text, fontSize: 16 }}>Retos Creados</Text>
                                            <Text style={{ color: colors.text, fontWeight: 'bold', fontSize: 16 }}>{stats.detalles.retos.creados} 📚</Text>
                                        </View>
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.text, fontSize: 16 }}>Retos Completados al 100%</Text>
                                            <Text style={{ color: colors.success, fontWeight: 'bold', fontSize: 16 }}>{stats.detalles.retos.completados} 🌟</Text>
                                        </View>
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

const styles = StyleSheet.create({
    header: { paddingHorizontal: 20, paddingTop: 15, paddingBottom: 15, elevation: 4, zIndex: 10, borderBottomWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    headerTitle: { fontSize: 24, fontWeight: 'bold', textAlign: 'center' },
    mainCard: { padding: 15, borderRadius: 20, elevation: 3, borderWidth: 1 },
    grid: { flexDirection: 'row', justifyContent: 'space-between' },
    statBox: { flex: 1, padding: 12, borderRadius: 16, alignItems: 'center', marginBottom: 15, borderWidth: 1, elevation: 1 },
    iconContainer: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' }
});