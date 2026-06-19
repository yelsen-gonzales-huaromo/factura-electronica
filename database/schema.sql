-- ============================================================
--  INTEGRADOR DE FACTURACIÓN ELECTRÓNICA - LOCALIZADO PERÚ (HUARAZ)
--  Base de datos: integrador1_facturacionelectronica
--  Consolidación de esquema y Migraciones - Enfoque SUNAT Perú
-- ============================================================

DROP DATABASE IF EXISTS integrador1_facturacionelectronica;
CREATE DATABASE integrador1_facturacionelectronica
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE integrador1_facturacionelectronica;

-- ============================================================
-- 1. PAÍSES (catálogo)
-- ============================================================
CREATE TABLE paises (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo CHAR(2) NOT NULL UNIQUE,        -- ISO 3166-1 alpha-2 (PE)
  nombre VARCHAR(100) NOT NULL,
  moneda_codigo CHAR(3) NOT NULL,        -- PEN
  moneda_simbolo VARCHAR(5) NOT NULL,
  autoridad_fiscal VARCHAR(50) NOT NULL, -- SUNAT
  formato_documento VARCHAR(50) NOT NULL,-- UBL 2.1
  iva_general DECIMAL(5,2) NOT NULL,     -- 18.00 (IGV)
  activo TINYINT(1) DEFAULT 1
) ENGINE=InnoDB;

-- ============================================================
-- 2. USUARIOS DEL SISTEMA
-- ============================================================
CREATE TABLE usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  rol ENUM('admin', 'contador', 'vendedor', 'consulta') DEFAULT 'vendedor',
  activo TINYINT(1) DEFAULT 1,
  ultimo_login DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- 3. EMPRESAS EMISORAS (multi-empresa localizadas en Huaraz)
-- ============================================================
CREATE TABLE empresas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pais_id INT NOT NULL,
  identificacion_fiscal VARCHAR(30) NOT NULL,  -- RUC
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  direccion VARCHAR(255),
  ciudad VARCHAR(100),
  estado_provincia VARCHAR(100),
  codigo_postal VARCHAR(20),
  telefono VARCHAR(30),
  email VARCHAR(150),
  regimen_fiscal VARCHAR(100),                  -- Régimen tributario SUNAT
  ambiente ENUM('produccion', 'pruebas') DEFAULT 'pruebas',
  certificado_path VARCHAR(255) NULL,           -- Certificado .pfx/.pem
  llave_privada_path VARCHAR(255) NULL,
  certificado_password VARCHAR(255) NULL,       -- Contraseña certificado
  pac_proveedor VARCHAR(100),                   -- OSE / SUNAT
  pac_usuario VARCHAR(100),
  pac_password VARCHAR(255) NULL,
  pac_token TEXT NULL,
  no_certificado VARCHAR(50) NULL,
  cert_vencimiento DATE NULL,
  modo_emision ENUM('simulado','produccion') DEFAULT 'simulado',
  logo_path VARCHAR(255),
  activo TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_empresa_fiscal (pais_id, identificacion_fiscal),
  FOREIGN KEY (pais_id) REFERENCES paises(id)
) ENGINE=InnoDB;

CREATE INDEX idx_empresas_modo ON empresas(modo_emision);

-- ============================================================
-- 4. RELACIÓN USUARIO ↔ EMPRESA
-- ============================================================
CREATE TABLE usuario_empresa (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  empresa_id INT NOT NULL,
  es_principal TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_usuario_empresa (usuario_id, empresa_id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 5. SERIES Y FOLIOS (SUNAT: Factura F001/F002, Boleta B001/B002)
-- ============================================================
CREATE TABLE series_documentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  tipo_documento ENUM('factura','nota_credito','nota_debito','boleta','recibo') NOT NULL,
  serie VARCHAR(10) NOT NULL,
  folio_actual INT DEFAULT 0,
  folio_inicial INT DEFAULT 1,
  folio_final INT DEFAULT 999999,
  activo TINYINT(1) DEFAULT 1,
  UNIQUE KEY uk_serie (empresa_id, tipo_documento, serie),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 6. CLIENTES (receptores SUNAT: RUC o DNI)
-- ============================================================
CREATE TABLE clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  pais_id INT NOT NULL,
  tipo_identificacion VARCHAR(20) NOT NULL,    -- RUC, DNI
  identificacion VARCHAR(30) NOT NULL,
  tipo_persona ENUM('fisica','moral') DEFAULT 'fisica',
  razon_social VARCHAR(200) NOT NULL,
  nombre_comercial VARCHAR(200),
  email VARCHAR(150),
  telefono VARCHAR(30),
  direccion VARCHAR(255),
  ciudad VARCHAR(100),
  estado_provincia VARCHAR(100),
  codigo_postal VARCHAR(20),
  uso_cfdi VARCHAR(10),                         -- N/A en Perú (se mantiene columna por compatibilidad)
  regimen_fiscal VARCHAR(20),
  activo TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_cliente_emp (empresa_id, identificacion),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  FOREIGN KEY (pais_id) REFERENCES paises(id)
) ENGINE=InnoDB;

-- ============================================================
-- 7. PRODUCTOS / SERVICIOS (Con clave SUNAT)
-- ============================================================
CREATE TABLE productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  codigo VARCHAR(50) NOT NULL,
  codigo_sat VARCHAR(20),                      -- Código SUNAT
  descripcion VARCHAR(255) NOT NULL,
  tipo ENUM('producto', 'servicio') DEFAULT 'producto',
  unidad_medida VARCHAR(20) NOT NULL,          -- NIU, GLN, SVC, etc.
  precio_unitario DECIMAL(15,4) NOT NULL,
  iva_porcentaje DECIMAL(5,2) DEFAULT 0,       -- IGV 18%
  ieps_porcentaje DECIMAL(5,2) DEFAULT 0,
  retencion_iva DECIMAL(5,2) DEFAULT 0,
  retencion_isr DECIMAL(5,2) DEFAULT 0,
  exento TINYINT(1) DEFAULT 0,
  stock DECIMAL(15,2) DEFAULT 0,
  activo TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_producto_emp (empresa_id, codigo),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================
-- 8. FACTURAS / COMPROBANTES DE PAGO ELECTRONICOS SUNAT
-- ============================================================
CREATE TABLE facturas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id INT NOT NULL,
  cliente_id INT NOT NULL,
  pais_id INT NOT NULL,
  tipo_documento ENUM('factura','nota_credito','nota_debito','boleta','recibo') DEFAULT 'factura',
  serie VARCHAR(10) NOT NULL,
  folio INT NOT NULL,
  uuid VARCHAR(40),                             -- Firma hash CPE / Sunat ticket
  fecha_emision DATETIME NOT NULL,
  fecha_vencimiento DATE NULL,
  moneda CHAR(3) NOT NULL DEFAULT 'PEN',
  tipo_cambio DECIMAL(10,4) DEFAULT 1,
  forma_pago VARCHAR(10),                       -- 01 efectivo, 03 transferencia, etc.
  metodo_pago VARCHAR(10),                      -- Contado / Crédito
  condiciones_pago VARCHAR(100),
  uso_cfdi VARCHAR(10),
  lugar_expedicion VARCHAR(20),
  subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_iva DECIMAL(15,2) NOT NULL DEFAULT 0,   -- IGV Total
  total_ieps DECIMAL(15,2) NOT NULL DEFAULT 0,
  total_retenciones DECIMAL(15,2) NOT NULL DEFAULT 0,
  total DECIMAL(15,2) NOT NULL DEFAULT 0,
  estado ENUM('borrador','emitida','timbrada','cancelada','rechazada') DEFAULT 'borrador',
  xml_path VARCHAR(255),
  xml_timbrado_path VARCHAR(255) NULL,          -- XML Firmado digitalmente
  pdf_path VARCHAR(255),
  cadena_original TEXT,
  sello_digital TEXT,
  numero_autorizacion VARCHAR(100) NULL,        -- Autorización SUNAT
  cufe VARCHAR(255) NULL,
  track_id VARCHAR(100) NULL,
  no_certificado VARCHAR(20),
  fecha_timbrado DATETIME NULL,
  motivo_cancelacion VARCHAR(255),
  observaciones TEXT,
  usuario_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_factura (empresa_id, tipo_documento, serie, folio),
  INDEX idx_factura_fecha (empresa_id, fecha_emision),
  INDEX idx_factura_cliente (cliente_id),
  FOREIGN KEY (empresa_id) REFERENCES empresas(id),
  FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  FOREIGN KEY (pais_id) REFERENCES paises(id),
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
) ENGINE=InnoDB;

