import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import api from '../app/api'; // Ajusta la ruta a tu api.ts si la tienes en otro sitio
import AsyncStorage from '@react-native-async-storage/async-storage';

interface EnergyContextProps {
    energia: number;
    segundosRestantes: number;
    fetchEnergia: () => Promise<void>;
    consumirEnergia: () => Promise<boolean>;
    comprarEnergia: (cantidad: number) => Promise<boolean>;
}

const EnergyContext = createContext<EnergyContextProps>({} as EnergyContextProps);

export const EnergyProvider = ({ children }: { children: ReactNode }) => {
    const [energia, setEnergia] = useState<number>(5);
    const [segundosRestantes, setSegundosRestantes] = useState<number>(0);

    // 1. Preguntamos al servidor cuánta energía tenemos
    const fetchEnergia = async () => {
        try {
            const userId = await AsyncStorage.getItem('user_id');
            if (!userId) return;
            const res = await api.get('/energia');
            setEnergia(res.data.energia);
            setSegundosRestantes(res.data.segundos_restantes);
        } catch (error) {
            console.log("Error al sincronizar energía", error);
        }
    };

    // 2. Cobrar un rayo para poder jugar
    const consumirEnergia = async (): Promise<boolean> => {
        try {
            const res = await api.post('/consumir-energia');
            setEnergia(res.data.energia_restante);
            
            // Si nos quedamos con 4 (y el reloj estaba parado), empezamos la cuenta atrás de 1 hora
            if (res.data.energia_restante === 4) {
                setSegundosRestantes(3600);
            }
            return true;
        } catch (error) {
            console.log("Error al consumir energía (Posible trampa o sin saldo)", error);
            return false;
        }
    };
    // 3. Comprar/Añadir energía desde la Tienda
    const comprarEnergia = async (cantidad: number): Promise<boolean> => {
        try {
            const res = await api.post(`/comprar-energia/${cantidad}`);
            setEnergia(res.data.energia); // Actualizamos al instante (ej: 15/5)
            return true;
        } catch (error) {
            console.log("Error al comprar energía", error);
            return false;
        }
    };

    // Al abrir la app, cargamos la energía
    useEffect(() => {
        fetchEnergia();
    }, []);

    // ⏱️ EL RELOJ MAESTRO
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        
        if (segundosRestantes > 0) {
            interval = setInterval(() => {
                setSegundosRestantes((prev) => {
                    if (prev <= 1) {
                        // Cuando el reloj llega a 0, pedimos al servidor que valide la recarga
                        fetchEnergia(); 
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000); // Se actualiza cada segundo
        }
        
        return () => clearInterval(interval);
    }, [segundosRestantes]);

    return (
        <EnergyContext.Provider value={{ energia, segundosRestantes, fetchEnergia, consumirEnergia, comprarEnergia }}>
            {children}
        </EnergyContext.Provider>
    );
};

// Hook personalizado para usarlo rápido en cualquier pantalla
export const useEnergy = () => useContext(EnergyContext);