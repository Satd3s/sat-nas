# Especificación de Diseño: Panel de Telemetría Táctica SAT_NAS

Este documento define la arquitectura, diseño visual y especificaciones técnicas para el panel de telemetría y control de **SAT_NAS**.

---

## 1. Resumen Arquitectónico

El panel de telemetría táctica de **SAT_NAS** consta de dos capas integradas en un único proyecto de Node.js:

1. **Servidor Backend (Node.js + Express):**
   * Se ejecuta como un demonio de sistema (`systemd`) bajo el usuario `root` en el Dell T30.
   * Escucha en el puerto **`8090`**.
   * Lee telemetría local de hardware (CPU, RAM, discos, Docker, conexiones de red) mediante ejecución de comandos y lectura de ficheros de sistema.
   * Valida la autenticación mediante cookies de sesión firmadas.
   * Ejecuta tareas de control de red e interfaces.

2. **Frontend Monopágina (HTML5 + CSS Grid + Vanilla JS):**
   * Servido directamente desde la carpeta `/public` del backend.
   * Diseñado bajo las especificaciones visuales **Brutalistas e Industriales**.
   * Realiza peticiones asíncronas (`fetch`) al backend para actualizar los datos en tiempo real cada 3 segundos.

---

## 2. Autenticación y Seguridad (Login)

Para proteger el panel de accesos no autorizados en la red local:

* **Página de Login:**
  * Al ingresar a `http://10.42.0.1:8090`, el servidor verifica si existe una cookie de sesión válida.
  * Si no hay sesión activa, redirige a una pantalla de login brutalista:
    * Título: `[ SAT_NAS ACCESS CONTROL ]`
    * Campos: `[ USERNAME ]` y `[ PASSWORD ]`
    * Botón: `[ AUTHORIZE ]`
* **Credenciales:**
  * Guardadas en un archivo local `config.json` en el servidor:
    * Usuario por defecto: `admin`
    * Contraseña por defecto: `satdes2155` (misma contraseña de SSH, modificable en el archivo `config.json`).
* **Manejo de Sesión:**
  * Al iniciar sesión correctamente, el servidor genera y responde con una cookie de sesión firmada mediante una clave aleatoria generada al iniciar el servidor.
  * Duración de la sesión: 24 horas.

---

## 3. Endpoints de la API REST

Todos los endpoints (excepto el login) requieren que la cookie de sesión sea válida.

### Telemetría
* **`GET /api/status`**
  * Devuelve la información actual en formato JSON:
    ```json
    {
      "uptime": "1d 4h 32m",
      "internet": {
        "status": "OK",
        "ping_latency_ms": 25
      },
      "interfaces": {
        "usb": { "name": "enx0a2f530b6e65", "status": "ACTIVE", "ip": "10.136.17.106", "rx_speed_kb": 32.5, "tx_speed_kb": 12.1 },
        "ethernet": { "name": "enp0s31f6", "status": "ACTIVE", "ip": "10.42.0.1" }
      },
      "resources": {
        "cpu_usage_pct": 12.5,
        "ram_used_mb": 4200,
        "ram_total_mb": 16000
      },
      "disks": [
        { "mount": "/", "used_gb": 45, "total_gb": 438, "percentage": 10 },
        { "mount": "/mnt/disco_1tb", "used_gb": 210, "total_gb": 931, "percentage": 22 },
        { "mount": "/mnt/NAS_STORAGE", "used_gb": 850, "total_gb": 1800, "percentage": 47 },
        { "mount": "/mnt/disco_4tb", "used_gb": 3100, "total_gb": 3600, "percentage": 86 }
      ],
      "docker": [
        { "id": "ac586d79e3fb", "name": "adguardhome", "status": "running" },
        { "id": "16132a2c32a7", "name": "alist", "status": "running" },
        { "id": "c8a8f99926d0", "name": "hermes_vault_access", "status": "running" }
      ]
    }
    ```

### Acciones
* **`POST /api/login`**: Valida credenciales y genera la cookie de sesión.
* **`POST /api/logout`**: Invalida la sesión actual y destruye la cookie.
* **`POST /api/actions/restart-network`**: Ejecuta `nmcli connection up "Perfil 1"` para refrescar el DNS y las reglas de IP.
* **`POST /api/actions/fix-usb`**: Ejecuta los comandos de recarga de udev y desactivación del autosuspend USB.
* **`POST /api/actions/docker-toggle`**: Inicia o detiene un contenedor Docker (`docker start <name>` o `docker stop <name>`).
* **`POST /api/actions/diagnose`**: Ejecuta herramientas de red en el T30. Recibe payload `{ "command": "ping|nslookup|traceroute", "target": "google.com" }` y devuelve la salida estándar en texto plano.

---

## 4. Diseño de la Interfaz Visual (Frontend)

* **Hoja de Estilos (`index.css`):**
  * Fondo: `#0A0A0A` (negro absoluto).
  * Texto: `#EAEAEA` (gris terminal).
  * Bordes: `1px solid #ffb000` (ámbar clásico).
  * Acentos de Alerta: `#E61919` (rojo aviación para errores y botones peligrosos).
  * Elementos en UPPERCASE utilizando la tipografía `Consolas`, `Monaco` o `monospace`.
  * Ausencia de esquinas redondeadas (`border-radius: 0px`).
* **Diseño del Tablero:**
  * Cabecera con título `[ SAT_NAS TELEMETRY PANEL ]` y LEDs indicadores de internet y USB.
  * Grid con 3 columnas principales:
    * **Izquierda:** Uso de CPU, Memoria, Uptime y Carga con barras de bloques ASCII `[████░░░░░░]`.
    * **Centro:** Estadísticas de Discos y Gráficos ASCII de ocupación de almacenamiento.
    * **Derecha:** Tabla de Docker con botones `[ START ]` y `[ STOP ]` en rojo o verde según estado.
  * Consola interactiva inferior para ejecutar Pings, Traceroutes y reajustes de red.
