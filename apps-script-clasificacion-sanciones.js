/**
 * SISTEMA DE CLASIFICACIÓN AUTOMÁTICA DE SANCIONES
 * 
 * Este script automatiza la clasificación de sanciones en Google Sheets
 * utilizando Gemini API como método principal y reglas por palabras clave como respaldo.
 * 
 * Autor: Asistente IA
 * Versión: 1.0
 */

// ========================================
// CONFIGURACIÓN INICIAL
// ========================================

/**
 * Configuración del sistema
 */
const CONFIG = {
  // Columnas en la hoja (ajustar según tu estructura)
  COLUMNA_DESCRIPCION: 'B', // Columna donde está la descripción
  COLUMNA_TIPO_SANCION: 'C', // Columna donde se pondrá el resultado
  COLUMNA_AUDITORIA: 'D', // Columna para guardar información de auditoría
  
  // Nombre de la hoja (cambiar por el nombre de tu hoja)
  NOMBRE_HOJA: 'Sanciones',
  
  // Configuración de Gemini API
  GEMINI_API_KEY: '', // Dejar vacío inicialmente, se configurará después
  GEMINI_MODEL: 'gemini-1.5-flash',
  
  // Categorías de sanciones
  CATEGORIAS: {
    LEVE: 'Leve',
    GRAVE: 'Grave',
    MUY_GRAVE: 'Muy grave',
    NO_CLASIFICADO: 'No clasificado'
  }
};

// ========================================
// FUNCIÓN PRINCIPAL - EJECUTAR DESDE BOTÓN
// ========================================

/**
 * Función principal que se ejecuta desde el botón en la hoja
 * Clasifica todas las filas que tengan descripción pero no tengan tipo de sanción
 */
function clasificarSanciones() {
  try {
    const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.NOMBRE_HOJA);
    
    if (!hoja) {
      SpreadsheetApp.getUi().alert('Error', `No se encontró la hoja "${CONFIG.NOMBRE_HOJA}". Verifica el nombre en la configuración.`, SpreadsheetApp.getUi().Button.OK);
      return;
    }
    
    // Obtener todos los datos
    const ultimaFila = hoja.getLastRow();
    if (ultimaFila <= 1) {
      SpreadsheetApp.getUi().alert('Info', 'No hay datos para procesar.', SpreadsheetApp.getUi().Button.OK);
      return;
    }
    
    const descripciones = hoja.getRange(`${CONFIG.COLUMNA_DESCRIPCION}2:${CONFIG.COLUMNA_DESCRIPCION}${ultimaFila}`).getValues();
    const tiposSancion = hoja.getRange(`${CONFIG.COLUMNA_TIPO_SANCION}2:${CONFIG.COLUMNA_TIPO_SANCION}${ultimaFila}`).getValues();
    
    let procesadas = 0;
    let errores = 0;
    
    // Mostrar progreso
    SpreadsheetApp.getUi().alert('Iniciando', 'Comenzando la clasificación de sanciones...', SpreadsheetApp.getUi().Button.OK);
    
    // Procesar cada fila
    for (let i = 0; i < descripciones.length; i++) {
      const descripcion = descripciones[i][0];
      const tipoActual = tiposSancion[i][0];
      
      // Solo procesar si hay descripción y no hay tipo de sanción asignado
      if (descripcion && descripcion.toString().trim() !== '' && (!tipoActual || tipoActual.toString().trim() === '')) {
        try {
          const resultado = clasificarSancionIndividual(descripcion.toString());
          
          // Escribir resultado en la hoja
          hoja.getRange(`${CONFIG.COLUMNA_TIPO_SANCION}${i + 2}`).setValue(resultado.tipo);
          hoja.getRange(`${CONFIG.COLUMNA_AUDITORIA}${i + 2}`).setValue(resultado.auditoria);
          
          procesadas++;
          
          // Pausa pequeña para evitar límites de API
          Utilities.sleep(100);
          
        } catch (error) {
          console.error(`Error procesando fila ${i + 2}:`, error);
          hoja.getRange(`${CONFIG.COLUMNA_TIPO_SANCION}${i + 2}`).setValue(CONFIG.CATEGORIAS.NO_CLASIFICADO);
          hoja.getRange(`${CONFIG.COLUMNA_AUDITORIA}${i + 2}`).setValue(`Error: ${error.message}`);
          errores++;
        }
      }
    }
    
    // Mostrar resultado final
    SpreadsheetApp.getUi().alert('Completado', 
      `Proceso completado:\n` +
      `• Filas procesadas: ${procesadas}\n` +
      `• Errores: ${errores}\n\n` +
      `Revisa la columna "${CONFIG.COLUMNA_AUDITORIA}" para ver el detalle de cada clasificación.`, 
      SpreadsheetApp.getUi().Button.OK
    );
    
  } catch (error) {
    console.error('Error en clasificarSanciones:', error);
    SpreadsheetApp.getUi().alert('Error', `Error general: ${error.message}`, SpreadsheetApp.getUi().Button.OK);
  }
}

