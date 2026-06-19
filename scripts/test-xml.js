const { getAdapter } = require('../src/modules');

const empresa = {
  pais_id: 1, identificacion_fiscal: 'XAXX010101000', razon_social: 'Empresa Demo SA',
  nombre_comercial: 'Demo', direccion: 'Av. Reforma 100', ciudad: 'CDMX',
  codigo_postal: '06600', regimen_fiscal: '601', ambiente: 'pruebas'
};
const cliente = {
  pais_id: 1, tipo_identificacion: 'RFC', identificacion: 'CACX7605101P8',
  razon_social: 'Cliente Demo', codigo_postal: '03100', uso_cfdi: 'G03',
  regimen_fiscal: '612', direccion: 'Calle 123', ciudad: 'CDMX'
};
const factura = {
  serie: 'A', folio: 1, tipo_documento: 'factura',
  fecha_emision: new Date(), forma_pago: '01', metodo_pago: 'PUE',
  moneda: 'MXN', tipo_cambio: 1, condiciones_pago: 'Contado',
  subtotal: 1500.00, descuento: 0, total_iva: 240.00, total_ieps: 0,
  total: 1740.00, lugar_expedicion: '06600'
};
const items = [{
  codigo: 'PROD-001', codigo_sat: '01010101', descripcion: 'Servicio consultoria',
  unidad_medida: 'SVC', cantidad: 1, precio_unitario: 1500.00, descuento: 0,
  iva_porcentaje: 16, iva_monto: 240.00, importe: 1500.00, total: 1740.00
}];

['MX','CO','PE','CL','EC'].forEach(codigo => {
  const adapter = getAdapter(codigo);
  const meta = adapter.getMetadata();
  const uuid = adapter.generarUUID(factura, empresa);
  const xml = adapter.generarXML({ empresa, cliente, factura, items });
  console.log('\n========= ' + codigo + ' - ' + meta.pais + ' (' + meta.autoridad + ') =========');
  console.log('UUID/CUFE/Clave: ' + String(uuid).substring(0, 50) + '...');
  console.log('XML length: ' + xml.length + ' bytes');
  console.log(xml.split('\n').slice(0, 5).join('\n'));
});
console.log('\n[OK] Todos los modulos generan XML correctamente');
