// ===== CONFIGURAÇÃO DA CONEXÃO COM O SUPABASE =====

const SUPABASE_URL = 'https://jkndklgmuvwpksnihlkm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_k78JSKgL5pL-5Qb_L-LyMg_xwfUQ-I8';

// Cria o cliente do Supabase que será usado em todo o sistema
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== ASSINATURA DO DESENVOLVEDOR =====
// Injetada automaticamente em toda página que carrega este arquivo
document.addEventListener('DOMContentLoaded', () => {
  const rodape = document.createElement('div');
  rodape.className = 'assinatura-dev';
  rodape.textContent = 'Desenvolvido por Basílio Dona';
  document.body.appendChild(rodape);
});

// =========================================================
// SEGURANÇA: ESCAPE DE HTML (proteção contra XSS)
// =========================================================
// Qualquer texto vindo do banco (nome de cliente, produto, descrição,
// motivo, etc.) DEVE passar por esta função antes de ser inserido
// via innerHTML. Sem isso, alguém poderia cadastrar um registro com
// código HTML/JavaScript malicioso no nome, que executaria na tela
// de qualquer outro usuário que visualizasse esse registro depois.
function escapeHTML(texto) {
  if (texto === null || texto === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}

// =========================================================
// SEGURANÇA: EXPIRAÇÃO DE SESSÃO POR INATIVIDADE
// =========================================================
// Se o celular ficar parado (sem toques/cliques) por mais de 30 minutos
// com alguém logado, a sessão é encerrada automaticamente. Protege
// contra o caso de o celular ficar desbloqueado no balcão sem supervisão.
const TEMPO_LIMITE_INATIVIDADE_MS = 30 * 60 * 1000; // 30 minutos

function registrarAtividade() {
  sessionStorage.setItem('ultima_atividade', Date.now().toString());
}

function verificarInatividade() {
  const usuario = sessionStorage.getItem('usuario');
  if (!usuario) return; // não está logado, nada a verificar

  const ultimaAtividade = parseInt(sessionStorage.getItem('ultima_atividade') || '0');
  const agora = Date.now();

  if (agora - ultimaAtividade > TEMPO_LIMITE_INATIVIDADE_MS) {
    sessionStorage.removeItem('usuario');
    sessionStorage.removeItem('ultima_atividade');
    supabaseClient.auth.signOut();
    alert('Sessão encerrada por inatividade. Faça login novamente.');
    window.location.href = 'index.html';
  }
}

// Registra atividade em qualquer interação do usuário
['click', 'keydown', 'touchstart'].forEach((evento) => {
  document.addEventListener(evento, registrarAtividade);
});

// Marca atividade inicial ao carregar a página
registrarAtividade();

// Verifica inatividade a cada 1 minuto
setInterval(verificarInatividade, 60 * 1000);

// =========================================================
// MENU MOBILE RECOLHÍVEL (funciona em qualquer página que tenha
// o botão #btn-menu-toggle e a nav #menu-lateral)
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  const btnMenuToggle = document.getElementById('btn-menu-toggle');
  const menuLateral = document.getElementById('menu-lateral');

  if (!btnMenuToggle || !menuLateral) return; // página sem menu (ex: login) — não faz nada

  btnMenuToggle.addEventListener('click', () => {
    menuLateral.classList.toggle('menu-aberto');
  });

  // Fecha o menu automaticamente ao tocar num link
  menuLateral.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => menuLateral.classList.remove('menu-aberto'));
  });
});