// ========================================
// CLASIFICACIÓN CON GEMINI API
// ========================================

/**
 * Clasifica una sanción individual usando Gemini API o reglas por palabras clave
 */
function clasificarSancionIndividual(descripcion) {
  // Intentar primero con Gemini API
  if (CONFIG.GEMINI_API_KEY && CONFIG.GEMINI_API_KEY.trim() !== '') {
    try {
      return clasificarConGemini(descripcion);
    } catch (error) {
      console.warn('Error con Gemini API, usando método de respaldo:', error);
    }
  }
  
  // Usar método de respaldo con palabras clave
  return clasificarConPalabrasClave(descripcion);
}

/**
 * Clasificación usando Gemini API
 */
function clasificarConGemini(descripcion) {
  const prompt = crearPromptGemini(descripcion);
  
  const payload = {
    contents: [{
      parts: [{
        text: prompt
      }]
    }],
    generationConfig: {
      temperature: 0.1,
      topK: 1,
      topP: 1,
      maxOutputTokens: 100
    }
  };
  
  const opciones = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload)
  };
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
  
  const respuesta = UrlFetchApp.fetch(url, opciones);
  const datos = JSON.parse(respuesta.getContentText());
  
  if (datos.candidates && datos.candidates[0] && datos.candidates[0].content) {
    const texto = datos.candidates[0].content.parts[0].text.trim();
    const tipo = extraerTipoSancion(texto);
    
    return {
      tipo: tipo,
      auditoria: `Gemini: ${texto.substring(0, 100)}${texto.length > 100 ? '...' : ''}`
    };
  } else {
    throw new Error('Respuesta inválida de Gemini API');
  }
}

/**
 * Crea el prompt optimizado para Gemini
 */
function crearPromptGemini(descripcion) {
  return `Eres un experto en clasificación de sanciones laborales. Tu tarea es clasificar la siguiente descripción de una falta en una de estas tres categorías exactas:

CATEGORÍAS:
- Leve: Faltas menores que no afectan significativamente el trabajo (retrasos menores, pequeñas infracciones de dress code, etc.)
- Grave: Faltas importantes que afectan el desempeño o ambiente laboral (ausencias injustificadas, incumplimiento de procedimientos importantes, etc.)
- Muy grave: Faltas severas que pueden justificar despido (violencia, robo, acoso, negligencia grave, etc.)

DESCRIPCIÓN A CLASIFICAR: "${descripcion}"

INSTRUCCIONES:
1. Responde ÚNICAMENTE con una de estas palabras exactas: "Leve", "Grave", "Muy grave", o "No clasificado"
2. Si la descripción no es clara o no se refiere a una falta laboral, responde "No clasificado"
3. Basa tu decisión en la severidad del impacto en el trabajo y las consecuencias potenciales

RESPUESTA:`;
}

// ========================================
// CLASIFICACIÓN CON PALABRAS CLAVE (RESPALDO)
// ========================================

/**
 * Clasificación usando reglas basadas en palabras clave
 */
function clasificarConPalabrasClave(descripcion) {
  const texto = descripcion.toLowerCase().trim();
  
  // Palabras clave para cada categoría
  const palabrasClaveGrave = [
    'ausencia injustificada', 'falta injustificada', 'abandono', 'negligencia',
    'incumplimiento grave', 'daño', 'pérdida', 'accidente por negligencia',
    'desobediencia', 'insubordinación', 'conducta inapropiada', 'conflicto grave'
  ];
  
  const palabrasClaveMuyGrave = [
    'violencia', 'agresión', 'robo', 'hurto', 'fraude', 'acoso',
    'discriminación', 'embriaguez', 'drogas', 'sustancias', 'amenaza',
    'sabotaje', 'corrupción', 'revelación de información', 'confidencial'
  ];
  
  const palabrasClaveLeve = [
    'retraso', 'tardanza', 'uniforme', 'dress code', 'apariencia',
    'teléfono personal', 'celular', 'pequeña falta', 'menor',
    'olvido menor', 'distracción', 'conversación excesiva'
  ];
  
  // Verificar categoría Muy Grave primero
  for (const palabra of palabrasClaveMuyGrave) {
    if (texto.includes(palabra)) {
      return {
        tipo: CONFIG.CATEGORIAS.MUY_GRAVE,
        auditoria: `Palabra clave: "${palabra}"`
      };
    }
  }
  
  // Verificar categoría Grave
  for (const palabra of palabrasClaveGrave) {
    if (texto.includes(palabra)) {
      return {
        tipo: CONFIG.CATEGORIAS.GRAVE,
        auditoria: `Palabra clave: "${palabra}"`
      };
    }
  }
  
  // Verificar categoría Leve
  for (const palabra of palabrasClaveLeve) {
    if (texto.includes(palabra)) {
      return {
        tipo: CONFIG.CATEGORIAS.LEVE,
        auditoria: `Palabra clave: "${palabra}"`
      };
    }
  }
  
  // Si no coincide con ninguna palabra clave
  return {
    tipo: CONFIG.CATEGORIAS.NO_CLASIFICADO,
    auditoria: 'Sin coincidencias en palabras clave'
  };
}

