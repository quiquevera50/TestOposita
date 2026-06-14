import os
import shutil
import json
import hashlib
import requests
from psycopg2.extras import RealDictCursor
import uuid
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.staticfiles import StaticFiles 
from contextlib import asynccontextmanager
from passlib.context import CryptContext  # type: ignore
from pydantic import BaseModel

# --- NUEVAS IMPORTACIONES ---
from database import init_db, get_db_connection
from models import UserAuth, ResultadoTest, UserProfile, ResultadoTestEspecifico
from pydantic import BaseModel
from adapters.llm_factory import AIFactory
from supabase import create_client, Client
import jwt


# ==========================================
# CARGAMOS LAS VARIABLES DE ENTORNO
# ==========================================

load_dotenv()
SECRET_KEY = os.getenv("JWT_SECRET", "mi_clave_de_desarrollo_insegura")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") # Usa la Service Role Key para tener permisos de escritura
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
ALGORITHM = "HS256"
security = HTTPBearer()
def crear_token(user_id: int):
    # El token caducará en 30 días
    expiracion = datetime.now(timezone.utc) + timedelta(days=30)
    # Metemos el ID del usuario dentro del token de forma segura
    payload = {"sub": str(user_id), "exp": expiracion}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verificar_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        # Intentamos abrir el "billete" con nuestra contraseña secreta
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload.get("sub")) # Devolvemos el ID real del usuario
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado. Vuelve a iniciar sesión.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token falso o inválido.")


# --- CONFIGURACIÓN ---

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db() # Llamada limpia al nuevo módulo
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- HELPER AUTH ---
def verify_password(plain, hashed): return pwd_context.verify(plain, hashed)
def get_hash(password): return pwd_context.hash(password)

# ==========================================
# MOTOR DE ENERGÍA (ANTI-TRAMPAS)
# ==========================================
def sincronizar_energia(user_id: int, conn):
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT energia, ultima_recarga FROM users WHERE id = %s", (user_id,))
    row = cursor.fetchone()

    if not row: return 0, None

    # Accesos seguros (por si es tupla o diccionario)
    energia = row['energia'] 
    ultima_recarga_str = row['ultima_recarga']

    # Si la energía es None (usuario antiguo antes de la actualización), lo inicializamos
    if energia is None: energia = 5

    now = datetime.now(timezone.utc)

    # Si es su primera vez o estaba al máximo, inicializamos la fecha
    if ultima_recarga_str is None:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE users SET energia = 5, ultima_recarga = %s WHERE id = %s", (now.isoformat(), user_id))
        conn.commit()
        return 5, now

    ultima_recarga = datetime.fromisoformat(ultima_recarga_str)

    # Solo calculamos recarga si tiene menos del máximo (5)
    if energia < 5:
        delta = now - ultima_recarga
        horas_pasadas = int(delta.total_seconds() // 3600) # 1 hora = 3600 segundos

        if horas_pasadas > 0:
            # Sumamos las horas pasadas (sin pasarnos de 5)
            nueva_energia = min(5, energia + horas_pasadas)
            
            # MAGIA: Avanzamos el reloj exactamente las horas que hemos cobrado.
            # Así, si han pasado 1h y 15 min, le damos 1 rayo y le conservamos los 15 min de ventaja.
            nueva_fecha = ultima_recarga + timedelta(hours=horas_pasadas)

            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("UPDATE users SET energia = %s, ultima_recarga = %s WHERE id = %s",
                         (nueva_energia, nueva_fecha.isoformat(), user_id))
            conn.commit()
            return nueva_energia, nueva_fecha

    return energia, ultima_recarga
# ==========================================
# RUTAS (Ahora usando get_db_connection)
# ==========================================
@app.get("/")
def home():
    return {"status": "ok", "message": "¡Servidor de TestOposita funcionando en Render!"}

@app.post("/register")
def register(user: UserAuth):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        # 👇 Ahora forzamos a que nazcan con Nivel 1, 0 XP, 5 de Energía y el reloj en hora
        fecha_ahora = datetime.now(timezone.utc).isoformat()
        cursor.execute("""
            INSERT INTO users (username, password_hash, email, nivel, xp, energia, ultima_recarga) 
            VALUES (%s, %s, %s, %s, %s, %s, %s)
        """, (user.username, get_hash(user.password), user.email, 1, 0, 5, fecha_ahora))
        conn.commit()
    except Exception:
        raise HTTPException(400, "El usuario ya existe")
    finally:
        conn.close()
    return {"mensaje": "Usuario creado con estadísticas iniciales"}

@app.post("/login")
def login(user: UserAuth):
    conn = get_db_connection()
    # 👇 AÑADIMOS xp y nivel AL SELECT
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id, password_hash, avatar, xp, nivel FROM users WHERE username = %s", 
                       (user.username,))
    res = cursor.fetchone()
    conn.close()
    
    if not res or not verify_password(user.password, res['password_hash']):
        raise HTTPException(400, "Credenciales inválidas")
    token_seguro = crear_token(res['id'])
    return {
        "token": token_seguro,
        "user_id": res['id'], 
        "username": user.username, 
        "avatar": res['avatar'],
        "xp": res['xp'],       # 👈 Nuevo
        "nivel": res['nivel']  # 👈 Nuevo
    }

