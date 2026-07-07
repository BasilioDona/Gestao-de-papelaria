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
  // Relatórios exclusivos de admin ficam escondidos para funcionário
  document.getElementById('aba-lucro').style.display = 'none';
  document.getElementById('aba-funcionarios').style.display = 'none';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ===== ELEMENTOS =====
const resumoRelatorio = document.getElementById('resumo-relatorio');
const conteudoRelatorio = document.getElementById('conteudo-relatorio');
const btnExportarPdf = document.getElementById('btn-exportar-pdf');

let tipoAtivo = 'vendas';
let ultimoRelatorioGerado = null; // guarda dados para exportação em PDF

// ===== DATAS PADRÃO: mês atual =====
const hoje = new Date();
const primeiroDiaMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
document.getElementById('data-inicio').value = primeiroDiaMes.toISOString().split('T')[0];
document.getElementById('data-fim').value = hoje.toISOString().split('T')[0];

// ===== TROCAR ABA =====
document.getElementById('filtro-tipo-relatorio').addEventListener('click', (event) => {
  if (!event.target.classList.contains('aba')) return;
  document.querySelectorAll('#filtro-tipo-relatorio .aba').forEach((a) => a.classList.remove('ativa'));
  event.target.classList.add('ativa');
  tipoAtivo = event.target.dataset.tipo;
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Clique em Gerar para atualizar.</p>';
  resumoRelatorio.innerHTML = '';
  btnExportarPdf.classList.add('escondido');
});

// ===== BOTÃO GERAR =====
document.getElementById('btn-gerar-relatorio').addEventListener('click', () => {
  const dataInicio = document.getElementById('data-inicio').value;
  const dataFim = document.getElementById('data-fim').value;

  if (!dataInicio || !dataFim) {
    alert('Selecione o período (De / Até).');
    return;
  }

  // Inclui o dia inteiro do "até" (23:59:59)
  const inicioISO = new Date(dataInicio + 'T00:00:00').toISOString();
  const fimISO = new Date(dataFim + 'T23:59:59').toISOString();

  switch (tipoAtivo) {
    case 'vendas': gerarRelatorioVendas(inicioISO, fimISO); break;
    case 'produtos': gerarRelatorioMaisVendidos(inicioISO, fimISO); break;
    case 'lucro': gerarRelatorioLucro(inicioISO, fimISO); break;
    case 'caixa': gerarRelatorioCaixa(inicioISO, fimISO); break;
    case 'estoque': gerarRelatorioEstoque(); break;
    case 'clientes': gerarRelatorioClientes(); break;
    case 'servicos': gerarRelatorioServicos(inicioISO, fimISO); break;
    case 'funcionarios': gerarRelatorioFuncionarios(inicioISO, fimISO); break;
  }
});

