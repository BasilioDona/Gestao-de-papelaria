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

// ===== MENU MOBILE (recolhível) =====
document.getElementById('btn-menu-toggle').addEventListener('click', () => {
  document.getElementById('menu-lateral').classList.toggle('menu-aberto');
});
document.querySelectorAll('#menu-lateral a').forEach((link) => {
  link.addEventListener('click', () => document.getElementById('menu-lateral').classList.remove('menu-aberto'));
});

const NOMES_PAGAMENTO_DASH = {
  dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'e-Mola', transferencia: 'Transferência Bancária', fiado: 'Fiado'
};

const CORES_PAGAMENTO = {
  dinheiro: { bg: '#dcfce7', texto: '#16a34a', barra: '#16a34a' },
  mpesa: { bg: '#fee2e2', texto: '#dc2626', barra: '#dc2626' },
  emola: { bg: '#fef3c7', texto: '#d97706', barra: '#d97706' },
  transferencia: { bg: '#dbeafe', texto: '#2563eb', barra: '#2563eb' },
  fiado: { bg: '#ede9fe', texto: '#7c3aed', barra: '#7c3aed' }
};

let graficoBarras = null;
let graficoPizza = null;
let graficoLinha = null;
let graficoComparativo = null;

// =========================================================
// RELÓGIO E SAUDAÇÃO DINÂMICA
// =========================================================
function atualizarRelogioSaudacao() {
  const agora = new Date();
  const hora = agora.getHours();

  let saudacao = 'Boa noite';
  if (hora >= 5 && hora < 12) saudacao = 'Bom dia';
  else if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';

  document.getElementById('dash-saudacao').textContent = `${saudacao}, ${usuarioLogado.nome.split(' ')[0]}`;
  document.getElementById('dash-hora').textContent = agora.toLocaleTimeString('pt-BR');
  document.getElementById('dash-data').textContent = agora.toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

atualizarRelogioSaudacao();
setInterval(atualizarRelogioSaudacao, 1000);

// =========================================================
// ORQUESTRADOR PRINCIPAL
// =========================================================
async function carregarDashboard() {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date();
  fimHoje.setHours(23, 59, 59, 999);
  const inicioISO = inicioHoje.toISOString();
  const fimISO = fimHoje.toISOString();

  const inicioOntem = new Date(inicioHoje);
  inicioOntem.setDate(inicioOntem.getDate() - 1);
  const fimOntem = new Date(inicioHoje.getTime() - 1);

  // ----- Vendas e serviços de hoje -----
  let queryVendas = supabaseClient
    .from('vendas')
    .select('numero, total, forma_pagamento, status_pagamento, criado_em, clientes(nome)')
    .gte('criado_em', inicioISO)
    .lte('criado_em', fimISO)
    .eq('status', 'concluida')
    .order('criado_em', { ascending: false });

  let queryServicos = supabaseClient
    .from('servicos')
    .select('numero, valor, forma_pagamento, status_pagamento, criado_em, situacao, clientes(nome), tipos_servico(nome), pedido_id')
    .gte('criado_em', inicioISO)
    .lte('criado_em', fimISO)
    .neq('situacao', 'cancelado')
    .order('criado_em', { ascending: false });

  let queryVendasOntem = supabaseClient
    .from('vendas')
    .select('total')
    .gte('criado_em', inicioOntem.toISOString())
    .lte('criado_em', fimOntem.toISOString())
    .eq('status', 'concluida');

  if (!ehAdmin) {
    queryVendas = queryVendas.eq('usuario_id', usuarioLogado.id);
    queryServicos = queryServicos.eq('usuario_id', usuarioLogado.id);
    queryVendasOntem = queryVendasOntem.eq('usuario_id', usuarioLogado.id);
  }

  const [
    { data: vendasHoje, error: erroVendas },
    { data: servicosHoje, error: erroServicos },
    { data: vendasOntem }
  ] = await Promise.all([queryVendas, queryServicos, queryVendasOntem]);

  const listaVendas = vendasHoje || [];
  const listaServicos = servicosHoje || [];

  const { data: produtos } = await supabaseClient
    .from('produtos')
    .select('nome, quantidade, estoque_minimo')
    .eq('ativo', true);

  const emFalta = (produtos || []).filter((p) => p.quantidade <= p.estoque_minimo);

  const { data: caixaAtual } = await supabaseClient
    .from('caixas')
    .select('id')
    .eq('usuario_id', usuarioLogado.id)
    .eq('status', 'aberto')
    .maybeSingle();

  // Executa todas as seções em paralelo, reaproveitando os dados já buscados
  renderizarCardsPrincipais(listaVendas, listaServicos, emFalta, caixaAtual, vendasOntem || []);
  renderizarResumoFinanceiro(listaVendas, listaServicos);
  renderizarFormasPagamento(listaVendas, listaServicos);
  renderizarListasTransacoes(listaVendas, listaServicos);
  renderizarGraficoBarras(listaVendas, listaServicos);
  renderizarGraficoPizza(listaVendas, listaServicos);

  if (ehAdmin) {
    document.getElementById('area-alertas-admin').classList.remove('escondido');
    document.getElementById('area-indicadores-rapidos').classList.remove('escondido');
    carregarAlertasAdmin();
    carregarIndicadoresRapidos();
  }

  carregarGraficosSemanais();
}

// =========================================================
// CARDS PRINCIPAIS (com tendência)
// =========================================================
function renderizarCardsPrincipais(vendas, servicos, emFalta, caixaAtual, vendasOntem) {
  const totalVendido = vendas.reduce((soma, v) => soma + Number(v.total), 0);
  const totalOntem = vendasOntem.reduce((soma, v) => soma + Number(v.total), 0);

  document.getElementById('card-vendido-hoje').textContent = totalVendido.toFixed(2) + ' MT';

  const trendVendas = document.getElementById('trend-vendido-hoje');
  if (totalOntem > 0) {
    const variacao = ((totalVendido - totalOntem) / totalOntem) * 100;
    const subiu = variacao >= 0;
    trendVendas.innerHTML = `<span class="dash-trend-badge ${subiu ? 'dash-trend-up' : 'dash-trend-down'}">${subiu ? '▲' : '▼'} ${Math.abs(variacao).toFixed(0)}%</span>`;
  } else if (totalVendido > 0) {
    trendVendas.innerHTML = `<span class="dash-trend-badge dash-trend-up">▲ Novo</span>`;
  } else {
    trendVendas.innerHTML = '';
  }

  document.getElementById('card-servicos-hoje').textContent = servicos.length;
  document.getElementById('trend-servicos-hoje').innerHTML = servicos.length > 0
    ? `<span class="dash-trend-badge dash-trend-neutro">${servicos.length} hoje</span>` : '';

  document.getElementById('card-produtos-falta').textContent = emFalta.length;
  document.getElementById('trend-produtos-falta').innerHTML = emFalta.length > 0
    ? `<span class="dash-trend-badge dash-trend-alerta">⚠ Atenção</span>`
    : `<span class="dash-trend-badge dash-trend-up">✓ OK</span>`;

  const cardCaixaWrapper = document.getElementById('card-caixa-wrapper');
  const statusCaixaEl = document.getElementById('card-status-caixa');
  const trendCaixa = document.getElementById('trend-caixa');

  if (caixaAtual) {
    statusCaixaEl.textContent = 'Aberto';
    trendCaixa.innerHTML = `<span class="dash-trend-badge dash-trend-up">● Ativo</span>`;
    cardCaixaWrapper.classList.remove('dash-card-cinza');
    cardCaixaWrapper.classList.add('dash-card-verde');
  } else {
    statusCaixaEl.textContent = 'Fechado';
    trendCaixa.innerHTML = `<span class="dash-trend-badge dash-trend-neutro">● Inativo</span>`;
    cardCaixaWrapper.classList.remove('dash-card-verde');
    cardCaixaWrapper.classList.add('dash-card-cinza');
  }
}

// =========================================================
// RESUMO FINANCEIRO DO DIA
// =========================================================
async function renderizarResumoFinanceiro(vendas, servicos) {
  const totalVendas = vendas.reduce((t, v) => t + Number(v.total), 0);
  const totalServicos = servicos.reduce((t, s) => t + Number(s.valor), 0);
  const totalArrecadado = totalVendas + totalServicos;

  // Dívidas pendentes: histórico completo (não só hoje), filtrado por usuário se não-admin
  let queryDividasV = supabaseClient.from('vendas').select('total').eq('status_pagamento', 'pendente');
  let queryDividasS = supabaseClient.from('servicos').select('valor').eq('status_pagamento', 'pendente');
  if (!ehAdmin) {
    queryDividasV = queryDividasV.eq('usuario_id', usuarioLogado.id);
    queryDividasS = queryDividasS.eq('usuario_id', usuarioLogado.id);
  }
  const [{ data: dividasV }, { data: dividasS }] = await Promise.all([queryDividasV, queryDividasS]);
  const totalDividasPendentes = (dividasV || []).reduce((t, v) => t + Number(v.total), 0)
    + (dividasS || []).reduce((t, s) => t + Number(s.valor), 0);

  const grid = document.getElementById('grid-resumo-financeiro');
  grid.innerHTML = `
    <div class="dash-resumo-item">
      <span class="dash-resumo-icone">🛒</span>
      <div>
        <div class="dash-resumo-valor">${totalVendas.toFixed(2)} MT</div>
        <div class="dash-resumo-label">Total de Vendas</div>
      </div>
    </div>
    <div class="dash-resumo-item">
      <span class="dash-resumo-icone">🧾</span>
      <div>
        <div class="dash-resumo-valor">${totalServicos.toFixed(2)} MT</div>
        <div class="dash-resumo-label">Total de Serviços</div>
      </div>
    </div>
    <div class="dash-resumo-item dash-resumo-destaque">
      <span class="dash-resumo-icone">💵</span>
      <div>
        <div class="dash-resumo-valor">${totalArrecadado.toFixed(2)} MT</div>
        <div class="dash-resumo-label">Total Arrecadado Hoje</div>
      </div>
    </div>
    <div class="dash-resumo-item dash-resumo-alerta">
      <span class="dash-resumo-icone">⏳</span>
      <div>
        <div class="dash-resumo-valor">${totalDividasPendentes.toFixed(2)} MT</div>
        <div class="dash-resumo-label">Dívidas Pendentes (total)</div>
      </div>
    </div>
  `;
}

// =========================================================
// ARRECADAÇÃO POR FORMA DE PAGAMENTO (cards + barra de progresso)
// =========================================================
function renderizarFormasPagamento(vendas, servicos) {
  const porForma = { dinheiro: 0, mpesa: 0, emola: 0, transferencia: 0, fiado: 0 };

  vendas.forEach((v) => {
    porForma[v.forma_pagamento] = (porForma[v.forma_pagamento] || 0) + Number(v.total);
  });
  servicos.forEach((s) => {
    if (s.forma_pagamento) porForma[s.forma_pagamento] = (porForma[s.forma_pagamento] || 0) + Number(s.valor);
  });

  const totalGeral = Object.values(porForma).reduce((t, v) => t + v, 0);
  const grid = document.getElementById('grid-formas-pagamento');

  if (totalGeral === 0) {
    grid.innerHTML = '<p class="lista-vazia">Nenhuma arrecadação registrada hoje ainda.</p>';
    return;
  }

  grid.innerHTML = Object.keys(porForma).map((forma) => {
    const valor = porForma[forma];
    const percentagem = totalGeral > 0 ? (valor / totalGeral) * 100 : 0;
    const cor = CORES_PAGAMENTO[forma] || CORES_PAGAMENTO.dinheiro;

    return `
      <div class="dash-forma-card" style="background:${cor.bg};">
        <div class="dash-forma-topo">
          <span class="dash-forma-nome" style="color:${cor.texto};">${NOMES_PAGAMENTO_DASH[forma] || forma}</span>
          <span class="dash-forma-percent" style="color:${cor.texto};">${percentagem.toFixed(0)}%</span>
        </div>
        <div class="dash-forma-valor" style="color:${cor.texto};">${valor.toFixed(2)} MT</div>
        <div class="dash-forma-barra-fundo">
          <div class="dash-forma-barra-preenchida" style="width:${percentagem}%; background:${cor.barra};"></div>
        </div>
        ${forma === 'fiado' ? '<div class="dash-forma-nota">Valor pendente, ainda não recebido</div>' : ''}
      </div>
    `;
  }).join('');
}

// =========================================================
// GRÁFICOS: BARRAS E PIZZA (formas de pagamento de hoje)
// =========================================================
function renderizarGraficoBarras(vendas, servicos) {
  const porForma = { dinheiro: 0, mpesa: 0, emola: 0, transferencia: 0, fiado: 0 };
  vendas.forEach((v) => { porForma[v.forma_pagamento] = (porForma[v.forma_pagamento] || 0) + Number(v.total); });
  servicos.forEach((s) => { if (s.forma_pagamento) porForma[s.forma_pagamento] = (porForma[s.forma_pagamento] || 0) + Number(s.valor); });

  const labels = Object.keys(porForma).map((f) => NOMES_PAGAMENTO_DASH[f]);
  const valores = Object.values(porForma);
  const cores = Object.keys(porForma).map((f) => CORES_PAGAMENTO[f].barra);

  const ctx = document.getElementById('grafico-barras-formas').getContext('2d');
  if (graficoBarras) graficoBarras.destroy();
  graficoBarras = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Valor (MT)', data: valores, backgroundColor: cores, borderRadius: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function renderizarGraficoPizza(vendas, servicos) {
  const porForma = { dinheiro: 0, mpesa: 0, emola: 0, transferencia: 0, fiado: 0 };
  vendas.forEach((v) => { porForma[v.forma_pagamento] = (porForma[v.forma_pagamento] || 0) + Number(v.total); });
  servicos.forEach((s) => { if (s.forma_pagamento) porForma[s.forma_pagamento] = (porForma[s.forma_pagamento] || 0) + Number(s.valor); });

  const entradas = Object.entries(porForma).filter(([, v]) => v > 0);
  const labels = entradas.map(([f]) => NOMES_PAGAMENTO_DASH[f]);
  const valores = entradas.map(([, v]) => v);
  const cores = entradas.map(([f]) => CORES_PAGAMENTO[f].barra);

  const ctx = document.getElementById('grafico-pizza-formas').getContext('2d');
  if (graficoPizza) graficoPizza.destroy();

  if (valores.length === 0) return;

  graficoPizza = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: valores, backgroundColor: cores }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }
    }
  });
}

