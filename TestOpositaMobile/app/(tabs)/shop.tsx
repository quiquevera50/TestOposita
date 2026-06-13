import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../context/ThemeContext';
import { useEnergy } from '../../context/EnergyContext';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
export default function TiendaScreen() {
  const { colors, isDark } = useTheme();
  const { energia, comprarEnergia } = useEnergy();
  const [procesando, setProcesando] = useState<number | null>(null);

  // Función simulada de compra
  const handleCompra = async (cantidad: number, precio: string, idPack: number) => {
      console.log(`🛒 CLIC DETECTADO: Pack ${idPack} de ${cantidad}⚡`);

      const proceder = async () => {
          setProcesando(idPack);
          console.log("📡 Llamando al servidor...");
          
          try {
              const exito = await comprarEnergia(cantidad);
              if (exito) {
                  console.log("✅ Compra confirmada por el backend.");
                  if (Platform.OS === 'web') {
                      window.alert(`¡Compra completada! 🎉 Has recibido ${cantidad} rayos.`);
                  } else {
                      Alert.alert("¡Éxito!", `Has recibido ${cantidad} rayos.`);
                  }
              } else {
                  console.log("❌ El servidor no sumó la energía.");
                  if (Platform.OS === 'web') window.alert("Error al procesar la compra.");
                  else Alert.alert("Error", "No se pudo procesar la compra.");
              }
          } catch (err) {
              console.log("💥 Error crítico:", err);
          } finally {
              setProcesando(null);
          }
      };

      const mensaje = `¿Quieres simular la compra de ${cantidad}⚡ por ${precio}?`;

      // 🌐 Si estamos en ordenador (Web)
      if (Platform.OS === 'web') {
          const confirmar = window.confirm(mensaje);
          if (confirmar) {
              proceder();
          } else {
              console.log("Cancelado en web");
          }
      } 
      // 📱 Si estamos en la App Móvil
      else {
          Alert.alert(
              "Confirmar Compra",
              mensaje,
              [
                  { text: "Cancelar", style: "cancel", onPress: () => console.log("Cancelado en móvil") },
                  { text: "Comprar", onPress: proceder }
              ]
          );
      }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* CABECERA */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: isDark ? 1 : 0 }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Tienda 🛒</Text>
        
        {/* Píldora de saldo actual */}
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#334155' : '#eef2ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 18, marginRight: 5 }}>⚡</Text>
            <Text style={{ fontWeight: 'bold', color: colors.text }}>{energia} {energia <= 5 ? '/ 5' : ''}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        
        <Text style={{color: colors.subtext, marginBottom: 25, textAlign: 'center', fontSize: 15}}>
            Recarga tu energía para seguir generando exámenes y jugando retos. ¡Al comprar, puedes superar el límite de 5 rayos!
        </Text>

        {/* ===================================== */}
        {/* PACK 1: RECARGA RÁPIDA (+5) */}
        {/* ===================================== */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.iconContainer}>
                <Ionicons name="flash" size={40} color={colors.tint} />
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={[styles.title, { color: colors.text }]}>Recarga Rápida</Text>
                <Text style={{ color: colors.subtext, fontSize: 13, marginBottom: 8 }}>+5 Rayos de energía</Text>
                <TouchableOpacity 
                    style={[styles.buyBtn, { backgroundColor: colors.tint }]}
                    onPress={() => handleCompra(5, "0,99 €", 1)}
                    disabled={procesando !== null}
                >
                    {procesando === 1 ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.buyText}>0,99 €</Text>}
                </TouchableOpacity>
            </View>
        </View>

        {/* ===================================== */}
        {/* PACK 2: EL OPOSITOR (+15) - MÁS POPULAR */}
        {/* ===================================== */}
        <View style={[styles.card, { backgroundColor: isDark ? '#4c1d95' : '#ede9fe', borderColor: '#8b5cf6', borderWidth: 2 }]}>
            <View style={{ position: 'absolute', top: -12, right: 20, backgroundColor: '#8b5cf6', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 }}>
                <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase' }}>Más Popular</Text>
            </View>
            
            <View style={styles.iconContainer}>
                <Text style={{fontSize: 40}}>⚡</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 15 }}>
                <Text style={[styles.title, { color: isDark ? 'white' : '#4c1d95' }]}>Pack Opositor</Text>
                <Text style={{ color: isDark ? '#ddd' : '#6d28d9', fontSize: 13, marginBottom: 8 }}>+15 Rayos de energía</Text>
                <TouchableOpacity 
                    style={[styles.buyBtn, { backgroundColor: '#8b5cf6' }]}
                    onPress={() => handleCompra(15, "1,99 €", 2)}
                    disabled={procesando !== null}
                >
                    {procesando === 2 ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.buyText}>1,99 €</Text>}
                </TouchableOpacity>
            </View>
        </View>

        {/* ===================================== */}
        {/* ZONA GRATUITA (ANUNCIOS) */}
        {/* ===================================== */}
        <View style={{ marginTop: 20, marginBottom: 30 }}>
            <Text style={{ fontWeight: 'bold', color: colors.text, marginBottom: 15, fontSize: 18 }}>Zona Gratuita</Text>
            <TouchableOpacity 
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                    Alert.alert("Ver Anuncio", "Aquí se cargará un vídeo de Google AdMob. Al terminar, te sumaremos +1 rayo. (En desarrollo)");
                }}
            >
                <Ionicons name="play-circle" size={40} color={colors.success} />
                <View style={{ flex: 1, marginLeft: 15 }}>
                    <Text style={[styles.title, { color: colors.text }]}>Ver Anuncio</Text>
                    <Text style={{ color: colors.success, fontWeight: 'bold', fontSize: 13 }}>+1 Rayo gratis</Text>
                </View>
            </TouchableOpacity>
        </View>

        {/* ===================================== */}
        {/* SUSCRIPCIÓN PREMIUM (EL SANTO GRIAL) */}
        {/* ===================================== */}
        <View style={[styles.premiumCard, { backgroundColor: isDark ? '#1e293b' : '#0f172a' }]}>
            <Ionicons name="diamond" size={50} color="#FFD700" style={{ marginBottom: 10 }} />
            <Text style={{ color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 10 }}>Oposita Premium</Text>
            <Text style={{ color: '#cbd5e1', textAlign: 'center', marginBottom: 20, lineHeight: 22 }}>
                Desbloquea todo el potencial de la IA. {"\n"}
                <Text style={{color: '#FFD700', fontWeight: 'bold'}}>Energía infinita ♾️</Text>, sin anuncios y con prioridad en los servidores.
            </Text>
            <TouchableOpacity 
                style={{ backgroundColor: '#FFD700', paddingVertical: 15, paddingHorizontal: 40, borderRadius: 30, width: '100%', alignItems: 'center' }}
                onPress={() => Alert.alert("Próximamente", "El sistema de suscripciones está en construcción.")}
            >
                <Text style={{ color: '#0f172a', fontWeight: 'bold', fontSize: 16 }}>Suscribirse (4,99 €/mes)</Text>
            </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 4, zIndex: 10 },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  card: { flexDirection: 'row', padding: 20, borderRadius: 20, marginBottom: 20, alignItems: 'center', borderWidth: 1, elevation: 2 },
  iconContainer: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 2 },
  buyBtn: { paddingVertical: 8, paddingHorizontal: 15, borderRadius: 12, alignSelf: 'flex-start', elevation: 1 },
  buyText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  premiumCard: { padding: 30, borderRadius: 25, alignItems: 'center', elevation: 5, borderWidth: 1, borderColor: '#334155' }
});