-- ============================================================
-- 9. DETALLE DE COMPROBANTE
-- ============================================================
CREATE TABLE factura_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  factura_id INT NOT NULL,
  producto_id INT NULL,
  codigo VARCHAR(50),
  descripcion VARCHAR(255) NOT NULL,
  unidad_medida VARCHAR(20),
  cantidad DECIMAL(15,4) NOT NULL,
  precio_unitario DECIMAL(15,4) NOT NULL,
  descuento DECIMAL(15,2) DEFAULT 0,
  iva_porcentaje DECIMAL(5,2) DEFAULT 0,       -- IGV %
  iva_monto DECIMAL(15,2) DEFAULT 0,
  ieps_porcentaje DECIMAL(5,2) DEFAULT 0,
  ieps_monto DECIMAL(15,2) DEFAULT 0,
  importe DECIMAL(15,2) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
  FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 10. LOG DE ACTIVIDAD / AUDITORÍA
-- ============================================================
CREATE TABLE auditoria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NULL,
  empresa_id INT NULL,
  accion VARCHAR(50) NOT NULL,
  entidad VARCHAR(50),
  entidad_id INT NULL,
  detalles TEXT,
  ip VARCHAR(45),
  fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- ============================================================
-- 11. LOG DE ENVÍOS SUNAT (CDR de respuesta)
-- ============================================================
CREATE TABLE emision_log (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  factura_id    INT NOT NULL,
  empresa_id    INT NOT NULL,
  pais_codigo   VARCHAR(5) NOT NULL,
  autoridad     VARCHAR(50) NOT NULL,          -- SUNAT
  modo          ENUM('simulado','produccion') DEFAULT 'simulado',
  estado        ENUM('pendiente','enviado','aceptado','rechazado','error') DEFAULT 'pendiente',
  uuid_fiscal   VARCHAR(100) NULL,             -- Hash firma digital o ticket SUNAT
  xml_path      VARCHAR(255) NULL,
  xml_timbrado_path VARCHAR(255) NULL,
  pac_proveedor VARCHAR(100) NULL,             -- SUNAT u OSE
  respuesta_codigo VARCHAR(50) NULL,           -- Código SUNAT (ej. 0 para aceptado)
  respuesta_mensaje TEXT NULL,                 -- Descripción de respuesta o CDR
  intentos      INT DEFAULT 0,
  ultimo_intento DATETIME NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (factura_id) REFERENCES facturas(id) ON DELETE CASCADE,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE,
  INDEX idx_emision_factura (factura_id),
  INDEX idx_emision_empresa (empresa_id),
  INDEX idx_emision_estado (estado)
) ENGINE=InnoDB;

-- ============================================================
-- 12. GESTIÓN CAF (Mantenida por compatibilidad de base de datos)
-- ============================================================
CREATE TABLE caf_chile (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  empresa_id    INT NOT NULL,
  tipo_dte      INT NOT NULL,
  folio_desde   INT NOT NULL,
  folio_hasta   INT NOT NULL,
  folio_actual  INT NOT NULL,
  caf_xml       TEXT NOT NULL,
  private_key   TEXT NOT NULL,
  fecha_venc    DATE NULL,
  activo        TINYINT(1) DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (empresa_id) REFERENCES empresas(id) ON DELETE CASCADE
) ENGINE=InnoDB;


-- ============================================================
--                 CARGA DE DATOS SEMILLA (LOCALIZADO EN HUARAZ, PERÚ)
-- ============================================================

-- 1. Países (Solo Perú)
INSERT INTO paises (id, codigo, nombre, moneda_codigo, moneda_simbolo, autoridad_fiscal, formato_documento, iva_general) VALUES
(3, 'PE', 'Perú', 'PEN', 'S/', 'SUNAT', 'UBL 2.1', 18.00);

