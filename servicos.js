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
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ===== ELEMENTOS =====
const avisoSemCaixa = document.getElementById('aviso-sem-caixa');
const areaNovoPedido = document.getElementById('area-novo-pedido');
const gridServicosRapidos = document.getElementById('grid-servicos-rapidos');

const painelItem = document.getElementById('painel-item-servico');
const painelItemNome = document.getElementById('painel-item-nome');
const painelBlocoCor = document.getElementById('painel-bloco-cor');
const painelLabelQuantidade = document.getElementById('painel-label-quantidade');
const painelQuantidade = document.getElementById('painel-quantidade');
const painelDescricao = document.getElementById('painel-descricao');
const painelBlocoNota = document.getElementById('painel-bloco-nota');
const painelPrecoUnitario = document.getElementById('painel-preco-unitario');
const painelSubtotalPreview = document.getElementById('painel-subtotal-preview');
const painelMensagemErro = document.getElementById('painel-mensagem-erro');

const carrinhoServicosDiv = document.getElementById('carrinho-servicos');
const resumoCompacto = document.getElementById('resumo-compacto');
const painelCheckout = document.getElementById('painel-checkout');

const buscaClientePedido = document.getElementById('busca-cliente-pedido');
const resultadosBuscaCliente = document.getElementById('resultados-busca-cliente');
const clienteSelecionadoArea = document.getElementById('cliente-selecionado-area');

const chipsFormaPagamento = document.getElementById('chips-forma-pagamento');
const campoPedidoPagamento = document.getElementById('pedido-pagamento');
const blocoVencimentoPedido = document.getElementById('bloco-vencimento-pedido');
const campoPedidoVencimento = document.getElementById('pedido-vencimento');
const campoPedidoDesconto = document.getElementById('pedido-desconto');
const campoPedidoValorRecebido = document.getElementById('pedido-valor-recebido');
const pedidoMensagemErro = document.getElementById('pedido-mensagem-erro');

const filtroSituacao = document.getElementById('filtro-situacao');
const listaServicos = document.getElementById('lista-servicos');
const campoBuscaServico = document.getElementById('busca-servico');

let caixaAberto = null;
let tiposServicoCache = [];
let precosServicoCache = [];
let clientesCache = [];
let dadosEmpresa = null;
let formasPagamentoCache = [];

let carrinhoServicos = []; // { tipoChave, tipoNome, cor, paginas, descricao, quantidade, precoUnitario, subtotal }
let clienteSelecionado = null; // { id, nome }
let formaPagamentoSelecionada = null;
let tipoEmEdicaoNoPainel = null; // tipo (objeto) atualmente aberto no painel de item
let corSelecionadaPainel = null;

let servicosCache = [];
let situacaoAtiva = 'todos';

const NOMES_SITUACAO = {
  pendente: 'Pendente', em_execucao: 'Em execução', pronto: 'Pronto',
  entregue: 'Entregue', cancelado: 'Cancelado'
};

const NOMES_PAGAMENTO_SERVICO = {
  dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'e-Mola', transferencia: 'Transferência Bancária', fiado: 'Dívida (a prazo)'
};

const NOMES_COR = { pb: 'Preto e branco', colorido: 'Colorido', unica: 'Padrão' };

// ===== ÍCONES POR TIPO (visual rápido nos botões) =====
function getIconeServico(chave) {
  if (chave.includes('impress')) return '🖨️';
  if (chave.includes('fotocopia') || chave.includes('copia')) return '📄';
  if (chave.includes('digital')) return '💻';
  if (chave.includes('encaderna')) return '📚';
  if (chave.includes('plastific')) return '🛡️';
  if (chave.includes('foto')) return '📷';
  if (chave.includes('curriculo')) return '📝';
  if (chave.includes('digita')) return '⌨️';
  if (chave.includes('envio')) return '📧';
  return '🧾';
}

// =========================================================
// CARREGAMENTO INICIAL
// =========================================================

async function carregarEmpresaRecibo() {
  const { data, error } = await supabaseClient.from('configuracoes_empresa').select('*').eq('id', 1).single();
  if (!error) dadosEmpresa = data;
}

async function carregarFormasPagamentoAtivas() {
  const { data, error } = await supabaseClient
    .from('formas_pagamento_config')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar formas de pagamento:', error); return; }

  formasPagamentoCache = data;
  chipsFormaPagamento.innerHTML = '';
  data.forEach((forma) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-cor';
    btn.dataset.forma = forma.chave;
    btn.textContent = forma.nome;
    btn.addEventListener('click', () => selecionarFormaPagamento(forma.chave));
    chipsFormaPagamento.appendChild(btn);
  });
}

