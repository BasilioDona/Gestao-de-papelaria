// ===== LÓGICA DE LOGIN =====

const formLogin = document.getElementById('form-login');
const mensagemErro = document.getElementById('mensagem-erro');
const btnLogin = document.getElementById('btn-login');

formLogin.addEventListener('submit', async (event) => {
  event.preventDefault(); // Impede o recarregamento da página

  const email = document.getElementById('email').value.trim();
  const senha = document.getElementById('senha').value;

  mensagemErro.textContent = '';
  btnLogin.disabled = true;
  btnLogin.textContent = 'Entrando...';

  // 1. Autentica no Supabase Auth (verifica email/senha)
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email: email,
    password: senha
  });

  if (error) {
    mensagemErro.textContent = 'E-mail ou senha inválidos.';
    btnLogin.disabled = false;
    btnLogin.textContent = 'Entrar';
    return;
  }

  // 2. Busca os dados do usuário na nossa tabela "usuarios"
  const { data: usuario, error: erroUsuario } = await supabaseClient
    .from('usuarios')
    .select('*')
    .eq('auth_id', data.user.id)
    .single();

  if (erroUsuario || !usuario) {
    mensagemErro.textContent = 'Usuário não encontrado no sistema.';
    btnLogin.disabled = false;
    btnLogin.textContent = 'Entrar';
    return;
  }

  if (!usuario.ativo) {
    mensagemErro.textContent = 'Usuário inativo. Contate o administrador.';
    await supabaseClient.auth.signOut();
    btnLogin.disabled = false;
    btnLogin.textContent = 'Entrar';
    return;
  }

  // 3. Salva os dados do usuário logado para uso nas outras páginas
  sessionStorage.setItem('usuario', JSON.stringify(usuario));

  // 4. Redireciona para o dashboard
  window.location.href = 'dashboard.html';
});