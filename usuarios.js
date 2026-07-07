// ===== PROTEÇÃO DE PÁGINA (só administrador acessa) =====
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));

if (!usuarioLogado) {
  window.location.href = 'index.html';
}

if (usuarioLogado.tipo !== 'administrador') {
  // Funcionário nem deveria estar aqui (o link fica escondido, mas protegemos a página também)
  window.location.href = 'dashboard.html';
}

document.getElementById('nome-usuario').textContent = usuarioLogado.nome;
document.getElementById('tipo-usuario').textContent = usuarioLogado.tipo;

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ===== ELEMENTOS =====
const listaUsuarios = document.getElementById('lista-usuarios');
const modalUsuario = document.getElementById('modal-usuario');
const formUsuario = document.getElementById('form-usuario');
const modalMensagemErro = document.getElementById('modal-mensagem-erro');

// ===== CARREGAR USUÁRIOS =====
async function carregarUsuarios() {
  listaUsuarios.innerHTML = '<p class="lista-vazia">Carregando usuários...</p>';

  const { data, error } = await supabaseClient
    .from('usuarios')
    .select('*')
    .order('nome');

  if (error) {
    listaUsuarios.innerHTML = '<p class="lista-vazia">Erro ao carregar usuários.</p>';
    console.log('Erro:', error);
    return;
  }

  if (data.length === 0) {
    listaUsuarios.innerHTML = '<p class="lista-vazia">Nenhum usuário encontrado.</p>';
    return;
  }

  listaUsuarios.innerHTML = '';

  data.forEach((usuario) => {
    const ehEuMesmo = usuario.auth_id === usuarioLogado.auth_id;

    const div = document.createElement('div');
    div.className = 'usuario-item';
    div.innerHTML = `
      <div class="usuario-info">
        <div class="usuario-nome">
          ${usuario.nome} ${ehEuMesmo ? '(você)' : ''}
          <span class="badge ${!usuario.ativo ? 'badge-inativo' : ''}" style="margin-left:6px;">
            ${usuario.tipo}
          </span>
        </div>
        <div class="usuario-detalhes">${usuario.email} • ${usuario.ativo ? 'Ativo' : 'Inativo'}</div>
      </div>
      ${!ehEuMesmo ? `
        <div class="usuario-acoes">
          <select class="select-tipo-usuario" data-id="${usuario.id}">
            <option value="funcionario" ${usuario.tipo === 'funcionario' ? 'selected' : ''}>Funcionário</option>
            <option value="administrador" ${usuario.tipo === 'administrador' ? 'selected' : ''}>Administrador</option>
          </select>
          <button class="btn-icone ${usuario.ativo ? 'excluir' : ''}" data-id="${usuario.id}" data-ativo="${usuario.ativo}">
            ${usuario.ativo ? 'Inativar' : 'Reativar'}
          </button>
        </div>
      ` : '<span class="mov-detalhes">Não é possível alterar seu próprio usuário aqui</span>'}
    `;
    listaUsuarios.appendChild(div);
  });

  // Alterar tipo
  document.querySelectorAll('.select-tipo-usuario').forEach((select) => {
    select.addEventListener('change', async (event) => {
      const { error } = await supabaseClient
        .from('usuarios')
        .update({ tipo: event.target.value })
        .eq('id', event.target.dataset.id);

      if (error) {
        alert('Erro ao alterar tipo: ' + error.message);
        carregarUsuarios();
        return;
      }
      carregarUsuarios();
    });
  });

  // Ativar/Inativar
  document.querySelectorAll('.usuario-acoes .btn-icone').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ativoAtual = btn.dataset.ativo === 'true';
      const acao = ativoAtual ? 'inativar' : 'reativar';
      const confirmar = confirm(`Deseja ${acao} este usuário?`);
      if (!confirmar) return;

      const { error } = await supabaseClient
        .from('usuarios')
        .update({ ativo: !ativoAtual })
        .eq('id', btn.dataset.id);

      if (error) {
        alert('Erro: ' + error.message);
        return;
      }
      carregarUsuarios();
    });
  });
}

// ===== ABRIR / FECHAR MODAL =====
document.getElementById('btn-novo-usuario').addEventListener('click', () => {
  formUsuario.reset();
  modalMensagemErro.textContent = '';
  modalUsuario.classList.remove('escondido');
});

document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalUsuario.classList.add('escondido');
});

// ===== CRIAR FUNCIONÁRIO (via Edge Function) =====
formUsuario.addEventListener('submit', async (event) => {
  event.preventDefault();
  modalMensagemErro.textContent = '';

  const nome = document.getElementById('usuario-nome').value.trim();
  const email = document.getElementById('usuario-email').value.trim();
  const senha = document.getElementById('usuario-senha').value;
  const tipo = document.getElementById('usuario-tipo').value;

  const botaoSalvar = formUsuario.querySelector('button[type="submit"]');
  botaoSalvar.disabled = true;
  botaoSalvar.textContent = 'Criando...';

  const { data, error } = await supabaseClient.functions.invoke('criar-usuario', {
    body: { nome, email, senha, tipo }
  });

  botaoSalvar.disabled = false;
  botaoSalvar.textContent = 'Criar';

  // Erros de rede/execução da função chegam em "error"; erros de regra de negócio
  // (que a função retorna com status 400/403) chegam dentro de "data.error"
  if (error || (data && data.error)) {
    modalMensagemErro.textContent = 'Erro: ' + (data?.error || error.message);
    return;
  }

  modalUsuario.classList.add('escondido');
  carregarUsuarios();
});

// ===== INICIALIZAÇÃO =====
carregarUsuarios();