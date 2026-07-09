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
  // Funcionário não pode cadastrar produtos
  document.getElementById('btn-novo-produto').style.display = 'none';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ===== ELEMENTOS =====
const listaProdutos = document.getElementById('lista-produtos');
const campoBusca = document.getElementById('busca-produto');
const modalProduto = document.getElementById('modal-produto');
const formProduto = document.getElementById('form-produto');
const modalTitulo = document.getElementById('modal-titulo');
const modalMensagemErro = document.getElementById('modal-mensagem-erro');
const selectCategoria = document.getElementById('produto-categoria'); const campoEmbalagemNome = document.getElementById('produto-embalagem-nome'); const campoUnidadesEmbalagem = document.getElementById('produto-unidades-embalagem'); const campoPrecoCompraEmbalagem = document.getElementById('produto-preco-compra-embalagem'); const campoUnidadeVenda = document.getElementById('produto-unidade-venda'); const dicaCustoUnitario = document.getElementById('dica-custo-unitario'); 

// ===== CALCULA E MOSTRA O CUSTO POR UNIDADE EM TEMPO REAL (apenas visual) =====
function atualizarDicaCustoUnitario() {   const custoEmbalagem = parseFloat(campoPrecoCompraEmbalagem.value) || 0;   const unidades = parseInt(campoUnidadesEmbalagem.value) || 1;   const custoUnitario = unidades > 0 ? custoEmbalagem / unidades : 0;   dicaCustoUnitario.textContent = 'Custo por unidade: ' + custoUnitario.toFixed(2) + ' MT'; }  campoPrecoCompraEmbalagem.addEventListener('input', atualizarDicaCustoUnitario); campoUnidadesEmbalagem.addEventListener('input', atualizarDicaCustoUnitario);

let produtosCache = []; // guarda os produtos carregados, para filtrar sem nova consulta

// ===== CARREGAR CATEGORIAS NO SELECT =====
async function carregarCategorias() {
  const { data, error } = await supabaseClient
    .from('categorias')
    .select('*')
    .order('nome');

  if (error) {
    console.log('Erro ao carregar categorias:', error);
    return;
  }

  data.forEach((categoria) => {
    const option = document.createElement('option');
    option.value = categoria.id;
    option.textContent = categoria.nome;
    selectCategoria.appendChild(option);
  });
}

// ===== CARREGAR PRODUTOS =====
async function carregarProdutos() {
  listaProdutos.innerHTML = '<p class="lista-vazia">Carregando produtos...</p>';

  const { data, error } = await supabaseClient
    .from('produtos')
    .select('*, categorias(nome)')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    listaProdutos.innerHTML = '<p class="lista-vazia">Erro ao carregar produtos.</p>';
    console.log('Erro:', error);
    return;
  }

  produtosCache = data;
  renderizarProdutos(produtosCache);
}

// ===== RENDERIZAR LISTA (usada tanto na carga quanto na busca) =====
function renderizarProdutos(lista) {
  if (lista.length === 0) {
    listaProdutos.innerHTML = '<p class="lista-vazia">Nenhum produto encontrado.</p>';
    return;
  }

  listaProdutos.innerHTML = '';

  lista.forEach((produto) => {
    const estoqueBaixo = produto.quantidade <= produto.estoque_minimo;
    const nomeCategoria = produto.categorias ? produto.categorias.nome : 'Sem categoria';

    const div = document.createElement('div');
    div.className = 'produto-item';
    div.innerHTML = `
      <div class="produto-info">
        <div class="produto-nome">${produto.nome}</div>
        <div class="produto-detalhes">
          Cód: ${produto.codigo} • ${nomeCategoria} •
          <span class="${estoqueBaixo ? 'produto-estoque-baixo' : ''}">
            Estoque: ${produto.quantidade}
          </span>
        </div>
      </div>
      <div class="produto-preco">${Number(produto.preco_venda).toFixed(2)} MT</div>
      ${ehAdmin ? `
        <div class="produto-acoes">
          <button class="btn-icone editar" data-id="${produto.id}">✏️</button>
          <button class="btn-icone excluir" data-id="${produto.id}">🗑️</button>
        </div>
      ` : ''}
    `;
    listaProdutos.appendChild(div);
  });

  // Liga os botões de editar/excluir (só existem se for admin)
  if (ehAdmin) {
    document.querySelectorAll('.btn-icone.editar').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalEdicao(btn.dataset.id));
    });
    document.querySelectorAll('.btn-icone.excluir').forEach((btn) => {
      btn.addEventListener('click', () => excluirProduto(btn.dataset.id));
    });
  }
}