-- 2. Usuarios del sistema (Passwords: admin123, contador123, vendedor123)
INSERT INTO usuarios (id, nombre, apellido, email, password_hash, rol) VALUES
(1, 'Admin', 'Local', 'admin@factu.com', '$2a$10$zzU4cQhp0WLC1MPImUPG2eRqeuax/TNBYm1w6rcMtTsjK7/JUkbZq', 'admin'),
(2, 'Laura', 'Contadora', 'contador@factu.com', '$2a$10$OHkE0gbMdI9Rbe3Tuy1V7uGZAHe92L9UWJecbdPfi5apO9aQJ5H8S', 'contador'),
(3, 'Carlos', 'Ventas', 'vendedor@factu.com', '$2a$10$OeEtsrMnV6lc9njtQPJVKuBpF/ybBvYoqop.e6v/R/tBpUpwkogRC', 'vendedor');

-- 3. Empresas emisoras localizadas en Huaraz (RUCs válidos ficticios de Perú de 11 dígitos que comienzan con 20)
INSERT INTO empresas (id, pais_id, identificacion_fiscal, razon_social, nombre_comercial, direccion, ciudad, codigo_postal, telefono, email, regimen_fiscal, ambiente, certificado_path, certificado_password, pac_proveedor, pac_usuario, pac_password, no_certificado, cert_vencimiento, modo_emision) VALUES
(1, 3, '20123456789', 'Distribuidora El Huascarán S.A.C.', 'Huascarán Dist', 'Av. Luzuriaga 450', 'Huaraz', '02001', '+51 43 123456', 'ventas@huascaran.pe', 'Régimen General MYPE', 'pruebas', '/storage/certs/pe_huascaran.pfx', 'pe123', 'sunat', 'usr_huascaran', 'pac_pwd123', '20123456789012345678', '2028-12-31', 'simulado'),
(2, 3, '20987654321', 'Andes Adventures E.I.R.L.', 'Andes Adventures', 'Jr. Simón Bolívar 712', 'Huaraz', '02001', '+51 43 987654', 'reservas@andesadventures.pe', 'Régimen Especial', 'pruebas', '/storage/certs/pe_andes.pfx', 'pe123', 'sunat', 'usr_andes', 'pac_pwd456', '20987654321012345678', '2028-12-31', 'simulado'),
(3, 3, '20776655443', 'Quesería Huaracina Don Bosco S.A.', 'Quesos Don Bosco', 'Av. Centenario 820', 'Huaraz', '02001', '+51 43 555666', 'pedidos@quesosdonbosco.pe', 'Régimen General', 'pruebas', '/storage/certs/pe_donbosco.pfx', 'pe123', 'sunat', 'usr_donbosco', 'pac_pwd789', '20776655443012345678', '2028-12-31', 'simulado');

-- 4. Relación Usuario ↔ Empresa
INSERT INTO usuario_empresa (usuario_id, empresa_id, es_principal) VALUES
(1, 1, 1), (1, 2, 0), (1, 3, 0), -- Admin administra las 3 empresas de Huaraz
(2, 1, 1), (2, 3, 0),             -- Contador en Distribuidora y Quesería
(3, 1, 1), (3, 2, 0);             -- Vendedor en Distribuidora y Andes Adventures

-- 5. Series y folios iniciales (SUNAT)
INSERT INTO series_documentos (empresa_id, tipo_documento, serie, folio_inicial, folio_actual) VALUES
(1, 'factura', 'F001', 1, 10), (1, 'boleta', 'B001', 1, 0), (1, 'nota_credito', 'FC01', 1, 0),
(2, 'factura', 'F001', 1, 10), (2, 'boleta', 'B001', 1, 0),
(3, 'factura', 'F001', 1, 10), (3, 'boleta', 'B001', 1, 0);

-- 6. Clientes locales en Huaraz (RUC o DNI)
INSERT INTO clientes (id, empresa_id, pais_id, tipo_identificacion, identificacion, tipo_persona, razon_social, email, telefono, direccion, ciudad, codigo_postal, regimen_fiscal) VALUES
-- Clientes de Distribuidora El Huascarán (Empresa 1)
(1, 1, 3, 'RUC', '20123412345', 'moral', 'Hotel El Tumi Huaraz S.A.C.', 'reservas@eltumihuaraz.pe', '+51 43 421234', 'Av. Luzuriaga 612', 'Huaraz', '02001', 'Régimen General'),
(2, 1, 3, 'RUC', '20554433221', 'moral', 'Restaurante El Tarawasi E.I.R.L.', 'tarawasi@gmail.com', '+51 43 425678', 'Jr. Sucre 425', 'Huaraz', '02001', 'Régimen Especial'),
(3, 1, 3, 'RUC', '20443322115', 'moral', 'Inversiones Chavín S.A.C.', 'contacto@invchavin.pe', '+51 43 429988', 'Jr. San Martín 830', 'Huaraz', '02001', 'Régimen General'),
(4, 1, 3, 'DNI', '43210987', 'fisica', 'Juan Carlos Milla', 'juan.milla@outlook.com', '+51 943 123 456', 'Jr. José de la Mar 120', 'Huaraz', '02001', 'Sujeto No Afecto'),
(5, 1, 3, 'RUC', '20888777662', 'moral', 'Cooperativa Agraria Áncash', 'informes@coopancash.pe', '+51 43 426655', 'Av. Confraternidad Internacional 1200', 'Huaraz', '02001', 'Régimen General MYPE'),
-- Clientes de Andes Adventures (Empresa 2)
(6, 2, 3, 'RUC', '20333222119', 'moral', 'Albergue de Montaña Huaráz', 'hostel@huarazadventure.pe', '+51 43 422020', 'Jr. Simón Bolívar 230', 'Huaraz', '02001', 'Régimen Especial'),
(7, 2, 3, 'RUC', '20173200921', 'moral', 'Municipalidad Provincial de Huaraz', 'cpe@munihuaraz.gob.pe', '+51 43 421616', 'Plaza de Armas s/n', 'Huaraz', '02001', 'Sujeto No Afecto'),
(8, 2, 3, 'RUC', '20448822991', 'moral', 'Café Andino Huaraz', 'cafe@cafeandino.pe', '+51 43 423322', 'Jr. Lucúcará 740', 'Huaraz', '02001', 'Régimen General'),
(9, 2, 3, 'RUC', '20556633221', 'moral', 'Transportes Yungay Express S.A.C.', 'yungayexpress@outlook.com', '+51 43 428080', 'Av. Centenario 1040', 'Huaraz', '02001', 'Régimen General MYPE'),
(10, 2, 3, 'RUC', '20999000112', 'moral', 'Turismo Cordillera Blanca S.A.', 'contacto@turismocb.pe', '+51 43 429090', 'Jr. Caraz 450', 'Huaraz', '02001', 'Régimen General'),
-- Clientes de Quesería Huaracina Don Bosco (Empresa 3)
(11, 3, 3, 'RUC', '20455667788', 'moral', 'Supermercado Novaplaza Huaraz', 'compras@novaplaza.pe', '+51 43 421100', 'Av. Luzuriaga 920', 'Huaraz', '02001', 'Régimen General'),
(12, 3, 3, 'DNI', '08765432', 'fisica', 'María Consuelo Vega', 'mvega@gmail.com', '+51 943 456 789', 'Av. Pedro Villón 340', 'Huaraz', '02001', 'Sujeto No Afecto'),
(13, 3, 3, 'RUC', '20543210987', 'moral', 'Clínica San Pablo Huaraz S.A.C.', 'facturas@clinicasanpablo.pe', '+51 43 421414', 'Jr. Huascarán 140', 'Huaraz', '02001', 'Régimen General'),
(14, 3, 3, 'RUC', '20667788990', 'moral', 'Agroindustrias Ancash S.A.C.', 'planta@agroancash.pe', '+51 43 521234', 'Av. Centenario 2100', 'Huaraz', '02001', 'Régimen General MYPE'),
(15, 3, 3, 'RUC', '20334455667', 'moral', 'Ferretería El Progreso de Huaraz', 'elprogreso@ferreteria.pe', '+51 43 425544', 'Jr. 28 de Julio 560', 'Huaraz', '02001', 'Régimen Especial');

