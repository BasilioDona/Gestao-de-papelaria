// ===== PROTEÇÃO DE PÁGINA (só administrador) =====

const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario'));

if (!usuarioLogado) {
  window.location.href = 'index.html';
}

if (usuarioLogado.tipo !== 'administrador') {
  window.location.href = 'dashboard.html';
}

document.getElementById('nome-usuario').textContent = usuarioLogado.nome;
document.getElementById('tipo-usuario').textContent = usuarioLogado.tipo;

document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
  sessionStorage.removeItem('usuario');
  window.location.href = 'index.html';
});

// ===== NAVEGAÇÃO ENTRE SEÇÕES (abas) =====
const secoes = ['empresa', 'categorias', 'servicos-tipo', 'pagamentos', 'manutencao'];

document.getElementById('filtro-config').addEventListener('click', (event) => {
  if (!event.target.classList.contains('aba')) return;

  document.querySelectorAll('#filtro-config .aba').forEach((a) => a.classList.remove('ativa'));
  event.target.classList.add('ativa');

  const secaoAlvo = event.target.dataset.secao;
  secoes.forEach((s) => {
    document.getElementById('secao-' + s).classList.toggle('escondido', s !== secaoAlvo);
  });
});

// =========================================================
// SEÇÃO: EMPRESA
// =========================================================
async function carregarEmpresa() {
  const { data, error } = await supabaseClient
    .from('configuracoes_empresa')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) {
    console.log('Erro ao carregar dados da empresa:', error);
    return;
  }

  document.getElementById('empresa-nome').value = data.nome || '';
  document.getElementById('empresa-nuit').value = data.nuit || '';
  document.getElementById('empresa-endereco').value = data.endereco || '';
  document.getElementById('empresa-telefone').value = data.telefone || '';
  document.getElementById('empresa-email').value = data.email || '';
  document.getElementById('empresa-taxa-imposto').value = data.taxa_imposto_info || '';
  document.getElementById('empresa-obs-imposto').value = data.observacoes_imposto || '';
}

document.getElementById('form-empresa').addEventListener('submit', async (event) => {
  event.preventDefault();
  const mensagem = document.getElementById('empresa-mensagem');
  mensagem.textContent = '';

  const dados = {
    nome: document.getElementById('empresa-nome').value.trim(),
    nuit: document.getElementById('empresa-nuit').value.trim() || null,
    endereco: document.getElementById('empresa-endereco').value.trim() || null,
    telefone: document.getElementById('empresa-telefone').value.trim() || null,
    email: document.getElementById('empresa-email').value.trim() || null,
    taxa_imposto_info: parseFloat(document.getElementById('empresa-taxa-imposto').value) || null,
    observacoes_imposto: document.getElementById('empresa-obs-imposto').value.trim() || null,
    atualizado_em: new Date().toISOString()
  };

  const { error } = await supabaseClient
    .from('configuracoes_empresa')
    .update(dados)
    .eq('id', 1);

  if (error) {
    mensagem.textContent = 'Erro: ' + error.message;
    return;
  }

  mensagem.style.color = '#16a34a';
  mensagem.textContent = 'Dados salvos com sucesso!';
  setTimeout(() => { mensagem.textContent = ''; }, 3000);
});

// =========================================================
// SEÇÃO: CATEGORIAS
// =========================================================
const modalCategoria = document.getElementById('modal-categoria');
const formCategoria = document.getElementById('form-categoria');

async function carregarCategorias() {
  const lista = document.getElementById('lista-categorias');
  lista.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data, error } = await supabaseClient.from('categorias').select('*').order('nome');

  if (error) { lista.innerHTML = '<p class="lista-vazia">Erro ao carregar.</p>'; return; }
  if (data.length === 0) { lista.innerHTML = '<p class="lista-vazia">Nenhuma categoria cadastrada.</p>'; return; }

  lista.innerHTML = '';
  data.forEach((cat) => {
    const div = document.createElement('div');
    div.className = 'config-item';
    div.innerHTML = `
      <span>${cat.nome}</span>
      <div class="config-item-acoes">
        <button class="btn-icone editar-categoria" data-id="${cat.id}" data-nome="${cat.nome}">✏️</button>
        <button class="btn-icone excluir excluir-categoria" data-id="${cat.id}">🗑️</button>
      </div>
    `;
    lista.appendChild(div);
  });

  document.querySelectorAll('.editar-categoria').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('categoria-id').value = btn.dataset.id;
      document.getElementById('categoria-nome').value = btn.dataset.nome;
      document.getElementById('modal-categoria-titulo').textContent = 'Editar Categoria';
      document.getElementById('modal-categoria-erro').textContent = '';
      modalCategoria.classList.remove('escondido');
    });
  });

  document.querySelectorAll('.excluir-categoria').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir esta categoria? Produtos vinculados ficarão sem categoria.')) return;
      const { error } = await supabaseClient.from('categorias').delete().eq('id', btn.dataset.id);
      if (error) { alert('Erro: ' + error.message); return; }
      carregarCategorias();
    });
  });
}