// ===== BUSCA (filtra o cache, sem nova consulta ao banco) =====
campoBusca.addEventListener('input', () => {
  const termo = campoBusca.value.toLowerCase().trim();

  const filtrados = produtosCache.filter((p) =>
    p.nome.toLowerCase().includes(termo) ||
    p.codigo.toLowerCase().includes(termo) ||
    (p.codigo_barras && p.codigo_barras.toLowerCase().includes(termo))
  );

  renderizarProdutos(filtrados);
});

// ===== ABRIR MODAL: NOVO PRODUTO =====
document.getElementById('btn-novo-produto').addEventListener('click', () => {
  formProduto.reset();
  document.getElementById('produto-id').value = '';
  campoUnidadesEmbalagem.value = 1;
  campoUnidadeVenda.value = 'unidade';
  atualizarDicaCustoUnitario();
  modalTitulo.textContent = 'Novo Produto';
  modalMensagemErro.textContent = '';
  modalProduto.classList.remove('escondido');
});

// ===== ABRIR MODAL: EDITAR PRODUTO =====
function abrirModalEdicao(id) {
  const produto = produtosCache.find((p) => p.id === id);
  if (!produto) return;

  document.getElementById('produto-id').value = produto.id;
  document.getElementById('produto-codigo').value = produto.codigo;
  document.getElementById('produto-codigo-barras').value = produto.codigo_barras || '';
  document.getElementById('produto-nome').value = produto.nome;
  document.getElementById('produto-categoria').value = produto.categoria_id || '';
  campoEmbalagemNome.value = produto.embalagem_nome || '';
  campoUnidadesEmbalagem.value = produto.unidades_por_embalagem || 1;
  campoPrecoCompraEmbalagem.value = produto.preco_compra_embalagem || produto.preco_compra || '';
  campoUnidadeVenda.value = produto.unidade_venda || 'unidade';
  document.getElementById('produto-preco-venda').value = produto.preco_venda;
  document.getElementById('produto-quantidade').value = produto.quantidade;
  document.getElementById('produto-estoque-minimo').value = produto.estoque_minimo;
  document.getElementById('produto-fornecedor').value = produto.fornecedor || '';

  atualizarDicaCustoUnitario();
  modalTitulo.textContent = 'Editar Produto';
  modalMensagemErro.textContent = '';
  modalProduto.classList.remove('escondido');
}

// ===== FECHAR MODAL =====
document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalProduto.classList.add('escondido');
});

// ===== SALVAR (criar ou editar) =====
formProduto.addEventListener('submit', async (event) => {
  event.preventDefault();
  modalMensagemErro.textContent = '';

  const id = document.getElementById('produto-id').value;

  const dadosProduto = {
    codigo: document.getElementById('produto-codigo').value.trim(),
    codigo_barras: document.getElementById('produto-codigo-barras').value.trim() || null,
    nome: document.getElementById('produto-nome').value.trim(),
    categoria_id: document.getElementById('produto-categoria').value || null,
    embalagem_nome: campoEmbalagemNome.value.trim() || null,
    unidades_por_embalagem: parseInt(campoUnidadesEmbalagem.value) || 1,
    preco_compra_embalagem: parseFloat(campoPrecoCompraEmbalagem.value) || 0,
    unidade_venda: campoUnidadeVenda.value.trim() || 'unidade',
    preco_venda: parseFloat(document.getElementById('produto-preco-venda').value),
    quantidade: parseInt(document.getElementById('produto-quantidade').value) || 0,
    estoque_minimo: parseInt(document.getElementById('produto-estoque-minimo').value) || 0,
    fornecedor: document.getElementById('produto-fornecedor').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };

  let resultado;

  if (id) {
    // Edição
    resultado = await supabaseClient
      .from('produtos')
      .update(dadosProduto)
      .eq('id', id);
  } else {
    // Novo cadastro
    resultado = await supabaseClient
      .from('produtos')
      .insert(dadosProduto);
  }

  if (resultado.error) {
    modalMensagemErro.textContent = 'Erro: ' + resultado.error.message;
    return;
  }

  modalProduto.classList.add('escondido');
  carregarProdutos();
});

// ===== EXCLUIR (soft delete: marca como inativo) =====
async function excluirProduto(id) {
  const confirmar = confirm('Deseja realmente excluir este produto?');
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('produtos')
    .update({ ativo: false })
    .eq('id', id);

  if (error) {
    alert('Erro ao excluir: ' + error.message);
    return;
  }

  carregarProdutos();
}

// ===== INICIALIZAÇÃO =====
carregarCategorias();
carregarProdutos();