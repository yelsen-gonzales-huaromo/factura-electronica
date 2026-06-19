/**
 * Factory de PAC para México
 * Selecciona el PAC según la configuración de la empresa
 */
const finkok   = require('./finkok');
const swsapien = require('./swsapien');

const PACS = {
  finkok,
  sw_sapien: swsapien,
  swsapien,
};

function getPAC(nombre) {
  const pac = PACS[nombre?.toLowerCase()];
  if (!pac) throw new Error(`PAC no soportado: ${nombre}. Opciones: finkok, sw_sapien`);
  return pac;
}

module.exports = { getPAC, finkok, swsapien };
