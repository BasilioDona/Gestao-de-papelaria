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
  document.getElementById('aba-lucro').style.display = 'none';
  document.getElementById('aba-funcionarios').style.display = 'none';
}

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

const NOMES_PAGAMENTO_REL = {
  dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'e-Mola', transferencia: 'Transferência Bancária', fiado: 'Dívida (a prazo)'
};

const NOMES_COR_REL = { pb: 'Preto e branco', colorido: 'Colorido', unica: 'Padrão' };

// ===== ELEMENTOS =====
const resumoRelatorio = document.getElementById('resumo-relatorio');
const conteudoRelatorio = document.getElementById('conteudo-relatorio');
const btnExportarPdf = document.getElementById('btn-exportar-pdf');

let tipoAtivo = 'vendas';
let ultimoRelatorioGerado = null; // usado pelos relatórios ainda não modernizados (exportação simples)
let dadosEmpresaRelatorio = null;
let dadosVendasRelatorio = null;   // guarda os dados para a exportação de vendas em PDF
let dadosServicosRelatorio = null; // Guarda os dados calculados do relatório de serviços para o PDF
let dadosClientesRelatorio = null; // Guarda os dados consolidados do relatório de clientes para o PDF

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
  dadosVendasRelatorio = null;
  dadosServicosRelatorio = null;
  dadosClientesRelatorio = null;
});

// ===== BOTÃO GERAR =====
document.getElementById('btn-gerar-relatorio').addEventListener('click', () => {
  const dataInicio = document.getElementById('data-inicio').value;
  const dataFim = document.getElementById('data-fim').value;

  if (!dataInicio || !dataFim) {
    alert('Selecione o período (De / Até).');
    return;
  }

  const inicioISO = new Date(dataInicio + 'T00:00:00').toISOString();
  const fimISO = new Date(dataFim + 'T23:59:59').toISOString();

  switch (tipoAtivo) {
    case 'vendas': gerarRelatorioVendas(inicioISO, fimISO, dataInicio, dataFim); break;
    case 'produtos': gerarRelatorioMaisVendidos(inicioISO, fimISO); break;
    case 'lucro': gerarRelatorioLucro(inicioISO, fimISO); break;
    case 'caixa': gerarRelatorioCaixa(inicioISO, fimISO); break;
    case 'estoque': gerarRelatorioEstoque(); break;
    case 'clientes': gerarRelatorioClientes(inicioISO, fimISO, dataInicio, dataFim); break;
    case 'servicos': gerarRelatorioServicos(inicioISO, fimISO, dataInicio, dataFim); break;
    case 'funcionarios': gerarRelatorioFuncionarios(inicioISO, fimISO); break;
  }
});

// =========================================================
// INFRAESTRUTURA DE PDF (cabeçalho, rodapé, paginação)
// Reutilizada por todos os relatórios modernizados
// =========================================================

async function carregarDadosEmpresaPDF() {
  if (dadosEmpresaRelatorio) return dadosEmpresaRelatorio;
  const { data } = await supabaseClient.from('configuracoes_empresa').select('*').eq('id', 1).single();
  dadosEmpresaRelatorio = data;
  return data;
}

// Desenha o cabeçalho (empresa + título do relatório + período + gerado por/em) em cada página
function desenharCabecalhoPDF(doc, tituloRelatorio, periodoTexto, empresa) {
  const largura = doc.internal.pageSize.getWidth();

  doc.setFontSize(13);
  doc.setFont(undefined, 'bold');
  doc.text(empresa && empresa.nome ? empresa.nome : 'Papelaria', 14, 14);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);

  let y = 19;
  if (empresa && empresa.endereco) { doc.text(empresa.endereco, 14, y); y += 4; }
  if (empresa && empresa.telefone) { doc.text('Tel: ' + empresa.telefone, 14, y); y += 4; }
  if (empresa && empresa.nuit) { doc.text('NUIT: ' + empresa.nuit, 14, y); y += 4; }

  doc.setTextColor(0);
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(tituloRelatorio, largura - 14, 14, { align: 'right' });
  doc.setFont(undefined, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text('Período: ' + periodoTexto, largura - 14, 19, { align: 'right' });
  doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), largura - 14, 23, { align: 'right' });
  doc.text('Gerado por: ' + usuarioLogado.nome, largura - 14, 27, { align: 'right' });
  doc.setTextColor(0);

  doc.setDrawColor(200);
  doc.line(14, 31, largura - 14, 31);
}

// Escreve o rodapé (data de emissão + "Página X de Y") em TODAS as páginas já geradas.
function finalizarRodapePDF(doc) {
  const totalPaginas = doc.internal.getNumberOfPages();
  const largura = doc.internal.pageSize.getWidth();
  const altura = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('Emitido em ' + new Date().toLocaleDateString('pt-BR'), 14, altura - 8);
    doc.text('Página ' + i + ' de ' + totalPaginas, largura - 14, altura - 8, { align: 'right' });
    doc.setTextColor(0);
  }
}

function formatarPeriodo(dataInicioStr, dataFimStr) {
  const di = new Date(dataInicioStr + 'T00:00:00').toLocaleDateString('pt-BR');
  const df = new Date(dataFimStr + 'T00:00:00').toLocaleDateString('pt-BR');
  return di + ' a ' + df;
}

function formatarMT(valor) {
  return Number(valor || 0).toFixed(2) + ' MT';
}

