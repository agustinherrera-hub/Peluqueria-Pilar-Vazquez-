// ─────────────────────────────────────────────
// SISTEMA DE LOGIN
// ─────────────────────────────────────────────

function getPass(usuario) {
    return localStorage.getItem('pass_' + usuario) || '1234';
}

function setPass(usuario, nueva) {
    localStorage.setItem('pass_' + usuario, nueva);
}

let usuarioActivo = null;

function hacerLogin() {
    const usuario = document.getElementById('loginUsuario').value;
    const pass = document.getElementById('loginPass').value;
    const error = document.getElementById('loginError');

    if (!usuario) {
        error.classList.remove('hidden');
        error.innerHTML = '<i class="fas fa-exclamation-circle"></i> Selecciona una usuaria';
        return;
    }
    if (pass !== getPass(usuario)) {
        error.classList.remove('hidden');
        error.innerHTML = '<i class="fas fa-exclamation-circle"></i> Contraseña incorrecta';
        document.getElementById('loginPass').value = '';
        return;
    }

    error.classList.add('hidden');
    usuarioActivo = usuario;
    document.getElementById('pantallaLogin').style.display = 'none';
    document.getElementById('nombreUsuarioActivo').textContent = '👤 ' + usuario;
}

function cerrarSesion() {
    if (!confirm('¿Segura que quieres cerrar sesión?')) return;
    usuarioActivo = null;
    document.getElementById('loginUsuario').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('pantallaLogin').style.display = 'flex';
    document.getElementById('nombreUsuarioActivo').textContent = '';
}

function abrirCambiarPass() {
    document.getElementById('passActual').value = '';
    document.getElementById('passNueva').value = '';
    document.getElementById('passRepetir').value = '';
    document.getElementById('cambiarPassError').classList.add('hidden');
    document.getElementById('cambiarPassOk').classList.add('hidden');
    document.getElementById('cambiarPassUsuaria').textContent = 'Usuaria: ' + usuarioActivo;
    document.getElementById('modalCambiarPass').classList.remove('hidden');
}

function cerrarCambiarPass() {
    document.getElementById('modalCambiarPass').classList.add('hidden');
}

function guardarNuevaPass() {
    const actual = document.getElementById('passActual').value;
    const nueva = document.getElementById('passNueva').value;
    const repetir = document.getElementById('passRepetir').value;
    const errorEl = document.getElementById('cambiarPassError');
    const okEl = document.getElementById('cambiarPassOk');
    const msgEl = document.getElementById('cambiarPassErrorMsg');

    errorEl.classList.add('hidden');
    okEl.classList.add('hidden');

    if (actual !== getPass(usuarioActivo)) {
        msgEl.textContent = 'La contraseña actual no es correcta';
        errorEl.classList.remove('hidden');
        return;
    }
    if (nueva.length < 4) {
        msgEl.textContent = 'La nueva contraseña debe tener al menos 4 caracteres';
        errorEl.classList.remove('hidden');
        return;
    }
    if (nueva !== repetir) {
        msgEl.textContent = 'Las contraseñas nuevas no coinciden';
        errorEl.classList.remove('hidden');
        return;
    }

    setPass(usuarioActivo, nueva);
    okEl.classList.remove('hidden');
    setTimeout(() => cerrarCambiarPass(), 1500);
}

