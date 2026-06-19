const { pool } = require('../config/db');

exports.dashboard = async (req, res) => {
  try {
    const empresa_id = req.query.empresa_id;
    const params = empresa_id ? [empresa_id] : [];
    const empresaFilter = empresa_id ? 'WHERE empresa_id = ?' : '';

    // Totales generales
    const [tot] = await pool.query(
      `SELECT
         COUNT(*) AS total_facturas,
         SUM(CASE WHEN estado='emitida' OR estado='timbrada' THEN 1 ELSE 0 END) AS emitidas,
         SUM(CASE WHEN estado='borrador' THEN 1 ELSE 0 END) AS borradores,
         SUM(CASE WHEN estado='cancelada' THEN 1 ELSE 0 END) AS canceladas,
         COALESCE(SUM(CASE WHEN estado IN ('emitida','timbrada') THEN total END), 0) AS monto_total,
         COALESCE(SUM(CASE WHEN estado IN ('emitida','timbrada') THEN total_iva END), 0) AS iva_total
       FROM facturas ${empresaFilter}`, params);

    // Por país
    const [porPais] = await pool.query(
      `SELECT p.nombre AS pais, p.codigo AS codigo, COUNT(f.id) AS facturas,
              COALESCE(SUM(CASE WHEN f.estado IN ('emitida','timbrada') THEN f.total END), 0) AS total
         FROM paises p
         LEFT JOIN facturas f ON f.pais_id = p.id ${empresa_id ? 'AND f.empresa_id = ?' : ''}
        GROUP BY p.id, p.nombre, p.codigo
        ORDER BY total DESC`, params);

    // Por mes (últimos 6 meses)
    const [porMes] = await pool.query(
      `SELECT DATE_FORMAT(fecha_emision, '%Y-%m') AS mes,
              COUNT(*) AS facturas,
              SUM(total) AS total
         FROM facturas
        WHERE estado IN ('emitida','timbrada')
          AND fecha_emision >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
          ${empresa_id ? 'AND empresa_id = ?' : ''}
        GROUP BY mes ORDER BY mes`, params);

    // Top clientes
    const [topClientes] = await pool.query(
      `SELECT c.razon_social, c.identificacion, COUNT(f.id) AS facturas, SUM(f.total) AS total
         FROM facturas f JOIN clientes c ON c.id = f.cliente_id
        WHERE f.estado IN ('emitida','timbrada') ${empresa_id ? 'AND f.empresa_id = ?' : ''}
        GROUP BY c.id, c.razon_social, c.identificacion
        ORDER BY total DESC LIMIT 5`, params);

    res.json({
      success: true,
      data: {
        totales: tot[0],
        porPais,
        porMes,
        topClientes
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.facturasPeriodo = async (req, res) => {
  try {
    const { empresa_id, fecha_desde, fecha_hasta } = req.query;
    const [rows] = await pool.query(
      `SELECT f.id, f.serie, f.folio, f.fecha_emision, f.estado, f.total, f.total_iva,
              c.razon_social AS cliente, c.identificacion AS cliente_id,
              p.codigo AS pais_codigo
         FROM facturas f
         JOIN clientes c ON c.id = f.cliente_id
         JOIN paises p ON p.id = f.pais_id
        WHERE f.empresa_id = ?
          AND f.fecha_emision BETWEEN ? AND ?
        ORDER BY f.fecha_emision DESC`,
      [empresa_id, fecha_desde, fecha_hasta + ' 23:59:59']);
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
