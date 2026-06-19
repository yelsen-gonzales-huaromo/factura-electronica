# FactuElectrónica ⚡ - Sistema Integrador de Facturación Electrónica Multi-País

¡Bienvenido! Este es **FactuElectrónica**, un sistema integrador de facturación electrónica multi-país y multi-empresa, diseñado para gestionar procesos críticos de emisión de comprobantes fiscales digitales, firmado de documentos XML UBL, interacción con autoridades tributarias (enfocado en **SUNAT - Perú**) y generación de reportes avanzados.

Este proyecto ha sido desarrollado con un enfoque en **código limpio, alto rendimiento y cero dependencias de frameworks front-end pesados**, demostrando un dominio sólido de JavaScript nativo (Full-Stack), criptografía, bases de datos relacionales y APIs SOAP/REST.

---

## 📸 Capturas de Pantalla

### 1. Panel de Control (Dashboard)
Una interfaz rica, interactiva y responsiva con métricas en tiempo real, histórico de ventas mensuales por empresa y logs de auditoría integrados.
![Dashboard de FactuElectrónica](public/img/Dashboard%20-%20FactuElectr%C3%B3nica.png)

### 2. Control de Acceso (Login)
Autenticación segura basada en JSON Web Tokens (JWT) y manejo de roles.
![Login de FactuElectrónica](public/img/Login%20-%20FactuElectr%C3%B3nica.png)

---

## 🚀 Características Clave

- **Localización SUNAT (Perú) 🇵🇪**: Implementación completa de la estructura del estándar UBL 2.1 para Facturas (F001), Boletas (B001), Notas de Crédito (FC01) y Notas de Débito.
- **Firma Digital XML Criptográfica 🔑**: Firma digital avanzada de documentos XML usando certificados estándar `.pfx` o `.pem` con criptografía asimétrica.
- **Conectividad SOAP/REST 📡**: Comunicación directa con los servidores de la SUNAT (Homologación, Pruebas y Producción) para el envío de comprobantes y la recepción/lectura del **CDR (Constancia de Recepción)**.
- **Generador de Representación Impresa (PDF) 📄**: Generación al vuelo de archivos PDF con diseño profesional y códigos QR dinámicos para cumplimiento normativo local.
- **Auditoría Integral (Compliance) 🛡️**: Bitácora detallada de transacciones que registra las operaciones críticas de usuarios y respuestas de entes reguladores para garantizar la trazabilidad de los datos.

---

## 🛠️ Stack Tecnológico

### Backend
- **Node.js** & **Express.js**: Servidor HTTP robusto y rápido.
- **MySQL (mysql2/promise)**: Persistencia de datos transaccionales, utilizando pools de conexiones y transacciones seguras.
- **xml-crypto** & **xmlbuilder2**: Creación, serialización y firmado digital de facturas UBL.
- **soap** & **axios**: Comunicación segura con servicios web de SUNAT/OSE.
- **pdfkit** & **qrcode**: Motor de renderizado dinámico para PDFs de comprobantes con sus respectivos códigos QR.
- **jsonwebtoken** & **bcryptjs**: Autenticación segura y encriptación de contraseñas.

### Frontend
- **HTML5** & **CSS3 (Custom Vanilla CSS Design System)**: Interfaz de usuario diseñada a medida, altamente interactiva, responsiva, con animaciones sutiles y modo oscuro.
- **JavaScript Vanilla (ES6+)**: SPA híbrida estructurada a través de componentes reutilizables sin la sobrecarga de frameworks como React, Angular o Vue.

---

## 📂 Estructura del Proyecto

El proyecto sigue una estructura limpia, separando las responsabilidades de negocio de la lógica del servidor:

```bash
factura-electronica/
├── database/
│   └── schema.sql              # Definición de tablas, llaves y datos semilla (poblado)
├── scripts/
│   ├── init-db.js              # Script autoejecutable para inicializar base de datos
│   └── reset-admin.js          # Utilidad para restablecer contraseñas de administradores
├── src/
│   ├── config/
│   │   └── db.js               # Configuración del pool de conexión a MySQL
│   ├── controllers/            # Controladores del negocio (auth, invoices, clients, etc.)
│   ├── middleware/             # Middlewares de Express (validaciones, autenticación JWT)
│   ├── routes/                 # Definición de endpoints y rutas de la API REST
│   └── modules/                # Módulos core de facturación localizados por país
│       ├── peru.js             # Lógica tributaria SUNAT (UBL, CDR, estados)
│       ├── mexico.js           # Módulo para estructura CFDI
│       ├── chile.js            # Módulo para DTE de Chile
│       ├── colombia.js         # Módulo para DIAN
│       └── ecuador.js          # Módulo para SRI
├── public/                     # Frontend estático del sistema
│   ├── css/
│   │   └── styles.css          # Sistema de diseño CSS personalizado
│   ├── js/
│   │   ├── api.js              # Enlace con la API REST y almacenamiento de sesión
│   │   └── layout.js           # Generador dinámico del Navbar, Sidebar y plantillas
│   └── *.html                  # Vistas dinámicas basadas en layouts (invoices, clients, etc.)
├── .env.example                # Plantilla de variables de entorno
├── server.js                   # Punto de entrada de la aplicación Express
└── package.json                # Dependencias y scripts npm
```

