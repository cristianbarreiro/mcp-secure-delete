import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);
// Crear instancia del servidor MCP
const server = new Server({
    name: "secure-delete",
    version: "0.1.0"
}, {
    capabilities: {
        tools: {}
    }
});
// ---------- Tool definitions ----------
const checkPathInput = z.object({
    path: z.string()
});
const secureDeleteInput = z.object({
    path: z.string(),
    passes: z.number().int().positive().max(10).optional().default(3),
    recursive: z.boolean().optional().default(false),
    dry_run: z.boolean().optional().default(false)
});
// ---------- List Tools Handler ----------
server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            {
                name: "check_path",
                description: "Devuelve información básica sobre un path en el sistema de archivos.",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Ruta del archivo o directorio a verificar"
                        }
                    },
                    required: ["path"]
                }
            },
            {
                name: "secure_delete",
                description: "Borra de forma segura un archivo (o directorio si recursive=true) usando 'shred' cuando sea posible.",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "Ruta del archivo o directorio a borrar"
                        },
                        passes: {
                            type: "number",
                            description: "Número de pasadas de sobrescritura (1-10, por defecto 3)",
                            default: 3
                        },
                        recursive: {
                            type: "boolean",
                            description: "Si es true, borra directorios recursivamente",
                            default: false
                        },
                        dry_run: {
                            type: "boolean",
                            description: "Si es true, solo simula la operación sin borrar realmente",
                            default: false
                        }
                    },
                    required: ["path"]
                }
            }
        ]
    };
});
// ---------- Call Tool Handler ----------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        if (name === "check_path") {
            const { path } = checkPathInput.parse(args);
            try {
                const stat = await fs.stat(path);
                // Comprobar permisos del proceso actual
                let canRead = false;
                let canWrite = false;
                try {
                    await fs.access(path, fsConstants.R_OK);
                    canRead = true;
                }
                catch { }
                try {
                    await fs.access(path, fsConstants.W_OK);
                    canWrite = true;
                }
                catch { }
                const result = {
                    exists: true,
                    is_directory: stat.isDirectory(),
                    size_bytes: stat.size,
                    mode_octal: stat.mode.toString(8),
                    can_read: canRead,
                    can_write: canWrite
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            catch (err) {
                const result = {
                    exists: false,
                    error: err?.message ?? "Unknown error"
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
        }
        else if (name === "secure_delete") {
            const { path, passes = 3, recursive = false, dry_run = false } = secureDeleteInput.parse(args);
            // 1. Validaciones básicas
            let stat;
            try {
                stat = await fs.stat(path);
            }
            catch (err) {
                const result = {
                    ok: false,
                    message: `El path no existe o no se puede acceder: ${err?.message}`
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            if (stat.isDirectory() && !recursive) {
                const result = {
                    ok: false,
                    message: "El path es un directorio. Usa recursive=true si realmente quieres borrar todo ese directorio (¡peligroso!)."
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            try {
                await fs.access(path, fsConstants.W_OK);
            }
            catch {
                const result = {
                    ok: false,
                    message: "No hay permisos de escritura/borrado sobre este path para el usuario actual."
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            // 2. Dry run: sólo simula
            if (dry_run) {
                const result = {
                    ok: true,
                    dry_run: true,
                    message: `Se habría borrado de forma segura '${path}' con ${passes} pasadas` +
                        (recursive ? " (modo recursivo)." : ".")
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            // 3. Borrado seguro real con shred
            try {
                // Nota: JSON.stringify(path) añade comillas, lo usamos como naive-escaping.
                const safePath = JSON.stringify(path);
                // Directorio: shred a cada archivo y luego rm -rf del directorio
                const shredCmd = stat.isDirectory()
                    ? `find ${safePath} -type f -exec shred -u -n ${passes} -z {} \\; && rm -rf ${safePath}`
                    : `shred -u -n ${passes} -z ${safePath}`;
                const { stdout, stderr } = await execAsync(shredCmd);
                const result = {
                    ok: true,
                    message: `Borrado seguro completado para '${path}'.`,
                    stdout,
                    stderr,
                    disclaimer: "Advertencia: en SSD/NVMe, sistemas de ficheros con journaling o snapshots, el borrado seguro no puede garantizar la destrucción física de los datos. Esto es sólo best-effort a nivel de sistema de archivos."
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
            catch (err) {
                const result = {
                    ok: false,
                    message: `Error al ejecutar shred: ${err?.message}`
                };
                return {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(result, null, 2)
                        }
                    ]
                };
            }
        }
        else {
            throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(`Invalid arguments: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
        }
        throw error;
    }
});
// ---------- Arranque del servidor ----------
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log to stderr since stdout is used for MCP communication
    console.error("MCP Secure Delete Server running on stdio");
}
main().catch((err) => {
    console.error("Error starting MCP server:", err);
    process.exit(1);
});