document.getElementById('btn-nova-categoria').addEventListener('click', () => {
  formCategoria.reset();
  document.getElementById('categoria-id').value = '';
  document.getElementById('modal-categoria-titulo').textContent = 'Nova Categoria';
  document.getElementById('modal-categoria-erro').textContent = '';
  modalCategoria.classList.remove('escondido');
});

formCategoria.addEventListener('submit', async (event) => {
  event.preventDefault();
  const erro = document.getElementById('modal-categoria-erro');
  erro.textContent = '';

  const id = document.getElementById('categoria-id').value;
  const nome = document.getElementById('categoria-nome').value.trim();

  const resultado = id
    ? await supabaseClient.from('categorias').update({ nome }).eq('id', id)
    : await supabaseClient.from('categorias').insert({ nome });

  if (resultado.error) { erro.textContent = 'Erro: ' + resultado.error.message; return; }

  modalCategoria.classList.add('escondido');
  carregarCategorias();
});

// =========================================================
// SEÇÃO: TIPOS DE SERVIÇO
// =========================================================
const modalTipoServico = document.getElementById('modal-tipo-servico');
const formTipoServico = document.getElementById('form-tipo-servico');

async function carregarTiposServico() {
  const lista = document.getElementById('lista-tipos-servico');
  lista.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data, error } = await supabaseClient.from('tipos_servico').select('*').order('nome');

  if (error) { lista.innerHTML = '<p class="lista-vazia">Erro ao carregar.</p>'; return; }

  lista.innerHTML = '';
  data.forEach((tipo) => {
    const div = document.createElement('div');
    div.className = 'config-item';
    div.innerHTML = `
      <span>${tipo.nome} <span class="mov-detalhes">(${tipo.chave})</span></span>
      <label class="toggle-switch">
        <input type="checkbox" class="toggle-tipo-servico" data-id="${tipo.id}" ${tipo.ativo ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    `;
    lista.appendChild(div);
  });

  const selectPreco = document.getElementById('preco-servico-tipo');
  selectPreco.innerHTML = '<option value="">Selecione...</option>';
  data.filter((t) => t.ativo).forEach((tipo) => {
    const option = document.createElement('option');
    option.value = tipo.chave;
    option.textContent = tipo.nome;
    selectPreco.appendChild(option);
  });

  document.querySelectorAll('.toggle-tipo-servico').forEach((toggle) => {
    toggle.addEventListener('change', async (event) => {
      const { error } = await supabaseClient
        .from('tipos_servico')
        .update({ ativo: event.target.checked })
        .eq('id', event.target.dataset.id);
      if (error) { alert('Erro: ' + error.message); carregarTiposServico(); return; }
      carregarTiposServico();
    });
  });
}

document.getElementById('btn-novo-tipo-servico').addEventListener('click', () => {
  formTipoServico.reset();
  document.getElementById('modal-tipo-servico-erro').textContent = '';
  modalTipoServico.classList.remove('escondido');
});

formTipoServico.addEventListener('submit', async (event) => {
  event.preventDefault();
  const erro = document.getElementById('modal-tipo-servico-erro');
  erro.textContent = '';

  const chave = document.getElementById('tipo-servico-chave').value.trim().toLowerCase().replace(/\s+/g, '_');
  const nome = document.getElementById('tipo-servico-nome').value.trim();

  const { error } = await supabaseClient.from('tipos_servico').insert({ chave, nome });

  if (error) { erro.textContent = 'Erro: ' + error.message; return; }

  modalTipoServico.classList.add('escondido');
  carregarTiposServico();
});

// ===== PREÇOS POR PÁGINA =====
const modalPrecoServico = document.getElementById('modal-preco-servico');
const formPrecoServico = document.getElementById('form-preco-servico');
const NOMES_COR = { pb: 'Preto e branco', colorido: 'Colorido', unica: 'Padrão' };

async function carregarPrecosServico() {
  const lista = document.getElementById('lista-precos-servico');
  lista.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data, error } = await supabaseClient
    .from('precos_servico')
    .select('*, tipos_servico(nome)')
    .order('tipo');

  if (error) { lista.innerHTML = '<p class="lista-vazia">Erro ao carregar.</p>'; return; }
  if (data.length === 0) { lista.innerHTML = '<p class="lista-vazia">Nenhum preço cadastrado.</p>'; return; }

  lista.innerHTML = '';
  data.forEach((preco) => {
    const nomeTipo = preco.tipos_servico ? preco.tipos_servico.nome : preco.tipo;
    const div = document.createElement('div');
    div.className = 'config-item';
    div.innerHTML = `
      <span>${nomeTipo} - ${NOMES_COR[preco.cor] || preco.cor}: <strong>${Number(preco.preco_pagina).toFixed(2)} MT</strong></span>
      <button class="btn-icone excluir excluir-preco-servico" data-id="${preco.id}">🗑️</button>
    `;
    lista.appendChild(div);
  });

  document.querySelectorAll('.excluir-preco-servico').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Excluir este preço?')) return;
      const { error } = await supabaseClient.from('precos_servico').delete().eq('id', btn.dataset.id);
      if (error) { alert('Erro: ' + error.message); return; }
      carregarPrecosServico();
    });
  });
}

