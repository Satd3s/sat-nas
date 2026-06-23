# Especificación de Diseño: Contenedor Web Docker para SpotiFLAC v7.1.9 en T30

Este documento define la arquitectura, configuración de Docker, automatización de compilación y persistencia de almacenamiento para ejecutar **SpotiFLAC v7.1.9** en un contenedor con interfaz gráfica web integrada en el servidor Dell T30.

---

## 1. Resumen de la Arquitectura

Para permitir que una aplicación gráfica de escritorio (AppImage de Linux) se ejecute en un servidor headless (T30) y sea accesible desde cualquier navegador web en la red local:

1.  **Base de Imagen:** [jlesage/baseimage-gui:ubuntu-22.04](https://hub.docker.com/r/jlesage/baseimage-gui)
    *   Proporciona un entorno gráfico minimalista (X11 + Openbox).
    *   Contiene un servidor VNC y noVNC integrado, sirviendo la UI gráfica mediante HTTP en el puerto `5800`.
2.  **Extracción de la AppImage:**
    *   La AppImage no puede montarse directamente mediante FUSE en la mayoría de entornos Docker sin otorgar privilegios excesivos (`--device /dev/fuse`).
    *   En su lugar, el `Dockerfile` descarga la AppImage `v7.1.9` y la extrae usando `./SpotiFLAC.AppImage --appimage-extract`, colocando los contenidos en `/opt/spotiflac`.
3.  **Dependencias Gráficas:**
    *   Se instalan las librerías necesarias mediante `apt-get`, incluyendo `libwebkit2gtk-4.1-0` (motor Webview de Tauri), `libnss3` y `libasound2`.
4.  **Acceso Web:**
    *   Mapearemos el puerto **`8095`** en el host del Dell T30 hacia el puerto `5800` del contenedor.
    *   Dirección de acceso local: `http://10.42.0.1:8095`

---

## 2. Definición del Contenedor Docker

El despliegue se estructurará mediante un archivo [Dockerfile](file:///C:/Users/Satd3s_/.gemini/antigravity-ide/scratch/sat_nas/Dockerfile.spotiflac) y un script [startapp.sh](file:///C:/Users/Satd3s_/.gemini/antigravity-ide/scratch/sat_nas/startapp.sh).

### Estructura de Archivos
*   `Dockerfile.spotiflac`: Instrucciones de construcción para la imagen.
*   `startapp.sh`: Script ejecutado por el contenedor para arrancar la interfaz gráfica de SpotiFLAC.

### Puertos
*   `8095:5800` (noVNC HTTP)
*   `5900:5900` (VNC directo, opcional)

### Volúmenes de Persistencia
*   `/config`: Almacena la configuración de SpotiFLAC, cookies e historial de descargas. Mapeado en el T30 a `/opt/spotiflac-config`.
*   `/storage`: Carpeta destino de descargas de música. Mapeado en el T30 a `/mnt/NAS_STORAGE/Music`.

---

## 3. Especificaciones del Script de Arranque (startapp.sh)

El contenedor ejecuta el script `/startapp.sh` para iniciar el software gráfico en el servidor virtual de pantalla:

```bash
#!/bin/sh
exec /opt/spotiflac/squashfs-root/AppRun
```

---

## 4. Estrategia de Actualizaciones

Para actualizar SpotiFLAC de forma automatizada y sin tener que modificar el `Dockerfile` a mano:

1.  **Parámetro de Compilación (`ARG`):**
    La versión de descarga se define dinámicamente mediante la variable `SPOTIFLAC_VERSION` en el `Dockerfile.spotiflac`, por defecto en `v7.1.9`.
2.  **Script de Actualización en el T30:**
    Se creará un script `update_spotiflac.sh` en el directorio de despliegue del T30:
    ```bash
    #!/bin/bash
    NEW_VERSION=$1
    if [ -z "$NEW_VERSION" ]; then
      echo "Error: Por favor especifica la versión (ej. ./update_spotiflac.sh v7.2.0)"
      exit 1
    fi
    echo ">>> Actualizando SpotiFLAC a la versión $NEW_VERSION..."
    docker build --build-arg SPOTIFLAC_VERSION=$NEW_VERSION -f Dockerfile.spotiflac -t spotiflac:latest .
    docker stop spotiflac || true
    docker rm spotiflac || true
    docker run -d --name spotiflac \
      --restart unless-stopped \
      -p 8095:5800 \
      -v /opt/spotiflac-config:/config \
      -v /mnt/NAS_STORAGE/Music:/storage \
      spotiflac:latest
    echo ">>> Actualización completada."
    ```

---

## 5. Plan de Verificación

Para garantizar que el despliegue es exitoso, realizaremos las siguientes verificaciones:

1.  **Compilación Local/Remota:**
    *   Construir la imagen de Docker en el servidor T30 mediante SSH.
2.  **Verificación de Ejecución:**
    *   Iniciar el contenedor y comprobar mediante logs (`docker logs`) que no hay errores de librerías dinámicas perdidas (`ldd` check si falla).
3.  **Verificación de Red y Puertos:**
    *   Comprobar que el puerto `8095` está abierto en el T30 y responde correctamente (`curl -I http://10.42.0.1:8095`).
4.  **Prueba Funcional:**
    *   Acceder mediante navegador web en la red local, verificar que la interfaz de SpotiFLAC se renderiza, e ingresar a la configuración para asegurar que el directorio de descargas apunta a `/storage`.