-- 7. Productos y Servicios locales (con precios en Soles y claves SUNAT reales)
INSERT INTO productos (id, empresa_id, codigo, codigo_sat, descripcion, tipo, unidad_medida, precio_unitario, iva_porcentaje) VALUES
-- Distribuidora El Huascarán (Empresa 1)
(1, 1, 'PROD-HZ-001', '90101501', 'Queso Huaracino Tipo Andino 1kg', 'producto', 'KGM', 35.00, 18.00),
(2, 1, 'PROD-HZ-002', '90101502', 'Queso Tipo Paria Huaracino 1kg', 'producto', 'KGM', 32.00, 18.00),
(3, 1, 'PROD-HZ-003', '50202306', 'Jamón Ahumado de Huaraz Especial 1kg', 'producto', 'KGM', 45.00, 18.00),
(4, 1, 'PROD-HZ-004', '43211503', 'Laptop Core i5 Ensamblada', 'producto', 'NIU', 2400.00, 18.00),
(5, 1, 'PROD-HZ-005', '43212105', 'Monitor LED 24 Pulgadas LG', 'producto', 'NIU', 550.00, 18.00),
(6, 1, 'SERV-HZ-005', '81111808', 'Servicio Técnico PC & Redes (Hora)', 'servicio', 'SVC', 60.00, 18.00),
-- Andes Adventures (Empresa 2)
(7, 2, 'SERV-HZ-001', '81111500', 'Servicio Guía de Montaña Cordillera Blanca', 'servicio', 'SVC', 250.00, 18.00),
(8, 2, 'SERV-HZ-002', '81111501', 'Alquiler Carpa de Montaña 4 Estaciones (Día)', 'servicio', 'SVC', 40.00, 18.00),
(9, 2, 'SERV-HZ-003', '81111502', 'Paquete Trekking Laguna 69 Todo Incluido', 'servicio', 'SVC', 120.00, 18.00),
(10, 2, 'SERV-HZ-004', '81111503', 'Tour de Aventura Nevado Pastoruri', 'servicio', 'SVC', 90.00, 18.00),
(11, 2, 'PROD-HZ-008', '46181504', 'Casaca Cortavientos Impermeable Trekking', 'producto', 'NIU', 180.00, 18.00),
(12, 2, 'SERV-HZ-006', '78111802', 'Flete de Equipos Huaraz - Yungay', 'servicio', 'SVC', 150.00, 18.00),
-- Quesería Don Bosco (Empresa 3)
(13, 3, 'PROD-DON-01', '90101501', 'Queso Andino Chacas Premium 1kg', 'producto', 'KGM', 42.00, 18.00),
(14, 3, 'PROD-DON-02', '90101502', 'Queso Mozzarella de Chacas 1kg', 'producto', 'KGM', 38.00, 18.00),
(15, 3, 'PROD-DON-03', '50181900', 'Miel de Abeja Orgánica Don Bosco 1kg', 'producto', 'KGM', 30.00, 18.00),
(16, 3, 'PROD-DON-04', '50181901', 'Alfajores Tradicionales Chacas x12', 'producto', 'NIU', 18.00, 18.00),
(17, 3, 'SERV-DON-01', '78111802', 'Flete de Distribución Huaraz - Lima', 'servicio', 'SVC', 280.00, 18.00),
(18, 3, 'SERV-DON-02', '80141600', 'Servicio de Embalaje Térmico Especial', 'servicio', 'SVC', 45.00, 18.00);

-- 8. Facturas y Detalle (10 facturas por empresa, todas en PEN, distribuidas entre Ene 2026 y Jun 2026)
-- Moneda PEN (Soles, S/)

