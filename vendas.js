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
const areaPdv = document.getElementById('area-pdv');
const campoBusca = document.getElementById('busca-produto-pdv');
const resultadoBusca = document.getElementById('resultado-busca');
const carrinhoDiv = document.getElementById('carrinho');
const selectCliente = document.getElementById('pdv-cliente');
const campoDesconto = document.getElementById('pdv-desconto');
const campoValorRecebido = document.getElementById('pdv-valor-recebido');
const selectPagamento = document.getElementById('pdv-pagamento');
const blocoVencimentoVenda = document.getElementById('bloco-vencimento-venda');
const campoVencimentoVenda = document.getElementById('pdv-vencimento');

let caixaAberto = null;
let produtosCache = [];
let carrinho = [];
let dadosEmpresa = null;

const NOMES_PAGAMENTO_VENDA = {
  dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'e-Mola', transferencia: 'Transferência Bancária', fiado: 'Dívida (a prazo)'
};

// ===== CARREGAR DADOS DA EMPRESA (para o recibo) =====
async function carregarEmpresaRecibo() {
  const { data, error } = await supabaseClient
    .from('configuracoes_empresa')
    .select('*')
    .eq('id', 1)
    .single();

  if (!error) dadosEmpresa = data;
}

// ===== CARREGAR FORMAS DE PAGAMENTO ATIVAS =====
async function carregarFormasPagamentoAtivas() {
  const { data, error } = await supabaseClient
    .from('formas_pagamento_config')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar formas de pagamento:', error); return; }

  selectPagamento.innerHTML = '';
  data.forEach((forma) => {
    const option = document.createElement('option');
    option.value = forma.chave;
    option.textContent = forma.nome;
    selectPagamento.appendChild(option);
  });

  selectPagamento.addEventListener('change', () => {
    if (selectPagamento.value === 'fiado') {
      blocoVencimentoVenda.classList.remove('escondido');
      campoVencimentoVenda.required = true;
    } else {
      blocoVencimentoVenda.classList.add('escondido');
      campoVencimentoVenda.required = false;
    }
  });
}

// ===== VERIFICA SE HÁ CAIXA ABERTO =====
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
    areaPdv.classList.remove('escondido');
    carregarProdutos();
    carregarClientes();
  } else {
    areaPdv.classList.add('escondido');
    avisoSemCaixa.classList.remove('escondido');
  }
}

// ===== CARREGAR PRODUTOS EM CACHE =====
async function carregarProdutos() {
  const { data, error } = await supabaseClient
    .from('produtos')
    .select('id, codigo, codigo_barras, nome, preco_venda, quantidade')
    .eq('ativo', true);

  if (error) { console.log('Erro ao carregar produtos:', error); return; }
  produtosCache = data;
}

// ===== CARREGAR CLIENTES =====
async function carregarClientes() {
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar clientes:', error); return; }

  selectCliente.innerHTML = '<option value="">Cliente não identificado</option>';
  data.forEach((cliente) => {
    const option = document.createElement('option');
    option.value = cliente.id;
    option.textContent = cliente.nome;
    selectCliente.appendChild(option);
  });
}

// ===== BUSCA DE PRODUTOS =====
campoBusca.addEventListener('input', () => {
  const termo = campoBusca.value.toLowerCase().trim();

  if (termo === '') {
    resultadoBusca.classList.add('escondido');
    return;
  }

  const encontrados = produtosCache.filter((p) =>
    p.nome.toLowerCase().includes(termo) ||
    p.codigo.toLowerCase().includes(termo) ||
    (p.codigo_barras && p.codigo_barras.toLowerCase() === termo)
  );

  if (encontrados.length === 0) {
    resultadoBusca.innerHTML = '<p class="lista-vazia">Nenhum produto encontrado.</p>';
    resultadoBusca.classList.remove('escondido');
    return;
  }

  resultadoBusca.innerHTML = '';
  encontrados.slice(0, 8).forEach((produto) => {
    const div = document.createElement('div');
    div.className = 'resultado-busca-item';
    div.innerHTML = `
      <span>${escapeHTML(produto.nome)} <span style="color:#94a3b8; font-size:12px;">(estoque: ${produto.quantidade})</span></span>
      <strong>${Number(produto.preco_venda).toFixed(2)} MT</strong>
    `;
    div.addEventListener('click', () => {
      adicionarAoCarrinho(produto);
      campoBusca.value = '';
      resultadoBusca.classList.add('escondido');
      campoBusca.focus();
    });
    resultadoBusca.appendChild(div);
  });

  resultadoBusca.classList.remove('escondido');

  const matchExatoCodigoBarras = produtosCache.find((p) => p.codigo_barras && p.codigo_barras.toLowerCase() === termo);
  if (matchExatoCodigoBarras) {
    adicionarAoCarrinho(matchExatoCodigoBarras);
    campoBusca.value = '';
    resultadoBusca.classList.add('escondido');
  }
});

