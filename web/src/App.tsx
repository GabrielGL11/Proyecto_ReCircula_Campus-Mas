import { useEffect, useState, type FormEvent } from 'react'
import './App.css'
import { CATEGORIAS, listarRecursos, publicarRecurso, type Recurso } from './api.ts'

const etiquetaCategoria = (valor: string) =>
  CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor

export default function App() {
  const [recursos, setRecursos] = useState<Recurso[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCatalogo, setErrorCatalogo] = useState<string | null>(null)

  const [nombre, setNombre] = useState('')
  const [categoria, setCategoria] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [errores, setErrores] = useState<string[]>([])
  const [confirmacion, setConfirmacion] = useState<string | null>(null)

  async function cargar() {
    setCargando(true)
    setErrorCatalogo(null)
    try {
      setRecursos(await listarRecursos())
    } catch {
      setErrorCatalogo('No se pudo cargar el catálogo. Revisa que la API esté encendida.')
    } finally {
      setCargando(false)
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
      // Criterio (a): se guarda y aparece "disponible".
      const nuevo = await publicarRecurso({ nombre, categoria, propietarioId: 1 })
      setConfirmacion(`«${nuevo.nombre}» se publicó y ya aparece como disponible.`)
      setNombre('')
      setCategoria('')
      await cargar()
    } catch (err) {
      // Criterio (b) + RNF-02: muestra el error y conserva lo escrito.
      setErrores(Array.isArray(err) ? (err as string[]) : ['No se pudo publicar el recurso.'])
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pagina">
      <header>
        <h1>ReCircula Campus</h1>
        <p>Publica los recursos tecnológicos que puedes compartir.</p>
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

        {cargando && <p role="status">Cargando catálogo…</p>}

        {errorCatalogo && (
          <div role="alert" className="mensaje error">
            <p>{errorCatalogo}</p>
            <button type="button" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        )}

        {!cargando && !errorCatalogo && recursos.length === 0 && (
          <p className="vacio">Aún no hay recursos publicados. Publica el primero con el formulario.</p>
        )}

        {!cargando && !errorCatalogo && recursos.length > 0 && (
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
