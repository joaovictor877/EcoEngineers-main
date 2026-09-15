'use strict';

const express = require('express');
const router  = express.Router();

// Divisão segura — evita NaN/Infinity quando ainda não há dados.
function safeRate(numerator, denominator) {
  if (!denominator) return 0;
  return parseFloat(((numerator / denominator) * 100).toFixed(1));
}

module.exports = function (dbQuery, dbClient, io, authMiddleware) {

  // ─────────────────────────────────────────────────────────
  // GET /api/analise/processo — taxas de desperdício, economia e
  // simulações usadas pela página "Análise do Processo" (substitui a antiga
  // "Gestão de Materiais", que virou uma aba de Cadastros).
  // ─────────────────────────────────────────────────────────
  router.get('/processo', authMiddleware, async (req, res) => {
    try {
      const totais = await dbQuery(
        `SELECT
           COALESCE(SUM(rr.peso * m.valor_unitario_kg), 0)  AS valor_total_em_risco,
           COALESCE(SUM(rr.prejuizo_descarte), 0)           AS prejuizo_real,
           COALESCE(SUM(rr.valor_economizado), 0)           AS economia_gerada,
           COALESCE(SUM(rr.custo_reaproveitamento), 0)      AS custo_reaproveitamento
         FROM registros_residuos rr
         LEFT JOIN materials m ON rr.material_id = m.id`
      );
      const t = totais.rows[0] || {};
      const valorTotalEmRisco = Number(t.valor_total_em_risco) || 0;
      const prejuizoReal = Number(t.prejuizo_real) || 0;
      const economiaGerada = Number(t.economia_gerada) || 0;
      const custoReaproveitamento = Number(t.custo_reaproveitamento) || 0;
      const perdaSimulada = prejuizoReal + economiaGerada + custoReaproveitamento;

      const [validStats, iaStats] = await Promise.all([
        dbQuery(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN resultado='aprovado' THEN 1 ELSE 0 END) AS aprovadas
           FROM validacoes`
        ),
        dbQuery('SELECT AVG(confianca) AS media FROM analises_ia'),
      ]);
      const totalValidacoes = Number(validStats.rows[0]?.total || 0);
      const aprovadasValidacoes = Number(validStats.rows[0]?.aprovadas || 0);

      let projecaoMensal = [];
      try {
        const meses = await dbQuery(
          `SELECT DATE_FORMAT(criado_em, '%Y-%m') AS mes,
                  COALESCE(SUM(valor_economizado), 0) AS economia,
                  COALESCE(SUM(prejuizo_descarte), 0)  AS prejuizo
           FROM registros_residuos
           WHERE criado_em >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
           GROUP BY mes ORDER BY mes`
        );
        projecaoMensal = meses.rows.map((r) => ({
          mes: r.mes, economia: Number(r.economia) || 0, prejuizo: Number(r.prejuizo) || 0,
        }));
      } catch (e) {
        console.warn('[Analise] Falha ao calcular projeção mensal:', e.message);
      }

      // Projeção simples: média mensal dos últimos meses com dados,
      // repetida para os próximos 3 meses — é uma estimativa, não um
      // modelo estatístico robusto.
      const mesesComDados = projecaoMensal.length || 1;
      const mediaEconomiaMensal = projecaoMensal.reduce((s, m) => s + m.economia, 0) / mesesComDados;
      const mediaPrejuizoMensal = projecaoMensal.reduce((s, m) => s + m.prejuizo, 0) / mesesComDados;
      const projecaoProximosMeses = [1, 2, 3].map((n) => ({
        mes_relativo: n,
        economia_projetada: parseFloat((mediaEconomiaMensal * n).toFixed(2)),
        prejuizo_projetado: parseFloat((mediaPrejuizoMensal * n).toFixed(2)),
      }));

      return res.json({
        valor_total_em_risco: valorTotalEmRisco,
        prejuizo_real: prejuizoReal,
        economia_gerada: economiaGerada,
        custo_reaproveitamento: custoReaproveitamento,
        perda_simulada_sem_processo: perdaSimulada,
        taxa_desperdicio_real: safeRate(prejuizoReal, valorTotalEmRisco),
        taxa_economia_gerada: safeRate(economiaGerada, valorTotalEmRisco),
        taxa_prejuizo_evitado: safeRate(economiaGerada, economiaGerada + prejuizoReal),
        taxa_perda_simulada_sem_processo: safeRate(perdaSimulada, valorTotalEmRisco),
        precisao_sistema: {
          taxa_aprovacao_expedicao: safeRate(aprovadasValidacoes, totalValidacoes),
          total_validacoes: totalValidacoes,
          confianca_media_ia_referencia: parseFloat(Number(iaStats.rows[0]?.media || 0).toFixed(1)),
        },
        projecao: {
          historico_mensal: projecaoMensal,
          proximos_meses: projecaoProximosMeses,
        },
      });
    } catch (err) {
      console.error('[Analise] Erro em GET /api/analise/processo:', err.message);
      return res.status(500).json({ error: 'Falha ao calcular análise do processo' });
    }
  });

  return router;
};
