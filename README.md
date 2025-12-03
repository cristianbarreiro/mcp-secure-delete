# MCP Secure Delete

Servidor MCP para borrado "seguro" (best effort) de archivos y directorios en Linux.

> ⚠️ **Advertencia importante**  
> En discos SSD/NVMe, sistemas de ficheros con journaling (ext4, etc.), snapshots (btrfs, ZFS, LVM), etc.,  
> **no hay garantía absoluta** de que el borrado sea físicamente irrecuperable.  
> Este proyecto ofrece un borrado *best-effort* a nivel de sistema de archivos usando `shred`.

## Requisitos

- Node.js 20+ (recomendado)
- Linux con el comando `shred` disponible (suele venir en `coreutils`).
- npm

## Instalación

```bash
git clone <tu-repo> mcp-secure-delete
cd mcp-secure-delete

npm install
```

## Build

Compilar TypeScript a JavaScript:

```bash
npm run build
```

Esto genera la carpeta `dist/` con `dist/server.js`.

## Ejecutar en modo desarrollo

```bash
npm run dev
```

El servidor leerá/escribirá por STDIN/STDOUT, como requiere MCP.

## Ejecutar el servidor (modo normal)

```bash
npm start
```

## Tools disponibles

### 1. `check_path`

Devuelve info básica de un path:

- si existe
- si es directorio
- tamaño en bytes
- permisos efectivos del proceso (lectura/escritura)

**Input (JSON):**

```json
{
  "path": "/ruta/al/archivo"
}
```

**Output (ejemplo):**

```json
{
  "exists": true,
  "is_directory": false,
  "size_bytes": 1234,
  "mode_octal": "100644",
  "can_read": true,
  "can_write": true
}
```

---

### 2. `secure_delete`

Borra de forma "segura" (best effort) usando `shred`.

**Input (JSON):**

```json
{
  "path": "/ruta/al/archivo",
  "passes": 3,
  "recursive": false,
  "dry_run": false
}
```

- `passes` (opcional): número de pasadas de sobreescritura (default: 3, max: 10).
- `recursive` (opcional): si es `true` y `path` es un directorio, se borran todos sus archivos recursivamente.  
- `dry_run` (opcional): si es `true`, solo informa lo que **haría**, pero no borra nada.

**Output (éxito):**

```json
{
  "ok": true,
  "message": "Borrado seguro completado para '/ruta/al/archivo'.",
  "stdout": "",
  "stderr": "",
  "disclaimer": "Advertencia: ..."
}
```

**Output (error):**

```json
{
  "ok": false,
  "message": "El path no existe o no se puede acceder: ..."
}
```

## Integración con un cliente MCP

Este proyecto incluye un `mcp.json`:

```json
{
  "name": "secure-delete",
  "version": "0.1.0",
  "description": "MCP server para borrado seguro (best effort) de archivos en Linux.",
  "license": "MIT",
  "server": {
    "command": "node",
    "args": ["dist/server.js"]
  },
  "tools": [
    { "name": "check_path", "description": "Devuelve información básica sobre un path en el sistema de archivos." },
    { "name": "secure_delete", "description": "Borra de forma segura un archivo o directorio (best effort) usando 'shred' en Linux." }
  ]
}
```

## Seguridad

- Este servidor puede borrar archivos de manera irreversible (best effort).
- Úsalo bajo tu propio riesgo y solo en entornos controlados.
- Para pruebas, usa primero `dry_run: true`.
