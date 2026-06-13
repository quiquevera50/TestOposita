# backend/database.py
import os
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Cargamos las variables del .env (para cuando pruebes en tu ordenador)
load_dotenv()

# Cogemos la URL de la base de datos de las variables de entorno
DB_URL = os.getenv("DATABASE_URL")

def get_db_connection():

    # Usamos RealDictCursor para que los resultados se lean como diccionarios igual que hacías con SQLite
    conn = psycopg2.connect(DB_URL)
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)

    # 1. USUARIOS 
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT NULL,
        xp INTEGER DEFAULT 0,      
        nivel INTEGER DEFAULT 1,
        energia INTEGER DEFAULT 5,   
        ultima_recarga TEXT,
        fases_superadas_reto INTEGER DEFAULT 0
    )''')
    
    # 2. CURSOS
    c.execute('''CREATE TABLE IF NOT EXISTS cursos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        icono TEXT DEFAULT 'book',
        color TEXT DEFAULT '#4f46e5',
        descripcion TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    )''')

    # 3. APUNTES
    c.execute('''CREATE TABLE IF NOT EXISTS apuntes (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        curso_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        ruta_archivo TEXT NOT NULL,
        categorias TEXT DEFAULT 'Test Rapido,Modo Reto,Examen Oficial',
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(curso_id) REFERENCES cursos(id) ON DELETE CASCADE
    )''')

    # 4. RESULTADOS
    c.execute('''CREATE TABLE IF NOT EXISTS resultados (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        curso_id INTEGER,
        aciertos INTEGER NOT NULL,
        total_preguntas INTEGER NOT NULL,
        contenido_json TEXT,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(curso_id) REFERENCES cursos(id)
    )''')

    # 5. RETOS
    c.execute('''CREATE TABLE IF NOT EXISTS retos (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        apunte_id INTEGER NOT NULL,
        nombre_reto TEXT NOT NULL,
        nivel_actual INTEGER DEFAULT 0, 
        contenido_json TEXT, 
        completado BOOLEAN DEFAULT FALSE,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(apunte_id) REFERENCES apuntes(id) ON DELETE CASCADE
    )''')

    # 6. NIVELES
    c.execute('''CREATE TABLE IF NOT EXISTS niveles (
        id SERIAL PRIMARY KEY,
        reto_id INTEGER NOT NULL,
        numero_nivel INTEGER NOT NULL,
        contenido_json TEXT,
        desbloqueado BOOLEAN DEFAULT FALSE,
        FOREIGN KEY(reto_id) REFERENCES retos(id) ON DELETE CASCADE
    )''')
    
    # 7. EXÁMENES EXTRAÍDOS
    c.execute('''CREATE TABLE IF NOT EXISTS examenes_oficiales (
        id SERIAL PRIMARY KEY,
        apunte_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        contenido_json TEXT, 
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(apunte_id) REFERENCES apuntes(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
     )''')

    # 8. SESIONES DE EXAMEN
    c.execute('''CREATE TABLE IF NOT EXISTS sesiones_examen_oficial (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        examen_id INTEGER NOT NULL, 
        indice_actual INTEGER DEFAULT 0,
        respuestas_usuario TEXT, 
        finalizado BOOLEAN DEFAULT FALSE,
        fecha_ultimo_cambio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(examen_id) REFERENCES examenes_oficiales(id) ON DELETE CASCADE
    )''')

    # 9. HISTORIAL EXÁMENES OFICIALES
    c.execute('''CREATE TABLE IF NOT EXISTS resultados_oficiales (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        examen_id INTEGER NOT NULL,
        aciertos INTEGER,
        total INTEGER,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(examen_id) REFERENCES examenes_oficiales(id)
    )''')

    # 10. TESTS GENERADOS
    c.execute('''CREATE TABLE IF NOT EXISTS tests_generados (
        id SERIAL PRIMARY KEY,
        apunte_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        nombre TEXT NOT NULL,
        cantidad_preguntas INTEGER,
        contenido_json TEXT,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(apunte_id) REFERENCES apuntes(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''')

    # 11. HISTORIAL TESTS
    c.execute('''CREATE TABLE IF NOT EXISTS historial_tests (
        id SERIAL PRIMARY KEY,
        test_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        aciertos INTEGER,
        total_preguntas INTEGER,
        preguntas_json TEXT, 
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(test_id) REFERENCES tests_generados(id) ON DELETE CASCADE
    )''')
    # 12. HISTORIAL DETALLADO DE FASES (Para filtros de tiempo)
    c.execute('''CREATE TABLE IF NOT EXISTS historial_fases_reto (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        reto_id INTEGER NOT NULL,
        numero_nivel INTEGER NOT NULL,
        fase INTEGER NOT NULL,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(reto_id) REFERENCES retos(id) ON DELETE CASCADE
    )''')
    conn.commit()
    c.close()
    conn.close()