---

## ⚙️ Instalación y Configuración Local

Sigue los siguientes pasos para poner en marcha el proyecto localmente:

### Prerrequisitos
- Tener instalado [Node.js](https://nodejs.org/) (Versión 16 o superior sugerida).
- Un servidor [MySQL](https://www.mysql.com/) en ejecución.

### 1. Clonar el repositorio e instalar dependencias
```bash
git clone https://github.com/tu-usuario/factura-electronica.git
cd factura-electronica
npm install
```

### 2. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto copiando la plantilla [.env.example](file:///e:/Documentos/GitHub/factura-electronica/.env.example):
```bash
cp .env.example .env
```
Abre tu [.env](file:///e:/Documentos/GitHub/factura-electronica/.env) y ajusta los valores de conexión de tu MySQL local:
```env
DB_HOST=localhost
DB_USER=tu_usuario_mysql
DB_PASSWORD=tu_contraseña_mysql
DB_NAME=integrador1_facturacionelectronica
DB_PORT=3306
PORT=4000
JWT_SECRET=facturacion_electronica_secret_key
JWT_EXPIRES_IN=8h
```

### 3. Inicializar la Base de Datos
Este proyecto cuenta con un script que automáticamente creará la base de datos `integrador1_facturacionelectronica`, definirá todas las tablas, relaciones y cargará datos semilla reales de prueba (usuarios, empresas, clientes y productos localizados en Huaraz):
```bash
npm run init-db
```

### 4. Ejecutar el Servidor en Desarrollo
Arranca el backend y observa el puerto en funcionamiento:
```bash
npm run dev
```
El servidor se levantará en: `http://localhost:4000`

---

## 🔑 Credenciales de Acceso Demo

Una vez inicializada la base de datos con `npm run init-db`, podrás ingresar utilizando cualquiera de los siguientes usuarios cargados por defecto:

| Rol | Correo Electrónico | Contraseña |
| :--- | :--- | :--- |
| **Administrador** | `admin@factu.com` | `admin123` |
| **Contador** | `contador@factu.com` | `contador123` |
| **Vendedor** | `vendedor@factu.com` | `vendedor123` |

---

## 💼 Perfil del Desarrollador (¿Por qué contratarme?)

Desarrollar soluciones de **Facturación Electrónica** requiere mucho más que saber estructurar un backend básico; requiere entender criptografía, el manejo de grandes volúmenes de datos transaccionales, y la rigurosa precisión que exigen los entes gubernamentales como SUNAT, SII o SAT.

### Mis Habilidades Demostradas en este Proyecto:
1. **Precisión Técnica y Arquitectura Limpia**: Separación estricta de responsabilidades (MVC) con módulos tributarios aislados que permiten escalar el sistema a otros países sin reescribir el core del negocio.
2. **Dominio Criptográfico y XML**: Generación de esquemas XML complejos y firma digital asimétrica mediante certificados X.509 utilizando algoritmos de digestión y firmas sha256 (RSA-SHA256) con `xml-crypto`.
3. **Optimización Front-End Nativo**: Capacidad para construir interfaces ricas, dinámicas y modernas (gráficos, alertas, modales responsivos) utilizando JavaScript moderno (ES6+) y CSS puro sin depender de librerías externas que ralenticen los tiempos de carga del usuario final.
4. **Resolución de Problemas Críticos**: Lógica robusta para la interpretación y almacenamiento de respuestas binarias (`zip` y `xml` de la SUNAT) y recuperación de errores transaccionales en base de datos MySQL.

Si buscas un desarrollador Full-Stack comprometido con la excelencia técnica, la seguridad y capaz de abordar retos de negocio de alta complejidad, ¡estoy listo para unirme a tu equipo!

✉️ **Contacto**: [Tu Nombre / Tu Correo / Tu LinkedIn]