// =========================================================
// 1. RELATÓRIO DE VENDAS — COMPLETO E DETALHADO
// =========================================================
async function gerarRelatorioVendas(inicio, fim, dataInicioStr, dataFimStr) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';
  resumoRelatorio.innerHTML = '';
  btnExportarPdf.classList.add('escondido');

  let query = supabaseClient
    .from('vendas')
    .select('*, usuarios(nome), clientes(nome), caixas!caixa_id(aberto_em, usuarios(nome))')
    .gte('criado_em', inicio)
    .lte('criado_em', fim)
    .eq('status', 'concluida')
    .order('criado_em', { ascending: false });

  if (!ehAdmin) query = query.eq('usuario_id', usuarioLogado.id);

  const { data: vendas, error } = await query;
  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  if (vendas.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhuma venda no período.</p>';
    dadosVendasRelatorio = null;
    return;
  }

  const idsVendas = vendas.map((v) => v.id);
  const { data: itens, error: erroItens } = await supabaseClient
    .from('itens_venda')
    .select('venda_id, quantidade, preco_unitario, subtotal, produtos(nome, codigo, preco_compra, categorias(nome))')
    .in('venda_id', idsVendas);

  const itensPorVenda = {};
  if (!erroItens) {
    itens.forEach((item) => {
      if (!itensPorVenda[item.venda_id]) itensPorVenda[item.venda_id] = [];
      itensPorVenda[item.venda_id].push(item);
    });
  }

  let valorBruto = 0, totalDescontos = 0, valorLiquido = 0, totalRecebido = 0, totalDivida = 0, lucroTotal = 0, qtdProdutosVendidos = 0;

  const vendasProcessadas = vendas.map((v) => {
    const itensDaVenda = itensPorVenda[v.id] || [];
    let lucroVenda = 0;
    itensDaVenda.forEach((item) => {
      const custoUnit = item.produtos ? Number(item.produtos.preco_compra) : 0;
      lucroVenda += Number(item.subtotal) - (custoUnit * item.quantidade);
      qtdProdutosVendidos += item.quantidade;
    });

    valorBruto += Number(v.subtotal);
    totalDescontos += Number(v.desconto);
    valorLiquido += Number(v.total);
    if (v.status_pagamento === 'pago') totalRecebido += Number(v.total);
    else totalDivida += Number(v.total);
    lucroTotal += lucroVenda;

    return { venda: v, itens: itensDaVenda, lucro: lucroVenda };
  });

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Total de vendas</span><span class="card-valor">${vendas.length}</span></div>
    <div class="card"><span class="card-titulo">Produtos vendidos</span><span class="card-valor">${qtdProdutosVendidos}</span></div>
    <div class="card"><span class="card-titulo">Valor líquido</span><span class="card-valor">${formatarMT(valorLiquido)}</span></div>
    <div class="card"><span class="card-titulo">Lucro total</span><span class="card-valor">${formatarMT(lucroTotal)}</span></div>
  `;

  conteudoRelatorio.innerHTML = '';

  vendasProcessadas.forEach(({ venda: v, itens: itensDaVenda, lucro }) => {
    const nomeCliente = v.clientes ? v.clientes.nome : 'Consumidor Final';
    const nomeFuncionario = v.usuarios ? v.usuarios.nome : '-';
    const nomeCaixaOperador = v.caixas && v.caixas.usuarios ? v.caixas.usuarios.nome : '-';
    const caixaAberturaTexto = v.caixas ? new Date(v.caixas.aberto_em).toLocaleString('pt-BR') : '-';

    const div = document.createElement('div');
    div.className = 'relatorio-card';
    div.innerHTML = `
      <div class="relatorio-card-topo">
        <div>
          <div class="relatorio-linha-titulo">Venda #${String(v.numero).padStart(4, '0')} — ${escapeHTML(nomeCliente)}</div>
          <div class="relatorio-linha-detalhe">${new Date(v.criado_em).toLocaleString('pt-BR')} • Funcionário: ${escapeHTML(nomeFuncionario)}</div>
          <div class="relatorio-linha-detalhe">Caixa: ${escapeHTML(nomeCaixaOperador)} (aberto em ${caixaAberturaTexto})</div>
        </div>
        <strong>${formatarMT(v.total)}</strong>
      </div>
      <div class="relatorio-subitens">
        <div class="relatorio-subitem"><span>Forma de pagamento</span><span>${NOMES_PAGAMENTO_REL[v.forma_pagamento] || v.forma_pagamento}</span></div>
        <div class="relatorio-subitem"><span>Status</span><span>${v.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}</span></div>
        ${v.data_vencimento ? `<div class="relatorio-subitem"><span>Vencimento</span><span>${new Date(v.data_vencimento + 'T00:00:00').toLocaleDateString('pt-BR')}</span></div>` : ''}
        ${v.data_pagamento ? `<div class="relatorio-subitem"><span>Pago em</span><span>${new Date(v.data_pagamento).toLocaleString('pt-BR')}</span></div>` : ''}
        <div class="relatorio-subitem"><span>Desconto</span><span>${formatarMT(v.desconto)}</span></div>
        <div class="relatorio-subitem"><span>Lucro da venda</span><span>${formatarMT(lucro)}</span></div>
        <div class="relatorio-subitem" style="font-weight:700; margin-top:6px; border-top:1px dashed #e2e8f0; padding-top:6px;"><span>Produtos vendidos</span><span></span></div>
        ${itensDaVenda.map((item) => `
          <div class="relatorio-subitem">
            <span>${item.quantidade}x ${item.produtos ? escapeHTML(item.produtos.nome) : 'Produto removido'} (${item.produtos ? escapeHTML(item.produtos.codigo) : '-'}) ${item.produtos && item.produtos.categorias ? '— ' + escapeHTML(item.produtos.categorias.nome) : ''}</span>
            <span>${formatarMT(item.preco_unitario)} un. = ${formatarMT(item.subtotal)}</span>
          </div>
        `).join('')}
      </div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  const cardTotais = document.createElement('div');
  cardTotais.className = 'relatorio-card';
  cardTotais.style.background = '#f0f9ff';
  cardTotais.innerHTML = `
    <div class="relatorio-linha-titulo" style="margin-bottom:8px;">Totais do período</div>
    <div class="relatorio-subitem"><span>Total de vendas</span><span>${vendas.length}</span></div>
    <div class="relatorio-subitem"><span>Quantidade total de produtos vendidos</span><span>${qtdProdutosVendidos}</span></div>
    <div class="relatorio-subitem"><span>Valor bruto</span><span>${formatarMT(valorBruto)}</span></div>
    <div class="relatorio-subitem"><span>Total de descontos</span><span>${formatarMT(totalDescontos)}</span></div>
    <div class="relatorio-subitem" style="font-weight:700;"><span>Valor líquido</span><span>${formatarMT(valorLiquido)}</span></div>
    <div class="relatorio-subitem"><span>Total recebido</span><span>${formatarMT(totalRecebido)}</span></div>
    <div class="relatorio-subitem relatorio-diferenca-negativa"><span>Total em dívida</span><span>${formatarMT(totalDivida)}</span></div>
    <div class="relatorio-subitem" style="font-weight:700;"><span>Lucro total</span><span>${formatarMT(lucroTotal)}</span></div>
  `;
  conteudoRelatorio.appendChild(cardTotais);

  dadosVendasRelatorio = {
    vendasProcessadas, valorBruto, totalDescontos, valorLiquido, totalRecebido, totalDivida, lucroTotal, qtdProdutosVendidos,
    periodoTexto: formatarPeriodo(dataInicioStr, dataFimStr)
  };
  ultimoRelatorioGerado = null;
  btnExportarPdf.classList.remove('escondido');
}