// ===== ADICIONAR AO CARRINHO =====
function adicionarAoCarrinho(produto) {
  const itemExistente = carrinho.find((i) => i.produto_id === produto.id);

  if (itemExistente) {
    if (itemExistente.quantidade + 1 > produto.quantidade) {
      alert('Estoque insuficiente para adicionar mais uma unidade.');
      return;
    }
    itemExistente.quantidade += 1;
  } else {
    if (produto.quantidade < 1) {
      alert('Produto sem estoque disponível.');
      return;
    }
    carrinho.push({
      produto_id: produto.id,
      nome: produto.nome,
      preco_venda: produto.preco_venda,
      quantidade: 1,
      estoque_disponivel: produto.quantidade
    });
  }

  renderizarCarrinho();
}

// ===== RENDERIZAR CARRINHO =====
function renderizarCarrinho() {
  if (carrinho.length === 0) {
    carrinhoDiv.innerHTML = '<p class="lista-vazia">Nenhum item no carrinho.</p>';
    atualizarTotais();
    return;
  }

  carrinhoDiv.innerHTML = '';

  carrinho.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'carrinho-item';
    div.innerHTML = `
      <div class="carrinho-item-info">
        <div class="carrinho-item-nome">${escapeHTML(item.nome)}</div>
        <div class="carrinho-item-qtd">
          <button data-index="${index}" class="btn-diminuir">−</button>
          <span>${item.quantidade}</span>
          <button data-index="${index}" class="btn-aumentar">+</button>
        </div>
      </div>
      <div>
        <strong>${(item.preco_venda * item.quantidade).toFixed(2)} MT</strong>
        <button data-index="${index}" class="btn-icone excluir btn-remover-item" style="display:block; margin-top:4px;">Remover</button>
      </div>
    `;
    carrinhoDiv.appendChild(div);
  });

  document.querySelectorAll('.btn-aumentar').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = carrinho[btn.dataset.index];
      if (item.quantidade + 1 > item.estoque_disponivel) {
        alert('Estoque insuficiente.');
        return;
      }
      item.quantidade += 1;
      renderizarCarrinho();
    });
  });

  document.querySelectorAll('.btn-diminuir').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = carrinho[btn.dataset.index];
      item.quantidade -= 1;
      if (item.quantidade <= 0) {
        carrinho.splice(btn.dataset.index, 1);
      }
      renderizarCarrinho();
    });
  });

  document.querySelectorAll('.btn-remover-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      carrinho.splice(btn.dataset.index, 1);
      renderizarCarrinho();
    });
  });

  atualizarTotais();
}

// ===== CALCULAR TOTAIS E TROCO =====
function atualizarTotais() {
  const subtotal = carrinho.reduce((total, item) => total + (item.preco_venda * item.quantidade), 0);
  const desconto = parseFloat(campoDesconto.value) || 0;
  const total = Math.max(subtotal - desconto, 0);

  document.getElementById('pdv-subtotal').textContent = subtotal.toFixed(2) + ' MT';
  document.getElementById('pdv-desconto-exibido').textContent = desconto.toFixed(2) + ' MT';
  document.getElementById('pdv-total').textContent = total.toFixed(2) + ' MT';

  atualizarTroco(total);
}

function atualizarTroco(total) {
  const recebido = parseFloat(campoValorRecebido.value) || 0;
  const troco = recebido - total;
  document.getElementById('pdv-troco').textContent = (troco > 0 ? troco : 0).toFixed(2) + ' MT';
}

campoDesconto.addEventListener('input', atualizarTotais);
campoValorRecebido.addEventListener('input', () => {
  const subtotal = carrinho.reduce((total, item) => total + (item.preco_venda * item.quantidade), 0);
  const desconto = parseFloat(campoDesconto.value) || 0;
  atualizarTroco(Math.max(subtotal - desconto, 0));
});