function toggleVerPass(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

// ─────────────────────────────────────────────

const URL_SCRIPT = 'https://script.google.com/macros/s/AKfycbxzEmpU-gLX8AC2893mzfphimnftKItE6uEQnP5gWQBRjKUCs39VCUtl8-qk85GxPnV/exec';

let SERVICIOS_MASTER = []; 
let CLIENTES_MASTER = [];
let TODAS_LAS_CITAS = [];
let TRABAJADORAS = []; // Lista dinámica de trabajadoras
let RESERVAS_SHEETS = [];
const _citasBorradasSesion = new Set(); // IDs borrados en esta sesion para no reinyectarlos

// Cache de referencias directas a slots: Map<`${colId}-${horaStr}`, HTMLElement>
// Se llena en generarTramosVisuales() y se usa en pintarCitasEnAgenda()
const SLOT_CACHE = new Map();

// ─────────────────────────────────────────────
// Servicios con patrón especial de tinte
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// TABLA DE TIEMPOS POR SERVICIO DE TINTE
// Edita aquí los tiempos de cada servicio:
//   aplicacion : minutos de aplicación (se pinta con 🎨)
//   espera     : minutos de espera/posado (se pinta con ⏳, muy tenue)
//   aclarado   : minutos de aclarado (se pinta con 🚿). Pon 0 si no tiene aclarado.
// ─────────────────────────────────────────────
const TIEMPOS_TINTE = {
    'TINTE CORTE':                  { aplicacion: 15, espera: 30, aclarado: 30, espera2: 0  },
	'TINTE CORTE Y PEINADO':        { aplicacion: 15, espera: 30, aclarado: 60, espera2: 0  },
	'TINTE Y LAVAR':                { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE MEDIO':                  { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE ORGANICO MEDIO':         { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE ORGANICO RETOQUE':       { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE PUNTAS':                 { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTES RAICES':                { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE RETOQUE':                { aplicacion: 15, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE PUNTAS LARGO':           { aplicacion: 30, espera: 30, aclarado: 15, espera2: 0  },
    'TINTE ORGANICO PUNTAS LARGO':  { aplicacion: 30, espera: 30, aclarado: 15, espera2: 0  },
    
};

// Devuelve el config de tiempos si el texto contiene un servicio de tinte, o null si no.
function getTiempsTinte(servicios) {
    if (!servicios) return null;
    const upper = servicios.toUpperCase().trim();
    // Limpiar tabs/espacios de las claves y ordenar de más específico (más largo) a más genérico
    // para evitar que "TINTE CORTE" machee antes que "TINTE CORTE Y PEINADO"
    const entradasOrdenadas = Object.entries(TIEMPOS_TINTE)
        .map(([k, v]) => [k.trim().toUpperCase(), v])
        .sort((a, b) => b[0].length - a[0].length);
    for (const [nombre, config] of entradasOrdenadas) {
        if (upper.includes(nombre)) return config;
    }
    return null;
}

function contieneTinte(servicios) {
    return getTiempsTinte(servicios) !== null;
}

// ─────────────────────────────────────────────
// COLOR POR CLIENTA
// Genera un color único y consistente para cada clienta
// basado en su nombre. Siempre devuelve el mismo color
// para el mismo nombre, sin necesidad de almacenarlo.
// ─────────────────────────────────────────────
const _colorCache = new Map();

function colorParaClientа(nombre) {
    if (!nombre) return '#ec4899';

    // La clave incluye la fecha de la agenda para que el color cambie cada día
    // pero sea siempre el mismo para la misma clienta en el mismo día
    const fechaHoy = document.getElementById('fechaAgenda')?.value || new Date().toISOString().split('T')[0];
    const clave = nombre.trim().toLowerCase() + '|' + fechaHoy;
    if (_colorCache.has(clave)) return _colorCache.get(clave);

    // Paleta de colores vivos pero legibles (fondo oscuro → texto blanco)
    const PALETA = [
        '#e11d48', // rosa fuerte
        '#9333ea', // violeta
        '#2563eb', // azul
        '#059669', // verde esmeralda
        '#d97706', // ámbar
        '#0891b2', // cian
        '#be185d', // fucsia oscuro
        '#7c3aed', // índigo
        '#16a34a', // verde
        '#dc2626', // rojo
        '#ea580c', // naranja
        '#0284c7', // azul cielo
        '#15803d', // verde bosque
        '#6d28d9', // púrpura
        '#b45309', // marrón dorado
        '#0e7490', // azul petróleo
        '#991b1b', // granate
        '#1d4ed8', // azul marino
        '#065f46', // verde oscuro
        '#7e22ce', // morado oscuro
    ];

    // Hash del nombre + fecha para elegir color de la paleta
    let hash = 0;
    for (let i = 0; i < clave.length; i++) {
        hash = (hash * 31 + clave.charCodeAt(i)) >>> 0;
    }
    const color = PALETA[hash % PALETA.length];
    _colorCache.set(clave, color);
    return color;
}

// Versión más clara para el slot de "espera" en tintes
function colorEsperaParaClientа(nombre) {
    // Para espera usamos el mismo color pero muy atenuado
    const base = colorParaClientа(nombre);
    return base + '22'; // añade opacidad baja en hex
}

// ─────────────────────────────────────────────
// UTILIDADES DE HORA
// ─────────────────────────────────────────────
function parsearFecha(fechaRaw) {
    if (!fechaRaw) return '';
    const str = String(fechaRaw).trim();
    // YYYY-MM-DD directo sin pasar por Date (evita bug timezone UTC->local en Espana)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return isoMatch[1] + '-' + isoMatch[2] + '-' + isoMatch[3];
    // DD/MM/YYYY (algunos exports de Sheets)
    const esMatch = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (esMatch) return esMatch[3] + '-' + esMatch[2] + '-' + esMatch[1];
    // Fallback con Date
    const d = new Date(fechaRaw);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function horaAMinutos(horaStr) {
    const [h, m] = (horaStr || '00:00').split(':').map(Number);
    return h * 60 + m;
}

function minutosAHora(minutos) {
    const h = Math.floor(minutos / 60).toString().padStart(2, '0');
    const m = (minutos % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function calcularDuracionNormalizada(duracionRaw) {
    if (!duracionRaw) return 0;
    const str = String(duracionRaw).trim();

    // Formato HH:MM:SS que manda Google Sheets (ej: "1:00:00" = 60 min, "0:45:00" = 45 min)
    if (str.includes(':')) {
        const partes = str.split(':');
        const h = parseInt(partes[0]) || 0;
        const m = parseInt(partes[1]) || 0;
        const raw = h * 60 + m;
        return raw > 0 ? raw : 0;
    }

    const raw = parseFloat(str) || 0;
    if (raw <= 0) return 0;

    // Si es un decimal pequeño (fracción de día de Excel, ej: 0.0416 = 60 min)
    if (raw < 1) {
        return Math.round(raw * 24 * 60);
    }

    // Si ya viene en minutos directamente (ej: 60, 45, 30)
    return raw;
}

function slugify(nombre) {
    return nombre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '');
}

function colIdParaTrabajadora(nombre) {
    return `agenda-${slugify(nombre)}`;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
window.onload = () => {
    const fechaInput = document.getElementById('fechaAgenda');
    if (fechaInput && !fechaInput.value) {
        fechaInput.valueAsDate = new Date();
    }
    actualizarDiaSemana();
    cargarDatosDesdeSheet();

    const inputCliente = document.getElementById('cliente');
    if (inputCliente) {
        inputCliente.addEventListener('input', (e) => {
            verificarNotasCliente(e.target.value);
            mostrarHistorialClientaEnForm(e.target.value);
            mostrarProximasCitasEnForm(e.target.value);
			
			
			const divRGPD = document.getElementById('proteccionDatos');
    const checkRGPD = document.getElementById('checkRGPD');
    const rgpdEstado = document.getElementById('rgpdEstado');
    // Mostrar teléfono editable para clientas NUEVAS
    const divEditarTel = document.getElementById('editarTelefonoDiv');
    if (!clienteEncontrado && valorLimpio.length >= 3) {
        if (divTel) divTel.style.display = 'none'; // no hay tel guardado
        if (divEditarTel) {
            divEditarTel.style.display = 'flex';
            const input = document.getElementById('inputNuevoTelefono');
            if (input) input.value = '';
        }
    } else if (!clienteEncontrado) {
        if (divEditarTel) divEditarTel.style.display = 'none';
    }

    if (divRGPD) {
        if (clienteEncontrado) {
            divRGPD.style.display = 'block';
            const firmado = clienteEncontrado.RGPD === 'SI' || clienteEncontrado.RGPD === true;
            checkRGPD.checked = firmado;
            rgpdEstado.style.display = firmado ? 'block' : 'none';
            checkRGPD.onchange = () => {
                clienteEncontrado.RGPD = checkRGPD.checked ? 'SI' : 'NO';
                rgpdEstado.style.display = checkRGPD.checked ? 'block' : 'none';
            };
        } else if (valorLimpio.length >= 3) {
            // Clienta nueva: mostrar RGPD en blanco para rellenar
            divRGPD.style.display = 'block';
            checkRGPD.checked = false;
            rgpdEstado.style.display = 'none';
            checkRGPD.onchange = () => {
                rgpdEstado.style.display = checkRGPD.checked ? 'block' : 'none';
            };
        } else {
            divRGPD.style.display = 'none';
        }
    }
        });
    }

    setInterval(() => {
        cargarDatosDesdeSheet(true);
    }, 2 * 60 * 1000);
};

function actualizarIndicadorRefresco() {
    const ind = document.getElementById('indicadorRefresco');
    if (!ind) return;
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    ind.textContent = '✓ Act. ' + hora;
    ind.classList.add('actualizado');
    setTimeout(() => ind.classList.remove('actualizado'), 2000);
}

// ─────────────────────────────────────────────
// HISTORIAL DE CLIENTA EN FORMULARIO
// Muestra las últimas visitas incluyendo trabajadora
// ─────────────────────────────────────────────
function mostrarHistorialClientaEnForm(nombreInput) {
    const contenedor = document.getElementById('historialClientaForm');
    if (!contenedor) return;

    const nombreBuscar = nombreInput.trim().toLowerCase();
    if (!nombreBuscar || nombreBuscar.length < 2) {
        contenedor.classList.add('hidden');
        return;
    }

    const hoy = new Date();
    const citasClientaOrdenadas = TODAS_LAS_CITAS
        .filter(c => {
            const nombre = (c.ID_Cliente || '').trim().toLowerCase();
            return nombre.includes(nombreBuscar) && new Date(c.Fecha) < hoy;
        })
        .sort((a, b) => new Date(b.Fecha) - new Date(a.Fecha))
        .slice(0, 5);

    if (citasClientaOrdenadas.length === 0) {
        contenedor.classList.add('hidden');
        return;
    }

    const ultimaCita = citasClientaOrdenadas[0];
    const fechaUltima = new Date(ultimaCita.Fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

    let html = '<p class="text-[10px] font-black text-purple-600 uppercase mb-2">📋 Últimas visitas</p>';
    html += '<div class="space-y-1">';
    citasClientaOrdenadas.forEach(c => {
        const fecha = new Date(c.Fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
        const trabajadoraLabel = c.Trabajadora
            ? `<span style="font-size:9px;font-weight:700;color:#a855f7;margin-left:3px;">(${c.Trabajadora})</span>`
            : '';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:10px;padding:3px 0;border-bottom:1px solid #f3e8ff;">';
        html += `<span style="font-weight:700;color:#7e22ce;white-space:nowrap;margin-right:6px;">${fecha}${trabajadoraLabel}</span>`;
        html += `<span style="color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px;">${(c.Servicios || '-')}</span>`;
        html += '</div>';
    });
    html += '</div>';
    html += `<p style="font-size:9px;color:#c084fc;margin-top:4px;">Última visita: ${fechaUltima}</p>`;

    contenedor.innerHTML = html;
    contenedor.classList.remove('hidden');
}

// ─────────────────────────────────────────────
// PRÓXIMAS CITAS EN FORMULARIO
// Muestra próximas citas incluyendo trabajadora
// ─────────────────────────────────────────────
function mostrarProximasCitasEnForm(nombreInput) {
    const contenedor = document.getElementById('proximasCitasForm');
    if (!contenedor) return;

    const nombreBuscar = nombreInput.trim().toLowerCase();
    if (!nombreBuscar || nombreBuscar.length < 2) {
        contenedor.style.display = 'none';
        return;
    }

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    const citasFuturas = TODAS_LAS_CITAS
        .filter(c => {
            const nombre = (c.ID_Cliente || '').trim().toLowerCase();
            const fechaCita = new Date(c.Fecha);
            fechaCita.setHours(0, 0, 0, 0);
            return nombre.includes(nombreBuscar) && fechaCita >= hoy;
        })
        .sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha))
        .slice(0, 5);

    if (citasFuturas.length === 0) {
        contenedor.style.display = 'none';
        return;
    }

    let html = '<p class="text-[10px] font-black text-blue-600 uppercase mb-2">📅 Próximas citas</p>';
    html += '<div class="space-y-1">';
    citasFuturas.forEach(c => {
        const fecha = new Date(c.Fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const trabajadoraLabel = c.Trabajadora
            ? `<span style="font-size:9px;font-weight:700;color:#3b82f6;"> · ${c.Trabajadora}</span>`
            : '';
        html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;font-size:10px;padding:3px 0;border-bottom:1px solid #dbeafe;">';
        html += `<span style="font-weight:700;color:#1d4ed8;white-space:nowrap;margin-right:6px;">${fecha} ${(c.Hora_Inicio || '')}${trabajadoraLabel}</span>`;
        html += `<span style="color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px;">${(c.Servicios || '-')}</span>`;
        html += '</div>';
    });
    html += '</div>';

    contenedor.innerHTML = html;
    contenedor.style.display = 'block';
}

function actualizarDiaSemana() {
    const input = document.getElementById('fechaAgenda');
    const span = document.getElementById('diaSemana');
    if (!input || !span || !input.value) return;
    const fecha = new Date(input.value + 'T00:00:00');
    const dia = fecha.toLocaleDateString('es-ES', { weekday: 'long' });
    span.textContent = dia.charAt(0).toUpperCase() + dia.slice(1);
}

function cambiarDia() {
    actualizarDiaSemana();
    _colorCache.clear(); // Limpiar cache para recalcular colores con la nueva fecha
    pintarCitasEnAgenda(TODAS_LAS_CITAS);
}

// ─────────────────────────────────────────────
// GENERAR COLUMNAS DE AGENDA DINÁMICAMENTE
// Se regenera solo si cambia la lista de trabajadoras
// ─────────────────────────────────────────────
function generarColumnasAgenda() {
    const grid = document.getElementById('agenda-grid');
    if (!grid) return;
    grid.innerHTML = '';

    TRABAJADORAS.forEach(t => {
        const colId = colIdParaTrabajadora(t.Nombre);
        const section = document.createElement('section');
        section.className = 'column bg-white rounded-3xl shadow-sm overflow-hidden border border-gray-100';
        section.innerHTML = `
            <div class="col-header bg-pink-500 text-white p-3 text-center font-black tracking-widest">${t.Nombre.toUpperCase()}</div>
            <div id="${colId}" class="slots-container relative py-2 min-h-[600px]"></div>
        `;
        grid.appendChild(section);
    });

    generarTramosVisuales();
}

// ─────────────────────────────────────────────
// GENERAR TRAMOS VISUALES
// Llena SLOT_CACHE con referencias directas para
// evitar querySelectorAll en cada pintado
// ─────────────────────────────────────────────
function generarTramosVisuales() {
    SLOT_CACHE.clear();

    TRABAJADORAS.forEach(t => {
        const id = colIdParaTrabajadora(t.Nombre);
        const cont = document.getElementById(id);
        if (!cont) return;

        const fragmento = document.createDocumentFragment();

        for (let h = 7; h <= 20; h++) {
            for (let m = 0; m < 60; m += 15) {
                if (h === 7 && m < 30) continue;
                if (h === 20 && m > 0) continue;

                const horaStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
                const div = document.createElement('div');
                const esMarcador = (m === 0 || m === 30);
                const esCuarto = (m === 15 || m === 45);

                const claseBase = "slot-15 flex items-center px-2 border-b " + (esMarcador
                    ? "text-[11px] font-bold text-pink-400 border-pink-200 bg-pink-50"
                    : esCuarto
                        ? "text-[10px] font-semibold text-gray-500 border-gray-200"
                        : "text-[9px] text-gray-400 border-gray-100");

                div.className = claseBase;
                div.id = `slot-${id}-${horaStr}`;
                div.style.position = 'relative';
                div.innerHTML = `<span style="position:relative;z-index:10;pointer-events:none;font-size:inherit;font-weight:inherit;color:inherit;">${horaStr}</span>`;

                // Guardar referencia directa + clase vacia para reset sin re-query
                div._claseVacia = claseBase;
                div._horaStr = horaStr;
                SLOT_CACHE.set(`${id}-${horaStr}`, div);

                fragmento.appendChild(div);
            }
        }

        cont.innerHTML = '';
        cont.style.position = "relative";
        cont.appendChild(fragmento);
    });
}

// ─────────────────────────────────────────────
// BOTONES TRABAJADORA EN FORMULARIO (DINÁMICO)
// Se regenera al cambiar la lista de trabajadoras
// ─────────────────────────────────────────────
function generarBotonesTrabajadora() {
    const contenedor = document.getElementById('contenedorBotonesTrabajadora');
    if (!contenedor) return;
    contenedor.innerHTML = '';

    const estiloInactivo = 'padding:1rem;border-radius:1rem;font-weight:900;font-size:1rem;border:2px solid #e2e8f0;background:#f8fafc;color:#64748b;cursor:pointer;transition:all 0.15s;width:100%;';

    TRABAJADORAS.forEach(t => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = `btnTrabajadora-${slugify(t.Nombre)}`;
        btn.style.cssText = estiloInactivo;
        btn.textContent = t.Nombre.toUpperCase();
        btn.onclick = () => seleccionarTrabajadora(t.Area || t.Nombre, t.Nombre);
        contenedor.appendChild(btn);
    });
}

// ─────────────────────────────────────────────
// BOTONES DE HORA EN FORMULARIO
// ─────────────────────────────────────────────
function generarBotonesHora() {
    const contenedor = document.getElementById('gridHorasSeleccion');
    if (!contenedor) return;

    const fechaSel = document.getElementById('fechaCita').value;
    const areaSel = document.getElementById('areaNegocio').value;
    const trabajadoraSel = document.getElementById('trabajadora').value;

    // Calcular duración actual seleccionada (servicios marcados)
    let duracionSel = 0;
    document.querySelectorAll('input[name="serv"]:checked').forEach(cb => {
        duracionSel += Number(cb.getAttribute('data-duracion')) || 0;
    });
    // Slots consecutivos necesarios (mínimo 1)
    const slotsNecesarios = duracionSel > 0 ? Math.ceil(duracionSel / 15) : 1;

    // Mostrar/ocultar aviso de filtro por duración
    const avisoEl = document.getElementById('avisoHorasDuracion');
    const textoMinEl = document.getElementById('textoMinDuracion');
    if (avisoEl && textoMinEl) {
        if (duracionSel > 0) {
            textoMinEl.textContent = duracionSel;
            avisoEl.style.display = 'block';
        } else {
            avisoEl.style.display = 'none';
        }
    }

    const tramosOcupados = new Set();

    TODAS_LAS_CITAS
        .filter(c => {
            try {
                const fechaCita = parsearFecha(c.Fecha);
                if (fechaCita !== fechaSel) return false;
                if (trabajadoraSel) {
                    return c.Trabajadora === trabajadoraSel || c.Area === areaSel;
                }
                return c.Area === areaSel;
            } catch(e) { return false; }
        })
        .forEach(cita => {
            getRangoVisual(cita).forEach(min => {
                tramosOcupados.add(minutosAHora(min));
            });
        });

    // Añadir slots bloqueados manualmente
    if (trabajadoraSel) {
        const colIdSel = colIdParaTrabajadora(trabajadoraSel);
        SLOTS_BLOQUEADOS.forEach((b) => {
            if (b.fecha === fechaSel && b.colId === colIdSel) {
                tramosOcupados.add(b.horaStr);
            }
        });
    }

    // Añadir tramos de bloques ya confirmados en este formulario (provisionales)
    bloquesConfirmados.forEach(bProv => {
        if (bProv.trabajadora !== trabajadoraSel) return;
        const inicioMin = horaAMinutos(bProv.hora);
        const tramosBloque = bProv.duracion > 0 ? Math.ceil(bProv.duracion / 15) : 1;
        for (let i = 0; i < tramosBloque; i++) {
            tramosOcupados.add(minutosAHora(inicioMin + i * 15));
        }
    });

    // Generar todos los slots posibles
    const todosLosSlots = [];
    for (let h = 7; h <= 20; h++) {
        for (let m = 0; m < 60; m += 15) {
            if (h === 7 && m < 30) continue;
            if (h === 20 && m > 0) continue;
            todosLosSlots.push(h * 60 + m);
        }
    }

    // Para cada slot libre, comprobar si caben los slots necesarios consecutivos
    let htmlBotones = '';
    todosLosSlots.forEach(minInicio => {
        const horaStr = minutosAHora(minInicio);
        if (tramosOcupados.has(horaStr)) return; // el propio slot está ocupado

        // Comprobar que los N slots siguientes también están libres
        let caben = true;
        for (let i = 1; i < slotsNecesarios; i++) {
            const minSig = minInicio + i * 15;
            if (minSig > 20 * 60) { caben = false; break; }
            if (tramosOcupados.has(minutosAHora(minSig))) { caben = false; break; }
        }

        if (caben) {
            htmlBotones += `<div class="btn-hora" data-hora="${horaStr}" tabindex="0" role="button" aria-label="${horaStr}">${horaStr}</div>`;
        }
    });

    contenedor.innerHTML = htmlBotones || '<p class="text-xs text-gray-400 text-center col-span-4 py-4">No hay horas disponibles</p>';

    const estiloHoraActiva   = 'padding:0.5rem;text-align:center;font-size:0.75rem;background:#ec4899;color:white;border:2px solid #ec4899;border-radius:0.5rem;cursor:pointer;font-weight:700;';
    const estiloHoraInactiva = 'padding:0.5rem;text-align:center;font-size:0.75rem;background:white;color:#1e293b;border:1px solid #e2e8f0;border-radius:0.5rem;cursor:pointer;font-weight:400;';

    contenedor.querySelectorAll('.btn-hora').forEach(b => b.style.cssText = estiloHoraInactiva);

    function seleccionarBoton(boton) {
        contenedor.querySelectorAll('.btn-hora').forEach(b => b.style.cssText = estiloHoraInactiva);
        boton.style.cssText = estiloHoraActiva;
        document.getElementById('horaSeleccionada').value = boton.getAttribute('data-hora');
        boton.scrollIntoView({ block: 'nearest' });
    }

    contenedor.onclick = (e) => {
        const botonPulsado = e.target.closest('.btn-hora');
        if (botonPulsado) seleccionarBoton(botonPulsado);
    };

    contenedor.onkeydown = (e) => {
        const botones = [...contenedor.querySelectorAll('.btn-hora')];
        if (!botones.length) return;

        const activo = contenedor.querySelector('.btn-hora.active') || contenedor.querySelector('.btn-hora:focus');
        const idx = activo ? botones.indexOf(activo) : -1;
        const cols = 4;

        let nuevoIdx = idx;
        if (e.key === 'ArrowRight') nuevoIdx = Math.min(idx + 1, botones.length - 1);
        else if (e.key === 'ArrowLeft') nuevoIdx = Math.max(idx - 1, 0);
        else if (e.key === 'ArrowDown') nuevoIdx = Math.min(idx + cols, botones.length - 1);
        else if (e.key === 'ArrowUp') nuevoIdx = Math.max(idx - cols, 0);
        else if (e.key === 'Enter' || e.key === ' ') {
            if (activo) seleccionarBoton(activo);
            e.preventDefault();
            return;
        } else if (e.key === 'Tab') {
            e.preventDefault();
            document.getElementById('selectCategoria').focus();
            return;
        } else return;

        e.preventDefault();
        botones[nuevoIdx].focus();
        seleccionarBoton(botones[nuevoIdx]);
    };
}

// ─────────────────────────────────────────────
// CARGAR DATOS DESDE SHEET
// ─────────────────────────────────────────────
async function cargarDatosDesdeSheet(silencioso = false) {
    try {
        const response = await fetch(URL_SCRIPT);
        const data = await response.json();

        SERVICIOS_MASTER = data.servicios || [];
        CLIENTES_MASTER = data.clientes || [];
        RESERVAS_SHEETS = data.reservas || [];

        // ── Cargar tiempos de tinte desde Sheets (sincronizado entre dispositivos) ──
        if (data.tiemposTinte && Object.keys(data.tiemposTinte).length > 0) {
            for (const [nombre, cfg] of Object.entries(data.tiemposTinte)) {
                TIEMPOS_TINTE[nombre] = {
                    aplicacion: cfg.aplicacion || 0,
                    espera:     cfg.espera     || 0,
                    aclarado:   cfg.aclarado   || 0,
                    espera2:    cfg.espera2    || 0
                };
            }
        }

        // Limpiar del localStorage los bloqueos que ya no están en Sheets
        const idsEnSheets = new Set((data.reservas || []).map(r => r.ID_RESERVA));
        const reservasClave = new Set((data.reservas || []).map(r => `${r.Fecha}|${r.Hora}|${r.Trabajadora}`));
        try {
            const bloqueosGuardados = JSON.parse(localStorage.getItem('slotsBloqueados') || '[]');
            const bloqueosFiltrados = bloqueosGuardados.filter(b => {
                if (b.idSheets && !b.idSheets.startsWith('RES-LOCAL')) {
                    return idsEnSheets.has(b.idSheets);
                }
                // RES-LOCAL: comprobar por fecha+hora+trabajadora
                const clave = `${b.fecha}|${b.horaStr}|${b.trabajadora}`;
                return reservasClave.has(clave);
            });
            localStorage.setItem('slotsBloqueados', JSON.stringify(bloqueosFiltrados));
        } catch(e) {}

        // Rescatar citas pendientes guardadas localmente ANTES de machacar TODAS_LAS_CITAS
        const pendientesAntes = JSON.parse(localStorage.getItem('citasPendientes') || '[]');

        // Los datos de Sheets son la fuente de verdad — si una cita no está en Sheets
        // es porque ya fue borrada (desde cualquier dispositivo). No usamos citasEliminadas
        // del localStorage para filtrar las citas de Sheets, porque eso impediría ver
        // en este dispositivo borrados hechos desde otro dispositivo.
        TODAS_LAS_CITAS = (data.agenda || []).filter(c =>
            c.ID_Cita && c.ID_Cita.trim() !== '' &&
            c.Fecha && c.Fecha.trim() !== ''
        );

        // Limpiar citasEliminadas del localStorage — ya no son necesarias
        localStorage.removeItem('citasEliminadas');

        // Reinyectar pendientes locales que aun no hayan llegado a Sheets
        // EXCEPTO los que el usuario haya borrado en esta sesion (_citasBorradasSesion)
        const pendientesSiguientes = [];
        pendientesAntes.forEach(p => {
            const idPend = (p.ID_Cita || "").trim();
            if (_citasBorradasSesion.has(idPend)) return;
            const yaEnSheet = TODAS_LAS_CITAS.some(c =>
                c.Fecha === p.Fecha &&
                c.Hora_Inicio === p.Hora_Inicio &&
                c.ID_Cliente === p.ID_Cliente &&
                c.Trabajadora === p.Trabajadora
            );
            if (!yaEnSheet) {
                TODAS_LAS_CITAS.push(p);
                pendientesSiguientes.push(p);
            }
        });
        localStorage.setItem('citasPendientes', JSON.stringify(pendientesSiguientes));

        // ── Detectar trabajadoras dinámicamente ──
        let nuevasTrabajadoras;

        if (data.trabajadoras && data.trabajadoras.length > 0) {
            nuevasTrabajadoras = data.trabajadoras
                .filter(t => t.Nombre && t.Nombre.trim() !== '')
                .map(t => ({ Nombre: t.Nombre.trim(), Area: (t.Area || t.Nombre).trim() }));
        } else {
            const mapaVistas = new Map();
            TODAS_LAS_CITAS.forEach(c => {
                const nombre = (c.Trabajadora || '').trim();
                const area = (c.Area || '').trim();
                if (nombre && !mapaVistas.has(nombre)) {
                    mapaVistas.set(nombre, area || nombre);
                }
            });
            if (mapaVistas.size > 0) {
                nuevasTrabajadoras = [...mapaVistas.entries()].map(([nombre, area]) => ({ Nombre: nombre, Area: area }));
            } else {
                nuevasTrabajadoras = [
                    { Nombre: 'Pili', Area: 'Peluquería' },
                    { Nombre: 'Marina', Area: 'Estética' }
                ];
            }
        }

        const setActuales = new Set(TRABAJADORAS.map(t => t.Nombre));
        const setNuevos   = new Set(nuevasTrabajadoras.map(t => t.Nombre));
        const cambiaronTrabajadoras =
            setActuales.size !== setNuevos.size ||
            [...setNuevos].some(n => !setActuales.has(n));

        if (cambiaronTrabajadoras) {
            TRABAJADORAS = nuevasTrabajadoras;
            generarColumnasAgenda();
            generarBotonesTrabajadora();
        }

        // ── Actualizar lista de clientes ──
        const listaClientes = document.getElementById('listaClientes');
        if (listaClientes) {
            const htmlClientes = CLIENTES_MASTER
                .map(c => `<option value="${(`${(c.Nombre||'').trim()} ${(c.Apellidos||'').trim()}`).trim()}">`)
                .join('');
            listaClientes.innerHTML = htmlClientes;
        }

        // ── Actualizar categorías de servicios ──
        const selectCat = document.getElementById('selectCategoria');
        const contS = document.getElementById('contenedorServicios');
        if (selectCat) {
            const categorias = [...new Set(
                SERVICIOS_MASTER
                    .filter(s => s.Servicio && s.Servicio.trim() !== '' && s.Categoria && s.Categoria.trim() !== '')
                    .map(s => s.Categoria.trim())
            )];
            // Guardar la categoría seleccionada ANTES de reescribir el select
            const catSeleccionada = selectCat.value;
            selectCat.innerHTML = '<option value="">-- Selecciona categoría --</option>'
                + categorias.map(cat => `<option value="${cat}">${cat}</option>`).join('');
            // Restaurar si la categoría sigue existiendo (usuario estaba eligiendo servicios)
            if (catSeleccionada && categorias.includes(catSeleccionada)) {
                selectCat.value = catSeleccionada;
            } else {
                if (contS) contS.innerHTML = '';
            }
        } else {
            if (contS) contS.innerHTML = '';
        }

        pintarCitasEnAgenda(TODAS_LAS_CITAS);
        cargarBloqueos();
        actualizarIndicadorRefresco();

    } catch (error) {
        console.error("Error cargando datos:", error);
    }
}

// ─────────────────────────────────────────────
// ELIMINAR CITA
// ─────────────────────────────────────────────
// IDs borrados en esta sesion — evita que el refresco los reinyecte desde citasPendientes

async function eliminarCita(idCita) {
    if (!confirm('\u00bfSeguro que quieres eliminar esta cita?')) return;

    // Registrar el ID como borrado para que el refresco no lo reinyecte
    _citasBorradasSesion.add(idCita.trim());

    // Quitar de memoria local inmediatamente
    TODAS_LAS_CITAS = TODAS_LAS_CITAS.filter(c => (c.ID_Cita || '').trim() !== idCita.trim());

    // Quitar tambien del localStorage de pendientes
    try {
        const pendientes = JSON.parse(localStorage.getItem('citasPendientes') || '[]');
        const nuevasPendientes = pendientes.filter(p => (p.ID_Cita || '').trim() !== idCita.trim());
        localStorage.setItem('citasPendientes', JSON.stringify(nuevasPendientes));
    } catch(e) {}

    pintarCitasEnAgenda(TODAS_LAS_CITAS);

    // Esperar confirmación de Sheets ANTES de continuar,
    // así cualquier refresco posterior ya verá la cita borrada
    try {
        const _payloadEliminar = encodeURIComponent(JSON.stringify({ accion: 'eliminar', id: idCita }));
        await fetch(URL_SCRIPT + '?payload=' + _payloadEliminar);
        // Recargar desde Sheets para que todos los dispositivos queden sincronizados
        await cargarDatosDesdeSheet(true);
    } catch(err) {
        console.error('Error al eliminar en Sheet:', err);
    }
}

// ─────────────────────────────────────────────
// SERVICIOS Y FORMULARIO
// ─────────────────────────────────────────────
function filtrarServiciosPorCategoria() {
    const categoria = document.getElementById('selectCategoria').value;
    // Limpiar buscador al cambiar categoría
    const buscador = document.getElementById('buscadorServicios');
    if (buscador) buscador.value = '';

    if (!categoria) {
        const contS = document.getElementById('contenedorServicios');
        if (contS) contS.innerHTML = '';
        return;
    }

    const serviciosFiltrados = SERVICIOS_MASTER.filter(s =>
        s.Servicio && s.Servicio.trim() !== '' &&
        s.Categoria && s.Categoria.trim() === categoria
    );
    renderizarServicios(serviciosFiltrados);
}

function buscarServicio() {
    const texto = (document.getElementById('buscadorServicios').value || '').trim().toLowerCase();
    const categoria = document.getElementById('selectCategoria').value;

    let base = SERVICIOS_MASTER.filter(s =>
        s.Servicio && s.Servicio.trim() !== '' &&
        (!categoria || s.Categoria.trim() === categoria)
    );

    if (texto) {
        base = base.filter(s => s.Servicio.toLowerCase().includes(texto));
    }

    renderizarServicios(base);
}

// ─────────────────────────────────────────────
// RENDERIZAR SERVICIOS EN EL CONTENEDOR
// ─────────────────────────────────────────────
function renderizarServicios(lista) {
    const contenedor = document.getElementById('contenedorServicios');
    if (!contenedor) return;

    if (!lista || lista.length === 0) {
        contenedor.innerHTML = '<p class="text-xs text-gray-400 text-center py-4">No hay servicios</p>';
        return;
    }

    // Guardar los servicios ya marcados ANTES de redibujar
    const yaSeleccionados = new Set(
        Array.from(document.querySelectorAll('input[name="serv"]:checked')).map(cb => cb.value)
    );

    contenedor.innerHTML = lista.map(s => {
        const nombre = (s.Servicio || '').trim();
        const duracion = Number(s.Duracion_Min) || 0;
        const id = 'serv-' + nombre.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
        const checked = yaSeleccionados.has(nombre) ? 'checked' : '';
        const estiloFila = yaSeleccionados.has(nombre)
            ? 'background:#fdf2f8;border:1px solid #f9a8d4;'
            : 'background:white;border:1px solid #f1f5f9;';
        return `
            <div class="servicio-fila" style="${estiloFila}">
                <label for="${id}" style="flex:1;cursor:pointer;font-size:0.82rem;font-weight:600;color:#1e293b;">
                    ${nombre}
                </label>
                <span style="font-size:0.75rem;color:#94a3b8;margin-right:8px;">${duracion} min</span>
                <input type="checkbox" id="${id}" name="serv" value="${nombre}"
                    data-duracion="${duracion}"
                    onchange="calcularDuracion()"
                    ${checked}
                    style="width:18px;height:18px;accent-color:#ec4899;cursor:pointer;flex-shrink:0;">
            </div>`;
    }).join('');
}

function verificarNotasCliente(valorInput) {
    const aviso = document.getElementById('avisoNotas');
    const texto = document.getElementById('textoNotas');
    const divTel = document.getElementById('telefonoCliente');
    const textoTel = document.getElementById('textoTelefono');
    const enlaceLlamar = document.getElementById('enlaceLlamar');
    if (!aviso || !texto) return;

    const valorLimpio = valorInput.trim().toLowerCase();
    const clienteEncontrado = CLIENTES_MASTER.find(c =>
        `${(c.Nombre||'').trim()} ${(c.Apellidos||'').trim()}`.trim().toLowerCase() === valorLimpio
    );

    if (clienteEncontrado && clienteEncontrado.Notas && clienteEncontrado.Notas.trim() !== "") {
        texto.textContent = clienteEncontrado.Notas;
        aviso.classList.remove('hidden');
    } else {
        aviso.classList.add('hidden');
    }

    if (clienteEncontrado) {

    }

    const tel = clienteEncontrado
        ? (clienteEncontrado.Telefono || clienteEncontrado.Tel || clienteEncontrado.Teléfono ||
           clienteEncontrado.telefono || clienteEncontrado.TELEFONO || clienteEncontrado.Movil ||
           clienteEncontrado.Móvil || clienteEncontrado.movil || clienteEncontrado.Phone ||
           clienteEncontrado.phone || '').toString().trim()
        : '';

   if (divTel && textoTel && enlaceLlamar) {
        if (tel) {
            textoTel.textContent = tel;
            enlaceLlamar.href = 'tel:' + tel.replace(/\s/g, '');
            divTel.style.display = 'flex';
        } else {
            divTel.style.display = 'none';
        }
    }

    const divEditarTel = document.getElementById('editarTelefonoDiv');
    if (!tel && clienteEncontrado) {
        if (divEditarTel) divEditarTel.style.display = 'flex';
        const input = document.getElementById('inputNuevoTelefono');
        if (input) input.value = '';
    }

    const divRGPD = document.getElementById('proteccionDatos');
    const checkRGPD = document.getElementById('checkRGPD');
    const rgpdEstado = document.getElementById('rgpdEstado');
    if (divRGPD) {
        if (clienteEncontrado) {
            divRGPD.style.display = 'block';
            const firmado = clienteEncontrado.RGPD === 'SI' || clienteEncontrado.RGPD === true;
            checkRGPD.checked = firmado;
            rgpdEstado.style.display = firmado ? 'block' : 'none';
            checkRGPD.onchange = () => {
                clienteEncontrado.RGPD = checkRGPD.checked ? 'SI' : 'NO';
                rgpdEstado.style.display = checkRGPD.checked ? 'block' : 'none';
            };
        } else {
            divRGPD.style.display = 'none';
        }
    }
}

// ─────────────────────────────────────────────
// SELECCIÓN DE TRABAJADORA (DINÁMICA)
// ─────────────────────────────────────────────
function seleccionarTrabajadora(area, nombreTrabajadora) {
    document.getElementById('areaNegocio').value = area;
    document.getElementById('trabajadora').value = nombreTrabajadora;

    const estiloActivo   = 'padding:1rem;border-radius:1rem;font-weight:900;font-size:1rem;border:2px solid #ec4899;background:#ec4899;color:white;cursor:pointer;transition:all 0.15s;width:100%;';
    const estiloInactivo = 'padding:1rem;border-radius:1rem;font-weight:900;font-size:1rem;border:2px solid #e2e8f0;background:#f8fafc;color:#64748b;cursor:pointer;transition:all 0.15s;width:100%;';

    TRABAJADORAS.forEach(t => {
        const btn = document.getElementById(`btnTrabajadora-${slugify(t.Nombre)}`);
        if (btn) btn.style.cssText = (t.Nombre === nombreTrabajadora) ? estiloActivo : estiloInactivo;
    });

    generarBotonesHora();
}

function abrirFormulario() {
    const modal = document.getElementById('modalCita');
    modal.classList.remove('hidden');
    document.getElementById('horaSeleccionada').value = "";
    document.getElementById('fechaCita').value = document.getElementById('fechaAgenda').value;
    generarBotonesHora();
    setTimeout(() => document.getElementById('fechaCita').focus(), 50);

    modal._focusTrap = (e) => {
        if (e.key !== 'Tab') return;
        const focusables = [...modal.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]'
        )].filter(el => !el.closest('.hidden'));
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
            if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
            if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
    };
    document.addEventListener('keydown', modal._focusTrap);

    modal._escTrap = (e) => { if (e.key === 'Escape') cerrarFormulario(); };
    document.addEventListener('keydown', modal._escTrap);
}

function cerrarFormulario() {
    const modal = document.getElementById('modalCita');
    modal.classList.add('hidden');
    document.getElementById('formCita').reset();
    document.getElementById('labelDuracion').textContent = "0 min";
    document.getElementById('avisoNotas').classList.add('hidden');
    const proxCitas = document.getElementById('proximasCitasForm');
    if (proxCitas) proxCitas.style.display = 'none';
    const historial = document.getElementById('historialClientaForm');
    if (historial) historial.classList.add('hidden');

    const estiloInactivo = 'padding:1rem;border-radius:1rem;font-weight:900;font-size:1rem;border:2px solid #e2e8f0;background:#f8fafc;color:#64748b;cursor:pointer;transition:all 0.15s;width:100%;';
    TRABAJADORAS.forEach(t => {
        const btn = document.getElementById(`btnTrabajadora-${slugify(t.Nombre)}`);
        if (btn) btn.style.cssText = estiloInactivo;
    });
    document.getElementById('areaNegocio').value = '';
    document.getElementById('trabajadora').value = '';

    // Limpiar bloques confirmados y sus overlays provisionales en la agenda
    bloquesConfirmados = [];
    document.querySelectorAll('.bloque-provisional').forEach(el => el.remove());
    const resumen = document.getElementById('resumenBloques');
    if (resumen) { resumen.innerHTML = ''; resumen.style.display = 'none'; }

    if (modal._focusTrap) document.removeEventListener('keydown', modal._focusTrap);
    if (modal._escTrap) document.removeEventListener('keydown', modal._escTrap);
    setTimeout(() => document.querySelector('.btn-nueva-cita').focus(), 50);
}

// ─────────────────────────────────────────────
// BLOQUES DE SERVICIOS CONFIRMADOS
// Cada bloque = { trabajadora, area, hora, servicios[], duracion }
// ─────────────────────────────────────────────
let bloquesConfirmados = [];

function calcularDuracion() {
    let total = 0;
    document.querySelectorAll('input[name="serv"]:checked').forEach(cb => {
        const minutos = Number(cb.getAttribute('data-duracion'));
        if (!isNaN(minutos)) total += minutos;
    });
    const label = document.getElementById('labelDuracion');
    if (label) label.textContent = total + " min";

    // Regenerar horas si ya hay trabajadora seleccionada, para filtrar por duración
    const trabajadora = document.getElementById('trabajadora')?.value;
    if (trabajadora) generarBotonesHora();

    return total;
}

function calcularDuracionTotal() {
    // Suma de todos los bloques confirmados + lo que haya seleccionado ahora
    const confirmados = bloquesConfirmados.reduce((acc, b) => acc + b.duracion, 0);
    let actual = 0;
    document.querySelectorAll('input[name="serv"]:checked').forEach(cb => {
        actual += Number(cb.getAttribute('data-duracion')) || 0;
    });
    return confirmados + actual;
}

function pintarBloquesProvisionalesEnAgenda() {
    // 1. Quitar todos los bloques provisionales anteriores
    document.querySelectorAll('.bloque-provisional').forEach(el => el.remove());

    const fechaSel = document.getElementById('fechaCita')?.value || document.getElementById('fechaAgenda')?.value || '';

    bloquesConfirmados.forEach((b) => {
        const colId = colIdParaTrabajadora(b.trabajadora);
        const inicioMin = horaAMinutos(b.hora);
        const tramos = b.duracion > 0 ? Math.ceil(b.duracion / 15) : 1;
        const horaFin = minutosAHora(inicioMin + tramos * 15);

        for (let i = 0; i < tramos; i++) {
            const tramoMin = inicioMin + i * 15;
            const tramoHora = minutosAHora(tramoMin);
            const slot = SLOT_CACHE.get(`${colId}-${tramoHora}`);
            if (!slot) continue;

            const over = document.createElement('div');
            over.className = 'bloque-provisional';
            over.style.cssText = `
                position:absolute;top:0;left:0;width:100%;height:100%;
                background: repeating-linear-gradient(
                    45deg,
                    rgba(236,72,153,0.55) 0px,
                    rgba(236,72,153,0.55) 6px,
                    rgba(253,242,248,0.7) 6px,
                    rgba(253,242,248,0.7) 12px
                );
                border-left: 3px solid #ec4899;
                display:flex;align-items:center;
                padding:0 4px;font-size:9px;font-weight:800;color:#be185d;
                z-index:4;pointer-events:none;box-sizing:border-box;
                text-shadow: 0 1px 1px rgba(255,255,255,0.8);
            `;
            if (i === 0) {
                over.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">✏️ ${b.hora}-${horaFin} ${b.servicios.join(', ')}</span>`;
            } else {
                over.innerHTML = `<span style="font-size:8px;opacity:0.7;">✏️ ${b.trabajadora}</span>`;
            }
            slot.style.position = 'relative';
            slot.appendChild(over);
            const sh = slot.querySelector('span');
            if (sh) sh.style.color = '#be185d';
        }
    });
}

function actualizarResumenBloques() {
    const contenedor = document.getElementById('resumenBloques');
    if (!contenedor) return;
    if (bloquesConfirmados.length === 0) {
        contenedor.innerHTML = '';
        contenedor.style.display = 'none';
        pintarBloquesProvisionalesEnAgenda();
        return;
    }
    contenedor.style.display = 'block';
    let html = '<p class="text-[10px] font-black text-pink-600 uppercase mb-2">✅ Servicios confirmados</p>';
    bloquesConfirmados.forEach((b, i) => {
        html += `
        <div style="display:flex;justify-content:space-between;align-items:center;background:white;border:1px solid #fce7f3;border-radius:0.5rem;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:11px;">
            <div>
                <span style="font-weight:800;color:#ec4899;">${b.trabajadora}</span>
                <span style="color:#64748b;margin-left:4px;">${b.hora} · ${b.servicios.join(', ')}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:10px;color:#94a3b8;">${b.duracion} min</span>
                <button type="button" onclick="eliminarBloque(${i})" style="background:none;border:none;color:#fca5a5;cursor:pointer;font-size:13px;padding:0;">✕</button>
            </div>
        </div>`;
    });
    contenedor.innerHTML = html;
    // Pintar provisionales en la agenda
    pintarBloquesProvisionalesEnAgenda();
}

function eliminarBloque(idx) {
    bloquesConfirmados.splice(idx, 1);
    actualizarResumenBloques();
}

function confirmarServicios() {
    const checkboxes = document.querySelectorAll('input[name="serv"]:checked');
    if (checkboxes.length === 0) return alert("Selecciona al menos un servicio.");

    const trabajadora = document.getElementById('trabajadora').value;
    if (!trabajadora) return alert("Selecciona una trabajadora.");

    const serviciosSeleccionados = Array.from(checkboxes).map(cb => cb.value);

    const hora = document.getElementById('horaSeleccionada').value;
    if (!hora) return alert("Selecciona una hora de inicio.");
    let duracion = 0;
    checkboxes.forEach(cb => { duracion += Number(cb.getAttribute('data-duracion')) || 0; });
    bloquesConfirmados.push({
        trabajadora,
        area: document.getElementById('areaNegocio').value,
        hora,
        servicios: serviciosSeleccionados,
        duracion
    });

    // Limpiar selección actual para poder añadir más
    document.querySelectorAll('input[name="serv"]:checked').forEach(cb => cb.checked = false);
    document.getElementById('horaSeleccionada').value = '';
    document.getElementById('labelDuracion').textContent = '0 min';

    // Reset trabajadora y horas
    const estiloInactivo = 'padding:1rem;border-radius:1rem;font-weight:900;font-size:1rem;border:2px solid #e2e8f0;background:#f8fafc;color:#64748b;cursor:pointer;transition:all 0.15s;width:100%;';
    TRABAJADORAS.forEach(t => {
        const btn = document.getElementById(`btnTrabajadora-${slugify(t.Nombre)}`);
        if (btn) btn.style.cssText = estiloInactivo;
    });
    document.getElementById('areaNegocio').value = '';
    document.getElementById('trabajadora').value = '';
    document.getElementById('selectCategoria').value = '';
    const buscador = document.getElementById('buscadorServicios');
    if (buscador) buscador.value = '';
    const contS = document.getElementById('contenedorServicios');
    if (contS) contS.innerHTML = '';

    // Resetear botones hora
    const gridHoras = document.getElementById('gridHorasSeleccion');
    if (gridHoras) {
        gridHoras.querySelectorAll('.btn-hora').forEach(b => {
            b.style.cssText = 'padding:0.5rem;text-align:center;font-size:0.75rem;background:white;color:#1e293b;border:1px solid #e2e8f0;border-radius:0.5rem;cursor:pointer;font-weight:400;';
        });
    }

    actualizarResumenBloques();
}

const formulario = document.getElementById('formCita');
if (formulario) {
    formulario.onsubmit = async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnGuardar');

        // Validación de bloque eliminada — se permite guardar sin confirmar bloque previo

        const cliente = document.getElementById('cliente').value.trim();
        if (!cliente) return alert("Escribe el nombre de la clienta.");

        const fecha = document.getElementById('fechaCita').value;

        // Si no hay bloques confirmados, crear uno automáticamente con la selección actual
        if (bloquesConfirmados.length === 0) {
            const trabajadoraAuto = document.getElementById('trabajadora').value;
            const horaAuto = document.getElementById('horaSeleccionada').value;
            if (!trabajadoraAuto) return alert("Selecciona una trabajadora.");
            if (!horaAuto) return alert("Selecciona una hora de inicio.");
            const checkboxesAuto = document.querySelectorAll('input[name="serv"]:checked');
            const serviciosAuto = Array.from(checkboxesAuto).map(cb => cb.value);
            let duracionAuto = 0;
            checkboxesAuto.forEach(cb => { duracionAuto += Number(cb.getAttribute('data-duracion')) || 0; });
            bloquesConfirmados.push({
                trabajadora: trabajadoraAuto,
                area: document.getElementById('areaNegocio').value,
                hora: horaAuto,
                servicios: serviciosAuto,
                duracion: duracionAuto
            });
        }

        // ── Validación de solapamiento ──────────────────────────────
        // Calcula el fin real de una cita existente (en minutos desde medianoche)
        function calcularFinCita(cita) {
            const inicio = horaAMinutos(cita.Hora_Inicio || '00:00');
            if (contieneTinte(cita.Servicios)) {
                const cfg = getTiempsTinte(cita.Servicios) || { aplicacion:30, espera:45, aclarado:15, espera2:0 };
                const totalTramos = Math.ceil(cfg.aplicacion/15)
                    + Math.ceil(cfg.espera/15)
                    + (cfg.aclarado > 0 ? Math.ceil(cfg.aclarado/15) : 0)
                    + ((cfg.espera2||0) > 0 ? Math.ceil(cfg.espera2/15) : 0);
                return inicio + totalTramos * 15;
            }
            const dur = calcularDuracionNormalizada(cita.Duracion_Total);
            return inicio + Math.max(Math.ceil(dur/15), 1) * 15;
        }

        const conflictos = [];
        for (const bloque of bloquesConfirmados) {
            const inicioNueva = horaAMinutos(bloque.hora);
            const durNueva = bloque.duracion > 0 ? bloque.duracion : 15;
            const finNueva = inicioNueva + durNueva;
            const colIdBloque = colIdParaTrabajadora(bloque.trabajadora);

            // 1️⃣ Comprobar contra citas normales de TODAS_LAS_CITAS
            const citasDelDia = TODAS_LAS_CITAS.filter(c => {
                try {
                    if (parsearFecha(c.Fecha) !== fecha) return false;
                    const trabCita  = (c.Trabajadora || '').trim();
                    const areaCita  = (c.Area || '').trim();
                    const trabBloq  = bloque.trabajadora.trim();
                    const areaBloq  = (bloque.area || '').trim();
                    return trabCita === trabBloq ||
                           (areaCita !== '' && areaBloq !== '' && areaCita === areaBloq);
                } catch(e) { return false; }
            });

            for (const cita of citasDelDia) {
                const inicioExistente = horaAMinutos(cita.Hora_Inicio || '00:00');
                const finExistente    = calcularFinCita(cita);
                if (inicioNueva < finExistente && finNueva > inicioExistente) {
                    conflictos.push({
                        horaInicio: cita.Hora_Inicio,
                        horaFin: minutosAHora(finExistente),
                        cliente: cita.ID_Cliente || '(sin nombre)',
                        trabajadora: bloque.trabajadora,
                        horaBloque: bloque.hora,
                        tipo: 'cita'
                    });
                    break;
                }
            }

            // 2️⃣ Comprobar contra slots bloqueados manualmente (🔒)
            // Cada slot bloqueado ocupa exactamente 15 minutos
            SLOTS_BLOQUEADOS.forEach((b) => {
                if (b.fecha !== fecha) return;
                if (b.colId !== colIdBloque) return;
                const inicioBloqueo = horaAMinutos(b.horaStr);
                const finBloqueo    = inicioBloqueo + 15;
                if (inicioNueva < finBloqueo && finNueva > inicioBloqueo) {
                    // Solo añadir si no hay ya un conflicto para este bloque
                    const yaConflicto = conflictos.some(c => c.horaBloque === bloque.hora && c.trabajadora === bloque.trabajadora);
                    if (!yaConflicto) {
                        conflictos.push({
                            horaInicio: b.horaStr,
                            horaFin: minutosAHora(finBloqueo),
                            cliente: b.nota || 'Slot reservado',
                            trabajadora: bloque.trabajadora,
                            horaBloque: bloque.hora,
                            tipo: 'bloqueo'
                        });
                    }
                }
            });
        }

        if (conflictos.length > 0) {
            bloquesConfirmados = [];
            const msgs = conflictos.map(c =>
                c.tipo === 'bloqueo'
                    ? `• ${c.trabajadora} a las ${c.horaBloque}: slot 🔒 reservado a las ${c.horaInicio} (${c.cliente})`
                    : `• ${c.trabajadora} a las ${c.horaBloque}: ya existe cita de ${c.horaInicio} a ${c.horaFin} (${c.cliente})`
            ).join('\n');
            alert(`⚠️ No se puede guardar, hay solapamiento:\n\n${msgs}\n\nCambia la hora o la trabajadora.`);
            return;
        }
        // ────────────────────────────────────────────────────────────

        btn.disabled = true;
        btn.textContent = "GUARDANDO...";

        try {
            // Guardar un registro por cada bloque confirmado
            for (const bloque of bloquesConfirmados) {
                const _payload = encodeURIComponent(JSON.stringify({
                    fecha,
                    hora: bloque.hora,
                    cliente,
                    trabajadora: bloque.trabajadora,
                    area: bloque.area,
                    servicios: bloque.servicios.join(', '),
                    duracion: bloque.duracion
                }));
                await fetch(URL_SCRIPT + '?payload=' + _payload);
            }

            // ── Guardar cliente nuevo si no existe ──
            const nombreLower = cliente.toLowerCase();
            const yaExiste = CLIENTES_MASTER.some(c =>
                `${(c.Nombre||'').trim()} ${(c.Apellidos||'').trim()}`.trim().toLowerCase() === nombreLower
            );
            if (!yaExiste) {
                const telefonoNuevo = (document.getElementById('inputNuevoTelefono')?.value || '').trim();
                const rgpdNuevo = document.getElementById('checkRGPD')?.checked ? 'SI' : 'NO';
                const _payloadCliente = encodeURIComponent(JSON.stringify({
                    accion: 'nuevo_cliente',
                    nombre: cliente,
                    telefono: telefonoNuevo,
                    rgpd: rgpdNuevo
                }));
                await fetch(URL_SCRIPT + '?payload=' + _payloadCliente).catch(err => console.error('Error guardando cliente nuevo:', err));
                CLIENTES_MASTER.push({ Nombre: cliente, Apellidos: '', Notas: '', Telefono: telefonoNuevo, RGPD: rgpdNuevo });
                const listaClientes = document.getElementById('listaClientes');
                if (listaClientes) {
                    const opt = document.createElement('option');
                    opt.value = cliente;
                    listaClientes.appendChild(opt);
                }
            }
            // ────────────────────────────────────────

            // Pintar en pantalla inmediatamente y guardar en localStorage
            // para que no desaparezca si el refresco automático llega antes que Google
            const pendientes = JSON.parse(localStorage.getItem('citasPendientes') || '[]');
            for (const bloque of bloquesConfirmados) {
                const cLocal = {
                    ID_Cita:       'PENDIENTE-' + Date.now() + '-' + Math.random(),
                    Fecha:         fecha,
                    Hora_Inicio:   bloque.hora,
                    ID_Cliente:    cliente,
                    Trabajadora:   bloque.trabajadora,
                    Area:          bloque.area,
                    Servicios:     bloque.servicios.join(', '),
                    Duracion_Total: bloque.duracion
                };
                TODAS_LAS_CITAS.push(cLocal);
                pendientes.push(cLocal);
            }
            localStorage.setItem('citasPendientes', JSON.stringify(pendientes));
            pintarCitasEnAgenda(TODAS_LAS_CITAS);

            alert("¡Cita guardada correctamente!");
            bloquesConfirmados = [];
            document.querySelectorAll('.bloque-provisional').forEach(el => el.remove());
            cerrarFormulario();
            // No llamamos a cargarDatosDesdeSheet() aquí:
            // el refresco automático cada 2 min sincroniza, y mientras tanto
            // las citas pendientes se conservan en localStorage.
        } catch (err) {
            alert("Error al guardar");
            console.error(err);
        } finally {
            btn.disabled = false;
            btn.textContent = "GUARDAR CITA";
        }
    };
}

// ─────────────────────────────────────────────
// RANGO VISUAL REAL DE UNA CITA
// Para tintes: devuelve los tramos que realmente
// pinta (aplicacion y aclarado). Los slots de
// espera (i=2,3,4) NO se incluyen → estan libres
// para meter otras citas encima.
// Para citas normales: rango continuo inicio→fin.
// ─────────────────────────────────────────────
function getRangoVisual(cita) {
    const inicioMin = horaAMinutos(cita.Hora_Inicio || "00:00");
    const duracion  = calcularDuracionNormalizada(cita.Duracion_Total);

    if (!contieneTinte(cita.Servicios)) {
        const tramos = new Set();
        const n = Math.max(Math.ceil(duracion / 15), 1);
        for (let i = 0; i < n; i++) tramos.add(inicioMin + i * 15);
        return tramos;
    }

    const cfg = getTiempsTinte(cita.Servicios) || { aplicacion: 30, espera: 45, aclarado: 15, espera2: 0 };
    const tA  = Math.ceil(cfg.aplicacion / 15);
    const tE  = Math.ceil(cfg.espera / 15);
    const tAc = cfg.aclarado > 0 ? Math.ceil(cfg.aclarado / 15) : 0;
    const tE2 = (cfg.espera2 || 0) > 0 ? Math.ceil(cfg.espera2 / 15) : 0;
    const tramosTotal = tA + tE + tAc + tE2;
    const tramos = new Set();
    for (let i = 0; i < tramosTotal; i++) {
        const esEspera  = (i >= tA && i < tA + tE);
        const esEspera2 = tE2 > 0 && (i >= tA + tE + tAc && i < tA + tE + tAc + tE2);
        if (!esEspera && !esEspera2) tramos.add(inicioMin + i * 15);
    }
    return tramos;
}

// ─────────────────────────────────────────────
// ASIGNAR SUBCOLUMNA A CADA CITA
// ─────────────────────────────────────────────
function asignarSubcolumna(cita, citasAnteriores) {
    const tramosA = getRangoVisual(cita);

    const subcolumnas = {};
    citasAnteriores.forEach(c => {
        const sc = c._subcolumna || 0;
        if (!subcolumnas[sc]) subcolumnas[sc] = [];
        subcolumnas[sc].push(c);
    });

    for (let sc = 0; sc <= citasAnteriores.length; sc++) {
        const citasEnSc = subcolumnas[sc] || [];
        const haySolapamiento = citasEnSc.some(c => {
            const tramosB = getRangoVisual(c);
            for (const min of tramosA) {
                if (tramosB.has(min)) return true;
            }
            return false;
        });
        if (!haySolapamiento) return sc;
    }
    return 0;
}

// ─────────────────────────────────────────────
// OVERLAY
// ─────────────────────────────────────────────
function crearOverlay(cita, tramoHora, tipo, esPrimero, anchoPct, offsetPct, horaFin, duracion) {
    const colorCliente = colorParaClientа(cita.ID_Cliente);
    let bgColor = colorCliente;
    if (tipo === 'espera' || tipo === 'espera2') bgColor = colorCliente + '22';
    else if (tipo === 'aclarado') bgColor = colorCliente + 'cc';

    const minutos = parseInt(tramoHora.split(':')[1]);
    const esMarcador = (minutos === 0 || minutos === 30);

    const overlay = document.createElement('div');
    overlay.className = 'cita-overlay';
    overlay.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: ${bgColor};
        color: ${(tipo === 'espera' || tipo === 'espera2') ? '#94a3b8' : 'white'};
        font-size: ${esMarcador ? '10px' : '9px'};
        font-weight: ${esMarcador ? '900' : '700'};
        border-left: ${offsetPct > 0 ? '1px solid rgba(255,255,255,0.4)' : 'none'};
        padding-left: 38px;
        display: flex;
        align-items: center;
        overflow: hidden;
        box-sizing: border-box;
        z-index: 2;
    `;

    if (tipo === 'espera' || tipo === 'espera2') {
        overlay.innerHTML = `<span style="font-size:8px;">⏳</span>`;
    } else if (esPrimero) {
        // Calcular hora fin real según los tiempos configurables si es tinte, o duracion si es normal
        let minutosReales;
        const configTinte = getTiempsTinte(cita.Servicios);
        if (configTinte) {
            const tA  = Math.ceil(configTinte.aplicacion / 15);
            const tE  = Math.ceil(configTinte.espera / 15);
            const tAc = configTinte.aclarado > 0 ? Math.ceil(configTinte.aclarado / 15) : 0;
            const tE2 = (configTinte.espera2 || 0) > 0 ? Math.ceil(configTinte.espera2 / 15) : 0;
            minutosReales = (tA + tE + tAc + tE2) * 15;
        } else {
            minutosReales = Math.max(Math.ceil(duracion / 15), 1) * 15;
        }
        const horaFinLabel = minutosAHora(horaAMinutos(cita.Hora_Inicio || "00:00") + minutosReales);
        const etiqueta = tipo === 'aclarado' ? '🚿 ' : '';
        const boton = `<button onclick="event.stopPropagation();eliminarCita('${cita.ID_Cita}')" style="margin-left:2px;background:rgba(255,255,255,0.25);border:none;border-radius:3px;color:white;font-size:9px;padding:0 4px;cursor:pointer;flex-shrink:0;">✕</button>`;
        const botonMover = `<button onclick="event.stopPropagation();abrirMoverCita('${cita.ID_Cita}','${cita.ID_Cliente}','${cita.Hora_Inicio}','${cita.Fecha}','${cita.Trabajadora || ''}')" style="margin-left:2px;background:rgba(255,255,255,0.25);border:none;border-radius:3px;color:white;font-size:9px;padding:0 4px;cursor:pointer;flex-shrink:0;">📅</button>`;
        overlay.innerHTML = `
            <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:9px;">
                ${etiqueta}${cita.Hora_Inicio}-${horaFinLabel} ${cita.ID_Cliente} · ${cita.Servicios || ''}
            </span>${botonMover}${boton}`;
    } else {
        const icono = tipo === 'aclarado' ? '🚿' : tipo === 'aplicacion' ? '🎨' : '';
        overlay.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:8px;">${icono} ${cita.ID_Cliente}</span>`;
    }

    return overlay;
}

// ─────────────────────────────────────────────
// PINTAR AGENDA PRINCIPAL (DINÁMICA POR TRABAJADORA)
// ─────────────────────────────────────────────
function pintarCitasEnAgenda(citas) {
    const fechaSel = document.getElementById('fechaAgenda').value;

    SLOT_CACHE.forEach(slot => {
        for (let i = slot.childNodes.length - 1; i >= 0; i--) {
            const node = slot.childNodes[i];
            if (node.nodeType === 1 && (node.classList.contains('cita-overlay') || node.classList.contains('bloque-provisional'))) {
                slot.removeChild(node);
            }
        }
        slot.className = slot._claseVacia;
        slot.removeAttribute('style');
        slot.style.position = 'relative';
        slot.innerHTML = `<span style="position:relative;z-index:10;pointer-events:none;font-size:inherit;font-weight:inherit;color:inherit;">${slot._horaStr}</span>`;
    });

    const citasHoy = citas.filter(cita => {
        try {
            const fechaCita = parsearFecha(cita.Fecha);
            return fechaCita === fechaSel;
        } catch(e) { return false; }
    });

    TRABAJADORAS.forEach(t => {
        const colId = colIdParaTrabajadora(t.Nombre);

        const citasTrabajadora = citasHoy
            .filter(c => {
                if (c.Trabajadora && c.Trabajadora.trim() !== '') {
                    return c.Trabajadora.trim() === t.Nombre;
                }
                return (c.Area || '').trim() === (t.Area || t.Nombre);
            })
            .sort((a, b) => horaAMinutos(a.Hora_Inicio || "00:00") - horaAMinutos(b.Hora_Inicio || "00:00"));

        const citasConSc = citasTrabajadora.map(c => ({ ...c, _subcolumna: 0 }));

        citasConSc.forEach(cita => {
            const inicioMin = horaAMinutos(cita.Hora_Inicio || "00:00");
            const duracion = calcularDuracionNormalizada(cita.Duracion_Total);
            const horaFin = minutosAHora(inicioMin + duracion);
            const esTinte = contieneTinte(cita.Servicios);
            const sc = 0;
            const anchoPct = 100;
            const offsetPct = 0;
            const usarOverlay = true;

            if (esTinte) {
                const cfg = getTiempsTinte(cita.Servicios) || { aplicacion: 30, espera: 45, aclarado: 15, espera2: 0 };
                const tA  = Math.ceil(cfg.aplicacion / 15);
                const tE  = Math.ceil(cfg.espera / 15);
                const tAc = cfg.aclarado > 0 ? Math.ceil(cfg.aclarado / 15) : 0;
                const tE2 = (cfg.espera2 || 0) > 0 ? Math.ceil(cfg.espera2 / 15) : 0;
                const tramosAPintar = tA + tE + tAc + tE2;

                for (let i = 0; i < tramosAPintar; i++) {
                    const tramoMin = inicioMin + (i * 15);
                    const tramoHora = minutosAHora(tramoMin);
                    const slot = SLOT_CACHE.get(`${colId}-${tramoHora}`);
                    if (!slot) continue;

                    let tipo;
                    if (i < tA)                 tipo = 'aplicacion';
                    else if (i < tA + tE)       tipo = 'espera';
                    else if (i < tA + tE + tAc) tipo = 'aclarado';
                    else                        tipo = 'espera2';

                    const esPrimeroSlot = (i === 0) || (tipo === 'aclarado' && i === tA + tE) || (tipo === 'espera2' && i === tA + tE + tAc);

                    if (usarOverlay) {
                        slot.appendChild(crearOverlay(cita, tramoHora, tipo, esPrimeroSlot, anchoPct, offsetPct, horaFin, duracion));
                        const sh = slot.querySelector('span');
                        if (sh) sh.style.color = (tipo === 'espera' || tipo === 'espera2') ? 'rgba(100,116,139,0.7)' : 'rgba(255,255,255,0.9)';
                    } else {
                        const minutos = parseInt(tramoHora.split(':')[1]);
                        const esMarcador = (minutos === 0 || minutos === 30);
                        if (tipo === 'espera') {
                            const colorBase = colorParaClientа(cita.ID_Cliente);
                            slot.style.backgroundColor = colorBase + '18';
                            slot.style.color = '#94a3b8';
                            slot.style.borderBottom = '1px solid ' + colorBase + '33';
                            slot.style.fontSize = '10px';
                            slot.style.paddingLeft = '6px';
                            slot.innerHTML = `<span>${tramoHora}</span>`;
                        } else {
                            const colorBase = colorParaClientа(cita.ID_Cliente);
                            const bg = tipo === 'aclarado' ? colorBase + 'cc' : colorBase;
                            slot.style.backgroundColor = bg;
                            slot.style.color = 'white';
                            slot.style.borderBottom = esMarcador ? '2px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.2)';
                            slot.style.fontWeight = esMarcador ? '900' : '700';
                            slot.style.fontSize = esMarcador ? '10px' : '9px';
                            slot.style.paddingLeft = '6px';
                            slot.style.display = 'flex';
                            slot.style.alignItems = 'center';

                            if (esPrimeroSlot) {
                                const tramosTotal = Math.max(Math.ceil(duracion / 15) - 1, 5);
                                const horaFinTinte = minutosAHora(horaAMinutos(cita.Hora_Inicio || "00:00") + tramosTotal * 15);
                                const etiqueta = tipo === 'aclarado' ? '🚿 aclarado' : 'aplicacion';
                                const horaLabel = tipo === 'aplicacion' ? `${cita.Hora_Inicio}-${horaFinTinte}` : tramoHora;
                                slot.innerHTML = `
                                    <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                        ${horaLabel} · ${cita.ID_Cliente} · ${cita.Servicios} <em style="opacity:0.8">(${etiqueta})</em>
                                    </span>
                                    <button onclick="event.stopPropagation();abrirMoverCita('${cita.ID_Cita}','${cita.ID_Cliente}','${cita.Hora_Inicio}','${cita.Fecha}','${cita.Trabajadora || ''}')" style="margin-left:2px;background:rgba(255,255,255,0.25);border:none;border-radius:4px;color:white;font-size:10px;padding:1px 5px;cursor:pointer;flex-shrink:0;">📅</button>
                                    <button onclick="eliminarCita('${cita.ID_Cita}')" style="margin-left:4px;background:rgba(255,255,255,0.25);border:none;border-radius:4px;color:white;font-size:10px;padding:1px 5px;cursor:pointer;flex-shrink:0;">✕</button>`;
                            } else {
                                const icono = tipo === 'aclarado' ? '🚿' : '🎨';
                                slot.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${icono} ${tramoHora} · ${cita.ID_Cliente}</span>`;
                            }
                        }
                    }
                }
            } else {
                const tramos = Math.max(Math.ceil(duracion / 15), 1);
                for (let i = 0; i < tramos; i++) {
                    const tramoMin = inicioMin + (i * 15);
                    const tramoHora = minutosAHora(tramoMin);
                    const slot = SLOT_CACHE.get(`${colId}-${tramoHora}`);
                    if (!slot) continue;

                    if (usarOverlay) {
                        slot.appendChild(crearOverlay(cita, tramoHora, 'normal', i === 0, anchoPct, offsetPct, horaFin, duracion));
                        const sh = slot.querySelector('span');
                        if (sh) sh.style.color = 'rgba(255,255,255,0.9)';
                    } else {
                        const minutos = parseInt(tramoHora.split(':')[1]);
                        const esMarcador = (minutos === 0 || minutos === 30);
                        slot.style.backgroundColor = colorParaClientа(cita.ID_Cliente);
                        slot.style.color = 'white';
                        slot.style.borderBottom = esMarcador ? '2px solid rgba(255,255,255,0.5)' : '1px solid rgba(255,255,255,0.2)';
                        slot.style.fontWeight = esMarcador ? '900' : '700';
                        slot.style.fontSize = esMarcador ? '10px' : '9px';
                        slot.style.paddingLeft = '6px';
                        slot.style.display = 'flex';
                        slot.style.alignItems = 'center';

                        if (i === 0) {
                            slot.innerHTML = `
                                <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cita.Hora_Inicio}-${horaFin} · ${cita.ID_Cliente} · ${cita.Servicios}</span>
                                <button onclick="event.stopPropagation();abrirMoverCita('${cita.ID_Cita}','${cita.ID_Cliente}','${cita.Hora_Inicio}','${cita.Fecha}','${cita.Trabajadora || ''}')" style="margin-left:2px;background:rgba(255,255,255,0.25);border:none;border-radius:4px;color:white;font-size:10px;padding:1px 5px;cursor:pointer;flex-shrink:0;">📅</button>
                                <button onclick="eliminarCita('${cita.ID_Cita}')" style="margin-left:4px;background:rgba(255,255,255,0.25);border:none;border-radius:4px;color:white;font-size:10px;padding:1px 5px;cursor:pointer;flex-shrink:0;">✕</button>
                            `;
                        } else {
                            slot.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tramoHora} · ${cita.ID_Cliente} · ${cita.Servicios}</span>`;
                        }
                    }
                }
            }
        });
    });
	
	
	
	
	
	
	
	}

function editarTelefono() {
    const div = document.getElementById('editarTelefonoDiv');
    const input = document.getElementById('inputNuevoTelefono');
    const telActual = document.getElementById('textoTelefono').textContent;
    input.value = telActual;
    div.style.display = 'flex';
    input.focus();
}

function cancelarEditarTelefono() {
    document.getElementById('editarTelefonoDiv').style.display = 'none';
}

function guardarTelefono() {
    const nuevoTel = document.getElementById('inputNuevoTelefono').value.trim();
    if (!nuevoTel) return;
    const nombreCliente = document.getElementById('cliente').value.trim().toLowerCase();
    const cliente = CLIENTES_MASTER.find(c =>
        `${(c.Nombre||'').trim()} ${(c.Apellidos||'').trim()}`.trim().toLowerCase() === nombreCliente
    );
    if (cliente) {
        cliente.Telefono = nuevoTel;
        document.getElementById('textoTelefono').textContent = nuevoTel;
        document.getElementById('enlaceLlamar').href = 'tel:' + nuevoTel.replace(/\s/g, '');
    }
    document.getElementById('editarTelefonoDiv').style.display = 'none';
}
// ─────────────────────────────────────────────
// CONFIGURADOR DE TINTES — PANEL WEB
// Los cambios se guardan en Google Sheets (hoja TiemposTinte)
// y se cargan desde ahí al arrancar → sincronizado entre dispositivos
// ─────────────────────────────────────────────

function abrirConfigTintes() {
    renderizarListaTintes();
    document.getElementById('modalConfigTintes').classList.remove('hidden');
}

function cerrarConfigTintes() {
    document.getElementById('modalConfigTintes').classList.add('hidden');
}

function renderizarListaTintes() {
    const lista = document.getElementById('listaTintes');
    if (!lista) return;

    const inputStyle = (color) =>
        `width:100%;padding:0.45rem 0.3rem;border:1.5px solid ${color};border-radius:0.5rem;font-size:0.85rem;font-weight:700;text-align:center;outline:none;background:white;`;

    lista.innerHTML = Object.entries(TIEMPOS_TINTE).map(([nombre, cfg]) => `
        <div style="display:grid;grid-template-columns:1fr 80px 80px 80px 40px;gap:6px;align-items:center;background:#fafafa;border:1px solid #f1f5f9;border-radius:0.75rem;padding:6px 8px;">
            <span style="font-size:0.75rem;font-weight:700;color:#1e293b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${nombre}">${nombre}</span>
            <input type="number" min="0" step="5" value="${cfg.aplicacion}"
                style="${inputStyle('#fce7f3')}"
                onchange="actualizarTinte('${nombre.replace(/'/g,"\\'")}','aplicacion',this.value)">
            <input type="number" min="0" step="5" value="${cfg.espera}"
                style="${inputStyle('#fef3c7')}"
                onchange="actualizarTinte('${nombre.replace(/'/g,"\\'")}','espera',this.value)">
            <input type="number" min="0" step="5" value="${cfg.aclarado}"
                style="${inputStyle('#cffafe')}"
                onchange="actualizarTinte('${nombre.replace(/'/g,"\\'")}','aclarado',this.value)">
            <button onclick="eliminarTinte('${nombre.replace(/'/g,"\\'")}'"
                style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:0.5rem;padding:4px 8px;cursor:pointer;font-size:0.85rem;font-weight:900;">✕</button>
        </div>
    `).join('');
}

function actualizarTinte(nombre, campo, valor) {
    if (!TIEMPOS_TINTE[nombre]) return;
    TIEMPOS_TINTE[nombre][campo] = Math.max(0, parseInt(valor) || 0);
}

function eliminarTinte(nombre) {
    if (!confirm(`¿Eliminar "${nombre}" de la lista de tintes?`)) return;
    delete TIEMPOS_TINTE[nombre];
    renderizarListaTintes();
}

function agregarTinte() {
    const nombre = (document.getElementById('nuevoNombreTinte').value || '').trim().toUpperCase();
    const aplicacion = parseInt(document.getElementById('nuevoAplicacion').value) || 0;
    const espera     = parseInt(document.getElementById('nuevoEspera').value) || 0;
    const aclarado   = parseInt(document.getElementById('nuevoAclarado').value) || 0;

    if (!nombre) return alert('Escribe el nombre del servicio.');
    if (aplicacion === 0 && espera === 0) return alert('Pon al menos un tiempo de aplicación o espera.');

    TIEMPOS_TINTE[nombre] = { aplicacion, espera, aclarado };

    document.getElementById('nuevoNombreTinte').value = '';
    document.getElementById('nuevoAplicacion').value = '';
    document.getElementById('nuevoEspera').value = '';
    document.getElementById('nuevoAclarado').value = '';

    renderizarListaTintes();
}

async function guardarConfigTintes() {
    // Guardar en Google Sheets para sincronizar entre todos los dispositivos
    try {
        const btns = document.querySelectorAll('#modalConfigTintes button');
        const btn = [...btns].find(b => b.textContent.includes('GUARDAR') || b.textContent.includes('Guardar'));
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

        const _payload = encodeURIComponent(JSON.stringify({
            accion: 'guardar_tiempos_tinte',
            tiempos: TIEMPOS_TINTE
        }));
        const resp = await fetch(URL_SCRIPT + '?payload=' + _payload);
        const data = await resp.json();

        if (btn) { btn.disabled = false; btn.textContent = '💾 GUARDAR'; }

        if (data.ok) {
            cerrarConfigTintes();
            pintarCitasEnAgenda(TODAS_LAS_CITAS);
            alert('✅ Tiempos guardados en la nube. La agenda se ha actualizado.');
        } else {
            alert('Error al guardar: ' + (data.error || 'desconocido'));
        }
    } catch(e) {
        alert('Error de conexión: ' + e.message);
    }
}

// ─────────────────────────────────────────────
// SISTEMA DE SLOTS DE TINTE MANUAL
// Permite pulsar slots de la agenda para asignar
// fases (aplicacion / espera / aclarado) al crear citas
// ─────────────────────────────────────────────

let slotsTinteMarcados = [];   // [{ hora, fase }]
let modoSlotActivo = null;     // 'aplicacion' | 'espera' | 'aclarado' | null
let trabajadoraSlots = null;   // nombre de la trabajadora cuyos slots están activos

const COLORES_FASE = {
    aplicacion: { bg: '#ec4899', text: 'white',   icono: '🎨' },
    espera:     { bg: '#fef3c7', text: '#92400e',  icono: '⏳' },
    aclarado:   { bg: '#cffafe', text: '#0e7490',  icono: '🚿' },
};

// Detectar tinte en servicios — modo slots desactivado, se usa el selector de hora normal
function detectarTinteEnServicios() {
    const panel = document.getElementById('panelSlotsTinte');
    if (panel) panel.style.display = 'none';
    const contenedorHora = document.getElementById('contenedorHoraInicio');
    if (contenedorHora) contenedorHora.style.display = 'block';
    desactivarModoSlots();
}

// Activar los slots de la agenda para que sean pulsables
function activarModoSlots(nombreTrabajadora) {
    trabajadoraSlots = nombreTrabajadora;
    if (!modoSlotActivo) setModoSlot('aplicacion');

    const colId = colIdParaTrabajadora(nombreTrabajadora);
    const fechaSel = document.getElementById('fechaCita').value || document.getElementById('fechaAgenda').value;

    // Obtener slots ocupados por otras citas
    const ocupados = new Set();
    TODAS_LAS_CITAS
        .filter(c => {
            try { return parsearFecha(c.Fecha) === fechaSel && c.Trabajadora === nombreTrabajadora; }
            catch(e) { return false; }
        })
        .forEach(cita => getRangoVisual(cita).forEach(min => ocupados.add(minutosAHora(min))));

    // Ya marcados en sesión actual
    const yaElegidos = new Set(slotsTinteMarcados.map(s => s.hora));

    SLOT_CACHE.forEach((slot, key) => {
        if (!key.startsWith(colId + '-')) return;
        const horaSlot = slot._horaStr;
        if (ocupados.has(horaSlot) && !yaElegidos.has(horaSlot)) return; // ocupado por otra cita

        // Repintar el slot marcado si ya estaba elegido
        if (yaElegidos.has(horaSlot)) {
            const fase = slotsTinteMarcados.find(s => s.hora === horaSlot)?.fase;
            pintarSlotMarcado(slot, fase, horaSlot);
            return;
        }

        // Hacer slot pulsable
        slot.style.cursor = 'pointer';
        slot.style.outline = '1px dashed #ec489944';
        slot.onclick = (e) => {
            e.stopPropagation();
            if (!modoSlotActivo) return;
            // Si ya estaba marcado, desmarcarlo
            const idx = slotsTinteMarcados.findIndex(s => s.hora === horaSlot);
            if (idx !== -1) {
                slotsTinteMarcados.splice(idx, 1);
                resetSlotAgenda(slot, horaSlot);
            } else {
                slotsTinteMarcados.push({ hora: horaSlot, fase: modoSlotActivo });
                slotsTinteMarcados.sort((a, b) => horaAMinutos(a.hora) - horaAMinutos(b.hora));
                pintarSlotMarcado(slot, modoSlotActivo, horaSlot);
            }
            actualizarResumenSlotsTinte();
        };
    });
}

function pintarSlotMarcado(slot, fase, horaStr) {
    const cfg = COLORES_FASE[fase] || COLORES_FASE.aplicacion;
    // Limpiar overlays previos del slot
    [...slot.querySelectorAll('.slot-tinte-preview')].forEach(el => el.remove());
    const over = document.createElement('div');
    over.className = 'slot-tinte-preview';
    over.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;background:${cfg.bg};color:${cfg.text};display:flex;align-items:center;padding-left:4px;font-size:9px;font-weight:700;z-index:5;cursor:pointer;box-sizing:border-box;`;
    over.innerHTML = `${cfg.icono} <span style="margin-left:3px;">${horaStr}</span>`;
    over.onclick = slot.onclick; // heredar click para poder desmarcar
    slot.style.position = 'relative';
    slot.appendChild(over);
}

function resetSlotAgenda(slot, horaStr) {
    [...slot.querySelectorAll('.slot-tinte-preview')].forEach(el => el.remove());
    slot.style.outline = '1px dashed #ec489944';
}

function desactivarModoSlots() {
    // Restaurar slots (quitar interactividad visual sin borrar los marcados)
    if (!trabajadoraSlots) return;
    const colId = colIdParaTrabajadora(trabajadoraSlots);
    SLOT_CACHE.forEach((slot, key) => {
        if (!key.startsWith(colId + '-')) return;
        slot.style.cursor = '';
        slot.style.outline = '';
        // No quitamos onclick ni previews; se limpian al pintarCitasEnAgenda
    });
    modoSlotActivo = null;
    trabajadoraSlots = null;
    actualizarBotonesModosSlot();
}

function setModoSlot(modo) {
    modoSlotActivo = modo;
    actualizarBotonesModosSlot();
}

function actualizarBotonesModosSlot() {
    const estiloBase = 'flex:1;min-width:80px;padding:0.5rem;border-radius:0.6rem;font-size:0.75rem;font-weight:900;cursor:pointer;';
    const modos = {
        aplicacion: { id: 'btnModoAplicacion', active: 'border:2px solid #ec4899;background:#ec4899;color:white;', inactive: 'border:2px solid #ec4899;background:white;color:#be185d;' },
        espera:     { id: 'btnModoEspera',     active: 'border:2px solid #f59e0b;background:#f59e0b;color:white;', inactive: 'border:2px solid #f59e0b;background:white;color:#92400e;' },
        aclarado:   { id: 'btnModoAclarado',   active: 'border:2px solid #0891b2;background:#0891b2;color:white;', inactive: 'border:2px solid #0891b2;background:white;color:#0e7490;' },
    };
    Object.entries(modos).forEach(([modo, cfg]) => {
        const btn = document.getElementById(cfg.id);
        if (btn) btn.style.cssText = estiloBase + (modoSlotActivo === modo ? cfg.active : cfg.inactive);
    });
}

function limpiarSlotsTinte(silencioso = false) {
    // Quitar previews visuales de la agenda
    slotsTinteMarcados.forEach(s => {
        if (!trabajadoraSlots) return;
        const colId = colIdParaTrabajadora(trabajadoraSlots);
        const slot = SLOT_CACHE.get(`${colId}-${s.hora}`);
        if (slot) resetSlotAgenda(slot, s.hora);
    });
    slotsTinteMarcados = [];
    if (!silencioso) actualizarResumenSlotsTinte();
}

function actualizarResumenSlotsTinte() {
    const el = document.getElementById('resumenSlotsTinte');
    if (!el) return;
    if (slotsTinteMarcados.length === 0) {
        el.textContent = 'Ningún slot marcado aún';
        return;
    }
    const conteo = { aplicacion: 0, espera: 0, aclarado: 0 };
    slotsTinteMarcados.forEach(s => { if (conteo[s.fase] !== undefined) conteo[s.fase]++; });
    const partes = [];
    if (conteo.aplicacion) partes.push(`🎨 ${conteo.aplicacion * 15} min aplicación`);
    if (conteo.espera)     partes.push(`⏳ ${conteo.espera * 15} min espera`);
    if (conteo.aclarado)   partes.push(`🚿 ${conteo.aclarado * 15} min aclarado`);
    el.innerHTML = partes.join(' · ') + ` <strong style="color:#1e293b;">(total: ${slotsTinteMarcados.length * 15} min)</strong>`;
}

// Enganchar detección de tinte al checkbox de servicios
// (se llama desde el onchange existente que ya llama a calcularDuracion)
const _calcularDuracionOrig = calcularDuracion;
calcularDuracion = function() {
    const r = _calcularDuracionOrig();
    detectarTinteEnServicios();
    return r;
};

// También al seleccionar trabajadora
const _seleccionarTrabajadoraOrig = seleccionarTrabajadora;
seleccionarTrabajadora = function(area, nombre) {
    _seleccionarTrabajadoraOrig(area, nombre);
    detectarTinteEnServicios();
};

// Al cerrar el formulario, limpiar estado de slots
const _cerrarFormularioOrig = cerrarFormulario;
cerrarFormulario = function() {
    limpiarSlotsTinte(true);
    desactivarModoSlots();
    slotsTinteMarcados = [];
    _cerrarFormularioOrig();
};

// ─────────────────────────────────────────────
// PINTAR CITAS DE TINTE CON SLOTS MANUALES
// Si la cita tiene slotsTinte guardados, usarlos
// ─────────────────────────────────────────────
// Extender pintarCitasEnAgenda para limpiar previews al repintar
const _pintarCitasOrig = pintarCitasEnAgenda;
pintarCitasEnAgenda = function(citas) {
    // Limpiar previews de slots de tinte antes de repintar
    document.querySelectorAll('.slot-tinte-preview').forEach(el => el.remove());
    _pintarCitasOrig(citas);
    // Restaurar previews de slots marcados en sesión actual
    if (slotsTinteMarcados.length > 0 && trabajadoraSlots) {
        slotsTinteMarcados.forEach(s => {
            const colId = colIdParaTrabajadora(trabajadoraSlots);
            const slot = SLOT_CACHE.get(`${colId}-${s.hora}`);
            if (slot) pintarSlotMarcado(slot, s.fase, s.hora);
        });
    }
};
// ─────────────────────────────────────────────
// BLOQUEO RÁPIDO DE SLOTS CON CLIC
// ─────────────────────────────────────────────

// Estructura: Map<"colId-horaStr", { nota, trabajadora, fecha }>
let SLOTS_BLOQUEADOS = new Map();

// Cargar bloqueos del localStorage al iniciar + los de Sheets
function cargarBloqueos() {
    try {
        const datos = JSON.parse(localStorage.getItem('slotsBloqueados') || '[]');
        SLOTS_BLOQUEADOS.clear();
        datos.forEach(b => SLOTS_BLOQUEADOS.set(b.key, b));
    } catch(e) { SLOTS_BLOQUEADOS.clear(); }
    // Cargar tambien las reservas de Sheets
    RESERVAS_SHEETS.forEach(r => {
        if (!r.Fecha || !r.Hora || !r.Trabajadora) return;
        const colId = colIdParaTrabajadora(r.Trabajadora);
        const key = colId + '-' + r.Hora + '-' + r.Fecha;
        if (!SLOTS_BLOQUEADOS.has(key)) {
            SLOTS_BLOQUEADOS.set(key, {
                key,
                nota: r.Nota || 'Ocupado',
                trabajadora: r.Trabajadora,
                fecha: r.Fecha,
                horaStr: r.Hora,
                colId,
                idSheets: r.ID_RESERVA
            });
        }
    });
	 activarClicEnSlots(); // ← AÑADIR ESTA LÍNEA
}

function guardarBloqueos() {
    const arr = [];
    SLOTS_BLOQUEADOS.forEach((v, k) => arr.push({ key: k, ...v }));
    localStorage.setItem('slotsBloqueados', JSON.stringify(arr));
}

// Llamar al inicio
cargarBloqueos();

// ─────────────────────────────────────────────
// MENÚ DE SLOT — al pulsar un hueco libre
// Muestra dos opciones: "Nueva cita aquí" o "Reservar/Bloquear"
// ─────────────────────────────────────────────
function mostrarMenuSlot(colId, horaStr, trabajadora, slotEl) {
    // Cerrar menú anterior si existe
    const existente = document.getElementById('menuSlot');
    if (existente) existente.remove();

    const rect = slotEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.id = 'menuSlot';
    menu.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: white;
        border-radius: 0.9rem;
        box-shadow: 0 8px 30px rgba(236,72,153,0.18), 0 2px 8px rgba(0,0,0,0.10);
        padding: 0.55rem 0.6rem;
        width: 200px;
        border: 1.5px solid #fce7f3;
        font-family: 'Inter', sans-serif;
    `;

    const top = Math.min(rect.bottom + 4, window.innerHeight - 110);
    const left = Math.min(rect.left, window.innerWidth - 210);
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';

    document.body.appendChild(menu);

    function cerrarMenu() {
        menu.remove();
        document.removeEventListener('mousedown', outsideClick);
    }

    // Ir directo al popup de bloqueo sin menú intermedio
    cerrarMenu();
    mostrarPopupBloqueo(colId, horaStr, trabajadora, slotEl);
    return;

    function outsideClick(e) {
        if (!menu.contains(e.target)) cerrarMenu();
    }
    setTimeout(() => document.addEventListener('mousedown', outsideClick), 80);
}

// Abre el formulario de nueva cita con hora y trabajadora preseleccionadas desde el slot
function abrirFormularioDesdeSlot(horaStr, nombreTrabajadora) {
    // 1. Abrir modal (usa la misma lógica que el botón "NUEVA CITA")
    abrirFormulario();

    // 2. Pequeño delay para que el DOM del modal esté listo
    setTimeout(() => {
        // Seleccionar trabajadora
        const tObj = TRABAJADORAS.find(t => t.Nombre === nombreTrabajadora);
        if (tObj) {
            seleccionarTrabajadora(tObj.Area || tObj.Nombre, tObj.Nombre);
        }

        // Esperar a que generarBotonesHora termine (llama a generarBotonesHora al seleccionar trab)
        setTimeout(() => {
            // Marcar el botón de hora correspondiente
            const gridHoras = document.getElementById('gridHorasSeleccion');
            if (!gridHoras) return;
            const btnHora = gridHoras.querySelector(`.btn-hora[data-hora="${horaStr}"]`);
            if (btnHora) {
                // Simular click en ese botón
                btnHora.click();
                btnHora.scrollIntoView({ block: 'nearest' });
            } else {
                // La hora puede estar ocupada según los cálculos; aun así se preselecciona
                document.getElementById('horaSeleccionada').value = horaStr;
            }
        }, 80);
    }, 50);
}

// Mini popup de bloqueo rápido
function mostrarPopupBloqueo(colId, horaStr, trabajadora, slotEl) {
    // Si ya hay un popup abierto, cerrarlo
    const existente = document.getElementById('popupBloqueoRapido');
    if (existente) existente.remove();

    const rect = slotEl.getBoundingClientRect();

    const popup = document.createElement('div');
    popup.id = 'popupBloqueoRapido';
    popup.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: white;
        border-radius: 1rem;
        box-shadow: 0 8px 30px rgba(236,72,153,0.18), 0 2px 8px rgba(0,0,0,0.08);
        padding: 0.9rem 1rem;
        width: 220px;
        border: 1.5px solid #fce7f3;
        font-family: 'Inter', sans-serif;
    `;

    // Posicionar cerca del slot
    const top = Math.min(rect.bottom + 4, window.innerHeight - 160);
    const left = Math.min(rect.left, window.innerWidth - 230);
    popup.style.top = top + 'px';
    popup.style.left = left + 'px';

    popup.innerHTML = `
        <div style="font-size:0.7rem;font-weight:900;color:#64748b;text-transform:uppercase;margin-bottom:0.5rem;">
            📍 ${horaStr} · ${trabajadora}
        </div>
        <button id="btnNuevaCitaDesdeSlot" style="width:100%;background:linear-gradient(135deg,#ec4899,#f472b6);color:white;border:none;padding:0.55rem;border-radius:0.6rem;font-weight:900;font-size:0.82rem;cursor:pointer;margin-bottom:0.5rem;">
            ➕ NUEVA CITA AQUÍ
        </button>
        <div style="font-size:0.65rem;font-weight:800;color:#94a3b8;text-transform:uppercase;margin-bottom:0.35rem;">🔒 O RESERVAR SLOT</div>
        <input id="inputNotaBloqueo" type="text" placeholder="Nombre / nota (opcional)"
            style="width:100%;padding:0.5rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:0.6rem;font-size:0.85rem;font-weight:600;outline:none;color:#1e293b;margin-bottom:0.6rem;"
            autocomplete="off">
        <div style="display:flex;gap:0.4rem;">
            <button id="btnCancelarBloqueo" style="flex:1;background:#f1f5f9;color:#475569;border:none;padding:0.5rem;border-radius:0.6rem;font-weight:700;font-size:0.8rem;cursor:pointer;">
                Cancelar
            </button>
            <button id="btnConfirmarBloqueo" style="flex:2;background:#ec4899;color:white;border:none;padding:0.5rem;border-radius:0.6rem;font-weight:900;font-size:0.8rem;cursor:pointer;">
                🔒 RESERVAR
            </button>
        </div>
    `;

    document.body.appendChild(popup);

    popup.querySelector('#btnNuevaCitaDesdeSlot').onclick = () => {
        cerrarPopup();
        abrirFormularioDesdeSlot(horaStr, trabajadora);
    };

    const inputNota = popup.querySelector('#inputNotaBloqueo');
    inputNota.focus();

    function cerrarPopup() {
        popup.remove();
        document.removeEventListener('mousedown', outsideClick);
    }

    function confirmarBloqueo() {
        const nota = inputNota.value.trim() || 'Ocupado';
        const fecha = document.getElementById('fechaAgenda').value;
        const key = colId + '-' + horaStr + '-' + fecha;
        const idLocal = 'RES-LOCAL-' + Date.now();
        const bloqueo = { key, nota, trabajadora, fecha, horaStr, colId, idSheets: idLocal };
        SLOTS_BLOQUEADOS.set(key, bloqueo);
        guardarBloqueos();
        cerrarPopup();
        pintarSlotBloqueado(slotEl, nota, key);
        // Guardar en Google Sheets para sincronizar con otros dispositivos
        const _payloadReserva = encodeURIComponent(JSON.stringify({
            accion: 'guardar_reserva',
            fecha,
            hora: horaStr,
            trabajadora,
            nota
        }));
        fetch(URL_SCRIPT + '?payload=' + _payloadReserva)
            .then(r => r.json())
            .then(d => {
                if (d.ok && d.id) {
                    bloqueo.idSheets = d.id;
                    guardarBloqueos();
                }
            })
            .catch(err => console.error('Error guardando reserva:', err));
    }

    popup.querySelector('#btnConfirmarBloqueo').onclick = confirmarBloqueo;
    popup.querySelector('#btnCancelarBloqueo').onclick = cerrarPopup;
    inputNota.onkeydown = (e) => {
        if (e.key === 'Enter') confirmarBloqueo();
        if (e.key === 'Escape') cerrarPopup();
    };

    function outsideClick(e) {
        if (!popup.contains(e.target) && e.target !== slotEl) cerrarPopup();
    }
    setTimeout(() => document.addEventListener('mousedown', outsideClick), 100);
}

// Pintar un slot como bloqueado
function pintarSlotBloqueado(slotEl, nota, key) {
    // Limpiar overlays previos
    [...slotEl.querySelectorAll('.overlay-bloqueo')].forEach(el => el.remove());

    const over = document.createElement('div');
    over.className = 'overlay-bloqueo';
    over.style.cssText = `
        position:absolute;top:0;left:0;width:100%;height:100%;
        background: linear-gradient(90deg, #f43f8e 0%, #e879b8 60%, #c026a6 100%);
        border-left: 3px solid #be185d;
        display:flex;align-items:center;justify-content:space-between;
        padding:0 6px;font-size:9px;font-weight:800;color:white;
        z-index:3;cursor:default;box-sizing:border-box;
        text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.2);
    `;
    // Extraer la hora del key: formato "colId-HH:MM-fecha", la hora es el penúltimo segmento HH:MM
    const horaMatch = key.match(/(\d{2}:\d{2})-\d{4}-\d{2}-\d{2}$/);
    const horaLabel = horaMatch ? horaMatch[1] : (slotEl._horaStr || '');

    over.innerHTML = `
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">🔒 <strong>${horaLabel}</strong> ${nota}</span>
        <button class="btn-desbloquear" data-key="${key}" style="
            background:rgba(255,255,255,0.25);border:1px solid rgba(255,255,255,0.4);border-radius:3px;
            color:white;font-size:9px;padding:0 4px;cursor:pointer;flex-shrink:0;
            margin-left:3px;font-weight:900;
        " title="Liberar slot">✕</button>
    `;

    over.querySelector('.btn-desbloquear').onclick = (e) => {
        e.stopPropagation();
        const bloqueo = SLOTS_BLOQUEADOS.get(key);
        SLOTS_BLOQUEADOS.delete(key);
        guardarBloqueos();
        over.remove();
        // Restaurar el span de hora sin el candado
        const spanHora = slotEl.querySelector('span');
        if (spanHora && spanHora.dataset.horaOriginal) {
            spanHora.textContent = spanHora.dataset.horaOriginal;
            spanHora.style.color = '';
            delete spanHora.dataset.horaOriginal;
        }
        // Eliminar tambien de Google Sheets
        if (bloqueo && bloqueo.idSheets && !bloqueo.idSheets.startsWith('RES-LOCAL')) {
            const _payloadEliminar = encodeURIComponent(JSON.stringify({
                accion: 'eliminar_reserva',
                id: bloqueo.idSheets
            }));
            fetch(URL_SCRIPT + '?payload=' + _payloadEliminar)
                .catch(err => console.error('Error eliminando reserva:', err));
        }
    };

    slotEl.style.position = 'relative';
    slotEl.appendChild(over);
    const sh = slotEl.querySelector('span');
    if (sh) {
        sh.style.color = 'rgba(255,255,255,0.9)';
        if (!sh.dataset.horaOriginal) sh.dataset.horaOriginal = sh.textContent;
        sh.textContent = '🔒 ' + sh.dataset.horaOriginal;
    }
}

// Activar clic en slots vacíos — se llama desde generarTramosVisuales
function activarClicEnSlots() {
    const fecha = document.getElementById('fechaAgenda')?.value || '';

    SLOT_CACHE.forEach((slotEl, cacheKey) => {
        // Extraer colId y horaStr de la clave "colId-HH:MM"
        const sepIdx = cacheKey.lastIndexOf('-');
        if (sepIdx < 0) return;
        const colId = cacheKey.substring(0, sepIdx - 3); // quitar "-HH"
        // Mejor: la horaStr siempre acaba en HH:MM (5 chars con los dos puntos)
        const horaStr = slotEl._horaStr;
        const trabajadoraObj = TRABAJADORAS.find(t => colIdParaTrabajadora(t.Nombre) === cacheKey.split('-').slice(0, -1).join('-'));
        const trabajadora = trabajadoraObj ? trabajadoraObj.Nombre : '';

        // Reusar colId directamente desde SLOT_CACHE key: "agenda-nombre-HH:MM"
        // La key es `${id}-${horaStr}` donde id = colIdParaTrabajadora(nombre)
        // Así que id = key sin el sufijo "-HH:MM"
        const colIdReal = cacheKey.replace(/-\d{2}:\d{2}$/, '');
        const bloqueoKey = `${colIdReal}-${horaStr}-${fecha}`;

        // Pintar si ya estaba bloqueado esta fecha
        if (SLOTS_BLOQUEADOS.has(bloqueoKey)) {
            const b = SLOTS_BLOQUEADOS.get(bloqueoKey);
            pintarSlotBloqueado(slotEl, b.nota, bloqueoKey);
        }

        // Solo añadir clic si no lo tiene ya (evitar duplicar listeners)
        if (!slotEl._bloqueoActivado) {
            slotEl._bloqueoActivado = true;
            slotEl.addEventListener('click', (e) => {
                // No abrir si ya hay un overlay de cita encima
                if (e.target.closest('.cita-overlay')) return;
                if (e.target.closest('.overlay-bloqueo')) return;
                if (e.target.closest('.slot-tinte-preview')) return;
                // Buscar trabajadora de este slot
                const colIdSlot = cacheKey.replace(/-\d{2}:\d{2}$/, '');
                const tObj = TRABAJADORAS.find(t => colIdParaTrabajadora(t.Nombre) === colIdSlot);
                const nombreTrab = tObj ? tObj.Nombre : '';
                mostrarMenuSlot(colIdSlot, slotEl._horaStr, nombreTrab, slotEl);
            });
        }
    });
}

// Enganchar activarClicEnSlots al fin de generarTramosVisuales
const _generarTramosOrig = generarTramosVisuales;
generarTramosVisuales = function() {
    _generarTramosOrig();
    activarClicEnSlots();
};

// También repintar bloqueos cuando cambia la fecha o se repinta la agenda
const _cambiarDiaOrig = cambiarDia;
cambiarDia = function() {
    _cambiarDiaOrig();
    // Repintar bloqueos para la nueva fecha
    const fecha = document.getElementById('fechaAgenda')?.value || '';
    SLOT_CACHE.forEach((slotEl, cacheKey) => {
        const colIdReal = cacheKey.replace(/-\d{2}:\d{2}$/, '');
        const horaStr = slotEl._horaStr;
        const bloqueoKey = `${colIdReal}-${horaStr}-${fecha}`;
        [...slotEl.querySelectorAll('.overlay-bloqueo')].forEach(el => el.remove());
        if (SLOTS_BLOQUEADOS.has(bloqueoKey)) {
            const b = SLOTS_BLOQUEADOS.get(bloqueoKey);
            pintarSlotBloqueado(slotEl, b.nota, bloqueoKey);
        }
    });
};

// Repintar bloqueos después de que pintarCitasEnAgenda resetea los slots
const _pintarCitasFinal = pintarCitasEnAgenda;
pintarCitasEnAgenda = function(citas) {
    _pintarCitasFinal(citas);
    const fecha = document.getElementById('fechaAgenda')?.value || '';
    SLOT_CACHE.forEach((slotEl, cacheKey) => {
        const colIdReal = cacheKey.replace(/-\d{2}:\d{2}$/, '');
        const horaStr = slotEl._horaStr;
        const bloqueoKey = `${colIdReal}-${horaStr}-${fecha}`;
        if (SLOTS_BLOQUEADOS.has(bloqueoKey)) {
            const b = SLOTS_BLOQUEADOS.get(bloqueoKey);
            pintarSlotBloqueado(slotEl, b.nota, bloqueoKey);
        }
    });
    // Reactivar clics (pintarCitasEnAgenda resetea innerHTML del slot)
    activarClicEnSlots();
};

// ─────────────────────────────────────────────
// MOVER CITA — CAMBIAR FECHA Y HORA
// ─────────────────────────────────────────────
function abrirMoverCita(idCita, cliente, horaActual, fechaActual, trabajadoraActual) {
    // Eliminar popup anterior si existe
    const existente = document.getElementById('popupMoverCita');
    if (existente) existente.remove();

    const popup = document.createElement('div');
    popup.id = 'popupMoverCita';
    popup.style.cssText = `
        position: fixed;
        z-index: 9999;
        background: white;
        border-radius: 1.2rem;
        box-shadow: 0 8px 40px rgba(236,72,153,0.22), 0 2px 12px rgba(0,0,0,0.10);
        padding: 1.1rem 1.2rem;
        width: 280px;
        border: 1.5px solid #fce7f3;
        font-family: 'Inter', sans-serif;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    `;

    // Generar opciones de hora (7:30 a 20:00)
    let opcionesHora = '';
    for (let h = 7; h <= 20; h++) {
        for (let m = 0; m < 60; m += 15) {
            if (h === 7 && m < 30) continue;
            if (h === 20 && m > 0) continue;
            const hs = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
            opcionesHora += `<option value="${hs}" ${hs === horaActual ? 'selected' : ''}>${hs}</option>`;
        }
    }

    // Generar opciones de trabajadora
    let opcionesTrab = '';
    TRABAJADORAS.forEach(t => {
        opcionesTrab += `<option value="${t.Nombre}" ${t.Nombre === trabajadoraActual ? 'selected' : ''}>${t.Nombre}</option>`;
    });

    popup.innerHTML = `
        <div style="font-size:0.7rem;font-weight:900;color:#ec4899;text-transform:uppercase;margin-bottom:0.7rem;">
            📅 Cambiar fecha y hora · ${cliente}
        </div>
        <div style="margin-bottom:0.5rem;">
            <label style="font-size:0.65rem;font-weight:800;color:#94a3b8;display:block;margin-bottom:0.3rem;">NUEVA FECHA</label>
            <input type="date" id="moverFecha" value="${fechaActual}"
                style="width:100%;padding:0.45rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:0.6rem;font-size:0.85rem;font-weight:600;outline:none;color:#1e293b;">
        </div>
        <div style="margin-bottom:0.5rem;">
            <label style="font-size:0.65rem;font-weight:800;color:#94a3b8;display:block;margin-bottom:0.3rem;">NUEVA HORA</label>
            <select id="moverHora" style="width:100%;padding:0.45rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:0.6rem;font-size:0.85rem;font-weight:600;outline:none;color:#1e293b;">
                ${opcionesHora}
            </select>
        </div>
        <div style="margin-bottom:0.8rem;">
            <label style="font-size:0.65rem;font-weight:800;color:#94a3b8;display:block;margin-bottom:0.3rem;">TRABAJADORA</label>
            <select id="moverTrabajadora" style="width:100%;padding:0.45rem 0.6rem;border:1.5px solid #e2e8f0;border-radius:0.6rem;font-size:0.85rem;font-weight:600;outline:none;color:#1e293b;">
                ${opcionesTrab}
            </select>
        </div>
        <div style="display:flex;gap:0.4rem;">
            <button id="btnCancelarMover" style="flex:1;background:#f1f5f9;color:#475569;border:none;padding:0.5rem;border-radius:0.6rem;font-weight:700;font-size:0.8rem;cursor:pointer;">
                Cancelar
            </button>
            <button id="btnConfirmarMover" style="flex:2;background:linear-gradient(135deg,#ec4899,#f472b6);color:white;border:none;padding:0.5rem;border-radius:0.6rem;font-weight:900;font-size:0.8rem;cursor:pointer;">
                ✅ GUARDAR CAMBIO
            </button>
        </div>
    `;

    // Overlay oscuro de fondo
    const overlay = document.createElement('div');
    overlay.id = 'overlayMoverCita';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.4);z-index:9998;';
    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    function cerrarMover() {
        popup.remove();
        overlay.remove();
    }

    async function confirmarMover() {
        const nuevaFecha = document.getElementById('moverFecha').value;
        const nuevaHora = document.getElementById('moverHora').value;
        const nuevaTrabajadora = document.getElementById('moverTrabajadora').value;

        if (!nuevaFecha || !nuevaHora) {
            alert('Selecciona fecha y hora');
            return;
        }

        const btn = document.getElementById('btnConfirmarMover');
        btn.textContent = 'Guardando...';
        btn.disabled = true;

        try {
            // 1. Enviar a Sheets y ESPERAR confirmación antes de seguir
            const _payload = encodeURIComponent(JSON.stringify({
                accion: 'mover_cita',
                id: idCita,
                nuevaFecha,
                nuevaHora,
                nuevaTrabajadora
            }));
            await fetch(URL_SCRIPT + '?payload=' + _payload);

            // 2. Cerrar popup
            cerrarMover();

            // 3. Cambiar fecha visible si es distinta a la actual
            const fechaAgendaEl = document.getElementById('fechaAgenda');
            if (fechaAgendaEl && nuevaFecha !== fechaAgendaEl.value) {
                fechaAgendaEl.value = nuevaFecha;
                actualizarDiaSemana();
            }

            // 4. Recargar datos frescos de Sheets — así todos los dispositivos ven lo mismo
            await cargarDatosDesdeSheet(true);

        } catch(err) {
            console.error('Error moviendo cita en Sheets:', err);
            alert('Error al guardar el cambio. Inténtalo de nuevo.');
            btn.textContent = '\u2705 GUARDAR CAMBIO';
            btn.disabled = false;
        }
    }

    document.getElementById('btnConfirmarMover').onclick = confirmarMover;
    document.getElementById('btnCancelarMover').onclick = cerrarMover;
    overlay.onclick = cerrarMover;
}