/**
 * Script para sembrar datos (seeder) y popular el Dashboard de FactuElectrónica.
 * Ejecución: node scripts/seed-dashboard.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const randomDate = (start, end) => {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const formatDate = (date) => {
    return date.toISOString().slice(0, 19).replace('T', ' ');
};

(async () => {
    console.log('Iniciando carga de 10 registros por módulo para Dashboard...');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'integrador1_facturacionelectronica',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        multipleStatements: true
    });

    try {
        // 1. OBTENER EMPRESAS ACTUALES
        const [empresas] = await conn.query('SELECT id, pais_id FROM empresas');
        if (empresas.length === 0) throw new Error('No hay empresas en la base de datos');

        // 2. INSERTAR 10 CLIENTES (2 por empresa para tener 10 en total)
        console.log('Generando 10 clientes...');
        for (let i = 1; i <= 10; i++) {
            const empresa = empresas[i % empresas.length];
            await conn.query(`
                INSERT INTO clientes (empresa_id, pais_id, tipo_identificacion, identificacion, tipo_persona, razon_social, email, direccion) 
                VALUES (?, ?, 'RUC', ?, 'moral', ?, ?, 'Dirección Generada ${i}')
            `, [empresa.id, empresa.pais_id, `100${Date.now().toString().slice(-6)}${i}`, `Cliente Semilla ${Date.now().toString().slice(-4)}${i} SA`, `cliente${Date.now().toString().slice(-4)}${i}@semilla.com`]);
        }

        // 3. INSERTAR 10 PRODUCTOS (2 por empresa)
        console.log('Generando 10 productos...');
        for (let i = 1; i <= 10; i++) {
            const empresa = empresas[i % empresas.length];
            await conn.query(`
                INSERT INTO productos (empresa_id, codigo, descripcion, tipo, unidad_medida, precio_unitario, iva_porcentaje) 
                VALUES (?, ?, ?, 'producto', 'UND', ?, 16.00)
            `, [empresa.id, `PROD-${Date.now().toString().slice(-4)}-${i}`, `Producto Semilla ${Date.now().toString().slice(-4)} ${i}`, 100 + (Math.random() * 900)]);
        }

        // 4. INSERTAR 10 USUARIOS VENDEDORES
        console.log('Generando 10 usuarios...');
        for (let i = 1; i <= 10; i++) {
            await conn.query(`
                INSERT INTO usuarios (nombre, apellido, email, password_hash, rol) 
                VALUES (?, ?, ?, 'hash_dummy', 'vendedor')
            `, [`Vendedor ${i}`, 'Semilla', `vendedor${Date.now().toString().slice(-5)}${i}@semilla.com`]);
        }

        // 5. INSERTAR 50 FACTURAS (10 para las graficas por país/empresa) distribuidas en los últimos 6 meses
        console.log('Generando facturas históricas para gráficos...');
        const [clientesDb] = await conn.query('SELECT id, empresa_id, pais_id FROM clientes');
        const estados = ['emitidas', 'borradores', 'canceladas'];
        
        const now = new Date();
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(now.getMonth() - 5);

        let folioGlobal = 2000; // Un folio alto para no chocar

        for (let i = 1; i <= 50; i++) { // 50 facturas en total
            const cliente = clientesDb[i % clientesDb.length];
            const fechaRandom = randomDate(sixMonthsAgo, now);
            const subtotal = Math.round(500 + Math.random() * 5000);
            const iva = subtotal * 0.16;
            const total = subtotal + iva;
            
            // Probabilidad de estados: 70% emitidas, 15% borradores, 15% canceladas
            const rand = Math.random();
            let estado = 'emitida';
            if (rand > 0.85) estado = 'cancelada';
            else if (rand > 0.70) estado = 'borrador';

            const [resFactura] = await conn.query(`
                INSERT INTO facturas (empresa_id, cliente_id, pais_id, serie, folio, fecha_emision, subtotal, total_iva, total, estado)
                VALUES (?, ?, ?, 'F-SEM', ?, ?, ?, ?, ?, ?)
            `, [cliente.empresa_id, cliente.id, cliente.pais_id, folioGlobal++, formatDate(fechaRandom), subtotal, iva, total, estado]);

            // Detalle de factura (Items)
            const [productosDb] = await conn.query('SELECT id, descripcion, precio_unitario FROM productos WHERE empresa_id = ? LIMIT 1', [cliente.empresa_id]);
            if (productosDb.length > 0) {
                const prod = productosDb[0];
                await conn.query(`
                    INSERT INTO factura_items (factura_id, producto_id, descripcion, cantidad, precio_unitario, iva_porcentaje, iva_monto, importe, total)
                    VALUES (?, ?, ?, 1, ?, 16.00, ?, ?, ?)
                `, [resFactura.insertId, prod.id, prod.descripcion, subtotal, iva, subtotal, total]);
            }
        }

        console.log('✓ Proceso completado. Datos semilla insertados correctamente.');
    } catch (err) {
        console.error('✗ Error:', err.message);
    } finally {
        await conn.end();
    }
})();
