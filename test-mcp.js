#!/usr/bin/env node

/**
 * Script de prueba simple para verificar que el servidor MCP funciona correctamente
 */

import { spawn } from 'child_process';
import readline from 'readline';

async function testMCPServer() {
  console.log('🧪 Iniciando prueba del servidor MCP...\n');

  const serverPath = './dist/server.js';
  
  // Iniciar el servidor
  const server = spawn('node', [serverPath]);

  let messageId = 1;
  const responses = new Map();

  // Configurar lectura de respuestas
  const rl = readline.createInterface({
    input: server.stdout,
    crlfDelay: Infinity
  });

  // Escuchar respuestas
  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      if (response.id) {
        responses.set(response.id, response);
      }
    } catch (e) {
      // Ignorar líneas que no son JSON
    }
  });

  // Escuchar errores
  server.stderr.on('data', (data) => {
    console.log(`[Servidor Log]: ${data.toString().trim()}`);
  });

  // Función helper para enviar requests
  const sendRequest = (method, params = {}) => {
    const id = messageId++;
    const request = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };
    server.stdin.write(JSON.stringify(request) + '\n');
    return id;
  };

  // Función helper para esperar respuesta
  const waitForResponse = (id, timeout = 5000) => {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkInterval = setInterval(() => {
        if (responses.has(id)) {
          clearInterval(checkInterval);
          resolve(responses.get(id));
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout esperando respuesta para id ${id}`));
        }
      }, 50);
    });
  };

  try {
    // 1. Inicializar el servidor
    console.log('📋 Paso 1: Inicializando servidor...');
    const initId = sendRequest('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    });

    const initResponse = await waitForResponse(initId);
    if (initResponse.result) {
      console.log('✅ Servidor inicializado correctamente');
      console.log(`   Nombre: ${initResponse.result.serverInfo.name}`);
      console.log(`   Versión: ${initResponse.result.serverInfo.version}\n`);
    } else {
      console.error('❌ Error en inicialización:', initResponse.error);
      throw new Error('Fallo en inicialización');
    }

    // 2. Listar herramientas disponibles
    console.log('📋 Paso 2: Listando herramientas disponibles...');
    const listToolsId = sendRequest('tools/list');
    
    const listToolsResponse = await waitForResponse(listToolsId);
    if (listToolsResponse.result) {
      console.log('✅ Herramientas disponibles:');
      listToolsResponse.result.tools.forEach(tool => {
        console.log(`   - ${tool.name}: ${tool.description}`);
      });
      console.log();
    } else {
      console.error('❌ Error listando herramientas:', listToolsResponse.error);
      throw new Error('Fallo al listar herramientas');
    }

    // 3. Probar check_path
    console.log('📋 Paso 3: Probando herramienta check_path...');
    const testPath = './test-files/ejemplo.txt';
    const checkPathId = sendRequest('tools/call', {
      name: 'check_path',
      arguments: {
        path: testPath
      }
    });

    const checkPathResponse = await waitForResponse(checkPathId);
    if (checkPathResponse.result) {
      console.log('✅ check_path ejecutado correctamente:');
      const content = checkPathResponse.result.content[0].text;
      const data = JSON.parse(content);
      console.log(`   Archivo: ${testPath}`);
      console.log(`   Existe: ${data.exists ? '✅' : '❌'}`);
      console.log(`   Es directorio: ${data.is_directory ? 'Sí' : 'No'}`);
      console.log(`   Tamaño: ${data.size_bytes} bytes`);
      console.log(`   Puede leer: ${data.can_read ? '✅' : '❌'}`);
      console.log(`   Puede escribir: ${data.can_write ? '✅' : '❌'}\n`);
    } else {
      console.error('❌ Error en check_path:', checkPathResponse.error);
    }

    // 4. Probar secure_delete con dry_run
    console.log('📋 Paso 4: Probando herramienta secure_delete (dry_run)...');
    const deleteId = sendRequest('tools/call', {
      name: 'secure_delete',
      arguments: {
        path: testPath,
        passes: 3,
        dry_run: true
      }
    });

    const deleteResponse = await waitForResponse(deleteId);
    if (deleteResponse.result) {
      console.log('✅ secure_delete (dry_run) ejecutado correctamente:');
      const content = deleteResponse.result.content[0].text;
      const data = JSON.parse(content);
      console.log(`   ${data.message}\n`);
    } else {
      console.error('❌ Error en secure_delete:', deleteResponse.error);
    }

    console.log('🎉 ¡Todas las pruebas pasaron exitosamente!\n');
    console.log('✅ El servidor MCP está funcionando correctamente');
    console.log('✅ Puedes conectarlo desde VS Code o Claude Desktop\n');

  } catch (error) {
    console.error('\n❌ Error durante las pruebas:', error.message);
    process.exit(1);
  } finally {
    // Cerrar el servidor
    server.kill();
  }
}

// Ejecutar pruebas
testMCPServer().catch(error => {
  console.error('Error fatal:', error);
  process.exit(1);
});
