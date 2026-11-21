import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import './solicitudes.css'
import {
  CATEGORIAS,
  crearSolicitud,
  listarRecursos,
  listarSolicitudes,
  publicarRecurso,
  type Filtros,
  type Recurso,
  type Solicitud,
} from './api.ts'

// Mientras no exista el inicio de sesión (JWT), la persona que solicita es fija.
const SOLICITANTE_ID = 2

const formatoFecha = (iso: string) => iso.split('-').reverse().join('/')

const etiquetaCategoria = (valor: string) =>
  CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor

export default function App() {
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

  // Solicitud de préstamo (HU-03)
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [recursoElegido, setRecursoElegido] = useState<number | null>(null)
  const [inicioSolicitud, setInicioSolicitud] = useState('')
  const [finSolicitud, setFinSolicitud] = useState('')
  const [erroresSolicitud, setErroresSolicitud] = useState<string[]>([])
  const [confirmacionSolicitud, setConfirmacionSolicitud] = useState<string | null>(null)
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)

  async function cargarSolicitudes() {
    try {
      setSolicitudes(await listarSolicitudes(SOLICITANTE_ID))
    } catch {
      setSolicitudes([])
    }
  }

  function abrirSolicitud(id: number) {
    setRecursoElegido(id)
    setInicioSolicitud(desde)
    setFinSolicitud(hasta)
    setErroresSolicitud([])
    setConfirmacionSolicitud(null)
  }

  function cancelarSolicitud() {
    setRecursoElegido(null)
    setErroresSolicitud([])
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
        solicitanteId: SOLICITANTE_ID,
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
    setCargando(true)
    setErrorCatalogo(null)
    try {
      setRecursos(await listarRecursos(filtros))
    } catch {
      setErrorCatalogo('No se pudo cargar el catálogo. Revisa que la API esté encendida.')
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    void cargar()
    void cargarSolicitudes()
  }, [])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErrores([])
    setConfirmacion(null)
    try {
      const nuevo = await publicarRecurso({ nombre, categoria, propietarioId: 1 })
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
      </header>

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
                </div>

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
      </section>

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
                  <span className={`estado ${s.estado}`}>{s.estado}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
