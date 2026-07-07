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
const areaSemCaixa = document.getElementById('area-sem-caixa');
const areaCaixaAberto = document.getElementById('area-caixa-aberto');
const areaAdminCaixas = document.getElementById('area-admin-caixas');

let caixaAtual = null;
let movCaixaCache = [];
let valorEsperadoAtual = 0;
let saldoMovimentacoesAtual = 0;

// Formas que representam dinheiro/valor efetivamente recebido.
// "fiado" fica de fora de propósito: é uma promessa de pagamento, não caixa.
const NOMES_PAGAMENTO = {
  dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'e-Mola', transferencia: 'Transferência Bancária'
};

// ===== VERIFICAR SE HÁ CAIXA ABERTO PARA ESTE USUÁRIO =====
async function verificarCaixa() {
  const { data, error } = await supabaseClient
    .from('caixas')
    .select('*')
    .eq('usuario_id', usuarioLogado.id)
    .eq('status', 'aberto')
    .maybeSingle();

  if (error) {
    console.log('Erro ao verificar caixa:', error);
    return;
  }

  caixaAtual = data;

  if (caixaAtual) {
    areaSemCaixa.classList.add('escondido');
    areaCaixaAberto.classList.remove('escondido');
    document.getElementById('info-valor-abertura').textContent =
      Number(caixaAtual.valor_abertura).toFixed(2) + ' MT';
    carregarMovimentacoesCaixa();
    carregarResumoVendasEServicos();
  } else {
    areaCaixaAberto.classList.add('escondido');
    areaSemCaixa.classList.remove('escondido');
  }

  if (ehAdmin) {
    areaAdminCaixas.classList.remove('escondido');
    carregarTodosCaixas();
  }
}

// ===== ABRIR CAIXA =====
document.getElementById('btn-abrir-caixa').addEventListener('click', async () => {
  const valorAbertura = parseFloat(document.getElementById('valor-abertura').value) || 0;
  const observacoes = document.getElementById('obs-abertura').value.trim() || null;

  const { error } = await supabaseClient
    .from('caixas')
    .insert({
      usuario_id: usuarioLogado.id,
      valor_abertura: valorAbertura,
      observacoes_abertura: observacoes
    });

  if (error) {
    alert('Erro ao abrir caixa: ' + error.message);
    return;
  }

  verificarCaixa();
  carregarMeuHistorico();
});

