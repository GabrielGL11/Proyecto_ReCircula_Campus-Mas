import { useEffect, useRef, useState, type FormEvent } from 'react'
import './App.css'
import { CATEGORIAS, listarRecursos, publicarRecurso, type Filtros, type Recurso } from './api.ts'

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

  // Número de la última petición enviada. Si llega una respuesta de una petición
  // anterior (porque el usuario pulsó Buscar dos veces seguidas), se ignora.
  const ultimaPeticion = useRef(0)

  async function cargar(filtros: Filtros = {}) {
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
  }, [])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setErrores([])
    setConfirmacion(null)
    try {
      // TODO(JWT): el propietario saldrá del token; por ahora se fija en 1.
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
                <span className="nombre">{r.nombre}</span>
                <span className="categoria">{etiquetaCategoria(r.categoria)}</span>
                <span className={`estado ${r.estado}`}>{r.estado === 'disponible' ? 'Disponible' : 'Averiado'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