// ===== FINALIZAR VENDA =====
document.getElementById('btn-finalizar-venda').addEventListener('click', async () => {
  const mensagemErro = document.getElementById('pdv-mensagem-erro');
  mensagemErro.textContent = '';

  if (carrinho.length === 0) {
    mensagemErro.textContent = 'Adicione ao menos um produto ao carrinho.';
    return;
  }

  const itensParaEnviar = carrinho.map((item) => ({
    produto_id: item.produto_id,
    quantidade: item.quantidade
  }));

  const desconto = parseFloat(campoDesconto.value) || 0;
  const clienteId = selectCliente.value || null;
  const formaPagamento = selectPagamento.value;
  const valorRecebido = parseFloat(campoValorRecebido.value) || null;
  const dataVencimento = formaPagamento === 'fiado' ? campoVencimentoVenda.value : null;

  if (formaPagamento === 'fiado' && !dataVencimento) {
    mensagemErro.textContent = 'Informe a data de vencimento para venda em dívida.';
    return;
  }

  if (formaPagamento === 'fiado' && !clienteId) {
    mensagemErro.textContent = 'Selecione um cliente para registrar venda em dívida.';
    return;
  }

  const { data, error } = await supabaseClient.rpc('registrar_venda', {
    p_caixa_id: caixaAberto.id,
    p_cliente_id: clienteId,
    p_itens: itensParaEnviar,
    p_desconto: desconto,
    p_forma_pagamento: formaPagamento,
    p_valor_recebido: valorRecebido,
    p_data_vencimento: dataVencimento
  });

  if (error) {
    mensagemErro.textContent = 'Erro: ' + error.message;
    return;
  }

  const nomeCliente = clienteId ? selectCliente.options[selectCliente.selectedIndex].textContent : null;
  const subtotal = carrinho.reduce((total, item) => total + (item.preco_venda * item.quantidade), 0);

  renderRecibo({
    tipoDocumento: 'Venda',
    numero: data,
    data: new Date().toISOString(),
    cliente: nomeCliente,
    funcionario: usuarioLogado.nome,
    itens: carrinho.map((item) => ({
      nome: item.nome,
      quantidade: item.quantidade,
      precoUnitario: item.preco_venda
    })),
    subtotal,
    desconto,
    total: subtotal - desconto,
    formaPagamento,
    valorRecebido,
    statusPagamento: formaPagamento === 'fiado' ? 'pendente' : 'pago',
    dataVencimento
  });

  carrinho = [];
  campoDesconto.value = '0';
  campoValorRecebido.value = '';
  campoVencimentoVenda.value = '';
  blocoVencimentoVenda.classList.add('escondido');
  renderizarCarrinho();
  carregarProdutos();
  carregarHistoricoVendas();
});

// ===== MONTAR E EXIBIR O RECIBO =====
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

  html += `<p><strong>${dados.tipoDocumento} #${String(dados.numero).padStart(4, '0')}</strong></p>`;
  html += `<p style="font-size:12px; color:#64748b;">${new Date(dados.data).toLocaleString('pt-BR')}</p>`;
  if (dados.cliente) html += `<p style="font-size:13px;">Cliente: ${escapeHTML(dados.cliente)}</p>`;
  if (dados.funcionario) html += `<p style="font-size:13px;">Atendido por: ${escapeHTML(dados.funcionario)}</p>`;
  html += `<br>`;

  if (dados.itens) {
    dados.itens.forEach((item) => {
      html += `<div class="recibo-linha">
        <span>${item.quantidade}x ${escapeHTML(item.nome)}</span>
        <span>${(item.precoUnitario * item.quantidade).toFixed(2)} MT</span>
      </div>`;
    });
    html += `<div class="recibo-linha"><span>Subtotal</span><span>${dados.subtotal.toFixed(2)} MT</span></div>`;
    html += `<div class="recibo-linha"><span>Desconto</span><span>${dados.desconto.toFixed(2)} MT</span></div>`;
  }

  html += `<div class="recibo-linha" style="font-weight:700;"><span>Total</span><span>${dados.total.toFixed(2)} MT</span></div>`;
  html += `<div class="recibo-linha"><span>Forma de pagamento</span><span>${NOMES_PAGAMENTO_VENDA[dados.formaPagamento] || dados.formaPagamento}</span></div>`;

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
  document.getElementById('modal-recibo').classList.remove('escondido');
}

document.getElementById('btn-fechar-recibo').addEventListener('click', () => {
  document.getElementById('modal-recibo').classList.add('escondido');
});

document.getElementById('btn-imprimir-recibo').addEventListener('click', () => {
  window.print();
});

// ===== HISTÓRICO DE VENDAS (com reimpressão) =====
let historicoVendasCache = [];

async function carregarHistoricoVendas() {
  const lista = document.getElementById('lista-historico-vendas');
  lista.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data, error } = await supabaseClient
    .from('vendas')
    .select('*, clientes(nome), usuarios(nome)')
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    lista.innerHTML = '<p class="lista-vazia">Erro ao carregar histórico.</p>';
    return;
  }

  historicoVendasCache = data;
  renderizarHistoricoVendas(data);
}

