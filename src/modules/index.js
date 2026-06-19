/**
 * Factory de módulos por país.
 * Cada módulo expone: generarXML(empresa, cliente, factura, items)
 *                     calcularUUID(factura)
 *                     getMetadata()
 */
const mexico   = require('./mexico');
const colombia = require('./colombia');
const peru     = require('./peru');
const chile    = require('./chile');
const ecuador  = require('./ecuador');

const adapters = {
  MX: mexico,
  CO: colombia,
  PE: peru,
  CL: chile,
  EC: ecuador
};

function getAdapter(paisCodigo) {
  const adapter = adapters[paisCodigo];
  if (!adapter) {
    throw new Error(`No existe módulo de facturación para el país: ${paisCodigo}`);
  }
  return adapter;
}

module.exports = { getAdapter, adapters };
