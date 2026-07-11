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
  document.getElementById('btn-novo-produto').style.display = 'none';
} else {
  document.getElementById('btn-importar-produtos').classList.remove('escondido');
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
const selectCategoria = document.getElementById('produto-categoria');

const btnToggleAvancado = document.getElementById('btn-toggle-avancado');
const secaoAvancada = document.getElementById('secao-avancada');

const campoEmbalagemNome = document.getElementById('produto-embalagem-nome');
const campoUnidadesEmbalagem = document.getElementById('produto-unidades-embalagem');
const campoPrecoCompraEmbalagem = document.getElementById('produto-preco-compra-embalagem');
const campoUnidadeVenda = document.getElementById('produto-unidade-venda');
const dicaCustoUnitario = document.getElementById('dica-custo-unitario');
const campoCodigoProduto = document.getElementById('produto-codigo');
const dicaCodigoProduto = document.getElementById('dica-codigo-produto');

let produtosCache = [];

// =========================================================
// SEÇÃO AVANÇADA: recolher/expandir
// =========================================================
btnToggleAvancado.addEventListener('click', () => {
  secaoAvancada.classList.toggle('escondido');
  btnToggleAvancado.textContent = secaoAvancada.classList.contains('escondido')
    ? '⚙️ Mais opções (embalagem, código, estoque mínimo, fornecedor)'
    : '⚙️ Ocultar opções avançadas';
});

// ===== CALCULA E MOSTRA O CUSTO POR UNIDADE EM TEMPO REAL =====
function atualizarDicaCustoUnitario() {
  const custoEmbalagem = parseFloat(campoPrecoCompraEmbalagem.value) || 0;
  const unidades = parseInt(campoUnidadesEmbalagem.value) || 1;
  const custoUnitario = unidades > 0 ? custoEmbalagem / unidades : 0;
  dicaCustoUnitario.textContent = 'Custo por unidade: ' + custoUnitario.toFixed(2) + ' MT';
}

campoPrecoCompraEmbalagem.addEventListener('input', atualizarDicaCustoUnitario);
campoUnidadesEmbalagem.addEventListener('input', atualizarDicaCustoUnitario);

// =========================================================
// CARREGAR CATEGORIAS
// =========================================================
async function carregarCategorias() {
  const { data, error } = await supabaseClient.from('categorias').select('*').order('nome');
  if (error) { console.log('Erro ao carregar categorias:', error); return; }

  selectCategoria.innerHTML = '<option value="">Selecione...</option>';
  data.forEach((categoria) => {
    const option = document.createElement('option');
    option.value = categoria.id;
    option.textContent = categoria.nome;
    selectCategoria.appendChild(option);
  });
}

// =========================================================
// CARREGAR / RENDERIZAR PRODUTOS
// =========================================================
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
        <div class="produto-nome">${escapeHTML(produto.nome)}</div>
        <div class="produto-detalhes">
          Cód: ${escapeHTML(produto.codigo)} • ${escapeHTML(nomeCategoria)} •
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

  if (ehAdmin) {
    document.querySelectorAll('.btn-icone.editar').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalEdicao(btn.dataset.id));
    });
    document.querySelectorAll('.btn-icone.excluir').forEach((btn) => {
      btn.addEventListener('click', () => excluirProduto(btn.dataset.id));
    });
  }
}

campoBusca.addEventListener('input', () => {
  const termo = campoBusca.value.toLowerCase().trim();
  const filtrados = produtosCache.filter((p) =>
    p.nome.toLowerCase().includes(termo) ||
    p.codigo.toLowerCase().includes(termo) ||
    (p.codigo_barras && p.codigo_barras.toLowerCase().includes(termo))
  );
  renderizarProdutos(filtrados);
});

