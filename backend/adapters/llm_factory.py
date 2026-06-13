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
        """
        Inicializa la pool de adaptadores de forma diferida (lazy loading)
        para evitar problemas de importación circular.
        """
        if not cls._adapters_pool:
            # Importamos aquí para asegurar que los adaptadores se cargan correctamente
            from adapters.gemini_adapter import GeminiAdapter
            from adapters.groq_adapter import GroqAdapter
            
            cls._gemini = GeminiAdapter()
            cls._groq = GroqAdapter()
            
            # De momento solo metemos a Gemini en la piscina
            cls._adapters_pool = [cls._gemini ,cls._groq ]
            cls._round_robin_cycle = itertools.cycle(cls._adapters_pool)

    @classmethod
    def get_fallback_sequence(cls) -> list[LLMAdapter]:
        """
        Devuelve la lista de adaptadores disponibles en orden de preferencia.
        Ideal para iterar: Si el primero falla, probamos con el segundo.
        """
        cls._initialize_pool()
        return cls._adapters_pool