/* Proxy serverless do login do BuyerCare (Cloudflare Worker).

   Guarda o segredo do OAuth Client Credentials Flow (Consumer Key/Secret do
   Connected App "BuyerCare Integracao") e fala com o Salesforce por tras -
   o app do cliente final (estatico, roda no navegador) nunca ve esse segredo,
   so' fala com este proxy.

   Variaveis de ambiente esperadas (configurar como "secret" no Cloudflare,
   nunca commitadas no codigo):
     SF_LOGIN_URL     -> https://co1781648434036.my.salesforce.com
     SF_CLIENT_ID     -> Consumer Key do Connected App "BuyerCare Integracao"
     SF_CLIENT_SECRET -> Consumer Secret do mesmo Connected App
     SF_APP_TOKEN     -> o mesmo valor de CA_BuyerCareConfig__mdt.Default.URL_Token__c

   Endpoints expostos:
     POST /api/login       Body: { "email": "..." }
     POST /api/obra        Body: { "oportunidadeId": "..." }
     POST /api/financeiro  Body: { "oportunidadeId": "..." }
     POST /api/documentos        Body: { "oportunidadeId": "..." }
     POST /api/documento-arquivo Body: { "oportunidadeId": "...", "contentVersionId": "..." }
     POST /api/atendimento       Body: { "oportunidadeId": "..." }
     POST /api/atendimento-novo  Body: { "oportunidadeId": "...", "categoria": "...", "ambiente": "...", "descricao": "..." }
   Resposta: o mesmo JSON que a classe Apex correspondente devolve. */

const TOKEN_SAFETY_MARGIN_MS = 60 * 1000;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function obterAccessToken(env) {
  const agora = Date.now();
  if (cachedToken && agora < cachedTokenExpiresAt - TOKEN_SAFETY_MARGIN_MS) {
    return cachedToken;
  }

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.SF_CLIENT_ID,
    client_secret: env.SF_CLIENT_SECRET
  });

  const resp = await fetch(`${env.SF_LOGIN_URL}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Falha ao obter token OAuth (${resp.status}): ${texto}`);
  }

  const dados = await resp.json();
  cachedToken = dados.access_token;
  cachedTokenExpiresAt = agora + 15 * 60 * 1000;
  return cachedToken;
}

function comCors(resposta) {
  resposta.headers.set('Access-Control-Allow-Origin', '*');
  resposta.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  resposta.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return resposta;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return comCors(new Response(null, { status: 204 }));
    }

    const ROTAS = {
      '/api/login': { apexPath: '/buyercare/login', camposObrigatorios: ['email'] },
      '/api/obra': { apexPath: '/buyercare/obra', camposObrigatorios: ['oportunidadeId'] },
      '/api/financeiro': { apexPath: '/buyercare/financeiro', camposObrigatorios: ['oportunidadeId'] },
      '/api/documentos': { apexPath: '/buyercare/documentos', camposObrigatorios: ['oportunidadeId'] },
      '/api/documento-arquivo': { apexPath: '/buyercare/documento-arquivo', camposObrigatorios: ['oportunidadeId', 'contentVersionId'] },
      '/api/atendimento': { apexPath: '/buyercare/atendimento', camposObrigatorios: ['oportunidadeId'] },
      '/api/atendimento-novo': { apexPath: '/buyercare/atendimento-novo', camposObrigatorios: ['oportunidadeId', 'categoria', 'descricao'], camposOpcionais: ['ambiente'] }
    };
    const rota = ROTAS[url.pathname];

    if (!rota || request.method !== 'POST') {
      return comCors(new Response(JSON.stringify({ erro: 'rota nao encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return comCors(new Response(JSON.stringify({ erro: 'corpo da requisicao invalido' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    const faltando = rota.camposObrigatorios.filter((campo) => !payload || !payload[campo]);
    if (faltando.length) {
      return comCors(new Response(JSON.stringify({ erro: 'Campo(s) obrigatorio(s) ausente(s): ' + faltando.join(', ') }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      }));
    }

    try {
      const accessToken = await obterAccessToken(env);

      const corpoRequisicao = { token: env.SF_APP_TOKEN };
      for (const campo of rota.camposObrigatorios) {
        corpoRequisicao[campo] = payload[campo];
      }
      for (const campo of (rota.camposOpcionais || [])) {
        if (payload[campo] != null) corpoRequisicao[campo] = payload[campo];
      }

      const sfResp = await fetch(`${env.SF_LOGIN_URL}/services/apexrest${rota.apexPath}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(corpoRequisicao)
      });

      const corpo = await sfResp.text();
      return comCors(new Response(corpo, {
        status: sfResp.status,
        headers: { 'Content-Type': 'application/json' }
      }));
    } catch (erro) {
      return comCors(new Response(JSON.stringify({ erro: 'Falha ao processar: ' + erro.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  }
};