// =========================================================
// GRÁFICOS: ÚLTIMOS 7 DIAS (linha + comparativo)
// =========================================================
async function carregarGraficosSemanais() {
  const hoje = new Date();
  hoje.setHours(23, 59, 59, 999);
  const seteDiasAtras = new Date();
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
  seteDiasAtras.setHours(0, 0, 0, 0);

  let queryV = supabaseClient.from('vendas').select('total, criado_em').gte('criado_em', seteDiasAtras.toISOString()).lte('criado_em', hoje.toISOString()).eq('status', 'concluida');
  let queryS = supabaseClient.from('servicos').select('valor, criado_em').gte('criado_em', seteDiasAtras.toISOString()).lte('criado_em', hoje.toISOString()).neq('situacao', 'cancelado');

  if (!ehAdmin) {
    queryV = queryV.eq('usuario_id', usuarioLogado.id);
    queryS = queryS.eq('usuario_id', usuarioLogado.id);
  }

  const [{ data: vendas7d }, { data: servicos7d }] = await Promise.all([queryV, queryS]);

  // Monta os 7 dias (rótulos e totais), preenchendo com zero os dias sem movimento
  const dias = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push({
      chave: d.toISOString().split('T')[0],
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }),
      vendas: 0,
      servicos: 0
    });
  }

  (vendas7d || []).forEach((v) => {
    const chave = v.criado_em.split('T')[0];
    const dia = dias.find((d) => d.chave === chave);
    if (dia) dia.vendas += Number(v.total);
  });

  (servicos7d || []).forEach((s) => {
    const chave = s.criado_em.split('T')[0];
    const dia = dias.find((d) => d.chave === chave);
    if (dia) dia.servicos += Number(s.valor);
  });

  const labels = dias.map((d) => d.label);
  const valoresVendas = dias.map((d) => d.vendas);
  const valoresServicos = dias.map((d) => d.servicos);

  const ctxLinha = document.getElementById('grafico-linha-7dias').getContext('2d');
  if (graficoLinha) graficoLinha.destroy();
  graficoLinha = new Chart(ctxLinha, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Vendas', data: valoresVendas, borderColor: '#2c5f8a', backgroundColor: 'rgba(44,95,138,0.1)', tension: 0.3, fill: true },
        { label: 'Serviços', data: valoresServicos, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.1)', tension: 0.3, fill: true }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true } }
    }
  });

  const ctxComp = document.getElementById('grafico-comparativo').getContext('2d');
  if (graficoComparativo) graficoComparativo.destroy();
  graficoComparativo = new Chart(ctxComp, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Vendas', data: valoresVendas, backgroundColor: '#2c5f8a', borderRadius: 6 },
        { label: 'Serviços', data: valoresServicos, backgroundColor: '#7c3aed', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

// =========================================================
// ÚLTIMAS VENDAS / SERVIÇOS (com estado de pagamento)
// =========================================================
function renderizarListasTransacoes(vendas, servicos) {
  const listaUltimasVendas = document.getElementById('lista-ultimas-vendas');
  if (vendas.length > 0) {
    listaUltimasVendas.innerHTML = vendas.slice(0, 8).map((v) => `
      <div class="dash-transacao-item">
        <div class="dash-transacao-info">
          <div class="dash-transacao-titulo">Venda #${String(v.numero).padStart(4, '0')}</div>
          <div class="dash-transacao-detalhe">${v.clientes ? escapeHTML(v.clientes.nome) : 'Consumidor Final'} • ${new Date(v.criado_em).toLocaleTimeString('pt-BR')}</div>
          <div class="dash-transacao-detalhe">${NOMES_PAGAMENTO_DASH[v.forma_pagamento] || v.forma_pagamento}</div>
        </div>
        <div class="dash-transacao-direita">
          <strong>${Number(v.total).toFixed(2)} MT</strong>
          <span class="dash-badge-pagamento ${v.status_pagamento === 'pago' ? 'pago' : 'pendente'}">${v.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}</span>
        </div>
      </div>
    `).join('');
  } else {
    listaUltimasVendas.innerHTML = '<p class="lista-vazia">Nenhuma venda registrada hoje ainda.</p>';
  }

  const listaUltimosServicos = document.getElementById('lista-ultimos-servicos');
  if (servicos.length > 0) {
    listaUltimosServicos.innerHTML = servicos.slice(0, 8).map((s) => `
      <div class="dash-transacao-item">
        <div class="dash-transacao-info">
          <div class="dash-transacao-titulo">#${String(s.numero).padStart(4, '0')} - ${s.tipos_servico ? escapeHTML(s.tipos_servico.nome) : '-'}</div>
          <div class="dash-transacao-detalhe">${s.clientes ? escapeHTML(s.clientes.nome) : 'Consumidor Final'} • ${new Date(s.criado_em).toLocaleTimeString('pt-BR')}</div>
          <div class="dash-transacao-detalhe">${s.forma_pagamento ? (NOMES_PAGAMENTO_DASH[s.forma_pagamento] || s.forma_pagamento) : '-'} • ${s.situacao}</div>
        </div>
        <div class="dash-transacao-direita">
          <strong>${Number(s.valor).toFixed(2)} MT</strong>
          <span class="dash-badge-pagamento ${s.status_pagamento === 'pago' ? 'pago' : 'pendente'}">${s.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}</span>
        </div>
      </div>
    `).join('');
  } else {
    listaUltimosServicos.innerHTML = '<p class="lista-vazia">Nenhum serviço registrado hoje ainda.</p>';
  }
}

// =========================================================
// INDICADORES RÁPIDOS (admin)
// =========================================================
async function carregarIndicadoresRapidos() {
  const grid = document.getElementById('grid-indicadores-rapidos');

  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);

  const [
    { count: totalClientes },
    { count: totalProdutos },
    { count: totalServicosMes },
    { count: totalVendasMes },
    { count: caixasAbertos }
  ] = await Promise.all([
    supabaseClient.from('clientes').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabaseClient.from('produtos').select('id', { count: 'exact', head: true }).eq('ativo', true),
    supabaseClient.from('servicos').select('id', { count: 'exact', head: true }).gte('criado_em', inicioMes.toISOString()).neq('situacao', 'cancelado'),
    supabaseClient.from('vendas').select('id', { count: 'exact', head: true }).gte('criado_em', inicioMes.toISOString()).eq('status', 'concluida'),
    supabaseClient.from('caixas').select('id', { count: 'exact', head: true }).eq('status', 'aberto')
  ]);

  const indicadores = [
    { icone: '👥', valor: totalClientes || 0, label: 'Clientes Ativos' },
    { icone: '📦', valor: totalProdutos || 0, label: 'Produtos Ativos' },
    { icone: '🧾', valor: totalServicosMes || 0, label: 'Serviços no Mês' },
    { icone: '🛒', valor: totalVendasMes || 0, label: 'Vendas no Mês' },
    { icone: '🗄️', valor: caixasAbertos || 0, label: 'Caixas Abertos' }
  ];

  grid.innerHTML = indicadores.map((ind) => `
    <div class="dash-indicador-item">
      <span class="dash-indicador-icone">${ind.icone}</span>
      <div class="dash-indicador-valor">${ind.valor}</div>
      <div class="dash-indicador-label">${ind.label}</div>
    </div>
  `).join('');
}

// =========================================================
// ALERTAS (admin) — dívidas vencidas + estoque baixo
// =========================================================
async function carregarAlertasAdmin() {
  const container = document.getElementById('lista-alertas');
  const hojeData = new Date().toISOString().split('T')[0];

  const [
    { data: vendasVencidas, error: erroVendasVencidas },
    { data: servicosVencidos, error: erroServicosVencidos },
    { data: produtos, error: erroProdutos }
  ] = await Promise.all([
    supabaseClient.from('vendas').select('numero, total, data_vencimento, clientes(nome)')
      .eq('status_pagamento', 'pendente').lt('data_vencimento', hojeData),
    supabaseClient.from('servicos').select('numero, valor, data_vencimento, clientes(nome)')
      .eq('status_pagamento', 'pendente').lt('data_vencimento', hojeData),
    supabaseClient.from('produtos').select('nome, quantidade, estoque_minimo').eq('ativo', true)
  ]);

  let html = '';
  let totalAlertas = 0;

  if (!erroVendasVencidas && !erroServicosVencidos) {
    const dividas = [
      ...(vendasVencidas || []).map((v) => ({ tipo: 'Venda', numero: v.numero, valor: v.total, vencimento: v.data_vencimento, cliente: v.clientes ? v.clientes.nome : '-' })),
      ...(servicosVencidos || []).map((s) => ({ tipo: 'Serviço', numero: s.numero, valor: s.valor, vencimento: s.data_vencimento, cliente: s.clientes ? s.clientes.nome : '-' }))
    ];

    if (dividas.length > 0) {
      totalAlertas += dividas.length;
      const totalVencido = dividas.reduce((t, d) => t + Number(d.valor), 0);
      html += `<div class="dash-alerta-card dash-alerta-vermelho">
        <div class="dash-alerta-cabecalho">
          <span class="dash-alerta-icone">🔴</span>
          <span class="dash-alerta-titulo">${dividas.length} dívida(s) vencida(s) — ${totalVencido.toFixed(2)} MT</span>
        </div>
        <div class="dash-alerta-lista">
          ${dividas.map((d) => `
            <div class="dash-alerta-item">
              <span>${d.tipo} #${String(d.numero).padStart(4, '0')} - ${escapeHTML(d.cliente)} (venceu em ${new Date(d.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')})</span>
              <span>${Number(d.valor).toFixed(2)} MT</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
  }

  if (!erroProdutos) {
    const esgotados = produtos.filter((p) => p.quantidade <= 0);
    const baixos = produtos.filter((p) => p.quantidade > 0 && p.quantidade <= p.estoque_minimo);

    if (esgotados.length > 0) {
      totalAlertas += esgotados.length;
      html += `<div class="dash-alerta-card dash-alerta-vermelho">
        <div class="dash-alerta-cabecalho">
          <span class="dash-alerta-icone">🔴</span>
          <span class="dash-alerta-titulo">${esgotados.length} produto(s) esgotado(s)</span>
        </div>
        <div class="dash-alerta-lista">
          ${esgotados.map((p) => `<div class="dash-alerta-item"><span>${escapeHTML(p.nome)}</span><span>0 un.</span></div>`).join('')}
        </div>
      </div>`;
    }

    if (baixos.length > 0) {
      totalAlertas += baixos.length;
      html += `<div class="dash-alerta-card dash-alerta-laranja">
        <div class="dash-alerta-cabecalho">
          <span class="dash-alerta-icone">🟠</span>
          <span class="dash-alerta-titulo">${baixos.length} produto(s) com estoque baixo</span>
        </div>
        <div class="dash-alerta-lista">
          ${baixos.map((p) => `<div class="dash-alerta-item"><span>${escapeHTML(p.nome)}</span><span>${p.quantidade} un. (mín: ${p.estoque_minimo})</span></div>`).join('')}
        </div>
      </div>`;
    }
  }

  document.getElementById('contagem-alertas').textContent = totalAlertas;
  container.innerHTML = html || '<p class="lista-vazia">✅ Nenhum alerta no momento.</p>';
}

// =========================================================
// INICIALIZAÇÃO
// =========================================================
carregarDashboard();