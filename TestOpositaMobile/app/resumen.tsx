import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, SafeAreaView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import api from './api';
import { useTheme } from '../context/ThemeContext';

// ==========================================
// 📄 RESUMEN IA — Esquema o Resumen explicado del PDF
// ==========================================

// --- Renderizador Markdown ligero ---
function renderInline(text: string, baseStyle: any, key: string) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return (
        <Text key={key} style={baseStyle}>
            {parts.map((p, i) => {
                if (p.startsWith('**') && p.endsWith('**')) {
                    return <Text key={i} style={{ fontWeight: '800' }}>{p.slice(2, -2)}</Text>;
                }
                return p;
            })}
        </Text>
    );
}

function Markdown({ texto, colors }: { texto: string; colors: any }) {
    const lines = texto.split('\n');
    return (
        <View>
            {lines.map((raw, i) => {
                const line = raw.trimEnd();
                if (!line.trim()) return <View key={i} style={{ height: 8 }} />;

                // ## Título
                if (line.startsWith('## ')) {
                    return renderInline(line.slice(3), { color: colors.tint, fontSize: 20, fontWeight: '800', marginTop: 18, marginBottom: 6 }, `h2-${i}`);
                }
                // #### Sub-subtítulo
                if (line.startsWith('#### ')) {
                    return renderInline(line.slice(5), { color: colors.subtext, fontSize: 14, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 12, marginBottom: 4 }, `h4-${i}`);
                }
                // ### Subtítulo
                if (line.startsWith('### ')) {
                    return renderInline(line.slice(4), { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 12, marginBottom: 4 }, `h3-${i}`);
                }
                // # Título grande
                if (line.startsWith('# ')) {
                    return renderInline(line.slice(2), { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 16, marginBottom: 8 }, `h1-${i}`);
                }
                // Listas (con indentación)
                const bulletMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
                if (bulletMatch) {
                    const indent = bulletMatch[1].length;
                    const content = bulletMatch[2];
                    return (
                        <View key={i} style={{ flexDirection: 'row', marginLeft: 4 + indent * 8, marginBottom: 4 }}>
                            <Text style={{ color: colors.tint, marginRight: 8, fontSize: 15, lineHeight: 22 }}>{indent > 0 ? '◦' : '•'}</Text>
                            {renderInline(content, { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 }, `li-${i}`)}
                        </View>
                    );
                }
                // Párrafo normal
                return renderInline(line, { color: colors.text, fontSize: 15, lineHeight: 23, marginBottom: 6 }, `p-${i}`);
            })}
        </View>
    );
}