// =========================================================
// ABRIR MODAL: NOVO PRODUTO (com código automático)
// =========================================================
document.getElementById('btn-novo-produto').addEventListener('click', async () => {
  formProduto.reset();
  document.getElementById('produto-id').value = '';
  campoUnidadesEmbalagem.value = 1;
  campoUnidadeVenda.value = 'unidade';
  atualizarDicaCustoUnitario();

  secaoAvancada.classList.add('escondido');
  btnToggleAvancado.textContent = '⚙️ Mais opções (embalagem, código, estoque mínimo, fornecedor)';

  modalTitulo.textContent = 'Novo Produto';
  modalMensagemErro.textContent = '';

  campoCodigoProduto.value = 'Gerando...';
  campoCodigoProduto.readOnly = true;
  dicaCodigoProduto.textContent = 'Gerado automaticamente.';

  const { data: novoCodigo, error } = await supabaseClient.rpc('gerar_proximo_codigo_produto');
  if (!error && novoCodigo) {
    campoCodigoProduto.value = novoCodigo;
  } else {
    campoCodigoProduto.value = '';
    dicaCodigoProduto.textContent = 'Não foi possível gerar automaticamente. Digite manualmente.';
  }

  if (ehAdmin) campoCodigoProduto.readOnly = false;

  modalProduto.classList.remove('escondido');
});

// =========================================================
// ABRIR MODAL: EDITAR PRODUTO
// =========================================================
function abrirModalEdicao(id) {
  const produto = produtosCache.find((p) => p.id === id);
  if (!produto) return;

  document.getElementById('produto-id').value = produto.id;
  campoCodigoProduto.value = produto.codigo;
  campoCodigoProduto.readOnly = !ehAdmin;
  dicaCodigoProduto.textContent = ehAdmin
    ? 'Você pode editar (permissão de administrador).'
    : 'Apenas administradores podem editar o código.';

  document.getElementById('produto-codigo-barras').value = produto.codigo_barras || '';
  document.getElementById('produto-nome').value = produto.nome;
  selectCategoria.value = produto.categoria_id || '';
  campoEmbalagemNome.value = produto.embalagem_nome || '';
  campoUnidadesEmbalagem.value = produto.unidades_por_embalagem || 1;
  campoPrecoCompraEmbalagem.value = produto.preco_compra_embalagem || produto.preco_compra || '';
  campoUnidadeVenda.value = produto.unidade_venda || 'unidade';
  document.getElementById('produto-preco-venda').value = produto.preco_venda;
  document.getElementById('produto-quantidade').value = produto.quantidade;
  document.getElementById('produto-estoque-minimo').value = produto.estoque_minimo;
  document.getElementById('produto-fornecedor').value = produto.fornecedor || '';

  atualizarDicaCustoUnitario();
  secaoAvancada.classList.add('escondido');
  btnToggleAvancado.textContent = '⚙️ Mais opções (embalagem, código, estoque mínimo, fornecedor)';

  modalTitulo.textContent = 'Editar Produto';
  modalMensagemErro.textContent = '';
  modalProduto.classList.remove('escondido');
}

document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalProduto.classList.add('escondido');
});

// =========================================================
// SALVAR (criar ou editar)
// =========================================================
formProduto.addEventListener('submit', async (event) => {
  event.preventDefault();
  modalMensagemErro.textContent = '';

  const id = document.getElementById('produto-id').value;

  const dadosProduto = {
    codigo: campoCodigoProduto.value.trim(),
    codigo_barras: document.getElementById('produto-codigo-barras').value.trim() || null,
    nome: document.getElementById('produto-nome').value.trim(),
    categoria_id: selectCategoria.value || null,
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
    resultado = await supabaseClient.from('produtos').update(dadosProduto).eq('id', id);
  } else {
    resultado = await supabaseClient.from('produtos').insert(dadosProduto);
  }

  if (resultado.error) {
    modalMensagemErro.textContent = 'Erro: ' + resultado.error.message;
    return;
  }

  modalProduto.classList.add('escondido');
  carregarProdutos();
});

// ===== EXCLUIR (soft delete) =====
async function excluirProduto(id) {
  const confirmar = confirm('Deseja realmente excluir este produto?');
  if (!confirmar) return;

  const { error } = await supabaseClient.from('produtos').update({ ativo: false }).eq('id', id);
  if (error) { alert('Erro ao excluir: ' + error.message); return; }
  carregarProdutos();
}