-- Facturas de Distribuidora El Huascarán (Empresa 1)
INSERT INTO facturas (id, empresa_id, cliente_id, pais_id, tipo_documento, serie, folio, uuid, fecha_emision, fecha_vencimiento, moneda, tipo_cambio, forma_pago, metodo_pago, subtotal, total_iva, total, estado, xml_path, xml_timbrado_path, pdf_path, no_certificado, fecha_timbrado, numero_autorizacion, usuario_id) VALUES
(1, 1, 1, 3, 'factura', 'F001', 1, 'HASH-CPE-SUNAT-000000000001-2026', '2026-01-15 10:00:00', '2026-02-15', 'PEN', 1.0000, '03', 'Contado', 1500.00, 270.00, 1770.00, 'timbrada', '/storage/xml/1/F001-1.xml', '/storage/xml/1/F001-1_signed.xml', '/storage/pdf/1/F001-1.pdf', '20123456789012345678', '2026-01-15 10:02:00', 'AUTH-SUNAT-1000210', 1),
(2, 1, 2, 3, 'factura', 'F001', 2, 'HASH-CPE-SUNAT-000000000002-2026', '2026-02-10 11:20:00', '2026-03-10', 'PEN', 1.0000, '03', 'Contado', 2465.00, 443.70, 2908.70, 'timbrada', '/storage/xml/1/F001-2.xml', '/storage/xml/1/F001-2_signed.xml', '/storage/pdf/1/F001-2.pdf', '20123456789012345678', '2026-02-10 11:22:00', 'AUTH-SUNAT-1000211', 1),
(3, 1, 3, 3, 'factura', 'F001', 3, 'HASH-CPE-SUNAT-000000000003-2026', '2026-02-28 15:40:00', NULL, 'PEN', 1.0000, '01', 'Contado', 90.00, 16.20, 106.20, 'cancelada', NULL, NULL, NULL, NULL, NULL, NULL, 1),
(4, 1, 4, 3, 'factura', 'F001', 4, 'HASH-CPE-SUNAT-000000000004-2026', '2026-03-05 14:15:00', '2026-04-05', 'PEN', 1.0000, '03', 'Crédito', 2400.00, 432.00, 2832.00, 'timbrada', '/storage/xml/1/F001-4.xml', '/storage/xml/1/F001-4_signed.xml', '/storage/pdf/1/F001-4.pdf', '20123456789012345678', '2026-03-05 14:16:00', 'AUTH-SUNAT-1000212', 3),
(5, 1, 5, 3, 'factura', 'F001', 5, 'HASH-CPE-SUNAT-000000000005-2026', '2026-04-12 09:00:00', '2026-05-12', 'PEN', 1.0000, '03', 'Contado', 180.00, 32.40, 212.40, 'timbrada', '/storage/xml/1/F001-5.xml', '/storage/xml/1/F001-5_signed.xml', '/storage/pdf/1/F001-5.pdf', '20123456789012345678', '2026-04-12 09:02:00', 'AUTH-SUNAT-1000213', 3),
(6, 1, 1, 3, 'factura', 'F001', 6, 'HASH-CPE-SUNAT-000000000006-2026', '2026-05-20 16:30:00', NULL, 'PEN', 1.0000, '01', 'Contado', 350.00, 63.00, 413.00, 'timbrada', '/storage/xml/1/F001-6.xml', '/storage/xml/1/F001-6_signed.xml', '/storage/pdf/1/F001-6.pdf', '20123456789012345678', '2026-05-20 16:32:00', 'AUTH-SUNAT-1000214', 1),
(7, 1, 2, 3, 'factura', 'F001', 7, NULL, '2026-06-02 12:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 1100.00, 198.00, 1298.00, 'rechazada', NULL, NULL, NULL, NULL, NULL, NULL, 1),
(8, 1, 3, 3, 'factura', 'F001', 8, NULL, '2026-06-18 18:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 2950.00, 531.00, 3481.00, 'borrador', NULL, NULL, NULL, NULL, NULL, NULL, 3);

INSERT INTO factura_items (factura_id, producto_id, codigo, descripcion, unidad_medida, cantidad, precio_unitario, iva_porcentaje, iva_monto, importe, total) VALUES
(1, 1, 'PROD-HZ-001', 'Queso Huaracino Tipo Andino 1kg', 'KGM', 10.0000, 35.0000, 18.00, 63.00, 350.00, 413.00),
(1, 3, 'PROD-HZ-003', 'Jamón Ahumado de Huaraz Especial 1kg', 'KGM', 10.0000, 45.0000, 18.00, 81.00, 450.00, 531.00),
(1, 2, 'PROD-HZ-002', 'Queso Tipo Paria Huaracino 1kg', 'KGM', 21.8750, 32.0000, 18.00, 126.00, 700.00, 826.00),
(2, 4, 'PROD-HZ-004', 'Laptop Core i5 Ensamblada', 'NIU', 1.0000, 2400.0000, 18.00, 432.00, 2400.00, 2832.00),
(2, 6, 'SERV-HZ-005', 'Servicio Técnico PC & Redes (Hora)', 'SVC', 1.0833, 60.0000, 18.00, 11.70, 65.00, 76.70),
(3, 1, 'PROD-HZ-001', 'Queso Huaracino Tipo Andino 1kg', 'KGM', 2.0000, 35.0000, 18.00, 12.60, 70.00, 82.60),
(3, 2, 'PROD-HZ-002', 'Queso Tipo Paria Huaracino 1kg', 'KGM', 0.6250, 32.0000, 18.00, 3.60, 20.00, 23.60),
(4, 4, 'PROD-HZ-004', 'Laptop Core i5 Ensamblada', 'NIU', 1.0000, 2400.0000, 18.00, 432.00, 2400.00, 2832.00),
(5, 6, 'SERV-HZ-005', 'Servicio Técnico PC & Redes (Hora)', 'SVC', 3.0000, 60.0000, 18.00, 32.40, 180.00, 212.40),
(6, 1, 'PROD-HZ-001', 'Queso Huaracino Tipo Andino 1kg', 'KGM', 10.0000, 35.0000, 18.00, 63.00, 350.00, 413.00),
(7, 5, 'PROD-HZ-005', 'Monitor LED 24 Pulgadas LG', 'NIU', 2.0000, 550.0000, 18.00, 198.00, 1100.00, 1298.00),
(8, 4, 'PROD-HZ-004', 'Laptop Core i5 Ensamblada', 'NIU', 1.0000, 2400.0000, 18.00, 432.00, 2400.00, 2832.00),
(8, 5, 'PROD-HZ-005', 'Monitor LED 24 Pulgadas LG', 'NIU', 1.0000, 550.0000, 18.00, 99.00, 550.00, 649.00);

-- Facturas de Andes Adventures (Empresa 2)
INSERT INTO facturas (id, empresa_id, cliente_id, pais_id, tipo_documento, serie, folio, uuid, fecha_emision, fecha_vencimiento, moneda, tipo_cambio, forma_pago, metodo_pago, subtotal, total_iva, total, estado, xml_path, xml_timbrado_path, pdf_path, no_certificado, fecha_timbrado, numero_autorizacion, usuario_id) VALUES
(9, 2, 6, 3, 'factura', 'F001', 1, 'HASH-CPE-SUNAT-000000000009-2026', '2026-01-20 14:00:00', '2026-02-20', 'PEN', 1.0000, '03', 'Contado', 370.00, 66.60, 436.60, 'timbrada', '/storage/xml/2/F001-1.xml', '/storage/xml/2/F001-1_signed.xml', '/storage/pdf/2/F001-1.pdf', '20987654321012345678', '2026-01-20 14:02:00', 'AUTH-SUNAT-2000100', 3),
(10, 2, 7, 3, 'factura', 'F001', 2, 'HASH-CPE-SUNAT-000000000010-2026', '2026-02-18 10:00:00', '2026-03-18', 'PEN', 1.0000, '03', 'Contado', 410.00, 73.80, 483.80, 'timbrada', '/storage/xml/2/F001-2.xml', '/storage/xml/2/F001-2_signed.xml', '/storage/pdf/2/F001-2.pdf', '20987654321012345678', '2026-02-18 10:05:00', 'AUTH-SUNAT-2000101', 3),
(11, 2, 8, 3, 'factura', 'F001', 3, 'HASH-CPE-SUNAT-000000000011-2026', '2026-03-22 15:30:00', NULL, 'PEN', 1.0000, '03', 'Contado', 250.00, 45.00, 295.00, 'timbrada', '/storage/xml/2/F001-3.xml', '/storage/xml/2/F001-3_signed.xml', '/storage/pdf/2/F001-3.pdf', '20987654321012345678', '2026-03-22 15:32:00', 'AUTH-SUNAT-2000102', 3),
(12, 2, 9, 3, 'factura', 'F001', 4, 'HASH-CPE-SUNAT-000000000012-2026', '2026-04-10 11:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 180.00, 32.40, 212.40, 'timbrada', '/storage/xml/2/F001-4.xml', '/storage/xml/2/F001-4_signed.xml', '/storage/pdf/2/F001-4.pdf', '20987654321012345678', '2026-04-10 11:02:00', 'AUTH-SUNAT-2000103', 3),
(13, 2, 10, 3, 'factura', 'F001', 5, 'HASH-CPE-SUNAT-000000000013-2026', '2026-05-05 16:00:00', NULL, 'PEN', 1.0000, '01', 'Contado', 150.00, 27.00, 177.00, 'cancelada', NULL, NULL, NULL, NULL, NULL, NULL, 3),
(14, 2, 6, 3, 'factura', 'F001', 6, 'HASH-CPE-SUNAT-000000000014-2026', '2026-05-18 10:15:00', NULL, 'PEN', 1.0000, '03', 'Contado', 120.00, 21.60, 141.60, 'timbrada', '/storage/xml/2/F001-6.xml', '/storage/xml/2/F001-6_signed.xml', '/storage/pdf/2/F001-6.pdf', '20987654321012345678', '2026-05-18 10:16:00', 'AUTH-SUNAT-2000104', 3),
(15, 2, 7, 3, 'factura', 'F001', 7, 'HASH-CPE-SUNAT-000000000015-2026', '2026-06-08 11:30:00', NULL, 'PEN', 1.0000, '03', 'Contado', 330.00, 59.40, 389.40, 'timbrada', '/storage/xml/2/F001-7.xml', '/storage/xml/2/F001-7_signed.xml', '/storage/pdf/2/F001-7.pdf', '20987654321012345678', '2026-06-08 11:31:00', 'AUTH-SUNAT-2000105', 3),
(16, 2, 8, 3, 'factura', 'F001', 8, NULL, '2026-06-18 15:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 370.00, 66.60, 436.60, 'borrador', NULL, NULL, NULL, NULL, NULL, NULL, 3);

INSERT INTO factura_items (factura_id, producto_id, codigo, descripcion, unidad_medida, cantidad, precio_unitario, iva_porcentaje, iva_monto, importe, total) VALUES
(9, 7, 'SERV-HZ-001', 'Servicio Guía de Montaña Cordillera Blanca', 'SVC', 1.0000, 250.0000, 18.00, 45.00, 250.00, 295.00),
(9, 9, 'SERV-HZ-003', 'Paquete Trekking Laguna 69 Todo Incluido', 'SVC', 1.0000, 120.0000, 18.00, 21.60, 120.00, 141.60),
(10, 8, 'SERV-HZ-002', 'Alquiler Carpa de Montaña 4 Estaciones (Día)', 'SVC', 2.0000, 40.0000, 18.00, 14.40, 80.00, 94.40),
(10, 10, 'SERV-HZ-004', 'Tour de Aventura Nevado Pastoruri', 'SVC', 3.0000, 90.0000, 18.00, 48.60, 270.00, 318.60),
(10, 8, 'SERV-HZ-002', 'Alquiler Carpa de Montaña 4 Estaciones (Día)', 'SVC', 1.5000, 40.0000, 18.00, 10.80, 60.00, 70.80),
(11, 7, 'SERV-HZ-001', 'Servicio Guía de Montaña Cordillera Blanca', 'SVC', 1.0000, 250.0000, 18.00, 45.00, 250.00, 295.00),
(12, 11, 'PROD-HZ-008', 'Casaca Cortavientos Impermeable Trekking', 'NIU', 1.0000, 180.0000, 18.00, 32.40, 180.00, 212.40),
(13, 12, 'SERV-HZ-006', 'Flete de Equipos Huaraz - Yungay', 'SVC', 1.0000, 150.0000, 18.00, 27.00, 150.00, 177.00),
(14, 9, 'SERV-HZ-003', 'Paquete Trekking Laguna 69 Todo Incluido', 'SVC', 1.0000, 120.0000, 18.00, 21.60, 120.00, 141.60),
(15, 10, 'SERV-HZ-004', 'Tour de Aventura Nevado Pastoruri', 'SVC', 2.0000, 90.0000, 18.00, 32.40, 180.00, 212.40),
(15, 12, 'SERV-HZ-006', 'Flete de Equipos Huaraz - Yungay', 'SVC', 1.0000, 150.0000, 18.00, 27.00, 150.00, 177.00),
(16, 7, 'SERV-HZ-001', 'Servicio Guía de Montaña Cordillera Blanca', 'SVC', 1.0000, 250.0000, 18.00, 45.00, 250.00, 295.00),
(16, 9, 'SERV-HZ-003', 'Paquete Trekking Laguna 69 Todo Incluido', 'SVC', 1.0000, 120.0000, 18.00, 21.60, 120.00, 141.60);

-- Facturas de Quesería Huaracina Don Bosco (Empresa 3)
INSERT INTO facturas (id, empresa_id, cliente_id, pais_id, tipo_documento, serie, folio, uuid, fecha_emision, fecha_vencimiento, moneda, tipo_cambio, forma_pago, metodo_pago, subtotal, total_iva, total, estado, xml_path, xml_timbrado_path, pdf_path, no_certificado, fecha_timbrado, numero_autorizacion, usuario_id) VALUES
(17, 3, 11, 3, 'factura', 'F001', 1, 'HASH-CPE-SUNAT-000000000017-2026', '2026-01-18 09:00:00', '2026-02-18', 'PEN', 1.0000, '03', 'Contado', 420.00, 75.60, 495.60, 'timbrada', '/storage/xml/3/F001-1.xml', '/storage/xml/3/F001-1_signed.xml', '/storage/pdf/3/F001-1.pdf', '20776655443012345678', '2026-01-18 09:01:00', 'AUTH-SUNAT-3000100', 2),
(18, 3, 13, 3, 'factura', 'F001', 2, 'HASH-CPE-SUNAT-000000000018-2026', '2026-02-14 11:30:00', '2026-03-14', 'PEN', 1.0000, '03', 'Contado', 436.00, 78.48, 514.48, 'timbrada', '/storage/xml/3/F001-2.xml', '/storage/xml/3/F001-2_signed.xml', '/storage/pdf/3/F001-2.pdf', '20776655443012345678', '2026-02-14 11:32:00', 'AUTH-SUNAT-3000101', 2),
(19, 3, 14, 3, 'factura', 'F001', 3, 'HASH-CPE-SUNAT-000000000019-2026', '2026-03-19 14:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 380.00, 68.40, 448.40, 'timbrada', '/storage/xml/3/F001-3.xml', '/storage/xml/3/F001-3_signed.xml', '/storage/pdf/3/F001-3.pdf', '20776655443012345678', '2026-03-19 14:02:00', 'AUTH-SUNAT-3000102', 2),
(20, 3, 15, 3, 'factura', 'F001', 4, 'HASH-CPE-SUNAT-000000000020-2026', '2026-04-05 10:00:00', NULL, 'PEN', 1.0000, '01', 'Contado', 30.00, 5.40, 35.40, 'cancelada', NULL, NULL, NULL, NULL, NULL, NULL, 2),
(21, 3, 12, 3, 'factura', 'F001', 5, 'HASH-CPE-SUNAT-000000000021-2026', '2026-04-18 16:45:00', NULL, 'PEN', 1.0000, '03', 'Contado', 310.00, 55.80, 365.80, 'timbrada', '/storage/xml/3/F001-5.xml', '/storage/xml/3/F001-5_signed.xml', '/storage/pdf/3/F001-5.pdf', '20776655443012345678', '2026-04-18 16:46:00', 'AUTH-SUNAT-3000103', 2),
(22, 3, 13, 3, 'factura', 'F001', 6, 'HASH-CPE-SUNAT-000000000022-2026', '2026-05-12 11:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 30.00, 5.40, 35.40, 'timbrada', '/storage/xml/3/F001-6.xml', '/storage/xml/3/F001-6_signed.xml', '/storage/pdf/3/F001-6.pdf', '20776655443012345678', '2026-05-12 11:02:00', 'AUTH-SUNAT-3000104', 1),
(23, 3, 14, 3, 'factura', 'F001', 7, NULL, '2026-06-03 14:00:00', NULL, 'PEN', 1.0000, '03', 'Contado', 280.00, 50.40, 330.40, 'rechazada', NULL, NULL, NULL, NULL, NULL, NULL, 2),
(24, 3, 15, 3, 'factura', 'F001', 8, NULL, '2026-06-18 10:00:00', NULL, 'PEN', 1.0000, '01', 'Contado', 418.00, 75.24, 493.24, 'borrador', NULL, NULL, NULL, NULL, NULL, NULL, 2);

INSERT INTO factura_items (factura_id, producto_id, codigo, descripcion, unidad_medida, cantidad, precio_unitario, iva_porcentaje, iva_monto, importe, total) VALUES
(17, 13, 'PROD-DON-01', 'Queso Andino Chacas Premium 1kg', 'KGM', 10.0000, 42.0000, 18.00, 75.60, 420.00, 495.60),
(18, 14, 'PROD-DON-02', 'Queso Mozzarella de Chacas 1kg', 'KGM', 10.0000, 38.0000, 18.00, 68.40, 380.00, 448.40),
(18, 18, 'SERV-DON-02', 'Servicio de Embalaje Térmico Especial', 'SVC', 1.2444, 45.0000, 18.00, 10.08, 56.00, 66.08),
(19, 13, 'PROD-DON-01', 'Queso Andino Chacas Premium 1kg', 'KGM', 2.3810, 42.0000, 18.00, 18.00, 100.00, 118.00),
(19, 17, 'SERV-DON-01', 'Flete de Distribución Huaraz - Lima', 'SVC', 1.0000, 280.0000, 18.00, 50.40, 280.00, 330.40),
(20, 15, 'PROD-DON-03', 'Miel de Abeja Orgánica Don Bosco 1kg', 'KGM', 1.0000, 30.0000, 18.00, 5.40, 30.00, 35.40),
(21, 17, 'SERV-DON-01', 'Flete de Distribución Huaraz - Lima', 'SVC', 1.0000, 280.0000, 18.00, 50.40, 280.00, 330.40),
(21, 15, 'PROD-DON-03', 'Miel de Abeja Orgánica Don Bosco 1kg', 'KGM', 1.0000, 30.0000, 18.00, 5.40, 30.00, 35.40),
(22, 15, 'PROD-DON-03', 'Miel de Abeja Orgánica Don Bosco 1kg', 'KGM', 1.0000, 30.0000, 18.00, 5.40, 30.00, 35.40),
(23, 17, 'SERV-DON-01', 'Flete de Distribución Huaraz - Lima', 'SVC', 1.0000, 280.0000, 18.00, 50.40, 280.00, 330.40),
(24, 13, 'PROD-DON-01', 'Queso Andino Chacas Premium 1kg', 'KGM', 5.0000, 42.0000, 18.00, 37.80, 210.00, 247.80),
(24, 15, 'PROD-DON-03', 'Miel de Abeja Orgánica Don Bosco 1kg', 'KGM', 3.0000, 30.0000, 18.00, 16.20, 90.00, 106.20),
(24, 16, 'PROD-DON-04', 'Alfajores Tradicionales Chacas x12', 'NIU', 6.0000, 18.0000, 18.00, 19.44, 108.00, 127.44),
(24, 18, 'SERV-DON-02', 'Servicio de Embalaje Térmico Especial', 'SVC', 0.2222, 45.0000, 18.00, 1.80, 10.00, 11.80);


-- 9. Actividad / Auditoría
INSERT INTO auditoria (usuario_id, empresa_id, accion, entidad, entidad_id, detalles, ip) VALUES
(1, 1, 'LOGIN', 'usuarios', 1, 'Inicio de sesión exitoso de Admin en Huaraz', '127.0.0.1'),
(1, 1, 'CONFIGURAR', 'empresas', 1, 'Configuración de certificado digital .pfx y conexión OSE/SUNAT', '127.0.0.1'),
(3, 1, 'CREAR', 'clientes', 5, 'Creado cliente Cooperativa Agraria Áncash', '127.0.0.1'),
(3, 2, 'EMITIR', 'facturas', 9, 'Emisión factura F001-1 enviada a la SUNAT', '127.0.0.1'),
(1, 3, 'EMITIR', 'facturas', 17, 'Emisión factura F001-1 enviada a SUNAT por Quesería Don Bosco', '127.0.0.1'),
(2, 3, 'EMITIR', 'facturas', 21, 'Emisión factura F001-5 enviada a SUNAT', '127.0.0.1'),
(3, 2, 'CANCELAR', 'facturas', 13, 'Cancelación de factura F001-5 en la SUNAT', '127.0.0.1'),
(1, 1, 'EDITAR', 'productos', 2, 'Actualizado precio de Queso Tipo Paria Huaracino 1kg', '127.0.0.1');


-- 10. Logs de Transmisión Fiscal SUNAT (CDR de respuesta)
INSERT INTO emision_log (factura_id, empresa_id, pais_codigo, autoridad, modo, estado, uuid_fiscal, xml_path, xml_timbrado_path, pac_proveedor, respuesta_codigo, respuesta_mensaje, intentos, ultimo_intento) VALUES
(1, 1, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000001-2026', '/storage/xml/1/F001-1.xml', '/storage/xml/1/F001-1_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-01-15 10:02:00'),
(2, 1, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000002-2026', '/storage/xml/1/F001-2.xml', '/storage/xml/1/F001-2_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-02-10 11:22:00'),
(4, 1, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000004-2026', '/storage/xml/1/F001-4.xml', '/storage/xml/1/F001-4_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-03-05 14:16:00'),
(5, 1, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000005-2026', '/storage/xml/1/F001-5.xml', '/storage/xml/1/F001-5_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-04-12 09:02:00'),
(6, 1, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000006-2026', '/storage/xml/1/F001-6.xml', '/storage/xml/1/F001-6_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-05-20 16:32:00'),
(7, 1, 'PE', 'SUNAT', 'simulado', 'rechazado', NULL, NULL, NULL, 'sunat', '2015', 'El RUC del receptor se encuentra en estado de Baja o Suspensión', 2, '2026-06-02 12:00:00'),
(9, 2, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000009-2026', '/storage/xml/2/F001-1.xml', '/storage/xml/2/F001-1_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-01-20 14:02:00'),
(10, 2, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000010-2026', '/storage/xml/2/F001-2.xml', '/storage/xml/2/F001-2_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-02-18 10:05:00'),
(11, 2, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000011-2026', '/storage/xml/2/F001-3.xml', '/storage/xml/2/F001-3_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-03-22 15:32:00'),
(12, 2, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000012-2026', '/storage/xml/2/F001-4.xml', '/storage/xml/2/F001-4_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-04-10 11:02:00'),
(14, 2, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000014-2026', '/storage/xml/2/F001-6.xml', '/storage/xml/2/F001-6_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-05-18 10:16:00'),
(15, 2, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000015-2026', '/storage/xml/2/F001-7.xml', '/storage/xml/2/F001-7_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-06-08 11:31:00'),
(17, 3, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000017-2026', '/storage/xml/3/F001-1.xml', '/storage/xml/3/F001-1_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-01-18 09:01:00'),
(18, 3, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000018-2026', '/storage/xml/3/F001-2.xml', '/storage/xml/3/F001-2_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-02-14 11:32:00'),
(19, 3, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000019-2026', '/storage/xml/3/F001-3.xml', '/storage/xml/3/F001-3_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-03-19 14:02:00'),
(21, 3, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000021-2026', '/storage/xml/3/F001-5.xml', '/storage/xml/3/F001-5_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-04-18 16:46:00'),
(22, 3, 'PE', 'SUNAT', 'simulado', 'aceptado', 'HASH-CPE-SUNAT-000000000022-2026', '/storage/xml/3/F001-6.xml', '/storage/xml/3/F001-6_signed.xml', 'sunat', '0', 'La Factura ha sido aceptada', 1, '2026-05-12 11:02:00'),
(23, 3, 'PE', 'SUNAT', 'simulado', 'rechazado', NULL, NULL, NULL, 'sunat', '2032', 'El RUC del receptor no se encuentra en estado Habido', 1, '2026-06-03 14:00:00');