document.getElementById('btn-novo-preco-servico').addEventListener('click', () => {
  formPrecoServico.reset();
  document.getElementById('modal-preco-servico-erro').textContent = '';
  modalPrecoServico.classList.remove('escondido');
});

formPrecoServico.addEventListener('submit', async (event) => {
  event.preventDefault();
  const erro = document.getElementById('modal-preco-servico-erro');
  erro.textContent = '';

  const dados = {
    tipo: document.getElementById('preco-servico-tipo').value,
    cor: document.getElementById('preco-servico-cor').value,
    preco_pagina: parseFloat(document.getElementById('preco-servico-valor').value)
  };

  const { error } = await supabaseClient.from('precos_servico').insert(dados);

  if (error) { erro.textContent = 'Erro: ' + error.message; return; }

  modalPrecoServico.classList.add('escondido');
  carregarPrecosServico();
});

// =========================================================
// SEÇÃO: FORMAS DE PAGAMENTO
// =========================================================
async function carregarFormasPagamento() {
  const lista = document.getElementById('lista-pagamentos');
  lista.innerHTML = '<p class="lista-vazia">Carregando...</p>';

  const { data, error } = await supabaseClient.from('formas_pagamento_config').select('*').order('nome');

  if (error) { lista.innerHTML = '<p class="lista-vazia">Erro ao carregar.</p>'; return; }

  lista.innerHTML = '';
  data.forEach((forma) => {
    const div = document.createElement('div');
    div.className = 'config-item';
    div.innerHTML = `
      <span>${forma.nome}</span>
      <label class="toggle-switch">
        <input type="checkbox" class="toggle-forma-pagamento" data-id="${forma.id}" ${forma.ativo ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
    `;
    lista.appendChild(div);
  });

  document.querySelectorAll('.toggle-forma-pagamento').forEach((toggle) => {
    toggle.addEventListener('change', async (event) => {
      const { error } = await supabaseClient
        .from('formas_pagamento_config')
        .update({ ativo: event.target.checked })
        .eq('id', event.target.dataset.id);
      if (error) { alert('Erro: ' + error.message); carregarFormasPagamento(); return; }
      carregarFormasPagamento();
    });
  });
}

// =========================================================
// SEÇÃO: MANUTENÇÃO (limpeza de histórico)
// =========================================================
document.getElementById('btn-limpar-estoque').addEventListener('click', async () => {
  const dataLimite = document.getElementById('limite-data-estoque').value;
  const status = document.getElementById('status-limpeza-estoque');

  if (!dataLimite) {
    status.style.color = '#dc2626';
    status.textContent = 'Selecione uma data.';
    return;
  }

  const confirmar = confirm(
    'Isso vai APAGAR PERMANENTEMENTE todas as movimentações de estoque anteriores a ' +
    new Date(dataLimite).toLocaleDateString('pt-BR') + '. Esta ação não pode ser desfeita. Continuar?'
  );
  if (!confirmar) return;

  status.style.color = '#334155';
  status.textContent = 'Processando...';

  const { data, error } = await supabaseClient.rpc('limpar_movimentacoes_estoque_antigas', {
    p_data_limite: new Date(dataLimite).toISOString()
  });

  if (error) {
    status.style.color = '#dc2626';
    status.textContent = 'Erro: ' + error.message;
    return;
  }

  status.style.color = '#16a34a';
  status.textContent = data + ' movimentação(ões) excluída(s) com sucesso.';
});

document.getElementById('btn-limpar-caixas').addEventListener('click', async () => {
  const dataLimite = document.getElementById('limite-data-caixa').value;
  const status = document.getElementById('status-limpeza-caixa');

  if (!dataLimite) {
    status.style.color = '#dc2626';
    status.textContent = 'Selecione uma data.';
    return;
  }

  const confirmar = confirm(
    'Isso vai APAGAR PERMANENTEMENTE caixas fechados e vazios (sem vendas/serviços) anteriores a ' +
    new Date(dataLimite).toLocaleDateString('pt-BR') + '. Esta ação não pode ser desfeita. Continuar?'
  );
  if (!confirmar) return;

  status.style.color = '#334155';
  status.textContent = 'Processando...';

  const { data, error } = await supabaseClient.rpc('limpar_caixas_antigos', {
    p_data_limite: new Date(dataLimite).toISOString()
  });

  if (error) {
    status.style.color = '#dc2626';
    status.textContent = 'Erro: ' + error.message;
    return;
  }

  status.style.color = '#16a34a';
  status.textContent = data + ' caixa(s) vazio(s) excluído(s) com sucesso.';
});

// ===== FECHAR MODAIS (botão "Cancelar" genérico) =====
document.querySelectorAll('.btn-cancelar-generico').forEach((btn) => {
  btn.addEventListener('click', () => {
    btn.closest('.modal-overlay').classList.add('escondido');
  });
});

// ===== INICIALIZAÇÃO =====
carregarEmpresa();
carregarCategorias();
carregarTiposServico();
carregarPrecosServico();
carregarFormasPagamento();