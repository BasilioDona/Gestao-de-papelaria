// ===== PROTEÇÃO DE PÁGINA =====
const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));

if (!usuarioLogado) {
  window.location.href = 'index.html';
}

document.getElementById('nome-usuario').textContent = usuarioLogado.nome;
document.getElementById('tipo-usuario').textContent = usuarioLogado.tipo;

if (usuarioLogado.tipo !== 'administrador') {
  document.getElementById('link-usuarios').style.display = 'none';
  document.getElementById('link-config').style.display = 'none';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

const NOMES_PAGAMENTO_DASH = {
  dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'e-Mola', transferencia: 'Transferência Bancária'
};

// ===== CARREGAR INDICADORES REAIS =====
async function carregarDashboard() {
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date();
  fimHoje.setHours(23, 59, 59, 999);
  const inicioISO = inicioHoje.toISOString();
  const fimISO = fimHoje.toISOString();

  const ehAdmin = usuarioLogado.tipo === 'administrador';

  // ----- Busca vendas e serviços de hoje (uma vez, reaproveitados em vários cards) -----
  let queryVendas = supabaseClient
    .from('vendas')
    .select('numero, total, forma_pagamento, criado_em, clientes(nome)')
    .gte('criado_em', inicioISO)
    .lte('criado_em', fimISO)
    .eq('status', 'concluida')
    .order('criado_em', { ascending: false });

  let queryServicos = supabaseClient
    .from('servicos')
    .select('numero, valor, forma_pagamento, criado_em, situacao, clientes(nome), tipos_servico(nome)')
    .gte('criado_em', inicioISO)
    .lte('criado_em', fimISO)
    .neq('situacao', 'cancelado')
    .order('criado_em', { ascending: false });

  if (!ehAdmin) {
    queryVendas = queryVendas.eq('usuario_id', usuarioLogado.id);
    queryServicos = queryServicos.eq('usuario_id', usuarioLogado.id);
  }

  const [{ data: vendasHoje, error: erroVendas }, { data: servicosHoje, error: erroServicos }] = await Promise.all([queryVendas, queryServicos]);

  // ----- Card: Vendido hoje -----
  if (!erroVendas) {
    const totalVendido = vendasHoje.reduce((soma, v) => soma + Number(v.total), 0);
    document.getElementById('card-vendido-hoje').textContent = totalVendido.toFixed(2) + ' MT';
  }

  // ----- Card: Serviços hoje -----
  if (!erroServicos) {
    document.getElementById('card-servicos-hoje').textContent = servicosHoje.length;
  }

  // ----- Card: Produtos em falta -----
  const { data: produtos, error: erroProdutos } = await supabaseClient
    .from('produtos')
    .select('quantidade, estoque_minimo')
    .eq('ativo', true);

  if (!erroProdutos) {
    const emFalta = produtos.filter((p) => p.quantidade <= p.estoque_minimo);
    document.getElementById('card-produtos-falta').textContent = emFalta.length;
  }

  // ----- Card: Status do caixa (do próprio usuário) -----
  const { data: caixaAberto, error: erroCaixa } = await supabaseClient
    .from('caixas')
    .select('id')
    .eq('usuario_id', usuarioLogado.id)
    .eq('status', 'aberto')
    .maybeSingle();

  if (!erroCaixa) {
    document.getElementById('card-status-caixa').textContent = caixaAberto ? 'Aberto' : 'Fechado';
  }

  // ----- Arrecadação de hoje por forma de pagamento (vendas + serviços somados) -----
  const resumoFormas = document.getElementById('resumo-formas-hoje');
  if (!erroVendas && !erroServicos) {
    const porForma = {};
    vendasHoje.forEach((v) => {
      porForma[v.forma_pagamento] = (porForma[v.forma_pagamento] || 0) + Number(v.total);
    });
    servicosHoje.forEach((s) => {
      if (s.forma_pagamento) {
        porForma[s.forma_pagamento] = (porForma[s.forma_pagamento] || 0) + Number(s.valor);
      }
    });

    const totalGeralHoje = Object.values(porForma).reduce((t, v) => t + v, 0);
    const formas = Object.keys(porForma);

    if (formas.length === 0) {
      resumoFormas.innerHTML = '<p class="lista-vazia">Nenhuma arrecadação registrada hoje ainda.</p>';
    } else {
      resumoFormas.innerHTML = formas.map((forma) => `
        <div class="relatorio-linha">
          <span>${NOMES_PAGAMENTO_DASH[forma] || forma}</span>
          <strong>${porForma[forma].toFixed(2)} MT</strong>
        </div>
      `).join('') + `
        <div class="relatorio-linha" style="font-weight:700; background:#f0f9ff;">
          <span>Total geral do dia</span>
          <strong>${totalGeralHoje.toFixed(2)} MT</strong>
        </div>
      `;
    }
  }

  // ----- Lista: Últimas vendas de hoje -----
  const listaUltimasVendas = document.getElementById('lista-ultimas-vendas');
  if (!erroVendas && vendasHoje.length > 0) {
    listaUltimasVendas.innerHTML = vendasHoje.slice(0, 8).map((v) => `
      <div class="relatorio-linha">
        <div>
          <div class="relatorio-linha-titulo">Venda #${String(v.numero).padStart(4, '0')} ${v.clientes ? '- ' + escapeHTML(v.clientes.nome) : ''}</div>
          <div class="relatorio-linha-detalhe">${new Date(v.criado_em).toLocaleTimeString('pt-BR')} • ${NOMES_PAGAMENTO_DASH[v.forma_pagamento] || v.forma_pagamento}</div>
        </div>
        <strong>${Number(v.total).toFixed(2)} MT</strong>
      </div>
    `).join('');
  } else {
    listaUltimasVendas.innerHTML = '<p class="lista-vazia">Nenhuma venda registrada hoje ainda.</p>';
  }

  // ----- Lista: Últimos serviços de hoje -----
  const listaUltimosServicos = document.getElementById('lista-ultimos-servicos');
  if (!erroServicos && servicosHoje.length > 0) {
    listaUltimosServicos.innerHTML = servicosHoje.slice(0, 8).map((s) => `
      <div class="relatorio-linha">
        <div>
          <div class="relatorio-linha-titulo">#${String(s.numero).padStart(4, '0')} - ${s.tipos_servico ? escapeHTML(s.tipos_servico.nome) : '-'} ${s.clientes ? '- ' + escapeHTML(s.clientes.nome) : ''}</div>
          <div class="relatorio-linha-detalhe">${new Date(s.criado_em).toLocaleTimeString('pt-BR')} • ${s.situacao}</div>
        </div>
        <strong>${Number(s.valor).toFixed(2)} MT</strong>
      </div>
    `).join('');
  } else {
    listaUltimosServicos.innerHTML = '<p class="lista-vazia">Nenhum serviço registrado hoje ainda.</p>';
  }

  // ----- ALERTAS (só administrador): dívidas vencidas + estoque baixo detalhado -----
  if (ehAdmin) {
    document.getElementById('area-alertas-admin').classList.remove('escondido');
    carregarAlertasAdmin();
  }
}

// ===== ALERTAS EXCLUSIVOS DO ADMINISTRADOR =====
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

  // Dívidas vencidas
  if (!erroVendasVencidas && !erroServicosVencidos) {
    const dividas = [
      ...(vendasVencidas || []).map((v) => ({ tipo: 'Venda', numero: v.numero, valor: v.total, vencimento: v.data_vencimento, cliente: v.clientes ? v.clientes.nome : '-' })),
      ...(servicosVencidos || []).map((s) => ({ tipo: 'Serviço', numero: s.numero, valor: s.valor, vencimento: s.data_vencimento, cliente: s.clientes ? s.clientes.nome : '-' }))
    ];

    if (dividas.length > 0) {
      const totalVencido = dividas.reduce((t, d) => t + Number(d.valor), 0);
      html += `<div class="relatorio-card" style="border-left:4px solid #dc2626;">
        <div class="relatorio-linha-titulo" style="color:#dc2626;">⚠ ${dividas.length} dívida(s) vencida(s) — ${totalVencido.toFixed(2)} MT</div>
        <div class="relatorio-subitens">
          ${dividas.map((d) => `
            <div class="relatorio-subitem">
              <span>${d.tipo} #${String(d.numero).padStart(4, '0')} - ${escapeHTML(d.cliente)} (venceu em ${new Date(d.vencimento + 'T00:00:00').toLocaleDateString('pt-BR')})</span>
              <span>${Number(d.valor).toFixed(2)} MT</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
  }

  // Estoque baixo
  if (!erroProdutos) {
    const emFalta = produtos.filter((p) => p.quantidade <= p.estoque_minimo);
    if (emFalta.length > 0) {
      html += `<div class="relatorio-card" style="border-left:4px solid #d97706;">
        <div class="relatorio-linha-titulo" style="color:#d97706;">⚠ ${emFalta.length} produto(s) com estoque baixo ou esgotado</div>
        <div class="relatorio-subitens">
          ${emFalta.map((p) => `
            <div class="relatorio-subitem">
              <span>${escapeHTML(p.nome)}</span>
              <span>${p.quantidade} un. (mín: ${p.estoque_minimo})</span>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
  }

  container.innerHTML = html || '<p class="lista-vazia">Nenhum alerta no momento.</p>';
}

carregarDashboard();