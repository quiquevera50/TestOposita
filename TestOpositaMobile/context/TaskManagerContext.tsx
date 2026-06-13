import React, { createContext, useContext, useState } from 'react';
import api from '../app/api'; 

// Estructura de las notificaciones
interface Novedades {
  [cursoId: string]: {
    test?: boolean;
    reto?: boolean;
    oficial?: boolean; 
  };
}

interface NotificationPopup {
  visible: boolean;
  titulo: string;
  mensaje: string;
  ruta: string; 
  cursoId?: number;
}

interface TaskContextType {
  tareasTest: any;
  tareasReto: any;
  tareasOficial: any; 
  novedades: Novedades; 
  notificacion: NotificationPopup; 
  
  generarTestBackground: (cursoId: number, apunteId: number, cant: number, nombreCurso: string) => void;
  crearRetoBackground: (cursoId: number, apunteId: number, userId: string, nombreCurso: string) => void;
  analizarExamenBackground: (cursoId: number, apunteId: number, nombreCurso: string) => void; 
  
  limpiarTest: (key: string) => void;
  limpiarReto: (key: string) => void;
  limpiarOficial: (key: string) => void;
  
  cerrarNotificacion: () => void;
  marcarLeido: (cursoId: number, tipo: 'test' | 'reto' | 'oficial') => void; 
}

const TaskManagerContext = createContext<TaskContextType>({} as any);

