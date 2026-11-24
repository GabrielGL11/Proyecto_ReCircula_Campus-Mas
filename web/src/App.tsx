import { useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'
import './solicitudes.css'
import {
  CATEGORIAS,
  aprobarSolicitud,
  crearSolicitud,
  listarConfirmadas,
  listarPendientes,
  listarRecursos,
  listarSolicitudes,
  obtenerUsuario,
  publicarRecurso,
  rechazarSolicitud,
  registrarDevolucion,
  reportarAveria,
  type Filtros,
  type Recurso,
  type Solicitud,
  type Usuario,
} from './api.ts'
import { useSesion } from './auth/sesion.ts'

const formatoFecha = (iso: string) => iso.split('-').reverse().join('/')

const etiquetaCategoria = (valor: string) =>
  CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor

export default function App() {
  const { session, cerrarSesion } = useSesion()

  // Qué ve cada rol (la regla de verdad está en la API y la base; esto solo evita mostrar lo que no le toca).
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const puedePublicar = usuario?.rol === 'propietario' || usuario?.rol === 'coordinador' // HU-01
  const puedeSolicitar = usuario?.rol === 'solicitante' // HU-03
  const puedeDecidir = usuario?.rol === 'propietario' || usuario?.rol === 'coordinador' // HU-04
  const puedeDevolver = usuario?.rol === 'coordinador'
  const [recursos, setRecursos] = useState<Recurso[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

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
    if (puedeSolicitar) void cargarSolicitudes()
  }, [puedeSolicitar])

  useEffect(() => {
    if (puedeDecidir) void cargarPendientes()
  }, [puedeDecidir])

  useEffect(() => {
    if (puedeDevolver) void cargarConfirmadas()
  }, [puedeDevolver])

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
                    <span className={`estado ${s.estado}`}>{s.estado.replaceAll('_', ' ')}</span>
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