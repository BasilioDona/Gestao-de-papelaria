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
let dadosCaixaRelatorio = null;    // Guarda os dados estruturados do relatório de caixas para o PDF

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
  dadosCaixaRelatorio = null;
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
    case 'caixa': gerarRelatorioCaixa(inicioISO, fimISO, dataInicio, dataFim); break;
    case 'estoque': gerarRelatorioEstoque(); break;
    case 'clientes': gerarRelatorioClientes(inicioISO, fimISO, dataInicio, dataFim); break;
    case 'servicos': gerarRelatorioServicos(inicioISO, fimISO, dataInicio, dataFim); break;
    case 'funcionarios': gerarRelatorioFuncionarios(inicioISO, fimISO); break;
  }
});

// ===== DISPARAR EXPORTAÇÃO SELECIONADA =====
btnExportarPdf.addEventListener('click', () => {
  if (tipoAtivo === 'vendas' && dadosVendasRelatorio) {
    exportarPdfVendas();
  } else if (tipoAtivo === 'servicos' && dadosServicosRelatorio) {
    exportarPdfServicos();
  } else if (tipoAtivo === 'clientes' && dadosClientesRelatorio) {
    exportarPdfClientes();
  } else if (tipoAtivo === 'caixa' && dadosCaixaRelatorio) {
    exportarPdfCaixa();
  } else if (ultimoRelatorioGerado) {
    exportarRelatorioSimples();
  }
});

// =========================================================
// INFRAESTRUTURA DE PDF (cabeçalho, rodapé, paginação)
// =========================================================

async function carregarDadosEmpresaPDF() {
  if (dadosEmpresaRelatorio) return dadosEmpresaRelatorio;
  const { data } = await supabaseClient.from('configuracoes_empresa').select('*').eq('id', 1).single();
  dadosEmpresaRelatorio = data;
  return data;
}

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
// 1. RELATÓRIO DE VENDAS
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

// =========================================================
// 3. LUCRO (só admin)
// =========================================================
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