// ===== RESUMO DE VENDAS, SERVIÇOS E RECEBIMENTOS DE DÍVIDA DO CAIXA ATUAL =====
async function carregarResumoVendasEServicos() {
  const [
    { data: vendas, error: erroVendas },
    { data: servicos, error: erroServicos },
    { data: dividasVendas, error: erroDividasVendas },
    { data: dividasServicos, error: erroDividasServicos }
  ] = await Promise.all([
    // Vendas/serviços originados neste caixa (venda normal ou dívida em aberto)
    supabaseClient.from('vendas').select('total, forma_pagamento, status_pagamento').eq('caixa_id', caixaAtual.id).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('valor, forma_pagamento, status_pagamento').eq('caixa_id', caixaAtual.id).neq('situacao', 'cancelado'),
    // Dívidas (de qualquer origem) recebidas/quitadas NESTE caixa
    supabaseClient.from('vendas').select('numero, total, forma_pagamento_recebimento, clientes(nome)').eq('caixa_pagamento_id', caixaAtual.id).eq('status_pagamento', 'pago'),
    supabaseClient.from('servicos').select('numero, valor, forma_pagamento_recebimento, clientes(nome)').eq('caixa_pagamento_id', caixaAtual.id).eq('status_pagamento', 'pago')
  ]);

  if (erroVendas) console.log('Erro ao carregar vendas do caixa:', erroVendas);
  if (erroServicos) console.log('Erro ao carregar serviços do caixa:', erroServicos);

  const listaVendas = vendas || [];
  const listaServicos = servicos || [];
  const listaDividasVendas = dividasVendas || [];
  const listaDividasServicos = dividasServicos || [];

  // Resumo por forma de pagamento — inclui vendas/serviços normais DESTE caixa
  // + recebimentos de dívida (de qualquer venda/serviço) recebidos NESTE caixa
  const resumo = {};
  Object.keys(NOMES_PAGAMENTO).forEach((forma) => { resumo[forma] = { vendas: 0, servicos: 0 }; });

  let totalDividaAbertaVendas = 0;
  let totalDividaAbertaServicos = 0;

  listaVendas.forEach((v) => {
    if (v.forma_pagamento === 'fiado') {
      // Só conta como "dívida em aberto registada aqui" se ainda não foi paga
      if (v.status_pagamento === 'pendente') totalDividaAbertaVendas += Number(v.total);
      return;
    }
    if (resumo[v.forma_pagamento]) resumo[v.forma_pagamento].vendas += Number(v.total);
  });

  listaServicos.forEach((s) => {
    if (s.forma_pagamento === 'fiado') {
      if (s.status_pagamento === 'pendente') totalDividaAbertaServicos += Number(s.valor);
      return;
    }
    const forma = s.forma_pagamento || 'outros';
    if (!resumo[forma]) resumo[forma] = { vendas: 0, servicos: 0 };
    resumo[forma].servicos += Number(s.valor);
  });

  // Soma os recebimentos de dívida ao resumo por forma de pagamento
  let totalDividasRecebidasDinheiro = 0;
  listaDividasVendas.forEach((v) => {
    const forma = v.forma_pagamento_recebimento;
    if (resumo[forma]) resumo[forma].vendas += Number(v.total);
    if (forma === 'dinheiro') totalDividasRecebidasDinheiro += Number(v.total);
  });
  listaDividasServicos.forEach((s) => {
    const forma = s.forma_pagamento_recebimento;
    if (resumo[forma]) resumo[forma].servicos += Number(s.valor);
    if (forma === 'dinheiro') totalDividasRecebidasDinheiro += Number(s.valor);
  });

  const totalVendasDinheiro = resumo.dinheiro.vendas;
  const totalServicosDinheiro = resumo.dinheiro.servicos;

  document.getElementById('info-vendas-dinheiro').textContent = totalVendasDinheiro.toFixed(2) + ' MT';
  document.getElementById('info-servicos-dinheiro').textContent = totalServicosDinheiro.toFixed(2) + ' MT';
  document.getElementById('info-dividas-recebidas-dinheiro').textContent = totalDividasRecebidasDinheiro.toFixed(2) + ' MT';

  // Renderiza o resumo por forma de pagamento (já inclui recebimentos de dívida)
  const container = document.getElementById('resumo-formas-pagamento');
  container.innerHTML = '';
  Object.keys(resumo).forEach((forma) => {
    const total = resumo[forma].vendas + resumo[forma].servicos;
    if (total === 0) return;
    const div = document.createElement('div');
    div.className = 'mov-caixa-item';
    div.innerHTML = `
      <span>${NOMES_PAGAMENTO[forma] || forma}</span>
      <strong>${total.toFixed(2)} MT</strong>
    `;
    container.appendChild(div);
  });
  if (container.innerHTML === '') {
    container.innerHTML = '<p class="lista-vazia">Nenhum valor recebido neste caixa ainda.</p>';
  }

  // Bloco de dívidas EM ABERTO registadas neste caixa (originadas aqui, ainda não pagas)
  const totalDividaAberta = totalDividaAbertaVendas + totalDividaAbertaServicos;
  const blocoDividas = document.getElementById('bloco-dividas-caixa');
  if (totalDividaAberta > 0) {
    document.getElementById('info-total-dividas-caixa').textContent = totalDividaAberta.toFixed(2) + ' MT';
    blocoDividas.classList.remove('escondido');
  } else {
    blocoDividas.classList.add('escondido');
  }

  // Lista de dívidas RECEBIDAS neste caixa (podem ter sido vendidas em outro dia/caixa)
  const listaRecebimentos = document.getElementById('lista-dividas-recebidas');
  const todosRecebimentos = [
    ...listaDividasVendas.map((v) => ({ tipo: 'Venda', numero: v.numero, valor: v.total, forma: v.forma_pagamento_recebimento, cliente: v.clientes ? v.clientes.nome : '-' })),
    ...listaDividasServicos.map((s) => ({ tipo: 'Serviço', numero: s.numero, valor: s.valor, forma: s.forma_pagamento_recebimento, cliente: s.clientes ? s.clientes.nome : '-' }))
  ];

  if (todosRecebimentos.length > 0) {
    listaRecebimentos.innerHTML = todosRecebimentos.map((r) => `
      <div class="mov-caixa-item">
        <div>
          <strong>${r.tipo} #${String(r.numero).padStart(4, '0')}</strong> - ${escapeHTML(r.cliente)}
          <div class="mov-detalhes">${NOMES_PAGAMENTO[r.forma] || r.forma}</div>
        </div>
        <span style="color:#16a34a; font-weight:700;">+ ${Number(r.valor).toFixed(2)} MT</span>
      </div>
    `).join('');
  } else {
    listaRecebimentos.innerHTML = '<p class="lista-vazia">Nenhum recebimento de dívida neste caixa ainda.</p>';
  }

  atualizarValorEsperado(totalVendasDinheiro, totalServicosDinheiro, totalDividasRecebidasDinheiro);
}