function renderizarHistoricoVendas(lista) {
  const container = document.getElementById('lista-historico-vendas');

  if (lista.length === 0) {
    container.innerHTML = '<p class="lista-vazia">Nenhuma venda encontrada.</p>';
    return;
  }

  container.innerHTML = '';
  lista.forEach((v) => {
    const nomeCliente = v.clientes ? v.clientes.nome : 'Sem cliente';
    const estaPendente = v.status_pagamento === 'pendente';
    const vencida = estaPendente && v.data_vencimento && new Date(v.data_vencimento + 'T23:59:59') < new Date();

    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div>
        <div class="relatorio-linha-titulo">Venda #${String(v.numero).padStart(4, '0')} - ${escapeHTML(nomeCliente)}</div>
        <div class="relatorio-linha-detalhe">${new Date(v.criado_em).toLocaleString('pt-BR')} • ${v.usuarios ? escapeHTML(v.usuarios.nome) : '-'}</div>
        ${estaPendente ? `<div class="relatorio-linha-detalhe ${vencida ? 'relatorio-diferenca-negativa' : ''}">
          ${vencida ? 'Vencida em' : 'Vence em'} ${v.data_vencimento ? new Date(v.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
        </div>` : ''}
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        ${estaPendente ? `<span class="situacao-tag ${vencida ? 'cancelado' : 'pendente'}">${vencida ? 'Vencida' : 'Pendente'}</span>` : `<span class="situacao-tag pronto">Pago</span>`}
        <strong>${Number(v.total).toFixed(2)} MT</strong>
        <button class="btn-icone ver-recibo-venda" data-id="${v.id}">Recibo</button>
        ${estaPendente ? `<button class="btn-icone marcar-paga-venda" data-id="${v.id}">Marcar Pago</button>` : ''}
      </div>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll('.ver-recibo-venda').forEach((btn) => {
    btn.addEventListener('click', () => reimprimirVenda(btn.dataset.id));
  });

document.querySelectorAll('.marcar-paga-venda').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('receber-divida-id').value = btn.dataset.id;
      document.getElementById('modal-receber-divida-erro').textContent = '';
      document.getElementById('modal-receber-divida').classList.remove('escondido');
    });
  });
}

// ===== MODAL: RECEBER PAGAMENTO DE DÍVIDA (venda) =====
document.getElementById('btn-cancelar-receber-divida').addEventListener('click', () => {
  document.getElementById('modal-receber-divida').classList.add('escondido');
});

document.getElementById('form-receber-divida').addEventListener('submit', async (event) => {
  event.preventDefault();
  const erro = document.getElementById('modal-receber-divida-erro');
  erro.textContent = '';

  const vendaId = document.getElementById('receber-divida-id').value;
  const forma = document.getElementById('receber-divida-forma').value;

  const { error } = await supabaseClient.rpc('marcar_venda_paga', {
    p_venda_id: vendaId,
    p_forma_pagamento_recebimento: forma
  });

  if (error) { erro.textContent = 'Erro: ' + error.message; return; }

  document.getElementById('modal-receber-divida').classList.add('escondido');
  carregarHistoricoVendas();
});

document.getElementById('busca-historico-venda').addEventListener('input', (event) => {
  const termo = event.target.value.toLowerCase().trim();
  const filtradas = historicoVendasCache.filter((v) =>
    String(v.numero).includes(termo) ||
    (v.clientes && v.clientes.nome.toLowerCase().includes(termo))
  );
  renderizarHistoricoVendas(filtradas);
});

async function reimprimirVenda(vendaId) {
  const { data: venda, error: erroVenda } = await supabaseClient
    .from('vendas')
    .select('*, clientes(nome), usuarios(nome)')
    .eq('id', vendaId)
    .single();

  if (erroVenda) { alert('Erro ao carregar venda: ' + erroVenda.message); return; }

  const { data: itens, error: erroItens } = await supabaseClient
    .from('itens_venda')
    .select('*, produtos(nome)')
    .eq('venda_id', vendaId);

  if (erroItens) { alert('Erro ao carregar itens: ' + erroItens.message); return; }

  renderRecibo({
    tipoDocumento: 'Venda',
    numero: venda.numero,
    data: venda.criado_em,
    cliente: venda.clientes ? venda.clientes.nome : null,
    funcionario: venda.usuarios ? venda.usuarios.nome : null,
    itens: itens.map((item) => ({
      nome: item.produtos ? item.produtos.nome : 'Produto removido',
      quantidade: item.quantidade,
      precoUnitario: item.preco_unitario
    })),
    subtotal: Number(venda.subtotal),
    desconto: Number(venda.desconto),
    total: Number(venda.total),
    formaPagamento: venda.forma_pagamento,
    valorRecebido: venda.valor_recebido,
    statusPagamento: venda.status_pagamento,
    dataVencimento: venda.data_vencimento
  });
}

// ===== INICIALIZAÇÃO =====
verificarCaixaAberto();
carregarFormasPagamentoAtivas();
carregarEmpresaRecibo();
carregarHistoricoVendas();