/**
 * Cadena Original CFDI 4.0 - SAT México
 *
 * Implementación directa de la transformación XSLT publicada por el SAT
 * para generar la cadena original del CFDI versión 4.0.
 * Referencia: http://www.sat.gob.mx/sitio_internet/cfd/4/cadenaoriginal_TFD_1_1.xslt
 *
 * La cadena original es una secuencia de datos del CFDI separados por '|'
 * que forma la base del sello digital.
 */

/**
 * Extrae atributos de un nodo XML usando regex (evita dependencia de parser completo)
 */
function getAttr(xml, nodeName, attrName) {
  const nodeRegex = new RegExp(`<(?:cfdi:)?${nodeName}[^>]*>|<(?:cfdi:)?${nodeName}[^/]*/>`,'i');
  const nodeMatch = xml.match(nodeRegex);
  if (!nodeMatch) return null;
  const attrRegex = new RegExp(`${attrName}="([^"]*)"`, 'i');
  const attrMatch = nodeMatch[0].match(attrRegex);
  return attrMatch ? attrMatch[1] : null;
}

function getAttrs(xml, nodeName, attrNames) {
  const nodeRegex = new RegExp(`<(?:cfdi:)?${nodeName}(?:\\s[^>]*)?>|<(?:cfdi:)?${nodeName}(?:\\s[^/]*)?\\/>`,'');
  const nodeMatch = xml.match(nodeRegex);
  if (!nodeMatch) return {};
  const node = nodeMatch[0];
  const result = {};
  for (const attr of attrNames) {
    const m = node.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
    result[attr] = m ? m[1] : null;
  }
  return Object.fromEntries(Object.entries(result).filter(([, v]) => v !== null));
}

/**
 * Genera la cadena original del CFDI 4.0
 * Sigue el orden exacto definido en el XSLT del SAT
 */
function generarCadenaOriginal(xmlCFDI) {
  const parts = ['||'];

  // cfdi:Comprobante — atributos en orden XSLT
  const comprobante = getAttrs(xmlCFDI, 'Comprobante', [
    'Version','Serie','Folio','Fecha','Sello','FormaPago','NoCertificado',
    'Certificado','CondicionesDePago','SubTotal','Descuento','Moneda',
    'TipoCambio','Total','TipoDeComprobante','Exportacion','MetodoPago',
    'LugarExpedicion','Confirmacion'
  ]);
  // Excluir Sello y Certificado de la cadena (se añaden después)
  const excluir = ['Sello', 'Certificado'];
  for (const [k, v] of Object.entries(comprobante)) {
    if (!excluir.includes(k) && v) parts.push(v);
  }
  parts.push('|');

  // cfdi:InformacionGlobal (opcional)
  const infoGlobal = getAttrs(xmlCFDI, 'InformacionGlobal',
    ['Periodicidad','Meses','Año']);
  if (Object.keys(infoGlobal).length) {
    for (const v of Object.values(infoGlobal)) if (v) parts.push(v);
    parts.push('|');
  }

  // cfdi:CfdiRelacionados (puede haber varios)
  const relRegex = /<cfdi:CfdiRelacionados[^>]*TipoRelacion="([^"]*)"[^>]*>/g;
  let relMatch;
  while ((relMatch = relRegex.exec(xmlCFDI)) !== null) {
    parts.push(relMatch[1]);
    // cfdi:CfdiRelacionado
    const uuidRegex = /UUID="([^"]*)"/g;
    let uuidMatch;
    while ((uuidMatch = uuidRegex.exec(xmlCFDI)) !== null) {
      parts.push(uuidMatch[1]);
    }
    parts.push('|');
  }

  // cfdi:Emisor
  const emisor = getAttrs(xmlCFDI, 'Emisor', ['Rfc','Nombre','RegimenFiscal']);
  for (const v of Object.values(emisor)) if (v) parts.push(v);
  parts.push('|');

  // cfdi:Receptor
  const receptor = getAttrs(xmlCFDI, 'Receptor', [
    'Rfc','Nombre','DomicilioFiscalReceptor','ResidenciaFiscal',
    'NumRegIdTrib','RegimenFiscalReceptor','UsoCFDI'
  ]);
  for (const v of Object.values(receptor)) if (v) parts.push(v);
  parts.push('|');

  // cfdi:Conceptos → cfdi:Concepto (cada uno)
  const conceptoRegex = /<cfdi:Concepto\s([^>]*\/?>)/g;
  let conceptoMatch;
  while ((conceptoMatch = conceptoRegex.exec(xmlCFDI)) !== null) {
    const concepto = conceptoMatch[1];
    const conceptoAttrs = [
      'ClaveProdServ','NoIdentificacion','Cantidad','ClaveUnidad','Unidad',
      'Descripcion','ValorUnitario','Importe','Descuento','ObjetoImp'
    ];
    for (const attr of conceptoAttrs) {
      const m = concepto.match(new RegExp(`${attr}="([^"]*)"`));
      if (m) parts.push(m[1]);
    }
    // Impuestos del concepto (traslados y retenciones)
    // Traslados
    const trasladosRegex = new RegExp(
      `<cfdi:Traslado\\s([^>]*?)>`, 'g');
    let trasladoMatch;
    while ((trasladoMatch = trasladosRegex.exec(xmlCFDI)) !== null) {
      const t = trasladoMatch[1];
      for (const a of ['Base','Impuesto','TipoFactor','TasaOCuota','Importe']) {
        const m = t.match(new RegExp(`${a}="([^"]*)"`));
        if (m) parts.push(m[1]);
      }
    }
    parts.push('|');
  }

  // cfdi:Impuestos (totales)
  const impuestosAttrs = getAttrs(xmlCFDI, 'Impuestos',
    ['TotalImpuestosRetenidos','TotalImpuestosTrasladados']);
  for (const v of Object.values(impuestosAttrs)) if (v) parts.push(v);

  // Retenciones globales
  const retRegex = /<(?:cfdi:)?Retencion\s([^>]*?)>/g;
  let retMatch;
  while ((retMatch = retRegex.exec(xmlCFDI)) !== null) {
    for (const a of ['Impuesto','Importe']) {
      const m = retMatch[1].match(new RegExp(`${a}="([^"]*)"`));
      if (m) parts.push(m[1]);
    }
  }

  // Traslados globales
  const trasGlobRegex = /<(?:cfdi:)?Traslado\s([^>]*?)>/g;
  let trasGlobMatch;
  while ((trasGlobMatch = trasGlobRegex.exec(xmlCFDI)) !== null) {
    for (const a of ['Impuesto','TipoFactor','TasaOCuota','Importe']) {
      const m = trasGlobMatch[1].match(new RegExp(`${a}="([^"]*)"`));
      if (m) parts.push(m[1]);
    }
  }

  parts.push('||');
  return parts.join('');
}

module.exports = { generarCadenaOriginal };