// =========================================================
// SCANNER DE CÓDIGO DE BARRAS (câmera, via ZXing)
// =========================================================
const scannerOverlay = document.getElementById('scanner-overlay');
const scannerVideo = document.getElementById('scanner-video');
const scannerStatus = document.getElementById('scanner-status');
let leitorZXing = null;
let streamCameraAtual = null;

document.getElementById('btn-abrir-scanner-produto').addEventListener('click', abrirScanner);
document.getElementById('btn-fechar-scanner').addEventListener('click', fecharScanner);

async function abrirScanner() {
  scannerOverlay.classList.remove('escondido');
  scannerStatus.textContent = 'A iniciar câmera...';

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    scannerStatus.textContent = 'Este navegador não tem suporte a câmera. Digite o código manualmente.';
    return;
  }

  try {
    leitorZXing = new ZXing.BrowserMultiFormatReader();

    // Usa a API padrão do navegador para listar câmeras, em vez do helper do ZXing
    // (evita depender de um método específico de versão da biblioteca)
    let deviceId;
    try {
      const dispositivosTodos = await navigator.mediaDevices.enumerateDevices();
      const camerasDisponiveis = dispositivosTodos.filter((d) => d.kind === 'videoinput');
      const camTraseira = camerasDisponiveis.find((d) => /back|traseira|rear|environment/i.test(d.label));
      deviceId = camTraseira ? camTraseira.deviceId : (camerasDisponiveis[0] ? camerasDisponiveis[0].deviceId : undefined);
    } catch (erroListagem) {
      // Se não conseguir listar (ex: sem permissão ainda), deixa undefined
      // que o ZXing/getUserMedia resolve sozinho com a câmera padrão
      deviceId = undefined;
    }

    scannerStatus.textContent = 'Aponte a câmera para o código de barras...';

    leitorZXing.decodeFromVideoDevice(deviceId, scannerVideo, (resultado, erro) => {
      if (resultado) {
        document.getElementById('produto-codigo-barras').value = resultado.getText();
        scannerStatus.textContent = 'Código lido: ' + resultado.getText();
        if (navigator.vibrate) navigator.vibrate(150);
        setTimeout(fecharScanner, 600);
      }
      // erro "NotFoundException" é normal a cada frame sem leitura — ignorado de propósito
    });
  } catch (erro) {
    scannerStatus.textContent = 'Não foi possível acessar a câmera: ' + erro.message + '. Digite o código manualmente.';
  }
}

function fecharScanner() {
  if (leitorZXing) {
    try { leitorZXing.reset(); } catch (e) { /* já parado, ignora */ }
    leitorZXing = null;
  }
  scannerOverlay.classList.add('escondido');
}

// =========================================================
// IMPORTAÇÃO EM LOTE (CSV)
// =========================================================
const modalImportar = document.getElementById('modal-importar');
let dadosCsvValidados = [];

document.getElementById('btn-importar-produtos').addEventListener('click', () => {
  document.getElementById('input-arquivo-csv').value = '';
  document.getElementById('importacao-preview').classList.add('escondido');
  document.getElementById('importacao-resultado').classList.add('escondido');
  document.getElementById('btn-confirmar-importar').classList.add('escondido');
  document.getElementById('modal-importar-erro').textContent = '';
  dadosCsvValidados = [];
  modalImportar.classList.remove('escondido');
});

document.getElementById('btn-cancelar-importar').addEventListener('click', () => {
  modalImportar.classList.add('escondido');
  carregarProdutos(); // atualiza a lista, caso algo tenha sido importado
});

// ===== BAIXAR MODELO CSV =====
document.getElementById('btn-baixar-modelo-csv').addEventListener('click', () => {
  const cabecalho = 'nome,codigo_barras,categoria,preco_compra_embalagem,unidades_por_embalagem,unidade_venda,preco_venda,quantidade,estoque_minimo,fornecedor';
  const linhaExemplo = 'Caneta Azul,7891234567890,Papelaria,500.00,50,unidade,15.00,100,10,Fornecedor XYZ';
  const conteudo = cabecalho + '\n' + linhaExemplo;

  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modelo_importacao_produtos.csv';
  link.click();
  URL.revokeObjectURL(url);
});