// =========================================================
// 4. RELATÓRIO DE CAIXA (REFORMULADO)
// =========================================================
async function gerarRelatorioCaixa(inicio, fim, dataInicioStr, dataFimStr) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';
  resumoRelatorio.innerHTML = '';
  btnExportarPdf.classList.add('escondido');
  dadosCaixaRelatorio = null;

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
    conteudoRelatorio.innerHTML = '<p class="lista-vazia">Nenhum caixa registado no período selecionado.</p>';
    return;
  }

  const idsCaixas = caixas.map((c) => c.id);

  // Consultas agregadas do período
  const [
    { data: vendas },
    { data: servicos },
    { data: movs },
    { data: dividasVendas },
    { data: dividasServicos }
  ] = await Promise.all([
    supabaseClient.from('vendas').select('id, numero, total, forma_pagamento, status_pagamento, criado_em, clientes(nome)').in('caixa_id', idsCaixas).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('id, numero, valor, forma_pagamento, status_pagamento, criado_em, clientes(nome), tipos_servico(nome), tipo, situacao').in('caixa_id', idsCaixas).neq('situacao', 'cancelado'),
    supabaseClient.from('movimentacoes_caixa').select('id, caixa_id, tipo, valor, motivo, criado_em').in('caixa_id', idsCaixas).order('criado_em', { ascending: false }),
    supabaseClient.from('vendas').select('id, numero, total, forma_pagamento_recebimento, status_pagamento, criado_em, clientes(nome)').in('caixa_pagamento_id', idsCaixas).eq('status_pagamento', 'pago'),
    supabaseClient.from('servicos').select('id, numero, valor, forma_pagamento_recebimento, status_pagamento, criado_em, clientes(nome), tipos_servico(nome), tipo').in('caixa_pagamento_id', idsCaixas).eq('status_pagamento', 'pago')
  ]);

  // Carregar produtos e quantidades de vendas no período
  const todosIdsVendas = [...(vendas || []).map((v) => v.id), ...(dividasVendas || []).map((v) => v.id)];
  let itensVenda = [];
  if (todosIdsVendas.length > 0) {
    const { data: listItens } = await supabaseClient
      .from('itens_venda')
      .select('venda_id, quantidade, produtos(nome)')
      .in('venda_id', todosIdsVendas);
    itensVenda = listItens || [];
  }

  const itensPorVenda = {};
  itensVenda.forEach((it) => {
    if (!itensPorVenda[it.venda_id]) itensPorVenda[it.venda_id] = [];
    itensPorVenda[it.venda_id].push(it);
  });

  // 1 e 2. Resumo por Forma de Pagamento
  const FORMAS_RESTRITAS = ['dinheiro', 'mpesa', 'emola', 'transferencia', 'fiado'];
  const MAP_FORMAS_PT = {
    dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'E-Mola', transferencia: 'Transferência Bancária', fiado: 'Fiado'
  };

  const resumoFormas = {};
  FORMAS_RESTRITAS.forEach((f) => {
    resumoFormas[f] = { vendas: 0, servicos: 0, dividas: 0, soma: 0 };
  });

  // Vendas normais
  (vendas || []).forEach((v) => {
    const f = v.forma_pagamento;
    if (resumoFormas[f]) resumoFormas[f].vendas += Number(v.total || 0);
  });

  // Serviços normais
  (servicos || []).forEach((s) => {
    const f = s.forma_pagamento;
    if (resumoFormas[f]) resumoFormas[f].servicos += Number(s.valor || 0);
  });

  // Dívidas recebidas de Vendas
  (dividasVendas || []).forEach((dv) => {
    const f = dv.forma_pagamento_recebimento;
    if (resumoFormas[f]) resumoFormas[f].dividas += Number(dv.total || 0);
  });

  // Dívidas recebidas de Serviços
  (dividasServicos || []).forEach((ds) => {
    const f = ds.forma_pagamento_recebimento;
    if (resumoFormas[f]) resumoFormas[f].dividas += Number(ds.valor || 0);
  });

  // Soma geral das formas de pagamento
  FORMAS_RESTRITAS.forEach((f) => {
    resumoFormas[f].soma = resumoFormas[f].vendas + resumoFormas[f].servicos + resumoFormas[f].dividas;
  });

  // 3. Movimentações do Caixa (Sangrias e Suprimentos)
  const sangrias = (movs || []).filter((m) => m.tipo === 'sangria');
  const suprimentos = (movs || []).filter((m) => m.tipo === 'suprimento');

  const totalSangrias = sangrias.reduce((acc, m) => acc + Number(m.valor || 0), 0);
  const totalSuprimentos = suprimentos.reduce((acc, m) => acc + Number(m.valor || 0), 0);

  // 4. Histórico detalhado por Forma de Pagamento
  const historico = {};
  FORMAS_RESTRITAS.forEach((f) => {
    historico[f] = { vendas: [], servicos: [] };
  });

  // Organizar Vendas no histórico
  [...(vendas || []), ...(dividasVendas || [])].forEach((v) => {
    const f = v.forma_pagamento_recebimento || v.forma_pagamento;
    if (historico[f]) {
      const items = itensPorVenda[v.id] || [];
      const produtosTexto = items.map((it) => `${it.quantidade}x ${it.produtos ? it.produtos.nome : 'Produto'}`).join(', ') || 'Nenhum';
      const qtdTotal = items.reduce((acc, it) => acc + it.quantidade, 0);

      historico[f].vendas.push({
        numero: String(v.numero).padStart(4, '0'),
        cliente: v.clientes ? v.clientes.nome : 'Consumidor Final',
        data: new Date(v.criado_em).toLocaleString('pt-BR'),
        produtos: produtosTexto,
        quantidade: qtdTotal,
        total: Number(v.total)
      });
    }
  });

  // Organizar Serviços no histórico
  [...(servicos || []), ...(dividasServicos || [])].forEach((s) => {
    const f = s.forma_pagamento_recebimento || s.forma_pagamento;
    if (historico[f]) {
      historico[f].servicos.push({
        numero: String(s.numero).padStart(4, '0'),
        cliente: s.clientes ? s.clientes.nome : 'Sem Cliente',
        tipo: s.tipos_servico ? s.tipos_servico.nome : (s.tipo || 'Geral'),
        data: new Date(s.criado_em).toLocaleString('pt-BR'),
        valor: Number(s.valor)
      });
    }
  });

  // 5 e 6. Resumo Geral e Fórmula de Saldo
  const totalVendasPeriodo = Object.values(resumoFormas).reduce((acc, curr) => acc + curr.vendas, 0);
  const totalServicosPeriodo = Object.values(resumoFormas).reduce((acc, curr) => acc + curr.servicos, 0);
  const totalDividasPeriodo = Object.values(resumoFormas).reduce((acc, curr) => acc + curr.dividas, 0);

  // Saldo final = (vendas + serviços + dívidas recebidas + suprimentos) - sangrias
  const saldoFinal = (totalVendasPeriodo + totalServicosPeriodo + totalDividasPeriodo + totalSuprimentos) - totalSangrias;

  // 8. Salvar na variável global dadosCaixaRelatorio
  dadosCaixaRelatorio = {
    periodoTexto: formatarPeriodo(dataInicioStr, dataFimStr),
    resumoFormas,
    movimentacoes: movs || [],
    sangrias,
    suprimentos,
    historico,
    totais: {
      dinheiro: resumoFormas.dinheiro.soma,
      mpesa: resumoFormas.mpesa.soma,
      emola: resumoFormas.emola.soma,
      transferencia: resumoFormas.transferencia.soma,
      fiado: resumoFormas.fiado.soma,
      totalSangrias,
      totalSuprimentos,
      saldoFinal
    }
  };

  // Renderização Visual na UI do Relatório
  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Caixas Monitorizados</span><span class="card-valor">${caixas.length}</span></div>
    <div class="card"><span class="card-titulo">Suprimentos (+)</span><span class="card-valor" style="color:#16a34a;">${formatarMT(totalSuprimentos)}</span></div>
    <div class="card"><span class="card-titulo">Sangrias (-)</span><span class="card-valor" style="color:#dc2626;">${formatarMT(totalSangrias)}</span></div>
    <div class="card"><span class="card-titulo">Saldo Geral</span><span class="card-valor">${formatarMT(saldoFinal)}</span></div>
  `;

  conteudoRelatorio.innerHTML = '';

  // Card HTML - Resumos por Forma de Pagamento
  const cardFormas = document.createElement('div');
  cardFormas.className = 'relatorio-card';
  cardFormas.innerHTML = `
    <div class="relatorio-linha-titulo" style="margin-bottom:12px;">Fluxo por Forma de Pagamento</div>
    <table style="width:100%; border-collapse: collapse; font-size: 13px;">
      <thead>
        <tr style="border-bottom: 2px solid #e2e8f0; text-align: left; font-weight: bold;">
          <th style="padding: 8px 4px;">Forma</th>
          <th style="padding: 8px 4px; text-align: right;">Vendas</th>
          <th style="padding: 8px 4px; text-align: right;">Serviços</th>
          <th style="padding: 8px 4px; text-align: right;">Dívidas Quitadas</th>
          <th style="padding: 8px 4px; text-align: right;">Soma Total</th>
        </tr>
      </thead>
      <tbody>
        ${FORMAS_RESTRITAS.map((f) => `
          <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 8px 4px; font-weight: bold;">${MAP_FORMAS_PT[f]}</td>
            <td style="padding: 8px 4px; text-align: right;">${formatarMT(resumoFormas[f].vendas)}</td>
            <td style="padding: 8px 4px; text-align: right;">${formatarMT(resumoFormas[f].servicos)}</td>
            <td style="padding: 8px 4px; text-align: right;">${formatarMT(resumoFormas[f].dividas)}</td>
            <td style="padding: 8px 4px; text-align: right; font-weight: bold; color: #1e3a8a;">${formatarMT(resumoFormas[f].soma)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  conteudoRelatorio.appendChild(cardFormas);

  // Card HTML - Movimentações
  const cardMovs = document.createElement('div');
  cardMovs.className = 'relatorio-card';
  cardMovs.innerHTML = `
    <div class="relatorio-linha-titulo" style="margin-bottom:12px;">Movimentações do Caixa (Sangrias e Suprimentos)</div>
    ${(movs || []).length === 0 ? '<p class="lista-vazia">Nenhuma movimentação registada.</p>' : `
      <table style="width:100%; border-collapse: collapse; font-size: 12px;">
        <thead>
          <tr style="border-bottom: 2px solid #e2e8f0; text-align: left; font-weight: bold;">
            <th style="padding: 6px 4px;">Data e Hora</th>
            <th style="padding: 6px 4px;">Tipo</th>
            <th style="padding: 6px 4px;">Observação/Motivo</th>
            <th style="padding: 6px 4px; text-align: right;">Valor</th>
          </tr>
        </thead>
        <tbody>
          ${movs.map((m) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 6px 4px;">${new Date(m.criado_em).toLocaleString('pt-BR')}</td>
              <td style="padding: 6px 4px; font-weight: bold; color: ${m.tipo === 'sangria' ? '#dc2626' : '#16a34a'};">${m.tipo === 'sangria' ? 'Sangria (-)' : 'Suprimento (+)'}</td>
              <td style="padding: 6px 4px;">${escapeHTML(m.motivo || 'Nenhum informado')}</td>
              <td style="padding: 6px 4px; text-align: right; font-weight: bold; color: ${m.tipo === 'sangria' ? '#dc2626' : '#16a34a'};">${formatarMT(m.valor)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `}
  `;
  conteudoRelatorio.appendChild(cardMovs);

  // Card HTML - Resumo Final Consolidado
  const cardResumoFinal = document.createElement('div');
  cardResumoFinal.className = 'relatorio-card';
  cardResumoFinal.style.background = '#f8fafc';
  cardResumoFinal.innerHTML = `
    <div class="relatorio-linha-titulo" style="margin-bottom:12px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Fechamento Geral do Período</div>
    <div class="relatorio-subitem"><span>Dinheiro Total</span><strong>${formatarMT(resumoFormas.dinheiro.soma)}</strong></div>
    <div class="relatorio-subitem"><span>M-Pesa Total</span><strong>${formatarMT(resumoFormas.mpesa.soma)}</strong></div>
    <div class="relatorio-subitem"><span>E-Mola Total</span><strong>${formatarMT(resumoFormas.emola.soma)}</strong></div>
    <div class="relatorio-subitem"><span>Transferência Bancária Total</span><strong>${formatarMT(resumoFormas.transferencia.soma)}</strong></div>
    <div class="relatorio-subitem"><span>Fiado Total</span><strong>${formatarMT(resumoFormas.fiado.soma)}</strong></div>
    <div class="relatorio-subitem" style="border-top: 1px dashed #cbd5e1; margin-top: 6px; padding-top: 6px;"><span>Total Suprimentos (+)</span><strong style="color: #16a34a;">${formatarMT(totalSuprimentos)}</strong></div>
    <div class="relatorio-subitem"><span>Total Sangrias (-)</span><strong style="color: #dc2626;">${formatarMT(totalSangrias)}</strong></div>
    <div class="relatorio-subitem" style="font-size: 15px; font-weight: bold; border-top: 2px solid #1e293b; margin-top: 8px; padding-top: 8px; color: #1e3a8a;">
      <span>SALDO FINAL DE CAIXA</span>
      <span>${formatarMT(saldoFinal)}</span>
    </div>
  `;
  conteudoRelatorio.appendChild(cardResumoFinal);

  ultimoRelatorioGerado = null;
  btnExportarPdf.classList.remove('escondido');
}

// =========================================================
// 7. EXPORTAR PDF CAIXA EXCLUSIVO (jsPDF & jspdf-autotable)
// =========================================================
async function exportarPdfCaixa() {
  const empresa = await carregarDadosEmpresaPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const d = dadosCaixaRelatorio;

  const FORMAS_RESTRITAS = ['dinheiro', 'mpesa', 'emola', 'transferencia', 'fiado'];
  const MAP_FORMAS_PT = {
    dinheiro: 'Dinheiro', mpesa: 'M-Pesa', emola: 'E-Mola', transferencia: 'Transferência Bancária', fiado: 'Fiado'
  };

  desenharCabecalhoPDF(doc, 'Relatório Avançado de Caixa', d.periodoTexto, empresa);
  let y = 36;

  // Secção 1: Resumo por Forma de Pagamento
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('1. Resumo por Forma de Pagamento', 14, y);
  y += 4;

  const resumoLinhas = FORMAS_RESTRITAS.map((f) => {
    const rf = d.resumoFormas[f];
    return [
      MAP_FORMAS_PT[f],
      formatarMT(rf.vendas),
      formatarMT(rf.servicos),
      formatarMT(rf.dividas),
      formatarMT(rf.soma)
    ];
  });

  doc.autoTable({
    startY: y,
    head: [['Forma de Pagamento', 'Total Vendas', 'Total Serviços', 'Dívidas Quitadas', 'Soma Geral']],
    body: resumoLinhas,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [44, 95, 138] },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' }
    },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Caixa', d.periodoTexto, empresa)
  });

  y = doc.lastAutoTable.finalY + 8;

  // Secção 2: Movimentações do Caixa
  if (y > 230) { doc.addPage(); y = 36; }
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('2. Movimentações do Caixa', 14, y);
  y += 4;

  const movsLinhas = d.movimentacoes.map((m) => [
    new Date(m.criado_em).toLocaleString('pt-BR'),
    m.tipo === 'sangria' ? 'Sangria' : 'Suprimento',
    m.motivo || 'Nenhum informado',
    (m.tipo === 'sangria' ? '-' : '+') + ' ' + formatarMT(m.valor)
  ]);

  doc.autoTable({
    startY: y,
    head: [['Data e Hora', 'Tipo', 'Motivo ou Observação', 'Valor']],
    body: movsLinhas.length > 0 ? movsLinhas : [['-', 'Sem movimentações registadas', '-', '0,00 MT']],
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [44, 95, 138] },
    columnStyles: {
      3: { halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: function (dataHook) {
      if (dataHook.section === 'body' && movsLinhas.length > 0) {
        const item = d.movimentacoes[dataHook.row.index];
        if (item && item.tipo === 'sangria') {
          dataHook.cell.styles.textColor = [185, 28, 28]; // Vermelho
        } else if (item && item.tipo === 'suprimento') {
          dataHook.cell.styles.textColor = [22, 163, 74]; // Verde
        }
      }
    },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Caixa', d.periodoTexto, empresa)
  });

  y = doc.lastAutoTable.finalY + 8;

  // Secção 3: Histórico Detalhado por Forma de Pagamento
  if (y > 220) { doc.addPage(); y = 36; }
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('3. Histórico Detalhado por Forma de Pagamento', 14, y);
  y += 5;

  for (const f of FORMAS_RESTRITAS) {
    const vList = d.historico[f].vendas;
    const sList = d.historico[f].servicos;

    if (vList.length === 0 && sList.length === 0) continue;

    if (y > 240) { doc.addPage(); y = 36; }
    doc.setFontSize(9.5);
    doc.setFont(undefined, 'bold');
    doc.text(`Transações em ${MAP_FORMAS_PT[f]}`, 14, y);
    y += 4;

    // Sub-tabela de Vendas
    if (vList.length > 0) {
      if (y > 250) { doc.addPage(); y = 36; }
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Vendas:', 14, y);
      y += 2;

      doc.autoTable({
        startY: y,
        head: [['Nº Venda', 'Cliente', 'Data e Hora', 'Produtos Vendidos', 'Qtd', 'Valor Total']],
        body: vList.map((v) => [v.numero, v.cliente, v.data, v.produtos, v.quantidade, formatarMT(v.total)]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [100, 116, 139] },
        columnStyles: {
          4: { halign: 'center' },
          5: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { top: 32 },
        didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Caixa', d.periodoTexto, empresa)
      });
      y = doc.lastAutoTable.finalY + 5;
    }

    // Sub-tabela de Serviços
    if (sList.length > 0) {
      if (y > 250) { doc.addPage(); y = 36; }
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text('Serviços:', 14, y);
      y += 2;

      doc.autoTable({
        startY: y,
        head: [['Nº Serviço', 'Cliente', 'Tipo de Serviço', 'Data e Hora', 'Valor']],
        body: sList.map((s) => [s.numero, s.cliente, s.tipo, s.data, formatarMT(s.valor)]),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [100, 116, 139] },
        columnStyles: {
          4: { halign: 'right', fontStyle: 'bold' }
        },
        margin: { top: 32 },
        didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Caixa', d.periodoTexto, empresa)
      });
      y = doc.lastAutoTable.finalY + 6;
    }
    y += 2;
  }

  // Secção 4: Resumo Geral e Fechamento
  if (y > 210) { doc.addPage(); y = 36; }
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text('4. Resumo Geral e Balanço do Caixa', 14, y);
  y += 4;

  doc.autoTable({
    startY: y,
    head: [['Indicador de Fechamento', 'Soma do Período']],
    body: [
      ['Total recebido em Dinheiro', formatarMT(d.totais.dinheiro)],
      ['Total recebido por M-Pesa', formatarMT(d.totais.mpesa)],
      ['Total recebido por E-Mola', formatarMT(d.totais.emola)],
      ['Total recebido por Transferência Bancária', formatarMT(d.totais.transferencia)],
      ['Total recebido por Fiado', formatarMT(d.totais.fiado)],
      ['Total das Sangrias', formatarMT(d.totais.totalSangrias)],
      ['Total dos Suprimentos', formatarMT(d.totais.totalSuprimentos)],
      ['SALDO FINAL EM CAIXA', formatarMT(d.totais.saldoFinal)]
    ],
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 95] },
    columnStyles: {
      1: { halign: 'right', fontStyle: 'bold' }
    },
    didParseCell: function (dataHook) {
      if (dataHook.section === 'body') {
        if (dataHook.row.index === 5) {
          dataHook.cell.styles.textColor = [185, 28, 28]; // Sangrias
        }
        if (dataHook.row.index === 6) {
          dataHook.cell.styles.textColor = [22, 163, 74]; // Suprimentos
        }
        if (dataHook.row.index === 7) {
          dataHook.cell.styles.fillColor = [241, 245, 249];
          dataHook.cell.styles.fontSize = 9.5;
          if (dataHook.column.index === 1) {
            dataHook.cell.styles.textColor = d.totais.saldoFinal >= 0 ? [30, 58, 95] : [185, 28, 28];
          }
        }
      }
    },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, 'Relatório Avançado de Caixa', d.periodoTexto, empresa)
  });

  finalizarRodapePDF(doc);
  doc.save('relatorio_caixa_' + new Date().toISOString().split('T')[0] + '.pdf');
}

// =========================================================
// 5. RELATÓRIO DE ESTOQUE
// =========================================================
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
// 6. RELATÓRIO DE CLIENTES (MODERNIZADO)
// =========================================================
async function gerarRelatorioClientes(inicio, fim, dataInicioStr, dataFimStr) {
  conteudoRelatorio.innerHTML = '<p class="lista-vazia">Carregando...</p>';
  resumoRelatorio.innerHTML = '';
  btnExportarPdf.classList.add('escondido');

  const { data: clientes, error: errC } = await supabaseClient
    .from('clientes')
    .select('id, nome, telefone')
    .eq('ativo', true)
    .order('nome');

  if (errC) { conteudoRelatorio.innerHTML = '<p class="lista-vazia">Erro: ' + errC.message + '</p>'; return; }

  const [{ data: vendas }, { data: servicos }] = await Promise.all([
    supabaseClient.from('vendas').select('cliente_id, total, status_pagamento').gte('criado_em', inicio).lte('criado_em', fim).eq('status', 'concluida'),
    supabaseClient.from('servicos').select('cliente_id, valor, status_pagamento').gte('criado_em', inicio).lte('criado_em', fim).neq('situacao', 'cancelado')
  ]);

  const mapaFinanceiro = {};
  let totalGeralConsumido = 0;
  let totalGeralDivida = 0;

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

  const clientesProcessados = clientes.map((c) => {
    const fin = mapaFinanceiro[c.id] || { qtdVendas: 0, qtdServicos: 0, totalVendas: 0, totalServicos: 0, totalGasto: 0, totalDivida: 0 };
    return { ...c, ...fin };
  }).sort((a, b) => b.totalGasto - a.totalGasto);

  resumoRelatorio.innerHTML = `
    <div class="card"><span class="card-titulo">Clientes Ativos</span><span class="card-valor">${clientes.length}</span></div>
    <div class="card"><span class="card-titulo">Faturamento Total</span><span class="card-valor">${formatarMT(totalGeralConsumido)}</span></div>
    <div class="card"><span class="card-titulo">Total Pendente (Dívidas)</span><span class="card-valor" style="color: #e11d48">${formatarMT(totalGeralDivida)}</span></div>
  `;

  conteudoRelatorio.innerHTML = '';

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

  dadosClientesRelatorio = {
    clientesProcessados, totalGeralConsumido, totalGeralDivida,
    periodoTexto: formatarPeriodo(dataInicioStr, dataFimStr)
  };
  ultimoRelatorioGerado = null; 
  btnExportarPdf.classList.remove('escondido');
}

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
          dataHook.cell.styles.textColor = [185, 28, 28];
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
// 7. RELATÓRIO DE SERVIÇOS (MODERNIZADO)
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

// =========================================================
// 8. RELATÓRIO DE FUNCIONÁRIOS (DESEMPENHO)
// =========================================================
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

  prepararExportacao(
    'Desempenho por Funcionário',
    lista.map((f) => [f.nome, f.qtdVendas, formatarMT(f.totalVendas), f.qtdServicos, formatarMT(f.totalServicos)]),
    ['Funcionário', 'Qtd Vendas', 'Total Vendas', 'Qtd Serviços', 'Total Serviços']
  );
}

// =========================================================
// INFRAESTRUTURA DE APOIO PARA EXPORTAÇÃO SIMPLES
// =========================================================
function prepararExportacao(titulo, dados, cabecalhos) {
  ultimoRelatorioGerado = { titulo, dados, cabecalhos };
  btnExportarPdf.classList.remove('escondido');
}

async function exportarRelatorioSimples() {
  if (!ultimoRelatorioGerado) return;
  const empresa = await carregarDadosEmpresaPDF();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  const dataInicio = document.getElementById('data-inicio').value;
  const dataFim = document.getElementById('data-fim').value;
  const periodoTexto = formatarPeriodo(dataInicio, dataFim);

  desenharCabecalhoPDF(doc, ultimoRelatorioGerado.titulo, periodoTexto, empresa);

  doc.autoTable({
    startY: 36,
    head: [ultimoRelatorioGerado.cabecalhos],
    body: ultimoRelatorioGerado.dados,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: [44, 95, 138] },
    margin: { top: 32 },
    didDrawPage: () => desenharCabecalhoPDF(doc, ultimoRelatorioGerado.titulo, periodoTexto, empresa)
  });

  finalizarRodapePDF(doc);
  doc.save('relatorio_' + ultimoRelatorioGerado.titulo.toLowerCase().replace(/\s+/g, '_') + '.pdf');
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