// ===== 1. RELATÓRIO DE VENDAS =====
async function gerarRelatorioVendas(inicio, fim) {
  let query = supabaseClient
    .from('vendas')
    .select('*, usuarios(nome), clientes(nome)')
    .gte('criado_em', inicio)
    .lte('criado_em', fim)
    .eq('status', 'concluida')
    .order('criado_em', { ascending: false });

  // Funcionário só vê as próprias vendas
  if (!ehAdmin) {
    query = query.eq('usuario_id', usuarioLogado.id);
  }

  const { data, error } = await query;
  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  const totalVendido = data.reduce((t, v) => t + Number(v.total), 0);

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Total de vendas</span><span class="card-valor">${data.length}</span></div>
    <div class="card"><span class="card-titulo">Valor total</span><span class="card-valor">MT ${totalVendido.toFixed(2)}</span></div>
    <div class="card"><span class="card-titulo">Ticket médio</span><span class="card-valor">MT ${(data.length ? totalVendido / data.length : 0).toFixed(2)}</span></div>
  `;

  if (data.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhuma venda no período.</p>';
    ultimoRelatorioGerado = null;
    btnExportarPdf.classList.add('escondido');
    return;
  }

  conteudoRelatorio.innerHTML = '';
  data.forEach((v) => {
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div>
        <div class="relatorio-linha-titulo">Venda #${String(v.numero).padStart(4, '0')} ${v.clientes ? '- ' + v.clientes.nome : ''}</div>
        <div class="relatorio-linha-detalhe">${v.usuarios ? v.usuarios.nome : '-'} • ${new Date(v.criado_em).toLocaleString('pt-BR')}</div>
      </div>
      <strong>MT ${Number(v.total).toFixed(2)}</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Vendas', data.map((v) => [
    '#' + String(v.numero).padStart(4, '0'),
    v.usuarios ? v.usuarios.nome : '-',
    new Date(v.criado_em).toLocaleDateString('pt-BR'),
    'MT ' + Number(v.total).toFixed(2)
  ]), ['Venda', 'Funcionário', 'Data', 'Total']);
}

// ===== 2. PRODUTOS MAIS VENDIDOS =====
async function gerarRelatorioMaisVendidos(inicio, fim) {
  const { data, error } = await supabaseClient
    .from('itens_venda')
    .select('quantidade, subtotal, produtos(nome), vendas!inner(criado_em, status)')
    .gte('vendas.criado_em', inicio)
    .lte('vendas.criado_em', fim)
    .eq('vendas.status', 'concluida');

  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  // Agrupa por produto
  const agrupado = {};
  data.forEach((item) => {
    const nome = item.produtos ? item.produtos.nome : 'Produto removido';
    if (!agrupado[nome]) agrupado[nome] = { quantidade: 0, total: 0 };
    agrupado[nome].quantidade += item.quantidade;
    agrupado[nome].total += Number(item.subtotal);
  });

  const lista = Object.entries(agrupado)
    .map(([nome, valores]) => ({ nome, ...valores }))
    .sort((a, b) => b.quantidade - a.quantidade);

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Produtos distintos</span><span class="card-valor">${lista.length}</span></div>
    <div class="card"><span class="card-titulo">Itens vendidos</span><span class="card-valor">${lista.reduce((t, p) => t + p.quantidade, 0)}</span></div>
  `;

  if (lista.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhuma venda no período.</p>';
    return;
  }

  conteudoRelatorio.innerHTML = '';
  lista.forEach((p) => {
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div class="relatorio-linha-titulo">${p.nome}</div>
      <div><strong>${p.quantidade} un.</strong> <span class="relatorio-linha-detalhe">MT ${p.total.toFixed(2)}</span></div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Produtos Mais Vendidos', lista.map((p) => [p.nome, p.quantidade, 'MT ' + p.total.toFixed(2)]), ['Produto', 'Qtd.', 'Total']);
}

// ===== 3. LUCRO (só admin) =====
async function gerarRelatorioLucro(inicio, fim) {
  if (!ehAdmin) return;

  const { data, error } = await supabaseClient
    .from('itens_venda')
    .select('quantidade, subtotal, produtos(nome, preco_compra), vendas!inner(criado_em, status)')
    .gte('vendas.criado_em', inicio)
    .lte('vendas.criado_em', fim)
    .eq('vendas.status', 'concluida');

  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  let receitaTotal = 0;
  let custoTotal = 0;

  const linhas = data.map((item) => {
    const custoUnitario = item.produtos ? Number(item.produtos.preco_compra) : 0;
    const custoItem = custoUnitario * item.quantidade;
    const receitaItem = Number(item.subtotal);
    receitaTotal += receitaItem;
    custoTotal += custoItem;
    return {
      nome: item.produtos ? item.produtos.nome : 'Produto removido',
      quantidade: item.quantidade,
      receita: receitaItem,
      lucro: receitaItem - custoItem
    };
  });

  const lucroTotal = receitaTotal - custoTotal;

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Receita</span><span class="card-valor">MT ${receitaTotal.toFixed(2)}</span></div>
    <div class="card"><span class="card-titulo">Custo</span><span class="card-valor">MT ${custoTotal.toFixed(2)}</span></div>
    <div class="card"><span class="card-titulo">Lucro</span><span class="card-valor">MT ${lucroTotal.toFixed(2)}</span></div>
  `;

  if (linhas.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhuma venda no período.</p>';
    return;
  }

  conteudoRelatorio.innerHTML = '';
  linhas.forEach((l) => {
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div class="relatorio-linha-titulo">${l.nome} <span class="relatorio-linha-detalhe">(${l.quantidade} un.)</span></div>
      <strong>MT ${l.lucro.toFixed(2)}</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Lucro', linhas.map((l) => [l.nome, l.quantidade, 'MT ' + l.receita.toFixed(2), 'MT ' + l.lucro.toFixed(2)]), ['Produto', 'Qtd.', 'Receita', 'Lucro']);
}

// ===== 4. CAIXA =====
async function gerarRelatorioCaixa(inicio, fim) {
  let query = supabaseClient
    .from('caixas')
    .select('*, usuarios(nome)')
    .gte('aberto_em', inicio)
    .lte('aberto_em', fim)
    .order('aberto_em', { ascending: false });

  if (!ehAdmin) query = query.eq('usuario_id', usuarioLogado.id);

  const { data, error } = await query;
  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  resumoRelatorio.innerHTML = `<div class="card"><span class="card-titulo">Caixas no período</span><span class="card-valor">${data.length}</span></div>`;

  if (data.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhum caixa no período.</p>';
    return;
  }

  conteudoRelatorio.innerHTML = '';
  data.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div>
        <div class="relatorio-linha-titulo">${c.usuarios ? c.usuarios.nome : '-'} • ${c.status}</div>
        <div class="relatorio-linha-detalhe">${new Date(c.aberto_em).toLocaleString('pt-BR')}</div>
      </div>
      <strong>MT ${Number(c.valor_abertura).toFixed(2)} ${c.valor_fechamento !== null ? '→ MT ' + Number(c.valor_fechamento).toFixed(2) : ''}</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Caixa', data.map((c) => [c.usuarios ? c.usuarios.nome : '-', c.status, 'MT ' + Number(c.valor_abertura).toFixed(2)]), ['Funcionário', 'Status', 'Abertura']);
}

// ===== 5. ESTOQUE (situação atual, não depende de período) =====
async function gerarRelatorioEstoque() {
  const { data, error } = await supabaseClient
    .from('produtos')
    .select('nome, quantidade, estoque_minimo')
    .eq('ativo', true)
    .order('quantidade');

  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  const emFalta = data.filter((p) => p.quantidade <= p.estoque_minimo);

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Produtos ativos</span><span class="card-valor">${data.length}</span></div>
    <div class="card"><span class="card-titulo">Em falta</span><span class="card-valor">${emFalta.length}</span></div>
  `;

  conteudoRelatorio.innerHTML = '';
  data.forEach((p) => {
    const baixo = p.quantidade <= p.estoque_minimo;
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div class="relatorio-linha-titulo">${p.nome}</div>
      <strong class="${baixo ? 'produto-estoque-baixo' : ''}">${p.quantidade} un.</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Estoque', data.map((p) => [p.nome, p.quantidade, p.estoque_minimo]), ['Produto', 'Estoque', 'Mínimo']);
}

// ===== 6. CLIENTES (na totalidade: compras + serviços + dívida) =====
async function gerarRelatorioClientes() {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data: clientes, error } = await supabaseClient
    .from('clientes')
    .select('id, nome, telefone')
    .eq('ativo', true)
    .order('nome');

  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  if (clientes.length === 0) {
    resumoRelatorio.innerHTML = '';
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhum cliente cadastrado.</p>';
    return;
  }

  const idsClientes = clientes.map((c) => c.id);

  const [{ data: vendas }, { data: servicos }] = await Promise.all([
    supabaseClient.from('vendas').select('cliente_id, total, status_pagamento').in('cliente_id', idsClientes).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('cliente_id, valor, status_pagamento').in('cliente_id', idsClientes).neq('situacao', 'cancelado')
  ]);

  // Agrupa por cliente: total movimentado (na totalidade) e total em dívida pendente
  const porCliente = {};
  clientes.forEach((c) => { porCliente[c.id] = { qtd: 0, totalMovimentado: 0, totalDivida: 0 }; });

  (vendas || []).forEach((v) => {
    if (!v.cliente_id || !porCliente[v.cliente_id]) return;
    porCliente[v.cliente_id].qtd += 1;
    porCliente[v.cliente_id].totalMovimentado += Number(v.total);
    if (v.status_pagamento === 'pendente') porCliente[v.cliente_id].totalDivida += Number(v.total);
  });

  (servicos || []).forEach((s) => {
    if (!s.cliente_id || !porCliente[s.cliente_id]) return;
    porCliente[s.cliente_id].qtd += 1;
    porCliente[s.cliente_id].totalMovimentado += Number(s.valor);
    if (s.status_pagamento === 'pendente') porCliente[s.cliente_id].totalDivida += Number(s.valor);
  });

  const totalGeralMovimentado = Object.values(porCliente).reduce((t, c) => t + c.totalMovimentado, 0);
  const totalGeralDivida = Object.values(porCliente).reduce((t, c) => t + c.totalDivida, 0);

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Clientes ativos</span><span class="card-valor">${clientes.length}</span></div>
    <div class="card"><span class="card-titulo">Total movimentado</span><span class="card-valor">${totalGeralMovimentado.toFixed(2)} MT</span></div>
    <div class="card"><span class="card-titulo">Total em dívida</span><span class="card-valor">${totalGeralDivida.toFixed(2)} MT</span></div>
  `;

  conteudoRelatorio.innerHTML = '';

  // Ordena por quem mais movimentou primeiro
  const listaOrdenada = clientes
    .map((c) => ({ ...c, ...porCliente[c.id] }))
    .sort((a, b) => b.totalMovimentado - a.totalMovimentado);

  listaOrdenada.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'relatorio-card';
    div.innerHTML = `
      <div class="relatorio-card-topo">
        <div>
          <div class="relatorio-linha-titulo">${escapeHTML(c.nome)}</div>
          <div class="relatorio-linha-detalhe">${escapeHTML(c.telefone) || 'Sem telefone'} • ${c.qtd} movimento(s)</div>
        </div>
        <strong>${c.totalMovimentado.toFixed(2)} MT</strong>
      </div>
      ${c.totalDivida > 0 ? `
        <div class="relatorio-subitens">
          <div class="relatorio-subitem relatorio-diferenca-negativa"><span>Em dívida pendente</span><span>${c.totalDivida.toFixed(2)} MT</span></div>
        </div>
      ` : ''}
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Clientes (Totalidade)', listaOrdenada.map((c) => [
    c.nome, c.telefone || '-', c.qtd, c.totalMovimentado.toFixed(2) + ' MT', c.totalDivida.toFixed(2) + ' MT'
  ]), ['Nome', 'Telefone', 'Movimentos', 'Total Movimentado', 'Em Dívida']);
}