// ===== LER E VALIDAR O CSV SELECIONADO =====
document.getElementById('input-arquivo-csv').addEventListener('change', (event) => {
  const arquivo = event.target.files[0];
  const erroDiv = document.getElementById('modal-importar-erro');
  erroDiv.textContent = '';

  if (!arquivo) return;

  Papa.parse(arquivo, {
    header: true,
    skipEmptyLines: true,
    complete: (resultado) => {
      if (resultado.errors.length > 0) {
        erroDiv.textContent = 'Erro ao ler o CSV: ' + resultado.errors[0].message;
        return;
      }

      const linhasValidas = resultado.data.filter((linha) => linha.nome && linha.nome.trim() !== '');

      if (linhasValidas.length === 0) {
        erroDiv.textContent = 'Nenhuma linha válida encontrada (a coluna "nome" é obrigatória).';
        return;
      }

      dadosCsvValidados = linhasValidas;
      mostrarPreviewImportacao(linhasValidas);
    },
    error: (erro) => {
      erroDiv.textContent = 'Erro ao ler o ficheiro: ' + erro.message;
    }
  });
});

function mostrarPreviewImportacao(linhas) {
  document.getElementById('importacao-total-linhas').textContent = linhas.length;
  const previewLista = document.getElementById('importacao-preview-lista');

  previewLista.innerHTML = linhas.slice(0, 20).map((linha) => `
    <div class="importacao-resumo-linha">
      <span>${escapeHTML(linha.nome)} ${linha.categoria ? '(' + escapeHTML(linha.categoria) + ')' : ''}</span>
      <span>${linha.preco_venda || '0.00'} MT</span>
    </div>
  `).join('');

  if (linhas.length > 20) {
    previewLista.innerHTML += `<p class="mov-detalhes" style="padding:6px 0;">+ ${linhas.length - 20} produto(s) adicional(is)...</p>`;
  }

  document.getElementById('importacao-preview').classList.remove('escondido');
  document.getElementById('btn-confirmar-importar').classList.remove('escondido');
}

// ===== CONFIRMAR IMPORTAÇÃO (chama a função do banco) =====
document.getElementById('btn-confirmar-importar').addEventListener('click', async () => {
  const erroDiv = document.getElementById('modal-importar-erro');
  erroDiv.textContent = '';

  if (dadosCsvValidados.length === 0) {
    erroDiv.textContent = 'Nenhum dado para importar.';
    return;
  }

  const btnConfirmar = document.getElementById('btn-confirmar-importar');
  btnConfirmar.disabled = true;
  btnConfirmar.textContent = 'Importando...';

  const { data, error } = await supabaseClient.rpc('importar_produtos_lote', {
    p_itens: dadosCsvValidados
  });

  btnConfirmar.disabled = false;
  btnConfirmar.textContent = 'Confirmar Importação';

  if (error) {
    erroDiv.textContent = 'Erro: ' + error.message;
    return;
  }

  const resultadoDiv = document.getElementById('importacao-resultado');
  let html = `<p style="color:#16a34a; font-weight:700;">${data.criados} produto(s) importado(s) com sucesso.</p>`;

  if (data.erros && data.erros.length > 0) {
    html += `<p style="color:#dc2626; font-weight:700; margin-top:8px;">${data.erros.length} linha(s) com erro:</p>`;
    data.erros.forEach((err) => {
      html += `<div class="importacao-erro-linha">Linha ${err.linha} (${escapeHTML(err.nome)}): ${escapeHTML(err.erro)}</div>`;
    });
  }

  resultadoDiv.innerHTML = html;
  resultadoDiv.classList.remove('escondido');

  document.getElementById('importacao-preview').classList.add('escondido');
  btnConfirmar.classList.add('escondido');
  dadosCsvValidados = [];

  carregarProdutos();
});

// =========================================================
// INICIALIZAÇÃO
// =========================================================
carregarCategorias();
carregarProdutos();