// ========================================
// FUNCIONES AUXILIARES
// ========================================

/**
 * Extrae el tipo de sanción de la respuesta de Gemini
 */
function extraerTipoSancion(texto) {
  const textoLimpio = texto.toLowerCase().trim();
  
  if (textoLimpio.includes('muy grave')) return CONFIG.CATEGORIAS.MUY_GRAVE;
  if (textoLimpio.includes('grave')) return CONFIG.CATEGORIAS.GRAVE;
  if (textoLimpio.includes('leve')) return CONFIG.CATEGORIAS.LEVE;
  if (textoLimpio.includes('no clasificado')) return CONFIG.CATEGORIAS.NO_CLASIFICADO;
  
  return CONFIG.CATEGORIAS.NO_CLASIFICADO;
}

// ========================================
// FUNCIONES DE CONFIGURACIÓN
// ========================================

/**
 * Función para configurar la API Key de Gemini
 */
function configurarGeminiAPI() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.prompt(
    'Configurar Gemini API',
    'Ingresa tu API Key de Gemini (obtenerla en https://makersuite.google.com/app/apikey):',
    ui.Button.OK_CANCEL
  );
  
  if (respuesta.getSelectedButton() === ui.Button.OK) {
    const apiKey = respuesta.getResponseText().trim();
    if (apiKey) {
      // Guardar en propiedades del script
      PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', apiKey);
      CONFIG.GEMINI_API_KEY = apiKey;
      ui.alert('Configuración guardada', 'API Key de Gemini configurada correctamente.', ui.Button.OK);
    } else {
      ui.alert('Error', 'API Key no puede estar vacía.', ui.Button.OK);
    }
  }
}

/**
 * Función para cargar la configuración al iniciar
 */
function cargarConfiguracion() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (apiKey) {
    CONFIG.GEMINI_API_KEY = apiKey;
  }
}

/**
 * Función de prueba para verificar una clasificación individual
 */
function probarClasificacion() {
  const ui = SpreadsheetApp.getUi();
  const respuesta = ui.prompt(
    'Probar Clasificación',
    'Ingresa una descripción para probar la clasificación:',
    ui.Button.OK_CANCEL
  );
  
  if (respuesta.getSelectedButton() === ui.Button.OK) {
    const descripcion = respuesta.getResponseText().trim();
    if (descripcion) {
      cargarConfiguracion();
      const resultado = clasificarSancionIndividual(descripcion);
      ui.alert(
        'Resultado de la prueba',
        `Descripción: "${descripcion}"\n\n` +
        `Clasificación: ${resultado.tipo}\n` +
        `Auditoría: ${resultado.auditoria}`,
        ui.Button.OK
      );
    }
  }
}

// ========================================
// INICIALIZACIÓN
// ========================================

/**
 * Función que se ejecuta al abrir la hoja para cargar configuración
 */
function onOpen() {
  cargarConfiguracion();
  
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🤖 Clasificación de Sanciones')
    .addItem('📊 Clasificar todas las sanciones', 'clasificarSanciones')
    .addSeparator()
    .addItem('⚙️ Configurar Gemini API', 'configurarGeminiAPI')
    .addItem('🧪 Probar clasificación', 'probarClasificacion')
    .addSeparator()
    .addItem('❓ Ver instrucciones', 'mostrarInstrucciones')
    .addToUi();
}

/**
 * Muestra las instrucciones de uso
 */
function mostrarInstrucciones() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    'Instrucciones de uso',
    'PASOS PARA USAR EL SISTEMA:\n\n' +
    '1. Asegúrate de tener columnas:\n' +
    '   • Columna B: Descripción\n' +
    '   • Columna C: Tipo de sanción (se llenará automáticamente)\n' +
    '   • Columna D: Auditoría (información del proceso)\n\n' +
    '2. Para mejor precisión, configura Gemini API:\n' +
    '   • Ve a: https://makersuite.google.com/app/apikey\n' +
    '   • Crea una API Key gratuita\n' +
    '   • Usa "⚙️ Configurar Gemini API" en el menú\n\n' +
    '3. Usa "📊 Clasificar todas las sanciones" para procesar todo\n\n' +
    '4. Usa "🧪 Probar clasificación" para pruebas individuales\n\n' +
    'El sistema funciona sin Gemini usando palabras clave como respaldo.',
    ui.Button.OK
  );
}