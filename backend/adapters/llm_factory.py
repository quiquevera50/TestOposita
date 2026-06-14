from abc import ABC, abstractmethod
import itertools
import logging


# ==========================================
# 1. LA INTERFAZ (El Contrato Asíncrono)
# ==========================================
class LLMAdapter(ABC):
    """
    Contrato que obliga a todos los adaptadores (Gemini, OpenAI, Claude)
    a tener exactamente los mismos métodos asíncronos con los mismos nombres
    que ya tienes en tu gemini_adapter.py.
    """
    
    @abstractmethod
    async def generar_mapa_retos(self, file_obj) -> list:
        pass

    @abstractmethod
    async def generar_nivel_reto(self, file_obj, tema_nivel: str, dificultad: str = "medio") -> list:
        pass

    @abstractmethod
    async def generar_test_biblioteca(self, file_obj, cantidad: int = 10) -> list:
        pass

    @abstractmethod
    async def analizar_pdf_examen_real(self, file_obj) -> dict:
        pass

# ==========================================
# 2. LA FACTORÍA (El Enrutador Inteligente)
# ==========================================
class AIFactory:
    """
    Factoría encargada de instanciar y proveer el adaptador adecuado.
    """
    _adapters_pool = []
    _round_robin_cycle = None

    @classmethod
    def _initialize_pool(cls):
        if not cls._adapters_pool:
            adapters = []
            try:
                from adapters.gemini_adapter import GeminiAdapter
                adapters.append(GeminiAdapter())
            except Exception as e:
                logging.warning(f"GeminiAdapter no disponible: {e}")
            try:
                from adapters.groq_adapter import GroqAdapter
                adapters.append(GroqAdapter())
            except Exception as e:
                logging.warning(f"GroqAdapter no disponible: {e}")

            if not adapters:
                raise RuntimeError("No hay ningún adaptador de IA disponible")

            cls._adapters_pool = adapters
            cls._round_robin_cycle = itertools.cycle(cls._adapters_pool)

    @classmethod
    def get_fallback_sequence(cls) -> list[LLMAdapter]:
        """
        Devuelve la lista de adaptadores disponibles en orden de preferencia.
        Ideal para iterar: Si el primero falla, probamos con el segundo.
        """
        cls._initialize_pool()
        return cls._adapters_pool