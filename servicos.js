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
const listaServicos = document.getElementById('lista-servicos');
const modalServico = document.getElementById('modal-servico');
const formServico = document.getElementById('form-servico');
const modalMensagemErro = document.getElementById('modal-mensagem-erro');
const selectCliente = document.getElementById('servico-cliente');
const selectTipo = document.getElementById('servico-tipo');
const selectCor = document.getElementById('servico-cor');
const blocoCor = document.getElementById('bloco-cor');
const blocoPaginas = document.getElementById('bloco-paginas');
const campoPaginas = document.getElementById('servico-paginas');
const campoValor = document.getElementById('servico-valor');
const campoValorRecebido = document.getElementById('servico-valor-recebido');
const btnNovoServico = document.getElementById('btn-novo-servico');
const avisoSemCaixa = document.getElementById('aviso-sem-caixa');
const filtroSituacao = document.getElementById('filtro-situacao');
const selectPagamento = document.getElementById('servico-pagamento');
const blocoVencimentoServico = document.getElementById('bloco-vencimento-servico');
const campoVencimentoServico = document.getElementById('servico-vencimento');

let servicosCache = [];
let situacaoAtiva = 'todos';
let tiposServicoCache = [];
let precosServicoCache = [];
let caixaAberto = null;
let dadosEmpresa = null;

const NOMES_SITUACAO = {
  pendente: 'Pendente', em_execucao: 'Em execução', pronto: 'Pronto',
  entregue: 'Entregue', cancelado: 'Cancelado'
};

const NOMES_PAGAMENTO_SERVICO = {
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
      blocoVencimentoServico.classList.remove('escondido');
      campoVencimentoServico.required = true;
    } else {
      blocoVencimentoServico.classList.add('escondido');
      campoVencimentoServico.required = false;
    }
  });
}

// ===== VERIFICAR CAIXA ABERTO =====
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
    btnNovoServico.classList.remove('escondido');
  } else {
    avisoSemCaixa.classList.remove('escondido');
    btnNovoServico.classList.add('escondido');
  }
}

// ===== CARREGAR TIPOS DE SERVIÇO =====
async function carregarTiposServico() {
  const { data, error } = await supabaseClient
    .from('tipos_servico')
    .select('*')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar tipos de serviço:', error); return; }

  tiposServicoCache = data;
  selectTipo.innerHTML = '<option value="">Selecione...</option>';
  data.forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo.chave;
    option.textContent = tipo.nome;
    selectTipo.appendChild(option);
  });
}

// ===== CARREGAR PREÇOS POR PÁGINA =====
async function carregarPrecosServico() {
  const { data, error } = await supabaseClient.from('precos_servico').select('*');
  if (error) { console.log('Erro ao carregar preços de serviço:', error); return; }
  precosServicoCache = data;
}

// ===== CARREGAR CLIENTES =====
async function carregarClientesSelect() {
  const { data, error } = await supabaseClient
    .from('clientes')
    .select('id, nome')
    .eq('ativo', true)
    .order('nome');

  if (error) { console.log('Erro ao carregar clientes:', error); return; }

  selectCliente.innerHTML = '<option value="">Sem cliente identificado</option>';
  data.forEach((cliente) => {
    const option = document.createElement('option');
    option.value = cliente.id;
    option.textContent = cliente.nome;
    selectCliente.appendChild(option);
  });
}