@app.get("/usuario")
def obtener_usuario(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    # 👇 AÑADIMOS xp y nivel AL SELECT
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT username, avatar, xp, nivel FROM users WHERE id = %s", (user_id,))
    res = cursor.fetchone()
    conn.close()
    
    if res: 
        return {
            "username": res['username'], 
            "avatar": res['avatar'],
            "xp": res['xp'],
            "nivel": res['nivel']
        }
        
    # Lanzamos un error HTTP real. Esto hará que React Native reciba un 404 y active el 'catch'.
    raise HTTPException(status_code=404, detail="Usuario no encontrado")

@app.delete("/eliminar-cuenta")
def eliminar_cuenta_total(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)
    
    # 1. 🔥 Borrar AVATAR de Supabase Storage 🔥
    c.execute("SELECT avatar FROM users WHERE id = %s", (user_id,))
    res = c.fetchone()
    if res and res['avatar']:
        avatar_url = res['avatar']
        # Solo intentamos borrar si la URL es de Supabase
        if "supabase.co" in avatar_url:
            try:
                # Extraemos el nombre del archivo (ej: user_1_abc.jpg)
                nombre_en_storage = avatar_url.split("/avatars/")[1]
                supabase.storage.from_("avatars").remove([nombre_en_storage])
                print(f"🗑️ Avatar borrado de la nube: {nombre_en_storage}")
            except Exception as e:
                print(f"⚠️ No se pudo borrar el avatar de la nube: {e}")
        
    # 2. 🔥 Borrar todos los PDFs del usuario de Supabase Storage 🔥
    c.execute("SELECT ruta_archivo FROM apuntes WHERE user_id = %s", (user_id,))
    apuntes = c.fetchall()
    for row in apuntes:
        url_archivo = row['ruta_archivo']
        if url_archivo and "supabase.co" in url_archivo:
            try:
                # Extraemos el nombre del archivo (ej: user_1/uuid.pdf)
                nombre_en_storage = url_archivo.split("/pdfs/")[1]
                supabase.storage.from_("pdfs").remove([nombre_en_storage])
                print(f"🗑️ PDF borrado de la nube: {nombre_en_storage}")
            except Exception as e:
                print(f"⚠️ No se pudo borrar el PDF {url_archivo}: {e}")
        
    # 3. Borrar Datos de la Base de Datos (Cascada manual)
    # Nota: El orden importa para no romper claves foráneas
    c.execute("DELETE FROM resultados WHERE user_id = %s", (user_id,))
    c.execute("DELETE FROM historial_tests WHERE user_id = %s", (user_id,))
    c.execute("DELETE FROM niveles WHERE reto_id IN (SELECT id FROM retos WHERE user_id = %s)", (user_id,))
    c.execute("DELETE FROM retos WHERE user_id = %s", (user_id,))
    c.execute("DELETE FROM examenes_oficiales WHERE user_id = %s", (user_id,))
    c.execute("DELETE FROM apuntes WHERE user_id = %s", (user_id,))
    c.execute("DELETE FROM cursos WHERE user_id = %s", (user_id,))
    c.execute("DELETE FROM users WHERE id = %s", (user_id,))
    
    conn.commit()
    conn.close()
    return {"mensaje": "Cuenta y todos sus archivos en la nube eliminados correctamente"}

@app.post("/subir-avatar")
async def subir_avatar(file: UploadFile = File(...), user_id: int = Depends(verificar_token)):
    nombre_nube = f"user_{user_id}_{uuid.uuid4().hex}.jpg"
    
    try:
        contenido = await file.read()

        # 🔥 LA MAGIA DIRECTA 🔥
        base_url = SUPABASE_URL.rstrip('/')
        url_subida = f"{base_url}/storage/v1/object/avatars/{nombre_nube}"
        
        headers = {
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": "image/jpeg",
            "x-upsert": "true"
        }
        
        respuesta = requests.post(url_subida, headers=headers, data=contenido)
        
        if respuesta.status_code != 200:
            print(f"❌ ERROR REAL DE SUPABASE: {respuesta.status_code} - {respuesta.text}")
            raise HTTPException(500, f"Error subiendo foto: {respuesta.text}")

        # Guardamos URL en BD
        avatar_url = f"{base_url}/storage/v1/object/public/avatars/{nombre_nube}"
        
        conn = get_db_connection()
        c = conn.cursor(cursor_factory=RealDictCursor)
        c.execute("UPDATE users SET avatar = %s WHERE id = %s", (avatar_url, user_id))
        conn.commit()
        conn.close()
        
        return {"mensaje": "Foto de perfil actualizada", "avatar_url": avatar_url}
    except Exception as e:
        print(f"Error crítico subiendo avatar: {e}")
        raise HTTPException(500, "No se pudo actualizar la foto de perfil")
# --- ENDPOINT PARA GANAR EXPERIENCIA ---

@app.post("/sumar-xp/{cantidad}")
def sumar_xp(cantidad: int, user_id: int = Depends(verificar_token)):
    # Usamos get_db_connection() que es lo que tú tienes configurado
    conn = get_db_connection() 
    try:
        # 1. Obtenemos XP y Nivel actuales
        # row_factory ya debería estar configurado en database.py, pero por si acaso accedemos por índice si falla
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT xp, nivel FROM users WHERE id = %s", (user_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(404, "Usuario no encontrado")
            
        # Acceso seguro a los datos (funciona tanto si es diccionario como tupla)
        xp_actual = row['xp'] 
        nivel_actual = row['nivel'] 
        
        # 2. Sumamos XP
        xp_nueva = xp_actual + cantidad
        
        # 3. Calculamos si sube de nivel
        # Fórmula: Siguiente nivel cuesta (Nivel * 100 * 1.2)
        xp_necesaria = int(nivel_actual * 100 * 1.2)
        subido = False
        
        # Bucle por si gana tanta XP que sube varios niveles de golpe
        while xp_nueva >= xp_necesaria:
            # Opción RPG clásica: Reseteamos la barra al subir (La XP sobrante se queda para el siguiente)
            xp_nueva -= xp_necesaria 
            nivel_actual += 1
            xp_necesaria = int(nivel_actual * 100 * 1.2)
            subido = True
            
        # 4. Guardamos en BD
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE users SET xp = %s, nivel = %s WHERE id = %s", (xp_nueva, nivel_actual, user_id))
        conn.commit()
        
        return {
            "nuevo_nivel": nivel_actual, 
            "xp_actual": xp_nueva, 
            "xp_siguiente": xp_necesaria,
            "subido": subido
        }
        
    except Exception as e:
        print(f"Error sumando XP: {e}")
        # Importante: HTTPException necesita ser importado de fastapi
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# --- ENDPOINTS DE ENERGÍA ---

@app.get("/energia")
def obtener_energia(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        energia, ultima_recarga = sincronizar_energia(user_id, conn)
        
        segundos_restantes = 0
        if energia < 5 and ultima_recarga:
            # Calculamos cuántos segundos faltan para que se cumpla la SIGUIENTE hora
            proxima_recarga = ultima_recarga + timedelta(hours=1)
            delta = proxima_recarga - datetime.now(timezone.utc)
            segundos_restantes = max(0, int(delta.total_seconds()))

        return {
            "energia": energia, 
            "segundos_restantes": segundos_restantes
        }
    finally:
        conn.close()


@app.post("/consumir-energia")
def consumir_energia(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        energia, ultima_recarga = sincronizar_energia(user_id, conn)
        
        if energia >= 1:
            nueva_energia = energia - 1
            fecha_update = ultima_recarga
            
            # Si estaba al máximo de energía y gasta una, el reloj de 1 hora empieza EXACTAMENTE AHORA
            if energia == 5:
                fecha_update = datetime.now(timezone.utc)
                
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("UPDATE users SET energia = %s, ultima_recarga = %s WHERE id = %s", 
                         (nueva_energia, fecha_update.isoformat(), user_id))
            conn.commit()
            return {"status": "ok", "energia_restante": nueva_energia}
        else:
            raise HTTPException(400, "¡Te has quedado sin energía!")
    finally:
        conn.close()
@app.post("/comprar-energia/{cantidad}")
def comprar_energia(cantidad: int, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        # 1. Sincronizamos primero para tener la energía real
        energia, ultima_recarga = sincronizar_energia(user_id, conn)
        
        # 2. Sumamos la comprada (rompiendo el límite de 5)
        nueva_energia = energia + cantidad
        
        # 3. Guardamos sin tocar la fecha de ultima_recarga (para no fastidiarle el reloj si estaba a punto de ganar una gratis)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE users SET energia = %s WHERE id = %s", (nueva_energia, user_id))
        conn.commit()
        
        return {"status": "ok", "energia": nueva_energia}
    finally:
        conn.close()

# ==========================================
# 💎 ECONOMÍA UNIFICADA (vidas, rubíes, racha, estrellas, xp)
# ==========================================

@app.get("/economia")
def obtener_economia(user_id: int = Depends(verificar_token)):
    """Una sola llamada que devuelve TODA la economía del usuario."""
    conn = get_db_connection()
    try:
        # Vidas (energía) — usamos la lógica de recarga ya existente
        vidas, ultima_recarga = sincronizar_energia(user_id, conn)
        segundos_restantes = 0
        if vidas < 5 and ultima_recarga:
            proxima = ultima_recarga + timedelta(hours=1)
            segundos_restantes = max(0, int((proxima - datetime.now(timezone.utc)).total_seconds()))

        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT xp, nivel, rubies, racha_dias FROM users WHERE id = %s", (user_id,))
        u = cursor.fetchone()
        if not u:
            raise HTTPException(404, "Usuario no encontrado")

        # Estrellas totales = suma de estrellas de todos los niveles de los retos del usuario
        cursor.execute("""
            SELECT COALESCE(SUM(n.estrellas), 0) AS total
            FROM niveles n
            JOIN retos r ON n.reto_id = r.id
            WHERE r.user_id = %s
        """, (user_id,))
        estrellas_totales = cursor.fetchone()['total']

        xp_siguiente = int(u['nivel'] * 100 * 1.2)

        return {
            "vidas": vidas,
            "vidas_max": 5,
            "segundos_restantes": segundos_restantes,
            "rubies": u['rubies'] or 0,
            "racha_dias": u['racha_dias'] or 0,
            "estrellas_totales": estrellas_totales,
            "xp": u['xp'] or 0,
            "nivel": u['nivel'] or 1,
            "xp_siguiente": xp_siguiente,
        }
    finally:
        conn.close()


@app.post("/registrar-actividad")
def registrar_actividad(user_id: int = Depends(verificar_token)):
    """Actualiza la racha diaria. Se llama al completar una lección."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT racha_dias, ultima_actividad FROM users WHERE id = %s", (user_id,))
        u = cursor.fetchone()

        hoy = datetime.now(timezone.utc).date()
        ultima = u['ultima_actividad']
        racha = u['racha_dias'] or 0
        incrementada = False

        if ultima == hoy:
            pass  # Ya contó hoy, no cambia
        elif ultima == hoy - timedelta(days=1):
            racha += 1  # Día consecutivo
            incrementada = True
        else:
            racha = 1  # Primera vez o se rompió la racha
            incrementada = True

        cursor.execute("UPDATE users SET racha_dias = %s, ultima_actividad = %s WHERE id = %s",
                       (racha, hoy, user_id))
        conn.commit()
        return {"racha_dias": racha, "incrementada": incrementada}
    finally:
        conn.close()


@app.post("/ganar-rubies/{cantidad}")
def ganar_rubies(cantidad: int, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE users SET rubies = COALESCE(rubies,0) + %s WHERE id = %s RETURNING rubies",
                       (cantidad, user_id))
        nuevos = cursor.fetchone()['rubies']
        conn.commit()
        return {"status": "ok", "rubies": nuevos}
    finally:
        conn.close()


@app.post("/gastar-rubies/{cantidad}")
def gastar_rubies(cantidad: int, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT rubies FROM users WHERE id = %s", (user_id,))
        actuales = cursor.fetchone()['rubies'] or 0
        if actuales < cantidad:
            raise HTTPException(400, "No tienes suficientes rubíes")
        cursor.execute("UPDATE users SET rubies = rubies - %s WHERE id = %s RETURNING rubies",
                       (cantidad, user_id))
        nuevos = cursor.fetchone()['rubies']
        conn.commit()
        return {"status": "ok", "rubies": nuevos}
    finally:
        conn.close()


@app.post("/guardar-estrellas/{reto_id}/{numero_nivel}/{estrellas}")
def guardar_estrellas(reto_id: int, numero_nivel: int, estrellas: int, user_id: int = Depends(verificar_token)):
    """Guarda las estrellas de un nivel (solo si mejora el récord anterior)."""
    if estrellas < 0 or estrellas > 3:
        raise HTTPException(400, "Las estrellas deben estar entre 0 y 3")
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        # Verificar que el reto es del usuario
        cursor.execute("SELECT id FROM retos WHERE id = %s AND user_id = %s", (reto_id, user_id))
        if not cursor.fetchone():
            raise HTTPException(403, "Reto no encontrado")

        cursor.execute("SELECT id, estrellas FROM niveles WHERE reto_id = %s AND numero_nivel = %s",
                       (reto_id, numero_nivel))
        nivel = cursor.fetchone()

        rubies_ganados = 0
        if nivel:
            anterior = nivel['estrellas'] or 0
            if estrellas > anterior:
                cursor.execute("UPDATE niveles SET estrellas = %s WHERE id = %s", (estrellas, nivel['id']))
                # Bonus: +5 rubíes la primera vez que se logran 3 estrellas
                if estrellas == 3 and anterior < 3:
                    rubies_ganados = 5
        else:
            cursor.execute("INSERT INTO niveles (reto_id, numero_nivel, estrellas, desbloqueado) VALUES (%s, %s, %s, TRUE)",
                           (reto_id, numero_nivel, estrellas))
            if estrellas == 3:
                rubies_ganados = 5

        if rubies_ganados:
            cursor.execute("UPDATE users SET rubies = COALESCE(rubies,0) + %s WHERE id = %s",
                           (rubies_ganados, user_id))
        conn.commit()
        return {"status": "ok", "estrellas": estrellas, "rubies_ganados": rubies_ganados}
    finally:
        conn.close()


# METODOS PARA CREAR CURSOS Y VINCULAR APUNTES A CURSOS

# Modelo para crear curso
class CursoCreate(BaseModel):
    user_id: int
    nombre: str
    icono: str = "book"
    color: str = "#4f46e5"

# 1. CREAR CURSO
@app.post("/crear-curso")
def crear_curso(curso: CursoCreate):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            "INSERT INTO cursos (user_id, nombre, icono, color) VALUES (%s, %s, %s, %s) RETURNING id",
            (curso.user_id, curso.nombre, curso.icono, curso.color)
            )
        nuevo_id = cursor.fetchone()['id']
        conn.commit()
        return {"id": nuevo_id, "mensaje": "Curso creado"}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()
 
# 2. ELIMINAR CURSO   
@app.delete("/cursos/{curso_id}")
def borrar_curso(curso_id: int):
    conn = get_db_connection()
    try:
        # 1. Comprobamos que el curso existe
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM cursos WHERE id = %s", (curso_id,))
        curso = cursor.fetchone()
        if not curso:
            raise HTTPException(status_code=404, detail="Curso no encontrado")

        # 2. Buscamos los apuntes de este curso
        cursor.execute("SELECT id, ruta_archivo FROM apuntes WHERE curso_id = %s", (curso_id,))
        apuntes = cursor.fetchall()
        
        c = conn.cursor()
        for apunte in apuntes:
            # A) Borrar de Supabase
            url_archivo = apunte['ruta_archivo'] 
            if url_archivo and "supabase.co" in url_archivo:
                try:
                    nombre_en_storage = url_archivo.split("/pdfs/")[1]
                    # Aquí usamos el bypass por seguridad
                    base_url = SUPABASE_URL.replace("/rest/v1", "").rstrip('/')
                    url_borrado = f"{base_url}/storage/v1/object/pdfs/{nombre_en_storage}"
                    headers = {"Authorization": f"Bearer {SUPABASE_KEY}", "apikey": SUPABASE_KEY}
                    requests.delete(url_borrado, headers=headers)
                    print(f"🗑️ Archivo eliminado de la nube: {nombre_en_storage}")
                except Exception as e:
                    print(f"⚠️ No se pudo borrar de Supabase {url_archivo}: {e}")
            
            # B) Borrar dependencias (Retos, Tests, Exámenes)
            apunte_id = apunte['id']
            c.execute("DELETE FROM niveles WHERE reto_id IN (SELECT id FROM retos WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM retos WHERE apunte_id = %s", (apunte_id,))
            c.execute("DELETE FROM historial_tests WHERE test_id IN (SELECT id FROM tests_generados WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM tests_generados WHERE apunte_id = %s", (apunte_id,))
            c.execute("DELETE FROM resultados_oficiales WHERE examen_id IN (SELECT id FROM examenes_oficiales WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM sesiones_examen_oficial WHERE examen_id IN (SELECT id FROM examenes_oficiales WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM examenes_oficiales WHERE apunte_id = %s", (apunte_id,))

        # 3. Borramos los apuntes y finalmente el curso
        c.execute("DELETE FROM apuntes WHERE curso_id = %s", (curso_id,))
        c.execute("DELETE FROM cursos WHERE id = %s", (curso_id,))
        conn.commit()
        
        return {"mensaje": "Curso y TODO su contenido eliminado correctamente"}
    finally:
        conn.close()      
# 3. LISTAR CURSOS
@app.get("/cursos")
def listar_cursos(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        # Recuperamos cursos y contamos cuántos apuntes tiene cada uno
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT c.*, COUNT(a.id) as total_apuntes 
            FROM cursos c 
            LEFT JOIN apuntes a ON a.curso_id = c.id 
            WHERE c.user_id = %s 
            GROUP BY c.id
        """, (user_id,))
        cursos = cursor.fetchall()
        return [dict(row) for row in cursos]
    finally:
        conn.close()

# 4. LISTAR RETOS DE UN CURSO CONCRETO
@app.get("/retos-curso/{curso_id}")
def listar_retos_curso(curso_id: int):
    conn = get_db_connection()
    try:
        # Hacemos un JOIN para sacar solo los retos cuyos apuntes pertenezcan al curso X
        query = """
            SELECT r.id, r.nombre_reto, r.nivel_actual, r.completado, r.contenido_json 
            FROM retos r
            JOIN apuntes a ON r.apunte_id = a.id
            WHERE a.curso_id = %s
            ORDER BY r.id DESC
        """
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(query, (curso_id,))
        retos = cursor.fetchall()
        return [dict(row) for row in retos]
    finally:
        conn.close()


# --- SUBIR APUNTE A UN CURSO ---
@app.post("/subir-apunte")
async def subir_apunte_biblioteca(
    user_id: int = Depends(verificar_token), 
    curso_id: int = Form(...),
    categorias: str = Form("Test Rapido,Modo Reto,Examen Oficial"),
    file: UploadFile = File(...)
):
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(400, "Solo se permiten archivos PDF")

    try:
        nombre_seguro = f"user_{user_id}/{uuid.uuid4().hex}.pdf"
        contenido = await file.read()

        # 🔥 LA MAGIA: Nos saltamos la librería de Supabase y subimos directamente 🔥
        base_url = SUPABASE_URL.rstrip('/') # Quitamos la barra final por si acaso
        url_subida = f"{base_url}/storage/v1/object/pdfs/{nombre_seguro}"
        
        headers = {
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "apikey": SUPABASE_KEY,
            "Content-Type": "application/pdf",
            "x-upsert": "true" # Fuerza a sobrescribir si hay error
        }
        
        print(f"🚀 Intentando subida directa a la nube...")
        respuesta = requests.post(url_subida, headers=headers, data=contenido)
        
        # Si Supabase nos da error, ahora SÍ lo veremos de verdad
        if respuesta.status_code != 200:
            print(f"❌ ERROR REAL DE SUPABASE: {respuesta.status_code} - {respuesta.text}")
            raise HTTPException(500, f"Error en la nube: {respuesta.text}")
            
        print("✅ Subida directa exitosa")

        # 3. Guardar URL pública en BD
        res_url = f"{base_url}/storage/v1/object/public/pdfs/{nombre_seguro}"
        
        conn = get_db_connection()
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(
            "INSERT INTO apuntes (user_id, curso_id, nombre, ruta_archivo, categorias) VALUES (%s, %s, %s, %s, %s) RETURNING id",
            (user_id, curso_id, file.filename, res_url, categorias)
        )
        apunte_id = cursor.fetchone()['id']
        conn.commit()
        conn.close()
        return {"mensaje": "Apunte guardado en la nube correctamente", "apunte_id": apunte_id}
    except Exception as e:
        print(f"❌ Error crítico subiendo a Supabase: {e}")
        raise HTTPException(500, "Error interno del servidor")
    
class QuitarCategoriaReq(BaseModel):
    categoria: str

@app.post("/quitar-categoria/{apunte_id}")
def quitar_categoria(apunte_id: int, req: QuitarCategoriaReq, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        # 1. Buscamos las categorías actuales de ese apunte
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT categorias FROM apuntes WHERE id = %s AND user_id = %s", (apunte_id, user_id))
        apunte = cursor.fetchone()
        if apunte and apunte['categorias']:
            # 2. Separamos el texto por comas para hacer una lista
            categorias_lista = apunte['categorias'].split(',')
            
            # 3. Si la categoría "Examen Oficial" está en la lista, la eliminamos
            if req.categoria in categorias_lista:
                categorias_lista.remove(req.categoria)
                nuevas_categorias = ','.join(categorias_lista)
                
                # 4. Guardamos la nueva lista en la base de datos
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("UPDATE apuntes SET categorias = %s WHERE id = %s", (nuevas_categorias, apunte_id))
                conn.commit()
                
        return {"status": "ok"}
    finally:
        conn.close()
# --- LISTAR APUNTES ---
@app.get("/apuntes-curso/{curso_id}")
def listar_apuntes_curso(curso_id: int):
    conn = get_db_connection()
    # 👈 Añadimos 'categorias' al SELECT
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT id, nombre, ruta_archivo, categorias FROM apuntes WHERE curso_id = %s ORDER BY id DESC", (curso_id,))
    items = cursor.fetchall()
    conn.close()
    return [dict(row) for row in items]


# ==========================================
# RUTAS DE BIBLIOTECA
# ==========================================

@app.get("/apuntes")
def listar_apuntes(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)
    c.execute("SELECT id, nombre, ruta_archivo FROM apuntes WHERE user_id = %s ORDER BY id DESC", (user_id,))
    items = [{"id": row['id'], "nombre": row['nombre'], "ruta": row['ruta_archivo']} for row in c.fetchall()]
    conn.close()
    return items

@app.delete("/apuntes/{apunte_id}")
def borrar_apunte(apunte_id: int, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT ruta_archivo FROM apuntes WHERE id = %s AND user_id = %s", (apunte_id, user_id))
        res = cursor.fetchone()
        
        if res:
            url_archivo = res['ruta_archivo']
            
            # 1. 🔥 BORRADO EN CASCADA MANUAL (Evita errores de PostgreSQL) 🔥
            c = conn.cursor()
            # Borramos dependencias de Retos
            c.execute("DELETE FROM niveles WHERE reto_id IN (SELECT id FROM retos WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM retos WHERE apunte_id = %s", (apunte_id,))
            
            # Borramos dependencias de Tests Rápidos
            c.execute("DELETE FROM historial_tests WHERE test_id IN (SELECT id FROM tests_generados WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM tests_generados WHERE apunte_id = %s", (apunte_id,))
            
            # Borramos dependencias de Exámenes Oficiales
            c.execute("DELETE FROM resultados_oficiales WHERE examen_id IN (SELECT id FROM examenes_oficiales WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM sesiones_examen_oficial WHERE examen_id IN (SELECT id FROM examenes_oficiales WHERE apunte_id = %s)", (apunte_id,))
            c.execute("DELETE FROM examenes_oficiales WHERE apunte_id = %s", (apunte_id,))
            
            # 2. Borramos finalmente el apunte
            c.execute("DELETE FROM apuntes WHERE id = %s", (apunte_id,))
            
            # 3. Borramos el PDF de Supabase (Usando BYPASS para evitar bugs)
            if url_archivo and "supabase.co" in url_archivo:
                try:
                    nombre_en_storage = url_archivo.split("/pdfs/")[1]
                    base_url = SUPABASE_URL.replace("/rest/v1", "").rstrip('/')
                    url_borrado = f"{base_url}/storage/v1/object/pdfs/{nombre_en_storage}"
                    headers = {
                        "Authorization": f"Bearer {SUPABASE_KEY}",
                        "apikey": SUPABASE_KEY
                    }
                    requests.delete(url_borrado, headers=headers)
                except Exception as e:
                    print(f"⚠️ Error borrando de Supabase: {e}")

            conn.commit()
            return {"mensaje": "Apunte y todo su contenido eliminado correctamente"}
        
        raise HTTPException(404, "Apunte no encontrado")
    except Exception as e:
        print(f"❌ Error al borrar apunte: {e}")
        raise HTTPException(500, f"Error interno: {e}")
    finally:
        conn.close()
# ==========================================
# RUTAS DE TEST RAPIDO
# ==========================================

@app.post("/generar-test-biblioteca/{apunte_id}")
async def generar_test_id(apunte_id: int, cantidad: int = 10):
    # 1. Obtenemos datos del apunte (AHORA TAMBIÉN PEDIMOS EL user_id)
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT ruta_archivo, nombre, user_id FROM apuntes WHERE id = %s", (apunte_id,))
        apunte = cursor.fetchone()
    finally:
        conn.close()
        
    if not apunte: raise HTTPException(404, "Apunte no encontrado")
    
    class FakeUploadFile:
        def __init__(self, path): self.path = path

    ias_disponibles = AIFactory.get_fallback_sequence()
    
    # 🔄 BUCLE DE CASCADA REAL
    for ia in ias_disponibles:
        try:
            resultado = await ia.generar_test_biblioteca(FakeUploadFile(apunte['ruta_archivo']), cantidad)
        
            # Solo seguimos si realmente hay preguntas
            if resultado and len(resultado) > 0:
                print(f"✅ Éxito usando {ia.__class__.__name__}")
                
                # --- NUEVO: GUARDAR EL TEST EN BASE DE DATOS ---
                c2 = get_db_connection()
                try:
                    # Contamos cuántos tests tiene ya para llamarlo "Test 1", "Test 2", etc.
                    cursor2 = c2.cursor(cursor_factory=RealDictCursor)
                    cursor2.execute("SELECT COUNT(*) FROM tests_generados WHERE apunte_id = %s", (apunte_id,))
                    count = cursor2.fetchone()['count']
                    nombre_test = f"Test {count + 1}"
                    
                    user_id = apunte['user_id']
                    
                    cursor = c2.cursor(cursor_factory=RealDictCursor)
                    cursor.execute("INSERT INTO tests_generados (apunte_id, user_id, nombre, cantidad_preguntas, contenido_json) VALUES (%s, %s, %s, %s, %s) RETURNING id", (apunte_id, user_id, nombre_test, len(resultado), json.dumps(resultado)))
                    c2.commit()
                    test_id = cursor.fetchone()['id']
                finally:
                    c2.close()
                # --------------------------------------------
                
                # Devolvemos el ID y las preguntas juntas
                return {"test_id": test_id, "preguntas": resultado}
                
            else:
                print(f"⚠️ {ia.__class__.__name__} devolvió vacío. Saltando a la siguiente IA...")
                continue
                
        except Exception as e:
            print(f"⚠️ Error en {ia.__class__.__name__}: {e}. Saltando a la siguiente IA...")
            continue
            
    # 💥 Si el bucle termina y llegamos aquí, TODAS las IAs fallaron
    print("❌ ERROR CRÍTICO: Ninguna IA pudo generar el test.")
    raise HTTPException(503, "Todos los servicios de IA están saturados. Inténtalo más tarde.")


# ==========================================
# 📄 RESUMEN IA DEL PDF (esquema / completo)
# ==========================================
@app.get("/resumen/{apunte_id}")
def obtener_resumen_cache(apunte_id: int, modo: str = "esquema", user_id: int = Depends(verificar_token)):
    """Devuelve el resumen guardado si existe (carga instantánea)."""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT r.contenido FROM resumenes r
            JOIN apuntes a ON r.apunte_id = a.id
            WHERE r.apunte_id = %s AND r.modo = %s AND a.user_id = %s
        """, (apunte_id, modo, user_id))
        row = cursor.fetchone()
        if row:
            return {"resumen": row['contenido'], "modo": modo, "cacheado": True}
        return {"resumen": None, "modo": modo, "cacheado": False}
    finally:
        conn.close()


@app.post("/generar-resumen/{apunte_id}")
async def generar_resumen_pdf(apunte_id: int, modo: str = "esquema", forzar: bool = False, user_id: int = Depends(verificar_token)):
    if modo not in ("esquema", "completo"):
        raise HTTPException(400, "Modo inválido (usa 'esquema' o 'completo')")

    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT ruta_archivo, nombre FROM apuntes WHERE id = %s AND user_id = %s",
                       (apunte_id, user_id))
        apunte = cursor.fetchone()
        # Si ya existe en caché y no se fuerza, lo devolvemos al instante
        if not forzar:
            cursor.execute("SELECT contenido FROM resumenes WHERE apunte_id = %s AND modo = %s", (apunte_id, modo))
            cache = cursor.fetchone()
            if cache and cache['contenido']:
                return {"resumen": cache['contenido'], "modo": modo, "nombre": apunte['nombre'] if apunte else "", "cacheado": True}
    finally:
        conn.close()

    if not apunte:
        raise HTTPException(404, "Apunte no encontrado")

    class FakeUploadFile:
        def __init__(self, path): self.path = path

    for ia in AIFactory.get_fallback_sequence():
        if not hasattr(ia, "generar_resumen"):
            continue
        try:
            texto = await ia.generar_resumen(FakeUploadFile(apunte['ruta_archivo']), modo)
            if texto and len(texto.strip()) > 0:
                # Guardar en caché (upsert)
                c2 = get_db_connection()
                try:
                    cur2 = c2.cursor()
                    cur2.execute("""
                        INSERT INTO resumenes (apunte_id, modo, contenido) VALUES (%s, %s, %s)
                        ON CONFLICT (apunte_id, modo) DO UPDATE SET contenido = EXCLUDED.contenido, fecha = CURRENT_TIMESTAMP
                    """, (apunte_id, modo, texto))
                    c2.commit()
                finally:
                    c2.close()
                return {"resumen": texto, "modo": modo, "nombre": apunte['nombre'], "cacheado": False}
        except Exception as e:
            print(f"⚠️ Error resumen en {ia.__class__.__name__}: {e}")
            continue

    raise HTTPException(503, "No se pudo generar el resumen. Inténtalo más tarde.")


# ==========================================
# ❌ BANCO DE FALLOS (preguntas falladas para reentrenar)
# ==========================================
def _hash_pregunta(p: dict) -> str:
    """Hash estable del texto de la pregunta (para deduplicar)."""
    texto = (p.get("Pregunta") or p.get("pregunta") or "").strip().lower()
    return hashlib.md5(texto.encode("utf-8")).hexdigest()


@app.post("/registrar-fallos")
def registrar_fallos(datos: dict, user_id: int = Depends(verificar_token)):
    """Guarda preguntas falladas. Si ya existían, suma +1 a veces_fallada."""
    curso_id = datos.get("curso_id")
    preguntas = datos.get("preguntas", []) or []
    if not preguntas:
        return {"status": "ok", "guardados": 0}

    conn = get_db_connection()
    try:
        cur = conn.cursor()
        guardados = 0
        for p in preguntas:
            h = _hash_pregunta(p)
            if not h:
                continue
            cur.execute("""
                INSERT INTO fallos (user_id, curso_id, pregunta_json, hash)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (user_id, curso_id, hash)
                DO UPDATE SET veces_fallada = fallos.veces_fallada + 1, fecha = CURRENT_TIMESTAMP
            """, (user_id, curso_id, json.dumps(p), h))
            guardados += 1
        conn.commit()
        return {"status": "ok", "guardados": guardados}
    finally:
        conn.close()


@app.get("/fallos/{curso_id}")
def obtener_fallos(curso_id: int, user_id: int = Depends(verificar_token)):
    """Devuelve las preguntas falladas de un curso (para el Modo Fallos)."""
    conn = get_db_connection()
    try:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute("""
            SELECT pregunta_json, veces_fallada FROM fallos
            WHERE user_id = %s AND curso_id = %s
            ORDER BY veces_fallada DESC, fecha DESC
        """, (user_id, curso_id))
        rows = cur.fetchall()
        preguntas = []
        for r in rows:
            try:
                preguntas.append(json.loads(r['pregunta_json']))
            except Exception:
                continue
        return {"total": len(preguntas), "preguntas": preguntas}
    finally:
        conn.close()


@app.delete("/fallos/{curso_id}")
def limpiar_fallos(curso_id: int, user_id: int = Depends(verificar_token)):
    """Vacía el banco de fallos de un curso."""
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM fallos WHERE user_id = %s AND curso_id = %s", (user_id, curso_id))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


@app.post("/superar-fallo")
def superar_fallo(datos: dict, user_id: int = Depends(verificar_token)):
    """Elimina una pregunta del banco (acertada en Modo Fallos = dominada)."""
    curso_id = datos.get("curso_id")
    pregunta = datos.get("pregunta")
    h = _hash_pregunta(pregunta) if pregunta else datos.get("hash")
    if not h:
        return {"status": "ok"}
    conn = get_db_connection()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM fallos WHERE user_id = %s AND curso_id = %s AND hash = %s",
                    (user_id, curso_id, h))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


@app.post("/guardar-resultado-test")
def guardar_resultado_test_especifico(datos: dict): 
    conn = get_db_connection()
    try:
        # Extraemos los datos manualmente del diccionario
        test_id = datos.get("test_id")
        user_id = datos.get("user_id")
        aciertos = datos.get("aciertos", 0)
        total_preguntas = datos.get("total_preguntas", 0)
        preguntas = datos.get("preguntas", [])
        
        preguntas_str = json.dumps(preguntas)
        
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            INSERT INTO historial_tests (test_id, user_id, aciertos, total_preguntas, preguntas_json) 
            VALUES (%s, %s, %s, %s, %s)
        """, (test_id, user_id, aciertos, total_preguntas, preguntas_str))
        conn.commit()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()

@app.get("/historial-test/{test_id}")
def ver_historial_test_especifico(test_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, aciertos, total_preguntas, fecha, preguntas_json 
            FROM historial_tests 
            WHERE test_id = %s 
            ORDER BY fecha DESC
        """, (test_id,))
        historial = cursor.fetchall()
        return [dict(h) for h in historial]
    finally:
        conn.close()
# 3. La ruta para que el móvil pueda leer los tests de cada PDF
@app.get("/tests-apunte/{apunte_id}")
def listar_tests_apunte(apunte_id: int):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, nombre, cantidad_preguntas, fecha_creacion, contenido_json 
            FROM tests_generados 
            WHERE apunte_id = %s 
            ORDER BY id ASC
        """, (apunte_id,))
        tests = cursor.fetchall()
        return [dict(t) for t in tests]
    finally:
        conn.close()
        
# AÑADIMOS {curso_id} A LA RUTA
@app.get("/carpetas-tests/{curso_id}")
def obtener_carpetas_tests(curso_id: int, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        # 🔥 AHORA FILTRAMOS POR CURSO ID 🔥
        cursor.execute("""
            SELECT DISTINCT a.id, a.nombre
            FROM apuntes a
            JOIN tests_generados t ON a.id = t.apunte_id
            WHERE a.user_id = %s AND a.curso_id = %s
        """, (user_id, curso_id))
        apuntes_con_tests = cursor.fetchall()
        
        resultado = []
        for a in apuntes_con_tests:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, nombre, cantidad_preguntas, fecha_creacion, contenido_json 
                FROM tests_generados 
                WHERE apunte_id = %s 
                ORDER BY id ASC
            """, (a['id'],))
            tests = cursor.fetchall()

            resultado.append({
                "apunte_id": a['id'],
                "apunte_nombre": a['nombre'],
                "tests": [dict(t) for t in tests]
            })
            
        return resultado
    finally:
        conn.close()
# ==========================================
# RUTAS DE EXAMEN OFICIAL)
# ==========================================

# 1. Definimos la tarea que correrá en el fondo
async def tarea_analizar_examen_fondo(apunte_id: int, user_id: int, nombre: str, ruta_pdf: str):
    print(f"🕵️ IA en 2º plano: Analizando examen oficial {nombre}...")
    try:
        class FileObj: path = ruta_pdf
        resultado = None
        
        # 👇 NUEVA LÓGICA DE FACTORÍA 👇
        ias_disponibles = AIFactory.get_fallback_sequence()
        for ia in ias_disponibles:
            try:
                resultado = await ia.analizar_pdf_examen_real(FileObj())
                break # Si tiene éxito, salimos del bucle
            except Exception as e:
                print(f"⚠️ Fallo en {ia.__class__.__name__}: {e}. Pasando al siguiente...")
                continue
                
        if not resultado:
            raise Exception("Todas las IAs fallaron al analizar el examen.")
        
        # 🔍 Imprimimos lo que dice la IA para poder investigar si falla
        print(f"🔍 Respuesta IA cruda: {str(resultado)[:200]}...")

        conn = get_db_connection()
        
        # ANTI-BUGS: Convertimos todas las claves a minúsculas
        res_limpio = {k.lower(): v for k, v in resultado.items()} if isinstance(resultado, dict) else {}
        
        es_apto = res_limpio.get("apto", False)
        preguntas = res_limpio.get("preguntas", [])
        motivo = res_limpio.get("motivo", "El documento no parece ser un examen válido.")

        # IGNORAMOS el campo "es_apto". Si la lista de preguntas tiene algo, lo damos por bueno.
        if isinstance(preguntas, list) and len(preguntas) > 0:
            # ✅ ÉXITO REAL
            preguntas_json = json.dumps(preguntas)
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                INSERT INTO examenes_oficiales (apunte_id, user_id, nombre, contenido_json)
                VALUES (%s, %s, %s, %s)
            """, (apunte_id, user_id, nombre, preguntas_json))
            print(f"✅ Examen guardado correctamente. ({len(preguntas)} preguntas encontradas) IGNORANDO apto={es_apto}")
        else:
            # ❌ RECHAZO REAL (La IA no encontró ni una sola pregunta)
            error_json = json.dumps({"error": True, "motivo": motivo})
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                INSERT INTO examenes_oficiales (apunte_id, user_id, nombre, contenido_json)
                VALUES (%s, %s, %s, %s)
            """, (apunte_id, user_id, nombre, error_json))
            print(f"❌ Examen rechazado (0 preguntas extraídas): {motivo}")

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"❌ Error crítico en tarea de fondo: {e}")
        # Guardamos el error del sistema para que no se quede girando la app
        conn = get_db_connection()
        error_json = json.dumps({"error": True, "motivo": f"Fallo técnico del servidor: {str(e)}"})
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("INSERT INTO examenes_oficiales (apunte_id, user_id, nombre, contenido_json) VALUES (%s, %s, %s, %s)", (apunte_id, user_id, nombre, error_json))
        conn.commit()
        conn.close()

# 2. Modificamos el endpoint para usar BackgroundTasks
@app.post("/analizar-examen-oficial/{apunte_id}")
async def analizar_examen_oficial(apunte_id: int, background_tasks: BackgroundTasks):
    print(f"📡 PETICIÓN RECIBIDA: Analizar examen oficial para apunte_id {apunte_id}") # 👈 Chivato
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id, contenido_json FROM examenes_oficiales WHERE apunte_id = %s", (apunte_id,))
        existe = cursor.fetchone()
        
        if existe:
            contenido = json.loads(existe['contenido_json'])
            if isinstance(contenido, dict) and contenido.get("error"):
                print(f"🗑️ Borrando examen oficial fallido anterior (ID: {existe['id']})") # 👈 Chivato
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("DELETE FROM examenes_oficiales WHERE id = %s", (existe['id'],))
                conn.commit()
            else:
                return {"status": "ready", "message": "Ya disponible"}
                
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT ruta_archivo, nombre, user_id FROM apuntes WHERE id = %s", (apunte_id,))
        res = cursor.fetchone()
        
        if not res:
            print("❌ ERROR: Apunte no encontrado en BD") # 👈 Chivato
            raise HTTPException(404, "Apunte no encontrado")

        print("✅ Apunte encontrado. Lanzando tarea en segundo plano...") # 👈 Chivato
        background_tasks.add_task(
            tarea_analizar_examen_fondo, 
            apunte_id, res['user_id'], res['nombre'], res['ruta_archivo']
        )
        
        return {"status": "processing", "message": "Análisis iniciado en 2º plano"}
    except Exception as e:
         print(f"❌ ERROR EN RUTA ANALIZAR: {e}")
         raise HTTPException(500, str(e))
    finally:
        conn.close()


# --- HISTORIAL EXCLUSIVO DE EXÁMENES OFICIALES ---
@app.get("/historial-oficial")
def obtener_historial_oficial(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    # Seleccionamos con fetchall para que devuelva una lista, aunque esté vacía []
    cursor.execute("""
        SELECT h.id, h.aciertos, h.total, h.fecha, e.nombre as nombre_examen
        FROM resultados_oficiales h
        JOIN examenes_oficiales e ON h.examen_id = e.id
        WHERE h.user_id = %s 
        ORDER BY h.fecha DESC
    """, (user_id,))
    
    # fetchall() siempre devuelve una lista (vacía si no hay nada), así no explota
    res = cursor.fetchall() 
    conn.close()
    
    return [dict(row) for row in res]
@app.post("/entregar-examen-oficial")
def entregar_examen_oficial(datos: dict):
    sesion_id = datos.get('sesionId')
    user_id = datos.get('user_id')
    
    conn = get_db_connection()
    try:
        # 1. Obtener las respuestas que el usuario ha ido guardando
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT examen_id, respuestas_usuario FROM sesiones_examen_oficial WHERE id = %s", (sesion_id,))
        sesion = cursor.fetchone()
        if not sesion:
            raise HTTPException(404, "Sesión no encontrada")
            
        examen_id = sesion['examen_id']
        respuestas_usuario = json.loads(sesion['respuestas_usuario']) if sesion['respuestas_usuario'] else {}
        
        # 2. Obtener las preguntas originales para ver cuál era la correcta
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT contenido_json FROM examenes_oficiales WHERE id = %s", (examen_id,))
        examen = cursor.fetchone()
        preguntas = json.loads(examen['contenido_json'])
        
        # 3. Corregir el examen
        aciertos = 0
        total = len(preguntas)
        
        for i, preg in enumerate(preguntas):
            idx_str = str(i) # En JSON las claves numéricas se vuelven texto
            
            # Soportamos la clave "Indice_correcta" o "respuesta_correcta"
            correcta = preg.get("Indice_correcta") if "Indice_correcta" in preg else preg.get("respuesta_correcta")
            
            # Si el usuario respondió a esta pregunta y es igual a la correcta
            if idx_str in respuestas_usuario:
                if respuestas_usuario[idx_str] == correcta:
                    aciertos += 1
                    
        # 4. Guardar en la tabla del historial
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            INSERT INTO resultados_oficiales (user_id, examen_id, aciertos, total)
            VALUES (%s, %s, %s, %s)
        """, (user_id, examen_id, aciertos, total))
        
        # 5. Marcar la sesión como finalizada para que empiece de cero la próxima vez
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE sesiones_examen_oficial SET finalizado = TRUE WHERE id = %s", (sesion_id,))
        
        conn.commit()
        return {"aciertos": aciertos, "total": total}
    finally:
        conn.close()
# --- GUARDAR PROGRESO (Para dejar a medias) ---
@app.post("/guardar-progreso-oficial")
def guardar_progreso(datos: dict):
    conn = get_db_connection()
    # Guardamos en qué pregunta va y qué ha respondido
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("""
        UPDATE sesiones_examen_oficial 
        SET indice_actual = %s, respuestas_usuario = %s, fecha_ultimo_cambio = CURRENT_TIMESTAMP
        WHERE id = %s
    """, (datos['indice'], json.dumps(datos['respuestas']), datos['sesionId']))
    conn.commit()
    conn.close()
    return {"status": "progreso guardado"}

@app.get("/iniciar-sesion-oficial/{apunte_id}")
def iniciar_sesion_oficial(apunte_id: int, user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        # 1. Buscamos el examen extraído
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT id, contenido_json, nombre FROM examenes_oficiales WHERE apunte_id = %s", (apunte_id,))
        examen = cursor.fetchone()
        if not examen:
            raise HTTPException(404, "El examen aún no ha sido procesado por la IA.")

        contenido = json.loads(examen['contenido_json'])

        # 👇 NUEVA DEFENSA: ¿La IA dijo que no era apto%s 👇
        if isinstance(contenido, dict) and contenido.get("error"):
            # Lo borramos de la base de datos para que el usuario pueda intentar subir otro en el futuro
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("DELETE FROM examenes_oficiales WHERE id = %s", (examen['id'],))
            conn.commit()
            # Le disparamos el error a la app (Código 400)
            raise HTTPException(400, contenido.get("motivo", "Documento rechazado."))

        examen_id = examen['id']

        # 2. Buscamos si hay una sesión a medias (finalizado = 0)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, indice_actual, respuestas_usuario 
            FROM sesiones_examen_oficial 
            WHERE examen_id = %s AND user_id = %s AND finalizado = FALSE
        """, (examen_id, user_id))
        sesion = cursor.fetchone()
        if not sesion:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("INSERT INTO sesiones_examen_oficial (user_id, examen_id, respuestas_usuario) VALUES (%s, %s, '{}') RETURNING id", (user_id, examen_id))
            sesion_id = cursor.fetchone()['id']
            conn.commit()
            indice = 0
            respuestas = {}
        else:
            sesion_id = sesion['id']
            indice = sesion['indice_actual']
            respuestas = json.loads(sesion['respuestas_usuario']) if sesion['respuestas_usuario'] else {}

        return {
            "sesionId": sesion_id,
            "nombre_examen": examen['nombre'],
            "indice_actual": indice,
            "respuestas_usuario": respuestas,
            "preguntas": contenido # Ya sabemos que aquí hay preguntas válidas
        }
    finally:
        conn.close()

@app.get("/estado-examen-oficial/{apunte_id}")
def estado_examen_oficial(apunte_id: int):
    conn = get_db_connection()
    try:
        # Buscamos si ya existe el registro (sea éxito o error)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT contenido_json FROM examenes_oficiales WHERE apunte_id = %s", (apunte_id,))
        examen = cursor.fetchone()
        if examen:
            contenido = json.loads(examen['contenido_json'])
            # Comprobamos si es el JSON de error que creamos
            if isinstance(contenido, dict) and contenido.get("error"):
                return {"listo": True, "exito": False, "motivo": contenido.get("motivo")}
            else:
                # ✅ Si tiene las preguntas guardadas, devuelve ÉXITO
                return {"listo": True, "exito": True}
                
        return {"listo": False}
    finally:
        conn.close()
# ==========================================
# RUTAS DE PROGRESO Y RESULTADOS
# ==========================================

@app.post("/guardar-resultado")
def guardar_resultado(res: ResultadoTest):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)
    
    # 1. Convertimos la lista de preguntas a Texto JSON
    preguntas_json = json.dumps(res.preguntas)
    
    # 2. Guardamos todo en la base de datos
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
            "INSERT INTO resultados (user_id, curso_id, aciertos, total_preguntas, contenido_json) VALUES (%s, %s, %s, %s, %s)", 
            (res.user_id, res.curso_id, res.aciertos, res.total_preguntas, preguntas_json)
        )
    conn.commit()
    conn.close()
    return {"mensaje": "Resultado guardado correctamente"}

@app.get("/progreso")
def obtener_progreso(user_id: int = Depends(verificar_token)):
    conn = get_db_connection() # Usamos tu helper de conexión
    
    try:
        # 1. Sacamos las Estadísticas (Tests, Aciertos, Racha)
        # Total Tests
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT COUNT(*) FROM resultados WHERE user_id = %s", (user_id,))
        total_tests = cursor.fetchone()['count']
        
        # Porcentaje Aciertos
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT AVG(CAST(aciertos AS FLOAT) / total_preguntas * 100) FROM resultados WHERE user_id = %s", (user_id,))
        row_avg = cursor.fetchone()
        avg = round(row_avg['avg']) if row_avg and row_avg['avg'] is not None else 0
        
        # Racha
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT COUNT(DISTINCT date(fecha)) FROM resultados WHERE user_id = %s", (user_id,))
        racha = cursor.fetchone()['count']
        
        # 2. 🔥 NUEVO: Sacamos también Nivel y XP del usuario para la barra
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT xp, nivel FROM users WHERE id = %s", (user_id,))
        user_data = cursor.fetchone()
        
        # 👇 ARREGLO: Si no hay usuario (es None), le damos valores iniciales por defecto
        if not user_data:
            xp = 0
            nivel = 1
        else:
            # Si sí hay usuario, usamos tu lógica segura
            xp = user_data['xp']
            nivel = user_data['nivel'] 
            
        # Devolvemos TODO junto
        return {
            "tests": total_tests, 
            "aciertos": avg, 
            "racha": racha,
            "xp": xp,       
            "nivel": nivel  
        }
    finally:
        # Ponemos el close() en un finally para asegurar que siempre se cierra la conexión
        conn.close()


@app.get("/historial")
def obtener_historial_completo(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)
    
    # Pedimos los últimos 20 exámenes, del más nuevo al más viejo
    c.execute("""
        SELECT id, aciertos, total_preguntas, fecha, contenido_json 
        FROM resultados 
        WHERE user_id = %s 
        ORDER BY fecha DESC 
        LIMIT 20
    """, (user_id,))
    
    filas = c.fetchall()
    conn.close()
    
    historial = []
    for fila in filas:
        # Convertimos el texto JSON a una lista de Python real
        preguntas_decoded = []
        if fila["contenido_json"]:
            try:
                preguntas_decoded = json.loads(fila["contenido_json"])
            except:
                preguntas_decoded = []

        historial.append({
            "id": fila["id"],
            "fecha": fila["fecha"],
            "aciertos": fila["aciertos"],
            "total": fila["total_preguntas"],
            "preguntas": preguntas_decoded # Aquí van los detalles para revisar
        })
        
    return historial

# ====================================================================
#  TRABAJO EN SEGUNDO PLANO (WORKER) 
# Esta función se ejecuta sola después de responder al usuario
# ====================================================================
async def precalentar_nivel(reto_id: int, apunte_id: int, indice_nivel: int, titulo_tema: str):
    print(f"🚀 SEGUNDO PLANO: Generando anticipadamente Nivel {indice_nivel + 1} ({titulo_tema})...")
    
    conn = get_db_connection()
    try:
        # 1. Recuperamos ruta del PDF
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT ruta_archivo FROM apuntes WHERE id = %s", (apunte_id,))
        apunte = cursor.fetchone()
        if apunte:
            # 2. Generamos preguntas
            class FakeUploadFile:
                def __init__(self, path): self.path = path
            
            preguntas = None
            #  NUEVA LÓGICA DE FACTORÍA 
            for ia in AIFactory.get_fallback_sequence():
                try:
                    preguntas = await ia.generar_nivel_reto(FakeUploadFile(apunte["ruta_archivo"]), titulo_tema)
                    break
                except Exception as e:
                    print(f"⚠️ Fallo en {ia.__class__.__name__}: {e}")
                    continue
            # -------------------------------------------------------------------------------------------

            # 3. Guardamos en la tabla NIVELES (Esto es más eficiente que actualizar el JSON gigante de Retos)
            if preguntas:
                import json
                preguntas_json = json.dumps(preguntas)
                
                # Usamos INSERT OR REPLACE por si acaso ya existía medio generado
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute('''
                    INSERT INTO niveles (reto_id, numero_nivel, contenido_json, desbloqueado)
                    VALUES (%s, %s, %s, 0) 
                ''', (reto_id, indice_nivel, preguntas_json))
                
                conn.commit()
                print(f"✅ Nivel {indice_nivel + 1} listo y guardado en segundo plano.")
        
    except Exception as e:
        print(f"⚠️ Error en precalentamiento: {e}")
    finally:
        conn.close()

# ====================================================================
# 🔥 NUEVA RUTA: COMPLETAR FASE (Gestión de XP y Precalentamiento)
# ====================================================================
@app.post("/completar-fase/{reto_id}/{indice_jugado}/{fase}") 
async def completar_fase(
    reto_id: int, 
    indice_jugado: int, 
    fase: int, 
    datos: dict, 
    background_tasks: BackgroundTasks,
    user_id: int = Depends(verificar_token)
):
    print(f"🎉 Evaluando Nivel {indice_jugado} - Fase {fase} (Reto {reto_id})...")
    
    aciertos = datos.get("aciertos", 0)
    nota_corte = datos.get("nota_corte", 5)
    
    conn = get_db_connection()
    try:
        # 1. CALCULAMOS LA EXPERIENCIA DE ESTA FASE
        xp_ganada = aciertos * 10
        es_aprobado = aciertos >= nota_corte
        
        # Si es el jefe final (Fase 3) y aprueba, damos el BONO de 100 XP
        if fase == 3 and es_aprobado:
            xp_ganada += 100
            
        # 2. SUMAMOS LA EXPERIENCIA AL USUARIO (Y calculamos si sube de nivel global)
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT xp, nivel FROM users WHERE id = %s", (user_id,))
        user_data = cursor.fetchone()
        
        xp_actual = user_data['xp'] 
        nivel_actual_user = user_data['nivel'] 
        
        xp_nueva = xp_actual + xp_ganada
        xp_necesaria = int(nivel_actual_user * 100 * 1.2)
        subio_nivel = False
        
        while xp_nueva >= xp_necesaria:
            xp_nueva -= xp_necesaria
            nivel_actual_user += 1
            xp_necesaria = int(nivel_actual_user * 100 * 1.2)
            subio_nivel = True
            
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("UPDATE users SET xp = %s, nivel = %s WHERE id = %s", (xp_nueva, nivel_actual_user, user_id))

        #  Sumar la fase al contador global del usuario
        if es_aprobado:
            cursor = conn.cursor()
            # Guardamos el hito en el historial con fecha y hora automática
            cursor.execute("""
                INSERT INTO historial_fases_reto (user_id, reto_id, numero_nivel, fase)
                VALUES (%s, %s, %s, %s)
            """, (user_id, reto_id, indice_jugado, fase))
            conn.commit()
        # 3. LÓGICA PREDICTIVA (SOLO AL APROBAR LA FASE 3)
        if fase == 3 and es_aprobado:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("SELECT nivel_actual, contenido_json, apunte_id FROM retos WHERE id = %s", (reto_id,))
            reto = cursor.fetchone()
            if reto:
                nivel_actual_db = reto['nivel_actual']
                mapa_temas = json.loads(reto['contenido_json'])
                apunte_id = reto['apunte_id']
                
                # Si está jugando el nivel más alto desbloqueado, avanzamos
                if indice_jugado >= nivel_actual_db:
                    nuevo_nivel = indice_jugado + 1
                    total_niveles = len(mapa_temas)
                    
                    if nuevo_nivel < total_niveles:
                        # A) Guardar progreso
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        cursor.execute("UPDATE retos SET nivel_actual = %s WHERE id = %s", (nuevo_nivel, reto_id))
                        # B) Desbloquear el nivel que la IA cocinó mientras jugabas
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        cursor.execute("UPDATE niveles SET desbloqueado = 1 WHERE reto_id = %s AND numero_nivel = %s", (reto_id, nuevo_nivel))
                        
                        # C) 🚀 ¡LA MAGIA! Mandar a la IA a cocinar el SIGUIENTE
                        siguiente_a_preparar = nuevo_nivel + 1
                        if siguiente_a_preparar < total_niveles:
                            background_tasks.add_task(
                                precalentar_nivel,
                                reto_id, apunte_id, siguiente_a_preparar, mapa_temas[siguiente_a_preparar]
                            )
                    else:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        cursor.execute("UPDATE retos SET completado = 1 WHERE id = %s", (reto_id,))
                        print("🏆 Reto 100% finalizado")
        
        conn.commit()
        return {
            "status": "ok", 
            "xp_ganada": xp_ganada, 
            "subido": subio_nivel, 
            "nuevo_nivel": nivel_actual_user
        }

    except Exception as e:
        print(f"❌ Error completando fase: {e}")
        raise HTTPException(500, str(e))
    finally:
        conn.close()

# ---------------------------------------------------------
# ENDPOINT: CREAR RETO CORREGIDO (BOOLEANOS DE POSTGRES)
# ---------------------------------------------------------
@app.post("/crear-reto/{apunte_id}")
async def crear_reto(
    apunte_id: int, 
    background_tasks: BackgroundTasks,
    user_id: int = Depends(verificar_token)
):
    print(f"🚀 INICIO: Creando reto para apunte {apunte_id} (Usuario: {user_id})...")
    conn = get_db_connection()
    
    # 1. Recuperar info del PDF
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT ruta_archivo, nombre FROM apuntes WHERE id = %s", (apunte_id,))
    apunte = cursor.fetchone()
    if not apunte:
        conn.close()
        raise HTTPException(404, "Apunte no encontrado")
    
    ruta_pdf = apunte['ruta_archivo']
    nombre_apunte = apunte['nombre']
    class FileObj: path = ruta_pdf

    try:
        # 2. Generar ESTRUCTURA (Mapa)
        mapa_niveles = None
        ias_disponibles = AIFactory.get_fallback_sequence()
        
        for ia in ias_disponibles:
            try:
                mapa_niveles = await ia.generar_mapa_retos(FileObj())
                if mapa_niveles: break
            except Exception:
                continue
                
        if not mapa_niveles: raise Exception("Todas las IAs fallaron al generar el mapa")

        # 2.5 COBRAMOS ENERGÍA AQUÍ
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT energia FROM users WHERE id = %s", (user_id,))
        user_row = cursor.fetchone()
        
        if not user_row or user_row['energia'] < 1:
            raise HTTPException(400, "No tienes suficiente energía para crear un reto nuevo.")
            
        cursor.execute("UPDATE users SET energia = energia - 1 WHERE id = %s", (user_id,))

        # 3. Guardar Reto en DB (🔥 CAMBIO AQUÍ: completado = FALSE 🔥)
        nombre_reto = f"Reto: {nombre_apunte}"
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("INSERT INTO retos (user_id, apunte_id, nombre_reto, nivel_actual, contenido_json, completado) VALUES (%s, %s, %s, 0, %s, FALSE) RETURNING id", (user_id, apunte_id, nombre_reto, json.dumps(mapa_niveles)))
        reto_id = cursor.fetchone()['id']
        conn.commit()

        # 4. GENERAR SOLO EL NIVEL 1
        preguntas_n1 = None
        for ia in ias_disponibles:
            try:
                preguntas_n1 = await ia.generar_nivel_reto(FileObj(), mapa_niveles[0], "medio")
                if preguntas_n1: break
            except Exception:
                continue
                
        # 🔥 CAMBIO AQUÍ: desbloqueado = TRUE 🔥
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute('''
            INSERT INTO niveles (reto_id, numero_nivel, contenido_json, desbloqueado)
            VALUES (%s, %s, %s, TRUE)
        ''', (reto_id, 0, json.dumps(preguntas_n1)))
        conn.commit()

        # 5. GENERAR NIVEL 2 EN SEGUNDO PLANO
        if len(mapa_niveles) > 1:
            background_tasks.add_task(precalentar_nivel, reto_id, apunte_id, 1, mapa_niveles[1])

        return {"status": "ok", "message": "Reto listo para jugar"}

    except Exception as e:
        print(f"❌ Error creando reto: {e}")
        raise HTTPException(500, f"Error interno: {e}")
    finally:
        conn.close()

@app.get("/mis-retos")
def listar_retos(user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)
    
    # ✅ CORRECCIÓN: Añadimos 'contenido_json' al SELECT
    c.execute("""
        SELECT id, nombre_reto, nivel_actual, completado, contenido_json 
        FROM retos 
        WHERE user_id = %s 
        ORDER BY id DESC
    """, (user_id,))
    
    retos = [dict(row) for row in c.fetchall()]
    conn.close()
    return retos
@app.delete("/retos/{reto_id}")
def eliminar_reto(reto_id: int):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)
    
    # Verificamos si existe
    c.execute("SELECT id FROM retos WHERE id = %s", (reto_id,))
    if not c.fetchone():
        conn.close()
        raise HTTPException(404, "Reto no encontrado")

    # Lo borramos
    c.execute("DELETE FROM retos WHERE id = %s", (reto_id,))
    conn.commit()
    conn.close()
    
    return {"mensaje": "Reto eliminado correctamente"}

@app.post("/cargar-nivel/{reto_id}/{indice}")
async def cargar_nivel(reto_id: int, indice: int):
    conn = get_db_connection()
    c = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # 1. BUSCAR SI YA EXISTE EN LA TABLA NIVELES (Lo que generamos al crear el reto)
        c.execute("SELECT contenido_json FROM niveles WHERE reto_id = %s AND numero_nivel = %s", (reto_id, indice))
        nivel_guardado = c.fetchone()

        if nivel_guardado:
            # ¡AQUÍ ESTABA EL ERROR!
            # La base de datos nos da una tupla con texto: ('[{"pregunta":...}]',)
            texto_json = nivel_guardado['contenido_json']
            
            # Convertimos texto -> Lista/Objeto Python
            preguntas = json.loads(texto_json)
            
            # Devolvemos estructura correcta para el frontend
            return {"preguntas": preguntas}

        # ---------------------------------------------------------
        # 2. SI NO EXISTE, LO GENERAMOS AL VUELO (FALLBACK)
        # (Esto pasa si vas por el nivel 5 y solo pre-generamos hasta el 2)
        # ---------------------------------------------------------
        
        # A. Buscamos el reto para saber qué apunte usar
        c.execute("SELECT apunte_id, contenido_json FROM retos WHERE id = %s", (reto_id,))
        reto = c.fetchone()
        
        if not reto:
            raise HTTPException(status_code=404, detail="Reto no encontrado")
            
        apunte_id = reto['apunte_id']
        mapa_json_txt = reto['contenido_json']
        
        # Recuperamos el tema de este nivel del mapa
        mapa = json.loads(mapa_json_txt)
        if indice >= len(mapa):
             # Si se acaban los temas, repetimos el último o ponemos genérico
             tema_nivel = "Repaso General"
        else:
             tema_nivel = mapa[indice]

        # B. Buscamos el PDF
        c.execute("SELECT ruta_archivo FROM apuntes WHERE id = %s", (apunte_id,))
        apunte_data = c.fetchone()
        ruta_pdf = apunte_data['ruta_archivo']

        class FileObj: path = ruta_pdf

        # C. Generamos preguntas con la IA
        print(f"🧩 Generando Nivel {indice} ({tema_nivel}) bajo demanda...")
        preguntas = None
        
        # 👇 NUEVA LÓGICA DE FACTORÍA 👇
        for ia in AIFactory.get_fallback_sequence():
            try:
                preguntas = await ia.generar_nivel_reto(FileObj(), tema_nivel)
                if preguntas: break
            except Exception as e:
                print(f"⚠️ Fallo en {ia.__class__.__name__}: {e}")
                continue
        # D. Guardamos en DB para la próxima vez (Caché)
        if preguntas:
            c.execute('''
                INSERT INTO niveles (reto_id, numero_nivel, contenido_json, desbloqueado)
                VALUES (%s, %s, %s, 1)
            ''', (reto_id, indice, json.dumps(preguntas)))
            conn.commit()

        return {"preguntas": preguntas}

    except Exception as e:
        print(f"Error cargando nivel: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ==========================================
# RUTAS DE ESTADÍSTICAS GLOBALES
# ==========================================
@app.get("/estadisticas-globales")
def obtener_estadisticas_globales(periodo: str = "siempre", user_id: int = Depends(verificar_token)):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # 🗓️ LÓGICA DEL FILTRO DE TIEMPO
        filtro_fecha = ""
        filtro_fecha_retos = "" # La tabla de retos usa 'fecha_creacion' en vez de 'fecha'
        
        if periodo == "dia":
            filtro_fecha = " AND fecha >= NOW() - INTERVAL '1 day'"
            filtro_fecha_retos = " AND fecha_creacion >= NOW() - INTERVAL '1 day'"
        elif periodo == "semana":
            filtro_fecha = " AND fecha >= NOW() - INTERVAL '7 days'"
            filtro_fecha_retos = " AND fecha_creacion >= NOW() - INTERVAL '7 days'"
        elif periodo == "mes":
            filtro_fecha = " AND fecha >= NOW() - INTERVAL '1 month'"
            filtro_fecha_retos = " AND fecha_creacion >= NOW() - INTERVAL '1 month'"

        # 1. Stats Tests Rápidos (Los genéricos, sin guardar)
        cursor.execute(f"""
            SELECT 
                COUNT(*) as c, 
                COALESCE(SUM(aciertos), 0) as a, 
                COALESCE(SUM(total_preguntas), 0) as t 
            FROM resultados 
            WHERE user_id = %s {filtro_fecha}
        """, (user_id,))
        res_gen = cursor.fetchone()
        
        # 2. Stats Tests Rápidos (Los guardados en las carpetas de biblioteca)
        cursor.execute(f"""
            SELECT 
                COUNT(*) as c, 
                COALESCE(SUM(aciertos), 0) as a, 
                COALESCE(SUM(total_preguntas), 0) as t 
            FROM historial_tests 
            WHERE user_id = %s {filtro_fecha}
        """, (user_id,))
        res_hist = cursor.fetchone()

        tests_c = res_gen['c'] + res_hist['c']
        tests_a = res_gen['a'] + res_hist['a']
        tests_t = res_gen['t'] + res_hist['t']
        tests_fallos = tests_t - tests_a
        tests_precision = round((tests_a / tests_t * 100)) if tests_t > 0 else 0

        # 3. Stats Exámenes Oficiales
        cursor.execute(f"""
            SELECT 
                COUNT(*) as c, 
                COALESCE(SUM(aciertos), 0) as a, 
                COALESCE(SUM(total), 0) as t 
            FROM resultados_oficiales 
            WHERE user_id = %s {filtro_fecha}
        """, (user_id,))
        ofic = cursor.fetchone()
        
        ofic_c = ofic['c']
        ofic_a = ofic['a']
        ofic_t = ofic['t']
        ofic_fallos = ofic_t - ofic_a
        ofic_precision = round((ofic_a / ofic_t * 100)) if ofic_t > 0 else 0

        # 4. Stats Modo Reto (Usando la tabla de historial)
        cursor.execute(f"SELECT COUNT(*) as total FROM historial_fases_reto WHERE user_id = %s {filtro_fecha}", (user_id,))
        fases = cursor.fetchone()['total'] or 0

        cursor.execute(f"SELECT COUNT(*) as total_retos FROM retos WHERE user_id = %s {filtro_fecha_retos}", (user_id,))
        total_retos = cursor.fetchone()['total_retos'] or 0
        
        cursor.execute(f"""
            SELECT COUNT(*) as completados 
            FROM retos 
            WHERE user_id = %s AND completado = TRUE {filtro_fecha_retos}
        """, (user_id,))
        retos_completados = cursor.fetchone()['completados'] or 0

        # 5. Cálculo total general
        total_aciertos = tests_a + ofic_a
        total_preguntas = tests_t + ofic_t
        total_fallos = total_preguntas - total_aciertos
        precision = round((total_aciertos / total_preguntas * 100)) if total_preguntas > 0 else 0

        return {
            "tests_completados": tests_c,
            "examenes_completados": ofic_c,
            "fases_reto": fases,
            "aciertos_totales": total_aciertos,
            "fallos_totales": total_fallos,
            "precision": precision,
            "detalles": {
                "tests": {
                    "aciertos": tests_a,
                    "fallos": tests_fallos,
                    "precision": tests_precision
                },
                "oficiales": {
                    "aciertos": ofic_a,
                    "fallos": ofic_fallos,
                    "precision": ofic_precision
                },
                "retos": {
                    "creados": total_retos,
                    "completados": retos_completados
                }
            }
        }
    except Exception as e:
        print(f"Error cargando estadísticas: {e}")
        return {"tests_completados":0, "examenes_completados":0, "fases_reto":0, "aciertos_totales":0, "fallos_totales":0, "precision":0, "detalles": None}
    finally:
        conn.close()