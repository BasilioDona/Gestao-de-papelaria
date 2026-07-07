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
const listaClientes = document.getElementById('lista-clientes');
const campoBusca = document.getElementById('busca-cliente');
const modalCliente = document.getElementById('modal-cliente');
const formCliente = document.getElementById('form-cliente');
const modalTitulo = document.getElementById('modal-titulo');
const modalMensagemErro = document.getElementById('modal-mensagem-erro');
const modalHistorico = document.getElementById('modal-historico');

let clientesCache = [];

// ===== CARREGAR CLIENTES =====
async function carregarClientes() {
  listaClientes.innerHTML = '<p class="lista-vazia">Carregando clientes...</p>';

  const { data, error } = await supabaseClient
    .from('clientes')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) {
    listaClientes.innerHTML = '<p class="lista-vazia">Erro ao carregar clientes.</p>';
    console.log('Erro:', error);
    return;
  }

  clientesCache = data;
  renderizarClientes(clientesCache);
}

// ===== RENDERIZAR LISTA =====
function renderizarClientes(lista) {
  if (lista.length === 0) {
    listaClientes.innerHTML = '<p class="lista-vazia">Nenhum cliente encontrado.</p>';
    return;
  }

  listaClientes.innerHTML = '';

  lista.forEach((cliente) => {
    const div = document.createElement('div');
    div.className = 'cliente-item';
    div.innerHTML = `
      <div class="cliente-info" data-id="${cliente.id}">
        <div class="cliente-nome">${escapeHTML(cliente.nome)}</div>
        <div class="cliente-detalhes">${escapeHTML(cliente.telefone) || 'Sem telefone'} ${cliente.email ? '• ' + escapeHTML(cliente.email) : ''}</div>
      </div>
      <div class="cliente-acoes">
        <button class="btn-icone editar" data-id="${cliente.id}">✏️</button>
        ${ehAdmin ? `<button class="btn-icone excluir" data-id="${cliente.id}">🗑️</button>` : ''}
      </div>
    `;
    listaClientes.appendChild(div);
  });

  document.querySelectorAll('.cliente-info').forEach((el) => {
    el.addEventListener('click', () => abrirHistorico(el.dataset.id));
  });

  document.querySelectorAll('.btn-icone.editar').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      abrirModalEdicao(btn.dataset.id);
    });
  });

  if (ehAdmin) {
    document.querySelectorAll('.btn-icone.excluir').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        excluirCliente(btn.dataset.id);
      });
    });
  }
}

// ===== BUSCA =====
campoBusca.addEventListener('input', () => {
  const termo = campoBusca.value.toLowerCase().trim();

  const filtrados = clientesCache.filter((c) =>
    c.nome.toLowerCase().includes(termo) ||
    (c.telefone && c.telefone.includes(termo))
  );

  renderizarClientes(filtrados);
});

// ===== ABRIR MODAL: NOVO CLIENTE =====
document.getElementById('btn-novo-cliente').addEventListener('click', () => {
  formCliente.reset();
  document.getElementById('cliente-id').value = '';
  modalTitulo.textContent = 'Novo Cliente';
  modalMensagemErro.textContent = '';
  modalCliente.classList.remove('escondido');
});

// ===== ABRIR MODAL: EDITAR CLIENTE =====
function abrirModalEdicao(id) {
  const cliente = clientesCache.find((c) => c.id === id);
  if (!cliente) return;

  document.getElementById('cliente-id').value = cliente.id;
  document.getElementById('cliente-nome').value = cliente.nome;
  document.getElementById('cliente-telefone').value = cliente.telefone || '';
  document.getElementById('cliente-email').value = cliente.email || '';
  document.getElementById('cliente-endereco').value = cliente.endereco || '';
  document.getElementById('cliente-observacoes').value = cliente.observacoes || '';

  modalTitulo.textContent = 'Editar Cliente';
  modalMensagemErro.textContent = '';
  modalCliente.classList.remove('escondido');
}

// ===== FECHAR MODAL DE CADASTRO =====
document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalCliente.classList.add('escondido');
});

// ===== SALVAR (criar ou editar) =====
formCliente.addEventListener('submit', async (event) => {
  event.preventDefault();
  modalMensagemErro.textContent = '';

  const id = document.getElementById('cliente-id').value;

  const dadosCliente = {
    nome: document.getElementById('cliente-nome').value.trim(),
    telefone: document.getElementById('cliente-telefone').value.trim() || null,
    email: document.getElementById('cliente-email').value.trim() || null,
    endereco: document.getElementById('cliente-endereco').value.trim() || null,
    observacoes: document.getElementById('cliente-observacoes').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };

  let resultado;

  if (id) {
    resultado = await supabaseClient
      .from('clientes')
      .update(dadosCliente)
      .eq('id', id);
  } else {
    resultado = await supabaseClient
      .from('clientes')
      .insert(dadosCliente);
  }

  if (resultado.error) {
    modalMensagemErro.textContent = 'Erro: ' + resultado.error.message;
    return;
  }

  modalCliente.classList.add('escondido');
  carregarClientes();
});