async function exportarPdfVendas() {
  const empresa = await carregarDadosEmpresaPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const d = dadosVendasRelatorio;

  desenharCabecalhoPDF(doc, 'Relatório de Vendas', d.periodoTexto, empresa);
  let y = 36;

  d.vendasProcessadas.forEach(({ venda: v, itens: itensDaVenda, lucro }) => {
    const nomeCliente = v.clientes ? v.clientes.nome : 'Consumidor Final';
    const nomeFuncionario = v.usuarios ? v.usuarios.nome : '-';

    if (y > 260) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(`Venda #${String(v.numero).padStart(4, '0')} — ${nomeCliente}`, 14, y);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    const linha2 = `${new Date(v.criado_em).toLocaleString('pt-BR')} | Funcionário: ${nomeFuncionario} | Pagamento: ${NOMES_PAGAMENTO_REL[v.forma_pagamento] || v.forma_pagamento} | Status: ${v.status_pagamento === 'pago' ? 'Pago' : 'Pendente'}`;
    doc.text(linha2, 14, y + 4);
    doc.setTextColor(0);
    y += 8;

    doc.autoTable({
      startY: y,
      head: [['Produto', 'Código', 'Categoria', 'Qtd', 'Preço Un.', 'Subtotal']],
      body: itensDaVenda.map((item) => [
        item.produtos ? item.produtos.nome : 'Produto removido',
        item.produtos ? item.produtos.codigo : '-',
        item.produtos && item.produtos.categorias ? item.produtos.categorias.nome : '-',
        item.quantidade,
        formatarMT(item.preco_unitario),
        formatarMT(item.subtotal)
      ]),
      foot: [['', '', '', '', 'Desconto', formatarMT(v.desconto)], ['', '', '', '', 'Total / Lucro', formatarMT(v.total) + ' / ' + formatarMT(lucro)]],
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.5 },
      headStyles: { fillColor: [44, 95, 138] },
      footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold' },
      margin: { top: 32 },
      didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório de Vendas', d.periodoTexto, empresa)
    });

    y = doc.lastAutoTable.finalY + 6;
  });

  if (y > 250) { doc.addPage(); y = 20; }

  doc.autoTable({
    startY: y,
    head: [['Totais do Período', '']],
    body: [
      ['Total de vendas', String(d.vendasProcessadas.length)],
      ['Quantidade total de produtos vendidos', String(d.qtdProdutosVendidos)],
      ['Valor bruto', formatarMT(d.valorBruto)],
      ['Total de descontos', formatarMT(d.totalDescontos)],
      ['Valor líquido', formatarMT(d.valorLiquido)],
      ['Total recebido', formatarMT(d.totalRecebido)],
      ['Total em dívida', formatarMT(d.totalDivida)],
      ['Lucro total', formatarMT(d.lucroTotal)]
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório de Vendas', d.periodoTexto, empresa)
  });

  finalizarRodapePDF(doc);
  doc.save('relatorio_vendas_' + new Date().toISOString().split('T')[0] + '.pdf');
}

// =========================================================
// 2. PRODUTOS MAIS VENDIDOS
// =========================================================
async function gerarRelatorioMaisVendidos(inicio, fim) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data, error } = await supabaseClient
    .from('itens_venda')
    .select('quantidade, subtotal, produtos(nome), vendas!inner(criado_em, status)')
    .gte('vendas.criado_em', inicio)
    .lte('vendas.criado_em', fim)
    .eq('vendas.status', 'concluida');

  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

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
      <div class="relatorio-linha-titulo">${escapeHTML(p.nome)}</div>
      <div><strong>${p.quantidade} un.</strong> <span class="relatorio-linha-detalhe">${formatarMT(p.total)}</span></div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Produtos Mais Vendidos', lista.map((p) => [p.nome, p.quantidade, formatarMT(p.total)]), ['Produto', 'Qtd.', 'Total']);
}

// ===== 3. LUCRO (só admin) =====
async function gerarRelatorioLucro(inicio, fim) {
  if (!ehAdmin) return;
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';

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
    <div class="card"><span class="card-titulo">Receita</span><span class="card-valor">${formatarMT(receitaTotal)}</span></div>
    <div class="card"><span class="card-titulo">Custo</span><span class="card-valor">${formatarMT(custoTotal)}</span></div>
    <div class="card"><span class="card-titulo">Lucro</span><span class="card-valor">${formatarMT(lucroTotal)}</span></div>
    <div class="card"><span class="card-titulo">Margem</span><span class="card-valor">${receitaTotal > 0 ? ((lucroTotal / receitaTotal) * 100).toFixed(1) : '0'}%</span></div>
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
      <div class="relatorio-linha-titulo">${escapeHTML(l.nome)} <span class="relatorio-linha-detalhe">(${l.quantidade} un.)</span></div>
      <strong>${formatarMT(l.lucro)}</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Lucro', linhas.map((l) => [l.nome, l.quantidade, formatarMT(l.receita), formatarMT(l.lucro)]), ['Produto', 'Qtd.', 'Receita', 'Lucro']);
}