// ===== CALCULA E EXIBE O VALOR ESPERADO EM CAIXA =====
// Dívida nunca entra aqui — só dinheiro efetivamente recebido + abertura + movimentações
// ===== CALCULA E EXIBE O VALOR ESPERADO EM CAIXA =====
function atualizarValorEsperado(totalVendasDinheiro, totalServicosDinheiro, totalDividasRecebidasDinheiro) {
  const abertura = Number(caixaAtual.valor_abertura);
  const dividas = totalDividasRecebidasDinheiro || 0;
  valorEsperadoAtual = abertura + totalVendasDinheiro + totalServicosDinheiro + saldoMovimentacoesAtual;
  document.getElementById('info-valor-esperado').textContent = valorEsperadoAtual.toFixed(2) + ' MT';
}


// ===== CARREGAR MOVIMENTAÇÕES DO CAIXA ATUAL =====
async function carregarMovimentacoesCaixa() {
  const { data, error } = await supabaseClient
    .from('movimentacoes_caixa')
    .select('*')
    .eq('caixa_id', caixaAtual.id)
    .order('criado_em', { ascending: false });

  if (error) {
    console.log('Erro ao carregar movimentações:', error);
    return;
  }

  movCaixaCache = data;

  const lista = document.getElementById('lista-mov-caixa');

  if (data.length === 0) {
    lista.innerHTML = '<p class="lista-vazia">Nenhuma movimentação neste caixa.</p>';
  } else {
    lista.innerHTML = '';
    data.forEach((mov) => {
      const div = document.createElement('div');
      div.className = 'mov-caixa-item';
      div.innerHTML = `
        <div>
          <strong>${mov.tipo === 'sangria' ? 'Sangria' : 'Suprimento'}</strong>
          ${mov.motivo ? '- ' + escapeHTML(mov.motivo) : ''}
        </div>
        <span style="color: ${mov.tipo === 'sangria' ? '#dc2626' : '#16a34a'}; font-weight:700;">
          ${mov.tipo === 'sangria' ? '-' : '+'} ${Number(mov.valor).toFixed(2)} MT
        </span>
      `;
      lista.appendChild(div);
    });
  }

  saldoMovimentacoesAtual = data.reduce((total, mov) => {
    return mov.tipo === 'suprimento' ? total + Number(mov.valor) : total - Number(mov.valor);
  }, 0);

  document.getElementById('info-saldo-movimentacoes').textContent = saldoMovimentacoesAtual.toFixed(2) + ' MT';

const totalVendasDinheiro = parseFloat(document.getElementById('info-vendas-dinheiro').textContent) || 0;
  const totalServicosDinheiro = parseFloat(document.getElementById('info-servicos-dinheiro').textContent) || 0;
  const totalDividasRecebidasDinheiro = parseFloat(document.getElementById('info-dividas-recebidas-dinheiro').textContent) || 0;
  atualizarValorEsperado(totalVendasDinheiro, totalServicosDinheiro, totalDividasRecebidasDinheiro);
}

// ===== MODAL: NOVA MOVIMENTAÇÃO DE CAIXA =====
const modalMovCaixa = document.getElementById('modal-mov-caixa');

document.getElementById('btn-nova-mov-caixa').addEventListener('click', () => {
  document.getElementById('form-mov-caixa').reset();
  document.getElementById('modal-mov-mensagem-erro').textContent = '';
  modalMovCaixa.classList.remove('escondido');
});

document.getElementById('btn-cancelar-mov-caixa').addEventListener('click', () => {
  modalMovCaixa.classList.add('escondido');
});