// ===== EXCLUIR (soft delete) =====
async function excluirCliente(id) {
  const confirmar = confirm('Deseja realmente excluir este cliente?');
  if (!confirmar) return;

  const { error } = await supabaseClient
    .from('clientes')
    .update({ ativo: false })
    .eq('id', id);

  if (error) {
    alert('Erro ao excluir: ' + error.message);
    return;
  }

  carregarClientes();
}

// ===== HISTÓRICO DO CLIENTE (vendas e serviços) =====
async function abrirHistorico(id) {
  const cliente = clientesCache.find((c) => c.id === id);
  if (!cliente) return;

  // Usamos textContent aqui (não innerHTML), que já é seguro contra XSS por natureza
  document.getElementById('historico-titulo').textContent = cliente.nome;
  document.getElementById('historico-contato').textContent =
    `${cliente.telefone || 'Sem telefone'} ${cliente.email ? '• ' + cliente.email : ''}`;

  const conteudo = document.getElementById('historico-conteudo');
  conteudo.innerHTML = '<p class="lista-vazia">Carregando histórico...</p>';
  modalHistorico.classList.remove('escondido');

  const [{ data: vendas }, { data: servicos }] = await Promise.all([
    supabaseClient.from('vendas').select('id, numero, total, criado_em, status_pagamento, data_vencimento').eq('cliente_id', id).eq('status', 'concluida').order('criado_em', { ascending: false }),
    supabaseClient.from('servicos').select('id, numero, valor, criado_em, situacao, status_pagamento, data_vencimento, tipos_servico(nome)').eq('cliente_id', id).order('criado_em', { ascending: false })
  ]);

  let html = '';

  function linhaPagamento(numero, valor, dataCriacao, statusPagamento, dataVencimento, detalheExtra) {
    const estaPendente = statusPagamento === 'pendente';
    const vencido = estaPendente && dataVencimento && new Date(dataVencimento + 'T23:59:59') < new Date();
    return `
      <div class="relatorio-linha">
        <div>
          <div class="relatorio-linha-titulo">${numero}</div>
          <div class="relatorio-linha-detalhe">${new Date(dataCriacao).toLocaleDateString('pt-BR')} ${detalheExtra || ''}</div>
          ${estaPendente ? `<div class="relatorio-linha-detalhe ${vencido ? 'relatorio-diferenca-negativa' : ''}">
            ${vencido ? 'Vencida em' : 'Vence em'} ${dataVencimento ? new Date(dataVencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
          </div>` : ''}
        </div>
        <div style="text-align:right;">
          <div>${estaPendente ? `<span class="situacao-tag ${vencido ? 'cancelado' : 'pendente'}">${vencido ? 'Vencida' : 'Pendente'}</span>` : `<span class="situacao-tag pronto">Pago</span>`}</div>
          <strong>${Number(valor).toFixed(2)} MT</strong>
        </div>
      </div>
    `;
  }

  if ((vendas && vendas.length > 0) || (servicos && servicos.length > 0)) {
    const totalDividaVendas = (vendas || []).filter((v) => v.status_pagamento === 'pendente').reduce((t, v) => t + Number(v.total), 0);
    const totalDividaServicos = (servicos || []).filter((s) => s.status_pagamento === 'pendente').reduce((t, s) => t + Number(s.valor), 0);
    const totalDivida = totalDividaVendas + totalDividaServicos;

    if (totalDivida > 0) {
      html += `<div class="relatorio-linha" style="background:#fef3c7; font-weight:700; margin-bottom:8px;">
        <span>Total em dívida pendente</span><span>${totalDivida.toFixed(2)} MT</span>
      </div>`;
    }

    if (vendas && vendas.length > 0) {
      html += vendas.map((v) => linhaPagamento(
        'Venda #' + String(v.numero).padStart(4, '0'), v.total, v.criado_em, v.status_pagamento, v.data_vencimento
      )).join('');
    }
    if (servicos && servicos.length > 0) {
      html += servicos.map((s) => linhaPagamento(
        'Serviço #' + String(s.numero).padStart(4, '0') + (s.tipos_servico ? ' - ' + s.tipos_servico.nome : ''),
        s.valor, s.criado_em, s.status_pagamento, s.data_vencimento, '• ' + s.situacao
      )).join('');
    }
    conteudo.innerHTML = html;
  } else {
    conteudo.innerHTML = '<p class="lista-vazia">Nenhuma venda ou serviço registrado para este cliente.</p>';
  }
}

document.getElementById('btn-fechar-historico').addEventListener('click', () => {
  modalHistorico.classList.add('escondido');
});

// ===== INICIALIZAÇÃO =====
carregarClientes();