// ===== 4. CAIXA =====
async function gerarRelatorioCaixa(inicio, fim) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  let query = supabaseClient
    .from('caixas')
    .select('*, usuarios(nome)')
    .gte('aberto_em', inicio)
    .lte('aberto_em', fim)
    .order('aberto_em', { ascending: false });

  if (!ehAdmin) query = query.eq('usuario_id', usuarioLogado.id);

  const { data: caixas, error } = await query;
  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  if (caixas.length === 0) {
    resumoRelatorio.innerHTML = '';
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhum caixa no período.</p>';
    return;
  }

  const idsCaixas = caixas.map((c) => c.id);

  const [{ data: vendas }, { data: servicos }, { data: movs }] = await Promise.all([
    supabaseClient.from('vendas').select('caixa_id, total, forma_pagamento').in('caixa_id', idsCaixas).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('caixa_id, valor, forma_pagamento').in('caixa_id', idsCaixas).neq('situacao', 'cancelado'),
    supabaseClient.from('movimentacoes_caixa').select('caixa_id, tipo, valor').in('caixa_id', idsCaixas)
  ]);

  function agruparPorCaixa(lista, campoValor) {
    const mapa = {};
    (lista || []).forEach((item) => {
      if (!mapa[item.caixa_id]) mapa[item.caixa_id] = { total: 0, dinheiro: 0, porForma: {} };
      const valor = Number(item[campoValor]);
      mapa[item.caixa_id].total += valor;
      mapa[item.caixa_id].porForma[item.forma_pagamento] = (mapa[item.caixa_id].porForma[item.forma_pagamento] || 0) + valor;
      if (item.forma_pagamento === 'dinheiro') mapa[item.caixa_id].dinheiro += valor;
    });
    return mapa;
  }

  const vendasPorCaixa = agruparPorCaixa(vendas, 'total');
  const servicosPorCaixa = agruparPorCaixa(servicos, 'valor');

  const movsPorCaixa = {};
  (movs || []).forEach((m) => {
    if (!movsPorCaixa[m.caixa_id]) movsPorCaixa[m.caixa_id] = { sangria: 0, suprimento: 0 };
    movsPorCaixa[m.caixa_id][m.tipo] += Number(m.valor);
  });

  let totalGeralVendas = 0, totalGeralServicos = 0, totalDiferencas = 0;

  conteudoRelatorio.innerHTML = '';

  caixas.forEach((c) => {
    const vInfo = vendasPorCaixa[c.id] || { total: 0, dinheiro: 0, porForma: {} };
    const sInfo = servicosPorCaixa[c.id] || { total: 0, dinero: 0, porForma: {} };
    const movInfo = movsPorCaixa[c.id] || { sangria: 0, suprimento: 0 };
    const nomeFuncionario = c.usuarios ? c.usuarios.nome : '-';

    const valorEsperado = Number(c.valor_abertura) + (vInfo.dinheiro || 0) + (sInfo.dinheiro || 0) + movInfo.suprimento - movInfo.sangria;
    const temFechamento = c.valor_fechamento !== null;
    const diferenca = temFechamento ? Number(c.valor_fechamento) - valorEsperado : null;

    totalGeralVendas += vInfo.total;
    totalGeralServicos += sInfo.total;
    if (diferenca !== null) totalDiferencas += diferenca;

    let classeDiferenca = 'relatorio-diferenca-zero';
    let textoDiferenca = '';
    if (diferenca !== null) {
      if (diferenca > 0) { classeDiferenca = 'relatorio-diferenca-positiva'; textoDiferenca = 'Sobra de ' + formatarMT(diferenca); }
      else if (diferenca < 0) { classeDiferenca = 'relatorio-diferenca-negativa'; textoDiferenca = 'Falta de ' + formatarMT(Math.abs(diferenca)); }
      else { textoDiferenca = 'Confere exatamente'; }
    }

    const div = document.createElement('div');
    div.className = 'relatorio-card';
    div.innerHTML = `
      <div class="relatorio-card-topo">
        <div>
          <div class="relatorio-linha-titulo">${escapeHTML(nomeFuncionario)} <span class="caixa-status-tag ${c.status}">${c.status}</span></div>
          <div class="relatorio-linha-detalhe">
            Aberto: ${new Date(c.aberto_em).toLocaleString('pt-BR')}
            ${c.fechado_em ? '• Fechado: ' + new Date(c.fechado_em).toLocaleString('pt-BR') : ''}
          </div>
        </div>
      </div>
      <div class="relatorio-subitens">
        <div class="relatorio-subitem"><span>Valor de abertura</span><span>${formatarMT(c.valor_abertura)}</span></div>
        <div class="relatorio-subitem"><span>Vendas (todas as formas)</span><span>${formatarMT(vInfo.total)}</span></div>
        <div class="relatorio-subitem"><span>Serviços (todas as formas)</span><span>${formatarMT(sInfo.total)}</span></div>
        <div class="relatorio-subitem"><span>Suprimentos</span><span>+${formatarMT(movInfo.suprimento)}</span></div>
        <div class="relatorio-subitem"><span>Sangrias</span><span>-${formatarMT(movInfo.sangria)}</span></div>
        <div class="relatorio-subitem" style="font-weight:700;"><span>Valor esperado (dinheiro)</span><span>${formatarMT(valorEsperado)}</span></div>
        ${temFechamento ? `
          <div class="relatorio-subitem"><span>Valor contado no fechamento</span><span>${formatarMT(c.valor_fechamento)}</span></div>
          <div class="relatorio-subitem ${classeDiferenca}"><span>Diferença</span><span>${textoDiferenca}</span></div>
        ` : ''}
        ${c.observacoes_fechamento ? `<div class="relatorio-subitem"><span>Observações</span><span>${escapeHTML(c.observacoes_fechamento)}</span></div>` : ''}
      </div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Caixas no período</span><span class="card-valor">${caixas.length}</span></div>
    <div class="card"><span class="card-titulo">Total vendas</span><span class="card-valor">${formatarMT(totalGeralVendas)}</span></div>
    <div class="card"><span class="card-titulo">Total serviços</span><span class="card-valor">${formatarMT(totalGeralServicos)}</span></div>
    <div class="card"><span class="card-titulo">Diferenças acumuladas</span><span class="card-valor">${formatarMT(totalDiferencas)}</span></div>
  `;

  prepararExportacao('Relatório Detalhado de Caixa', caixas.map((c) => {
    const vInfo = vendasPorCaixa[c.id] || { total: 0 };
    const sInfo = servicosPorCaixa[c.id] || { total: 0 };
    return [
      c.usuarios ? c.usuarios.nome : '-',
      new Date(c.aberto_em).toLocaleDateString('pt-BR'),
      c.status,
      formatarMT(vInfo.total),
      formatarMT(sInfo.total),
      c.valor_fechamento !== null ? formatarMT(c.valor_fechamento) : '-'
    ];
  }), ['Funcionário', 'Data', 'Status', 'Vendas', 'Serviços', 'Fechamento']);
}

// ===== 5. ESTOQUE =====
async function gerarRelatorioEstoque() {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';

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
      <div class="relatorio-linha-titulo">${escapeHTML(p.nome)}</div>
      <strong class="${baixo ? 'produto-estoque-baixo' : ''}">${p.quantidade} un.</strong>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Relatório de Estoque', data.map((p) => [p.nome, p.quantidade, p.estoque_minimo]), ['Produto', 'Estoque', 'Mínimo']);
}

// =========================================================
// 6. RELATÓRIO DE CLIENTES — COMPLETO E DETALHADO (MODERNIZADO)
// =========================================================
async function gerarRelatorioClientes(inicio, fim, dataInicioStr, dataFimStr) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';
  resumoRelatorio.innerHTML = '';
  btnExportarPdf.classList.add('escondido');

  // 1. Busca todos os clientes ativos
  const { data: clientes, error: errC } = await supabaseClient
    .from('clientes')
    .select('id, nome, telefone')
    .eq('ativo', true)
    .order('nome');

  if (errC) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + errC.message + '</p>'; return; }

  // 2. Busca histórico de Vendas e Serviços no período para cruzar os dados financeiros
  const [{ data: vendas }, { data: servicos }] = await Promise.all([
    supabaseClient.from('vendas').select('cliente_id, total, status_pagamento').gte('criado_em', inicio).lte('criado_em', fim).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('cliente_id, valor, status_pagamento').gte('criado_em', inicio).lte('criado_em', fim).neq('situacao', 'cancelado')
  ]);

  const mapaFinanceiro = {};
  let totalGeralConsumido = 0;
  let totalGeralDivida = 0;

  // Processa dados vindos de Vendas
  (vendas || []).forEach((v) => {
    if (!v.cliente_id) return;
    if (!mapaFinanceiro[v.cliente_id]) {
      mapaFinanceiro[v.cliente_id] = { qtdVendas: 0, qtdServicos: 0, totalVendas: 0, totalServicos: 0, totalGasto: 0, totalDivida: 0 };
    }
    mapaFinanceiro[v.cliente_id].qtdVendas += 1;
    mapaFinanceiro[v.cliente_id].totalVendas += Number(v.total || 0);
    mapaFinanceiro[v.cliente_id].totalGasto += Number(v.total || 0);
    totalGeralConsumido += Number(v.total || 0);

    if (v.status_pagamento === 'pendente') {
      mapaFinanceiro[v.cliente_id].totalDivida += Number(v.total || 0);
      totalGeralDivida += Number(v.total || 0);
    }
  });

  // Processa dados vindos de Serviços
  (servicos || []).forEach((s) => {
    if (!s.cliente_id) return;
    if (!mapaFinanceiro[s.cliente_id]) {
      mapaFinanceiro[s.cliente_id] = { qtdVendas: 0, qtdServicos: 0, totalVendas: 0, totalServicos: 0, totalGasto: 0, totalDivida: 0 };
    }
    mapaFinanceiro[s.cliente_id].qtdServicos += 1;
    mapaFinanceiro[s.cliente_id].totalServicos += Number(s.valor || 0);
    mapaFinanceiro[s.cliente_id].totalGasto += Number(s.valor || 0);
    totalGeralConsumido += Number(s.valor || 0);

    if (s.status_pagamento === 'pendente') {
      mapaFinanceiro[s.cliente_id].totalDivida += Number(s.valor || 0);
      totalGeralDivida += Number(s.valor || 0);
    }
  });

  // Consolida e ordena do cliente que mais consumiu para o menor
  const clientesProcessados = clientes.map((c) => {
    const fin = mapaFinanceiro[c.id] || { qtdVendas: 0, qtdServicos: 0, totalVendas: 0, totalServicos: 0, totalGasto: 0, totalDivida: 0 };
    return { ...c, ...fin };
  }).sort((a, b) => b.totalGasto - a.totalGasto);

  // ----- Resumo Visual por Cards Superiores -----
  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Clientes Ativos</span><span class="card-valor">${clientes.length}</span></div>
    <div class="card"><span class="card-titulo">Faturamento Total</span><span class="card-valor">${formatarMT(totalGeralConsumido)}</span></div>
    <div class="card"><span class="card-titulo">Total Pendente (Dívidas)</span><span class="card-valor" style="color: #e11d48">${formatarMT(totalGeralDivida)}</span></div>
  `;

  conteudoRelatorio.innerHTML = '';

  // Renderização individual na tela
  clientesProcessados.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'relatorio-card';
    
    if (c.totalDivida > 0) {
      div.style.borderLeft = '5px solid #ef4444';
      div.style.background = '#fef2f2';
    }

    div.innerHTML = `
      <div class="relatorio-card-topo">
        <div>
          <div class="relatorio-linha-titulo">${escapeHTML(c.nome)}</div>
          <div class="relatorio-linha-detalhe">Telefone: ${escapeHTML(c.telefone) || '-'}</div>
        </div>
        <strong>${formatarMT(c.totalGasto)}</strong>
      </div>
      <div class="relatorio-subitens">
        <div class="relatorio-subitem"><span>Frequência no período</span><span>${c.qtdVendas} compra(s) • ${c.qtdServicos} serviço(s)</span></div>
        <div class="relatorio-subitem"><span>Gasto em Compras/Vendas</span><span>${formatarMT(c.totalVendas)}</span></div>
        <div class="relatorio-subitem"><span>Gasto em Serviços Diretos</span><span>${formatarMT(c.totalServicos)}</span></div>
        <div class="relatorio-subitem ${c.totalDivida > 0 ? 'relatorio-diferenca-negativa' : ''}" style="margin-top: 4px; padding-top: 4px; border-top: 1px dashed #cbd5e1;">
          <span>Débito / Fiado Pendente</span>
          <strong>${formatarMT(c.totalDivida)}</strong>
        </div>
      </div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  // ----- Bloco de Totais Finais Destacado -----
  const cardTotais = document.createElement('div');
  cardTotais.className = 'relatorio-card';
  cardTotais.style.background = '#f0f9ff';
  cardTotais.style.border = '1px solid #bae6fd';
  cardTotais.innerHTML = `
    <div class="relatorio-linha-titulo" style="margin-bottom:8px;">Balanço Geral de Clientes</div>
    <div class="relatorio-subitem"><span>Total de Clientes Cadastrados</span><span>${clientes.length}</span></div>
    <div class="relatorio-subitem"><span>Valor Total Consumido</span><strong>${formatarMT(totalGeralConsumido)}</strong></div>
    <div class="relatorio-subitem relatorio-diferenca-negativa"><span>Total Geral Retido em Dívidas</span><strong>${formatarMT(totalGeralDivida)}</strong></div>
  `;
  conteudoRelatorio.appendChild(cardTotais);

  // Cacheamento estruturado para injeção nativa no AutoTable PDF
  dadosClientesRelatorio = {
    clientesProcessados, totalGeralConsumido, totalGeralDivida,
    periodoTexto: formatarPeriodo(dataInicioStr, dataFimStr)
  };
  ultimoRelatorioGerado = null; 
  btnExportarPdf.classList.remove('escondido');
}