document.getElementById('form-mov-caixa').addEventListener('submit', async (event) => {
  event.preventDefault();

  const tipo = document.getElementById('mov-caixa-tipo').value;
  const valor = parseFloat(document.getElementById('mov-caixa-valor').value);
  const motivo = document.getElementById('mov-caixa-motivo').value.trim() || null;

  const { error } = await supabaseClient
    .from('movimentacoes_caixa')
    .insert({
      caixa_id: caixaAtual.id,
      tipo: tipo,
      valor: valor,
      motivo: motivo,
      usuario_id: usuarioLogado.id
    });

  if (error) {
    document.getElementById('modal-mov-mensagem-erro').textContent = 'Erro: ' + error.message;
    return;
  }

  modalMovCaixa.classList.add('escondido');
  carregarMovimentacoesCaixa();
});

// ===== MODAL: FECHAR CAIXA =====
const modalFecharCaixa = document.getElementById('modal-fechar-caixa');
const campoValorFechamento = document.getElementById('valor-fechamento');

document.getElementById('btn-fechar-caixa').addEventListener('click', () => {
  document.getElementById('form-fechar-caixa').reset();
  document.getElementById('modal-mensagem-erro').textContent = '';
  document.getElementById('fechamento-diferenca').textContent = '';
  document.getElementById('fechamento-valor-esperado').textContent = valorEsperadoAtual.toFixed(2) + ' MT';
  modalFecharCaixa.classList.remove('escondido');
});

campoValorFechamento.addEventListener('input', () => {
  const contado = parseFloat(campoValorFechamento.value) || 0;
  const diferenca = contado - valorEsperadoAtual;
  const elDiferenca = document.getElementById('fechamento-diferenca');

  if (diferenca === 0) {
    elDiferenca.textContent = 'Confere exatamente com o valor esperado.';
    elDiferenca.style.color = '#16a34a';
  } else if (diferenca > 0) {
    elDiferenca.textContent = `Sobra de ${diferenca.toFixed(2)} MT em relação ao esperado.`;
    elDiferenca.style.color = '#2563eb';
  } else {
    elDiferenca.textContent = `Falta de ${Math.abs(diferenca).toFixed(2)} MT em relação ao esperado.`;
    elDiferenca.style.color = '#dc2626';
  }
});

document.getElementById('btn-cancelar-fechamento').addEventListener('click', () => {
  modalFecharCaixa.classList.add('escondido');
});

document.getElementById('form-fechar-caixa').addEventListener('submit', async (event) => {
  event.preventDefault();

  const valorFechamento = parseFloat(campoValorFechamento.value);
  const observacoesDigitadas = document.getElementById('obs-fechamento').value.trim();
  const diferenca = valorFechamento - valorEsperadoAtual;

  let observacoesFinal = observacoesDigitadas;
  if (diferenca !== 0) {
    const textoDiferenca = diferenca > 0
      ? `Sobra de ${diferenca.toFixed(2)} MT`
      : `Falta de ${Math.abs(diferenca).toFixed(2)} MT`;
    observacoesFinal = observacoesFinal ? `${observacoesFinal} (${textoDiferenca})` : textoDiferenca;
  }

  const { error } = await supabaseClient
    .from('caixas')
    .update({
      status: 'fechado',
      valor_fechamento: valorFechamento,
      observacoes_fechamento: observacoesFinal || null,
      fechado_em: new Date().toISOString()
    })
    .eq('id', caixaAtual.id);

  if (error) {
    document.getElementById('modal-mensagem-erro').textContent = 'Erro: ' + error.message;
    return;
  }

  modalFecharCaixa.classList.add('escondido');
  verificarCaixa();
  carregarMeuHistorico();
});