// ===== TIPO MUDOU: decide entre preço por página ou preço fixo =====
selectTipo.addEventListener('change', () => {
  const tipoSelecionado = selectTipo.value;
  const precosDoTipo = precosServicoCache.filter((p) => p.tipo === tipoSelecionado);

  // Caso 1: tipo tem preço por página cadastrado (impressão, fotocópia, etc.)
  if (precosDoTipo.length > 0) {
    blocoPaginas.classList.remove('escondido');
    blocoCor.classList.remove('escondido');

    selectCor.innerHTML = '<option value="">Selecione...</option>';
    precosDoTipo.forEach((p) => {
      const nomesCor = { pb: 'Preto e branco', colorido: 'Colorido', unica: 'Padrão' };
      const option = document.createElement('option');
      option.value = p.cor;
      option.textContent = nomesCor[p.cor] || p.cor;
      selectCor.appendChild(option);
    });

    calcularValorAutomatico();
    return;
  }

  // Caso 2: preço fixo (todos os demais serviços, incluindo Encadernação)
  blocoCor.classList.add('escondido');
  blocoPaginas.classList.add('escondido');

  const tipoInfo = tiposServicoCache.find((t) => t.chave === tipoSelecionado);
  if (tipoInfo && tipoInfo.preco_padrao !== null && tipoInfo.preco_padrao !== undefined) {
    campoValor.value = Number(tipoInfo.preco_padrao).toFixed(2);
  }
});

function calcularValorAutomatico() {
  const tipo = selectTipo.value;
  const cor = selectCor.value;
  const paginas = parseInt(campoPaginas.value) || 0;
  const preco = precosServicoCache.find((p) => p.tipo === tipo && p.cor === cor);
  if (preco && paginas > 0) {
    campoValor.value = (preco.preco_pagina * paginas).toFixed(2);
  }
}

selectCor.addEventListener('change', calcularValorAutomatico);
campoPaginas.addEventListener('input', calcularValorAutomatico);

// ===== TROCO EM TEMPO REAL =====
function atualizarDicaTroco() {
  const valor = parseFloat(campoValor.value) || 0;
  const recebido = parseFloat(campoValorRecebido.value) || 0;
  const dica = document.getElementById('servico-troco-dica');

  if (recebido > 0) {
    const troco = recebido - valor;
    dica.textContent = 'Troco: ' + (troco > 0 ? troco : 0).toFixed(2) + ' MT';
  } else {
    dica.textContent = '';
  }
}

campoValorRecebido.addEventListener('input', atualizarDicaTroco);
campoValor.addEventListener('input', atualizarDicaTroco);

// ===== CARREGAR SERVIÇOS =====
async function carregarServicos() {
  listaServicos.innerHTML = '<p class="lista-vazia">Carregando serviços...</p>';

  const { data, error } = await supabaseClient
    .from('servicos')
    .select('*, clientes(nome), usuarios(nome), tipos_servico(nome)')
    .order('criado_em', { ascending: false });

  if (error) {
    listaServicos.innerHTML = '<p class="lista-vazia">Erro ao carregar serviços.</p>';
    return;
  }

  servicosCache = data;
  renderizarServicos();
}

