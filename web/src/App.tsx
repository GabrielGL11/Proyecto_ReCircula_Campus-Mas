import { useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'
import './solicitudes.css'
import {
  CATEGORIAS,
  abrirOrden,
  anotarEnListaEspera,
  aprobarSolicitud,
  avanzarOrden,
  cancelarListaEspera,
  cambiarMantenimiento,
  crearSolicitud,
  listarAveriasSinOrden,
  listarConfirmadas,
  listarHistorialOrden,
  listarListaEspera,
  listarOrdenes,
  listarPendientes,
  listarRecursos,
  listarRecursosParaMantenimiento,
  listarSolicitudes,
  obtenerUsuario,
  publicarRecurso,
  rechazarSolicitud,
  registrarDevolucion,
  reportarAveria,
  type AveriaSinOrden,
  type CambioEstadoOrden,
  type EntradaEspera,
  type EstadoOrden,
  type Filtros,
  type OrdenReparacion,
  type Recurso,
  type Solicitud,
  type Usuario,
} from './api.ts'
import { useSesion } from './auth/sesion.ts'

const formatoFecha = (iso: string) => iso.split('-').reverse().join('/')

const etiquetaCategoria = (valor: string) =>
  CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor

// Fecha y hora local de un instante (el historial de las órdenes guarda cuándo cambió cada estado).
const formatoFechaHora = (iso: string) =>
  new Date(iso).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })

// HU-08: la orden solo avanza abierta → en reparación → resuelta, así que cada estado tiene un único "siguiente".
const ETIQUETA_ORDEN: Record<EstadoOrden, string> = {
  abierta: 'Abierta',
  en_reparacion: 'En reparación',
  resuelta: 'Resuelta',
}
const SIGUIENTE_ORDEN: Record<EstadoOrden, { estado: EstadoOrden; boton: string } | null> = {
  abierta: { estado: 'en_reparacion', boton: 'Iniciar reparación' },
  en_reparacion: { estado: 'resuelta', boton: 'Marcar como resuelta' },
  resuelta: null,
}

const ESTADO_MANTENIMIENTO: Record<Recurso['estado'], string> = {
  disponible: 'Disponible',
  averiado: 'Averiado',
  retirado: 'Retirado por mantenimiento',
}