// ===== 7. SERVIÇOS =====
async function gerarRelatorioServicos(inicio, fim) {
  let query = supabaseClient
    .from('servicos')
    .select('*, clientes(nome), usuarios(nome)')
    .gte('criado_em', inicio)
    .lte('criado_em', fim)
    .order('criado_em', { ascending: false });

  if (!ehAdmin) query = query.eq('usuario_id', usuarioLogado.id);

  const { data, error } = await query;
  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  const totalValor = data.reduce((t, s) => t + Number(s.valor), 0);

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Serviços</span><span class="card-valor">${data.length}</span></div>
    <div class="card"><span class="card-titulo">Valor total</span><span class="card-valor">MT ${totalValor.toFixed(2)}</span></div>
  `;

  if (data.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhum serviço no período.</p>';
    return;
  }

  conteudoRelatorio.innerHTML = '';
  data.forEach((s) => {
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div>
        <div class="relatorio-linha-titulo">#${String(s.numero).padStart(4, '0')} - ${s.tipo}</div>
        <div class="relatorio-linha-detalhe">${s.usuarios ? s.usuarios.nome : '-'} • ${s.situacao}</div>
      </div>
      <strong>MT ${Number(s.valor).toFixed(2)}</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Serviços', data.map((s) => ['#' + String(s.numero).padStart(4, '0'), s.tipo, s.situacao, 'MT ' + Number(s.valor).toFixed(2)]), ['Nº', 'Tipo', 'Situação', 'Valor']);
}

// ===== 8. FUNCIONÁRIOS (desempenho — só admin) =====
async function gerarRelatorioFuncionarios(inicio, fim) {
  if (!ehAdmin) return;

  const { data: vendasData, error } = await supabaseClient
    .from('vendas')
    .select('total, usuarios(nome)')
    .gte('criado_em', inicio)
    .lte('criado_em', fim)
    .eq('status', 'concluida');

  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  const agrupado = {};
  vendasData.forEach((v) => {
    const nome = v.usuarios ? v.usuarios.nome : '-';
    if (!agrupado[nome]) agrupado[nome] = { qtd: 0, total: 0 };
    agrupado[nome].qtd += 1;
    agrupado[nome].total += Number(v.total);
  });

  const lista = Object.entries(agrupado).map(([nome, v]) => ({ nome, ...v })).sort((a, b) => b.total - a.total);

  resumoRelatorio.innerHTML = `<div class="card"><span class="card-titulo">Funcionários com vendas</span><span class="card-valor">${lista.length}</span></div>`;

  if (lista.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhuma venda no período.</p>';
    return;
  }

  conteudoRelatorio.innerHTML = '';
  lista.forEach((f) => {
    const div = document.createElement('div');
    div.className = 'relatorio-linha';
    div.innerHTML = `
      <div class="relatorio-linha-titulo">${f.nome}</div>
      <div><strong>MT ${f.total.toFixed(2)}</strong> <span class="relatorio-linha-detalhe">${f.qtd} vendas</span></div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Desempenho por Funcionário', lista.map((f) => [f.nome, f.qtd, 'MT ' + f.total.toFixed(2)]), ['Funcionário', 'Vendas', 'Total']);
}

