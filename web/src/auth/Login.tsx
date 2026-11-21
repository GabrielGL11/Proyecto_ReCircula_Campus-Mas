import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import './Login.css';

// RNF-01: etiquetas visibles, manejo completo por teclado (Enter envía), contraste alto.
// RNF-02: el error es comprensible y NO borra lo que la persona escribió.
export default function Login() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
    setError('');
    if (!correo.trim() || !clave) {
      setError('Escribe tu correo y tu contraseña.');
      return;
    }
    setEnviando(true);
    const { error: fallo } = await supabase.auth.signInWithPassword({
      email: correo.trim(),
      password: clave,
    });
    setEnviando(false);
    if (fallo) setError('Correo o contraseña incorrectos.');
  }

  return (
    <main className="login">
      <h1>ReCircula Campus</h1>
      <form onSubmit={entrar} noValidate aria-describedby={error ? 'error-login' : undefined}>
        <h2>Iniciar sesión</h2>

        <label htmlFor="login-correo">Correo electrónico</label>
        <input
          id="login-correo"
          type="email"
          autoComplete="username"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          aria-invalid={error ? true : undefined}
        />

        <label htmlFor="login-clave">Contraseña</label>
        <input
          id="login-clave"
          type="password"
          autoComplete="current-password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          aria-invalid={error ? true : undefined}
        />

        {error && (
          <p id="error-login" role="alert" className="login-error">
            {error}
          </p>
        )}

        <button type="submit" disabled={enviando}>
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