// ===== RENDERIZAR =====
function renderizarServicos() {
  const lista = situacaoAtiva === 'todos'
    ? servicosCache
    : servicosCache.filter((s) => s.situacao === situacaoAtiva);

  if (lista.length === 0) {
    listaServicos.innerHTML = '<p class="lista-vazia">Nenhum serviço encontrado.</p>';
    return;
  }

  listaServicos.innerHTML = '';

  lista.forEach((servico) => {
    const nomeCliente = servico.clientes ? servico.clientes.nome : 'Sem cliente';
    const nomeFuncionario = servico.usuarios ? servico.usuarios.nome : '-';
    const nomeTipo = servico.tipos_servico ? servico.tipos_servico.nome : servico.tipo;
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
          <span class="servico-numero">#${String(servico.numero).padStart(4, '0')}</span>
          <div class="servico-tipo">${escapeHTML(nomeTipo)} ${servico.paginas ? '• ' + servico.paginas + ' pág.' : ''} ${servico.descricao ? '• ' + escapeHTML(servico.descricao) : ''}</div>
          <div class="servico-detalhes">${escapeHTML(nomeCliente)} • ${escapeHTML(nomeFuncionario)} • ${dataFormatada}</div>
          ${estaPendente ? `<div class="servico-detalhes ${vencido ? 'relatorio-diferenca-negativa' : ''}">
            ${vencido ? 'Vencida em' : 'Vence em'} ${servico.data_vencimento ? new Date(servico.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR') : '-'}
          </div>` : ''}
        </div>
        <div class="servico-valor">${Number(servico.valor).toFixed(2)} MT</div>
      </div>
      <div class="servico-rodape">
        <div style="display:flex; gap:6px; align-items:center;">
          <span class="situacao-tag ${servico.situacao}">${NOMES_SITUACAO[servico.situacao]}</span>
          ${estaPendente ? `<span class="situacao-tag ${vencido ? 'cancelado' : 'pendente'}">${vencido ? 'Dívida vencida' : 'Dívida pendente'}</span>` : ''}
        </div>
        <div style="display:flex; gap:6px; align-items:center;">
          <button class="btn-icone ver-recibo-servico" data-id="${servico.id}">Recibo</button>
          ${estaPendente ? `<button class="btn-icone marcar-pago-servico" data-id="${servico.id}">Marcar Pago</button>` : ''}
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

  document.querySelectorAll('.ver-recibo-servico').forEach((btn) => {
    btn.addEventListener('click', () => reimprimirServico(btn.dataset.id));
  });

  document.querySelectorAll('.marcar-pago-servico').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('receber-divida-id').value = btn.dataset.id;
      document.getElementById('modal-receber-divida-erro').textContent = '';
      document.getElementById('modal-receber-divida').classList.remove('escondido');
    });
  });
}

// ===== MODAL: RECEBER PAGAMENTO DE DÍVIDA =====
document.getElementById('btn-cancelar-receber-divida').addEventListener('click', () => {
  document.getElementById('modal-receber-divida').classList.add('escondido');
});

document.getElementById('form-receber-divida').addEventListener('submit', async (event) => {
  event.preventDefault();
  const erro = document.getElementById('modal-receber-divida-erro');
  erro.textContent = '';

  const servicoId = document.getElementById('receber-divida-id').value;
  const forma = document.getElementById('receber-divida-forma').value;

  const { error } = await supabaseClient.rpc('marcar_servico_pago', {
    p_servico_id: servicoId,
    p_forma_pagamento_recebimento: forma
  });

  if (error) { erro.textContent = 'Erro: ' + error.message; return; }

  document.getElementById('modal-receber-divida').classList.add('escondido');
  carregarServicos();
});

filtroSituacao.addEventListener('click', (event) => {
  if (!event.target.classList.contains('aba')) return;
  document.querySelectorAll('.aba').forEach((aba) => aba.classList.remove('ativa'));
  event.target.classList.add('ativa');
  situacaoAtiva = event.target.dataset.situacao;
  renderizarServicos();
});

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

// ===== ABRIR / FECHAR MODAL =====
btnNovoServico.addEventListener('click', () => {
  formServico.reset();
  blocoCor.classList.add('escondido');
  blocoPaginas.classList.add('escondido');
  blocoVencimentoServico.classList.add('escondido');
  document.getElementById('servico-troco-dica').textContent = '';
  modalMensagemErro.textContent = '';
  modalServico.classList.remove('escondido');
});

document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modalServico.classList.add('escondido');
});