// ===== PREPARA DADOS PARA EXPORTAÇÃO E MOSTRA O BOTÃO =====
function prepararExportacao(titulo, linhas, colunas) {
  ultimoRelatorioGerado = { titulo, linhas, colunas };
  btnExportarPdf.classList.remove('escondido');
}

// ===== EXPORTAR EM PDF =====
btnExportarPdf.addEventListener('click', () => {
  if (!ultimoRelatorioGerado) return;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text(ultimoRelatorioGerado.titulo, 14, 15);
  doc.setFontSize(9);
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), 14, 21);

  let y = 32;
  const colWidth = 180 / ultimoRelatorioGerado.colunas.length;

  // Cabeçalho da tabela
  doc.setFont(undefined, 'bold');
  ultimoRelatorioGerado.colunas.forEach((col, i) => {
    doc.text(String(col), 14 + (i * colWidth), y);
  });
  doc.setFont(undefined, 'normal');
  y += 6;

  // Linhas (quebra de página automática a cada ~250 linhas)
  ultimoRelatorioGerado.linhas.forEach((linha) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    linha.forEach((valor, i) => {
      doc.text(String(valor), 14 + (i * colWidth), y);
    });
    y += 6;
  });

  doc.save(ultimoRelatorioGerado.titulo.toLowerCase().replace(/\s+/g, '_') + '.pdf');
});