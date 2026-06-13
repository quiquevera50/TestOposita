# backend/models.py
from pydantic import BaseModel

class UserAuth(BaseModel):
    username: str 
    password: str
    email: str = None 
    

# Modelo para guardar el test general
class ResultadoTest(BaseModel):
    user_id: int
    curso_id: int = None  
    aciertos: int
    total_preguntas: int
    preguntas: list
    tipo: str = "test_rapido"
    nombre_referencia: str = "General"


# 👇 ESTE ES EL NUEVO MODELO PARA LOS TESTS GUARDADOS EN CARPETAS
class ResultadoTestEspecifico(BaseModel):
    user_id: int
    test_id: int
    aciertos: int
    total_preguntas: int
    preguntas: list  # <--- Aquí es donde viajan tus aciertos y errores marcados


# Modelo para enviar los datos del perfil al móvil
class UserProfile(BaseModel):
    id: int
    email: str
    xp: int
    nivel: int
    
    class Config:
        from_attributes = True # Esto permite leer desde la base de datos SQL