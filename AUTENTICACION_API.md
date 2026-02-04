# 🔐 API de Autenticación - Backend Voleibol

## 📋 Endpoints de Autenticación

### 1. **POST /api/auth/register**
Registrar un nuevo usuario

**Método:** POST  
**Autenticación:** No requerida

**Body (JSON):**
```json
{
  "email": "usuario@example.com",
  "password": "password123",
  "nombre": "Juan García",
  "role": "arbitro"
}
```

**Roles válidos:** `admin`, `arbitro`, `delegado`

**Respuesta (201):**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "email": "usuario@example.com",
    "nombre": "Juan García",
    "role": "arbitro"
  }
}
```

---

### 2. **POST /api/auth/login**
Iniciar sesión

**Método:** POST  
**Autenticación:** No requerida

**Body (JSON):**
```json
{
  "email": "usuario@example.com",
  "password": "password123"
}
```

**Respuesta (200):**
```json
{
  "success": true,
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": 1,
    "email": "usuario@example.com",
    "nombre": "Juan García",
    "role": "arbitro"
  }
}
```

**Errores:**
- `400`: Email o contraseña no proporcionados
- `401`: Credenciales inválidas
- `409`: Email ya registrado (en register)

---

### 3. **POST /api/auth/logout**
Cerrar sesión

**Método:** POST  
**Autenticación:** No requerida

**Respuesta (200):**
```json
{
  "success": true,
  "message": "Sesión cerrada"
}
```

---

### 4. **GET /api/auth/me**
Obtener datos del usuario autenticado

**Método:** GET  
**Autenticación:** **Requerida** (JWT en header)

**Headers:**
```
Authorization: Bearer <token>
```

**Respuesta (200):**
```json
{
  "success": true,
  "usuario": {
    "id": 1,
    "email": "usuario@example.com",
    "nombre": "Juan García",
    "role": "arbitro",
    "estado": "activo"
  }
}
```

**Errores:**
- `401`: Token no proporcionado o inválido
- `404`: Usuario no encontrado

---

## 🧪 Cómo Probar

### Con Postman o Insomnia:

#### 1. Registrar usuario
```
POST http://localhost:3001/api/auth/register
Content-Type: application/json

{
  "email": "arbitro1@example.com",
  "password": "password123",
  "nombre": "Carlos López",
  "role": "arbitro"
}
```

#### 2. Iniciar sesión
```
POST http://localhost:3001/api/auth/login
Content-Type: application/json

{
  "email": "arbitro1@example.com",
  "password": "password123"
}
```

#### 3. Obtener datos del usuario
```
GET http://localhost:3001/api/auth/me
Authorization: Bearer <token_obtenido_en_login>
```

---

## 🔒 Seguridad

- Las contraseñas se encriptan con **bcryptjs** (10 salts)
- Los tokens JWT expiran en **24 horas**
- Solo se permiten roles: `admin`, `arbitro`, `delegado`
- El usuario debe estar con estado `activo` para login

---

## 📝 Notas

- Guarda el token que devuelve login/register
- Incluye el token en el header `Authorization: Bearer <token>` para rutas protegidas
- El token contiene: `id`, `email`, `role`, `nombre`

---

**Base de datos:** PostgreSQL  
**Tabla usuarios:** Contiene email, password, nombre, role, estado, created_at, updated_at