// ===== REGISTRAR SERVIÇO =====
formServico.addEventListener('submit', async (event) => {
  event.preventDefault();
  modalMensagemErro.textContent = '';

  const dadosServico = {
    tipo: selectTipo.value,
    cor: selectCor.value || null,
    paginas: parseInt(campoPaginas.value) || null,
    cliente_id: selectCliente.value || null,
    descricao: document.getElementById('servico-descricao').value.trim() || null,
    valor: parseFloat(campoValor.value),
    forma_pagamento: selectPagamento.value,
    valor_recebido: parseFloat(campoValorRecebido.value) || null,
    usuario_id: usuarioLogado.id,
    status_pagamento: selectPagamento.value === 'fiado' ? 'pendente' : 'pago',
    data_vencimento: selectPagamento.value === 'fiado' ? campoVencimentoServico.value : null
  };

  if (dadosServico.forma_pagamento === 'fiado' && !dadosServico.data_vencimento) {
    modalMensagemErro.textContent = 'Informe a data de vencimento para serviço em dívida.';
    return;
  }

  if (dadosServico.forma_pagamento === 'fiado' && !dadosServico.cliente_id) {
    modalMensagemErro.textContent = 'Selecione um cliente para registrar serviço em dívida.';
    return;
  }

  const { data: servicoInserido, error } = await supabaseClient
    .from('servicos')
    .insert(dadosServico)
    .select('*, clientes(nome)')
    .single();

  if (error) {
    modalMensagemErro.textContent = 'Erro: ' + error.message;
    return;
  }

  const nomeTipo = tiposServicoCache.find((t) => t.chave === dadosServico.tipo);

  renderRecibo({
    tipoDocumento: 'Serviço',
    numero: servicoInserido.numero,
    data: servicoInserido.criado_em,
    cliente: servicoInserido.clientes ? servicoInserido.clientes.nome : null,
    funcionario: usuarioLogado.nome,
    descricaoServico: (nomeTipo ? nomeTipo.nome : dadosServico.tipo) + (dadosServico.paginas ? ' - ' + dadosServico.paginas + ' pág.' : '') + (dadosServico.descricao ? ' - ' + dadosServico.descricao : ''),
    total: dadosServico.valor,
    formaPagamento: dadosServico.forma_pagamento,
    valorRecebido: dadosServico.valor_recebido,
    statusPagamento: dadosServico.status_pagamento,
    dataVencimento: dadosServico.data_vencimento
  });

  modalServico.classList.add('escondido');
  blocoVencimentoServico.classList.add('escondido');
  carregarServicos();
});

// ===== MONTAR E EXIBIR RECIBO =====
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

  if (dados.descricaoServico) {
    html += `<div class="recibo-linha"><span>${escapeHTML(dados.descricaoServico)}</span><span>${dados.total.toFixed(2)} MT</span></div>`;
  }

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
  document.getElementById('modal-recibo').classList.remove('escondido');
}

document.getElementById('btn-fechar-recibo').addEventListener('click', () => {
  document.getElementById('modal-recibo').classList.add('escondido');
});

document.getElementById('btn-imprimir-recibo').addEventListener('click', () => {
  window.print();
});

// ===== REIMPRIMIR RECIBO DE UM SERVIÇO JÁ REGISTRADO =====
async function reimprimirServico(id) {
  const { data: servico, error } = await supabaseClient
    .from('servicos')
    .select('*, clientes(nome), usuarios(nome), tipos_servico(nome)')
    .eq('id', id)
    .single();

  if (error) { alert('Erro ao carregar serviço: ' + error.message); return; }

  const nomeTipo = servico.tipos_servico ? servico.tipos_servico.nome : servico.tipo;

  renderRecibo({
    tipoDocumento: 'Serviço',
    numero: servico.numero,
    data: servico.criado_em,
    cliente: servico.clientes ? servico.clientes.nome : null,
    funcionario: servico.usuarios ? servico.usuarios.nome : null,
    descricaoServico: nomeTipo + (servico.paginas ? ' - ' + servico.paginas + ' pág.' : '') + (servico.descricao ? ' - ' + servico.descricao : ''),
    total: Number(servico.valor),
    formaPagamento: servico.forma_pagamento,
    valorRecebido: servico.valor_recebido,
    statusPagamento: servico.status_pagamento,
    dataVencimento: servico.data_vencimento
  });
}

// ===== INICIALIZAÇÃO =====
verificarCaixaAberto();
carregarTiposServico();
carregarPrecosServico();
carregarClientesSelect();
carregarServicos();
carregarFormasPagamentoAtivas();
carregarEmpresaRecibo();