function selecionarFormaPagamento(chave) {
  formaPagamentoSelecionada = chave;
  campoPedidoPagamento.value = chave;

  document.querySelectorAll('#chips-forma-pagamento .chip-cor').forEach((btn) => {
    btn.classList.toggle('selecionado', btn.dataset.forma === chave);
  });

  if (chave === 'fiado') {
    blocoVencimentoPedido.classList.remove('escondido');
    campoPedidoVencimento.required = true;
  } else {
    blocoVencimentoPedido.classList.add('escondido');
    campoPedidoVencimento.required = false;
  }
}

async function verificarCaixaAberto() {
  const { data, error } = await supabaseClient
    .from('caixas')
    .select('*')
    .eq('usuario_id', usuarioLogado.id)
    .eq('status', 'aberto')
    .maybeSingle();

  if (error) { console.log('Erro ao verificar caixa:', error); return; }

  caixaAberto = data;

  if (caixaAberto) {
    avisoSemCaixa.classList.add('escondido');
    areaNovoPedido.classList.remove('escondido');
  } else {
    areaNovoPedido.classList.add('escondido');
    avisoSemCaixa.classList.remove('escondido');
  }
}

async function carregarTiposServico() {
  const { data, error } = await supabaseClient
    .from('tipos_servico')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar tipos de serviço:', error); return; }

  tiposServicoCache = data;
  renderizarGridRapidos();
}

async function carregarPrecosServico() {
  const { data, error } = await supabaseClient.from('precos_servico').select('*');
  if (error) { console.log('Erro ao carregar preços de serviço:', error); return; }
  precosServicoCache = data;
}

async function carregarClientesCache() {
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nome, telefone')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar clientes:', error); return; }
  clientesCache = data;
}

// =========================================================
// GRID DE SERVIÇOS RÁPIDOS (favoritos) + MODAL "TODOS OS SERVIÇOS"
// =========================================================

function renderizarGridRapidos() {
  const favoritos = tiposServicoCache.filter((t) => t.favorito);

  gridServicosRapidos.innerHTML = '';
  favoritos.forEach((tipo) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'servico-rapido-btn';
    btn.innerHTML = `
      <span class="servico-rapido-icone">${getIconeServico(tipo.chave)}</span>
      <span class="servico-rapido-nome">${escapeHTML(tipo.nome)}</span>
      <span class="servico-rapido-preco">${tipo.preco_padrao !== null ? Number(tipo.preco_padrao).toFixed(2) + ' MT' : 'por página'}</span>
    `;
    btn.addEventListener('click', () => tocarServico(tipo.chave));
    gridServicosRapidos.appendChild(btn);
  });

  const btnMais = document.createElement('button');
  btnMais.type = 'button';
  btnMais.className = 'servico-rapido-btn mais-servicos';
  btnMais.innerHTML = `
    <span class="servico-rapido-icone">➕</span>
    <span class="servico-rapido-nome">Mais serviços</span>
  `;
  btnMais.addEventListener('click', abrirModalTodosServicos);
  gridServicosRapidos.appendChild(btnMais);
}

function abrirModalTodosServicos() {
  document.getElementById('busca-todos-servicos').value = '';
  renderizarListaTodosServicos(tiposServicoCache);
  document.getElementById('modal-todos-servicos').classList.remove('escondido');
}

function renderizarListaTodosServicos(lista) {
  const container = document.getElementById('lista-todos-servicos-modal');
  if (lista.length === 0) {
    container.innerHTML = '<p class="lista-vazia">Nenhum serviço encontrado.</p>';
    return;
  }
  container.innerHTML = '';
  lista.forEach((tipo) => {
    const div = document.createElement('div');
    div.className = 'produto-item';
    div.style.cursor = 'pointer';
    div.innerHTML = `
      <div class="produto-info">
        <div class="produto-nome">${getIconeServico(tipo.chave)} ${escapeHTML(tipo.nome)}</div>
        <div class="produto-detalhes">${tipo.preco_padrao !== null ? Number(tipo.preco_padrao).toFixed(2) + ' MT' : 'Preço por página'}</div>
      </div>
    `;
    div.addEventListener('click', () => {
      document.getElementById('modal-todos-servicos').classList.add('escondido');
      tocarServico(tipo.chave);
    });
    container.appendChild(div);
  });
}

document.getElementById('busca-todos-servicos').addEventListener('input', (event) => {
  const termo = event.target.value.toLowerCase().trim();
  const filtrados = tiposServicoCache.filter((t) => t.nome.toLowerCase().includes(termo));
  renderizarListaTodosServicos(filtrados);
});

document.getElementById('btn-fechar-todos-servicos').addEventListener('click', () => {
  document.getElementById('modal-todos-servicos').classList.add('escondido');
});

// =========================================================
// TOCAR NUM SERVIÇO: adiciona direto (preço fixo) ou abre painel (por página)
// =========================================================