export default function App() {
  const { session, cerrarSesion } = useSesion()

  // Qué ve cada rol (la regla de verdad está en la API y la base; esto solo evita mostrar lo que no le toca).
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const puedePublicar = usuario?.rol === 'propietario' || usuario?.rol === 'coordinador' // HU-01
  const puedeSolicitar = usuario?.rol === 'solicitante' // HU-03
  const puedeDecidir = usuario?.rol === 'propietario' || usuario?.rol === 'coordinador' // HU-04
  const puedeDevolver = usuario?.rol === 'coordinador'
  const puedeGestionarOrdenes = usuario?.rol === 'coordinador' // HU-08
  const [recursos, setRecursos] = useState<Recurso[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

  const [recursosMantenimiento, setRecursosMantenimiento] = useState<Recurso[]>([])
  const [cargandoMantenimiento, setCargandoMantenimiento] = useState(true)
  const [gestionandoRecurso, setGestionandoRecurso] = useState<number | null>(null)
  const [errorMantenimiento, setErrorMantenimiento] = useState<string | null>(null)
  const [mensajeMantenimiento, setMensajeMantenimiento] = useState<string | null>(null)

  async function cargarMantenimiento() {
    setCargandoMantenimiento(true)
    setErrorMantenimiento(null)
    try {
      setRecursosMantenimiento(await listarRecursosParaMantenimiento())
    } catch {
      setErrorMantenimiento('No se pudieron cargar los recursos para mantenimiento.')
    } finally {
      setCargandoMantenimiento(false)
    }
  }

  async function gestionarMantenimiento(recurso: Recurso) {
    const reincorporar = recurso.estado === 'retirado'
    setGestionandoRecurso(recurso.id)
    setErrorMantenimiento(null)
    setMensajeMantenimiento(null)
    try {
      const actualizado = await cambiarMantenimiento(recurso.id, reincorporar ? 'reincorporar' : 'retirar')
      setRecursosMantenimiento((lista) => lista.map((r) => r.id === actualizado.id ? actualizado : r))
      setMensajeMantenimiento(reincorporar
        ? `«${recurso.nombre}» reincorporado.`
        : `«${recurso.nombre}» retirado por mantenimiento.`)
      await Promise.all([cargar(filtrosAplicados.current), cargarPendientes(), cargarConfirmadas()])
    } catch (err) {
      setErrorMantenimiento(Array.isArray(err) ? err.join(' ') : 'No se pudo actualizar el mantenimiento.')
    } finally {
      setGestionandoRecurso(null)
    }
  }

  // Formulario de publicación (HU-01)
  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [confirmacion, setConfirmacion] = useState<string | null>(null)

  // Filtros de búsqueda (HU-02)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [errorFiltro, setErrorFiltro] = useState<string | null>(null)
  const [filtrosActivos, setFiltrosActivos] = useState(false)

  // Número de la última petición enviada. Si llega una respuesta de una petición
  // anterior (porque el usuario pulsó Buscar dos veces seguidas), se ignora.
  const ultimaPeticion = useRef(0)
  const filtrosAplicados = useRef<Filtros>({})

  // Solicitud de préstamo (HU-03)
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [recursoElegido, setRecursoElegido] = useState<number | null>(null)
  const [inicioSolicitud, setInicioSolicitud] = useState('')
  const [finSolicitud, setFinSolicitud] = useState('')
  const [erroresSolicitud, setErroresSolicitud] = useState<string[]>([])
  const [confirmacionSolicitud, setConfirmacionSolicitud] = useState<string | null>(null)
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)

  // Lista de espera (HU-07)
  const [listaEspera, setListaEspera] = useState<EntradaEspera[]>([])
  const [recursoEspera, setRecursoEspera] = useState<number | null>(null)
  const [inicioEspera, setInicioEspera] = useState('')
  const [finEspera, setFinEspera] = useState('')
  const [erroresEspera, setErroresEspera] = useState<string[]>([])
  const [confirmacionEspera, setConfirmacionEspera] = useState<string | null>(null)
  const [enviandoEspera, setEnviandoEspera] = useState(false)
  const [cancelandoEspera, setCancelandoEspera] = useState<number | null>(null)

  // Reporte de avería (HU-06)
  const [recursoAveria, setRecursoAveria] = useState<number | null>(null)
  const [descripcionAveria, setDescripcionAveria] = useState('')
  const [erroresAveria, setErroresAveria] = useState<string[]>([])
  const [confirmacionAveria, setConfirmacionAveria] = useState<string | null>(null)
  const [enviandoAveria, setEnviandoAveria] = useState(false)

  // Decidir solicitudes (HU-04)
  const [pendientes, setPendientes] = useState<Solicitud[]>([])
  const [decidiendo, setDecidiendo] = useState<number | null>(null)
  const [erroresDecision, setErroresDecision] = useState<string[]>([])
  const [mensajeDecision, setMensajeDecision] = useState<string | null>(null)

  const [confirmadas, setConfirmadas] = useState<Solicitud[]>([])
  const [cargandoConfirmadas, setCargandoConfirmadas] = useState(true)
  const [errorConfirmadas, setErrorConfirmadas] = useState(false)
  const [devolviendo, setDevolviendo] = useState<number | null>(null)
  const [erroresDevolucion, setErroresDevolucion] = useState<string[]>([])
  const [mensajeDevolucion, setMensajeDevolucion] = useState<string | null>(null)

  async function cargarConfirmadas() {
    try {
      setConfirmadas(await listarConfirmadas())
      setErrorConfirmadas(false)
    } catch {
      setErrorConfirmadas(true)
    } finally {
      setCargandoConfirmadas(false)
    }
  }

  async function devolver(s: Solicitud) {
    setDevolviendo(s.id)
    setErroresDevolucion([])
    setMensajeDevolucion(null)
    try {
      const devuelta = await registrarDevolucion(s.id)
      const fecha = devuelta.fechaDevolucionReal
      setMensajeDevolucion(
        fecha
          ? `Devolución de «${s.recursoNombre}» registrada el ${formatoFecha(fecha)}.`
          : `Devolución de «${s.recursoNombre}» registrada.`,
      )
      setConfirmadas((actuales) => actuales.filter((prestamo) => prestamo.id !== s.id))
      await Promise.all([
        cargarConfirmadas(),
        cargarPendientes(),
        cargar(filtrosAplicados.current),
      ])
    } catch (err) {
      setErroresDevolucion(Array.isArray(err) ? (err as string[]) : ['No se pudo registrar la devolución.'])
    } finally {
      setDevolviendo(null)
    }
  }

  // Órdenes de reparación (HU-08)
  const [ordenes, setOrdenes] = useState<OrdenReparacion[]>([])
  const [averiasSinOrden, setAveriasSinOrden] = useState<AveriaSinOrden[]>([])
  const [cargandoOrdenes, setCargandoOrdenes] = useState(true)
  const [errorOrdenes, setErrorOrdenes] = useState(false)
  const [trabajandoOrden, setTrabajandoOrden] = useState(false)
  const [erroresOrden, setErroresOrden] = useState<string[]>([])
  const [mensajeOrden, setMensajeOrden] = useState<string | null>(null)
  const [historialAbierto, setHistorialAbierto] = useState<number | null>(null)
  const [historial, setHistorial] = useState<CambioEstadoOrden[]>([])
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null)

  async function cargarOrdenes() {
    try {
      const [listaOrdenes, listaAverias] = await Promise.all([listarOrdenes(), listarAveriasSinOrden()])
      setOrdenes(listaOrdenes)
      setAveriasSinOrden(listaAverias)
      setErrorOrdenes(false)
    } catch {
      setErrorOrdenes(true)
    } finally {
      setCargandoOrdenes(false)
    }
  }

  async function cargarHistorial(id: number) {
    try {
      setHistorial(await listarHistorialOrden(id))
      setErrorHistorial(null)
    } catch (err) {
      setErrorHistorial(Array.isArray(err) ? (err as string[]).join(' ') : 'No se pudo cargar el historial.')
    }
  }

  async function alternarHistorial(orden: OrdenReparacion) {
    if (historialAbierto === orden.id) {
      setHistorialAbierto(null)
      return
    }
    setHistorialAbierto(orden.id)
    setHistorial([])
    setErrorHistorial(null)
    await cargarHistorial(orden.id)
  }

  // (a) La orden nace "abierta" desde una avería reportada.
  async function abrirOrdenDe(averia: AveriaSinOrden) {
    setTrabajandoOrden(true)
    setErroresOrden([])
    setMensajeOrden(null)
    try {
      const orden = await abrirOrden(averia.id)
      setMensajeOrden(`Orden n.º ${orden.id} abierta para «${averia.recursoNombre}».`)
      await cargarOrdenes()
    } catch (err) {
      setErroresOrden(Array.isArray(err) ? (err as string[]) : ['No se pudo abrir la orden de reparación.'])
    } finally {
      setTrabajandoOrden(false)
    }
  }

  // (b), (c) y (d) Un solo paso a la vez; al resolver, el recurso vuelve al catálogo.
  async function avanzarEstadoOrden(orden: OrdenReparacion, nuevo: EstadoOrden) {
    setTrabajandoOrden(true)
    setErroresOrden([])
    setMensajeOrden(null)
    try {
      await avanzarOrden(orden.id, nuevo)
      setMensajeOrden(
        nuevo === 'resuelta'
          ? `Orden n.º ${orden.id} resuelta: «${orden.recursoNombre}» vuelve a estar disponible.`
          : `Orden n.º ${orden.id} de «${orden.recursoNombre}»: ${ETIQUETA_ORDEN[nuevo].toLowerCase()}.`,
      )
      await Promise.all([
        cargarOrdenes(),
        cargarMantenimiento(),
        cargar(filtrosAplicados.current),
        historialAbierto === orden.id ? cargarHistorial(orden.id) : Promise.resolve(),
      ])
    } catch (err) {
      setErroresOrden(Array.isArray(err) ? (err as string[]) : ['No se pudo cambiar el estado de la orden.'])
    } finally {
      setTrabajandoOrden(false)
    }
  }

  async function cargarPendientes() {
    try {
      setPendientes(await listarPendientes())
    } catch {
      setPendientes([])
    }
  }

  async function decidir(s: Solicitud, accion: 'aprobar' | 'rechazar') {
    setDecidiendo(s.id)
    setErroresDecision([])
    setMensajeDecision(null)
    try {
      if (accion === 'aprobar') {
        await aprobarSolicitud(s.id)
        if (puedeDevolver) await cargarConfirmadas()
        setMensajeDecision(
          `Aprobada: «${s.recursoNombre}» queda confirmado del ${formatoFecha(s.rango.inicio)} al ${formatoFecha(s.rango.fin)} y el recurso se bloquea en esas fechas.`,
        )
      } else {
        await rechazarSolicitud(s.id)
        setMensajeDecision(`Rechazada la solicitud de «${s.recursoNombre}».`)
      }
      await cargarPendientes()
      await cargar(filtrosActivos ? { categoria: filtroCategoria, desde, hasta } : {})
    } catch (err) {
      // Si falla (por ejemplo, se superpone con un préstamo confirmado), la solicitud sigue pendiente (HU-04 b).
      setErroresDecision(Array.isArray(err) ? (err as string[]) : ['No se pudo registrar la decisión.'])
    } finally {
      setDecidiendo(null)
    }
  }

  async function cargarSolicitudes() {
    try {
      setSolicitudes(await listarSolicitudes())
    } catch {
      setSolicitudes([])
    }
  }

  function abrirSolicitud(id: number) {
    setRecursoElegido(id)
    setRecursoEspera(null)
    setRecursoAveria(null)
    setDescripcionAveria('')
    setErroresAveria([])
    setInicioSolicitud(desde)
    setFinSolicitud(hasta)
    setErroresSolicitud([])
    setConfirmacionSolicitud(null)
  }

  function cancelarSolicitud() {
    setRecursoElegido(null)
    setErroresSolicitud([])
  }

  function abrirAveria(id: number) {
    setRecursoAveria(id)
    setRecursoElegido(null)
    setRecursoEspera(null)
    setErroresSolicitud([])
    setDescripcionAveria('')
    setErroresAveria([])
    setConfirmacionAveria(null)
  }

  function cancelarAveria() {
    setRecursoAveria(null)
    setDescripcionAveria('')
    setErroresAveria([])
  }

  async function cargarListaEspera() {
    try {
      setListaEspera(await listarListaEspera())
    } catch {
      setListaEspera([])
    }
  }

  function abrirEspera(id: number) {
    setRecursoEspera(id)
    setRecursoElegido(null)
    setRecursoAveria(null)
    setDescripcionAveria('')
    setErroresAveria([])
    setErroresSolicitud([])
    setInicioEspera(desde)
    setFinEspera(hasta)
    setErroresEspera([])
    setConfirmacionEspera(null)
  }

  function cancelarFormularioEspera() {
    setRecursoEspera(null)
    setErroresEspera([])
  }

  async function enviarEspera(e: FormEvent) {
    e.preventDefault()
    if (recursoEspera === null) return
    setEnviandoEspera(true)
    setErroresEspera([])
    setConfirmacionEspera(null)
    try {
      const nueva = await anotarEnListaEspera({
        recursoId: recursoEspera,
        inicio: inicioEspera,
        fin: finEspera,
      })
      setConfirmacionEspera(
        `Te has anotado en la lista de espera de «${nueva.recursoNombre}» del ${formatoFecha(nueva.rango.inicio)} al ${formatoFecha(nueva.rango.fin)}. Cuando se libere, pasarás a solicitud pendiente.`,
      )
      setRecursoEspera(null)
      await cargarListaEspera()
    } catch (err) {
      setErroresEspera(Array.isArray(err) ? (err as string[]) : ['No se pudo anotar en la lista de espera.'])
    } finally {
      setEnviandoEspera(false)
    }
  }

  async function cancelarLugarEspera(id: number) {
    setCancelandoEspera(id)
    try {
      await cancelarListaEspera(id)
      await cargarListaEspera()
    } catch {
      await cargarListaEspera()
    } finally {
      setCancelandoEspera(null)
    }
  }

  async function enviarAveria(e: FormEvent) {
    e.preventDefault()
    if (recursoAveria === null) return
    setEnviandoAveria(true)
    setErroresAveria([])
    setConfirmacionAveria(null)
    try {
      await reportarAveria(recursoAveria, descripcionAveria)
      setConfirmacionAveria('La avería se reportó correctamente. El recurso ya no aparece disponible.')
      setRecursoAveria(null)
      setDescripcionAveria('')
      await cargar(filtrosActivos ? { categoria: filtroCategoria, desde, hasta } : {})
      if (puedeGestionarOrdenes) await Promise.all([cargarOrdenes(), cargarMantenimiento()])
    } catch (err) {
      setErroresAveria(Array.isArray(err) ? (err as string[]) : ['No se pudo reportar la avería.'])
    } finally {
      setEnviandoAveria(false)
    }
  }

  async function solicitar(e: FormEvent) {
    e.preventDefault()
    if (recursoElegido === null) return
    setEnviandoSolicitud(true)
    setErroresSolicitud([])
    setConfirmacionSolicitud(null)
    try {
      const nueva = await crearSolicitud({
        recursoId: recursoElegido,
        inicio: inicioSolicitud,
        fin: finSolicitud,
      })
      setConfirmacionSolicitud(
        `Solicitud enviada: «${nueva.recursoNombre}» del ${formatoFecha(nueva.rango.inicio)} al ${formatoFecha(nueva.rango.fin)}. Queda pendiente de aprobación.`,
      )
      setRecursoElegido(null)
      await cargarSolicitudes()
    } catch (err) {
      // Los datos escritos se conservan para poder corregirlos (RNF-02).
      setErroresSolicitud(Array.isArray(err) ? (err as string[]) : ['No se pudo enviar la solicitud.'])
    } finally {
      setEnviandoSolicitud(false)
    }
  }

  async function cargar(filtros: Filtros = {}) {
    filtrosAplicados.current = filtros
    const miPeticion = ++ultimaPeticion.current
    const vigente = () => miPeticion === ultimaPeticion.current
    setCargando(true)
    setErrorCatalogo(null)
    try {
      const datos = await listarRecursos(filtros)
      if (vigente()) setRecursos(datos)
    } catch {
      if (vigente()) setErrorCatalogo('No se pudo cargar el catálogo. Revisa que la API esté encendida.')
    } finally {
      if (vigente()) setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    obtenerUsuario()
      .then(setUsuario)
      .catch(() => setUsuario(null))
  }, [])

  useEffect(() => {
    if (puedeSolicitar) {
      void cargarSolicitudes()
      void cargarListaEspera()
    }
  }, [puedeSolicitar])

  useEffect(() => {
    if (puedeDecidir) void cargarPendientes()
  }, [puedeDecidir])

  useEffect(() => {
    if (puedeDevolver) void cargarConfirmadas()
  }, [puedeDevolver])

  useEffect(() => {
    if (puedeGestionarOrdenes) {
      void cargarOrdenes()
      void cargarMantenimiento()
    }
  }, [puedeGestionarOrdenes])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErrores([])
    setConfirmacion(null)
    try {
      // El propietario sale del token de la sesión, no del formulario.
      const nuevo = await publicarRecurso({ nombre, categoria })
      setConfirmacion(`«${nuevo.nombre}» se publicó y ya aparece como disponible.`)
      setNombre('')
      setCategoria('')
      await cargar(filtrosActivos ? { categoria: filtroCategoria, desde, hasta } : {})
      if (puedeGestionarOrdenes) await cargarMantenimiento()
    } catch (err) {
      setErrores(Array.isArray(err) ? (err as string[]) : ['No se pudo publicar el recurso.'])
    } finally {
      setEnviando(false)
    }
  }

  async function buscar(e: FormEvent) {
    e.preventDefault()
    setErrorFiltro(null)
    if ((desde && !hasta) || (!desde && hasta)) {
      setErrorFiltro('Indica la fecha inicial y la final.')
      return
    }
    if (desde && hasta && hasta < desde) {
      setErrorFiltro('La fecha final no puede ser anterior a la inicial.')
      return
    }
    setFiltrosActivos(Boolean(filtroCategoria || desde))
    await cargar({ categoria: filtroCategoria, desde, hasta })
  }

  async function limpiar() {
    setFiltroCategoria('')
    setDesde('')
    setHasta('')
    setErrorFiltro(null)
    setFiltrosActivos(false)
    await cargar()
  }

  return (
    <main className="pagina">
      <header>
        <h1>ReCircula Campus</h1>
        <p>Publica y encuentra recursos tecnológicos del campus.</p>
        <p className="sesion">
          Sesión de {session?.user.email}
          {usuario && ` (${usuario.rol})`}{' '}
          <button type="button" className="secundario" onClick={() => void cerrarSesion()}>
            Cerrar sesión
          </button>
        </p>
      </header>

      {puedePublicar && (
        <section aria-labelledby="titulo-form">
          <h2 id="titulo-form">Publicar un recurso</h2>
          <form onSubmit={enviar} noValidate>
            <div className="campo">
              <label htmlFor="nombre">Nombre del recurso</label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                aria-invalid={errores.length > 0 && !nombre.trim()}
                placeholder="Ej.: Calculadora Casio fx-991"
              />
            </div>

            <div className="campo">
              <label htmlFor="categoria">Categoría</label>
              <select
                id="categoria"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                aria-invalid={errores.length > 0 && !categoria}
              >
                <option value="">Selecciona una categoría</option>
                {CATEGORIAS.map((c) => (
                  <option key={c.valor} value={c.valor}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
            </div>

            {errores.length > 0 && (
              <div role="alert" className="mensaje error">
                <strong>No se pudo publicar:</strong>
                <ul>
                  {errores.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            <div role="status" aria-live="polite">
              {confirmacion && <p className="mensaje ok">{confirmacion}</p>}
            </div>

            <button type="submit" disabled={enviando}>
              {enviando ? 'Publicando…' : 'Publicar recurso'}
            </button>
          </form>
        </section>
      )}

      <section aria-labelledby="titulo-catalogo">
        <h2 id="titulo-catalogo">Catálogo</h2>

        <form onSubmit={buscar} noValidate className="filtros">
          <div className="campo">
            <label htmlFor="filtro-categoria">Categoría</label>
            <select id="filtro-categoria" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="">Todas</option>
              {CATEGORIAS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.etiqueta}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="desde">Desde</label>
            <input id="desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="hasta">Hasta</label>
            <input id="hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          <div className="acciones">
            <button type="submit">Buscar</button>
            <button type="button" className="secundario" onClick={() => void limpiar()}>
              Limpiar
            </button>
          </div>
        </form>

        {errorFiltro && (
          <div role="alert" className="mensaje error">
            {errorFiltro}
          </div>
        )}

        {cargando && <p role="status">Cargando catálogo…</p>}

        {errorCatalogo && (
          <div role="alert" className="mensaje error">
            <p>{errorCatalogo}</p>
            <button type="button" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !errorCatalogo && !errorFiltro && recursos.length === 0 && (
          <p className="vacio">
            {filtrosActivos
              ? 'Sin resultados: no hay recursos disponibles con esos filtros. Prueba otras fechas o categoría.'
              : 'Aún no hay recursos publicados. Publica el primero con el formulario.'}
          </p>
        )}

        {!cargando && !errorCatalogo && !errorFiltro && recursos.length > 0 && (
          <ul className="catalogo">
            {recursos.map((r) => (
              <li key={r.id}>
                <div className="fila">
                  <span className="nombre">{r.nombre}</span>
                  <span className="categoria">{etiquetaCategoria(r.categoria)}</span>
                  <span className={`estado ${r.estado}`}>{r.estado === 'disponible' ? 'Disponible' : 'Averiado'}</span>
                  {puedeSolicitar && (
                    <>
                      <button
                        type="button"
                        className="secundario"
                        disabled={r.estado !== 'disponible'}
                        aria-expanded={recursoElegido === r.id}
                        aria-label={`Solicitar ${r.nombre}`}
                        onClick={() => abrirSolicitud(r.id)}
                      >
                        Solicitar
                      </button>
                      <button
                        type="button"
                        className="secundario"
                        disabled={r.estado !== 'disponible'}
                        aria-expanded={recursoEspera === r.id}
                        aria-label={`Lista de espera de ${r.nombre}`}
                        onClick={() => abrirEspera(r.id)}
                      >
                        Lista de espera
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    className="secundario"
                    disabled={r.estado !== 'disponible'}
                    aria-expanded={recursoAveria === r.id}
                    aria-label={`Reportar avería de ${r.nombre}`}
                    onClick={() => abrirAveria(r.id)}
                  >
                    Reportar avería
                  </button>
                </div>

                {recursoAveria === r.id && (
                  <form onSubmit={enviarAveria} noValidate className="averia">
                    <div className="campo">
                      <label htmlFor={`averia-${r.id}`}>Describe el daño</label>
                      <textarea
                        id={`averia-${r.id}`}
                        value={descripcionAveria}
                        onChange={(e) => setDescripcionAveria(e.target.value)}
                        aria-invalid={erroresAveria.length > 0 && !descripcionAveria.trim()}
                        placeholder="Explica qué está fallando"
                        rows={3}
                      />
                    </div>
                    <div className="acciones">
                      <button type="submit" disabled={enviandoAveria}>
                        {enviandoAveria ? 'Enviando…' : 'Enviar avería'}
                      </button>
                      <button type="button" className="secundario" onClick={cancelarAveria}>
                        Cancelar
                      </button>
                    </div>
                    {erroresAveria.length > 0 && (
                      <div role="alert" className="mensaje error">
                        <strong>No se pudo reportar la avería:</strong>
                        <ul>
                          {erroresAveria.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </form>
                )}

                {recursoElegido === r.id && (
                  <form onSubmit={solicitar} noValidate className="solicitud">
                    <div className="campo">
                      <label htmlFor={`inicio-${r.id}`}>Inicio</label>
                      <input
                        id={`inicio-${r.id}`}
                        type="date"
                        value={inicioSolicitud}
                        onChange={(e) => setInicioSolicitud(e.target.value)}
                        aria-invalid={erroresSolicitud.length > 0 && !inicioSolicitud}
                      />
                    </div>
                    <div className="campo">
                      <label htmlFor={`fin-${r.id}`}>Fin</label>
                      <input
                        id={`fin-${r.id}`}
                        type="date"
                        value={finSolicitud}
                        onChange={(e) => setFinSolicitud(e.target.value)}
                        aria-invalid={erroresSolicitud.length > 0 && !finSolicitud}
                      />
                    </div>
                    <div className="acciones">
                      <button type="submit" disabled={enviandoSolicitud}>
                        {enviandoSolicitud ? 'Enviando…' : 'Enviar solicitud'}
                      </button>
                      <button type="button" className="secundario" onClick={cancelarSolicitud}>
                        Cancelar
                      </button>
                    </div>
                    {erroresSolicitud.length > 0 && (
                      <div role="alert" className="mensaje error">
                        <strong>No se pudo enviar la solicitud:</strong>
                        <ul>
                          {erroresSolicitud.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </form>
                )}

                {recursoEspera === r.id && (
                  <form onSubmit={enviarEspera} noValidate className="espera">
                    <div className="campo">
                      <label htmlFor={`inicio-espera-${r.id}`}>Inicio</label>
                      <input
                        id={`inicio-espera-${r.id}`}
                        type="date"
                        value={inicioEspera}
                        onChange={(e) => setInicioEspera(e.target.value)}
                        aria-invalid={erroresEspera.length > 0 && !inicioEspera}
                      />
                    </div>
                    <div className="campo">
                      <label htmlFor={`fin-espera-${r.id}`}>Fin</label>
                      <input
                        id={`fin-espera-${r.id}`}
                        type="date"
                        value={finEspera}
                        onChange={(e) => setFinEspera(e.target.value)}
                        aria-invalid={erroresEspera.length > 0 && !finEspera}
                      />
                    </div>
                    <div className="acciones">
                      <button type="submit" disabled={enviandoEspera}>
                        {enviandoEspera ? 'Anotando…' : 'Anotarme en espera'}
                      </button>
                      <button type="button" className="secundario" onClick={cancelarFormularioEspera}>
                        Cancelar
                      </button>
                    </div>
                    {erroresEspera.length > 0 && (
                      <div role="alert" className="mensaje error">
                        <strong>No se pudo anotar en la lista de espera:</strong>
                        <ul>
                          {erroresEspera.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <div role="status" aria-live="polite">
          {confirmacionSolicitud && <p className="mensaje ok">{confirmacionSolicitud}</p>}
        </div>
        <div role="status" aria-live="polite">
          {confirmacionAveria && <p className="mensaje ok">{confirmacionAveria}</p>}
        </div>
        <div role="status" aria-live="polite">
          {confirmacionEspera && <p className="mensaje ok">{confirmacionEspera}</p>}
        </div>
      </section>

      {puedeDecidir && (
        <section aria-labelledby="titulo-decidir">
          <h2 id="titulo-decidir">Solicitudes por decidir</h2>
          {pendientes.length === 0 ? (
            <p className="vacio">No hay solicitudes pendientes por decidir.</p>
          ) : (
            <ul className="catalogo">
              {pendientes.map((s) => {
                const detalle = `${s.recursoNombre} del ${formatoFecha(s.rango.inicio)} al ${formatoFecha(s.rango.fin)}`
                return (
                  <li key={s.id}>
                    <div className="fila fila-decision">
                      <span className="nombre">{s.recursoNombre}</span>
                      <span className="categoria">
                        {formatoFecha(s.rango.inicio)} – {formatoFecha(s.rango.fin)} · Solicitante n.º {s.solicitanteId}
                      </span>
                      <span className="botones">
                        <button
                          type="button"
                          disabled={decidiendo !== null || devolviendo !== null}
                          aria-label={`Aprobar solicitud de ${detalle}`}
                          onClick={() => void decidir(s, 'aprobar')}
                        >
                          Aprobar
                        </button>
                        <button
                          type="button"
                          className="secundario"
                          disabled={decidiendo !== null || devolviendo !== null}
                          aria-label={`Rechazar solicitud de ${detalle}`}
                          onClick={() => void decidir(s, 'rechazar')}
                        >
                          Rechazar
                        </button>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {erroresDecision.length > 0 && (
            <div role="alert" className="mensaje error">
              <strong>No se pudo registrar la decisión:</strong>
              <ul>
                {erroresDecision.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          <div role="status" aria-live="polite">
            {mensajeDecision && <p className="mensaje ok">{mensajeDecision}</p>}
          </div>
        </section>
      )}

      {puedeDevolver && (
        <section aria-labelledby="titulo-devoluciones">
          <h2 id="titulo-devoluciones">Préstamos confirmados</h2>
          {cargandoConfirmadas && <p role="status">Cargando préstamos…</p>}
          {errorConfirmadas && (
            <div role="alert" className="mensaje error">
              <p>No se pudieron cargar los préstamos confirmados.</p>
              <button
                type="button"
                disabled={cargandoConfirmadas}
                onClick={() => {
                  setCargandoConfirmadas(true)
                  void cargarConfirmadas()
                }}
              >
                Reintentar
              </button>
            </div>
          )}
          {!cargandoConfirmadas && !errorConfirmadas && confirmadas.length === 0 && (
            <p className="vacio">No hay préstamos pendientes de devolución.</p>
          )}
          {confirmadas.length > 0 && (
            <ul className="catalogo">
              {confirmadas.map((s) => (
                <li key={s.id}>
                  <div className="fila fila-decision">
                    <span className="nombre">{s.recursoNombre}</span>
                    <span className="categoria">
                      {formatoFecha(s.rango.inicio)} – {formatoFecha(s.rango.fin)} · Solicitante n.º {s.solicitanteId}
                    </span>
                    <span className="botones">
                      <button
                        type="button"
                        disabled={devolviendo !== null || decidiendo !== null || cargandoConfirmadas || errorConfirmadas}
                        aria-label={`Registrar devolución de ${s.recursoNombre}, préstamo n.º ${s.id}`}
                        onClick={() => void devolver(s)}
                      >
                        {devolviendo === s.id ? 'Registrando…' : 'Registrar devolución'}
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {erroresDevolucion.length > 0 && (
            <ul role="alert" className="mensaje error">
              {erroresDevolucion.map((m) => <li key={m}>{m}</li>)}
            </ul>
          )}
          <div role="status">
            {mensajeDevolucion && <p className="mensaje ok">{mensajeDevolucion}</p>}
          </div>
        </section>
      )}

      {puedeGestionarOrdenes && (
        <section aria-labelledby="titulo-mantenimiento">
          <h2 id="titulo-mantenimiento">Mantenimiento de recursos</h2>
          {mensajeMantenimiento && <p role="status">{mensajeMantenimiento}</p>}
          {errorMantenimiento && <p role="alert">{errorMantenimiento}</p>}
          <button type="button" disabled={cargandoMantenimiento || gestionandoRecurso !== null}
            onClick={() => void cargarMantenimiento()}>
            Actualizar recursos
          </button>
          {cargandoMantenimiento ? <p role="status">Cargando recursos…</p> : (
            <ul className="catalogo">
              {recursosMantenimiento.map((r) => (
                <li key={r.id}>
                  <strong>{r.nombre} (n.º {r.id})</strong>
                  <span className={`estado ${r.estado}`}>{ESTADO_MANTENIMIENTO[r.estado]}</span>
                  <button type="button" disabled={gestionandoRecurso !== null}
                    onClick={() => void gestionarMantenimiento(r)}>
                    {r.estado === 'retirado' ? 'Reincorporar' : 'Retirar por mantenimiento'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {puedeGestionarOrdenes && (
        <section aria-labelledby="titulo-ordenes">
          <h2 id="titulo-ordenes">Órdenes de reparación</h2>
          {cargandoOrdenes && <p role="status">Cargando órdenes…</p>}
          {errorOrdenes && (
            <div role="alert" className="mensaje error">
              <p>No se pudieron cargar las órdenes de reparación.</p>
              <button
                type="button"
                disabled={cargandoOrdenes}
                onClick={() => {
                  setCargandoOrdenes(true)
                  void cargarOrdenes()
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {!cargandoOrdenes && !errorOrdenes && (
            <>
              <h3 id="titulo-averias-sin-orden">Averías por atender</h3>
              {averiasSinOrden.length === 0 ? (
                <p className="vacio">No hay averías sin orden de reparación.</p>
              ) : (
                <ul className="catalogo" aria-labelledby="titulo-averias-sin-orden">
                  {averiasSinOrden.map((a) => (
                    <li key={a.id}>
                      <div className="fila fila-orden">
                        <span className="nombre">
                          {a.recursoNombre}
                          <small className="detalle">
                            {a.descripcion} · Reportada el {formatoFechaHora(a.reportadaEn)}
                          </small>
                        </span>
                        <span className="botones">
                          <button
                            type="button"
                            disabled={trabajandoOrden}
                            aria-label={`Abrir orden de reparación de ${a.recursoNombre}, avería n.º ${a.id}`}
                            onClick={() => void abrirOrdenDe(a)}
                          >
                            Abrir orden
                          </button>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h3 id="titulo-ordenes-lista">Órdenes</h3>
              {ordenes.length === 0 ? (
                <p className="vacio">Todavía no hay órdenes de reparación.</p>
              ) : (
                <ul className="catalogo" aria-labelledby="titulo-ordenes-lista">
                  {ordenes.map((o) => {
                    const siguiente = SIGUIENTE_ORDEN[o.estado]
                    return (
                      <li key={o.id}>
                        <div className="fila fila-orden">
                          <span className="nombre">
                            {o.recursoNombre}
                            <small className="detalle">
                              Orden n.º {o.id} · {o.descripcion}
                            </small>
                          </span>
                          <span className={`estado ${o.estado}`}>{ETIQUETA_ORDEN[o.estado]}</span>
                          <span className="botones">
                            {siguiente && (
                              <button
                                type="button"
                                disabled={trabajandoOrden}
                                aria-label={`${siguiente.boton}: orden n.º ${o.id} de ${o.recursoNombre}`}
                                onClick={() => void avanzarEstadoOrden(o, siguiente.estado)}
                              >
                                {siguiente.boton}
                              </button>
                            )}
                            <button
                              type="button"
                              className="secundario"
                              aria-expanded={historialAbierto === o.id}
                              aria-label={`${historialAbierto === o.id ? 'Ocultar' : 'Ver'} historial de la orden n.º ${o.id}`}
                              onClick={() => void alternarHistorial(o)}
                            >
                              {historialAbierto === o.id ? 'Ocultar historial' : 'Historial'}
                            </button>
                          </span>
                        </div>
                        {historialAbierto === o.id && (
                          <div className="historial">
                            {errorHistorial ? (
                              <p role="alert" className="mensaje error">
                                {errorHistorial}
                              </p>
                            ) : historial.length === 0 ? (
                              <p role="status">Cargando historial…</p>
                            ) : (
                              <ol>
                                {historial.map((c) => (
                                  <li key={c.id}>
                                    {c.estadoAnterior === null
                                      ? `Orden abierta (${ETIQUETA_ORDEN[c.estadoNuevo]})`
                                      : `${ETIQUETA_ORDEN[c.estadoAnterior]} → ${ETIQUETA_ORDEN[c.estadoNuevo]}`}{' '}
                                    · {c.cambiadoPorNombre} · {formatoFechaHora(c.cambiadoEn)}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </>
          )}

          {erroresOrden.length > 0 && (
            <div role="alert" className="mensaje error">
              <strong>No se pudo completar la acción:</strong>
              <ul>
                {erroresOrden.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <div role="status" aria-live="polite">
            {mensajeOrden && <p className="mensaje ok">{mensajeOrden}</p>}
          </div>
        </section>
      )}

      {puedeSolicitar && (
        <section aria-labelledby="titulo-solicitudes">
          <h2 id="titulo-solicitudes">Mis solicitudes</h2>
          {solicitudes.length === 0 ? (
            <p className="vacio">Aún no has solicitado ningún recurso. Usa «Solicitar» en el catálogo.</p>
          ) : (
            <ul className="catalogo">
              {solicitudes.map((s) => (
                <li key={s.id}>
                  <div className="fila fila-solicitud">
                    <span className="nombre">{s.recursoNombre}</span>
                    <span className="categoria">
                      {formatoFecha(s.rango.inicio)} – {formatoFecha(s.rango.fin)}
                    </span>
                    {s.fechaDevolucionReal && (
                      <span className="categoria">Devuelto el {formatoFecha(s.fechaDevolucionReal)}</span>
                    )}
                    <span className={`estado ${s.estado}`}>{s.estado === 'en_espera_mantenimiento' ? 'En espera por mantenimiento' : s.estado.replaceAll('_', ' ')}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {puedeSolicitar && (
        <section aria-labelledby="titulo-espera">
          <h2 id="titulo-espera">Mi lista de espera</h2>
          {listaEspera.length === 0 ? (
            <p className="vacio">No estás en la lista de espera de ningún recurso.</p>
          ) : (
            <ul className="catalogo">
              {listaEspera.map((e) => (
                <li key={e.id}>
                  <div className="fila fila-solicitud">
                    <span className="nombre">{e.recursoNombre}</span>
                    <span className="categoria">
                      {formatoFecha(e.rango.inicio)} – {formatoFecha(e.rango.fin)}
                    </span>
                    <span className={`estado ${e.estado}`}>
                      {e.estado === 'en_espera' ? 'En espera' : e.estado === 'promovida' ? 'Promovida a pendiente' : 'Cancelada'}
                    </span>
                    {e.estado === 'en_espera' && (
                      <button
                        type="button"
                        className="secundario"
                        disabled={cancelandoEspera === e.id}
                        aria-label={`Cancelar espera de ${e.recursoNombre}`}
                        onClick={() => void cancelarLugarEspera(e.id)}
                      >
                        {cancelandoEspera === e.id ? 'Cancelando…' : 'Cancelar espera'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}