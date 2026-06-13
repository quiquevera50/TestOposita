import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
// 👇 1. Importamos el gancho del tema
import { useTheme } from '../context/ThemeContext'; 

interface NivelBarProps {
  nivel: number;
  xpActual: number;
}

export const NivelBar = ({ nivel, xpActual }: NivelBarProps) => {
  // 👇 2. Sacamos los colores actuales
  const { colors, isDark } = useTheme();

  const xpParaSiguiente = Math.floor(nivel * 100 * 1.2);
  const porcentaje = Math.min(100, Math.max(0, (xpActual / xpParaSiguiente) * 100));
  
  let rango = "Aspirante Novato 🟦";
  if (nivel >= 5) rango = "Interino en Prácticas 🟩";
  if (nivel >= 10) rango = "Funcionario de Carrera 🟨";
  if (nivel >= 20) rango = "Jefe de Sección 🟧";
  if (nivel >= 50) rango = "Ministro Supremo 👑";

  return (
    // 👇 3. Fondo dinámico (Card) y Borde sutil
    <View style={[
        styles.container, 
        { 
            backgroundColor: colors.card,
            borderColor: colors.border,
            borderWidth: 1
        }
    ]}>
      <View style={styles.header}>
        <View style={styles.badgeNivel}>
            <Text style={styles.txtNivel}>{nivel}</Text>
        </View>
        <View style={{flex:1, marginLeft: 10}}>
            {/* 👇 Texto dinámico */}
            <Text style={[styles.txtRango, { color: colors.text }]}>{rango}</Text>
            
            <View style={{flexDirection:'row', justifyContent:'space-between'}}>
                {/* 👇 Quitamos "Meta", dejamos solo los números limpios y en color suave */}
                <Text style={{ color: colors.subtext, fontSize: 12, fontWeight: '600' }}>
                    {xpActual} / {xpParaSiguiente} XP
                </Text>
                <Text style={{ color: colors.tint, fontSize: 12, fontWeight: 'bold' }}>
                    {Math.round(porcentaje)}%
                </Text>
            </View>
        </View>
      </View>

      {/* 👇 Barra de fondo más oscura en modo noche */}
      <View style={[
          styles.barraFondo, 
          { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6' }
      ]}>
        {/* Barra de relleno usando el color principal (tint) */}
        <View style={[styles.barraRelleno, { width: `${porcentaje}%`, backgroundColor: colors.tint }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    padding: 15, 
    borderRadius: 16, 
    marginBottom: 20, 
    // Sombra suave solo en modo claro (en oscuro apenas se ve)
    shadowColor: '#000', 
    shadowOpacity: 0.1, 
    shadowRadius: 4,
    elevation: 2 
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  badgeNivel: { backgroundColor: '#4f46e5', width: 45, height: 45, borderRadius: 25, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  txtNivel: { color: 'white', fontWeight: 'bold', fontSize: 18 },
  txtRango: { fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  
  barraFondo: { height: 10, borderRadius: 6, overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: 6 }
});