function tocarServico(tipoChave) {
  const tipo = tiposServicoCache.find((t) => t.chave === tipoChave);
  if (!tipo) return;

  const precosDoTipo = precosServicoCache.filter((p) => p.tipo === tipoChave);

  if (precosDoTipo.length > 0) {
    // Precisa escolher cor/páginas — abre o painel compacto
    abrirPainelItem(tipo, precosDoTipo);
    return;
  }

  if (tipo.preco_padrao === null || tipo.preco_padrao === undefined) {
    // Sem preço padrão definido — abre o painel para o funcionário informar o valor
    abrirPainelItem(tipo, []);
    return;
  }

  // Preço fixo conhecido: adiciona direto ao carrinho, 1 toque, sem abrir nada
  adicionarItemCarrinho({
    tipoChave: tipo.chave,
    tipoNome: tipo.nome,
    cor: null,
    paginas: null,
    descricao: null,
    quantidade: 1,
    precoUnitario: Number(tipo.preco_padrao)
  });
}

// ===== PAINEL DE ITEM (para serviços com cor/páginas ou sem preço padrão) =====
function abrirPainelItem(tipo, precosDoTipo) {
  tipoEmEdicaoNoPainel = tipo;
  corSelecionadaPainel = null;
  painelMensagemErro.textContent = '';
  painelItemNome.textContent = getIconeServico(tipo.chave) + ' ' + tipo.nome;

  painelQuantidade.value = 1;
  painelDescricao.value = '';
  painelBlocoNota.classList.add('escondido');

  document.querySelectorAll('.chip-qtd').forEach((c) => c.classList.remove('selecionado'));
  document.querySelector('.chip-qtd[data-qtd="1"]').classList.add('selecionado');

  if (precosDoTipo.length > 0) {
    painelBlocoCor.classList.remove('escondido');
    painelLabelQuantidade.textContent = 'Número de páginas/cópias';
    painelPrecoUnitario.value = '';
    document.querySelectorAll('.chip-cor[data-cor]').forEach((c) => c.classList.remove('selecionado'));
  } else {
    painelBlocoCor.classList.add('escondido');
    painelLabelQuantidade.textContent = 'Quantidade';
    painelPrecoUnitario.value = tipo.preco_padrao !== null ? Number(tipo.preco_padrao).toFixed(2) : '';
  }

  atualizarPreviewPainel();
  painelItem.classList.remove('escondido');
  painelItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('btn-fechar-painel-item').addEventListener('click', () => {
  painelItem.classList.add('escondido');
  tipoEmEdicaoNoPainel = null;
});

document.querySelectorAll('.chip-cor[data-cor]').forEach((chip) => {
  chip.addEventListener('click', () => {
    corSelecionadaPainel = chip.dataset.cor;
    document.querySelectorAll('.chip-cor[data-cor]').forEach((c) => c.classList.remove('selecionado'));
    chip.classList.add('selecionado');

    const preco = precosServicoCache.find((p) => p.tipo === tipoEmEdicaoNoPainel.chave && p.cor === corSelecionadaPainel);
    if (preco) painelPrecoUnitario.value = Number(preco.preco_pagina).toFixed(2);
    atualizarPreviewPainel();
  });
});

document.querySelectorAll('#chips-quantidade-rapida .chip-qtd').forEach((chip) => {
  chip.addEventListener('click', () => {
    painelQuantidade.value = chip.dataset.qtd;
    document.querySelectorAll('.chip-qtd').forEach((c) => c.classList.remove('selecionado'));
    chip.classList.add('selecionado');
    atualizarPreviewPainel();
  });
});

painelQuantidade.addEventListener('input', () => {
  document.querySelectorAll('.chip-qtd').forEach((c) => c.classList.toggle('selecionado', c.dataset.qtd === painelQuantidade.value));
  atualizarPreviewPainel();
});

painelPrecoUnitario.addEventListener('input', atualizarPreviewPainel);

document.getElementById('btn-mostrar-nota').addEventListener('click', () => {
  painelBlocoNota.classList.toggle('escondido');
  if (!painelBlocoNota.classList.contains('escondido')) painelDescricao.focus();
});

function atualizarPreviewPainel() {
  const qtd = parseInt(painelQuantidade.value) || 0;
  const preco = parseFloat(painelPrecoUnitario.value) || 0;
  painelSubtotalPreview.textContent = (qtd * preco).toFixed(2) + ' MT';
}

document.getElementById('btn-confirmar-item').addEventListener('click', () => {
  painelMensagemErro.textContent = '';

  if (!tipoEmEdicaoNoPainel) return;

  const precosDoTipo = precosServicoCache.filter((p) => p.tipo === tipoEmEdicaoNoPainel.chave);
  const usaPorPagina = precosDoTipo.length > 0;

  if (usaPorPagina && !corSelecionadaPainel) {
    painelMensagemErro.textContent = 'Selecione a cor.';
    return;
  }

  const quantidade = parseInt(painelQuantidade.value) || 0;
  const precoUnitario = parseFloat(painelPrecoUnitario.value) || 0;

  if (quantidade <= 0) {
    painelMensagemErro.textContent = 'Informe uma quantidade válida.';
    return;
  }
  if (precoUnitario <= 0) {
    painelMensagemErro.textContent = 'Informe um preço unitário válido.';
    return;
  }

  adicionarItemCarrinho({
    tipoChave: tipoEmEdicaoNoPainel.chave,
    tipoNome: tipoEmEdicaoNoPainel.nome,
    cor: usaPorPagina ? corSelecionadaPainel : null,
    paginas: usaPorPagina ? quantidade : null,
    descricao: painelDescricao.value.trim() || null,
    quantidade,
    precoUnitario
  });

  painelItem.classList.add('escondido');
  tipoEmEdicaoNoPainel = null;
});

// =========================================================
// CARRINHO
// =========================================================

function adicionarItemCarrinho(novoItem) {
  // Junta com item igual já existente (mesmo tipo, cor e nota) em vez de duplicar linha —
  // permite tocar várias vezes no mesmo botão rápido para somar quantidade
  const existente = carrinhoServicos.find((i) =>
    i.tipoChave === novoItem.tipoChave && i.cor === novoItem.cor && i.descricao === novoItem.descricao && i.paginas === null
  );

  if (existente && novoItem.paginas === null) {
    existente.quantidade += novoItem.quantidade;
    existente.subtotal = existente.quantidade * existente.precoUnitario;
  } else {
    carrinhoServicos.push({ ...novoItem, subtotal: novoItem.quantidade * novoItem.precoUnitario });
  }

  renderizarCarrinhoServicos();
}

function renderizarCarrinhoServicos() {
  if (carrinhoServicos.length === 0) {
    carrinhoServicosDiv.innerHTML = '<p class="lista-vazia">Nenhum item adicionado ainda. Toque num serviço acima.</p>';
    resumoCompacto.classList.add('escondido');
    painelCheckout.classList.add('escondido');
    return;
  }

  carrinhoServicosDiv.innerHTML = '';
  carrinhoServicos.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'carrinho-item';
    div.innerHTML = `
      <div class="carrinho-item-info">
        <div class="carrinho-item-nome">${getIconeServico(item.tipoChave)} ${escapeHTML(item.tipoNome)} ${item.cor ? '(' + (NOMES_COR[item.cor] || item.cor) + ')' : ''}</div>
        <div class="carrinho-item-qtd">
          <button data-index="${index}" class="btn-diminuir-item">−</button>
          <span>${item.quantidade}</span>
          <button data-index="${index}" class="btn-aumentar-item">+</button>
        </div>
        ${item.descricao ? `<div class="mov-detalhes">${escapeHTML(item.descricao)}</div>` : ''}
      </div>
      <div>
        <strong>${item.subtotal.toFixed(2)} MT</strong>
        <button data-index="${index}" class="btn-icone excluir btn-remover-item-servico" style="display:block; margin-top:4px;">Remover</button>
      </div>
    `;
    carrinhoServicosDiv.appendChild(div);
  });

  document.querySelectorAll('.btn-aumentar-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = carrinhoServicos[btn.dataset.index];
      item.quantidade += 1;
      item.subtotal = item.quantidade * item.precoUnitario;
      renderizarCarrinhoServicos();
    });
  });

  document.querySelectorAll('.btn-diminuir-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = carrinhoServicos[btn.dataset.index];
      item.quantidade -= 1;
      if (item.quantidade <= 0) {
        carrinhoServicos.splice(btn.dataset.index, 1);
      } else {
        item.subtotal = item.quantidade * item.precoUnitario;
      }
      renderizarCarrinhoServicos();
    });
  });

  document.querySelectorAll('.btn-remover-item-servico').forEach((btn) => {
    btn.addEventListener('click', () => {
      carrinhoServicos.splice(btn.dataset.index, 1);
      renderizarCarrinhoServicos();
    });
  });

  const totalItens = carrinhoServicos.reduce((t, i) => t + i.quantidade, 0);
  const totalValor = carrinhoServicos.reduce((t, i) => t + i.subtotal, 0);
  document.getElementById('resumo-compacto-itens').textContent = totalItens + ' item(ns)';
  document.getElementById('resumo-compacto-total').textContent = totalValor.toFixed(2) + ' MT';
  resumoCompacto.classList.remove('escondido');

  atualizarTotaisPedido();
}

