export default function LoginPage() {
  return (
    <main className="container auth-container">
      <section className="card auth-card">
        <h1 className="page-title">
          PSC Web <span className="version-badge">Next</span>
        </h1>
        <p className="subtitle">Entre com sua conta Bitrix para acessar os indicadores.</p>
        <a className="button-link" href="/api/auth/bitrix/start">
          Entrar com Bitrix
        </a>
      </section>
    </main>
  );
}
