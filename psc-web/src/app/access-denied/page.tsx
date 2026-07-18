export default function AccessDeniedPage() {
  return (
    <main className="container auth-container">
      <section className="card auth-card">
        <h1>Acesso não habilitado</h1>
        <p className="subtitle">
          Sua identidade Bitrix foi reconhecida, mas ainda não existe uma conta PSC ativa vinculada a ela.
        </p>
        <a className="button-link secondary-link" href="/login">
          Voltar ao login
        </a>
      </section>
    </main>
  );
}