export default function ResumenScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const cursoId = params.cursoId as string;
    const cursoNombre = params.cursoNombre as string || 'Resumen';
    const { colors, isDark } = useTheme();

    const [apuntes, setApuntes] = useState<any[]>([]);
    const [apunteSel, setApunteSel] = useState<any>(null);
    const [modo, setModo] = useState<'esquema' | 'completo'>('esquema');
    const [cargandoApuntes, setCargandoApuntes] = useState(true);
    const [generando, setGenerando] = useState(false);
    const [resumen, setResumen] = useState<string | null>(null);

    useEffect(() => { cargarApuntes(); }, []);

    // Al elegir PDF o modo, miramos si ya está guardado (carga instantánea)
    useEffect(() => {
        if (apunteSel) comprobarCache();
    }, [apunteSel, modo]);

    const cargarApuntes = async () => {
        try {
            const url = cursoId ? `/apuntes-curso/${cursoId}` : '/apuntes';
            const res = await api.get(url);
            setApuntes(res.data);
            if (res.data.length === 1) setApunteSel(res.data[0]);
        } catch {
            // silencioso
        } finally {
            setCargandoApuntes(false);
        }
    };

    const comprobarCache = async () => {
        setResumen(null);
        try {
            const res = await api.get(`/resumen/${apunteSel.id}?modo=${modo}`);
            if (res.data.cacheado && res.data.resumen) setResumen(res.data.resumen);
        } catch {
            // si falla, no hay caché
        }
    };

    const generar = async (forzar = false) => {
        if (!apunteSel) return;
        setGenerando(true);
        setResumen(null);
        try {
            const res = await api.post(`/generar-resumen/${apunteSel.id}?modo=${modo}${forzar ? '&forzar=true' : ''}`);
            setResumen(res.data.resumen);
        } catch (e: any) {
            const msg = e?.code === 'ECONNABORTED'
                ? 'Tardó demasiado. Vuelve a intentarlo (la segunda vez suele ir más rápido).'
                : (e?.response?.data?.detail || 'Inténtalo de nuevo.');
            setResumen(`⚠️ No se pudo generar el resumen.\n\n${msg}`);
        } finally {
            setGenerando(false);
        }
    };

    const volver = () => {
        if (router.canGoBack()) router.back();
        else router.replace({ pathname: '/curso/[id]', params: { id: cursoId, nombre: cursoNombre } });
    };

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            {/* CABECERA */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 50, paddingBottom: 15, paddingHorizontal: 20, backgroundColor: colors.card, gap: 10 }}>
                <TouchableOpacity onPress={volver} style={{ padding: 5 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, flex: 1 }} numberOfLines={1}>
                    Resumen · {cursoNombre}
                </Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
                {/* SELECTOR DE PDF (si hay varios) */}
                {apuntes.length > 1 && (
                    <>
                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginBottom: 10 }}>1. Elige el PDF</Text>
                        {apuntes.map(a => (
                            <TouchableOpacity key={a.id}
                                style={{
                                    flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginBottom: 8,
                                    backgroundColor: apunteSel?.id === a.id ? colors.tint + '22' : colors.card,
                                    borderWidth: 2, borderColor: apunteSel?.id === a.id ? colors.tint : colors.border,
                                }}
                                onPress={() => { setApunteSel(a); setResumen(null); }}
                            >
                                <Ionicons name="document-text" size={22} color={colors.tint} />
                                <Text style={{ color: colors.text, fontWeight: '600', flex: 1, marginLeft: 10 }} numberOfLines={1}>{a.nombre}</Text>
                                {apunteSel?.id === a.id && <Ionicons name="checkmark-circle" size={22} color={colors.tint} />}
                            </TouchableOpacity>
                        ))}
                    </>
                )}

                {cargandoApuntes ? (
                    <ActivityIndicator color={colors.tint} style={{ marginTop: 30 }} />
                ) : apuntes.length === 0 ? (
                    <View style={{ alignItems: 'center', marginTop: 40 }}>
                        <Ionicons name="document-outline" size={48} color={colors.subtext} />
                        <Text style={{ color: colors.subtext, marginTop: 12, textAlign: 'center' }}>
                            No hay PDFs en este curso todavía.
                        </Text>
                    </View>
                ) : (
                    <>
                        {/* SELECTOR DE MODO */}
                        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15, marginTop: apuntes.length > 1 ? 14 : 0, marginBottom: 10 }}>
                            {apuntes.length > 1 ? '2. ' : ''}Tipo de resumen
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                            <TouchableOpacity
                                style={{
                                    flex: 1, padding: 16, borderRadius: 16, alignItems: 'center',
                                    backgroundColor: modo === 'esquema' ? '#1CB0F6' : colors.card,
                                    borderWidth: 2, borderColor: modo === 'esquema' ? '#1CB0F6' : colors.border,
                                }}
                                onPress={() => { setModo('esquema'); setResumen(null); }}
                            >
                                <Ionicons name="list" size={26} color={modo === 'esquema' ? '#FFF' : colors.subtext} />
                                <Text style={{ color: modo === 'esquema' ? '#FFF' : colors.text, fontWeight: '800', marginTop: 6 }}>Esquema</Text>
                                <Text style={{ color: modo === 'esquema' ? 'rgba(255,255,255,0.85)' : colors.subtext, fontSize: 11, marginTop: 2, textAlign: 'center' }}>Puntos clave</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{
                                    flex: 1, padding: 16, borderRadius: 16, alignItems: 'center',
                                    backgroundColor: modo === 'completo' ? '#CE82FF' : colors.card,
                                    borderWidth: 2, borderColor: modo === 'completo' ? '#CE82FF' : colors.border,
                                }}
                                onPress={() => { setModo('completo'); setResumen(null); }}
                            >
                                <Ionicons name="book" size={26} color={modo === 'completo' ? '#FFF' : colors.subtext} />
                                <Text style={{ color: modo === 'completo' ? '#FFF' : colors.text, fontWeight: '800', marginTop: 6 }}>Explicado</Text>
                                <Text style={{ color: modo === 'completo' ? 'rgba(255,255,255,0.85)' : colors.subtext, fontSize: 11, marginTop: 2, textAlign: 'center' }}>Como un profe</Text>
                            </TouchableOpacity>
                        </View>

                        {/* BOTÓN GENERAR */}
                        {!resumen && (
                            <TouchableOpacity
                                style={{
                                    backgroundColor: apunteSel ? colors.tint : colors.border,
                                    borderRadius: 16, padding: 18, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10,
                                    borderBottomWidth: 4, borderBottomColor: apunteSel ? '#46A302' : colors.border,
                                }}
                                onPress={() => generar(false)}
                                disabled={!apunteSel || generando}
                            >
                                {generando ? (
                                    <ActivityIndicator color="#FFF" />
                                ) : (
                                    <>
                                        <Ionicons name="sparkles" size={20} color="#FFF" />
                                        <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 16 }}>Generar resumen</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}

                        {generando && (
                            <Text style={{ color: colors.subtext, textAlign: 'center', marginTop: 14 }}>
                                🧠 La IA está leyendo el PDF y resumiéndolo...
                            </Text>
                        )}

                        {/* RESULTADO */}
                        {resumen && (
                            <View style={{ marginTop: 8 }}>
                                <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 18 }}>
                                    <Markdown texto={resumen} colors={colors} />
                                </View>
                                <TouchableOpacity
                                    style={{ marginTop: 16, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                                    onPress={() => generar(true)}
                                >
                                    <Ionicons name="refresh" size={18} color={colors.tint} />
                                    <Text style={{ color: colors.tint, fontWeight: '700' }}>Regenerar</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </>
                )}
            </ScrollView>
        </View>
    );
}
