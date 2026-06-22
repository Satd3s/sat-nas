# SAT NAS - Configuración de Red y AdGuard Home (Dell T30)

Este repositorio contiene los scripts de automatización, diagnóstico y configuración utilizados para montar y mantener el servidor DNS bloqueador de publicidad (**AdGuard Home**) en el servidor Dell T30 (`sat-nas`).

---

## 🌐 Arquitectura de la Red

```
[ Celular (Compartiendo Internet) ]
         ↓ (Anclaje de red USB / Tethering + VPN)
[ Dell T30 (Servidor Gateway) ]
   * IP Tethering: 10.121.133.205 (enxca1dbec67de5)
   * IP Ethernet Compartida: 10.42.0.1 (enp0s31f6)
   * Corre dnsmasq en puerto 53 para DHCP y reenvío DNS
   * Corre AdGuard Home en Docker (Puerto 5300 DNS, Puerto 8585 Web)
         ↓ (Cable Ethernet)
[ Router TP-Link (Archer AX50) ]
   * Puerto WAN: Conectado al Dell T30. Recibe IP 10.42.0.x (ej. 10.42.0.43)
   * Red LAN / Wi-Fi: 192.168.0.x
   * DHCP Server: Configurado para entregar 10.42.0.1 como DNS primario
         ↓ (Wi-Fi / Ethernet)
[ Dispositivos Domésticos ] (PC, Celular, SmartTV, etc.)
   * Obtienen IP en el rango 192.168.0.x
   * Consultan DNS directamente a 10.42.0.1 (Dell T30 / AdGuard Home)
```

---

## 📄 Descripción de los Scripts

Todos los scripts de automatización están escritos en Node.js y se ejecutan desde la PC cliente utilizando SSH para conectarse y configurar el Dell T30 de forma segura.

### Scripts de Despliegue y Configuración
* **`deploy_adguard.js`**: Crea las carpetas persistentes en el T30 (`/opt/adguardhome/`) y levanta el contenedor de Docker mapeando los puertos correspondientes (`3000` setup, `8585` web admin, y `5300` DNS para evitar colisión con el mDNS del sistema).
* **`setup_dnsmasq_forward.js`**: Configura el reenvío de consultas de `dnsmasq` (NetworkManager) en el puerto `53` hacia el puerto `5300` de AdGuard Home.
* **`fix_dnsmasq_no_resolv.js`**: Configura `no-resolv` en `dnsmasq` para que ignore los DNS externos del celular (como `8.8.8.8`) y use exclusivamente AdGuard Home como upstream, evitando fugas de anuncios.
* **`apply_iptables_fix.js`**: Inserta reglas en el firewall de Linux (`iptables`) para asegurar que el reenvío de tráfico (IP Forwarding) y el enmascaramiento de red (MASQUERADE) funcionen correctamente entre el puerto de internet (USB) y el puerto de red local (Ethernet).
* **`restart_shared_conn.js`**: Reinicia el perfil de red compartido del T30 para aplicar de inmediato cualquier cambio de DNS o firewall.

### Scripts de Diagnóstico y Estado
* **`check_t30_ip.js`**: Muestra las direcciones IP de todas las interfaces del servidor T30.
* **`check_all_ports.js`**: Muestra todas las conexiones TCP a la escucha en el servidor T30 (identificando dónde escuchan CasaOS, Kodi, Plex, Samba, etc.).
* **`check_docker_ps.js`**: Lista todos los contenedores Docker activos y sus puertos mapeados en el servidor T30.
* **`check_t30_dns.js`**: Verifica el estado de `dnsmasq`, resolved y realiza pruebas de resolución local contra el DNS de AdGuard Home.
* **`diagnose_sharing_fixed.js`**: Examina el estado del reenvío de IP, tablas NAT de `iptables` y perfiles de conexión de NetworkManager.
* **`verify_t30_internet.js`**: Realiza pings y peticiones HTTP externas desde el T30 para certificar que tiene acceso a internet por USB.

---

## 🚀 Cómo Recuperar / Desplegar de Nuevo

Si por alguna razón pierdes la configuración o cambias de PC cliente:

1. **Requisitos en la PC cliente:**
   * Tener instalado **Node.js** (v16 o superior).
   * Instalar el paquete `ssh2` ejecutando:
     ```bash
     npm install ssh2
     ```

2. **Ejecutar los scripts:**
   * Abre la consola en la carpeta de este repositorio.
   * Ejecuta los scripts en el orden deseado usando `node <nombre_del_script>.js`.
   * *Nota:* Asegúrate de verificar y actualizar la dirección IP `localAddress` en las opciones de conexión `.connect()` de los scripts de Node.js si la IP de tu PC cliente cambia.

---

## 🔒 Credenciales del Servidor (T30)
* **IP del Host:** `10.42.0.1` (o en su momento `192.168.0.216` en red local directa)
* **SSH Usuario:** `satde`
* **SSH Password:** `satdes2155`
