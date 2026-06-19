/**
 * Renderiza sidebar y topbar comunes.
 * Cada página llama a renderLayout('clients', 'Clientes')
 */

var NAV_ICONS = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  invoices:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  clients:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  products:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  companies: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  reports:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  users:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  system:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>'
};

var PAGE_SUBTITLES = {
  dashboard: 'Resumen general del sistema',
  invoices:  'Facturación electrónica SUNAT',
  clients:   'Gestión de clientes',
  products:  'Catálogo de productos y servicios',
  companies: 'Configuración de empresas',
  reports:   'Reportes y análisis',
  users:     'Administración de usuarios',
  system:    'Copias de seguridad y restauraciones'
};

function renderLayout(activePage, title) {
  if (!Auth.requireAuth()) return;

  var user = Auth.user;
  var empresas = Auth.empresas;

  var menu = [
    { id: 'dashboard', label: 'Dashboard',  href: '/dashboard.html' },
    { id: 'invoices',  label: 'Facturas',   href: '/invoices.html'  },
    { id: 'clients',   label: 'Clientes',   href: '/clients.html'   },
    { id: 'products',  label: 'Productos',  href: '/products.html'  },
    { id: 'companies', label: 'Empresas',   href: '/companies.html' },
    { id: 'reports',   label: 'Reportes',   href: '/reports.html'   }
  ];
  if (user && user.rol === 'admin') {
    menu.push({ id: 'users', label: 'Usuarios', href: '/users.html' });
    menu.push({ id: 'system', label: 'Mantenimiento', href: '/system.html' });
  }

  var initials = (((user && user.nombre) ? user.nombre.charAt(0) : '?') + ((user && user.apellido) ? user.apellido.charAt(0) : '')).toUpperCase();
  var subtitle = PAGE_SUBTITLES[activePage] || '';
  var userName = escapeHtml(((user && user.nombre) ? user.nombre : '') + ' ' + ((user && user.apellido) ? user.apellido : '')).trim();
  var userEmail = escapeHtml((user && user.email) ? user.email : '');
  var userRol = escapeHtml((user && user.rol) ? user.rol : '');

  var menuHtml = menu.map(function(m) {
    return '<li><a href="' + m.href + '" class="' + (m.id === activePage ? 'active' : '') + '">' +
      '<div class="nav-icon">' + (NAV_ICONS[m.id] || '') + '</div>' +
      '<span class="nav-label">' + m.label + '</span>' +
      '</a></li>';
  }).join('');

  var empresasHtml = empresas.map(function(e) {
    return '<option value="' + e.id + '"' + (String(e.id) === String(Auth.empresaId) ? ' selected' : '') + '>' +
      escapeHtml(e.razon_social) +
      '</option>';
  }).join('');

  document.body.innerHTML =
    '<div class="app">' +
      '<aside class="sidebar">' +
        '<div class="sidebar-brand">' +
          '<div class="sidebar-brand-icon">' +
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
          '</div>' +
          '<div class="sidebar-brand-text"><h2>FactuElectrónica</h2><small>Huaraz, Perú</small></div>' +
        '</div>' +
        '<div class="sidebar-section-label">Menú principal</div>' +
        '<ul class="sidebar-menu">' + menuHtml + '</ul>' +
        '<div class="sidebar-footer">' +
          '<div class="sidebar-docs">' +
            '<a href="/docs/API_Manual_FactuElectronica.pdf" target="_blank" class="btn-docs">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>' +
              '<span>Manual de API</span>' +
            '</a>' +
          '</div>' +
          '<div class="sidebar-user">' +
            '<div class="user-avatar">' + initials + '</div>' +
            '<div class="user-info">' +
              '<div class="user-name">' + userName + '</div>' +
              '<div class="user-role">' + userRol + '</div>' +
            '</div>' +
          '</div>' +
          '<button class="btn-logout" onclick="Auth.logout()">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
            '<span>Cerrar sesión</span>' +
          '</button>' +
        '</div>' +
      '</aside>' +
      '<main class="main">' +
        '<div class="topbar">' +
          '<div class="topbar-left"><div>' +
            '<h1>' + title + '</h1>' +
            (subtitle ? '<div class="topbar-breadcrumb">' + subtitle + '</div>' : '') +
          '</div></div>' +
          '<div class="topbar-right">' +
            '<a href="/docs/API_Manual_FactuElectronica.pdf" target="_blank" class="topbar-api-btn" title="Manual de API para programadores">' +
              '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' +
              '<span>API Docs</span>' +
            '</a>' +
            '<div class="empresa-selector">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' +
              '<select id="empresa-selector">' + empresasHtml + '</select>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div id="page-content"></div>' +
      '</main>' +
    '</div>';

  document.getElementById('empresa-selector').addEventListener('change', function(e) {
    Auth.empresaId = e.target.value;
    location.reload();
  });

  if (!Auth.empresaId && empresas.length) {
    Auth.empresaId = empresas[0].id;
  }
}

function setContent(html) {
  document.getElementById('page-content').innerHTML = html;
}
