// ===== PROTEÇÃO DE PÁGINA =====
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));

if (!usuarioLogado) {
  window.location.href = 'index.html';
}

const ehAdmin = usuarioLogado.tipo === 'administrador';

document.getElementById('nome-usuario').textContent = usuarioLogado.nome;
document.getElementById('tipo-usuario').textContent = usuarioLogado.tipo;

if (!ehAdmin) {
  document.getElementById('link-usuarios').style.display = 'none';
  document.getElementById('link-config').style.display = 'none';
  // Funcionário só consulta, não registra movimentação
  document.getElementById('btn-nova-movimentacao').style.display = 'none';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ===== ELEMENTOS =====
const listaMovimentacoes = document.getElementById('lista-movimentacoes');
const campoBusca = document.getElementById('busca-movimentacao');
const modalMovimentacao = document.getElementById('modal-movimentacao');
const formMovimentacao = document.getElementById('form-movimentacao');
const modalMensagemErro = document.getElementById('modal-mensagem-erro');
const selectProduto = document.getElementById('mov-produto');
const selectTipo = document.getElementById('mov-tipo');
const labelQuantidade = document.getElementById('label-mov-quantidade');
const dicaQuantidade = document.getElementById('dica-mov-quantidade');

let movimentacoesCache = [];
let produtosParaSelect = [];

// ===== CARREGAR PRODUTOS PARA O SELECT =====
async function carregarProdutosSelect() {
  const { data, error } = await supabaseClient
    .from('produtos')
    .select('id, nome, codigo, quantidade')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    console.log('Erro ao carregar produtos:', error);
    return;
  }

  produtosParaSelect = data;
  data.forEach((produto) => {
    const option = document.createElement('option');
    option.value = produto.id;
    option.textContent = `${produto.nome} (estoque atual: ${produto.quantidade})`;
    selectProduto.appendChild(option);
  });
}

// ===== AJUSTA LABEL/DICA CONFORME O TIPO ESCOLHIDO =====
selectTipo.addEventListener('change', () => {
  const tipo = selectTipo.value;

  if (tipo === 'entrada') {
    labelQuantidade.textContent = 'Quantidade que entrou *';
    dicaQuantidade.textContent = 'Será somada ao estoque atual.';
  } else if (tipo === 'saida') {
    labelQuantidade.textContent = 'Quantidade que saiu *';
    dicaQuantidade.textContent = 'Será subtraída do estoque atual.';
  } else if (tipo === 'ajuste' || tipo === 'inventario') {
    labelQuantidade.textContent = 'Quantidade final (contada) *';
    dicaQuantidade.textContent = 'Substitui o estoque atual por este valor.';
  } else {
    labelQuantidade.textContent = 'Quantidade *';
    dicaQuantidade.textContent = '';
  }
});

// ===== CARREGAR HISTÓRICO =====
async function carregarMovimentacoes() {
  listaMovimentacoes.innerHTML = '<p class="lista-vazia">Carregando histórico...</p>';

  const { data, error } = await supabaseClient
    .from('movimentacoes_estoque')
    .select('*, produtos(nome), usuarios(nome)')
    .order('criado_em', { ascending: false })
    .limit(100);

  if (error) {
    listaMovimentacoes.innerHTML = '<p class="lista-vazia">Erro ao carregar histórico.</p>';
    console.log('Erro:', error);
    return;
  }

  movimentacoesCache = data;
  renderizarMovimentacoes(movimentacoesCache);
}

// ===== RENDERIZAR HISTÓRICO =====
function renderizarMovimentacoes(lista) {
  if (lista.length === 0) {
    listaMovimentacoes.innerHTML = '<p class="lista-vazia">Nenhuma movimentação registrada.</p>';
    return;
  }

  listaMovimentacoes.innerHTML = '';

  lista.forEach((mov) => {
    const nomeProduto = mov.produtos ? mov.produtos.nome : 'Produto removido';
    const nomeUsuario = mov.usuarios ? mov.usuarios.nome : '-';
    const dataFormatada = new Date(mov.criado_em).toLocaleString('pt-BR');

    const div = document.createElement('div');
    div.className = 'mov-item';
    div.innerHTML = `
      <div class="mov-info">
        <div class="mov-produto">${nomeProduto}</div>
        <div class="mov-detalhes">
          ${mov.quantidade_anterior} → ${mov.quantidade_nova} • ${nomeUsuario} • ${dataFormatada}
          ${mov.motivo ? '• ' + mov.motivo : ''}
        </div>
      </div>
      <span class="mov-tag ${mov.tipo}">${mov.tipo}</span>
    `;
    listaMovimentacoes.appendChild(div);
  });
}

// ===== BUSCA =====
campoBusca.addEventListener('input', () => {
  const termo = campoBusca.value.toLowerCase().trim();

  const filtradas = movimentacoesCache.filter((mov) =>
    mov.produtos && mov.produtos.nome.toLowerCase().includes(termo)
  );

  renderizarMovimentacoes(filtradas);
});

// ===== ABRIR / FECHAR MODAL =====
document.getElementById('btn-nova-movimentacao').addEventListener('click', () => {
  formMovimentacao.reset();
  dicaQuantidade.textContent = '';
  modalMensagemErro.textContent = '';
  modalMovimentacao.classList.remove('escondido');
});

document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalMovimentacao.classList.add('escondido');
});

// ===== REGISTRAR MOVIMENTAÇÃO =====
formMovimentacao.addEventListener('submit', async (event) => {
  event.preventDefault();
  modalMensagemErro.textContent = '';

  const produtoId = selectProduto.value;
  const tipo = selectTipo.value;
  const quantidade = parseInt(document.getElementById('mov-quantidade').value);
  const motivo = document.getElementById('mov-motivo').value.trim() || null;

  // Chama a função do banco (é ela que faz tudo de forma atômica)
  const { error } = await supabaseClient.rpc('registrar_movimentacao_estoque', {
    p_produto_id: produtoId,
    p_tipo: tipo,
    p_quantidade: quantidade,
    p_motivo: motivo
  });

  if (error) {
    modalMensagemErro.textContent = 'Erro: ' + error.message;
    return;
  }

  modalMovimentacao.classList.add('escondido');
  carregarMovimentacoes();
  // Recarrega os produtos no select, pois o estoque mudou
  selectProduto.innerHTML = '<option value="">Selecione...</option>';
  carregarProdutosSelect();
});

// ===== INICIALIZAÇÃO =====
carregarProdutosSelect();
carregarMovimentacoes();