export const TaskManagerProvider = ({ children }: { children: React.ReactNode }) => {
  const [tareasTest, setTareasTest] = useState<Record<string, any>>({});
  const [tareasReto, setTareasReto] = useState<Record<string, any>>({});
  const [tareasOficial, setTareasOficial] = useState<Record<string, any>>({}); 
  
  const [novedades, setNovedades] = useState<Novedades>({});
  const [notificacion, setNotificacion] = useState<NotificationPopup>({ 
    visible: false, titulo: '', mensaje: '', ruta: '' 
  });

  // --- ANALIZAR EXAMEN OFICIAL (CON NOTIFICACIÓN FLOTANTE ARRIBA) ---
  const analizarExamenBackground = async (cursoId: number, apunteId: number, nombreCurso: string) => {
    const key = cursoId ? cursoId.toString() : 'general';
    setTareasOficial(prev => ({ ...prev, [key]: { loading: true } }));

    try {
      // 👇 USAMOS 'api' Y QUITAMOS API_URL
      const res = await api.post(`/analizar-examen-oficial/${apunteId}`);
      
      if (res.data.status === "processing") {
        
        // 2. EL VIGILANTE (Pregunta cada 5 segundos)
        const intervaloId = setInterval(async () => {
            try {
                // 👇 USAMOS 'api'
                const check = await api.get(`/estado-examen-oficial/${apunteId}`);
                
                if (check.data.listo) {
                    clearInterval(intervaloId); // Paramos de buscar
                    setTareasOficial(prev => ({ ...prev, [key]: { loading: false } }));
                    
                    if (check.data.exito !== false) {
                        // 🎉 ÉXITO: AVISO ARRIBA (CLICKABLE)
                        activarNovedad(cursoId, 'oficial');
                        setNotificacion({
                            visible: true,
                            titulo: `✅ Examen Oficial Listo`,
                            mensaje: `Toca aquí para ir al examen de ${nombreCurso}.`,
                            ruta: `/examen?cursoId=${cursoId}&cursoNombre=${nombreCurso}`, // 👈 CORREGIDO
                            cursoId
                        });
                    } else {
                        // ❌ ERROR: AVISO ARRIBA
                        setNotificacion({
                            visible: true,
                            titulo: `⚠️ Documento No Apto`,
                            mensaje: check.data.motivo || "El PDF no es válido.",
                            ruta: `/examen?cursoId=${cursoId}&cursoNombre=${nombreCurso}`, // 👈 CORREGIDO,
                            cursoId
                        });
                    }
                }
            } catch (e) {
                console.log("Esperando a la IA...");
            }
        }, 5000);

      } else {
          // Si por lo que sea el examen ya estaba listo de antes
          setTareasOficial(prev => ({ ...prev, [key]: { loading: false } }));
          setNotificacion({
              visible: true,
              titulo: `✅ Examen Oficial Listo`,
              mensaje: `El test de ${nombreCurso} ya está disponible. Toca para jugar.`,
              ruta: `/oficial?cursoId=${cursoId}&cursoNombre=${nombreCurso}`,
              cursoId
          });
      }
    } catch (error) {
      setTareasOficial(prev => ({ ...prev, [key]: { loading: false } }));
    }
  };

  // --- GENERAR TEST ---
  const generarTestBackground = async (cursoId: number, apunteId: number, cant: number, nombreCurso: string) => {
    const key = cursoId ? cursoId.toString() : 'general';
    setTareasTest(prev => ({ ...prev, [key]: { loading: true, data: null } }));

    try {
      // 👇 USAMOS 'api'
      const res = await api.post(`/generar-test-biblioteca/${apunteId}`, null, { params: { cantidad: cant } });
      setTareasTest(prev => ({ ...prev, [key]: { loading: false, data: res.data } }));
      
      activarNovedad(cursoId, 'test');
      setNotificacion({
          visible: true,
          titulo: `✅ Test de ${nombreCurso} listo`,
          mensaje: "Toca para realizarlo ahora.",
          ruta: `/test?cursoId=${cursoId}&cursoNombre=${nombreCurso}`, // 👈 CORREGIDO
          cursoId
      });
    } catch (error) {
      setTareasTest(prev => ({ ...prev, [key]: { loading: false, error: "Error" } }));
    }
  };

  // --- CREAR RETO ---
  const crearRetoBackground = async (cursoId: number, apunteId: number, userId: string, nombreCurso: string) => {
    const key = cursoId ? cursoId.toString() : 'general';
    setTareasReto(prev => ({ ...prev, [key]: { loading: true } }));

    try {
      // 👇 USAMOS 'api'
      await api.post(`/crear-reto/${apunteId}`);
      setTareasReto(prev => ({ ...prev, [key]: { loading: false, data: true } }));
      
      activarNovedad(cursoId, 'reto');
      setNotificacion({
          visible: true,
          titulo: `🏆 Reto de ${nombreCurso} creado`,
          mensaje: "Tu plan de estudio te espera.",
          ruta: `/reto?cursoId=${cursoId}&cursoNombre=${nombreCurso}`, // 👈 CORREGIDO
          cursoId
      });
    } catch (error) {
      setTareasReto(prev => ({ ...prev, [key]: { loading: false, error: "Error" } }));
    }
  };

  // --- FUNCIONES AUXILIARES ---
  
  const activarNovedad = (cursoId: number, tipo: 'test' | 'reto' | 'oficial') => {
      const id = cursoId || 0;
      setNovedades(prev => ({
          ...prev,
          [id]: { ...prev[id], [tipo]: true }
      }));
  };

  const marcarLeido = (cursoId: number, tipo: 'test' | 'reto' | 'oficial') => {
      const id = cursoId || 0;
      setNovedades(prev => {
          const nuevo = { ...prev };
          if (nuevo[id]) {
              nuevo[id] = { ...nuevo[id], [tipo]: false };
          }
          return nuevo;
      });
  };

  const cerrarNotificacion = () => setNotificacion(prev => ({ ...prev, visible: false }));
  
  const limpiarTest = (key: string) => setTareasTest(p => { const n={...p}; delete n[key]; return n; });
  const limpiarReto = (key: string) => setTareasReto(p => { const n={...p}; delete n[key]; return n; });
  const limpiarOficial = (key: string) => setTareasOficial(p => { const n={...p}; delete n[key]; return n; });

  return (
    <TaskManagerContext.Provider value={{ 
        tareasTest, tareasReto, tareasOficial, novedades, notificacion,
        generarTestBackground, crearRetoBackground, analizarExamenBackground,
        limpiarTest, limpiarReto, limpiarOficial,
        cerrarNotificacion, marcarLeido 
    }}>
      {children}
    </TaskManagerContext.Provider>
  );
};

export const useTaskManager = () => useContext(TaskManagerContext);