// ===== HISTÓRICO DE CAIXAS DO PRÓPRIO USUÁRIO =====
async function carregarMeuHistorico() {
  const { data, error } = await supabaseClient
    .from('caixas')
    .select('*')
    .eq('usuario_id', usuarioLogado.id)
    .order('aberto_em', { ascending: false })
    .limit(30);

  if (error) {
    console.log('Erro ao carregar histórico:', error);
    return;
  }

  const container = document.getElementById('lista-meu-historico');

  if (data.length === 0) {
    container.innerHTML = '<p class="lista-vazia">Nenhum caixa no histórico ainda.</p>';
    return;
  }

  container.innerHTML = '';

  data.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'caixa-item';
    div.innerHTML = `
      <div>
        <div class="mov-detalhes">
          Abertura: ${Number(c.valor_abertura).toFixed(2)} MT
          ${c.valor_fechamento !== null ? ' • Fechamento: ' + Number(c.valor_fechamento).toFixed(2) + ' MT' : ''}
          <br>${new Date(c.aberto_em).toLocaleString('pt-BR')}
          ${c.fechado_em ? ' até ' + new Date(c.fechado_em).toLocaleString('pt-BR') : ''}
          ${c.observacoes_fechamento ? '<br>Obs: ' + escapeHTML(c.observacoes_fechamento) : ''}
        </div>
      </div>
      <span class="caixa-status-tag ${c.status}">${c.status}</span>
    `;
    container.appendChild(div);
  });
}

// ===== ÁREA ADMIN: TODOS OS CAIXAS =====
let todosCaixasCache = [];
let filtroStatusAtivo = 'todos';

async function carregarTodosCaixas() {
  const { data, error } = await supabaseClient
    .from('caixas')
    .select('*, usuarios(nome)')
    .order('aberto_em', { ascending: false });

  if (error) {
    console.log('Erro ao carregar caixas:', error);
    return;
  }

  todosCaixasCache = data;
  renderizarTodosCaixas();
}

function renderizarTodosCaixas() {
  const lista = todosCaixasCache.filter((c) =>
    filtroStatusAtivo === 'todos' ? true : c.status === filtroStatusAtivo
  );

  const container = document.getElementById('lista-todos-caixas');

  if (lista.length === 0) {
    container.innerHTML = '<p class="lista-vazia">Nenhum caixa encontrado.</p>';
    return;
  }

  container.innerHTML = '';

  lista.forEach((c) => {
    const nomeFuncionario = c.usuarios ? c.usuarios.nome : '-';
    const div = document.createElement('div');
    div.className = 'caixa-item';
    div.innerHTML = `
      <div>
        <strong>${escapeHTML(nomeFuncionario)}</strong>
        <div class="mov-detalhes">
          Abertura: ${Number(c.valor_abertura).toFixed(2)} MT
          ${c.valor_fechamento !== null ? ' • Fechamento: ' + Number(c.valor_fechamento).toFixed(2) + ' MT' : ''}
          • ${new Date(c.aberto_em).toLocaleString('pt-BR')}
          ${c.observacoes_fechamento ? '<br>Obs: ' + escapeHTML(c.observacoes_fechamento) : ''}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="caixa-status-tag ${c.status}">${c.status}</span>
        ${c.status === 'aberto' ? `<button class="btn-icone fechar-admin" data-id="${c.id}">Fechar</button>` : ''}
        ${c.status === 'fechado' ? `<button class="btn-icone reabrir-admin" data-id="${c.id}">Reabrir</button>` : ''}
      </div>
    `;
    container.appendChild(div);
  });

  document.querySelectorAll('.fechar-admin').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const valor = prompt('Valor contado no fechamento (MT):', '0');
      if (valor === null) return;

      const { error } = await supabaseClient
        .from('caixas')
        .update({ status: 'fechado', valor_fechamento: parseFloat(valor) || 0, fechado_em: new Date().toISOString() })
        .eq('id', btn.dataset.id);

      if (error) { alert('Erro: ' + error.message); return; }
      carregarTodosCaixas();
      verificarCaixa();
      carregarMeuHistorico();
    });
  });

  document.querySelectorAll('.reabrir-admin').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const confirmar = confirm('Deseja reabrir este caixa?');
      if (!confirmar) return;

      const { error } = await supabaseClient
        .from('caixas')
        .update({ status: 'aberto', fechado_em: null })
        .eq('id', btn.dataset.id);

      if (error) { alert('Erro: ' + error.message); return; }
      carregarTodosCaixas();
      verificarCaixa();
      carregarMeuHistorico();
    });
  });
}

document.querySelector('#area-admin-caixas .filtro-abas').addEventListener('click', (event) => {
  if (!event.target.classList.contains('aba')) return;
  document.querySelectorAll('#area-admin-caixas .aba').forEach((a) => a.classList.remove('ativa'));
  event.target.classList.add('ativa');
  filtroStatusAtivo = event.target.dataset.status;
  renderizarTodosCaixas();
});

// ===== INICIALIZAÇÃO =====
verificarCaixa();
carregarMeuHistorico();