resumoCompacto.addEventListener('click', () => {
  painelCheckout.classList.remove('escondido');
  painelCheckout.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.getElementById('btn-cancelar-checkout').addEventListener('click', () => {
  painelCheckout.classList.add('escondido');
});

// =========================================================
// BUSCA DE CLIENTE (autocomplete)
// =========================================================

buscaClientePedido.addEventListener('input', () => {
  const termo = buscaClientePedido.value.toLowerCase().trim();

  if (termo === '') {
    resultadosBuscaCliente.classList.add('escondido');
    return;
  }

  const encontrados = clientesCache.filter((c) => c.nome.toLowerCase().includes(termo));

  if (encontrados.length === 0) {
    resultadosBuscaCliente.innerHTML = '<div class="busca-cliente-item">Nenhum cliente encontrado.</div>';
    resultadosBuscaCliente.classList.remove('escondido');
    return;
  }

  resultadosBuscaCliente.innerHTML = '';
  encontrados.slice(0, 6).forEach((cliente) => {
    const div = document.createElement('div');
    div.className = 'busca-cliente-item';
    div.textContent = cliente.nome + (cliente.telefone ? ' — ' + cliente.telefone : '');
    div.addEventListener('click', () => selecionarCliente(cliente));
    resultadosBuscaCliente.appendChild(div);
  });

  resultadosBuscaCliente.classList.remove('escondido');
});

function selecionarCliente(cliente) {
  clienteSelecionado = cliente;
  buscaClientePedido.value = '';
  resultadosBuscaCliente.classList.add('escondido');

  clienteSelecionadoArea.innerHTML = `
    <span class="cliente-selecionado-tag">
      ${escapeHTML(cliente.nome)}
      <button type="button" id="btn-remover-cliente-selecionado">✕</button>
    </span>
  `;
  document.getElementById('btn-remover-cliente-selecionado').addEventListener('click', () => {
    clienteSelecionado = null;
    clienteSelecionadoArea.innerHTML = '';
  });
}

// =========================================================
// TOTAIS E PAGAMENTO DO PEDIDO
// =========================================================

function atualizarTotaisPedido() {
  const subtotal = carrinhoServicos.reduce((t, item) => t + item.subtotal, 0);
  const desconto = parseFloat(campoPedidoDesconto.value) || 0;
  const total = Math.max(subtotal - desconto, 0);

  document.getElementById('pedido-subtotal').textContent = subtotal.toFixed(2) + ' MT';
  document.getElementById('pedido-desconto-exibido').textContent = desconto.toFixed(2) + ' MT';
  document.getElementById('pedido-total').textContent = total.toFixed(2) + ' MT';

  atualizarTrocoPedido(total);
  return total;
}

function atualizarTrocoPedido(total) {
  const recebido = parseFloat(campoPedidoValorRecebido.value) || 0;
  const troco = recebido - total;
  document.getElementById('pedido-troco').textContent = (troco > 0 ? troco : 0).toFixed(2) + ' MT';
}

campoPedidoDesconto.addEventListener('input', atualizarTotaisPedido);
campoPedidoValorRecebido.addEventListener('input', () => {
  const total = parseFloat(document.getElementById('pedido-total').textContent) || 0;
  atualizarTrocoPedido(total);
});

// ===== PAGAMENTO RÁPIDO: dinheiro exato, finaliza num só toque =====
document.getElementById('btn-pagamento-rapido-dinheiro').addEventListener('click', async () => {
  selecionarFormaPagamento('dinheiro');
  const total = atualizarTotaisPedido();
  campoPedidoValorRecebido.value = total.toFixed(2);
  atualizarTrocoPedido(total);
  await finalizarPedido();
});

document.getElementById('btn-finalizar-pedido').addEventListener('click', finalizarPedido);

// =========================================================
// FINALIZAR PEDIDO
// =========================================================

async function finalizarPedido() {
  pedidoMensagemErro.textContent = '';

  if (carrinhoServicos.length === 0) {
    pedidoMensagemErro.textContent = 'Adicione ao menos um serviço ao pedido.';
    return;
  }

  if (!formaPagamentoSelecionada) {
    pedidoMensagemErro.textContent = 'Selecione a forma de pagamento.';
    return;
  }

  const clienteId = clienteSelecionado ? clienteSelecionado.id : null;
  const desconto = parseFloat(campoPedidoDesconto.value) || 0;
  const valorRecebido = parseFloat(campoPedidoValorRecebido.value) || null;
  const dataVencimento = formaPagamentoSelecionada === 'fiado' ? campoPedidoVencimento.value : null;

  if (formaPagamentoSelecionada === 'fiado' && !dataVencimento) {
    pedidoMensagemErro.textContent = 'Informe a data de vencimento para pedido em dívida.';
    return;
  }

  if (formaPagamentoSelecionada === 'fiado' && !clienteId) {
    pedidoMensagemErro.textContent = 'Selecione um cliente para registrar pedido em dívida.';
    return;
  }

  const itensParaEnviar = carrinhoServicos.map((item) => ({
    tipo: item.tipoChave,
    cor: item.cor,
    paginas: item.paginas,
    descricao: item.descricao,
    quantidade: item.quantidade,
    preco_unitario: item.precoUnitario
  }));

  const btnFinalizar = document.getElementById('btn-finalizar-pedido');
  btnFinalizar.disabled = true;

  const { data: numeroPedido, error } = await supabaseClient.rpc('registrar_pedido_servico', {
    p_caixa_id: caixaAberto.id,
    p_cliente_id: clienteId,
    p_itens: itensParaEnviar,
    p_desconto: desconto,
    p_forma_pagamento: formaPagamentoSelecionada,
    p_valor_recebido: valorRecebido,
    p_data_vencimento: dataVencimento
  });

  btnFinalizar.disabled = false;

  if (error) {
    pedidoMensagemErro.textContent = 'Erro: ' + error.message;
    return;
  }

  const nomeCliente = clienteSelecionado ? clienteSelecionado.nome : null;
  const subtotal = carrinhoServicos.reduce((t, item) => t + item.subtotal, 0);

  renderRecibo({
    numeroPedido,
    data: new Date().toISOString(),
    cliente: nomeCliente,
    funcionario: usuarioLogado.nome,
    itens: carrinhoServicos.map((item) => ({
      nome: item.tipoNome + (item.cor ? ' (' + (NOMES_COR[item.cor] || item.cor) + ')' : ''),
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      subtotal: item.subtotal
    })),
    subtotal,
    desconto,
    total: subtotal - desconto,
    formaPagamento: formaPagamentoSelecionada,
    valorRecebido,
    statusPagamento: formaPagamentoSelecionada === 'fiado' ? 'pendente' : 'pago',
    dataVencimento
  });

  // Reset completo do fluxo, pronto para o próximo atendimento
  carrinhoServicos = [];
  clienteSelecionado = null;
  clienteSelecionadoArea.innerHTML = '';
  formaPagamentoSelecionada = null;
  document.querySelectorAll('#chips-forma-pagamento .chip-cor').forEach((btn) => btn.classList.remove('selecionado'));
  campoPedidoPagamento.value = '';
  campoPedidoDesconto.value = '0';
  campoPedidoValorRecebido.value = '';
  campoPedidoVencimento.value = '';
  blocoVencimentoPedido.classList.add('escondido');
  renderizarCarrinhoServicos();
  carregarServicos();
}

// =========================================================
// RECIBO
// =========================================================

function renderRecibo(dados) {
  let html = '';

  if (dadosEmpresa) {
    html += `<div style="text-align:center; margin-bottom:12px; border-bottom:1px dashed #cbd5e1; padding-bottom:10px;">
      <strong style="font-size:16px;">${escapeHTML(dadosEmpresa.nome)}</strong><br>
      ${dadosEmpresa.endereco ? '<span style="font-size:12px;">' + escapeHTML(dadosEmpresa.endereco) + '</span><br>' : ''}
      ${dadosEmpresa.telefone ? '<span style="font-size:12px;">Tel: ' + escapeHTML(dadosEmpresa.telefone) + '</span><br>' : ''}
      ${dadosEmpresa.nuit ? '<span style="font-size:12px;">NUIT: ' + escapeHTML(dadosEmpresa.nuit) + '</span>' : ''}
    </div>`;
  }

  html += `<p><strong>Pedido de Serviço #${String(dados.numeroPedido).padStart(4, '0')}</strong></p>`;
  html += `<p style="font-size:12px; color:#64748b;">${new Date(dados.data).toLocaleString('pt-BR')}</p>`;
  if (dados.cliente) html += `<p style="font-size:13px;">Cliente: ${escapeHTML(dados.cliente)}</p>`;
  if (dados.funcionario) html += `<p style="font-size:13px;">Atendido por: ${escapeHTML(dados.funcionario)}</p>`;
  html += `<br>`;

  dados.itens.forEach((item) => {
    html += `<div class="recibo-linha">
      <span>${item.quantidade}x ${escapeHTML(item.nome)} (${item.precoUnitario.toFixed(2)} MT/un.)</span>
      <span>${item.subtotal.toFixed(2)} MT</span>
    </div>`;
  });

  html += `<div class="recibo-linha"><span>Subtotal</span><span>${dados.subtotal.toFixed(2)} MT</span></div>`;
  html += `<div class="recibo-linha"><span>Desconto</span><span>${dados.desconto.toFixed(2)} MT</span></div>`;
  html += `<div class="recibo-linha" style="font-weight:700;"><span>Total</span><span>${dados.total.toFixed(2)} MT</span></div>`;
  html += `<div class="recibo-linha"><span>Forma de pagamento</span><span>${NOMES_PAGAMENTO_SERVICO[dados.formaPagamento] || dados.formaPagamento}</span></div>`;

  if (dados.statusPagamento === 'pendente') {
    html += `<div class="recibo-linha" style="font-weight:700; color:#d97706;"><span>Status</span><span>DÍVIDA EM ABERTO</span></div>`;
    if (dados.dataVencimento) {
      html += `<div class="recibo-linha"><span>Vencimento</span><span>${new Date(dados.dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>`;
    }
  } else {
    html += `<div class="recibo-linha" style="font-weight:700; color:#16a34a;"><span>Status</span><span>PAGO</span></div>`;
  }

  if (dados.valorRecebido !== null && dados.valorRecebido !== undefined) {
    const troco = dados.valorRecebido - dados.total;
    html += `<div class="recibo-linha"><span>Valor recebido</span><span>${Number(dados.valorRecebido).toFixed(2)} MT</span></div>`;
    html += `<div class="recibo-linha"><span>Troco</span><span>${(troco > 0 ? troco : 0).toFixed(2)} MT</span></div>`;
  }

  document.getElementById('recibo-conteudo').innerHTML = html;
  painelCheckout.classList.add('escondido');
  document.getElementById('modal-recibo').classList.remove('escondido');
}

document.getElementById('btn-fechar-recibo').addEventListener('click', () => {
  document.getElementById('modal-recibo').classList.add('escondido');
});

document.getElementById('btn-imprimir-recibo').addEventListener('click', () => {
  window.print();
});

async function reimprimirPedido(pedidoId) {
  const { data: pedido, error: erroPedido } = await supabaseClient
    .from('pedidos_servico')
    .select('*, clientes(nome), usuarios(nome)')
    .eq('id', pedidoId)
    .single();

  if (erroPedido) { alert('Erro ao carregar pedido: ' + erroPedido.message); return; }

  const { data: itens, error: erroItens } = await supabaseClient
    .from('servicos')
    .select('*, tipos_servico(nome)')
    .eq('pedido_id', pedidoId);

  if (erroItens) { alert('Erro ao carregar itens: ' + erroItens.message); return; }

  renderRecibo({
    numeroPedido: pedido.numero,
    data: pedido.criado_em,
    cliente: pedido.clientes ? pedido.clientes.nome : null,
    funcionario: pedido.usuarios ? pedido.usuarios.nome : null,
    itens: itens.map((item) => ({
      nome: (item.tipos_servico ? item.tipos_servico.nome : item.tipo) + (item.cor ? ' (' + (NOMES_COR[item.cor] || item.cor) + ')' : ''),
      quantidade: item.quantidade,
      precoUnitario: Number(item.preco_unitario),
      subtotal: Number(item.valor)
    })),
    subtotal: Number(pedido.subtotal),
    desconto: Number(pedido.desconto),
    total: Number(pedido.total),
    formaPagamento: pedido.forma_pagamento,
    valorRecebido: pedido.valor_recebido,
    statusPagamento: pedido.status_pagamento,
    dataVencimento: pedido.data_vencimento
  });
}

// =========================================================
// MODAL: RECEBER PAGAMENTO DE DÍVIDA
// =========================================================

document.getElementById('btn-cancelar-receber-divida').addEventListener('click', () => {
  document.getElementById('modal-receber-divida').classList.add('escondido');
});

document.getElementById('form-receber-divida').addEventListener('submit', async (event) => {
  event.preventDefault();
  const erro = document.getElementById('modal-receber-divida-erro');
  erro.textContent = '';

  const pedidoId = document.getElementById('receber-divida-pedido-id').value;
  const forma = document.getElementById('receber-divida-forma').value;

  const { error } = await supabaseClient.rpc('marcar_pedido_servico_pago', {
    p_pedido_id: pedidoId,
    p_forma_pagamento_recebimento: forma
  });

  if (error) { erro.textContent = 'Erro: ' + error.message; return; }

  document.getElementById('modal-receber-divida').classList.add('escondido');
  carregarServicos();
});

// =========================================================
// ACOMPANHAMENTO DE SERVIÇOS
// =========================================================

async function carregarServicos() {
  listaServicos.innerHTML = '<p class="lista-vazia">Carregando serviços...</p>';

  const { data, error } = await supabaseClient
    .from('servicos')
    .select('*, clientes(nome), usuarios(nome), tipos_servico(nome), pedidos_servico(numero)')
    .order('criado_em', { ascending: false });

  if (error) {
    listaServicos.innerHTML = '<p class="lista-vazia">Erro ao carregar serviços.</p>';
    return;
  }

  servicosCache = data;
  renderizarServicos();
}

function renderizarServicos() {
  let lista = situacaoAtiva === 'todos'
    ? servicosCache
    : servicosCache.filter((s) => s.situacao === situacaoAtiva);

  const termo = campoBuscaServico.value.toLowerCase().trim();
  if (termo) {
    lista = lista.filter((s) => {
      const numeroPedido = s.pedidos_servico ? String(s.pedidos_servico.numero) : '';
      const nomeTipo = s.tipos_servico ? s.tipos_servico.nome.toLowerCase() : s.tipo.toLowerCase();
      const nomeCliente = s.clientes ? s.clientes.nome.toLowerCase() : '';
      return numeroPedido.includes(termo) || nomeTipo.includes(termo) || nomeCliente.includes(termo);
    });
  }

  if (lista.length === 0) {
    listaServicos.innerHTML = '<p class="lista-vazia">Nenhum serviço encontrado.</p>';
    return;
  }

  listaServicos.innerHTML = '';

  lista.forEach((servico) => {
    const nomeCliente = servico.clientes ? servico.clientes.nome : 'Sem cliente';
    const nomeFuncionario = servico.usuarios ? servico.usuarios.nome : '-';
    const nomeTipo = servico.tipos_servico ? servico.tipos_servico.nome : servico.tipo;
    const numeroPedido = servico.pedidos_servico ? servico.pedidos_servico.numero : null;
    const dataFormatada = new Date(servico.criado_em).toLocaleString('pt-BR');
    const estaPendente = servico.status_pagamento === 'pendente';
    const vencido = estaPendente && servico.data_vencimento && new Date(servico.data_vencimento + 'T23:59:59') < new Date();

    const opcoesSituacao = Object.keys(NOMES_SITUACAO)
      .map((chave) => `<option value="${chave}" ${servico.situacao === chave ? 'selected' : ''}>${NOMES_SITUACAO[chave]}</option>`)
      .join('');

    const div = document.createElement('div');
    div.className = 'servico-item';
    div.innerHTML = `
      <div class="servico-topo">
        <div>
          <span class="servico-numero">${getIconeServico(servico.tipo)} #${String(servico.numero).padStart(4, '0')}</span>
          ${numeroPedido ? `<span class="badge" style="margin-left:6px;">Pedido #${String(numeroPedido).padStart(4, '0')}</span>` : ''}
          <div class="servico-tipo">${escapeHTML(nomeTipo)} ${servico.paginas ? '• ' + servico.paginas + ' pág.' : ''} • Qtd: ${servico.quantidade} ${servico.descricao ? '• ' + escapeHTML(servico.descricao) : ''}</div>
          <div class="servico-detalhes">${escapeHTML(nomeCliente)} • ${escapeHTML(nomeFuncionario)} • ${dataFormatada}</div>
          ${estaPendente ? `<div class="servico-detalhes ${vencido ? 'relatorio-diferenca-negativa' : ''}">
            ${vencido ? 'Vencido em' : 'Vence em'} ${servico.data_vencimento ? new Date(servico.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
          </div>` : ''}
        </div>
        <div class="servico-valor">${Number(servico.valor).toFixed(2)} MT</div>
      </div>
      <div class="servico-rodape">
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <span class="situacao-tag ${servico.situacao}">${NOMES_SITUACAO[servico.situacao]}</span>
          ${estaPendente ? `<span class="situacao-tag ${vencido ? 'cancelado' : 'pendente'}">${vencido ? 'Dívida vencida' : 'Dívida pendente'}</span>` : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn-icone ver-recibo-pedido" data-pedido-id="${servico.pedido_id}">Recibo</button>
          ${estaPendente ? `<button class="btn-icone marcar-pago-pedido" data-pedido-id="${servico.pedido_id}">Marcar Pago</button>` : ''}
          <select class="select-situacao" data-id="${servico.id}" ${servico.situacao === 'cancelado' && !ehAdmin ? 'disabled' : ''}>
            ${opcoesSituacao}
          </select>
        </div>
      </div>
    `;
    listaServicos.appendChild(div);
  });

  document.querySelectorAll('.select-situacao').forEach((select) => {
    select.addEventListener('change', (event) => atualizarSituacao(event.target.dataset.id, event.target.value));
  });

  document.querySelectorAll('.ver-recibo-pedido').forEach((btn) => {
    btn.addEventListener('click', () => reimprimirPedido(btn.dataset.pedidoId));
  });

  document.querySelectorAll('.marcar-pago-pedido').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('receber-divida-pedido-id').value = btn.dataset.pedidoId;
      document.getElementById('modal-receber-divida-erro').textContent = '';
      document.getElementById('modal-receber-divida').classList.remove('escondido');
    });
  });
}

filtroSituacao.addEventListener('click', (event) => {
  if (!event.target.classList.contains('aba')) return;
  document.querySelectorAll('#filtro-situacao .aba').forEach((aba) => aba.classList.remove('ativa'));
  event.target.classList.add('ativa');
  situacaoAtiva = event.target.dataset.situacao;
  renderizarServicos();
});

campoBuscaServico.addEventListener('input', renderizarServicos);

async function atualizarSituacao(id, novaSituacao) {
  if (novaSituacao === 'cancelado') {
    const confirmar = confirm('Tem certeza que deseja cancelar este serviço?');
    if (!confirmar) { carregarServicos(); return; }
  }

  const { error } = await supabaseClient
    .from('servicos')
    .update({ situacao: novaSituacao, atualizado_em: new Date().toISOString() })
    .eq('id', id);

  if (error) { alert('Erro ao atualizar: ' + error.message); carregarServicos(); return; }
  carregarServicos();
}

// =========================================================
// INICIALIZAÇÃO
// =========================================================
verificarCaixaAberto();
carregarTiposServico();
carregarPrecosServico();
carregarClientesCache();
carregarServicos();
carregarFormasPagamentoAtivas();
carregarEmpresaRecibo();