// ===== EXPORTAÇÃO EM PDF: CLIENTES (Modernizado via AutoTable) =====
async function exportarPdfClientes() {
  const empresa = await carregarDadosEmpresaPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const d = dadosClientesRelatorio;

  desenharCabecalhoPDF(doc, 'Relatório Avançado de Clientes', d.periodoTexto, empresa);

  doc.autoTable({
    startY: 36,
    head: [['Nome do Cliente', 'Contacto Telefónico', 'Compras', 'Serviços', 'Total Consumido', 'Dívida Ativa']],
    body: d.clientesProcessados.map((c) => [
      c.nome,
      c.telefone || '-',
      c.qtdVendas + ' un.',
      c.qtdServicos + ' un.',
      formatarMT(c.totalGasto),
      formatarMT(c.totalDivida)
    ]),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [44, 95, 138] },
    didParseCell: function (dataHook) {
      if (dataHook.section === 'body') {
        const itemCliente = d.clientesProcessados[dataHook.row.index];
        if (itemCliente && itemCliente.totalDivida > 0) {
          dataHook.cell.styles.textColor = [185, 28, 28]; // vermelho escuro para dívidas
          if (dataHook.column.index === 5) {
            dataHook.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Clientes', d.periodoTexto, empresa)
  });

  let y = doc.lastAutoTable.finalY + 6;
  if (y > 240) { doc.addPage(); y = 20; }

  // Tabela resumida de rodapé do PDF
  doc.autoTable({
    startY: y,
    head: [['Balanço do Período', '']],
    body: [
      ['Total de Clientes Ativos analisados', String(d.clientesProcessados.length)],
      ['Faturamento Bruto Gerado', formatarMT(d.totalGeralConsumido)],
      ['Total Retido em Dívidas Pendentes', formatarMT(d.totalGeralDivida)]
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Clientes', d.periodoTexto, empresa)
  });

  finalizarRodapePDF(doc);
  doc.save('relatorio_avancado_clientes_' + new Date().toISOString().split('T')[0] + '.pdf');
}

// =========================================================
// 7. RELATÓRIO DE SERVIÇOS — COMPLETO E DETALHADO (MODERNIZADO)
// =========================================================
async function gerarRelatorioServicos(inicio, fim, dataInicioStr, dataFimStr) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';
  resumoRelatorio.innerHTML = '';
  btnExportarPdf.classList.add('escondido');

  let query = supabaseClient
    .from('servicos')
    .select('*, clientes(nome), usuarios(nome), tipos_servico(nome)')
    .gte('criado_em', inicio)
    .lte('criado_em', fim)
    .order('criado_em', { ascending: false });

  if (!ehAdmin) query = query.eq('usuario_id', usuarioLogado.id);

  const { data, error } = await query;
  if (error) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + error.message + '</p>'; return; }

  if (data.length === 0) {
    resumoRelatorio.innerHTML = '';
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhum serviço no período.</p>';
    dadosServicosRelatorio = null;
    return;
  }

  const naoCancelados = data.filter((s) => s.situacao !== 'cancelado');

  let totalServicosQtd = naoCancelados.length;
  let valorBruto = naoCancelados.reduce((t, s) => t + Number(s.valor || 0), 0);
  let totalDividas = naoCancelados.filter((s) => s.status_pagamento === 'pendente').reduce((t, s) => t + Number(s.valor || 0), 0);
  let totalRecebido = naoCancelados.filter((s) => s.status_pagamento !== 'pendente').reduce((t, s) => t + Number(s.valor || 0), 0);
  let totalLiquido = valorBruto - totalDividas; 

  const porTipo = {};
  naoCancelados.forEach((s) => {
    const nomeTipo = s.tipos_servico ? s.tipos_servico.nome : s.tipo;
    porTipo[nomeTipo] = (porTipo[nomeTipo] || 0) + Number(s.valor || 0);
  });

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Total de Serviços</span><span class="card-valor">${totalServicosQtd}</span></div>
    <div class="card"><span class="card-titulo">Valor Bruto</span><span class="card-valor">${formatarMT(valorBruto)}</span></div>
    <div class="card"><span class="card-titulo">Total Recebido</span><span class="card-valor">${formatarMT(totalRecebido)}</span></div>
    <div class="card"><span class="card-titulo">Total em Dívidas</span><span class="card-valor">${formatarMT(totalDividas)}</span></div>
  `;

  conteudoRelatorio.innerHTML = '';

  const cardTipos = document.createElement('div');
  cardTipos.className = 'relatorio-card';
  cardTipos.innerHTML = `<div class="relatorio-linha-titulo" style="margin-bottom:8px;">Total por tipo de serviço</div>` +
    Object.keys(porTipo).map((tipo) => `
      <div class="relatorio-subitem"><span>${escapeHTML(tipo)}</span><span>${formatarMT(porTipo[tipo])}</span></div>
    `).join('');
  conteudoRelatorio.appendChild(cardTipos);

  data.forEach((s) => {
    const nomeTipo = s.tipos_servico ? s.tipos_servico.nome : s.tipo;
    const nomeUsuario = s.usuarios ? s.usuarios.nome : '-';
    const nomeCliente = s.clientes ? s.clientes.nome : 'Sem cliente identificado';
    const dataHora = new Date(s.criado_em).toLocaleString('pt-BR');

    const estaEmDivida = s.status_pagamento === 'pendente' && s.situacao !== 'cancelado';
    const statusTexto = s.status_pagamento === 'pendente' ? (s.situacao === 'cancelado' ? 'Cancelado' : 'Dívida') : 'Pago';

    const div = document.createElement('div');
    div.className = 'relatorio-card';
    
    if (estaEmDivida) {
      div.style.borderLeft = '5px solid #f97316'; 
      div.style.background = '#fff7ed'; 
    }

    div.innerHTML = `
      <div class="relatorio-card-topo">
        <div>
          <div class="relatorio-linha-titulo">#${String(s.numero).padStart(4, '0')} - ${escapeHTML(nomeTipo)}</div>
          <div class="relatorio-linha-detalhe">Data/Hora: ${dataHora} • Funcionário: ${escapeHTML(nomeUsuario)}</div>
          <div class="relatorio-linha-detalhe">Cliente: ${escapeHTML(nomeCliente)}</div>
        </div>
        <strong>${formatarMT(s.valor)}</strong>
      </div>
      <div class="relatorio-subitens">
        <div class="relatorio-subitem"><span>Forma de pagamento</span><span>${NOMES_PAGAMENTO_REL[s.forma_pagamento] || s.forma_pagamento || '-'}</span></div>
        <div class="relatorio-subitem"><span>Situação do serviço</span><span><span class="situacao-tag ${s.situacao}">${s.situacao}</span></span></div>
        <div class="relatorio-subitem ${estaEmDivida ? 'relatorio-diferenca-negativa' : ''}">
          <span>Status do pagamento</span>
          <strong>${statusTexto}</strong>
        </div>
        ${s.cor ? `<div class="relatorio-subitem"><span>Cor</span><span>${NOMES_COR_REL[s.cor] || s.cor}</span></div>` : ''}
        ${s.paginas ? `<div class="relatorio-subitem"><span>Páginas</span><span>${s.paginas}</span></div>` : ''}
        ${s.descricao ? `<div class="relatorio-subitem"><span>Descrição</span><span>${escapeHTML(s.descricao)}</span></div>` : ''}
      </div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  const cardTotais = document.createElement('div');
  cardTotais.className = 'relatorio-card';
  cardTotais.style.background = '#f0f9ff';
  cardTotais.style.border = '1px solid #bae6fd';
  cardTotais.innerHTML = `
    <div class="relatorio-linha-titulo" style="margin-bottom:12px; font-size:14px;">Resumo Financeiro dos Serviços</div>
    <div class="relatorio-subitem"><span>Total de Serviços:</span><strong>${totalServicosQtd}</strong></div>
    <div class="relatorio-subitem"><span>Valor Bruto:</span><span>${formatarMT(valorBruto)}</span></div>
    <div class="relatorio-subitem"><span>Total Recebido:</span><span>${formatarMT(totalRecebido)}</span></div>
    <div class="relatorio-subitem relatorio-diferenca-negativa"><span>Total em Dívidas:</span><span>${formatarMT(totalDividas)}</span></div>
    <div class="relatorio-subitem" style="font-weight:700; margin-top:8px; border-top:1px dashed #bae6fd; padding-top:8px; font-size:13px;">
      <span>Total Líquido do Dia:</span><span>${formatarMT(totalLiquido)}</span>
    </div>
  `;
  conteudoRelatorio.appendChild(cardTotais);

  dadosServicosRelatorio = {
    servicos: data, totalServicosQtd, valorBruto, totalRecebido, totalDividas, totalLiquido,
    periodoTexto: formatarPeriodo(dataInicioStr, dataFimStr)
  };

  ultimoRelatorioGerado = null;
  btnExportarPdf.classList.remove('escondido');
}

async function exportarPdfServicos() {
  const empresa = await carregarDadosEmpresaPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const d = dadosServicosRelatorio;

  desenharCabecalhoPDF(doc, 'Relatório de Serviços', d.periodoTexto, empresa);
  let y = 36;

  doc.autoTable({
    startY: y,
    head: [['Nº', 'Data e Hora', 'Tipo de Serviço', 'Cliente', 'Funcionário', 'Forma de Pagamento', 'Status', 'Valor']],
    body: d.servicos.map((s) => {
      const nomeTipo = s.tipos_servico ? s.tipos_servico.nome : s.tipo;
      const nomeUsuario = s.usuarios ? s.usuarios.nome : '-';
      const nomeCliente = s.clientes ? s.clientes.nome : 'Sem cliente';
      const dataHora = new Date(s.criado_em).toLocaleString('pt-BR');
      const statusTexto = s.status_pagamento === 'pendente' ? (s.situacao === 'cancelado' ? 'Cancelado' : 'Dívida') : 'Pago';
      return [
        '#' + String(s.numero).padStart(4, '0'),
        dataHora,
        nomeTipo,
        nomeCliente,
        nomeUsuario,
        NOMES_PAGAMENTO_REL[s.forma_pagamento] || s.forma_pagamento || '-',
        statusTexto,
        formatarMT(s.valor)
      ];
    }),
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [44, 95, 138] },
    didParseCell: function (dataHook) {
      if (dataHook.section === 'body') {
        const itemServico = d.servicos[dataHook.row.index];
        if (itemServico && itemServico.status_pagamento === 'pendente' && itemServico.situacao !== 'cancelado') {
          dataHook.cell.styles.textColor = [194, 65, 12];
          if (dataHook.column.index === 6) {
            dataHook.cell.styles.fontStyle = 'bold';
          }
        }
      }
    },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório de Serviços', d.periodoTexto, empresa)
  });

  y = doc.lastAutoTable.finalY + 6;
  if (y > 240) { doc.addPage(); y = 20; }

  doc.autoTable({
    startY: y,
    head: [['Resumo Financeiro dos Serviços', '']],
    body: [
      ['Total de Serviços realizados', String(d.totalServicosQtd)],
      ['Valor Bruto', formatarMT(d.valorBruto)],
      ['Total Recebido', formatarMT(d.totalRecebido)],
      ['Total em Dívidas', formatarMT(d.totalDividas)],
      ['Total Líquido do Dia', formatarMT(d.totalLiquido)]
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
    didParseCell: function (dataHook) {
      if (dataHook.section === 'body' && dataHook.row.index === 4) {
        dataHook.cell.styles.fontStyle = 'bold';
        dataHook.cell.styles.fillColor = [241, 245, 249];
      }
    },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório de Serviços', d.periodoTexto, empresa)
  });

  finalizarRodapePDF(doc);
  doc.save('relatorio_servicos_' + new Date().toISOString().split('T')[0] + '.pdf');
}

// ===== 8. FUNCIONÁRIOS (desempenho — só admin) =====
async function gerarRelatorioFuncionarios(inicio, fim) {
  if (!ehAdmin) return;
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const [{ data: vendasData, error: erroVendas }, { data: servicosData, error: erroServicos }] = await Promise.all([
    supabaseClient.from('vendas').select('total, usuarios(nome)').gte('criado_em', inicio).lte('criado_em', fim).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('valor, usuarios(nome)').gte('criado_em', inicio).lte('criado_em', fim).neq('situacao', 'cancelado')
  ]);

  if (erroVendas || erroServicos) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro ao carregar dados.</p>'; return; }

  const agrupado = {};

  vendasData.forEach((v) => {
    const nome = v.usuarios ? v.usuarios.nome : '-';
    if (!agrupado[nome]) agrupado[nome] = { qtdVendas: 0, totalVendas: 0, qtdServicos: 0, totalServicos: 0 };
    agrupado[nome].qtdVendas += 1;
    agrupado[nome].totalVendas += Number(v.total);
  });

  servicosData.forEach((s) => {
    const nome = s.usuarios ? s.usuarios.nome : '-';
    if (!agrupado[nome]) agrupado[nome] = { qtdVendas: 0, totalVendas: 0, qtdServicos: 0, totalServicos: 0 };
    agrupado[nome].qtdServicos += 1;
    agrupado[nome].totalServicos += Number(s.valor);
  });

  const lista = Object.entries(agrupado)
    .map(([nome, v]) => ({ nome, ...v, totalGeral: v.totalVendas + v.totalServicos }))
    .sort((a, b) => b.totalGeral - a.totalGeral);

  resumoRelatorio.innerHTML = `<div class="card"><span class="card-titulo">Funcionários com atividade</span><span class="card-valor">${lista.length}</span></div>`;

  if (lista.length === 0) {
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhuma atividade no período.</p>';
    return;
  }

  conteudoRelatorio.innerHTML = '';
  lista.forEach((f) => {
    const div = document.createElement('div');
    div.className = 'relatorio-card';
    div.innerHTML = `
      <div class="relatorio-card-topo">
        <div class="relatorio-linha-titulo">${escapeHTML(f.nome)}</div>
        <strong>${formatarMT(f.totalGeral)}</strong>
      </div>
      <div class="relatorio-subitens">
        <div class="relatorio-subitem"><span>Vendas (${f.qtdVendas})</span><span>${formatarMT(f.totalVendas)}</span></div>
        <div class="relatorio-subitem"><span>Serviços (${f.qtdServicos})</span><span>${formatarMT(f.totalServicos)}</span></div>
      </div>
    `;
    conteudoRelatorio.appendChild(div);
  });

  prepararExportacao('Desempenho por Funcionário', lista.map((f) => [f.nome, f.qtdVendas, formatarMT(f.totalVendas), f.qtdServicos, formatarMT(f.totalServicos)]), ['Funcionário', 'Vendas', 'Total Vendas', 'Serviços', 'Total Serviços']);
}

// ===== PREPARA DADOS PARA EXPORTAÇÃO SIMPLES (relatórios ainda não modernizados) =====
function prepararExportacao(titulo, lines, colunas) {
  ultimoRelatorioGerado = { titulo, linhas: lines, colunas };
  btnExportarPdf.classList.remove('escondido');
}

// ===== BOTÃO EXPORTAR PDF (decide qual gerador usar) =====
btnExportarPdf.addEventListener('click', async () => {
  if (tipoAtivo === 'vendas' && dadosVendasRelatorio) {
    await exportarPdfVendas();
    return;
  }

  if (tipoAtivo === 'servicos' && dadosServicosRelatorio) {
    await exportarPdfServicos();
    return;
  }

  if (tipoAtivo === 'clientes' && dadosClientesRelatorio) {
    await exportarPdfClientes();
    return;
  }

  if (!ultimoRelatorioGerado) return;

  const empresa = await carregarDadosEmpresaPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const dataInicio = document.getElementById('data-inicio').value;
  const dataFim = document.getElementById('data-fim').value;
  const periodoTexto = formatarPeriodo(dataInicio, dataFim);

  doc.autoTable({
    startY: 36,
    head: [ultimoRelatorioGerado.colunas],
    body: ultimoRelatorioGerado.linhas,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [44, 95, 138] },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, ultimoRelatorioGerado.titulo, periodoTexto, empresa)
  });

  finalizarRodapePDF(doc);
  doc.save(ultimoRelatorioGerado.titulo.toLowerCase().replace(/\s+/g, '_') + '.pdf');
});
